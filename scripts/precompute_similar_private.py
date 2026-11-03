# -*- coding: utf-8 -*-
"""시중 교재(개인DB, work_status='private') 문항의 유사 목록 → question_similar (11/4 대표 「1번이면 충분」).

후보는 **공개 기출(work_status='sorted')만** — 같은 단원 · 코사인 > 0.5 · 상위 50.
  다른 교재 문제는 절대 넣지 않는다(결제 안 한 회원에게 새는 길). 반대 방향(기출 목록에 교재 섞기)도 안 한다.
  화면(similar-questions route)은 후보를 다시 work_status='sorted' 로 걸러 읽으므로 이중 안전.
기출 임베딩은 precompute_similar.py 의 로컬 캐시(.cache/similar_emb_*.npz)를 그대로 쓴다 — 교재 임베딩만 DB 에서 받는다.

사용: python scripts/precompute_similar_private.py [--redo] [--dry-run]
  기본은 표에 행이 없는 교재 문항만. 재정렬은 그다음 similar_rerank_codex.py --ids @파일 로.
"""
import os, sys, argparse
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
import precompute_similar as P


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--redo', action='store_true'); ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--ids-out', default=os.path.join(P.CACHE_DIR, 'private_ids.txt')); a = ap.parse_args()
    P.PAUSE = 0.3
    pub = P.keyset('questions', 'id,unit', {'work_status': 'eq.sorted'})
    unit_of = {r['id']: r['unit'] for r in pub}
    priv = P.keyset('questions', 'id,unit', {'work_status': 'eq.private'})
    print(f'공개 기출 {len(pub)} · 교재 {len(priv)}', flush=True)
    have = set()
    if not a.redo:
        ids = [r['id'] for r in priv]
        for i in range(0, len(ids), 100):
            have |= {(r['question_id'], r['basis']) for r in P.get('question_similar', {'select': 'question_id,basis', 'question_id': f'in.({",".join(ids[i:i + 100])})'})}
    done_ids = []
    for basis, col in P.BASES.items():
        cache = P.cache_load(basis)
        by_unit = {}
        for q, u in unit_of.items():
            if q in cache: by_unit.setdefault(u, []).append(q)
        todo = [r for r in priv if (r['id'], basis) not in have]
        print(f'[{basis}] 기출 캐시 {len(cache)} · 계산할 교재 {len(todo)}', flush=True)
        vec = P.fetch_vecs(col, [r['id'] for r in todo])
        mats = {}
        rows = []; empty = 0
        for n, r in enumerate(todo):
            v = vec.get(r['id'])
            if v is None: continue
            mem = by_unit.get(r['unit']) or []
            if not mem: rows.append({'question_id': r['id'], 'basis': basis, 'neighbors': []}); empty += 1; continue
            if r['unit'] not in mats: mats[r['unit']] = np.vstack([cache[q] for q in mem]).astype(np.float32)
            s = mats[r['unit']] @ v
            k = min(P.TOP_K, len(mem))
            top = np.argpartition(-s, k - 1)[:k] if k < len(mem) else np.arange(len(mem))
            top = top[np.argsort(-s[top])]
            rows.append({'question_id': r['id'], 'basis': basis, 'neighbors': [[mem[j], round(float(s[j]), 4)] for j in top if s[j] > P.THRESHOLD]})
            if len(rows) >= 2000 and not a.dry_run: P.upsert(rows); done_ids += [x['question_id'] for x in rows]; rows = []; print(f'  {n + 1}/{len(todo)}', flush=True)
        if not a.dry_run and rows: P.upsert(rows); done_ids += [x['question_id'] for x in rows]
        print(f'[{basis}] 저장 {len(todo)} (같은 단원 기출 없음 {empty})', flush=True)
    ids = sorted({r['id'] for r in priv})
    with open(a.ids_out, 'w', encoding='utf-8') as f: f.write('\n'.join(ids))
    print('재정렬용 교재 id 목록:', a.ids_out, len(ids))


if __name__ == '__main__':
    main()
