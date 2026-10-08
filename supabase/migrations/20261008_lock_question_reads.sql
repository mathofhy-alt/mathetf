-- 문항·문항 그림 읽기를 운영자로 잠근다 (2026-10-08)
--
-- 왜: SELECT 정책이 auth.role()='authenticated' AND work_status IS DISTINCT FROM 'private' 라서
--     로그인 회원 누구나 anon 키 + 자기 토큰으로 /rest/v1/questions 를 직접 불러 공개·대기 문항의
--     content_xml(문제+해설)·plain_text·embedding 을 통째로 긁어 갈 수 있었다(유료 자료·스크래핑 제한 우회).
-- 사이트 코드는 문항을 서버 권한(service_role, RLS 우회)으로만 읽는다 — 10/8 전수 조사 후
--     유사문항 대체 경로(api/pro/similar-questions)를 서버 권한으로 바꾸고, 안 쓰는 옛 경로 2개(pro/download/hml,
--     pro/generate-exam)를 지운 배포(코드)가 먼저 나가야 한다. 관리자 화면은 운영자 세션으로 읽으므로 운영자 정책을 둔다.

-- 이름과 무관하게 두 표의 SELECT 정책을 전부 지운다(운영 이름이 파일과 다를 수 있다)
do $$
declare r record;
begin
  for r in select tablename, policyname from pg_policies
           where schemaname = 'public' and tablename in ('questions', 'question_images') and cmd in ('SELECT', 'ALL') loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
    raise notice 'dropped %.%', r.tablename, r.policyname;
  end loop;
end $$;

create policy "questions_select_admin" on public.questions for select
  using ((auth.jwt() ->> 'email') = 'mathofhy@naver.com');
create policy "question_images_select_admin" on public.question_images for select
  using ((auth.jwt() ->> 'email') = 'mathofhy@naver.com');

-- 회원 권한으로 도는 벡터 검색 RPC 는 이제 0건이라 무해하지만, 직접 호출 통로 자체를 닫는다(서버는 service_role 로 부른다)
do $$
declare r record;
begin
  for r in select oid::regprocedure as sig from pg_proc where proname in ('match_questions_statement', 'match_predict') loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

-- [10/8 후속] 위 정책은 auth.jwt() 를 행마다 계산해 비로그인 question_images 조회가 전체 훑기 → 57014 시간 초과.
--   (select ...) 로 감싸 한 번만 계산(initplan)하고, 로그인 역할에만 걸어 anon 은 정책 없음 = 즉시 빈 결과.
drop policy if exists "questions_select_admin" on public.questions;
drop policy if exists "question_images_select_admin" on public.question_images;
create policy "questions_select_admin" on public.questions for select to authenticated
  using ((select auth.jwt() ->> 'email') = 'mathofhy@naver.com');
create policy "question_images_select_admin" on public.question_images for select to authenticated
  using ((select auth.jwt() ->> 'email') = 'mathofhy@naver.com');
