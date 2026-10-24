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


def heavy_pool(src_id, src, n=10):
    """같은 대표 유형(question_types unit·code)의 학교 내신 문항 중 원본 연도 이후 것 — 발문 유사도가 낮은(겉모습이 다른) 순.
    심한 변형은 뼈대(유형)는 같고 겉모습이 달라 유사도 목록 상위에 안 뜬다(10/23 대표 지적)."""
    t = get('question_types', select='unit,code', question_id='eq.' + src_id)
    if not t or t[0].get('code') is None: return []
    same = [r['question_id'] for r in get('question_types', select='question_id', unit='eq.' + t[0]['unit'], code='eq.' + str(t[0]['code']), limit='400')]
    same = [q for q in same if q != src_id]
    if not same: return []
    near = {p[0]: float(p[1]) for r in get('question_similar', select='basis,neighbors', question_id='eq.' + src_id) if r['basis'] == 'statement' for p in r['neighbors']}
    F = 'id,school,grade,year,semester,subject,unit,question_number,key_concepts,difficulty,plain_text,equation_scripts,content_xml'
    out = []
    for i in range(0, len(same), 40):
        for r in get('questions', select=F, id='in.(' + ','.join(same[i:i + 40]) + ')', work_status='eq.sorted'):
            if r['school'] in ('전국연합', '수능', '평가원', '사관학교', '경찰대'): continue
            if src.get('year') and r.get('year') and int(r['year']) < int(src['year']): continue
            out.append((near.get(r['id'], 0.0), False, r))
    out.sort(key=lambda x: x[0])        # 발문이 가장 다른 것부터
    return [(0.0, False, r) for _, _, r in out[:n]]


def packet(src_id, mode='statement', n=10):
    src = get('questions', select='id,school,year,semester,grade,subject,unit,question_number,difficulty,content_xml', id='eq.' + src_id)[0]
    stem, sol = split(src['content_xml'] or '')
    lines = [f"# 원본: {src['school']} {src['year']} {src['semester']} {src['grade']} {src['subject']} {src['question_number']}번 · 단원 {src['unit']} · 난이도 {src['difficulty']}",
             '', '## 원본 문제', eq(stem), '', '## 원본 DB 해설(정석 보장 없음 — 참고만)', eq(sol[:2500]), '']
    # 「추천」과 「풀이 유사」 두 목록을 합친다 — 심한 변형은 풀이 유사 쪽에만 뜨기도 한다(정육각형: 수지고·현대고).
    # [10/23 대표] 발문 유사 상위는 숫자변형이 몰려 심한 변형이 밀린다 → 발문 유사는 5개만, 풀이 유사 10개,
    #   그리고 같은 대표 유형(유형 코드) 중 원본 이후 학교 시험 문항을 발문이 가장 다른 순으로 보탠다(heavy_pool).
    rows, seen = [], set()
    for x in ranked(src_id, 'statement', 5) + ranked(src_id, 'solution', n) + heavy_pool(src_id, src, n):
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
    try:
        src, rows, text = packet(src_id)
    except Exception as e:   # [10/23] 한 원본의 DB 오류가 배치 전체를 멈추지 않게
        return src_id, f'자료 오류 {str(e)[:80]}', 0, 0
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
        # [10/20] 단원마다 중간 난도(5~6) 하나 + 고난도(7 이상) 나머지 — 숫자변형·심한 변형 사례가 고루 나오게
        d = lambda r: float(r['difficulty'] or 0)
        want = [('mid', 1), ('high', per - 1)] if per > 1 else [('high', 1)]
        got = 0
        for band, n in want:
            pool = [r for r in rows if (5 <= d(r) < 7 if band == 'mid' else d(r) >= 7)]
            pool.sort(key=lambda r: (-d(r), r['year']) if band == 'high' else (-d(r), r['year']))
            k = 0
            for r in pool:
                if k >= n: break
                if r['id'] in ids: continue
                if len(ranked(r['id'], 'statement', 10, light=True)) >= 8:
                    ids.append(r['id']); k += 1; got += 1
        print(f'{u}: {got}개', flush=True)
    return ids


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--ids', default=''); ap.add_argument('--pick', default=''); ap.add_argument('--per', type=int, default=2)
    ap.add_argument('--out', default='scratch/variant_mine'); ap.add_argument('--par', type=int, default=6)
    a = ap.parse_args()
    ids = [x for x in a.ids.split(',') if x]
    if a.pick: ids += pick([u.strip() for u in a.pick.split(',') if u.strip()], a.per)
    out = Path(a.out).resolve(); out.mkdir(parents=True, exist_ok=True)
    # [10/24] 이미 캔 원본은 건너뛴다 — 같은 폴더에 --per 를 늘려 다시 돌리면 새 원본만 캔다
    ids = [i for i in dict.fromkeys(ids) if not (out / i / 'mine.json').is_file()]
    print('새로 캘 원본', len(ids), flush=True)
    cmd = codex_cmd(); total = 0
    with ThreadPoolExecutor(a.par) as ex:
        for sid, st, tok, sec in ex.map(lambda i: run_one(i, out, cmd), ids):
            total += tok
            print(f'{time.strftime("%H:%M")} {sid} {st} {tok:,}토큰 {sec / 60:.0f}분', flush=True)
    print(f'합계 {total:,}토큰')


if __name__ == '__main__':
    main()
