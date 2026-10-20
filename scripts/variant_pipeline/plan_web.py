# -*- coding: utf-8 -*-
"""설계만 뽑은 두 실행(plan.json)을 나란히 (2026-10-21 대표: "수법이 많으면 변형도 많이 뽑을 수 있는 거 아니냐")

  python scripts/variant_pipeline/plan_web.py <A 폴더> <B 폴더> --labels "A,B" --title 이름 --out 파일.html
"""
import argparse, html, json
from pathlib import Path

E = lambda s: html.escape(str(s or ''), quote=False)
CSS = '''
/* 두 설계 목록을 나란히 — 한 줄 = 설계 하나 */
:root{--bg:#f7f9fb;--ink:#1c2631;--sub:#5d6a79;--line:#dde4eb;--card:#fff;--accent:#497ab7;--hold:#c0573e;
--sans:"IBM Plex Sans KR","Malgun Gothic",system-ui,sans-serif}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#11161c;--ink:#e2e8ee;--sub:#9aa7b5;--line:#29323c;--card:#171e26;--accent:#80a7d9;--hold:#e08a72;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#11161c;--ink:#e2e8ee;--sub:#9aa7b5;--line:#29323c;--card:#171e26;--accent:#80a7d9;--hold:#e08a72;color-scheme:dark}
body{background:var(--bg);color:var(--ink);font-family:var(--sans);font-size:14px;line-height:1.6}
.wrap{max-width:1240px;margin:0 auto;padding-inline:16px;padding-block:28px 64px;display:flex;flex-direction:column;gap:16px}
h1{font-size:1.35rem;margin:0}.lead{color:var(--sub);margin:0;max-width:70ch}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:14px}@media (max-width:820px){.cols{grid-template-columns:1fr}}
.col{min-width:0;display:flex;flex-direction:column;gap:8px}
.col h2{font-size:1rem;margin:0;color:var(--accent)}
.it{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px 12px;min-width:0}
.it.hold{border-color:var(--hold)}
.id{font-family:ui-monospace,monospace;color:var(--sub);font-size:.8rem;margin-right:6px}
.dir{font-weight:600}.chg{margin:4px 0 0}.ds{color:var(--sub);font-size:.85rem;margin:4px 0 0}
.tag{font-size:.75rem;border:1px solid var(--hold);color:var(--hold);border-radius:999px;padding:0 8px;margin-left:6px}
'''


def items(run):
    p = json.loads((Path(run) / 'plan.json').read_text(encoding='utf-8-sig'))
    out = []
    for s in p.get('slots', []):
        hold = s.get('design_status') != '진행' or s.get('usage_target') != '시험용'
        out.append(f'''<div class="it{' hold' if hold else ''}"><span class="id">{E(s.get('id'))}</span><span class="dir">{E(s.get('direction'))}</span>{'<span class="tag">보류</span>' if hold else ''}
<p class="chg"><b>바꾸는 것</b> {E(s.get('changed_condition'))}</p><p class="ds">{E(s.get('design'))}</p>{('<p class="ds">보류 이유: ' + E(s.get('hold_reason')) + '</p>') if hold and s.get('hold_reason') else ''}</div>''')
    return out, sum(1 for s in p.get('slots', []) if s.get('design_status') == '진행' and s.get('usage_target') == '시험용')


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('a'); ap.add_argument('b'); ap.add_argument('--labels', default='A,B')
    ap.add_argument('--title', default='변형 설계 비교'); ap.add_argument('--out', required=True); a = ap.parse_args()
    la, lb = (a.labels.split(',') + ['B'])[:2]
    ia, na = items(a.a); ib, nb = items(a.b)
    page = f'''<title>{E(a.title)}</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;600&display=swap"><style>{CSS}</style>
<main class="wrap"><h1>{E(a.title)}</h1><p class="lead">문제를 완성하기 전, 숫자변형 설계만 12개씩 뽑아 비교합니다. 겹치는 설계가 적은 쪽이 같은 원본에서 변형을 더 많이 뽑을 수 있는 쪽입니다.</p>
<div class="cols"><section class="col"><h2>{E(la)} · 진행 {na}개</h2>{''.join(ia)}</section><section class="col"><h2>{E(lb)} · 진행 {nb}개</h2>{''.join(ib)}</section></div></main>'''
    Path(a.out).write_text(page, encoding='utf-8'); print(a.out)


if __name__ == '__main__':
    main()
