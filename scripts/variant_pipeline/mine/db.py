import os, re, json, urllib.request, urllib.parse
env = {}
for l in open(r'C:\dev\mathetf\.env.local', encoding='utf-8'):
    m = re.match(r'^([A-Z_]+)=(.*)$', l.strip())
    if m: env[m[1]] = m[2].strip().strip('"')
URL = env['NEXT_PUBLIC_SUPABASE_URL'] + '/rest/v1/'
H = {'apikey': env['SUPABASE_SERVICE_ROLE_KEY'], 'Authorization': 'Bearer ' + env['SUPABASE_SERVICE_ROLE_KEY']}
def get(table, **q):
    u = URL + table + '?' + urllib.parse.urlencode(q, safe='*(),.:')
    return json.load(urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=60))
