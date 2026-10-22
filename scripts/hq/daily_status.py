# -*- coding: utf-8 -*-
"""본사 일일 현황 수집 (2026-10-18) — 사장(Claude)이 대표 보고서를 쓰기 전에 돌린다. 숫자만 모으고 판단은 하지 않는다.

  python scripts/hq/daily_status.py [--day 2026-10-18] [--json out.json]

① 홈페이지: 가입(역할별)·시험지 만든 사람·원본제보 대기·재정렬 누적
② 솔브: C:\\gpt_solve 작업 목록 상태별 개수, 원고는 있는데 아직 안 구운 열쇠, 원본 PDF 대기
③ 트랜스: 최근 변형 실행 결과(있으면)
"""
import os, re, sys, json, glob, argparse, datetime as D, collections, requests, urllib3
urllib3.disable_warnings()
try: sys.stdout.reconfigure(encoding='utf-8')
except Exception: pass
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
env = {}
for line in open(os.path.join(ROOT, '.env.local'), encoding='utf-8'):
    m = re.match(r'^\s*([\w.-]+)\s*=\s*(.*)\s*$', line)
    if m: env[m.group(1)] = m.group(2).strip().strip('"').strip("'")
URL = env['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/'); KEY = env['SUPABASE_SERVICE_ROLE_KEY']; H = {'apikey': KEY, 'Authorization': 'Bearer ' + KEY}
KST = D.timezone(D.timedelta(hours=9)); GS = r'C:\gpt_solve'


def get(path, params):
    r = requests.get(f'{URL}/rest/v1/{path}', headers=H, params=params, verify=False, timeout=60); r.raise_for_status(); return r.json()


def homepage(day):
    start = D.datetime.combine(day, D.time(), KST); end = start + D.timedelta(days=1)
    s, e = start.astimezone(D.timezone.utc).isoformat(), end.astimezone(D.timezone.utc).isoformat()
    users, page = [], 1
    while True:
        us = requests.get(URL + '/auth/v1/admin/users', headers=H, params={'page': page, 'per_page': 1000}, verify=False, timeout=60).json().get('users', [])
        users += us; page += 1
        if len(us) < 1000: break
    new = [u for u in users if s <= u['created_at'] < e and not (u.get('email') or '').endswith('mathetf-test.invalid')]
    prof = {}
    ids = [u['id'] for u in new]
    items = get('user_items', {'select': 'user_id,name,created_at', 'type': 'eq.saved_exam', 'created_at': f'gte.{s}', 'and': f'(created_at.lt.{e})'})
    ids += [i['user_id'] for i in items]
    for i in range(0, len(ids), 100):
        for p in get('profiles', {'select': 'id,display_name,persona', 'id': 'in.(' + ','.join(ids[i:i + 100]) + ')'}): prof[p['id']] = p
    persona = collections.Counter((prof.get(u['id'], {}).get('persona') or '미응답') for u in new)
    makers = collections.defaultdict(list)
    for it in items: makers[it['user_id']].append(it['name'])
    reps = get('exam_materials', {'select': 'id,description,created_at', 'content_type': 'eq.원본제보', 'order': 'created_at.desc', 'limit': '400'})
    rewarded = {x['related_id'] for x in get('point_transactions', {'select': 'related_id', 'type': 'eq.submission_reward', 'limit': '5000'}) if x.get('related_id')}
    pend = 0
    for r in reps:
        d = json.loads(r['description'] or '{}')
        if d.get('rejected') or d.get('bulk') and d.get('split') or r['id'] in rewarded: continue
        pend += 1
    st = os.path.join(ROOT, '.cache', 'rerank', 'state.json')
    rerank = len(json.load(open(st, encoding='utf-8'))['done']) if os.path.exists(st) else None
    return {'가입': len(new), '가입_역할': dict(persona),
            '시험지': len(items), '만든사람': [{'이름': prof.get(u, {}).get('display_name') or u[:6], '역할': prof.get(u, {}).get('persona') or '미응답', '시험지': n} for u, n in makers.items()],
            '원본제보_처리대기': pend, '유사재정렬_누적': rerank}


def solve():
    qp = os.path.join(GS, 'tools', 'queue.json')
    if not os.path.exists(qp): return {}
    items = json.load(open(qp, encoding='utf-8'))['items']
    comp = {os.path.splitext(f)[0] for f in os.listdir(os.path.join(GS, 'comp')) if f.endswith('.hwp')}
    status = collections.Counter(it.get('status') for it in items)
    # [10/22] 구운 한글은 comp 에 남지 않고 real → 트라이 → 등록으로 옮겨진다 — comp 만 보면 88장이 '미굽기'로 잘못 잡혔다.
    #   굽기.py 가 남기는 _work/<이름>.hml 이 있으면 구운 것으로 본다. 변형·자체·시험용은 따로 센다.
    work = os.path.join(GS, 'tools', '_work')
    baked = lambda it: it['outname'] in comp or os.path.exists(os.path.join(work, it['outname'] + '.hml'))
    side = lambda it: it['outname'].startswith(('변형', '자체', '솔브시험'))
    drafted = [it for it in items if os.path.exists(os.path.join(GS, 'tools', f"content_{it['key']}.py")) and it.get('status') not in ('대체됨', '삭제')]
    drafted_not_baked = [it['key'] for it in drafted if not baked(it) and not side(it)]
    side_not_baked = [it['key'] for it in drafted if not baked(it) and side(it)]
    waiting = [it['key'] for it in items if not os.path.exists(os.path.join(GS, 'tools', f"content_{it['key']}.py")) and it.get('status') == '대기']
    return {'상태': dict(status), '원고있음_미굽기': drafted_not_baked, '변형·자체_미굽기': side_not_baked, '원고없음_대기': waiting,
            '구운_장': sum(1 for it in drafted if baked(it)), 'comp_남은_한글': len(comp)}


def google():
    """[10/23 대표] 시험지 분석글 배포(10/23 02:07) 뒤 구글 색인 추적 — 매일 보고에 한 줄. 표본 20개만 검사(하루 한도 2,000)."""
    try:
        import random, sys
        sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'gsc'))
        from gsc import service
        s = service(interactive=False); site = 'https://mathetf.com/'
        # 사이트맵 '읽은 날'은 보지 않는다 — 제출하면 바로 받아 가서 신호가 아니다(10/23 대표 정정)
        idx = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'exam_long', 'index_cache.json'), encoding='utf-8'))
        random.seed(20261023); sample = random.sample(sorted(idx), min(20, len(idx)))   # 매일 같은 표본 — 변화만 보이게
        cov = collections.Counter()
        for eid in sample:
            r = s.urlInspection().index().inspect(body={'inspectionUrl': f'https://mathetf.com/exam/{eid}', 'siteUrl': site}).execute()
            cov[r['inspectionResult']['indexStatusResult'].get('coverageState', '?')] += 1
        end = D.datetime.now(KST).date() - D.timedelta(days=3)   # 검색 실적은 2~3일 늦게 잡힌다
        rows = s.searchanalytics().query(siteUrl=site, body={'startDate': str(end - D.timedelta(days=6)), 'endDate': str(end),
                                                              'dimensions': ['page'], 'rowLimit': 1000}).execute().get('rows', [])
        ex = [r for r in rows if '/exam/' in r['keys'][0]]
        return {'분석글_시험지_표본20_색인상태': dict(cov),
                f'최근7일({end - D.timedelta(days=6)}~{end})_시험지페이지': {'노출된_페이지': len(ex), '노출': int(sum(r['impressions'] for r in ex)), '클릭': int(sum(r['clicks'] for r in ex))}}
    except Exception as e:
        return {'오류': str(e)[:150] + ' (토큰 만료면 대표 재로그인: python scripts/gsc/gsc.py)'}


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--day'); ap.add_argument('--json'); a = ap.parse_args()
    day = D.date.fromisoformat(a.day) if a.day else D.datetime.now(KST).date()
    out = {'날짜': str(day), '홈페이지': homepage(day), '솔브': solve(), '구글_색인': google()}
    s = json.dumps(out, ensure_ascii=False, indent=1)
    if a.json: open(a.json, 'w', encoding='utf-8').write(s)
    print(s)


if __name__ == '__main__': main()
