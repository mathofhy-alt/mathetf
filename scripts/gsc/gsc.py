"""서치콘솔 접속 (읽기 전용). 첫 실행 때 브라우저에서 한 번 허락 → .secrets/gsc_token.json 저장.
   from gsc import service; svc = service()"""
import glob, os
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SECRETS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '.secrets')
TOKEN = os.path.join(SECRETS, 'gsc_token.json')
SCOPES = ['https://www.googleapis.com/auth/webmasters',            # 10/22 대표: 수정 권한(사이트맵 제출 등)
          'https://www.googleapis.com/auth/analytics.readonly']    # 10/23 대표: 애널리틱스 직접 조회(읽기만)


def _creds(interactive=True):
    """interactive=False: 배치용 — 토큰이 안 되면 브라우저 로그인을 띄우지 않고 오류(배치가 멈춰 서지 않게)."""
    creds = Credentials.from_authorized_user_file(TOKEN, SCOPES) if os.path.exists(TOKEN) else None
    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
    if not creds or not creds.valid:
        if not interactive: raise RuntimeError('서치콘솔 토큰 만료 — 대표 재로그인 필요(python scripts/gsc/gsc.py)')
        client = glob.glob(os.path.join(SECRETS, 'client_secret_*.json'))[0]
        creds = InstalledAppFlow.from_client_secrets_file(client, SCOPES).run_local_server(port=0, prompt='consent')
    open(TOKEN, 'w').write(creds.to_json())
    return creds


def service(interactive=True):
    return build('searchconsole', 'v1', credentials=_creds(interactive), cache_discovery=False)


def analytics(interactive=True):
    """(Data API, Admin API) — GA4 보고서·속성 목록."""
    c = _creds(interactive)
    return (build('analyticsdata', 'v1beta', credentials=c, cache_discovery=False),
            build('analyticsadmin', 'v1beta', credentials=c, cache_discovery=False))


if __name__ == '__main__':
    import sys; sys.stdout.reconfigure(encoding='utf-8')
    for s in service().sites().list().execute().get('siteEntry', []):
        if 'mathetf' in s['siteUrl']: print(s['siteUrl'], s['permissionLevel'])
    _, admin = analytics()
    for a in admin.accountSummaries().list().execute().get('accountSummaries', []):
        for p in a.get('propertySummaries', []): print('GA4', p['property'], p.get('displayName'))
