-- [10/27] 공지 쓰기·수정·삭제는 관리자만. 예전 규칙은 '로그인한 누구나 자기 이름으로 공지 쓰기'라
--   화면을 거치지 않고 REST 로 직접 넣으면 아무 회원이나 가짜 공지를 올릴 수 있었다(확인 시점 공지 1건, 전부 관리자 글).
-- 조회수는 대표 지시로 화면에서 뺐다(10/27) — 화면이 더 이상 views 를 올리지 않는다.
DROP POLICY IF EXISTS "Auth Insert" ON public.notices;
DROP POLICY IF EXISTS "Auth Update" ON public.notices;
DROP POLICY IF EXISTS "Users can create notices" ON public.notices;
DROP POLICY IF EXISTS "Users can update own notices" ON public.notices;
DROP POLICY IF EXISTS "Users can delete own notices" ON public.notices;
CREATE POLICY "Admin insert" ON public.notices FOR INSERT WITH CHECK ((auth.jwt() ->> 'email') = 'mathofhy@naver.com');
CREATE POLICY "Admin update" ON public.notices FOR UPDATE USING ((auth.jwt() ->> 'email') = 'mathofhy@naver.com');
CREATE POLICY "Admin delete" ON public.notices FOR DELETE USING ((auth.jwt() ->> 'email') = 'mathofhy@naver.com');
NOTIFY pgrst, 'reload schema';
