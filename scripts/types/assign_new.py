# -*- coding: utf-8 -*-
"""새로 등록된 문항에 대표 유형 붙이기 — 등록 배치 후속 단계용 (2026-10-19, 파싱 세션 mathetf-cc 연동)

  python scripts/types/assign_new.py <source_db_id> [<source_db_id> …]
  python scripts/types/assign_new.py --pending          지난번에 못 한 문항(대기 목록)만 다시

- 대상: 그 source_db_id 문항 중 아직 question_types 에 없는 sorted/private 문항.
- 단원은 문항의 unit 칸에서 읽는다(source_db_id 를 쪼개지 않음 — '학교_연도_학기_N학년_과목' 형식도 그대로).
- 유형은 C:\\mathetf_types\\NN_단원\\types.json 목록 안에서만 고른다(새로 만들지 않음). 유형 안이 없는 단원은 건너뛰고 대기 목록에 적는다.
- 등록 시점에는 단원을 옮기지 않는다(내신은 과목 고정 — 대표 10/19). 맞는 유형이 정말 없으면 X(넣지 않음).
- 코덱스(gpt-6.1-sol, medium) 단원 묶음(200문항)당 한 명, 호출당 15분 제한. DB 요청은 60초 제한.
- 실패해도 종료코드 0(배치를 막지 않음). 못 한 문항은 C:\\mathetf_types\\_pending_new.json 에 쌓인다.
출력 마커(마지막 줄): `TYPES_DONE ok=<넣은 수> skip=<X·이미 있음> pending=<대기 수>`
"""
import os, re, sys, json, glob, time, shutil, argparse, subprocess, requests, urllib3
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__)); BASE = r'C:\mathetf_types'; ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.dirname(HERE)); sys.path.insert(0, HERE)
try: sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
except Exception: pass
urllib3.disable_warnings()
import similar_rerank_prepare as P          # get()(60초 제한·재시도), text_of(), URL·H
from assign_types import UNITS

PENDING = os.path.join(BASE, '_pending_new.json')
UORD = {u: i + 1 for i, u in enumerate(json.load(open(os.path.join(HERE, 'unit_order.json'), encoding='utf-8')))}   # 교과서 순 (10/19)
NPM = subprocess.run('npm root -g', shell=True, capture_output=True, text=True).stdout.strip()
CODEX = [shutil.which('node'), os.path.join(NPM, '@openai', 'codex', 'bin', 'codex.js')]
PROMPT = '''너는 고등학교 수학 강사다. 「{UNIT}」 단원 유형 체계(`types.json` — 유형 목록·설명·boundary_rules)가 확정돼 있다. `{PART}` 의 문항마다 **대표 유형 하나**를 붙인다.
1. `types.json` 을 끝까지 읽는다(boundary_rules 는 그대로 따른다).
2. 문항을 하나씩 직접 읽고([문제]와 [해설]) 답을 결정하는 핵심 풀이로 유형 code 를 고른다. 보기 ㄱㄴㄷ 은 실제 풀이로, 독립 소문항은 boundary_rules 의 대표 선정 규칙으로.
3. 목록 안 유형만 쓴다. 정말 맞는 유형이 없으면 code "X" 와 이유.
출력 `{OUT}` (UTF-8, ensure_ascii=False, 쓴 뒤 다시 읽어 확인): {{"Q1": {{"code": "T05", "sure": "high|mid|low", "why": "한 줄"}}, …}} — 모든 번호가 있어야 한다. 다른 파일은 만들지 마라. 끝나면 "완료" 한 줄만.'''


def unit_dir(unit):
    g = [d for d in glob.glob(os.path.join(BASE, '*_' + unit)) if os.path.exists(os.path.join(d, 'types.json'))]
    return g[0] if g else None


def codex(D, prompt, tag):
    try:
        r = subprocess.run(CODEX + ['exec', '--skip-git-repo-check', '-m', 'gpt-6.1-sol', '-c', 'model_reasoning_effort=medium', '-c', 'notify=[]',
                                    '-c', 'mcp_servers={}', '--sandbox', 'workspace-write', '-C', D, prompt],
                           capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=900)
        os.makedirs(os.path.join(D, 'logs'), exist_ok=True)
        open(os.path.join(D, 'logs', tag + '.log'), 'w', encoding='utf-8').write((r.stdout or '') + (r.stderr or ''))
    except Exception as e:
        print('  코덱스 실패', tag, type(e).__name__, flush=True)


def upsert(rows):
    for j in range(0, len(rows), 500):
        r = requests.post(f'{P.URL}/rest/v1/question_types', headers={**P.H, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates,return=minimal'},
                          data=json.dumps(rows[j:j + 500], ensure_ascii=False).encode(), verify=False, timeout=60)
        if r.status_code >= 300: raise RuntimeError(f'question_types {r.status_code} {r.text[:200]}')


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('sources', nargs='*'); ap.add_argument('--pending', action='store_true'); a = ap.parse_args()
    pend = json.load(open(PENDING, encoding='utf-8')) if os.path.exists(PENDING) else []
    ok = skip = 0; left = []
    try:
        ids = []
        if a.pending: ids = list(dict.fromkeys(pend)); pend = []
        for s in a.sources:
            ids += [r['id'] for r in P.get('questions', {'select': 'id', 'source_db_id': 'eq.' + s, 'work_status': 'in.(sorted,private)', 'limit': 2000})]
        have = set()
        for j in range(0, len(ids), 100):
            have |= {r['question_id'] for r in P.get('question_types', {'select': 'question_id', 'question_id': 'in.(' + ','.join(ids[j:j + 100]) + ')'})}
        todo = [i for i in ids if i not in have]; skip += len(ids) - len(todo)
        rows = []
        for j in range(0, len(todo), 40):
            rows += P.get('questions', {'select': 'id,unit,content_xml', 'id': 'in.(' + ','.join(todo[j:j + 40]) + ')'})
        by = {}
        for r in rows: by.setdefault((r.get('unit') or '').strip(), []).append(r)
        jobs = []
        for unit, rs in by.items():
            D = unit_dir(unit)
            if not D: left += [r['id'] for r in rs]; print('  유형 안 없는 단원', unit or '(빈 단원)', len(rs), flush=True); continue
            for k in range(0, len(rs), 200):
                part = rs[k:k + 200]; tag = f'new_{int(time.time())}_{k // 200}'
                key = {f'Q{n + 1}': r['id'] for n, r in enumerate(part)}
                with open(os.path.join(D, tag + '.md'), 'w', encoding='utf-8') as f:
                    for q, r in zip(key, part): f.write(f'## {q}\n{P.text_of(r, 600)}\n\n')
                jobs.append((unit, D, tag, key))
        with ThreadPoolExecutor(min(3, max(1, len(jobs)))) as ex:   # 등록 배치 중 PC 부담 — 동시 3개까지(10/19)
            list(ex.map(lambda j: codex(j[1], PROMPT.format(UNIT=j[0], PART=j[2] + '.md', OUT=j[2] + '.json'), j[2]), jobs))
        out = []
        for unit, D, tag, key in jobs:
            T = json.load(open(os.path.join(D, 'types.json'), encoding='utf-8-sig'))['types']; tord = {t['code']: n + 1 for n, t in enumerate(T)}
            try: res = json.load(open(os.path.join(D, tag + '.json'), encoding='utf-8-sig'))
            except Exception: res = {}
            for q, qid in key.items():
                v = res.get(q) or {}
                if v.get('code') in tord: out.append({'question_id': qid, 'unit': unit, 'code': v['code'], 'sure': v.get('sure'), 'sort_key': UORD.get(unit, 99) * 100 + tord[v['code']]})
                elif v.get('code') == 'X': skip += 1
                else: left.append(qid)
        if out: upsert(out); ok = len(out)
    except Exception as e:
        print('  오류', type(e).__name__, str(e)[:200], flush=True)
        if not ok: left += locals().get('todo') or locals().get('ids') or []   # 못 넣었으면 대상 전부를 대기로
    json.dump(list(dict.fromkeys(pend + left)), open(PENDING, 'w', encoding='utf-8'))
    print(f'TYPES_DONE ok={ok} skip={skip} pending={len(set(pend + left))}', flush=True)


if __name__ == '__main__': main()
