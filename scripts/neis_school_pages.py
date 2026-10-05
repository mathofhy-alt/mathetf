# -*- coding: utf-8 -*-
"""자료 없는 학교 페이지용 NEIS 데이터 수집 (2026-10-05 · 100곳 시험).

왜: 원본 시험지 제보를 모으려고 '시험지가 아직 없는 학교'에도 학교 페이지를 연다.
    빈 페이지(얇은 페이지)가 되지 않도록 학교마다 실제로 다른 정보를 NEIS 에서 받아 채운다.
      · 학사일정 → 이번 학년도 지필평가(중간·기말) 날짜
      · 고등학교 시간표 → 학년별 수학 과목과 주당 시수
      · 학급정보 → 학년별 학급 수
    출력: src/lib/neis-school-pages.json  { 학교명: {...} }  — 학교 페이지(/school/[이름])가 읽는다.

대상(기본): 우리 DB 에 자료가 없고, 서울·경기·인천, 특성화고·동명이교 제외, 네이버 월간 검색량 상위 N곳(--limit, 기본 100).
사용:
    python scripts/neis_school_pages.py               # 100곳
    python scripts/neis_school_pages.py --limit 300
    python scripts/neis_school_pages.py --only 봉담고등학교
⚠ NEIS 인증키는 .env.local 의 NEIS_API_KEY. 학교가 일정을 수시로 올리므로 주 1회쯤 다시 돌린다.
"""
import os, re, sys, csv, json, time, argparse, datetime, statistics
from collections import defaultdict, Counter
import requests
import urllib3

try: sys.stdout.reconfigure(encoding='utf-8', errors='replace', line_buffering=True)
except Exception: pass
urllib3.disable_warnings()

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
env = {}
for line in open(os.path.join(ROOT, '.env.local'), encoding='utf-8'):
    m = re.match(r'^\s*([\w.-]+)\s*=\s*(.*)\s*$', line)
    if m: env[m.group(1)] = m.group(2).strip().strip('"').strip("'")
KEY = env['NEIS_API_KEY']
SB = env['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/')
SH = {'apikey': env['SUPABASE_SERVICE_ROLE_KEY'], 'Authorization': 'Bearer ' + env['SUPABASE_SERVICE_ROLE_KEY']}
OUT = os.path.join(ROOT, 'src', 'lib', 'neis-school-pages.json')

AY = 2026                                   # 학년도
MATH = re.compile(r'수학|대수|미적분|기하|확률과 ?통계')
EXAM = re.compile(r'고사|지필|정기시험|정기 시험')
NOT_EXAM = re.compile(r'모의|학력평가|연합|수능|수학능력|모평|대학'      # 전국연합·모의평가는 학교 시험이 아니다
                      r'|실기|이의신청|원서|접수|발표|성적|채점|결과|확인|설명회|연수|선서')   # 예고 실기고사·이의신청 기간 등 (10/5 점검)


def neis(api, **p):
    for t in range(3):
        try:
            r = requests.get(f'https://open.neis.go.kr/hub/{api}', params={'KEY': KEY, 'Type': 'json', 'pSize': 1000, **p}, timeout=60, verify=False).json()
            return r[api][1]['row'] if api in r else []
        except Exception:
            time.sleep(1 + t)
    return []


def db_schools():
    names = set()
    for off in range(0, 50000, 1000):
        r = requests.get(f'{SB}/rest/v1/exam_materials', headers=SH, params={'select': 'school', 'content_type': 'neq.원본제보', 'order': 'id', 'offset': off, 'limit': 1000}, verify=False).json()
        names.update(x['school'] for x in r if x.get('school'))
        if len(r) < 1000: break
    return names


def exam_periods(rows):
    """학사일정 → [{sem, name, grades, start, end}] — 같은 이름의 연속 날짜를 한 기간으로 묶는다"""
    ev = sorted((x['AA_YMD'], x['EVENT_NM'].strip()) for x in rows if EXAM.search(x['EVENT_NM']) and not NOT_EXAM.search(x['EVENT_NM']))
    out = []
    for ymd, name in ev:
        d = datetime.date(int(ymd[:4]), int(ymd[4:6]), int(ymd[6:]))
        g = re.search(r'\(([\d,\s·학년]+)\)', name)
        grades = sorted({int(n) for n in re.findall(r'[123]', g.group(1))}) if g else []
        # '중간고사 1일', '기말고사 3일차' 처럼 날마다 따로 올리는 학교가 있다 → 'N일' 을 떼고 한 기간으로 묶는다
        name = re.sub(r'\s*\d+\s*일(차)?$', '', name.strip())
        name = re.sub(r'[①-⑳]+', '', name)                     # '기말고사①②③'
        name = re.sub(r'(\d차)(?=\S)', r'\1 ', name).strip()    # '2차정기시험' → '2차 정기시험' (같은 시험이 두 이름으로 갈리지 않게)
        base = re.sub(r'\s*\([^)]*\)\s*', '', name).replace(' ', '')
        if out and out[-1]['_key'] == (base, tuple(grades)) and (d - out[-1]['_end']).days <= 4:
            out[-1]['_end'] = d; continue
        out.append({'_key': (base, tuple(grades)), '_start': d, '_end': d, 'name': re.sub(r'\s*\([^)]*\)\s*', '', name).strip(), 'grades': grades})
    res = []
    for p in out:
        sem = 1 if 3 <= p['_start'].month <= 7 else 2
        res.append({'sem': sem, 'name': p['name'], 'grades': p['grades'], 'start': p['_start'].isoformat(), 'end': p['_end'].isoformat()})
    return res


# 시간표 과목명엔 반·분반 표시가 붙는다('미적분C미적', '확률과 통계B-1') → 표준 과목명으로 (긴 것부터 앞머리 일치)
CANON = sorted(['공통수학1', '공통수학2', '기본수학1', '기본수학2', '대수', '미적분Ⅰ', '미적분Ⅱ', '미적분', '확률과 통계', '기하', '기하와 벡터',
                '경제 수학', '인공지능 수학', '실용 통계', '수학과 문화', '수학과제 탐구', '직무 수학', '실용 수학', '고급 대수', '고급 미적분',
                '고급 기하', '고급 수학Ⅰ', '고급 수학Ⅱ', '전문 수학', '이산 수학', '수학Ⅰ', '수학Ⅱ', '수학'], key=lambda x: -len(x.replace(' ', '')))
def canon(subj):
    subj = re.sub(r'^\[[^\]]*\]\s*', '', subj)   # '[보강]확률과 통계' 같은 앞 표시
    k = subj.replace(' ', '').replace('I', 'Ⅰ').replace('II', 'Ⅱ')
    for c in CANON:
        if k.startswith(c.replace(' ', '')): return c
    return re.sub(r'[A-Za-z0-9\-]+$', '', subj).strip() or subj

def math_subjects(rows):
    """시간표(평소 2주) → {학년: [{subject, hours, elective}]} — 반마다 주당 시수, 일부 반만 들으면 선택 과목"""
    per = defaultdict(lambda: defaultdict(Counter))   # grade → subject → class → 시수(2주)
    classes = defaultdict(set)
    for x in rows:
        g, cls, subj = str(x.get('GRADE')), x.get('CLRM_NM') or x.get('CLASS_NM'), (x.get('ITRT_CNTNT') or '').strip()
        subj = re.sub(r'^(중간고사|기말고사|지필평가)\s*', '', subj)
        if not subj: continue
        if MATH.search(subj): subj = canon(subj)
        classes[g].add(cls)
        if MATH.search(subj): per[g][subj][cls] += 1
    out = {}
    for g in sorted(per):
        items = []
        for subj, byc in per[g].items():
            hours = round(statistics.median(byc.values()) / 2)   # 2주 → 주당
            if hours < 1: continue
            items.append({'subject': subj, 'hours': hours, 'elective': len(byc) < max(1, len(classes[g])) * 0.8})
            # 같은 표준 과목이 분반 표시로 여러 줄이던 것은 위 canon 에서 합쳐졌다
        if items: out[g] = sorted(items, key=lambda i: (i['elective'], -i['hours'], i['subject']))
    return out


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--limit', type=int, default=100); ap.add_argument('--only', action='append'); a = ap.parse_args()
    schools = json.load(open(os.path.join(ROOT, 'src', 'lib', 'neis-high-schools.json'), encoding='utf-8'))['schools']
    by_name = defaultdict(list)
    for s in schools: by_name[s['name']].append(s)
    vol = {r['학교명']: int(r['월간합계'] or 0) for r in csv.DictReader(open(os.path.join(ROOT, '학교검색량_0731.csv'), encoding='utf-8-sig'))}
    have = db_schools()
    norm = lambda n: n.replace(' ', '')
    have_n = {norm(n) for n in have}

    if a.only:
        targets = [by_name[n][0] for n in a.only if by_name.get(n)]
    else:
        cand = [s for s in schools if s['region'] in ('서울', '경기', '인천') and s['kind'] != '특성화고' and '마이스터' not in s['name']
                and len(by_name[s['name']]) == 1                       # 동명이교는 주소(/school/이름)가 겹쳐 이번엔 뺀다
                and norm(s['name']) not in have_n
                and not any(norm(h).endswith(norm(s['name'])) and len(h) > len(s['name']) for h in have)]   # 지역 접두로 등록된 학교
        cand.sort(key=lambda s: -vol.get(s['name'], 0))
        targets = cand[:a.limit]
    print(f'[대상] {len(targets)}곳 (검색량 {vol.get(targets[-1]["name"], 0) if targets else 0} 이상)')

    out = {}
    for i, s in enumerate(targets, 1):
        base = {'ATPT_OFCDC_SC_CODE': s['office'], 'SD_SCHUL_CODE': s['code']}
        sch = neis('SchoolSchedule', **base, AA_FROM_YMD=f'{AY}0301', AA_TO_YMD=f'{AY + 1}0228')
        # 평소 2주(9/7~18). 9/14~25 는 추석(9/24~26)이 끼어 시수가 낮게 나왔다
        tt = neis('hisTimetable', **base, AY=str(AY), SEM='2', TI_FROM_YMD=f'{AY}0907', TI_TO_YMD=f'{AY}0918')
        ci = neis('classInfo', **base, AY=str(AY))
        rec = {**{k: s[k] for k in ('name', 'region', 'district', 'code', 'kind', 'fond', 'coedu')},
               'classes': dict(Counter(str(x['GRADE']) for x in ci)),
               'exams': exam_periods(sch), 'math': math_subjects(tt),
               'searchVolume': vol.get(s['name'], 0)}
        rec['unique'] = bool(rec['exams'] or rec['math'])     # 고유 정보가 하나도 없으면 페이지가 noindex
        out[s['name']] = rec
        print(f'  [{i}/{len(targets)}] {s["name"]} {s["region"]} {s["district"]} · 시험 {len(rec["exams"])} · 수학과목 {sum(len(v) for v in rec["math"].values())} · 학급 {rec["classes"]}')
        time.sleep(0.15)
    payload = {'source': 'NEIS 학사일정·고등학교 시간표·학급정보 (open.neis.go.kr)', 'academicYear': AY,
               'fetchedAt': datetime.date.today().isoformat(), 'schools': out}
    json.dump(payload, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'저장 {OUT} · {len(out)}곳 · 고유정보 없음 {sum(1 for r in out.values() if not r["unique"])}곳')
    print(f'완료: 성공 {len(out)} / 실패 0')


if __name__ == '__main__':
    main()
