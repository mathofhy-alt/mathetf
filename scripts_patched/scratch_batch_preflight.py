# -*- coding: utf-8 -*-
"""
[배치 사전 점검] try/ 폴더를 읽어 등록 가능한 세트만 골라 플랜(JSON)을 만든다.
scratch_batch_run.py 는 이 플랜을 --plan 으로 받는다. 손으로 SETS 를 적지 않는다.

왜 만들었나 (2026-09-14, 하루 100세트 체제 준비):
  ① SETS 를 손으로 편집하다 정규식이 아랫줄까지 지운 사고(8월) — 100건을 손으로 적는 건 사고 예약
  ② 동명이교 가드가 배치에 없었다 — 미보유 상위 100개교 중 33개교가 동명이교
  ③ 실패 3종(빈 해설·크롭 기준 문구 없음·파일 누락)이 배치를 돌려야만 드러났다 — 밤새 실패를 굴리게 된다

파일명 규약(사용자 확정 7/21):  지역구_연도_N중간|N기말_학교+학년_과목
  예) 서울_강남구_2022년_2중간_경기여자고등학교1_수학(하)
  세트 = {base}.hml(파싱) + {base}.hwp/.pdf(판매) + {base}ㅈㄷ.pdf(캡쳐) [+ {base}_파스칼.pdf 원소스]

사용:
  python scripts_patched/scratch_batch_preflight.py            # try/ 점검 → 표 출력 + _trylog/_plan.json
  python scripts_patched/scratch_batch_preflight.py --test     # 파서 자체 시험 (파일 없이, 알려진 base 로)
그 다음:
  python scripts_patched/scratch_batch_run.py --plan _trylog/_plan.json [--workers 1]
"""
import os, re, sys, json
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace', line_buffering=True)
except Exception: pass

import requests
import urllib3 as _u; _u.disable_warnings()
_o = requests.Session.request
requests.Session.request = lambda self, *a, **k: _o(self, *a, **{**k, 'verify': False})

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path: sys.path.insert(0, ROOT)  # 운영 ROOT 의 scratch_blank_frames 등
TRY = os.path.join(ROOT, 'try')
PLAN = os.path.join(ROOT, '_trylog', '_plan.json')   # [11/3] 로그·플랜은 try 밖 _trylog 로(대표: try 가 지저분)

env = {}
with open(os.path.join(ROOT, '.env.local'), encoding='utf-8') as f:
    for line in f:
        m = re.match(r'^\s*([\w.-]+)\s*=\s*(.*)\s*$', line)
        if m: env[m.group(1)] = m.group(2).strip().strip('"').strip("'")
URL = env['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/')
KEY = env['SUPABASE_SERVICE_ROLE_KEY']
H = {'apikey': KEY, 'Authorization': f'Bearer {KEY}'}

def G(t, p):
    out, off = [], 0
    while True:
        q = dict(p); q['limit'] = 1000; q['offset'] = off
        r = requests.get(f'{URL}/rest/v1/{t}', headers=H, params=q, timeout=90); r.raise_for_status()
        b = r.json(); out += b
        if len(b) < 1000: break
        off += 1000
    return out

# ── 이름 교정 ──
# 파일명 약칭 → DB 정식명. 정식명이 아니면 학교 페이지가 둘로 갈라진다(8/31 단대부고, 9/2 세화고(서초)).
ALIAS = {
    '단대부고': '단국대학교사범대학부속고등학교',
    '단대부고등학교': '단국대학교사범대학부속고등학교',
    '중대부고': '중앙대학교사범대학부속고등학교',
    '중대부고등학교': '중앙대학교사범대학부속고등학교',
}
# 동명이교 접두: 광역·특별시는 시도명, 도(道)는 구군에서 시/군/구를 뗀 것 (규칙 9/9: 안산·분당·용인 — 시 단위)
METRO = {'서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '제주'}
def prefix_for(region, district):
    if region in METRO: return region
    return re.sub(r'(시|군|구)$', '', district or '') or region

ENDNOTE_RE = re.compile(r'<ENDNOTE\b.*?</ENDNOTE>', re.S | re.I)
HOLD_PHRASES = ['오류 불일치 검증', '출제 오류 의심', '[별첨]', '후보 정답과 불일치']   # 8/17·9/1 게이트

# 과목 표기 — 사이트 표준은 curriculum.ts 의 SUBJECT_UNITS 키다. 파일명의 '수학2'·'확통' 같은 약칭은 여기서 고친다.
# 표준 밖 과목으로 등록되면 FilterSidebar 의 SUBJECT_ORDER 에 없어 시험지출제 필터 트리에 안 뜬다([[subject-list-not-single-source]]).
SUBJECT_ALIAS = {'수학1': '수학I', '수학2': '수학II', '수1': '수학I', '수2': '수학II', '확통': '확률과통계',
                 '미적': '미적분', '공수1': '공통수학1', '공수2': '공통수학2', '미적1': '미적분I', '미적2': '미적분II'}
_cu = open(os.path.join(ROOT, 'src', 'lib', 'curriculum.ts'), encoding='utf-8').read()
_m = re.search(r'SUBJECT_UNITS[^=]*=\s*{(.*?)^};', _cu, re.S | re.M)
STD_SUBJECTS = set(re.findall(r"^\s*'([^']+)'\s*:\s*\[", _m.group(1), re.M)) if _m else set()

def parse_base(base):
    """base → dict 또는 (None, 이유)"""
    parts = base.split('_')
    if len(parts) != 6:
        return None, f'필드 {len(parts)}개(6개여야)'
    region, district, year, sem, sg, subject = parts
    my = re.match(r'^(\d{4})년?$', year)
    if not my: return None, f'연도 형식 "{year}"'
    ms = re.match(r'^([12])(중간|기말)$', sem)
    if not ms: return None, f'학기 형식 "{sem}"'
    mg = re.match(r'^(.+?)(?:\(([^)]*)\))?([1-3])$', sg)
    if not mg: return None, f'학교+학년 형식 "{sg}"'
    school_raw, hint, gdig = mg.group(1), mg.group(2), mg.group(3)
    school = ALIAS.get(school_raw, school_raw)
    subject = SUBJECT_ALIAS.get(subject, subject)
    if STD_SUBJECTS and subject not in STD_SUBJECTS:
        return None, f'과목 "{subject}" 는 사이트 표준 과목명이 아님 (표준: {sorted(STD_SUBJECTS)[:8]}…)'
    grade = ('중' if school.endswith('중학교') else '고') + gdig
    return {
        'base': base, 'region': region, 'district': district, 'year': my.group(1),
        'semstr': f'{ms.group(1)}학기{ms.group(2)}', 'semnum': int(ms.group(1)),
        'school': school, 'school_raw': school_raw, 'hint': hint, 'grade': grade, 'subject': subject,
    }, None

def to_tuple(d):
    # scratch_batch_run.py 의 SETS 행 형식과 동일: (base, 학교, 시도, 구군, 학기라벨, 학기번호, 과목, 학년, 연도)
    return (d['base'], d['school'], d['region'], d['district'], d['semstr'], d['semnum'], d['subject'], d['grade'], d['year'])

# ── 자체 시험 ──
if '--test' in sys.argv:
    cases = [
        ('서울_강남구_2022년_2중간_경기여자고등학교1_수학(하)',
         ('경기여자고등학교', '서울', '강남구', '2학기중간', 2, '수학(하)', '고1', '2022')),
        ('서울_강남구_2022년_2중간_단국대학교사범대학부속고등학교1_수학(하)',
         ('단국대학교사범대학부속고등학교', '서울', '강남구', '2학기중간', 2, '수학(하)', '고1', '2022')),
        ('서울_강남구_2025년_1기말_단대부고1_공통수학1',
         ('단국대학교사범대학부속고등학교', '서울', '강남구', '1학기기말', 1, '공통수학1', '고1', '2025')),
        ('서울_서초구_2025년_2기말_세화고등학교(서초)1_공통수학2',
         ('세화고등학교', '서울', '서초구', '2학기기말', 2, '공통수학2', '고1', '2025')),
        ('경기_안산시_2026년_1중간_강서고등학교2_기하',
         ('강서고등학교', '경기', '안산시', '1학기중간', 1, '기하', '고2', '2026')),
    ]
    bad = 0
    for base, exp in cases:
        d, err = parse_base(base)
        got = to_tuple(d)[1:] if d else None
        ok = got == exp
        bad += (not ok)
        print(('OK  ' if ok else 'FAIL') + f' {base}' + ('' if ok else f'\n      기대 {exp}\n      결과 {got or err}'))
    for base in ['서울_강남구_2022_경기여고1_수학', '서울_강남구_2022년_3중간_경기여고1_수학']:
        d, err = parse_base(base); print(('FAIL' if d else 'OK  ') + f' 거부해야 함: {base} → {err or "통과됨(오류)"}'); bad += bool(d)
    print(f'\n파서 시험: {"전부 통과" if not bad else f"{bad}건 실패"}')
    print(f'접두 시험: 안산시→{prefix_for("경기","안산시")} 양평군→{prefix_for("경기","양평군")} 서울/양천구→{prefix_for("서울","양천구")}')
    sys.exit(0 if not bad else 1)

# ── try/ 스캔 ──
if not os.path.isdir(TRY):
    print('try/ 폴더가 없다'); sys.exit(1)
files = [f for f in os.listdir(TRY) if os.path.isfile(os.path.join(TRY, f))]
bases = sorted({f[:-4] for f in files if f.endswith('.hml') and not f.startswith('up_')})
if not bases:
    print('try/ 에 미등록(.hml, up_ 아님) 세트가 없다'); sys.exit(0)
print(f'try/ 미등록 세트 {len(bases)}개 점검\n')

# 참조 데이터 한 번만
schools = G('schools', {'select': 'name,region,district'})
school_names = {s['name'] for s in schools}
school_locs = {}
for s in schools:
    school_locs.setdefault(s['name'], set()).add((s['region'], s['district']))
held_rows = G('exam_materials', {'select': 'school,region,district', 'file_type': 'eq.DB'})
held = {}
for r in held_rows:
    held.setdefault(r['school'], set()).add((r['region'], r['district']))

try:
    import fitz
except ImportError:
    fitz = None
    print('⚠ PyMuPDF 없음 — ㅈㄷ.pdf 점검은 건너뜀')
try:
    from scratch_blank_frames import blank_frames as _blank_frames
except Exception:
    _blank_frames = None
    print('⚠ scratch_blank_frames 없음 — 빈 그림 틀 점검은 건너뜀')

ok_sets, skip, hold = [], [], []
rows_out = []
for base in bases:
    d, err = parse_base(base)
    notes, verdict = [], 'OK'
    if not d:
        skip.append({'base': base, 'reason': f'파일명 파싱 실패: {err}'}); rows_out.append((base, '✗', f'파일명: {err}')); continue

    # 1) 파일 4종
    need = {'hml': f'{base}.hml', 'hwp': f'{base}.hwp', 'pdf': f'{base}.pdf', 'ㅈㄷ': f'{base}ㅈㄷ.pdf'}
    missing = [k for k, fn in need.items() if fn not in files]
    if missing:
        verdict = '✗'; notes.append('파일 누락 ' + '·'.join(missing))

    # 2) 보류 문구(8/17 게이트) — 파일명과 hml 본문 둘 다
    hml_text = ''
    try:
        hml_text = open(os.path.join(TRY, need['hml']), encoding='utf-8', errors='replace').read()
    except Exception as e:
        verdict = '✗'; notes.append(f'hml 읽기 실패 {type(e).__name__}')
    hit_names = [fn for fn in files if fn.startswith(base) and any(p in fn for p in HOLD_PHRASES)]
    hit_body = [p for p in HOLD_PHRASES if p in hml_text]
    # '[별첨]' 은 파스칼이 별해(다른 풀이)를 붙일 때도 쓴다 — "[별첨] 코시-슈바르츠 부등식으로 (2) 풀기".
    # 2026-09-16 송파구 6세트가 전부 이 경우였고 사용자가 '진행' 승인. 모든 [별첨] 뒤 40자 안에
    # 풀이·풀기·별해·부등식으로·방법 이 오면 별해로 보고 보류하지 않는다(⚠ 표시만). 하나라도 아니면 예전대로 보류.
    if '[별첨]' in hit_body:
        _plain = re.sub(r'<[^>]+>', ' ', hml_text)
        _tails = [_plain[m.end():m.end() + 150] for m in re.finditer(r'\[별첨\]', _plain)]
        if _tails and all(re.search(r'풀이|풀기|별해|부등식|방법|항등식|정리', t) for t in _tails):   # 9/20: 파스칼 별해는 대부분 '[별첨] 코시-슈바르츠 부등식 …' 로 시작한다(11세트)
            hit_body.remove('[별첨]'); notes.append(f'[별첨] 별해 {len(_tails)}회(오류 아님)')
    if hit_names or hit_body:
        where = ('파일명 ' + ', '.join(hit_names)) if hit_names else ('hml 본문 ' + ', '.join(hit_body))
        hold.append({'base': base, 'where': where})
        rows_out.append((base, '⛔', f'보류 문구 발견 — {where}')); continue

    # 3) 해설
    if hml_text:
        ens = ENDNOTE_RE.findall(hml_text)
        empties = [i + 1 for i, e in enumerate(ens) if len(re.sub(r'\s+', '', re.sub(r'<[^>]+>', '', e))) < 10]
        if not ens:
            verdict = '✗'; notes.append('ENDNOTE(해설) 0개')
        elif empties:
            verdict = '✗'; notes.append(f'빈 해설 {empties}번')
        d['n_endnote'] = len(ens)

    # 4) ㅈㄷ.pdf — 크롭 도구는 "따라서 정답은" 첫 등장부터 해설로 자른다. 없으면 크롭이 통째로 실패한다
    if fitz and 'ㅈㄷ' not in missing:
        try:
            doc = fitz.open(os.path.join(TRY, need['ㅈㄷ']))
            txt = ''.join(p.get_text() for p in doc)
            n_ans = txt.count('따라서 정답은')
            if doc.page_count < 2: verdict = '✗'; notes.append(f'ㅈㄷ {doc.page_count}쪽')
            if n_ans == 0: verdict = '✗'; notes.append('ㅈㄷ에 "따라서 정답은" 없음(크롭 기준)')
            d['n_pages'] = doc.page_count
        except Exception as e:
            verdict = '✗'; notes.append(f'ㅈㄷ 열기 실패 {type(e).__name__}')

    # 4-2) 빈 그림 틀 — 사용자 PDF 내보내기가 큰 PNG(약 2.5MP 이상)를 떨어뜨리면 테두리만 남는다.
    #      2026-09-17 송파구 2022 14세트(해설 그림 52개)가 이렇게 들어와 캡쳐에 빈 틀·잘림이 생겼다.
    #      한글 COM 'PDF로 저장'은 멀쩡했으므로 사용자가 다시 뽑아야 한다 → ✗(등록 불가)로 막는다.
    #      판매 pdf·ㅈㄷ.pdf 둘 다 본다(둘 다 같은 내보내기라 보통 같이 빠진다).
    if fitz and _blank_frames:
        for tag in ('pdf', 'ㅈㄷ'):
            if tag in missing: continue
            try:
                fr = _blank_frames(os.path.join(TRY, need[tag]))
            except Exception as e:
                fr = []; notes.append(f'{tag} 빈틀 검사 실패 {type(e).__name__}')
            if fr:
                # --allow-frames: 수리 경로(scratch_build_hybrid.py 로 해설은 고쳤고 문제 쪽 몇 개만 남아
                #   등록 뒤 scratch_fix_blank_frames_q.py 로 합성할 때) — 막지 않고 ⚠ 만 남긴다.
                if '--allow-frames' not in sys.argv: verdict = '✗'
                notes.append(f'{"⚠ " if "--allow-frames" in sys.argv else ""}{"판매PDF" if tag == "pdf" else "ㅈㄷ"} 빈 그림 틀 {len(fr)}개(쪽 {sorted({p for p, *_ in fr})}) — PDF 다시 내보내기 필요')

    # 5) 학교명 확인 + 지역 확인 + 동명이교
    #    schools(전국 2,342개교 등록부)가 "그 이름의 학교가 그 지역에 실재하는가"의 근거다.
    #    파일명 지역이 오타면(강남구→강남) 동명이교로 오판해 접두를 붙이고 페이지가 둘로 갈라진다 —
    #    그래서 접두는 ①등록부에 그 지역으로 실재하고 ②우리가 같은 이름을 다른 지역으로 보유 중일 때만 붙인다.
    if d['school'] not in school_names:
        # '경기고'·'현대고' 처럼 '고' 로 끝나는 약칭은 '등학교' 를 붙인 이름이 정식명이다.
        cand = [n for n in school_names if n == d['school'] + '등학교'] or                [n for n in school_names if n.endswith(d['school'])] or                [n for n in school_names if n.startswith(d['school']) and n.endswith('고등학교')]
        if len(cand) == 1:
            notes.append(f'약칭→{cand[0]}'); d['school'] = cand[0]
        else:
            verdict = '✗'; notes.append(f'학교명 미확인 "{d["school"]}"' + (f' 후보 {cand[:3]}' if cand else ''))
    if d['school'] in school_names:
        locs = school_locs.get(d['school'], set())
        here = (d['region'], d['district'])
        pfx = prefix_for(d['region'], d['district'])
        prefixed = pfx + d['school']
        if here in locs:
            # 등록부가 이 지역에 이 이름을 인정 — 우리가 같은 이름을 다른 지역으로 보유 중이면 동명이교
            if d['school'] in held and here not in held[d['school']]:
                notes.append(f'동명이교 → {prefixed} (보유: {sorted(held[d["school"]])})')
                d['school'] = prefixed
                d['need_school_row'] = prefixed not in school_names
        elif here in school_locs.get(prefixed, set()):
            # 이미 접두를 붙여 등록해 둔 동명이교(예: 안산강서고등학교, 9/9) — 두 번째 배치부터는 이 경로
            notes.append(f'동명이교(기등록 접두) → {prefixed}')
            d['school'] = prefixed
        else:
            verdict = '✗'
            notes.append(f'지역 불일치 — 등록부의 {d["school"]} 소재지 {sorted(locs)}, 파일명 {here}. '
                         f'지역 오타면 파일명을 고치고, 신규 동명이교면 schools 에 ({d["school"]} 또는 {prefixed}, {d["region"]}, {d["district"]}) 행을 넣은 뒤 재점검')

    # 6) 기등록
    # [10/16] 학년만 다른 같은 과목은 학년 붙은 출처 이름으로 따로 본다(scratch_batch_run.src_for 와 같은 규칙)
    src = f"{d['school']}_{d['year']}_{d['semstr']}_{d['subject']}"
    graded = f"{d['school']}_{d['year']}_{d['semstr']}_{re.sub(r'[^0-9]', '', str(d['grade']))}학년_{d['subject']}"
    if G('questions', {'select': 'id', 'source_db_id': f'eq.{graded}', 'limit': '1'}):
        src = graded
    else:
        _h = G('questions', {'select': 'grade', 'source_db_id': f'eq.{src}', 'limit': '1'})
        if _h and _h[0].get('grade') and _h[0]['grade'] != d['grade']:
            src = graded; notes.append(f'같은 과목 다른 학년({_h[0]["grade"]}) 있음 → 출처 이름에 학년 붙임')
    q = G('questions', {'select': 'work_status', 'source_db_id': f'eq.{src}'})
    if q and any(x['work_status'] == 'sorted' for x in q):
        skip.append({'base': base, 'reason': f'기등록 {len(q)}문항(sorted)'}); rows_out.append((base, '＝', f'기등록 {len(q)}문항')); continue
    # [10/25] 과목명만 다른 같은 회차(공통수학1↔수학(상), 공통수학2↔수학(하)) — 중동·중산 16회차가 이걸로 두 번 들어갔다.
    #   새로 넣으면 검색에 두 개가 뜨고 옛 id 를 쓰는 저장 시험지·보관함과 갈라진다 → 막고 id 유지 교체로 보낸다.
    _twin = {'공통수학1': '수학(상)', '수학(상)': '공통수학1', '공통수학2': '수학(하)', '수학(하)': '공통수학2'}.get(d['subject'])
    if _twin:
        _tq = G('questions', {'select': 'id', 'source_db_id': f"eq.{src[:-len(d['subject'])]}{_twin}", 'limit': '1'})
        if _tq:
            skip.append({'base': base, 'reason': f'기등록(과목명 {_twin})'})
            rows_out.append((base, '＝', f'기등록 — 과목명 {_twin} 로 이미 있음. 새로 넣지 말고 scratch_merge_dup_subject.py 방식(id 유지)으로 교체')); continue
    if q:
        notes.append(f'부분등록 {len(q)}문항(unsorted, 재실행으로 이어짐)')

    rows_out.append((base, verdict, ' / '.join(notes) if notes else ''))
    if verdict == 'OK':
        ok_sets.append({'tuple': to_tuple(d), 'school_row': {'name': d['school'], 'region': d['region'], 'district': d['district']} if d.get('need_school_row') else None})
    else:
        skip.append({'base': base, 'reason': ' / '.join(notes)})

# ── 보고 ──
w = max(len(b) for b, _, _ in rows_out) + 2
for b, v, n in rows_out:
    print(f'{v:2s} {b:<{w}s} {n}')
print(f'\n등록 가능 {len(ok_sets)} · 스킵 {len(skip)} · ⛔보류 {len(hold)}')
if hold:
    print('\n⛔ 보류 문구가 있는 세트 — 사용자 확인 전까지 아무것도 진행하지 않는다:')
    for h in hold: print(f'   {h["base"]}  ({h["where"]})')
dup = [s for s in ok_sets if s['school_row']]
if dup:
    print('\n⚠ 동명이교로 이름을 바꿔 넣는 세트 — 접두가 맞는지 확인할 것(규칙: 시 단위 — 안산·분당·용인):')
    for s in dup: print(f"   {s['tuple'][0]} → {s['tuple'][1]}")

with open(PLAN, 'w', encoding='utf-8') as f:
    json.dump({'ok': [s['tuple'] for s in ok_sets],
               'school_rows': [s['school_row'] for s in ok_sets if s['school_row']],
               'skip': skip, 'hold': hold}, f, ensure_ascii=False, indent=1)
print(f'\n플랜 저장: {PLAN}')
print('실행: python scripts_patched/scratch_batch_run.py --plan _trylog/_plan.json --workers 1')
