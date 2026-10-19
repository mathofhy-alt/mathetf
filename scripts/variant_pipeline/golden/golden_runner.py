"""Prepare isolated replay inputs and score saved classifications; no model calls.

python golden_runner.py prepare --out golden_work
python golden_runner.py score --out golden_work
"""
from pathlib import Path
import argparse
import hashlib
import json
import re
import sys

ROOT = Path(__file__).resolve().parent
LABELS = {'채택', '보류', '시험용 미채택', '제공 불가'}
J_CHECKS = ('math', 'reuse', 'condition', 'alternative', 'exam')
R_CHECKS = ('identity', 'solution', 'design', 'exam', 'curriculum')


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def write_json(path, obj):
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def output_root(raw):
    path = Path(raw).resolve()
    if path == ROOT or not path.is_relative_to(ROOT):
        raise ValueError('출력은 현재 작업 폴더 아래의 별도 하위 폴더여야 합니다.')
    return path


def source_problem(path):
    text = path.read_text(encoding='utf-8-sig')
    match = re.search(r'^## 문제\s*\n(.*?)(?=^## |\Z)', text, re.S | re.M)
    if not match or not match.group(1).strip():
        raise ValueError(f'원본 문제 절이 없습니다: {path}')
    return match.group(1).strip()


def prepare(out):
    gold = read_json(ROOT / 'golden_set.json')
    if out.exists() and any(out.iterdir()):
        raise ValueError('출력 폴더가 비어 있지 않습니다. 기존 시험을 보존하고 새 --out을 지정하세요.')
    # Validate sources before writing anything. Copy only author-facing fields.
    cases = []
    keep = ('id', 'level', 'direction', 'problem', 'answer', 'answer_value',
            'solution', 'changes', 'difficulty_note', 'check_output')
    for row in gold:
        path = Path(row['path'])
        obj = read_json(path)
        slot = row['slot']
        if obj.get('id') != slot:
            raise ValueError(f'id 불일치: {path}')
        for key in ('problem', 'solution', 'answer_value'):
            if not isinstance(obj.get(key), str) or not obj[key].strip():
                raise ValueError(f'{key} 누락: {path}')
        solve_path = path.parent / f'{slot}_solve.json'
        solve = read_json(solve_path)
        if not solve.get('answer_value') or not isinstance(solve.get('defects'), list):
            raise ValueError(f'과거 독립 풀이 출력 누락: {solve_path}')
        original = path.parent / 'original.md'
        prob = source_problem(original)
        case_id = f'{path.parent.name}_{slot}'
        cases.append((case_id, path, original, solve_path, obj, solve, prob, slot))
    out.mkdir(parents=True, exist_ok=True)
    manifest = {'schema_version': 1, 'mode': '과거 독립 풀이 기록 재생', 'cases': []}
    for case_id, path, original, solve_path, obj, solve, prob, slot in cases:
        base = out / case_id
        judge_dir = base / 'judge'
        review_dir = base / 'review'
        judge_dir.mkdir(parents=True)
        review_dir.mkdir()
        for folder in (judge_dir, review_dir):
            (folder / 'original_problem.txt').write_text(prob, encoding='utf-8')
            (folder / f'{slot}_problem.txt').write_text(obj['problem'], encoding='utf-8')
            write_json(folder / f'{slot}_solve.json', solve)
        write_json(review_dir / f'{slot}.json', {k: obj[k] for k in keep if k in obj})
        for suffix in ('_check.py', '_solve.py'):
            script = path.parent / f'{slot}{suffix}'
            if script.exists():
                (review_dir / script.name).write_bytes(script.read_bytes())
        inputs = {p.relative_to(out).as_posix(): digest(p)
                  for p in base.rglob('*') if p.is_file()}
        manifest['cases'].append({
            'id': case_id, 'slot': slot, 'source': path.as_posix(),
            'source_sha256': digest(path), 'original_sha256': digest(original),
            'historical_solve_sha256': digest(solve_path), 'inputs': inputs,
        })
    write_json(out / 'manifest.json', manifest)
    print(f'{len(cases)}개 재생 입력 준비: {out}')
    print('모델 호출·새 독립 풀이·판정 성능 시험은 실행하지 않았습니다.')


def shape_errors(judge, review):
    errors = []
    required_j = ('original_steps', 'variant_steps', 'original_cruxes', 'variant_cruxes',
                  'verdict', 'reason', 'made_easier', 'forced', 'exam_like',
                  'exam_like_reason', 'wording', 'math_status', 'core_alignment',
                  'non_numeric_status', 'reuse_test', 'condition_test',
                  'misconception_test', 'shortest_route', 'curriculum_status',
                  'length_exception', 'fingerprint', 'findings', 'checks_complete')
    required_r = ('adoption', 'reason', 'problem_matches', 'math_status', 'solution_status',
                  'design_status', 'exam_status', 'curriculum_status', 'alternative_use',
                  'solution_checks', 'findings', 'disagreements', 'checks_complete',
                  'layout_status', 'difficulty_status')
    for name, obj, keys in (('judge', judge, required_j), ('review', review, required_r)):
        missing = [k for k in keys if k not in obj]
        if missing:
            errors.append(f'{name} 필수 키 누락: {missing}')
    for name, obj, keys in (('judge', judge, J_CHECKS), ('review', review, R_CHECKS)):
        if obj.get('schema_version') != 2:
            errors.append(f'{name}.schema_version != 2')
        checks = obj.get('checks_complete')
        if not isinstance(checks, dict) or any(type(checks.get(k)) is not bool for k in keys):
            errors.append(f'{name}.checks_complete 필수 bool 누락')
        if not isinstance(obj.get('findings'), list):
            errors.append(f'{name}.findings 목록 누락')
    if judge.get('verdict') not in ('쉬움', '유지', '어려움', '판정불가'):
        errors.append('judge.verdict 누락·잘못된 값')
    if review.get('adoption') not in LABELS or not review.get('reason'):
        errors.append('review.adoption 또는 reason 누락')
    if type(review.get('problem_matches')) is not bool:
        errors.append('review.problem_matches bool 누락')
    if not isinstance(review.get('solution_checks'), list) or not review['solution_checks']:
        errors.append('review.solution_checks 근거 누락')
    if review.get('adoption') == '채택':
        for name, obj, checks in (('judge', judge, J_CHECKS), ('review', review, R_CHECKS)):
            if any(obj.get('checks_complete', {}).get(k) is not True for k in checks):
                errors.append(f'{name} 미완료 검사를 두고 채택')
            findings = obj.get('findings')
            if isinstance(findings, list) and any(
                isinstance(x, dict) and x.get('severity') in ('차단', '보류') for x in findings
            ):
                errors.append(f'{name} 미해결 발견 사항을 두고 채택')
        for key, val in (('math_status', '확인'), ('solution_status', '확인'),
                         ('design_status', '적합'), ('exam_status', '적합'),
                         ('curriculum_status', '적합'), ('problem_matches', True)):
            if review.get(key) != val:
                errors.append(f'review.{key} 채택 조건 미충족')
        if judge.get('math_status') != '확인' or judge.get('curriculum_status') != '적합':
            errors.append('judge 수학·교육과정 상태와 채택 불일치')
        if (judge.get('core_alignment') != '일치' or judge.get('exam_like') is not True
                or judge.get('forced') != '' or judge.get('wording') != []):
            errors.append('judge 설계·시험 표현 상태와 채택 불일치')
        if review.get('disagreements') != []:
            errors.append('판정 불일치를 남긴 채 채택')
    return errors


def score(out):
    gold = read_json(ROOT / 'golden_set.json')
    expected = {(Path(x['path']).parent.name + '_' + x['slot']): x for x in gold}
    manifest = read_json(out / 'manifest.json')
    results = []
    ids = [x['id'] for x in manifest['cases']]
    if len(ids) != len(set(ids)) or set(ids) != set(expected):
        raise ValueError('manifest의 문항 목록이 golden_set과 다릅니다.')
    for case in manifest['cases']:
        case_id, slot = case['id'], case['slot']
        errors = []
        for name, sha in case['inputs'].items():
            p = out / name
            if not p.is_file() or digest(p) != sha:
                errors.append(f'고정 입력 변경·누락: {name}')
        jd = out / case_id / 'judge' / f'{slot}_judge.json'
        rj = out / case_id / 'review' / f'{slot}_judge.json'
        rr = out / case_id / 'review' / f'{slot}_review.json'
        actual = None
        try:
            judge, review = read_json(jd), read_json(rr)
            if not rj.is_file() or digest(jd) != digest(rj):
                errors.append('review 입력 판정이 고정된 judge 출력과 다릅니다.')
            errors.extend(shape_errors(judge, review))
            actual = review.get('adoption')
        except (OSError, ValueError, TypeError, AttributeError) as exc:
            errors.append(f'결과 누락·형식 오류: {exc}')
        row = expected[case_id]
        matched = actual == row['expected']
        results.append({'id': case_id, 'expected': row['expected'], 'actual': actual,
                        'classification_match': matched, 'output_errors': errors,
                        'must_catch': row['must_catch'], 'evidence_review': '별도 확인 필요'})
    passed = sum(x['classification_match'] and not x['output_errors'] for x in results)
    report = {'classification_and_output_pass': passed, 'total': len(results),
              'evidence_review_complete': False, 'results': results}
    write_json(out / 'score.json', report)
    print(f'분류·출력 완결성: {passed}/{len(results)}. 핵심 근거 충족은 별도 대조해야 합니다.')
    return 0 if passed == len(results) else 2


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=('prepare', 'score'))
    parser.add_argument('--out', default=str(ROOT / 'golden_work'))
    args = parser.parse_args()
    try:
        out = output_root(args.out)
        if args.command == 'prepare':
            prepare(out)
            return 0
        return score(out)
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print(f'실패: {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    raise SystemExit(main())
