# -*- coding: utf-8 -*-
"""변형 결과를 웹 검토 페이지(수식 렌더링)로 (2026-10-20 대표: "한글 굽기는 퀄리티 확보 후, 문제랑 해설 초안을 수식으로 웹으로 먼저")

  python scripts/variant_pipeline/render_web.py <변형 run 폴더> [--out 파일.html] [--title 이름]

원본 문제·확정 해설·출제 의도 경로 + 칸별(쉬움·유지·어려움) 문제·정답·해설·판정을 한 장에. 수식은 MathJax(SVG) 로 그린다.
"""
import argparse, html, json, re
from pathlib import Path


def load(p):
    p = Path(p)
    return json.loads(p.read_text(encoding='utf-8-sig')) if p.is_file() else None


def section(text, title):
    m = re.search(r'^## ' + re.escape(title) + r'\s*\n(.*?)(?=^## |\Z)', text, re.S | re.M)
    return m[1].strip() if m else ''


def rich(text):
    """줄 단위: $$…$$ 줄은 가운데 식, [그림: …] 은 그림 자리, ①…로 시작하는 짧은 줄은 단계 제목."""
    out = []
    for line in (text or '').replace('\r', '').split('\n'):
        s = line.strip()
        if not s:
            continue
        img = re.fullmatch(r'!\[([^\]]*)\]\((data:image/(?:png|jpeg|svg\+xml);base64,[A-Za-z0-9+/=]+)\)', s)
        if img:
            out.append(f'<figure class="img"><img src="{img[2]}" alt="{html.escape(img[1])}"><figcaption>{html.escape(img[1])}</figcaption></figure>')
            continue
        figs = re.findall(r'\[그림:\s*([^\]]*)\]', s)
        s = re.sub(r'\s*\[그림:\s*[^\]]*\]', '', s).strip()
        if s:
            e = html.escape(s, quote=False)
            if re.fullmatch(r'\$\$.*\$\$', s):
                out.append(f'<div class="eq">{e}</div>')
            elif re.match(r'^[①②③④⑤⑥⑦⑧⑨]\s', s) and len(s) < 40 and '$' not in s[:3]:
                out.append(f'<h4 class="step">{e}</h4>')
            else:
                out.append(f'<p>{e}</p>')
        for f in figs:
            out.append(f'<div class="fig"><span class="fig-k">그림</span>{html.escape(f, quote=False)}</div>')
    return '\n'.join(out)


def problem_html(text):
    """끝의 ①~⑤ 다섯 선지를 따로 한 줄로."""
    marks = list(re.finditer('[①②③④⑤]', text or ''))[-5:]
    if [m.group() for m in marks] == list('①②③④⑤'):
        body = text[:marks[0].start()].strip()
        opts = [text[m.end():marks[i + 1].start() if i < 4 else len(text)].strip() for i, m in enumerate(marks)]
        ch = ''.join(f'<li><span class="cn">{"①②③④⑤"[i]}</span> {html.escape(o, quote=False)}</li>' for i, o in enumerate(opts))
        return rich(body) + f'<ol class="choices">{ch}</ol>'
    return rich(text)


LEVEL_CLASS = {'쉬움': 'easy', '유지': 'keep', '어려움': 'hard'}


def slot_card(row, selected):
    g = row.get('generated') or {}
    lv = row.get('level', '')
    ok = row['slot'] in selected
    state = '채택' if ok else ('생성됨 · 미채택' if g.get('problem') else '보류')
    reasons = row.get('problems') or []
    rv = row.get('review') or {}
    if not ok and rv.get('reason'):
        reasons = [rv['reason']] + [r for r in reasons if r != rv['reason']]
    head = (f'<header class="card-h"><span class="lv {LEVEL_CLASS.get(lv, "")}">{html.escape(lv)}</span>'
            f'<span class="sid">{html.escape(row["slot"])}</span>'
            f'<span class="dir">{html.escape(g.get("direction", ""))}</span>'
            f'<span class="st {"ok" if ok else "no"}">{state}</span></header>')
    if not g.get('problem'):
        why = ''.join(f'<li>{html.escape(r)}</li>' for r in reasons[:3])
        return f'<article class="card held">{head}<ul class="why">{why}</ul></article>'
    parts = [head, '<div class="prob">', problem_html(g['problem']), '</div>',
             f'<div class="ans"><span>정답</span> {html.escape(str(g.get("answer", "")), quote=False)}</div>',
             '<details><summary>풀이 요지(검산용 — 해설은 문제 확정 뒤 클로드가 씀)</summary><div class="sol">', rich(g.get('solution', '')), '</div></details>']
    meta = [('원본과 달라진 점', g.get('changes')), ('난도 추정', g.get('difficulty_note'))]
    parts.append('<dl class="meta">' + ''.join(f'<dt>{k}</dt><dd>{rich(v)}</dd>' for k, v in meta if v) + '</dl>')
    if not ok and reasons:
        parts.append('<div class="why-box"><b>미채택 이유</b><ul class="why">' + ''.join(f'<li>{html.escape(r)}</li>' for r in reasons[:3]) + '</ul></div>')
    return f'<article class="card{" sel" if ok else ""}">' + '\n'.join(parts) + '</article>'


CSS = '''
/* 시험지 검토 책상: 왼쪽 정렬 단일 열, 문제는 명조(시험지), 화면 글은 고딕 */
:root{--paper:#fbfcfd;--ink:#1d2733;--sub:#5b6878;--line:#dfe5ec;--card:#ffffff;--accent:#497ab7;--teal:#3aada9;
--easy:#3aada9;--keep:#497ab7;--hard:#c0573e;--warn-bg:#fdf3ef;--fig-bg:#f1f5fa;
--serif:"Noto Serif KR","Nanum Myeongjo",serif;--sans:"IBM Plex Sans KR","Malgun Gothic",system-ui,sans-serif}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--paper:#12171d;--ink:#e3e8ee;--sub:#9aa7b6;--line:#2a333d;--card:#181f27;
--accent:#7fa6d8;--teal:#5cc5c0;--easy:#5cc5c0;--keep:#7fa6d8;--hard:#e08a72;--warn-bg:#2a1f1b;--fig-bg:#1e2731;color-scheme:dark}}
:root[data-theme="dark"]{--paper:#12171d;--ink:#e3e8ee;--sub:#9aa7b6;--line:#2a333d;--card:#181f27;
--accent:#7fa6d8;--teal:#5cc5c0;--easy:#5cc5c0;--keep:#7fa6d8;--hard:#e08a72;--warn-bg:#2a1f1b;--fig-bg:#1e2731;color-scheme:dark}
body{background:var(--paper);color:var(--ink);font-family:var(--sans);font-size:15px;line-height:1.7}
.wrap{max-width:860px;margin:0 auto;padding-inline:16px;padding-block:28px 64px;display:flex;flex-direction:column;gap:22px}
h1{font-size:1.45rem;margin:0;text-wrap:balance}h2{font-size:1.05rem;margin:0 0 8px;letter-spacing:.02em}
.src{color:var(--sub);font-size:.88rem;margin-top:4px}
.counts{display:flex;flex-wrap:wrap;gap:8px;font-size:.85rem}
.counts span{border:1px solid var(--line);border-radius:999px;padding:2px 10px;font-variant-numeric:tabular-nums}
section.orig{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:18px 20px}
.prob{font-family:var(--serif);font-size:1.02rem;line-height:1.9}
.prob p{margin:0 0 6px}
.choices{list-style:none;display:flex;flex-wrap:wrap;gap:6px 26px;padding:0;margin:10px 0 0}
.cn{color:var(--sub)}
.sol p,.meta p{margin:0 0 4px}.sol{font-size:.95rem}
.step{font-size:.92rem;margin:12px 0 4px;color:var(--accent)}
.eq{margin:6px 0 8px 1.2em;overflow-x:auto}
.fig{background:var(--fig-bg);border:1px dashed var(--line);border-radius:6px;padding:8px 12px;margin:6px 0;font-size:.85rem;color:var(--sub)}
.fig-k{font-weight:600;color:var(--accent);margin-right:8px;letter-spacing:.04em}
.route{border-left:3px solid var(--teal);padding-left:12px;margin-top:12px;font-size:.92rem}
.route b{color:var(--teal)}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 20px;display:flex;flex-direction:column;gap:10px;min-width:0}
.card.sel{border-color:var(--accent)}
.card-h{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.lv{font-size:.78rem;font-weight:700;color:#fff;border-radius:4px;padding:1px 8px;letter-spacing:.04em}
.lv.easy{background:var(--easy)}.lv.keep{background:var(--keep)}.lv.hard{background:var(--hard)}
.sid{font-family:ui-monospace,monospace;color:var(--sub);font-size:.85rem}
.dir{font-size:.9rem;font-weight:600;flex:1 1 200px;min-width:0}
.st{font-size:.8rem;border-radius:999px;padding:1px 10px;border:1px solid var(--line)}
.st.ok{color:var(--accent);border-color:var(--accent)}.st.no{color:var(--hard);border-color:var(--hard)}
.ans{font-weight:600}.ans span{color:var(--sub);font-weight:500;margin-right:6px}
details summary{cursor:pointer;color:var(--accent);font-weight:600;font-size:.92rem}
details summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.meta{display:grid;grid-template-columns:7.5em 1fr;gap:4px 12px;font-size:.86rem;color:var(--sub);margin:0}
.meta dt{font-weight:600}.meta dd{margin:0;min-width:0}
@media (max-width:520px){.meta{grid-template-columns:1fr}}
.why-box{background:var(--warn-bg);border-radius:6px;padding:8px 12px;font-size:.86rem}
.why{margin:4px 0 0;padding-left:1.2em;font-size:.86rem;color:var(--sub)}
figure.img{margin:8px 0;background:#fff;border:1px solid var(--line);border-radius:6px;padding:8px;max-width:100%}
figure.img img{display:block;max-width:100%;height:auto;margin:0 auto}
figure.img figcaption{font-size:.8rem;color:#5b6878;text-align:center;margin-top:4px}
mjx-container{max-width:100%;overflow-x:auto;overflow-y:hidden}
'''


def build(run, title=None):
    D = Path(run)
    original = (D / 'original.md').read_text(encoding='utf-8-sig')
    rep = load(D / 'delivery_report.json') or {}
    routes = load(D / 'routes.json') or {}
    selected = set(rep.get('selected_slots') or [])
    rows = rep.get('rows') or []
    src = section(original, '출처')
    name = title or '변형 검토'
    cnt = ''.join(f'<span>{lv} 채택 {sum(1 for r in rows if r.get("level") == lv and r["slot"] in selected)}/{sum(1 for r in rows if r.get("level") == lv)}</span>'
                  for lv in ('쉬움', '유지', '어려움'))
    route = ''
    if routes:
        route = (f'<div class="route"><b>출제 의도 경로</b> {html.escape(routes.get("intended", ""))} · 확신도 {html.escape(routes.get("confidence", ""))}'
                 f'<br>{html.escape(routes.get("intended_core", ""), quote=False)}</div>')
    memo = section(original, '풀이 메모')
    body = f'''<title>{html.escape(name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;600;700&family=Noto+Serif+KR:wght@400;600&display=swap">
<style>{CSS}</style>
<script>window.MathJax={{tex:{{inlineMath:[['$','$']],displayMath:[['$$','$$']]}},svg:{{fontCache:'global'}}}};</script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/mathjax/3.2.2/es5/tex-svg.js"></script>
<main class="wrap">
<header><h1>{html.escape(name)}</h1><div class="src">{html.escape(src)}</div></header>
<div class="counts">{cnt}</div>
<section class="orig"><h2>원본</h2><div class="prob">{problem_html(section(original, '문제'))}</div>
<div class="ans" style="margin-top:8px"><span>정답</span> {html.escape(section(original, '정답'), quote=False)}</div>
<details><summary>원본 해설(솔브부)</summary><div class="sol">{rich(memo)}</div></details>{route}</section>
{''.join(slot_card(r, selected) for r in rows)}
</main>'''
    return body


COMPARE_CSS = '''
.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media (max-width:820px){.pair{grid-template-columns:1fr}}
.pair>div{min-width:0;display:flex;flex-direction:column;gap:6px}
.side{font-size:.8rem;font-weight:700;letter-spacing:.04em;color:var(--sub)}
.wrap.wide{max-width:1240px}
'''


def build_compare(run_a, run_b, label_a, label_b, title):
    """[10/20 대표: 수법을 더 모아 줬을 때와 적을 때 비교] 같은 원본 두 실행을 칸별로 나란히."""
    page = build(run_a, title)
    ra, rb = load(Path(run_a) / 'delivery_report.json') or {}, load(Path(run_b) / 'delivery_report.json') or {}
    sa, sb = set(ra.get('selected_slots') or []), set(rb.get('selected_slots') or [])
    by_b = {r['slot']: r for r in rb.get('rows') or []}
    pairs = []
    for r in ra.get('rows') or []:
        other = by_b.get(r['slot'])
        pairs.append(f'<section class="pair"><div><div class="side">{html.escape(label_a)}</div>{slot_card(r, sa)}</div>'
                     f'<div><div class="side">{html.escape(label_b)}</div>{slot_card(other, sb) if other else "<p>없음</p>"}</div></section>')
    cards = ''.join(slot_card(r, sa) for r in ra.get('rows') or [])
    page = page.replace(cards, ''.join(pairs)).replace('<main class="wrap">', '<main class="wrap wide">').replace('</style>', COMPARE_CSS + '</style>', 1)
    return page


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('run'); ap.add_argument('--out'); ap.add_argument('--title')
    ap.add_argument('--compare', help='나란히 비교할 두 번째 실행 폴더'); ap.add_argument('--labels', default='A,B')
    a = ap.parse_args()
    out = Path(a.out or Path(a.run) / 'review.html')
    if a.compare:
        la, lb = (a.labels.split(',') + ['B'])[:2]
        out.write_text(build_compare(a.run, a.compare, la, lb, a.title), encoding='utf-8')
    else:
        out.write_text(build(a.run, a.title), encoding='utf-8')
    print(out)


if __name__ == '__main__':
    main()
