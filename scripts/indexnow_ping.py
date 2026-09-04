# -*- coding: utf-8 -*-
"""[IndexNow] 새로 만들어진 URL 을 검색엔진에 즉시 알린다.

왜: 네이버는 2023-07 부터 IndexNow 를 지원한다(우리 주력 유입원).
    지금은 신규 회차를 등록해도 네이버가 알아서 크롤할 때까지 기다려야 한다.
    발견 크롤이 하루 8회뿐이라 수동 색인 요청이 필수였는데, 이걸로 자동화된다.
    ⚠ 구글은 IndexNow 를 지원하지 않는다(2021 검토 후 미채택). 구글에는 아무 효과 없다.

지원: Bing · Yandex · Naver · Seznam · Yep (api.indexnow.org 하나로 전부 전달됨)

사용:
  python scripts/indexnow_ping.py                 # 최근 24시간에 생긴 회차 URL
  python scripts/indexnow_ping.py 72              # 최근 72시간
  python scripts/indexnow_ping.py --urls a.html b.html
  python scripts/indexnow_ping.py 24 --force      # 이미 보낸 것도 다시 보낸다

⚠ 같은 URL 을 하루에 여러 번 보내지 않는다(공식 안내: 내용이 실제로 바뀌었을 때만,
   재제출은 최소 10분 간격). 배치를 하루 두 번 돌리면 첫 배치분이 또 나가므로
   보낸 URL 을 .indexnow-sent.json 에 남겨두고 건너뛴다. 24시간 지나면 다시 허용한다.
"""
import os, re, sys, json, requests, urllib3
from datetime import datetime, timezone, timedelta
urllib3.disable_warnings()
sys.stdout.reconfigure(encoding='utf-8', errors='replace', line_buffering=True)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = 'https://mathetf.com'
HOST = 'mathetf.com'
ENDPOINT = 'https://api.indexnow.org/indexnow'
SENT_LOG = os.path.join(ROOT, '.indexnow-sent.json')
RESEND_AFTER_HOURS = 24   # 이 시간이 지나면 같은 URL 도 다시 보낸다


def load_key() -> str:
    p = os.path.join(ROOT, '.indexnow-key')
    if os.path.exists(p):
        return open(p, encoding='utf-8').read().strip()
    # 키 파일이 public/ 에 있으면 파일명이 곧 키다
    for f in os.listdir(os.path.join(ROOT, 'public')):
        if re.fullmatch(r'[0-9a-fA-F-]{8,128}\.txt', f):
            return f[:-4]
    raise SystemExit('IndexNow 키를 찾지 못했다 (.indexnow-key 또는 public/<key>.txt)')


def db():
    env = {}
    for line in open(os.path.join(ROOT, '.env.local'), encoding='utf-8'):
        m = re.match(r'^\s*([\w.-]+)\s*=\s*(.*)\s*$', line)
        if m: env[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    _o = requests.Session.request
    requests.Session.request = lambda s, *a, **k: _o(s, *a, **{**k, 'verify': False})
    U = env['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/')
    H = {'apikey': env['SUPABASE_SERVICE_ROLE_KEY'],
         'Authorization': 'Bearer ' + env['SUPABASE_SERVICE_ROLE_KEY']}
    return U, H


def recent_urls(hours: int):
    """최근 N시간에 등록된 회차의 상세 URL + 그 학교 페이지."""
    U, H = db()
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    r = requests.get(f'{U}/rest/v1/exam_materials', headers=H, timeout=180, params={
        'select': 'id,school,created_at',
        'file_type': 'eq.PDF', 'content_type': 'eq.해설',
        'created_at': f'gte.{since}', 'order': 'created_at.desc'})
    rows = r.json()
    if not isinstance(rows, list):
        raise SystemExit(f'조회 실패: {str(rows)[:200]}')
    urls = [f'{BASE}/exam/{x["id"]}' for x in rows]
    # 학교 페이지도 내용이 바뀌었다(회차가 늘었다). 중복 제거해서 같이 알린다.
    from urllib.parse import quote
    if rows:
        urls += [f'{BASE}/schools']
    for s in dict.fromkeys(x['school'] for x in rows if x.get('school')):
        urls.append(f'{BASE}/school/{quote(s)}')

    # ⚠ 모의고사는 exam_materials 에 file_type='DB'(개인DB)로만 남아 위 조회에 안 걸린다.
    #   2026-09-04 까지 신규 모의고사 회차가 통째로 통보에서 빠지고 있었다. 따로 훑는다.
    mk = requests.get(f'{U}/rest/v1/mock_exams', headers=H, timeout=180, params={
        'select': 'slug,created_at', 'created_at': f'gte.{since}', 'order': 'created_at.desc'}).json()
    if isinstance(mk, list) and mk:
        urls += [f'{BASE}/mock']
        urls += [f'{BASE}/mock/{quote(x["slug"])}' for x in mk if x.get('slug')]
    return list(dict.fromkeys(urls))


def load_sent() -> dict:
    try:
        return json.load(open(SENT_LOG, encoding='utf-8'))
    except Exception:
        return {}


def save_sent(sent: dict):
    # 오래된 기록은 버린다 — 파일이 무한히 커지지 않게.
    cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    keep = {u: t for u, t in sent.items() if t >= cutoff}
    json.dump(keep, open(SENT_LOG, 'w', encoding='utf-8'), ensure_ascii=False)


def drop_recently_sent(urls, sent):
    """최근 RESEND_AFTER_HOURS 안에 보낸 URL 은 뺀다."""
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=RESEND_AFTER_HOURS)).isoformat()
    fresh = [u for u in urls if sent.get(u, '') < cutoff]
    return fresh, len(urls) - len(fresh)


def ping(urls, key):
    if not urls:
        print('알릴 URL 이 없다'); return 0
    ok = 0
    # 규격상 1회 10,000개까지지만 나눠 보내는 편이 실패 지점을 좁히기 좋다.
    for i in range(0, len(urls), 500):
        chunk = urls[i:i + 500]
        body = {'host': HOST, 'key': key,
                'keyLocation': f'{BASE}/{key}.txt', 'urlList': chunk}
        r = requests.post(ENDPOINT, json=body, timeout=120,
                          headers={'Content-Type': 'application/json; charset=utf-8'})
        # 200=성공 / 202=수신됨(키 검증 대기) / 403=키 미검증 / 422=호스트·키 불일치
        print(f'  {len(chunk)}개 전송 → {r.status_code} {r.text[:120]}')
        if r.status_code in (200, 202): ok += len(chunk)
    return ok


if __name__ == '__main__':
    key = load_key()
    force = '--force' in sys.argv
    argv = [a for a in sys.argv[1:] if a != '--force']
    if '--urls' in argv:
        urls = argv[argv.index('--urls') + 1:]
    else:
        hours = int(argv[0]) if argv and argv[0].isdigit() else 24
        urls = recent_urls(hours)
        print(f'최근 {hours}시간 신규 회차 기준 URL {len(urls)}개')

    sent = load_sent()
    if not force:
        urls, skipped = drop_recently_sent(urls, sent)
        if skipped:
            print(f'  최근 {RESEND_AFTER_HOURS}시간 안에 이미 보낸 {skipped}개는 건너뛴다')

    n = ping(urls, key)
    if n:
        now = datetime.now(timezone.utc).isoformat()
        for u in urls:
            sent[u] = now
        save_sent(sent)
    print(f'{chr(10)}접수됨 {n}/{len(urls)}개')
    # 배치 오케스트레이터가 읽는 형식 — 이게 없으면 '결과 판독 실패' 로 찍힌다.
    print(f'완료: 성공 {n} / 실패 {len(urls) - n}')
    print('※ 구글은 IndexNow 미지원 — 네이버·빙·얀덱스에만 전달된다')