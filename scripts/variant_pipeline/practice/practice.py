# -*- coding: utf-8 -*-
"""코덱스 변형 자기 연습 순환 (2026-10-23 대표: "지피티 노는 거 꼴보기 싫다 — 지 스스로 만들고 분석하고 개선하고 혼자 하게")

  python practice.py setup  <작업폴더> --sheets e983,e984,e985 [--pick 6]   원본 옮기기(코덱스) + 연습 문항 고르기
  python practice.py run    <작업폴더> --rounds 3 [--par 6]                    바퀴마다: 변형(run.py) → 결과 모으기 → 코치가 비법 노트 고치기
  python practice.py page   <작업폴더>                                        바퀴별 합격률 + 마지막 바퀴 문제 웹페이지

한 바퀴 = 고른 원본마다 run.py(설계 → 쉬움·유지·어려움 각 1칸 생성 → 독립 풀이 → 원본 비교 → 검토)를 돌리고,
채택(eligible) 비율을 잰 뒤, 코치(코덱스)가 떨어진 이유를 읽고 lessons.md(변형 비법 노트)를 고친다.
다음 바퀴는 같은 원본을 고친 노트로 다시 만든다 — 노트가 좋아지면 합격률이 오른다. 모델이 똑똑해지는 게 아니라 노트가 쌓인다.
대표 기준(prompts/generate.md 의 [변형 종류])이 노트보다 앞선다.
"""
import argparse, json, re, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
HERE = Path(__file__).resolve().parent; VP = HERE.parent
sys.path.insert(0, str(VP))
import gs_all as G   # noqa: E402  (CODEX 경로)
TOOLS = Path(r'C:\gpt_solve\tools')
PY = sys.executable


def codex(prompt, cwd, tag, timeout=3600):
    r = subprocess.run(G.CODEX + ['exec', '--skip-git-repo-check', '-c', 'notify=[]', '-c', 'mcp_servers={}', '--sandbox', 'workspace-write',
                                  '-C', str(cwd), prompt], capture_output=True, text=True, encoding='utf-8', errors='replace',
                       stdin=subprocess.DEVNULL, timeout=timeout)
    out = (r.stdout or '') + (r.stderr or '')
    (Path(cwd) / f'{tag}.log').write_text(out, encoding='utf-8')
    m = re.search(r'tokens used\s*\n\s*([\d,]+)', out)
    return int(m[1].replace(',', '')) if m else 0


def claude_exe():
    import glob, shutil
    for base in (Path.home() / '.antigravity-ide' / 'extensions', Path.home() / '.vscode' / 'extensions'):
        c = sorted(glob.glob(str(base / 'anthropic.claude-code-*' / 'resources' / 'native-binary' / 'claude.exe')))
        if c: return c[-1]
    return shutil.which('claude')


AUDIT = '''너는 현직 고등학교 수학 강사의 눈으로 변형 문제를 채점하는 검수자다. 이 폴더에 원본(`<id>_original.md`)과
코덱스가 만든 변형(`<id>_<칸>.json`: problem·answer_value·solution, 그리고 코덱스 채점 결과 judge·review 가 들어 있을 수 있다)이 있다.
`criteria.md`(대표가 정한 변형 기준)와 `golden.md`(대표가 판정한 과거 사례 — 무엇을 꼭 잡아야 하는지)를 먼저 끝까지 읽어라. [10/24] 대표는 쉬움에 너그럽다 — 숫자만 살짝 바꾼 것·단서를 준 쉬움도 채택한다. 「대표 판정 10/24」 사례가 네 기준보다 앞선다. 대표보다 엄격하게 깎지 마라.
변형마다 직접 풀어 보고 판정하라: 답이 하나로 나오는가 / 출제 의도 경로로 풀리는가 / 칸 종류(쉬움·유지=숫자변형, 어려움=장치 바꾸기·뼈대 깊게)에 맞는가 /
추상 함수·원본에 없던 그림·답 맞추기용 상수·지저분한 답이 없는가 / `<id>_real_variants.md`(실제 학교 강사가 이 원본을 변형한 사례)가 있으면 **강사가 실제로 낼 법한 변형인가**(돌린 손잡이·심한 변형 수법이 사례 수준인가).
`audit.json` 에 [{"id":..., "slot":..., "verdict":"좋음|보통|나쁨", "codex_eligible": 코덱스 채택 여부(파일에 있으면), "agree": 코덱스 판정과 같은가, "reasons":["구체적 근거"]}] 를 Python 으로 UTF-8 저장. 다른 파일은 만들지 마라.'''


def claude_audit(R, train_rows, n=6):
    """[10/23 대표 승인] 코덱스가 만들고 코덱스가 채점하면 같이 틀리는 곳을 못 잡는다 — 클로드가 표본을 따로 채점."""
    import random
    A = R / 'audit'; A.mkdir(exist_ok=True)
    random.seed(R.name); pick = random.sample(train_rows, min(n, len(train_rows)))
    for x in pick:
        D = R / x['id']
        if (D / 'original.md').is_file(): (A / f"{x['id']}_original.md").write_text((D / 'original.md').read_text(encoding='utf-8'), encoding='utf-8')
        if (D / 'similar.md').is_file(): (A / f"{x['id']}_real_variants.md").write_text((D / 'similar.md').read_text(encoding='utf-8'), encoding='utf-8')
        for f in D.glob(f"{x['slot']}*.json"):
            (A / f"{x['id']}_{f.name}").write_text(f.read_text(encoding='utf-8-sig'), encoding='utf-8')
    gen = (VP / 'prompts' / 'generate.md').read_text(encoding='utf-8')
    k = gen.find('[변형 종류'); (A / 'criteria.md').write_text(gen[k:k + 4000] if k >= 0 else gen[:4000], encoding='utf-8')
    try:
        g = json.load(open(VP / 'golden' / 'golden_set.json', encoding='utf-8'))
        (A / 'golden.md').write_text(chr(10).join(f"- 기대 {c.get('expected')} · 꼭 잡을 것: {c.get('must_catch')}" for c in g), encoding='utf-8')
    except Exception: (A / 'golden.md').write_text('(사례 없음)', encoding='utf-8')
    exe = claude_exe()
    if not exe: return []
    subprocess.run([exe, '-p', AUDIT, '--permission-mode', 'acceptEdits', '--allowedTools', 'Read', 'Write', 'Glob', 'Bash(python:*)', 'Bash(python -X utf8:*)',
                    '--output-format', 'json'], cwd=A, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=3 * 3600, stdin=subprocess.DEVNULL)
    try: return json.load(open(A / 'audit.json', encoding='utf-8'))
    except Exception: return []


def blocks(key):
    """content_eXXX.py 를 문항별 덩어리로(# ── N번 ── 표시 기준)."""
    t = (TOOLS / f'content_{key}.py').read_text(encoding='utf-8')
    parts = re.split(r'^# ── (\d+)번 ──\s*$', t, flags=re.M)
    return {int(parts[i]): parts[i + 1] for i in range(1, len(parts), 2)}


CONVERT = '''이 폴더의 `block.py` 는 고등학교 수학 모의고사({SHEET}) {NO}번 문항의 원고다(한글 수식 표기: `it x^{{2}}`, `{{a}} over {{b}}`, `sqrt` 등).
이것을 변형 파이프라인 입력 `original.md` 로 옮겨라. 수식은 전부 LaTeX(KaTeX) `$…$`, 따로 세운 식은 `$$…$$`.
절 순서와 이름을 지켜라:
## 출처
`{SHEET} · 과목 <과목> · 단원 <단원 하나> · {NO}번 · 난이도 추정 N(1~10)`  (단원은 교과서 중단원 이름, 예: 함수의극한·이차방정식·조건부확률)
## 문제
발문·조건 상자·보기·선지(`① $…$　② $…$ …`)를 빠짐없이. 그림이 있으면 「## 그림」 절에 그림이 주는 조건을 글로.
## 정답
답 값만(선지면 번호와 값).
## 풀이 메모
원고의 해설(SOL) 요지 5~12줄, LaTeX.
끝나면 `meta.json` 에 {{"difficulty": N, "unit": "...", "subject": "..."}} 를 쓴다. 다른 파일은 만들지 마라.
결과는 반드시 Python open(..., encoding="utf-8") 으로 쓴다.'''


def setup(a):
    W = Path(a.work); (W / 'orig').mkdir(parents=True, exist_ok=True)
    jobs = []
    for key in a.sheets.split(','):
        q = json.load(open(TOOLS / 'queue.json', encoding='utf-8'))
        sheet = next(i['outname'] for i in q['items'] if i['key'] == key).replace('_문제', '')
        for no, body in blocks(key).items():
            d = W / 'orig' / f'{key}_{no:02d}'
            if (d / 'original.md').is_file(): continue
            d.mkdir(exist_ok=True); (d / 'block.py').write_text(body, encoding='utf-8')
            jobs.append((d, sheet, no))
    print('옮길 문항', len(jobs))
    with ThreadPoolExecutor(a.par) as ex:
        list(ex.map(lambda j: codex(CONVERT.format(SHEET=j[1], NO=j[2]), j[0], 'convert'), jobs))
    # 연습 문항 고르기: 시험지마다 난이도 추정 5~8 사이에서 고르게 a.pick 개(너무 쉬운 1~4점 문항은 연습 가치가 없다)
    pick = []
    for key in a.sheets.split(','):
        cand = []
        for d in sorted((W / 'orig').glob(f'{key}_*')):
            try: m = json.load(open(d / 'meta.json', encoding='utf-8'))
            except Exception: continue
            if (d / 'original.md').is_file() and 5 <= int(m.get('difficulty', 0)) <= 8: cand.append((d.name, m))
        step = max(1, len(cand) // a.pick)
        pick += [{'id': n, **m} for n, m in cand[::step][:a.pick]]
    json.dump(pick, open(W / 'picked.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('연습 문항', len(pick), [p['id'] for p in pick])


def dbsetup(a):
    """[10/23 대표] 예전 모의고사 원본 + 실제 강사 변형 사례(mine.json) — 원본은 DB 파싱본을 hwp_math 로 LaTeX 변환(코덱스 안 씀).
    단원마다 원본 2개 중 하나는 연습용, 하나는 시험용."""
    sys.path.insert(0, str(VP / 'mine')); sys.path.insert(0, str(VP.parent))
    from db import get; from ext import split as xsplit
    import hwp_math as HM
    W = Path(a.work); M = Path(a.mine); (W / 'orig').mkdir(parents=True, exist_ok=True)
    lat = lambda t: re.sub(r'⟦(.*?)⟧', lambda m: '$' + HM.to_latex(m[1]) + '$', t, flags=re.S)
    def build(d):
        r = get('questions', select='id,school,year,semester,grade,subject,unit,question_number,difficulty,content_xml', id='eq.' + d.name)[0]
        stem, sol = xsplit(r['content_xml'] or '')
        ans = re.search(r'정답은\s*(.+?)\s*(?:이다|입니다|\.|$)', sol)
        # [10/23] 정답에 한글 수식(⟦396⟧)이 그대로 남아 run.py 가 '원본 정답 값 확인 불가'로 60개 중 52개를 버렸다 → 평문 값으로
        ans_txt = re.sub(r'⟦(.*?)⟧', lambda m: HM.to_text(m[1]), ans[1]).strip() if ans else ''
        O = W / 'orig' / d.name[:8]; O.mkdir(exist_ok=True)
        head = f"{r['school']} {r['year']} {r['semester'] or ''} 고{r['grade'] or ''} {r['subject']} · 단원 {r['unit']} · {r['question_number']}번 · 난이도 {r['difficulty']}"
        body = ['## 출처', head, '', '## 문제', lat(stem).strip(), '', '## 정답', ans_txt or '(해설에서 확인)', '', '## 풀이 메모', lat(sol)[:2500].strip(), '']
        (O / 'original.md').write_text(chr(10).join(body), encoding='utf-8')
        if not (O / 'similar.md').is_file():
            try:   # [10/23] DB 가 느려 한 개가 15분 넘게 멈춘 적 — 10분 넘으면 사례 없이 간다
                subprocess.run([PY, '-X', 'utf8', str(VP / 'mine' / 'similar_ctx.py'), d.name, str(O / 'similar.md'), '--mine', str(M)],
                               capture_output=True, text=True, encoding='utf-8', errors='replace', cwd=str(VP / 'mine'), timeout=600)
            except subprocess.TimeoutExpired: pass
        return d, r
    # [10/23 대표 "너무 느리다"] 한 개씩 하니 10분에 2개 — 20개 동시
    with ThreadPoolExecutor(20) as ex:
        built = list(ex.map(build, [d for d in sorted(M.iterdir()) if (d / 'mine.json').is_file()]))
    pick, per_unit = [], {}
    for d, r in built:
        n = per_unit.get(r['unit'], 0); per_unit[r['unit']] = n + 1
        pick.append({'id': d.name[:8], 'db_id': d.name, 'unit': r['unit'], 'difficulty': r['difficulty'], 'split': 'train' if n == 0 else 'test'})
    json.dump(pick, open(W / 'picked.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('원본', len(pick), '연습용', sum(p['split'] == 'train' for p in pick), '시험용', sum(p['split'] == 'test' for p in pick))


def summarize(D):
    """run.py 결과 → 칸별 채택 여부와 떨어진 이유."""
    rep = json.load(open(D / 'delivery_report.json', encoding='utf-8')) if (D / 'delivery_report.json').is_file() else None
    if not rep: return {'error': 'delivery_report 없음'}
    rows = []
    for r in rep.get('rows', []):
        why = []
        # [10/23] 판정 필드 이름(verdict·reason·findings·adoption)을 안 읽어 1바퀴 탈락 27칸의 이유가 전부 비었다 — 코치가 배울 게 없었다
        J, V = r.get('judge') or {}, r.get('review') or {}
        def g(d, k):
            v = d.get(k)
            if isinstance(v, str):
                try: v = json.loads(v)
                except Exception: pass
            return v
        if g(J, 'verdict'): why.append(f"원본비교 판정: {g(J, 'verdict')} — {str(g(J, 'reason') or '')[:500]}")
        if g(J, 'made_easier'): why.append('쉬워진 점: ' + json.dumps(g(J, 'made_easier'), ensure_ascii=False)[:300])
        if g(V, 'adoption'): why.append(f"검토: {g(V, 'adoption')} (설계 {g(V, 'design_status')}·수학 {g(V, 'math_status')}·시험 {g(V, 'exam_status')}) — {str(g(V, 'reason') or '')[:500]}")
        for src, d in (('원본비교', J), ('검토', V)):
            for f in (g(d, 'findings') or [])[:3]:
                if isinstance(f, dict): why.append(f"{src} 지적[{f.get('category')}/{f.get('severity')}]: {str(f.get('issue') or f.get('evidence') or f.get('detail') or f)[:300]}")
        rows.append({'slot': r['slot'], 'level': r['level'], 'eligible': bool(r.get('eligible')), 'why': why[:8]})
    return {'rows': rows, 'tokens': rep.get('tokens', 0), 'fatal': rep.get('fatal', '')}


COACH = '''너는 변형 문제 출제 팀의 코치다. 이 폴더에:
- `lessons.md` : 지금까지의 변형 비법 노트(처음엔 비어 있을 수 있다)
- `round.json` : 이번 바퀴 결과(연습용 문항만) — 원본별·칸(쉬움 e·유지 k·어려움 h)별 채택 여부와 떨어진 이유(독립 풀이·원본 비교·검토 단계의 지적)
- `claude_audit.json` : 클로드 검수자가 표본을 강사 눈으로 따로 채점한 결과. **코덱스 채점과 다른 곳(agree=false)이 가장 중요한 교훈이다** — 코덱스끼리 같이 놓친 것이기 때문.
- `../../../prompts/generate.md` 의 [변형 종류] : 대표(현직 강사)가 정한 기준 — 노트가 이것과 부딪치면 안 된다
할 일: 떨어진 이유를 묶어 **반복되는 실수의 원인**을 찾고, `lessons.md` 를 고쳐 다시 써라.
- 규칙마다: 무엇을 하라/하지 마라 + 왜(이번 바퀴의 실제 사례 한 줄, 원본 id·칸) + 확인 방법(만든 뒤 스스로 점검할 질문).
- 효과 없던 규칙(이번에도 같은 실수)은 더 구체적으로 고치고, 맞은 규칙은 남긴다. 60줄 이내. 대표 기준을 되풀이하지 말고 그 아래 실전 요령만.
- 마지막에 `## 이번 바퀴 고친 점` 3~6줄.
결과는 반드시 Python open(..., encoding="utf-8") 으로 쓴다. lessons.md 말고 다른 파일은 고치지 마라.'''


def run(a):
    W = Path(a.work); pick = json.load(open(W / 'picked.json', encoding='utf-8'))
    # [10/23 대표 승인] 같은 문제로 연습하고 시험 보면 외운 건지 는 건지 모른다 — 시험지마다 앞 4개 연습용, 뒤 2개 시험용.
    #   코치는 연습용 결과만 보고, 실력은 코치가 못 본 시험용 합격률로 잰다.
    by_sheet = {}
    for p in pick: by_sheet.setdefault(p['id'].split('_')[0], []).append(p)
    for L in by_sheet.values():
        for i, p in enumerate(L): p.setdefault('split', 'test' if i >= len(L) - 2 else 'train')
    json.dump(pick, open(W / 'picked.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    split = {p['id']: p['split'] for p in pick}
    lessons = W / 'lessons.md'
    if not lessons.is_file(): lessons.write_text('# 변형 비법 노트\n\n(아직 없음 — 1바퀴 결과로 코치가 채운다)\n', encoding='utf-8')
    prog = json.load(open(W / 'progress.json', encoding='utf-8')) if (W / 'progress.json').is_file() else []
    for r in range(len(prog) + 1, len(prog) + 1 + a.rounds):
        R = W / f'r{r}'; R.mkdir(exist_ok=True)
        (R / 'lessons_used.md').write_text(lessons.read_text(encoding='utf-8'), encoding='utf-8')

        def one(p):
            D = R / p['id']
            cmd = [PY, '-X', 'utf8', str(VP / 'run.py'), str(D), str(W / 'orig' / p['id'] / 'original.md'),
                   '--easy', '1', '--keep', '1', '--hard', '1', '--workers', '3', '--unit', p.get('unit', ''), '--lessons', str(R / 'lessons_used.md')]
            sim = W / 'orig' / p['id'] / 'similar.md'
            if sim.is_file(): cmd += ['--similar', str(sim)]   # 실제 강사 변형 사례(숫자변형 손잡이·심한 변형 수법) — 모범 답안
            subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace', stdin=subprocess.DEVNULL, timeout=4 * 3600)
            return p['id'], summarize(D)
        t0 = time.time()
        with ThreadPoolExecutor(a.par) as ex: res = dict(ex.map(one, pick))
        rows = [dict(x, id=i) for i, v in res.items() for x in v.get('rows', [])]
        by = {lv: (sum(x['eligible'] for x in rows if x['level'] == lv), sum(1 for x in rows if x['level'] == lv)) for lv in ('e', 'k', 'h')}
        tr = [x for x in rows if split.get(x['id']) == 'train']; te = [x for x in rows if split.get(x['id']) == 'test']
        stat = {'round': r, 'pass': sum(x['eligible'] for x in rows), 'total': len(rows), 'by_level': by,
                'train': f"{sum(x['eligible'] for x in tr)}/{len(tr)}", 'test': f"{sum(x['eligible'] for x in te)}/{len(te)}",
                'tokens': sum(v.get('tokens', 0) for v in res.values()), 'minutes': round((time.time() - t0) / 60)}
        audit = claude_audit(R, tr)
        stat['claude_audit'] = {'n': len(audit), '좋음': sum(1 for x in audit if x.get('verdict') == '좋음'),
                                '코덱스와_다름': sum(1 for x in audit if x.get('agree') is False)}
        json.dump(res, open(R / 'round.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print(f'{r}바퀴: 채택 {stat["pass"]}/{stat["total"]} (연습용 {stat["train"]} · 시험용 {stat["test"]}) · 칸별 {by} · 클로드 표본 {stat["claude_audit"]} · {stat["tokens"]:,}토큰 · {stat["minutes"]}분', flush=True)
        # 코치 — 노트 고치기
        C = R / 'coach'; C.mkdir(exist_ok=True)
        (C / 'lessons.md').write_text(lessons.read_text(encoding='utf-8'), encoding='utf-8')
        json.dump({i: v for i, v in res.items() if split.get(i) == 'train'}, open(C / 'round.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        json.dump(audit, open(C / 'claude_audit.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        stat['coach_tokens'] = codex(COACH, C, 'coach')
        if (C / 'lessons.md').is_file(): lessons.write_text((C / 'lessons.md').read_text(encoding='utf-8'), encoding='utf-8')
        prog.append(stat); json.dump(prog, open(W / 'progress.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('끝 —', [(p['round'], f"{p['pass']}/{p['total']}") for p in prog])


def page(a):
    """바퀴별 합격률 + 비법 노트 + 마지막 바퀴 문제(render_web 카드, batch_variants 와 같은 방식으로 이어 붙임)."""
    import html as H
    import render_web as RW
    W = Path(a.work); prog = json.load(open(W / 'progress.json', encoding='utf-8'))
    last = W / f"r{prog[-1]['round']}"
    heads, bodies = None, []
    for D in sorted(d for d in last.iterdir() if d.is_dir() and d.name != 'coach' and (d / 'delivery_report.json').is_file()):
        h = RW.build(str(D), D.name)
        if heads is None: heads = h[:h.index('<main')]
        inner = h[h.index('<main'):]; inner = inner[inner.index('>') + 1:inner.rindex('</main>')]
        inner = re.sub(r'<header>.*?</header>', f'<h2 class="qno">{D.name}</h2>', inner, count=1, flags=re.S)
        bodies.append(f'<section class="q">{inner}</section>')
    lv = {'e': '쉬움', 'k': '유지', 'h': '어려움'}
    rows = ''.join(f"<tr><td>{p['round']}바퀴</td><td><b>{p['pass']}/{p['total']}</b><br>연습용 {p.get('train','')} · <b>시험용 {p.get('test','')}</b></td><td>{' · '.join(f'{lv[k]} {v[0]}/{v[1]}' for k, v in p['by_level'].items())}</td><td>{p['tokens']:,}</td></tr>" for p in prog)
    css = '<style>.q{display:flex;flex-direction:column;gap:14px;padding-block:8px 28px;border-bottom:1px solid var(--line)}.qno{font-size:1.25rem;margin:8px 0 0}table{border-collapse:collapse}td,th{border:1px solid var(--line);padding:6px 10px}pre{white-space:pre-wrap;font-size:14px}</style>'
    heads = re.sub(r'<title>.*?</title>', '<title>변형 자기 연습</title>', heads or '<!doctype html><meta charset="utf-8">', count=1)
    out = (heads + css + '<main class="wrap"><header><h1>코덱스 변형 자기 연습 — 10월 학평 고1·고2·고3</h1></header>'
           f'<h2>바퀴별 채택</h2><table><tr><th>바퀴</th><th>채택</th><th>칸별</th><th>토큰</th></tr>{rows}</table>'
           f'<h2>변형 비법 노트(최종)</h2><pre>{H.escape((W / "lessons.md").read_text(encoding="utf-8"))}</pre>'
           f'<h2>마지막 바퀴 문제</h2>' + ''.join(bodies) + '</main>')
    (W / 'practice.html').write_text(out, encoding='utf-8'); print(W / 'practice.html')


if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('cmd'); ap.add_argument('work')
    ap.add_argument('--sheets', default='e983,e984,e985'); ap.add_argument('--pick', type=int, default=6)
    ap.add_argument('--rounds', type=int, default=3); ap.add_argument('--par', type=int, default=6); ap.add_argument('--mine', default='')
    a = ap.parse_args()
    {'setup': setup, 'dbsetup': dbsetup, 'run': run, 'page': page}[a.cmd](a)
