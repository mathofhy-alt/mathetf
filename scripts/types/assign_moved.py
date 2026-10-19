# -*- coding: utf-8 -*-
"""옮길 문항(moves_apply.json safe)에 도착 단원 유형 붙이기 — DB 반영 전, 로컬 파일만 (2026-10-19)

  python scripts/types/assign_moved.py [--par 16]

도착 단원 폴더에 moved_part.md(출발 단원 problems.json 의 글) → 코덱스가 그 단원 types.json 으로 대표 유형 하나
→ moved_assign.json(P번호 = 'Q'+일련번호). 유형 안이 없는 단원(삼각함수의미분 등, 문항 수 부족)은 건너뛴다.
load_types.py 가 moved_assign.json 을 읽어 도착 단원 기준으로 넣는다(단원 옮김 DB 반영 뒤).
"""
import os, sys, json, glob, argparse, collections
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__)); BASE = r'C:\mathetf_types'
sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'variant_pipeline')); sys.path.insert(0, HERE)
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
import run as V


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--par', type=int, default=16); a = ap.parse_args()
    final = json.load(open(os.path.join(BASE, 'moves_final.json'), encoding='utf-8'))
    safe = json.load(open(os.path.join(BASE, 'moves_apply.json'), encoding='utf-8'))['safe']
    text = {}
    for D in glob.glob(os.path.join(BASE, '*_*')):
        if os.path.exists(os.path.join(D, 'problems.json')):
            for it in json.load(open(os.path.join(D, 'problems.json'), encoding='utf-8')): text[it['id']] = it
    by = collections.defaultdict(list)
    for i in safe: by[final[i]['to']].append(i)
    tmpl0 = open(os.path.join(HERE, 'prompts', 'assign.md'), encoding='utf-8').read()
    jobs, skip = [], 0
    for unit, ids in by.items():
        g = glob.glob(os.path.join(BASE, '*_' + unit))
        if not g or not os.path.exists(os.path.join(g[0], 'types.json')): skip += len(ids); continue
        D = g[0]; os.makedirs(os.path.join(D, 'logs'), exist_ok=True)
        key = {f'Q{k + 1}': i for k, i in enumerate(ids)}
        with open(os.path.join(D, 'moved_part.md'), 'w', encoding='utf-8') as f:
            for q, i in key.items(): f.write(f"## {q} · 다른 단원에서 옮겨 온 문항\n{text[i]['text']}\n\n")
        json.dump(key, open(os.path.join(D, 'moved_key.json'), 'w', encoding='utf-8'))
        p = (tmpl0.replace('{UNIT}', unit).replace('{UNITS}', '(이번에는 쓰지 않음)').replace('`part_{K}.md`', '`moved_part.md`').replace('`assign_{K}.json`', '`moved_assign.json`').replace('P번호', '번호(Q1…)')
             + '\n\n## 이번 묶음의 조건\n이 문항들은 검토를 거쳐 이 단원으로 옮겨 온 문항이다. M 은 쓰지 말고 이 단원 유형 code 하나(맞는 것이 정말 없으면 X)를 붙인다.\n')
        codes = {t['code'] for t in json.load(open(os.path.join(D, 'types.json'), encoding='utf-8-sig'))['types']} | {'X'}
        jobs.append((D, key, p, codes))
    print('옮길 문항', len(safe), '· 유형 안 없는 단원으로 가는 것', skip, '· 묶음', len(jobs), flush=True)
    good = lambda j: sum(((V.load(os.path.join(j[0], 'moved_assign.json')) or {}).get(q) or {}).get('code') in j[3] for q in j[1])
    for rnd in range(2):
        todo = [j for j in jobs if good(j) < len(j[1])]
        if not todo: break
        with ThreadPoolExecutor(a.par) as ex:
            list(ex.map(lambda j: V.codex(j[0], j[2], f'moved_r{rnd}', effort='medium'), todo))
    print('배정', sum(good(j) for j in jobs), '/', sum(len(j[1]) for j in jobs), '· 코덱스', f'{V.TOK[0]:,}')


if __name__ == '__main__': main()
