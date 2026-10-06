-- 개인DB 요청 운영자 안내 (2026-10-06)
-- 요청한 회원에게 처리 결과를 알릴 길이 없었다(첫 요청이 이미 사이트에 있는 모의고사 문항이라 안내가 필요했음).
-- 관리자가 적은 안내문은 회원 마이페이지 '내 요청' 탭에 보인다. 표는 여전히 서버(service role)만 읽고 쓴다.
ALTER TABLE public.db_requests ADD COLUMN IF NOT EXISTS admin_reply text;
ALTER TABLE public.db_requests ADD COLUMN IF NOT EXISTS replied_at timestamptz;
CREATE INDEX IF NOT EXISTS db_requests_user_idx ON public.db_requests (user_id, created_at DESC);
