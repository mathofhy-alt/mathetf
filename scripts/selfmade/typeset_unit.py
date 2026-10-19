# -*- coding: utf-8 -*-
"""자체제작부 3단계 — PASS 한 문제를 난이도별 문제집 원고로 (2026-10-18)

  python scripts/selfmade/typeset_unit.py <단원 폴더> --keys s101,s102,s103 --subject 공통수학2 --unit 합성함수와역함수 --logdir <폴더>

기본·중·상 한 장씩: ① C:\\gpt_solve\\자체원본\\<이름>.md(원인 순서) ② queue.json 항목 ③ codex 작업자가 content/figures 를 만들고
검사전부(발문대조 제외)를 통과시킨다. 굽기는 본 세션이: cd C:\\gpt_solve\\tools && python -X utf8 굽기.py s101 … --force
"""
import os, re, sys, json, time, argparse
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'variant_pipeline'))
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
import typeset as TS          # CODEX·TOOLS·STAGE·load 재사용

SRCDIR = os.path.join(TS.GS, '자체원본'); LEVELS = ['기본', '중', '상']


def build_src(D, level, unit):
    cat = TS.load(os.path.join(D, 'catalog.json'))['causes']
    name = f'자체_오답원인_{unit}_{level}'
    lines = [f'# {name}', f'수학ETF 자체 문제집 「오답 원인 파고들기」 · {unit} · {level}', '']
    n = 0
    for c in cat:
        p = os.path.join(D, f"{c['id']}-{level}.json")
        g = TS.load(p) if os.path.exists(p) else None
        if not g or g.get('problems'): continue          # 심사 통과분만
        n += 1
        lines += [f"## {n}번 (노리는 실수: {c['name']})", '### 문제', g['problem'], '', '### 정답', str(g['answer']), '', '### 해설', g.get('solution', ''), '']
    os.makedirs(SRCDIR, exist_ok=True)
    path = os.path.join(SRCDIR, name + '.md'); open(path, 'w', encoding='utf-8').write('\n'.join(lines))
    return name, path, n


def add_queue(key, name, path, subject, unit, level):
    qp = os.path.join(TS.TOOLS, 'queue.json'); q = json.load(open(qp, encoding='utf-8'))
    q['items'] = [it for it in q['items'] if it['key'] != key]
    q['items'].append({'key': key, 'src': path, 'status': '대기', 'outname': name, 'region': '자체제작', 'school': f'오답원인 {level}',
                       'year': '2026년', 'grade': '', 'term': '', 'exam': '자체문제집', 'subject': subject,
                       'mod': f'content_{key}', 'figmodule': f'figures_{key}', 'figdir': f'figs_{key}', 'filler': f'filler_{key}.json',
                       'range': unit, 'note': '자체제작부 오답 원인 문제집(2026-10-18) — 원본 PDF 없음, 발문대조 제외'})
    json.dump(q, open(qp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


def worker(key, name, path, n, subject, unit, logdir):
    p = open(os.path.join(HERE, 'prompts', 'typeset.md'), encoding='utf-8').read()
    note = TS.STAGE.get(subject, subject) + f' — 단원 {unit}. 본풀이는 이 과목 범위 안에서만, 위 단계 도구는 [별해].'
    p = p.replace('{KEY}', key).replace('{NAME}', name).replace('{SRC}', path).replace('{SUBJECT_NOTE}', note).replace('{N}', str(n))
    t = time.time()
    r = TS.subprocess.run(TS.CODEX + ['exec', '--skip-git-repo-check', '-m', 'gpt-6.1-sol', '-c', 'notify=[]', '-c', 'mcp_servers={}', '--sandbox', 'workspace-write',
                          '-C', TS.TOOLS, '-o', os.path.join(logdir, f'{key}_report.md'), p],
                          capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=4 * 3600)
    out = (r.stdout or '') + (r.stderr or ''); open(os.path.join(logdir, f'{key}.log'), 'w', encoding='utf-8').write(out)
    m = re.search(r'tokens used\s*\n\s*([\d,]+)', out)
    print(f"{time.strftime('%H:%M')} {key} 종료코드 {r.returncode} · {m.group(1) if m else '?'} 토큰 · {(time.time() - t) / 60:.0f}분", flush=True)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('dir'); ap.add_argument('--keys', required=True); ap.add_argument('--subject', required=True)
    ap.add_argument('--unit', required=True); ap.add_argument('--logdir', required=True); a = ap.parse_args()
    os.makedirs(a.logdir, exist_ok=True); jobs = []
    for key, level in zip(a.keys.split(','), LEVELS):
        name, path, n = build_src(os.path.abspath(a.dir), level, a.unit)
        add_queue(key, name, path, a.subject, a.unit, level); jobs.append((key, name, path, n)); print(key, name, n, '문항')
    with ThreadPoolExecutor(len(jobs)) as ex:
        list(ex.map(lambda j: worker(*j, a.subject, a.unit, a.logdir), jobs))


if __name__ == '__main__': main()
