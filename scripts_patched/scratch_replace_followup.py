# -*- coding: utf-8 -*-
"""[교체 후속] 문항 id 유지 교체(scratch_replace_inplace.ts + 배치 재실행) 뒤에 남는 수동 6단계.
  1. 판매용 PDF/HWP 를 새 파일로 재업로드 (새 경로 → file_path PATCH → 옛 객체 삭제)
  2. PDF 행의 preview_urls·free_pdf_url·ai_analysis·ai_analysis_at 를 NULL
  3. scripts/generate_previews.py → generate_free_pdfs.py 재실행 (분석글은 9/25 제거 — 페이지가 안 씀)
     + 교체 문항의 옛 유사 목록 삭제 (계산은 하루 한 번 따로, 10/2)
  4. 미리보기 URL 에 ?v=<ts> 를 붙여 CDN 30일 캐시를 우회 (같은 이름으로 upsert 라 옛 그림이 남는다)
  5. /exam/{id} 재검증
사용: python scripts_patched/scratch_replace_followup.py <base1> <base2> ...   (base = try/ 의 6필드 파일명, 확장자 없이)
⚠ 반드시 문항이 sorted 된 뒤에 돌릴 것 — 분석글 생성기는 unit 이 NULL 이면 '기타'로 글을 쓴다.
"""
import os, re, sys, json, time, random, string, subprocess, requests
sys.stdout.reconfigure(encoding='utf-8', errors='replace', line_buffering=True)
import urllib3; urllib3.disable_warnings()
_o = requests.Session.request
requests.Session.request = lambda s, *a, **k: _o(s, *a, **{**k, 'verify': False})

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env = {}
for line in open(os.path.join(ROOT, '.env.local'), encoding='utf-8'):
    m = re.match(r'^\s*([\w.-]+)\s*=\s*(.*)\s*$', line)
    if m: env[m.group(1)] = m.group(2).strip().strip('"').strip("'")
URL = env['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/')
H = {'apikey': env['SUPABASE_SERVICE_ROLE_KEY'], 'Authorization': 'Bearer ' + env['SUPABASE_SERVICE_ROLE_KEY']}
HJ = {**H, 'Content-Type': 'application/json', 'Prefer': 'return=representation'}
UPLOADER = '0f1db267-e257-460b-9549-2fdd6e6ae988'
KEY = env['SUPABASE_SERVICE_ROLE_KEY']


def rand6(): return ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))

def G(table, params):
    r = requests.get(f'{URL}/rest/v1/{table}', headers=H, params=params, timeout=60); r.raise_for_status(); return r.json()

_pv = sys.argv[sys.argv.index('--plan') + 1] if '--plan' in sys.argv else None
bases = [b for b in sys.argv[1:] if b and not b.startswith('--') and b != _pv]   # --plan 값은 base 가 아니다 (9/24 이걸 base 로 읽고 중간에 끝났다)
PLAN = sys.argv[sys.argv.index('--plan') + 1] if '--plan' in sys.argv else os.path.join(ROOT, '_trylog', '_plan.json')
if not bases: print('base 인자 필요'); sys.exit(1)
# 학교명·과목 등은 preflight 가 만든 플랜 행에서 가져온다 (동명이교 접두·과목 별칭이 거기서 이미 해석됨)
plan_rows = {r[0]: r for r in json.load(open(PLAN, encoding='utf-8'))['ok']}

pdf_ids = []
for base in bases:
    if base not in plan_rows: print(f'⛔ {base}: 플랜({PLAN})에 없음'); sys.exit(1)
    _, school, region, district, semstr, semnum, subject, grade, year = plan_rows[base]
    exam_type = '중간고사' if semstr.endswith('중간') else '기말고사'
    gd = grade[-1]
    d = {'year': year, 'grade': gd, 'semnum': semnum, 'exam_type': exam_type, 'subject': subject}
    key = {'school': f'eq.{school}', 'exam_year': f'eq.{year}', 'grade': f'eq.{gd}',
           'semester': f'eq.{semnum}', 'exam_type': f'eq.{exam_type}', 'subject': f'eq.{subject}'}
    rows = G('exam_materials', {'select': 'id,file_type,content_type,file_path,preview_urls', **key})
    sale = {r['file_type']: r for r in rows if r['content_type'] == '해설'}
    print(f'=== {school} {d["year"]} {d["grade"]}학년 {d["semnum"]}학기 {d["exam_type"]} {d["subject"]} ===')
    if 'PDF' not in sale or 'HWP' not in sale:
        print(f'  ⛔ 판매행 없음: {sorted(sale)}'); sys.exit(1)
    # 1. 판매파일 재업로드
    for ftype, ext, ctype in [('PDF', 'pdf', 'application/pdf'), ('HWP', 'hwp', 'application/octet-stream')]:
        src_file = os.path.join(ROOT, 'try', f'{base}.{ext}')
        if not os.path.exists(src_file):
            src_file = os.path.join(ROOT, 'try', f'up_{base}.{ext}')
        data = open(src_file, 'rb').read()
        row = sale[ftype]; old = row['file_path']
        newp = f'{UPLOADER}/{int(time.time()*1000)}_{rand6()}.{ext}'
        # [10/22] 58세트를 연달아 올리다 연결 끊김(10054)으로 두 번 멈췄다 → 업로드만 5번까지 다시 시도
        for _t in range(5):
            try:
                r = requests.post(f'{URL}/storage/v1/object/exam-materials/{newp}', headers={**H, 'Content-Type': ctype}, data=data, timeout=120)
                break
            except requests.RequestException as e:
                print(f'  … {ftype} 업로드 재시도 {_t+1}: {str(e)[:80]}'); time.sleep(5 * (_t + 1))
        else:
            print(f'  ⛔ {ftype} 업로드 5회 실패'); sys.exit(1)
        if r.status_code not in (200, 201): print(f'  ⛔ {ftype} 업로드 실패 {r.status_code}: {r.text[:120]}'); sys.exit(1)
        r = requests.patch(f'{URL}/rest/v1/exam_materials', headers=HJ, params={'id': f"eq.{row['id']}"}, json={'file_path': newp}, timeout=60)
        if r.status_code >= 300 or not r.json(): print(f'  ⛔ {ftype} file_path PATCH 실패: {r.text[:120]}'); sys.exit(1)
        rd = requests.delete(f'{URL}/storage/v1/object/exam-materials', headers=HJ, json={'prefixes': [old]}, timeout=60)
        print(f'  {ftype}: {len(data):,}B 재업로드 → {newp}  (옛 객체 삭제 {rd.status_code})')
    # 2. 파생물 NULL
    pid = sale['PDF']['id']
    r = requests.patch(f'{URL}/rest/v1/exam_materials', headers=HJ, params={'id': f'eq.{pid}'},
                       json={'preview_urls': None, 'free_pdf_url': None, 'ai_analysis': None, 'ai_analysis_at': None}, timeout=60)
    if r.status_code >= 300: print(f'  ⛔ NULL PATCH 실패: {r.text[:120]}'); sys.exit(1)
    print(f'  파생물 NULL: preview_urls({len(sale["PDF"]["preview_urls"] or [])}장)·free_pdf_url·ai_analysis')
    pdf_ids.append(pid)

# 3. 재생성
TSX_ENV = {**os.environ, 'NODE_TLS_REJECT_UNAUTHORIZED': '0', 'PYTHONUTF8': '1'}
# [2026-09-25] 분석글 재생성 제거 — 시험지 페이지가 ai_analysis 를 안 쓴다. 옛 글은 위에서 NULL 로 비운다(교체 전 내용이라).
for label, script in [('미리보기', 'generate_previews.py'), ('무료 문제 PDF', 'generate_free_pdfs.py')]:
    p = subprocess.run([sys.executable, os.path.join(ROOT, 'scripts', script)], capture_output=True, text=True,
                       encoding='utf-8', errors='replace', cwd=ROOT, env=TSX_ENV, timeout=1800)
    out = (p.stdout or '') + (p.stderr or '')
    m = re.search(r'완료: 성공 (\d+) / (?:건너뜀 (\d+) / )?실패 (\d+)', out)
    print(f'{label}: ' + (m.group(0) if m else f'판독 실패 {out[-200:]}'))

# 3-1. [2026-10-02] 유사문항 — 여기서 계산하지 않는다(등록·유사문항 계산·측정 3단 분리, 사장님 결정).
#   교체는 문항 id 를 유지하므로, 옛 유사 목록을 지워 두면 하루 한 번 도는 precompute_similar.py 기본 모드
#   ('표에 없는 문항이 든 단원만')가 교체 문항의 단원을 다시 계산한다. 지운 뒤 그 사이엔 실시간 검색으로 돈다.
#   ⚠ 회차는 source_db_id 로 찾는다 — subject 로 찾으면 '과목은 단원 따름'으로 짝 과목이 된 문항이 빠진다.
_cleared = 0
# [10/13] 판매 파일만 고친 교체(문항 그대로)는 KEEP_SIMILAR=1 로 이 단계를 건너뛴다 — 지우면 다시 계산될 때까지 비어 있다
for base in ([] if os.environ.get('KEEP_SIMILAR') == '1' else bases):
    _, school, region, district, semstr, semnum, subject, grade, year = plan_rows[base]
    _ids = [q['id'] for q in G('questions', {'select': 'id', 'source_db_id': f'eq.{school}_{year}_{semstr}_{subject}'})]
    for k in range(0, len(_ids), 50):
        rr = requests.delete(f'{URL}/rest/v1/question_similar', headers=H, params={'question_id': f'in.({",".join(_ids[k:k + 50])})'}, verify=False, timeout=120)
        if rr.status_code < 300: _cleared += len(_ids[k:k + 50])
print(f'유사문항: 교체 문항 {_cleared}개의 옛 목록 삭제 → 하루 한 번 계산 때 다시 만들어짐')
# [10/26] 발문 텍스트(키워드 검색용)도 교체 내용으로 다시
_srcs = [f'{plan_rows[b][1]}_{plan_rows[b][8]}_{plan_rows[b][4]}_{plan_rows[b][6]}' for b in bases]
_p = subprocess.run([sys.executable, os.path.join(ROOT, 'scripts', 'fill_statement.py'), '--src'] + _srcs, capture_output=True, text=True, encoding='utf-8', errors='replace', cwd=ROOT)
print('발문 텍스트: ' + ((_p.stdout or '').strip().splitlines() or ['판독 실패'])[-1])

# 4. 미리보기 캐시 우회 + 검증
ts = int(time.time())
for pid in pdf_ids:
    row = G('exam_materials', {'select': 'id,school,preview_urls,free_pdf_url,ai_analysis_at', 'id': f'eq.{pid}'})[0]
    urls = [u.split('?')[0] + f'?v={ts}' for u in (row['preview_urls'] or [])]
    if urls:
        requests.patch(f'{URL}/rest/v1/exam_materials', headers=HJ, params={'id': f'eq.{pid}'}, json={'preview_urls': urls}, timeout=60)
    print(f"  {row['school']} /exam/{pid}: 미리보기 {len(urls)}장 · 무료PDF {'O' if row['free_pdf_url'] else '✗'} ")

# 5. 재검증
if KEY:
    rr = requests.post('https://mathetf.com/api/revalidate', headers={'x-revalidate-key': KEY, 'Content-Type': 'application/json'},
                       json={'paths': [f'/exam/{p}' for p in pdf_ids]}, timeout=120)
    print(f'재검증: {rr.status_code}')
else:
    print('⚠ REVALIDATE 키 없음 — 재검증 생략')
