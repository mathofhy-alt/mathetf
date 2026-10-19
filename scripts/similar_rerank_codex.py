# -*- coding: utf-8 -*-
"""유사문항 재정렬을 Codex CLI 로 돌린다 (2026-10-17) — 준비 → 작업 파일마다 codex exec → 빠진 사례 재시도 → 저장.

왜: Haiku 에이전트(Claude 플랜 주간 한도)로는 조금씩밖에 못 돌렸다. 대표의 Codex 플랜은 여유가 커서 대기열을 크게 줄일 수 있다.
    10/17 비교(6문항): 기준 사례 2개(2017 수능 21번·고1 11월 16번) Haiku 와 같게 맞힘, 상위5 겹침 19/30, 문항당 약 2.4만 토큰.
모델은 고정(gpt-6.1-sol, reasoning medium) — 대표 기본 설정이 바뀌어도 재정렬 품질이 따라 흔들리지 않게.
사용: python scripts/similar_rerank_codex.py 300 [--par 8] [--batch <이미 준비된 배치 폴더>] [--no-save]
⚠ 같은 대기열을 두 곳(코덱스·Haiku)에서 동시에 돌리지 말 것 — 완료 표시는 저장 때 남아서 같은 문항을 두 번 하게 된다.
"""
import os, re, sys, json, glob, time, shutil, argparse, subprocess
from concurrent.futures import ThreadPoolExecutor
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace', line_buffering=True)
except Exception: pass
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PY = sys.executable
MODEL, EFFORT = 'gpt-6.1-sol', 'medium'
# Windows 의 codex.cmd 는 여러 줄 지시문 인자를 cmd.exe 가 깨뜨린다 → node 로 codex.js 를 직접 부른다
_NPM = subprocess.run('npm root -g', shell=True, capture_output=True, text=True).stdout.strip()
_JS = os.path.join(_NPM, '@openai', 'codex', 'bin', 'codex.js')
CODEX = [shutil.which('node'), _JS] if os.path.exists(_JS) and shutil.which('node') else None
PROMPT = open(os.path.join(ROOT, 'scripts', 'similar_rerank_prompt_codex.md'), encoding='utf-8').read()


def load(f):
    b = open(f, 'rb').read()
    for e in ('utf-8-sig', 'cp949'):
        try: return json.loads(b.decode(e))
        except Exception: pass
    return None


def missing(bdir, key, names):
    """점수가 빠졌거나 후보 수가 모자란 사례"""
    sc = {}
    for f in glob.glob(os.path.join(bdir, 'out*.json')):
        d = load(f)
        if isinstance(d, dict): sc.update(d)
    return [n for n in names if not isinstance(sc.get(n), dict) or any(f'C{i + 1}' not in sc[n] for i in range(len(key[n]['cands'])))]


def run_job(bdir, job, out):
    p = PROMPT.replace('{JOB}', job).replace('{OUT}', out)
    t = time.time()
    r = subprocess.run(CODEX + ['exec', '--skip-git-repo-check', '-m', MODEL, '-c', f'model_reasoning_effort={EFFORT}', '-c', 'notify=[]', '-c', 'mcp_servers={}',
                        '--sandbox', 'workspace-write', '-C', bdir, p], capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=2400)
    log = (r.stdout or '') + (r.stderr or '')
    open(os.path.join(bdir, f'codex_{job[:-4]}.log'), 'w', encoding='utf-8').write(log)
    m = re.search(r'tokens used\s*\n\s*([\d,]+)', log)
    return job, r.returncode, int(m.group(1).replace(',', '')) if m else 0, time.time() - t


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('n', nargs='?', type=int, default=60); ap.add_argument('--par', type=int, default=8)
    ap.add_argument('--batch'); ap.add_argument('--no-save', action='store_true'); ap.add_argument('--model'); a = ap.parse_args()
    global MODEL
    if a.model: MODEL = a.model   # 모델 비교용(10/18) — 평소엔 고정값
    if not CODEX: raise SystemExit('codex CLI 없음 — npm i -g @openai/codex')
    if a.batch: bdir = a.batch
    else:
        out = subprocess.run([PY, os.path.join(ROOT, 'scripts', 'similar_rerank_prepare.py'), str(a.n)], capture_output=True, text=True, encoding='utf-8', errors='replace')
        print(out.stdout[-600:])
        m = re.search(r'배치 (\S+)', out.stdout)
        if not m: raise SystemExit('준비 실패\n' + out.stderr[-800:])
        bdir = m.group(1)
    key = json.load(open(os.path.join(bdir, 'key.json'), encoding='utf-8'))
    jobs = sorted(glob.glob(os.path.join(bdir, 'job*.txt')), key=lambda f: int(re.sub(r'\D', '', os.path.basename(f))))
    todo = [(os.path.basename(j), 'out' + re.sub(r'\D', '', os.path.basename(j)) + '.json') for j in jobs
            if missing(bdir, key, open(j, encoding='utf-8').read().split())]
    print(f'코덱스 {MODEL}/{EFFORT} · 작업 {len(todo)}/{len(jobs)}개 · 동시 {a.par}')
    tok = 0; t0 = time.time(); done = 0
    for attempt in (1, 2):
        with ThreadPoolExecutor(a.par) as ex:
            for job, rc, tk, sec in ex.map(lambda x: run_job(bdir, *x), todo):
                tok += tk; done += 1
                print(f'  [{done}] {job} 종료코드 {rc} · {tk:,} 토큰 · {sec:.0f}초')
        # 빠진 사례가 있는 작업만 새 작업 파일로 다시
        left = missing(bdir, key, list(key))
        if not left: break
        print(f'점수 빠진 사례 {len(left)}개 — 다시' if attempt == 1 else f'두 번째에도 빠진 사례 {left}')
        if attempt == 2: break
        todo = []
        for i in range(0, len(left), 3):
            jn = f'retry{i // 3 + 1}.txt'; open(os.path.join(bdir, jn), 'w', encoding='utf-8').write('\n'.join(left[i:i + 3]))
            todo.append((jn, f'out_r{i // 3 + 1}.json'))
    print(f'코덱스 합계 {tok:,} 토큰 · {(time.time() - t0) / 60:.0f}분')
    if a.no_save: print('저장 안 함:', bdir); return
    r = subprocess.run([PY, os.path.join(ROOT, 'scripts', 'similar_rerank_save.py'), bdir], capture_output=True, text=True, encoding='utf-8', errors='replace')
    print(r.stdout[-800:], r.stderr[-400:])


if __name__ == '__main__': main()
