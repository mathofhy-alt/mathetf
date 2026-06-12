# -*- coding: utf-8 -*-
"""
전국 고등학교(2,340개) 네이버 월간 검색량 조회 → CSV.

- schools 테이블에서 학교명 로드
- 각 학교: 정식명(개포고등학교) + 축약형(개포고 / 경기여고) 두 형태 조회
- 네이버 검색광고 키워드도구 API (무료) — 5개씩 묶어 호출
- 결과: 학교검색량.csv (검색량 합계 내림차순, 엑셀에서 바로 열림)

사용:
    python scripts/naver_school_volume.py             # 전체
    python scripts/naver_school_volume.py --limit 10  # 테스트
"""
import base64, csv, hashlib, hmac, os, re, sys, time
import requests

def load_env():
    env = {}
    path = os.path.join(os.path.dirname(__file__), '..', '.env.local')
    with open(path, encoding='utf-8') as f:
        for line in f:
            m = re.match(r'^\s*([\w.-]+)\s*=\s*(.*)\s*$', line)
            if m:
                env[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    return env

ENV = load_env()
SB_URL = ENV['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/')
SB_KEY = ENV['SUPABASE_SERVICE_ROLE_KEY']
AD_KEY = ENV['NAVER_AD_API_KEY']
AD_SECRET = ENV['NAVER_AD_SECRET']
AD_CUSTOMER = ENV['NAVER_AD_CUSTOMER_ID']

BASE = 'https://api.searchad.naver.com'
URI = '/keywordstool'

def signature(ts: str, method: str, uri: str) -> str:
    msg = f'{ts}.{method}.{uri}'
    digest = hmac.new(AD_SECRET.encode(), msg.encode(), hashlib.sha256).digest()
    return base64.b64encode(digest).decode()

def fetch_volumes(keywords):
    """키워드 최대 5개 → {키워드: (pc, mobile)} (조회 실패 키워드는 누락)"""
    ts = str(int(time.time() * 1000))
    headers = {
        'X-Timestamp': ts,
        'X-API-KEY': AD_KEY,
        'X-Customer': AD_CUSTOMER,
        'X-Signature': signature(ts, 'GET', URI),
    }
    params = {'hintKeywords': ','.join(keywords), 'showDetail': '1'}
    r = requests.get(BASE + URI, headers=headers, params=params, timeout=15)
    if r.status_code == 429:
        raise RuntimeError('rate-limited')
    r.raise_for_status()
    out = {}
    wanted = {k.replace(' ', '').upper() for k in keywords}
    for item in r.json().get('keywordList', []):
        kw = item.get('relKeyword', '')
        if kw.replace(' ', '').upper() in wanted:
            def num(v):
                # 검색량 적으면 "< 10" 문자열로 옴 → 5로 간주
                if isinstance(v, str):
                    return 5 if '<' in v else int(re.sub(r'\D', '', v) or 0)
                return int(v or 0)
            out[kw] = (num(item.get('monthlyPcQcCnt')), num(item.get('monthlyMobileQcCnt')))
    return out

def short_name(name: str) -> str:
    """개포고등학교→개포고, 경기여자고등학교→경기여고 (실검색 패턴)"""
    s = name.replace('여자고등학교', '여고').replace('고등학교', '고')
    return s if s != name else ''

def load_schools(limit=None):
    rows, start, step = [], 0, 1000
    h = {'apikey': SB_KEY, 'Authorization': f'Bearer {SB_KEY}'}
    while True:
        r = requests.get(f'{SB_URL}/rest/v1/schools', headers=h,
                         params={'select': 'name,region,district', 'order': 'name',
                                 'offset': str(start), 'limit': str(step)})
        r.raise_for_status()
        chunk = r.json()
        rows.extend(chunk)
        if len(chunk) < step:
            break
        start += step
    if limit:
        rows = rows[:limit]
    return rows

def main():
    limit = None
    if '--limit' in sys.argv:
        limit = int(sys.argv[sys.argv.index('--limit') + 1])

    schools = load_schools(limit)
    print(f'학교 {len(schools)}개 로드')

    # 조회할 키워드 목록 (정식명 + 축약형, 중복 제거)
    kw_set, kw_owner = [], {}   # kw_owner: 키워드 → (학교 인덱스, 'full'|'short')
    for i, s in enumerate(schools):
        full = s['name'].replace(' ', '')
        kw_owner.setdefault(full, []).append((i, 'full'))
        sh = short_name(s['name']).replace(' ', '')
        if sh:
            kw_owner.setdefault(sh, []).append((i, 'short'))
    kw_set = list(kw_owner.keys())
    print(f'조회 키워드 {len(kw_set)}개 (5개씩 {(len(kw_set)+4)//5}회 호출)')

    volumes = {}
    failed = []
    for i in range(0, len(kw_set), 5):
        batch = kw_set[i:i+5]
        for attempt in range(3):
            try:
                volumes.update(fetch_volumes(batch))
                break
            except Exception as e:
                if attempt == 2:
                    failed.extend(batch)
                    print(f'  FAIL {batch}: {e}')
                else:
                    time.sleep(2 + attempt * 3)
        done = min(i + 5, len(kw_set))
        if done % 250 < 5:
            print(f'  진행 {done}/{len(kw_set)}')
        time.sleep(0.35)

    # 학교별 집계
    results = []
    for i, s in enumerate(schools):
        full = s['name'].replace(' ', '')
        sh = short_name(s['name']).replace(' ', '')
        fp, fm = volumes.get(full, (0, 0))
        sp, sm = volumes.get(sh, (0, 0)) if sh else (0, 0)
        total = fp + fm + sp + sm
        results.append({
            '학교명': s['name'], '지역': s['region'], '구군': s['district'],
            '정식명_PC': fp, '정식명_모바일': fm,
            '축약형': sh, '축약형_PC': sp, '축약형_모바일': sm,
            '월간합계': total,
        })
    results.sort(key=lambda x: -x['월간합계'])

    out = os.path.join(os.path.dirname(__file__), '..', '학교검색량.csv')
    with open(out, 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.DictWriter(f, fieldnames=list(results[0].keys()))
        w.writeheader()
        w.writerows(results)
    print(f'\n저장: 학교검색량.csv ({len(results)}개 학교)')
    if failed:
        print(f'조회 실패 키워드 {len(failed)}개 (재실행하면 다시 시도됨)')
    print('\nTOP 10:')
    for r in results[:10]:
        print(f"  {r['월간합계']:>8,}  {r['학교명']} ({r['지역']} {r['구군']})")

if __name__ == '__main__':
    main()
