"""검사 통과한 분석글을 공개 저장소(exam-analysis/<id>.json)에 올리고 색인(exam-analysis/_index.json, id → 작성일)을 갱신.
   python upload.py [--dir out_codex] [--dry] [--force: 이미 올린 것도 다시(유사 시험지 갱신 등)]
   [10/23] 색인도 저장소에 있어 배포 없이 반영된다(페이지·robots·분석글 사이트맵이 1시간 안에 읽음)."""
import argparse, glob, json, os, subprocess, sys, urllib.request
sys.stdout.reconfigure(encoding='utf-8')
D = os.path.dirname(os.path.abspath(__file__)); REPO = os.path.abspath(os.path.join(D, '..', '..'))
INDEX = os.path.join(D, 'index_cache.json')   # 저장소 _index.json 의 로컬 사본
env = {}
for l in open(os.path.join(REPO, '.env.local'), encoding='utf-8'):
    if '=' in l and not l.startswith('#'):
        k, v = l.strip().split('=', 1); env[k] = v.strip('"')
U = env['NEXT_PUBLIC_SUPABASE_URL']; K = env['SUPABASE_SERVICE_ROLE_KEY']

ap = argparse.ArgumentParser(); ap.add_argument('--dir', default='out_codex'); ap.add_argument('--dry', action='store_true'); ap.add_argument('--force', action='store_true'); ap.add_argument('--only', nargs='*'); a = ap.parse_args()
def put(path, data):
    req = urllib.request.Request(f'{U}/storage/v1/object/exam-analysis/{path}', method='POST', data=data,
                                 headers={'apikey': K, 'Authorization': 'Bearer ' + K, 'Content-Type': 'application/json; charset=utf-8',
                                          'x-upsert': 'true', 'cache-control': 'max-age=300'})
    urllib.request.urlopen(req).read()


try:   # 저장소 색인이 기준 — 다른 곳(등록 배치)에서 올린 것도 잃지 않게 받아서 시작한다
    index = json.load(urllib.request.urlopen(f'{U}/storage/v1/object/public/exam-analysis/_index.json?t={os.getpid()}'))
except Exception:
    index = json.load(open(INDEX, encoding='utf-8')) if os.path.exists(INDEX) else {}
files = sorted(glob.glob(os.path.join(D, a.dir, '*.json')))
if a.only: files = [f for f in files if os.path.basename(f)[:-5] in set(a.only)]   # 등록 배치 뒤 새 시험지만
up = skip = bad = 0
import concurrent.futures as cf


def one(f):
    eid = os.path.basename(f)[:-5]
    r = subprocess.run([sys.executable, '-X', 'utf8', os.path.join(D, 'check.py'), '--dir', a.dir, eid], capture_output=True, text=True, encoding='utf-8')
    if r.returncode: return eid, 'bad', None
    body = json.load(open(f, encoding='utf-8'))
    sim = os.path.join(D, 'data_sim', eid + '.json')   # 유사 시험지 Top5(similar_exams.py) — 분석글 위 블록
    if os.path.exists(sim): body['similar_exams'] = json.load(open(sim, encoding='utf-8'))
    if index.get(eid) == body['reviewedAt'] and not a.force: return eid, 'skip', None
    if not a.dry:
        for t in range(3):
            try: put(f'{eid}.json', json.dumps(body, ensure_ascii=False).encode('utf-8')); break
            except Exception:
                if t == 2: return eid, 'bad', None
    return eid, 'up', body['reviewedAt']


with cf.ThreadPoolExecutor(16) as ex:   # 3,000장을 하나씩 올리면 25분 — 16개씩
    for eid, st, at in ex.map(one, files):
        if st == 'bad': bad += 1; print('검사 실패 또는 올리기 실패, 색인 제외', eid)
        elif st == 'skip': skip += 1
        else:
            up += 1
            if not a.dry: index[eid] = at
if not a.dry:
    index = dict(sorted(index.items()))
    put('_index.json', json.dumps(index, ensure_ascii=False).encode('utf-8'))
    json.dump(index, open(INDEX, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print(f'올림 {up} · 그대로 {skip} · 검사 실패 {bad} · 색인 {len(index)}개' + (' (시험 실행)' if a.dry else ''))
