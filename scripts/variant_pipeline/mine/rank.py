import re, sys
from db import get; from ext import split
def sig(r):
    eq = r.get('equation_scripts'); eq = ' '.join(eq) if isinstance(eq, list) else str(eq or '')
    return re.sub(r'\s|[①②③④⑤]', '', str(r.get('plain_text') or '')) + '|' + re.sub(r'\s', '', eq)
def ranked(SRC, mode, n=10, threshold=0.5, light=False):
    s = {r['basis']: r['neighbors'] for r in get('question_similar', select='basis,neighbors', question_id='eq.' + SRC)}
    stmt, sol = s.get('statement', []), s.get('solution', [])
    combined = mode == 'statement' and len(stmt) > 0
    main = stmt if combined else s.get(mode, [])
    var = {p[0] for p in stmt + sol if len(p) > 2 and p[2] == 'variant'}
    simS = {p[0]: float(p[1]) for p in stmt}; simO = {p[0]: float(p[1]) for p in sol}
    rr = s.get('rerank', []) if combined else []
    rrS = {p[0]: float(p[1]) for p in rr}
    ids = list(dict.fromkeys([p[0] for p in ((rr + stmt + sol) if combined else main)]))
    F = 'id,school,grade,year,semester,subject,unit,question_number,key_concepts,difficulty,plain_text,equation_scripts' + ('' if light else ',content_xml')   # 고를 때는 본문(그림) 안 읽음
    rows = []
    for i in range(0, len(ids), 40):
        rows += get('questions', select=F, id='in.(' + ','.join(ids[i:i+40]) + ')', work_status='eq.sorted')
    src = get('questions', select='unit,difficulty,key_concepts,plain_text,equation_scripts', id='eq.' + SRC)[0]
    types = {t['question_id']: (t['unit'], t['code']) for t in get('question_types', select='question_id,unit,code', question_id='in.(' + ','.join(ids + [SRC]) + ')')}
    floorS = min(simS.values()) - 0.01 if simS else 0.85; floorO = min(simO.values()) - 0.01 if simO else 0.85
    by = {r['id']: r for r in rows}; srcSig = sig(src); sd = float(src['difficulty'] or 5)
    st = types.get(SRC); out = []
    for q in ids:
        r = by.get(q)
        if not r: continue
        iv = q in var
        if not iv and src['unit'] and r['unit'] != src['unit']: continue
        ss = simS.get(q, floorS); so = simO.get(q, floorO)
        shown = max(ss, so) if combined else simS.get(q, so)
        if not iv and shown <= 1 - threshold: continue
        if not iv and len(srcSig) > 1 and sig(r) == srcSig: continue
        tag = len(set(r['key_concepts'] or []) & set(src['key_concepts'] or []))
        tb = 1 if st and st[1] is not None and types.get(q) == st else 0
        score = 9 if iv else 5 + rrS[q] / 100 if q in rrS else (ss + so - 0.02 * abs(float(r['difficulty'] or 5) - sd) + 0.03 * tag if combined else shown) + tb
        out.append((score, iv, r))
    out.sort(key=lambda x: -x[0]); seen = set(); res = []
    for x in out:
        k = sig(x[2])
        if len(k) > 1 and k in seen: continue
        seen.add(k); res.append(x)
    return res[:n]
def show(SRC, mode, picks=None, n=10):
    for i, (score, iv, r) in enumerate(ranked(SRC, mode, n), 1):
        if picks and i not in picks: 
            print(f"{i}. {r['school']} {r['year']} {r['semester']} {r['grade']} {r['question_number']}번 · 난이도 {r['difficulty']}"); continue
        stem, sol = split(r['content_xml'] or '')
        print(f"\n### {i}. {r['school']} {r['year']} {r['semester']} {r['grade']} {r['subject']} {r['question_number']}번 · 난이도 {r['difficulty']}{' · 변형짝' if iv else ''}")
        print(stem); print('[해설]', sol[:1800].replace('\n', ' / '))
