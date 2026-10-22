"""코덱스 직원에게 장문 분석글 맡기기: python run_codex.py <outdir> <exam_id ...> (시험지마다 1명 동시)"""
import subprocess, sys, os, re, concurrent.futures as cf
sys.stdout.reconfigure(encoding='utf-8')
D = os.path.dirname(os.path.abspath(__file__)); REPO = os.path.abspath(os.path.join(D, '..', '..'))
CODEX = [r'C:\Program Files\nodejs\node.EXE', r'C:\Users\matho\AppData\Roaming\npm\node_modules\@openai\codex\bin\codex.js']
outdir, ids = sys.argv[1], sys.argv[2:]

def one(eid):
    prompt = (f'C:\dev\mathetf\scripts\exam_long\WRITER_PROMPT.md 를 읽고 그대로 따르세요. 담당 exam_id: {eid}. 출력폴더: {outdir} '
              f'(결과 파일 C:\dev\mathetf\scripts\exam_long\{outdir}\{eid}.json). 이 결과 파일 말고 다른 파일은 만들거나 고치지 마세요. '
              f'검사는 C:\dev\mathetf 에서 `py -X utf8 scripts/exam_long/check.py --dir {outdir} {eid}` 를 OK 가 나올 때까지. 마지막 줄에 "완료 {eid}".')
    r = subprocess.run(CODEX + ['exec', '--skip-git-repo-check', '-c', 'notify=[]', '-c', 'mcp_servers={}', '--sandbox', 'workspace-write',
                                '-C', REPO, prompt], capture_output=True, text=True, encoding='utf-8', errors='replace', stdin=subprocess.DEVNULL, timeout=3600)
    out = (r.stdout or '') + (r.stderr or '')
    open(os.path.join(D, 'logs', f'codex_{eid}.log'), 'w', encoding='utf-8').write(out)
    m = re.search(r'tokens used\s*\n\s*([\d,]+)', out)
    return eid, r.returncode, m[1] if m else '?', os.path.exists(os.path.join(D, outdir, eid + '.json'))

with cf.ThreadPoolExecutor(len(ids)) as ex:
    for eid, rc, tok, ok in ex.map(one, ids): print(eid, 'rc', rc, '토큰', tok, '결과', ok, flush=True)
