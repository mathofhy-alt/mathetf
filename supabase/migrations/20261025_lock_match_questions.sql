-- 로그인 회원이 match_questions 를 REST 로 직접 불러 공개 기출 발문(plain_text)을 한 번에 최대 1,000행씩 긁을 수 있었다 (2026-10-25 누출 점검)
-- 임의의 벡터만 넣으면 되므로 반복 호출로 전체 발문을 모을 수 있다(발문 텍스트 노출 금지 방침과 충돌). 시중교재(private)는 10/8 에 이미 빠졌다.
-- 사이트는 서버 권한(service_role)으로만 부른다: /api/pro/similar-questions·/api/admin/questions/similar·scripts/precompute_similar.py.
do $$
declare r record;
begin
  for r in select oid::regprocedure as sig from pg_proc where proname = 'match_questions' and pronamespace = 'public'::regnamespace loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
