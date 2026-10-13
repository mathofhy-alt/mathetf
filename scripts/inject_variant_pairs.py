# -*- coding: utf-8 -*-
"""변형 회차 ↔ 원본 회차 짝을 유사문항 목록(question_similar) 맨 앞에 박는다 (2026-10-13).

왜: 강사가 원본 문항의 '유사' 를 누르면 그 문항의 변형이 1순위로 떠야 하는데, 실측(418쌍) 58%만 상위 5개에 들었다.
    변형은 문장을 많이 바꿔 임베딩 유사도가 낮거나, 소넷 태깅이 단원을 다르게 붙여 같은 단원 필터에 걸러졌다.
    짝은 메타데이터(학교·연도·학년·회차·번호)로 확정되므로 유사도와 상관없이 고정한다.

짝 규칙: semester '…변형' ↔ '…'. 46문항 회차(고3 선택과목 3개)는 변형이 23~46 연속 번호, 원본은 23~30 ×3 →
    원본 번호 = 23 + (변형번호-23) % 8, 과목 같은 것. 30·25문항 회차는 번호 그대로.
저장: 두 기준(statement·solution) 목록 맨 앞에 [짝id, 1.0, 'variant'] (양방향). 라우트는 세 번째 값이 'variant' 면
    단원 필터·임계값을 건너뛰고 맨 위에 보여 준다. precompute_similar.py 가 목록을 다시 쓰면 사라지므로 그 뒤에 다시 돌린다.
사용: python scripts/inject_variant_pairs.py [--dry-run]
"""
import os, re, sys, json, time, argparse, collections
import requests, urllib3

urllib3.disable_warnings()
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace', line_buffering=True)
except Exception: pass
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env = {}
for line in open(os.path.join(ROOT, '.env.local'), encoding='utf-8'):
    m = re.match(r'^\s*([\w.-]+)\s*=\s*(.*)\s*$', line)
    if m: env[m.group(1)] = m.group(2).strip().strip('"').strip("'")
URL = env['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/'); KEY = env['SUPABASE_SERVICE_ROLE_KEY']
H = {'apikey': KEY, 'Authorization': 'Bearer ' + KEY}
SEL = 'id,school,year,grade,semester,subject,question_number,question_index,work_status'


def get(path, params, tries=4):
    for t in range(tries):
        try:
            r = requests.get(f'{URL}/rest/v1/{path}', headers=H, params=params, verify=False, timeout=60)
            if r.status_code == 200: return r.json()
        except requests.RequestException: pass
        time.sleep(3 * (t + 1))
    raise RuntimeError(f'GET {path} 실패')


def pairs():
    var = get('questions', {'select': SEL, 'semester': 'like.*변형*', 'limit': '5000'})
    rounds = {(v['school'], v['year'], v['grade'], v['semester']) for v in var}
    orig = {}
    for sch, y, g, sem in rounds:
        orig[(sch, y, g, sem)] = get('questions', {'select': SEL, 'school': f'eq.{sch}', 'year': f'eq.{y}', 'grade': f'eq.{g}', 'semester': f"eq.{sem.replace('변형', '')}"})
    out = []; st = collections.Counter()
    for v in var:
        os_ = orig.get((v['school'], v['year'], v['grade'], v['semester']), [])
        n = int(v['question_number'])
        on = 23 + (n - 23) % 8 if len(os_) == 46 and n >= 23 else n
        cand = [o for o in os_ if int(o['question_number']) == on]
        same = [o for o in cand if o['subject'] == v['subject']]
        if len(same) == 1: pick = same[0]
        elif len(cand) == 1: pick = cand[0]
        elif cand and len(os_) == 46:
            # 과목 이름이 다른 옛 회차(2021 사관: 선택 블록이 '미적분' 둘) — 선택 블록 순서(파일 순서)로 맞춘다
            blk = (n - 23) // 8
            cand.sort(key=lambda o: o.get('question_index') or 0)
            pick = cand[blk] if blk < len(cand) else None
        else: pick = None
        if not pick: st['원본없음'] += 1; continue
        st['짝'] += 1; out.append((pick['id'], v['id']))
    print(f'변형 {len(var)}문항 → {dict(st)}')
    return out


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--dry-run', action='store_true'); a = ap.parse_args()
    ps = pairs()
    links = collections.defaultdict(list)
    for o, v in ps: links[o].append(v); links[v].append(o)
    ids = list(links)
    rows = []
    for i in range(0, len(ids), 100):
        rows += get('question_similar', {'select': 'question_id,basis,neighbors', 'question_id': f'in.({",".join(ids[i:i + 100])})'})
    have = {(r['question_id'], r['basis']) for r in rows}
    missing = [(q, b) for q in ids for b in ('statement', 'solution') if (q, b) not in have]
    upd = []
    for r in rows:
        want = links[r['question_id']]
        rest = [p for p in (r['neighbors'] or []) if not (len(p) > 2 and p[2] == 'variant') and p[0] not in want]
        new = [[p, 1.0, 'variant'] for p in want] + rest
        if new != r['neighbors']: upd.append({'question_id': r['question_id'], 'basis': r['basis'], 'neighbors': new[:52]})
    for q, b in missing: upd.append({'question_id': q, 'basis': b, 'neighbors': [[p, 1.0, 'variant'] for p in links[q]]})
    print(f'짝 {len(ps)} · 문항 {len(ids)} · 고칠 행 {len(upd)} (목록 없던 행 {len(missing)})')
    if a.dry_run: return
    for i in range(0, len(upd), 200):
        for t in range(5):
            try:
                r = requests.post(f'{URL}/rest/v1/question_similar', headers={**H, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates,return=minimal'},
                                  data=json.dumps(upd[i:i + 200]), verify=False, timeout=120)
                if r.status_code < 300: break
                err = f'{r.status_code} {r.text[:200]}'
            except requests.RequestException as e: err = type(e).__name__
            time.sleep(5 * (t + 1))
        else: raise RuntimeError(f'저장 실패 {err}')
    print('저장 완료')


if __name__ == '__main__':
    main()
