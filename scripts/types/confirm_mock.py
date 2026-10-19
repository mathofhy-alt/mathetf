# -*- coding: utf-8 -*-
"""모의고사 문항 옮김 재판정 — 그 회차·형의 출제범위 안에서만 (2026-10-19 대표 지시)

  python scripts/types/confirm_mock.py [--par 16]

범위표: C:\\mathetf_types\\_mock_ranges\\ranges_*.json (코덱스 웹 조사, 회차·형별 allowed_units, basis 확인/추정).
source_db_id 끝 칸(가형·나형·A형·B형·전과목…)으로 형을 고르고, 못 고르면 그 회차 모든 형의 합집합.
옮김(M) 판정이 난 모의고사 문항 전부를 (출발 단원) 묶음으로 다시 본다 → moves_final.json 에 덮어 반영(rejudged: 'mock_range').
"""
import os, sys, json, glob, argparse, collections
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__)); BASE = r'C:\mathetf_types'; ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'variant_pipeline')); sys.path.insert(0, ROOT); sys.path.insert(0, HERE)
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
import run as V
import scratch_report_auto as A
from assign_types import UNITS

MOCK = ('모의고사', '전국연합', '평가원', '수능', '사관', '경찰')


def ranges():
    R = {}
    for f in glob.glob(os.path.join(BASE, '_mock_ranges', 'ranges_*.json')):
        for x in json.load(open(f, encoding='utf-8-sig')):
            R[(x['org'], str(x['year']), x['month'], x['grade'])] = x
    return R


def allowed_for(q, R):
    x = R.get((q['school'], str(q['year']), q['semester'], q['grade']))
    if not x: return None, None
    tail = (q.get('source_db_id') or '').rsplit('_', 1)[-1]
    forms = x.get('forms') or []
    hit = [f for f in forms if f.get('form') and (f['form'] in tail or tail in f['form'])]
    use = hit or forms
    units = sorted({u for f in use for u in f.get('allowed_units', []) if u in UNITS})
    return units, f"{x['org']} {x['year']} {x['month']} {x['grade']} {tail} ({x.get('basis')})"


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--par', type=int, default=16); a = ap.parse_args()
    final = json.load(open(os.path.join(BASE, 'moves_final.json'), encoding='utf-8')); R = ranges()
    ids = [i for i, v in final.items() if v.get('action') == 'move' and v.get('rejudged') != 'subject']
    info = {}
    for j in range(0, len(ids), 80):
        for x in A.get('questions', {'select': 'id,subject,source_db_id,school,year,semester,grade', 'id': 'in.(' + ','.join(ids[j:j + 80]) + ')'}): info[x['id']] = x
    mock = [i for i in ids if i in info and any(k in (info[i]['source_db_id'] or '') + (info[i]['school'] or '') for k in MOCK)]
    groups = collections.defaultdict(list); norange = 0
    for i in mock:
        units, label = allowed_for(info[i], R)
        if units is None: norange += 1; continue
        groups[final[i]['from']].append((i, units, label))
    tmpl0 = open(os.path.join(HERE, 'prompts', 'confirm.md'), encoding='utf-8').read()
    jobs = []
    for unit, rows in groups.items():
        D = glob.glob(os.path.join(BASE, '*_' + unit))[0]
        P = {it['id']: it for it in json.load(open(os.path.join(D, 'problems.json'), encoding='utf-8'))}
        with open(os.path.join(D, 'mock_moves.md'), 'w', encoding='utf-8') as f:
            for i, units, label in rows:
                f.write(f"## P{P[i]['n']} · 시험: {label} · 이 시험의 출제 단원: {', '.join(units)} · 앞선 판정: {final[i].get('to')}\n{P[i]['text']}\n\n")
        p = (tmpl0.replace('{UNIT}', unit).replace('{UNITS}', '(문항마다 적힌 「이 시험의 출제 단원」)').replace('`moves.md`', '`mock_moves.md`').replace('`confirm.json`', '`mock_confirm.json`')
             + '\n\n## 이번 묶음의 조건 (대표 지시 10/19)\n이 문항들은 **모의고사** 문항이다. 문항마다 그 시험(회차·형)의 출제 단원이 적혀 있다. 도착 단원은 **그 목록 안에서만** 고른다(출발 단원은 제외). 맞는 단원이 없으면 stay 로 이 단원 유형을 붙인다.\n')
        allowed = {i: set(u) - {unit} for i, u, _ in rows}
        jobs.append((D, P, rows, p, allowed, {t['code'] for t in json.load(open(os.path.join(D, 'types.json'), encoding='utf-8-sig'))['types']}))
    print('모의 옮김', len(mock), '· 범위표 없음', norange, '· 묶음', len(jobs), flush=True)

    def good(j):
        D, P, rows, p, allowed, codes = j
        r = V.load(os.path.join(D, 'mock_confirm.json')) or {}
        out = {}
        for i, _, _ in rows:
            v = r.get(f"P{P[i]['n']}")
            if v and ((v.get('action') == 'move' and v.get('to') in allowed[i]) or (v.get('action') == 'stay' and v.get('code') in codes)): out[i] = v
        return out
    for rnd in range(2):
        todo = [j for j in jobs if len(good(j)) < len(j[2])]
        if not todo: break
        with ThreadPoolExecutor(a.par) as ex:
            list(ex.map(lambda j: V.codex(j[0], j[3], f'mock_confirm_r{rnd}', effort='medium'), todo))
    c = collections.Counter(); left = 0
    for j in jobs:
        g = good(j)
        for i, v in g.items():
            final[i] = {'from': final[i]['from'], **v, 'rejudged': 'mock_range'}; c[v.get('to', '(둔다)')] += 1
        left += len(j[2]) - len(g)
    json.dump(final, open(os.path.join(BASE, 'moves_final.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('재판정', sum(c.values()), '· 남음', left, '·', c.most_common(15), '· 코덱스', f'{V.TOK[0]:,}')


if __name__ == '__main__': main()
