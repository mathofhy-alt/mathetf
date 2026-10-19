# -*- coding: utf-8 -*-
"""자체제작부 「오답 원인 파고들기」 새 단원 1단계 — 근거 문항 모으기 + 오답 원인 카탈로그 (2026-10-19)

  python scripts/selfmade/start_unit.py <번호> <DB 단원명> <과목> <화면 단원명>
  예) python scripts/selfmade/start_unit.py 02 유리함수 공통수학2 유리함수

근거: 유형 작업 폴더 C:\\mathetf_types\\NN_단원\\problems.json 의 내신(모의고사 제외) 2023년 이후 난이도 5~9 문항 80개
→ C:\\selfmade\\오답문제집\\<번호>_<단원>\\source.md, unit.json, 코덱스가 catalog.json(오답 원인 10~14개) 작성.
그다음: run_unit.py <폴더> (원인×기본·중·상 생성·풀이·심사) → typeset_unit.py (조판) → 굽기.
"""
import os, sys, json, glob, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'variant_pipeline'))
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
import run as V

MOCK = ('모의고사', '전국연합', '평가원', '수능', '사관', '경찰')


def main():
    no, unit, subject, name = sys.argv[1:5]
    src = glob.glob(rf'C:\mathetf_types\*_{unit}\problems.json')[0]
    P = json.load(open(src, encoding='utf-8'))
    def ok(p):
        bits = p['src'].split()
        try: y = int(bits[1])
        except Exception: return False
        d = int(p['difficulty'] or 0) if str(p['difficulty']).isdigit() else 0
        return not any(k in p['src'] for k in MOCK) and y >= 2023 and 5 <= d <= 9
    pool = [p for p in P if ok(p)]; random.Random(1019).shuffle(pool)
    pick = sorted(pool[:80], key=lambda p: -int(p['difficulty']))
    D = rf'C:\selfmade\오답문제집\{no}_{unit}'; os.makedirs(os.path.join(D, 'logs'), exist_ok=True)
    json.dump({'subject': subject, 'unit': unit, 'unit_name': name}, open(os.path.join(D, 'unit.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    with open(os.path.join(D, 'source.md'), 'w', encoding='utf-8') as f:
        f.write(f'# {subject} {name} — 내신 고난도 문항 {len(pick)}개 (2023~, 난이도 5~9)\n\n')
        for k, p in enumerate(pick, 1): f.write(f"## S{k:02d} — {p['src']} · 난이도 {p['difficulty']}\n{p['text']}\n\n")
    tmpl = open(r'C:\selfmade\오답문제집\01_합성함수와역함수\step1_catalog_prompt.md', encoding='utf-8').read()
    tmpl = tmpl.replace('공통수학2 「합성함수와 역함수」', f'{subject} 「{name}」').replace('「합성함수와 역함수」', f'「{name}」').replace('80개', f'{len(pick)}개')
    open(os.path.join(D, 'step1_catalog_prompt.md'), 'w', encoding='utf-8').write(tmpl)
    print('근거 문항', len(pick), '/ 후보', len(pool), '→', D, flush=True)
    V.codex(D, tmpl, 'step1')
    c = V.load(os.path.join(D, 'catalog.json'))
    print('오답 원인', len(c['causes']) if c else '결과 없음', [x['name'] for x in (c or {}).get('causes', [])])


if __name__ == '__main__': main()
