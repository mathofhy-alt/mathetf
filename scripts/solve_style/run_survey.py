# -*- coding: utf-8 -*-
"""쎈 단원별 정석 경로 전수조사 — 단원 하나 = 코덱스 작업자 하나 (10/20)

  python scripts/solve_style/run_survey.py --root C:/selfmade/쎈조사 --par 10
"""
import os, sys, glob, argparse
from concurrent.futures import ThreadPoolExecutor
sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'variant_pipeline'))
import run as V

ap = argparse.ArgumentParser(); ap.add_argument('--root', required=True); ap.add_argument('--par', type=int, default=10); a = ap.parse_args()
prompt = open(os.path.join(HERE, 'prompts', 'route_survey.md'), encoding='utf-8').read()
dirs = sorted(os.path.dirname(p) for p in glob.glob(os.path.join(a.root, '*', '*', 'items.jsonl')))
todo = [D for D in dirs if not (V.load(os.path.join(D, 'route.json')) and not V.garbled(os.path.join(D, 'route.json')))]
print('단원', len(dirs), '· 할 일', len(todo), flush=True)
def one(D):
    for i in range(2):
        V.codex(D, prompt, 'survey' if i == 0 else 'survey_retry', 'medium')
        p = os.path.join(D, 'route.json')
        if V.load(p) and not V.garbled(p): return
        if os.path.exists(p): os.replace(p, p + f'.bad{i}')
with ThreadPoolExecutor(a.par) as ex: list(ex.map(one, todo))
ok = sum(1 for D in dirs if V.load(os.path.join(D, 'route.json')))
print('완료', ok, '/', len(dirs), '· 코덱스', f'{V.TOK[0]:,}')
