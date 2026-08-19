# -*- coding: utf-8 -*-
"""
[모의고사 정합성 감사] 회차·과목 단위로 구조 결함을 찾는다.

배경(8/18 사고): 5월 확통 문항 8개가 '3월 모의고사_미적분II' source_db_id 로 등록돼
  ①5월 확통이 통째로 비고 ②3월 확통이 16문항으로 부풀고 ③미적분II DB를 사면 확통이 나왔다.
  등록 단계에 문항수·과목 검증이 없어 아무도 몰랐다.

검사 항목:
  A. source_db_id 의 과목명 ↔ 실제 문항 subject 불일치
  B. 회차 문항수 규격 (전국연합 고3: 공통 22 + 선택 8 / 사관·경찰대: 회차별 상수)
  C. 서로 다른 회차에 본문이 동일한 문항 (사본 유입)
  D. 개인DB 는 있는데 문항이 0개인 회차

사용: python scratch_mock_audit.py [--deep]   (--deep 이면 C 검사까지)
"""
import re, sys, difflib
from collections import Counter, defaultdict
import requests
import urllib3 as _u; _u.disable_warnings()

env = {}
for line in open('.env.local', encoding='utf-8'):
    m = re.match(r'^\s*([\w.-]+)\s*=\s*(.*)\s*$', line)
    if m: env[m.group(1)] = m.group(2).strip().strip('"').strip("'")
URL = env['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/')
H = {'apikey': env['SUPABASE_SERVICE_ROLE_KEY'], 'Authorization': 'Bearer ' + env['SUPABASE_SERVICE_ROLE_KEY']}
DEEP = '--deep' in sys.argv
SPECIAL = {'전국연합', '사관학교', '경찰대학교', '육군사관학교', '해군사관학교', '공군사관학교', '국군간호사관학교'}
SELECTIVE = {'확률과통계', '확률과 통계', '미적분II', '미적분', '기하와벡터'}
# 과목 별칭 — '기하'와 '기하와벡터', '미적분'과 '미적분II' 는 같은 과목이다(오탐 방지)
ALIAS = {'기하': '기하와벡터', '미적분': '미적분II', '확률과통계': '확률과통계', '확률과 통계': '확률과통계'}
def canon(s0):
    s0 = (s0 or '').replace(' ', '')
    return ALIAS.get(s0, s0)


def fa(t, p):
    o, f = [], 0
    while True:
        r = requests.get(f'{URL}/rest/v1/{t}', headers={**H, 'Range': f'{f}-{f+999}'}, params=p, verify=False, timeout=120)
        if r.status_code not in (200, 206): break
        d = r.json()
        if not d: break
        o += d
        if len(d) < 1000: break
        f += 1000
    return o


qs_all = fa('questions', {'select': 'id,question_number,subject,school,year,semester,grade,source_db_id,plain_text,work_status',
                          'school': f"in.({','.join(SPECIAL)})", 'work_status': 'eq.sorted'})
# 변형문제(source_db_id 에 '변형')는 원본과 같은 회차로 잡혀 문항수를 2배로 보이게 한다 → 분리
qs = [q for q in qs_all if '변형' not in str(q.get('source_db_id') or '')]
variants = len(qs_all) - len(qs)
print(f'모의고사·특수 문항 {len(qs)}개 점검\n')

by_src = defaultdict(list)
for q in qs:
    by_src[q['source_db_id']].append(q)

issues = []

# ── A. source_db_id 과목명 ↔ 실제 subject ──
for src, g in sorted(by_src.items()):
    if not src: continue
    m = re.search(r'_([^_]+)$', src)
    if not m: continue
    declared = canon(m.group(1))
    # '수학'처럼 과목을 특정하지 않는 포괄 선언(경찰대·사관 전과목)은 검사 대상이 아니다
    # 'A형'·'B형'·'가형'·'나형'은 과목이 아니라 시험지 유형 구분(2014~ 수준별 시험)
    if declared in ('전과목', '전과정', '공통(수1,수2)', '수학') or re.fullmatch(r'[A-B가나]형', declared): continue
    actual = Counter(canon(q['subject']) for q in g if q.get('subject'))
    bad = {k: v for k, v in actual.items() if k != declared and k not in ('대수', '미적분I')}
    if bad:
        issues.append(('A', src, f'선언 과목 "{declared}" 인데 실제 {dict(bad)}'))

# ── B. 전국연합 고3 회차 규격 ──
rounds = defaultdict(lambda: Counter())
for q in qs:
    if q['school'] != '전국연합' or q.get('grade') != '고3': continue
    mon = re.match(r'(\d+)월', str(q.get('semester') or ''))
    if not mon: continue
    rounds[(q['year'], mon.group(1))][canon(q['subject'])] += 1
for (yr, mon), c in sorted(rounds.items()):
    common = c.get('대수', 0) + c.get('미적분I', 0)
    sel = {k: v for k, v in c.items() if k in {canon(x) for x in SELECTIVE}}
    probs = []
    if common and common != 22: probs.append(f'공통 {common}(정상22)')
    for k, v in sel.items():
        if v != 8: probs.append(f'{k} {v}(정상8)')
    if probs:
        issues.append(('B', f'전국연합 {yr} {mon}월 고3', ' / '.join(probs)))

# ── B2. 고1·고2 회차: 한 source_db_id 안에 학년이 섞였거나 번호가 중복되는지 ──
# (8/18 발견: 2023 6월 고2 에 구버전 15문항 + 2022 문항 15개가 섞여 중복 23개로 노출됐고,
#  2022 6월 고2 는 문항이 통째로 다른 source_db_id 에 들어가 0건이었다. 고3만 보던 검사로는 못 잡음)
from collections import defaultdict as _dd
bysrc = _dd(lambda: _dd(list))
for q in qs:
    if q.get('grade') in ('고1', '고2'):
        bysrc[q['source_db_id']][q['grade']].append(q['question_number'])
for src, by in sorted(bysrc.items()):
    for gr, nums in by.items():
        d = len(nums) - len(set(nums))
        if d:
            issues.append(('B2', f'{src} [{gr}]', f'문항번호 중복 {d}개 (총 {len(nums)}문항)'))

# ── D. 개인DB 는 있는데 문항 0 ──
mats = fa('exam_materials', {'select': 'title,school,exam_year,semester,exam_type,subject,grade',
                             'school': f"in.({','.join(SPECIAL)})", 'content_type': 'eq.개인DB'})
for m0 in mats:
    subj = m0.get('subject')
    if not subj or subj == '전과정': continue
    hit = [q for q in qs if q['school'] == m0['school'] and str(q['year']) == str(m0['exam_year'])
           and canon(q.get('subject')) == canon(subj)]
    if not hit:
        issues.append(('D', m0['title'], '판매 중인데 해당 과목 문항 0개'))

# ── C. 회차 간 본문 중복 (--deep) ──
if DEEP:
    seen = {}
    for q in qs:
        t = re.sub(r'\s+', '', (q.get('plain_text') or ''))[:400]
        if len(t) < 80: continue
        if t in seen:
            o = seen[t]
            if o['source_db_id'] != q['source_db_id']:
                issues.append(('C', f"{o['source_db_id']} {o['question_number']}번",
                               f"↔ {q['source_db_id']} {q['question_number']}번 본문 동일"))
        else:
            seen[t] = q

if not issues:
    print('✅ 이상 없음')
else:
    for code, where, what in issues:
        label = {'A': '과목불일치', 'B': '문항수', 'B2': '번호중복', 'C': '본문중복', 'D': '빈DB'}[code]
        print(f'  ⚠ [{label}] {where}\n      {what}')
print(f'\nAUDIT_ISSUES={len(issues)}')
