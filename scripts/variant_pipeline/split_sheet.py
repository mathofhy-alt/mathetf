# -*- coding: utf-8 -*-
"""변형 시험지 한 장을 문항 조각으로 나눠 동시에 만들고 합쳐 굽기 (2026-10-21 대표: "멈추고 14명한테 시켜")

  python scripts/variant_pipeline/split_sheet.py e974,e975 [--par 28]

열쇠마다(queue.json 의 src = 변형원본 md, '## N번' 절):
  ① 코덱스 N명 동시 — 문항 하나씩 _parts/<열쇠>/qNN.py (prob 호출 하나, 해설 자리표) + 문제 그림 fig_qNN.py(def draw(out))
  ② 클로드 N명 동시 — 문항 하나씩 _parts/<열쇠>/sol_qNN.py (PLAN_NN·SOL_NN, '# 그림 지시:' 주석)
  ③ 합치기 — content_<열쇠>.py · figures_<열쇠>.py (조각 그림을 figs_<열쇠> 로 렌더)
  ④ solve_finish.py <열쇠> (코덱스 마무리 → 경로검사 → 굽기, 한글은 한 번에 하나)
"""
import argparse, glob, importlib.util, json, os, re, shutil, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
HERE = Path(__file__).resolve().parent; ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))
import gs_all as G   # noqa: E402

TOOLS = Path(G.TOOLS)
SYSPY = r'C:\Users\matho\AppData\Local\Programs\Python\Python311\python.exe'
VPY = str(ROOT / '.venv' / 'Scripts' / 'python.exe')
ENV = dict(os.environ, PATH=os.path.dirname(SYSPY) + os.pathsep + os.environ.get('PATH', ''), PYTHONUTF8='1')
PLACE = "['(해설 자리 — 클로드 작업자가 쓴다)']"

PROB_DEF = '''P = []


def prob(no, stem, choices=None, answer=None, sol=None, box=None, fig=None,
         stem_tail=None, choice_lines=1, box2=None, chk=None, calc=None,
         stem_tail2=None, plan=''):
    P.append(dict(no=no, stem=stem, choices=choices, answer=answer,
                  sol=sol,
                  box=box, fig=fig, stem_tail=stem_tail, box2=box2,
                  choice_lines=choice_lines, chk=chk, calc=calc,
                  stem_tail2=stem_tail2, plan=plan))
'''

CODEX_HEAD = '''너는 수학 시험지 원고 직원이다(코덱스). 작업 폴더 `C:\\gpt_solve\\tools`. 원본은 이미 검산이 끝난 변형 문제 파일 `{SRC}` 이다(원본 PDF 없음).
**읽을 것은 둘뿐이다**: `_parts/문제쪽_요약.md`(원고 형식·발문 줄바꿈·수식 문법·그림 형식·금지 사항), 그리고 문제 그림이 필요할 때만 `그림도구_현재.md`.
다른 규칙 문서(한시험지.md 전체·해설규칙.md·과정.py 등)는 읽지 마라 — 요약에 다 있다. 막히는 표기가 있으면 한시험지.md 에서 그 낱말만 grep 해 그 줄만 본다.
표기 견본이 필요하면 `content_e974.py` 의 prob 호출 하나만 열어 본다.
**표기(10/21 시험에서 빠뜨린 것)**: 수식 안 문자마다 앞에 `it` — `$it f( it x)$`, `$it g( it x)$`, `$2 left | it x right |$` 처럼 요약의 견본 그대로 쓴다(`it f(x)` 처럼 줄이지 마라). **문제 그림은 원본 md 의 그 문항 「### 그림」이 「넣음」일 때만** 그린다. 「넣지 않음」이면 fig 를 절대 넣지 마라 — 곡선·함수가 나와도 마찬가지(대표 10/21: 개형을 유추하는 게 핵심인 문항에 그래프를 넣어 답을 알려 준 사고).
공용 도구·검사기·queue.json·다른 직원의 조각은 읽기만. 한글(HWP) 열기·굽기 금지. 임시 파일은 `scratch\\{KEY}_*`, 다 쓰면 지운다.
'''

CODEX_PART = '''

## 이번 실행은 「문항 조각」 — **{NO}번 한 문항만** (대표 10/21: 문항마다 직원 한 명씩 동시에)
- `_parts/문제쪽_요약.md` 의 원고 형식·표기 규칙을 따르되, **{SRC} 의 「## {NO}번」 한 문항만** 만든다.
- 만들 파일은 둘(또는 하나)뿐이다. `content_{KEY}.py`·`figures_{KEY}.py`·`queue.json`·다른 조각은 **만들지도 고치지도 마라**.
  1. `_parts/{KEY}/q{NN}.py` — `prob({NO}, ...)` 호출 **하나만**. `plan=''`, `sol={PLACE}` 로 둔다(해설은 클로드가 쓴다).
     `chk=` 는 그 문자열만으로 실행되는 자기완결 코드(HEAD 같은 바깥 변수 쓰지 마라)로, 끝에 `answer = '②'`(객관식) 또는 값(단답)을 남긴다.
     그림이 있으면 `fig='@fig:q{NN}'` 처럼 이름은 **q{NN}** 하나(문항마다 다른 이름 — 합칠 때 겹치지 않게).
  2. (문제 그림이 필요할 때만) `_parts/{KEY}/fig_q{NN}.py` — `import figures as F` 를 쓰고 `def draw(out):` 안에서 `F.save_scene(scene, 'q{NN}', out=out)` 로 그린다(모듈을 불러올 때 그리면 안 된다).
- 확인(이것만): `python -X utf8 _parts/check_part.py {KEY} {NN}` — 조각이 읽히는지, chk 답이 정답과 같은지, 그림이 그려지는지 본다. 걸리면 고친다. `검사전부.py`·`굽기.py`·한글 열기 금지(합친 뒤 마무리 직원이 한다).
- 문제 문장·수치·선지·정답은 {SRC} 그대로(표기만 원고 규칙대로).
- 끝나면 「완료 {NO}번 그림 N장」 한 줄.
'''

CLAUDE_PART = '''너는 수학 해설 작성 직원이다. 열쇠 {KEY} 의 **{NO}번 한 문항의 해설만** 쓴다(다른 문항은 다른 직원들이 동시에 쓴다).

읽을 것: `C:\\gpt_solve\\tools\\해설규칙.md`(처음부터 「풀이 방침 — 유형별」 절 끝까지), `C:\\gpt_solve\\tools\\정석경로\\미적분I\\` 에서 이 문항 단원 파일, 견본 `C:\\gpt_solve\\tools\\견본\\유리함수_교점개수_e954\\content_e954.py` 의 sol 모양, 그리고 문항 조각 `C:\\gpt_solve\\tools\\_parts\\{KEY}\\q{NN}.py`(문제·정답·chk). 정답은 조각의 answer 가 확정본이다.
`{SRC}` 의 「## {NO}번」 아래 「풀이 요지(검산용)」는 정답 확인 메모일 뿐 정석 보장이 없다 — 해설은 출제 의도 경로로 새로 쓴다.

쓸 파일은 `C:\\gpt_solve\\tools\\_parts\\{KEY}\\sol_q{NN}.py` 하나:
```
# 그림 지시: s{NN}a — 무엇을 어떤 범위로, 표시할 점·점근선·라벨(문자로)   ← 해설 그림이 있을 때만, 그림마다 한 줄
PLAN_{NN} = '유형 · 정석 방법 · 까닭'
SOL_{NN} = [
    '…',               # 원고 sol 줄 문법(@center, @fig:s{NN}a, $…$ 한글 수식 표기 it x, {a} over {b}, sqrt {…}) — q{NN}.py 의 stem 표기를 따라라
    '따라서 정답은 ~이다.',
]
```
해설 그림 이름은 s{NN}a, s{NN}b … (문항마다 달라야 한다). 그림을 그리거나 렌더하지 마라(마무리 직원이 그림 지시대로 그린다). 다른 파일·한글·굽기 금지.
확인: `python -X utf8 C:\\gpt_solve\\tools\\_parts\\check_part.py {KEY} {NN} --sol` 이 통과해야 끝(파일이 읽히고 SOL 이 문자열 목록이며 마지막 줄이 정답 문장인지).
끝나면 「완료 {NO}번 · 방법 한 줄」만 답하라.'''

SFIG_PART = '''너는 수학 시험지 그림 직원이다(코덱스). 작업 폴더 `C:\\gpt_solve\\tools`. 열쇠 {KEY} 의 **{NO}번 해설 그림만** 그린다(다른 문항은 다른 직원이 동시에 그린다).
읽을 것: `그림도구_현재.md`, `해설규칙.md` 의 「### 그림」 절과 매개변수 여러 장 관련 절(grep 으로 그 절만), `content_{KEY}.py` 의 `# ── {NO}번 ──` 부분(그림 지시 주석·SOL_{NN} 의 @fig 줄·문제).
만들 파일은 `_parts/{KEY}/sfig_q{NN}.py` 하나: `import figures as F`, `def draw(out):` 안에서 SOL_{NN} 의 `@fig:` 이름(s{NN}a…)마다 `F.save_scene(scene, '이름', out=out)`. 모듈을 불러올 때 그리면 안 된다.
그림은 `# 그림 지시:` 와 해설 문장에 정확히 맞게(식·점·점근선·라벨). **각 표시 호는 꼭짓점 가까이 반지름 3~5mm(`radius_mm=4`), 라벨은 그 각 안 호 바로 바깥. 축 물결(생략) 표시는 쓰지 마라**(대표 10/21). content·figures_{KEY}.py·다른 조각은 고치지 마라. 한글 열기·굽기 금지 — 단 그림 도구가 수식 라벨을 재려고 한글을 스스로 띄우는 것은 괜찮다.
확인: `python -X utf8 _parts/check_part.py {KEY} {NN} --sfig` (모든 @fig 이름이 그려졌는지). 끝나면 「완료 {NO}번 그림 N장」 한 줄.'''

CHECK_PART = r'''# -*- coding: utf-8 -*-
"""조각 확인: python -X utf8 _parts/check_part.py <열쇠> <NN> [--sol]"""
import sys, importlib.util, pathlib, traceback, tempfile
key, nn = sys.argv[1], sys.argv[2]; D = pathlib.Path(__file__).resolve().parent / key
P = []
def prob(no, stem, choices=None, answer=None, sol=None, box=None, fig=None, stem_tail=None, choice_lines=1, box2=None, chk=None, calc=None, stem_tail2=None, plan=''):
    P.append(dict(no=no, stem=stem, choices=choices, answer=answer, sol=sol, fig=fig, chk=chk, plan=plan))
if '--sfig' in sys.argv:
    import re as _re, json as _j
    root = pathlib.Path(__file__).resolve().parent.parent; sys.path.insert(0, str(root))
    txt = (root / f'content_{key}.py').read_text(encoding='utf-8'); a = txt.find(f'# ── {int(nn)}번 ──'); b = txt.find('# ── ', a + 5)
    want = sorted(set(_re.findall(r'@fig:(s\w+)', txt[a:b if b > 0 else None])))
    spec = importlib.util.spec_from_file_location('sf', D / f'sfig_q{nn}.py'); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    out = D / f'sfigs_q{nn}'; out.mkdir(exist_ok=True)
    for name, empty in (('sizes.json', '{}'), ('assets.json', '[]')):
        if not (out / name).exists(): (out / name).write_text(empty, encoding='utf-8')
    m.draw(out)
    got = set(_j.loads((out / 'sizes.json').read_text(encoding='utf-8')))
    miss = [w for w in want if w not in got]
    print('해설 그림', want, '| 빠짐', miss); sys.exit(1 if miss else 0)
if '--sol' in sys.argv:
    g = {}; exec((D / f'sol_q{nn}.py').read_text(encoding='utf-8'), g)
    sol, plan = g.get(f'SOL_{nn}'), g.get(f'PLAN_{nn}')
    assert isinstance(plan, str) and plan.strip(), 'PLAN 없음'
    assert isinstance(sol, list) and sol and all(isinstance(x, str) for x in sol), 'SOL 이 문자열 목록이 아님'
    assert '정답은' in sol[-1], '마지막 줄이 「따라서 정답은 ~이다.」 가 아님'
    print('통과 sol', nn, len(sol), '줄'); sys.exit(0)
g = {'prob': prob}; exec((D / f'q{nn}.py').read_text(encoding='utf-8'), g)
assert len(P) == 1, f'prob 호출이 {len(P)}개'
p = P[0]
if p['chk']:
    cg = {}; exec(p['chk'], cg)
    got = str(cg.get('answer')).strip(); want = str(p['answer']).strip()
    print('chk 답', got, '| 원고 답', want, '| 일치' if got.replace('$', '') in want.replace('$', '') or want.replace('$', '') in got.replace('$', '') else '| ⚠ 불일치')
f = D / f'fig_q{nn}.py'
if f.is_file():
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
    spec = importlib.util.spec_from_file_location('fq', f); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    out = D / f'figs_q{nn}'; out.mkdir(exist_ok=True)
    for name in ('sizes.json', 'assets.json'):
        if not (out / name).exists(): (out / name).write_text('{}' if name == 'sizes.json' else '[]', encoding='utf-8')
    m.draw(out); print('그림 렌더', sorted(x.name for x in out.iterdir())[:6])
print('통과', nn)
'''


SUMMARY_SECTIONS = ('## content_XX.py 형식', '## 수식 문법', '## figures_XX.py 형식', '## 수학Ⅱ(고2) 시험지에서 새로 부딪힌 것',
                    '## 하지 말 것', '## 하지 말아야 할 것', '## 공집합 기호', '## 수식 밖에 물결', '## 모식도도 위치 관계는')


def write_summary():
    """[10/21] 문항 조각 직원이 규칙 문서 140KB 를 통째로 읽던 것(직원당 ~9만 토큰) → 문제 쪽에 필요한 절만.
    원본(한시험지.md)에서 매번 뽑으므로 규칙이 바뀌면 따라간다."""
    t = (TOOLS / '한시험지.md').read_text(encoding='utf-8')
    heads = [m.start() for m in re.finditer(r'(?m)^## ', t)] + [len(t)]
    keep = [t[a:b].rstrip() for a, b in zip(heads, heads[1:]) if t[a:b].startswith(SUMMARY_SECTIONS)]
    out = ('# 문제 쪽 요약 — 한시험지.md 에서 문제 쪽(발문·선지·조건 상자·chk·문제 그림)에 필요한 절만 뽑았다(split_sheet.py 가 매번 새로 만든다)\n'
           '# 해설(plan·sol)은 클로드 직원이 따로 쓴다. 해설 규칙 문서는 읽을 필요 없다.\n\n' + '\n\n'.join(keep) + '\n')
    (TOOLS / '_parts' / '문제쪽_요약.md').write_text(out, encoding='utf-8')
    return len(out)


def say(log, *a):
    line = time.strftime('%H:%M ') + ' '.join(map(str, a)); print(line, flush=True)
    with open(log, 'a', encoding='utf-8') as f: f.write(line + '\n')


def claude_exe():
    for base in (os.path.expanduser(r'~\.antigravity-ide\extensions'), os.path.expanduser(r'~\.vscode\extensions')):
        c = sorted(glob.glob(os.path.join(base, 'anthropic.claude-code-*', 'resources', 'native-binary', 'claude.exe')))
        if c: return c[-1]
    return shutil.which('claude')


def numbers(src):
    return [int(x) for x in re.findall(r'(?m)^## (\d+)번', Path(src).read_text(encoding='utf-8'))]


def codex_part(key, no, log, logdir):
    it = G.queue_item(key); nn = f'{no:02d}'
    if (TOOLS / '_parts' / key / f'q{nn}.py').is_file(): return key, no, 'skip'
    p = CODEX_HEAD.replace('{KEY}', key).replace('{SRC}', it['src']) + CODEX_PART.replace('{NO}', str(no)).replace('{NN}', nn).replace('{KEY}', key).replace('{SRC}', it['src']).replace('{PLACE}', PLACE)
    t = time.time()
    r = subprocess.run(G.CODEX + ['exec', '--skip-git-repo-check', '-c', 'notify=[]', '-c', 'mcp_servers={}', '--sandbox', 'workspace-write',
                       '-C', str(TOOLS), '-o', os.path.join(logdir, f'{key}_q{nn}_report.md'), p],
                       capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=3600, stdin=subprocess.DEVNULL, env=ENV)
    open(os.path.join(logdir, f'{key}_q{nn}.log'), 'w', encoding='utf-8').write((r.stdout or '') + (r.stderr or ''))
    m = re.search(r'tokens used\s*\n\s*([\d,]+)', (r.stdout or '') + (r.stderr or ''))
    ok = (TOOLS / '_parts' / key / f'q{nn}.py').is_file()
    say(log, key, f'{no}번 문제 조각', '완료' if ok else f'실패 rc{r.returncode}', m[1] if m else '?', '토큰', f'{(time.time() - t) / 60:.0f}분')
    return key, no, 'ok' if ok else 'fail'


def claude_part(key, no, log, logdir):
    it = G.queue_item(key); nn = f'{no:02d}'
    if (TOOLS / '_parts' / key / f'sol_q{nn}.py').is_file(): return key, no, 'skip'
    p = CLAUDE_PART.replace('{NO}', str(no)).replace('{NN}', nn).replace('{KEY}', key).replace('{SRC}', it['src'])
    t = time.time()
    r = subprocess.run([claude_exe(), '-p', p, '--permission-mode', 'acceptEdits', '--add-dir', G.GS,
                        '--allowedTools', 'Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash(python:*)', 'Bash(python -X utf8:*)', '--output-format', 'json'],
                       cwd=str(TOOLS), env=ENV, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=3600, stdin=subprocess.DEVNULL)
    open(os.path.join(logdir, f'{key}_sol{nn}.claude.json'), 'w', encoding='utf-8').write((r.stdout or '') + (r.stderr or ''))
    ok = (TOOLS / '_parts' / key / f'sol_q{nn}.py').is_file()
    say(log, key, f'{no}번 해설 조각', '완료' if ok else f'실패 rc{r.returncode}', f'{(time.time() - t) / 60:.0f}분')
    return key, no, 'ok' if ok else 'fail'


def fig_mismatch(key, nos):
    """[10/21] 원본 md 「### 그림」(넣음/넣지 않음) ↔ 조각의 fig 유무 대조. 다르면 굽지 않는다."""
    it = G.queue_item(key); src = Path(it['src'])
    if not src.is_file(): src = Path(G.GS) / 'comp' / src.name
    t = src.read_text(encoding='utf-8') if src.is_file() else ''
    bad = []
    for no in nos:
        m = re.search(rf'(?ms)^## {no}번.*?^### 그림\s*\n(.*?)(?=^### |^## |\Z)', t)
        if not m: continue
        want = m.group(1).strip().startswith('넣음')
        q = (TOOLS / '_parts' / key / f'q{no:02d}.py').read_text(encoding='utf-8')
        got = bool(re.search(r"fig=['\"](?:@fig:)?q\d+", q))
        if want != got: bad.append(f"{no}번 원본 {'있음' if want else '없음'}·원고 {'있음' if got else '없음'}")
    return bad


def merge(key, nos, log):
    it = G.queue_item(key); D = TOOLS / '_parts' / key
    out = [f'# -*- coding: utf-8 -*-\n"""{it["outname"]} — 변형 문제 {len(nos)}문항.\n\n원본: {it["src"]}\n'
           f'분업 원고(10/21): 문항마다 코덱스 직원이 문제 쪽, 클로드 직원이 해설(plan·sol)을 따로 쓰고 split_sheet.py 가 합쳤다.\n원본 PDF 가 없어 발문대조는 해당 없음.\n"""\n',
           f"RANGE = {it.get('range', '')!r}\n", PROB_DEF, "\nHEAD = ''\n"]
    for no in nos:
        nn = f'{no:02d}'
        sol = (D / f'sol_q{nn}.py').read_text(encoding='utf-8') if (D / f'sol_q{nn}.py').is_file() else f"PLAN_{nn} = ''\nSOL_{nn} = {PLACE}\n"
        q = (D / f'q{nn}.py').read_text(encoding='utf-8')
        q = q.replace("plan=''", f'plan=PLAN_{nn}', 1).replace(PLACE, f'SOL_{nn}', 1)
        if f'SOL_{nn}' not in q: say(log, key, f'⚠ {no}번 조각에 해설 자리표가 없어 해설을 못 붙임')
        out += [f'\n# ── {no}번 ──\n', sol.rstrip() + '\n\n', q.rstrip() + '\n']
    (TOOLS / f'content_{key}.py').write_text(''.join(out), encoding='utf-8')
    figs = sorted(D.glob('fig_q*.py')) + sorted(D.glob('sfig_q*.py'))
    fm = [f'# -*- coding: utf-8 -*-\n"""{key} 그림 — 문항 조각(_parts/{key}/fig_qNN.py)의 draw(out)를 차례로 부른다(10/21 분업). 해설 그림은 아래에 덧붙인다."""\n',
          'import importlib.util\nfrom pathlib import Path\nimport figures as F\n\n',
          f"OUT = Path(__file__).resolve().parent / 'figs_{key}'\nPARTS = Path(__file__).resolve().parent / '_parts' / '{key}'\n\n\n",
          'def build_parts():\n    OUT.mkdir(exist_ok=True)\n    for f in sorted(PARTS.glob("fig_q*.py")) + sorted(PARTS.glob("sfig_q*.py")):\n'
          '        s = importlib.util.spec_from_file_location(f.stem, f); m = importlib.util.module_from_spec(s); s.loader.exec_module(m); m.draw(OUT)\n\n\n',
          'def build():\n    build_parts()\n\n\nif __name__ == "__main__":\n    build()\n']
    (TOOLS / f'figures_{key}.py').write_text(''.join(fm), encoding='utf-8')
    if figs:
        (TOOLS / f'figs_{key}').mkdir(exist_ok=True)
        for name, empty in (('sizes.json', '{}'), ('assets.json', '[]')):
            if not (TOOLS / f'figs_{key}' / name).exists(): (TOOLS / f'figs_{key}' / name).write_text(empty, encoding='utf-8')
        r = subprocess.run([SYSPY, '-X', 'utf8', f'figures_{key}.py'], cwd=str(TOOLS), env=ENV, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=1800)
        say(log, key, '문제 그림 렌더', 'rc', r.returncode, (r.stderr or '')[-200:])
    chk = subprocess.run([SYSPY, '-X', 'utf8', '답검산.py', key], cwd=str(TOOLS), env=ENV, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=1800)
    say(log, key, '합침', f'{len(nos)}문항', '| 답검산', ((chk.stdout or '').strip().splitlines() or [''])[-1][:160])


def sfig_part(key, no, log, logdir):
    nn = f'{no:02d}'; c = (TOOLS / f'content_{key}.py').read_text(encoding='utf-8')
    a = c.find(f'# ── {no}번 ──'); b = c.find('# ── ', a + 5)
    if '@fig:s' not in c[a:b if b > 0 else None]: return key, no, 'none'
    if (TOOLS / '_parts' / key / f'sfig_q{nn}.py').is_file(): return key, no, 'skip'
    p = SFIG_PART.replace('{NO}', str(no)).replace('{NN}', nn).replace('{KEY}', key)
    t = time.time()
    r = subprocess.run(G.CODEX + ['exec', '--skip-git-repo-check', '-c', 'notify=[]', '-c', 'mcp_servers={}', '--sandbox', 'workspace-write',
                       '-C', str(TOOLS), '-o', os.path.join(logdir, f'{key}_s{nn}_report.md'), p],
                       capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=3600, stdin=subprocess.DEVNULL, env=ENV)
    open(os.path.join(logdir, f'{key}_s{nn}.log'), 'w', encoding='utf-8').write((r.stdout or '') + (r.stderr or ''))
    m = re.search(r'tokens used\s*\n\s*([\d,]+)', (r.stdout or '') + (r.stderr or ''))
    ok = (TOOLS / '_parts' / key / f'sfig_q{nn}.py').is_file()
    say(log, key, f'{no}번 해설 그림', '완료' if ok else f'실패 rc{r.returncode}', m[1] if m else '?', '토큰', f'{(time.time() - t) / 60:.0f}분')
    return key, no, 'ok' if ok else 'fail'


def render_figs(key, log):
    r = subprocess.run([SYSPY, '-X', 'utf8', f'figures_{key}.py'], cwd=str(TOOLS), env=ENV, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=1800)
    say(log, key, '그림 다시 렌더(문제+해설 조각)', 'rc', r.returncode, (r.stderr or '')[-200:])


def finish(key, log):
    f = subprocess.run([VPY, '-X', 'utf8', str(ROOT / 'scripts' / 'hq' / 'solve_finish.py'), key], cwd=str(ROOT), env=ENV,
                       capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=5 * 3600, stdin=subprocess.DEVNULL)
    say(log, key, '마무리·경로검사·굽기', 'rc', f.returncode, ((f.stdout or '').strip().splitlines() or [''])[-1][:200])
    return f.returncode


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('keys'); ap.add_argument('--par', type=int, default=28); a = ap.parse_args()
    keys = a.keys.split(',')
    logdir = os.path.join(G.GS, '_watch_logs', time.strftime('%m%d_%H%M') + '_split'); os.makedirs(logdir, exist_ok=True); log = os.path.join(logdir, 'run.log')
    (TOOLS / '_parts').mkdir(exist_ok=True); (TOOLS / '_parts' / 'check_part.py').write_text(CHECK_PART, encoding='utf-8')
    say(log, '문제쪽 요약', write_summary(), '글자')
    jobs = []
    for k in keys:
        (TOOLS / '_parts' / k).mkdir(parents=True, exist_ok=True)
        jobs += [(k, n) for n in numbers(G.queue_item(k)['src'])]
    say(log, '문항 조각', len(jobs), '개 —', ', '.join(f'{k} {sum(1 for x in jobs if x[0] == k)}문항' for k in keys))
    with ThreadPoolExecutor(a.par) as ex: list(ex.map(lambda j: codex_part(j[0], j[1], log, logdir), jobs))
    with ThreadPoolExecutor(min(a.par, 14)) as ex: list(ex.map(lambda j: claude_part(j[0], j[1], log, logdir), jobs))
    stop = set()
    for k in keys:
        bad = fig_mismatch(k, [n for kk, n in jobs if kk == k])
        if bad: say(log, k, '⚠ 그림 유무가 원본과 다름 — 굽지 않음:', '; '.join(bad)); stop.add(k)
    keys = [k for k in keys if k not in stop]
    for k in keys: merge(k, [n for kk, n in jobs if kk == k], log)
    # [10/21] 해설 그림도 문항마다 한 명씩 동시에 → 마무리 직원은 형식만(그림이 다 있으면 그리지 않는다)
    with ThreadPoolExecutor(a.par) as ex: list(ex.map(lambda j: sfig_part(j[0], j[1], log, logdir), jobs))
    for k in keys: render_figs(k, log)
    with ThreadPoolExecutor(len(keys)) as ex: list(ex.map(lambda k: finish(k, log), keys))
    print('로그', logdir)


if __name__ == '__main__':
    main()
