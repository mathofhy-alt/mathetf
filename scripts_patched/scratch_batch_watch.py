# -*- coding: utf-8 -*-
"""[11/8 대표 지시] 등록 배치 감시 — 배치를 돌릴 때 같이 띄운다. 5분마다 확인.
사용: py -X utf8 scratch_batch_watch.py <배치 로그 경로> [간격초=300]
- 로그 마지막 줄·크기, 배치 프로세스 생존, 오래 붙은 하위 프로세스(dump_exam·codex·tsx)를 본다.
- dump_exam.py 가 10분 넘게 살아 있으면 멈춘 것으로 보고 끊는다(11/7·11/8 분석글 단계 멈춤 원인, 그 뒤 timeout 넣음).
- 로그가 20분 넘게 그대로면 '멈춤 의심'을 찍고 끝낸다(→ 사장 세션이 알림 받고 확인).
- 배치 프로세스(scratch_batch_run.py)가 사라지면 마지막 줄을 찍고 끝낸다.
매 확인마다 한 줄씩 _trylog/_watch.log 에도 남긴다."""
import os, sys, time, subprocess, json, datetime
LOG = sys.argv[1]; GAP = int(sys.argv[2]) if len(sys.argv) > 2 else 300
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_trylog', '_watch.log')
def procs():
    ps = ("Get-CimInstance Win32_Process -Filter \"name='python.exe' or name='node.exe'\" | "
          "ForEach-Object { [pscustomobject]@{id=$_.ProcessId; t=$_.CreationDate.ToString('o'); c=$_.CommandLine} } | ConvertTo-Json -Compress")
    r = subprocess.run(['powershell', '-NoProfile', '-Command', ps], capture_output=True, text=True, encoding='utf-8', errors='replace')
    try: d = json.loads(r.stdout or '[]')
    except Exception: return []
    return d if isinstance(d, list) else [d]
def say(msg):
    line = f"{time.strftime('%m-%d %H:%M')} {msg}"
    print(line, flush=True); open(OUT, 'a', encoding='utf-8').write(line + '\n')
def tail():
    try: return [l.strip() for l in open(LOG, encoding='utf-8', errors='replace').read().splitlines() if l.strip()][-1][:150]
    except Exception: return '(로그 없음)'
last_size, same_since = -1, time.time()
while True:
    now = datetime.datetime.now().astimezone()
    P = procs()
    batch = [p for p in P if p.get('c') and 'scripts_patched/scratch_batch_run.py' in p['c']]
    size = os.path.getsize(LOG) if os.path.exists(LOG) else 0
    if size != last_size: last_size, same_since = size, time.time()
    old = []
    for p in P:
        c = p.get('c') or ''
        if not any(k in c for k in ('dump_exam.py', 'codex.js', 'tsx')): continue
        age = (now - datetime.datetime.fromisoformat(p['t'])).total_seconds() / 60
        if 'dump_exam.py' in c and age > 10:
            subprocess.run(['taskkill', '/F', '/PID', str(p['id'])], capture_output=True)
            old.append(f"dump_exam {p['id']} {age:.0f}분 → 끊음")
        elif age > 30: old.append(f"{'codex' if 'codex' in c else 'tsx'} {p['id']} {age:.0f}분")
    stale = (time.time() - same_since) / 60
    say(f"배치 {'진행' if batch else '없음'} · 로그 {stale:.0f}분째 그대로 · {tail()}" + (f" · 오래된 하위: {old}" if old else ''))
    if not batch: say('끝: 배치 프로세스 종료'); break
    if stale >= 20: say('⚠ 멈춤 의심: 로그가 20분 넘게 그대로'); break
    time.sleep(GAP)
