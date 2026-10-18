# -*- coding: utf-8 -*-
"""변형 세트 → gpt_solve 원고 → (본 세션이) 굽기 (2026-10-18, 3라운드)

  python scripts/variant_pipeline/typeset.py <변형 run 폴더 …> --keys e901,e902,…

변형 run 폴더마다: ① 6문항(e1,e2,k1,k2,h1,h2 순)을 C:\\gpt_solve\\변형원본\\<이름>.md 로 쓰고
② queue.json 에 열쇠 항목을 넣고 ③ codex 작업자가 content/figures 를 만들어 검사전부(발문대조 제외)를 통과시킨다.
굽기는 따로: cd C:\\gpt_solve\\tools && python -X utf8 굽기.py e901 … --force
"""
import os, re, sys, json, shutil, argparse, subprocess, time
from concurrent.futures import ThreadPoolExecutor
try: sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
except Exception: pass
HERE = os.path.dirname(os.path.abspath(__file__))
GS = r'C:\gpt_solve'; TOOLS = os.path.join(GS, 'tools'); SRCDIR = os.path.join(GS, '변형원본')
NPM = subprocess.run('npm root -g', shell=True, capture_output=True, text=True).stdout.strip()
CODEX = [shutil.which('node'), os.path.join(NPM, '@openai', 'codex', 'bin', 'codex.js')]
STAGE = {'공통수학1': '공통수학1 = STAGE 1', '공통수학2': '공통수학2 = STAGE 2', '대수': '대수 = STAGE 3', '수학I': '수학Ⅰ = STAGE 3',
         '수학II': '수학Ⅱ = STAGE 4', '미적분I': '미적분Ⅰ = STAGE 4', '미적분': '미적분 = STAGE 5'}
ORDER = ['e1', 'e2', 'k1', 'k2', 'h1', 'h2']; LEVEL = {'e': '쉬움', 'k': '유지', 'h': '어려움'}


def load(p): return json.loads(open(p, 'rb').read().decode('utf-8-sig'))


def build_src(run, meta):
    src = meta['source_db_id']; no = meta['question_number']
    name = re.sub(r'[\\/:*?"<>| ]', '_', f"변형_{src}_{no}번")
    lines = [f'# {name}', f'원본: {src} {no}번 · {meta["unit"]} · 난이도 {meta["difficulty"]}', '']
    for i, s in enumerate(ORDER, 1):
        g = load(os.path.join(run, f'{s}.json'))
        lines += [f'## {i}번 ({LEVEL[s[0]]} · {g.get("direction", "")})', '### 문제', g['problem'], '', '### 정답', str(g['answer']), '',
                  '### 해설', g.get('solution', ''), '']
    os.makedirs(SRCDIR, exist_ok=True)
    path = os.path.join(SRCDIR, name + '.md'); open(path, 'w', encoding='utf-8').write('\n'.join(lines))
    return name, path


def add_queue(key, name, path, meta):
    qp = os.path.join(TOOLS, 'queue.json'); q = json.load(open(qp, encoding='utf-8'))
    q['items'] = [it for it in q['items'] if it['key'] != key]
    school = meta['school'].replace('고등학교', '고').replace('여자고', '여고')
    q['items'].append({'key': key, 'src': path, 'status': '대기', 'outname': name, 'region': '변형', 'school': f"{school} {meta['question_number']}번",
                       'year': f"{meta['year']}년", 'grade': '', 'term': '', 'exam': '변형문제', 'subject': meta['subject'],
                       'mod': f'content_{key}', 'figmodule': f'figures_{key}', 'figdir': f'figs_{key}', 'filler': f'filler_{key}.json',
                       'range': meta['unit'], 'note': '변형 파이프라인 3라운드(2026-10-18) — 원본 PDF 없음, 발문대조 제외'})
    json.dump(q, open(qp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


def run_worker(key, name, path, meta, logdir):
    p = open(os.path.join(HERE, 'prompts', 'typeset.md'), encoding='utf-8').read()
    note = STAGE.get(meta['subject'], meta['subject']) + f" — 단원 {meta['unit']}. 본풀이는 이 과목 범위 안에서만, 위 단계 도구는 [별해]."
    p = p.replace('{KEY}', key).replace('{NAME}', name).replace('{SRC}', path).replace('{SUBJECT_NOTE}', note)
    t = time.time()
    r = subprocess.run(CODEX + ['exec', '--skip-git-repo-check', '-c', 'notify=[]', '-c', 'mcp_servers={}', '--sandbox', 'workspace-write',
                        '-C', TOOLS, '-o', os.path.join(logdir, f'{key}_report.md'), p],
                       capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=4 * 3600)
    out = (r.stdout or '') + (r.stderr or ''); open(os.path.join(logdir, f'{key}.log'), 'w', encoding='utf-8').write(out)
    m = re.search(r'tokens used\s*\n\s*([\d,]+)', out)
    return key, r.returncode, m.group(1) if m else '?', (time.time() - t) / 60


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('runs', nargs='+'); ap.add_argument('--keys', required=True); ap.add_argument('--meta', required=True)
    ap.add_argument('--logdir', required=True); a = ap.parse_args()
    keys = a.keys.split(','); meta = json.load(open(a.meta, encoding='utf-8')); os.makedirs(a.logdir, exist_ok=True)
    jobs = []
    for key, run in zip(keys, a.runs):
        m = meta[os.path.basename(run.rstrip('/\\')).replace('run_', '')]
        name, path = build_src(run, m); add_queue(key, name, path, m); jobs.append((key, name, path, m))
        print(key, name)
    with ThreadPoolExecutor(len(jobs)) as ex:
        for key, rc, tok, mins in ex.map(lambda j: run_worker(*j, a.logdir), jobs):
            print(f'{time.strftime("%H:%M")} {key} 종료코드 {rc} · {tok} 토큰 · {mins:.0f}분', flush=True)


if __name__ == '__main__': main()
