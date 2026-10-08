-- [10/8] 원본 제보 줄(content_type='원본제보')이 공개 키로 누구에게나 읽히던 것 — 제보자 이름·회원 id·파일 경로·설명이 보였다.
--   판매 자료를 공개로 연 SELECT 규칙에 원본 제보까지 같이 열려 있었다. 기존 규칙은 그대로 두고,
--   RESTRICTIVE 규칙(모든 SELECT 규칙과 AND 로 묶임)을 하나 더해 원본 제보 줄은 제보한 본인·관리자만 보게 한다.
--   서버(service role)는 RLS 를 타지 않으므로 제보 접수·중복 확인·마이페이지 '내 요청'·공개 페이지는 영향 없다.
--   관리자 원본 제보 화면(/admin/raw-uploads)은 브라우저에서 관리자 로그인으로 읽으므로 관리자 이메일을 연다.
DROP POLICY IF EXISTS "original_reports_owner_or_admin_only" ON public.exam_materials;
CREATE POLICY "original_reports_owner_or_admin_only"
  ON public.exam_materials
  AS RESTRICTIVE
  FOR SELECT
  USING (
    content_type IS DISTINCT FROM '원본제보'
    OR uploader_id = auth.uid()
    OR (auth.jwt() ->> 'email') = 'mathofhy@naver.com'
  );
