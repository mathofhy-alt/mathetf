# -*- coding: utf-8 -*-
"""쎈 전수조사(route.json·questions.jsonl) → 솔브부 정석 경로 문서 (10/20)

  python scripts/solve_style/export_routes.py --root C:/selfmade/쎈조사 --out C:/gpt_solve/tools/정석경로
  단원마다 <과목>/<단원>.md (작업자가 그 단원 문항을 풀기 전에 읽는다) + 목차.md + 원자료 json.
  C:\\20260909 원판은 건드리지 않는다 — 솔브부(gpt_solve)에만 쓴다(대표 10/20).
"""
import os, sys, json, glob, argparse, collections, shutil
sys.stdout.reconfigure(encoding='utf-8')
ap = argparse.ArgumentParser(); ap.add_argument('--root', required=True); ap.add_argument('--out', required=True); a = ap.parse_args()
ROUTES = ['대수', '그래프', '기하', '혼합', '계산']
index = ['# 정석 경로표 — 쎈 6권 전수조사 (2026-10-20)', '',
         '쎈 6권 6,571문항을 DB 파싱본에서 전부 읽고, 문항마다 주풀이가 정답을 정한 경로(대수·그래프·기하·혼합·계산)를 분류한 것이다.',
         '**문항을 풀기 전에 그 단원 파일을 읽고, 유형의 「그래프·기하로 푸는 신호」에 걸리면 그 경로가 plan 이다.** 해설규칙 원칙 0의 「정석」 판단 근거다.',
         '쎈 해설도 정석이라는 보장은 없다 — 각 단원 파일의 「쎈도 대수로 푼 예외」를 보라. 해설규칙의 유형별 방침(예: 실근의 개수는 그래프)이 이 표보다 앞선다.', '',
         '| 과목 | 단원 | 문항 | 대수 | 그래프 | 기하 | 혼합 | 계산 |', '|---|---|---:|---:|---:|---:|---:|---:|']
total = collections.Counter()
for p in sorted(glob.glob(os.path.join(a.root, '*', '*', 'route.json'))):
    D = os.path.dirname(p); unit = os.path.basename(D); sub = os.path.basename(os.path.dirname(D))
    r = json.load(open(p, encoding='utf-8'))
    qs = [json.loads(l) for l in open(os.path.join(D, 'questions.jsonl'), encoding='utf-8')]
    c = collections.Counter(q.get('route') for q in qs); total.update(c)
    index.append(f'| {sub} | [{unit}]({sub}/{unit}.md) | {len(qs)} | ' + ' | '.join(str(c.get(k, 0)) for k in ROUTES) + ' |')
    L = [f'# {sub} · {unit} — 정석 경로 (쎈 {len(qs)}문항 전수)', '',
         '경로 분포: ' + ' · '.join(f'{k} {c.get(k, 0)}' for k in ROUTES), '',
         '## 대수 vs 그래프·기하 판단 규칙', ''] + [f'- {x}' for x in r.get('rules', [])] + ['',
         '## 유형별', '']
    for t in r.get('types', []):
        rt = t.get('routes', {})
        L += [f"### {t['type']} ({t['count']}문항 · " + ' '.join(f'{k}{rt.get(k, 0)}' for k in ROUTES if rt.get(k)) + ')',
              f"- **정석**: {t.get('standard', '')}",
              f"- **그래프·기하로 푸는 신호**: {t.get('use_graph_when', '')}",
              f"- **대수로 푸는 신호**: {t.get('use_algebra_when', '')}",
              f"- 예: 쎈 {', '.join(map(str, t.get('examples', [])))}번", '']
    st = r.get('style', {})
    if st:
        L += ['## 쎈 해설 문체 (이 단원 실측)', '',
              f"- 첫 줄: {st.get('opening', '')}", f"- 근거 표현: {', '.join(map(str, st.get('reason_phrases', [])))}",
              f"- 그림: {st.get('figure_use', '')}", f"- 경우 나누기: {st.get('case_split', '')}", f"- 끝맺음: {st.get('closing', '')}"]
        L += [f'- {x}' for x in st.get('other', [])]
        L += ['', '※ 문체는 참고다 — 우리 말투는 해설규칙의 평가원 기준(「따라서」, ∴ 금지 등)이 우선한다.']
    os.makedirs(os.path.join(a.out, sub), exist_ok=True)
    open(os.path.join(a.out, sub, f'{unit}.md'), 'w', encoding='utf-8').write('\n'.join(L) + '\n')
    os.makedirs(os.path.join(a.out, '_원자료', sub, unit), exist_ok=True)
    for f in ('route.json', 'questions.jsonl'): shutil.copy(os.path.join(D, f), os.path.join(a.out, '_원자료', sub, unit, f))
n = sum(total.values())
index += ['', f'합계 {n}문항: ' + ' · '.join(f'{k} {total.get(k, 0)}' for k in ROUTES)]
open(os.path.join(a.out, '목차.md'), 'w', encoding='utf-8').write('\n'.join(index) + '\n')
print('단원 문서', len(glob.glob(os.path.join(a.out, '*', '*.md'))), '· 문항', n, dict(total))
