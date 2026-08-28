# -*- coding: utf-8 -*-
"""
시험지 중복 URL → 대표 URL 매핑 생성 (src/lib/exam-redirects.json).

한 시험 회차가 exam_materials 3행(PDF·해설 / HWP·해설 / 개인DB)으로 나뉘어
각각 /exam/{id} 페이지를 갖는다. 본문 유사도 실측 HWP vs 개인DB 99.6%.
구글이 중복으로 보고 색인 500페이지를 '크롤링됨 - 현재 색인이 생성되지 않음'으로 옮겼다(2026-08-29 진단).
→ 비대표를 대표(PDF·해설)로 영구 이동시켜 '회차 1개 = URL 1개'로 만든다. 미들웨어가 이 파일을 읽는다.

⚠ 페이지에서 permanentRedirect() 를 쓰면 안 된다.
  Next 14.2 의 ISR 캐시가 리다이렉트를 저장하며 Location 헤더를 잃는다(실측: 2회차부터 갈 곳 없는 308).
  빌드 프리렌더도 마찬가지고, noStore() 는 generateStaticParams 가 있는 라우트라 500이 난다.
  그래서 캐시 밖인 미들웨어에서 처리한다.

⚠ 자료를 등록하면 회차가 늘어난다. 등록 배치가 끝날 때 이 스크립트를 돌리고 배포해야 한다.
  매핑이 낡아도 그 URL 이 200 으로 남을 뿐(현 상태와 동일) 잘못된 이동은 생기지 않는다.

사용:
    python scripts/gen_exam_redirects.py            # 생성 + 검증
    python scripts/gen_exam_redirects.py --check    # 생성하지 않고 현재 파일이 최신인지만 확인
"""
import os, re, sys, json, collections
import sys as _stdio_sys
# Windows: 출력이 파이프/파일이면 stdout 이 cp949 가 되어 이모지·em dash 에서 즉사한다.
try: _stdio_sys.stdout.reconfigure(encoding='utf-8', errors='replace', line_buffering=True)
except Exception: pass

import requests
import urllib3 as _u; _u.disable_warnings()
_o = requests.Session.request
requests.Session.request = lambda self, *a, **k: _o(self, *a, **{**k, 'verify': False})

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src', 'lib', 'exam-redirects.json')


def load_env():
    env = {}
    with open(os.path.join(ROOT, '.env.local'), encoding='utf-8') as f:
        for line in f:
            m = re.match(r'^\s*([\w.-]+)\s*=\s*(.*)\s*$', line)
            if m: env[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    return env


ENV = load_env()
URL = ENV['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/')
H = {'apikey': ENV['SUPABASE_SERVICE_ROLE_KEY'],
     'Authorization': 'Bearer ' + ENV['SUPABASE_SERVICE_ROLE_KEY']}

COLS = 'id,school,exam_year,grade,semester,exam_type,subject,file_type,content_type'


def fetch_all():
    """⚠ PostgREST 는 range() 없이는 1,000행에서 조용히 잘린다."""
    out, off = [], 0
    while True:
        r = requests.get(f'{URL}/rest/v1/exam_materials',
                         headers={**H, 'Range': f'{off}-{off+999}'},
                         params=[('select', COLS), ('school', 'neq.DELETED')], timeout=120)
        b = r.json()
        if not isinstance(b, list) or not b: break
        out += b
        if len(b) < 1000: break
        off += 1000
    return out


def build(rows):
    key = lambda x: (x['school'], x['exam_year'], x['grade'], x['semester'], x['exam_type'], x['subject'])
    groups = collections.defaultdict(list)
    for x in rows:
        groups[key(x)].append(x)
    mapping = {}
    no_rep = 0
    for k, l in groups.items():
        # 대표 = PDF·해설. 여러 개면 id 순으로 결정(빌드마다 같은 결과가 나오게).
        reps = sorted([y for y in l if y['file_type'] == 'PDF' and y['content_type'] == '해설'],
                      key=lambda y: y['id'])
        if not reps:
            no_rep += 1           # 그 회차의 유일 자료 → 그대로 둔다(모의고사 개인DB 등)
            continue
        for y in l:
            if y['id'] != reps[0]['id']:
                mapping[y['id']] = reps[0]['id']
    return mapping, len(groups), no_rep


def verify(mapping, rows):
    """배포 전 무결성 — 하나라도 걸리면 생성하지 않는다."""
    byid = {x['id']: x for x in rows}
    key = lambda x: (x['school'], x['exam_year'], x['grade'], x['semester'], x['exam_type'], x['subject'])
    srcs, tgts = set(mapping), set(mapping.values())
    problems = []
    self_ref = [s for s, t in mapping.items() if s == t]
    chain = srcs & tgts
    loop = [s for s, t in mapping.items() if mapping.get(t) == s]
    mismatch = [s for s, t in mapping.items() if key(byid[s]) != key(byid[t])]
    bad_tgt = [t for t in tgts if not (byid[t]['file_type'] == 'PDF' and byid[t]['content_type'] == '해설')]
    for name, lst in [('자기지시', self_ref), ('체인', list(chain)), ('루프', loop),
                      ('회차 불일치', mismatch), ('타깃이 대표 아님', bad_tgt)]:
        if lst: problems.append(f'{name} {len(lst)}건 (예: {lst[:2]})')
    return problems


rows = fetch_all()
mapping, n_groups, no_rep = build(rows)
problems = verify(mapping, rows)

print(f'자료 {len(rows):,}행 · 회차 {n_groups:,}개 · 매핑 {len(mapping):,}건')
print(f'  대표(PDF·해설) 없는 회차: {no_rep}개 → 그대로 둠')
if problems:
    print('\n⛔ 무결성 실패 — 파일을 쓰지 않는다:')
    for p in problems: print(f'   {p}')
    sys.exit(1)
print('  무결성: 자기지시·체인·루프·회차불일치·타깃오류 모두 0건 ✅')

new = json.dumps(mapping, ensure_ascii=False, separators=(',', ':'), sort_keys=True)
old = open(OUT, encoding='utf-8').read() if os.path.exists(OUT) else ''

if '--check' in sys.argv:
    print('\n' + ('최신 상태입니다.' if new == old else f'⚠ 갱신 필요 (현재 {len(json.loads(old or "{}")):,}건 → {len(mapping):,}건)'))
    sys.exit(0 if new == old else 1)

if new == old:
    print('\n변경 없음 — 파일 그대로.')
else:
    with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write(new)
    before = len(json.loads(old)) if old else 0
    print(f'\n{OUT} 갱신: {before:,} → {len(mapping):,}건 ({os.path.getsize(OUT):,}바이트)')
    print('⚠ 반영하려면 배포가 필요합니다 (미들웨어가 이 파일을 번들에 담는다).')
