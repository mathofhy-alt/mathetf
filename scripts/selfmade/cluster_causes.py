# -*- coding: utf-8 -*-
"""학생 스캔 오답 사례(wrong_items.json) → 단원별 근거 기반 오답 원인 목록 (10/19, 자체제작부)

  python scripts/selfmade/cluster_causes.py --src C:/selfmade/오답조사/seoul --out C:/selfmade/오답조사/seoul_causes --par 10
  근거 있는 사례만(confidence high·mid, 판단 불가·미응답 제외). 단원 하나 = 코덱스 작업자 하나. 끝나면 _all.json·_all.md 로 합친다.
"""
import os, sys, json, argparse, collections
from concurrent.futures import ThreadPoolExecutor
sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'variant_pipeline'))
import run as V

ap = argparse.ArgumentParser(); ap.add_argument('--src', required=True); ap.add_argument('--out', required=True); ap.add_argument('--par', type=int, default=10)
a = ap.parse_args()
rows = json.load(open(os.path.join(a.src, 'wrong_items.json'), encoding='utf-8'))
ok = [r for r in rows if r.get('confidence') in ('high', 'mid') and r.get('cause') and '판단' not in r['cause'] and '미응답' not in r['cause']]
by = collections.defaultdict(list)
for r in ok: by[r.get('unit') or '?'].append({k: r.get(k) for k in ('exam', 'no', 'type', 'work', 'diverge', 'evidence', 'cause', 'confidence')})
prompt = open(os.path.join(HERE, 'prompts', 'cluster_causes.md'), encoding='utf-8').read()
jobs = []
for unit, items in by.items():
    D = os.path.join(a.out, unit.replace('/', '_')); os.makedirs(os.path.join(D, 'logs'), exist_ok=True)
    json.dump(items, open(os.path.join(D, 'items.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    if not V.load(os.path.join(D, 'catalog.json')): jobs.append(D)
print('단원', len(by), '· 사례', len(ok), '· 할 일', len(jobs), flush=True)
with ThreadPoolExecutor(a.par) as ex: list(ex.map(lambda D: V.codex(D, prompt, 'cluster', effort='medium'), jobs))
allc, md = [], ['# 학생 스캔 근거 오답 원인 목록 (서울)\n']
for unit in sorted(by, key=lambda u: -len(by[u])):
    c = V.load(os.path.join(a.out, unit.replace('/', '_'), 'catalog.json'))
    if not c: md.append(f'## {unit} — 실패\n'); continue
    allc.append(c); md.append(f"## {unit} (사례 {c.get('total_cases')})\n")
    for x in c.get('causes', []): md.append(f"- **{x['name']}** — {x['cases']}건·시험지 {x['exams']} · {x.get('what','')} / 작동 조건: {x.get('trigger','')}")
    md.append('')
json.dump(allc, open(os.path.join(a.out, '_all.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
open(os.path.join(a.out, '_all.md'), 'w', encoding='utf-8').write('\n'.join(md))
print('완료', len(allc), '/', len(by), '· 코덱스', f'{V.TOK[0]:,}')
