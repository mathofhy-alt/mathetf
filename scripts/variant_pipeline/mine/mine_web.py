# -*- coding: utf-8 -*-
"""변형 캐기 결과(scratch/variant_mine/*/mine.json) → 단원별 변형 수법집 웹페이지 (2026-10-20)

  python scripts/variant_pipeline/mine/mine_web.py [--dir scratch/variant_mine] --out 파일.html
"""
import argparse, collections, html, json
from pathlib import Path

E = lambda s: html.escape(str(s or ''), quote=False)
REL = {'숫자변형': 'num', '심한 변형': 'heavy', '같은 문제': 'same', '다른 문제': 'other'}

CSS = '''
/* 단원별 수법집: 왼쪽 단원 목차 없이 단일 열, 원본마다 한 장 */
:root{--bg:#f7f9fb;--ink:#1c2631;--sub:#5d6a79;--line:#dde4eb;--card:#fff;--accent:#497ab7;--teal:#2f9c98;--heavy:#c0573e;--chip:#eef3f8;
--sans:"IBM Plex Sans KR","Malgun Gothic",system-ui,sans-serif}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#11161c;--ink:#e2e8ee;--sub:#9aa7b5;--line:#29323c;--card:#171e26;--accent:#80a7d9;--teal:#5cc5c0;--heavy:#e08a72;--chip:#1f2833;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#11161c;--ink:#e2e8ee;--sub:#9aa7b5;--line:#29323c;--card:#171e26;--accent:#80a7d9;--teal:#5cc5c0;--heavy:#e08a72;--chip:#1f2833;color-scheme:dark}
body{background:var(--bg);color:var(--ink);font-family:var(--sans);font-size:14.5px;line-height:1.65}
.wrap{max-width:960px;margin:0 auto;padding-inline:16px;padding-block:28px 64px;display:flex;flex-direction:column;gap:20px}
h1{font-size:1.4rem;margin:0}h2{font-size:1.1rem;margin:18px 0 0;color:var(--accent)}
.lead{color:var(--sub);margin:4px 0 0;max-width:65ch}
.sum{display:flex;flex-wrap:wrap;gap:8px}.sum span{border:1px solid var(--line);border-radius:999px;padding:2px 12px;font-variant-numeric:tabular-nums;font-size:.85rem}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 18px;display:flex;flex-direction:column;gap:10px;min-width:0}
.card h3{margin:0;font-size:1rem}.sk{font-size:.9rem;color:var(--sub)}
.sk b{color:var(--ink)}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:14px}@media (max-width:700px){.cols{grid-template-columns:1fr}}
.cols>div{min-width:0}.cols h4{margin:0 0 4px;font-size:.85rem;letter-spacing:.03em}
.cols ul{margin:0;padding-left:1.1em;font-size:.88rem}
.h4n{color:var(--teal)}.h4h{color:var(--heavy)}
.tbl{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:.84rem}
th,td{border-top:1px solid var(--line);padding:5px 8px;text-align:left;vertical-align:top}
th{color:var(--sub);font-weight:600;white-space:nowrap}
.rel{white-space:nowrap;font-weight:600}.rel.num{color:var(--teal)}.rel.heavy{color:var(--heavy)}.rel.same,.rel.other{color:var(--sub)}
details summary{cursor:pointer;color:var(--accent);font-size:.88rem}
details summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
'''


def card(meta, j):
    s = meta['src']
    cands = meta['candidates']
    cnt = collections.Counter(c.get('relation') for c in j.get('candidates', []))
    rows = []
    for c in j.get('candidates', []):
        k = c.get('no', 0) - 1
        m = cands[k] if 0 <= k < len(cands) else {}
        rel = c.get('relation', '')
        what = c.get('heavy_what') if rel == '심한 변형' else '; '.join(c.get('knobs') or [])
        brk = c.get('breaks_at', '')
        rows.append(f"<tr><td>{c.get('no')}</td><td>{E(m.get('school'))} {E(m.get('year'))}<br><small>{E(m.get('semester'))} {E(m.get('question_number'))}번</small></td>"
                    f"<td class=\"rel {REL.get(rel, '')}\">{E(rel)}{(' · ' + E(c.get('heavy_kind'))) if c.get('heavy_kind') else ''}</td>"
                    f"<td>{E(what)}{('<br><small>막히는 곳: ' + E(brk) + '</small>') if brk else ''}</td></tr>")
    kn = ''.join(f'<li>{E(x)}</li>' for x in j.get('knob_catalog', []))
    hv = ''.join(f'<li>{E(x)}</li>' for x in j.get('heavy_catalog', [])) or '<li>이 목록에는 없음</li>'
    sg = ''.join(f'<li>{E(x)}</li>' for x in j.get('suggested', []))
    tally = ' · '.join(f'{k} {v}' for k, v in cnt.items())
    return f'''<article class="card"><h3>{E(s['school'])} {E(s['year'])} {E(s['semester'])} {E(s['grade'])} {E(s['question_number'])}번 <small style="color:var(--sub)">난이도 {E(s['difficulty'])} · {tally}</small></h3>
<div class="sk"><b>풀이 뼈대</b> {E(j.get('skeleton'))}</div>
<div class="cols"><div><h4 class="h4n">숫자변형 손잡이</h4><ul>{kn}</ul></div><div><h4 class="h4h">심한 변형 수법</h4><ul>{hv}</ul></div></div>
{('<details><summary>후보에 없지만 자연스러운 아이디어</summary><ul>' + sg + '</ul></details>') if sg else ''}
<details><summary>후보별 판정 {len(rows)}개</summary><div class="tbl"><table><thead><tr><th>#</th><th>학교</th><th>판정</th><th>무엇이 바뀌었나</th></tr></thead><tbody>{''.join(rows)}</tbody></table></div></details></article>'''


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--dir', default='scratch/variant_mine'); ap.add_argument('--out', required=True)
    a = ap.parse_args()
    by_unit = collections.defaultdict(list); tot = collections.Counter()
    for d in sorted(Path(a.dir).iterdir()):
        if not (d / 'mine.json').is_file(): continue
        meta = json.loads((d / 'meta.json').read_text(encoding='utf-8-sig')); j = json.loads((d / 'mine.json').read_text(encoding='utf-8-sig'))
        by_unit[meta['src']['unit']].append(card(meta, j))
        tot.update(c.get('relation') for c in j.get('candidates', []))
    n = sum(len(v) for v in by_unit.values())
    body = [f'<title>변형 수법집</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;600&display=swap"><style>{CSS}</style>',
            '<main class="wrap"><header><h1>변형 수법집</h1><p class="lead">모의고사 원본마다 사이트 「유사」 목록의 실제 학교 변형을 코덱스가 대조해 숫자변형(돌린 손잡이)과 심한 변형(장치 바꾸기·뼈대 깊게)으로 가른 것입니다. 틀린 판정을 짚어 주시면 기준에 반영합니다.</p></header>',
            '<div class="sum">' + f'<span>원본 {n}개</span>' + ''.join(f'<span>{E(k)} {v}</span>' for k, v in tot.most_common()) + '</div>']
    for u in sorted(by_unit):
        body.append(f'<h2>{E(u)}</h2>' + ''.join(by_unit[u]))
    body.append('</main>')
    Path(a.out).write_text('\n'.join(body), encoding='utf-8'); print(a.out)


if __name__ == '__main__':
    main()
