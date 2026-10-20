# -*- coding: utf-8 -*-
"""원본제보 하루 처리 (2026-10-20 대표: "오늘 한 거 자동화하자 … 매일 오전 11시")

작업 스케줄러 mathetf_daily_solve 가 매일 11:00 에 부른다. 흐름 (여기서 끝 — 파싱 전에 대표가 본다):
  ① 네임 폴더(try/name)의 *_원본제보.pdf (「_확인필요」 제외) → 코덱스가 첫 쪽을 보고 파일명(지역·연도·학기·학교·학년·과목)과 맞는지 확인
     · 맞지 않거나 확인이 안 되는 건 그대로 둔다(보고에만 적음)
  ② 맞는 것 → C:\\gpt_solve 로 옮기고 manifest.py 로 열쇠 만들기
  ③ 열쇠마다(동시 4장): 코덱스 문제 쪽(gs_all --qonly, 재대조 자동) → 클로드 해설(plan·sol, 원본 결함은 답 하나 나오게 고치고 회원 안내 초안)
     → solve_finish(코덱스 그림·형식 마무리 → 경로검사 → 굽기, 한글은 한 번에 하나). 경로검사에 걸리면 클로드가 한 번 고치고 다시
  ④ 구워진 장: hwp + 원본 pdf → C:\\20260909\\comp\\real → real.py <이름> (pdf·hml·ㅈㄷ.pdf) → 다섯 파일을 C:\\dev\\mathetf\\try 로
  ⑤ 클로드가 남긴 회원 안내는 그 원본제보 행(exam_materials.description.admin_reply)에 저장 — 존댓말, 결함 문항·이유·정답
  보고: C:\\gpt_solve\\_daily\\<날짜>.md

  python scripts/hq/daily_report_solve.py            # 실행
  python scripts/hq/daily_report_solve.py --dry-run  # ①만 하고 옮기지 않음
"""
import argparse, datetime, glob, json, os, re, shutil, subprocess, sys, threading, time
from concurrent.futures import ThreadPoolExecutor
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'variant_pipeline'))
import gs_all as G   # noqa: E402

GS = G.GS; TOOLS = G.TOOLS; COMP = os.path.join(GS, 'comp')
NAME = os.path.join(ROOT, 'try', 'name'); TRY = os.path.join(ROOT, 'try')
REAL = r'C:\20260909\comp\real'; REAL_TOOLS = r'C:\20260909\tools'
SYSPY = r'C:\Users\matho\AppData\Local\Programs\Python\Python311\python.exe'
VPY = os.path.join(ROOT, '.venv', 'Scripts', 'python.exe')
DAY = os.path.join(GS, '_daily'); os.makedirs(DAY, exist_ok=True)
STAMP = datetime.datetime.now().strftime('%Y%m%d_%H%M'); LOGD = os.path.join(DAY, STAMP); os.makedirs(LOGD, exist_ok=True)
LOCKF = os.path.join(DAY, '_run.lock'); STATE = os.path.join(DAY, 'state.json')
PAR = 4
_lk = threading.Lock(); REPORT = []


def say(*a):
    line = time.strftime('%H:%M ') + ' '.join(map(str, a))
    with _lk:
        print(line, flush=True); REPORT.append(line)
        open(os.path.join(LOGD, 'run.log'), 'a', encoding='utf-8').write(line + '\n')


def load(p, d):
    try: return json.load(open(p, encoding='utf-8-sig'))
    except Exception: return d


def claude_exe():
    for base in (os.path.expanduser(r'~\.antigravity-ide\extensions'), os.path.expanduser(r'~\.vscode\extensions')):
        c = sorted(glob.glob(os.path.join(base, 'anthropic.claude-code-*', 'resources', 'native-binary', 'claude.exe')))
        if c: return c[-1]
    return shutil.which('claude')


ENV = dict(os.environ, PATH=os.path.dirname(SYSPY) + os.pathsep + os.environ.get('PATH', ''), PYTHONUTF8='1')


# ① 파일명 ↔ 표지 확인 ---------------------------------------------------------------
VERIFY = '''첨부한 그림은 학교 수학 시험지 PDF 의 첫 쪽(과 둘째 쪽)이다. 파일 이름은 「{NAME}」 이다.
파일 이름의 뜻: 시도_구시군_연도_학기(1중간·1기말·2중간·2기말)_학교이름+학년_과목_원본제보.pdf
시험지 머리말·표지에서 읽히는 학교·연도·학기·시험 종류·학년·과목을 파일 이름과 대조하라. 과목은 교육과정이 바뀌어 이름이 달라도 같은 과목이면 맞는 것으로 본다(예: 미적분I=미적분Ⅰ, 공통수학2=수학(하) 아님 — 2022·2015 과정 구분). 학년이 머리말에 없으면 과목으로 보아 자연스러우면 맞음.
머리말이 안 보이거나 판단할 근거가 부족하면 확인 불가다. 추측하지 마라.
JSON 한 줄만 답하라: {"match": true|false|null, "read": "머리말에서 읽은 그대로", "reason": "한 줄"}  (null = 확인 불가)'''


def verify(pdf):
    import fitz
    name = os.path.basename(pdf); d = os.path.join(LOGD, 'verify'); os.makedirs(d, exist_ok=True)
    doc = fitz.open(pdf); imgs = []
    for i in range(min(2, doc.page_count)):
        p = os.path.join(d, f'{abs(hash(name)) % 10**8}_{i}.png'); doc[i].get_pixmap(dpi=110).save(p); imgs.append(p)
    doc.close()
    out = os.path.join(d, name + '.txt')
    cmd = G.CODEX + ['exec', '--skip-git-repo-check', '-c', 'notify=[]', '-c', 'mcp_servers={}', '-c', 'model_reasoning_effort=low',
                     '--sandbox', 'read-only', '-o', out, VERIFY.replace('{NAME}', name)] + sum([['-i', p] for p in imgs], [])   # -i 는 값을 여러 개 받으므로 프롬프트를 앞에
    try: subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=900, stdin=subprocess.DEVNULL)
    except subprocess.TimeoutExpired: return {'match': None, 'reason': '시간 초과'}
    t = open(out, encoding='utf-8').read() if os.path.exists(out) else ''
    m = re.search(r'\{.*\}', t, re.S)
    try: return json.loads(m.group()) if m else {'match': None, 'reason': '응답 없음'}
    except Exception: return {'match': None, 'reason': '응답 형식 오류: ' + t[:80]}


# ③ 열쇠 한 장 ------------------------------------------------------------------------
CLAUDE_EXTRA = '''

## 자동 실행 추가 지시 (매일 11시 원본제보 처리, 대표 2026-10-20)
- 파이썬은 `python -X utf8 …` 로 부른다(경로에 Python311 이 먼저 잡혀 있다).
- **원본 결함**(답이 없거나 둘, 조건 모순)이 있으면 묻지 말고 출제 의도대로 발문·선지를 **최소한으로** 고쳐 답이 하나 나오게 하고(해설에 원본 이야기·[참고] 금지), `content_{KEY}.py` docstring 에 무엇을 왜 고쳤는지 적는다. answer·chk 도 맞춰라.
- 그런 경우 `tools/_work/클로드해설_{KEY}.md` 끝에 `## 회원 안내` 절을 두고 제보한 회원에게 보낼 **존댓말** 안내를 쓴다(고친 문항 번호·무엇이 문제였는지·고친 내용·정답). 결함이 없으면 이 절을 만들지 않는다.
- 답에 영향 없는 오타(오답 선지 값 등)는 고치지 말고 보고에만 적는다.
'''
ROUTE_FIX = '''열쇠 {KEY} (`C:\\gpt_solve\\tools\\content_{KEY}.py`) 의 해설이 경로검사에 걸렸다. `tools/_work/경로검사/{KEY}.md` 를 읽어 걸린 문항만 출제 의도 경로(그래프·기하)로 plan·sol 을 다시 써라. `tools/해설규칙.md`·`tools/정석경로/` 기준. 그림이 필요하면 `# 그림 지시:` 주석과 `@fig:` 줄. 문제 쪽(stem·choices·answer·chk)은 바꾸지 마라. 한글·굽기 금지. 끝나면 고친 문항과 이유 한 줄씩.'''


def claude(prompt, tag):
    exe = claude_exe()
    if not exe: return 1, '클로드 실행 파일 없음'
    t = time.time()
    try:
        r = subprocess.run([exe, '-p', prompt, '--permission-mode', 'acceptEdits', '--add-dir', GS,
                            '--allowedTools', 'Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash(python:*)', 'Bash(python -X utf8:*)',
                            '--output-format', 'json'],
                           cwd=TOOLS, env=ENV, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=3 * 3600, stdin=subprocess.DEVNULL)
        out, rc = (r.stdout or '') + (r.stderr or ''), r.returncode
    except subprocess.TimeoutExpired:
        out, rc = 'TIMEOUT', -9
    open(os.path.join(LOGD, f'{tag}.claude.json'), 'w', encoding='utf-8').write(out)
    tok = ''
    try:
        j = json.loads(out[out.find('{'):]); u = j.get('usage') or {}
        tok = f"{(u.get('input_tokens', 0) + u.get('output_tokens', 0) + u.get('cache_read_input_tokens', 0) + u.get('cache_creation_input_tokens', 0)):,}토큰"
        if j.get('is_error'): rc = rc or 1
    except Exception: pass
    return rc, f'{tok} {(time.time() - t) / 60:.0f}분'


def finish(key):
    r = subprocess.run([VPY, '-X', 'utf8', os.path.join(ROOT, 'scripts', 'hq', 'solve_finish.py'), key], cwd=ROOT, env=ENV,
                       capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=5 * 3600, stdin=subprocess.DEVNULL)
    return r.returncode, (r.stdout or '').strip().splitlines()[-1:] or ['']


def one(key):
    it = G.queue_item(key)
    rc, tok, mins, _ = G.run('qonly', key, LOGD)
    say(key, f'코덱스 문제 쪽 rc{rc} {tok}토큰 {mins:.0f}분')
    if rc != 0: return key, '문제 쪽 실패'
    rc, tok, mins, _ = G.run('recheck', key, LOGD); say(key, f'코덱스 재대조 rc{rc} {tok}토큰 {mins:.0f}분')
    base = open(os.path.join(TOOLS, '_work', '클로드해설만지시.md'), encoding='utf-8').read()
    rc, info = claude(base.replace('{KEY}', key) + CLAUDE_EXTRA.replace('{KEY}', key), key)
    say(key, f'클로드 해설 rc{rc} {info}')
    if rc != 0: return key, '클로드 해설 실패'
    for attempt in (1, 2):
        rc, last = finish(key); say(key, f'마무리·경로검사·굽기 rc{rc} {last[0][:160]}')
        if rc == 0: break
        if rc == 2 and attempt == 1:
            rc2, info = claude(ROUTE_FIX.replace('{KEY}', key), key + '_route'); say(key, f'경로 고침(클로드) rc{rc2} {info}')
            continue
        return key, '마무리/굽기 실패'
    hwp = os.path.join(COMP, it['outname'] + '.hwp')
    return key, '구움' if os.path.exists(hwp) else '굽기 결과 없음'


# ⑤ 회원 안내 저장 ----------------------------------------------------------------------
def save_notice(it, text):
    sys.path.insert(0, os.path.join(ROOT, 'scripts', 'variant_pipeline', 'mine'))
    from db import get, URL, H
    import urllib.request
    m = re.match(r'(.+?)_(.+?)_(\d{4})년_(\d)(중간|기말)_(.+?)(\d)_(.+)$', it['outname'])
    if not m: return '이름 해석 실패'
    school, year, grade = m.group(6), m.group(3), m.group(7)
    rows = get('exam_materials', select='id,school,exam_year,grade,subject,description,created_at', content_type='eq.원본제보',
               school='eq.' + school, exam_year='eq.' + year, order='created_at.desc', limit='10')
    rows = [r for r in rows if str(r.get('grade')) == grade]
    if len(rows) != 1: return f'제보 행 {len(rows)}개 — 저장 안 함(사장이 확인)'
    r = rows[0]; d = json.loads(r['description'] or '{}')
    if d.get('admin_reply'): return '이미 안내 있음 — 덮어쓰지 않음'
    d['admin_reply'] = text.strip(); d['replied_at'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    req = urllib.request.Request(URL + 'exam_materials?id=eq.' + r['id'], method='PATCH', data=json.dumps({'description': json.dumps(d, ensure_ascii=False)}).encode(),
                                 headers={**H, 'Content-Type': 'application/json', 'Prefer': 'return=minimal'})
    urllib.request.urlopen(req, timeout=60)
    return '저장함 ' + r['id'][:8]


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--dry-run', action='store_true'); a = ap.parse_args()
    if os.path.exists(LOCKF) and time.time() - os.path.getmtime(LOCKF) < 20 * 3600:
        print('다른 실행 중'); return
    open(LOCKF, 'w').write(str(os.getpid()))
    try:
        st = load(STATE, {})
        pdfs = [p for p in sorted(glob.glob(os.path.join(NAME, '*_원본제보.pdf'))) if '확인필요' not in os.path.basename(p)]
        say(f'네임 폴더 원본제보 {len(pdfs)}개')
        with ThreadPoolExecutor(6) as ex: res = list(ex.map(verify, pdfs))
        ok = []
        for p, v in zip(pdfs, res):
            n = os.path.basename(p); say('확인', '맞음' if v.get('match') is True else '그대로 둠', n, '|', v.get('read', ''), '|', v.get('reason', ''))
            st[n] = {'verify': v, 'at': STAMP}
            if v.get('match') is True: ok.append(p)
        json.dump(st, open(STATE, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        if a.dry_run or not ok: return
        before = {i['key'] for i in json.load(open(os.path.join(TOOLS, 'queue.json'), encoding='utf-8'))['items']}
        for p in ok:
            dst = os.path.join(GS, os.path.basename(p))
            if os.path.exists(dst): say('이미 솔브 폴더에 있음 — 건너뜀', os.path.basename(p)); continue
            shutil.move(p, dst)
        subprocess.run([SYSPY, '-X', 'utf8', 'manifest.py'], cwd=TOOLS, env=ENV, capture_output=True, timeout=600, stdin=subprocess.DEVNULL)
        items = json.load(open(os.path.join(TOOLS, 'queue.json'), encoding='utf-8'))['items']
        names = {os.path.basename(p) for p in ok}
        keys = [i['key'] for i in items if i['key'] not in before and os.path.basename(str(i.get('src', ''))) in names]
        say('새 열쇠', ' '.join(keys) or '없음')
        with ThreadPoolExecutor(PAR) as ex: done = list(ex.map(one, keys))
        baked = [k for k, s in done if s == '구움']
        # ⑤ 회원 안내
        for k in baked:
            f = os.path.join(TOOLS, '_work', f'클로드해설_{k}.md')
            t = open(f, encoding='utf-8').read() if os.path.exists(f) else ''
            m = re.search(r'^## 회원 안내\s*\n(.+?)(?=^## |\Z)', t, re.S | re.M)
            if m:
                try: say(k, '회원 안내', save_notice(G.queue_item(k), m.group(1)))
                except Exception as e: say(k, '회원 안내 저장 실패', e)
        # ④ real → try
        outs = []
        for k in baked:
            o = G.queue_item(k)['outname']
            for f in (o + '.hwp', o + '_원본제보.pdf'):
                if os.path.exists(os.path.join(COMP, f)) and not os.path.exists(os.path.join(REAL, f)): shutil.move(os.path.join(COMP, f), os.path.join(REAL, f))
            outs.append(o)
        if outs:
            r = subprocess.run([SYSPY, '-X', 'utf8', 'real.py'] + outs, cwd=REAL_TOOLS, env=ENV, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=4 * 3600, stdin=subprocess.DEVNULL)
            open(os.path.join(LOGD, 'real.log'), 'w', encoding='utf-8').write((r.stdout or '') + (r.stderr or ''))
            c = subprocess.run([SYSPY, '-X', 'utf8', 'check_real_pics.py'], cwd=REAL_TOOLS, env=ENV, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=1800)
            bad = [l for l in (c.stdout or '').splitlines() if any(o in l for o in outs) and not l.startswith('OK')]
            say('real.py rc', r.returncode, '| 그림 검사 문제', len(bad), *(bad[:5]))
            for o in outs:
                if any(o in l for l in bad): say('그림 문제로 real 에 남김', o); continue
                for f in (o + '.hwp', o + '.pdf', o + '.hml', o + 'ㅈㄷ.pdf', o + '_원본제보.pdf'):
                    s = os.path.join(REAL, f)
                    if os.path.exists(s) and not os.path.exists(os.path.join(TRY, f)): shutil.move(s, os.path.join(TRY, f))
                say('트라이 폴더로', o)
        for k, s in done:
            if s != '구움': say('못 끝냄', k, s)
    finally:
        rep = os.path.join(DAY, datetime.date.today().isoformat() + '.md')
        open(rep, 'a', encoding='utf-8').write(f'# {STAMP} 원본제보 하루 처리\n\n' + '\n'.join(f'- {l}' for l in REPORT) + '\n\n')
        os.remove(LOCKF)


if __name__ == '__main__':
    main()
