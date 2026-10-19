# -*- coding: utf-8 -*-
"""자체제작부 「오답 원인 파고들기」 단원 문제 생성 (2026-10-18)

  python scripts/selfmade/run_unit.py <단원 폴더> [--levels 기본,중,상] [--par 12] [--only C01-기본,…]

단원 폴더에 catalog.json(1단계 결과)·source.md 가 있어야 한다. 원인 × 난이도마다 칸 하나:
생성 → 독립 풀이(답 대조) + 심사(함정 작동·난이도·시험다움·용어) → 걸리면 이유 붙여 다시(최대 3번).
"""
import os, re, sys, json, time, argparse, threading
from concurrent.futures import ThreadPoolExecutor
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'variant_pipeline'))
import run as V          # codex(), load(), same_value() 재사용
DIR = []   # 단원 폴더(unit.json: subject·unit_name)


def prompt(name, **kw):
    t = open(os.path.join(HERE, 'prompts', name + '.md'), encoding='utf-8').read()
    meta = json.load(open(os.path.join(DIR[0], 'unit.json'), encoding='utf-8')) if DIR and os.path.exists(os.path.join(DIR[0], 'unit.json')) else {'subject': '공통수학2', 'unit_name': '합성함수와 역함수'}
    t = t.replace('{SUBJECT}', meta['subject']).replace('{UNIT_NAME}', meta['unit_name'])
    for k, v in kw.items(): t = t.replace('{' + k + '}', str(v))
    return t


def slot(D, cause, level, maxtry=3):
    sid = f'{cause}-{level}'; hist = []
    for attempt in range(1, maxtry + 1):
        fb = ('\n## 이전 시도가 반려된 이유 (반드시 고쳐라)\n' + '\n'.join(f'- {h}' for h in hist[-2:]) + '\n') if hist else ''
        for f in (f'{sid}.json', f'{sid}_solve.json', f'{sid}_judge.json'):
            p = os.path.join(D, f)
            if os.path.exists(p): os.replace(p, p.replace('.json', f'.try{attempt - 1}.json'))
        V.codex(D, prompt('generate', CAUSE=cause, SLOT=sid, LEVEL=level, FEEDBACK=fb), f'{sid}_gen{attempt}')
        g = V.load(os.path.join(D, f'{sid}.json'))
        if not g or not g.get('problem'): hist.append('출력 JSON 이 없거나 problem 이 비어 있음'); continue
        open(os.path.join(D, f'{sid}_problem.txt'), 'w', encoding='utf-8').write(g['problem'])
        solve_prompt = open(os.path.join(os.path.dirname(HERE), 'variant_pipeline', 'prompts', 'solve.md'), encoding='utf-8').read().replace('{SLOT}', sid)
        with ThreadPoolExecutor(2) as ex:
            list(ex.map(lambda a: V.codex(D, a[0], a[1]), [(solve_prompt, f'{sid}_solve{attempt}'), (prompt('judge', SLOT=sid, CAUSE=cause, LEVEL=level), f'{sid}_judge{attempt}')]))
        s = V.load(os.path.join(D, f'{sid}_solve.json')) or {}; j = V.load(os.path.join(D, f'{sid}_judge.json')) or {}
        bad = []
        if V.same_value(s.get('answer_value') or s.get('answer'), g.get('answer_value') or g.get('answer')) is False:
            bad.append(f"독립 풀이 답 {s.get('answer')} ≠ 출제 답 {g.get('answer')} ({str(s.get('method'))[:200]})")
        if s.get('defects'): bad.append('결함: ' + ' / '.join(map(str, s['defects']))[:400])
        if j.get('trap_works') is False: bad.append('함정이 작동하지 않음: ' + str(j.get('trap_reason')))
        if j.get('level_ok') is False: bad.append(f'난이도가 {level} 에 맞지 않음: ' + str(j.get('level_reason')))
        if j.get('exam_like') is False: bad.append('시험 문제답지 않음: ' + str(j.get('exam_like_reason')))
        if j.get('wording'): bad.append('표현: ' + ' / '.join(map(str, j['wording'])))
        g.update(attempt=attempt, solve=s, judge=j, problems=bad)
        json.dump(g, open(os.path.join(D, f'{sid}.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        if not bad: return sid, 'PASS', attempt
        hist.append(' | '.join(bad))
    return sid, 'FAIL', maxtry


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('dir'); ap.add_argument('--levels', default='기본,중,상'); ap.add_argument('--par', type=int, default=12); ap.add_argument('--only')
    a = ap.parse_args(); D = os.path.abspath(a.dir); DIR.append(D); os.makedirs(os.path.join(D, 'logs'), exist_ok=True)
    cat = json.load(open(os.path.join(D, 'catalog.json'), encoding='utf-8'))
    jobs = [(c['id'], lv) for c in cat['causes'] for lv in a.levels.split(',')]
    if a.only: jobs = [j for j in jobs if f'{j[0]}-{j[1]}' in a.only.split(',')]
    t0 = time.time()
    with ThreadPoolExecutor(a.par) as ex:
        res = list(ex.map(lambda j: slot(D, *j), jobs))
    lines = ['| 칸 | 결과 | 시도 |', '|---|---|---|'] + [f'| {s} | {r} | {n} |' for s, r, n in res]
    lines.append(f"\nPASS {sum(r == 'PASS' for _, r, _ in res)}/{len(res)} · 코덱스 {V.TOK[0]:,} 토큰 · {(time.time() - t0) / 60:.0f}분")
    open(os.path.join(D, 'report.md'), 'w', encoding='utf-8').write('\n'.join(lines)); print('\n'.join(lines))


if __name__ == '__main__': main()
