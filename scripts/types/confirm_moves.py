# -*- coding: utf-8 -*-
"""옮김(M) 표시 문항 재판정 — 단원마다 코덱스 작업자 한 명 (2026-10-19)

  python scripts/types/confirm_moves.py [--par 20]

단원 폴더의 assign.json 에서 code M 인 문항을 moves.md 로 모아 작업자가 move(정확한 도착 단원)/stay(이 단원 유형)로 다시 정한다.
결과: confirm.json(P번호 기준) → assign.json 에 반영하지 않고 moves_final.json(id → action·to/code)으로 모은다. DB 에는 쓰지 않는다.
"""
import os, sys, json, glob, argparse, collections
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__)); BASE = r'C:\mathetf_types'
sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'variant_pipeline')); sys.path.insert(0, HERE)
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
import run as V
from assign_types import UNITS


def prep(D):
    unit = os.path.basename(D).split('_', 1)[1]
    P = {it['id']: it for it in json.load(open(os.path.join(D, 'problems.json'), encoding='utf-8'))}
    M = {i: v for i, v in json.load(open(os.path.join(D, 'assign.json'), encoding='utf-8')).items() if v['code'] == 'M'}
    if not M: return None
    with open(os.path.join(D, 'moves.md'), 'w', encoding='utf-8') as f:
        for i, v in M.items():
            f.write(f"## P{P[i]['n']} · 앞선 판정: {v.get('move_to')} — {v.get('why', '')}\n{P[i]['text']}\n\n")
    tmpl = open(os.path.join(HERE, 'prompts', 'confirm.md'), encoding='utf-8').read().replace('{UNIT}', unit).replace('{UNITS}', ', '.join(u for u in UNITS if u != unit))
    codes = {t['code'] for t in json.load(open(os.path.join(D, 'types.json'), encoding='utf-8-sig'))['types']}
    return D, unit, P, M, tmpl, codes


def good(job):
    D, unit, P, M, tmpl, codes = job
    r = V.load(os.path.join(D, 'confirm.json')) or {}
    def ok(v): return v and ((v.get('action') == 'move' and v.get('to') in UNITS and v.get('to') != unit) or (v.get('action') == 'stay' and v.get('code') in codes))
    return {i: r.get(f"P{P[i]['n']}") for i in M if ok(r.get(f"P{P[i]['n']}"))}


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--par', type=int, default=20); a = ap.parse_args()
    jobs = [j for j in (prep(d) for d in sorted(glob.glob(os.path.join(BASE, '*_*'))) if os.path.exists(os.path.join(d, 'assign.json'))) if j]
    print('단원', len(jobs), '· 문항', sum(len(j[3]) for j in jobs), flush=True)
    for rnd in range(2):
        todo = [j for j in jobs if len(good(j)) < len(j[3])]
        if not todo: break
        with ThreadPoolExecutor(a.par) as ex:
            list(ex.map(lambda j: V.codex(j[0], j[4], f'confirm_r{rnd}', effort='medium'), todo))
    final, c = {}, collections.Counter()
    for j in jobs:
        g = good(j)
        for i, v in g.items():
            final[i] = {'from': j[1], **v}; c[(j[1], v['to']) if v['action'] == 'move' else (j[1], '(둔다)')] += 1
        if len(g) < len(j[3]): print('빠짐', j[1], len(j[3]) - len(g))
    json.dump(final, open(os.path.join(BASE, 'moves_final.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    mv = sum(n for (s, t), n in c.items() if t != '(둔다)')
    print('옮김', mv, '· 둠', len(final) - mv, '· 코덱스', f'{V.TOK[0]:,}', '토큰')
    for (s, t), n in c.most_common(40): print(f'{n:4d}  {s} > {t}')


if __name__ == '__main__': main()
