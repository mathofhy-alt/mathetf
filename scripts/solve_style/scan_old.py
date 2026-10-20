# -*- coding: utf-8 -*-
"""기존 솔브 원고(C:\\20260909\\tools\\content_e*.py — 읽기만) 1차 걸러내기: 코덱스 없이 글자로 (10/20)

  python scripts/solve_style/scan_old.py --src C:/20260909/tools --out C:/selfmade/해설점검
  걸리는 것:
   A 고유k      — 학생용 해설에 「고유 k」
   B 값대입그림 — 「k=-1인 경우는 다음 그림」 처럼 매개변수에 특정 값을 넣었다고 쓴 그림 설명
   C 개수대수   — 발문이 실근·교점·만나는 점의 개수인데 본풀이에 그래프·그림(@fig) 없이 판별식·근과 계수
   D 극한서술   — 「가까우면 … 이므로 교점은 (항상) 한 개」 류 사잇값 말 서술
  원판은 고치지 않는다. 결과는 문항 단위 목록(json) + 요약.
"""
import os, re, sys, json, glob, argparse, collections
sys.stdout.reconfigure(encoding='utf-8')
ap = argparse.ArgumentParser(); ap.add_argument('--src', required=True); ap.add_argument('--out', required=True); a = ap.parse_args()


def text(x):
    if x is None: return ''
    if isinstance(x, (list, tuple)): return '\n'.join(text(y) for y in x)
    return str(x)


COUNT = re.compile(r'(실근|실수인 근|교점|만나는 점|해)의 개수|서로 다른 실근|몇 개|만나도록|만나지 않')
ALG = re.compile(r'판별식|근과 계수|D\s*[<>=≥≤]|\bD\s*/\s*4|it D')
GRAPH = re.compile(r'@fig|그래프|그림')
rows, bad_files = [], []
files = sorted(glob.glob(os.path.join(a.src, 'content_e*.py')))
for f in files:
    m = re.search(r'content_(e\d+)\.py$', f)
    if not m: continue   # content_e123_old.py 같은 사본은 건너뛴다
    key = m.group(1)
    ns = {'__name__': 'x'}
    try:
        exec(compile(open(f, encoding='utf-8').read(), f, 'exec'), ns)
    except Exception as e:
        bad_files.append((key, type(e).__name__)); continue
    for p in ns.get('P') or []:
        stem = text(p.get('stem')) + text(p.get('stem_tail')) + text(p.get('stem_tail2'))
        sol = text(p.get('sol'))
        main = re.split(r'\[별해\]|\[참고\]', sol)[0]
        tags = []
        if '고유 k' in sol or re.search(r'고유\s*\$?(it\s*)?k', sol): tags.append('A')
        if re.search(r'=\s*-?\d+(/\d+)?\$?\s*인 경우는 다음 그림|인 경우(를|는) (다음 )?그림', sol): tags.append('B')
        if COUNT.search(stem) and ALG.search(main) and not GRAPH.search(main): tags.append('C')
        if re.search(r'가까우면.{0,80}(이고|이며).{0,80}가까우면.{0,120}(교점|근)', main.replace('\n', ' ')): tags.append('D')
        if tags:
            rows.append({'key': key, 'title': ns.get('TITLE') or '', 'range': ns.get('RANGE') or '', 'no': p.get('no'), 'tags': tags,
                         'plan': p.get('plan') or '', 'stem': stem[:300]})
os.makedirs(a.out, exist_ok=True)
json.dump(rows, open(os.path.join(a.out, 'scan_old.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
c = collections.Counter(t for r in rows for t in r['tags'])
print('원고', len(files), '· 못 읽음', len(bad_files), '· 걸린 문항', len(rows), '· 걸린 시험지', len({r['key'] for r in rows}))
print('유형별', dict(c))
