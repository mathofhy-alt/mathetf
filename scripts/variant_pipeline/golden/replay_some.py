# -*- coding: utf-8 -*-
"""골라 둔 몇 문항만 새 기준의 judge→review 로 다시 채점 (2026-10-24 — 대표 판정으로 기준을 고친 뒤 회귀 확인)
   python replay_some.py <out폴더> <run폴더/슬롯> ...   예) .../r4/d57e3103/k1
replay.py 와 같은 방식: 원고·독립 풀이는 그대로 두고 생성·새 풀이는 하지 않는다. 기대 판정은 입력에 넣지 않는다.
"""
import json, sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent))
import run as pipeline           # noqa: E402
import golden_runner as golden   # noqa: E402

KEEP = ('id', 'level', 'direction', 'problem', 'answer', 'answer_value', 'solution', 'changes', 'difficulty_note', 'check_output')


def prep(out, src):
    run_dir, slot = Path(src).parent, Path(src).name
    obj = golden.read_json(run_dir / f'{slot}.json'); solve = golden.read_json(run_dir / f'{slot}_solve.json')
    original = run_dir / 'original.md'; prob = golden.source_problem(original)
    base = out / f'{run_dir.parent.name}_{run_dir.name}_{slot}'
    policy = pipeline.make_policy(original.read_text(encoding='utf-8-sig'), {'쉬움': 0, '유지': 2, '어려움': 2}, 2)
    for name in ('judge', 'review'):
        d = base / name; d.mkdir(parents=True)
        (d / 'original_problem.txt').write_text(prob, encoding='utf-8')
        (d / f'{slot}_problem.txt').write_text(obj['problem'], encoding='utf-8')
        golden.write_json(d / f'{slot}_solve.json', solve)
        pipeline.write_json(d / 'delivery_policy.json', policy)
        if (run_dir / 'routes.json').is_file(): (d / 'routes.json').write_bytes((run_dir / 'routes.json').read_bytes())
    golden.write_json(base / 'review' / f'{slot}.json', {k: obj[k] for k in KEEP if k in obj})
    for suffix in ('_check.py', '_solve.py'):
        if (run_dir / f'{slot}{suffix}').is_file(): (base / 'review' / f'{slot}{suffix}').write_bytes((run_dir / f'{slot}{suffix}').read_bytes())
    return base, slot


def one(case):
    base, slot = case
    try:
        j = pipeline.judge(base / 'judge', slot)
        (base / 'review' / f'{slot}_judge.json').write_text((base / 'judge' / f'{slot}_judge.json').read_text(encoding='utf-8'), encoding='utf-8')
        r = pipeline.review(base / 'review', slot)
        return {'case': base.name, 'judge_verdict': (j or {}).get('verdict'), 'adoption': (r or {}).get('adoption'), 'reason': str((r or {}).get('reason', ''))[:400]}
    except Exception as e:
        return {'case': base.name, 'error': str(e)[:300]}


def main():
    out = Path(sys.argv[1]).resolve(); out.mkdir(parents=True, exist_ok=False)
    cases = [prep(out, s) for s in sys.argv[2:]]
    with ThreadPoolExecutor(len(cases)) as ex: res = list(ex.map(one, cases))
    pipeline.write_json(out / 'results.json', {'cases': res, 'tokens': pipeline.TOK[0]})
    for r in res: print(json.dumps(r, ensure_ascii=False))
    print('토큰', pipeline.TOK[0])


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
