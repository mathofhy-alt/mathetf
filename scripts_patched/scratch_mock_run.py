# -*- coding: utf-8 -*-
"""[모의고사 등록·교체 드라이버] try/ 의 '{연도}_고N_MM월_{주관}[_지역][_수학]_문제' 회차들 (10/2, 29회차).

단계 (전부 멱등 — _trylog/_mock_state.json 에 진행을 남긴다):
  prep    : scratch_mock_upsert.ts(있으면 id 유지 교체, 없으면 신규) → 크롭 → 캡쳐 업로드
  export  : 단원 비어 있는 모의고사 문항을 소넷 태깅 묶음으로 → tagjobs_mock/ (블록별 허용 단원)
  finish  : 태그 반영 → 과목 확정 → scratch_batch_ai.ts(임베딩) → sorted → 배점(원본 PDF, scratch_mock_points.py) → 개인DB 행 → 모의고사 탭(문제 PDF·HWP)
            → 미리보기 → IndexNow → 기하 선택 검색 검증
사용: PYTHONUTF8=1 python scripts_patched/scratch_mock_run.py prep|export|finish [--only 2025_고3_06월]

⚠ 탭에 올리는 파일은 '_문제.pdf'·'_문제.hwp' 다. '_원본.pdf' 는 올리지 않는다(사장님 10/2).
⚠ 고3 파일은 선택과목이 23~30번으로 세 번 반복된다 → 블록은 번호가 아니라 순서로 가른다.
"""
import os, re, sys, json, time, uuid, subprocess, requests, urllib3
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # 운영 ROOT 의 scratch_mock_points
from scratch_mock_points import points_for
urllib3.disable_warnings()
sys.stdout.reconfigure(encoding='utf-8', errors='replace', line_buffering=True)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); os.chdir(ROOT)
STATE_F = '_trylog/_mock_state.json'
TSX = {**os.environ, 'NODE_TLS_REJECT_UNAUTHORIZED': '0', 'PYTHONUTF8': '1'}
NPX = 'npx.cmd' if os.name == 'nt' else 'npx'
env = {}
for line in open('.env.local', encoding='utf-8'):
    m = re.match(r'^\s*([\w.-]+)\s*=\s*(.*)\s*$', line)
    if m: env[m.group(1)] = m.group(2).strip().strip('"').strip("'")
URL = env['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/'); KEY = env['SUPABASE_SERVICE_ROLE_KEY']
H = {'apikey': KEY, 'Authorization': 'Bearer ' + KEY}; HJ = {**H, 'Content-Type': 'application/json'}
S = requests.Session(); S.verify = False
UPLOADER = '0f1db267-e257-460b-9549-2fdd6e6ae988'
SEL = [('확률과통계', 22, 14000), ('미적분II', 30, 20000), ('기하와벡터', 38, 17000)]   # (과목, 파일 순서 시작, 개인DB 가격)

def req(method, path, tries=5, **kw):
    for t in range(tries):
        try:
            r = S.request(method, f'{URL}{path}', timeout=180, **kw)
            if r.status_code < 500: return r
        except requests.RequestException: pass
        time.sleep(3 * (t + 1))
    raise RuntimeError(f'{method} {path} 실패')

def get(path, params): return req('GET', f'/rest/v1/{path}', headers=H, params=params).json()

def rounds():
    out = []
    for f in sorted(os.listdir('try')):
        m = re.match(r'^(20\d\d)_(고[123])_(\d\d)월_([^_]+)(?:_[^_]+)*_문제\.hml$', f)
        if not m: continue
        y, g, mo, org = m.groups()
        cat = '수능' if org.startswith('수능') else org
        base = f[:-4]
        if ONLY and not base.startswith(ONLY): continue
        # 가형·나형 회차(2018~2020 고2·고3): 형마다 30문항 한 덩어리 (10/2 저녁 120회차 묶음)
        form = next((x for x in ('가형', '나형', 'A형', 'B형') if f'_{x}_' in f), '')   # A·B형: 2012~2015 고3, 2013~2014 고2 (10/3)
        n = 46 if (g == '고3' and not form) else 30
        # [10/6] 2006~2009 고3 가형은 선택과목 3개가 붙은 40문항(공통 25 + 26~30번×3) — 등록(upsert)이 남긴 문항 수로 안다
        if form and g == '고3' and len(load().get(base, {}).get('idorder') or []) == 40: n = 40
        out.append(dict(base=base, y=y, g=g, m=str(int(mo)), cat=cat, form=form, n=n))
    return out

def run(cmd, timeout=2400, cwd=ROOT, extra_env=None):
    p = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace', cwd=cwd, env={**TSX, **(extra_env or {})}, timeout=timeout)
    return p.returncode, (p.stdout or '') + (p.stderr or '')

def load(): return json.load(open(STATE_F, encoding='utf-8')) if os.path.exists(STATE_F) else {}
def save(st): json.dump(st, open(STATE_F, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

def group_of(r, i):
    """파일 순서 i 의 문항이 속한 태깅 묶음 → (묶음 키, 허용 과목들, 고정 과목 또는 None)"""
    # 가형·나형: 옛 교육과정이라 과목 경계가 지금과 다르다 → 넓게 열고, 겹치는 단원(도함수의활용·정적분의활용)은 형으로 가른다
    # 옛 고3 형은 교육과정마다 범위가 달라(행렬·집합명제·함수가 들어간 해도 있다) 전 과목을 열고 순서로만 가른다.
    #   가·B형(이과)은 겹치는 단원(도함수의활용·정적분의활용)을 미적분II 로, 나·A형(문과)은 미적분I 로.
    if r['form'] and r['g'] == '고3' and r['n'] == 40 and 30 <= i < 35:
        return 'G3' + r['form'] + '확통', ['확률과통계'], '확률과통계'   # 옛 가형 선택 확률과통계 블록
    if r['form'] and r['g'] == '고3':
        return 'G3' + r['form'], (['미적분II', '기하와벡터', '확률과통계', '대수', '미적분I', '공통수학2', '공통수학1'] if r['form'] in ('가형', 'B형')
                                  else ['미적분I', '대수', '확률과통계', '공통수학2', '공통수학1', '미적분II', '기하와벡터']), None
        # ↑ 2018·2019 나형(2009 개정 수학II)은 집합·명제·함수·유리·무리함수가 범위다 — 공통수학1·2 가 없으면 소넷이 '확률' 등으로 억지 분류했다(10/2)
    if r['form']: return 'G2' + r['form'], ['공통수학1', '공통수학2', '대수', '미적분I', '미적분II', '확률과통계'], None
    # 2017 이전 고1(2009 개정 수학I·II)은 수열·지수로그까지 범위 — 대수를 연다(10/3: 없으면 소넷이 수열을 '함수·교과외'로 억지 분류)
    if r['g'] == '고1': return 'G1', ['공통수학1', '공통수학2'] + (['대수'] if int(r['y']) <= 2017 else []), None
    if r['g'] == '고2': return 'G2', ['공통수학1', '공통수학2', '대수', '미적분I'], None
    if i < 22: return 'G3공통', ['대수', '미적분I'], None
    for s, frm, _ in SEL:
        if frm <= i < frm + 8: return s, [s], s


# ───────────────────────── prep ─────────────────────────
def prep():
    st = load()
    for r in rounds():
        b = r['base']; s = st.setdefault(b, {})
        print(f"===== {r['y']} {r['g']} {r['m']}월 {r['cat']} ({b})")
        if not s.get('idorder'):
            code, out = run([NPX, 'tsx', 'scripts_patched/scratch_mock_upsert.ts', f'try/{b}.hml', r['y'], r['m'], r['g'], r['cat']] + ([r['form']] if r['form'] else []))
            m = re.search(r'IDORDER=(\S+)', out)
            if not m: print('  ✗ upsert 실패:', out[-400:]); continue
            s['idorder'] = m.group(1).split(','); s['upsert'] = (re.search(r'REPLACED=\d+ INSERTED=\d+', out) or [''])[0]; save(st)
        print(f"  문항: {s.get('upsert')}")
        ids = s['idorder']
        if r['form'] and r['g'] == '고3' and len(ids) == 40: r['n'] = 40
        if len(ids) != r['n']: print(f'  ✗ IDORDER {len(ids)} ≠ {r["n"]}'); continue
        crop = f"crop_batch/mockv_{r['y']}_{r['m']}_{r['g'][1]}" + {'가형': '_ga', '나형': '_na', 'A형': '_A', 'B형': '_B', '': ''}[r['form']]   # 형마다 폴더를 나눠야 덮어쓰지 않는다
        qdir = os.path.join('hwpx-python-tool', crop, 'questions'); sdir = os.path.join('hwpx-python-tool', crop, 'solutions')
        cnt = lambda d: len([f for f in os.listdir(d) if f.endswith('.webp')]) if os.path.isdir(d) else 0
        if not (cnt(qdir) == r['n'] and cnt(sdir) == r['n']):
            # 고3 은 선택과목이 23번부터 다시 시작 → 크롭 도구의 모의고사 모드(10/2 추가)
            code, out = run([sys.executable, 'pdf_crop_v4.py', f'../try/{b}ㅈㄷ.pdf', crop], timeout=1200, cwd=os.path.join(ROOT, 'hwpx-python-tool'),
                            extra_env={'CROP_MOCK3': '1'} if r['n'] == 46 else ({'CROP_MOCK3': 'old'} if r['n'] == 40 else None))
        if not (cnt(qdir) == r['n'] and cnt(sdir) == r['n']):
            print(f'  ✗ 크롭 개수 불일치: 문제 {cnt(qdir)} / 해설 {cnt(sdir)} vs {r["n"]}'); continue
        s['crop'] = crop; save(st)
        print(f"  크롭: 문제 {r['n']} + 해설 {r['n']}")
        ts = int(time.time() * 1000); up = 0
        for i, qid in enumerate(ids):
            bins = [x['original_bin_id'] or '' for x in get('question_images', {'select': 'original_bin_id', 'question_id': f'eq.{qid}'})]
            for mode, d, letter, pfx in (('question', qdir, 'q', 'AUTO_Q_'), ('solution', sdir, 's', 'AUTO_S_')):
                if any(x.startswith((pfx, pfx.replace('AUTO', 'MANUAL'))) for x in bins): continue
                data = open(os.path.join(d, f'{letter}_{i + 1:02d}.webp'), 'rb').read()
                sp = f'auto_captures/{qid}_{mode}_{ts}_{i}.webp'
                req('POST', f'/storage/v1/object/hwpx/{sp}', headers={**H, 'Content-Type': 'image/webp'}, data=data)
                rr = req('POST', '/rest/v1/question_images', headers=HJ, json={
                    'question_id': qid, 'original_bin_id': f'{pfx}{ts}_{i}', 'format': 'webp',
                    'data': f'{URL}/storage/v1/object/public/hwpx/{sp}', 'size_bytes': len(data)})
                if rr.status_code >= 300: raise SystemExit(f'캡쳐 DB 실패 {i + 1}: {rr.text[:150]}')
                up += 1
        s['cap'] = True; save(st)
        print(f'  캡쳐: 신규 업로드 {up}건')


# ───────────────────────── export ─────────────────────────
def export():
    st = load(); allowed_by = json.load(open('scratch_allowed_by_subject.json', encoding='utf-8'))
    clean = lambda x: re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', x or '')).strip()
    groups = {}
    for r in rounds():
        ids = st.get(r['base'], {}).get('idorder') or []
        for i, qid in enumerate(ids):
            groups.setdefault(group_of(r, i)[0], []).append((qid, r, i))
    # 폴더째 지우면 PROMPT.md(소넷 지시문)까지 사라진다(10/3 새벽 — 에이전트들이 지시문 없이 분류). job·out 파일만 지운다.
    os.makedirs('tagjobs_mock', exist_ok=True)
    for _f in os.listdir('tagjobs_mock'):
        if re.match(r'^(job|out)_\d+\.(json|txt)$', _f): os.remove(os.path.join('tagjobs_mock', _f))
    n = 0; meta = {}
    for gk, items in groups.items():
        _, subs, _ = group_of(items[0][1], items[0][2])
        allowed = {u: t for s in subs for u, t in allowed_by[s].items()}
        rows = {}
        idl = [x[0] for x in items]
        for k in range(0, len(idl), 10):
            for x in get('questions', {'select': 'id,unit,content_xml,equation_scripts', 'id': f'in.({",".join(idl[k:k + 10])})'}): rows[x['id']] = x
        todo = [x for x in items if not rows[x[0]]['unit']]
        for k in range(0, len(todo), 60):
            n += 1; chunk = todo[k:k + 60]
            qs = [{'id': q, 'src': f"{r['y']}_{r['g']}_{r['m']}월_{r['cat']}", 'n': i + 1, 'subject': gk} for q, r, i in chunk]
            json.dump({'subject_group': gk, 'allowed': allowed, 'questions': qs}, open(f'tagjobs_mock/job_{n:02d}.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
            lines = ['허용 단원과 태그 (단원: 태그들):'] + [f'- {u}: {", ".join(t)}' for u, t in allowed.items()] + ['', '문항 (id | 시험 | 파일순서 | 본문):']
            for q, r, i in chunk:
                x = rows[q]; xml = x['content_xml'] or ''
                sol = ' '.join(clean(m) for m in re.findall(r'<ENDNOTE[\s\S]*?</ENDNOTE>', xml, re.I))
                prob = clean(re.sub(r'<ENDNOTE[\s\S]*?</ENDNOTE>', ' ', xml, flags=re.I))
                lines.append(f"{q} | {r['y']} {r['g']} {r['m']}월 {r['cat']} | {i + 1} | [문제] {prob[:1500]} [해설] {sol[:900]} [수식] {' | '.join(x.get('equation_scripts') or [])[:600]}")
            open(f'tagjobs_mock/job_{n:02d}.txt', 'w', encoding='utf-8').write('\n'.join(lines))
            meta[f'{n:02d}'] = (gk, len(chunk))
    print('묶음', n, meta)


# ───────────────────────── finish ─────────────────────────
def finish():
    st = load(); M = json.load(open('scratch_manual_tags.json', encoding='utf-8'))
    allowed_by = json.load(open('scratch_allowed_by_subject.json', encoding='utf-8'))
    unit_subject = lambda u, subs: next((s for s in subs if u in allowed_by[s]), None)
    global OFF; OFF = set(json.load(open('scratch_mock_off.json', encoding='utf-8'))) if os.path.exists('scratch_mock_off.json') else set()
    report = []
    for r in rounds():
        b = r['base']; s = st.get(b, {}); ids = s.get('idorder') or []
        if not (ids and s.get('cap')): print(f'⏭ {b}: prep 미완'); continue
        print(f"===== {r['y']} {r['g']} {r['m']}월 {r['cat']}")
        # 1) 과목 확정 — 태그가 있는 문항만(교체 문항은 새 태그 기준)
        for i, qid in enumerate(ids):
            if qid not in M: raise SystemExit(f'  ✗ 태그 없음: 파일순서 {i + 1} {qid}')
            gk, subs, fixed = group_of(r, i)
            subj = fixed or unit_subject(M[qid]['unit'], subs)
            if not subj: raise SystemExit(f'  ✗ 단원→과목 실패: {M[qid]["unit"]}')
            req('PATCH', '/rest/v1/questions', headers=HJ, params={'id': f'eq.{qid}'},
                json={'subject': subj, 'is_off_curriculum': qid in OFF})   # 옛 회차 폐지 내용은 소넷이 off 로 표시(제미나이 검수기 대신)
        # 2) 임베딩·단원 반영 (source 별)
        srcs = {}
        for k in range(0, len(ids), 10):
            for x in get('questions', {'select': 'id,source_db_id,subject', 'id': f'in.({",".join(ids[k:k + 10])})'}): srcs.setdefault(x['source_db_id'], x['subject'])
        for src, subj in srcs.items():
            code, out = run([NPX, 'tsx', 'scratch_batch_ai.ts', src, subj])
            m = re.search(r'AI_RESULT ok=(\d+) skip=(\d+) fail=(\d+)', out)
            print(f'  AI {src}: {m.group(0) if m else out[-200:]}')
        # 3) 완결성 → sorted (id 단위 — 고1·고2 가 source 를 공유하므로)
        full = {}
        for k in range(0, len(ids), 10):
            for x in get('questions', {'select': 'id,unit,difficulty,embedding', 'id': f'in.({",".join(ids[k:k + 10])})'}): full[x['id']] = x
        bad = [i + 1 for i, q in enumerate(ids) if not (full[q]['unit'] and full[q]['difficulty'] not in (None, '') and full[q]['embedding'])]
        if bad: print(f'  ✗ AI 데이터 불완전 파일순서 {bad}'); continue
        # 여러 id 를 한 번에 PATCH 하면 statement timeout(57014)이 난다 — 1건씩 (10/2 밤 120회차 첫 회차에서 멈춤)
        for q in ids:
            req('PATCH', '/rest/v1/questions', headers=HJ, params={'id': f'eq.{q}'}, json={'work_status': 'sorted'})
        # 3-1) 배점(2·3·4점) — 원본 PDF 의 [N점] 을 파일 순서대로(챗봇 '3점짜리만', 10/13). 못 읽으면 경고만 하고 등록은 계속
        orig = f"try/{b[:-len('_문제')]}_원본.pdf" if b.endswith('_문제') else f'try/{b}_원본.pdf'
        seq, how = points_for(orig, len(ids))
        if seq:
            rr = req('POST', '/rest/v1/question_points', headers={**HJ, 'Prefer': 'return=minimal,resolution=merge-duplicates'},
                     json=[{'question_id': q, 'points': v} for q, v in zip(ids, seq)])
            print(f'  배점: {how} → {"✓" if rr.status_code < 300 else f"✗ {rr.status_code} {rr.text[:120]}"}')
        else:
            print(f'  ⚠ 배점 못 붙임({how}) — 챗봇 배점 조건에서 이 회차는 빠진다')
        school = get('questions', {'select': 'school', 'id': f'eq.{ids[0]}'})[0]['school']
        # 4) 개인DB 행 (시험지출제 DB 목록)
        if r['form'] and r['n'] == 40:
            src = get('questions', {'select': 'source_db_id', 'id': f'eq.{ids[0]}'})[0]['source_db_id']
            for k, sname in ((25, '미분과적분'), (30, '확률과통계'), (35, '이산수학')):
                sel_src = get('questions', {'select': 'source_db_id', 'id': f'eq.{ids[k]}'})[0]['source_db_id']
                key = f'{src}|{sel_src}'
                if get('exam_materials', {'select': 'id', 'file_type': 'eq.DB', 'source_db_id': f'eq.{key}'}): continue
                price = sum(int(full[q]['difficulty']) for q in ids[:25] + ids[k:k + 5]) * 500
                title = (f"{r['y']}년 시행 {int(r['y']) + 1}학년도 수능 {r['form']} {sname} [개인DB]" if r['cat'] == '수능'
                         else f"{school} {r['y']} {r['g']}학년 {r['m']}월 {'모의평가' if r['cat'] == '평가원' else '모의고사'} {r['form']} {sname} [개인DB]")
                rr = req('POST', '/rest/v1/exam_materials', headers={**HJ, 'Prefer': 'return=minimal'}, json={
                    'title': title, 'region': '전국', 'district': '전국', 'school': school, 'grade': int(r['g'][1]),
                    'semester': int(r['m']), 'exam_type': '모의고사', 'file_type': 'DB', 'content_type': '개인DB', 'source_db_id': key,
                    'file_path': f'db_access/{UPLOADER}/{int(time.time() * 1000)}', 'price': price, 'uploader_id': UPLOADER,
                    'uploader_name': 'mathofhy', 'subject': '전과정', 'exam_year': int(r['y']), 'is_verified': True})
                print(f'  개인DB 행 추가: {title} → {rr.status_code}')
        elif r['form']:
            src = get('questions', {'select': 'source_db_id', 'id': f'eq.{ids[0]}'})[0]['source_db_id']
            # 같은 회차·형 행이 source_db_id 없이 있으면(2018·2019 9·11월) 채운다 — 없으면 가형을 골라도 나형이 섞여 나온다
            cands = get('exam_materials', {'select': 'id,title,source_db_id', 'file_type': 'eq.DB', 'exam_year': f"eq.{r['y']}", 'semester': f"eq.{r['m']}",
                                           'grade': f"eq.{r['g'][1]}", 'exam_type': 'in.(모의고사,수능)'})
            mine = [c for c in cands if c.get('source_db_id') == src or (not c.get('source_db_id') and r['form'] in (c.get('title') or ''))]
            for c in mine:
                if not c.get('source_db_id'):
                    req('PATCH', '/rest/v1/exam_materials', headers=HJ, params={'id': f"eq.{c['id']}"}, json={'source_db_id': src})
                    print(f"  개인DB 행 source_db_id 채움: {c['title']}")
            if not mine:
                price = sum(int(full[q]['difficulty']) for q in ids) * 500
                title = (f"{r['y']}년 시행 {int(r['y']) + 1}학년도 수능 {r['form']} [개인DB]" if r['cat'] == '수능'
                         else f"{school} {r['y']} {r['g']}학년 {r['m']}월 {'모의평가' if r['cat'] == '평가원' else '모의고사'} {r['form']} [개인DB]")
                rr = req('POST', '/rest/v1/exam_materials', headers={**HJ, 'Prefer': 'return=minimal'}, json={
                    'title': title, 'region': '전국', 'district': '전국', 'school': school, 'grade': int(r['g'][1]),
                    'semester': int(r['m']), 'exam_type': '모의고사', 'file_type': 'DB', 'content_type': '개인DB', 'source_db_id': src,
                    'file_path': f'db_access/{UPLOADER}/{int(time.time() * 1000)}', 'price': price, 'uploader_id': UPLOADER,
                    'uploader_name': 'mathofhy', 'subject': '전과정', 'exam_year': int(r['y']), 'is_verified': True})
                print(f'  개인DB 행 추가: {title} → {rr.status_code}')
        want = [] if r['form'] else ([('전과정', 0)] if r['g'] != '고3' else [(sname, price) for sname, _, price in SEL])
        for subj, price in want:
            have = get('exam_materials', {'select': 'id', 'file_type': 'eq.DB', 'exam_year': f"eq.{r['y']}", 'semester': f"eq.{r['m']}",
                                          'grade': f"eq.{r['g'][1]}", 'school': f'eq.{school}', 'subject': f'eq.{subj}', 'exam_type': 'in.(모의고사,수능)'})
            if have: continue
            if r['cat'] == '수능': title = f"{r['y']}년 시행 {int(r['y']) + 1}학년도 수능 {subj} [개인DB]"
            elif r['g'] == '고3': title = f"{school} {r['y']} 고3학년 {r['m']}월 {'모의평가' if r['cat'] == '평가원' else '모의고사'} {subj} [개인DB]"
            else: title = f"전국연합 {r['y']} {r['g']}학년 {r['m']}월 모의고사 [개인DB]"
            time.sleep(0.01)
            rr = req('POST', '/rest/v1/exam_materials', headers={**HJ, 'Prefer': 'return=minimal'}, json={
                'title': title, 'region': '전국', 'district': '전국', 'school': school, 'grade': int(r['g'][1]),
                'semester': int(r['m']), 'exam_type': '모의고사', 'file_type': 'DB', 'content_type': '개인DB',
                'file_path': f'db_access/{UPLOADER}/{int(time.time() * 1000)}', 'price': price, 'uploader_id': UPLOADER,
                'uploader_name': 'mathofhy', 'subject': subj, 'exam_year': int(r['y']), 'is_verified': True})
            print(f'  개인DB 행 추가: {title} → {rr.status_code}')
        # 5) 모의고사 탭 — 문제 PDF·HWP (원본 PDF 아님)
        slug = f"{r['y']}-{r['m']}월-{r['cat']}-{r['g']}-수학" + (f"-{r['form']}" if r['form'] else '')
        title = (f"{r['y']}년 시행 {int(r['y']) + 1}학년도 수능 수학" if r['cat'] == '수능' else f"{r['y']} {r['g']} {r['m']}월 {r['cat']} 수학") + (f" {r['form']}" if r['form'] else '')
        row = get('mock_exams', {'select': 'id,original_pdf_path,original_hwp_path', 'slug': f'eq.{slug}'})
        folder = row[0]['original_pdf_path'].split('/')[0] if row and row[0].get('original_pdf_path') else str(uuid.uuid4())
        for ext, ct in (('pdf', 'application/pdf'), ('hwp', 'application/x-hwp')):
            rr = req('POST', f'/storage/v1/object/mock-materials/{folder}/original.{ext}', headers={**H, 'Content-Type': ct, 'x-upsert': 'true'},
                     data=open(f'try/{b}.{ext}', 'rb').read())
            if rr.status_code >= 300: raise SystemExit(f'  ✗ 탭 {ext} 업로드 실패 {rr.status_code} {rr.text[:150]}')
        if row:
            req('PATCH', '/rest/v1/mock_exams', headers=HJ, params={'id': f"eq.{row[0]['id']}"},
                json={'original_pdf_path': f'{folder}/original.pdf', 'original_hwp_path': f'{folder}/original.hwp', 'preview_urls': None})
            print(f'  모의고사 탭: 파일 교체 ({slug})')
        else:
            rr = req('POST', '/rest/v1/mock_exams', headers=HJ, json={
                'category': r['cat'], 'exam_year': int(r['y']), 'grade': r['g'], 'month': int(r['m']), 'subject': '수학',
                'title': title, 'slug': slug, 'original_pdf_path': f'{folder}/original.pdf', 'original_hwp_path': f'{folder}/original.hwp'})
            print(f'  모의고사 탭: 새로 만듦 {rr.status_code} ({slug})')
        s['done'] = True; save(st)
        # 6) 기하 선택 검색 검증 (dbFilter.ts buildDbOrConditions 와 같은 조건)
        p = {'select': 'subject', 'school': f'eq.{school}', 'grade': f"eq.{r['g']}", 'year': f"eq.{r['y']}",
             'semester': f"in.(\"{r['m']}월\",\"{r['m']}월 모의고사\")", 'work_status': 'eq.sorted', 'limit': '300'}
        if r['form']:
            got = [x for k in range(0, len(ids), 10) for x in get('questions', {'select': 'id', 'id': f'in.({",".join(ids[k:k + 10])})', 'work_status': 'eq.sorted'})]
            report.append((slug, len(got), None, len(got) == r['n'])); print(f'  {r["form"]} sorted: {len(got)}/{r["n"]}문항')
        elif r['g'] == '고3':
            p['subject'] = 'in.(대수,미적분I,기하와벡터)'
            got = get('questions', p)
            import collections; c = collections.Counter(x['subject'] for x in got)
            ok = len(got) == 30 and c['기하와벡터'] == 8
            report.append((slug, len(got), dict(c), ok)); print(f'  기하 선택 검색: {len(got)}문항 {dict(c)} {"✓" if ok else "✗"}')
        else:
            got = get('questions', p); n = len([x for x in got])
            report.append((slug, n, None, n >= 30)); print(f'  전과정 검색: {n}문항')
    print('\n검증:'); [print(' ', x) for x in report]


OFF = set()
ONLY = sys.argv[sys.argv.index('--only') + 1] if '--only' in sys.argv else None
{'prep': prep, 'export': export, 'finish': finish}[sys.argv[1]]()
