# -*- coding: utf-8 -*-
"""[시험지출제 퍼널] 진입→DB선택→검색→담기→저장 단계별 이탈.
2026-08-26 로깅 시작. 그 전 데이터는 없으므로 시작일 이후만 집계한다.
사용: python scratch_qb_funnel.py [일수]   (기본 7)"""
import re, sys, time
import sys as _s
try: _s.stdout.reconfigure(encoding='utf-8', errors='replace', line_buffering=True)
except Exception: pass
import requests
import urllib3 as _u; _u.disable_warnings()
from datetime import datetime, timezone, timedelta

env = {}
for line in open('.env.local', encoding='utf-8'):
    m = re.match(r'^\s*([\w.-]+)\s*=\s*(.*)\s*$', line)
    if m: env[m.group(1)] = m.group(2).strip().strip('"').strip("'")
U = env['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/'); K = env['SUPABASE_SERVICE_ROLE_KEY']
H = {'apikey': K, 'Authorization': 'Bearer ' + K}
S = requests.Session()
KST = timezone(timedelta(hours=9))
EX = {'mathofhy@naver.com', 'mathofhy@gmail.com', 'sumisa3@naver.com'}
DAYS = int(sys.argv[1]) if len(sys.argv) > 1 else 7
START = max(datetime(2026, 8, 26, tzinfo=KST), datetime.now(KST) - timedelta(days=DAYS))

STEPS = [('qb_enter', '① 페이지 진입'), ('qb_db_select', '② DB 선택'),
         ('qb_search', '③ 문제 검색'), ('qb_cart_add', '④ 장바구니 담기'),
         ('qb_save', '⑤ 시험지 저장')]


def page(tbl, params):
    out = []; st = 0
    while True:
        got = None
        for i in range(4):
            try:
                r = S.get(f'{U}/rest/v1/{tbl}', headers={**H, 'Range': f'{st}-{st+999}'},
                          params=params, verify=False, timeout=180)
                if r.status_code in (200, 206):
                    j = r.json()
                    if isinstance(j, list): got = j; break
            except Exception: pass
            time.sleep(2 * 2 ** i)
        if got is None: break
        out += got
        if len(got) < 1000: break
        st += 1000
    return out


rows = page('feature_usage', {'select': 'feature,title,user_email,created_at',
                              'created_at': f'gte.{START.astimezone(timezone.utc).isoformat()}'})
rows = [x for x in rows if (x.get('user_email') or '').lower() not in EX
        and not (x.get('user_email') or '').lower().startswith(('test', 'tester'))]

users = {}
for x in rows:
    users.setdefault(x['feature'], set()).add((x.get('user_email') or '').lower())

print(f'=== 시험지출제 퍼널 · {START.strftime("%m/%d")} ~ 오늘 ===\n')
top = len(users.get('qb_enter', set()))
if top == 0:
    print('  아직 데이터가 없습니다. 배포 후 사용자가 시험지출제 페이지에 들어가야 쌓입니다.')
    raise SystemExit
prev = None
for f, label in STEPS:
    n = len(users.get(f, set()))
    pct = n * 100 // max(top, 1)
    bar = '█' * max(0, round(n / max(top, 1) * 34))
    drop = f'  ↓ {prev-n}명 이탈 ({(prev-n)*100//max(prev,1)}%)' if prev is not None and prev >= n else ''
    print(f'  {label:<14} {n:>4}명 {pct:>3}%  {bar}')
    if drop: print(f'  {"":<14} {drop}')
    prev = n

blocked = [x for x in rows if x['feature'] == 'qb_search' and (x.get('title') or '').startswith('blocked')]
if blocked:
    print(f'\n  ⚠ DB 안 고르고 검색 누름: {len(set((x.get("user_email") or "") for x in blocked))}명')
fails = [x for x in rows if x['feature'] == 'qb_save_fail']
if fails:
    print(f'  ⚠ 저장 실패: {len(fails)}건')
    from collections import Counter
    for t, c in Counter((x.get('title') or '?')[:60] for x in fails).most_common(5):
        print(f'      {c}회  {t}')
