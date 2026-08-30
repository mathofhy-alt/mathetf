-- ════════════════════════════════════════════════════════════════
--  2026-08-31 마이그레이션 2건. Supabase SQL 에디터에 통째로 붙여넣으면 된다.
-- ════════════════════════════════════════════════════════════════

-- ① 문항별 '실제 조판 줄 수' ─────────────────────────────────────
-- 왜: 시험지 생성기가 캡쳐 이미지 높이 ÷ 30 으로 줄 수를 '추정' 했는데,
--     실측해 보니 진짜 픽셀당 줄 수가 19~73px/줄로 3.8배까지 벌어진다(중앙 52).
--     상수 하나로는 원리적으로 못 맞춘다 → 문항이 두 쪽에 걸쳐 잘리고, 지면도 40% 낭비했다.
--     (2026-08-31 한글 COM 실측. scratch_measure_heights.py 로 재현 가능)
-- NULL 이면 생성기가 예전 방식(캡쳐 ÷ 30)으로 되돌아간다. 새 문항이 들어와도 안전하다.
ALTER TABLE questions ADD COLUMN IF NOT EXISTS layout_lines smallint;

COMMENT ON COLUMN questions.layout_lines IS
  '한글로 실제 조판해 잰 문항 높이(줄). 한 쪽=46줄 기준. NULL 이면 캡쳐높이 추정으로 폴백.';


-- ② 건의사항 관리자 답변 ────────────────────────────────────────
-- 왜: 건의사항 글에 답을 달 곳이 아예 없었다(컬럼 자체가 없음).
--     "시험지는 만들었는데 답안지는 어디서 구하나요" 같은 질문에 응답할 수 없었다.
-- 답변은 본문과 같은 취급 — 비밀글이므로 작성자·관리자에게만 내려간다(API 에서 통제).
ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS admin_reply text;
ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS admin_replied_at timestamptz;

COMMENT ON COLUMN suggestions.admin_reply IS '관리자 답변. 작성자·관리자에게만 노출.';
