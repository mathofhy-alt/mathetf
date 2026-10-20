# -*- coding: utf-8 -*-
"""학생 스캔 실측 오답 → 트랜스(변형) 분석용 색인 (10/19)

  python scripts/selfmade/build_real_errors.py
  입력: C:/selfmade/오답조사/seoul/wrong_items.json(사례) + seoul_causes/_all.json(단원별 원인 목록) + 각 시험지 meta.json(source_db_id)
  출력: C:/selfmade/오답조사/real_errors.json
    by_unit[단원(공백 없앰)] = 원인 목록(사례 2건 이상만, 많은 순) — name·cases·exams·what·trigger·examples
    by_question["source_db_id#문항번호"] = 그 문항에서 실제 학생이 틀린 흔적(근거 있는 것만)
  변형 파이프라인(scripts/variant_pipeline/run.py --unit/--src/--no)이 이걸 읽어 real_errors.md 로 넘긴다.
"""
import os, json, collections
sys_out = os.sys.stdout.reconfigure(encoding='utf-8')
BASE = 'C:/selfmade/오답조사'
key = lambda u: (u or '').replace(' ', '')
rows = json.load(open(f'{BASE}/seoul/wrong_items.json', encoding='utf-8'))
# 단원 이름은 폴더 이름으로 — catalog.json 의 unit 칸은 코덱스가 '????' 로 깨뜨린 것이 있었다(10/19 코덱스 지적: 유리함수·지수함수)
by_unit = {}
for u in sorted(os.listdir(f'{BASE}/seoul_causes')):
    f = f'{BASE}/seoul_causes/{u}/catalog.json'
    if not os.path.exists(f): continue
    c = json.load(open(f, encoding='utf-8-sig')); c['unit'] = u
    cs = [{k: x.get(k) for k in ('name', 'cases', 'exams', 'what', 'trigger', 'examples')} for x in c['causes'] if x['cases'] >= 2]
    by_unit[key(c['unit'])] = sorted(cs, key=lambda x: (-x['exams'], -x['cases']))
by_q = collections.defaultdict(list)
for r in rows:
    if r.get('confidence') not in ('high', 'mid') or not r.get('cause') or '판단' in r['cause']: continue
    m = os.path.join(BASE, 'seoul', r['exam'], 'meta.json')
    if not os.path.exists(m): continue
    sid = json.load(open(m, encoding='utf-8')).get('source_db_id')
    if sid: by_q[f"{sid}#{r['no']}"].append({k: r.get(k) for k in ('cause', 'work', 'diverge', 'student_answer', 'correct', 'confidence')})
json.dump({'by_unit': by_unit, 'by_question': by_q}, open(f'{BASE}/real_errors.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('단원', len(by_unit), '· 원인', sum(map(len, by_unit.values())), '· 문항', len(by_q))
