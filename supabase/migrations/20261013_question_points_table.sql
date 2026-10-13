-- 모의고사 배점 — 별도 표로 옮김 (2026-10-13)
--
-- 20261012 에서 questions.points 칸을 만들어 채우려 했는데, 문항 행을 고치면 벡터 색인(HNSW 2개)도 다시 써서
-- MICRO 에서 5행 UPDATE 도 시간 초과가 났다(1만 행이면 몇 시간 + 디스크 IO). 작은 표에 따로 둔다.
-- questions.points 칸은 지운다(아직 아무 코드도 안 읽음 · 지우기는 메타데이터만 바뀌어 즉시 끝난다).

CREATE TABLE IF NOT EXISTS public.question_points (
  question_id uuid PRIMARY KEY REFERENCES public.questions(id) ON DELETE CASCADE,
  points smallint NOT NULL CHECK (points BETWEEN 2 AND 4)
);
ALTER TABLE public.question_points ENABLE ROW LEVEL SECURITY;   -- 정책 없음 = 서버(service_role)만

CREATE OR REPLACE FUNCTION public.question_bank_topic(
    p_scope jsonb, p_whole boolean, p_excluded uuid[], p_targets text[],
    p_min integer, p_max integer, p_include_off boolean,
    p_concepts text[], p_patterns text[], p_query vector(1536), p_limit integer, p_filter jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE (id uuid, difficulty text, unit text, similarity double precision, tag_hit boolean, kw_hit boolean)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, extensions, pg_temp AS $$
#variable_conflict use_column
DECLARE
  f_years text[] := CASE WHEN jsonb_typeof(p_filter->'years') = 'array' AND jsonb_array_length(p_filter->'years') > 0 THEN ARRAY(SELECT jsonb_array_elements_text(p_filter->'years')) END;
  f_kinds text[] := CASE WHEN jsonb_typeof(p_filter->'kinds') = 'array' AND jsonb_array_length(p_filter->'kinds') > 0 THEN ARRAY(SELECT jsonb_array_elements_text(p_filter->'kinds')) END;
  f_grades text[] := CASE WHEN jsonb_typeof(p_filter->'grades') = 'array' AND jsonb_array_length(p_filter->'grades') > 0 THEN ARRAY(SELECT jsonb_array_elements_text(p_filter->'grades')) END;
  f_sems text[] := CASE WHEN jsonb_typeof(p_filter->'semesters') = 'array' AND jsonb_array_length(p_filter->'semesters') > 0 THEN ARRAY(SELECT jsonb_array_elements_text(p_filter->'semesters')) END;
  f_schools text[] := CASE WHEN jsonb_typeof(p_filter->'schools') = 'array' AND jsonb_array_length(p_filter->'schools') > 0 THEN ARRAY(SELECT '%' || x || '%' FROM jsonb_array_elements_text(p_filter->'schools') x) END;
  f_qtype text := nullif(p_filter->>'qtype', '');
  f_points smallint[] := CASE WHEN jsonb_typeof(p_filter->'points') = 'array' AND jsonb_array_length(p_filter->'points') > 0 THEN ARRAY(SELECT x::smallint FROM jsonb_array_elements_text(p_filter->'points') x) END;
BEGIN
  RETURN QUERY
  WITH src AS (
    SELECT c.* FROM public.question_bank_all(p_excluded) c WHERE p_whole
    UNION ALL
    SELECT c.* FROM public.question_bank_candidates(p_scope, p_excluded) c WHERE NOT p_whole
  ), pool AS MATERIALIZED (
    SELECT s.id, s.difficulty::text AS difficulty, s.unit::text AS unit,
           CASE WHEN p_query IS NULL THEN NULL ELSE (s.embedding_statement <=> p_query) END AS dist,
           coalesce(s.key_concepts && p_concepts, false) AS tag_hit,
           coalesce(cardinality(p_patterns) > 0 AND replace(s.plain_text, ' ', '') ILIKE ANY(p_patterns), false) AS kw_hit
    FROM src s
    WHERE (p_include_off OR s.is_off_curriculum = false)
      AND (cardinality(p_targets) = 0 OR (s.subject || '|' || s.unit) = ANY(p_targets))
      AND s.difficulty::text IN (SELECT generate_series(greatest(1, p_min), least(10, p_max))::text)
      AND (p_query IS NULL OR s.embedding_statement IS NOT NULL)
      AND (f_years IS NULL OR s.year::text = ANY(f_years))
      AND (f_kinds IS NULL OR (CASE WHEN s.school IN ('전국연합', '평가원', '수능') THEN 'mock'
                                    WHEN s.school IN ('사관학교', '경찰대학교') THEN 'special' ELSE 'school' END) = ANY(f_kinds))
      AND (f_qtype IS NULL OR s.question_type = f_qtype)
      AND (f_grades IS NULL OR s.grade::text = ANY(f_grades))
      AND (f_sems IS NULL OR s.semester = ANY(f_sems))
      AND (f_schools IS NULL OR s.school ILIKE ANY(f_schools))
      AND (f_points IS NULL OR EXISTS (SELECT 1 FROM public.question_points qp WHERE qp.question_id = s.id AND qp.points = ANY(f_points)))
  )
  SELECT pool.id, pool.difficulty, pool.unit, (1 - pool.dist)::double precision, pool.tag_hit, pool.kw_hit
  FROM pool ORDER BY pool.kw_hit DESC, pool.tag_hit DESC, pool.dist NULLS LAST, random()
  LIMIT least(600, greatest(1, p_limit));
END;
$$;


ALTER TABLE public.questions DROP COLUMN IF EXISTS points;
