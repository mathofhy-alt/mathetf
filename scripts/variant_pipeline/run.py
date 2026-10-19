# -*- coding: utf-8 -*-
"""generate → solve → judge → review → bundle. 각 단계 새 세션/허용 입력 폴더.
내부 채택과 완성 시험지 납품은 별개다. 이전 결과를 자동 재사용하지 않는다.
"""
import argparse
import ast
from concurrent.futures import ThreadPoolExecutor
import hashlib
import itertools
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import uuid
import threading
import time

HERE = Path(__file__).resolve().parent
MODEL = 'gpt-6.1-sol'
LOCK = threading.RLock()
TOK = [0]
CALLS = []
BUDGET = None
LEVELS = {'e': '쉬움', 'k': '유지', 'h': '어려움'}
J_CHECKS = ('math', 'reuse', 'condition', 'alternative', 'exam')
R_CHECKS = ('identity', 'solution', 'design', 'exam', 'curriculum')
UTF8_NOTE = '\n\n결과는 반드시 Python open(..., encoding="utf-8")과 json.dump(..., ensure_ascii=False)로 쓴다. PowerShell Set-Content·Out-File·출력 리디렉션 금지.'
TODO = [
    '동일 입력 plan/slot 재사용 및 해설만 수정한 경우의 solve/judge 선택 재사용. 현재 전부 새 검사하며 --only의 나머지는 보류.',
    '별도 계정/컨테이너의 OS 읽기 격리. 현재 호출별 허용 파일 복사 및 입력 변경 감지이며 보안 경계는 아님.',
    '검증된 원본 그림 입력, 실제 그림 작성·렌더링·인쇄 편집 확인.',
    '토큰은 종료 후 측정하므로 예상 예약은 호출 중 강제 상한이 아님.',
    '판정 불일치 해제 및 수정본 별도 재검토 자동화. 현재 미해결은 보류.',
    '별도 typeset.py는 아직 고정 6칸을 읽는다. 새 selected_slots와 연결하기 전 자동 납품에 사용하지 않는다.',
]


def write_text(path, text):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding='utf-8')


def write_json(path, obj):
    write_text(path, json.dumps(obj, ensure_ascii=False, indent=2) + '\n')


def fresh_dir(parent, prefix):
    # Windows Python 3.14의 mkdtemp(mode=0700)는 sandbox 계정에서 다시 읽을 수 없는 ACL을 만들 수 있다.
    parent = Path(parent)
    parent.mkdir(parents=True, exist_ok=True)
    path = parent / (prefix + uuid.uuid4().hex)
    path.mkdir(mode=0o777)
    return path


def load(path):
    try: return json.loads(Path(path).read_text(encoding='utf-8-sig'))
    except (OSError, UnicodeError, ValueError): return None


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def prompt(name, **kw):
    text = (HERE / 'prompts' / f'{name}.md').read_text(encoding='utf-8')
    keys = set(re.findall(r'\{([A-Z][A-Z_0-9]*)\}', text))
    if keys != set(kw): raise ValueError(f'{name} 치환 키 불일치: {keys} / {set(kw)}')
    for key, value in kw.items(): text = text.replace('{' + key + '}', str(value))
    return text


class BudgetError(RuntimeError):
    pass


class Budget:
    """시작한 원고의 필수 검사/깨짐 재호출까지 예약한 뒤 새 생성을 허용한다."""
    def __init__(self, max_calls=0, token_budget=0, total_seconds=0, call_timeout=3600, estimate=20000):
        self.max_calls, self.token_budget = max_calls, token_budget
        self.deadline = time.monotonic() + total_seconds if total_seconds else None
        self.call_timeout, self.estimate = call_timeout, estimate
        self.calls = self.pending = self.tokens = 0

    def reserve(self, calls):
        with LOCK:
            if self.deadline and time.monotonic() >= self.deadline: raise BudgetError('전체 시간 한도')
            if self.max_calls and self.calls + self.pending + calls > self.max_calls:
                raise BudgetError('필수 검사 예약 포함 호출 수 한도')
            if self.token_budget and self.tokens + (self.pending + calls) * self.estimate > self.token_budget:
                raise BudgetError('필수 검사 예약 포함 예상 토큰 예산')
            self.pending += calls
            return {'remaining': calls}

    def release(self, ticket):
        if ticket is not None:
            with LOCK:
                self.pending -= ticket['remaining']
                ticket['remaining'] = 0

    def start(self, ticket):
        with LOCK:
            if ticket is None or ticket['remaining'] <= 0: raise BudgetError('호출 예약 없음')
            timeout = self.call_timeout
            if self.deadline: timeout = min(timeout, self.deadline - time.monotonic())
            if timeout <= 0: raise BudgetError('전체 시간 한도')
            ticket['remaining'] -= 1
            self.pending -= 1
            self.calls += 1
            return timeout


def codex_command():
    node, npm = shutil.which('node'), shutil.which('npm.cmd') or shutil.which('npm')
    if not node or not npm: raise RuntimeError('node/npm 경로 없음')
    result = subprocess.run([npm, 'root', '-g'], shell=(os.name == 'nt'), capture_output=True,
        text=True, encoding='utf-8', errors='replace', timeout=30, stdin=subprocess.DEVNULL)
    cli = Path(result.stdout.strip()) / '@openai/codex/bin/codex.js'
    if result.returncode or not cli.is_file(): raise RuntimeError('Codex CLI 경로 확인 실패')
    return [node, str(cli)]


def codex(D, text, tag, effort='high', ticket=None):
    started = time.monotonic()
    timeout = BUDGET.start(ticket) if BUDGET else 3600
    command = codex_command() + ['exec', '--skip-git-repo-check', '-m', MODEL,
        '-c', f'model_reasoning_effort={effort}', '-c', 'notify=[]', '-c', 'mcp_servers={}',
        '--sandbox', 'workspace-write', '-C', str(D), text + UTF8_NOTE]
    rc, out, error = -1, '', ''
    try:
        result = subprocess.run(command, capture_output=True, text=True, encoding='utf-8',
            errors='replace', timeout=timeout, stdin=subprocess.DEVNULL)
        rc, out = result.returncode, (result.stdout or '') + (result.stderr or '')
    except subprocess.TimeoutExpired as exc:
        error = '호출 시간 초과'
        out = ''.join(x.decode('utf-8', errors='replace') if isinstance(x, bytes) else x
                      for x in (exc.stdout or '', exc.stderr or ''))
    except OSError as exc: error = str(exc)
    match = re.search(r'tokens used\s*\n\s*([\d,]+)', out)
    tokens = int(match[1].replace(',', '')) if match else None
    record = {'tag': tag, 'returncode': rc, 'tokens': tokens, 'error': error,
              'seconds': time.monotonic() - started, 'command': command,
              'prompt_sha256': hashlib.sha256((text + UTF8_NOTE).encode('utf-8')).hexdigest()}
    write_text(Path(D) / 'logs' / f'{tag}.log', out + ('\n' + error if error else ''))
    with LOCK:
        TOK[0] += tokens or 0
        if BUDGET: BUDGET.tokens += tokens if tokens is not None else BUDGET.estimate
        CALLS.append(record)
    print(f"{tag}: rc={rc}, tokens={tokens}, {record['seconds']:.0f}초", flush=True)
    return record


def garbled(path):
    try: text = Path(path).read_text(encoding='utf-8-sig')
    except (OSError, UnicodeError): return True
    # 입력에서 베낀 한글 몇 단어가 섞여도 깨진 것으로 본다(10/20 묶음 비교: '?' 1천여 개에 한글 3단어) — 한글 글자 수가 '?' 의 1/5 미만이면 깨짐
    q, h = text.count('?'), len(re.findall('[가-힣]', text))
    if '\ufffd' in text or chr(8) in text or (q >= 30 and h * 5 < q): return True
    # 일부 칸만 깨진 경우(10/20 실전 3회차: level·status 가 '??', 정답 '① …' 이 '? …') — 값 전체가 ? 이거나 '? ' 로 시작하는 문자열이 있으면 깨짐
    try: value = json.loads(text)
    except ValueError: return False
    def strings(v):
        if isinstance(v, str): yield v
        elif isinstance(v, dict):
            for x in v.values(): yield from strings(x)
        elif isinstance(v, list):
            for x in v: yield from strings(x)
    return any(re.fullmatch(r'[?\s]{2,}', x) or re.match(r'\?\s', x) for x in strings(value))


def codex_out(D, text, tag, out, effort='high', tries=2, ticket=None, records=None,
              input_names=(), artifact_names=()):
    """깨짐 재호출도 새 폴더: 실패 원고·스크립트·로그를 다음 호출에 넘기지 않는다."""
    D = Path(D)
    for index in range(tries):
        invocation = fresh_dir(D.parent, f'{tag}_invoke{index}_')
        fixed = {}
        for name in input_names:
            write_text(invocation / name, (D / name).read_text(encoding='utf-8-sig'))
            fixed[name] = digest(invocation / name)
        result = codex(invocation, text, tag if index == 0 else f'{tag}_retry{index}', effort, ticket)
        result['inputs_unchanged'] = all((invocation / name).is_file()
            and not (invocation / name).is_symlink() and digest(invocation / name) == sha for name, sha in fixed.items())
        if records is not None: records.append(result)
        path = invocation / out
        value = load(path)
        valid = (result['returncode'] == 0 and result['tokens'] is not None and result['tokens'] > 0
                 and result['inputs_unchanged'] and path.is_file() and not path.is_symlink()
                 and isinstance(value, dict) and not garbled(path))
        write_json(invocation / 'invocation.json', {**result, 'inputs': fixed, 'valid': valid})
        if valid:
            for name in (out, *artifact_names):
                artifact = invocation / name
                if artifact.is_file() and not artifact.is_symlink():
                    write_text(D / name, artifact.read_text(encoding='utf-8-sig'))
            return value
    return None


def isolated_call(D, stage, inputs, output, outputs=(), slot='', ticket=None, **kw):
    D = Path(D)
    base = D / 'calls'
    base.mkdir(parents=True, exist_ok=True)
    call_dir = fresh_dir(base, f'{slot or stage}_{stage}_')
    hashes = {}
    for name in inputs:
        source = D / name
        if Path(name).name != name or not source.is_file() or source.is_symlink():
            raise ValueError(f'{stage} 필수 입력 없음/잘못된 경로: {name}')
        write_text(call_dir / name, source.read_text(encoding='utf-8-sig'))
        hashes[name] = digest(call_dir / name)
    records = []
    value = codex_out(call_dir, prompt(stage, **kw), stage, output, ticket=ticket, records=records,
                      input_names=inputs, artifact_names=outputs)
    unchanged = all((call_dir / name).is_file() and not (call_dir / name).is_symlink()
                    and digest(call_dir / name) == sha for name, sha in hashes.items())
    manifest = {'stage': stage, 'inputs': hashes, 'calls': records, 'inputs_unchanged': unchanged, 'outputs': {}}
    if not unchanged: value = None
    if value is not None:
        for name in (output, *outputs):
            source = call_dir / name
            if source.is_file() and not source.is_symlink():
                write_text(D / name, source.read_text(encoding='utf-8-sig'))
                manifest['outputs'][name] = digest(D / name)
    write_json(call_dir / 'execution.json', manifest)
    write_json(D / f'{slot + "_" if slot else ""}{stage}_execution.json', manifest)
    if value is None: raise ValueError(f'{stage} 출력/호출/고정 입력 검증 실패: {call_dir}')
    return value


def optional_policy(D):
    return ['delivery_policy.json'] if (Path(D) / 'delivery_policy.json').is_file() else []


def optional_routes(D):
    # [10/20] 출제 의도 경로(routes.json) — 원본 판단·해설 대조가 '변형이 의도 경로의 핵심 판단을 거치는가'를 보게
    return ['routes.json'] if (Path(D) / 'routes.json').is_file() else []


def validate_routes(r):
    if not isinstance(r, dict) or not isinstance(r.get('routes'), list) or len(r['routes']) < 2:
        raise ValueError('routes.json: 풀이 경로 2개 이상 필요')
    names = [x.get('name') for x in r['routes'] if isinstance(x, dict)]
    if r.get('intended') not in names: raise ValueError('routes.json: intended 가 routes 의 name 과 다름')
    if not str(r.get('intended_core') or '').strip(): raise ValueError('routes.json: intended_core 비어 있음')
    if r.get('confidence') not in ('높음', '중간', '낮음'): raise ValueError('routes.json: confidence 오류')
    return r


def judge(D, slot, ticket=None):
    return isolated_call(D, 'judge', ['original_problem.txt', f'{slot}_problem.txt',
        f'{slot}_solve.json', *optional_policy(D), *optional_routes(D)], f'{slot}_judge.json', slot=slot, ticket=ticket, SLOT=slot)


def review(D, slot, ticket=None):
    inputs = ['original_problem.txt', f'{slot}_problem.txt', f'{slot}_solve.json',
              f'{slot}_judge.json', f'{slot}.json', *optional_policy(D), *optional_routes(D)]
    if (Path(D) / 'real_errors.md').is_file(): inputs.append('real_errors.md')
    inputs += [f'{slot}{suffix}' for suffix in ('_check.py', '_solve.py') if (Path(D) / f'{slot}{suffix}').is_file()]
    return isolated_call(D, 'review', inputs, f'{slot}_review.json', slot=slot, ticket=ticket, SLOT=slot)


def numeric_value(raw):
    """외부 문자열 eval/sympify 금지: 허용 AST만 정확한 기호식으로 변환."""
    import sympy as sp
    if not isinstance(raw, str) or not raw.strip() or len(raw) > 256: return None
    text = raw.strip().replace('−', '-').replace('×', '*').replace('÷', '/').replace('π', 'pi').replace('√', 'sqrt').replace('^', '**')
    text = re.sub(r'sqrt\s*(\d+(?:\.\d+)?)', r'sqrt(\1)', text)
    text = re.sub(r'(\d|\))\s*(sqrt|pi|\()', r'\1*\2', text)
    text = re.sub(r'(pi)\s*(\()', r'\1*\2', text)
    try:
        tree = ast.parse(text, mode='eval')
        if len(list(ast.walk(tree))) > 100: return None
        def convert(node):
            if isinstance(node, ast.Constant) and type(node.value) in (int, float):
                literal = ast.get_source_segment(text, node)
                if not re.fullmatch(r'(?:[0-9]+(?:[.][0-9]*)?|[.][0-9]+)', literal):
                    raise ValueError('정수·유한소수 리터럴만 허용')
                return sp.Rational(literal)
            if isinstance(node, ast.Name) and node.id == 'pi': return sp.pi
            if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
                return convert(node.operand) * (-1 if isinstance(node.op, ast.USub) else 1)
            if (isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == 'sqrt'
                    and len(node.args) == 1 and not node.keywords):
                return sp.sqrt(convert(node.args[0]))
            if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Pow)):
                left, right = convert(node.left), convert(node.right)
                if isinstance(node.op, ast.Add): return left + right
                if isinstance(node.op, ast.Sub): return left - right
                if isinstance(node.op, ast.Mult): return left * right
                if isinstance(node.op, ast.Div): return left / right
                if right.is_Integer is not True or abs(right) > 100 or sp.count_ops(left) > 40:
                    raise ValueError('거듭제곱 제한')
                if left.is_Rational and max(abs(int(left.p)).bit_length(), int(left.q).bit_length()) * abs(int(right)) > 8192:
                    raise ValueError('수식 크기 제한')
                return left ** right
            raise ValueError('허용되지 않은 수식')
        value = convert(tree.body)
        if value.is_real is True and value.is_finite is True and not value.free_symbols: return value
    except (ValueError, TypeError, SyntaxError, ZeroDivisionError, OverflowError, RecursionError): pass
    return None


def same_value(a, b):
    import sympy as sp
    x, y = numeric_value(a), numeric_value(b)
    if x is None or y is None: return None
    delta = sp.simplify(x - y)
    if delta == 0 or delta.is_zero is True: return True
    if delta.is_zero is False: return False
    return None


def section(text, title):
    match = re.search(r'^## ' + re.escape(title) + r'\s*\n(.*?)(?=^## |\Z)', text, re.S | re.M)
    return match[1].strip() if match else ''


def choices(problem):
    # 절차 번호는 선지가 아니다. 끝의 순서 있는 다섯 표지 뒤가 각각 수 값인 경우만 선지 묶음이다.
    marks = list(re.finditer('[①②③④⑤]', problem))[-5:]
    if [m.group() for m in marks] != list('①②③④⑤'): return None
    options = [problem[m.end():marks[i+1].start() if i < 4 else len(problem)].strip()
               for i, m in enumerate(marks)]
    return options if all(numeric_value(option) is not None for option in options) else None


def answer_parts(answer):
    match = re.fullmatch(r'\s*([①②③④⑤]|[1-5]번)\s*(?:[(:：=]\s*)?(.*?)\s*\)?', answer)
    if not match: return None, answer.strip()
    index = '①②③④⑤'.index(match[1]) if match[1] in '①②③④⑤' else int(match[1][0])-1
    return index, match[2].strip()


def original_answer(original, problem):
    raw = section(original, '정답')
    index, value = answer_parts(raw)
    if index is not None:
        opts = choices(problem)
        if opts is None: raise ValueError('원본 정답 번호의 선지 값 확인 불가')
        value = opts[index]
    if numeric_value(value) is None: raise ValueError('원본 정답 값을 정확한 수 하나로 확인 불가')
    return {'raw': raw, 'answer_value': value, 'validated': True}


# [10/20] 선수 과목 — 정책에 없으면 판정이 '공통수학2 문제에 판별식·근과 계수(공통수학1)'를 범위 밖으로 보고 3칸을 보류했다.
# 앞 과목(과 중학교 전 과정, 같은 과목의 앞 단원)은 학생이 이미 배운 도구다. 뒤 과목의 방법은 계속 범위 밖.
PRIOR = {'공통수학1': [], '공통수학2': ['공통수학1'], '대수': ['공통수학1', '공통수학2'],
         '미적분I': ['공통수학1', '공통수학2', '대수'], '미적분II': ['공통수학1', '공통수학2', '대수', '미적분I'],
         '확률과통계': ['공통수학1', '공통수학2'], '기하': ['공통수학1', '공통수학2'],
         '수학(상)': [], '수학(하)': ['수학(상)'], '수학I': ['수학(상)', '수학(하)'], '수학II': ['수학(상)', '수학(하)', '수학I'],
         '미적분': ['수학(상)', '수학(하)', '수학I', '수학II']}


GRAPH_NOTE = '그래프 개형으로 교점·근의 존재를 읽는 것은 허용한다(대표 10/20: "원래 사람은 그렇게 푼다"): 끊기지 않는 두 그래프의 위아래 순서가 바뀌면 만난다, 한쪽이 증가하고 다른 쪽이 감소하면 많아야 한 번 만난다, 점근선 높이를 비교한다 같은 판단. 사잇값 정리의 이름이나 엄밀한 존재 증명을 요구하지 않고, 이것을 범위 밖 방법이나 보류 사유로 삼지 않는다.'


def course_key(course):
    c = re.sub(r'\s', '', course or '').replace('Ⅰ', 'I').replace('Ⅱ', 'II').replace('Ⅲ', 'III')
    return {'수학상': '수학(상)', '수학하': '수학(하)', '미적분1': '미적분I', '미적분2': '미적분II', '수학1': '수학I', '수학2': '수학II'}.get(c, c)


def make_policy(original, requested, max_attempts, unit=''):
    source = section(original, '출처')
    course = re.search(r'(?:공통수학[12]?|수학(?:III|II|I|Ⅰ|Ⅱ|Ⅲ|[12상하])?|미적분|확률과\s*통계|기하)(?=[_\s·|,번]|$)', source)
    parts = [part.strip() for part in re.split('[·|]', source)]
    unit_match = re.search(r'(?:단원명|단원)\s*[:：|]\s*([^\n|·]+)', source)
    source_unit = unit_match[1].strip() if unit_match else (parts[1] if len(parts) > 1 and not parts[1].startswith('난이도') else '')
    return {'schema_version': 2, 'purpose': '비수치 시험 변형', 'requested_counts': requested,
        'no_original_answer': True, 'no_duplicate_answers': True, 'max_attempts': max_attempts,
        'layout_required': True, 'allow_alternative_delivery': False,
        'course': course.group().strip() if course else '', 'unit': unit or source_unit,   # 명령줄 --unit 이 있으면 우선(출처 줄 해석이 '회차 미확인)' 처럼 틀린 적 있음)
        'source_metadata': source, 'unit_cli': unit,
        'prior_courses': PRIOR.get(course_key(course.group() if course else ''), []),
        'curriculum_note': ('출처 범위를 우선한다. 중학교 전 과정, prior_courses 의 과목, 같은 과목의 앞 단원은 학생이 이미 배운 내용이므로 허용한다. '
                            '그 밖(뒤 과목·교육과정 밖)의 내용·방법은 허용을 추정하지 않는다. ' + GRAPH_NOTE)}


REAL_ERRORS = 'C:/selfmade/오답조사/real_errors.json'


def write_real_errors(D, unit, src, no):
    """실측 오답 자료를 작업 폴더에 real_errors.md 로. 자료가 없으면 '없음'이라고 적는다(분석 담당이 추정임을 밝히게)."""
    R = load(REAL_ERRORS) or {}
    out = ['# 실제 학생 오답 (서울 학생 시험지 스캔 조사, 10/19)', '']
    q = (R.get('by_question') or {}).get(f'{src}#{no}') if src and no else None
    if q:
        out.append(f'## 이 원본 문항의 실제 오답 사례 {len(q)}건 (관찰=흔적, 해석=원인 — 둘을 구분해서 써라)')
        for x in q: out.append(f"- 해석(확실도 {x.get('confidence')}): {x.get('cause')} / 학생 답 {x.get('student_answer')} (정답 {x.get('correct')}) / 관찰한 흔적: {x.get('work')} / 어긋난 곳: {x.get('diverge')}")
        out.append('')
    cs = (R.get('by_unit') or {}).get(unit.replace(' ', '')) if unit else None
    if cs:
        out.append(f'## 같은 단원({unit})에서 관찰된 오답 원인 — 시험지 수 순. 분모(푼 학생 수)가 없으니 발생률·"가장 흔한"으로 쓰지 마라')
        for x in cs[:15]:
            out.append(f"- **{x['name']}** (시험지 {x['exams']}장·사례 {x['cases']}건) — {x.get('what')} / 함정이 작동하는 조건: {x.get('trigger')}")
            for e in (x.get('examples') or [])[:2]: out.append(f"  - 사례: {e.get('exam')} {e.get('no')}번 — {e.get('trace')}")
    if not q and not cs: out.append('(이 문항·단원의 실측 자료 없음 — 흔한 오답은 추정이라고 표시할 것)')
    write_text(Path(D) / 'real_errors.md', '\n'.join(out))




def require_shape(obj, fields, name):
    errors = []
    if not isinstance(obj, dict): return [f'{name}: JSON 객체 없음']
    for key, kind in fields.items():
        if key not in obj or type(obj[key]) is not kind:
            errors.append(f'{name}.{key}: 필수 {kind.__name__} 누락/유형 오류')
    return errors


def validate_plan(plan, requested):
    fields = {'schema_version': int, 'answer_check': str, 'steps': list, 'cruxes': list,
              'wrong_answers': list, 'requested_counts': dict, 'slots': list, 'shortfalls': list}
    errors = require_shape(plan, fields, 'plan')
    if errors: raise ValueError('; '.join(errors))
    if plan['schema_version'] != 2 or plan['requested_counts'] != requested:
        raise ValueError('plan schema/요청 수량 불일치')
    if not plan['answer_check'].strip() or not plan['steps'] or not plan['cruxes']:
        raise ValueError('원본 분석 근거 누락')
    for key in ('steps', 'cruxes'):
        if any(not isinstance(x, str) or not x.strip() for x in plan[key]):
            raise ValueError(f'plan.{key} 빈 근거/유형 오류')
    wrong_keys = ('what', 'evidence', 'source_type', 'observation', 'interpretation', 'confidence', 'limits', 'trigger')
    for row in plan['wrong_answers']:
        errors += require_shape(row, dict.fromkeys(wrong_keys, str), 'wrong_answers')
    expected = {f'{prefix}{i}': level for prefix, level in LEVELS.items() for i in range(1, requested[level]+1)}
    strings = ('id', 'level', 'direction', 'design', 'design_status', 'usage_target', 'core_relation',
        'changed_condition', 'reconsideration', 'reuse_break', 'condition_effect', 'wrong_route',
        'evidence_ref', 'removable_work', 'alternative_route', 'hold_reason')
    seen, holds = set(), dict.fromkeys(requested, 0)
    for row in plan['slots']:
        issues = require_shape(row, {**dict.fromkeys(strings, str), 'alternatives_considered': list}, 'slot')
        if issues: errors += issues; continue
        sid, level = row['id'], row['level']
        if sid in seen or expected.get(sid) != level: errors.append('slot id 중복/번호/level 불일치')
        seen.add(sid)
        if row['design_status'] not in ('진행', '보류') or row['usage_target'] not in ('시험용', '수업용', '연습용', '미정'):
            errors.append(f'{sid}: 설계 상태/용도 오류')
        alternatives = row['alternatives_considered']
        if not 1 <= len(alternatives) <= 3 or any(not isinstance(x, str) or not x.strip() for x in alternatives):
            errors.append(f'{sid}: 서로 다른 설계 대안 검토 기록 1~3개 필요')
        active = row['design_status'] == '진행' and row['usage_target'] == '시험용'
        if active and (row['hold_reason'] != '' or any(not row[k].strip() for k in strings if k != 'hold_reason')):
            errors.append(f'{sid}: 진행 설계 근거/보류 사유 모순')
        if not active:
            if not row['hold_reason'].strip(): errors.append(f'{sid}: 부족 사유 누락')
            if level in holds: holds[level] += 1
    if seen != set(expected): errors.append('보류 포함 요청 slot 목록 불일치')
    reported = dict.fromkeys(requested, 0)
    for row in plan['shortfalls']:
        if require_shape(row, {'level': str, 'count': int, 'reason': str}, 'shortfall') or row.get('level') not in requested:
            errors.append('shortfalls 형식 오류'); continue
        if row['count'] <= 0 or not row['reason'].strip(): errors.append('shortfalls 수량/사유 오류')
        reported[row['level']] += row['count']
    if reported != holds: errors.append('보류 칸과 shortfalls 수량 불일치')
    if errors: raise ValueError('; '.join(errors))
    return plan['slots']


def generation_errors(g, slot, level):
    text_keys = ('id', 'level', 'direction', 'status', 'hold_reason', 'problem', 'answer', 'answer_value',
                 'solution', 'changes', 'difficulty_note', 'check_output', 'length_exception', 'layout_status')
    errors = require_shape(g, {**dict.fromkeys(text_keys, str), 'schema_version': int,
        'figure_required': bool, 'design_evidence': dict}, 'generate')
    if errors: return errors
    if g['schema_version'] != 2 or g['id'] != slot or g['level'] != level:
        errors.append('생성 schema/id/요청 level 불일치')
    if g['status'] == '생성 보류':
        if not g['hold_reason'].strip() or any(g[k] != '' for k in ('problem', 'answer', 'answer_value', 'solution')):
            errors.append('생성 보류 원고/사유 형식 오류')
        return errors
    if g['status'] != '생성 완료' or g['hold_reason'] != '': errors.append('생성 완료 상태 오류')
    for key in ('problem', 'answer', 'answer_value', 'solution', 'changes', 'difficulty_note', 'check_output'):
        if not g[key].strip(): errors.append(f'{key} 빈 값')
    evidence = ('core_relation', 'reuse_break', 'condition_effect', 'wrong_route', 'evidence_ref', 'shortest_route')
    errors += require_shape(g['design_evidence'], dict.fromkeys(evidence, str), 'design_evidence')
    if any(not str(g['design_evidence'].get(k, '')).strip() for k in evidence): errors.append('설계 근거 빈 값')
    if numeric_value(g['answer_value']) is None: errors.append('answer_value 수 하나 판정 불가')
    try:
        options = choices(g['problem'])
        index, display = answer_parts(g['answer'])
        if options is None:
            if index is not None: errors.append('객관식 정답 표기에는 끝의 수 값 선지 ①~⑤ 정확히 5개 필요')
            value = numeric_value(g['answer_value'])
            if value is None or value.is_Integer is not True or not 0 <= value <= 999:
                errors.append('단답형은 0~999 정수 필요')
            if index is not None or same_value(display, g['answer_value']) is not True:
                errors.append('단답형 answer/answer_value 불일치·미확인')
        else:
            if index is None or same_value(display, g['answer_value']) is not True:
                errors.append('객관식 정답 번호와 값 표기 누락/불일치')
            matches = [same_value(option, g['answer_value']) for option in options]
            if None in matches or matches.count(True) != 1 or index is None or matches[index] is not True:
                errors.append('객관식 5선지/유일 정답/번호·값 불일치·미확인')
    except ValueError as exc: errors.append(str(exc))
    return errors


def review_shape(j, r):
    j_strings = ('verdict', 'reason', 'forced', 'exam_like_reason', 'math_status', 'core_alignment',
        'non_numeric_status', 'condition_test', 'shortest_route', 'curriculum_status', 'length_exception')
    r_strings = ('adoption', 'reason', 'math_status', 'solution_status', 'design_status', 'exam_status',
        'curriculum_status', 'layout_status', 'difficulty_status')
    errors = require_shape(j, {**dict.fromkeys(j_strings, str), 'schema_version': int,
        'original_steps': int, 'variant_steps': int, 'original_cruxes': list, 'variant_cruxes': list,
        'made_easier': list, 'exam_like': bool, 'wording': list, 'reuse_test': dict,
        'misconception_test': dict, 'fingerprint': dict, 'findings': list, 'checks_complete': dict}, 'judge')
    errors += require_shape(r, {**dict.fromkeys(r_strings, str), 'schema_version': int,
        'problem_matches': bool, 'alternative_use': list, 'solution_checks': list,
        'findings': list, 'disagreements': list, 'checks_complete': dict}, 'review')
    for name, obj, checks in (('judge', j, J_CHECKS), ('review', r, R_CHECKS)):
        if not isinstance(obj, dict): continue
        if obj.get('schema_version') != 2: errors.append(f'{name} schema != 2')
        errors += require_shape(obj.get('checks_complete'), dict.fromkeys(checks, bool), name + '.checks_complete')
        if isinstance(obj.get('findings'), list):
            for finding in obj['findings']:
                errors += require_shape(finding, dict.fromkeys(('category', 'severity', 'location', 'evidence', 'required_action'), str), name + '.finding')
                if isinstance(finding, dict) and finding.get('severity') not in ('차단', '보류', '권고'):
                    errors.append('finding severity 오류')
    if isinstance(j, dict):
        errors += require_shape(j.get('reuse_test'), dict.fromkeys(('equations', 'first_change'), str), 'reuse_test')
        errors += require_shape(j.get('fingerprint'), dict.fromkeys(('core_relation', 'decision', 'answer_value'), str), 'fingerprint')
        m = j.get('misconception_test')
        errors += require_shape(m, dict.fromkeys(('route', 'result'), str), 'misconception_test')
        if not isinstance(m, dict) or 'differs_from_correct' not in m or (m['differs_from_correct'] is not None and type(m['differs_from_correct']) is not bool):
            errors.append('misconception_test.differs_from_correct 누락/유형')
        if j.get('verdict') not in (*LEVELS.values(), '판정불가'): errors.append('judge verdict 오류')
    if isinstance(r, dict):
        if r.get('adoption') not in ('채택', '보류', '시험용 미채택', '제공 불가'): errors.append('review adoption 오류')
        if not isinstance(r.get('solution_checks'), list) or not r['solution_checks']:
            errors.append('해설 검사 근거 누락')
        else:
            for row in r['solution_checks']:
                errors += require_shape(row, dict.fromkeys(('location', 'claim', 'check', 'status'), str), 'solution_check')
    for name, obj, keys in (('judge', j, ('reason', 'condition_test', 'shortest_route')),
                             ('review', r, ('reason',))):
        if isinstance(obj, dict):
            for key in keys:
                if not isinstance(obj.get(key), str) or not obj[key].strip():
                    errors.append(f'{name}.{key}: 빈 필수 근거')
    for key in ('original_cruxes', 'variant_cruxes'):
        value = j.get(key) if isinstance(j, dict) else None
        if not isinstance(value, list) or not value or any(not isinstance(x, str) or not x.strip() for x in value):
            errors.append(f'judge.{key}: 핵심 근거 누락')
    for key in ('reuse_test', 'fingerprint'):
        value = j.get(key) if isinstance(j, dict) else None
        if isinstance(value, dict) and any(not isinstance(x, str) or not x.strip() for x in value.values()):
            errors.append(f'judge.{key}: 빈 근거')
    if isinstance(r, dict) and isinstance(r.get('solution_checks'), list):
        for row in r['solution_checks']:
            if isinstance(row, dict) and any(not isinstance(x, str) or not x.strip() for x in row.values()):
                errors.append('solution_checks: 빈 검사 근거')
    # 과거 실측 출처는 학생용 해설의 수학적 줄과 분리한다. 기존 review에도 호환된다.
    if isinstance(r, dict) and 'evidence_checks' in r:
        if not isinstance(r['evidence_checks'], list):
            errors.append('evidence_checks: list 필요')
        else:
            for row in r['evidence_checks']:
                errors += require_shape(row, dict.fromkeys(('location', 'claim', 'check', 'status'), str), 'evidence_check')
                if (not isinstance(row, dict) or row.get('status') not in ('확인', '오류', '미확인')
                        or any(not isinstance(row.get(k), str) or not row[k].strip()
                               for k in ('location', 'claim', 'check'))):
                    errors.append('evidence_checks: 상태/근거 오류')
    return errors


def adoption_errors(g, s, j, r, level, original_value, executions):
    errors = review_shape(j, r)
    errors += require_shape(s, {'answer': str, 'answer_value': str, 'method': str, 'defects': list, 'script_output': str}, 'solve')
    if not isinstance(s, dict): return errors
    if s.get('defects') != []: errors.append('독립 풀이 결함 또는 defects 누락')
    if not s.get('method') or not s.get('script_output'): errors.append('독립 풀이 필수 근거 누락')
    if same_value(s.get('answer_value'), g.get('answer_value')) is not True:
        errors.append('생성·독립 풀이 답 불일치/미확인')
    if same_value(g.get('answer_value'), original_value) is not False:
        errors.append('원본 답과 같음 또는 정확한 비교 미확인')
    for name in ('check', 'solve'):
        run = executions.get(name, {})
        if run.get('returncode') != 0 or not run.get('stdout', '').strip():
            errors.append(f'{name}: runner 검산 실행 실패/출력 누락')
    for name, obj, checks in (('judge', j, J_CHECKS), ('review', r, R_CHECKS)):
        if not isinstance(obj, dict): continue
        complete = obj.get('checks_complete')
        if not isinstance(complete, dict) or any(value is not True for value in complete.values()) or any(complete.get(k) is not True for k in checks):
            errors.append(f'{name}: 미완료 검사')
        for item in obj.get('findings', []) if isinstance(obj.get('findings'), list) else []:
            if isinstance(item, dict) and item.get('severity') in ('차단', '보류'):
                errors.append(f"{name}: {item.get('severity')} {item.get('location')} {item.get('evidence')}")
    expected_j = {'math_status': '확인', 'core_alignment': '일치', 'curriculum_status': '적합',
                  'verdict': level, 'forced': '', 'exam_like': True, 'wording': []}
    expected_r = {'adoption': '채택', 'problem_matches': True, 'math_status': '확인',
                  'solution_status': '확인', 'design_status': '적합', 'exam_status': '적합',
                  'curriculum_status': '적합', 'disagreements': []}
    for name, obj, expected in (('judge', j, expected_j), ('review', r, expected_r)):
        for key, value in expected.items():
            if key not in obj or obj[key] != value: errors.append(f'{name}.{key}: {obj.get(key)!r}, 필요 {value!r}')
    allowed = ('충족', '해당 없음') if level == '쉬움' else ('충족',)
    if j.get('non_numeric_status') not in allowed: errors.append('비수치 시험 변형 조건 미충족')
    if isinstance(r.get('solution_checks'), list) and any(not isinstance(x, dict) or x.get('status') != '확인' for x in r['solution_checks']):
        errors.append('해설에 미확인/오류 줄이 남음')
    if isinstance(r.get('evidence_checks'), list) and any(isinstance(x, dict) and x.get('status') == '오류'
                                                       for x in r['evidence_checks']):
        errors.append('근거표시에 확인된 오류가 남음')
    return errors


def script_dependency_errors(source):
    """자기완결형 검산 계약의 보수적 정적 검사. OS 보안 경계를 대신하지 않는다."""
    try: tree = ast.parse(source)
    except SyntaxError as exc: return [f'검산 스크립트 구문 오류: {exc}']
    allowed_modules = {'math', 'cmath', 'fractions', 'decimal', 'itertools', 'collections',
        'functools', 'operator', 'statistics', 'typing', 're', 'json', 'sympy', 'numpy',
        'scipy', 'heapq', 'bisect', 'copy', 'dataclasses', 'enum'}
    file_members = {'open', 'read_text', 'read_bytes', 'write_text', 'write_bytes', 'read',
        'readline', 'readlines', 'write', 'writelines', 'load', 'save', 'loadtxt', 'savetxt',
        'fromfile', 'tofile', 'memmap', 'exists', 'is_file', 'is_dir', 'iterdir', 'glob',
        'rglob', 'mkdir', 'unlink', 'rename', 'rmdir', 'touch'}
    numpy_file = {'load', 'save', 'savez', 'savez_compressed', 'loadtxt', 'savetxt', 'genfromtxt',
                  'fromfile', 'tofile', 'memmap', 'read_text', 'read_bytes', 'write_text', 'write_bytes'}
    dynamic_names = {'open', 'eval', 'exec', 'compile', '__import__', '__builtins__',
                     'getattr', 'setattr', 'globals', 'locals', 'vars', 'input', 'breakpoint'}
    errors = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            modules = [a.name for a in node.names] if isinstance(node, ast.Import) else [node.module or '']
            if (isinstance(node, ast.ImportFrom) and node.level) or any(m.split('.')[0] not in allowed_modules for m in modules):
                errors.append(f'{node.lineno}행: 외부 파일/실행 의존 가능 import {", ".join(modules)}')
            if isinstance(node, ast.ImportFrom) and any(a.name in file_members or a.name == '*' for a in node.names):
                errors.append(f'{node.lineno}행: 파일 접근/정적 확인 불가 import')
        if isinstance(node, ast.Name) and node.id in dynamic_names:
            errors.append(f'{node.lineno}행: 파일 접근/동적 실행 {node.id}')
        # [10/20] 속성 이름만으로는 막지 않는다 — sympy.Interval.open(0, oo) 를 파일 열기로 오인해 6칸 중 5칸이 멈췄다.
        # os·io·pathlib 은 import 단계에서 이미 막히므로, 남는 파일 경로는 내장 open() 과 numpy 의 파일 함수뿐이다.
        if isinstance(node, ast.Attribute) and (node.attr in numpy_file or node.attr.startswith('__')):
            errors.append(f'{node.lineno}행: 파일 접근/정적 확인 불가 속성 {node.attr}')
    return sorted(set(errors))


def execute_script(D, slot, suffix, timeout=120):
    D = Path(D)
    script = D / f'{slot}_{suffix}.py'
    result = {'script': script.name, 'returncode': None, 'stdout': '', 'stderr': '', 'seconds': 0}
    if not script.is_file() or script.is_symlink():
        result['stderr'] = '필수 검산 스크립트 누락'
    else:
        result['sha256'] = digest(script)
        source = script.read_text(encoding='utf-8-sig')
        result['dependency_errors'] = script_dependency_errors(source)
        if result['dependency_errors']:
            result['stderr'] = '자기완결형 검산 계약 위반: ' + '; '.join(result['dependency_errors'])
            write_json(D / f'{slot}_{suffix}_run.json', result)
            return result
        work = fresh_dir(D / 'calls', f'{slot}_{suffix}_exec_')
        write_text(work / script.name, source)
        started = time.monotonic()
        if BUDGET and BUDGET.deadline: timeout = min(timeout, max(0.01, BUDGET.deadline-time.monotonic()))
        try:
            proc = subprocess.run([sys.executable, '-I', str(work / script.name)], cwd=work,
                capture_output=True, text=True, encoding='utf-8', errors='replace',
                timeout=timeout, stdin=subprocess.DEVNULL, env={**os.environ, 'PYTHONIOENCODING': 'utf-8'})
            result.update(returncode=proc.returncode, stdout=proc.stdout, stderr=proc.stderr)
        except (subprocess.TimeoutExpired, OSError) as exc: result['stderr'] = str(exc)
        result['seconds'] = time.monotonic()-started
    write_json(D / f'{slot}_{suffix}_run.json', result)
    return result


def slot_files(slot):
    return [f'{slot}{suffix}' for suffix in ('.json', '.generated.json', '_problem.txt', '_check.py',
        '_solve.py', '_solve.json', '_judge.json', '_review.json', '_check_run.json', '_solve_run.json',
        '_generate_execution.json', '_solve_execution.json', '_judge_execution.json', '_review_execution.json', '_attempt.json')]


def archive_slot(D, slot, label):
    for name in slot_files(slot):
        path = Path(D) / name
        if path.exists(): path.replace(path.with_name(path.stem + f'.{label}' + path.suffix))


def held_result(slot, level, reason, attempt=0):
    return {'slot': slot, 'level': level, 'status': '보류', 'attempt': attempt,
            'eligible': False, 'problems': [reason], 'generated': {}, 'solve': {}, 'judge': {}, 'review': {}}


def slot_pipeline(D, slot, level, maxtry=2, original_value=None):
    D = Path(D)
    if not 1 <= maxtry <= 2: raise ValueError('총 생성 시도 1~2회만 허용')
    archive_slot(D, slot, 'previous_' + str(time.time_ns()))
    feedback = load(D / 'feedback.json')
    history = [str(feedback[slot])] if isinstance(feedback, dict) and slot in feedback else []
    result = held_result(slot, level, '아직 생성하지 않음')
    for attempt in range(1, maxtry+1):
        ticket = None
        try:
            # 각 4단계의 출력 깨짐 재호출까지 예약한다. bundle은 main에서 먼저 예약한다.
            if BUDGET: ticket = BUDGET.reserve(8)
            if attempt > 1: archive_slot(D, slot, f'try{attempt-1}')
            result = held_result(slot, level, '검토 미완료', attempt)
            fb = '\n## 이전 반려 이유\n' + '\n'.join(history[-2:]) if history else ''
            g = isolated_call(D, 'generate', ['original.md', 'plan.json', 'real_errors.md', *optional_routes(D)],
                f'{slot}.json', outputs=(f'{slot}_check.py',), slot=slot, ticket=ticket,
                SLOT=slot, LEVEL=level, FEEDBACK=fb)
            write_json(D / f'{slot}.generated.json', g)
            result['generated'] = g
            issues = generation_errors(g, slot, level)
            if issues: raise ValueError('; '.join(issues))
            if g['status'] == '생성 보류':
                result['problems'] = ['생성 보류: ' + g['hold_reason']]
                break
            write_text(D / f'{slot}_problem.txt', g['problem'])
            check_run = execute_script(D, slot, 'check')
            result['runner_executions'] = {'check': check_run}
            if check_run.get('returncode') != 0 or not check_run.get('stdout', '').strip():
                raise ValueError('생성 단계 검산 결함: ' + (check_run['stderr'] or '실행 실패/출력 누락'))
            s = isolated_call(D, 'solve', [f'{slot}_problem.txt'], f'{slot}_solve.json',
                outputs=(f'{slot}_solve.py',), slot=slot, ticket=ticket, SLOT=slot)
            issues = require_shape(s, {'answer': str, 'answer_value': str, 'method': str, 'defects': list, 'script_output': str}, 'solve')
            if issues: raise ValueError('; '.join(issues))
            solve_run = execute_script(D, slot, 'solve')
            result['solve'] = s
            result['runner_executions']['solve'] = solve_run
            if solve_run.get('returncode') != 0 or not solve_run.get('stdout', '').strip():
                raise ValueError('독립 풀이 검산 결함: ' + (solve_run['stderr'] or '실행 실패/출력 누락'))
            # 모델의 script_output 주장을 실행 증거로 쓰지 않는다. runner 결과를 고정 입력에 포함.
            s['runner_execution'] = solve_run
            write_json(D / f'{slot}_solve.json', s)
            j = judge(D, slot, ticket)
            r = review(D, slot, ticket)
            issues = adoption_errors(g, s, j, r, level, original_value, {'check': check_run, 'solve': solve_run})
            result.update(solve=s, judge=j, review=r, runner_executions={'check': check_run, 'solve': solve_run},
                          problems=issues, eligible=not issues,
                          status='내부 채택' if not issues else r.get('adoption', '보류'))
            combined = {**g, 'attempt': attempt, 'solve': s, 'judge': j, 'review': r, 'problems': issues,
                        'internal_adopted': not issues, 'runner_executions': {'check': check_run, 'solve': solve_run}}
            write_json(D / f'{slot}.json', combined)
            if not issues: break
            history.append(' | '.join(issues))
            # 확인 불가를 난도 불일치로 재생성하지 않는다.
            if j.get('verdict') == '판정불가' or r.get('adoption') == '보류': break
        except BudgetError as exc:
            result['problems'].append('예산/시간 보류: ' + str(exc))
            break
        except (OSError, ValueError, RuntimeError, TypeError, KeyError) as exc:
            result['problems'] = [str(exc)]
            history.append(str(exc))
        finally:
            if BUDGET: BUDGET.release(ticket)
            write_json(D / f'{slot}_attempt.json', result)
    # 최종 시도도 고정 보존하고 canonical 파일은 현재 결과로 남긴다.
    for name in slot_files(slot):
        path = D / name
        if path.is_file(): write_text(path.with_name(path.stem + f'.try{result["attempt"]}' + path.suffix), path.read_text(encoding='utf-8'))
    return result



def pair_key(value, known):
    if not isinstance(value, list) or len(value) != 2 or any(not isinstance(x, str) for x in value):
        raise ValueError('묶음 쌍은 서로 다른 slot 2개 필요')
    if value[0] == value[1] or not set(value) <= known: raise ValueError('묶음 쌍 id 오류')
    return tuple(sorted(value))


def valid_subset(ids, results, requested, conflicts):
    if len(ids) != len(set(ids)) or not set(ids) <= set(results): return False
    if any(not results[sid]['eligible'] for sid in ids): return False
    if any(requested[level] < sum(results[sid]['level'] == level for sid in ids) for level in requested): return False
    return all(tuple(sorted(pair)) not in conflicts for pair in itertools.combinations(ids, 2))


def choose_subset(results, requested, conflicts):
    ids = sorted(sid for sid, row in results.items() if row['eligible'])
    def penalties(combo):
        notes, wording = 0, 0
        for sid in combo:
            for key in ('judge', 'review'):
                findings = results[sid][key]['findings']
                notes += sum(x['severity'] == '권고' for x in findings)
                wording += sum(x['severity'] == '권고' and x['category'] == '시험표현' for x in findings)
        return notes, wording
    options = [combo for size in range(len(ids)+1) for combo in itertools.combinations(ids, size)
               if valid_subset(combo, results, requested, conflicts)]
    # 최대 수량 → 미해결 권고 수 → 표현 권고 수(명확성의 기록 가능한 지표) → slot id.
    return list(min(options, key=lambda combo: (-len(combo), *penalties(combo), combo)))


def bundle(D, rows, requested, ticket=None):
    D = Path(D)
    results = {row['slot']: row for row in rows}
    ids = sorted(results)
    pairs, conflicts = [], set()
    for a, b in itertools.combinations(ids, 2):
        same = same_value(results[a]['generated'].get('answer_value'), results[b]['generated'].get('answer_value'))
        pairs.append({'slots': [a, b], 'same_answer': same,
                      'status': '같음' if same is True else '다름' if same is False else '비교 미확인'})
        if same is not False: conflicts.add((a, b))
    candidates = []
    for sid in ids:
        row, g, j, r = results[sid], results[sid]['generated'], results[sid]['judge'], results[sid]['review']
        value = numeric_value(g.get('answer_value'))
        candidates.append({'id': sid, 'requested_level': row['level'], 'judged_level': j.get('verdict'),
            'status': row['status'], 'eligible': row['eligible'], 'problems': row['problems'],
            'problem': g.get('problem', ''), 'answer_value': g.get('answer_value'),
            'normalized_answer': str(value) if value is not None else None, 'usage_target': '시험용',
            'checks_complete': {'judge': j.get('checks_complete'), 'review': r.get('checks_complete')},
            'adoption': r.get('adoption'), 'judge': {k: j.get(k) for k in ('fingerprint', 'reuse_test', 'shortest_route', 'findings')},
            'review': {k: r.get(k) for k in ('reason', 'findings')}})
    write_json(D / 'bundle_input.json', {'schema_version': 2, 'requested_counts': requested,
        'delivery_policy': load(D / 'delivery_policy.json'), 'candidates': candidates, 'answer_comparisons': pairs})
    response, errors = {}, []
    try:
        response = isolated_call(D, 'bundle', ['bundle_input.json'], 'bundle_review.json', ticket=ticket)
        errors += require_shape(response, {'schema_version': int, 'complete': bool, 'status': str,
            'comparisons': list, 'conflicts': list, 'recommended_slots': list, 'shortfalls': list}, 'bundle')
        if errors: raise ValueError('; '.join(errors))
        if response['schema_version'] != 2 or response['complete'] is not True: raise ValueError('묶음 검사 미완료')
        if response['status'] not in ('요청 충족', '부분 충족', '보류'): raise ValueError('묶음 status 오류')
        compared = set()
        same_decisions = set()
        for row in response['comparisons']:
            if (require_shape(row, {'slots': list, 'evidence': str}, 'comparison')
                    or 'same_decision' not in row
                    or (row['same_decision'] is not None and type(row['same_decision']) is not bool)
                    or not row['evidence'].strip()):
                raise ValueError('묶음 비교 근거/형식 오류')
            key = pair_key(row['slots'], set(ids))
            if key in compared: raise ValueError('중복 비교 쌍')
            compared.add(key)
            # null은 비교 완료 후에도 판단을 확정할 수 없다는 뜻이다. 모델 conflicts 누락에도 강제 차단.
            if row['same_decision'] is not False: same_decisions.add(key)
        if compared != set(itertools.combinations(ids, 2)): raise ValueError('모든 n(n-1)/2 쌍 비교 필요')
        model_conflicts = set()
        for row in response['conflicts']:
            if require_shape(row, {'slots': list, 'kind': str, 'evidence': str}, 'conflict') or not row['evidence'].strip():
                raise ValueError('묶음 충돌 근거/형식 오류')
            if row['kind'] not in ('답 중복', '판단 중복', '비교 미확인'): raise ValueError('conflict kind 오류')
            model_conflicts.add(pair_key(row['slots'], set(ids)))
        conflicts |= model_conflicts | same_decisions
        recommended = response['recommended_slots']
        if any(not isinstance(x, str) for x in recommended) or not valid_subset(recommended, results, requested, conflicts):
            raise ValueError('모델 권고 조합이 개별 채택/답/판단 충돌/수량 조건을 위반')
        reported = dict.fromkeys(requested, 0)
        for row in response['shortfalls']:
            if require_shape(row, {'level': str, 'count': int, 'reason': str}, 'bundle.shortfalls') or row.get('level') not in requested:
                raise ValueError('묶음 부족 수량 형식 오류')
            if row['count'] <= 0 or not row['reason'].strip(): raise ValueError('묶음 부족 사유 오류')
            reported[row['level']] += row['count']
        expected = {lv: requested[lv]-sum(results[s]['level'] == lv for s in recommended) for lv in requested}
        if reported != expected: raise ValueError('묶음 권고 조합과 부족 수량 불일치')
        if response['status'] == '요청 충족' and any(expected.values()): raise ValueError('묶음 status/수량 모순')
    except (OSError, ValueError, RuntimeError, TypeError, KeyError) as exc:
        errors = [str(exc)]
    selected = choose_subset(results, requested, conflicts) if not errors else []
    excluded = [sid for sid in ids if results[sid]['eligible'] and sid not in selected]
    result = {'complete': not errors, 'errors': errors, 'selected_slots': selected,
        'excluded_slots': excluded, 'conflicts': [list(x) for x in sorted(conflicts)],
        'answer_comparisons': pairs, 'model_recommended_slots': response.get('recommended_slots'),
        'selection_reason': '최대 충족 수량, 미해결 권고 수, 시험표현 권고 수, slot id 순 전수 비교',
        'subset_count_bound': 2**len(ids), 'layout_verified': False}
    write_json(D / 'bundle_selection.json', result)
    return result


def report(D, rows, requested, selection, started, plan=None, fatal=''):
    D = Path(D)
    selected = set(selection['selected_slots'])
    internal = {lv: sum(r['eligible'] and r['level'] == lv for r in rows) for lv in requested}
    accepted = {lv: sum(r['slot'] in selected and r['level'] == lv for r in rows) for lv in requested}
    shortages = {lv: requested[lv]-accepted[lv] for lv in requested}
    alternative = {'수업용': [], '연습용': []}
    for row in rows:
        r = row['review']
        # 보조 용도는 후보 표시에만 쓰며 오류·보류 원고는 세지 않는다.
        executions = row.get('runner_executions', {})
        verified_scripts = all(executions.get(name, {}).get('returncode') == 0
                               and executions.get(name, {}).get('stdout', '').strip() for name in ('check', 'solve'))
        if (not review_shape(row['judge'], r) and verified_scripts and row['solve'].get('defects') == []
                and same_value(row['solve'].get('answer_value'), row['generated'].get('answer_value')) is True
                and r.get('adoption') == '시험용 미채택' and r.get('math_status') == '확인'
                and r.get('solution_status') == '확인' and r.get('curriculum_status') == '적합'):
            for usage in alternative:
                if usage in r['alternative_use']: alternative[usage].append(row['slot'])
    stage_costs = {}
    for call in CALLS:
        stage = call['tag'].split('_retry')[0]
        cost = stage_costs.setdefault(stage, {'calls': 0, 'tokens': 0, 'unknown_token_calls': 0, 'seconds': 0})
        cost['calls'] += 1
        cost['tokens'] += call['tokens'] or 0
        cost['unknown_token_calls'] += call['tokens'] is None
        cost['seconds'] += call['seconds']
    output = {'schema_version': 2, 'requested_counts': requested, 'internal_counts': internal,
        'selected_text_counts': accepted, 'shortfalls': shortages,
        'selected_slots': sorted(selected), 'excluded_slots': selection['excluded_slots'],
        'alternative_candidates': alternative, 'alternative_delivered': {'수업용': 0, '연습용': 0},
        'completed_exam_delivery_count': 0, 'layout_verified': False,
        'attempts': sum(row['attempt'] for row in rows), 'rows': rows, 'fatal': fatal,
        'stage_costs': stage_costs, 'tokens': TOK[0], 'elapsed_seconds': time.monotonic()-started,
        'token_budget_is_estimate': True, 'bundle': selection, 'todos': TODO}
    write_json(D / 'delivery_report.json', output)
    lines = [f'# 변형 결과 — {D.name}', '',
        '내부 채택은 텍스트 원고 기준이다. 난도는 내부 추정이며 인쇄 편집은 미확인이다.', '',
        '| 난도 | 요청 | 개별 내부 채택 | 묶음 통과 원고 | 부족 |', '|---|---:|---:|---:|---:|']
    for lv in requested: lines.append(f'| {lv} | {requested[lv]} | {internal[lv]} | {accepted[lv]} | {shortages[lv]} |')
    lines += ['', f"묶음 제외: {selection['excluded_slots']} (실패 원고 확정이 아닌 묶음 중복/보류)",
              f'용도별 보조 후보: {alternative}. 별도 주문이 없어 보조 납품 0개.',
              '인쇄 편집 확인 완료: 0개 / 완성 시험지 납품: 보류', '',
              '| 칸 | 요청 | 실제 시도 | 수학 검산 완료 | 변형·해설 내부 검토 완료 | 묶음 검사 완료 | 인쇄 확인 | 결과/이유 |',
              '|---|---|---:|---|---|---|---|---|']
    def cell(value): return str(value).replace('|', ' / ').replace('\n', ' ')
    design_lines = []
    for row in rows:
        solve = row['solve']
        execution = solve.get('runner_execution', {})
        check_run = row.get('runner_executions', {}).get('check', {})
        math_ok = (check_run.get('returncode') == 0 and bool(check_run.get('stdout', '').strip())
                   and same_value(solve.get('answer_value'), row['generated'].get('answer_value')) is True
                   and execution.get('returncode') == 0 and bool(execution.get('stdout', '').strip())
                   and solve.get('defects') == [] and row['judge'].get('math_status') == '확인')
        status = '묶음 통과 텍스트' if row['slot'] in selected else row['status']
        reason = '; '.join(row['problems'])
        if row['slot'] in selection['excluded_slots']: reason += '; 묶음 중복 또는 묶음 보류'
        reason += '; ' + '; '.join(selection['errors']) if selection['errors'] else ''
        lines.append(f"| {row['slot']} | {row['level']} | {row['attempt']} | {math_ok} | {row['eligible']} | {selection['complete']} | False | {cell(status + ': ' + reason)} |")
        if isinstance(plan, dict) and isinstance(plan.get('slots'), list):
            design = next((s for s in plan['slots'] if s['id'] == row['slot']), None)
            if design:
                design_lines += [f"- {row['slot']} 설계 대안(최대 3개): " + cell(design['alternatives_considered'])]
    lines += ['', '설계 대안 검토 기록:', '', *design_lines]
    if fatal: lines += ['', '중단/보류 이유: ' + fatal]
    lines += ['', f"실제 생성 시도 {output['attempts']}회 · 모델 호출 {len(CALLS)}회 · 측정 토큰 {TOK[0]:,} · 경과 {output['elapsed_seconds']:.1f}초", '',
              '| 단계 | 호출 | 측정 토큰 | 토큰 미확인 호출 | 호출 시간 합(초) |', '|---|---:|---:|---:|---:|']
    for name, cost in stage_costs.items():
        lines.append(f"| {name} | {cost['calls']} | {cost['tokens']} | {cost['unknown_token_calls']} | {cost['seconds']:.1f} |")
    lines += ['', '토큰은 종료 후 집계한 값이다. 예약량은 추정이며 엄격한 호출 중 토큰 상한이 아니다.', '', '남긴 TODO:']
    lines += ['- ' + todo for todo in TODO]
    write_text(D / 'report.md', '\n'.join(lines) + '\n')
    print('\n'.join(lines), flush=True)
    return output


def main(argv=None):
    global BUDGET
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('dir'); ap.add_argument('original')
    ap.add_argument('--easy', type=int, default=2); ap.add_argument('--keep', type=int, default=2)
    ap.add_argument('--hard', type=int, default=2); ap.add_argument('--only')
    ap.add_argument('--max-attempts', '--maxtry', type=int, choices=(1, 2), default=2)
    ap.add_argument('--workers', type=int, default=3)
    ap.add_argument('--unit', default=''); ap.add_argument('--src', default=''); ap.add_argument('--no', default='')
    ap.add_argument('--max-calls', type=int, default=0, help='0: 무제한. 깨짐 재호출도 포함')
    ap.add_argument('--token-budget', type=int, default=0, help='호출 전 추정 예약 + 종료 후 측정. 엄격한 상한 아님')
    ap.add_argument('--estimated-call-tokens', type=int, default=20000)
    ap.add_argument('--total-seconds', type=float, default=0)
    ap.add_argument('--call-timeout', type=float, default=3600)
    a = ap.parse_args(argv)
    requested = {'쉬움': a.easy, '유지': a.keep, '어려움': a.hard}
    if any(v < 0 for v in requested.values()) or sum(requested.values()) > 6:
        ap.error('수량은 0 이상, 원본당 총 6칸 이하')
    if a.workers < 1 or a.call_timeout <= 0 or a.estimated_call_tokens < 1 or any(v < 0 for v in (a.max_calls, a.token_budget, a.total_seconds)):
        ap.error('병렬도·시간·예산 값 오류')
    expected = {f'{prefix}{i}': lv for prefix, lv in LEVELS.items() for i in range(1, requested[lv]+1)}
    only = set(a.only.split(',')) if a.only else set(expected)
    if not only <= set(expected): ap.error('--only에 요청하지 않은 id 포함')
    D = Path(a.dir).resolve()
    D.mkdir(parents=True, exist_ok=True)
    # 동일 작업폴더의 동시 실행은 서로의 canonical 파일을 섞을 수 있으므로 차단한다.
    try: lock_fd = os.open(D / '.pipeline.lock', os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError: ap.error('작업폴더가 실행 중이거나 중단 잠금이 남아 있음: .pipeline.lock')
    os.close(lock_fd)
    started = time.monotonic()
    with LOCK:
        CALLS.clear(); TOK[0] = 0
    BUDGET = Budget(a.max_calls, a.token_budget, a.total_seconds, a.call_timeout, a.estimated_call_tokens)
    rows = [held_result(sid, lv, '--only 미선택: 이전 결과를 재사용하지 않음' if sid not in only else '아직 분석/생성하지 않음') for sid, lv in expected.items()]
    selection = {'complete': False, 'errors': ['묶음 미검토'], 'selected_slots': [], 'excluded_slots': []}
    plan, fatal, bundle_ticket = None, '', None
    try:
        original = Path(a.original).read_text(encoding='utf-8-sig')
        problem = section(original, '문제')
        if not problem: raise ValueError('원본 ## 문제 절 없음')
        # 이전 실행 요약과 후보는 보존하되 이번 결과로 승인하지 않는다.
        for sid in expected:
            archive_slot(D, sid, 'previous_' + str(time.time_ns()))
        for name in ('plan.json', 'delivery_report.json', 'report.md', 'bundle_input.json', 'bundle_review.json',
                     'bundle_selection.json', 'original_answer.json', 'execution_manifest.json', 'analyze_execution.json', 'bundle_execution.json'):
            p = D / name
            if p.is_file(): p.replace(D / (p.stem + '.previous_' + str(time.time_ns()) + p.suffix))
        write_text(D / 'original.md', original)
        write_text(D / 'original_problem.txt', problem)
        write_text(D / 'menu.md', (HERE / 'menu.md').read_text(encoding='utf-8-sig'))
        write_real_errors(str(D), a.unit, a.src, a.no)
        policy = make_policy(original, requested, a.max_attempts, a.unit)
        write_json(D / 'delivery_policy.json', policy)
        identity_inputs = ['original.md', 'menu.md', 'real_errors.md', 'delivery_policy.json']
        specification = {'schema_version': 2, 'requested_counts': requested,
            'input_hashes': {name: digest(D / name) for name in identity_inputs},
            'prompt_hashes': {p.name: digest(p) for p in (HERE / 'prompts').glob('*.md')},
            'runner_sha256': digest(__file__), 'arguments': vars(a), 'reuse_enabled': False}
        write_json(D / 'execution_manifest.json', specification)
        answer = original_answer(original, problem)
        write_json(D / 'original_answer.json', answer)
        # 묶음 검사 예산을 먼저 보호한다. 최초 분석도 JSON 깨짐 재호출을 예약.
        bundle_ticket = BUDGET.reserve(2)
        routes_ticket = BUDGET.reserve(2)
        try:
            routes = validate_routes(isolated_call(D, 'routes', ['original_problem.txt', 'delivery_policy.json'], 'routes.json',
                ticket=routes_ticket))
            print(f"출제 의도 경로: {routes['intended']} (확신도 {routes['confidence']})", flush=True)
        finally: BUDGET.release(routes_ticket)
        analyze_ticket = BUDGET.reserve(2)
        try:
            candidate_plan = isolated_call(D, 'analyze', ['original.md', 'menu.md', 'real_errors.md', 'routes.json'], 'plan.json',
                ticket=analyze_ticket, EASY=a.easy, KEEP=a.keep, HARD=a.hard)
        finally: BUDGET.release(analyze_ticket)
        slots = validate_plan(candidate_plan, requested)
        plan = candidate_plan
        designs = {s['id']: s for s in slots}
        rows = [held_result(sid, lv, '--only 미선택: 이전 검토 미재사용' if sid not in only else
            designs[sid]['hold_reason'] or '설계 용도가 시험용 아님') for sid, lv in expected.items()]
        active = [s for s in slots if s['id'] in only and s['design_status'] == '진행' and s['usage_target'] == '시험용']
        if active:
            with ThreadPoolExecutor(min(a.workers, len(active))) as ex:
                completed = list(ex.map(lambda s: slot_pipeline(D, s['id'], s['level'], a.max_attempts, answer['answer_value']), active))
            by_id = {r['slot']: r for r in completed}
            rows = [by_id.get(r['slot'], r) for r in rows]
        # --only를 포함해 어떤 칸을 바꿔도 원본 단위 비교를 새로 한다.
        selection = bundle(D, rows, requested, bundle_ticket)
    except (OSError, ValueError, RuntimeError, TypeError, KeyError) as exc:
        fatal = str(exc)
    finally:
        BUDGET.release(bundle_ticket)
        try: report(D, rows, requested, selection, started, plan, fatal)
        finally: (D / '.pipeline.lock').unlink(missing_ok=True)
    return 1 if fatal else 0 if len(selection['selected_slots']) == sum(requested.values()) else 2


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
    raise SystemExit(main())
