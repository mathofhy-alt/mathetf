-- [2026-10-14] 유사문항 'LLM 재정렬' 결과 저장 + 유사 버튼 클릭 기록
-- 실험(개발 40사례, 독립 채점): Haiku 가 후보 20개의 발문·해설 글을 읽고 다시 줄 세우면 상위5 적합 108→130/200 (사례당 +0.55, 95% +0.25~+0.90).
-- 재정렬은 Claude Code 세션 안에서(플랜) 조금씩 돌려 여기 저장한다 → 화면은 있으면 이 순서, 없으면 기존 합산 점수.

-- 1) question_similar 에 basis='rerank' 허용  neighbors = [[문항id, 점수0~100], ...] 점수 내림차순
ALTER TABLE public.question_similar DROP CONSTRAINT IF EXISTS question_similar_basis_check;
ALTER TABLE public.question_similar ADD CONSTRAINT question_similar_basis_check CHECK (basis IN ('solution','statement','rerank'));

-- 2) 유사 버튼 클릭 기록 — 재정렬 우선순위(많이 누른 문항부터)
CREATE TABLE IF NOT EXISTS public.similar_click_log (
    id          bigserial PRIMARY KEY,
    question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    clicked_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS similar_click_log_q ON public.similar_click_log (question_id);
ALTER TABLE public.similar_click_log ENABLE ROW LEVEL SECURITY;   -- 정책 없음 = 서비스 롤만
