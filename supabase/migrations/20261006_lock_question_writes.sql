-- 문항·문항 이미지 쓰기 권한을 운영자로 좁힌다 (2026-10-06)
-- 운영 pg_policies 확인 결과: questions / question_images 의 INSERT·UPDATE·DELETE 가
-- auth.role()='authenticated' 로 열려 있었다(20260607_lock_question_content.sql) — 로그인 회원 누구나
-- anon 키 + 자기 토큰으로 문항을 고치거나 지울 수 있었다.
-- 서버 쓰기는 service_role(RLS 우회)이라 영향 없음. 회원 화면에는 문항 쓰기가 없다(10/6 코드 확인).
-- 관리자 화면의 옛 업로드(api/admin/ingest-hml)가 운영자 세션으로 쓰므로 정책을 지우지 않고 운영자로 좁힌다.

DROP POLICY IF EXISTS "questions_insert_authenticated" ON public.questions;
DROP POLICY IF EXISTS "questions_update_authenticated" ON public.questions;
DROP POLICY IF EXISTS "questions_delete_authenticated" ON public.questions;
CREATE POLICY "questions_insert_admin" ON public.questions FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'email') = 'mathofhy@naver.com');
CREATE POLICY "questions_update_admin" ON public.questions FOR UPDATE
  USING ((auth.jwt() ->> 'email') = 'mathofhy@naver.com');
CREATE POLICY "questions_delete_admin" ON public.questions FOR DELETE
  USING ((auth.jwt() ->> 'email') = 'mathofhy@naver.com');

DROP POLICY IF EXISTS "question_images_insert_authenticated" ON public.question_images;
DROP POLICY IF EXISTS "question_images_update_authenticated" ON public.question_images;
DROP POLICY IF EXISTS "question_images_delete_authenticated" ON public.question_images;
CREATE POLICY "question_images_insert_admin" ON public.question_images FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'email') = 'mathofhy@naver.com');
CREATE POLICY "question_images_update_admin" ON public.question_images FOR UPDATE
  USING ((auth.jwt() ->> 'email') = 'mathofhy@naver.com');
CREATE POLICY "question_images_delete_admin" ON public.question_images FOR DELETE
  USING ((auth.jwt() ->> 'email') = 'mathofhy@naver.com');
