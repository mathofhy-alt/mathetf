-- 자동 출제를 유형 고르게 (2026-10-19) — 유형마다 무작위 한 줄 → 유형을 돌아가며 하나씩 뽑기 → 단원·유형·난이도 순으로 돌려준다.
-- 기존 question_bank_random 은 그대로(후퇴용). 유형 없는 문항은 '유형 없음' 한 묶음으로 취급.
CREATE OR REPLACE FUNCTION public.question_bank_random_typed(p_scope jsonb,p_excluded uuid[],p_subject text,p_units text[],p_min integer,p_max integer,p_count integer,p_include_off boolean)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 WITH pool AS MATERIALIZED (
  SELECT q.id,q.question_number,q.subject,q.grade,q.school,q.year,q.semester,q.difficulty,q.key_concepts,q.unit,q.work_status,q.source_db_id,q.question_type,q.is_off_curriculum,
         t.code AS type_code, t.sort_key
  FROM public.question_bank_candidates(p_scope,p_excluded) q
  LEFT JOIN public.question_types t ON t.question_id=q.id
  LEFT JOIN public.question_type_defs d ON d.unit=t.unit AND d.code=t.code
  WHERE (p_include_off OR (q.is_off_curriculum=false AND coalesce(d.offcur,false)=false)) AND (p_subject='' OR q.subject=p_subject)
   AND (cardinality(p_units)=0 OR q.unit=ANY(p_units))
   AND q.difficulty::text IN (SELECT generate_series(greatest(1,p_min),least(10,p_max))::text)
 ), ranked AS (
  SELECT *, row_number() OVER (PARTITION BY unit, coalesce(type_code,'') ORDER BY random()) AS rn, random() AS tie FROM pool
 ), chosen AS (
  SELECT * FROM ranked ORDER BY rn, tie LIMIT greatest(0,least(50,p_count))
 ), shaped AS (
  SELECT id,question_number,subject,grade,school,year,semester,difficulty,key_concepts,unit,work_status,source_db_id,question_type,is_off_curriculum,type_code,
         sort_key, nullif(regexp_replace(coalesce(difficulty,''),'[^0-9]','','g'),'')::int AS dnum FROM chosen
 )
 SELECT jsonb_build_object(
  'questions', coalesce((SELECT jsonb_agg(to_jsonb(s) - 'sort_key' - 'dnum' ORDER BY s.sort_key NULLS LAST, s.dnum NULLS LAST, s.question_number, s.id) FROM shaped s),'[]'),
  'availableCount', (SELECT count(*) FROM pool),
  'typeCount', (SELECT count(DISTINCT (unit, coalesce(type_code,''))) FROM chosen));
$$;
REVOKE ALL ON FUNCTION public.question_bank_random_typed(jsonb,uuid[],text,text[],integer,integer,integer,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.question_bank_random_typed(jsonb,uuid[],text,text[],integer,integer,integer,boolean) TO service_role;
NOTIFY pgrst, 'reload schema';
