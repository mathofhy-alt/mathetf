# 5라운드 구현 보고 (2026-10-20)

.cache/variant_brief5.md와 scripts/variant_pipeline/reply4.md를 끝까지 읽고 작업했다. 모델 호출·실전 재실행·골든 모델 재생은 0회다. 커밋하지 않았고 C:/trans_gpt에는 쓰지 않았다. 코드·프롬프트·테스트·결과 파일은 Python으로 UTF-8을 지정해 저장했다. 기존 scratch/variant_live_02의 최상위 파일 해시가 모두 유지되는지도 확인했다.

## 1. 검산 실행 연결

(a) 자기완결형을 선택했다. 생성 단계의 입력을 검산 폴더에 더 복사하면 수학 검산에 불필요한 plan·실측 자료까지 끌어오며, 실제 스크립트가 원고 JSON을 다시 쓰는 동작도 그대로 남는다. 검산 폴더에는 검산 스크립트 한 개만 둔다.

- 실제 실패 위치: e1_check.py 111행은 plan.json, e2_check.py 147행과 h1_check.py 135행은 original.md를 읽었다. 기존 *_check_run.json의 FileNotFoundError와 일치한다.
- 더 확인한 의존: k1_check.py도 plan.json·original.md, k2_check.py도 original.md·plan.json, h2_check.py도 h2.json을 읽는다. 따라서 선지 오인만 고치면 이 세 칸도 다음 단계에서 같은 종류의 실행 결함에 걸렸을 것이다.
- generate.md에 필요한 식·범위·문자열을 상수로 넣고 다른 파일의 읽기·존재 조회·생성·수정을 하지 않는 계약을 명시했다. JSON 작성은 검산 스크립트 밖에서 수행하고 검산 결과만 stdout으로 출력한다.
- run.py의 script_dependency_errors()가 AST로 파일 접근, 파일·외부 실행 관련 import, 정적으로 확인할 수 없는 동적 실행을 보수적으로 감지한다. 허용 계산 모듈 목록 밖의 import도 결함으로 기록한다. *_check_run.json에 dependency_errors와 실제 실행하지 않았다는 returncode=null을 남긴다.
- 정적 결함·실행 실패·빈 stdout은 생성 단계 검산 결함으로 즉시 중단한다. solve/judge/review 호출을 이어서 소비하지 않는다. 기존 max-attempts 범위의 재생성 정책은 유지한다.
- 기존 e1/e2/h1_solve.py도 solve.json을 쓰는 코드를 포함했다. 같은 재현성 문제를 막도록 solve.md에도 자기완결형·stdout 전용 계약을 적용하고 독립 검산 실패 시 judge/review 전에 중단한다.

이 정적 검사는 실수로 생기는 의존을 탐지하는 보수적 계약 검사다. 별도 OS 계정·컨테이너의 보안 경계를 구현한 것은 아니며 기존 TODO는 유지했다.

## 2. 단답형/객관식 판정

choices()는 끝의 ①~⑤ 순서와 각 항목의 정확한 수 값이 확인될 때만 선지 묶음을 반환한다. 발문의 ①② 절차 번호만으로 오류를 내지 않는다. generation_errors()는 정답 번호 표기와 끝 선지 묶음을 함께 확인한다. 번호가 있는데 선지가 없거나, 선지가 있는데 정답 번호가 빠진 원고는 계속 차단한다. 단답형에는 정확한 0~999 정수 및 answer/answer_value 일치를 적용한다.

실제 *.generated.json을 그대로 읽어 재검사한 결과:

| 칸 | 정답 표기 | 끝 선지 묶음 | 생성 형식 검사 |
|---|---|---|---|
| e1 | ② 1/20 | 있음 | 통과 |
| e2 | ③ 43/2000 | 있음 | 통과 |
| k1 | 377 | 없음 | 단답형 통과 |
| k2 | 76 | 없음 | 단답형 통과 |
| h1 | 1 | 없음 | 단답형 통과 |
| h2 | 254 | 없음 | 단답형 통과 |

원본도 절차 번호와 정답 77을 가진 단답형으로 처리된다. 서로 다른 6개 답의 15쌍도 정확 비교 결과 전부 다르다. 이 확인은 독립 수학·설계 승인과 구별한다.

## 3. 묶음 비교 형식

실제 bundle_review.json은 15쌍 중 3쌍의 same_decision이 false이고 나머지 12쌍은 null이다. 모든 쌍에 문자열 evidence가 있다. 개별 judge/review가 없는 k1/k2/h2와의 비교를 확정하지 않은 것은 타당하다. 기존 prompt는 정보 부족 때 판단하지 말라고 하면서 예시에는 bool만 보여 주고, runner는 bool만 허용해 null을 '묶음 비교 근거/형식 오류'로 오해했다.

bundle.md와 runner를 true/false/null의 세 상태로 맞췄다. null도 근거와 모든 쌍 검사가 필요하다. complete=true는 검사 범위를 완료했다는 뜻이며 판단 전부를 확정했다는 뜻은 아니다. null 쌍은 conflicts에 모델이 빠뜨려도 runner가 동시 채택을 차단한다. 키 누락·빈 evidence·문자열 false·숫자 0·잘못된 타입은 계속 차단한다.

실제 bundle 응답을 isolated_call의 mock 반환값으로 넣어 검사했더니 complete=true, errors=[], 미확인 충돌 12쌍으로 처리됐다. 기존 rows는 개별 eligible이 모두 false라 selected_slots=[]가 맞다. 형식 오류를 고쳤다고 기존 미검토 칸을 승인하지 않았다.

## 4. 실측 근거와 해설 줄 검사

review()에는 존재하는 real_errors.md를 허용 입력으로 복사하고 호출 전후 해시를 검사한다. judge 입력에는 계속 전달하지 않는다. plan.json도 review에 전달하지 않는다. 실측 기록을 변경한 mock review는 입력 불변 검사에서 거부되는 회귀를 추가했다.

실제 기록 대조 결과:

- e1_review.json의 유일한 미확인 항목 location은 `e1.json.design_evidence.evidence_ref 및 check_output의 오답 관찰 근거 문장`이다. solution 1~4행의 수학적 검사와 solution_status는 전부 확인이다. real_errors.md에는 동일 원본의 두 관찰 기록, 1/4×3/4 반복, 2/3 및 답 5가 있어 주장 내용을 대조할 수 있다. 두 기록을 서로 다른 학생 수나 발생률로 단정하지 않는다.
- h1_review.json의 유일한 미확인 항목 location은 `h1.json.design_evidence.evidence_ref: “실측 근거는 … 사례 1건이다”`이다. solution 1~27행 관련 검사와 solution_status는 확인이다. real_errors.md에는 중앙고 2023년 1기말 확률과통계 20번의 160/2187 및 답 2347 관찰 기록이 있다. 이 일반화 변형에서 0을 얻는 오풀이 자체는 추정·검산으로 구분한다.
- 두 review 모두 findings는 근거표시/권고이고, disagreements도 수학·설계·난도 등에는 이견이 없으며 출처 권고를 추가한다는 내용뿐이다. 실제 해설 오류가 확인된 경우가 아니다. 비필수 내부 출처 검사를 solution_checks에 넣고 그 모든 미확인을 '해설 줄'로 취급한 출력 계약의 범위 오류다.

review.md에 내부 출처의 evidence_checks를 별도로 추가했다. 제공 관찰 기록과 스캔 원본 확인을 구별하며, 승인 근거에 쓰이지 않고 학생용 문제·해설에도 실측 주장이 없는 내부 출처의 확인 불가는 권고로 남긴다. 이 권고만으로 disagreements를 만들지 않는다. evidence_checks는 기존 review 호환을 위해 runner에서 선택 필드로 받되, 존재하면 형식과 근거를 검사한다.

실제 해설의 미확인·오류, 필수 근거 부족, 학생용 원고의 미확인 실측 주장, 실제 판정 불일치, 확인된 허위 근거는 계속 차단한다. evidence_checks에 확인된 오류가 있어도 차단한다. 과거 review의 자연어 문장을 runner가 추측해 지우거나 미확인을 확인으로 바꾸지는 않는다. 기존 e1/h1 review를 그대로 재사용하면 기존 solution_checks/disagreements 때문에 계속 보류되며, 새 입력·계약에 따른 새 review가 필요하다.

## 5. 수정 후 각 칸의 예상 진행 위치

아래는 기존 파일에 근거한 추정이며 이번 작업의 실제 채택 결과가 아니다.

| 칸 | 기존 파일이 보여 주는 상태 | 수정 뒤 예상 |
|---|---|---|
| e1 | 생성 답 1/20, 독립 답 일치·runner solve 성공, judge 쉬움, review 채택. 남은 사유는 check 실패와 비필수 출처 두 검사 | 자기완결형 check/solve를 다시 만들고 새 review에서 관찰 기록을 대조하면 개별 내부 채택·묶음 후보까지 갈 근거가 있다. |
| e2 | 생성 답 43/2000, 독립 답 일치·runner solve 성공, judge 쉬움, review 채택·findings/disagreements 없음 | 자기완결형 check/solve를 다시 만들어 runner 검산에 성공하면 개별 내부 채택·묶음 후보까지 갈 근거가 가장 직접적이다. |
| k1 | 실제 generated.json의 단답 377은 이제 형식 통과. 독립 solve/judge/review 없음. check는 plan/original 의존 | 선지 오류는 해소됐다. 기존 check 그대로면 생성 단계의 의존 검사에서 중단한다. 자기완결형으로 다시 생성하면 solve로 진행할 수 있으나 이후 판정은 미확인이다. |
| k2 | 실제 generated.json의 단답 76은 이제 형식 통과. 독립 solve/judge/review 없음. check는 original/plan 의존 | 선지 오류는 해소됐다. 기존 check 그대로면 생성 단계의 의존 검사에서 중단한다. 재작성·실행 성공 뒤 독립 풀이와 유지 난도 검사가 필요하다. |
| h1 | 생성 답 1, 독립 답 일치·runner solve 성공, judge 어려움, review 채택. 수학·해설·설계는 확인 | 자기완결형 check/solve와 실측 기록을 받는 새 review가 통과하면 개별 내부 채택·묶음 후보까지 갈 근거가 있다. |
| h2 | 실제 generated.json의 단답 254는 이제 형식 통과. 독립 solve/judge/review 없음. check는 h2.json 의존 | 선지 오류는 해소됐다. 기존 check 그대로면 생성 단계의 의존 검사에서 중단한다. 자기완결형 검산 성공 후 연속 확인 종료의 독립 풀이·어려움 판정이 필요하다. |

기존 6개 check를 그대로 새 runner에 적용하면 모두 정적 의존 검사에서 보류된다. 이것을 이미 수정된 수학 검산이라고 보고하지 않는다. (a)는 다음 생성부터 올바른 산출물을 요구하고 잘못된 연결을 조기에 드러내는 수정이다. 기존 문제·해설·실전 기록은 고치지 않았다.

e1/e2/h1이 새 필수 검사를 모두 통과한다는 조건에서, 기존 bundle의 이 세 쌍은 모두 same_decision=false이고 답도 달라 묶음 후보가 될 근거가 있다. 나머지 세 칸은 독립 검토 자체가 없어 6칸 채택이나 특정 부족 수량을 예측하지 않는다. 인쇄 편집 확인과 완성 시험지 납품은 여전히 별도다.

## 6. 비용 없는 검증

- `python -m unittest discover -s scripts/variant_pipeline/tests -v`: 기존 13개 + 추가 7개, 총 20개 통과.
- 회귀 내용: 절차 번호·단답 경계·객관식 불완전 표기, 자기완결형 실행, 파일 의존·별칭·동적 import 차단, 생성/독립 검산 실패 때 후속 호출 중단, review 실측 입력 전달·변경 감지 및 judge 배제, 비필수 출처 권고와 실제 해설 미확인/오류·실제 이견의 구분, bundle null 충돌 강제 및 잘못된 타입/근거/조합 차단.
- 실제 live_02 생성 JSON 6개 형식 검사 통과, 실제 검산 스크립트들의 의존 탐지, 실제 15쌍 bundle 응답 mock 재검증 완료. 원본 파일 해시 보존 확인. 기록: `tests/live02_regression.json`.
- pipeline의 Python 6개 전부 ast.parse 통과, 0x08 바이트 0, Python 코드의 금지된 역슬래시+b 시퀀스 0. 운영 프롬프트 6개의 치환 키와 0x08 바이트 0 확인. 기록: `tests/static_checks.json`.
- `git diff --check` 통과. 모델 호출은 0회다.

## 7. 다음 실전 명령 — 이번에는 실행하지 않음

현재 존재하지 않는 새 출력 경로 scratch/variant_live_03을 사용한다. 기존 실전과 같은 원본·실측 조회 인자를 유지했다.

```powershell
python scripts/variant_pipeline/run.py C:/dev/mathetf/scratch/variant_live_03 C:/dev/mathetf/scratch/variant_input/new_original.md --easy 2 --keep 2 --hard 2 --max-attempts 1 --workers 3 --unit 조건부확률 --src 휘문고등학교_2025_2학기중간_확률과통계 --no 20 --max-calls 52 --call-timeout 1200 --total-seconds 5400
```

max-attempts=1은 재생성 0회다. 최초 정상 흐름은 분석 1 + 6칸×4단계 + 묶음 1 = 26호출이며, 52는 출력 오류에 대한 새 세션 재호출까지 고려한 상한이다. 자기완결형 검산 계약을 어기면 그 칸은 즉시 보류되고 후속 단계 호출은 하지 않는다. 다음 실전의 실제 생성물과 판정은 사용자가 위 명령을 실행한 뒤 확인해야 한다.
