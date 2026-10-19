# -*- coding: utf-8 -*-
"""변형 문제 파이프라인 (2026-10-18) — 본 세션(Claude)이 총괄, 일은 codex exec 작업자가 한다.

  python scripts/variant_pipeline/run.py <작업폴더> <원본.md> --easy 2 --keep 2 --hard 2

① 분석(1명): 원본 풀이·핵심 난관·흔한 오답 → 칸마다 변형 방향 배정(plan.json)
② 생성(칸마다 1명, 동시): 변형 + Python 검산 → <칸>.json
③ 독립 풀이(칸마다 1명): 문제만 보고 다시 풀기 → 답 대조·결함
④ 난이도 판정(칸마다 1명): 원본과 변형을 둘 다 풀고 쉬움/유지/어려움 판정 → 요청과 다르면 이유를 붙여 ②부터 다시(최대 2번)
⑤ 변형끼리 답 겹침 검사 → report.md
원본.md 는 '## 문제' / '## 정답' / '## 풀이 메모' 꼴.
"""
import os, re, sys, json, time, shutil, argparse, subprocess, threading
from concurrent.futures import ThreadPoolExecutor
try: sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
except Exception: pass
HERE = os.path.dirname(os.path.abspath(__file__))
NPM = subprocess.run('npm root -g', shell=True, capture_output=True, text=True).stdout.strip()
CODEX = [shutil.which('node'), os.path.join(NPM, '@openai', 'codex', 'bin', 'codex.js')]
MODEL = 'gpt-6.1-sol'
LOCK = threading.Lock(); TOK = [0]


def prompt(name, **kw):
    t = open(os.path.join(HERE, 'prompts', name + '.md'), encoding='utf-8').read()
    for k, v in kw.items(): t = t.replace('{' + k + '}', str(v))
    return t


def codex(D, text, tag, effort='high'):
    t = time.time()
    r = subprocess.run(CODEX + ['exec', '--skip-git-repo-check', '-m', MODEL, '-c', f'model_reasoning_effort={effort}', '-c', 'notify=[]',
                        '-c', 'mcp_servers={}', '--sandbox', 'workspace-write', '-C', D, text],
                       capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=3600)
    out = (r.stdout or '') + (r.stderr or '')
    open(os.path.join(D, 'logs', f'{tag}.log'), 'w', encoding='utf-8').write(out)
    m = re.search(r'tokens used\s*\n\s*([\d,]+)', out); n = int(m.group(1).replace(',', '')) if m else 0
    with LOCK: TOK[0] += n
    print(f'  {time.strftime("%H:%M")} {tag} rc{r.returncode} {n:,}토큰 {time.time() - t:.0f}초', flush=True)


def load(path):
    try: return json.loads(open(path, 'rb').read().decode('utf-8-sig'))
    except Exception: return None


def norm(ans):
    """답 비교용 — 동그라미 번호·공백·'번' 제거 후 값 부분만"""
    s = str(ans or '')
    s = re.sub(r'[①②③④⑤]', '', s).replace(' ', '').replace('번', '')
    nums = re.findall(r'-?\d+(?:/\d+)?(?:\.\d+)?', s)
    return nums[-1] if nums else s


def same_value(a, b):
    """두 답이 같은 값인가 — sympy 로 값 비교, 못 읽으면 숫자 부분 비교. 판단 불가면 None"""
    def val(s):
        s = re.sub(r'[①②③④⑤]', '', str(s or '')).replace('번', '').strip()
        s = s.replace('√', 'sqrt').replace('π', 'pi').replace('×', '*').replace('−', '-').replace('^', '**')
        s = re.sub(r'sqrt(\d+)', r'sqrt(\1)', s)
        s = re.sub(r'(\d|\))\s*(sqrt|pi|\()', r'\1*\2', s)   # 3√2 → 3*sqrt(2), 2π → 2*pi
        try:
            import sympy
            return float(sympy.sympify(s))
        except Exception:
            return None
    x, y = val(a), val(b)
    if x is not None and y is not None: return abs(x - y) < 1e-9
    return norm(a) == norm(b)


def slot_pipeline(D, slot, level, maxtry=3):
    # 사람(대표·본 세션) 반려 이유가 feedback.json {칸: "이유"} 에 있으면 첫 시도부터 넘긴다
    fbf = load(os.path.join(D, 'feedback.json')) or {}
    hist = [f'[사람 검토] {fbf[slot]}'] if fbf.get(slot) else []
    for attempt in range(1, maxtry + 1):
        fb = ''
        if hist:
            fb = '\n## 이전 시도가 반려된 이유 (반드시 고쳐라)\n' + '\n'.join(f'- {h}' for h in hist[-2:]) + '\n'
        for f in (f'{slot}.json', f'{slot}_solve.json', f'{slot}_judge.json'):
            p = os.path.join(D, f)
            if os.path.exists(p): os.replace(p, p.replace('.json', f'.try{attempt - 1}.json'))
        codex(D, prompt('generate', SLOT=slot, LEVEL=level, FEEDBACK=fb), f'{slot}_gen{attempt}')
        g = load(os.path.join(D, f'{slot}.json'))
        if not g or not g.get('problem'):
            hist.append('출력 JSON 이 없거나 problem 이 비어 있음'); continue
        open(os.path.join(D, f'{slot}_problem.txt'), 'w', encoding='utf-8').write(g['problem'])
        with ThreadPoolExecutor(2) as ex:
            list(ex.map(lambda a: codex(D, prompt(a[0], SLOT=slot), f'{slot}_{a[0]}{attempt}', a[1]), [('solve', 'high'), ('judge', 'high')]))
        s = load(os.path.join(D, f'{slot}_solve.json')) or {}; j = load(os.path.join(D, f'{slot}_judge.json')) or {}
        problems = []
        if same_value(s.get('answer_value') or s.get('answer'), g.get('answer_value') or g.get('answer')) is False:
            problems.append(f"독립 풀이 답 {s.get('answer')} ≠ 출제 답 {g.get('answer')} (독립 풀이 요지: {str(s.get('method'))[:300]})")
        if s.get('defects'): problems.append('독립 풀이가 찾은 결함: ' + ' / '.join(map(str, s['defects']))[:600])
        if j.get('verdict') != level:
            problems.append(f"난이도 판정 '{j.get('verdict')}' (요청 '{level}'): {j.get('reason')} / 쉬워진 점: {j.get('made_easier')}")
        if j.get('forced'): problems.append('억지스러운 덧붙임: ' + str(j['forced'])[:300])
        if j.get('exam_like') is False: problems.append('시험 문제답지 않음: ' + str(j.get('exam_like_reason'))[:300])
        if re.search(r'[a-zA-Zα-ω]', str(g.get('answer_value') or '').replace('sqrt', '').replace('pi', '')):
            problems.append(f"답이 수 하나가 아님: {g.get('answer_value')}")
        if j.get('wording'): problems.append('표현 문제(교과서 용어·기호로 고칠 것): ' + ' / '.join(map(str, j['wording']))[:400])
        g.update(attempt=attempt, solve=s, judge=j, problems=problems)
        json.dump(g, open(os.path.join(D, f'{slot}.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        if not problems: return slot, 'PASS', attempt, g
        hist.append(' | '.join(problems))
    return slot, 'FAIL', maxtry, g if 'g' in dir() else {}


REAL_ERRORS = 'C:/selfmade/오답조사/real_errors.json'


def write_real_errors(D, unit, src, no):
    """실측 오답 자료를 작업 폴더에 real_errors.md 로. 자료가 없으면 '없음'이라고 적는다(분석 담당이 추정임을 밝히게)."""
    R = load(REAL_ERRORS) or {}
    out = ['# 실제 학생 오답 (서울 학생 시험지 스캔 조사, 10/19)', '']
    q = (R.get('by_question') or {}).get(f'{src}#{no}') if src and no else None
    if q:
        out.append(f'## 이 원본 문항에서 실제로 틀린 학생 {len(q)}명')
        for x in q: out.append(f"- 원인: {x.get('cause')} / 학생 답 {x.get('student_answer')} (정답 {x.get('correct')}) / 흔적: {x.get('work')} / 어긋난 곳: {x.get('diverge')}")
        out.append('')
    cs = (R.get('by_unit') or {}).get(unit.replace(' ', '')) if unit else None
    if cs:
        out.append(f'## 같은 단원({unit})에서 실제로 반복된 오답 원인 — 많은 순, 시험지 수 = 근거 학생 수')
        for x in cs[:15]: out.append(f"- **{x['name']}** (시험지 {x['exams']}장·{x['cases']}건) — {x.get('what')} / 함정이 작동하는 조건: {x.get('trigger')}")
    if not q and not cs: out.append('(이 문항·단원의 실측 자료 없음 — 흔한 오답은 추정이라고 표시할 것)')
    open(os.path.join(D, 'real_errors.md'), 'w', encoding='utf-8').write('\n'.join(out))


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('dir'); ap.add_argument('original')
    ap.add_argument('--easy', type=int, default=2); ap.add_argument('--keep', type=int, default=2); ap.add_argument('--hard', type=int, default=2); ap.add_argument('--only')
    # [10/19] 학생 스캔 실측 오답(서울 1,022장) — 단원·원본 출처를 주면 real_errors.md 로 넘겨 '흔한 오답'을 상상 대신 실측에서 고르게
    ap.add_argument('--unit', default=''); ap.add_argument('--src', default='', help='원본 source_db_id'); ap.add_argument('--no', default='', help='원본 문항 번호')
    a = ap.parse_args(); D = os.path.abspath(a.dir); os.makedirs(os.path.join(D, 'logs'), exist_ok=True)
    shutil.copy(a.original, os.path.join(D, 'original.md'))
    shutil.copy(os.path.join(HERE, 'menu.md'), os.path.join(D, 'menu.md'))
    write_real_errors(D, a.unit, a.src, a.no)
    orig = open(a.original, encoding='utf-8').read()
    prob = re.search(r'## 문제\s*\n(.*?)(?=\n## )', orig, re.S).group(1).strip()
    open(os.path.join(D, 'original_problem.txt'), 'w', encoding='utf-8').write(prob)
    t0 = time.time()
    if not load(os.path.join(D, 'plan.json')):
        codex(D, prompt('analyze', EASY=a.easy, KEEP=a.keep, HARD=a.hard), 'analyze')
    plan = load(os.path.join(D, 'plan.json'))
    slots = [(s['id'], s['level']) for s in plan['slots']]
    if a.only:   # 지적받은 칸만 다시(10/18) — 나머지 칸은 기존 결과를 보고서에 그대로
        keep = [s for s in slots if s[0] not in a.only.split(',')]; slots = [s for s in slots if s[0] in a.only.split(',')]
    print('배정:', [(s['id'], s['level'], s['direction']) for s in plan['slots']])
    with ThreadPoolExecutor(len(slots)) as ex:
        res = list(ex.map(lambda x: slot_pipeline(D, *x), slots))
    if a.only:
        for sid, lv in keep:
            g = load(os.path.join(D, f'{sid}.json')) or {}
            res.append((sid, 'PASS(이전)', g.get('attempt'), g))
    answers = {}
    for slot, st, att, g in res: answers.setdefault(norm(g.get('answer')), []).append(slot)
    dup = {k: v for k, v in answers.items() if len(v) > 1}
    lines = [f'# 변형 결과 — {os.path.basename(D)}', f'원본 답 확인: {plan.get("answer_check")}', '',
             '| 칸 | 요청 | 방향 | 결과 | 시도 | 답 | 판정 |', '|---|---|---|---|---|---|---|']
    for slot, st, att, g in res:
        lines.append(f"| {slot} | {g.get('level')} | {g.get('direction')} | {st} | {att} | {g.get('answer')} | {(g.get('judge') or {}).get('verdict')} |")
    lines += ['', f'변형끼리 같은 답: {dup or "없음"}', f'코덱스 {TOK[0]:,} 토큰 · {(time.time() - t0) / 60:.0f}분']
    open(os.path.join(D, 'report.md'), 'w', encoding='utf-8').write('\n'.join(lines))
    print('\n'.join(lines))


if __name__ == '__main__': main()
