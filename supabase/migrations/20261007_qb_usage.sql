-- 시험지 만들기 무료 횟수 기록 (2026-10-07, 코드: src/lib/qbPass.ts)
-- 시험지를 저장할 때마다 한 줄. 시험지를 지워도 남는다(보관함 20개 한도 때문에 회원들이 지우며 쓴다).
-- 이용권 자체는 표가 따로 없다 — purchased_items 의 item_type='QB_PASS' 줄로 기간을 계산한다.
CREATE TABLE IF NOT EXISTS public.qb_usage (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    exam_id uuid,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS qb_usage_user_time ON public.qb_usage (user_id, created_at);
ALTER TABLE public.qb_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.qb_usage FROM anon, authenticated;   -- 서버(service role)만
