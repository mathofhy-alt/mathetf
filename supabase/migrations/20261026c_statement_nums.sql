-- [10/26] 원본 찾기: 글이 거의 없는 계산 문제는 수식 속 숫자로 대조한다 — 발문(해설 뺀) 수식의 숫자를 공백으로 이어 둔다.
ALTER TABLE public.question_statement ADD COLUMN IF NOT EXISTS nums text NOT NULL DEFAULT '';
CREATE OR REPLACE FUNCTION public.print_stmt_pool(p_units text[])
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_array(q.id, s.text, s.nums)), '[]'::jsonb)
 FROM public.questions q JOIN public.question_statement s ON s.question_id=q.id
 WHERE q.work_status='sorted' AND q.unit = ANY(p_units);
$$;
NOTIFY pgrst, 'reload schema';
