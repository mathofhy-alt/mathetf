# -*- coding: utf-8 -*-
"""내신 문항 중 과목을 벗어난 옮김 판정 재처리 — 과목 단원 안에서만 다시 고르게 (2026-10-19 대표 지시)

  python scripts/types/confirm_cross.py [--par 12]

내신은 파싱 때 과목이 정해진다(source_db_id 마지막 칸). 그 과목에 없는 단원으로 보낸 판정(moves_split.json 의 cross 중 내신)을
(출발 단원, 과목) 묶음마다 작업자 한 명이 다시 본다 — 도착 후보는 그 과목 단원뿐, 없으면 stay. 결과는 moves_final.json 에 덮어 반영.
"""
import os, sys, json, glob, argparse, collections, requests
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__)); BASE = r'C:\mathetf_types'; ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'variant_pipeline')); sys.path.insert(0, ROOT)
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
import run as V
import scratch_report_auto as A

MOCK = ('모의고사', '전국연합', '평가원', '수능', '사관', '경찰')
EXTRA = {'미적분': ['지수함수와로그함수의미분', '삼각함수의미분'], '미적분II': ['지수함수와로그함수의미분', '삼각함수의미분']}


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--par', type=int, default=12); a = ap.parse_args()
    final = json.load(open(os.path.join(BASE, 'moves_final.json'), encoding='utf-8'))
    cross = json.load(open(os.path.join(BASE, 'moves_split.json')))['cross']
    su = json.load(open(os.path.join(BASE, 'subject_units.json'), encoding='utf-8'))
    info = {}
    for j in range(0, len(cross), 80):
        for x in A.get('questions', {'select': 'id,subject,source_db_id,school', 'id': 'in.(' + ','.join(cross[j:j + 80]) + ')'}): info[x['id']] = x
    naesin = [i for i in cross if i in info and not any(k in (info[i]['source_db_id'] or '') + (info[i]['school'] or '') for k in MOCK)]
    groups = collections.defaultdict(list)
    for i in naesin: groups[(final[i]['from'], info[i]['subject'])].append(i)
    tmpl0 = open(os.path.join(HERE, 'prompts', 'confirm.md'), encoding='utf-8').read()
    jobs = []
    for (unit, subj), ids in groups.items():
        D = glob.glob(os.path.join(BASE, '*_' + unit))[0]
        P = {it['id']: it for it in json.load(open(os.path.join(D, 'problems.json'), encoding='utf-8'))}
        allowed = [u for u, n in su.get(subj, {}).items() if n >= 20 and u != unit] + EXTRA.get(subj, [])
        tag = f'cross_{abs(hash(subj)) % 10000}'
        with open(os.path.join(D, f'{tag}_moves.md'), 'w', encoding='utf-8') as f:
            for i in ids: f.write(f"## P{P[i]['n']} · 앞선 판정: {final[i].get('to')}(과목 {subj} 밖이라 무효)\n{P[i]['text']}\n\n")
        p = (tmpl0.replace('{UNIT}', unit).replace('{UNITS}', ', '.join(allowed)).replace('`moves.md`', f'`{tag}_moves.md`').replace('`confirm.json`', f'`{tag}_confirm.json`')
             + f'\n\n## 이번 묶음의 조건 (대표 지시 10/19)\n이 문항들은 **내신 「{subj}」 시험** 문항이다. 학교가 그 과목 범위로 낸 문제이므로 도착 단원은 위 목록(「{subj}」 단원)에서만 고른다. 맞는 단원이 없으면 stay 로 이 단원 유형을 붙인다.\n')
        jobs.append((D, tag, P, ids, p, allowed, {t['code'] for t in json.load(open(os.path.join(D, 'types.json'), encoding='utf-8-sig'))['types']}))
    print('내신 과목 밖 판정', len(naesin), '· 묶음', len(jobs), flush=True)

    def good(j):
        D, tag, P, ids, p, allowed, codes = j
        r = V.load(os.path.join(D, f'{tag}_confirm.json')) or {}
        ok = lambda v: v and ((v.get('action') == 'move' and v.get('to') in allowed) or (v.get('action') == 'stay' and v.get('code') in codes))
        return {i: r[f"P{P[i]['n']}"] for i in ids if ok(r.get(f"P{P[i]['n']}"))}
    for rnd in range(2):
        todo = [j for j in jobs if len(good(j)) < len(j[3])]
        if not todo: break
        with ThreadPoolExecutor(a.par) as ex:
            list(ex.map(lambda j: V.codex(j[0], j[4], f'{j[1]}_r{rnd}', effort='medium'), todo))
    c = collections.Counter(); left = 0
    for j in jobs:
        g = good(j)
        for i, v in g.items():
            final[i] = {'from': final[i]['from'], **v, 'rejudged': 'subject'}; c[v.get('to', '(둔다)')] += 1
        left += len(j[3]) - len(g)
    json.dump(final, open(os.path.join(BASE, 'moves_final.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('재판정', sum(c.values()), '· 남음', left, '·', c.most_common(12), '· 코덱스', f'{V.TOK[0]:,}')


if __name__ == '__main__': main()
