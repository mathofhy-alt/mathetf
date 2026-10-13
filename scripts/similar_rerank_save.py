# -*- coding: utf-8 -*-
"""유사문항 LLM 재정렬 — 3단계: Haiku 결과(out*.json)를 검사해 question_similar(basis='rerank')에 저장 (2026-10-14).
사용: python scripts/similar_rerank_save.py .cache/rerank/batch_YYYYMMDD_HHMMSS [--dry-run]
- 후보 점수가 빠진 사례는 저장하지 않고 이름을 출력한다(그 사례만 다시 돌리면 됨).
- 저장 형식 neighbors = [[문항id, 점수], ...] 점수 내림차순. 화면은 이 순서를 합산 점수보다 앞에 쓴다.
- 저장 실패 'question_similar_basis_check' = SQL supabase/migrations/20261014_similar_rerank.sql 미적용.
"""
import os, re, sys, json, glob, time, argparse, requests, urllib3
urllib3.disable_warnings()
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace', line_buffering=True)
except Exception: pass
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env = {}
for line in open(os.path.join(ROOT, '.env.local'), encoding='utf-8'):
    m = re.match(r'^\s*([\w.-]+)\s*=\s*(.*)\s*$', line)
    if m: env[m.group(1)] = m.group(2).strip().strip('"').strip("'")
URL = env['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/'); KEY = env['SUPABASE_SERVICE_ROLE_KEY']; H = {'apikey': KEY, 'Authorization': 'Bearer ' + KEY}
STATE = os.path.join(ROOT, '.cache', 'rerank', 'state.json')
def rd(f):
    b = open(f, 'rb').read()
    for e in ('utf-8-sig', 'cp949'):
        try: return json.loads(b.decode(e))
        except Exception: pass
    raise SystemExit('못 읽음 ' + f)
def main():
    ap = argparse.ArgumentParser(); ap.add_argument('batch'); ap.add_argument('--dry-run', action='store_true'); a = ap.parse_args()
    key = json.load(open(os.path.join(a.batch, 'key.json'), encoding='utf-8')); SC = {}
    for f in glob.glob(os.path.join(a.batch, 'out*.json')): SC.update(rd(f))
    rows = []; bad = []
    for name, k in key.items():
        s = SC.get(name)
        if not s or any(f'C{i + 1}' not in s for i in range(len(k['cands']))): bad.append(name); continue
        nb = sorted(([q, float(s[f'C{i + 1}'])] for i, q in enumerate(k['cands'])), key=lambda p: -p[1])
        rows.append({'question_id': k['base'], 'basis': 'rerank', 'neighbors': nb})
    print(f'저장할 문항 {len(rows)} / {len(key)} · 점수 빠진 사례 {bad}')
    if a.dry_run or not rows: return
    for i in range(0, len(rows), 100):
        r = requests.post(f'{URL}/rest/v1/question_similar', headers={**H, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates,return=minimal'},
                          data=json.dumps(rows[i:i + 100]), verify=False, timeout=(10, 120))
        if r.status_code >= 300:
            raise SystemExit(f'저장 실패 {r.status_code} {r.text[:200]}' + ('\n→ SQL 20261014_similar_rerank.sql 을 먼저 실행해야 함' if 'basis_check' in r.text else ''))
    st = json.load(open(STATE, encoding='utf-8')) if os.path.exists(STATE) else {'done': {}}
    now = time.strftime('%Y-%m-%d %H:%M')
    for r in rows: st['done'][r['question_id']] = now
    os.makedirs(os.path.dirname(STATE), exist_ok=True); json.dump(st, open(STATE, 'w', encoding='utf-8'), indent=0)
    print(f'저장 완료 {len(rows)} · 누적 재정렬 문항 {len(st["done"])}')
if __name__ == '__main__': main()
