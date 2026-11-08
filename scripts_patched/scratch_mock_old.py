# -*- coding: utf-8 -*-
"""[옛 모의고사 등록] 가형/나형이 나뉘던 회차용 (2006~2009 등).

기존 관례를 그대로 따른다:
  - source_db_id = '전국연합_{연도}_{월} 모의고사_{형}'   예) 전국연합_2006_6월 모의고사_가형
    (2006 6월 등 기존 회차가 전부 이 형태. '_전과목' 을 쓰는 요즘 회차와 다르다)
  - subject 는 AI 가 단원 기준으로 문항별 확정. ingest 에 넘기는 값은 초기값일 뿐이다.
  - mock_exams slug = '{연도}-{월}월-전국연합-{학년}-수학-{형}'
  - exam_materials 개인DB 는 subject='전과정'

⚠ 옛 회차는 폐지 단원(역행렬·상용로그 지표/가수 등)이 섞여 있다.
   AI 태깅에는 '해당 없음' 선택지가 없어 현행 단원으로 억지 매핑되므로,
   AI 뒤에 scratch_curriculum_check.py --apply 로 구 단원명 복원 + 교과외 딱지를 단다.
   이 단계를 빼먹으면 폐지 내용이 현행 단원 검색에 섞여 나온다.

사용: python scripts_patched/scratch_mock_old.py <연도> <월> <학년> <형>    예) 2006 11 고2 가형
"""
import os
import re
import sys
import time
import uuid
import subprocess
import requests
import urllib3

urllib3.disable_warnings()
sys.stdout.reconfigure(encoding='utf-8', errors='replace', line_buffering=True)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
Y, M, G, TYPE = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
# 파일명 접미와 DB 접미가 다를 수 있다(2012~2014 는 파일 'A' / DB 'A형').
FILE_SUFFIX = sys.argv[5] if len(sys.argv) > 5 else TYPE
BASE = f'{Y}_{G}_{M}월_{FILE_SUFFIX}' if FILE_SUFFIX else f'{Y}_{G}_{M}월'
SEM = f'{M}월 모의고사'
SRC = f'전국연합_{Y}_{SEM}_{TYPE}'
# ⚠ AI 는 subject 가 '전과목/전과정/수학/빈값' 일 때만 과목을 덮어쓴다(scratch_batch_ai.ts).
#   ingest 는 넘긴 과목명으로 source_db_id 를 만들므로 '가형' 을 넘겨야 관례에 맞는데,
#   그대로 두면 문항 과목이 '가형' 으로 굳어 필터에서 사라진다 → 파싱 직후 '전과목' 으로 되돌린다.
# ⚠ AI 잠금과목도 '전과목'(= ALL_SUBJECTS 밖) 이어야 잠금이 풀려 문항별 과목을 고른다.
#   기존 2006 6월 가형이 공통수학1·2·대수로 섞여 있는 게 이 방식의 결과다.
SUBJ0 = '전과목'

env = {}
for line in open(os.path.join(ROOT, '.env.local'), encoding='utf-8'):
    m = re.match(r'^\s*([\w.-]+)\s*=\s*(.*)\s*$', line)
    if m:
        env[m.group(1)] = m.group(2).strip().strip('"').strip("'")

_o = requests.Session.request
requests.Session.request = lambda s, *a, **k: _o(s, *a, **{**k, 'verify': False})
URL = env['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/')
KEY = env['SUPABASE_SERVICE_ROLE_KEY']
H = {'apikey': KEY, 'Authorization': 'Bearer ' + KEY}
HJ = {**H, 'Content-Type': 'application/json'}
TSX = {**os.environ, 'NODE_TLS_REJECT_UNAUTHORIZED': '0', 'PYTHONUTF8': '1'}
UPLOADER = '0f1db267-e257-460b-9549-2fdd6e6ae988'
UPLOADER_NAME = 'mathofhy'
G_NUM = G.replace('고', '')


def retry(fn, what, tries=4):
    """⚠ Supabase 스토리지 업로드가 간헐적으로 연결을 끊는다(WinError 10054).
    세 배치 연속으로 세트당 몇 건씩 여기서 죽어 매번 재실행했다.
    네트워크 오류만 다시 시도한다 — 4xx 같은 진짜 실패는 그대로 올려보낸다."""
    for a in range(tries):
        try:
            return fn()
        except (requests.exceptions.ConnectionError,
                requests.exceptions.ChunkedEncodingError,
                requests.exceptions.Timeout) as e:
            if a == tries - 1:
                raise
            wait = 2 ** a
            print(f'    ↻ {what} 재시도 {a + 1}/{tries - 1} ({type(e).__name__}) — {wait}초 후')
            time.sleep(wait)


def run(cmd, timeout=2400):
    p = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8',
                       errors='replace', cwd=ROOT, env=TSX, timeout=timeout)
    return (p.stdout or '') + (p.stderr or '')


print(f'===== {Y} {G} {M}월 {TYPE} =====')

# 1 파싱
have = requests.get(f'{URL}/rest/v1/questions', headers=H, timeout=180, params={
    'select': 'id', 'source_db_id': f'eq.{SRC}'}).json()
if have:
    print(f'  파싱: 기존 {len(have)}문항 재사용')
else:
    out = run(['npx.cmd', 'tsx', 'scripts_patched/scratch_batch_ingest.ts', f'try/{BASE}.hml',
               '전국연합', '전국', '전국', Y, SEM, TYPE, G])
    m = re.search(r'QCOUNT=(\d+)', out) or re.search(r'EXISTS=(\d+)', out)
    if not m:
        raise SystemExit(f'파싱 실패: {out[-400:]}')
    requests.patch(f'{URL}/rest/v1/questions', headers=HJ, timeout=180,
                   params={'source_db_id': f'eq.{SRC}', 'subject': f'eq.{TYPE}'},
                   json={'subject': '전과목'})
    print(f'  파싱: {m.group(1)}문항 (subject 가형/나형 -> 전과목 정정)')

qs = requests.get(f'{URL}/rest/v1/questions', headers=H, timeout=180, params={
    'select': 'id,question_number', 'source_db_id': f'eq.{SRC}',
    'order': 'question_number.asc'}).json()
n = len(qs)
print(f'  DB 문항 {n}개')

# 2 크롭 — 출력 경로는 ASCII (cv2.imwrite 가 한글 경로에서 조용히 실패)
crop = f'crop_batch/mock_{Y}_{M}_{G_NUM}_' + {'가형':'ga','나형':'na','A형':'a','B형':'b','전과목':'all'}.get(TYPE, TYPE)
qdir = os.path.join(ROOT, 'hwpx-python-tool', crop, 'questions')
sdir = os.path.join(ROOT, 'hwpx-python-tool', crop, 'solutions')
if not (os.path.isdir(qdir) and len([f for f in os.listdir(qdir) if f.endswith('.webp')]) == n):
    p = subprocess.run([sys.executable, 'pdf_crop_v4.py', f'../try/{BASE}ㅈㄷ.pdf', crop],
                       capture_output=True, text=True, encoding='utf-8', errors='replace',
                       cwd=os.path.join(ROOT, 'hwpx-python-tool'), env=TSX, timeout=1200)
    if p.returncode != 0:
        raise SystemExit(f'크롭 실패: {(p.stdout or "")[-300:]}')
qf = sorted(f for f in os.listdir(qdir) if f.endswith('.webp'))
sf = sorted(f for f in os.listdir(sdir) if f.endswith('.webp')) if os.path.isdir(sdir) else []
if len(qf) != n or len(sf) != n:
    raise SystemExit(f'크롭 개수 불일치: 문제{len(qf)}/해설{len(sf)} vs 문항{n}')
# ⚠ 개수만 맞으면 통과시켰더니 '빈 파일'이 그대로 올라갔다(2026-09-08 감사에서 3건 발견).
#   크롭이 단 경계에서 실패하면 176~184바이트짜리 껍데기가 나온다. 렌더러는 캡쳐가 있으면
#   그걸 그대로 보여주고 XML 로 폴백하지 않으므로, 화면에서 빈 이미지가 된다.
#   여기서 잡아 등록을 멈춘다 — 사용자가 그 문항을 만나기 전에.
_tiny = [f for f in qf + sf
         if os.path.getsize(os.path.join(qdir if f.startswith('q_') else sdir, f)) < 1024]
if _tiny:
    raise SystemExit(f'크롭 빈 파일 {len(_tiny)}건(1KB 미만): {_tiny[:6]} — '
                     f'원본 ㅈㄷ.pdf 의 해당 쪽에서 단 분리가 실패했다. 쪽 나눔을 넣고 다시 뽑아야 한다.')
print(f'  크롭: 문제 {len(qf)} + 해설 {len(sf)} 일치 · 빈 파일 없음')

# 3 캡쳐 업로드 (멱등)
ts = int(time.time() * 1000)
up = 0
for i, q in enumerate(qs):
    imgs = retry(lambda: requests.get(f'{URL}/rest/v1/question_images', headers=H, timeout=120, params={
        'select': 'original_bin_id', 'question_id': f"eq.{q['id']}"}).json(), f'{i+1}번 이미지조회')
    bins = [x['original_bin_id'] or '' for x in imgs]
    for mode, d, letter, pfx in [('question', qdir, 'q', 'AUTO_Q_'),
                                 ('solution', sdir, 's', 'AUTO_S_')]:
        want = ('AUTO_Q_', 'MANUAL_Q_') if mode == 'question' else ('AUTO_S_', 'MANUAL_S_')
        if any(b.startswith(want) for b in bins):
            continue
        data = open(os.path.join(d, f'{letter}_{i + 1:02d}.webp'), 'rb').read()
        sp = f"auto_captures/{q['id']}_{mode}_{ts}_{i}.webp"
        retry(lambda: requests.post(f'{URL}/storage/v1/object/hwpx/{sp}',
                                    headers={**H, 'Content-Type': 'image/webp'}, data=data, timeout=180),
              f'{i+1}번 {mode} 업로드')
        r = retry(lambda: requests.post(f'{URL}/rest/v1/question_images', headers=HJ, timeout=120, json={
            'question_id': q['id'], 'original_bin_id': f'{pfx}{ts}_{i}', 'format': 'webp',
            'data': f'{URL}/storage/v1/object/public/hwpx/{sp}', 'size_bytes': len(data)}),
                  f'{i+1}번 {mode} 등록')
        if r.status_code not in (200, 201):
            raise SystemExit(f'캡쳐 DB 실패 {i + 1}: {r.text[:120]}')
        up += 1
print(f'  캡쳐: 신규 업로드 {up}건')

# 4 AI (멱등)
m = None
for attempt in (1, 2):
    out = run(['npx.cmd', 'tsx', 'scratch_batch_ai.ts', SRC, SUBJ0])
    m = re.search(r'AI_RESULT ok=(\d+) skip=(\d+) fail=(\d+)', out)
    if m and int(m.group(3)) == 0:
        break
    if attempt == 2:
        raise SystemExit(f'AI 미완료: {out[-300:]}')
    time.sleep(10)
print(f'  AI: ok={m.group(1)} skip={m.group(2)} fail={m.group(3)}')

# 5 교과외 검수 — 옛 회차에는 반드시 필요하다
for attempt in (1, 2):
    out = run([sys.executable, 'scratch_curriculum_check.py', SRC, '--apply'], timeout=1800)
    if '판정실패' not in out:
        break
    time.sleep(10)
mk = re.search(r'교과외[^\n]*?(\d+)\s*문항', out) or re.search(r'(\d+)\s*문항[^\n]*교과외', out)
print(f'  교과외 검수: {mk.group(0) if mk else out.strip().splitlines()[-1][:80] if out.strip() else "출력 없음"}')

# 6 완결성 검증 → sorted
full = requests.get(f'{URL}/rest/v1/questions', headers=H, timeout=180, params={
    'select': 'question_number,unit,difficulty,embedding', 'source_db_id': f'eq.{SRC}'}).json()
bad = [q['question_number'] for q in full
       if not (q['unit'] and q['difficulty'] not in (None, '') and q['embedding'])]
if bad:
    raise SystemExit(f'AI데이터 불완전 문항: {bad}')
requests.patch(f'{URL}/rest/v1/questions', headers=HJ, timeout=180,
               params={'source_db_id': f'eq.{SRC}'}, json={'work_status': 'sorted'})
print('  검증 통과 -> sorted')

# 7 개인DB (멱등)
price = sum(int(str(q['difficulty'])) * 500 for q in full)
title_db = f'전국연합 {Y} {G}학년 {M}월 모의고사 {TYPE} [개인DB]'
ex = requests.get(f'{URL}/rest/v1/exam_materials', headers=H, timeout=180, params={
    'select': 'id', 'school': 'eq.전국연합', 'exam_year': f'eq.{Y}', 'grade': f'eq.{G_NUM}',
    'semester': f'eq.{M}', 'exam_type': 'eq.모의고사', 'subject': 'eq.전과정',
    'title': f'eq.{title_db}', 'limit': '1'}).json()
if ex:
    requests.patch(f'{URL}/rest/v1/exam_materials', headers=HJ, timeout=180,
                   params={'id': f"eq.{ex[0]['id']}"}, json={'price': price})
    print(f'  개인DB: 갱신 {price}P')
else:
    r = requests.post(f'{URL}/rest/v1/exam_materials', headers=HJ, timeout=180, json={
        'uploader_id': UPLOADER, 'uploader_name': UPLOADER_NAME, 'school': '전국연합',
        'region': '전국', 'district': '전국', 'grade': int(G_NUM), 'semester': int(M),
        'exam_type': '모의고사', 'subject': '전과정', 'title': title_db,
        'exam_year': int(Y), 'file_type': 'DB', 'content_type': '개인DB',
        'file_path': f'db_access/{UPLOADER}/{ts}', 'price': price,
        'sales_count': 0, 'is_verified': True})
    if r.status_code != 201:
        raise SystemExit(f'개인DB 생성 실패: {r.text[:150]}')
    print(f'  개인DB: 생성 {price}P')

# 8 모의고사탭 + 원본 업로드
# ⚠ 형 구분이 없는 회차(2020~)는 slug 에 접미를 붙이지 않는다 — 기존 관례.
#   '전과목' 을 붙였다가 2020 11월이 404 가 났다(2026-09-07).
slug = f'{Y}-{M}월-전국연합-{G}-수학' + ('' if TYPE == '전과목' else f'-{TYPE}')
exists = requests.get(f'{URL}/rest/v1/mock_exams', headers=H, timeout=120,
                      params={'select': 'id', 'slug': f'eq.{slug}'}).json()
if exists:
    print(f'  모의고사탭: 이미 있음 ({slug})')
else:
    folder = str(uuid.uuid4())
    for src_f, name, ct in ((f'try/{BASE}.pdf', 'original.pdf', 'application/pdf'),
                            (f'try/{BASE}.hwp', 'original.hwp', 'application/x-hwp')):
        requests.post(f'{URL}/storage/v1/object/mock-materials/{folder}/{name}',
                      headers={**H, 'Content-Type': ct},
                      data=open(os.path.join(ROOT, src_f), 'rb').read(), timeout=600)
    r = requests.post(f'{URL}/rest/v1/mock_exams', headers=HJ, timeout=180, json={
        'category': '전국연합', 'exam_year': int(Y), 'grade': G, 'month': int(M),
        'subject': '수학', 'title': f'{Y} {G} {M}월 전국연합 수학 {TYPE}', 'slug': slug,
        'original_pdf_path': f'{folder}/original.pdf',
        'original_hwp_path': f'{folder}/original.hwp'})
    print(f'  모의고사탭: {r.status_code} · {slug}')

print('완료')
