# -*- coding: utf-8 -*-
"""학생 시험지 스캔으로 실제 오답 원인 조사 (2026-10-19, 대표 제안 — 자체제작 원인을 상상 말고 실제 근거로)

  python scripts/selfmade/scan_survey.py --pick 30 --filter "수학(하)|공통수학2" --term 2기말 --out C:\\selfmade\\오답조사\\pilot [--par 4]

D:\\Dropbox\\홈페이지 자료\\내신 의 *_원본.pdf / *_원본제보.pdf(학생 스캔) → 파일 이름으로 DB source_db_id 를 찾아
key.md(문항별 정답·해설·단원·유형)를 만들고, 코덱스 작업자가 스캔을 직접 보며 문항별 학생 답·채점·흔적·틀린 지점을 survey.json 에 쓴다.
"""
import os, re, sys, json, glob, random, argparse, shutil, collections
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'variant_pipeline')); sys.path.insert(0, ROOT); sys.path.insert(0, os.path.dirname(HERE))
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
import run as V
import similar_rerank_prepare as P

SRC = r'D:\Dropbox\홈페이지 자료\내신'
NAME = re.compile(r'(?:up_)?[^_]+_[^_]+_(\d{4})년_(\d)(중간|기말)_(.+?)(\d)_(.+?)_(?:원본제보|원본)\.pdf$')


def source_id(fn):
    m = NAME.search(os.path.basename(fn))
    if not m: return None
    y, s, k, school, g, subj = m.groups()
    return f'{school}_{y}_{s}학기{k}_{subj}', f'{school}_{y}_{s}학기{k}_{g}학년_{subj}'


def key_md(sid):
    rows = P.get('questions', {'select': 'id,question_number,unit,content_xml', 'source_db_id': 'eq.' + sid, 'order': 'question_number', 'limit': 60})
    if not rows: return None, 0
    T = {x['question_id']: x for x in P.get('question_types', {'select': 'question_id,unit,code', 'question_id': 'in.(' + ','.join(r['id'] for r in rows) + ')'})}
    D = {(d['unit'], d['code']): d['name'] for d in P.get('question_type_defs', {'select': 'unit,code,name', 'unit': 'in.(' + ','.join(sorted({r['unit'] for r in rows if r['unit']})) + ')'})}
    out = [f'# {sid} — 문항별 정답·해설(홈페이지 DB)\n']
    for r in rows:
        t = T.get(r['id']); tn = D.get((t['unit'], t['code'])) if t else None
        out.append(f"## {r['question_number']}번 · 단원 {r['unit']} · 유형 {tn or '-'}\n{P.text_of(r, 1500)}\n")
    return '\n'.join(out), len(rows)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--pick', type=int, default=30); ap.add_argument('--filter', default=''); ap.add_argument('--term', default='')
    ap.add_argument('--out', required=True); ap.add_argument('--par', type=int, default=4); a = ap.parse_args()
    files = [f for f in glob.glob(os.path.join(SRC, '**', '*.pdf'), recursive=True) if re.search(r'_(원본|원본제보)\.pdf$', f)]
    if a.filter: files = [f for f in files if re.search(a.filter, os.path.basename(f))]
    if a.term: files = [f for f in files if a.term in os.path.basename(f)]
    random.Random(1019).shuffle(files)
    jobs = []
    for f in files:
        if len(jobs) >= a.pick: break
        ids = source_id(f)
        if not ids: continue
        md = n = None
        for sid in ids:
            md, n = key_md(sid)
            if md: break
        if not md: continue
        D = os.path.join(a.out, f'{len(jobs) + 1:04d}_' + re.sub(r'[^\w가-힣()]+', '_', os.path.basename(f))[:60]); os.makedirs(os.path.join(D, 'logs'), exist_ok=True)
        if not V.load(os.path.join(D, 'survey.json')): shutil.copy(f, os.path.join(D, 'scan.pdf'))
        open(os.path.join(D, 'key.md'), 'w', encoding='utf-8').write(md)
        json.dump({'file': f, 'source_db_id': sid, 'n': n}, open(os.path.join(D, 'meta.json'), 'w', encoding='utf-8'), ensure_ascii=False)
        jobs.append(D)
    print('시험지', len(jobs), '→', a.out, flush=True)
    prompt = open(os.path.join(HERE, 'prompts', 'scan_survey.md'), encoding='utf-8').read()
    todo = [D for D in jobs if not V.load(os.path.join(D, 'survey.json'))]
    with ThreadPoolExecutor(a.par) as ex:
        def one(D):
            V.codex(D, prompt, 'survey', effort='medium')
            if V.load(os.path.join(D, 'survey.json')):   # C 드라이브 여유가 적다 — 다 읽은 스캔 복사본은 지운다(원본은 Dropbox, meta.json 에 경로)
                try: os.remove(os.path.join(D, 'scan.pdf'))
                except OSError: pass
        list(ex.map(one, todo))
    # 집계
    c = collections.Counter(); marks = collections.Counter(); wrong = 0; rows = []
    for D in jobs:
        s = V.load(os.path.join(D, 'survey.json'))
        if not s: continue
        marks[s.get('marks')] += 1
        for it in s.get('items', []):
            if it.get('result') == '틀림':
                wrong += 1; c[it.get('cause') or '?'] += 1
                rows.append({'exam': os.path.basename(D), **it})
    json.dump(rows, open(os.path.join(a.out, 'wrong_items.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('흔적', dict(marks), '· 틀린 문항', wrong, '· 코덱스', f'{V.TOK[0]:,}')
    for k, v in c.most_common(25): print(f'{v:4d}  {k}')


if __name__ == '__main__': main()
