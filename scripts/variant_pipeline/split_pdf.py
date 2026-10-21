# -*- coding: utf-8 -*-
"""PDF 시험지(모의고사·원본제보) → 문항 조각 분업 → 한글 → real → 트라이 (2026-10-21 대표: "원본제보 들어온 것이랑 같은 형식으로")

  python scripts/variant_pipeline/split_pdf.py <설정.json> [--par 30]

설정: [{"outname": "...", "subject": "공통수학2", "range": "...", "title": "...",
        "parts": [{"pdf": 원본.pdf, "hsj": 해설.pdf, "from": 1, "to": 30, "offset": 0}]}, ...]
  offset: 시트 번호 = 원본 번호 + offset (고3 46문항: 확통 1~30 → 0, 미적분 23~30 → +8, 기하 23~30 → +16)
흐름(장마다, 문항마다 동시): 코덱스가 쪽 그림을 보고 문제 쪽 조각(원본 그림 대조) → 클로드가 해설 조각 → 합치기 →
해설 그림 조각 → 마무리·경로검사·굽기(solve_finish) → real.py → 트라이 폴더.
"""
import argparse, json, os, re, shutil, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
HERE = Path(__file__).resolve().parent; ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))
import gs_all as G          # noqa: E402
import split_sheet as S     # noqa: E402

TOOLS = S.TOOLS; SRCROOT = Path(G.GS) / 'PDF원본'
REAL = Path(r'C:\20260909\comp\real'); REAL_TOOLS = r'C:\20260909\tools'; TRY = ROOT / 'try'

CODEX_PDF = '''너는 수학 시험지 원고 직원이다(코덱스). 작업 폴더 `C:\\gpt_solve\\tools`.
첨부 그림은 시험지 `{PDF}` 의 쪽이다. **원본 {ONO}번 한 문항만** 원고 조각으로 옮긴다(다른 문항은 다른 직원들이 동시에 한다). 이 시트에서의 번호는 **{NO}번**이다.
읽을 것은 `_parts/문제쪽_요약.md` 와, 문제 그림이 있을 때만 `그림도구_현재.md`. 다른 규칙 문서는 읽지 마라(요약에 있다). 표기 견본이 필요하면 `content_e974.py` 의 prob 하나만.
**표기**: 수식 안 문자마다 앞에 `it` — `$it f( it x)$` 처럼 요약 견본 그대로. 배점 표시 [2점]·[3점]·[4점] 은 발문 끝에 원본 그대로.
정답: 해설 PDF `{HSJ}` 에서 확인한다(`python -X utf8 -c "import fitz;d=fitz.open(r'{HSJ}');print(d[0].get_text())"` 처럼 글자 추출). 그 정답과 네 독립 검산(chk)이 같아야 한다.

만들 파일
1. `_parts/{KEY}/q{NN}.py` — `prob({NO}, ...)` 호출 **하나만**. `plan=''`, `sol={PLACE}`. 발문·선지·조건 상자는 원본 그대로(글자 하나 바꾸지 마라). `chk=` 는 자기완결 코드로 끝에 `answer = ...`.
2. **원본에 그림이 있을 때만** `_parts/{KEY}/fig_q{NN}.py` — `import figures as F`, `def draw(out):` 안에서 `F.save_scene(scene, 'q{NN}', out=out)`, 원고에는 `fig='@fig:q{NN}'`. 그림은 **첨부한 원본 그림과 대조**해 점·곡선·라벨·위치 관계·빗금이 같아야 한다(원본에 없는 그림은 절대 만들지 마라 — 대표 10/21).
확인: `python -X utf8 _parts/check_part.py {KEY} {NN}` 통과. content·figures·queue·다른 조각 수정 금지. 한글 열기·굽기 금지(그림 도구의 라벨 측정은 괜찮다).
끝나면 「완료 {NO}번(원본 {ONO}번) 그림 N장」 한 줄.'''

CLAUDE_PDF = '''너는 수학 해설 작성 직원이다. 열쇠 {KEY} 의 **{NO}번 한 문항의 해설만** 쓴다(다른 문항은 다른 직원들이 동시에 쓴다).
읽을 것: `C:\\gpt_solve\\tools\\해설규칙.md`(처음부터 「풀이 방침 — 유형별」 절 끝까지), `C:\\gpt_solve\\tools\\정석경로\\` 에서 이 문항 단원 파일, 견본 `C:\\gpt_solve\\tools\\견본\\유리함수_교점개수_e954\\content_e954.py` 의 sol 모양, 문항 조각 `C:\\gpt_solve\\tools\\_parts\\{KEY}\\q{NN}.py`(정답은 그 answer 가 확정본).
시험지 출판사 해설(`{HSJ}`)은 정석이라는 보장이 없다 — 보지 말고 출제 의도 경로로 새로 써라.

쓸 파일 `C:\\gpt_solve\\tools\\_parts\\{KEY}\\sol_q{NN}.py` 하나:
```
# 그림 지시: s{NN}a — 무엇을 어떤 범위로, 표시할 점·점근선·라벨(문자로)   ← 해설 그림이 있을 때만, 그림마다 한 줄
PLAN_{NN} = '유형 · 정석 방법 · 까닭'
SOL_{NN} = [
    '…',               # 원고 sol 줄 문법(@center, @fig:s{NN}a, $…$ 한글 수식 표기 it x, {a} over {b}, sqrt {…}) — q{NN}.py 의 stem 표기를 따라라
    '따라서 정답은 ~이다.',
]
```
해설 그림 이름은 s{NN}a, s{NN}b … 그림을 그리지 마라(그림 직원이 지시대로 그린다). 다른 파일·한글·굽기 금지.
확인: `python -X utf8 C:\\gpt_solve\\tools\\_parts\\check_part.py {KEY} {NN} --sol` 통과. 끝나면 「완료 {NO}번 · 방법 한 줄」만.'''


def pages_of(pdf):
    import fitz
    d = fitz.open(pdf); m = {}
    for i in range(d.page_count):
        for x in re.finditer(r'(?m)^\s*(\d{1,2})\.(?:\s|$)', d[i].get_text()): m.setdefault(int(x.group(1)), i + 1)
    return d.page_count, m


def render(pdf, out):
    import fitz
    out.mkdir(parents=True, exist_ok=True)
    d = fitz.open(pdf)
    for i in range(d.page_count):
        p = out / f'p{i + 1:02d}.png'
        if not p.exists(): d[i].get_pixmap(dpi=170).save(str(p))


def setup(cfg, log):
    """PDF 를 솔브부 폴더로 복사·쪽 그림·queue 열쇠. 문항 작업 목록을 돌려준다."""
    jobs = []; qp = TOOLS / 'queue.json'; q = json.load(open(qp, encoding='utf-8'))
    key = max(int(i['key'][1:]) for i in q['items'] if re.fullmatch(r'e\d+', i['key'])) + 1
    for sh in cfg:
        D = SRCROOT / sh['outname']; D.mkdir(parents=True, exist_ok=True)
        old = [i for i in q['items'] if i.get('outname') == sh['outname']]
        k = old[0]['key'] if old else f'e{key}'
        if not old: key += 1
        parts = []
        for pi, p in enumerate(sh['parts']):
            for f in ('pdf', 'hsj'):
                dst = D / Path(p[f]).name
                if not dst.exists(): shutil.copy(p[f], dst)
                p[f + '_local'] = str(dst)
            pdir = D / f'pages{pi}'; render(p['pdf_local'], pdir); n, pm = pages_of(p['pdf_local'])
            for o in range(p['from'], p['to'] + 1):
                pg = pm.get(o, 1)
                imgs = [pdir / f'p{pg:02d}.png'] + ([pdir / f'p{pg + 1:02d}.png'] if pg < n else [])
                jobs.append(dict(key=k, no=o + p['offset'], ono=o, pdf=p['pdf_local'], hsj=p['hsj_local'], imgs=[str(x) for x in imgs]))
            parts.append(p)
        q['items'] = [i for i in q['items'] if i['key'] != k]
        q['items'].append({'key': k, 'src': parts[0]['pdf_local'], 'status': '대기', 'outname': sh['outname'], 'region': '모의고사', 'school': sh.get('title', ''),
                           'year': '2026년', 'grade': '', 'term': '', 'exam': '전국연합', 'subject': sh['subject'],
                           'mod': f'content_{k}', 'figmodule': f'figures_{k}', 'figdir': f'figs_{k}', 'filler': f'filler_{k}.json',
                           'range': sh.get('range', ''), 'note': 'split_pdf 10/21 — 문항 조각 분업(코덱스 문제·클로드 해설)'})
        (TOOLS / '_parts' / k).mkdir(parents=True, exist_ok=True)
        S.say(log, k, sh['outname'], f"{sum(1 for j in jobs if j['key'] == k)}문항")
    json.dump(q, open(qp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return jobs


def codex_part(j, log, logdir):
    k, no = j['key'], j['no']; nn = f'{no:02d}'
    if (TOOLS / '_parts' / k / f'q{nn}.py').is_file(): return
    p = (CODEX_PDF.replace('{NO}', str(no)).replace('{ONO}', str(j['ono'])).replace('{NN}', nn).replace('{KEY}', k)
         .replace('{PDF}', j['pdf']).replace('{HSJ}', j['hsj']).replace('{PLACE}', S.PLACE))
    t = time.time()
    r = subprocess.run(G.CODEX + ['exec', '--skip-git-repo-check', '-c', 'notify=[]', '-c', 'mcp_servers={}', '--sandbox', 'workspace-write',
                       '-C', str(TOOLS), '-o', os.path.join(logdir, f'{k}_q{nn}_report.md'), p] + sum([['-i', x] for x in j['imgs']], []),
                       capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=3600, stdin=subprocess.DEVNULL, env=S.ENV)
    out = (r.stdout or '') + (r.stderr or ''); open(os.path.join(logdir, f'{k}_q{nn}.log'), 'w', encoding='utf-8').write(out)
    m = re.search(r'tokens used\s*\n\s*([\d,]+)', out)
    ok = (TOOLS / '_parts' / k / f'q{nn}.py').is_file()
    S.say(log, k, f'{no}번 문제 조각', '완료' if ok else f'실패 rc{r.returncode}', m[1] if m else '?', '토큰', f'{(time.time() - t) / 60:.0f}분')


def claude_part(j, log, logdir):
    k, no = j['key'], j['no']; nn = f'{no:02d}'
    if (TOOLS / '_parts' / k / f'sol_q{nn}.py').is_file() or not (TOOLS / '_parts' / k / f'q{nn}.py').is_file(): return
    p = CLAUDE_PDF.replace('{NO}', str(no)).replace('{NN}', nn).replace('{KEY}', k).replace('{HSJ}', j['hsj'])
    t = time.time()
    r = subprocess.run([S.claude_exe(), '-p', p, '--permission-mode', 'acceptEdits', '--add-dir', G.GS,
                        '--allowedTools', 'Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash(python:*)', 'Bash(python -X utf8:*)', '--output-format', 'json'],
                       cwd=str(TOOLS), env=S.ENV, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=3600, stdin=subprocess.DEVNULL)
    open(os.path.join(logdir, f'{k}_sol{nn}.claude.json'), 'w', encoding='utf-8').write((r.stdout or '') + (r.stderr or ''))
    ok = (TOOLS / '_parts' / k / f'sol_q{nn}.py').is_file()
    S.say(log, k, f'{no}번 해설 조각', '완료' if ok else f'실패 rc{r.returncode}', f'{(time.time() - t) / 60:.0f}분')


def to_try(cfg, keys, log):
    """구워진 장: hwp → real → real.py → (hwp·pdf·hml·ㅈㄷ.pdf + 원본·해설 PDF) → 트라이."""
    outs = []
    for sh, k in zip(cfg, keys):
        o = sh['outname']; h = Path(G.GS) / 'comp' / f'{o}.hwp'
        if not h.is_file(): S.say(log, k, '구운 파일 없음 — real 건너뜀'); continue
        if not (REAL / h.name).exists(): shutil.move(str(h), REAL / h.name)
        outs.append((sh, o))
    if not outs: return
    r = subprocess.run([S.SYSPY, '-X', 'utf8', 'real.py'] + [o for _, o in outs], cwd=REAL_TOOLS, env=S.ENV, capture_output=True, text=True,
                       encoding='utf-8', errors='replace', timeout=4 * 3600, stdin=subprocess.DEVNULL)
    S.say(log, 'real.py rc', r.returncode, ((r.stdout or '').strip().splitlines() or [''])[-1][:120])
    for sh, o in outs:
        for f in (o + '.hwp', o + '.pdf', o + '.hml', o + 'ㅈㄷ.pdf'):
            s = REAL / f
            if s.exists() and not (TRY / f).exists(): shutil.move(str(s), TRY / f)
        for p in sh['parts']:
            for f in (p['pdf'], p['hsj']):
                src = Path(f)
                if src.exists() and not (TRY / src.name).exists(): shutil.move(str(src), TRY / src.name)
        S.say(log, o, '트라이 폴더로')


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('cfg'); ap.add_argument('--par', type=int, default=30); a = ap.parse_args()
    cfg = json.load(open(a.cfg, encoding='utf-8'))
    logdir = os.path.join(G.GS, '_watch_logs', time.strftime('%m%d_%H%M') + '_pdf'); os.makedirs(logdir, exist_ok=True); log = os.path.join(logdir, 'run.log')
    (TOOLS / '_parts').mkdir(exist_ok=True); (TOOLS / '_parts' / 'check_part.py').write_text(S.CHECK_PART, encoding='utf-8'); S.write_summary()
    jobs = setup(cfg, log)
    keys = list(dict.fromkeys(j['key'] for j in jobs))
    with ThreadPoolExecutor(a.par) as ex: list(ex.map(lambda j: codex_part(j, log, logdir), jobs))
    with ThreadPoolExecutor(min(a.par, 14)) as ex: list(ex.map(lambda j: claude_part(j, log, logdir), jobs))
    for k in keys: S.merge(k, [j['no'] for j in jobs if j['key'] == k], log)
    with ThreadPoolExecutor(a.par) as ex: list(ex.map(lambda j: S.sfig_part(j['key'], j['no'], log, logdir), jobs))
    for k in keys: S.render_figs(k, log)
    with ThreadPoolExecutor(len(keys)) as ex: list(ex.map(lambda k: S.finish(k, log), keys))
    to_try(cfg, keys, log)
    print('로그', logdir)


if __name__ == '__main__':
    main()
