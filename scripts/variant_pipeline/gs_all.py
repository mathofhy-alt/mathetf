# -*- coding: utf-8 -*-
"""gpt_solve 일괄 처리 (2026-10-18) — 본 세션이 총괄, codex exec 작업자 풀(기본 20)로 동시에.

작업 종류
  type   : 파스칼/스캔 원본 → 원고(content/figures). tools/작업자지시.md 틀 + 클로드 원고 문체 예시(과목 맞춤 2장).
           끝나면 같은 열쇠의 recheck 를 이어서 넣는다.
  recheck: 원본 스캔과 원고 발문을 한 문항씩 대조, 오독은 고치고 검사(발문대조 제외) 통과.
  vtype  : 변형 세트(C:\\gpt_solve\\변형원본\\*.md) → 원고. prompts/typeset.md + 문체 예시.
굽기는 따로(한글 COM 하나): cd C:\\gpt_solve\\tools && python -X utf8 굽기.py <열쇠…> --force

  python scripts/variant_pipeline/gs_all.py --type e013-e048 --recheck e003,e005,… --vtype e901-e910 --log <폴더> [--par 20]
"""
import os, re, sys, json, glob, shutil, argparse, subprocess, threading, time, queue as Q
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
HERE = os.path.dirname(os.path.abspath(__file__))
GS = r'C:\gpt_solve'; TOOLS = os.path.join(GS, 'tools'); CLAUDE_TOOLS = r'C:\20260909\tools'
NPM = subprocess.run('npm root -g', shell=True, capture_output=True, text=True).stdout.strip()
CODEX = [shutil.which('node'), os.path.join(NPM, '@openai', 'codex', 'bin', 'codex.js')]
NOTE = {
    '공통수학1': '공통수학1 = STAGE 1 (2022 개정). 표지와 문항 구성을 보고 RANGE 를 `과정.py` 공통수학1 단원 이름 차례로. 본풀이는 공통수학1 안에서만, 위 단계 도구는 [별해].',
    '공통수학2': '공통수학2 = STAGE 2 (2022 개정). RANGE 를 `과정.py` 공통수학2 단원 이름 차례로. 본풀이는 그 안에서만, 원 문항은 기하로.',
    '수학Ⅰ': '수학Ⅰ = STAGE 3 (2015 개정). RANGE 를 `과정.py` 수학Ⅰ 단원 이름 차례로. 본풀이는 수학Ⅰ 안에서만, 미적분 도구는 [별해].',
    '수학Ⅱ': '수학Ⅱ = STAGE 4 (2015 개정). RANGE 를 `과정.py` 수학Ⅱ 단원 이름 차례로. 다항함수 미분·적분 [별해] ⑤를 빠뜨리지 말 것.',
    '기하': '기하 (2022 개정 2학년). RANGE 를 `과정.py` 기하 단원 이름 차례로.',
}
STYLE = '''

## 해설 문체 — 예시를 따른다 (2026-10-18 대표 지시)
`scratch\\{KEY}_style_1.py`, `scratch\\{KEY}_style_2.py` 는 이 작업 방식의 **기준 원고**(같은 과목, 다른 학교)다. 먼저 두 파일의 해설(sol)을 끝까지 읽고, **내용은 베끼지 말고 해설 쓰는 법만** 따라라.
1. 식을 쓰기 전에 그 식이 어디서 무엇에 의하여 나오는지 한 줄을 먼저 쓴다. 식만 연달아 놓지 않는다.
2. 다음 줄로 넘어갈 때 "즉, …이므로", "따라서", "이때" 처럼 이유를 잇는 말을 쓴다. 건너뛰는 계산이 없게 한다.
3. 곱셈은 TIMES(가운뎃점 ㆍ 금지). plan 은 짧게 — 「유형 · 정석 방법 · 정석」 꼴.
4. 학생에게 말하듯 친절하되 군더더기 없이 — 예시의 문장 길이와 줄 수를 기준으로.
5. 치환 문자는 우리 교재에서 쓰는 것(t, k, α, β 등). 원본에 없는 u, v 로 치환하지 마라.
'''
EXTRA = '''

## 이번 실행에서 더 지킬 것 (본 세션)
- 이 폴더는 `C:\\gpt_solve` 다. 위 틀의 `C:\20260909` 는 모두 `C:\\gpt_solve` 로 읽는다. 원본 경로는 위 「원본」 줄이 맞다.
- 그림은 `tools/그림도구_현재.md` 가 `그림도구.md` 보다 우선한다. `C:\\trans_gpt` 는 절대 건드리지 않는다.
- 다른 작업자들이 다른 시험지를 동시에 만들고 있다. 공용 도구·검사기·`queue.json` 은 고치지 말고 고칠 점은 보고에 적어라.
- **문제 그림은 다 그린 뒤 원본 그림과 나란히 놓고 대조한다**(2026-10-19 대표 지적 — 축 아래 점에서 내린 투영 점선을 빠뜨림). 점선(투영선·점근선·수준선·숨은 선, 축 아래·왼쪽 방향 포함)·●/○ 점·라벨·빗금이 원본과 같아야 끝이다. 원본에 없는 선은 넣지 않는다.
- **원본은 위 「원본」 경로의 파일 하나뿐이다.** 쪽보기.py 등 도구가 이름이 비슷한 다른 파일을 열 수 있으니, 먼저 연 PDF 표지의 학교·학년·과목·차수(1차/2차)가 시험지 이름과 맞는지 확인하고, 다르면 fitz 로 위 경로를 직접 열어라. (2026-10-18 효원고 중간·기말 파일을 헷갈린 일이 있었다.)
- **원본이 스캔이면 발문을 옮긴 뒤 원본과 한 문항씩 다시 대조하라** — 등차↔등비, 최댓값↔최솟값, 부등호·등호, 지수·첨자, 부호, 선지 값을 특히. (2026-10-18 등비수열을 등차수열로 옮겨 답이 틀린 일이 있었다.)
- **풀이 경로는 문체 예시가 아니라 `tools/정석경로/<과목>/<단원>.md` 로 정한다**(2026-10-20 대표 — 그래프로 풀 문제를 대수로 풀어 리젝). 그 과목 폴더가 없으면(2015 미적분·수학Ⅱ 등) 같은 내용의 2022 과목 폴더(미적분I·대수 등)와 해설규칙으로 정한다. 예시 원고는 말투만 참고하고 그 풀이 경로·「고유 k」 같은 표현은 따르지 마라(해설규칙이 바뀌었다). 굽기 전에 본 세션의 경로검사가 문항마다 의도 경로와 대조해 어긋나면 돌려보낸다.
- 매개변수에 따라 교점·근의 개수를 세는 문항은 `tools/견본/유리함수_교점개수_e954/` 꼴: 나누는 기준의 이유 한 줄 → 경우마다 범위의 개형 그림(특정 값 대입을 드러내지 않고 점근선은 문자로) + 그림에서 읽은 개수. 극한·사잇값을 말로 따지지 않는다.
- 마지막 메시지에는 「보고」 형식만 한국어로 쓴다.
'''
_style_cache = {}


def exemplars(subject):
    """클로드 시절 원고 중 같은 과목 2장(최근 연도) — 없으면 가까운 과목"""
    if subject in _style_cache: return _style_cache[subject]
    alias = {'수학I': '수학Ⅰ', '수학II': '수학Ⅱ'}
    subj = alias.get(subject, subject)
    c = json.load(open(os.path.join(CLAUDE_TOOLS, 'queue.json'), encoding='utf-8'))['items']
    for s in (subj, {'기하': '수학Ⅱ', '공통수학1': '수학(상)', '공통수학2': '수학(하)'}.get(subj, subj)):
        xs = [x for x in c if x.get('subject') == s and os.path.exists(os.path.join(CLAUDE_TOOLS, f"content_{x['key']}.py"))]
        if len(xs) >= 2: break
    xs = sorted(xs, key=lambda x: x.get('year', ''))[-2:]
    _style_cache[subject] = [os.path.join(CLAUDE_TOOLS, f"content_{x['key']}.py") for x in xs]
    return _style_cache[subject]


def put_style(key, subject):
    for i, f in enumerate(exemplars(subject), 1):
        shutil.copy(f, os.path.join(TOOLS, 'scratch', f'{key}_style_{i}.py'))


def queue_item(key):
    return {it['key']: it for it in json.load(open(os.path.join(TOOLS, 'queue.json'), encoding='utf-8'))['items']}[key]


def prompt_type(key):
    it = queue_item(key); name = it['outname']
    tmpl = open(os.path.join(TOOLS, '작업자지시.md'), encoding='utf-8-sig').read()
    p = re.search(r'```\n(.*?)\n```', tmpl, re.S).group(1)
    p = p.replace('{KEY}', key).replace('{NAME}', name).replace('{SUBJECT_NOTE}', NOTE.get(it['subject'], it['subject']))
    # 원본 줄: 틀이 원판 경로(C:\20260909)든 솔브부 경로(C:\gpt_solve, 10/20 고침)든 실제 src 로 — _원본제보 파일도 맞게
    for root in ('C:\\20260909', GS):
        p = p.replace(rf'{root}\{name}_파스칼.pdf', it['src'])
    p = p.replace('`C:\20260909` 은 원판이다', '`C:\\2026_0909` 원판').replace('C:\\20260909', GS).replace('`C:\\2026_0909` 원판', '`C:\20260909` 은 원판이다')
    put_style(key, it['subject'])
    return p + EXTRA + STYLE.replace('{KEY}', key)


def prompt_recheck(key):
    it = queue_item(key)
    return open(os.path.join(HERE, 'prompts', 'recheck.md'), encoding='utf-8').read().replace('{KEY}', key).replace('{SRC}', it['src'])


def prompt_vtype(key):
    it = queue_item(key)
    note = {'공통수학2': '공통수학2 = STAGE 2', '수학II': '수학Ⅱ = STAGE 4', '수학Ⅱ': '수학Ⅱ = STAGE 4', '대수': '대수 = STAGE 3',
            '수학I': '수학Ⅰ = STAGE 3', '수학Ⅰ': '수학Ⅰ = STAGE 3', '공통수학1': '공통수학1 = STAGE 1'}.get(it['subject'], it['subject'])
    p = open(os.path.join(HERE, 'prompts', 'typeset.md'), encoding='utf-8').read()
    p = p.replace('{KEY}', key).replace('{NAME}', it['outname']).replace('{SRC}', it['src']).replace('{SUBJECT_NOTE}', note + f" — 단원 {it.get('range', '')}. 본풀이는 이 과목 범위 안에서만.")
    import re as _re   # [10/21] 문항 수를 원본 md 의 '## N번' 개수로(6 고정 → 14문항 중 6개만 옮긴 사고)
    p = p.replace('{N}', str(len(_re.findall(r'(?m)^## \d+번', open(it['src'], encoding='utf-8').read())) or 6))
    put_style(key, it['subject'])
    return p + STYLE.replace('{KEY}', key)


def prompt_figfix(key):
    it = queue_item(key); note = FIXNOTE.get(key, '보고서 참고')
    return open(os.path.join(HERE, 'prompts', 'figfix.md'), encoding='utf-8').read().replace('{KEY}', key).replace('{SRC}', it['src']).replace('{NOTE}', note)


FIXNOTE = {}


def prompt_figaudit(key):
    it = queue_item(key)
    return open(os.path.join(HERE, 'prompts', 'figaudit.md'), encoding='utf-8').read().replace('{KEY}', key).replace('{SRC}', it['src'])


QONLY = '''

## 이번 실행은 업무 분담 — **해설은 쓰지 마라** (대표 2026-10-20: 해설 문장은 클로드가, 나머지는 코덱스가)
- 위 틀 가운데 **문제 쪽만** 한다: RANGE·발문(stem)·선지·정답(answer)·독립 검산(chk)·**문제 그림**(원본 대조까지).
- 모든 prob 의 `plan` 은 빈 문자열 `''`, `sol` 은 `['(해설 자리 — 클로드 작업자가 쓴다)']` 한 줄로 둔다. 해설 그림(@fig:s…)도 만들지 마라.
  `prob()` 함수 정의는 넘긴 인자를 **그대로** 저장하게 두고(자리표를 함수 안에 박지 마라 — 10/20 9장 모두 클로드가 함수를 고쳐야 했다), 자리표는 각 prob 호출의 `plan=''`, `sol=[...]` 인자로 넣는다.
- 발문 수식 안에 `text{…}` 를 쓰지 마라 — 한글에서 괄호가 깨진다. 한글 낱말은 `"는 자연수"` 처럼 따옴표로.
- 검사: `python 검사전부.py {KEY}` 에서 **표기·수식·그림·답검산·발문** 이 통과(발문은 스캔 위치 인식 오경보면 수동 대조로 갈음)하면 된다. `검사`·`범위`·`검산` 은 해설이 비어 있어 걸리는 것이 정상이니 고치지 마라.
- 보고에는 문항 수, 문제 그림 수, 원본 결함(있으면 표), 수동 대조 결과만.
'''
FINISH = '''너는 솔브부 마무리 작업자다(코덱스). 열쇠 {KEY}. 작업 폴더 `C:\\\\gpt_solve\\\\tools`. **한글 파일을 열거나 굽는 것(굽기.py)은 금지** — 단 그림 도구가 수식 라벨을 재려고 한글을 스스로 띄우는 것은 써도 된다(막지 마라, 10/20 e965 에서 이걸 막아 그림 3장이 빠졌다), `C:\\\\20260909` 금지, 공용 도구·queue.json·해설규칙 수정 금지.
`content_{KEY}.py` 의 plan·sol 은 **클로드 작업자가 쓴 해설**이다. 너는 **해설의 수학 내용·풀이 경로·문장을 바꾸지 마라.** 네 일은 셋뿐이다.
1. 해설 그림: sol 의 `@fig:이름` 마다 그림이 `figs_{KEY}/` 에 없으면, 원고 안의 `# 그림 지시:` 주석(또는 그 줄 앞뒤 문장)대로 `figures_{KEY}.py` 에 그려 렌더링한다(`그림도구_현재.md`). 해설규칙 「매개변수가 있으면 값에 따라 여러 장 그린다」의 개형·문자 점근선 기준을 지킨다.
2. 형식: `python 검사전부.py {KEY}` 에서 걸리는 **형식 문제**(수식 문법, 줄 길이, 끝줄 꼴, 금지어 철자, 그림 이름 오타 등)만 고친다. 고치는 김에 문장을 다시 쓰지 마라 — 꼭 바꿔야 할 단어만.
3. 발문(스캔 위치 인식 오경보)만 남고 나머지 일곱 가지 PASS 가 될 때까지. 수학 내용을 바꿔야만 통과되는 경우는 고치지 말고 보고에 「클로드에게 돌려보낼 것」으로 적어라.
마지막에 고친 것 목록과 검사 결과를 짧게.
'''


def prompt_qonly(key):
    return prompt_type(key) + QONLY.replace('{KEY}', key)


def prompt_vqonly(key):
    # [10/21] 변형 원고 분담 — 코덱스는 변형 문제 쪽(발문·선지·정답·chk·문제 그림)만, 해설은 클로드
    return prompt_vtype(key) + QONLY.replace('{KEY}', key).replace('(원본 대조까지)', '(변형원본 md 의 문제 그대로)')


def prompt_finish(key):
    return FINISH.replace('{KEY}', key)


def run(kind, key, log):
    p = {'type': prompt_type, 'recheck': prompt_recheck, 'vtype': prompt_vtype, 'figfix': prompt_figfix, 'figaudit': prompt_figaudit,
         'qonly': prompt_qonly, 'vqonly': prompt_vqonly, 'finish': prompt_finish}[kind](key)
    t = time.time()
    try:
        r = subprocess.run(CODEX + ['exec', '--skip-git-repo-check', '-c', 'notify=[]', '-c', 'mcp_servers={}', '--sandbox', 'workspace-write',
                            '-C', TOOLS, '-o', os.path.join(log, f'{key}_{kind}_report.md'), p],
                           capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=4 * 3600)
        out = (r.stdout or '') + (r.stderr or ''); rc = r.returncode
    except subprocess.TimeoutExpired:
        out, rc = 'TIMEOUT', -9
    open(os.path.join(log, f'{key}_{kind}.log'), 'w', encoding='utf-8').write(out)
    m = re.search(r'tokens used\s*\n\s*([\d,]+)', out)
    busy = 'at capacity' in out
    return rc, (m.group(1) if m else '?'), (time.time() - t) / 60, busy


def expand(s):
    out = []
    for part in (s or '').split(','):
        part = part.strip()
        if not part: continue
        m = re.fullmatch(r'e(\d+)-e(\d+)', part)
        out += [f'e{i:03d}' for i in range(int(m.group(1)), int(m.group(2)) + 1)] if m else [part]
    return out


START = __import__('datetime').datetime.now()


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--type'); ap.add_argument('--recheck'); ap.add_argument('--vtype'); ap.add_argument('--figfix'); ap.add_argument('--figaudit'); ap.add_argument('--qonly'); ap.add_argument('--vqonly'); ap.add_argument('--finish'); ap.add_argument('--fixnote', default='{}')
    ap.add_argument('--log', required=True); ap.add_argument('--par', type=int, default=20); a = ap.parse_args()
    os.makedirs(a.log, exist_ok=True)
    jobs = Q.Queue()
    for k in expand(a.recheck): jobs.put(('recheck', k, 0))
    for k in expand(a.vtype): jobs.put(('vtype', k, 0))
    for k in expand(a.type): jobs.put(('type', k, 0))
    FIXNOTE.update(json.loads(a.fixnote))
    for k in expand(a.figfix): jobs.put(('figfix', k, 0))
    for k in expand(a.figaudit): jobs.put(('figaudit', k, 0))
    for k in expand(a.qonly): jobs.put(('qonly', k, 0))
    for k in expand(a.vqonly): jobs.put(('vqonly', k, 0))
    for k in expand(a.finish): jobs.put(('finish', k, 0))
    lock = threading.Lock(); pending = [jobs.qsize()]

    def worker():
        while True:
            try: kind, key, tries = jobs.get(timeout=5)
            except Q.Empty:
                with lock:
                    if pending[0] == 0: return
                continue
            rc, tok, mins, busy = run(kind, key, a.log)
            with lock:
                print(f'{time.strftime("%H:%M")} {kind:7} {key} rc{rc} {tok}토큰 {mins:.0f}분{" (서버 혼잡)" if busy else ""}', flush=True)
                if (rc != 0 or busy) and tries < 2:
                    jobs.put((kind, key, tries + 1)); pending[0] += 1
                elif kind in ('type', 'qonly') and rc == 0:
                    jobs.put(('recheck', key, 0)); pending[0] += 1
                pending[0] -= 1
    ts = [threading.Thread(target=worker, daemon=True) for _ in range(a.par)]
    for t in ts: t.start()
    for t in ts: t.join()
    print('전체 끝', time.strftime('%H:%M'))
    # [10/18] 그림 도구의 수식 측정이 한글(-Automation)을 띄우고 시간 초과 때 안 닫아 51개가 쌓였다 → 이 실행 동안 뜬 것만 정리
    ps = (f"$t=[datetime]'{START.strftime('%Y-%m-%d %H:%M:%S')}'; "
          "$p=Get-CimInstance Win32_Process -Filter \"Name='Hwp.exe'\" | Where-Object { $_.CommandLine -like '*-Automation*' -and $_.CreationDate -ge $t }; "
          "$p | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; ($p | Measure-Object).Count")
    r = subprocess.run(['powershell', '-NoProfile', '-Command', ps], capture_output=True, text=True)
    print('남은 자동 한글 정리:', (r.stdout or '').strip(), '개')


if __name__ == '__main__': main()
