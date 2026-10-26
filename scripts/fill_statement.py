# -*- coding: utf-8 -*-
"""발문 텍스트 채우기 → question_statement (10/26 대표: 키워드 검색은 발문에서만)

content_xml 에서 해설(ENDNOTE)·수식(SCRIPT)을 뺀 글. 검색 함수가 이 표를 먼저 보고, 없으면 plain_text(해설 포함)로 찾는다.
⚠ content_xml 은 무거워서 한 번에 많이 읽으면 DB 가 521 을 낸다(10/25) → 200행씩 한 줄로, 사이에 쉼.

  python scripts/fill_statement.py                 # 표에 없는 문항만 (등록 배치 끝에 붙어 돈다)
  python scripts/fill_statement.py --ids a.txt     # 이 문항들만 다시 (내용을 교체한 회차)
  python scripts/fill_statement.py --src <source_db_id> ...   # 이 회차들만 다시
"""
import html, os, re, sys, time, requests, urllib3
urllib3.disable_warnings()
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace', line_buffering=True)
except Exception: pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env = {}
for l in open(os.path.join(ROOT, '.env.local'), encoding='utf-8'):
    m = re.match(r'^\s*([\w.-]+)\s*=\s*(.*)\s*$', l)
    if m: env[m.group(1)] = m.group(2).strip().strip('"').strip("'")
URL = env['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/'); KEY = env['SUPABASE_SERVICE_ROLE_KEY']
H = {'apikey': KEY, 'Authorization': 'Bearer ' + KEY}
ENDNOTE_RE = re.compile(r'<ENDNOTE\b.*?</ENDNOTE>', re.S | re.I)
SCRIPT_RE = re.compile(r'<SCRIPT>.*?</SCRIPT>', re.S | re.I)
PAGE = 200


NUM_RE = re.compile(r'\d+(?:\.\d+)?')


def stem_nums(xml):
    """[10/26] 발문(해설 뺀) 글+수식의 숫자들 — 프린트변형 원본 찾기에서 글이 거의 없는 계산 문제를 대조한다"""
    x = ENDNOTE_RE.sub('', xml or '')
    x = re.sub(r'<SCRIPT>(.*?)</SCRIPT>', lambda m: ' ' + html.unescape(m.group(1)) + ' ', x, flags=re.S | re.I)
    x = html.unescape(re.sub(r'<[^>]+>', ' ', x))
    return ' '.join(NUM_RE.findall(x))


def statement(xml):
    x = SCRIPT_RE.sub(' ', ENDNOTE_RE.sub('', xml or ''))
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', x))).strip()


def call(method, path, **kw):
    for k in range(5):
        try:
            r = requests.request(method, URL + path, headers={**H, **kw.pop('headers', {})}, timeout=120, verify=False, **kw)
            if r.status_code < 500: return r
        except requests.RequestException:
            pass
        time.sleep(5 * (k + 1))
    raise RuntimeError(f'{method} {path} 실패')


def save(rows):
    out = [{'question_id': q['id'], 'text': statement(q['content_xml']) or (q.get('plain_text') or ''), 'nums': stem_nums(q['content_xml'])} for q in rows]
    r = call('POST', '/rest/v1/question_statement?on_conflict=question_id', json=out,
             headers={'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates,return=minimal'})
    if r.status_code >= 300 and '23505' in r.text:
        # [10/26] 덮어쓰기인데도 중복 키가 한 번 났다(35,016개째) — 그 묶음만 한 줄씩 넣는다
        for o in out:
            call('DELETE', '/rest/v1/question_statement', params={'question_id': f'eq.{o["question_id"]}'})
            rr = call('POST', '/rest/v1/question_statement', json=o, headers={'Content-Type': 'application/json', 'Prefer': 'return=minimal'})
            if rr.status_code >= 300: raise RuntimeError(rr.text[:300])
        return len(out)
    if r.status_code >= 300: raise RuntimeError(r.text[:300])
    return len(out)


def have_ids():
    got, last = set(), '00000000-0000-0000-0000-000000000000'
    while True:
        b = call('GET', '/rest/v1/question_statement', params={'select': 'question_id', 'question_id': f'gt.{last}', 'order': 'question_id', 'limit': 1000}).json()
        got.update(x['question_id'] for x in b)
        if len(b) < 1000: return got
        last = b[-1]['question_id']


def by_ids(ids):
    n = 0
    for k in range(0, len(ids), PAGE):
        rows = call('GET', '/rest/v1/questions', params={'select': 'id,content_xml,plain_text', 'id': f'in.({",".join(ids[k:k + PAGE])})'}).json()
        n += save(rows); time.sleep(0.5)
    return n


if '--ids' in sys.argv:
    ids = open(sys.argv[sys.argv.index('--ids') + 1]).read().split()
    print(f'완료: 성공 {by_ids(ids)} / 실패 0')
elif '--src' in sys.argv:
    n = 0
    for s in sys.argv[sys.argv.index('--src') + 1:]:
        ids = [x['id'] for x in call('GET', '/rest/v1/questions', params={'select': 'id', 'source_db_id': f'eq.{s}'}).json()]
        n += by_ids(ids)
    print(f'완료: 성공 {n} / 실패 0')
else:
    # --all: 이미 있는 것도 다시(칸을 새로 더했을 때, 10/26 nums)
    have = set() if '--all' in sys.argv else have_ids(); print('이미 있음', len(have))
    last, n, t0 = '00000000-0000-0000-0000-000000000000', 0, time.time()
    while True:
        # id 만 먼저 훑고, 빠진 것만 content_xml 을 읽는다
        b = call('GET', '/rest/v1/questions', params={'select': 'id', 'id': f'gt.{last}', 'order': 'id', 'limit': 1000}).json()
        if not b: break
        last = b[-1]['id']
        miss = [x['id'] for x in b if x['id'] not in have]
        if miss: n += by_ids(miss)
        if n and n % 5000 < PAGE: print(f'  {n:,}개 · {time.time() - t0:.0f}초', flush=True)
        if len(b) < 1000: break
    print(f'새로 채움 {n:,}개 ({time.time() - t0:.0f}초)')
    print(f'완료: 성공 {n} / 실패 0')
