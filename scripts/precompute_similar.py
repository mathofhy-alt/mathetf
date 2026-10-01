# -*- coding: utf-8 -*-
"""유사문항 미리 계산 → question_similar 표 (2026-10-01).

왜: 시험지출제의 '유사' 버튼이 누를 때마다 벡터 검색을 해서 0.5~3.7초 걸렸다(운영 실측).
    결과는 문항이 새로 등록되기 전까지 바뀌지 않으므로 미리 계산해 두면 표 조회(~0.1초)로 끝난다.

조건은 match_questions / match_questions_statement 와 같다:
    같은 단원 · work_status='sorted' · 자기 자신 제외 · 코사인 유사도 > 0.5 · 유사도 높은 순
    단, DB 함수는 근사 인덱스(HNSW)라 일부를 놓쳤는데 여기선 단원 안을 전부 비교한다(정확한 이웃).
저장: 문항·기준(solution=해설 포함 임베딩, statement=발문 임베딩)마다 상위 50개 [[id, 유사도], ...]
      (50 = 라우트의 limit*5 — 유료 모드 구매 필터 여유분)

사용:
    python scripts/precompute_similar.py            # 표에 아직 없는 문항이 있는 단원만 (등록 배치 끝에서 자동)
    python scripts/precompute_similar.py --all      # 전 단원 다시
    python scripts/precompute_similar.py --unit 로그 --dry-run   # 한 단원만, 저장 없이

⚠ 임베딩을 단원별로 내려받아 로컬(numpy)에서 계산한다 — DB 에서 벡터 검색을 수만 번 돌리는 것보다
  DB 부하가 훨씬 작다. 그래도 전체 실행은 임베딩 약 2GB 를 읽으므로 새벽 3~5시(Supabase 장애 이력)는 피한다.
"""
import os, re, sys, json, time, argparse
from datetime import datetime, timezone
import requests
import numpy as np

try: sys.stdout.reconfigure(encoding='utf-8', errors='replace', line_buffering=True)
except Exception: pass

import urllib3; urllib3.disable_warnings()
_o = requests.Session.request
requests.Session.request = lambda self, *a, **k: _o(self, *a, **{**k, 'verify': False})  # Avast SSL 가로채기 우회

def load_env():
    env = {}
    with open(os.path.join(os.path.dirname(__file__), '..', '.env.local'), encoding='utf-8') as f:
        for line in f:
            m = re.match(r'^\s*([\w.-]+)\s*=\s*(.*)\s*$', line)
            if m: env[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    return env

ENV = load_env()
URL = ENV['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/')
KEY = ENV['SUPABASE_SERVICE_ROLE_KEY']
H = {'apikey': KEY, 'Authorization': f'Bearer {KEY}'}
S = requests.Session()

TOP_K = 50
THRESHOLD = 0.5
BASES = {'solution': 'embedding', 'statement': 'embedding_statement'}


def get(path, params, tries=4):
    for i in range(tries):
        try:
            r = S.get(f'{URL}/rest/v1/{path}', headers=H, params=params, timeout=120)
            if r.ok: return r.json()
            err = f'{r.status_code} {r.text[:200]}'
        except requests.RequestException as e:
            err = str(e)[:200]
        time.sleep(2 * (i + 1))
    raise RuntimeError(f'GET {path} 실패: {err}')


PAUSE = 0.0  # 쪽 사이 쉬는 시간(초) — 임베딩 읽기에만 건다


def probe_ms():
    a = time.perf_counter()
    try: S.get(f'{URL}/rest/v1/questions', headers=H, params={'select': 'id', 'limit': '1'}, timeout=30)
    except requests.RequestException: return 99999
    return (time.perf_counter() - a) * 1000


def guard():
    """[2026-10-01 사고] 쉬지 않고 임베딩을 읽자 운영 '전체' 검색이 실패했다(53초·'검색 지연').
    가벼운 조회가 느려지면(=DB 가 바쁨) 회복될 때까지 기다린다."""
    waited = 0
    while (ms := probe_ms()) > 600:
        print(f'    ⏸ DB 응답 {ms:.0f}ms — 30초 쉼'); time.sleep(30); waited += 30
        if waited >= 1800: raise RuntimeError('DB 가 30분째 바빠서 중단')


def keyset(path, select, filters, page=1000, pause=0.0):
    """id 기준 키셋 페이지네이션 (offset 은 깊어질수록 느려진다)"""
    out, last = [], None
    while True:
        if pause:
            time.sleep(pause); guard()
        p = {'select': select, 'order': 'id.asc', 'limit': str(page), **filters}
        if last: p['id'] = f'gt.{last}'
        rows = get(path, p)
        out += rows
        if len(rows) < page: return out
        last = rows[-1]['id']


def table_exists():
    r = S.get(f'{URL}/rest/v1/question_similar', headers=H, params={'select': 'question_id', 'limit': '1'}, timeout=30)
    return r.ok


def existing_rows():
    """(question_id, basis) 이미 있는 것"""
    have, last = set(), None
    while True:
        p = {'select': 'question_id,basis', 'order': 'question_id.asc,basis.asc', 'limit': '1000'}
        if last: p['question_id'] = f'gt.{last}'
        rows = get('question_similar', p)
        for r in rows: have.add((r['question_id'], r['basis']))
        if len(rows) < 1000: return have
        last = rows[-1]['question_id']  # 같은 문항의 두 기준이 쪽 경계에 걸쳐도 다음 쪽에서 다시 안 읽힐 뿐 — 아래 판정은 '없는 문항' 기준이라 무해


def parse_vec(v):
    if v is None: return None
    if isinstance(v, str): v = json.loads(v)
    return np.asarray(v, dtype=np.float32)


def compute_unit(unit):
    """한 단원의 기준별 상위 50개. 반환: [{question_id, basis, similar}]"""
    rows_out = []
    for basis, col in BASES.items():
        rows = keyset('questions', f'id,{col}', {'work_status': 'eq.sorted', 'unit': f'eq.{unit}', col: 'not.is.null'}, page=100, pause=PAUSE)
        if len(rows) < 2:
            # 단원에 문항이 하나뿐 — 비교 대상이 없다. 빈 목록이라도 저장해야 다음 배치가 이 단원을 또 잡지 않는다.
            rows_out += [{'question_id': r['id'], 'basis': basis, 'neighbors': []} for r in rows]
            continue
        ids = [r['id'] for r in rows]
        E = np.vstack([parse_vec(r[col]) for r in rows])
        E /= np.linalg.norm(E, axis=1, keepdims=True).clip(min=1e-12)
        sims = E @ E.T
        np.fill_diagonal(sims, -1.0)  # 자기 자신 제외
        k = min(TOP_K, len(ids) - 1)
        top = np.argpartition(-sims, k - 1, axis=1)[:, :k] if k < len(ids) - 1 else np.argsort(-sims, axis=1)[:, :k]
        for i, qid in enumerate(ids):
            cand = top[i][np.argsort(-sims[i, top[i]])]
            pairs = [[ids[j], round(float(sims[i, j]), 4)] for j in cand if sims[i, j] > THRESHOLD]
            rows_out.append({'question_id': qid, 'basis': basis, 'neighbors': pairs})
    return rows_out


def upsert(rows):
    now = datetime.now(timezone.utc).isoformat()
    for i in range(0, len(rows), 500):
        chunk = [{**r, 'computed_at': now} for r in rows[i:i + 500]]
        for t in range(4):
            r = S.post(f'{URL}/rest/v1/question_similar', headers={**H, 'Content-Type': 'application/json',
                       'Prefer': 'resolution=merge-duplicates,return=minimal'}, data=json.dumps(chunk), timeout=120)
            if r.ok: break
            time.sleep(2 * (t + 1))
        else:
            raise RuntimeError(f'저장 실패 {r.status_code} {r.text[:200]}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--all', action='store_true')
    ap.add_argument('--unit', action='append')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--pause', type=float, default=1.0, help='임베딩 100개 읽을 때마다 쉬는 초 (운영 부하 방지)')
    a = ap.parse_args()
    global PAUSE; PAUSE = a.pause

    if not a.dry_run and not table_exists():
        print('question_similar 표가 없습니다 — supabase/migrations/20261001_question_bank_speed.sql 을 먼저 실행하세요.')
        print('완료: 성공 0 / 실패 0')
        return

    # 임베딩이 없는 문항은 행이 생기지 않으므로 대상 판정에서 뺀다(안 그러면 그 단원을 매번 다시 계산)
    qs = keyset('questions', 'id,unit', {'work_status': 'eq.sorted', 'embedding': 'not.is.null'})
    by_unit = {}
    for q in qs:
        if q['unit']: by_unit.setdefault(q['unit'], []).append(q['id'])

    if a.unit:
        targets = a.unit
    elif a.all:
        targets = sorted(by_unit, key=lambda u: -len(by_unit[u]))
    else:
        have = {qid for qid, _ in existing_rows()}
        targets = sorted([u for u, ids in by_unit.items() if any(i not in have for i in ids)], key=lambda u: -len(by_unit[u]))

    print(f'[대상] {len(targets)}개 단원 / 문항 {sum(len(by_unit.get(u, [])) for u in targets)}개')
    ok = fail = 0
    t0 = time.time()
    for n, unit in enumerate(targets, 1):
        try:
            t = time.time()
            rows = compute_unit(unit)
            if not a.dry_run: upsert(rows)
            ok += 1
            avg = sum(len(r['neighbors']) for r in rows) / max(1, len(rows))
            print(f'  [{n}/{len(targets)}] {unit}: {len(rows)}행 (평균 {avg:.0f}개) {time.time() - t:.1f}초')
        except Exception as e:
            fail += 1
            print(f'  ⚠ [{n}/{len(targets)}] {unit}: {str(e)[:200]}')
    print(f'총 {time.time() - t0:.0f}초')
    print(f'완료: 성공 {ok} / 실패 {fail}')


if __name__ == '__main__':
    main()
