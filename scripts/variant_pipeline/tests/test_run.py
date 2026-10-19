"""비용 없는 runner 회귀: 모델 호출은 모두 mock. 골든 재생은 실행하지 않음."""
import copy
import importlib.util
import itertools
import json
from pathlib import Path
import sys
import shutil
from contextlib import contextmanager
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('variant_run', ROOT / 'run.py')
v = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v)


@contextmanager
def workspace():
    path = v.fresh_dir(ROOT, 'offline_test_')
    try:
        yield str(path)
    finally:
        resolved = path.resolve()
        if resolved.parent != ROOT.resolve():
            raise ValueError('테스트 임시 경로가 작업 범위 밖임')
        shutil.rmtree(resolved)


def fixtures():
    g = dict(schema_version=2, id='e1', level='쉬움', direction='A', status='생성 완료', hold_reason='',
        problem='2+3의 값을 구하시오.', answer='5', answer_value='5', solution='2+3=5이다.',
        changes='핵심 한 단계를 제공', difficulty_note='주어진 값의 합', check_output='5',
        design_evidence=dict.fromkeys(('core_relation', 'reuse_break', 'condition_effect', 'wrong_route', 'evidence_ref', 'shortest_route'), '근거'),
        length_exception='', figure_required=False, layout_status='인쇄 편집 미확인')
    s = dict(answer='5', answer_value='5', method='두 수의 합', defects=[], script_output='5')
    j = dict(schema_version=2, original_steps=2, variant_steps=1, original_cruxes=['원본 관계'], variant_cruxes=['일부 제공'],
        verdict='쉬움', reason='핵심을 제공함', made_easier=['핵심 제공'], forced='', exam_like=True, exam_like_reason='', wording=[],
        math_status='확인', core_alignment='일치', non_numeric_status='해당 없음',
        reuse_test={'equations': '합', 'first_change': '핵심 제공'}, condition_test='조건 사용',
        misconception_test={'route': '평가하지 않음', 'result': '없음', 'differs_from_correct': None},
        shortest_route='덧셈', curriculum_status='적합', length_exception='',
        fingerprint={'core_relation': '합', 'decision': '핵심 제공', 'answer_value': '5'}, findings=[],
        checks_complete=dict.fromkeys(v.J_CHECKS, True))
    r = dict(schema_version=2, adoption='채택', reason='원고 대조 완료', problem_matches=True,
        math_status='확인', solution_status='확인', design_status='적합', exam_status='적합', curriculum_status='적합',
        alternative_use=[], solution_checks=[{'location': '1행', 'claim': '2+3=5', 'check': '덧셈', 'status': '확인'}],
        findings=[], disagreements=[], checks_complete=dict.fromkeys(v.R_CHECKS, True),
        layout_status='인쇄 편집 미확인', difficulty_status='내부 추정')
    executions = {k: {'returncode': 0, 'stdout': '5\n'} for k in ('check', 'solve')}
    return g, s, j, r, executions


class RunnerTests(unittest.TestCase):
    def test_exact_values_and_invalid_inputs(self):
        for a, b, expected in [('1/2', '0.5', True), ('1+3√2', '1+4√2', False),
                ('sqrt8', '2sqrt2', True), ('pi/2', 'π/2', True),
                ('1.00000000000000001', '1', False), ('', '', None),
                ('① 5', '5', None), ('[1,2]', '2', None), ('nan', 'nan', None),
                ('sqrt(-1)', 'sqrt(-1)', None), ('1/0', '1/0', None),
                ('__import__("os").system("bad")', '0', None), ('1e9999999', '1', None),
                ('x', 'x', None), ('1_000', '1000', None)]:
            with self.subTest(a=a, b=b): self.assertIs(v.same_value(a, b), expected)

    def test_adoption_missing_every_required_key_blocks(self):
        g, s, j, r, exe = fixtures()
        self.assertEqual(v.adoption_errors(g, s, j, r, '쉬움', '99', exe), [])
        for name, obj in [('judge', j), ('review', r), ('solve', s)]:
            for key in obj:
                altered = copy.deepcopy(obj)
                del altered[key]
                args = [g, s, j, r, '쉬움', '99', exe]
                args[{'solve': 1, 'judge': 2, 'review': 3}[name]] = altered
                with self.subTest(name=name, key=key): self.assertTrue(v.adoption_errors(*args))

    def test_adoption_failures_and_exact_original_comparison(self):
        for target, field, value in [('solve', 'answer_value', ''), ('solve', 'defects', ['조건 누락']),
                ('judge', 'forced', '별개 과제'), ('judge', 'verdict', '판정불가'),
                ('judge', 'checks_complete', {}), ('review', 'disagreements', ['불일치']),
                ('review', 'findings', [{'category': '수학', 'severity': '차단', 'location': '1행', 'evidence': '오류', 'required_action': '수정'}])]:
            g, s, j, r, exe = fixtures()
            {'solve': s, 'judge': j, 'review': r}[target][field] = value
            self.assertTrue(v.adoption_errors(g, s, j, r, '쉬움', '99', exe))
        g, s, j, r, exe = fixtures()
        for original in ('5', ''): self.assertTrue(v.adoption_errors(g, s, j, r, '쉬움', original, exe))
        exe['solve']['returncode'] = 1
        self.assertTrue(v.adoption_errors(g, s, j, r, '쉬움', '99', exe))

    def test_mcq_and_short_answer_different_limits(self):
        g = fixtures()[0]
        g.update(problem='값은? ① 1000 ② 1001 ③ sqrt2 ④ -1 ⑤ 1/2', answer='① 1000', answer_value='1000')
        self.assertEqual(v.generation_errors(g, 'e1', '쉬움'), [])
        g['answer'] = '② 1000'
        self.assertTrue(v.generation_errors(g, 'e1', '쉬움'))
        g.update(problem='값은?', answer='1000')
        self.assertTrue(v.generation_errors(g, 'e1', '쉬움'))

    def test_procedure_numbers_are_not_choices(self):
        g = fixtures()[0]
        for value in ('377', '76', '254', '0', '999'):
            with self.subTest(value=value):
                g.update(problem='① 공을 옮긴다. ② 다시 꺼낸다. ①, ②를 한 시행이라 한다. p+q는?',
                         answer=value, answer_value=value)
                self.assertIsNone(v.choices(g['problem']))
                self.assertEqual(v.generation_errors(g, 'e1', '쉬움'), [])
        g.update(answer='1000', answer_value='1000')
        self.assertIn('단답형은 0~999 정수 필요', v.generation_errors(g, 'e1', '쉬움'))
        g.update(problem='① 준비 ② 이동 ③ 확인 ④ 계산 ⑤ 값을 구하시오.', answer='5', answer_value='5')
        self.assertEqual(v.generation_errors(g, 'e1', '쉬움'), [])
        g.update(problem='① 준비 ② 이동. 값은? ① 1 ② 2 ③ 3 ④ 4 ⑤ 5', answer='⑤ 5')
        self.assertEqual(v.generation_errors(g, 'e1', '쉬움'), [])
        g['answer'] = '5'
        self.assertTrue(v.generation_errors(g, 'e1', '쉬움'))
        for text in ('① 공을 옮긴다. ② 다시 꺼낸다.', '값? ① 1 ② 2 ③ 3 ④ 4'):
            g.update(problem=text, answer='① 5')
            self.assertTrue(v.generation_errors(g, 'e1', '쉬움'))
        original = '## 문제\n① 공을 옮긴다. ② 다시 꺼낸다. 답은?\n\n## 정답\n77'
        self.assertEqual(v.original_answer(original, v.section(original, '문제'))['answer_value'], '77')

    def test_check_script_dependency_is_generation_defect_and_stops_calls(self):
        g = fixtures()[0]
        with workspace() as temp:
            D = Path(temp)
            for name in ('original.md', 'plan.json', 'real_errors.md'):
                v.write_text(D / name, '{}')
            def fake(folder, text, tag, effort='high', ticket=None):
                self.assertEqual(tag, 'generate')
                v.write_json(Path(folder) / 'e1.json', g)
                v.write_text(Path(folder) / 'e1_check.py', 'from pathlib import Path\nprint(Path("plan.json").read_text())\n')
                return {'returncode': 0, 'tokens': 1}
            with patch.object(v, 'codex', side_effect=fake) as model, patch.object(v, 'BUDGET', None), patch.object(v.subprocess, 'run') as execute:
                row = v.slot_pipeline(D, 'e1', '쉬움', 1, '77')
            self.assertFalse(row['eligible'])
            self.assertIn('생성 단계 검산 결함', row['problems'][0])
            self.assertTrue(row['runner_executions']['check']['dependency_errors'])
            self.assertIsNone(v.load(D / 'e1_check_run.json')['returncode'])
            self.assertEqual(model.call_count, 1)
            execute.assert_not_called()
            self.assertFalse((D / 'e1_solve.json').exists())

    def test_failed_check_or_solve_does_not_spend_downstream_calls(self):
        for failed in ('check', 'solve'):
            with self.subTest(failed=failed), workspace() as temp:
                D = Path(temp)
                g, solve, _, _, _ = fixtures()
                order = []
                def fake(folder, stage, *args, **kwargs):
                    order.append(stage)
                    if stage == 'generate':
                        v.write_text(D / 'e1_check.py', 'print(5)\n')
                        return g
                    self.assertEqual(stage, 'solve')
                    v.write_text(D / 'e1_solve.py', 'print(5)\n')
                    return solve
                def execute(folder, slot, suffix):
                    return {'returncode': 1 if suffix == failed else 0,
                            'stdout': '' if suffix == failed else '5', 'stderr': 'assertion failure' if suffix == failed else ''}
                with patch.object(v, 'isolated_call', fake), patch.object(v, 'execute_script', execute), patch.object(v, 'BUDGET', None):
                    result = v.slot_pipeline(D, 'e1', '쉬움', 1, '77')
                self.assertFalse(result['eligible'])
                self.assertEqual(order, ['generate'] if failed == 'check' else ['generate', 'solve'])
                self.assertIn('검산 결함', result['problems'][0])

    def test_script_static_contract_and_isolated_execution(self):
        sources = ['open("plan.json")', 'reader = open; reader("x")',
            'from pathlib import Path as P; P("x").read_text()',
            'import io as x; x.open("x")', 'import os as x; x.listdir()',
            'from numpy import load as reader; reader("x")',
            '__import__("pathlib")', 'getattr(object(), "open")',
            'from .local import result', 'from fractions import *', 'broken(']
        for source in sources:
            with self.subTest(source=source): self.assertTrue(v.script_dependency_errors(source))
        source = 'from fractions import Fraction as F\nassert F(1, 4)*F(1, 5)==F(1, 20)\nprint(F(1,20))\n'
        self.assertEqual(v.script_dependency_errors(source), [])
        with workspace() as temp:
            D = Path(temp)
            v.write_text(D / 'e1_check.py', source)
            v.write_text(D / 'plan.json', 'private')
            with patch.object(v, 'BUDGET', None): result = v.execute_script(D, 'e1', 'check')
            self.assertEqual(result['returncode'], 0)
            self.assertEqual(result['stdout'].strip(), '1/20')
            self.assertEqual({p.name for work in (D / 'calls').iterdir() for p in work.iterdir()}, {'e1_check.py'})

    def test_review_receives_readonly_error_records_and_judge_stays_independent(self):
        with workspace() as temp:
            D = Path(temp)
            inputs = ('original_problem.txt', 'e1_problem.txt', 'e1_solve.json', 'e1_judge.json',
                      'e1.json', 'real_errors.md', 'delivery_policy.json')
            for name in inputs: v.write_text(D / name, '{}')
            before = v.digest(D / 'real_errors.md')
            def fake(folder, text, tag, effort='high', ticket=None):
                folder = Path(folder)
                self.assertEqual((folder / 'real_errors.md').is_file(), tag.startswith('review'))
                v.write_json(folder / ('e1_review.json' if tag.startswith('review') else 'e1_judge.json'), {'ok': True})
                if tag.startswith('review'): v.write_text(folder / 'real_errors.md', 'changed')
                return {'returncode': 0, 'tokens': 1}
            with patch.object(v, 'codex', fake):
                v.judge(D, 'e1')
                with self.assertRaises(ValueError): v.review(D, 'e1')
            self.assertEqual(v.digest(D / 'real_errors.md'), before)
            self.assertFalse(v.load(D / 'e1_review_execution.json')['calls'][0]['inputs_unchanged'])

    def test_nonessential_evidence_advisory_does_not_mask_solution_or_disagreement(self):
        g, solve, judge, review, exe = fixtures()
        review['evidence_checks'] = [{'location': 'design_evidence.evidence_ref',
            'claim': '과거 사례 1건', 'check': '제공 기록에 없어 승인 근거에서 제외', 'status': '미확인'}]
        review['findings'] = [{'category': '근거표시', 'severity': '권고', 'location': 'design_evidence.evidence_ref',
            'evidence': '비필수 출처 미확인', 'required_action': '출처 확인 또는 미확인 표시'}]
        self.assertEqual(v.adoption_errors(g, solve, judge, review, '쉬움', '77', exe), [])
        review['solution_checks'][0]['status'] = '미확인'
        self.assertIn('해설에 미확인/오류 줄이 남음', v.adoption_errors(g, solve, judge, review, '쉬움', '77', exe))
        review['solution_checks'][0]['status'] = '오류'
        self.assertIn('해설에 미확인/오류 줄이 남음', v.adoption_errors(g, solve, judge, review, '쉬움', '77', exe))
        review['solution_checks'][0]['status'] = '확인'
        review['disagreements'] = ['실제 설계 판정 이견']
        self.assertTrue(v.adoption_errors(g, solve, judge, review, '쉬움', '77', exe))
        review['disagreements'] = []
        review['evidence_checks'][0]['status'] = '오류'
        self.assertIn('근거표시에 확인된 오류가 남음', v.adoption_errors(g, solve, judge, review, '쉬움', '77', exe))
        review['evidence_checks'] = None
        self.assertTrue(v.review_shape(judge, review))

    def test_original_choice_and_policy(self):
        original = '## 문제\n값? ① 1 ② 2 ③ 3 ④ 4 ⑤ 5\n\n## 정답\n④\n\n## 출처\n학교_2025_수학I 15번 · 지수함수 · 난이도 6'
        self.assertEqual(v.original_answer(original, v.section(original, '문제'))['answer_value'], '4')
        policy = v.make_policy(original, {'쉬움': 2, '유지': 2, '어려움': 2}, 2)
        self.assertEqual((policy['course'], policy['unit']), ('수학I', '지수함수'))
        self.assertFalse(policy['allow_alternative_delivery'])

    def test_subset_maximum_and_duplicate_answer_block(self):
        rows = {}
        for sid, lv in [('e1', '쉬움'), ('e2', '쉬움'), ('k1', '유지')]:
            rows[sid] = {'eligible': True, 'level': lv, 'judge': {'findings': []}, 'review': {'findings': []}}
        requested = {'쉬움': 2, '유지': 1, '어려움': 0}
        self.assertEqual(v.choose_subset(rows, requested, {('e1', 'k1')}), ['e1', 'e2'])
        self.assertFalse(v.valid_subset(['e1', 'k1'], rows, requested, {('e1', 'k1')}))
        self.assertFalse(v.valid_subset(['e1', 'e1'], rows, requested, set()))

    def test_budget_reserves_mandatory_work(self):
        budget = v.Budget(max_calls=10, token_budget=1000, estimate=100)
        bundle_ticket = budget.reserve(2)
        slot_ticket = budget.reserve(8)
        with self.assertRaises(v.BudgetError): budget.reserve(1)
        budget.start(slot_ticket)
        budget.release(slot_ticket)
        self.assertEqual((budget.calls, budget.pending), (1, 2))
        budget.release(bundle_ticket)

    def test_pipeline_serial_order_and_input_allowlists(self):
        g, s, j, r, _ = fixtures()
        order = []
        with workspace() as temp:
            D = Path(temp)
            for name, text in [('original.md', '원본'), ('plan.json', '{}'), ('real_errors.md', '없음'),
                               ('original_problem.txt', '원본'), ('delivery_policy.json', '{}')]:
                v.write_text(D / name, text)
            expected_inputs = {
                'generate': {'original.md', 'plan.json', 'real_errors.md'}, 'solve': {'e1_problem.txt'},
                'judge': {'original_problem.txt', 'e1_problem.txt', 'e1_solve.json', 'delivery_policy.json'},
                'review': {'original_problem.txt', 'e1_problem.txt', 'e1_solve.json', 'e1_judge.json', 'e1.json',
                           'e1_check.py', 'e1_solve.py', 'delivery_policy.json', 'real_errors.md'}}
            def fake_codex(folder, text, tag, effort='high', ticket=None):
                folder = Path(folder)
                order.append(tag)
                self.assertEqual({p.name for p in folder.iterdir()}, expected_inputs[tag])
                output, data = {'generate': ('e1.json', g), 'solve': ('e1_solve.json', s),
                                'judge': ('e1_judge.json', j), 'review': ('e1_review.json', r)}[tag]
                v.write_json(folder / output, data)
                if tag in ('generate', 'solve'):
                    v.write_text(folder / ('e1_check.py' if tag == 'generate' else 'e1_solve.py'), 'print(5)\n')
                return {'returncode': 0, 'tokens': 1}
            with patch.object(v, 'codex', fake_codex), patch.object(v, 'BUDGET', None):
                result = v.slot_pipeline(D, 'e1', '쉬움', maxtry=1, original_value='99')
            self.assertEqual(order, ['generate', 'solve', 'judge', 'review'])
            self.assertTrue(result['eligible'])
            self.assertNotIn('judge', v.load(D / 'e1.generated.json'))
            self.assertIn('review', v.load(D / 'e1.json'))
            self.assertTrue((D / 'e1_review.try1.json').is_file())
            self.assertEqual(v.load(D / 'e1_solve.json')['runner_execution']['returncode'], 0)

    def test_garbled_retry_gets_fresh_inputs_only(self):
        seen = []
        with workspace() as temp:
            D = Path(temp) / 'stage'
            v.write_text(D / 'problem.txt', '문제')
            def fake(folder, text, tag, effort='high', ticket=None):
                folder = Path(folder)
                seen.append(folder)
                self.assertEqual({p.name for p in folder.iterdir()}, {'problem.txt'})
                v.write_text(folder / 'leak.py', 'bad')
                v.write_text(folder / 'result.json', '?'*20 if len(seen) == 1 else '{"판정": "확인"}')
                return {'returncode': 0, 'tokens': 1}
            with patch.object(v, 'codex', fake):
                value = v.codex_out(D, 'prompt', 'judge', 'result.json', input_names=('problem.txt',))
            self.assertEqual(value, {'판정': '확인'})
            self.assertNotEqual(*seen)


    def test_bundle_hard_blocks_duplicate_without_model_conflict(self):
        rows = []
        for sid in ('e1', 'e2'):
            g, solve, j, r, _ = fixtures()
            row = v.held_result(sid, '쉬움', '')
            row.update(eligible=True, generated=g, solve=solve, judge=j, review=r, problems=[])
            rows.append(row)
        response = {'schema_version': 2, 'complete': True, 'status': '부분 충족',
            'comparisons': [{'slots': ['e1', 'e2'], 'same_decision': False, 'evidence': '판단 차이'}],
            'conflicts': [], 'recommended_slots': ['e1'], 'shortfalls': [{'level': '쉬움', 'count': 1, 'reason': '답 중복'}]}
        with workspace() as temp:
            with patch.object(v, 'isolated_call', return_value=response):
                selected = v.bundle(temp, rows, {'쉬움': 2, '유지': 0, '어려움': 0})
            self.assertTrue(selected['complete'])
            self.assertEqual(selected['selected_slots'], ['e1'])
            self.assertIn(['e1', 'e2'], selected['conflicts'])
            response['comparisons'] = []
            with patch.object(v, 'isolated_call', return_value=response):
                invalid = v.bundle(temp, rows, {'쉬움': 2, '유지': 0, '어려움': 0})
            self.assertFalse(invalid['complete'])
            self.assertEqual(invalid['selected_slots'], [])

    def test_bundle_null_is_valid_but_forces_pair_conflict(self):
        rows = []
        for sid, value in (('e1', '5'), ('e2', '6')):
            g, solve, judge, review, _ = fixtures()
            g['answer_value'] = value
            row = v.held_result(sid, '쉬움', '')
            row.update(eligible=True, generated=g, solve=solve, judge=judge, review=review, problems=[])
            rows.append(row)
        response = dict(schema_version=2, complete=True, status='부분 충족',
            comparisons=[{'slots': ['e1', 'e2'], 'same_decision': None, 'evidence': '독립 판단 근거 부족'}],
            conflicts=[], recommended_slots=['e1'], shortfalls=[{'level': '쉬움', 'count': 1, 'reason': '비교 미확인'}])
        requested = {'쉬움': 2, '유지': 0, '어려움': 0}
        with workspace() as temp:
            with patch.object(v, 'isolated_call', return_value=response): selected = v.bundle(temp, rows, requested)
            self.assertTrue(selected['complete'])
            self.assertEqual(selected['selected_slots'], ['e1'])
            self.assertIn(['e1', 'e2'], selected['conflicts'])
            for invalid in ('false', 0, [], {}):
                response['comparisons'][0]['same_decision'] = invalid
                with patch.object(v, 'isolated_call', return_value=response): result = v.bundle(temp, rows, requested)
                self.assertFalse(result['complete'])
            del response['comparisons'][0]['same_decision']
            with patch.object(v, 'isolated_call', return_value=response): result = v.bundle(temp, rows, requested)
            self.assertFalse(result['complete'])
            response['comparisons'][0]['same_decision'] = None
            response['comparisons'][0]['evidence'] = ''
            with patch.object(v, 'isolated_call', return_value=response): result = v.bundle(temp, rows, requested)
            self.assertFalse(result['complete'])
            response['comparisons'][0]['evidence'] = '미확인'
            response['recommended_slots'] = ['e1', 'e2']
            response['shortfalls'] = []
            with patch.object(v, 'isolated_call', return_value=response): result = v.bundle(temp, rows, requested)
            self.assertFalse(result['complete'])

    def test_plan_schema_ids_and_holds(self):
        requested = {'쉬움': 1, '유지': 0, '어려움': 0}
        strings = ('id', 'level', 'direction', 'design', 'design_status', 'usage_target', 'core_relation',
            'changed_condition', 'reconsideration', 'reuse_break', 'condition_effect', 'wrong_route',
            'evidence_ref', 'removable_work', 'alternative_route', 'hold_reason')
        slot = dict.fromkeys(strings, '근거')
        slot.update(id='e1', level='쉬움', design_status='보류', usage_target='미정', alternatives_considered=['대안 검토 후 보류'])
        plan = dict(schema_version=2, answer_check='확인', steps=['원본 풀이'], cruxes=['관계'],
            wrong_answers=[], requested_counts=requested, slots=[slot], shortfalls=[{'level': '쉬움', 'count': 1, 'reason': '보류'}])
        self.assertEqual(v.validate_plan(plan, requested), [slot])
        plan['shortfalls'] = []
        with self.assertRaises(ValueError): v.validate_plan(plan, requested)
        plan['shortfalls'] = [{'level': '쉬움', 'count': 1, 'reason': '보류'}]
        plan['slots'].append(slot)
        with self.assertRaises(ValueError): v.validate_plan(plan, requested)

    def test_zero_slots_does_not_create_executor(self):
        requested = {'쉬움': 0, '유지': 0, '어려움': 0}
        plan = dict(schema_version=2, answer_check='확인', steps=['풀이'], cruxes=['관계'], wrong_answers=[],
                    requested_counts=requested, slots=[], shortfalls=[])
        bundle = dict(schema_version=2, complete=True, status='요청 충족', comparisons=[], conflicts=[], recommended_slots=[], shortfalls=[])
        with workspace() as temp:
            original = Path(temp) / 'source.md'
            v.write_text(original, '## 문제\n2+7은?\n\n## 정답\n9')
            def fake(D, stage, *args, **kwargs): return plan if stage == 'analyze' else bundle
            with patch.object(v, 'isolated_call', side_effect=fake), patch.object(v, 'ThreadPoolExecutor') as executor, patch('builtins.print'):
                rc = v.main([str(Path(temp)/'work'), str(original), '--easy', '0', '--keep', '0', '--hard', '0'])
            self.assertEqual(rc, 0)
            executor.assert_not_called()
            self.assertFalse(v.load(Path(temp)/'work/delivery_report.json')['layout_verified'])
        v.BUDGET = None

    def test_only_never_adopts_previous_other_slot(self):
        requested = {'쉬움': 2, '유지': 0, '어려움': 0}
        keys = ('id', 'level', 'direction', 'design', 'design_status', 'usage_target', 'core_relation',
            'changed_condition', 'reconsideration', 'reuse_break', 'condition_effect', 'wrong_route',
            'evidence_ref', 'removable_work', 'alternative_route', 'hold_reason')
        slots = []
        for sid in ('e1', 'e2'):
            slot = dict.fromkeys(keys, '근거')
            slot.update(id=sid, level='쉬움', design_status='진행', usage_target='시험용', hold_reason='', alternatives_considered=['대안'])
            slots.append(slot)
        plan = dict(schema_version=2, answer_check='확인', steps=['풀이'], cruxes=['관계'], wrong_answers=[],
                    requested_counts=requested, slots=slots, shortfalls=[])
        g, solve, j, r, exe = fixtures()
        solve['runner_execution'] = exe['solve']
        completed = v.held_result('e1', '쉬움', '', 1)
        completed.update(eligible=True, generated=g, solve=solve, judge=j, review=r, runner_executions=exe, problems=[])
        def fake_bundle(D, rows, requested, ticket):
            other = next(row for row in rows if row['slot'] == 'e2')
            self.assertFalse(other['eligible'])
            self.assertEqual(other['generated'], {})
            self.assertFalse((Path(D)/'e2.json').exists())
            return {'complete': True, 'errors': [], 'selected_slots': ['e1'], 'excluded_slots': []}
        with workspace() as temp:
            D = Path(temp)/'work'
            v.write_json(D/'e2.json', {'internal_adopted': True, 'answer_value': '77'})
            original = Path(temp)/'source.md'
            v.write_text(original, '## 문제\n2+7은?\n\n## 정답\n9')
            with patch.object(v, 'isolated_call', return_value=plan), patch.object(v, 'slot_pipeline', return_value=completed), patch.object(v, 'bundle', fake_bundle), patch('builtins.print'):
                rc = v.main([str(D), str(original), '--easy', '2', '--keep', '0', '--hard', '0', '--only', 'e1', '--max-attempts', '1'])
            self.assertEqual(rc, 2)
            self.assertEqual(v.load(D/'delivery_report.json')['shortfalls']['쉬움'], 1)
        v.BUDGET = None


if __name__ == '__main__':
    unittest.main()
