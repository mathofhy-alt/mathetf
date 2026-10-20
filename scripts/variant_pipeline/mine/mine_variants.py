# -*- coding: utf-8 -*-
"""실제 강사 변형 캐기 (2026-10-20 대표: "숫자변형과 심한변형을 몇 개 못 보여줘서 변형의 후보군이 좀 적은 기분")

모의고사 원본마다 사이트 「유사」 목록(실제 학교 내신 변형) 상위 10개를 코덱스 직원 한 명에게 주고
같은 문제 / 숫자변형(돌린 손잡이) / 심한 변형(ⓐ 장치 바꾸기 · ⓑ 뼈대 깊게, 원본 풀이가 막히는 곳) / 다른 문제 로 판정하게 한다.

  python scripts/variant_pipeline/mine/mine_variants.py --ids <원본id,…> [--out scratch/variant_mine] [--par 6]
  python scripts/variant_pipeline/mine/mine_variants.py --pick "유리함수,도함수의 활용" --per 2   # 단원마다 자동 선택

결과: <out>/<원본id>/packet.md(입력) · mine.json(판정) · codex.log
"""
import argparse, json, os, re, shutil, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from db import get                      # noqa: E402
from ext import split                   # noqa: E402
from rank import ranked                 # noqa: E402

try: sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
except Exception: pass
MOCK = '(전국연합,수능,평가원)'
PROMPT = (HERE / 'mine_prompt.md').read_text(encoding='utf-8')


def eq(text):
    # 한글 수식 기호(⟦…⟧)는 그대로 둔다 — 코덱스가 읽는 데 문제없고, 변환 오류를 막는다.
    return text


def packet(src_id, mode='statement', n=10):
    src = get('questions', select='id,school,year,semester,grade,subject,unit,question_number,difficulty,content_xml', id='eq.' + src_id)[0]
    stem, sol = split(src['content_xml'] or '')
    lines = [f"# 원본: {src['school']} {src['year']} {src['semester']} {src['grade']} {src['subject']} {src['question_number']}번 · 단원 {src['unit']} · 난이도 {src['difficulty']}",
             '', '## 원본 문제', eq(stem), '', '## 원본 DB 해설(정석 보장 없음 — 참고만)', eq(sol[:2500]), '']
    # 「추천」과 「풀이 유사」 두 목록을 합친다 — 심한 변형은 풀이 유사 쪽에만 뜨기도 한다(정육각형: 수지고·현대고).
    rows, seen = [], set()
    for x in ranked(src_id, 'statement', n) + ranked(src_id, 'solution', n):
        if x[2]['id'] not in seen: seen.add(x[2]['id']); rows.append(x)
    for i, (score, iv, r) in enumerate(rows, 1):
        s, so = split(r['content_xml'] or '')
        lines += [f"## 후보 {i}: {r['school']} {r['year']} {r['semester']} {r['grade']} {r['subject']} {r['question_number']}번 · 난이도 {r['difficulty']}",
                  '### 문제', eq(s), '### DB 해설 앞부분', eq(so[:1500]), '']
    return src, rows, '\n'.join(lines)


def codex_cmd():
    node = shutil.which('node'); npm = shutil.which('npm.cmd') or shutil.which('npm')
    root = subprocess.run([npm, 'root', '-g'], capture_output=True, text=True, shell=(os.name == 'nt')).stdout.strip()
    return [node, str(Path(root) / '@openai/codex/bin/codex.js')]


def run_one(src_id, out, cmd):
    D = out / src_id; D.mkdir(parents=True, exist_ok=True)
    if (D / 'mine.json').is_file():
        return src_id, 'skip', 0, 0
    src, rows, text = packet(src_id)
    (D / 'packet.md').write_text(text, encoding='utf-8')
    (D / 'meta.json').write_text(json.dumps({'src': {k: v for k, v in src.items() if k != 'content_xml'},
        'candidates': [{k: r[k] for k in ('id', 'school', 'year', 'semester', 'grade', 'subject', 'question_number', 'difficulty')} for _, _, r in rows]},
        ensure_ascii=False, indent=1), encoding='utf-8')
    t = time.time()
    r = subprocess.run(cmd + ['exec', '--skip-git-repo-check', '-c', 'model_reasoning_effort=medium', '-c', 'notify=[]', '-c', 'mcp_servers={}',
                       '--sandbox', 'workspace-write', '-C', str(D), PROMPT.replace('{N}', str(len(rows)))],
                       capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=3600, stdin=subprocess.DEVNULL)
    log = (r.stdout or '') + (r.stderr or ''); (D / 'codex.log').write_text(log, encoding='utf-8')
    m = re.search(r'tokens used\s*\n\s*([\d,]+)', log)
    ok = (D / 'mine.json').is_file()
    return src_id, 'ok' if ok else f'실패 rc{r.returncode}', int(m[1].replace(',', '')) if m else 0, time.time() - t


def pick(units, per):
    ids = []
    for u in units:
        rows = get('questions', select='id,difficulty,year', school='in.' + MOCK, unit='eq.' + u, work_status='eq.sorted',
                   order='year.desc', limit='200')
        rows = sorted(rows, key=lambda r: (-float(r['difficulty'] or 0), r['year']), reverse=False)
        got = 0
        for r in rows:
            if got >= per: break
            if len(ranked(r['id'], 'statement', 10)) >= 8:
                ids.append(r['id']); got += 1
        print(f'{u}: {got}개', flush=True)
    return ids


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--ids', default=''); ap.add_argument('--pick', default=''); ap.add_argument('--per', type=int, default=2)
    ap.add_argument('--out', default='scratch/variant_mine'); ap.add_argument('--par', type=int, default=6)
    a = ap.parse_args()
    ids = [x for x in a.ids.split(',') if x]
    if a.pick: ids += pick([u.strip() for u in a.pick.split(',') if u.strip()], a.per)
    out = Path(a.out).resolve(); out.mkdir(parents=True, exist_ok=True)
    cmd = codex_cmd(); total = 0
    with ThreadPoolExecutor(a.par) as ex:
        for sid, st, tok, sec in ex.map(lambda i: run_one(i, out, cmd), ids):
            total += tok
            print(f'{time.strftime("%H:%M")} {sid} {st} {tok:,}토큰 {sec / 60:.0f}분', flush=True)
    print(f'합계 {total:,}토큰')


if __name__ == '__main__':
    main()
