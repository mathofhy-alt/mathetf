# -*- coding: utf-8 -*-
"""[시즌 이메일] 수신동의 회원에게 신규 기출 소식을 보낸다.

법적 필수 (정보통신망법 제50조) — 아래 넷은 코드에서 강제한다:
  1) 제목 맨 앞에 (광고)
  2) 본문에 수신거부 방법 (토큰 링크, 로그인 불필요)
  3) 전송자 명칭·연락처
  4) 야간(21:00~08:00) 미발송  ← 야간 수신동의를 받은 적이 없어 아예 안 보낸다

⚠ 대상 선정은 반드시 src/lib/consent.ts 의 규칙과 같아야 한다.
  2026-09-05 이전 문구로 동의한 회원은 매체가 고지되지 않았으므로 **이메일만** 허용된다.
  (그 이후 동의자는 marketing_consent_version = '2026-09-05')
  여기서는 이메일만 보내므로 marketing_agreed 만 보면 되지만, SMS 로 확장할 때
  이 함수를 반드시 거치도록 남겨둔다.

⚠ Resend 무료 한도: 하루 100통 / 월 3,000통. 239명(2026-09-12)이면 사흘에 나눠 보낸다.
  email_sends 표가 보낸 사람을 기억하므로 다음 날 같은 명령을 다시 돌리면 이어서 간다.

사용:
  python scripts/send_season_mail.py --dry                 # 미리보기 (아무것도 안 보냄)
  python scripts/send_season_mail.py --dry --show 3        # 본문 3명분 출력
  python scripts/send_season_mail.py --limit 100           # 실제 발송 (하루 상한)
  python scripts/send_season_mail.py --test me@x.com       # 나에게만 1통
"""
import os
import re
import sys
import html
import time
import hmac
import base64
import hashlib
import argparse
from datetime import datetime, timezone, timedelta

import requests
import urllib3

urllib3.disable_warnings()
sys.stdout.reconfigure(encoding='utf-8', errors='replace', line_buffering=True)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = 'https://mathetf.com'
CAMPAIGN = '2026-09-season'
KST = timezone(timedelta(hours=9))
SEND_FROM = '수학ETF <noreply@mathetf.com>'
REPLY_TO = 'mathetf.team@gmail.com'

env = {}
for line in open(os.path.join(ROOT, '.env.local'), encoding='utf-8'):
    m = re.match(r'^\s*([\w.-]+)\s*=\s*(.*)\s*$', line)
    if m:
        env[m.group(1)] = m.group(2).strip().strip('"').strip("'")
U = env['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/')
KEY = env['SUPABASE_SERVICE_ROLE_KEY']
RESEND = env.get('RESEND_API_KEY', '').strip()
H = {'apikey': KEY, 'Authorization': 'Bearer ' + KEY}
HJ = {**H, 'Content-Type': 'application/json'}

ap = argparse.ArgumentParser()
ap.add_argument('--dry', action='store_true')
ap.add_argument('--show', type=int, default=0)
ap.add_argument('--limit', type=int, default=100)
ap.add_argument('--test', default=None)
ap.add_argument('--force-night', action='store_true', help='야간 차단 무시 (테스트 전용)')
A = ap.parse_args()


def get_all(table, params):
    """⚠ 조회가 실패하면 조용히 빈 목록으로 넘어가면 안 된다.
    email_sends 표가 없는데 [] 로 처리되면 '아무도 안 받았다'가 되어 전원에게 중복 발송된다."""
    out, off = [], 0
    while True:
        r = requests.get(f'{U}/rest/v1/{table}', headers={**H, 'Range': f'{off}-{off+999}'},
                         params=params, timeout=180, verify=False).json()
        if isinstance(r, dict):
            sys.exit(f'⛔ {table} 조회 실패 — 발송을 중단한다: {str(r)[:200]}')
        if not r:
            break
        out += r
        if len(r) < 1000:
            break
        off += 1000
    return out


def unsub_token(user_id: str) -> str:
    sig = hmac.new(KEY.encode(), user_id.encode(), hashlib.sha256).digest()
    return f"{user_id}.{base64.urlsafe_b64encode(sig).decode().rstrip('=')}"


# ── 1. 야간 차단 ─────────────────────────────────────────────
now = datetime.now(KST)
if not A.dry and not A.force_night and not (8 <= now.hour < 21):
    print(f'⛔ 지금은 {now:%H:%M} (KST). 광고성 정보는 21:00~08:00 에 보낼 수 없다.')
    print('   야간 수신동의를 받은 적이 없어 아예 보내지 않는다. 낮에 다시 실행할 것.')
    sys.exit(2)

# ── 2. 대상: 수신동의 회원 ────────────────────────────────────
users, page = [], 1
while True:
    b = requests.get(f'{U}/auth/v1/admin/users', headers=H,
                     params={'page': page, 'per_page': 200}, timeout=120, verify=False).json().get('users', [])
    if not b:
        break
    users += b
    if len(b) < 200:
        break
    page += 1
agreed = [u for u in users
          if (u.get('user_metadata') or {}).get('marketing_agreed') and u.get('email')]
print(f'전체 회원 {len(users)} · 수신동의 {len(agreed)}')

sent_rows = get_all('email_sends', {'select': 'user_id', 'campaign': f'eq.{CAMPAIGN}', 'status': 'eq.sent'})
already = {x['user_id'] for x in sent_rows}
targets = [u for u in agreed if u['id'] not in already]
if A.test:
    targets = [u for u in agreed if u['email'] == A.test] or [u for u in users if u['email'] == A.test]
    if not targets:
        sys.exit(f'--test 대상 없음: {A.test}')
print(f'이미 보낸 사람 {len(already)} · 이번 대상 {len(targets)}')

# ── 3. 개인화 재료 ───────────────────────────────────────────
# 관심 학교는 '보관함'이 아니라 **무료PDF 를 실제로 받아간 학교**로 본다.
# PERSONAL_DB_FREE_MODE 때문에 보관함에는 전 학교가 자동 동기화돼 있어 관심 신호가 못 된다.
fu = get_all('feature_usage', {'select': 'user_email,title', 'feature': 'eq.free_pdf'})
liked = {}
popular = {}          # 학교 → 무료PDF 다운로드 수. 관심 신호가 없는 사람의 폴백 기준이다.
for x in fu:
    t = (x.get('title') or '')
    em = x.get('user_email')
    if t and '_' in t:
        sc = t.split('_')[0]
        popular[sc] = popular.get(sc, 0) + 1
        if em:
            liked.setdefault(em, []).append(sc)

since = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
recent = get_all('exam_materials', {
    'select': 'id,school,exam_year,grade,semester,exam_type,subject,created_at',
    'content_type': 'eq.해설', 'file_type': 'eq.PDF',
    'created_at': f'gte.{since}', 'order': 'created_at.desc'})
def in_season(r):
    """제목이 '2학기 중간고사 대비'다. 그 회차를 먼저 보여야 말과 내용이 맞는다."""
    return str(r.get('semester')) == '2' and r.get('exam_type') == '중간고사'


def _desc(ts):
    """문자열 날짜를 내림차순 정렬키로. 최근 등록분이 먼저 와야 '새 기출'이 맞다."""
    return tuple(-ord(c) for c in (ts or ''))


def rank(r):
    # 시즌 회차 먼저, 그다음 최신 연도, 그다음 최근 등록순
    try:
        y = -int(r.get('exam_year') or 0)
    except (TypeError, ValueError):
        y = 0
    return (0 if in_season(r) else 1, y, _desc(r.get('created_at')))



recent.sort(key=rank)
by_school = {}
for r in recent:
    by_school.setdefault(r['school'], []).append(r)

# 폴백 목록은 학교를 겹치지 않게 5곳 — 한 학교 5회차보다 다섯 학교가 고를 거리가 많다.
# 순서는 '무료PDF 를 많이 받아간 학교' 순. 등록 순서대로 두면 그날 작업한 지역(예: 대전)만
# 다섯 줄이 나가 다른 지역 수신자에겐 아무 쓸모가 없다.
season_rows = [r for r in recent if in_season(r)] or recent
newest, seen_school = [], set()
for r in sorted(season_rows, key=lambda x: (-popular.get(x['school'], 0), rank(x))):
    if r['school'] in seen_school:
        continue
    seen_school.add(r['school'])
    newest.append(r)
    if len(newest) == 5:
        break
print(f'최근 30일 신규 회차 {len(recent)}건 · 학교 {len(by_school)}곳 '
      f'(2학기 중간 {sum(1 for r in recent if in_season(r))}건)')


def rows_for(email):
    """이 사람이 받아간 학교의 신규 회차. 없으면 최근 등록분으로 대체."""
    picked, seen = [], set()
    for sc in dict.fromkeys(liked.get(email, [])):
        for r in by_school.get(sc, []):
            if r['id'] in seen:
                continue
            seen.add(r['id'])
            picked.append(r)
    picked.sort(key=rank)          # 그 사람 학교 안에서도 시즌 회차가 먼저
    return (picked[:5], True) if picked else (newest, False)


def label(r):
    return (f"{r['school']} {r['exam_year']}년 {r['grade']}학년 "
            f"{r['semester']}학기 {r['exam_type']} {r.get('subject') or ''}").strip()


def build(u):
    email = u['email']
    name = (u.get('user_metadata') or {}).get('full_name') or email.split('@')[0]
    items, personal = rows_for(email)
    tok = unsub_token(u['id'])
    lis = ''.join(
        f'<li style="margin:0 0 10px"><a href="{BASE}/exam/{r["id"]}?utm_source=email&utm_campaign={CAMPAIGN}" '
        f'style="color:#2F5A92;font-weight:600;text-decoration:none">{html.escape(label(r))}</a></li>'
        for r in items)
    lead = (f'{html.escape(name)}님이 받아보신 학교에 새 기출이 올라왔어요.'
            if personal else '최근 새로 올라온 기출이에요.')
    subject = '(광고) 2학기 중간고사 대비 새 기출이 올라왔어요 · 수학ETF'
    body = f"""<div style="font-family:'Apple SD Gothic Neo',system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1E2D4F">
  <p style="font-size:13px;color:#64798E;margin:0 0 18px">수학ETF</p>
  <h1 style="font-size:20px;font-weight:800;margin:0 0 10px;line-height:1.4">2학기 중간고사 대비 새 기출</h1>
  <p style="font-size:15px;line-height:1.7;margin:0 0 18px">{lead}</p>
  <ul style="padding-left:18px;margin:0 0 22px;font-size:15px;line-height:1.6">{lis}</ul>
  <p style="margin:0 0 24px">
    <a href="{BASE}/question-bank?utm_source=email&utm_campaign={CAMPAIGN}"
       style="display:inline-block;background:#497AB7;color:#fff;font-weight:700;padding:12px 20px;border-radius:10px;text-decoration:none">
      기출로 시험지 만들기 →</a>
  </p>
  <p style="font-size:13px;line-height:1.7;color:#5B6E82;margin:0 0 22px;padding:14px;background:#F1F4F8;border-radius:10px">
    학교 프린트를 올리면 같은 유형 기출을 찾아 드려요.
    <a href="{BASE}/print-transform?utm_source=email&utm_campaign={CAMPAIGN}" style="color:#2F5A92;font-weight:700">학교프린트 변형만들기 →</a>
  </p>
  <hr style="border:none;border-top:1px solid #D2DCE7;margin:0 0 14px">
  <p style="font-size:12px;line-height:1.7;color:#8698A9;margin:0">
    이 메일은 마케팅 정보 수신에 동의하신 분께만 발송됩니다.<br>
    수학ETF · 대표자 허연 · 사업자등록번호 653-71-00575 · 고객센터 070-7954-4146 · {REPLY_TO}<br>
    <a href="{BASE}/unsubscribe?t={tok}" style="color:#64798E;text-decoration:underline">수신거부</a>
  </p>
</div>"""
    return subject, body, personal


# ── 4. 미리보기 ──────────────────────────────────────────────
if A.dry:
    p = sum(1 for u in targets if rows_for(u['email'])[1])
    print(f'\n[미리보기] 보낼 대상 {len(targets)}명 · 개인화 가능 {p}명 · 최근분 대체 {len(targets)-p}명')
    print(f'제목: (광고) 2학기 중간고사 대비 새 기출이 올라왔어요 · 수학ETF')
    for u in targets[:A.show]:
        s, b, per = build(u)
        txt = re.sub(r'<[^>]+>', ' ', b)
        print(f"\n─── {u['email']} ({'개인화' if per else '최근분'}) ───")
        print(re.sub(r'\s+', ' ', txt).strip()[:520])
    print('\n(아무것도 보내지 않았다. 실제 발송은 --limit)')
    sys.exit(0)

if not RESEND:
    sys.exit('⛔ .env.local 에 RESEND_API_KEY 가 없다. 발송할 수 없다.')

# ── 5. 발송 ─────────────────────────────────────────────────
ok = fail = 0
for u in targets[:A.limit]:
    subject, body, _ = build(u)
    try:
        r = requests.post('https://api.resend.com/emails',
                          headers={'Authorization': f'Bearer {RESEND}', 'Content-Type': 'application/json'},
                          json={'from': SEND_FROM, 'to': [u['email']], 'subject': subject,
                                'html': body, 'reply_to': REPLY_TO,
                                # 메일 클라이언트의 '구독 해지' 버튼 — 스팸 신고 대신 이걸 누르게 한다
                                'headers': {'List-Unsubscribe': f'<{BASE}/unsubscribe?t={unsub_token(u["id"])}>',
                                            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'}},
                          timeout=60, verify=False)
        good = r.status_code < 300
        pid = (r.json() or {}).get('id') if good else None
        requests.post(f'{U}/rest/v1/email_sends', headers=HJ, timeout=60, verify=False, json={
            'campaign': CAMPAIGN, 'user_id': u['id'], 'email': u['email'],
            'status': 'sent' if good else 'failed', 'provider_id': pid,
            'error': None if good else r.text[:300]})
        if good:
            ok += 1
        else:
            fail += 1
            print(f"  ⚠ 실패 {u['email']}: {r.status_code} {r.text[:120]}")
    except Exception as e:
        fail += 1
        print(f"  ⚠ 예외 {u['email']}: {type(e).__name__} {str(e)[:100]}")
    time.sleep(0.6)          # Resend 초당 2건 제한

print(f'\n완료: 성공 {ok} / 실패 {fail}')
left = len(targets) - ok
if left > 0:
    print(f'남은 대상 {left}명 — 내일 같은 명령을 다시 실행하면 이어서 보낸다(이미 보낸 사람은 건너뜀).')
