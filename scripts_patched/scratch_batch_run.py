# -*- coding: utf-8 -*-
"""
[배치 오케스트레이터] try/ 폴더 자료 세트 전체 등록.
세트당: 파싱(tsx) → 자동크롭 → 캡쳐 업로드 → AI(tsx) → 검증 → sorted → 개인DB → 판매행(PDF/HWP).
전 단계 멱등: 재실행하면 이미 된 단계는 건너뜀. 실패 세트는 기록 후 다음 세트 계속.
사용: python scripts_patched/scratch_batch_run.py            # 서라벌 제외 전체
"""
import os, re, sys, time, random, string, subprocess, json, zlib
import sys as _stdio_sys
# Windows: 출력이 파이프/파일이면 stdout 이 cp949 가 되어 이모지·em dash 에서 즉사한다.
try: _stdio_sys.stdout.reconfigure(encoding='utf-8', errors='replace', line_buffering=True)
except Exception: pass

import requests
import urllib3 as _u; _u.disable_warnings()
_o = requests.Session.request
# [10/16] 시간 제한 없는 요청이 응답을 못 받으면 배치가 영원히 멈췄다(10/16 99세트 1·2차 둘 다 마지막 세트에서 30분+ 정지).
#   기본 60초 제한 + 조회(GET)만 3번 재시도. 넣기·수정은 재시도하면 중복 행이 생길 수 있어 그대로 예외 → 그 세트만 실패(재실행으로 이어짐).
def _req(self, method, url, *a, **k):
    k = {**k, 'verify': False}
    k.setdefault('timeout', 60)
    for t in range(3 if str(method).upper() == 'GET' else 1):
        try: return _o(self, method, url, *a, **k)
        except (requests.Timeout, requests.ConnectionError):
            if t == 2 or str(method).upper() != 'GET': raise
            time.sleep(5 * (t + 1))
requests.Session.request = _req

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def load_env():
    env = {}
    with open(os.path.join(ROOT, '.env.local'), encoding='utf-8') as f:
        for line in f:
            m = re.match(r'^\s*([\w.-]+)\s*=\s*(.*)\s*$', line)
            if m: env[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    return env
ENV = load_env()
URL = ENV['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/')
KEY = ENV['SUPABASE_SERVICE_ROLE_KEY']
H = {'apikey': KEY, 'Authorization': f'Bearer {KEY}'}
HJ = {**H, 'Content-Type': 'application/json'}
UPLOADER = '0f1db267-e257-460b-9549-2fdd6e6ae988'
UPLOADER_NAME = 'mathofhy'

# (파일베이스, 학교정식명, 시도, 구군, 학기라벨, 학기번호, 과목, 학년, 연도)
# ⚠ 연도는 세트마다 다를 수 있다. 예전엔 전역 YEAR 하나였는데, 2025 자료와 2026 자료를
#   한 배치에 넣으면 2026 것이 조용히 2025 로 등록된다(8/28 발견, 등록 직전에 잡음).
#   빠뜨리면 DEFAULT_YEAR 를 쓴다.
# [완료 이력] 7/21 수학II 고2 24개교 / 7/23 강남 3 / 8/24~26 강남 4 + 송파 5 + 송파 7
#             8/26 노원 3 / 8/27 노원 2 + 혜성여고 재등록 + 서초 6 + 양천 5 / 8/28 강남 5(고2)
#             8/29 강동 2 + 광진 1(기하) + 서초 5(고2 수학II)
# 8/29 서초 3개교 — 양재고는 .hml 이 늦게 들어와 이번에 처리. 세화여·언남은 2026 고2 기하.
# 8/31 성남 6 + 강남 2 — 전부 2025 고1 2학기기말 공통수학2 (2학기기말은 DB에 191문항뿐이라 희소 구간)
# 9/2 송파 7개교 추가(문현·방산·배명·보성·보인·영파여·오금).
#   try/ 에 기등록분이 남아 있어 source_db_id 대조로 신규만 골랐다.
# 9/2 서울 13개교(도봉1·서초9·송파3) 2025 고1 2학기기말 공통수학2.
#   ⚠ 파일명 '세화고등학교(서초)' 는 사용자가 붙인 구분용 괄호 — DB 정식명은 '세화고등학교'.
#     그대로 넣으면 기존 4회차와 다른 학교로 갈라진다. ALIAS 로 교정했다.
# 9/1 서울 18개교(강남7·강동2·강북1·광진2·노원6) 2025 고1 2학기기말 공통수학2.
#   ⏸ 배재고는 **보류**(제외 아님). ㅈㄷ·pdf·hml 에 '[별첨] ⚠ 출제 오류 의심'(22번 답이
#     유일하게 결정되지 않음)과 '(검증 참고: 후보 정답과 불일치)' 가 있었다.
#     학교 시험 문제 자체의 오류라 사용자가 수정본을 다시 올릴 예정이다.
#     **수정본이 try/ 에 들어오면 그때 등록한다.** 빠뜨리지 말 것.
# 8/31 강남 5 추가. ⚠ 파일명 '단대부고' 는 약칭 — DB 정식명 '단국대학교사범대학부속고등학교' 로 넣어야
#   학교 페이지가 둘로 갈라지지 않는다. 약칭 파일이 또 오면 ALIAS 대조를 먼저 할 것.
SETS = [
# 9/13 강남 2022 고1 2학기 수학(하) — 2배치(11~19).
    ('서울_강남구_2022년_2중간_경기여자고등학교1_수학(하)', '경기여자고등학교', '서울', '강남구', '2학기중간', 2, '수학(하)', '고1', '2022'),
    ('서울_강남구_2022년_2중간_단국대학교사범대학부속고등학교1_수학(하)', '단국대학교사범대학부속고등학교', '서울', '강남구', '2학기중간', 2, '수학(하)', '고1', '2022'),
    ('서울_강남구_2022년_2중간_서울세종고등학교1_수학(하)', '서울세종고등학교', '서울', '강남구', '2학기중간', 2, '수학(하)', '고1', '2022'),
    ('서울_강남구_2022년_2중간_숙명여자고등학교1_수학(하)', '숙명여자고등학교', '서울', '강남구', '2학기중간', 2, '수학(하)', '고1', '2022'),
    ('서울_강남구_2022년_2중간_압구정고등학교1_수학(하)', '압구정고등학교', '서울', '강남구', '2학기중간', 2, '수학(하)', '고1', '2022'),
    ('서울_강남구_2022년_2중간_영동고등학교1_수학(하)', '영동고등학교', '서울', '강남구', '2학기중간', 2, '수학(하)', '고1', '2022'),
    ('서울_강남구_2022년_2중간_은광여자고등학교1_수학(하)', '은광여자고등학교', '서울', '강남구', '2학기중간', 2, '수학(하)', '고1', '2022'),
    ('서울_강남구_2022년_2중간_중동고등학교1_수학(하)', '중동고등학교', '서울', '강남구', '2학기중간', 2, '수학(하)', '고1', '2022'),
    ('서울_강남구_2022년_2중간_중산고등학교1_수학(하)', '중산고등학교', '서울', '강남구', '2학기중간', 2, '수학(하)', '고1', '2022'),
]
DEFAULT_YEAR = '2025'   # SETS 에 연도를 안 적은 세트에만 쓰인다
TSX_ENV = {**os.environ, 'NODE_TLS_REJECT_UNAUTHORIZED': '0', 'PYTHONUTF8': '1'}

# ── [2026-09-14] 플랜 파일로 SETS 를 받는다 (하루 100세트 체제) ──
# scratch_batch_preflight.py 가 try/ 를 읽어 파일 4종·해설·크롭 기준·학교명·동명이교·기등록을 점검하고
# 통과한 세트만 _trylog/_plan.json 에 쓴다. 손으로 SETS 를 적다 정규식이 아랫줄까지 지운 사고(8월)를 없앤다.
# 위 SETS 리터럴은 예전 방식(수동)으로 남겨두되, --plan 이 오면 통째로 대체한다.
PLAN_SCHOOL_ROWS = []
if '--plan' in sys.argv:
    _pp = sys.argv[sys.argv.index('--plan') + 1]
    with open(_pp, encoding='utf-8') as _f:
        _plan = json.load(_f)
    if _plan.get('hold'):
        print(f"⛔ 보류 문구가 있는 세트 {len(_plan['hold'])}개 — 사용자 확인 전까지 배치를 시작하지 않는다:")
        for _h in _plan['hold']: print(f"   {_h['base']}  ({_h['where']})")
        sys.exit(2)
    SETS = [tuple(x) for x in _plan['ok']]
    PLAN_SCHOOL_ROWS = _plan.get('school_rows') or []
    print(f'플랜 로드: {_pp} → {len(SETS)}세트 (스킵 {len(_plan.get("skip", []))})')
    if not SETS:
        print('등록할 세트가 없다'); sys.exit(0)

# 동명이교로 접두를 붙인 학교는 ingest 가 schools 를 안 건드리므로 여기서 행을 만든다(멱등).
for _sr in PLAN_SCHOOL_ROWS:
    _ex = requests.get(f'{URL}/rest/v1/schools', headers=H, params={'select': 'id', 'name': f"eq.{_sr['name']}", 'limit': '1'}).json()
    if not _ex:
        _r = requests.post(f'{URL}/rest/v1/schools', headers=HJ, json=_sr)
        print(f"schools 행 추가: {_sr['name']} ({_sr['region']} {_sr['district']}) → {_r.status_code}")

WORKERS = int(sys.argv[sys.argv.index('--workers') + 1]) if '--workers' in sys.argv else 1

def G(t, p): return requests.get(f'{URL}/rest/v1/{t}', headers=H, params=p).json()
def rand6(): return ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))

def retry_post(url, headers, data, n=4):
    for i in range(n):
        try:
            r = requests.post(url, headers=headers, data=data, timeout=90)
            if r.status_code in (200, 201): return r
            # 409 Duplicate = 이전 시도가 서버엔 성공(응답만 유실) → 성공으로 간주
            if r.status_code in (400, 409) and ('Duplicate' in r.text or 'already exists' in r.text): return r
            last = f'HTTP {r.status_code} {r.text[:100]}'
        except Exception as e:
            last = type(e).__name__
        time.sleep(2 + i * 2)
    raise RuntimeError(f'업로드 실패({n}회): {last}')

import shutil
NPX = shutil.which('npx.cmd') or shutil.which('npx')

def run_tsx(args):
    p = subprocess.run([NPX, 'tsx'] + args, capture_output=True, text=True, encoding='utf-8',
                       errors='replace', cwd=ROOT, env=TSX_ENV, timeout=1800)
    return p

def src_for(school, year, semstr, subject, grade):
    """[10/16] 출처 이름. 기본은 학교_연도_학기_과목 — 학년이 없어 같은 학교·학기에 학년만 다른 같은 과목
    (용화여고 2026 2중간 2학년 기하 / 3학년 기하)이 한 이름으로 겹쳐 덮어쓰일 뻔했다.
    같은 이름이 다른 학년으로 이미 있으면(또는 학년 붙은 이름이 이미 있으면) 학교_연도_학기_N학년_과목 을 쓴다.
    과목은 계속 마지막 칸(마지막 칸=과목으로 읽는 코드 호환), 기존 이름은 그대로."""
    plain = f'{school}_{year}_{semstr}_{subject}'
    graded = f'{school}_{year}_{semstr}_{re.sub(r"[^0-9]", "", str(grade))}학년_{subject}'
    if G('questions', {'select': 'id', 'source_db_id': f'eq.{graded}', 'limit': '1'}): return graded
    have = G('questions', {'select': 'grade', 'source_db_id': f'eq.{plain}', 'limit': '1'})
    if have and have[0].get('grade') and have[0]['grade'] != grade: return graded
    return plain

def process_set(idx, base, school, region, district, semstr, semnum, subject, grade, YEAR=DEFAULT_YEAR):
    src = src_for(school, YEAR, semstr, subject, grade)
    exam_type = '중간고사' if '중간' in semstr else '기말고사'
    gd = grade.replace('고', '').replace('중', '')  # '고1' → '1'
    tag = school.replace('등학교', '')
    print(f'\n===== {tag} ({grade} {semstr} {subject}) =====', flush=True)

    # [11/6 대표 승인] 단계별 시간 — 어디가 느린지 실측. 세트 끝에 '⏱' 한 줄로 찍는다.
    _times = {}; _t = time.time()
    def _lap(name):
        nonlocal _t
        _times[name] = _times.get(name, 0) + time.time() - _t; _t = time.time()

    # [11/6] 앞선 실행에서 캡쳐까지 끝난 세트는 파싱을 건너뛴다(태깅 전 1차 → 2차 재실행 단축).
    #   표시 파일은 크롭 폴더 안에 둔다 — 교체(scratch_replace_inplace)는 크롭 폴더를 지우므로 표시도 함께 사라져 처음부터 돈다.
    #   ⚠ 문항 수·크롭 수·캡쳐 확인은 그대로 한다. 건너뛰는 건 파싱(tsx 기동)과 크롭 재실행뿐.
    _stage_file = os.path.join(ROOT, 'hwpx-python-tool', f'crop_batch/{zlib.crc32(base.encode("utf-8")):08x}_g{gd}s{semnum}', '_stage1.json')
    _stage = None
    try:
        _stage = json.load(open(_stage_file, encoding='utf-8'))
        if _stage.get('src') != src: _stage = None
    except (OSError, ValueError):
        pass

    qcount = None
    if _stage:
        qs = G('questions', {'select': 'id,question_number', 'source_db_id': f'eq.{src}', 'order': 'question_number.asc'})
        if len(qs) == _stage.get('qcount'):
            qcount = len(qs); print(f'  파싱: 앞선 실행분 {qcount}문항 (건너뜀)')
    if qcount is None:
        # 1. 파싱 (멱등) — tsx가 Windows에서 종료 시 크래시할 수 있어 종료코드가 아닌 stdout 마커를 신뢰
        p = run_tsx(['scripts_patched/scratch_batch_ingest.ts', f'try/{base}.hml', school, region, district, YEAR, semstr, subject, grade, src])
        out = (p.stdout or '') + (p.stderr or '')
        m_new, m_ex = re.search(r'QCOUNT=(\d+)', out), re.search(r'EXISTS=(\d+)', out)
        if m_new:
            qcount = int(m_new.group(1)); print(f'  파싱: 신규 {qcount}문항')
        elif m_ex:
            qcount = int(m_ex.group(1)); print(f'  파싱: 기존 {qcount}문항 재사용')
        else:
            raise RuntimeError(f'파싱 실패(마커 없음): {out[-300:]}')

        qs = G('questions', {'select': 'id,question_number', 'source_db_id': f'eq.{src}', 'order': 'question_number.asc'})
        if len(qs) != qcount: raise RuntimeError(f'문항 수 불일치 DB={len(qs)} vs {qcount}')
    _lap('파싱')

    # 2. 자동크롭 (멱등: 출력폴더 있으면 재사용)
    # ⚠ 출력경로는 반드시 ASCII — cv2.imwrite 가 Windows 한글 경로에서 조용히 실패(0파일, 에러 없음)
    # ⚠ 예전엔 set 번호만 썼다(crop_batch/set01). 배치가 바뀌어도 번호가 같아서
    #   "이미 있으니 재사용"으로 판단해 **이전 배치의 다른 학교 이미지가 붙는다.**
    #   개수가 맞으면 감사에도 안 걸린다(8/24 발견, 6월 회차 crop_2013A 와 같은 사고).
    #   → 세트를 식별하는 이름을 쓴다. ASCII 만 허용(cv2.imwrite 가 한글 경로에서 조용히 실패).
    #   base(파일베이스)는 세트마다 유일하므로 그걸로 이름을 만든다. 한글은 못 쓰니 해시로.
    outdir = f'crop_batch/{zlib.crc32(base.encode("utf-8")):08x}_g{gd}s{semnum}'
    q_dir = os.path.join(ROOT, 'hwpx-python-tool', outdir, 'questions')
    s_dir = os.path.join(ROOT, 'hwpx-python-tool', outdir, 'solutions')
    if not (os.path.isdir(q_dir) and len([f for f in os.listdir(q_dir) if f.endswith('.webp')]) == qcount):
        p = subprocess.run([sys.executable, 'pdf_crop_v4.py', f'../try/{base}ㅈㄷ.pdf', outdir],
                           capture_output=True, text=True, encoding='utf-8', errors='replace',
                           cwd=os.path.join(ROOT, 'hwpx-python-tool'), env=TSX_ENV, timeout=600)
        if p.returncode != 0: raise RuntimeError(f'크롭 실패: {(p.stdout or "")[-200:]}{(p.stderr or "")[-200:]}')
    qf = sorted(f for f in os.listdir(q_dir) if f.endswith('.webp'))
    sf = sorted(f for f in os.listdir(s_dir) if f.endswith('.webp')) if os.path.isdir(s_dir) else []
    if len(qf) != qcount or len(sf) != qcount:
        raise RuntimeError(f'크롭 개수 불일치: 문제{len(qf)}/해설{len(sf)} vs 문항{qcount} — 수동 확인 필요')
    print(f'  크롭: 문제 {len(qf)} + 해설 {len(sf)} 일치')
    _lap('크롭')

    # 3. 캡쳐 업로드 (멱등: 문항별 AUTO/MANUAL 캡쳐 있으면 스킵)
    ts = int(time.time() * 1000)
    up_cnt = 0
    # [11/6] 문항마다 조회하던 것을 회차 한 번으로 묶는다(문항 30개 → 조회 1번). id 30개면 URL 길이 문제 없다.
    _bins = {}
    for _x in G('question_images', {'select': 'question_id,original_bin_id', 'question_id': f"in.({','.join(q['id'] for q in qs)})"}):
        _bins.setdefault(_x['question_id'], []).append(_x['original_bin_id'])
    for i, q in enumerate(qs):
        bins = _bins.get(q['id'], [])
        for mode, d, letter, pfx in [('question', q_dir, 'q', 'AUTO_Q_'), ('solution', s_dir, 's', 'AUTO_S_')]:
            if any(b.startswith(('AUTO_Q_', 'MANUAL_Q_')) if mode == 'question' else b.startswith(('AUTO_S_', 'MANUAL_S_')) for b in bins):
                continue
            fp = os.path.join(d, f'{letter}_{i+1:02d}.webp')
            data = open(fp, 'rb').read()
            sp = f"auto_captures/{q['id']}_{mode}_{ts}_{i}.webp"
            retry_post(f'{URL}/storage/v1/object/hwpx/{sp}', {**H, 'Content-Type': 'image/webp'}, data)
            r = requests.post(f'{URL}/rest/v1/question_images', headers=HJ, json={
                'question_id': q['id'], 'original_bin_id': f'{pfx}{ts}_{i}', 'format': 'webp',
                'data': f'{URL}/storage/v1/object/public/hwpx/{sp}', 'size_bytes': len(data)})
            if r.status_code not in (200, 201): raise RuntimeError(f'캡쳐 DB 실패 Q{i+1}: {r.text[:100]}')
            up_cnt += 1
    print(f'  캡쳐: 신규 업로드 {up_cnt}건')
    _lap('캡쳐')
    try:
        json.dump({'src': src, 'qcount': qcount}, open(_stage_file, 'w', encoding='utf-8'))
    except OSError:
        pass   # 표시를 못 남겨도 다음 실행이 처음부터 돌 뿐이다

    # 4. AI (멱등) — 마커 기준, fail>0 이면 1회 재시도
    m = None
    for attempt in (1, 2):
        p = run_tsx(['scratch_batch_ai.ts', src, subject])
        out_ai = (p.stdout or '') + (p.stderr or '')
        m = re.search(r'AI_RESULT ok=(\d+) skip=(\d+) fail=(\d+)', out_ai)
        if m and int(m.group(3)) == 0: break
        if attempt == 2:
            raise RuntimeError(f'AI 미완료: {out_ai[-300:]}')
        time.sleep(10)
    print(f'  AI: ok={m.group(1)} skip={m.group(2)} fail={m.group(3)}')
    _lap('AI')

    # 5. 완결성 검증 → sorted
    full = G('questions', {'select': 'id,question_number,unit,difficulty,embedding', 'source_db_id': f'eq.{src}'})
    bad = [q['question_number'] for q in full if not (q['unit'] and q['difficulty'] not in (None, '') and q['embedding'])]
    if bad: raise RuntimeError(f'AI데이터 불완전 문항: {bad}')
    # ⚠ 이 PATCH 는 응답을 안 보다가 9/20 에 조용히 실패했다(500, 회차 전체 filter 라 타임아웃).
    #   문항은 AI 데이터가 다 찼는데 work_status 만 unsorted 로 남아 시험지출제에서 빠진다(상문고 2022 2기말 20문항).
    #   id 를 5개씩 나눠 보내고 결과를 확인한다.
    _ids = [q['id'] for q in full]
    _sent = 0
    for _i in range(0, len(_ids), 5):
        _ch = _ids[_i:_i + 5]
        for _a in range(4):
            _r = requests.patch(f'{URL}/rest/v1/questions', headers={**H, 'Content-Type': 'application/json', 'Prefer': 'return=minimal'},
                                params={'id': f'in.({",".join(_ch)})'}, json={'work_status': 'sorted'})
            if _r.status_code < 300: _sent += len(_ch); break
            time.sleep(3 * (_a + 1))
    if _sent != len(_ids):
        raise RuntimeError(f'sorted 반영 실패: {_sent}/{len(_ids)}')

    # 6. 개인DB (멱등 upsert)
    price = sum(int(str(q['difficulty'])) * 500 for q in full)
    ex = G('exam_materials', {'select': 'id', 'school': f'eq.{school}', 'exam_year': f'eq.{YEAR}', 'grade': f'eq.{gd}',
                              'semester': f'eq.{semnum}', 'exam_type': f'eq.{exam_type}', 'subject': f'eq.{subject}',
                              'content_type': 'eq.개인DB', 'limit': '1'})
    title_db = f'{school} {YEAR} {grade}학년 {semnum}학기 {exam_type} {subject} [개인DB]'
    # ⚠ source_db_id 를 반드시 넣는다 (2026-09-16). 없으면 시험지출제가 학교+학년+연도+학기+**과목** 폴백으로
    #   문항을 끌어오는데, 문항 과목이 회차 과목과 다르면(2015 과정 2학기중간 수학(하) 회차의 수학(상) 단원 문항을
    #   단원 따라 수학(상)으로 바꾼 120문항) 자기 회차 DB 에서 통째로 빠진다. src 를 가리키면 과목과 무관하게 잡힌다.
    if ex:
        requests.patch(f'{URL}/rest/v1/exam_materials', headers=HJ, params={'id': f"eq.{ex[0]['id']}"},
                       json={'title': title_db, 'price': price, 'source_db_id': src})
    else:
        r = requests.post(f'{URL}/rest/v1/exam_materials', headers=HJ, json={
            'uploader_id': UPLOADER, 'uploader_name': UPLOADER_NAME, 'school': school, 'region': region, 'district': district,
            'grade': int(gd), 'semester': semnum, 'exam_type': exam_type, 'subject': subject, 'title': title_db, 'exam_year': int(YEAR),
            'file_type': 'DB', 'content_type': '개인DB', 'file_path': f'db_access/{UPLOADER}/{ts}', 'price': price,
            'sales_count': 0, 'is_verified': True, 'source_db_id': src})
        if r.status_code != 201: raise RuntimeError(f'개인DB 생성 실패: {r.text[:150]}')
    print(f'  개인DB: {price}P')

    # 7. 판매행 PDF/HWP (멱등: 있으면 스킵)
    title_sale = f'{school} {YEAR}년 {gd}학년 {semnum}학기 {exam_type} {subject} [문제+해설]'
    # ⚠ exam_type 필수 — 같은 학기의 중간/기말이 둘 다 semester=N 이라, 빼면 기말 존재 시 중간 생성이 스킵됨 (경기여고 사례)
    have = G('exam_materials', {'select': 'file_type', 'school': f'eq.{school}', 'exam_year': f'eq.{YEAR}', 'grade': f'eq.{gd}',
                                'semester': f'eq.{semnum}', 'exam_type': f'eq.{exam_type}', 'subject': f'eq.{subject}', 'content_type': 'eq.해설'})
    have_types = {x['file_type'] for x in have}
    for ftype, ext, price_f, ctype in [('PDF', 'pdf', 1000, 'application/pdf'), ('HWP', 'hwp', 2000, 'application/octet-stream')]:
        if ftype in have_types: continue
        data = open(os.path.join(ROOT, 'try', f'{base}.{ext}'), 'rb').read()
        path = f'{UPLOADER}/{int(time.time()*1000)}_{rand6()}.{ext}'
        retry_post(f'{URL}/storage/v1/object/exam-materials/{path}', {**H, 'Content-Type': ctype}, data)
        r = requests.post(f'{URL}/rest/v1/exam_materials', headers=HJ, json={
            'uploader_id': UPLOADER, 'uploader_name': UPLOADER_NAME, 'school': school, 'region': region, 'district': district,
            'grade': int(gd), 'semester': semnum, 'exam_type': exam_type, 'subject': subject, 'title': title_sale, 'exam_year': int(YEAR),
            'file_type': ftype, 'content_type': '해설', 'file_path': path, 'price': price_f, 'sales_count': 0, 'is_verified': True,
            'source_db_id': src})   # [10/16] 시험 페이지가 이 값으로 문항을 찾는다(학년 붙은 이름이면 조립값과 다르다)
        if r.status_code != 201: raise RuntimeError(f'{ftype} 행 생성 실패: {r.text[:150]}')
    print(f'  판매행: PDF/HWP 완료')
    _lap('공개·판매')
    print('  ⏱ ' + ' · '.join(f'{k} {v:.0f}초' for k, v in _times.items()), flush=True)
    return {'school': tag, 'full_school': school, 'base': base, 'q': qcount, 'price': price, 'status': 'OK', 'src': src}

def _run_one(args):
    idx, row = args
    base, school, region, district, semstr, semnum, subject, grade = row[:8]
    year = row[8] if len(row) > 8 else DEFAULT_YEAR
    try:
        return process_set(idx, base, school, region, district, semstr, semnum, subject, grade, year)
    except Exception as e:
        print(f'  ❌ 실패({school.replace("등학교", "")}): {e}', flush=True)
        return {'school': school.replace('등학교', ''), 'base': base, 'status': f'FAIL: {str(e)[:120]}'}

# 세트는 서로 독립이라 병렬이 가능하다. 기본 1(순차) — Supabase 가 MICRO 라 첫 100세트는 순차로 돌려
# 버티는지 본 뒤에 2~3 으로 올린다. 순서는 map 이 보존한다.
if WORKERS > 1:
    from concurrent.futures import ThreadPoolExecutor
    print(f'병렬 {WORKERS}개로 실행', flush=True)
    with ThreadPoolExecutor(max_workers=WORKERS) as _ex:
        results = list(_ex.map(_run_one, list(enumerate(SETS, 1))))
else:
    results = [_run_one(x) for x in enumerate(SETS, 1)]

print('\n\n========== 배치 결과 ==========')
ok = [r for r in results if r['status'] == 'OK']
for r in results:
    if r['status'] == 'OK':
        print(f"  ✅ {r['school']}: {r['q']}문항, 개인DB {r['price']}P")
    else:
        print(f"  ❌ {r['school']}: {r['status']}")
print(f'\n성공 {len(ok)} / 실패 {len(results)-len(ok)} (전체 {len(results)})')

# ── 성공한 세트의 try/ 파일에 up_ 접두 (파이프라인 마지막 단계, 상시) ──
# 사장님이 폴더만 보고 올라간 것/안 올라간 것을 구분한다. 9/12 지시, 9/13 내가 빠뜨려 지적받음 → 배치에 넣는다.
# 실패한 세트는 그대로 둔다(재실행 대상).
_renamed = 0
for r in ok:
    b = r.get('base')
    if not b: continue
    for fn in os.listdir(os.path.join(ROOT, 'try')):
        # 접두 일치만 보면 '..._수학I' 이 '..._수학II' 파일까지 잡는다(9/28 세화고 수학II 가 미등록인데 up_ 이 붙었다).
        # 10/8: 원본 PDF(_원본제보.pdf·_원본.pdf·_원본제보_01.pdf)도 같이 — 빠지면 scratch_move_up 이 안 옮겨 try 에 남는다(사장님 지적)
        if fn.startswith(b) and (fn[len(b):] in ('.hml', '.hwp', '.pdf', 'ㅈㄷ.pdf', '_파스칼.pdf') or re.fullmatch(r'_원본(제보)?(_\d+)?\.pdf', fn[len(b):])):
            try:
                os.rename(os.path.join(ROOT, 'try', fn), os.path.join(ROOT, 'try', 'up_' + fn)); _renamed += 1
            except OSError as _e:
                print(f'  ⚠ up_ 이름 변경 실패 {fn}: {_e}')
print(f'up_ 접두: 파일 {_renamed}개')

# [2026-09-16 사용자 지시] 등록이 끝난 세트의 .hml 과 ㅈㄷ.pdf 는 지운다.
#   둘 다 등록 과정에서만 쓰는 파일이다(hml=파싱, ㅈㄷ=캡쳐). 판매파일(hwp/pdf)과 원소스(_파스칼)는 남긴다.
#   ⚠ 성공한 세트(up_ 붙은 것)만. 실패한 세트는 재크롭·재실행에 ㅈㄷ.pdf 가 필요하므로 건드리지 않는다.
#   실측(layout_lines)은 DB 문항으로 생성기가 새 hml 을 만들어 재므로 try/ 의 hml 은 필요 없다.
_deleted = 0
for r in ok:
    b = r.get('base')
    if not b: continue
    for fn in os.listdir(os.path.join(ROOT, 'try')):
        if fn == 'up_' + b + '.hml' or fn == 'up_' + b + 'ㅈㄷ.pdf':
            try:
                os.remove(os.path.join(ROOT, 'try', fn)); _deleted += 1
            except OSError as _e:
                print(f'  ⚠ 삭제 실패 {fn}: {_e}')
print(f'등록 완료분 hml·ㅈㄷ 삭제: {_deleted}개 (hwp·pdf·파스칼은 남김)')

# ── 미리보기 + 무료 문제 PDF ──
# ⚠ 이 두 단계가 배치에 없어서 8/26~27 노원 5개교(불암·영신여·재현·청원·혜성여)가
#   미리보기 0장 · 무료PDF 없음 상태로 올라갔다. 전체 445건 중 딱 그 5건만 빠져 있었다.
#   '문제 무료' 버튼이 안 뜨면 사용자가 받을 수 없고(8/26 지표에서 무료PDF 가 사용 44건 = 최대 항목),
#   미리보기가 없으면 시험지 상세에서 볼 게 없다.
#   예전엔 오너가 수동으로 돌리던 단계인데 배치가 전 과정을 맡으면서 조용히 사라졌다.
#   두 스크립트 모두 멱등(이미 채워진 행은 스킵)이라 매번 돌려도 안전하고, 끝에서 페이지 갱신도 한다.
if ok:
    # ⚠ gen_exam_redirects.py 는 자료가 늘면 시험지 중복 URL 매핑이 낡기 때문에 같이 돌린다.
    #   갱신되면 배포해야 반영된다(미들웨어 번들에 들어간다). 낡아도 그 URL 이 200 으로 남을 뿐이라 사고는 없다.
    # ⚠ SEO 분석글(ai_analysis)이 없으면 exam 페이지가 하드코딩 템플릿으로 폴백한다.
    #   그러면 회차마다 같은 문장 틀이 되어 구글이 중복·저품질로 본다.
    #   배치에 이 단계가 없어서 7~8월 등록분 104개가 통째로 비어 있었다(8/29 발견).
    # [2026-09-03] IndexNow 추가 — 네이버는 2023-07 부터 지원한다(주력 유입원).
    #   발견 크롤이 하루 8회뿐이라 신규 회차는 수동 색인 요청이 필수였는데 그걸 자동화한다.
    #   ⚠ 구글은 IndexNow 미지원이라 구글 쪽에는 아무 효과 없다.
    for _label, _script in ([('미리보기', 'generate_previews.py'),
                            # ⚠ 모의고사 미리보기는 스크립트가 따로다. 이게 없으면 preview_urls 가 비고,
                            #   sitemap.ts 가 preview_urls 있는 회차만 색인하므로 신규 모의고사가 사이트맵에서 빠진다
                            #   (2026-09-04 2006·2007 11월 4회차에서 발견).
                            ('모의고사 미리보기', 'generate_mock_previews.py'),
                            ('무료 문제 PDF', 'generate_free_pdfs.py'),
                            # [2026-09-25] SEO 분석글(generate_exam_analysis.py) 제거 — Codex 개편으로 시험지 페이지가 ai_analysis 를
                            #   더 이상 표시하지 않는다(사장님 의도). 쓰는 곳이 RSS 요약뿐이라 제미나이 비용만 나갔다.
                            ('시험지 중복 URL 매핑', 'gen_exam_redirects.py'),
                            # [2026-10-02] 유사문항 미리 계산은 등록에서 뺐다(사장님 결정: 등록·유사문항 계산·측정 3단 분리).
                            #   묶음마다 수십 개 단원을 통째로 다시 계산해 묶음당 10분+ 늘어지고 DB 를 잡았다.
                            #   하루 작업 끝에 `python scripts/precompute_similar.py` 한 번(새벽 3~5시 피함).
                            #   그 사이 새 문항의 '유사' 버튼은 실시간 검색으로 돈다(느릴 뿐 사고 아님).
                            # [10/26] 키워드 검색용 발문 텍스트(question_statement) — 표에 없는 새 문항만 채운다
                            ('발문 텍스트', 'fill_statement.py'),
                            ('IndexNow 알림', 'indexnow_ping.py')]
                            # [2026-10-05] 유사문항 미리 계산 다시 붙임 — 증분 모드(새 문항만·로컬 임베딩 캐시)라 가볍다(사장님 지시).
                            #   scratch_run_big 은 묶음마다 돌리지 않고 맨 끝에 한 번만 돌린다(SKIP_SIMILAR=1 로 자식 배치에서 끈다).
                            + ([] if os.environ.get('SKIP_SIMILAR') == '1' else [('유사문항 미리 계산', 'precompute_similar.py')])):
        try:
            _t0 = time.time()
            _p = subprocess.run([sys.executable, os.path.join(ROOT, 'scripts', _script)],
                                capture_output=True, text=True, encoding='utf-8', errors='replace',
                                cwd=ROOT, env=TSX_ENV, timeout=1800)
            _out = (_p.stdout or '') + (_p.stderr or '')
            _m = re.search(r'완료: 성공 (\d+) / 실패 (\d+)', _out)
            # [11/6] 미리보기·무료 PDF 실패는 다시 돌리면 채워졌다(11회 중 7회 발생, 재실행으로 전부 복구).
            #   두 스크립트는 빈칸만 채우므로 한 번 더 돌려도 안전하다 — 사람이 다시 돌리지 않게 여기서 한다.
            if _script in ('generate_previews.py', 'generate_free_pdfs.py') and _m and int(_m.group(2)) > 0:
                print(f'  {_label}: 실패 {_m.group(2)}건 → 자동으로 한 번 더', flush=True)
                _first_ok = _m.group(1)
                _p = subprocess.run([sys.executable, os.path.join(ROOT, 'scripts', _script)],
                                    capture_output=True, text=True, encoding='utf-8', errors='replace',
                                    cwd=ROOT, env=TSX_ENV, timeout=1800)
                _out = (_p.stdout or '') + (_p.stderr or '')
                _m = re.search(r'완료: 성공 (\d+) / 실패 (\d+)', _out)
                if _m: print(f'  {_label}: 첫 실행 성공 {_first_ok}건 + 아래는 재실행 결과', flush=True)
            print(f'  ⏱ {_label} {time.time() - _t0:.0f}초', flush=True)
            _ma = re.search(r'완료: 성공 (\d+) / 건너뜀 (\d+) / 실패 (\d+)', _out)
            if _script == 'generate_exam_analysis.py':
                if _ma:
                    print(f'{_label}: 성공 {_ma.group(1)} / 건너뜀 {_ma.group(2)} / 실패 {_ma.group(3)}')
                    if int(_ma.group(3)) > 0:
                        print(f'  ⚠ {_label} 실패분 있음 — 로그 확인 필요')
                elif '[대상] 0개' in _out:
                    print(f'{_label}: 대상 없음')
                else:
                    print(f'  ⚠ {_label} 결과 판독 실패: {_out[-200:]}')
            elif _script == 'gen_exam_redirects.py':
                if '⛔' in _out:
                    print(f'⛔ {_label}: 무결성 실패 — 매핑을 쓰지 않았다. 로그 확인 필요')
                else:
                    _mm = re.search(r'갱신: [\d,]+ → [\d,]+건', _out)
                    if _mm:
                        print(f'{_label}: {_mm.group(0)}  ⚠ 배포해야 반영됨')
                    elif '변경 없음' in _out:
                        print(f'{_label}: 변경 없음')
                    else:
                        print(f'  ⚠ {_label} 결과 판독 실패: {_out[-200:]}')
            elif _m:
                print(f'{_label}: 성공 {_m.group(1)} / 실패 {_m.group(2)}')
                if int(_m.group(2)) > 0:
                    print(f'  ⚠ {_label} 실패분 있음 — 로그 확인 필요')
            elif '[대상] 0개' in _out:
                print(f'{_label}: 대상 없음(이미 전부 생성됨)')
            else:
                print(f'  ⚠ {_label} 결과 판독 실패: {_out[-200:]}')
        except Exception as _e:
            print(f'  ⚠ {_label} 실행 실패 — 수동으로 scripts/{_script} 실행 필요: {str(_e)[:120]}')


# ── 캐시 갱신 ──
# ⚠ 이 단계가 없어서 배치를 돌려도 사이트에 안 보였다(8/25 제보).
#   홈은 ISR 1시간이라 브라우저 새로고침(Ctrl+Shift+R)으로는 안 풀린다 —
#   서버 캐시를 직접 무효화해야 한다. 모의고사 배치엔 원래 있던 단계다.
#   한글 경로는 인코딩된 형태로도 함께 보낸다(Next 캐시 키가 URL 인코딩 형태라 8/17 에 당했음).
if ok:
    import urllib.parse as _up
    paths = ['/', '/sitemap.xml'] + [f"/school/{r['full_school']}" for r in ok if r.get('full_school')]
    paths += ['/' + '/'.join(_up.quote(x) for x in q[1:].split('/')) for q in paths if q != '/']
    try:
        rr = requests.post('https://mathetf.com/api/revalidate',
                           headers={'x-revalidate-key': KEY, 'Content-Type': 'application/json'},
                           json={'paths': list(dict.fromkeys(paths))}, timeout=120)
        print(f'캐시 갱신: {rr.status_code}')
    except Exception as e:
        print(f'⚠ 캐시 갱신 실패(수동으로 revalidate 필요): {str(e)[:100]}')
    # [10/27 대표] 새 시험지 페이지를 미리 한 번 열어 만들어 둔다 — 첫 방문자·검색 로봇이 기다리지 않게(빌드 아님, 배포 비용 없음)
    try:
        _p = subprocess.run([sys.executable, os.path.join(ROOT, 'scripts', 'warm_exam_pages.py')], capture_output=True, text=True,
                            encoding='utf-8', errors='replace', cwd=ROOT, timeout=1800)
        print('시험지 페이지 미리 열기: ' + ((_p.stdout or '').strip().splitlines() or ['판독 실패'])[-1])
    except Exception as e:
        print(f'⚠ 시험지 페이지 미리 열기 실패: {str(e)[:100]}')

# ── 대표 유형 분류 (10/19 대표 지시, 사장 세션 scripts/types/assign_new.py) ──
#   시험지출제가 '단원→유형' 정렬이라 유형 없는 새 문항은 묶음에서 빠진다. 성공 세트 source_db_id 를 한 번에 넘긴다.
#   스크립트는 항상 종료코드 0 — 못 한 문항은 C:\mathetf_types\_pending_new.json(사장 세션이 --pending 으로 처리).
#   캐시 갱신 뒤 맨 끝에 둔다(세트당 1~3분, 페이지 노출을 늦추지 않게). SKIP_TYPES=1 이면 끈다.
if ok and os.environ.get('SKIP_TYPES') != '1':
    _srcs = [r['src'] for r in ok if r.get('src')]
    try:
        _t0 = time.time()
        _p = subprocess.run([sys.executable, '-X', 'utf8', os.path.join(ROOT, 'scripts', 'types', 'assign_new.py')] + _srcs,
                            capture_output=True, text=True, encoding='utf-8', errors='replace',
                            cwd=ROOT, env={**TSX_ENV, 'TYPES_WORKERS': os.environ.get('TYPES_WORKERS', '60'), 'TYPES_CHUNK': os.environ.get('TYPES_CHUNK', '50')}, timeout=max(1800, 300 * len(_srcs)))   # [11/8 대표] 코덱스 최대 60명
        _m = re.search(r'TYPES_DONE ok=(\d+) skip=(\d+) pending=(\d+)', (_p.stdout or '') + (_p.stderr or ''))
        print(f'  ⏱ 유형 분류 {time.time() - _t0:.0f}초', flush=True)
        if _m:
            print(f'대표 유형 분류: 넣음 {_m.group(1)} / 이미·제외 {_m.group(2)} / 대기 {_m.group(3)}')
            if int(_m.group(3)) > 0: print('  ⚠ 대기 문항 있음 — 사장 세션이 --pending 으로 처리')
        else:
            print(f'  ⚠ 대표 유형 분류 결과 판독 실패: {((_p.stdout or "") + (_p.stderr or ""))[-200:]}')
    except Exception as _e:
        print(f'  ⚠ 대표 유형 분류 실행 실패 — scripts/types/assign_new.py 수동 실행 필요: {str(_e)[:120]}')

# ── 장문 분석글 + 유사 시험지 Top5 (10/23 대표 지시, 사장 세션 scripts/exam_long/after_register.py) ──
#   구글 색인용 시험지 분석글(코덱스 작성·숫자 검사)과 '비슷한 문제가 나온 다른 학교 시험지' 를 새 회차에 붙인다.
#   저장소 색인으로 반영돼 배포가 필요 없다. 끝에 서치콘솔에 분석글 사이트맵을 다시 제출한다.
#   유사 시험지는 유사문항 미리 계산(위 단계) 뒤라야 정확하다 — 그래서 맨 끝. SKIP_EXAM_LONG=1 이면 끈다.
if ok and os.environ.get('SKIP_EXAM_LONG') != '1':
    _srcs = [r['src'] for r in ok if r.get('src')]
    try:
        _t0 = time.time()
        _p = subprocess.run([sys.executable, '-X', 'utf8', os.path.join(ROOT, 'scripts', 'exam_long', 'after_register.py')] + _srcs,
                            capture_output=True, text=True, encoding='utf-8', errors='replace',
                            cwd=ROOT, env=TSX_ENV, timeout=max(3600, 600 * len(_srcs)))
        _o = (_p.stdout or '') + (_p.stderr or '')
        _m = re.search(r'EXAM_LONG_DONE ok=(\d+) fail=(\d+)', _o)
        print(f'  ⏱ 분석글 {time.time() - _t0:.0f}초', flush=True)
        if _m:
            print(f'장문 분석글·유사 시험지: 붙임 {_m.group(1)} / 실패 {_m.group(2)}')
            if int(_m.group(2)) > 0: print('  ⚠ 실패분 — 사장 세션이 scripts/exam_long/run_all.py 로 다시 돌림')
            if '서치콘솔 제출 실패' in _o: print('  ⚠ 서치콘솔 토큰 만료 — 사장 세션에 알릴 것')
        else:
            print(f'  ⚠ 장문 분석글 결과 판독 실패: {_o[-200:]}')
    except Exception as _e:
        print(f'  ⚠ 장문 분석글 실행 실패 — scripts/exam_long/after_register.py 수동 실행 필요: {str(_e)[:120]}')