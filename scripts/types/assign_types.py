# -*- coding: utf-8 -*-
"""확정된 유형 체계로 문항마다 대표 유형 하나 붙이기 — 코덱스 작업자 (2026-10-18, 10/19 전 단원·옮김 표시)

  python scripts/types/assign_types.py --all [--par 14]                 전 단원(types.json 있고 assign.json 없는 곳)
  python scripts/types/assign_types.py --dirs <폴더>,<폴더> [--par 14]

조각(200문항)마다 작업자 한 명이 assign_K.json 을 쓴다. 전 단원 조각을 한 작업자 풀에 넣어 돌리고, 빠진 문항은 한 번 더.
결과는 단원 폴더의 assign.json(문항 id → code·sure·why·move_to). code: T01… / M(다른 단원으로 옮길 문항) / X. DB 에는 쓰지 않는다.
"""
import os, sys, json, glob, argparse, collections
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__)); BASE = r'C:\mathetf_types'
sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'variant_pipeline')); sys.path.insert(0, HERE)
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
import run as V
import run_all as R

SIZE = 200
UNITS = R.ORDER + ['지수함수와로그함수의미분', '삼각함수의미분']   # 뒤 둘은 DB 에 0문항 — 옮겨 올 자리


class Unit:
    def __init__(self, D):
        self.D = D; self.unit = os.path.basename(D).split('_', 1)[1]
        self.items = json.load(open(os.path.join(D, 'problems.json'), encoding='utf-8'))
        self.codes = {t['code'] for t in json.load(open(os.path.join(D, 'types.json'), encoding='utf-8-sig'))['types']} | {'X', 'M'}
        self.parts = [self.items[i:i + SIZE] for i in range(0, len(self.items), SIZE)]
        os.makedirs(os.path.join(D, 'logs'), exist_ok=True)
        for k, part in enumerate(self.parts, 1):
            with open(os.path.join(D, f'part_{k}.md'), 'w', encoding='utf-8') as f:
                for it in part: f.write(f"## P{it['n']} · 현재 태그 {' '.join(it['tags'])}\n{it['text']}\n\n")
        self.tmpl = open(os.path.join(HERE, 'prompts', 'assign.md'), encoding='utf-8').read().replace('{UNIT}', self.unit).replace('{UNITS}', ', '.join(u for u in UNITS if u != self.unit))

    def ok(self, v): return bool(v) and v.get('code') in self.codes and (v['code'] != 'M' or v.get('move_to') in UNITS)

    def bad(self, k):
        r = V.load(os.path.join(self.D, f'assign_{k}.json')) or {}
        return [it for it in self.parts[k - 1] if not self.ok(r.get(f"P{it['n']}"))]

    def collect(self):
        out, miss = {}, 0
        for k, part in enumerate(self.parts, 1):
            r = V.load(os.path.join(self.D, f'assign_{k}.json')) or {}
            for it in part:
                v = r.get(f"P{it['n']}")
                if self.ok(v): out[it['id']] = {'p': it['n'], **v}
                else: miss += 1
        json.dump(out, open(os.path.join(self.D, 'assign.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        c = collections.Counter(v['code'] for v in out.values())
        print(f"단원 {self.unit}: {len(out)}/{len(self.items)} · 빠짐 {miss} · M {c.get('M', 0)} · X {c.get('X', 0)}", flush=True)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--all', action='store_true'); ap.add_argument('--dirs'); ap.add_argument('--par', type=int, default=14)
    a = ap.parse_args()
    dirs = a.dirs.split(',') if a.dirs else sorted(d for d in glob.glob(os.path.join(BASE, '*_*')) if os.path.exists(os.path.join(d, 'types.json')) and not os.path.exists(os.path.join(d, 'assign.json')))
    units = [Unit(d) for d in dirs]
    print('단원', len(units), '· 조각', sum(len(u.parts) for u in units), flush=True)
    for rnd in range(2):
        jobs = [(u, k) for u in units for k in range(1, len(u.parts) + 1) if u.bad(k)]
        if not jobs: break
        with ThreadPoolExecutor(a.par) as ex:
            list(ex.map(lambda j: V.codex(j[0].D, j[0].tmpl.replace('{K}', str(j[1])), f'assign_{j[1]}_r{rnd}', effort='medium'), jobs))
    for u in units: u.collect()
    print('코덱스', f'{V.TOK[0]:,}', '토큰')


if __name__ == '__main__': main()
