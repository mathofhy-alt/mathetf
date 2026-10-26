-- [10/26] 프린트변형 '원본 문항' 찾기 — 단원의 발문(question_statement)을 한 번에 받는다.
--   PostgREST 행 제한(1000)을 피하려고 jsonb 한 덩어리로 돌려준다(최대 단원 4,195문항·약 40만 자).
--   한글 3글자 비교는 서버(print-original.ts)에서 한다 — DB 에 pg_trgm 이 없다.
CREATE OR REPLACE FUNCTION public.print_stmt_pool(p_units text[])
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_array(q.id, s.text)), '[]'::jsonb)
 FROM public.questions q JOIN public.question_statement s ON s.question_id=q.id
 WHERE q.work_status='sorted' AND q.unit = ANY(p_units);
$$;
REVOKE ALL ON FUNCTION public.print_stmt_pool(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.print_stmt_pool(text[]) TO service_role;
NOTIFY pgrst, 'reload schema';
