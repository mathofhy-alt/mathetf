# 운영 DB 배포 전 실행안 — 2026-09-23

대상은 기존 운영 Supabase 프로젝트 `eupclfzfouxzzmipjchz`입니다. 별도 테스트 프로젝트 `fnamfsijayavwakvgzaf`와 구분해야 합니다. 아직 운영 DB에 실행하지 않았습니다.

운영 중 방문자가 많은 시간에는 실행하지 않기로 했습니다. 사용자가 정한 새벽 시간에만 이 작업을 다시 진행하며, 그 전에는 운영 DB 변경과 앱 배포를 하지 않습니다.

읽기 전용 사전 검사에서 기존 `profiles`, `exam_materials`, `payment_history`, `purchased_items`, `point_transactions`, `folders`, `user_items`, `questions`의 신규 코드 필요 컬럼이 모두 확인됐습니다. `payment_orders`, `submission_earnings`, `question_bank_events`는 없고, 기존 결제·구매 기록의 새 `order-` 번호는 각각 0건입니다.

실행할 SQL은 [production-predeploy-20260923.sql](../tests/production-predeploy-20260923.sql)입니다. 신규 주문은 자료 구매(`cart`)만 허용하며 포인트 충전 주문은 DB 제약으로 거부합니다. 네 파일의 변경을 하나의 트랜잭션으로 묶었고 잠금 대기 5초·문장 실행 120초 제한을 뒀습니다. 어느 문장에서든 실패하면 전체 트랜잭션이 취소됩니다. 적용 후 마지막 조회에서 `payment_orders`, `submission_earnings`, `question_bank_events`, `complete_payment_order` 네 항목이 모두 생성돼야 합니다.

순서는 다음과 같습니다.

1. 운영 프로젝트 SQL 편집기에서 대상 프로젝트 ID를 확인하고 위 SQL을 한 번 실행합니다. 기존 홈페이지가 서버 권한으로 결제 기록을 쓰므로, 새 표를 먼저 추가해도 현재 구매 흐름은 유지됩니다.
2. SQL 결과 네 항목을 확인하고, 그다음 별도 작업공간의 앱을 배포합니다. 배포 전에는 새 구매 코드를 운영에 연결하지 않습니다.
3. 배포 후 로그인·장바구니·기존 구매 자료 열람을 확인합니다. 실제 카드 승인은 사용자와 금액을 정한 뒤 별도 수행합니다.

SQL 실패 시 트랜잭션이 되돌아가므로 오류를 확인한 뒤 재검토합니다. 앱 배포 후 문제가 있으면 이전 앱 배포로 되돌리고, 새 결제 기록이 생길 수 있는 표는 즉시 삭제하지 않습니다. 새 SQL 적용은 앱 배포와 구분되는 운영 DB 변경이므로 실행 시점을 확인받습니다.

배포 전 별도 작업본 점검: 변경 파일 TypeScript 검사, 개선 항목 검사 18개, Next 배포용 컴파일을 통과했습니다. 결제 완료 시 PC 직접 결제와 결제사 화면 복귀 모두 서버가 해당 주문에서 구매한 자료만 장바구니에서 제거하도록 수정했습니다. 실제 PG 승인과 모바일 복귀 실험은 아직 수행하지 않았습니다.

운영 자료를 읽기만 하여 유료 자료 3,885건의 파일 종류를 대조했습니다. `DB` 1,381건, `HWP` 1,252건, `PDF` 1,252건이며 새 주문 코드가 지원하지 않는 종류는 0건입니다. 검사 실행기는 `tests/readonly-catalog-types.cjs`입니다.

별도 테스트 프로젝트에 연결한 새 작업본(`localhost:3201`)에서 판매 자료 1,100원 주문 준비는 결제창을 열지 않고 확인했습니다. 이어 테스트 전용 0원 주문으로 결제 완료 API를 두 번 호출해 첫 완료와 중복 재확인을 확인했고, 구매 자료가 장바구니에서 제거됐습니다. 테스트 주문·결제·구매 기록은 SQL 편집기에서 모두 0건으로 정리했고 테스트 장바구니 자료는 복원했습니다. 이는 실제 PG 카드 승인이나 휴대전화 복귀 검사를 대체하지 않습니다.

Vercel의 실제 `mathetf` 프로젝트를 읽기 전용으로 확인했습니다. 운영 배포는 GitHub `mathofhy-alt/mathetf`의 `master`에서 만들어집니다. `NEXT_PUBLIC_PORTONE_CHANNEL_KEY`, `NEXT_PUBLIC_PORTONE_STORE_ID`, `PORTONE_API_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`가 모두 All Environments에 등록되어 있습니다. 비밀 값은 열어 보거나 변경하지 않았습니다. Vercel에 이전 배포로 되돌리는 기능이 표시됩니다. 현재 배포 후보는 별도 로컬 브랜치에만 있으며 GitHub에 푸시하지 않았습니다. 따라서 `master` 푸시는 운영 배포 시점까지 하지 않습니다.
