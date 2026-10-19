# -*- coding: utf-8 -*-
"""단원 유형 체계 안 만들기 — 코덱스 작업자 (2026-10-18)

  python scripts/types/draft_types.py <작업 폴더> <단원명> [--chunks 6]

export_unit.py 로 만든 problems.json 을 조각으로 나눠 작업자 여럿이 유형 후보를 뽑고(survey),
한 명이 합쳐 types.json·types.md(대표 검토용)를 만든다(merge). 현재 태그 목록은 src/lib/concept-map.ts 에서 읽는다.
"""
import os, re, sys, json, argparse, collections
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'variant_pipeline'))
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
import run as V


def prompt(name, **kw):
    t = open(os.path.join(HERE, 'prompts', name + '.md'), encoding='utf-8').read()
    for k, v in kw.items(): t = t.replace('{' + k + '}', str(v))
    return t


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('dir'); ap.add_argument('unit'); ap.add_argument('--chunks', type=int, default=6)
    a = ap.parse_args(); D = os.path.abspath(a.dir); os.makedirs(os.path.join(D, 'logs'), exist_ok=True)
    items = json.load(open(os.path.join(D, 'problems.json'), encoding='utf-8'))
    cm = open(os.path.join(ROOT, 'src', 'lib', 'concept-map.ts'), encoding='utf-8').read()
    m = re.search(r"'" + re.escape(a.unit) + r"': \[([^\]]*)\]", cm)
    tags = re.findall(r"'([^']+)'", m.group(1)) if m else []
    if not tags:   # DB 단원 이름이 concept-map 과 다르면(등차등비수열 등) 문항에 붙은 태그로
        tags = [t.lstrip('#') for t, _ in collections.Counter(x for it in items for x in it['tags']).most_common(30)]
    cnt = {t: sum(('#' + t) in it['tags'] for it in items) for t in tags}
    open(os.path.join(D, 'current_tags.md'), 'w', encoding='utf-8').write(
        f'# 「{a.unit}」 지금 쓰는 태그 (문항 수)\n' + '\n'.join(f'- {t} ({cnt[t]})' for t in tags) + '\n')
    size = -(-len(items) // a.chunks)
    for k in range(a.chunks):
        part = items[k * size:(k + 1) * size]
        with open(os.path.join(D, f'chunk_{k + 1}.md'), 'w', encoding='utf-8') as f:
            for it in part:
                f.write(f"## P{it['n']} · 난이도 {it['difficulty']} · 현재 태그 {' '.join(it['tags'])}\n{it['text']}\n\n")
    todo = [k for k in range(1, a.chunks + 1) if not V.load(os.path.join(D, f'survey_{k}.json'))]
    with ThreadPoolExecutor(len(todo) or 1) as ex:
        list(ex.map(lambda k: V.codex(D, prompt('survey', UNIT=a.unit, K=k), f'survey_{k}'), todo))
    miss = [k for k in range(1, a.chunks + 1) if not V.load(os.path.join(D, f'survey_{k}.json'))]
    if miss: print('조각 결과 없음:', miss); return
    V.codex(D, prompt('merge', UNIT=a.unit, N=len(items), CHUNKS=a.chunks, RANGE='4~8' if len(items) < 500 else '6~12' if len(items) < 1500 else '8~16'), 'merge', effort='high')
    t = V.load(os.path.join(D, 'types.json'))
    print('유형', len(t['types']) if t else '결과 없음', '· 코덱스', f'{V.TOK[0]:,}', '토큰')


if __name__ == '__main__': main()
