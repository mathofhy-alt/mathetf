import os, re, json, urllib.request, urllib.parse
env = {}
for l in open(r'C:\dev\mathetf\.env.local', encoding='utf-8'):
    m = re.match(r'^([A-Z_]+)=(.*)$', l.strip())
    if m: env[m[1]] = m[2].strip().strip('"')
URL = env['NEXT_PUBLIC_SUPABASE_URL'] + '/rest/v1/'
H = {'apikey': env['SUPABASE_SERVICE_ROLE_KEY'], 'Authorization': 'Bearer ' + env['SUPABASE_SERVICE_ROLE_KEY']}
def get(table, **q):
    import time
    u = URL + table + '?' + urllib.parse.urlencode(q, safe='*(),.:')
    for i in range(4):   # [10/21] 큰 조회 시간 초과 — 쉬었다 다시
        try: return json.load(urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=90))
        except (TimeoutError, OSError) as e:
            if i == 3 or getattr(e, 'code', 0) in (400, 401, 403, 404): raise
            time.sleep(10 * (i + 1))
