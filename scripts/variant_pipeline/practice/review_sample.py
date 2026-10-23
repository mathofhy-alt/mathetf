# -*- coding: utf-8 -*-
"""대표 판정용 표본 20개 뽑기 (2026-10-24 — 코덱스와 상의한 결론: 전량 반복을 멈추고 대표 기준으로 채점관부터 교정)
   python review_sample.py <작업폴더> <출력 json>

  · 무작위 채택품 8 (r5, 쉬움3·유지3·어려움2) — 통과품의 실제 상태
  · 경계 사례 8 (r5 감사 불일치·r5 내부 반려·r4 감사 불일치) — 기준의 경계
  · 실제 강사 변형 4 (mine.json 의 숫자변형 2·심한 변형 2) — 기준점
  화면에는 출처·점수를 숨긴다. 20개 중 8개는 교정에 쓰지 않는 확인용(holdout) — 이 파일에만 표시하고 화면엔 없다.
"""
import json, random, re, sys
from pathlib import Path
HERE = Path(__file__).resolve().parent; VP = HERE.parent
sys.path[:0] = [str(VP), str(VP / 'mine'), str(VP.parent)]
from db import get                    # noqa: E402
from ext import split as xsplit       # noqa: E402
import hwp_math as HM                 # noqa: E402

LEVEL = {'e': '쉬움', 'k': '유지', 'h': '어려움'}
lat = lambda t: re.sub(r'⟦(.*?)⟧', lambda m: '$' + HM.to_latex(m[1]) + '$', t, flags=re.S)


def section(md, name):
    m = re.search(r'## ' + name + r'[^\n]*\n(.*?)(?=\n## |\Z)', md, re.S)
    return m[1].strip() if m else ''


def main():
    W = Path(sys.argv[1]); OUT = Path(sys.argv[2]); rnd = random.Random(1024)
    pk = {x['id']: x for x in json.load(open(W / 'picked.json', encoding='utf-8'))}
    orig = {i: (W / 'orig' / i / 'original.md').read_text(encoding='utf-8') for i in pk}
    used = set(); items = []

    def gen_item(rnd_dir, i, slot, kind):
        D = W / rnd_dir / i
        p = D / f'{slot}_problem.txt'
        if not p.is_file(): return None
        sv = json.load(open(D / f'{slot}_solve.json', encoding='utf-8')) if (D / f'{slot}_solve.json').is_file() else {}
        return {'kind': kind, 'origin': i, 'round': rnd_dir, 'slot': slot, 'level': LEVEL[slot[0]], 'unit': pk[i]['unit'],
                'original': section(orig[i], '문제'), 'variant': p.read_text(encoding='utf-8').strip(),
                'answer': sv.get('answer', ''), 'method': sv.get('method', '')}

    rows5 = {}
    for i in pk:
        f = W / 'r5' / i / 'delivery_report.json'
        if f.is_file():
            for r in json.load(open(f, encoding='utf-8')).get('rows', []):
                rows5[(i, r['slot'])] = str(r.get('eligible')) == 'True'

    # ① 경계 사례 — 먼저 고른다(원본이 겹치지 않게)
    boundary = []
    for rd in ('r5', 'r4'):
        for x in json.load(open(W / rd / 'audit' / 'audit.json', encoding='utf-8')):
            if not x.get('agree'):
                slot = x.get('slot') or next((f.name.split('_')[1].split('.')[0] for f in (W / rd / 'audit').glob(f"{x['id']}_*1.json")), '')
                boundary.append((rd, x['id'], slot, f'{rd} 감사 불일치'))
    rej = [(k, v) for k, v in rows5.items() if not v]
    rnd.shuffle(rej)
    boundary += [('r5', i, s, 'r5 내부 반려') for (i, s), _ in rej]
    for rd, i, slot, kind in boundary:
        if len([x for x in items if x['kind'] != '채택품']) >= 8: break
        if i in used or not slot: continue
        it = gen_item(rd, i, slot, kind)
        if it: items.append(it); used.add(i)

    # ② 무작위 채택품 8 — 쉬움3·유지3·어려움2
    want = {'e': 3, 'k': 3, 'h': 2}
    acc = [(i, s) for (i, s), v in rows5.items() if v]; rnd.shuffle(acc)
    for i, s in acc:
        if i in used or want.get(s[0], 0) <= 0: continue
        it = gen_item('r5', i, s, '채택품')
        if it: items.append(it); used.add(i); want[s[0]] -= 1

    # ③ 실제 강사 변형 4 — 숫자변형 2(유지로 표시)·심한 변형 2(어려움으로 표시)
    need = {'숫자변형': 2, '심한 변형': 2}
    dirs = [d for d in sorted((W / 'mine').iterdir()) if (d / 'mine.json').is_file() and d.name[:8] in pk]
    rnd.shuffle(dirs)
    for d in dirs:
        if not any(need.values()): break
        i = d.name[:8]
        if i in used: continue
        m = json.load(open(d / 'mine.json', encoding='utf-8')); meta = json.load(open(d / 'meta.json', encoding='utf-8'))
        for c in m.get('candidates', []):
            rel = c.get('relation', '')
            rel = '심한 변형' if '심한' in rel else rel
            if need.get(rel, 0) <= 0 or not c.get('answer_clean', True): continue
            cid = meta['candidates'][c['no'] - 1]['id']
            q = get('questions', select='content_xml', id='eq.' + cid)
            if not q: continue
            stem, sol = xsplit(q[0]['content_xml'] or '')
            items.append({'kind': '강사 변형', 'origin': i, 'round': 'mine', 'slot': rel, 'level': '유지' if rel == '숫자변형' else '어려움',
                          'unit': pk[i]['unit'], 'original': section(orig[i], '문제'), 'variant': lat(stem).strip(),
                          'answer': '', 'method': lat(sol).strip()[:1500], 'teacher_src': meta['candidates'][c['no'] - 1]})
            need[rel] -= 1; used.add(i); break

    rnd.shuffle(items)
    # 확인용 8 — 종류별로 고르게(채택품 3·경계 3·강사 2)
    quota = {'채택품': 3, '경계': 3, '강사 변형': 2}
    for k, it in enumerate(items):
        it['no'] = k + 1
        g = '채택품' if it['kind'] == '채택품' else '강사 변형' if it['kind'] == '강사 변형' else '경계'
        it['holdout'] = quota[g] > 0
        if it['holdout']: quota[g] -= 1
    json.dump(items, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    from collections import Counter
    print(len(items), Counter(x['kind'] for x in items), Counter(x['level'] for x in items), '확인용', sum(x['holdout'] for x in items))


if __name__ == '__main__':
    main()
