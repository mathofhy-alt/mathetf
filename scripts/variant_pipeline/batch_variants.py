# -*- coding: utf-8 -*-
"""시험지 한 장의 여러 문항을 한꺼번에 변형 (2026-10-21 대표: 주간테스트 21회 12~25번 숫자변형 1·심한 변형 1)

  python scripts/variant_pipeline/batch_variants.py <작업폴더> --nos 12-25 [--keep 1 --hard 1 --easy 0] [--par 14]

작업폴더/qNN/original.md (transcribe_pdf.py) → 작업폴더/vNN/ (run.py --fast). 있으면 작업폴더/similar_qNN.md 를 --similar 로.
끝나면 작업폴더/review.html (14문항 한 장) — render_web 의 원본·칸 카드를 문항 순서로 이어 붙인다.
"""
import argparse, re, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import render_web as W   # noqa: E402


def nos(s):
    out = []
    for part in s.split(','):
        a, _, b = part.partition('-'); out += list(range(int(a), int(b or a) + 1))
    return out


def unit_of(md):
    m = re.search(r'단원\s*[:：]?\s*([가-힣]+)', md)
    return m.group(1) if m else ''


def one(work, no, a):
    W_ = Path(work); src = W_ / f'q{no:02d}' / 'original.md'; D = W_ / f'v{no:02d}'
    if not src.is_file(): return no, '원본 없음', 0
    if (D / 'delivery_report.json').is_file() and not (D / '.pipeline.lock').is_file(): return no, 'skip', 0
    cmd = [sys.executable, '-X', 'utf8', str(HERE / 'run.py'), str(D), str(src), '--unit', unit_of(src.read_text(encoding='utf-8')),
           '--easy', str(a.easy), '--keep', str(a.keep), '--hard', str(a.hard), '--fast', '--max-attempts', '2', '--workers', '3']
    sim = W_ / f'similar_q{no:02d}.md'
    if sim.is_file(): cmd += ['--similar', str(sim)]
    t = time.time()
    r = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=3 * 3600)
    (W_ / f'v{no:02d}.log').write_text((r.stdout or '') + (r.stderr or ''), encoding='utf-8')
    return no, f'rc{r.returncode}', (time.time() - t) / 60


def page(work, numbers, title):
    W_ = Path(work); heads, bodies = None, []
    for no in numbers:
        D = W_ / f'v{no:02d}'
        if not (D / 'delivery_report.json').is_file(): continue
        html = W.build(str(D), f'{no}번')
        if heads is None: heads = html[:html.index('<main')]
        inner = html[html.index('<main'):]
        inner = inner[inner.index('>') + 1:inner.rindex('</main>')]
        inner = re.sub(r'<header>.*?</header>', f'<h2 class="qno">{no}번</h2>', inner, count=1, flags=re.S)
        bodies.append(f'<section class="q">{inner}</section>')
    css = '<style>.q{display:flex;flex-direction:column;gap:14px;padding-block:8px 28px;border-bottom:1px solid var(--line)}.qno{font-size:1.25rem;margin:8px 0 0}</style>'
    heads = re.sub(r'<title>.*?</title>', f'<title>{title}</title>', heads or '', count=1)
    out = heads + css + f'<main class="wrap"><header><h1>{title}</h1><div class="src">문항마다 원본(위) · 숫자변형 · 심한 변형. 해설은 쓰지 않았고 접힌 「풀이 요지」는 검산용입니다.</div></header>' + ''.join(bodies) + '</main>'
    (W_ / 'review.html').write_text(out, encoding='utf-8'); return W_ / 'review.html'


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('work'); ap.add_argument('--nos', required=True)
    ap.add_argument('--easy', type=int, default=0); ap.add_argument('--keep', type=int, default=1); ap.add_argument('--hard', type=int, default=1)
    ap.add_argument('--par', type=int, default=14); ap.add_argument('--title', default='변형'); ap.add_argument('--page-only', action='store_true')
    a = ap.parse_args(); ns = nos(a.nos)
    if not a.page_only:
        with ThreadPoolExecutor(a.par) as ex:
            for no, st, mins in ex.map(lambda n: one(a.work, n, a), ns):
                print(f'{time.strftime("%H:%M")} {no}번 {st} {mins:.0f}분', flush=True)
    print(page(a.work, ns, a.title))


if __name__ == '__main__':
    main()
