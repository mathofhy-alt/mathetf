# -*- coding: utf-8 -*-
"""학교 시험지 문항을 변형 원본으로 준비 (2026-10-24 대표: "25년 분당중앙고 1학년 2학기 중간 공통수학2 난이도 5 이상, 유지1·어려움1")
   python prep_school.py <작업폴더> --school 분당중앙고등학교 --year 2025 --semester 2학기중간 --grade 고1 --min-diff 5

① DB 원문 → original.md(LaTeX) + similar.md(사이트 「유사」 상위 실제 학교 변형)
② 코덱스 한 명씩: DB 원문·문항 그림을 보고 original.md 를 원문 그대로 바로잡고 그림 조건을 글로(repair_originals 와 같은 방식)
③ 「## 그림」 을 「## 문제」 안으로 합친다(run.py 는 문제 절만 판정·풀이에 준다)
④ 객관식 정답을 선지 값으로(fix_answers.py) → run.original_answer 로 전부 확인
"""
import argparse, base64, json, re, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
HERE = Path(__file__).resolve().parent; VP = HERE.parent
sys.path[:0] = [str(VP), str(VP / 'mine'), str(VP.parent)]
import gs_all as G                    # noqa: E402
import run as R                       # noqa: E402
from db import get                    # noqa: E402
from ext import split as xsplit       # noqa: E402
import hwp_math as HM                 # noqa: E402
PY = sys.executable
lat = lambda t: re.sub(r'⟦(.*?)⟧', lambda m: '$' + HM.to_latex(m[1]) + '$', t, flags=re.S)

FIX = '''이 폴더의 `original.md` 는 학교 시험 수학 문항을 DB에서 자동 변환한 것이다. 변환 중 조건이 끊기거나 그림 정보가 빠졌을 수 있다.
`raw.md` 에 DB 원문(수식은 한글 수식 문법 ⟦…⟧ 그대로)이, `fig*.png` 등에 문항 그림이 있다. 그림을 열어 보라(해설 그림일 수도 있다).
할 일: `original.md` 를 원문과 그림에 맞게 **확인하고 필요하면 고쳐 다시 써라**.
- 「## 문제」: 발문·조건 (가)(나)…·보기·선지를 raw.md 그대로 빠짐없이, 수식은 LaTeX `$…$`.
- 「## 그림」(문제에 그림이 있으면): 그림이 주는 조건(점 위치·좌표·길이·배치·곡선 모양)을 글로 정확히 — 그림 없이도 풀리게. 해설 그림이면 쓰지 마라. 그림에 없는 것을 지어내지 마라.
- 「## 출처」「## 정답」「## 풀이 메모」는 지금 값을 유지(정답 값은 바꾸지 마라). 풀이 메모의 끊긴 수식도 raw.md 를 보고 바로잡아라.
- 고친 뒤 직접 풀어 정답이 「## 정답」 값과 같은지 확인하라. 다르면 `check.txt` 에 이유를 적어라.
결과는 Python open(..., encoding="utf-8") 으로 쓴다. original.md(와 필요하면 check.txt) 말고 다른 파일은 만들지 마라.'''


def build(W, r):
    full = get('questions', select='id,school,year,semester,grade,subject,unit,question_number,difficulty,content_xml', id='eq.' + r['id'])[0]
    stem, sol = xsplit(full['content_xml'] or '')
    ans = re.search(r'정답은\s*(.+?)\s*(?:이다|입니다|\.|$)', sol)
    ans_txt = re.sub(r'⟦(.*?)⟧', lambda m: HM.to_text(m[1]), ans[1]).strip() if ans else ''
    i = r['id'][:8]; O = W / 'orig' / i; O.mkdir(parents=True, exist_ok=True); (W / 'mine' / r['id']).mkdir(parents=True, exist_ok=True)
    head = f"{full['school']} {full['year']} {full['semester'] or ''} {full['grade'] or ''} {full['subject']} · 단원 {full['unit']} · {full['question_number']}번 · 난이도 {full['difficulty']}"
    body = ['## 출처', head, '', '## 문제', lat(stem).strip(), '', '## 정답', ans_txt or '(해설에서 확인)', '', '## 풀이 메모', lat(sol)[:2500].strip(), '']
    (O / 'original.md').write_text('\n'.join(body), encoding='utf-8')
    if not (O / 'similar.md').is_file():
      try:
        subprocess.run([PY, '-X', 'utf8', str(VP / 'mine' / 'similar_ctx.py'), r['id'], str(O / 'similar.md')],
                       capture_output=True, text=True, encoding='utf-8', errors='replace', cwd=str(VP / 'mine'), timeout=600)
      except subprocess.TimeoutExpired: pass
    # ② 코덱스 확인·보강
    F = W / 'fix' / i; F.mkdir(parents=True, exist_ok=True)
    (F / 'raw.md').write_text('## 원문(발문)\n' + stem + '\n\n## 원문(해설)\n' + sol[:4000], encoding='utf-8')
    (F / 'original.md').write_text((O / 'original.md').read_text(encoding='utf-8'), encoding='utf-8')
    for k, im in enumerate(get('question_images', select='format,data', question_id='eq.' + r['id'])[:8]):
        d = str(im.get('data') or '')
        d = d.split(',', 1)[1] if d.startswith('data:') else d   # [10/24] 일부는 data: 주소 꼴·패딩 누락으로 저장돼 있다
        try: (F / f'fig{k + 1}.{im.get("format") or "png"}').write_bytes(base64.b64decode(d + '=' * (-len(d) % 4)))
        except Exception: pass
    args = []   # 지시문 먼저, 그림은 뒤에(-i 가 지시문을 먹는다 — 10/23)
    for f in sorted(F.glob('fig*.*')):
        if f.stat().st_size > 1024: args += ['-i', str(f)]
    before = (F / 'original.md').read_text(encoding='utf-8')
    rr = subprocess.run(G.CODEX + ['exec', '--skip-git-repo-check', '-c', 'notify=[]', '-c', 'mcp_servers={}', '--sandbox', 'workspace-write',
                                   '-C', str(F), FIX] + args, capture_output=True, text=True, encoding='utf-8', errors='replace',
                        stdin=subprocess.DEVNULL, timeout=3600)
    (F / 'codex.log').write_text((rr.stdout or '') + (rr.stderr or ''), encoding='utf-8')
    new = (F / 'original.md').read_text(encoding='utf-8')
    # ③ 그림 절을 문제 절 안으로
    m = re.search(r'\n## 그림[^\n]*\n(.*?)(?=\n## |\Z)', new, re.S)
    if m:
        fig = m[1].strip(); new = new[:m.start()] + new[m.end():]
        new = re.sub(r'(## 문제[^\n]*\n.*?)(?=\n## )', lambda k: k[1].rstrip() + '\n\n[그림] ' + fig + '\n', new, count=1, flags=re.S)
    (O / 'original.md').write_text(new, encoding='utf-8')
    return {'id': i, 'db_id': r['id'], 'no': full['question_number'], 'unit': full['unit'], 'difficulty': full['difficulty'],
            'split': 'test', 'figs': len(args) // 2, 'changed': new != before, 'check': (F / 'check.txt').read_text(encoding='utf-8')[:300] if (F / 'check.txt').is_file() else ''}


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('work')
    for k in ('school', 'year', 'semester', 'grade'): ap.add_argument('--' + k, required=True)
    ap.add_argument('--min-diff', type=float, default=5)
    a = ap.parse_args(); W = Path(a.work); W.mkdir(parents=True, exist_ok=True)
    rows = get('questions', select='id,question_number,difficulty', school='eq.' + a.school, year='eq.' + a.year,
               semester='eq.' + a.semester, grade='eq.' + a.grade, order='question_number.asc')
    rows = [r for r in rows if float(r['difficulty'] or 0) >= a.min_diff]
    print('대상', [r['question_number'] for r in rows], flush=True)
    with ThreadPoolExecutor(len(rows)) as ex: picked = list(ex.map(lambda r: build(W, r), rows))
    json.dump(picked, open(W / 'picked.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    subprocess.run([PY, '-X', 'utf8', str(HERE / 'fix_answers.py'), str(W)], cwd=str(HERE))
    bad = []
    for p in picked:
        o = (W / 'orig' / p['id'] / 'original.md').read_text(encoding='utf-8')
        try: R.original_answer(o, R.section(o, '문제'))
        except Exception as e: bad.append((p['no'], str(e)[:80]))
    for p in picked: print(p['no'], p['unit'], '난이도', p['difficulty'], '그림', p['figs'], '고침' if p['changed'] else '그대로', p['check'][:120])
    print('정답 확인 실패', bad)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
    main()
