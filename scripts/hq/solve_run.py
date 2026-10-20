# -*- coding: utf-8 -*-
"""솔브부 한 번 돌리기 — 원고는 여러 장 동시에, **끝난 장부터 바로** 굽는다 (2026-10-20 대표: "원고 하나 끝날 때마다 굽나?").

  python scripts/hq/solve_run.py e955,e956,e957 --par 5
  python scripts/hq/solve_run.py e960-e964

흐름 (열쇠마다):
  작업자(코덱스) 원고 type → 재대조 recheck  ──끝나면──▶  굽기 줄(한 줄, 한글은 한 번에 하나)
  굽기 줄: 다른 한글이 떠 있으면 기다림 → 굽기.py <열쇠> --force (검사전부 → 경로검사 → 빌드 → 여백)
     · 경로검사에 걸리면 _work/경로고침지시.md 로 작업자에게 돌려보내고(최대 2번) 다시 줄에 선다
     · 그 밖의 실패는 기록만 하고 다음 장으로
  --force 는 발문대조 하나만 걸린 경우(스캔 위치 인식 오경보)만 넘긴다 — 굽기.py 의 규칙 그대로.
로그: C:\\gpt_solve\\_watch_logs\\<시각>\\ (run.log, 열쇠별 작업자 보고)
"""
import argparse, datetime, os, queue as Q, re, subprocess, sys, threading, time
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'variant_pipeline'))
import gs_all as G

TOOLS = G.TOOLS
SYSPY = r'C:\Users\matho\AppData\Local\Programs\Python\Python311\python.exe'   # solve_watch 와 같은 파이썬(한글 COM·fitz)
if not os.path.exists(SYSPY): SYSPY = sys.executable
FIX_TMPL = os.path.join(TOOLS, '_work', '경로고침지시.md')
LOCK = threading.Lock()


def say(log, *a):
    line = time.strftime('%H:%M ') + ' '.join(map(str, a))
    with LOCK:
        print(line, flush=True)
        open(os.path.join(log, 'run.log'), 'a', encoding='utf-8').write(line + '\n')


def hwp_busy():
    r = subprocess.run(['powershell', '-NoProfile', '-Command', "(Get-Process Hwp -ErrorAction SilentlyContinue | Measure-Object).Count"],
                       capture_output=True, text=True)
    return (r.stdout or '0').strip() not in ('', '0')


def fix_worker(key, log):
    p = open(FIX_TMPL, encoding='utf-8').read().replace('{KEY}', key).replace('{EXTRA}', '(추가 지시 없음)')
    r = subprocess.run(G.CODEX + ['exec', '--skip-git-repo-check', '-c', 'notify=[]', '-c', 'mcp_servers={}', '--sandbox', 'workspace-write',
                                  '-C', TOOLS, '-o', os.path.join(log, f'{key}_fix_report.md'),
                                  p + '\n\n[파일 쓰기 규칙] 결과 파일은 Python 으로 UTF-8 로.'],
                       capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=4 * 3600, stdin=subprocess.DEVNULL)
    open(os.path.join(log, f'{key}_fix.log'), 'w', encoding='utf-8').write((r.stdout or '') + (r.stderr or ''))
    return r.returncode


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('keys'); ap.add_argument('--par', type=int, default=5)
    ap.add_argument('--skip-type', action='store_true', help='원고는 이미 있다 — 경로검사부터')
    a = ap.parse_args()
    keys = G.expand(a.keys)
    log = os.path.join(G.GS, '_watch_logs', datetime.datetime.now().strftime('%m%d_%H%M') + '_run'); os.makedirs(log, exist_ok=True)
    work, bake = Q.Queue(), Q.Queue()
    left = [len(keys)]; fixes = {k: 0 for k in keys}; result = {}
    for k in keys:
        work.put(('gate' if a.skip_type else 'type', k))

    def route_gate(k):
        """[10/20 대표: 돌려보낸 건 뒤로 미루고 된 것부터 구우면 되지 않나] 경로검사는 한글을 안 쓰니 굽기 줄 밖(작업자 쪽)에서 돌린다.
        통과한 장만 굽기 줄에 선다 — 걸린 장이 줄을 막지 않는다."""
        while True:
            r = subprocess.run([SYSPY, '-X', 'utf8', '경로검사.py', k], cwd=TOOLS, capture_output=True, text=True,
                               encoding='utf-8', errors='replace', timeout=3600, stdin=subprocess.DEVNULL)
            open(os.path.join(log, f'{k}_route{fixes[k]}.log'), 'w', encoding='utf-8').write((r.stdout or '') + (r.stderr or ''))
            if r.returncode == 0 or fixes[k] >= 2:
                if r.returncode: say(log, f'⚠ {k} 경로검사 두 번 고쳐도 걸림 — 굽기는 하되 하루 보고에 올림')
                return
            fixes[k] += 1
            say(log, f'경로검사 걸림 {k} → 작업자에게 돌려보냄({fixes[k]}번째)')
            rc = fix_worker(k, log); say(log, f'경로고침 {k} rc{rc}')

    def worker():
        while left[0] > 0:
            try: kind, k = work.get(timeout=5)
            except Q.Empty: continue
            for step in (() if kind == 'gate' else ('type', 'recheck')):
                for t in range(3):
                    rc, tok, mins, busy = G.run(step, k, log)
                    say(log, f'{step:7} {k} rc{rc} {tok}토큰 {mins:.0f}분{" (서버 혼잡)" if busy else ""}')
                    if rc == 0 and not busy: break
            if os.path.exists(os.path.join(TOOLS, f'content_{k}.py')):
                route_gate(k)
                bake.put(k); say(log, f'굽기 줄에 섬 {k} (대기 {bake.qsize()})')
            else:
                result[k] = '원고 없음'; say(log, f'⚠ {k} 원고가 안 생김 — 보고서 확인'); left[0] -= 1

    def baker():
        while left[0] > 0:
            try: k = bake.get(timeout=5)
            except Q.Empty: continue
            while hwp_busy():
                time.sleep(30)
            t = time.time()
            # 경로검사는 route_gate 에서 끝났다(--skip-route) — 굽기 줄은 한글 일만
            r = subprocess.run([SYSPY, '-X', 'utf8', '굽기.py', k, '--force', '--skip-route'], cwd=TOOLS, capture_output=True, text=True,
                               encoding='utf-8', errors='replace', timeout=3 * 3600, stdin=subprocess.DEVNULL)
            out = r.stdout or ''
            open(os.path.join(log, f'{k}_bake.log'), 'w', encoding='utf-8').write(out + (r.stderr or ''))
            ok = '자동검사' in out and '빌드 실패' not in out
            result[k] = '구움' if ok else '실패(굽기 로그 확인)'
            say(log, f'{"✅ 구움" if ok else "⚠ 굽기 실패"} {k} {time.time() - t:.0f}초')
            left[0] -= 1

    ts = [threading.Thread(target=worker, daemon=True) for _ in range(a.par)] + [threading.Thread(target=baker, daemon=True)]
    for t in ts: t.start()
    for t in ts: t.join()
    say(log, '끝 —', ', '.join(f'{k} {v}' for k, v in result.items()))


if __name__ == '__main__': main()
