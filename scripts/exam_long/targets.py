"""대상: 회차(미리보기 있는 해설 PDF) 10개 이상인 학교의 시험지 전부 → targets.json"""
import json, os, sys, urllib.request, collections
sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.abspath(__file__))
env = {}
for l in open(os.path.join(ROOT, '..', '..', '.env.local'), encoding='utf-8'):
    if '=' in l and not l.startswith('#'):
        k, v = l.strip().split('=', 1); env[k] = v.strip('"')
U = env['NEXT_PUBLIC_SUPABASE_URL']; K = env['SUPABASE_SERVICE_ROLE_KEY']
rows, o = [], 0
while True:
    r = urllib.request.Request(f"{U}/rest/v1/exam_materials?select=id,school,exam_year,grade,semester,exam_type,subject,preview_urls&file_type=eq.PDF&content_type=eq.%ED%95%B4%EC%84%A4&school=neq.DELETED&offset={o}&limit=1000",
                               headers={'apikey': K, 'Authorization': 'Bearer ' + K})
    d = json.load(urllib.request.urlopen(r)); rows += d
    if len(d) < 1000: break
    o += 1000
rows = [x for x in rows if x['preview_urls']]
c = collections.Counter(x['school'] for x in rows)
t = [{k: x[k] for k in ('id', 'school', 'exam_year', 'grade', 'semester', 'exam_type', 'subject')} for x in rows if c[x['school']] >= 10]
t.sort(key=lambda x: (-(x['exam_year'] or 0), x['school']))
json.dump(t, open(os.path.join(ROOT, 'targets.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print('학교', len({x['school'] for x in t}), '시험지', len(t), '연도', collections.Counter(x['exam_year'] for x in t).most_common())
