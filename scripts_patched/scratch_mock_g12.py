# -*- coding: utf-8 -*-
"""[고1·고2 모의고사 등록] 30문항 단일 과목 구조.

고3(46문항 4과목 분할)과 다르다:
  - 고1·고2 는 선택과목이 없어 30문항이 한 덩어리
  - source_db_id 는 학년 구분 없이 '전국연합_{연도}_{월} 모의고사_전과목' 하나를 공유한다
    (기존 2020~2025 회차가 전부 이 형태 — 고1 30 + 고2 30 = 60문항)
    → 중복 판정·sorted 전환은 반드시 grade 필터를 함께 걸어야 한다
  - subject 는 AI 가 단원 기준으로 문항별로 확정한다. 여기 값은 초기값일 뿐이다.
  - mock_exams 는 학년별 1행

사용: python scripts_patched/scratch_mock_g12.py <연도> <월> <학년>     예) 2026 9 고1
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
Y, M, G = sys.argv[1], sys.argv[2], sys.argv[3]
BASE = f'{Y}_{G}_{M}월'
SEM = f'{M}월 모의고사'
SRC = f'전국연합_{Y}_{SEM}_전과목'
SUBJ0 = '공통수학1' if G == '고1' else '대수'

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


def run(cmd, timeout=2400):
    p = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8',
                       errors='replace', cwd=ROOT, env=TSX, timeout=timeout)
    return (p.stdout or '') + (p.stderr or '')


print(f'===== {Y} {G} {M}월 전국연합 =====')

# 1 파싱 — 같은 source_db_id 를 고1·고2 가 공유하므로 grade 로 중복을 가른다
have = requests.get(f'{URL}/rest/v1/questions', headers=H, timeout=180, params={
    'select': 'id', 'source_db_id': f'eq.{SRC}', 'grade': f'eq.{G}'}).json()
if have:
    print(f'  파싱: 기존 {len(have)}문항 재사용')
else:
    # ⚠ ingest 는 넘긴 과목명으로 source_db_id 를 만든다.
    #   기존 회차가 전부 '..._전과목' 이라 여기서도 '전과목' 을 넘겨야 같은 묶음에 들어간다.
    #   문항별 실제 과목은 뒤의 AI 단계가 단원 기준으로 덮어쓴다.
    out = run(['npx.cmd', 'tsx', 'scripts_patched/scratch_batch_ingest.ts', f'try/{BASE}.hml',
               '전국연합', '전국', '전국', Y, SEM, '전과목', G])
    m = re.search(r'QCOUNT=(\d+)', out) or re.search(r'EXISTS=(\d+)', out)
    if not m:
        raise SystemExit(f'파싱 실패: {out[-400:]}')
    print(f'  파싱: {m.group(1)}문항')

qs = requests.get(f'{URL}/rest/v1/questions', headers=H, timeout=180, params={
    'select': 'id,question_number', 'source_db_id': f'eq.{SRC}', 'grade': f'eq.{G}',
    'order': 'question_number.asc'}).json()
n = len(qs)
print(f'  DB 문항 {n}개')

# 2 크롭 — 출력 경로는 ASCII 여야 한다(cv2.imwrite 가 한글 경로에서 조용히 실패)
crop = f'crop_batch/mock_{Y}_{M}_{G.replace("고", "")}'
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
print(f'  크롭: 문제 {len(qf)} + 해설 {len(sf)} 일치')

# 3 캡쳐 업로드 (멱등)
ts = int(time.time() * 1000)
up = 0
for i, q in enumerate(qs):
    imgs = requests.get(f'{URL}/rest/v1/question_images', headers=H, timeout=120, params={
        'select': 'original_bin_id', 'question_id': f"eq.{q['id']}"}).json()
    bins = [x['original_bin_id'] or '' for x in imgs]
    for mode, d, letter, pfx in [('question', qdir, 'q', 'AUTO_Q_'),
                                 ('solution', sdir, 's', 'AUTO_S_')]:
        want = ('AUTO_Q_', 'MANUAL_Q_') if mode == 'question' else ('AUTO_S_', 'MANUAL_S_')
        if any(b.startswith(want) for b in bins):
            continue
        data = open(os.path.join(d, f'{letter}_{i + 1:02d}.webp'), 'rb').read()
        sp = f"auto_captures/{q['id']}_{mode}_{ts}_{i}.webp"
        requests.post(f'{URL}/storage/v1/object/hwpx/{sp}',
                      headers={**H, 'Content-Type': 'image/webp'}, data=data, timeout=180)
        r = requests.post(f'{URL}/rest/v1/question_images', headers=HJ, timeout=120, json={
            'question_id': q['id'], 'original_bin_id': f'{pfx}{ts}_{i}', 'format': 'webp',
            'data': f'{URL}/storage/v1/object/public/hwpx/{sp}', 'size_bytes': len(data)})
        if r.status_code not in (200, 201):
            raise SystemExit(f'캡쳐 DB 실패 {i + 1}: {r.text[:120]}')
        up += 1
print(f'  캡쳐: 신규 업로드 {up}건')

# 4 AI (멱등) — src 를 고1·고2 가 공유하므로 상대 학년까지 함께 처리될 수 있으나 무해하다
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

# 5 완결성 검증 → sorted (grade 필터 필수)
full = requests.get(f'{URL}/rest/v1/questions', headers=H, timeout=180, params={
    'select': 'question_number,unit,difficulty,embedding',
    'source_db_id': f'eq.{SRC}', 'grade': f'eq.{G}'}).json()
bad = [q['question_number'] for q in full
       if not (q['unit'] and q['difficulty'] not in (None, '') and q['embedding'])]
if bad:
    raise SystemExit(f'AI데이터 불완전 문항: {bad}')
requests.patch(f'{URL}/rest/v1/questions', headers=HJ, timeout=180,
               params={'source_db_id': f'eq.{SRC}', 'grade': f'eq.{G}'},
               json={'work_status': 'sorted'})
print('  검증 통과 -> sorted')

# 6 모의고사탭 + 원본 업로드
slug = f'{Y}-{M}월-전국연합-{G}-수학'
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
        'subject': '수학', 'title': f'{Y} {G} {M}월 전국연합 수학', 'slug': slug,
        'original_pdf_path': f'{folder}/original.pdf',
        'original_hwp_path': f'{folder}/original.hwp'})
    print(f'  모의고사탭: {r.status_code} · {slug}')

print('완료')
