# -*- coding: utf-8 -*-
"""시험지 PDF 쪽 그림 → 문항별 original.md (변형 파이프라인 입력) — 코덱스 직원 한 명이 한 문항 (2026-10-21)

  python scripts/variant_pipeline/transcribe_pdf.py <작업폴더> --nos 12-25 --pages "12:5,13:5,14:6,…" --answers "12:13,13:27,…" [--par 14]

작업폴더/pages/pNN.png 가 있어야 한다. 결과: 작업폴더/qNN/original.md (+ transcribe.log)
"""
import argparse, json, os, re, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import gs_all as G   # noqa: E402  (CODEX 경로)

UNITS = '함수의극한, 함수의연속, 미분계수와도함수, 도함수의활용, 부정적분, 정적분, 정적분의활용'
PROMPT = '''첨부한 그림은 고등학교 수학 시험지(과목 미적분Ⅰ = 2015 과정 수학Ⅱ)의 쪽이다. 그중 **{NO}번 문항 하나만** 옮겨 적어라(다른 문항은 무시). 문항이 다음 쪽으로 넘어가면 둘째 그림에 이어진다.
이 시험지의 정답표에 따르면 {NO}번 정답은 「{ANS}」 이다.

할 일
1. {NO}번의 발문·조건 상자·보기·선지를 빠짐없이 옮겨 적는다. 수식은 모두 LaTeX(KaTeX) `$…$`, 따로 세운 식은 `$$…$$`. 선지가 있으면 끝에 `① $…$　② $…$ …` 다섯 개. 조건 상자 (가)(나)는 줄을 나눠 그대로.
2. 그림이 있으면 그림이 주는 조건(점·곡선·위치 관계)을 글로 「## 그림」 절에 정확히 적는다(그림 없이도 문제가 풀리게). 발문에 「그림과 같이」「다음 그림」이 있으면 반드시 그림이 있는 것이다 — 「원본에 그림 없음」이라고 쓰지 마라(10/21 15번 원뿔대 용기를 없음으로 적은 사고).
3. 직접 끝까지 풀어 정답표의 답과 같은지 확인한다(Python 검산 가능). 다르면 옮겨 적기를 다시 확인하고, 그래도 다르면 「## 확인 필요」 절에 이유를 적는다.
4. 「## 풀이 메모」에 출제 의도대로 푼 풀이 요지를 쓴다(그래프·개형으로 읽는 문제면 그래프로, 계산 문제면 계산으로). 5~12줄, 수식은 LaTeX.
5. 「## 출처」 한 줄: `그림 아래·옆의 출처 표시(있으면 그대로) · 과목 미적분I · 단원 <아래 중 하나> · {NO}번 · 난이도 추정 N(1~10)`. 단원: {UNITS}

`original.md` 하나만 UTF-8 로 쓴다. 형식:
## 문제
…
## 정답
(객관식이면 「② 3」처럼 번호와 값, 단답이면 값)
## 풀이 메모
…
## 그림
(없으면 「원본에 그림 없음.」)
## 출처
…
(필요할 때만) ## 확인 필요
끝나면 "완료" 한 줄만 답하라.'''


def run(no, page, ans, work, pages):
    D = Path(work) / f'q{no:02d}'; D.mkdir(parents=True, exist_ok=True)
    if (D / 'original.md').is_file(): return no, 'skip', 0, 0
    imgs = [pages / f'p{page:02d}.png'] + ([pages / f'p{page + 1:02d}.png'] if (pages / f'p{page + 1:02d}.png').is_file() else [])
    p = PROMPT.replace('{NO}', str(no)).replace('{ANS}', ans).replace('{UNITS}', UNITS)
    t = time.time()
    r = subprocess.run(G.CODEX + ['exec', '--skip-git-repo-check', '-c', 'notify=[]', '-c', 'mcp_servers={}', '-c', 'model_reasoning_effort=medium',
                       '--sandbox', 'workspace-write', '-C', str(D), p] + sum([['-i', str(i)] for i in imgs], []),
                       capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=3600, stdin=subprocess.DEVNULL)
    out = (r.stdout or '') + (r.stderr or ''); (D / 'transcribe.log').write_text(out, encoding='utf-8')
    m = re.search(r'tokens used\s*\n\s*([\d,]+)', out)
    return no, 'ok' if (D / 'original.md').is_file() else f'실패 rc{r.returncode}', int(m[1].replace(',', '')) if m else 0, (time.time() - t) / 60


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('work'); ap.add_argument('--pages', required=True); ap.add_argument('--answers', required=True)
    ap.add_argument('--par', type=int, default=14); a = ap.parse_args()
    pg = {int(k): int(v) for k, v in (x.split(':') for x in a.pages.split(','))}
    an = {int(k): v for k, v in (x.split(':', 1) for x in a.answers.split(','))}
    pages = Path(a.work) / 'pages'; tot = 0
    with ThreadPoolExecutor(a.par) as ex:
        for no, st, tok, mins in ex.map(lambda n: run(n, pg[n], an[n], a.work, pages), sorted(pg)):
            tot += tok; print(f'{time.strftime("%H:%M")} {no}번 {st} {tok:,}토큰 {mins:.0f}분', flush=True)
    print(f'합계 {tot:,}토큰')


if __name__ == '__main__':
    main()
