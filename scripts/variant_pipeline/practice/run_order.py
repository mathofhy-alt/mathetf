# -*- coding: utf-8 -*-
"""준비된 원본(prep_school.py)마다 변형 생성 → 대표 판정용 데이터 (2026-10-24 첫 실제 주문: 분당중앙고 25 2학기중간 공통수학2)
   python run_order.py <작업폴더> [--keep 1] [--hard 1] [--lessons <md>]
   원본마다 run.py 한 번(쉬움 0). 끝나면 <작업폴더>/order_items.json(원본·변형·정답·검산 요지·내부 채택 여부)과 시간 기록.
"""
import argparse, json, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
HERE = Path(__file__).resolve().parent; VP = HERE.parent
sys.path[:0] = [str(VP)]
import run as R   # noqa: E402
PY = sys.executable
LEVEL = {'k': '유지', 'h': '어려움'}


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('work'); ap.add_argument('--keep', default='1'); ap.add_argument('--hard', default='1')
    ap.add_argument('--lessons', default=r'C:/selfmade/변형연습_old/lessons.md')
    ap.add_argument('--spread-answers', action='store_true', help='[10/24] 세트 안에서 정답 번호가 ①~⑤ 고르게 — 객관식 원본마다 다른 번호')
    a = ap.parse_args(); W = Path(a.work); pick = json.load(open(W / 'picked.json', encoding='utf-8'))
    t0 = time.time(); times = {}
    marks = '①②③④⑤'; amap = {}
    if a.spread_answers:
        mc = [p for p in sorted(pick, key=lambda x: x['no']) if '①' in R.section((W / 'orig' / p['id'] / 'original.md').read_text(encoding='utf-8'), '문제')]
        for i, p in enumerate(mc): amap[p['id']] = f'k1 {marks[i % 5]}, h1 {marks[(i + 2) % 5]}'

    def one(p):
        D = W / 'out' / p['id']; s = time.time()
        cmd = [PY, '-X', 'utf8', str(VP / 'run.py'), str(D), str(W / 'orig' / p['id'] / 'original.md'),
               '--easy', '0', '--keep', a.keep, '--hard', a.hard, '--workers', '3', '--unit', p.get('unit', ''), '--lessons', a.lessons]
        sim = W / 'orig' / p['id'] / 'similar.md'
        if sim.is_file(): cmd += ['--similar', str(sim)]
        if p['id'] in amap: cmd += ['--answer-map', amap[p['id']]]
        r = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace', stdin=subprocess.DEVNULL, timeout=4 * 3600)
        (W / 'out' / f"{p['id']}.log").write_text((r.stdout or '')[-20000:] + (r.stderr or '')[-20000:], encoding='utf-8')
        times[p['id']] = round((time.time() - s) / 60, 1)
        return p['id']
    (W / 'out').mkdir(exist_ok=True)
    with ThreadPoolExecutor(len(pick)) as ex: list(ex.map(one, pick))

    items = []
    for p in sorted(pick, key=lambda x: x['no']):
        D = W / 'out' / p['id']; o = (W / 'orig' / p['id'] / 'original.md').read_text(encoding='utf-8')
        rep = json.load(open(D / 'delivery_report.json', encoding='utf-8')) if (D / 'delivery_report.json').is_file() else {'rows': [], 'fatal': '보고서 없음'}
        rows = {r['slot']: r for r in rep.get('rows', [])}
        for slot in sorted(rows, key=lambda s: ('kh'.index(s[0]) if s[0] in 'kh' else 9, s)):
            prob = D / f'{slot}_problem.txt'
            sv = json.load(open(D / f'{slot}_solve.json', encoding='utf-8')) if (D / f'{slot}_solve.json').is_file() else {}
            items.append({'no': len(items) + 1, 'qno': p['no'], 'origin': p['id'], 'slot': slot, 'level': LEVEL.get(slot[0], slot),
                          'unit': p['unit'], 'original': R.section(o, '문제'), 'variant': prob.read_text(encoding='utf-8').strip() if prob.is_file() else '(생성 실패)',
                          'answer': sv.get('answer', ''), 'method': sv.get('method', ''),
                          'eligible': str(rows[slot].get('eligible')) == 'True', 'attempt': rows[slot].get('attempt')})
        if not rows: items.append({'no': len(items) + 1, 'qno': p['no'], 'origin': p['id'], 'slot': '-', 'level': '-', 'unit': p['unit'],
                                   'original': R.section(o, '문제'), 'variant': '(변형 없음: ' + str(rep.get('fatal', ''))[:200] + ')', 'answer': '', 'method': '', 'eligible': False, 'attempt': ''})
    json.dump(items, open(W / 'order_items.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    stat = {'원본': len(pick), '칸': len(items), '내부 채택': sum(i['eligible'] for i in items), '첫 시도 채택': sum(i['eligible'] and str(i['attempt']) == '1' for i in items),
            '전체 분': round((time.time() - t0) / 60, 1), '원본별 분': times}
    json.dump(stat, open(W / 'order_stat.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(json.dumps(stat, ensure_ascii=False))


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
    main()
