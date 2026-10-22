"""클로드·코덱스 분석글 나란히 보기 → compare.html (A/B 가림, 위 단추로 공개)"""
import json, os, html, random, sys
D = os.path.dirname(os.path.abspath(__file__))
ids = open(os.path.join(D, 'pilot.txt')).read().split()
E = html.escape
def render(a):
    o = [f'<h2>{E(a["title"])}</h2><h3>핵심 요약</h3><ul>' + ''.join(f'<li>{E(x)}</li>' for x in a['summary']) + '</ul>']
    for s in a['sections']:
        o.append(f'<h3>{E(s["heading"])}</h3>')
        if s.get('table'):
            t = s['table']; o.append('<table><tr>' + ''.join(f'<th>{E(h)}</th>' for h in t['head']) + '</tr>' + ''.join('<tr>' + ''.join(f'<td>{E(c)}</td>' for c in r) + '</tr>' for r in t['rows']) + '</table>')
        for p in s.get('paragraphs', []): o.append(f'<p>{E(p)}</p>')
        for it in s.get('items', []): o.append(f'<div class="it"><b>{E(it["label"])}</b><p>{E(it["text"])}</p></div>')
        if s.get('list'): o.append('<ol>' + ''.join(f'<li>{E(x)}</li>' for x in s['list']) + '</ol>')
    o.append('<h3>자주 묻는 질문</h3>' + ''.join(f'<p><b>{E(f["q"])}</b><br>{E(f["a"])}</p>' for f in a['faq']))
    return ''.join(o)
random.seed(1022); rows = []; key = []
for i in ids:
    pair = [('클로드', 'out_claude'), ('코덱스', 'out_codex')]; random.shuffle(pair)
    d = json.load(open(os.path.join(D, 'data', i + '.json'), encoding='utf-8'))
    cols = []
    for lab, (who, folder) in zip('AB', pair):
        a = json.load(open(os.path.join(D, folder, i + '.json'), encoding='utf-8'))
        cols.append(f'<div class="col"><div class="tag">{lab} <span class="who">({who})</span></div>{render(a)}</div>')
    rows.append(f'<section><h1>{E(d["school"])} {d["year"]} {d["grade"]}학년 {d["semester"]}학기 {E(d["exam_type"])} {E(d["subject"])}</h1><div class="pair">{"".join(cols)}</div></section>')
css = '''body{font-family:'Pretendard','Malgun Gothic',sans-serif;margin:0;background:#f5f6f8;color:#191f28}
header{position:sticky;top:0;background:#fff;padding:12px 20px;border-bottom:1px solid #e5e8eb;z-index:2;display:flex;gap:16px;align-items:center}
button{padding:8px 14px;border-radius:10px;border:0;background:#3AADA9;color:#fff;font-weight:700;cursor:pointer}
section{padding:24px 20px;border-bottom:8px solid #e5e8eb}h1{font-size:20px;margin:0 0 16px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}.col{background:#fff;border-radius:14px;padding:18px 22px;font-size:14.5px;line-height:1.75}
.tag{font-size:22px;font-weight:800;color:#3AADA9}.who{display:none;font-size:15px;color:#4e5968}body.show .who{display:inline}
h2{font-size:17px}h3{font-size:15.5px;margin:22px 0 6px;color:#1f7f7b}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border:1px solid #e5e8eb;padding:5px 7px;text-align:left}
.it{background:#f9fafb;border-radius:10px;padding:8px 12px;margin:8px 0}.it p{margin:4px 0 0}
@media(max-width:900px){.pair{grid-template-columns:1fr}}'''
open(os.path.join(D, 'compare.html'), 'w', encoding='utf-8').write(
    f'<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>분석글 비교</title><style>{css}</style></head><body>'
    f'<header><b>시험지 분석글 A/B 비교 — 같은 시험지 5장</b><button onclick="document.body.classList.toggle(\'show\')">누가 썼는지 보기/숨기기</button></header>{"".join(rows)}</body></html>')
print('ok')
