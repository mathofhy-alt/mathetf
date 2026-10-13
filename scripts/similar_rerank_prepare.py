# -*- coding: utf-8 -*-
"""유사문항 LLM 재정렬 — 1단계: 대기열에서 N문항을 골라 Haiku 에이전트가 읽을 글 파일을 만든다 (2026-10-14).

왜: 지금 유사 목록(발문·풀이 임베딩 합산 점수)은 문장 겉모습이 비슷한 문제를 위에 올린다.
    개발 40사례 실측: 후보 20개를 Haiku 가 발문·해설 글로 읽고 다시 줄 세우면 상위5 적합 108→130/200 (사례당 +0.55).
    재정렬은 Claude Code 세션 안에서(플랜, 돈 0) 조금씩 돌린다 — 트리거 말: "유사 재정렬 N개".
순서: ① 이 스크립트 → ② 세션이 Haiku 에이전트(작업 파일 1개당 1명)를 scripts/similar_rerank_prompt.md 지시문으로 띄움
      → ③ scripts/similar_rerank_save.py <배치폴더> 로 DB 저장(question_similar basis='rerank').
대기열 우선순위: 유사 버튼 클릭 수(similar_click_log) → 최근 등록 → (지정) --ids / --source 회차
사용: python scripts/similar_rerank_prepare.py 40   |  --source "<source_db_id>"  |  --ids id1,id2
"""
import os, re, sys, json, time, html, random, argparse, collections, requests, urllib3
urllib3.disable_warnings()
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace', line_buffering=True)
except Exception: pass
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, os.path.join(ROOT, 'scripts'))
from hwpeq import convert
env = {}
for line in open(os.path.join(ROOT, '.env.local'), encoding='utf-8'):
    m = re.match(r'^\s*([\w.-]+)\s*=\s*(.*)\s*$', line)
    if m: env[m.group(1)] = m.group(2).strip().strip('"').strip("'")
URL = env['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/'); KEY = env['SUPABASE_SERVICE_ROLE_KEY']; H = {'apikey': KEY, 'Authorization': 'Bearer ' + KEY}
STATE = os.path.join(ROOT, '.cache', 'rerank', 'state.json'); S = requests.Session()
def get(path, params, tries=3):
    for t in range(tries):
        try:
            r = S.get(f'{URL}/rest/v1/{path}', headers=H, params=params, verify=False, timeout=(10, 60))
            if r.status_code == 200: return r.json()
            err = r.status_code
        except requests.RequestException as e: err = type(e).__name__
        time.sleep((5, 15, 30)[t])
    raise RuntimeError(f'GET {path} 실패 {err}')
ENDNOTE = re.compile(r'<ENDNOTE\b.*?</ENDNOTE>', re.S | re.I); SCRIPT = re.compile(r'<SCRIPT[^>]*>(.*?)</SCRIPT>', re.S | re.I)
def readable(xml_part):
    eqs = [html.unescape(e).strip() for e in SCRIPT.findall(xml_part)]
    t = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', xml_part))).strip(); out = []; pos = 0
    for e in eqs:                                # 본문 속 수식을 읽기 쉬운 꼴로(변환 실패 시 원래 수식 유지)
        o, _ = convert(e)
        if not o or o == e: continue
        k = t.find(e, pos)
        if k < 0: continue
        out.append(t[pos:k]); out.append(o); pos = k + len(e)
    out.append(t[pos:]); return re.sub(r'\s+', ' ', re.sub(r'\b(it|rm)\b', '', ''.join(out))).strip()
def text_of(x, n=900):
    xml = x.get('content_xml') or ''; notes = ' '.join(ENDNOTE.findall(xml)); stmt = ENDNOTE.sub(' ', xml)
    return '[문제] ' + readable(stmt)[:n] + '\n[해설] ' + readable(notes)[:n]
sig = lambda r: re.sub(r'\s|[①②③④⑤]', '', r.get('plain_text') or '') + '|' + re.sub(r'\s', '', ' '.join(r.get('equation_scripts') or []))
def tags(r):
    t = r.get('key_concepts') or []
    if isinstance(t, str): t = re.findall(r"#[^'\",\]]+", t)
    return {str(x).strip() for x in t}
def candidates(base):
    """화면(api/pro/similar-questions)과 같은 규칙의 합산 상위 20 — 변형 짝은 화면이 따로 맨 위에 두므로 뺀다."""
    L = {r['basis']: r['neighbors'] for r in get('question_similar', {'select': 'basis,neighbors', 'question_id': f'eq.{base}', 'basis': 'in.(statement,solution)'})}
    st = [p for p in L.get('statement', []) if len(p) < 3]; so = [p for p in L.get('solution', []) if len(p) < 3]
    if not st and not so: return None, []
    S_ = {p[0]: float(p[1]) for p in st}; O_ = {p[0]: float(p[1]) for p in so}
    ids = list(dict.fromkeys(list(S_) + list(O_)))
    rows = {}
    for i in range(0, len(ids) + 1, 80):
        ch = ids[i:i + 80] + ([base] if i == 0 else [])
        for r in get('questions', {'select': 'id,unit,difficulty,key_concepts,plain_text,equation_scripts,work_status', 'id': 'in.(' + ','.join(ch) + ')'}): rows[r['id']] = r
    b = rows.get(base)
    if not b: return None, []
    fs = min(S_.values()) - 0.01 if S_ else 0.85; fo = min(O_.values()) - 0.01 if O_ else 0.85; bd = int(b['difficulty'] or 5); bt = tags(b); bs = sig(b)
    sc = []
    for q in ids:
        r = rows.get(q)
        if not r or r['work_status'] != 'sorted' or r['unit'] != b['unit'] or (len(bs) > 1 and sig(r) == bs): continue
        sc.append((S_.get(q, fs) + O_.get(q, fo) - 0.02 * abs(int(r['difficulty'] or 5) - bd) + 0.03 * len(tags(r) & bt), q))
    ok = {q for _, q in sc}
    # 후보 = 문제(발문) 유사 상위 20 ∪ 풀이 유사 상위 20 (겹치면 하나, 같은 문제 서명은 하나) → 최대 40개.
    #   [10/14 사용자 결정] 합산 상위 20 만 보면 '풀이만 같은' 문제가 빠진다(예: 2017 수능 21번 ↔ 분당중앙고 25 16번 =
    #   풀이 유사 3위·합산 22위). 임의 비율 대신 두 목록 각각 상위 20.
    def top20(M):
        seen = set(); out = []
        for q in sorted(M, key=lambda q: -M[q]):
            if q not in ok: continue
            k = sig(rows[q])
            if len(k) > 1 and k in seen: continue
            seen.add(k); out.append(q)
            if len(out) == 20: break
        return out
    seen = set(); out = []
    for q in top20(S_) + top20(O_):
        k = sig(rows[q])
        if q in out or (len(k) > 1 and k in seen): continue
        seen.add(k); out.append(q)
    return b, out
def main():
    ap = argparse.ArgumentParser(); ap.add_argument('n', nargs='?', type=int, default=40); ap.add_argument('--ids'); ap.add_argument('--source'); ap.add_argument('--redo', action='store_true')
    a = ap.parse_args()
    st = json.load(open(STATE, encoding='utf-8')) if os.path.exists(STATE) else {'done': {}}
    done = set() if a.redo else set(st['done'])
    if a.ids: pick = [x.strip() for x in a.ids.split(',') if x.strip()]
    elif a.source: pick = [r['id'] for r in get('questions', {'select': 'id', 'source_db_id': f'eq.{a.source}', 'work_status': 'eq.sorted', 'order': 'question_number'})]
    else:
        pick = []
        try:
            clicks = collections.Counter(r['question_id'] for r in get('similar_click_log', {'select': 'question_id', 'order': 'clicked_at.desc', 'limit': '20000'}))
        except RuntimeError: clicks = collections.Counter(); print('클릭 기록 표 없음(SQL 20261014 미적용)')
        # [10/14 사용자 지시] 우선순위: 전국연합 → 수능 → 평가원 → 경찰대학교 → 사관학교 (묶음 안: 클릭 많은 순 → 최근 연도 → 번호),
        #   그다음 나머지 클릭 문항 → 최근 등록. 목록에 이미 있는 문항(done)은 건너뛴다.
        PRIORITY = ['전국연합', '수능', '평가원', '경찰대학교', '사관학교']
        for sch in PRIORITY:
            if len(pick) >= a.n: break
            rows = []; off = 0
            while len(rows) < a.n * 3:          # 한 번에 1000행 제한 — 최근 연도순으로 필요한 만큼만 받는다
                b_ = get('questions', {'select': 'id,year,question_number', 'school': f'eq.{sch}', 'work_status': 'eq.sorted',
                                       'order': 'year.desc,source_db_id.asc,question_number.asc', 'limit': '1000', 'offset': str(off)})
                if not b_: break
                rows += [r for r in b_ if r['id'] not in done]; off += 1000
            rows.sort(key=lambda r: (-clicks.get(r['id'], 0), -int(r['year'] or 0)))   # 안정 정렬 — 같은 클릭 수면 DB 순서(연도·회차·번호) 유지
            pick += [r['id'] for r in rows]
            print(f'우선 묶음 {sch}: 남은 {len(rows)}문항')
        pick += [q for q, _ in clicks.most_common() if q not in done and q not in pick]
        if len(pick) < a.n:
            # 최근 등록 순 — 단 유사 목록(question_similar)이 이미 계산된 문항만(갓 등록돼 목록이 없으면 후보를 만들 수 없다)
            recent = [r['id'] for r in get('questions', {'select': 'id', 'work_status': 'eq.sorted', 'order': 'created_at.desc', 'limit': '3000'}) if r['id'] not in done and r['id'] not in pick]
            for i in range(0, len(recent), 100):
                have = {r['question_id'] for r in get('question_similar', {'select': 'question_id', 'basis': 'eq.statement', 'question_id': 'in.(' + ','.join(recent[i:i + 100]) + ')'})}
                pick += [q for q in recent[i:i + 100] if q in have]
                if len(pick) >= a.n * 2: break
    pick = [q for q in pick if a.redo or q not in done][:a.n]
    bdir = os.path.join(ROOT, '.cache', 'rerank', time.strftime('batch_%Y%m%d_%H%M%S')); os.makedirs(bdir, exist_ok=True)
    key = {}; random.seed(len(pick) * 7 + int(time.time()) % 1000)
    for i, base in enumerate(pick):
        b, cands = candidates(base)
        if not b or len(cands) < 6: print('  건너뜀(후보 부족)', base[:8]); continue
        need = [base] + cands; xml = {}
        for j in range(0, len(need), 10):
            for r in get('questions', {'select': 'id,content_xml', 'id': 'in.(' + ','.join(need[j:j + 10]) + ')'}): xml[r['id']] = r
            time.sleep(0.3)
        c = list(cands); random.shuffle(c); name = base[:8]
        body = [f'### 사례 {name}\n## 기준\n{text_of(xml[base])}\n'] + [f'## 후보 C{k + 1}\n{text_of(xml[q])}\n' for k, q in enumerate(c) if q in xml]
        open(os.path.join(bdir, f'{name}.txt'), 'w', encoding='utf-8').write('\n'.join(body))
        key[name] = {'base': base, 'cands': [q for q in c if q in xml]}
        if (i + 1) % 10 == 0: print(f'  {i + 1}/{len(pick)}')
    names = list(key); jobs = [names[i:i + 3] for i in range(0, len(names), 3)]   # 후보가 최대 40개라 에이전트 1명당 3문항
    for j, g in enumerate(jobs): open(os.path.join(bdir, f'job{j + 1}.txt'), 'w', encoding='utf-8').write('\n'.join(g))
    json.dump(key, open(os.path.join(bdir, 'key.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print(f'배치 {bdir}\n문항 {len(key)} · 작업 파일 {len(jobs)}개 (Haiku 에이전트 {len(jobs)}명, 각 3문항) · 예상 플랜 사용 약 {sum(len(v["cands"]) for v in key.values()) * 1.35:.0f}k 토큰')
    print('다음: 작업 파일마다 Haiku 에이전트 1명 — 지시문 scripts/similar_rerank_prompt.md ({JOB}·{OUT} 바꿔 넣기) → 끝나면 python scripts/similar_rerank_save.py', bdir)
if __name__ == '__main__': main()
