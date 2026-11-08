# -*- coding: utf-8 -*-
"""
[가·나형 / A·B형 회차 배치] try/ 의 <연도>_고2_3월_<형>.hml 세트를 전자동 등록한다.

2013~2015 를 손으로 반복하며 굳어진 절차를 그대로 옮긴 것:
  1 중복측정  두 형의 완전 동일 문항 수 (참고용, 삭제하지 않음 — 각 시험지의 완전성 유지)
  2 파싱      scratch_single_ingest.ts  → source_db_id 에 _가형/_나형 을 붙여 구분
  3 크롭      pdf_crop_v4.py  ⚠ 출력폴더는 반드시 ASCII (한글이면 cv2 가 조용히 실패)
  4 캡쳐업로드
  5 AI 태깅
  6 교과외검수 scratch_curriculum_check.py --apply
  7 sorted 전환 + 개인DB (form 별로 1개씩, exam_materials.source_db_id 로 연결)
  8 모의고사탭 + 미리보기 + 캐시 갱신

사용: python scripts_patched/scratch_form_batch.py 2016 3 가 나      (연도 월 형...)
     python scripts_patched/scratch_form_batch.py 2006 6 나           (한 형만 있는 회차도 가능)
"""
import os, re, subprocess, sys, time, uuid
# 로그를 파일로 넘기면 Windows stdout 이 cp949 가 되어, subprocess errors='replace' 가
# 만든 U+FFFD 를 인코딩하지 못하고 마지막에 죽는다(2026-08-20 2006 6월 배치).
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace', line_buffering=True)
except Exception: pass
import requests
import urllib3 as _u; _u.disable_warnings()

env = {}
for line in open('.env.local', encoding='utf-8'):
    m = re.match(r'^\s*([\w.-]+)\s*=\s*(.*)\s*$', line)
    if m: env[m.group(1)] = m.group(2).strip().strip('"').strip("'")
URL = env['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/')
KEY = env['SUPABASE_SERVICE_ROLE_KEY']
H = {'apikey': KEY, 'Authorization': 'Bearer ' + KEY}
HJ = {**H, 'Content-Type': 'application/json'}
UPLOADER = '0f1db267-e257-460b-9549-2fdd6e6ae988'
ROMAN = {'가': 'GA', '나': 'NA', 'A': 'A', 'B': 'B'}   # 크롭 폴더용 ASCII 이름

_pos = [a for a in sys.argv[1:] if not a.startswith('--')]
NO_AI = '--no-ai' in sys.argv    # Gemini 장애·한도초과 때 AI 무관 단계(파싱·크롭·캡쳐·모의고사탭)만 먼저 돌린다
YEAR = _pos[0]
MONTH = _pos[1]
FORMS = _pos[2:] or ['가', '나']
S = requests.Session()


def run(cmd, timeout=3600):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=timeout)
    return (r.stdout or '') + (r.stderr or '')


def req(method, url, **kw):
    for i in range(4):
        try:
            return S.request(method, url, timeout=180, verify=False, **kw)
        except Exception:
            if i == 3: raise
            time.sleep(2 * 2 ** i)


# ── 1 중복 측정 ──
if len(FORMS) == 2:
    out = run(f'npx tsx scratch_compare_forms.ts "try/{YEAR}_고2_{MONTH}월_{FORMS[0]}형.hml" "try/{YEAR}_고2_{MONTH}월_{FORMS[1]}형.hml"')
    m = re.search(r'완전 동일 문항: (\d+)개', out)
    print(f'1 중복측정 : 두 형의 완전 동일 문항 {m.group(1) if m else "?"}개 (양쪽에 그대로 보존)')

for f in FORMS:
    SRC = f'전국연합_{YEAR}_{MONTH}월 모의고사_{f}형'
    HML = f'try/{YEAR}_고2_{MONTH}월_{f}형.hml'
    # ⚠ 폴더명에 월이 없으면 같은 해 3월/6월 회차가 같은 폴더를 쓴다.
    #   2013 6월을 돌릴 때 crop_2013A(3월 것, 30장)를 '기존 재사용'해서
    #   6월 문항에 3월 이미지가 붙을 뻔했다(8/22 발견). 월을 반드시 넣는다.
    CROP = f'hwpx-python-tool/crop_{YEAR}m{MONTH}{ROMAN.get(f, "X")}'
    print(f'\n▶ {YEAR} {f}형')

    # ── 2 파싱 ──
    n = len(req('GET', f'{URL}/rest/v1/questions', headers=H, params={'select': 'id', 'source_db_id': f'eq.{SRC}'}).json())
    if n:
        print(f'  2 파싱     : 이미 {n}문항 (스킵)')
    else:
        out = run(f'npx tsx scripts_patched/scratch_single_ingest.ts "{HML}" "{SRC}" "전과목" "{YEAR}" "{MONTH}월 모의고사" "고2" 1')
        mm = re.search(r'QCOUNT=(\d+)', out)
        if not mm:
            print('  2 파싱     : ❌ 실패\n' + out[-400:]); continue
        n = int(mm.group(1)); print(f'  2 파싱     : {n}문항')

    # ── 3 크롭 (ASCII 폴더) ──
    if os.path.isdir(f'{CROP}/questions') and len(os.listdir(f'{CROP}/questions')) >= n:
        print('  3 크롭     : 기존 재사용')
    else:
        out = run(f'python hwpx-python-tool/pdf_crop_v4.py "try/{YEAR}_고2_{MONTH}월_{f}형ㅈㄷ.pdf" {CROP}')
        mm = re.search(r'Questions:\s*(\d+)\s*\|\s*Solutions:\s*(\d+)', out)
        print(f'  3 크롭     : {mm.group(1) if mm else "?"}문제 / {mm.group(2) if mm else "?"}해설')

    # ── 4 캡쳐 업로드 ──
    qs = sorted(req('GET', f'{URL}/rest/v1/questions', headers=H,
                    params={'select': 'id,question_number', 'source_db_id': f'eq.{SRC}', 'order': 'question_number'}).json(),
                key=lambda x: x['question_number'])
    ids = [q['id'] for q in qs]
    have = set()
    for i in range(0, len(ids), 50):
        for x in req('GET', f'{URL}/rest/v1/question_images', headers=H,
                     params={'select': 'question_id,original_bin_id', 'question_id': f'in.({",".join(ids[i:i+50])})'}).json():
            if str(x['original_bin_id']).startswith('AUTO_'):
                have.add((x['question_id'], str(x['original_bin_id'])[5:6]))
    ts = int(time.time()); up = 0
    for q in qs:
        for mode, folder in (('Q', 'questions'), ('S', 'solutions')):
            if (q['id'], mode) in have: continue
            p = f"{CROP}/{folder}/{mode.lower()}_{q['question_number']:02d}.webp"
            if not os.path.exists(p): continue
            data = open(p, 'rb').read()
            key = f"auto_captures/{q['id']}_{mode.lower()}_{ts}_0.webp"
            r = req('POST', f'{URL}/storage/v1/object/hwpx/{key}', headers={**H, 'Content-Type': 'image/webp'}, data=data)
            if r.status_code not in (200, 409): continue
            req('POST', f'{URL}/rest/v1/question_images', headers=HJ, json={
                'question_id': q['id'], 'original_bin_id': f'AUTO_{mode}_{ts}_{q["question_number"]}', 'format': 'webp',
                'data': f'{URL}/storage/v1/object/public/hwpx/{key}', 'size_bytes': len(data)})
            up += 1
    print(f'  4 캡쳐     : {up}장 업로드')

    if NO_AI:
        print('  5 AI       : 건너뜀 (--no-ai)')
        print('  6 교과외   : 건너뜀 (--no-ai)')
    else:
        # ── 5 AI ──
        out = run(f'npx tsx scratch_batch_ai.ts "{SRC}" "전과목"', timeout=5400)
        mm = re.search(r'AI_RESULT ok=(\d+) skip=(\d+) fail=(\d+)', out)
        print(f'  5 AI       : {mm.group(0) if mm else "❌ 마커 없음"}')
        if mm and int(mm.group(3)) > 0:
            out = run(f'npx tsx scratch_batch_ai.ts "{SRC}" "전과목"', timeout=5400)
            mm2 = re.search(r'AI_RESULT ok=(\d+) skip=(\d+) fail=(\d+)', out)
            print(f'             재시도 → {mm2.group(0) if mm2 else "?"}')

        # ── 6 교과외 ──
        out = run(f'python scratch_curriculum_check.py "{SRC}" --apply')
        offs = re.findall(r'❌\s*(\d+)번\s+\'[^\']+\' → \'([^\']+)\'', out)
        mm = re.search(r'교과외 (\d+)/(\d+)문항', out)
        print(f'  6 교과외   : {mm.group(1) if mm else "?"}문항' + (f'  {[f"{a}번 {b}" for a, b in offs]}' if offs else ''))

    # ── 7 sorted + 개인DB ──
    qs = req('GET', f'{URL}/rest/v1/questions', headers=H,
             params={'select': 'id,unit,difficulty', 'source_db_id': f'eq.{SRC}'}).json()
    ids = [q['id'] for q in qs]; cap = {}
    for i in range(0, len(ids), 50):
        for x in req('GET', f'{URL}/rest/v1/question_images', headers=H,
                     params={'select': 'question_id,original_bin_id', 'question_id': f'in.({",".join(ids[i:i+50])})'}).json():
            if str(x['original_bin_id']).startswith('AUTO_'):
                cap.setdefault(x['question_id'], set()).add(str(x['original_bin_id'])[5:6])
    ok = [q['id'] for q in qs if q['unit'] and q['difficulty'] is not None and len(cap.get(q['id'], set())) >= 2]
    for i in range(0, len(ok), 5):
        req('PATCH', f'{URL}/rest/v1/questions', headers=HJ,
            params={'id': f'in.({",".join(ok[i:i+5])})'}, json={'work_status': 'sorted'})
    price = sum(int(q['difficulty']) for q in qs if q['difficulty']) * 500
    # AI 단계가 통째로 실패하면(Gemini 지출한도 429 등) sorted 0 · 0P 짜리 빈 개인DB 가 만들어져
    # 사이트에 문항 0개 DB 로 노출된다(8/21 2006 6월 가형). 절반도 못 채우면 만들지 않는다.
    # 8단계(모의고사 탭 PDF/HWP)는 AI 와 무관하므로 계속 진행한다 — 개인DB 만 보류.
    if len(ok) < max(1, len(qs) // 2):
        print(f'  7 노출/DB  : ⛔ sorted {len(ok)}/{len(qs)} — AI 미완료로 개인DB 생성 보류')
        print(f'             → 원인 확인 후 같은 명령 재실행하면 AI 단계부터 이어짐 (ai.studio/billing 한도 1순위)')
    elif req('GET', f'{URL}/rest/v1/exam_materials', headers=H, params={'select': 'id', 'source_db_id': f'eq.{SRC}'}).json():
        print(f'  7 노출/DB  : sorted {len(ok)}/{len(qs)} · 개인DB 이미 있음')
    else:
        r = req('POST', f'{URL}/rest/v1/exam_materials', headers=HJ, json={
            'title': f'전국연합 {YEAR} 고2학년 {MONTH}월 모의고사 {f}형 [개인DB]', 'region': '전국', 'district': '전국',
            'school': '전국연합', 'grade': 2, 'semester': int(MONTH), 'exam_type': '모의고사', 'file_type': 'DB',
            'content_type': '개인DB', 'file_path': f'db_access/{UPLOADER}/{int(time.time()*1000)}',
            'price': price, 'uploader_id': UPLOADER, 'uploader_name': 'mathofhy',
            'subject': '전과정', 'exam_year': int(YEAR), 'is_verified': True, 'source_db_id': SRC})
        print(f'  7 노출/DB  : sorted {len(ok)}/{len(qs)} · 개인DB {r.status_code} · {price:,}P')

    # ── 8 모의고사 탭 ──
    slug = f'{YEAR}-{MONTH}월-전국연합-고2-수학-{f}형'
    if req('GET', f'{URL}/rest/v1/mock_exams', headers=H, params={'select': 'id', 'slug': f'eq.{slug}'}).json():
        print('  8 모의고사 : 이미 있음')
    else:
        folder = str(uuid.uuid4()); base = f'try/{YEAR}_고2_{MONTH}월_{f}형'
        for ext, name, ct in (('pdf', 'original.pdf', 'application/pdf'), ('hwp', 'original.hwp', 'application/x-hwp')):
            req('POST', f'{URL}/storage/v1/object/mock-materials/{folder}/{name}',
                headers={**H, 'Content-Type': ct}, data=open(f'{base}.{ext}', 'rb').read())
        r = req('POST', f'{URL}/rest/v1/mock_exams', headers=HJ, json={
            'category': '전국연합', 'exam_year': int(YEAR), 'grade': '고2', 'month': int(MONTH), 'subject': '수학',
            'title': f'{YEAR} 고2 {MONTH}월 전국연합 수학 {f}형', 'slug': slug,
            'original_pdf_path': f'{folder}/original.pdf', 'original_hwp_path': f'{folder}/original.hwp'})
        print(f'  8 모의고사 : {r.status_code} · {slug}')

# ── 9 형 간 메타 통일 ──
# 두 형에 같은 문항이 있으면 AI 가 각각 따로 판정해 단원·난이도·교과외가 갈린다
# (8/21: 111개 중 28개 불일치, 사용자가 화면에서 발견). 형이 둘일 때만 돌린다.
if len(FORMS) == 2 and not NO_AI:
    out = run(f'python scratch_unify_forms.py {YEAR} {MONTH}월 {FORMS[0]} {FORMS[1]} --apply', timeout=3600)
    mm = re.search(r'난이도 통일 (\d+)/(\d+)건', out)
    sk = re.search(r'보류 (\d+)건', out)
    print(f'9 메타통일  : 난이도 {mm.group(0) if mm else "0건"}' + (f' · ⚠보류 {sk.group(1)}건' if sk else ''))
    for ln in out.splitlines():
        if '중앙값' in ln: print('   ' + ln.strip())
    if '수동판단 필요' in out:
        print('   🔴 단원·과목·교과외가 형마다 갈렸다 — 아래를 본문 읽고 직접 통일할 것')
        for ln in out.splitlines():
            if '  단원  ' in ln or '  과목  ' in ln or '  교과외  ' in ln: print('   ' + ln.strip())

# ── 마무리: 미리보기 + 캐시 ──
print('\n' + run('python scripts/generate_mock_previews.py').strip()[-200:])
import urllib.parse as up
paths = ['/mock', '/모의고사', '/mock/전국연합', '/sitemap.xml'] + [f'/mock/{YEAR}-{MONTH}월-전국연합-고2-수학-{f}형' for f in FORMS]
paths += ['/' + '/'.join(up.quote(x) for x in p[1:].split('/')) for p in paths]
r = req('POST', 'https://mathetf.com/api/revalidate', headers={'x-revalidate-key': KEY, 'Content-Type': 'application/json'},
        json={'paths': list(dict.fromkeys(paths))})
print(f'캐시 갱신: {r.status_code}')
