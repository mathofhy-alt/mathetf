# -*- coding: utf-8 -*-
"""광고 문자 일괄 발송 (10/19 마케팅부 — 첫 사용: 2학기 중간고사 원본 시험지 수거)

  python scripts/marketing/send_ad_sms.py scripts/marketing/sms_report_2026_10.txt            # 미리보기만(기본)
  python scripts/marketing/send_ad_sms.py scripts/marketing/sms_report_2026_10.txt --send     # 실제 발송(대표 승인 뒤에만)
  옵션: --persona teacher,student   (역할로 좁히기, 없음=전원)   --test 010xxxxxxxx (그 번호 한 곳에만)

지키는 것(정보통신망법 제50조·시행령 제62조, 솔라피 광고 가이드):
  - 대상 = marketing_agreed 이고 동의문 버전 2026-09-05(문자 매체 고지) 인 회원만 — src/lib/consent.ts 와 같은 규칙
  - 본문은 '(광고)' 로 시작, 무료수신거부 080 번호가 있어야 한다 — 없으면 멈춘다
  - 08:00~21:00(KST) 밖이면 --send 를 거부한다
  - 무료수신거부 = 솔라피 공용 080-500-4233. 거부가 들어오면 솔라피가 그 번호로의 광고를 자동 차단한다.
    ⚠ 우리 DB 의 marketing_agreed 는 자동으로 안 꺼진다(문자는 솔라피가 막아 줌). 이메일까지 끄려면 콘솔 '수신/발신 거부' 목록을 보고 따로.
"""
import argparse, base64, hashlib, hmac, json, os, re, secrets, sys, time
from datetime import datetime, timezone, timedelta
import requests

sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'types'))
from sql_exec import run as sql, env  # noqa: E402

KST = timezone(timedelta(hours=9))
VERSION = '2026-09-05'
FREE_080 = '080-500-4233'
LOG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'logs')

ap = argparse.ArgumentParser()
ap.add_argument('text_file')
ap.add_argument('--send', action='store_true')
ap.add_argument('--persona', default='')
ap.add_argument('--test', default='')
ap.add_argument('--subject', default='(광고) 수학ETF')
ap.add_argument('--retry', default='', help='이전 발송 기록 json — 실패(HTTP 200 아님)한 묶음의 회원에게만 다시')
A = ap.parse_args()

text = open(A.text_file, encoding='utf-8').read().strip()
if not text.startswith('(광고)'): sys.exit('⛔ 본문이 (광고) 로 시작하지 않는다')
if FREE_080 not in text or '무료' not in text: sys.exit(f'⛔ 본문에 무료수신거부 {FREE_080} 표기가 없다')
nbytes = sum(2 if ord(c) > 127 else 1 for c in text)


def auth_header():
    date = datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')
    salt = secrets.token_hex(16)
    sig = hmac.new(env['SOLAPI_API_SECRET'].encode(), (date + salt).encode(), hashlib.sha256).hexdigest()
    return {'Authorization': f"HMAC-SHA256 apiKey={env['SOLAPI_API_KEY']}, date={date}, salt={salt}, signature={sig}",
            'Content-Type': 'application/json'}


def norm(p):
    p = re.sub(r'[^0-9]', '', p or '')
    return p if re.fullmatch(r'01\d{8,9}', p) else ''


# ── 대상 ─────────────────────────────────────────────
if A.test:
    targets = [{'id': '-', 'phone': norm(A.test), 'persona': 'test'}]
    if not targets[0]['phone']: sys.exit('⛔ --test 번호 형식')
else:
    rows = sql(f"""select u.id, coalesce(nullif(u.raw_user_meta_data->>'phone',''), u.phone) phone, coalesce(p.persona,'') persona
        from auth.users u left join public.profiles p on p.id = u.id
        where (u.raw_user_meta_data->>'marketing_agreed')::boolean
          and u.raw_user_meta_data->>'marketing_consent_version' = '{VERSION}'""")
    want = {x for x in A.persona.split(',') if x}
    seen, targets = set(), []
    for r in rows:
        ph = norm(r['phone'])
        if not ph or ph in seen: continue
        if want and r['persona'] not in want: continue
        seen.add(ph); targets.append({'id': r['id'], 'phone': ph, 'persona': r['persona'] or '(없음)'})

if A.retry:   # 10/19 첫 발송이 잔액 부족(402)으로 200명 묶음이 통째로 안 나감 → 그 묶음만 다시
    prev = json.load(open(A.retry, encoding='utf-8'))
    redo, k = set(), 0
    for r in prev['results']:
        if r['status'] != 200: redo.update(prev['targets'][k:k + r['count']])
        k += r['count']
    targets = [t for t in targets if t['id'] in redo]

by = {}
for t in targets: by[t['persona']] = by.get(t['persona'], 0) + 1
kind = 'SMS' if nbytes <= 90 else 'LMS'
print(f'대상 {len(targets)}명  {by}')
print(f'형식 {kind} ({nbytes}바이트)  발신 {env.get("SOLAPI_SENDER_NUMBER", "07079544146")}')
print('─' * 40 + '\n' + text + '\n' + '─' * 40)

if not A.send:
    print('미리보기만 했다. 실제 발송은 --send (대표 승인 뒤).')
    sys.exit(0)

now = datetime.now(KST)
if not (8 <= now.hour < 21): sys.exit(f'⛔ 지금 {now:%H:%M} KST — 광고 문자는 08:00~21:00 에만')

# ── 발송 (200건씩) ─────────────────────────────────────
os.makedirs(LOG_DIR, exist_ok=True)
log = os.path.join(LOG_DIR, f'ad_sms_{now:%Y%m%d_%H%M}.json')
sender = re.sub(r'[^0-9]', '', env.get('SOLAPI_SENDER_NUMBER') or '07079544146')
results = []
for i in range(0, len(targets), 200):
    chunk = targets[i:i + 200]
    msgs = [{'to': t['phone'], 'from': sender, 'text': text, **({'subject': A.subject} if kind == 'LMS' else {})} for t in chunk]
    r = requests.post('https://api.solapi.com/messages/v4/send-many/detail', headers=auth_header(), json={'messages': msgs}, timeout=60)
    body = r.json() if r.headers.get('content-type', '').startswith('application/json') else {'raw': r.text[:500]}
    results.append({'status': r.status_code, 'count': len(chunk), 'body': body})
    print(f'{i + len(chunk)}/{len(targets)}  HTTP {r.status_code}  실패 {len(chunk) if r.status_code != 200 else len(body.get("failedMessageList", []) or [])}  {body.get("errorCode", "")}')
    time.sleep(1)
json.dump({'at': now.isoformat(), 'text': text, 'targets': [t['id'] for t in targets], 'results': results},
          open(log, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('기록', log)
