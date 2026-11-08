# -*- coding: utf-8 -*-
"""[시중교재 등록 드라이버] try/ 의 '{교재}_..._{NN}{단원}A1~39B40~96C97~114.hml' 단원 파일들 (10/6, 쎈 공통수학1 첫 등록).

⚠ 회원 전용 상품(private_dbs) — 공개되면 안 된다. 규칙은 memory/textbook-parsing-rules.md:
   work_status 는 'pending' 으로만(절대 sorted 로 바꾸지 않는다) · exam_materials 행 안 만듦 · 경로에 '|' 금지.
단계 (멱등 — _trylog/_textbook_state.json):
  prep   : scratch_textbook_ingest.ts(스텝 범위로 묶음 나눠 pending 삽입) → 크롭(CROP_START) → 캡쳐 업로드
  export : 단원 빈 문항 → tagjobs_tb/ (소넷 태깅 묶음, 허용 단원 = 과목 하나)
  finish : 태그는 scratch_manual_tags.json 으로 → scratch_batch_ai.ts(임베딩) → 완결성·pending 확인
사용: PYTHONUTF8=1 python scripts_patched/scratch_textbook_run.py prep|export|finish [--only 01]
"""
import os, re, sys, json, time, zlib, subprocess, requests, urllib3, fitz
urllib3.disable_warnings()
sys.stdout.reconfigure(encoding='utf-8', errors='replace', line_buffering=True)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); os.chdir(ROOT)
STATE_F = '_trylog/_textbook_state.json'
TSX = {**os.environ, 'NODE_TLS_REJECT_UNAUTHORIZED': '0', 'PYTHONUTF8': '1'}
NPX = 'npx.cmd' if os.name == 'nt' else 'npx'
env = {}
for line in open('.env.local', encoding='utf-8'):
    m = re.match(r'^\s*([\w.-]+)\s*=\s*(.*)\s*$', line)
    if m: env[m.group(1)] = m.group(2).strip().strip('"').strip("'")
URL = env['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/'); KEY = env['SUPABASE_SERVICE_ROLE_KEY']
H = {'apikey': KEY, 'Authorization': 'Bearer ' + KEY}; HJ = {**H, 'Content-Type': 'application/json'}
S = requests.Session(); S.verify = False
GRADE_OF = {'공통수학1': '고1', '공통수학2': '고1', '대수': '고2', '미적분I': '고2', '확률과통계': '고2', '미적분II': '고3', '기하와벡터': '고3', '기하': '고2'}
# 2022 '기하' 는 단원 목록(scratch_allowed_by_subject)이 따로 없다 — 사이트의 기하 문항(392개)이 기하와벡터 단원명을 쓴다.
ALLOWED_FROM = {'기하': ('기하와벡터', set())}   # 10/7: 공간벡터는 2022 기하에도 있다(curriculum.ts '기하' 목록, 쎈 기하 06·07). 처음에 뺐다가 되돌림

def req(method, path, tries=5, **kw):
    for t in range(tries):
        try:
            r = S.request(method, f'{URL}{path}', timeout=180, **kw)
            if r.status_code < 500: return r
        except requests.RequestException: pass
        time.sleep(3 * (t + 1))
    raise RuntimeError(f'{method} {path} 실패')
def get(path, params): return req('GET', f'/rest/v1/{path}', headers=H, params=params).json()
def run(cmd, timeout=3600, cwd=ROOT, extra_env=None):
    p = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace', cwd=cwd, env={**TSX, **(extra_env or {})}, timeout=timeout)
    return p.returncode, (p.stdout or '') + (p.stderr or '')
def load(): return json.load(open(STATE_F, encoding='utf-8')) if os.path.exists(STATE_F) else {}
def save(st): json.dump(st, open(STATE_F, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

# [10/24] 교과서 단원 이름 — 파일 이름엔 띄어쓰기가 없어 정식 이름을 여기 둔다(미래엔 공통수학2 기준, 대단원은 교과서 쪽 아래 표기)
TB_STEP = {'생': '생각 열기', '문': '문제', '예': '예제', '함': '함께하기', '탐': '탐구', '키': '생각 키우기'}
# [10/26] 동아출판 — 단원이 한 단계(1~6), 본문은 소단원 구간 파일((01~02)·(03~04))마다 번호가 1부터 다시 시작한다.
#   경로: '1 다항식 (01~02) > 문제' / 단원 끝은 '1 다항식 (마무리) > 단원 마무리·스스로 해결하기'
TB_UNITS_ONE = {
    ('동아', '공통수학1'): {'1': '다항식', '2': '복소수와 이차방정식', '3': '이차방정식과 이차함수', '4': '여러 가지 방정식과 부등식', '5': '경우의 수', '6': '행렬'},
    ('동아', '공통수학2'): {'1': '평면좌표와 직선의 방정식', '2': '원의 방정식과 도형의 이동', '3': '집합', '4': '명제', '5': '함수와 그래프', '6': '유리함수와 무리함수'},
    ('동아', '기하'): {'1': '이차곡선', '2': '공간도형과 공간좌표', '3': '벡터', '4': '벡터의 활용'},
    ('동아', '대수'): {'1': '지수와 로그', '2': '지수함수와 로그함수', '3': '삼각함수', '4': '삼각함수의 활용', '5': '등차수열과 등비수열', '6': '수열의 합과 수학적 귀납법'},
    ('동아', '미적분I'): {'1': '함수의 극한과 연속', '2': '미분', '3': '미분의 활용', '4': '적분'},
}
TB_UNITS = {
    '공통수학2': {'big': {'1': '도형의 방정식', '2': '집합과 명제', '3': '함수와 그래프'},
                 'mid': {'1-1': '평면좌표와 직선의 방정식', '1-2': '원의 방정식', '1-3': '도형의 이동',
                         '2-1': '집합', '2-2': '명제', '3-1': '함수', '3-2': '유리함수와 무리함수'}},
    '공통수학1': {'big': {'1': '다항식', '2': '방정식과 부등식', '3': '경우의 수', '4': '행렬'},
                 'mid': {'1-1': '다항식의 연산', '1-2': '나머지정리와 인수분해', '2-1': '복소수와 이차방정식', '2-2': '이차방정식과 이차함수',
                         '2-3': '여러 가지 방정식과 부등식', '3-1': '경우의 수', '4-1': '행렬'}},
    '대수': {'big': {'1': '지수함수와 로그함수', '2': '삼각함수', '3': '수열'},
            'mid': {'1-1': '지수와 로그', '1-2': '지수함수와 로그함수', '2-1': '삼각함수', '2-2': '사인법칙과 코사인법칙',
                    '3-1': '등차수열과 등비수열', '3-2': '수열의 합', '3-3': '수학적 귀납법'}},
    '미적분I': {'big': {'1': '함수의 극한과 연속', '2': '미분', '3': '적분'},
              'mid': {'1-1': '함수의 극한', '1-2': '함수의 연속', '2-1': '미분계수와 도함수', '2-2': '도함수의 활용',
                      '3-1': '부정적분과 정적분', '3-2': '정적분의 활용'}},
    '미적분II': {'big': {'1': '수열의 극한', '2': '미분법', '3': '적분법'},
               'mid': {'1-1': '수열의 극한', '1-2': '급수', '2-1': '여러 가지 함수의 미분', '2-2': '여러 가지 미분법', '2-3': '도함수의 활용',
                       '3-1': '여러 가지 적분법', '3-2': '정적분의 활용'}},
    '확률과통계': {'big': {'1': '경우의 수', '2': '확률', '3': '통계'},
                'mid': {'1-1': '순열과 조합', '1-2': '이항정리', '2-1': '확률의 개념과 활용', '2-2': '조건부확률',
                        '3-1': '확률분포', '3-2': '통계적 추정'}},
    '기하': {'big': {'1': '이차곡선', '2': '공간도형과 공간좌표', '3': '벡터'},
            'mid': {'1-1': '이차곡선', '1-2': '이차곡선의 접선', '2-1': '공간도형', '2-2': '공간좌표',
                    '3-1': '벡터의 연산', '3-2': '벡터의 성분과 내적', '3-3': '도형의 방정식'}},
}

# [10/27] 비상·천재(전인태)·천재(홍진곤)(대-중 두 단계)·지학사(한 단계) — 중단원 이름은 같은 교재의 본문 파일 이름에서 가져온다
TB_LONG = {'생각틔우기': '생각 틔우기', '함께완성하기': '함께 완성하기', '생각열기': '생각 열기', '예제': '예제', '문제': '문제', '탐구': '탐구'}
TB_END = {'중단원학습점검': '중단원 학습 점검', '대단원학습평가': '대단원 학습 평가', '수학익힘책': '수학 익힘책',
          '중단원확인하기': '중단원 확인하기', '대단원평가하기': '대단원 평가하기', '중단원점검하기': '중단원 점검하기',
          '대단원마무리평가': '대단원 마무리 평가', '스스로확인하기': '스스로 확인하기'}
TB_BIG = {'공통수학1': {'1': '다항식', '2': '방정식과 부등식', '3': '경우의 수', '4': '행렬'},
          '공통수학2': {'1': '도형의 방정식', '2': '집합과 명제', '3': '함수와 그래프'},
          '대수': {'1': '지수함수와 로그함수', '2': '삼각함수', '3': '수열'},
          '미적분I': {'1': '함수의 극한과 연속', '2': '미분', '3': '적분'},
          '기하': {'1': '이차곡선', '2': '공간도형과 공간좌표', '3': '벡터'}}
TB_SPACED = ['다항식의 연산', '나머지정리와 인수분해', '복소수와 이차방정식', '이차방정식과 이차함수', '여러 가지 방정식과 부등식', '경우의 수', '행렬',
             '행렬과 그 연산', '평면좌표와 직선의 방정식', '선분의 내분과 직선', '원의 방정식', '도형의 이동', '집합', '명제', '함수', '유리함수와 무리함수',
             '이차곡선', '이차곡선의 접선', '포물선', '타원', '쌍곡선', '공간도형', '공간좌표', '벡터의 연산', '벡터의 성분과 내적', '도형의 방정식',
             '지수와 로그', '지수함수와 로그함수', '삼각함수', '사인법칙과 코사인법칙', '등차수열과 등비수열', '수열의 합', '수학적 귀납법', '수열의 합과 수학적 귀납법',
             '함수의 극한', '함수의 연속', '미분계수와 도함수', '도함수의 활용', '부정적분과 정적분', '정적분의 활용',
             '다항식', '방정식과 부등식', '집합과 명제', '함수와 그래프', '공간도형과 공간좌표', '벡터', '수열', '함수의 극한과 연속', '미분', '적분']
TB_SPACE = {x.replace(' ', ''): x for x in TB_SPACED}
TB_GENERIC = {'비상', '천재(전인태)', '천재(홍진곤)', '지학사'}

def tb_generic_units(files):
    """files: try/ 의 교과서 hml 중 TB_GENERIC 출판사 것. 본문 파일에서 (교재, 단원번호) → 단원 이름을 먼저 모은다."""
    names = {}
    for f in files:
        subject, pub, rest = re.match(r'^교과서_([^_]+)_([^_]+)_(.+)\.hml$', f).groups()
        m = re.match(r'^(\d(?:-\d)?)([^_(\d]+?)(?:\(([\d~]+)\))?_', rest)
        if m and not any(rest.startswith(m.group(1) + k) for k in TB_END): names[(pub, subject, m.group(1))] = m.group(2)
    out = []
    R = {'1': 'Ⅰ', '2': 'Ⅱ', '3': 'Ⅲ', '4': 'Ⅳ'}
    for f in files:
        subject, pub, rest = re.match(r'^교과서_([^_]+)_([^_]+)_(.+)\.hml$', f).groups()
        book = f'{pub} 교과서 {subject}'; base = f[:-4]
        sp = lambda raw: TB_SPACE.get(raw) or raw
        lab = lambda key: (f'{R[key[0]]}-{key[2]}' if '-' in key else (key if pub == '지학사' else R[key]))
        m_end = re.match(r'^(\d(?:-\d)?)(' + '|'.join(TB_END) + r')(\d+)~(\d+)$', rest)
        if m_end:
            key, kind = m_end.group(1), m_end.group(2)
            if '-' in key: unit = f"{lab(key)} {sp(names[(pub, subject, key)])}"
            elif pub == '지학사': unit = f"{key} {sp(names[(pub, subject, key)])} (마무리)"
            else: unit = f"{R[key]} {TB_BIG[subject][key]}"
            # no 는 크롭 폴더 이름에 들어간다 — 한글이면 크롭이 0개로 끝난다(10/27, 148세트) → 영문 기호
            steps = [(TB_END[kind], int(m_end.group(3)), int(m_end.group(4)))]
            no = key + {'중단원학습점검': 'm', '중단원확인하기': 'm', '중단원점검하기': 'm', '대단원학습평가': 't', '대단원평가하기': 't',
                        '대단원마무리평가': 't', '수학익힘책': 'w', '스스로확인하기': 's'}[kind]
        else:
            m = re.match(r'^(\d(?:-\d)?)([^_(]+?)(?:\(([\d~]+)\))?_(.+)$', rest)
            if not m: raise SystemExit(f'교과서 파일 이름 형식을 못 읽음: {f}')
            key, raw, part, spec = m.groups()
            unit = f"{lab(key)} {sp(raw)}" + (f' ({part})' if part else '')
            if re.fullmatch(r'(?:[생문예함탐키]\d+(?:~\d+)?)+', spec):
                # 지학사의 '키' = '생각을 키우는 문제'(작업 PDF 머리말, 10/27). 동아의 '키' 는 '생각 키우기'
                stepname = lambda c: '생각을 키우는 문제' if (c == '키' and pub == '지학사') else TB_STEP[c]
                steps = [(stepname(c), int(a), int(b or a)) for c, a, b in re.findall(r'([생문예함탐키])(\d+)(?:~(\d+))?', spec)]
            else:
                toks = re.findall(r'(' + '|'.join(TB_LONG) + r')(\d+)(?:~(\d+))?', spec)
                if ''.join(f"{w}{a}" + (f"~{b}" if b else '') for w, a, b in toks) != spec: raise SystemExit(f'구간 표기를 못 읽음: {f}')
                steps = [(TB_LONG[w], int(a), int(b or a)) for w, a, b in toks]
            no = key + 'p' + (part or '').replace('~', '-')
        if ONLY and no != ONLY: continue
        out.append(dict(base=base, no=no, book=book, unit=unit, subject=subject, grade=GRADE_OF[subject], steps=steps,
                        n=sum(b - a + 1 for _, a, b in steps), start=steps[0][1]))
    return out

# [10/28] YBM·천재교육(홍진곤) — '01다항식의연산_문제1,4,6~7_예제2,5_스스로하기3_스스로확인하기22~26' / 'Ⅰ스스로마무리하기1~18'
#   구간이 쉼표 목록이다. 파일 번호는 1부터 이어지고, 묶음 이름별로 모은다(예제1,7,10 → 예제 1·2·3번, ingest 가 묶음 안 순번으로 매김).
#   YBM 소단원 번호(01~17)는 책 전체 연번 → 대단원별로 나눠 'Ⅰ-1 다항식의 연산'. 이름은 각 대단원 첫 쪽 표기(쉼표는 '·').
TB_YBM = {
    '공통수학1': [['다항식의 연산', '항등식과 나머지정리', '인수분해'],
               ['복소수와 그 연산', '이차방정식의 판별식', '이차방정식의 근과 계수의 관계', '이차방정식과 이차함수의 관계', '이차함수의 최대·최소',
                '삼차방정식과 사차방정식', '연립이차방정식', '연립일차부등식', '이차부등식과 연립이차부등식'],
               ['경우의 수', '순열', '조합'], ['행렬의 뜻', '행렬의 연산']],
    '공통수학2': [['선분의 내분', '두 직선의 평행과 수직', '원의 방정식', '원과 직선의 위치 관계', '평행이동', '대칭이동'],
               ['집합의 뜻과 포함 관계', '집합의 연산', '명제와 조건', '명제 사이의 관계', '명제와 절대부등식의 증명'],
               ['함수의 뜻과 그래프', '합성함수', '역함수', '유리함수', '무리함수']],
    '기하': [['포물선', '타원', '쌍곡선', '이차곡선의 접선의 방정식'],
            ['직선과 평면의 위치 관계', '삼수선 정리', '정사영', '공간에서 점의 좌표', '좌표공간에서 선분의 내분점', '구의 방정식'],
            ['벡터의 뜻과 덧셈·뺄셈', '벡터의 실수배', '위치벡터', '벡터의 성분', '벡터의 내적', '직선의 방정식', '평면의 방정식과 구의 방정식']],
    '대수': [['거듭제곱과 거듭제곱근', '지수의 확장과 지수법칙', '로그의 뜻과 성질', '상용로그', '지수함수의 뜻과 그래프', '로그함수의 뜻과 그래프', '지수함수와 로그함수의 활용'],
            ['일반각과 호도법', '삼각함수', '삼각함수의 그래프', '사인법칙과 코사인법칙'],
            ['수열의 뜻', '등차수열', '등비수열', '수열의 합', '수열의 귀납적 정의', '수학적 귀납법']],
    '미적분I': [['함수의 극한', '함수의 극한에 대한 성질', '함수의 연속', '연속함수의 성질'],
              ['미분계수', '도함수', '접선의 방정식', '평균값 정리', '함수의 증가와 감소·극대와 극소', '함수의 그래프', '방정식과 부등식에의 활용', '속도와 가속도'],
              ['부정적분', '부정적분의 계산', '정적분', '넓이', '속도와 거리']],
}
TB_LIST_STEP = {'문제': '문제', '예제': '예제', '스스로하기': '스스로 하기', '스스로확인하기': '스스로 확인하기', '중단원점검하기': '중단원 점검하기',
                '스스로마무리하기': '스스로 마무리하기', '대단원평가하기': '대단원 평가하기'}
TB_LIST_PUB = {'YBM': 'YBM', '천재교육': '천재(홍진곤)'}
# 천재교육 미적분I = 10/27 등록한 '천재(홍진곤) 교과서 미적분I' 과 같은 책 → 교체 금지(10/27 대표), 건너뛰고 보고
TB_LIST_SKIP = {('천재교육', '미적분I')}

def tb_list_units(files):
    out = []; RO = {'Ⅰ': '1', 'Ⅱ': '2', 'Ⅲ': '3', 'Ⅳ': '4'}; R = {v: k for k, v in RO.items()}
    for f in files:
        subject, pub, rest = re.match(r'^교과서_([^_]+)_([^_]+)_(.+)\.hml$', f).groups()
        if (pub, subject) in TB_LIST_SKIP: print(f'⏭ 이미 등록된 책(교체 안 함): {f}'); continue
        book = f'{TB_LIST_PUB[pub]} 교과서 {subject}'; base = f[:-4]
        if (m := re.match(r'^([ⅠⅡⅢⅣ])(스스로마무리하기|대단원평가하기)(\d+)~(\d+)$', rest)):
            b = RO[m.group(1)]; unit = f'{m.group(1)} {TB_BIG[subject][b]}'
            steps = [(TB_LIST_STEP[m.group(2)], int(m.group(3)), int(m.group(4)))]; no = b + 't'
        else:
            m = re.match(r'^(\d{1,2})([^_(]+?)(?:\((\d)\))?_(.+)$', rest)
            if not m: raise SystemExit(f'교과서 파일 이름 형식을 못 읽음: {f}')
            num, raw, part, spec = m.groups()
            if pub == 'YBM':
                k = int(num); bi = 0
                while k > len(TB_YBM[subject][bi]): k -= len(TB_YBM[subject][bi]); bi += 1
                name = TB_YBM[subject][bi][k - 1]
                if name.replace(' ', '').replace('·', '') != raw: raise SystemExit(f'YBM 단원 이름 대조 실패: {raw} vs {name}')
                key = f'{bi + 1}-{k}'
            else:
                mids = TB_UNITS[subject]['mid']; name = TB_SPACE.get(raw) or raw
                if raw == '행렬과그연산': name = '행렬과 그 연산'
                key = next((kk for kk, v in mids.items() if v.replace(' ', '') == raw or (raw == '행렬과그연산' and kk == '4-1')), None)
                if not key: raise SystemExit(f'천재 중단원 번호를 못 찾음: {raw}')
            unit = f'{R[key[0]]}-{key[2:]} {name}' + (f' ({part})' if part else '')
            steps = []
            for tok in spec.split('_'):
                t = re.fullmatch(r'(' + '|'.join(TB_LIST_STEP) + r')([\d,~]+)', tok)
                if not t: raise SystemExit(f'구간 표기를 못 읽음: {tok} ({f})')
                for a, b2 in re.findall(r'(\d+)(?:~(\d+))?', t.group(2)): steps.append((TB_LIST_STEP[t.group(1)], int(a), int(b2 or a)))
            steps.sort(key=lambda x: x[1])
            nums = [n for _, a, b2 in steps for n in range(a, b2 + 1)]
            if nums != list(range(1, len(nums) + 1)): raise SystemExit(f'번호가 1부터 빈틈없이 이어지지 않음: {f}')
            no = key.replace('-', '_') + 'p' + (part or '')
        if ONLY and no != ONLY: continue
        out.append(dict(base=base, no=no, book=book, unit=unit, subject=subject, grade=GRADE_OF[subject], steps=steps,
                        n=sum(b - a + 1 for _, a, b in steps), start=steps[0][1]))
    return out

# [10/30] 마플교과서(시중교재, rm7님 요청) — 대표가 소단원별로 다시 구운 파일:
#   마플교과서_{과목}_{대}_{소}_{소단원}_보기문제1~6_마플개념익힘7~8_문제9~14…  /  마플교과서_{과목}_{대}_단원종합_BASIC1~10_NORMAL11~22_TOUGH23~27
#   경로 '마플교과서 대수 > 01 지수 > 1 거듭제곱과 거듭제곱근 > 보기 문제' · '… > 01 지수 > 단원 종합 > BASIC'
#   특강·보충은 책 번호가 문항 번호에 붙어 있다(특강0516~25 = 특강05 의 16~25) — 앞 구간에 이어지는 번호로 끊는다.
MAPL_BIG = {'공통수학2': ['평면좌표', '직선의 방정식', '원의 방정식', '도형의 이동', '집합', '명제', '절대부등식', '함수', '합성함수와 역함수', '유리함수', '무리함수'],
            '대수': ['지수', '로그', '지수함수와 로그함수', '지수함수와 로그함수의 활용', '삼각함수', '삼각함수의 그래프', '삼각함수의 활용', '등차수열', '등비수열', '수열의 합', '수학적 귀납법']}
MAPL_SMALL = ['두 점 사이의 거리', '선분의 내분점', '삼각형의 무게중심', '직선의 방정식', '두 직선의 위치 관계', '두 직선의 교점을 지나는 직선', '점과 직선 사이의 거리',
              '원의 방정식', '여러 가지 원의 방정식', '두 원의 교점을 지나는 도형의 방정식', '원과 직선의 위치 관계', '원의 접선의 방정식', '원과 직선의 활용',
              '평행이동', '대칭이동', '최단 거리의 총정리', '집합의 뜻과 표현', '집합 사이의 포함 관계', '부분집합의 개수', '멱집합', '집합의 연산', '집합의 연산 법칙',
              '여러 가지 집합', '유한집합의 원소의 개수', '명제와 조건', '명제 사이의 관계', '충분조건과 필요조건', '명제의 증명', '부등식의 증명', '절대부등식',
              '함수의 정의', '여러 가지 함수', '함수의 개수', '절댓값 기호를 포함한 함수의 그래프', '합성함수', '역함수', '유리식', '유리함수', '무리식', '무리함수',
              '거듭제곱과 거듭제곱근', '지수의 확장', '로그', '로그의 성질', '상용로그', '지수함수의 뜻과 그래프', '지수함수의 최대·최소', '로그함수의 뜻과 그래프',
              '로그함수의 최대·최소', '일반각과 호도법', '삼각함수', '삼각함수의 그래프', '일반각에 대한 삼각함수의 성질', '삼각함수의 최대·최소',
              '삼각함수가 포함된 방정식과 부등식', '사인법칙', '코사인법칙', '삼각형의 넓이', '수열', '등차수열', '등차수열의 합', '수열의 합과 일반항 사이의 관계',
              '등비수열', '등비수열의 합', '적금과 등비수열', '합의 기호 Σ', '자연수의 거듭제곱의 합', '여러 가지 수열의 합', '수열의 귀납적 정의', '수학적 귀납법']
MAPL_SMALL_RAW = {x.replace(' ', ''): x for x in MAPL_SMALL}
MAPL_SMALL_RAW.update({'지수함수의활용방정식': '지수함수의 활용 (방정식)', '지수함수의활용부등식': '지수함수의 활용 (부등식)',
                       '로그함수의활용방정식': '로그함수의 활용 (방정식)', '로그함수의활용부등식': '로그함수의 활용 (부등식)'})

def mapl_step(label):
    if '특강' in label: return '마플 특강'
    if '보충' in label: return '마플 보충'
    if '예제' in label: return '예제'
    return {'보기문제': '보기 문제', '마플개념익힘': '개념 익힘', '문제': '문제', '수능익힘': '수능 익힘',
            'BASIC': 'BASIC', 'NORMAL': 'NORMAL', 'TOUGH': 'TOUGH'}[label]

def mapl_segments(rest, f):
    """'보기문제1~6_마플개념익힘7~8_특강0516~25' → [(구간, 시작, 끝)] — 번호는 1부터 빈틈없이 이어져야 한다."""
    segs, exp = [], 1
    for tok in rest.split('_'):
        while tok:
            hit = None
            for m in re.finditer(r'(\d+)(?:~(\d+))?', tok):
                s = m.group(1)
                # 붙은 책 번호(특강05·특강10)는 떼어 낸다 — 앞 구간에 이어지는 번호가 되는 가장 짧은 꼬리
                for k in range(len(s) - 1, -1, -1):
                    if s[k] != '0' and int(s[k:]) == exp and m.start() + k > 0:
                        hit = (tok[:m.start()] + s[:k], exp, int(m.group(2) or exp), m.end()); break
                if hit: break
            if not hit: raise SystemExit(f'마플 구간 표기를 못 읽음: {tok} (기대 번호 {exp}) — {f}')
            segs.append((mapl_step(hit[0]), hit[1], hit[2])); exp = hit[2] + 1; tok = tok[hit[3]:]
    return segs

def mapl_units(files):
    out = []
    for f in files:
        m = re.match(r'^마플교과서_(공통수학2|대수)_(\d+)_(\d+|단원종합)_(.+)\.hml$', f)
        if not m: raise SystemExit(f'마플 파일 이름 형식을 못 읽음: {f}')
        subject, big, small, rest = m.groups(); bi = int(big)
        unit = f'{bi:02d} {MAPL_BIG[subject][bi - 1]}'
        if small == '단원종합':
            unit += ' > 단원 종합'; no = f'{bi:02d}t'
        else:
            raw, rest = rest.split('_', 1)
            if raw not in MAPL_SMALL_RAW: raise SystemExit(f'마플 소단원 이름 표에 없음: {raw}')
            unit += f' > {small} {MAPL_SMALL_RAW[raw]}'; no = f'{bi:02d}_{small}'
        no = ('m2_' if subject == '공통수학2' else 'ma_') + no
        if ONLY and no != ONLY: continue
        steps = mapl_segments(rest, f)
        out.append(dict(base=f[:-4], no=no, book=f'마플교과서 {subject}', unit=unit, subject=subject, grade=GRADE_OF[subject], steps=steps,
                        n=sum(b - a + 1 for _, a, b in steps), start=1))
    return out

def units():
    """파일명의 스텝 범위 + ㅈㄷ 첫 쪽의 교재명·단원명(띄어쓰기 있는 정식 이름)."""
    out = []
    mapl = [f for f in sorted(os.listdir('try')) if f.endswith('.hml') and f.startswith('마플교과서_')]
    out += mapl_units(mapl)
    gen = [f for f in sorted(os.listdir('try')) if f.endswith('.hml') and (m := re.match(r'^교과서_[^_]+_([^_]+)_', f)) and m.group(1) in TB_GENERIC]
    out += tb_generic_units(gen)
    lst = [f for f in sorted(os.listdir('try')) if f.endswith('.hml') and (m := re.match(r'^교과서_[^_]+_([^_]+)_', f)) and m.group(1) in TB_LIST_PUB]
    out += tb_list_units(lst); gen += lst + mapl
    for f in sorted(os.listdir('try')):
        if not f.endswith('.hml') or f in gen: continue
        # [11/8] 사설 모의고사(김범준) — 한 회차에 공통(대수·미적분I 섞임)·확통·미적분·기하가 같이 있다(대표 「시중교재로 처리」).
        #   파일: 26_김범준모의고사_시즌1_1회_공통1~22확통23~30미적분31~38[기하39~46].hml (기하는 1회만 — 뒤 회차 기하는 같은 문제라 대표가 뺐다)
        #   경로: '2027학년도 김범준 모의고사 시즌1 > 1회 > 공통' · 과목은 묶음마다(step_subj), 공통은 단원으로 대수/미적분I 를 가른다(수능 회차와 같은 규칙)
        km = re.match(r'^\d+_김범준모의고사_시즌(\d+)_(\d+)회_(.+)\.hml$', f)
        if km:
            season, k, rest = km.groups(); base = f[:-4]
            hdr = [x.strip() for x in fitz.open(f'try/{base}ㅈㄷ.pdf')[0].get_text().split('\n') if x.strip()]
            yr = next((re.match(r'^(\d{4})학년도', x).group(1) for x in hdr if re.match(r'^\d{4}학년도', x)), None)
            if not yr: raise SystemExit(f'ㅈㄷ 머리말에서 학년도를 못 읽음: {f}')
            LAB = {'공통': ('공통', ['대수', '미적분I']), '확통': ('확률과 통계', ['확률과통계']), '미적분': ('미적분', ['미적분II']), '기하': ('기하', ['기하와벡터'])}
            steps = []; ssub = {}
            for lab, a, b in re.findall(r'(공통|확통|미적분|기하)(\d+)~(\d+)', rest):
                steps.append((LAB[lab][0], int(a), int(b))); ssub[LAB[lab][0]] = LAB[lab][1]
            no = f'kbj{season}_{int(k):02d}'
            if ONLY and no != ONLY: continue
            out.append(dict(base=base, no=no, book=f'{yr}학년도 김범준 모의고사 시즌{season}', unit=f'{int(k)}회', subject='대수', grade='고3',
                            steps=steps, step_subj=ssub, n=sum(b - a + 1 for _, a, b in steps), start=steps[0][1]))
            continue
        # [10/24] 교과서 — 교과서_{과목}_{출판사}_{대-중}{단원}_생1문2~5예6… / {대-중}중단원마무리1~11 / {대}대단원평가1~18
        #   생=생각 열기·문=문제·예=예제·함=함께하기·탐=탐구. 같은 구간 이름이 여러 번 나와도 한 묶음(경로)으로 모인다.
        tb = re.match(r'^교과서_([^_]+)_([^_]+)_(.+)\.hml$', f)
        if tb:
            subject, pub, rest = tb.groups(); base = f[:-4]
            if subject not in GRADE_OF: raise SystemExit(f'교과서 과목을 못 읽음: {f}')
            book = f'{pub} 교과서 {subject}'
            BIG = TB_UNITS.get(subject, {}).get('big', {}); MID = TB_UNITS.get(subject, {}).get('mid', {})
            ROMAN = {'1': 'Ⅰ', '2': 'Ⅱ', '3': 'Ⅲ', '4': 'Ⅳ'}
            ONE = TB_UNITS_ONE.get((pub, subject))
            if ONE is not None:   # 동아식 한 단계 단원
                if (m := re.match(r'^(\d)(단원마무리|스스로해결하기)(\d+)~(\d+)$', rest)):
                    unit = f'{m.group(1)} {ONE[m.group(1)]} (마무리)'
                    steps = [('단원 마무리' if m.group(2) == '단원마무리' else '스스로 해결하기', int(m.group(3)), int(m.group(4)))]
                    no = m.group(1) + ('m' if m.group(2) == '단원마무리' else 's')
                elif (m := re.match(r'^(\d)[^_(]+(?:\(([\d~]+)\))?_((?:[생문예함탐키]\d+(?:~\d+)?)+)$', rest)):
                    part = m.group(2)
                    unit = f'{m.group(1)} {ONE[m.group(1)]}' + (f' ({part})' if part else '')
                    steps = [(TB_STEP[c], int(a), int(b or a)) for c, a, b in re.findall(r'([생문예함탐키])(\d+)(?:~(\d+))?', m.group(3))]
                    no = m.group(1) + 'p' + (part or '').replace('~', '-')
                else: raise SystemExit(f'교과서 파일 이름 형식을 못 읽음: {f}')
                if ONLY and no != ONLY: continue
                out.append(dict(base=base, no=no, book=f'{pub} 교과서 {subject}', unit=unit, subject=subject, grade=GRADE_OF[subject], steps=steps,
                                n=sum(b - a + 1 for _, a, b in steps), start=steps[0][1]))
                continue
            if (m := re.match(r'^(\d)-(\d)중단원마무리(\d+)~(\d+)$', rest)):
                key = f'{m.group(1)}-{m.group(2)}'; unit = f"{ROMAN[m.group(1)]}-{m.group(2)} {MID[key]}"
                steps = [('중단원 마무리', int(m.group(3)), int(m.group(4)))]; no = key + 'm'
            elif (m := re.match(r'^(\d)-(\d)생각넓히기(\d+)(?:~(\d+))?$', rest)):
                # [10/29] 미래엔 '생각 넓히기' — 처음 등록 때 빠져 따로 만든 파일. 중단원 아래 새 잎(기존 묶음 교체 아님)
                key = f'{m.group(1)}-{m.group(2)}'; unit = f"{ROMAN[m.group(1)]}-{m.group(2)} {MID[key]}"
                steps = [('생각 넓히기', int(m.group(3)), int(m.group(4) or m.group(3)))]; no = key + 'w'
            elif (m := re.match(r'^(\d)대단원평가(\d+)~(\d+)$', rest)):
                unit = f"{ROMAN[m.group(1)]} {BIG[m.group(1)]}"
                steps = [('대단원 평가', int(m.group(2)), int(m.group(3)))]; no = m.group(1) + 't'
            elif (m := re.match(r'^(\d)-(\d)[^_]+_((?:[생문예함탐]\d+(?:~\d+)?)+)$', rest)):
                key = f'{m.group(1)}-{m.group(2)}'; unit = f"{ROMAN[m.group(1)]}-{m.group(2)} {MID[key]}"
                steps = [(TB_STEP[c], int(a), int(b or a)) for c, a, b in re.findall(r'([생문예함탐])(\d+)(?:~(\d+))?', m.group(3))]
                no = key
            else: raise SystemExit(f'교과서 파일 이름 형식을 못 읽음: {f}')
            if ONLY and no != ONLY: continue
            out.append(dict(base=base, no=no, book=book, unit=unit, subject=subject, grade=GRADE_OF[subject], steps=steps,
                            n=sum(b - a + 1 for _, a, b in steps), start=steps[0][1]))
            continue
        # 10/8: 단원명 속 '(1)' 숫자(쎈 미적분I '04도함수의활용(1)')를 건너뛴다 — 예전 식은 '93' 을 단원 번호로 잡았다
        m = re.search(r'(\d{2})(?:[^\d]|\(\d+\))*?((?:[A-Z]\d+~\d+)+)\.hml$', f)
        if not m: continue
        base = f[:-4]
        if ONLY and m.group(1) != ONLY: continue
        steps = [(s, int(a), int(b)) for s, a, b in re.findall(r'([A-Z])(\d+)~(\d+)', m.group(2))]
        lines = [x.strip() for x in fitz.open(f'try/{base}ㅈㄷ.pdf')[0].get_text().split('\n') if x.strip()]
        # 머리말 형식이 교재마다 다르다: 공통수학1 = ['수학ETF','쎈_공통수학1','기출문제','01_다항식의_연산','다항식의 연산']
        #   공통수학2 = ['수학ETF','쎈 공통수학2','기출문제','Ⅰ. 도형의 방정식','01 평면좌표'] (대단원 줄은 경로에 안 넣는다 — 단원 번호가 책 전체에서 유일)
        # 10/8 쎈 미적분Ⅰ: 머리말이 로마 숫자(Ⅰ). 사이트 과목명은 라틴 I(미적분I) — 교재명·과목 둘 다 맞춘다
        book = lines[lines.index('수학ETF') + 1].replace('_', ' ').replace('Ⅱ', 'II').replace('Ⅰ', 'I')
        uidx = next(i for i, x in enumerate(lines) if re.match(rf'^{m.group(1)}[_ ]', x))
        unit = f'{m.group(1)} {lines[uidx + 1]}' if lines[uidx].startswith(m.group(1) + '_') else lines[uidx]
        subject = book.split()[-1]
        if subject not in GRADE_OF: raise SystemExit(f'교재명에서 과목을 못 읽음: {book}')
        out.append(dict(base=base, no=m.group(1), book=book, unit=unit, subject=subject, grade=GRADE_OF[subject], steps=steps,
                        n=sum(b - a + 1 for _, a, b in steps), start=steps[0][1]))
    return out


def prep():
    st = load()
    for u in units():
        b = u['base']; s = st.setdefault(b, {})
        if s.get('done'): print(f"⏭ {u['book']} > {u['unit']}: 이미 등록 완료"); continue
        print(f"===== {u['book']} > {u['unit']} ({u['n']}문항, {' '.join(f'{x}:{a}-{c}' for x, a, c in u['steps'])})")
        if not s.get('idorder'):
            code, out = run([NPX, 'tsx', 'scripts_patched/scratch_textbook_ingest.ts', f'try/{b}.hml', u['book'], u['unit'], u['grade'], u['subject'],
                             ','.join(f'{x}:{a}-{c}' for x, a, c in u['steps'])])
            m = re.search(r'IDORDER=(\S+)', out)
            if not m: print('  ✗ 등록 실패:', out[-400:]); continue
            s['idorder'] = m.group(1).split(','); s['book'] = u['book']; s['unit'] = u['unit']; save(st)
        ids = s['idorder']
        if len(ids) != u['n']: print(f"  ✗ IDORDER {len(ids)} ≠ {u['n']}"); continue
        print(f'  등록: {len(ids)}문항 (pending)')
        crop = f"crop_batch/tb_{zlib.crc32(u['book'].encode('utf-8')):08x}_{u['no']}"
        qdir = os.path.join('hwpx-python-tool', crop, 'questions'); sdir = os.path.join('hwpx-python-tool', crop, 'solutions')
        cnt = lambda d: len([f for f in os.listdir(d) if f.endswith('.webp')]) if os.path.isdir(d) else 0
        if not (cnt(qdir) == u['n'] and cnt(sdir) == u['n']):
            run([sys.executable, 'pdf_crop_v4.py', f'../try/{b}ㅈㄷ.pdf', crop], timeout=3600, cwd=os.path.join(ROOT, 'hwpx-python-tool'),
                extra_env={'CROP_START': str(u['start'])})
        if not (cnt(qdir) == u['n'] and cnt(sdir) == u['n']):
            print(f"  ✗ 크롭 개수 불일치: 문제 {cnt(qdir)} / 해설 {cnt(sdir)} vs {u['n']}"); continue
        s['crop'] = crop; save(st)
        print(f"  크롭: 문제 {u['n']} + 해설 {u['n']}")
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


def export():
    st = load(); allowed_by = json.load(open('scratch_allowed_by_subject.json', encoding='utf-8'))
    clean = lambda x: re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', x or '')).strip()
    os.makedirs('tagjobs_tb', exist_ok=True)
    for _f in os.listdir('tagjobs_tb'):
        if re.match(r'^(job|out)_\d+\.(json|txt)$', _f): os.remove(os.path.join('tagjobs_tb', _f))
    n = 0; meta = {}
    for u in units():
        ids = st.get(u['base'], {}).get('idorder') or []
        src_subj, drop = ALLOWED_FROM.get(u['subject'], (u['subject'], set()))
        allowed = {k: v for k, v in allowed_by[src_subj].items() if k not in drop}
        rows = {}
        for k in range(0, len(ids), 20):
            for x in get('questions', {'select': 'id,unit,question_number,source_db_id,content_xml,equation_scripts', 'id': f'in.({",".join(ids[k:k + 20])})'}): rows[x['id']] = x
        groups = [(allowed, [q for q in ids if not rows[q]['unit']])]
        if u.get('step_subj'):   # [11/8] 모의고사: 묶음(공통·확통…)마다 허용 단원이 다르다 — ids 는 파일 순서 = 번호 순서
            groups = []; pos = 0
            for x, a, c in u['steps']:
                part = ids[pos:pos + (c - a + 1)]; pos += c - a + 1
                al = {}
                for sj in u['step_subj'][x]: al.update(allowed_by[sj])
                groups.append((al, [q for q in part if not rows[q]['unit']]))
        for allowed, todo in groups:
          for k in range(0, len(todo), 60):
            n += 1; chunk = todo[k:k + 60]
            json.dump({'subject_group': u['subject'], 'allowed': allowed, 'questions': [{'id': q} for q in chunk]},
                      open(f'tagjobs_tb/job_{n:02d}.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
            lines = ['허용 단원과 태그 (단원: 태그들):'] + [f'- {un}: {", ".join(t)}' for un, t in allowed.items()] + ['', '문항 (id | 교재 위치 | 번호 | 본문):']
            for q in chunk:
                x = rows[q]; xml = x['content_xml'] or ''
                sol = ' '.join(clean(m) for m in re.findall(r'<ENDNOTE[\s\S]*?</ENDNOTE>', xml, re.I))
                prob = clean(re.sub(r'<ENDNOTE[\s\S]*?</ENDNOTE>', ' ', xml, flags=re.I))
                lines.append(f"{q} | {x['source_db_id']} | {x['question_number']} | [문제] {prob[:1500]} [해설] {sol[:900]} [수식] {' | '.join(x.get('equation_scripts') or [])[:600]}")
            open(f'tagjobs_tb/job_{n:02d}.txt', 'w', encoding='utf-8').write('\n'.join(lines))
            meta[f'{n:02d}'] = (u['unit'], len(chunk))
    print('묶음', n, meta)


def finish():
    st = load(); M = json.load(open('scratch_manual_tags.json', encoding='utf-8'))
    for u in units():
        b = u['base']; s = st.get(b, {}); ids = s.get('idorder') or []
        if not (ids and s.get('cap')): print(f'⏭ {b}: prep 미완'); continue
        print(f"===== {u['book']} > {u['unit']}")
        miss = [i for i in ids if i not in M]
        if miss: print(f'  ✗ 태그 없음 {len(miss)}문항'); continue
        if u.get('step_subj'):   # [11/8] 모의고사: 과목을 묶음·단원대로 고친 뒤 AI(임베딩) — 공통은 단원이 대수 목록에 있으면 대수, 아니면 미적분I
            ab = json.load(open('scratch_allowed_by_subject.json', encoding='utf-8')); pos = 0
            for x, a, c in u['steps']:
                part = ids[pos:pos + (c - a + 1)]; pos += c - a + 1; sjs = u['step_subj'][x]
                for q in part:
                    sj = next((s for s in sjs if M[q]['unit'] in ab[s]), sjs[-1])
                    req('PATCH', '/rest/v1/questions', headers=HJ, params={'id': f'eq.{q}'}, json={'subject': sj})
        for x, a, c in u['steps']:
            src = f"{u['book']} > {u['unit']} > {x}"
            code, out = run([NPX, 'tsx', 'scratch_batch_ai.ts', src, u['step_subj'][x][0] if u.get('step_subj') else u['subject']])
            m = re.search(r'AI_RESULT ok=(\d+) skip=(\d+) fail=(\d+)', out)
            print(f'  AI {src}: {m.group(0) if m else out[-200:]}')
        full = {}
        for k in range(0, len(ids), 20):
            for x in get('questions', {'select': 'id,unit,difficulty,embedding_statement,embedding,work_status', 'id': f'in.({",".join(ids[k:k + 20])})'}): full[x['id']] = x
        # [10/26] 발문이 20자 미만이면 batch_ai 가 발문 임베딩을 일부러 안 만든다(교과서 경우의 수 8번) — 일반 임베딩이 있으면 통과
        bad = [i + 1 for i, q in enumerate(ids) if not (full[q]['unit'] and full[q]['difficulty'] not in (None, '') and (full[q]['embedding_statement'] or full[q]['embedding']))]
        leak = [q for q in ids if full[q]['work_status'] not in ('pending', 'private')]
        if leak: print(f'  ⛔ pending/private 아닌 문항 {len(leak)}개 — 공개됐을 수 있음')
        if bad: print(f'  ✗ AI 데이터 불완전 파일순서 {bad[:10]}'); continue
        # [10/7 사장님 지시] 등록 끝에 pending → private. 운영 사이트는 pending 문항을 id 로 요청하면 내용을 돌려준다(by-ids·images·predict),
        #   private 는 막혀 있다. 연결된 회원이 없으면 private 도 아무에게도 안 보인다. ⛔ 절대 sorted 로 바꾸지 말 것(sorted = 공개).
        #   여러 줄 PATCH 는 statement timeout(57014) → 한 줄씩, 조건에 work_status=eq.pending 을 같이 걸어 다른 상태는 안 건드린다.
        from concurrent.futures import ThreadPoolExecutor
        todo = [q for q in ids if full[q]['work_status'] == 'pending']
        def to_private(q):
            return req('PATCH', '/rest/v1/questions', headers=HJ, params={'id': f'eq.{q}', 'work_status': 'eq.pending'}, json={'work_status': 'private'}).status_code
        with ThreadPoolExecutor(4) as ex: codes = list(ex.map(to_private, todo))
        after = {}
        for k in range(0, len(ids), 20):
            for x in get('questions', {'select': 'id,work_status', 'id': f'in.({",".join(ids[k:k + 20])})'}): after[x['id']] = x['work_status']
        s['done'] = True; save(st)
        print(f'  완료: {len(ids)}문항 · private 전환 {sum(1 for c in codes if c < 300)}건 · 상태 {sorted(set(after.values()))}')


def replace():
    """[10/8] 등록 완료(done) 단원의 HML 이 try/ 에 다시 들어오면 = 수정본 → id 유지 교체(사장님 지시, 묻지 않는다).
    scratch_textbook_replace.ts 가 내용·그림 교체(work_status 안 건드림), 여기서 크롭 폴더를 지우고 cap/done 을 내려
    prep(새 크롭·캡쳐) → export(바뀐 문항만 단원 비어 있음) → 소넷 태깅 → finish 로 이어지게 한다. --dry 면 바뀐 문항 수만 본다."""
    import shutil, tempfile
    dry = '--dry' in sys.argv
    st = load(); M = json.load(open('scratch_manual_tags.json', encoding='utf-8'))
    for u in units():
        b = u['base']; s = st.get(b, {})
        if not s.get('done'): continue
        spec = ','.join(f'{x}:{a}-{c}' for x, a, c in u['steps'])
        idf = os.path.join(tempfile.gettempdir(), f'tb_ids_{zlib.crc32(b.encode()):08x}.txt')
        open(idf, 'w', encoding='utf-8').write(','.join(s['idorder']))
        code, out = run([NPX, 'tsx', 'scripts_patched/scratch_textbook_replace.ts', f'try/{b}.hml', idf, spec] + (['--dry'] if dry else []))
        info = next((l for l in out.splitlines() if l.startswith('기존 ')), '')
        m = re.search(r'CHANGED=(\S*)', out)
        print(f"===== {u['book']} > {u['unit']}: {info or out[-300:]}")
        if dry or not m or 'REPLACED=' not in out: continue
        changed = [x for x in m.group(1).split(',') if x]
        for q in changed: M.pop(q, None)
        json.dump(M, open('scratch_manual_tags.json', 'w', encoding='utf-8'), ensure_ascii=False)
        if s.get('crop'): shutil.rmtree(os.path.join('hwpx-python-tool', s['crop']), ignore_errors=True)
        s['cap'] = False; s['done'] = False; s['replaced'] = time.strftime('%m-%d %H:%M'); save(st)
        print(f'  교체 완료 · 재태깅 대상 {len(changed)}문항 · 크롭 폴더 삭제 → prep 으로 캡쳐 다시')


ONLY = sys.argv[sys.argv.index('--only') + 1] if '--only' in sys.argv else None
{'prep': prep, 'export': export, 'finish': finish, 'replace': replace}[sys.argv[1]]()
