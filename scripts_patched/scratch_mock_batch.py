# -*- coding: utf-8 -*-
"""
[옛 모의고사 배치] try/ 의 <연도>_고2_3월 세트를 전자동 등록한다.

세트당 단계 (전부 멱등 — 재실행하면 남은 단계부터):
 1 파싱      scratch_batch_ingest.ts  (.hml → questions)
 2 크롭      pdf_crop_v4.py           (ㅈㄷ.pdf → 문제/해설 이미지, 출력폴더는 ASCII)
 3 캡쳐업로드 hwpx/auto_captures/...
 4 AI        scratch_batch_ai.ts      (단원·난이도·태그·임베딩)
 5 교과외검수 scratch_curriculum_check.py --apply  (폐지단원 → 구 단원명 + 딱지)
 6 sorted    검증 통과 문항만 노출 전환
 7 개인DB    exam_materials 행 (subject='전과정' → 과목 필터 없이 전 문항 노출)
 8 모의고사탭 mock_exams + PDF/HWP 업로드
 9 미리보기   generate_mock_previews.py

사용: python scripts_patched/scratch_mock_batch.py [연도 ...]      (생략 시 try/ 의 모든 세트)
"""
import os, re, subprocess, sys, time, glob
import sys as _stdio_sys
# Windows: 출력이 파이프/파일이면 stdout 이 cp949 가 되어 이모지·em dash 에서 즉사한다.
try: _stdio_sys.stdout.reconfigure(encoding='utf-8', errors='replace', line_buffering=True)
except Exception: pass

import requests
import urllib3 as _u; _u.disable_warnings()

# 캡쳐 업로드가 수십 회 연속되면 중간에 연결이 끊겨(WinError 10054) 배치 전체가 죽는다.
# 모든 HTTP 호출에 타임아웃 + 재시도를 씌운다 (2010년 배치 중단 사고).
_sess = requests.Session()


def _wrap(fn):
    def inner(*a, **k):
        k.setdefault('timeout', 180)
        k.setdefault('verify', False)
        for i in range(4):
            try:
                return fn(*a, **k)
            except (requests.ConnectionError, requests.Timeout) as e:
                if i == 3:
                    raise
                print(f'     ↻ 네트워크 재시도 {i+1}/3 ({type(e).__name__})')
                time.sleep(2 * 2 ** i)
    return inner


requests.get, requests.post, requests.patch, requests.put, requests.delete = (
    _wrap(_sess.get), _wrap(_sess.post), _wrap(_sess.patch), _wrap(_sess.put), _wrap(_sess.delete))

env = {}
for line in open('.env.local', encoding='utf-8'):
    m = re.match(r'^\s*([\w.-]+)\s*=\s*(.*)\s*$', line)
    if m:
        env[m.group(1)] = m.group(2).strip().strip('"').strip("'")
URL = env['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/')
KEY = env['SUPABASE_SERVICE_ROLE_KEY']
H = {'apikey': KEY, 'Authorization': 'Bearer ' + KEY}
HJ = {**H, 'Content-Type': 'application/json'}
UPLOADER = '0f1db267-e257-460b-9549-2fdd6e6ae988'

years = sys.argv[1:] or sorted({os.path.basename(f)[:4] for f in glob.glob('try/*_고2_3월.hml')})
print(f'대상 연도: {", ".join(years)}\n')


def run(cmd, timeout=3600):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=timeout)
    return (r.stdout or '') + (r.stderr or '')


def get(table, params):
    return requests.get(f'{URL}/rest/v1/{table}', headers=H, params=params, verify=False).json()


for Y in years:
    t0 = time.time()
    SRC = f'전국연합_{Y}_3월 모의고사_전과목'
    hml, hwp, pdf = f'try/{Y}_고2_3월.hml', f'try/{Y}_고2_3월.hwp', f'try/{Y}_고2_3월.pdf'
    zd = f'try/{Y}_고2_3월ㅈㄷ.pdf'
    print('=' * 62)
    print(f'▶ {Y}년 고2 3월')
    for f in (hml, hwp, pdf, zd):
        if not os.path.exists(f):
            print(f'   ⚠ 파일 없음: {f} — 이 연도 건너뜀'); break
    else:
        # ── 1 파싱 ──
        n = len(get('questions', {'select': 'id', 'source_db_id': f'eq.{SRC}'}))
        if n:
            print(f'  1 파싱     : 이미 {n}문항 (스킵)')
        else:
            out = run(f'npx tsx scripts_patched/scratch_batch_ingest.ts "{hml}" "전국연합" "전국" "전국" "{Y}" "3월 모의고사" "전과목" "고2"')
            mm = re.search(r'QCOUNT=(\d+)', out)
            if not mm:
                print('  1 파싱     : ❌ 실패\n' + out[-500:]); continue
            n = int(mm.group(1)); print(f'  1 파싱     : {n}문항')

        qs = sorted(get('questions', {'select': 'id,question_number', 'source_db_id': f'eq.{SRC}'}),
                    key=lambda x: x['question_number'])
        qid = {q['question_number']: q['id'] for q in qs}

        # ── 2 크롭 (ASCII 경로 필수: cv2.imwrite 가 한글경로에 조용히 실패) ──
        cdir = f'hwpx-python-tool/crop_mock_{Y}'
        if os.path.isdir(f'{cdir}/questions') and len(os.listdir(f'{cdir}/questions')) >= n:
            print(f'  2 크롭     : 기존 재사용')
        else:
            out = run(f'python hwpx-python-tool/pdf_crop_v4.py "{zd}" {cdir}')
            mm = re.search(r'Questions:\s*(\d+)\s*\|\s*Solutions:\s*(\d+)', out)
            print(f'  2 크롭     : {mm.group(1) if mm else "?"}문제 / {mm.group(2) if mm else "?"}해설')
            if not mm or int(mm.group(1)) != n:
                print(f'     ⚠ 문항수 불일치(파싱 {n}) — 캡쳐 매칭 주의')

        # ── 3 캡쳐 업로드 ──
        have = {}
        for x in get('question_images', {'select': 'question_id,original_bin_id', 'question_id': f'in.({",".join(qid.values())})'}):
            if str(x['original_bin_id']).startswith('AUTO_'):
                have.setdefault(x['question_id'], set()).add(str(x['original_bin_id'])[5:6])
        up = 0
        ts = int(time.time())
        for no, i in qid.items():
            for mode, folder in (('Q', 'questions'), ('S', 'solutions')):
                if mode in have.get(i, set()):
                    continue
                # pdf_crop_v4 는 2자리 zero-pad 로 저장한다 (q_01.webp) — 1~9번을 놓치던 버그
                p = f'{cdir}/{folder}/{mode.lower()}_{no:02d}.webp'
                if not os.path.exists(p):
                    p = f'{cdir}/{folder}/{mode.lower()}_{no}.webp'
                if not os.path.exists(p):
                    continue
                data = open(p, 'rb').read()
                key = f'auto_captures/{i}_{mode.lower()}_{ts}_0.webp'
                r = requests.post(f'{URL}/storage/v1/object/hwpx/{key}', headers={**H, 'Content-Type': 'image/webp'}, data=data, verify=False)
                if r.status_code not in (200, 409):
                    continue
                requests.post(f'{URL}/rest/v1/question_images', headers=HJ, json={
                    'question_id': i, 'original_bin_id': f'AUTO_{mode}_{ts}_0', 'format': 'webp',
                    'data': f'{URL}/storage/v1/object/public/hwpx/{key}', 'size_bytes': len(data)}, verify=False)
                up += 1
        print(f'  3 캡쳐     : {up}장 업로드 (기존 보유분 제외)')

        # ── 4 AI ──
        out = run(f'npx tsx scratch_batch_ai.ts "{SRC}" "전과목"')
        mm = re.search(r'AI_RESULT ok=(\d+) skip=(\d+) fail=(\d+)', out)
        if not mm:
            print('  4 AI       : ❌ 마커 없음\n' + out[-400:]); continue
        ok, skip, fail = mm.groups()
        print(f'  4 AI       : ok={ok} skip={skip} fail={fail}')
        if int(fail) > 0:
            print('     ⚠ 실패분 있음 — 재실행하면 실패분만 다시 시도')

        # ── 5 교과외 검수 ──
        out = run(f'python scratch_curriculum_check.py "{SRC}" --apply')
        offs = re.findall(r'❌\s*(\d+)번\s+\'([^\']+)\' → \'([^\']+)\'', out)
        mm = re.search(r'교과외 (\d+)/(\d+)문항', out)
        print(f'  5 교과외   : {mm.group(1) if mm else "?"}문항' + (f"  {[f'{a}번 {c}' for a, b, c in offs]}" if offs else ''))

        # ── 5.5 과목·단원 정합성 감사 ──
        # 고2 3월은 고1 범위인데 AI가 '미적분II/여러가지미분법' 같은 고3 과목을 붙이는 일이 있다
        # (2007 13번: 원의 접선·삼각비 문제였음). 자동 수정은 위험하니 경고만 남기고 사람이 판단.
        out = run(f'npx tsx scratch_subject_unit_audit.ts "{SRC}" "공통수학1,공통수학2,대수,확률과통계"')
        warns = [l.strip() for l in out.splitlines() if '⚠' in l]
        mm = re.search(r'AUDIT_BAD=(\d+)', out)
        print(f'  5.5 정합성 : {"이상 없음" if mm and mm.group(1) == "0" else f"⚠ {mm.group(1) if mm else "?"}건 — 확인 필요"}')
        for w in warns:
            print(f'      {w}')

        # ── 6 sorted 전환 (unit·difficulty·캡쳐 있는 문항만) ──
        rows = get('questions', {'select': 'id,question_number,unit,difficulty,work_status', 'source_db_id': f'eq.{SRC}'})
        imgs = {}
        for x in get('question_images', {'select': 'question_id,original_bin_id', 'question_id': f'in.({",".join(qid.values())})'}):
            if str(x['original_bin_id']).startswith('AUTO_'):
                imgs.setdefault(x['question_id'], set()).add(str(x['original_bin_id'])[5:6])
        okids = [r['id'] for r in rows if r['unit'] and r['difficulty'] is not None and len(imgs.get(r['id'], set())) >= 2]
        bad = [r['question_number'] for r in rows if r['id'] not in okids]
        done = 0
        for i in range(0, len(okids), 5):
            rr = requests.patch(f'{URL}/rest/v1/questions', headers=HJ,
                                params={'id': f'in.({",".join(okids[i:i+5])})'}, json={'work_status': 'sorted'}, verify=False)
            if rr.status_code == 204:
                done += len(okids[i:i + 5])
        st = get('questions', {'select': 'work_status', 'source_db_id': f'eq.{SRC}'})
        ns = sum(1 for x in st if x['work_status'] != 'sorted')
        print(f'  6 노출전환 : sorted {len(st)-ns}/{len(st)}' + (f'  ⚠ 미완 {bad}' if bad else ''))

        # ── 7 개인DB ──
        ex = get('exam_materials', {'select': 'id', 'school': 'eq.전국연합', 'exam_year': f'eq.{Y}', 'content_type': 'eq.개인DB'})
        if ex:
            print('  7 개인DB   : 이미 있음 (스킵)')
        else:
            price = sum(int(r['difficulty']) for r in rows if r['difficulty']) * 500
            r = requests.post(f'{URL}/rest/v1/exam_materials', headers={**HJ, 'Prefer': 'return=representation'}, json={
                'title': f'전국연합 {Y} 고2학년 3월 모의고사 [개인DB]', 'region': '전국', 'district': '전국',
                'school': '전국연합', 'grade': 2, 'semester': 3, 'exam_type': '모의고사', 'file_type': 'DB',
                'content_type': '개인DB', 'file_path': f'db_access/{UPLOADER}/{int(time.time()*1000)}',
                'price': price, 'uploader_id': UPLOADER, 'uploader_name': 'mathofhy',
                'subject': '전과정', 'exam_year': int(Y), 'is_verified': True}, verify=False)
            print(f'  7 개인DB   : {r.status_code} · {price:,}P')

        # ── 8 모의고사 탭 ──
        slug = f'{Y}-3월-전국연합-고2-수학'
        if get('mock_exams', {'select': 'id', 'slug': f'eq.{slug}'}):
            print('  8 모의고사 : 이미 있음 (스킵)')
        else:
            import uuid
            folder = str(uuid.uuid4())
            for src, name, ct in ((pdf, 'original.pdf', 'application/pdf'), (hwp, 'original.hwp', 'application/x-hwp')):
                requests.post(f'{URL}/storage/v1/object/mock-materials/{folder}/{name}',
                              headers={**H, 'Content-Type': ct}, data=open(src, 'rb').read(), verify=False)
            r = requests.post(f'{URL}/rest/v1/mock_exams', headers=HJ, json={
                'category': '전국연합', 'exam_year': int(Y), 'grade': '고2', 'month': 3, 'subject': '수학',
                'title': f'{Y} 고2 3월 전국연합 수학', 'slug': slug,
                'original_pdf_path': f'{folder}/original.pdf', 'original_hwp_path': f'{folder}/original.hwp'}, verify=False)
            print(f'  8 모의고사 : {r.status_code} · {slug}')

        print(f'  ✔ {Y} 완료 ({time.time()-t0:.0f}초)')

# ── 9 미리보기 + 캐시 (전 연도 한 번에) ──
print('\n' + '=' * 62)
print(run('python scripts/generate_mock_previews.py').strip()[-300:])
import urllib.parse as up
paths = ['/mock', '/모의고사', '/mock/전국연합'] + [f'/mock/{y}-3월-전국연합-고2-수학' for y in years]
paths += ['/' + '/'.join(up.quote(s) for s in p[1:].split('/')) for p in paths]
r = requests.post('https://mathetf.com/api/revalidate', headers={'x-revalidate-key': KEY, 'Content-Type': 'application/json'},
                  json={'paths': list(dict.fromkeys(paths))}, verify=False, timeout=120)
print(f'캐시 갱신: {r.status_code} · {len(r.json().get("revalidated", []))}경로')
