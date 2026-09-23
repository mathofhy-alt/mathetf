-- Use body parameters for all selected papers and exclusion IDs (no URL truncation).
CREATE OR REPLACE FUNCTION public.question_bank_candidates(p_scope jsonb,p_excluded uuid[] DEFAULT '{}')
RETURNS SETOF public.questions LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=public,pg_temp AS $$
 WITH rules AS MATERIALIZED (
  SELECT * FROM jsonb_to_recordset(p_scope) AS r(sources text[],school text,grade text,year text,semesters text[],"semesterPrefix" text,subjects text[])
 ), eligible AS (
  SELECT q.id FROM public.questions q JOIN rules r ON q.source_db_id=ANY(r.sources) AND (r.grade IS NULL OR q.grade::text=r.grade)
  UNION
  SELECT q.id FROM public.questions q JOIN rules r ON q.school=r.school
  WHERE r.sources IS NULL AND (r.grade IS NULL OR q.grade::text=r.grade)
    AND (r.year IS NULL OR q.year::text=r.year)
    AND (r.semesters IS NULL OR q.semester=ANY(r.semesters))
    AND (r."semesterPrefix" IS NULL OR starts_with(q.semester,r."semesterPrefix"))
    AND (r.subjects IS NULL OR q.subject=ANY(r.subjects))
 )
 SELECT q.* FROM public.questions q JOIN eligible e ON q.id=e.id
 WHERE q.work_status='sorted' AND NOT(q.id=ANY(p_excluded));
$$;
REVOKE ALL ON FUNCTION public.question_bank_candidates(jsonb,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.question_bank_candidates(jsonb,uuid[]) TO service_role;


-- Scalar JSON aggregates avoid PostgREST's row cap and repeated scans of the same full scope.
CREATE FUNCTION public.question_bank_facets(p_scope jsonb,p_include_off boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 WITH pool AS MATERIALIZED (SELECT * FROM public.question_bank_candidates(p_scope) WHERE p_include_off OR is_off_curriculum=false),
 grouped AS (
  SELECT subject,unit,is_off_curriculum,coalesce(array_agg(DISTINCT concept) FILTER(WHERE concept IS NOT NULL),'{}') AS key_concepts
  FROM pool LEFT JOIN LATERAL unnest(key_concepts) concept ON true GROUP BY subject,unit,is_off_curriculum
 ) SELECT coalesce(jsonb_agg(to_jsonb(grouped)),'[]') FROM grouped;
$$;
CREATE FUNCTION public.question_bank_random(p_scope jsonb,p_excluded uuid[],p_subject text,p_units text[],p_min integer,p_max integer,p_count integer,p_include_off boolean)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 WITH pool AS MATERIALIZED (
  SELECT id,question_number,subject,grade,school,year,semester,difficulty,key_concepts,unit,work_status,source_db_id,question_type,is_off_curriculum
  FROM public.question_bank_candidates(p_scope,p_excluded)
  WHERE (p_include_off OR is_off_curriculum=false) AND (p_subject='' OR subject=p_subject)
   AND (cardinality(p_units)=0 OR unit=ANY(p_units))
   AND difficulty::text IN (SELECT generate_series(greatest(1,p_min),least(10,p_max))::text)
 ), chosen AS (SELECT * FROM pool ORDER BY random() LIMIT greatest(0,least(50,p_count)))
 SELECT jsonb_build_object('questions',coalesce((SELECT jsonb_agg(to_jsonb(chosen)) FROM chosen),'[]'),'availableCount',(SELECT count(*) FROM pool));
$$;
REVOKE ALL ON FUNCTION public.question_bank_facets(jsonb,boolean), public.question_bank_random(jsonb,uuid[],text,text[],integer,integer,integer,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.question_bank_facets(jsonb,boolean), public.question_bank_random(jsonb,uuid[],text,text[],integer,integer,integer,boolean) TO service_role;
