# -*- coding: utf-8 -*-
"""채택된 변형 → 한글 시험지 (2026-10-21 대표: "클로드 해설까지 붙이고 한글까지")

  python scripts/variant_pipeline/variant_hwp.py <작업폴더> --nos 12-25 --name 변형_주간테스트21회 --title "주간테스트 21회"

작업폴더/vNN (batch_variants.py 결과)의 채택 칸을 장으로 묶는다 — 숫자변형(k*) 한 장, 심한 변형(h*) 한 장.
장마다: ① C:\\gpt_solve\\변형원본\\<이름>.md + queue.json 열쇠 ② 코덱스 문제 쪽(gs_all vqonly, 재대조 자동)
        ③ 클로드 해설(헤드리스, 클로드해설만지시 + 변형 안내) ④ solve_finish(코덱스 마무리 → 경로검사 → 굽기, 한글은 한 번에 하나)
결과: C:\\gpt_solve\\comp\\<이름>_숫자변형.hwp / _심한변형.hwp
"""
import argparse, glob, json, os, re, shutil, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
HERE = Path(__file__).resolve().parent; ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))
import gs_all as G   # noqa: E402

SYSPY = r'C:\Users\matho\AppData\Local\Programs\Python\Python311\python.exe'
VPY = str(ROOT / '.venv' / 'Scripts' / 'python.exe')
ENV = dict(os.environ, PATH=os.path.dirname(SYSPY) + os.pathsep + os.environ.get('PATH', ''), PYTHONUTF8='1')
SRCDIR = Path(G.GS) / '변형원본'
CLAUDE_EXTRA = '''

## 이번 원고는 변형 문제다 (원본 PDF 없음)
- 문제·정답은 `{SRC}` 의 것이 확정본이다(코덱스가 원고 문제 쪽에 그대로 옮겼다). 정답을 바꾸지 마라. 다르게 나오면 고치지 말고 보고에 적어라.
- `{SRC}` 의 「풀이 요지(검산용)」는 정답 확인용 메모일 뿐 정석 보장이 없다. 해설은 `해설규칙.md`·`정석경로/` 기준의 출제 의도 경로로 새로 쓴다.
- 파이썬은 `python -X utf8 …` 로 부른다.
'''


def claude_exe():
    for base in (os.path.expanduser(r'~\.antigravity-ide\extensions'), os.path.expanduser(r'~\.vscode\extensions')):
        c = sorted(glob.glob(os.path.join(base, 'anthropic.claude-code-*', 'resources', 'native-binary', 'claude.exe')))
        if c: return c[-1]
    return shutil.which('claude')


def load(p): return json.loads(Path(p).read_text(encoding='utf-8-sig'))


def build_sheet(work, numbers, kind, name, title):
    lines = [f'# {name}', f'{title} 변형 — {"숫자변형" if kind == "k" else "심한 변형"} · 과목 미적분Ⅰ', '']
    units, n = [], 0
    for no in numbers:
        D = Path(work) / f'v{no:02d}'
        if not (D / 'delivery_report.json').is_file(): continue
        rep = load(D / 'delivery_report.json'); pol = load(D / 'delivery_policy.json') if (D / 'delivery_policy.json').is_file() else {}
        for r in rep.get('rows', []):
            if not r['slot'].startswith(kind) or r['slot'] not in rep.get('selected_slots', []): continue
            g = r.get('generated') or {}; n += 1
            if pol.get('unit') and pol['unit'] not in units: units.append(pol['unit'])
            lines += [f'## {n}번 (원본 {no}번 · {g.get("direction", "")})', '### 문제', g['problem'], '', '### 정답', str(g['answer']), '',
                      '### 풀이 요지(검산용 — 해설 아님)', g.get('solution', ''), '']
    SRCDIR.mkdir(parents=True, exist_ok=True)
    path = SRCDIR / f'{name}.md'; path.write_text('\n'.join(lines), encoding='utf-8')
    return path, n, units


def next_key():
    q = json.load(open(os.path.join(G.TOOLS, 'queue.json'), encoding='utf-8'))
    return max(int(i['key'][1:]) for i in q['items'] if re.fullmatch(r'e\d+', i['key'])) + 1


def add_queue(key, name, path, units, title):
    qp = os.path.join(G.TOOLS, 'queue.json'); q = json.load(open(qp, encoding='utf-8'))
    q['items'] = [it for it in q['items'] if it['key'] != key]
    q['items'].append({'key': key, 'src': str(path), 'status': '대기', 'outname': name, 'region': '변형', 'school': title,
                       'year': '2026년', 'grade': '', 'term': '', 'exam': '변형문제', 'subject': '미적분Ⅰ',
                       'mod': f'content_{key}', 'figmodule': f'figures_{key}', 'figdir': f'figs_{key}', 'filler': f'filler_{key}.json',
                       'range': ', '.join(units), 'note': '변형 파이프라인 10/21 — 원본 PDF 없음, 발문대조 제외, 해설은 클로드'})
    json.dump(q, open(qp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


def say(log, *a):
    line = time.strftime('%H:%M ') + ' '.join(map(str, a)); print(line, flush=True)
    open(log, 'a', encoding='utf-8').write(line + '\n')


def sheet(key, src, logdir):
    log = os.path.join(logdir, 'run.log')
    rc, tok, mins, _ = G.run('vqonly', key, logdir); say(log, key, f'코덱스 문제 쪽 rc{rc} {tok}토큰 {mins:.0f}분')
    rc2, tok2, mins2, _ = G.run('recheck', key, logdir); say(log, key, f'코덱스 재대조 rc{rc2} {tok2}토큰 {mins2:.0f}분')
    if rc != 0: return key, '문제 쪽 실패'
    base = open(os.path.join(G.TOOLS, '_work', '클로드해설만지시.md'), encoding='utf-8').read()
    prompt = base.replace('{KEY}', key) + CLAUDE_EXTRA.replace('{SRC}', str(src))
    t = time.time()
    r = subprocess.run([claude_exe(), '-p', prompt, '--permission-mode', 'acceptEdits', '--add-dir', G.GS,
                        '--allowedTools', 'Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash(python:*)', 'Bash(python -X utf8:*)', '--output-format', 'json'],
                       cwd=G.TOOLS, env=ENV, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=4 * 3600, stdin=subprocess.DEVNULL)
    open(os.path.join(logdir, f'{key}.claude.json'), 'w', encoding='utf-8').write((r.stdout or '') + (r.stderr or ''))
    say(log, key, f'클로드 해설 rc{r.returncode} {(time.time() - t) / 60:.0f}분')
    if r.returncode != 0: return key, '클로드 해설 실패'
    for attempt in (1, 2):
        f = subprocess.run([VPY, '-X', 'utf8', str(ROOT / 'scripts' / 'hq' / 'solve_finish.py'), key], cwd=str(ROOT), env=ENV,
                           capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=5 * 3600, stdin=subprocess.DEVNULL)
        last = ((f.stdout or '').strip().splitlines() or [''])[-1]; say(log, key, f'마무리·경로검사·굽기 rc{f.returncode} {last[:200]}')
        if f.returncode == 0: return key, '구움'
        if f.returncode == 2 and attempt == 1:
            fix = (f'열쇠 {key} (`C:\\gpt_solve\\tools\\content_{key}.py`) 의 해설이 경로검사에 걸렸다. `tools/_work/경로검사/{key}.md` 를 읽어 걸린 문항만 '
                   '출제 의도 경로로 plan·sol 을 다시 써라. 문제 쪽은 바꾸지 마라. 한글·굽기 금지.')
            subprocess.run([claude_exe(), '-p', fix, '--permission-mode', 'acceptEdits', '--add-dir', G.GS, '--allowedTools', 'Read', 'Edit', 'Write', 'Glob', 'Grep',
                            'Bash(python:*)', '--output-format', 'json'], cwd=G.TOOLS, env=ENV, capture_output=True, text=True, encoding='utf-8', errors='replace',
                           timeout=3 * 3600, stdin=subprocess.DEVNULL)
            say(log, key, '경로 고침(클로드) 끝 — 다시 마무리'); continue
        return key, '마무리/굽기 실패'
    return key, '마무리/굽기 실패'


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('work'); ap.add_argument('--nos', required=True); ap.add_argument('--name', required=True)
    ap.add_argument('--title', required=True); ap.add_argument('--keys', default=''); a = ap.parse_args()
    a_, _, b_ = a.nos.partition('-'); numbers = list(range(int(a_), int(b_ or a_) + 1))
    logdir = os.path.join(G.GS, '_watch_logs', time.strftime('%m%d_%H%M') + '_variant'); os.makedirs(logdir, exist_ok=True)
    jobs, key = [], next_key()
    fixed = [k for k in a.keys.split(',') if k]
    for kind, label in (('k', '숫자변형'), ('h', '심한변형')):
        name = f'{a.name}_{label}'
        path, n, units = build_sheet(a.work, numbers, kind, name, a.title)
        if not n: continue
        k = fixed.pop(0) if fixed else f'e{key}'
        if not a.keys: key += 1
        add_queue(k, name, path, units, a.title); jobs.append((k, path))
        say(os.path.join(logdir, 'run.log'), k, name, f'{n}문항', path)
    with ThreadPoolExecutor(len(jobs)) as ex:
        for k, st in ex.map(lambda j: sheet(j[0], j[1], logdir), jobs):
            say(os.path.join(logdir, 'run.log'), k, st)
    print('로그', logdir)


if __name__ == '__main__':
    main()
