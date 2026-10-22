"""시험지별 유사 시험지 Top 5 두 가지(대표 10/23) → data_sim/<exam_id>.json
   A 「고난도 문항과 닮은 문제가 나온 시험지」 — '추천' 점수(사이트 유사 버튼과 같은 식): 이 시험의 어려움 문항 기준
   B 「같은 풀이법이 통하는 시험지」 — '풀이 유사' 점수: 이 시험 전체 문항 기준
   같은 학교는 빼고(이미 '다른 시험지' 목록이 있다), A 에 나온 시험지는 B 에서 뺀다.
   점수식은 src/app/api/pro/similar-questions/route.ts 와 맞춘다(문항 표시용 dedupe 는 시험지 묶음에선 생략).
   python similar_exams.py [--refresh]   (--refresh: 캐시 다시 받기)
   python similar_exams.py --ids <exam_id ...>   등록 배치 뒤 새 시험지만(캐시 + 새 문항·유사 행만 보충해 받는다)"""
import collections, json, os, sys, time, urllib.parse, urllib.request
sys.stdout.reconfigure(encoding='utf-8')
D = os.path.dirname(os.path.abspath(__file__)); REPO = os.path.abspath(os.path.join(D, '..', '..'))
CACHE = os.path.join(D, 'cache'); OUTD = os.path.join(D, 'data_sim')
os.makedirs(CACHE, exist_ok=True); os.makedirs(OUTD, exist_ok=True)
env = {}
for l in open(os.path.join(REPO, '.env.local'), encoding='utf-8'):
    if '=' in l and not l.startswith('#'):
        k, v = l.strip().split('=', 1); env[k] = v.strip('"')
U = env['NEXT_PUBLIC_SUPABASE_URL']; K = env['SUPABASE_SERVICE_ROLE_KEY']
SEM = {1: '1학기', 2: '2학기'}
band = lambda d: '쉬움' if d <= 2 else '보통' if d <= 4 else '어려움'


def fetch_all(path, name, key='id', uniq=None):
    """키 기준으로 넘기며 읽는다(offset 이 깊어지면 MICRO DB 가 시간 초과 — 10/23). path 에 &order={key} 를 넣지 말 것."""
    f = os.path.join(CACHE, name + '.json')
    if os.path.exists(f) and '--refresh' not in sys.argv:
        return json.load(open(f, encoding='utf-8'))
    out, seen, last = [], set(), None
    while True:
        cond = f'&{key}=gte.{last}' if last else ''
        url = f'{U}/rest/v1/{path}{cond}&order={key}&limit=1000'
        for t in range(4):
            try:
                d = json.load(urllib.request.urlopen(urllib.request.Request(url, headers={'apikey': K, 'Authorization': 'Bearer ' + K}), timeout=180)); break
            except Exception as ex:
                print('  재시도', name, ex, flush=True); time.sleep(5 * (t + 1))
        else:
            raise SystemExit(f'{name} 읽기 실패')
        new = 0
        for r in d:
            u = uniq(r) if uniq else r[key]
            if u in seen: continue
            seen.add(u); out.append(r); new += 1
        if len(d) < 1000 or new == 0: break
        last = d[-1][key]; time.sleep(0.15)   # MICRO DB — 대량 읽기는 천천히
    json.dump(out, open(f, 'w', encoding='utf-8'), ensure_ascii=False)
    print(name, len(out), flush=True)
    return out


exams = [e for e in fetch_all('exam_materials?select=id,school,exam_year,grade,semester,exam_type,subject,preview_urls&file_type=eq.PDF&content_type=eq.%ED%95%B4%EC%84%A4&school=neq.DELETED', 'exams') if e['preview_urls']]
src2exam = {f"{e['school']}_{e['exam_year']}_{SEM.get(e['semester'], e['semester'])}{(e['exam_type'] or '')[:2]}_{e['subject']}": e for e in exams}
qs = fetch_all('questions?select=id,source_db_id,school,unit,difficulty,key_concepts,question_number&work_status=eq.sorted', 'questions')
Q = {q['id']: q for q in qs}
sims = fetch_all('question_similar?select=question_id,basis,neighbors', 'similar', key='question_id', uniq=lambda r: (r['question_id'], r['basis']))
S = collections.defaultdict(dict)
for r in sims: S[r['question_id']][r['basis']] = r['neighbors'] if isinstance(r['neighbors'], list) else json.loads(r['neighbors'] or '[]')
types = {t['question_id']: (t['unit'], t['code']) for t in fetch_all('question_types?select=question_id,unit,code', 'types', key='question_id')}
IDS = sys.argv[sys.argv.index('--ids') + 1:] if '--ids' in sys.argv else None


def get(path):
    return json.load(urllib.request.urlopen(urllib.request.Request(f'{U}/rest/v1/{path}', headers={'apikey': K, 'Authorization': 'Bearer ' + K}), timeout=180))


if IDS:
    # 새 시험지는 캐시에 없다 — 시험지·문항·유사 행·후보 문항을 그때그때 보충한다
    for i in range(0, len(IDS), 50):
        for e in get('exam_materials?select=id,school,exam_year,grade,semester,exam_type,subject,preview_urls&id=in.(' + ','.join(IDS[i:i + 50]) + ')'):
            if e['preview_urls'] and e['id'] not in {x['id'] for x in exams}: exams.append(e)
    src2exam = {f"{e['school']}_{e['exam_year']}_{SEM.get(e['semester'], e['semester'])}{(e['exam_type'] or '')[:2]}_{e['subject']}": e for e in exams}
    new_q = []
    for e in [x for x in exams if x['id'] in IDS]:
        src = f"{e['school']}_{e['exam_year']}_{SEM.get(e['semester'], e['semester'])}{(e['exam_type'] or '')[:2]}_{e['subject']}"
        new_q += get('questions?select=id,source_db_id,school,unit,difficulty,key_concepts,question_number&work_status=eq.sorted&source_db_id=eq.' + urllib.parse.quote(src))
    for q in new_q: Q[q['id']] = q
    ids = [q['id'] for q in new_q]
    for i in range(0, len(ids), 40):
        for r in get('question_similar?select=question_id,basis,neighbors&question_id=in.(' + ','.join(ids[i:i + 40]) + ')'):
            S[r['question_id']][r['basis']] = r['neighbors'] if isinstance(r['neighbors'], list) else json.loads(r['neighbors'] or '[]')
        for t in get('question_types?select=question_id,unit,code&question_id=in.(' + ','.join(ids[i:i + 40]) + ')'):
            types[t['question_id']] = (t['unit'], t['code'])
    miss = list({p[0] for qid in ids for L in S.get(qid, {}).values() for p in L if p[0] not in Q})
    for i in range(0, len(miss), 80):
        for q in get('questions?select=id,source_db_id,school,unit,difficulty,key_concepts,question_number&work_status=eq.sorted&id=in.(' + ','.join(miss[i:i + 80]) + ')'): Q[q['id']] = q
        for t in get('question_types?select=question_id,unit,code&question_id=in.(' + ','.join(miss[i:i + 80]) + ')'): types[t['question_id']] = (t['unit'], t['code'])
    qs = list(Q.values())
by_src = collections.defaultdict(list)
for q in qs: by_src[q['source_db_id']].append(q)


def tags(q):
    t = q.get('key_concepts') or []
    return set(map(str.strip, t if isinstance(t, list) else []))


def recommend(qid):
    """'추천' 순위(유사 버튼 기본 탭과 같은 점수) → [(후보id, 점수)]"""
    src = Q[qid]; L = S.get(qid, {})
    stmt, sol, rr = L.get('statement', []), L.get('solution', []), L.get('rerank', [])
    if not stmt and not sol: return []
    simS = {p[0]: float(p[1]) for p in stmt}; simO = {p[0]: float(p[1]) for p in sol}; rrS = {p[0]: float(p[1]) for p in rr}
    variants = {p[0] for p in stmt + sol if len(p) > 2 and p[2] == 'variant'}
    floorS = min(simS.values()) - 0.01 if simS else 0.85; floorO = min(simO.values()) - 0.01 if simO else 0.85
    sd, st, sty = int(src['difficulty'] or 5), tags(src), types.get(qid)
    out = []
    for c in dict.fromkeys(p[0] for p in rr + stmt + sol):
        r = Q.get(c)
        if not r: continue
        if c not in variants and src['unit'] and r['unit'] != src['unit']: continue
        tb = 1 if sty and types.get(c) == sty else 0
        if c in variants: sc = 9
        elif c in rrS: sc = 5 + rrS[c] / 100
        else: sc = simS.get(c, floorS) + simO.get(c, floorO) - 0.02 * abs(int(r['difficulty'] or 5) - sd) + 0.03 * len(tags(r) & st)
        out.append((c, sc + tb))
    return sorted(out, key=lambda x: -x[1])


def solution_like(qid):
    """'풀이 유사' 순위 → [(후보id, 점수)]"""
    src = Q[qid]; sty = types.get(qid); out = []
    for p in S.get(qid, {}).get('solution', []):
        r = Q.get(p[0])
        if not r or (src['unit'] and r['unit'] != src['unit']): continue
        out.append((p[0], float(p[1]) + (1 if sty and types.get(p[0]) == sty else 0)))
    return sorted(out, key=lambda x: -x[1])


def label(e):
    s = e['school'].replace('여자고등학교', '여고').replace('고등학교', '고').replace('사범대학부속', '사대부')
    return f"{s} {e['exam_year']} {e['grade']}학년 {e['semester']}학기 {(e['exam_type'] or '')[:2]} {e['subject'] or ''}".strip()


def top_exams(base_qs, ranker, school, exclude, per=10, n=5):
    agg = collections.defaultdict(lambda: {'hit': set(), 'score': 0.0, 'pairs': {}})
    for q in base_qs:
        for c, sc in ranker(q['id'])[:per]:
            r = Q[c]; e = src2exam.get(r['source_db_id'])
            if not e or e['school'] == school or e['id'] in exclude: continue
            a = agg[e['id']]; a['hit'].add(q['question_number']); a['score'] += sc
            a['pairs'].setdefault(q['question_number'], r['question_number'])   # 원본 문항별 가장 닮은 짝 하나
    best = sorted(agg.items(), key=lambda kv: (-len(kv[1]['hit']), -kv[1]['score']))[:n]
    ex_by_id = {e['id']: e for e in exams}
    return [{'exam_id': k, 'label': label(ex_by_id[k]), 'pairs': sorted(v['pairs'].items())} for k, v in best]


done = 0
for e in (exams if not IDS else [x for x in exams if x['id'] in IDS]):
    src = f"{e['school']}_{e['exam_year']}_{SEM.get(e['semester'], e['semester'])}{(e['exam_type'] or '')[:2]}_{e['subject']}"
    mine = sorted(by_src.get(src, []), key=lambda q: q['question_number'] or 0)
    if not mine: continue
    hard = [q for q in mine if band(int(q['difficulty'] or 0)) == '어려움']
    A = top_exams(hard, recommend, e['school'], set()) if hard else []
    B = top_exams(mine, solution_like, e['school'], {x['exam_id'] for x in A})
    json.dump({'hard_similar': A, 'method_similar': B}, open(os.path.join(OUTD, e['id'] + '.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    done += 1
print('시험지', done, '계산 끝')
