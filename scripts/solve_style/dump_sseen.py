# -*- coding: utf-8 -*-
"""쎈 6권(DB 파싱본) 문제·해설 → 단원별 jsonl (10/20 솔브부 해설 정석 경로 전수조사)

  python scripts/solve_style/dump_sseen.py --out C:/selfmade/쎈조사
"""
import os, sys, json, argparse, collections
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
import similar_rerank_prepare as P

ap = argparse.ArgumentParser(); ap.add_argument('--out', required=True); a = ap.parse_args()
by = collections.defaultdict(list)
for school in ['쎈 공통수학1', '쎈 공통수학2', '쎈 대수', '쎈 미적분I', '쎈 확률과통계', '쎈 기하']:
    off = 0
    while True:
        rows = P.get('questions', {'select': 'id,subject,unit,question_number,source_db_id,difficulty,content_xml',
                                   'school': 'eq.' + school, 'order': 'id', 'limit': 100, 'offset': off})
        if not rows: break
        for r in rows:
            by[(r['subject'], r['unit'] or '?')].append({'id': r['id'], 'src': r['source_db_id'], 'no': r['question_number'],
                                                        'difficulty': r['difficulty'], 'text': P.text_of(r, 3000)})
        off += len(rows)
    print(school, off, flush=True)
for (sub, unit), items in sorted(by.items()):
    D = os.path.join(a.out, sub, unit.replace('/', '_')); os.makedirs(os.path.join(D, 'logs'), exist_ok=True)
    with open(os.path.join(D, 'items.jsonl'), 'w', encoding='utf-8') as f:
        for it in sorted(items, key=lambda x: (x['src'] or '', x['no'] or 0)): f.write(json.dumps(it, ensure_ascii=False) + '\n')
print('단원', len(by), '문항', sum(map(len, by.values())))
