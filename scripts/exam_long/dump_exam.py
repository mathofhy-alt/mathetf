"""시험지 장문 분석용 자료 뽑기: python dump_exam.py <exam_materials.id ...> → scripts/exam_long/data/<id>.json
숫자(문항 수·난이도·단원)는 여기서 다 세어 둔다 — 글쓴이는 세지 말고 이 값만 쓴다."""
import json, sys, os, re, urllib.request, urllib.parse, collections
sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.abspath(__file__))
env = {}
for l in open(os.path.join(ROOT, '..', '..', '.env.local'), encoding='utf-8'):
    if '=' in l and not l.startswith('#'):
        k, v = l.strip().split('=', 1); env[k] = v.strip('"')
U = env['NEXT_PUBLIC_SUPABASE_URL']; K = env['SUPABASE_SERVICE_ROLE_KEY']
def q(p):
    return json.load(urllib.request.urlopen(urllib.request.Request(U + '/rest/v1/' + p, headers={'apikey': K, 'Authorization': 'Bearer ' + K})))
band = lambda d: '쉬움' if d <= 2 else '보통' if d <= 4 else '어려움'   # 사이트 시험지 상세와 같은 구간
SEM = {1: '1학기', 2: '2학기'}

def src_of(ex):
    return f"{ex['school']}_{ex['exam_year']}_{SEM.get(ex['semester'], ex['semester'])}{(ex['exam_type'] or '')[:2]}_{ex['subject']}"


def summary_of(qs):
    """문항 목록 → 비교용 요약(번호·난이도·단원만)."""
    qs = sorted(qs, key=lambda x: x['question_number'] or 0)
    bands = collections.OrderedDict((b, [x['question_number'] for x in qs if band(int(x['difficulty'] or 0)) == b]) for b in ('쉬움', '보통', '어려움'))
    units = collections.defaultdict(list)
    for x in qs: units[x['unit']].append(x['question_number'])
    return {'total': len(qs), 'written': [x['question_number'] for x in qs if x['question_type'] != 'multiple_choice'],
            'bands': bands, 'units': dict(sorted(units.items(), key=lambda kv: -len(kv[1])))}


def prev_year(ex):
    """같은 학교·학년·학기·시험 종류의 작년 시험(과목은 교육과정 개편으로 다를 수 있음)."""
    rows = q('exam_materials?select=id,school,exam_year,grade,semester,exam_type,subject,preview_urls&school=eq.' + urllib.parse.quote(ex['school'])
             + f"&exam_year=eq.{ex['exam_year'] - 1}&grade=eq.{ex['grade']}&semester=eq.{ex['semester']}&exam_type=eq." + urllib.parse.quote(ex['exam_type'])
             + '&file_type=eq.PDF&content_type=eq.%ED%95%B4%EC%84%A4')
    rows = [r for r in rows if r['preview_urls']]
    rows.sort(key=lambda r: r['subject'] != ex['subject'])   # 같은 과목 먼저
    for r in rows:
        qs = q('questions?select=question_number,unit,difficulty,question_type&source_db_id=eq.' + urllib.parse.quote(src_of(r)) + '&limit=200')
        if qs:
            return {'exam_id': r['id'], 'year': r['exam_year'], 'subject': r['subject'], 'same_subject': r['subject'] == ex['subject'], **summary_of(qs)}
    return None


def region_peers(ex, total, written, hard):
    """[10/23 대표 1번] 같은 구(없으면 같은 시·도)에서 같은 연도·학년·학기·시험·과목을 치른 다른 학교들.
    2개교 이상일 때만 돌려준다. 숫자는 여기서 다 계산해 두고 글쓴이는 해석만 한다."""
    base = ('exam_materials?select=id,school,exam_year,grade,semester,exam_type,subject,district,preview_urls'
            f"&exam_year=eq.{ex['exam_year']}&grade=eq.{ex['grade']}&semester=eq.{ex['semester']}"
            '&exam_type=eq.' + urllib.parse.quote(ex['exam_type']) + '&subject=eq.' + urllib.parse.quote(ex['subject'] or '')
            + '&file_type=eq.PDF&content_type=eq.%ED%95%B4%EC%84%A4&school=neq.' + urllib.parse.quote(ex['school']))
    for scope, filt in (('구', 'district'), ('시도', 'region')):
        if not ex.get(filt): continue
        # ⚠ '중구'·'남구'·'동구'는 여러 시에 있다 — 구 단위는 시·도까지 같아야 한다(10/23 경북여고 표에 서울 중구가 섞였던 일)
        extra = ('&region=eq.' + urllib.parse.quote(ex['region'] or '')) if filt == 'district' else ''
        rows = [r for r in q(base + f'&{filt}=eq.' + urllib.parse.quote(ex[filt]) + extra) if r['preview_urls']]
        peers, seen = [], set()
        for r in rows:
            if r['school'] in seen or len(peers) >= 10: continue
            qs = q('questions?select=question_number,unit,difficulty,question_type&source_db_id=eq.' + urllib.parse.quote(src_of(r)) + '&limit=200')
            if not qs: continue
            sm = summary_of(qs); seen.add(r['school'])
            peers.append({'school': r['school'], 'exam_id': r['id'], 'district': r['district'], 'total': sm['total'],
                          'written': len(sm['written']), 'hard': len(sm['bands']['어려움']),
                          'hard_pct': round(len(sm['bands']['어려움']) * 100 / sm['total']),
                          'top_unit': next(iter(sm['units']), None)})
        if len(peers) >= 2:
            me_pct = round(hard * 100 / total)
            allp = sorted([p['hard_pct'] for p in peers] + [me_pct], reverse=True)
            return {'scope': scope, 'area': ex[filt], 'schools': len(peers), 'peers': peers,
                    'avg_total': round(sum(p['total'] for p in peers) / len(peers), 1),
                    'avg_written': round(sum(p['written'] for p in peers) / len(peers), 1),
                    'avg_hard_pct': round(sum(p['hard_pct'] for p in peers) / len(peers)),
                    'this_hard_pct': me_pct, 'this_rank_by_hard': allp.index(me_pct) + 1, 'rank_out_of': len(peers) + 1}
    return None


def dump(eid):
    ex = q(f'exam_materials?select=id,school,exam_year,grade,semester,exam_type,subject,region,district&id=eq.{eid}')[0]
    src = src_of(ex)
    qs = q('questions?select=question_number,unit,difficulty,key_concepts,question_type,plain_text,equation_scripts&source_db_id=eq.' + urllib.parse.quote(src) + '&limit=200')
    if not qs: raise SystemExit(f'{eid}: 문항 없음 ({src})')
    qs.sort(key=lambda x: x['question_number'] or 0)
    items = []
    for x in qs:
        sol = (x['plain_text'] or '')
        eqs = [e for e in (x['equation_scripts'] or [])][:40]
        items.append({'no': x['question_number'], 'unit': x['unit'], 'band': band(int(x['difficulty'] or 0)),
                      'kind': '객관식' if x['question_type'] == 'multiple_choice' else '서술·단답',
                      'concepts': [c.lstrip('#') for c in (x['key_concepts'] or [])],
                      'solution_text': sol[:1500], 'equations': eqs})
    bands = collections.OrderedDict((b, [i['no'] for i in items if i['band'] == b]) for b in ('쉬움', '보통', '어려움'))
    units = collections.defaultdict(list)
    for i in items: units[i['unit']].append(i['no'])
    mc = [i['no'] for i in items if i['kind'] == '객관식']
    # 같은 학교 다른 회차 비교값(어려움 비율)
    others = q('exam_materials?select=id,exam_year,grade,semester,exam_type,subject&school=eq.' + urllib.parse.quote(ex['school']) + '&file_type=eq.PDF&content_type=eq.%ED%95%B4%EC%84%A4')
    out = {'exam_id': eid, 'school': ex['school'], 'region': ex['region'], 'district': ex['district'],
           'year': ex['exam_year'], 'grade': ex['grade'], 'semester': ex['semester'], 'exam_type': ex['exam_type'], 'subject': ex['subject'],
           'facts': {'total': len(items), 'objective': mc, 'written': [i['no'] for i in items if i['kind'] != '객관식'],
                     'bands': bands, 'units': dict(sorted(units.items(), key=lambda kv: -len(kv[1]))),
                     'school_exam_count': len(others)},
           'previous_year': prev_year(ex),
           'questions': items}
    if WITH_PEERS:
        out['region_peers'] = region_peers(ex, len(items), len(out['facts']['written']), len(bands['어려움']))
    os.makedirs(os.path.join(ROOT, 'data'), exist_ok=True)
    json.dump(out, open(os.path.join(ROOT, 'data', eid + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(eid, src, len(items), {b: len(v) for b, v in bands.items()})

WITH_PEERS = '--peers' in sys.argv   # 10회차 미만 학교 작업(10/23)에서만 켠다
for a in sys.argv[1:]:
    if a != '--peers': dump(a)
