-- 유형별 문항 수 (2026-10-19) — 챗봇이 7.5만 행을 내려받아 세던 것을 DB 에서 집계해 돌려준다(약 900행).
CREATE OR REPLACE FUNCTION public.question_type_counts()
RETURNS TABLE(unit text, code text, n bigint) LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT unit, code, count(*) FROM public.question_types GROUP BY unit, code;
$$;
REVOKE ALL ON FUNCTION public.question_type_counts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.question_type_counts() TO service_role;
NOTIFY pgrst, 'reload schema';
