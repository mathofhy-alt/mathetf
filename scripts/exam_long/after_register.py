"""등록 배치 뒤 새 시험지에 장문 분석글 + 유사 시험지 Top5 를 붙인다(대표 10/23: "파싱하면 자동으로").
   python after_register.py <source_db_id ...>
   ① source_db_id → 시험지(id) ② 코덱스가 분석글(작년·같은 지역 비교 포함) ③ 검사 ④ 유사 시험지 Top5
   ⑤ 저장소에 올리고 색인 갱신(배포 없이 페이지·robots·분석글 사이트맵에 반영) ⑥ 캐시 갱신 ⑦ 서치콘솔에 분석글 사이트맵 다시 제출
   항상 종료코드 0 — 마지막 줄 `EXAM_LONG_DONE ok=N fail=M` 를 배치가 읽는다. 실패분은 run_all.py 로 다시 돌리면 된다."""
import json, os, subprocess, sys, tempfile, urllib.parse, urllib.request
sys.stdout.reconfigure(encoding='utf-8')
D = os.path.dirname(os.path.abspath(__file__)); REPO = os.path.abspath(os.path.join(D, '..', '..'))
PY = sys.executable
env = {}
for l in open(os.path.join(REPO, '.env.local'), encoding='utf-8'):
    if '=' in l and not l.startswith('#'):
        k, v = l.strip().split('=', 1); env[k] = v.strip('"')
U = env['NEXT_PUBLIC_SUPABASE_URL']; K = env['SUPABASE_SERVICE_ROLE_KEY']
SEM = {1: '1학기', 2: '2학기'}


def run(args, timeout=7200):
    r = subprocess.run([PY, '-X', 'utf8'] + args, capture_output=True, text=True, encoding='utf-8', errors='replace', cwd=D, timeout=timeout)
    return (r.stdout or '') + (r.stderr or '')


srcs = [a for a in sys.argv[1:] if a.strip()]
ids = []
try:
    for s in srcs:
        school, year, term, subject = s.split('_', 3)
        sem, typ = term[:3], term[3:] + '고사'
        rows = json.load(urllib.request.urlopen(urllib.request.Request(
            f"{U}/rest/v1/exam_materials?select=id,preview_urls&file_type=eq.PDF&content_type=eq.%ED%95%B4%EC%84%A4"
            f"&school=eq.{urllib.parse.quote(school)}&exam_year=eq.{year}&semester=eq.{1 if sem == '1학기' else 2}"
            f"&exam_type=eq.{urllib.parse.quote(typ)}&subject=eq.{urllib.parse.quote(subject)}",
            headers={'apikey': K, 'Authorization': 'Bearer ' + K})))
        ids += [r['id'] for r in rows if r['preview_urls']]
except Exception as e:
    print('⚠ 시험지 찾기 실패:', str(e)[:200])
ids = list(dict.fromkeys(ids))
if not ids:
    print('EXAM_LONG_DONE ok=0 fail=0 (대상 시험지 없음 — 모의고사·미리보기 없는 회차는 제외)'); sys.exit(0)

tf = os.path.join(D, f'targets_new_{os.getpid()}.json')
json.dump([{'id': i} for i in ids], open(tf, 'w', encoding='utf-8'))
out = run(['run_all.py', '--targets', os.path.basename(tf), '--workers', str(min(10, len(ids))), '--stop-pct', '100'])
os.remove(tf)
good = [i for i in ids if os.path.exists(os.path.join(D, 'out_codex', i + '.json'))
        and subprocess.run([PY, '-X', 'utf8', 'check.py', '--dir', 'out_codex', i], cwd=D, capture_output=True).returncode == 0]
print(f'분석글: {len(good)}/{len(ids)}')
if good:
    print('유사 시험지:', run(['similar_exams.py', '--ids'] + good).strip().splitlines()[-1:])
    print('올리기:', run(['upload.py', '--only'] + good + ['--force']).strip().splitlines()[-1:])
    # 캐시 갱신 — 새 분석글이 바로 보이게
    try:
        key = K   # scratch_batch_run.py 와 같은 키
        paths = [f'/exam/{i}' for i in good] + ['/robots.txt', '/sitemap-exam-analysis.xml']
        req = urllib.request.Request('https://mathetf.com/api/revalidate', method='POST', data=json.dumps({'paths': paths}).encode(),
                                     headers={'x-revalidate-key': key, 'Content-Type': 'application/json'})
        print('캐시 갱신:', urllib.request.urlopen(req, timeout=120).status)
    except Exception as e:
        print('⚠ 캐시 갱신 실패:', str(e)[:120])
    # 서치콘솔에 분석글 사이트맵 다시 제출(토큰 만료면 건너뜀 — 대표 재로그인 필요)
    try:
        sys.path.insert(0, os.path.join(REPO, 'scripts', 'gsc'))
        from gsc import service
        service(interactive=False).sitemaps().submit(siteUrl='https://mathetf.com/', feedpath='https://mathetf.com/sitemap-exam-analysis.xml').execute()
        print('서치콘솔 사이트맵 제출: 완료')
    except Exception as e:
        print('⚠ 서치콘솔 제출 실패(토큰 만료면 scripts/gsc/gsc.py 로 재로그인):', str(e)[:120])
    # [10/23] 네이버·빙에 내용 바뀜 알림 — 배치의 IndexNow 는 분석글이 붙기 전에 나가서 이 페이지는 다시 알린다
    try:
        sys.path.insert(0, os.path.join(REPO, 'scripts'))
        import indexnow_ping as I
        print('IndexNow:', I.ping([f'https://mathetf.com/exam/{i}' for i in good], I.load_key()), '개')
    except Exception as e:
        print('⚠ IndexNow 실패:', str(e)[:120])
print(f'EXAM_LONG_DONE ok={len(good)} fail={len(ids) - len(good)}')
