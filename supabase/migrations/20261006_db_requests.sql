-- 개인DB 요청 (2026-10-06)
-- 회원이 가진 자료(시중 교재 PDF 등)를 올리며 '이걸로 내 개인DB를 만들어 달라'고 요청한다.
-- 시중 교재는 공개 판매할 수 없어, 운영자가 이미 만든 DB 를 요청한 회원의 시험지 만들기 목록에만 넣어 준다(유료).
-- exam_materials 에 넣지 않는 이유: 홈·학교 페이지·사이트맵이 그 표를 읽어 목록에 섞일 수 있다.
CREATE TABLE IF NOT EXISTS public.db_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id),
    user_email text,
    user_name text,
    files jsonb NOT NULL,           -- [{ path, name, size }]
    note text,
    status text NOT NULL DEFAULT '접수' CHECK (status IN ('접수', '처리중', '완료', '반려')),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS db_requests_created_idx ON public.db_requests (created_at DESC);
ALTER TABLE public.db_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.db_requests FROM anon, authenticated;   -- 서버(service role)만 읽고 쓴다
