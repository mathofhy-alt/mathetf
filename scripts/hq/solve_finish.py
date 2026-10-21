# -*- coding: utf-8 -*-
"""분담 방식 마무리 한 장 (2026-10-20): 클로드 해설이 끝난 열쇠 → 코덱스 마무리(해설 그림·형식) → 경로검사 → 굽기(한글은 한 번에 하나)

  python scripts/hq/solve_finish.py e967
여러 장을 따로 띄워도 굽기는 잠금 폴더(C:\\gpt_solve\\_bake.lock)로 한 장씩만.
"""
import os, subprocess, sys, time
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'variant_pipeline'))
import gs_all as G

TOOLS = G.TOOLS
SYSPY = r'C:\Users\matho\AppData\Local\Programs\Python\Python311\python.exe'
if not os.path.exists(SYSPY): SYSPY = sys.executable
LOCK = os.path.join(G.GS, '_bake.lock')
key = sys.argv[1]
log = os.path.join(G.GS, '_watch_logs', '1020_split'); os.makedirs(log, exist_ok=True)


def say(*a):
    line = time.strftime('%H:%M ') + key + ' ' + ' '.join(map(str, a))
    print(line, flush=True)
    open(os.path.join(log, 'finish.log'), 'a', encoding='utf-8').write(line + '\n')


rc, tok, mins, busy = G.run('finish', key, log)
say(f'마무리(코덱스) rc{rc} {tok}토큰 {mins:.0f}분')
r = subprocess.run([SYSPY, '-X', 'utf8', '경로검사.py', key], cwd=TOOLS, capture_output=True, text=True, encoding='utf-8', errors='replace')
last = [l for l in (r.stdout or '').splitlines() if l.startswith('경로검사 ')]
say('경로검사', last[-1] if last else '?', '— 걸림' if r.returncode else '— 통과')
if r.returncode:
    open(os.path.join(log, f'{key}_route.txt'), 'w', encoding='utf-8').write(r.stdout or '')
    sys.exit(2)                       # 걸린 장은 굽지 않는다 — 본 세션이 클로드 직원에게 돌려보낸다
# [10/21 대표 승인] 해설 그림 눈 검토 — 검사기는 그림 이름만 봐서 라벨이 엉뚱한 곳에 뜬 그림(효성고3 14번)을 못 잡았다
import sfig_review
if sfig_review.run(key, log=os.path.join(log, 'finish.log')):
    say('⚠ 해설 그림 검토에서 고친 뒤에도 걸림이 남음 — 굽지 않음(_work/sfig_review)')
    sys.exit(3)
while True:                           # 굽기 잠금(한글은 한 번에 하나)
    try:
        os.mkdir(LOCK); break
    except FileExistsError:
        if time.time() - os.path.getmtime(LOCK) > 3600: os.rmdir(LOCK)
        time.sleep(15)
try:
    b = subprocess.run([SYSPY, '-X', 'utf8', '굽기.py', key, '--force', '--skip-route'], cwd=TOOLS, capture_output=True, text=True,
                       encoding='utf-8', errors='replace', timeout=3 * 3600)
    open(os.path.join(log, f'{key}_bake.log'), 'w', encoding='utf-8').write((b.stdout or '') + (b.stderr or ''))
    ok = [l for l in (b.stdout or '').splitlines() if '자동검사' in l]
    say('✅ 구움' if ok else '⚠ 굽기 실패', ok[0] if ok else (b.stdout or '')[-300:])
finally:
    os.rmdir(LOCK)
