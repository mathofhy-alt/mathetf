# -*- coding: utf-8 -*-
"""솔브부 입력 자동 (2026-10-19, 사장 판단 — 10/18 '입력 자동' 결정 이행)

작업 스케줄러 mathetf_solve_watch 가 15분마다 부른다.
  ① C:\\gpt_solve 에 새 PDF → manifest.py 로 queue.json 에 넣기
  ② 원고(content_KEY.py)가 없는 새 열쇠 → gs_all.py --type (코덱스 작업자, 끝나면 재대조 자동)
  ③ 원고가 생긴 열쇠 중 아직 안 구운 것 → 다른 프로그램이 한글을 쓰고 있지 않을 때만 굽기
판단이 필요한 것(작업자 보고서의 원본 결함·임의 수정)은 굽되 C:\\gpt_solve\\_watch_review.json 에 쌓아 하루 보고에 올린다.
동시에 두 번 돌지 않게 잠금 파일. 로그: C:\\gpt_solve\\_watch.log
"""
import os, re, sys, json, time, glob, subprocess, datetime
GS = r'C:\gpt_solve'; TOOLS = os.path.join(GS, 'tools'); ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SYSPY = r'C:\Users\matho\AppData\Local\Programs\Python\Python311\python.exe'
VPY = os.path.join(ROOT, '.venv', 'Scripts', 'python.exe')
LOCK = os.path.join(GS, '_watch.lock'); FAILED = os.path.join(GS, '_watch_failed.json'); LOG = os.path.join(GS, '_watch.log'); REVIEW = os.path.join(GS, '_watch_review.json')


def log(*a):
    line = datetime.datetime.now().strftime('%m-%d %H:%M ') + ' '.join(map(str, a))
    open(LOG, 'a', encoding='utf-8').write(line + '\n')


def queue():
    return json.load(open(os.path.join(TOOLS, 'queue.json'), encoding='utf-8'))['items']


def hwp_running():
    r = subprocess.run(['powershell', '-NoProfile', '-c', '(Get-Process Hwp -ErrorAction SilentlyContinue | Measure-Object).Count'], capture_output=True, text=True)
    return int((r.stdout or '0').strip() or 0)


def baked(it):
    return os.path.exists(os.path.join(GS, 'comp', it['outname'] + '.hwp'))


def main():
    if os.path.exists(LOCK) and time.time() - os.path.getmtime(LOCK) < 6 * 3600: return
    open(LOCK, 'w').write(str(os.getpid()))
    try:
        before = {i['key'] for i in queue()}
        subprocess.run([SYSPY, '-X', 'utf8', 'manifest.py'], cwd=TOOLS, capture_output=True, timeout=600, stdin=subprocess.DEVNULL)
        items = queue(); new = [i for i in items if i['key'] not in before]
        if new: log('새 PDF', len(new), ' '.join(i['key'] for i in new))
        todo = [i['key'] for i in items if i.get('status') == '대기' and str(i.get('src', '')).lower().endswith('.pdf')
                and not os.path.exists(os.path.join(TOOLS, f"content_{i['key']}.py"))]
        if todo:
            d = os.path.join(GS, '_watch_logs', datetime.datetime.now().strftime('%m%d_%H%M')); os.makedirs(d, exist_ok=True)
            log('원고 작업', len(todo), ' '.join(todo))
            subprocess.run([VPY, '-X', 'utf8', os.path.join(ROOT, 'scripts', 'variant_pipeline', 'gs_all.py'), '--type', ','.join(todo), '--log', d, '--par', '8'],
                           cwd=ROOT, stdin=subprocess.DEVNULL, stdout=open(os.path.join(d, 'run.log'), 'w', encoding='utf-8'), stderr=subprocess.STDOUT, timeout=6 * 3600)
            rev = json.load(open(REVIEW, encoding='utf-8')) if os.path.exists(REVIEW) else []
            for f in glob.glob(os.path.join(d, '*_report.md')):
                t = open(f, encoding='utf-8').read()
                if re.search(r'원본|결함|오류|모순|임의|단서|답이 없|정답표|대조 불가가 아닌|보류', t):
                    rev.append({'file': f, 'at': datetime.datetime.now().isoformat(timespec='minutes'), 'head': t[:400]})
            json.dump(rev, open(REVIEW, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        ready = [i['key'] for i in queue() if os.path.exists(os.path.join(TOOLS, f"content_{i['key']}.py")) and not baked(i)
                 and i.get('status') not in ('대체됨',) and str(i.get('src', '')).lower().endswith('.pdf')]
        failed = json.load(open(FAILED, encoding='utf-8')) if os.path.exists(FAILED) else {}
        ready = [k for k in ready if time.time() - failed.get(k, 0) > 24 * 3600]   # 굽기 실패한 열쇠는 하루 쉰다(한글을 매번 붙잡지 않게)
        if ready:
            if hwp_running(): log('굽기 미룸 — 다른 프로그램이 한글 사용 중', ' '.join(ready)); return
            log('굽기', ' '.join(ready))
            r = subprocess.run([SYSPY, '-X', 'utf8', '굽기.py', *ready, '--force'], cwd=TOOLS, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=3 * 3600, stdin=subprocess.DEVNULL)
            for l in (r.stdout or '').splitlines():
                if '자동검사' in l or 'FAIL' in l or '빌드 실패' in l: log('  ', l.strip())
            for k in ready:
                it = next(i for i in queue() if i['key'] == k)
                if not baked(it): failed[k] = time.time()
            json.dump(failed, open(FAILED, 'w', encoding='utf-8'))
    except Exception as e:
        log('오류', type(e).__name__, str(e)[:200])
    finally:
        try: os.remove(LOCK)
        except OSError: pass


if __name__ == '__main__': main()
