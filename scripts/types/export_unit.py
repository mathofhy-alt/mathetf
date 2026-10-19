# -*- coding: utf-8 -*-
"""유형 체계 다듬기용 단원 문항 내보내기 (2026-10-18)

  python scripts/types/export_unit.py <단원명> <작업 폴더>

공개 문항(시중교재 private 제외)의 발문·해설(수식 복원)·현재 태그·난이도를 problems.md / problems.json 으로 쓴다.
코덱스 작업자가 이 파일만 읽고 유형 안을 만든다. 글 복원은 유사 재정렬 준비 스크립트의 text_of 를 그대로 쓴다.
"""
import os, sys, json, time
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.dirname(HERE))
import similar_rerank_prepare as P

unit, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
meta, off = [], 0
while True:
    r = P.get('questions', {'select': 'id,key_concepts,difficulty,school,year,semester,question_number,subject,work_status',
                            'unit': 'eq.' + unit, 'order': 'id', 'limit': 1000, 'offset': off})
    meta += r; off += 1000
    if len(r) < 1000: break
meta = [x for x in meta if x.get('work_status') != 'private']
text = {}
for j in range(0, len(meta), 40):
    for r in P.get('questions', {'select': 'id,content_xml', 'id': 'in.(' + ','.join(x['id'] for x in meta[j:j + 40]) + ')'}):
        text[r['id']] = P.text_of(r, 600)
    time.sleep(0.3)
items = []
for x in meta:
    t = text.get(x['id'], '')
    if len(t) < 30: continue
    items.append({'n': len(items) + 1, 'id': x['id'], 'src': f"{x.get('school') or ''} {x.get('year') or ''} {x.get('semester') or ''} {x.get('question_number') or ''}번".strip(),
                  'subject': x.get('subject'), 'difficulty': x.get('difficulty'), 'tags': sorted(P.tags(x)), 'text': t})
json.dump(items, open(os.path.join(out, 'problems.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
with open(os.path.join(out, 'problems.md'), 'w', encoding='utf-8') as f:
    f.write(f'# {unit} — 공개 문항 {len(items)}개\n\n')
    for it in items:
        f.write(f"## P{it['n']} · {it['src']} · 난이도 {it['difficulty']} · 현재 태그 {' '.join(it['tags'])}\n{it['text']}\n\n")
print(unit, len(items), '문항 →', out)
