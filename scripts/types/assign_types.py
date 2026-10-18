# -*- coding: utf-8 -*-
"""확정된 유형 체계로 문항마다 대표 유형 하나 붙이기 — 코덱스 작업자 (2026-10-18)

  python scripts/types/assign_types.py <작업 폴더> <단원명> [--size 200] [--par 12]

types.json(대표 확정본)·problems.json 이 있어야 한다. 조각마다 작업자 한 명이 assign_K.json 을 쓰고,
빠진 문항은 한 번 더 돌린 뒤 assign.json(문항 id → code·sure·why)으로 모은다. DB 에는 쓰지 않는다.
"""
import os, sys, json, argparse, collections
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'variant_pipeline'))
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
import run as V


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('dir'); ap.add_argument('unit'); ap.add_argument('--size', type=int, default=200); ap.add_argument('--par', type=int, default=12)
    a = ap.parse_args(); D = os.path.abspath(a.dir); os.makedirs(os.path.join(D, 'logs'), exist_ok=True)
    items = json.load(open(os.path.join(D, 'problems.json'), encoding='utf-8'))
    codes = {t['code'] for t in json.load(open(os.path.join(D, 'types.json'), encoding='utf-8-sig'))['types']} | {'X'}
    parts = [items[i:i + a.size] for i in range(0, len(items), a.size)]
    for k, part in enumerate(parts, 1):
        with open(os.path.join(D, f'part_{k}.md'), 'w', encoding='utf-8') as f:
            for it in part:
                f.write(f"## P{it['n']} · 현재 태그 {' '.join(it['tags'])}\n{it['text']}\n\n")
    tmpl = open(os.path.join(HERE, 'prompts', 'assign.md'), encoding='utf-8').read().replace('{UNIT}', a.unit)

    def bad(k):
        r = V.load(os.path.join(D, f'assign_{k}.json')) or {}
        return [it for it in parts[k - 1] if (r.get(f"P{it['n']}") or {}).get('code') not in codes]

    for rnd in range(2):
        todo = [k for k in range(1, len(parts) + 1) if bad(k)]
        if not todo: break
        with ThreadPoolExecutor(a.par) as ex:
            list(ex.map(lambda k: V.codex(D, tmpl.replace('{K}', str(k)), f'assign_{k}_r{rnd}', effort='medium'), todo))
    out, miss = {}, 0
    for k, part in enumerate(parts, 1):
        r = V.load(os.path.join(D, f'assign_{k}.json')) or {}
        for it in part:
            v = r.get(f"P{it['n']}")
            if v and v.get('code') in codes: out[it['id']] = {'p': it['n'], **v}
            else: miss += 1
    json.dump(out, open(os.path.join(D, 'assign.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    c = collections.Counter(v['code'] for v in out.values()); s = collections.Counter(v.get('sure') for v in out.values())
    print('붙임', len(out), '/', len(items), '· 빠짐', miss, '·', dict(sorted(c.items())), '· 확신', dict(s), '· 코덱스', f'{V.TOK[0]:,}', '토큰')


if __name__ == '__main__': main()
