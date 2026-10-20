# -*- coding: utf-8 -*-
"""운영 judge/review로 고정 독립 풀이 13건을 재생한다.

기본: 경로/입력만 검사. --execute가 있을 때에만 유료 모델 호출.
python scripts/variant_pipeline/golden/replay.py --execute --out scripts/variant_pipeline/golden/replay_work1
새 solve/생성/원고 수정은 실행하지 않는다. 근거 충족은 score 이후 별도 대조한다.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent))
import run as pipeline
import golden_runner as golden


def preflight():
    rows = golden.read_json(ROOT / 'golden_set.json')
    if not isinstance(rows, list) or len(rows) != 13:
        raise ValueError('골든 세트는 정확히 13케이스 필요')
    seen = set()
    for row in rows:
        path, slot = Path(row['path']), row['slot']
        key = f'{path.parent.name}_{slot}'
        if key in seen or row['expected'] not in golden.LABELS:
            raise ValueError('골든 id/기대값 오류')
        seen.add(key)
        for source in (path, path.parent / 'original.md', path.parent / f'{slot}_solve.json'):
            if not source.is_file(): raise ValueError(f'고정 입력 경로 없음: {source}')
        manuscript, solve = golden.read_json(path), golden.read_json(path.parent / f'{slot}_solve.json')
        if manuscript.get('id') != slot: raise ValueError(f'id 불일치: {path}')
        for field in ('problem', 'solution', 'answer_value'):
            if not isinstance(manuscript.get(field), str) or not manuscript[field].strip():
                raise ValueError(f'원고 {field} 누락: {path}')
        if not isinstance(solve.get('defects'), list) or pipeline.numeric_value(solve.get('answer_value')) is None:
            raise ValueError(f'고정 독립 풀이 필수 값 오류: {path}')
        golden.source_problem(path.parent / 'original.md')
        pipeline.prompt('judge', SLOT=slot)
        pipeline.prompt('review', SLOT=slot)
    return rows


def prepare(out, rows):
    golden.prepare(out)
    manifest = golden.read_json(out / 'manifest.json')
    originals = {f'{Path(row["path"]).parent.name}_{row["slot"]}': Path(row['path']).parent / 'original.md' for row in rows}
    for case in manifest['cases']:
        # 운영과 같은 출처 기반 정책을 양 검토 단계에 전달한다.
        source = originals[case['id']].read_text(encoding='utf-8-sig')
        requested = {'쉬움': 2, '유지': 2, '어려움': 2}
        policy = pipeline.make_policy(source, requested, 2)
        base = out / case['id']
        for name in ('judge', 'review'):
            pipeline.write_json(base / name / 'delivery_policy.json', policy)
        case['inputs'] = {p.relative_to(out).as_posix(): golden.digest(p) for p in base.rglob('*') if p.is_file()}
    manifest['production_runner_sha256'] = golden.digest(ROOT.parent / 'run.py')
    manifest['prompt_sha256'] = {name: golden.digest(ROOT.parent / 'prompts' / f'{name}.md') for name in ('judge', 'review')}
    manifest['mode'] = '과거 독립 풀이 기록 재생; 운영 judge/review 함수; 출처 정책 포함'
    golden.write_json(out / 'manifest.json', manifest)
    return manifest


def one(out, case):
    slot, base = case['slot'], out / case['id']
    for name, sha in case['inputs'].items():
        if golden.digest(out / name) != sha: raise ValueError(f'고정 입력 변경: {name}')
    # 기대값/원본 해설/plan/과거 평가는 호출 입력에 없다.
    pipeline.judge(base / 'judge', slot)
    pipeline.write_text(base / 'review' / f'{slot}_judge.json',
        (base / 'judge' / f'{slot}_judge.json').read_text(encoding='utf-8'))
    result = pipeline.review(base / 'review', slot)
    return {'id': case['id'], 'adoption': result.get('adoption')}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', default=str(ROOT / 'replay_work'))
    parser.add_argument('--execute', action='store_true', help='명시한 경우에만 모델 호출')
    parser.add_argument('--workers', type=int, default=3)
    args = parser.parse_args(argv)
    if args.workers < 1: parser.error('--workers는 1 이상')
    rows = preflight()
    if not args.execute:
        print('13케이스 경로·고정 입력·치환 키 확인. 모델 호출 없음.')
        return 0
    out = golden.output_root(args.out)
    manifest = prepare(out, rows)
    def replay_case(case):
        try: return one(out, case)
        except (OSError, ValueError, RuntimeError, TypeError, KeyError) as exc:
            return {'id': case['id'], 'error': str(exc)}
    with ThreadPoolExecutor(min(args.workers, len(manifest['cases']))) as executor:
        results = list(executor.map(replay_case, manifest['cases']))
    pipeline.write_json(out / 'replay_results.json', {'cases': results, 'tokens': pipeline.TOK[0],
        'calls': pipeline.CALLS, 'evidence_review_complete': False})
    return golden.score(out)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8')
    raise SystemExit(main())
