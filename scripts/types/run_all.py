# -*- coding: utf-8 -*-
"""전 단원 유형 안 일괄 작성 (2026-10-18) — 내보내기 → 조사·합본(draft_types.py), 단원 두 개씩 동시에.

  python scripts/types/run_all.py [--min 150] [--units 집합,명제]

DB 실제 단원 이름(C:\\mathetf_types\\db_units.json, 문항 수 내림차순)을 쓴다. types.json 이 이미 있는 단원은 건너뛴다.
조각 수 = 문항 400개당 1명(최대 6) → 단원 두 개면 코덱스 최대 12개.
"""
import os, sys, json, argparse, subprocess
from concurrent.futures import ThreadPoolExecutor
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
HERE = os.path.dirname(os.path.abspath(__file__)); BASE = r'C:\mathetf_types'
PY = sys.executable

ORDER = ['집합', '명제', '함수', '합성함수와역함수', '유리함수', '무리함수', '평면좌표', '직선의방정식', '원의방정식', '도형의이동', '절대부등식',
         '다항식', '항등식', '복소수', '이차방정식', '이차함수', '여러가지방정식', '여러가지부등식', '순열조합', '행렬',
         '지수', '로그', '지수함수', '로그함수', '삼각함수', '삼각함수그래프', '삼각함수활용', '등차등비수열', '수열의합', '수학적귀납법',
         '함수의극한', '함수의연속', '미분계수와도함수', '도함수의활용', '부정적분', '정적분', '정적분의활용',
         '여러가지순열', '중복조합', '확률', '조건부확률', '확률변수와확률분포', '정규분포', '통계적추정',
         '수열의극한', '급수', '여러가지미분법', '여러가지적분법', '이차곡선', '평면벡터', '공간도형', '공간좌표']


def one(unit, n):
    D = os.path.join(BASE, f'{ORDER.index(unit) + 1:02d}_{unit}')
    if os.path.exists(os.path.join(D, 'types.json')): return unit, '이미 있음'
    os.makedirs(D, exist_ok=True)
    if not os.path.exists(os.path.join(D, 'problems.json')):
        subprocess.run([PY, '-X', 'utf8', os.path.join(HERE, 'export_unit.py'), unit, D], check=False)
    chunks = max(1, min(6, -(-n // 400)))
    with open(os.path.join(D, 'run.log'), 'a', encoding='utf-8') as log:
        subprocess.run([PY, '-X', 'utf8', os.path.join(HERE, 'draft_types.py'), D, unit, '--chunks', str(chunks)], stdout=log, stderr=subprocess.STDOUT)
    ok = os.path.exists(os.path.join(D, 'types.json'))
    print(f"{'완료' if ok else '실패'} {unit} ({n}문항, {chunks}명)", flush=True)
    return unit, ok


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--min', type=int, default=150); ap.add_argument('--units'); ap.add_argument('--par', type=int, default=2)
    a = ap.parse_args()
    cnt = dict(json.load(open(os.path.join(BASE, 'db_units.json'), encoding='utf-8')))
    units = [u for u in ORDER if cnt.get(u, 0) >= a.min]
    if a.units: units = [u for u in units if u in a.units.split(',')]
    with ThreadPoolExecutor(a.par) as ex:
        res = list(ex.map(lambda u: one(u, cnt[u]), units))
    print('끝:', sum(r is True for _, r in res), '완료 ·', [u for u, r in res if r is False], '실패')


if __name__ == '__main__': main()
