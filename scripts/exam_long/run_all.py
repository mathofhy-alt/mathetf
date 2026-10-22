"""코덱스로 장문 분석글 전량 쓰기 (대표 10/22: 코덱스로 결정).
   python run_all.py [--limit N] [--workers W] [--stop-pct P]
   - targets.json 순서(최근 연도 먼저)로, out_codex 에 검사 통과본이 있으면 건너뛴다(이어 하기).
   - 코덱스 주간 사용률이 P%(기본 70) 넘으면 새로 시작하지 않는다 — 11시 원본제보 솔브 몫을 남긴다.
   - 자료 뽑기 → 코덱스 작성 → check.py. 실패는 logs/fail.txt 에 남긴다."""
import argparse, glob, json, os, re, subprocess, sys, time, concurrent.futures as cf
sys.stdout.reconfigure(encoding='utf-8')
D = os.path.dirname(os.path.abspath(__file__)); REPO = os.path.abspath(os.path.join(D, '..', '..'))
PY = sys.executable
CODEX = [r'C:\Program Files\nodejs\node.EXE', r'C:\Users\matho\AppData\Roaming\npm\node_modules\@openai\codex\bin\codex.js']
OUT = 'out_codex'
PEERS = False


def codex_used_pct():
    """가장 최근 코덱스 세션 기록의 주간 사용률(%)."""
    files = sorted(glob.glob(os.path.expanduser('~/.codex/sessions/*/*/*/*.jsonl')), key=os.path.getmtime)
    for f in reversed(files[-20:]):
        m = re.findall(r'"primary":\{"used_percent":([\d.]+)', open(f, encoding='utf-8', errors='replace').read())
        if m: return float(m[-1])
    return 0.0


def ok(eid):
    r = subprocess.run([PY, '-X', 'utf8', os.path.join(D, 'check.py'), '--dir', OUT, eid], capture_output=True, text=True, encoding='utf-8')
    return r.returncode == 0, r.stdout.strip()


def one(eid):
    if not os.path.exists(os.path.join(D, 'data', eid + '.json')):
        r = subprocess.run([PY, '-X', 'utf8', os.path.join(D, 'dump_exam.py')] + (['--peers'] if PEERS else []) + [eid], capture_output=True, text=True, encoding='utf-8')
        if r.returncode: return eid, 'dump실패', r.stdout[-200:] + r.stderr[-200:]
    prompt = (f'C:\\dev\\mathetf\\scripts\\exam_long\\WRITER_PROMPT.md 를 읽고 그대로 따르세요. 담당 exam_id: {eid}. 출력폴더: {OUT} '
              f'(결과 파일 C:\\dev\\mathetf\\scripts\\exam_long\\{OUT}\\{eid}.json). 이 결과 파일 말고 다른 파일은 만들거나 고치지 마세요. '
              f'검사는 C:\\dev\\mathetf 에서 `py -X utf8 scripts/exam_long/check.py --dir {OUT} {eid}` 를 OK 가 나올 때까지. 마지막 줄에 "완료 {eid}".')
    try:
        r = subprocess.run(CODEX + ['exec', '--skip-git-repo-check', '-c', 'notify=[]', '-c', 'mcp_servers={}', '--sandbox', 'workspace-write', '-C', REPO, prompt],
                           capture_output=True, text=True, encoding='utf-8', errors='replace', stdin=subprocess.DEVNULL, timeout=3600)
        out = (r.stdout or '') + (r.stderr or '')
    except subprocess.TimeoutExpired:
        out = 'timeout'
    open(os.path.join(D, 'logs', f'codex_{eid}.log'), 'w', encoding='utf-8').write(out)
    tok = re.search(r'tokens used\s*\n\s*([\d,]+)', out)
    good, msg = ok(eid) if os.path.exists(os.path.join(D, OUT, eid + '.json')) else (False, '결과 없음')
    return eid, 'OK' if good else 'FAIL', (tok[1] if tok else '?') + ('' if good else ' ' + msg[-300:])


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--limit', type=int, default=0); ap.add_argument('--workers', type=int, default=5)
    ap.add_argument('--stop-pct', type=float, default=70); ap.add_argument('--targets', default='targets.json'); a = ap.parse_args()
    global PEERS; PEERS = a.targets != 'targets.json'   # 10회차 미만(targets_small.json)은 같은 지역 비교를 넣는다
    os.makedirs(os.path.join(D, OUT), exist_ok=True); os.makedirs(os.path.join(D, 'logs'), exist_ok=True)
    todo = [t['id'] for t in json.load(open(os.path.join(D, a.targets), encoding='utf-8'))]
    todo = [e for e in todo if not (os.path.exists(os.path.join(D, OUT, e + '.json')) and ok(e)[0])]
    # 앞 실행에서 쓰던 중인 것(자료를 뽑은 지 20분 안이고 결과가 없는 것)은 건너뛴다 — 작업자 수를 바꿔 다시 띄울 때 중복 방지
    def in_flight(e):
        p = os.path.join(D, 'data', e + '.json')
        return os.path.exists(p) and time.time() - os.path.getmtime(p) < 1200 and not os.path.exists(os.path.join(D, OUT, e + '.json'))
    todo = [e for e in todo if not in_flight(e)]
    if a.limit: todo = todo[:a.limit]
    start = codex_used_pct(); print(f'남은 {len(todo)}장 · 코덱스 주간 사용 {start}% · 멈춤 기준 {a.stop_pct}%', flush=True)
    done = fail = 0; it = iter(todo)
    with cf.ThreadPoolExecutor(a.workers) as ex:
        running = set()
        while True:
            while len(running) < a.workers:
                if codex_used_pct() >= a.stop_pct: break
                e = next(it, None)
                if e is None: break
                running.add(ex.submit(one, e))
            if not running: break
            fin, running = cf.wait(running, return_when=cf.FIRST_COMPLETED)
            for f in fin:
                eid, st, info = f.result()
                done += st == 'OK'; fail += st != 'OK'
                print(time.strftime('%H:%M'), st, eid, info, f'(누적 OK {done} · 실패 {fail} · 사용 {codex_used_pct()}%)', flush=True)
                if st != 'OK': open(os.path.join(D, 'logs', 'fail.txt'), 'a', encoding='utf-8').write(f'{eid}\t{info}\n')
    end = codex_used_pct()
    print(f'끝 · OK {done} · 실패 {fail} · 주간 사용 {start}% → {end}%' + (f' · 1장당 약 {(end - start) / max(1, done):.2f}%' if done else ''), flush=True)


if __name__ == '__main__':
    main()
