# -*- coding: utf-8 -*-
"""유형 체계 → DB (question_type_defs · question_types) 넣기 (2026-10-19)

  python scripts/types/load_types.py            유형 목록 + 문항 배정 전부(upsert)
  python scripts/types/load_types.py --dry      넣지 않고 개수만

문항 코드: assign.json 의 T코드. M(옮김)은 moves_final.json 이 stay 면 그 코드, move 면 건너뜀(옮긴 뒤 도착 단원에서 따로 배정).
X 는 넣지 않는다(유형 없음 = 정렬 맨 뒤). sort_key = 단원 순서*100 + 유형 순서. 서비스 롤 REST upsert, 요청당 60초 제한.
"""
import os, sys, json, glob, argparse, collections, requests, urllib3
HERE = os.path.dirname(os.path.abspath(__file__)); BASE = r'C:\mathetf_types'; ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, ROOT); sys.path.insert(0, HERE)
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True); urllib3.disable_warnings()
import scratch_report_auto as A
from assign_types import UNITS

UORD = {u: i + 1 for i, u in enumerate(json.load(open(os.path.join(HERE, 'unit_order.json'), encoding='utf-8')))}   # 교과서 순 (10/19)


def post(table, rows):
    for j in range(0, len(rows), 500):
        r = requests.post(f'{A.URL}/rest/v1/{table}', headers={**A.HJ, 'Prefer': 'resolution=merge-duplicates,return=minimal'},
                          data=json.dumps(rows[j:j + 500], ensure_ascii=False).encode(), verify=False, timeout=60)
        if r.status_code >= 300: raise RuntimeError(f'{table} {r.status_code} {r.text[:300]}')


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--dry', action='store_true'); ap.add_argument('--with-moved', action='store_true'); a = ap.parse_args()
    moves = json.load(open(os.path.join(BASE, 'moves_final.json'), encoding='utf-8')) if os.path.exists(os.path.join(BASE, 'moves_final.json')) else {}
    defs, rows, c = [], [], collections.Counter()
    for D in sorted(glob.glob(os.path.join(BASE, '*_*'))):
        if not os.path.exists(os.path.join(D, 'types.json')): continue
        unit = os.path.basename(D).split('_', 1)[1]
        T = json.load(open(os.path.join(D, 'types.json'), encoding='utf-8-sig'))['types']
        tord = {t['code']: k + 1 for k, t in enumerate(T)}
        defs += [{'unit': unit, 'code': t['code'], 'name': t['name'], 'what': t.get('what'), 'ord': tord[t['code']], 'offcur': bool(t.get('offcur'))} for t in T]
        if not os.path.exists(os.path.join(D, 'assign.json')): c['배정 없는 단원'] += 1; continue
        for qid, v in json.load(open(os.path.join(D, 'assign.json'), encoding='utf-8')).items():
            code = v['code']
            if code == 'M':
                m = moves.get(qid)
                if m and m.get('action') == 'stay': code = m['code']
                else: c['옮김 대기'] += 1; continue
            if code not in tord: c['X·기타'] += 1; continue
            rows.append({'question_id': qid, 'unit': unit, 'code': code, 'sure': v.get('sure'), 'sort_key': UORD.get(unit, 99) * 100 + tord[code]}); c['넣음'] += 1
    # 옮긴 문항: 단원 옮김을 DB 에 반영한 뒤(--with-moved) 도착 단원 유형으로 넣는다
    if a.with_moved:
        for D in sorted(glob.glob(os.path.join(BASE, '*_*'))):
            kp, ap_ = os.path.join(D, 'moved_key.json'), os.path.join(D, 'moved_assign.json')
            if not (os.path.exists(kp) and os.path.exists(ap_)): continue
            unit = os.path.basename(D).split('_', 1)[1]
            T = json.load(open(os.path.join(D, 'types.json'), encoding='utf-8-sig'))['types']; tord = {t['code']: k + 1 for k, t in enumerate(T)}
            key = json.load(open(kp, encoding='utf-8')); asg = json.load(open(ap_, encoding='utf-8-sig'))
            for q, qid in key.items():
                v = asg.get(q) or {}
                if v.get('code') in tord:
                    rows.append({'question_id': qid, 'unit': unit, 'code': v['code'], 'sure': v.get('sure'), 'sort_key': UORD.get(unit, 99) * 100 + tord[v['code']]}); c['옮긴 문항 넣음'] += 1
    print('유형', len(defs), '·', dict(c), flush=True)
    if a.dry: return
    post('question_type_defs', defs); post('question_types', rows)
    print('완료')


if __name__ == '__main__': main()
