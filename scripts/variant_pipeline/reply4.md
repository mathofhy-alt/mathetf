# 4라운드 구현 보고 (2026-10-20)

> 저장 위치: 요청한 C:/selfmade/변형상의/reply4.md는 이 세션의 작업공간 밖이라 Python 쓰기가 PermissionError로 거부됐다. 같은 보고서를 C:/dev/mathetf/scripts/variant_pipeline/reply4.md에 저장했다. 권한을 우회하지 않았다.

C:/dev/mathetf의 현재 브랜치 redesign-2026에서 구현했다. 커밋하지 않았다. C:/trans_gpt는 수정하지 않았다. 결과와 코드·프롬프트·검증 기록은 Python으로 UTF-8 저장했다. 유료 모델 호출, 새 원본 실전 생성, 골든 judge/review 재생은 실행하지 않았다.

## 바꾼 것

- scripts/variant_pipeline/prompts/의 analyze·generate·judge를 new_prompts 최신 전문과 동일하게 교체하고 review.md·bundle.md를 추가했다. solve.md는 변경하지 않았다.
- run.py는 칸 내부 generate → JSON/발문 검사 → runner 생성 검산 → solve → runner 독립 검산 및 solve 고정 → judge → review 순으로 실행한다. 칸 사이 병렬도는 --workers(기본 3)로 제한한다.
- 모델 호출은 전부 codex_out()으로 실행한다. 출력 누락·JSON 오류·깨짐은 최대 2회까지 호출하며 매 호출과 깨짐 재호출도 새 폴더·새 exec 세션을 사용한다. 직전 실패 원고·스크립트·로그를 다음 호출 입력에 넣지 않는다. 종료 코드 0, 확인 가능한 양의 로그 토큰, 정상 JSON, 입력 파일 불변을 모두 확인한다.
- solve에는 문제 txt만, judge에는 원본 문제·변형 문제·고정 solve 및 정책만, review에는 명시된 원고·검토·스크립트·정책만 복사한다. real_errors.md는 analyze·generate에만 전달한다.
- 생성 JSON 원본은 .generated.json으로 보존한다. 검토 후 결합 JSON, review.json, 문제 txt, 검산 스크립트, 실제 stdout/stderr/종료 코드/소요 시간, 호출 명세를 별도로 저장하고 .tryN으로 보존한다. 이전 실행 파일은 previous 시각 이름으로 보관한다.
- same_value()는 허용 AST를 직접 검사하여 정수·유리수·유한소수·sqrt·pi·사칙연산·제한된 정수 거듭제곱만 정확한 SymPy 식으로 바꾼다. 외부 텍스트 eval/sympify, float 허용 오차, 마지막 숫자 추출 비교는 사용하지 않는다. 미확인은 None이며 생성/독립 답은 is True, 원본과 다른 답은 is False일 때만 통과한다. 빈 값·번호 혼입·문자·목록·비유한수·복소수는 차단한다.
- 객관식은 ①~⑤ 5개, 정답 번호·표시 값·answer_value, 유일 정답 선지를 검사한다. 단답형에만 0~999 정수를 적용한다. 원본 답이 번호뿐이면 원본 선지의 수 값을 추출해 original_answer.json에 저장하고, 정확한 수로 확인하지 못하면 보류한다.
- plan schema=2, 요청 수량, 보류 포함 id/level/중복, 필수 키·유형, 대안 1~3개 기록, 부족 수량·이유를 검증한다. 진행+시험용 설계만 생성하며 0칸에는 Executor를 만들지 않는다. 분석/JSON 실패를 이전 plan으로 덮지 않는다.
- run_changes 4절의 개별 승인 조건을 모두 검사한다. 누락된 검사·빈 필수 근거, 미해결 차단/보류, 해설 미확인, 판정 불일치, 요청 난도 불일치는 승인하지 않는다. 판정불가/보류를 단순 난도 불일치로 무한 재생성하지 않는다. 총 생성 시도는 기본 2회(최초+재생성 1회), --max-attempts 1이면 재생성 0회다.
- --only의 나머지 칸을 PASS(이전)으로 넣는 동작을 제거했다. 해시 일치 재사용을 완성하기 전까지 이전 결과를 전혀 재사용하지 않으며 나머지는 보류·부족으로 보고한다. 미선택 칸의 예전 canonical JSON도 보관 이름으로 옮겨 이번 승인처럼 남기지 않는다.
- 원본별 모든 답 쌍을 정확 비교하고 bundle_input.json을 만든 뒤 bundle.md를 한 번 호출한다(출력 오류의 codex_out 재호출은 별도). 모든 n(n-1)/2 비교 쌍, conflicts, 권고 조합, 부족 수량을 runner가 다시 검사한다. 답 중복/답 비교 미확인은 모델 의견과 무관하게 동시 채택을 차단한다. 판단 중복·모델 비교 미확인 충돌도 적용한다. 최대 6칸의 부분집합을 전수 확인해 수량 최대 → 미해결 권고 적음 → 시험표현 권고 적음 → slot id 순으로 결정한다.
- delivery_policy.json에 실제 요청 수량·답 중복 금지·총 시도·편집 요구·보조 납품 금지와 original.md의 출처 원문, 과목·단원을 기록한다. source 단원을 --unit보다 우선하고 judge/review 양쪽에 전달한다. 명시되지 않은 선수 내용·방법을 허용한 것으로 만들지 않는다.
- report.md와 delivery_report.json에 요청/개별 내부 채택/묶음 통과 텍스트/부족·이유, 설계 대안, 중복 제외, 용도별 보조 후보(자동 납품 0), 실제 시도, 단계별 호출·측정 토큰·미확인 토큰 호출·시간을 기록한다. 수학 검산/변형·해설 내부 검토/묶음/인쇄 확인을 분리하며 인쇄 확인은 항상 false, 완성 시험지 납품은 0/보류다.
- --max-calls, --call-timeout, --total-seconds와 예상 토큰 예약을 추가했다. 새 생성 전에 이미 시작한 원고의 필수 검토와 묶음 예약을 보호한다. 실제 토큰은 종료 후 측정하므로 --token-budget은 엄격한 호출 중 토큰 상한이 아니라고 명시했다.
- golden/replay.py는 운영 run.py의 judge()/review()를 그대로 쓴다. 과거 solve를 고정하고 기대값·과거 평가를 가린 채 출처 정책도 함께 넣는다. 새 빈 출력 폴더만 허용한다. 기본 동작은 입력 점검이고 --execute가 있어야 유료 호출한다. golden_test.md에 새 사용법과 현재 기대 구성(채택 5·보류 2·시험용 미채택 4·제공 불가 2)을 덧붙였다.

## 남긴 TODO와 제한

1. 동일 입력/프롬프트/정책의 plan·slot 해시 재사용, 해설만 수정했을 때 solve/judge 선택 재사용은 미구현이다. 현재는 전부 다시 검사하고 --only 미선택은 보류한다. 불완전한 캐시를 승인하는 우회는 없다.
2. 허용 파일을 새 폴더로 복사하고 입력 변경을 검사하지만 OS 계정·컨테이너 수준의 읽기 보안 경계는 아니다. 별도 접근 차단은 TODO다.
3. 원본 그림에서 검증한 조건을 입력으로 연결하는 기능, 그림 작성·렌더링·인쇄 편집 검사는 TODO다. 원본 문제 절만으로 필요한 배치가 불명확하면 보류한다.
4. 판정 불일치의 별도 재검토·해제와 수정본 재검토 자동화는 TODO다. 현재는 불일치가 남으면 납품하지 않는다.
5. 토큰의 호출 중 강제 상한은 제공하지 않는다. 예약과 사후 측정이다. 호출 수와 subprocess 시간 제한은 적용한다.
6. 별도 typeset.py는 여전히 고정 6칸을 읽는 기존 도구다. selected_slots와 연계하기 전 새 납품 결과를 자동 투입하지 않는다. 이번 수정에서는 이 도구와 외부 제작 경로를 건드리지 않았다.
7. 원본 정답/선지가 ㄱ·ㄴ 조합 또는 파서가 지원하지 않는 표기여서 수 값을 확인할 수 없으면 보류한다. 정답 번호를 정답 수 값으로 바꾸어 승인하지 않는다.

기본적인 실행/입출력·프롬프트 SHA-256, 명령·종료 코드·실제 검산 출력은 저장한다. 수정 전후 재사용을 위한 세밀한 의존성 해시와 자동 재검토 그래프는 TODO다.

## 비용 없는 점검 결과

- python -c의 ast.parse로 run.py, golden/replay.py, 기존 golden_runner.py, tests/test_run.py 구문 확인.
- 최신 프롬프트 5개가 공급본 전문과 일치함을 확인. analyze의 EASY/KEEP/HARD, generate의 SLOT/LEVEL/FEEDBACK, solve/judge/review의 SLOT, bundle의 치환 키 없음이 호출과 일치.
- 확인한 Python 파일과 관련 프롬프트의 0x08 백스페이스 바이트 0개. Python 코드의 금지된 백슬래시+b 시퀀스 0개.
- golden_set 13건의 원고·원본·과거 solve 경로와 UTF-8 읽기 가능 여부를 정적으로 확인. 골든 모델 호출은 0회이며 새 13/13 판정 성능을 측정했다고 주장하지 않는다.
- `python -m unittest discover -s scripts/variant_pipeline/tests -v`: 모델을 mock한 비용 없는 회귀 13개 통과. 정확 비교·누락 키 전부 차단·원본 답·객관식/단답형·순차 호출과 입력 목록·깨짐 재호출의 새 폴더·예산 예약·실제 검산 실행·묶음 중복 강제 차단·계획 보류·0칸·--only의 이전 결과 미채택을 확인했다.
- 정적 점검 기록: scripts/variant_pipeline/tests/static_checks.json. git diff --check 통과. solve.md 변경 없음.
- Windows Python 3.14의 임시 폴더 mode=0700이 sandbox에서 접근 불가 ACL을 만드는 현상을 테스트에서 발견했다. 실제 runner와 테스트는 상속 권한의 UUID 폴더를 쓰도록 수정했다. 첫 실패 때 생긴 빈 폴더 tmp66pu91z6, tmp9i0ucytj는 이 sandbox에서 삭제 권한도 거부되어 남았다. 정상 회귀 테스트가 만드는 임시 폴더는 정리됐다.

## 첫 실전 비용 측정 명령

아직 판정에 쓰지 않은 새 원본 1개를 `C:/dev/mathetf/scratch/variant_input/new_original.md`에 준비한다. 원본에는 문제·정답·출처 절을 넣고, 출처에 실제 과목·단원을 기재한다. 아래 원본 경로는 준비할 파일명이며 이번 작업에서 새 원본을 만들거나 모델로 생성하지 않았다. 작업 출력 폴더도 새 경로를 쓴다.

```powershell
python scripts/variant_pipeline/run.py C:/dev/mathetf/scratch/variant_live_01 C:/dev/mathetf/scratch/variant_input/new_original.md --easy 2 --keep 2 --hard 2 --max-attempts 1 --workers 3 --max-calls 52 --call-timeout 1200 --total-seconds 3600
```

--max-attempts 1은 재생성 0회다. 출력 깨짐 재호출은 남겨 두며 별도 호출·비용으로 집계한다. 최초 정상 흐름은 분석 1+6칸×4단계+묶음 1=26호출이고, 52는 각 출력의 1회 재호출까지 고려한 호출 상한이다. 검토 추가 비용을 재생성 절감과 섞지 않고 report.md·delivery_report.json의 단계별 측정값을 비교한다. 부족이 있으면 exit code 2, 입력/분석 등 중단이면 1, 요청 텍스트 수량을 충족하면 0이다. 0도 인쇄 확인/완성 시험지 납품을 뜻하지 않는다.

이번 구현 작업에서는 위 실전 명령과 골든 --execute 명령을 실행하지 않았다.
