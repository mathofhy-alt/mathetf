-- 'AI로 만들기' 2차 (2026-10-11) — ① 출처·연도·문항유형 같은 조건 ② 챗봇 대화 기록
--
-- ① 100문장 시험에서 '2024년 모의고사에서만', '서술형 위주로', 'OO고 기출로' 를 못 걸러 엉뚱한 문항을 담았다.
--    question_bank_topic 에 p_filter(jsonb) 를 더한다. 키는 모두 생략 가능:
--      years     ["2024","2025"]            questions.year
--      kinds     ["mock","school","special"] 모의고사(전국연합·평가원·수능) / 학교 기출 / 사관·경찰대
--      qtype     "short_answer" | "multiple_choice"
--      grades    ["고1"]                    questions.grade
--      semesters ["2학기중간"]              questions.semester
--      schools   ["휘문"]                   학교 이름 일부(ILIKE)
--    시그니처가 바뀌므로 예전 함수를 지우고 새로 만든다(라우트는 새 시그니처로 부른다).
-- ② 사용자 요청: 배포하면 사람들이 챗봇에 쓴 말과 챗봇 반응을 다 남겨야 고칠 수 있다 → qb_chat_logs (서버만 읽고 쓴다)

DROP FUNCTION IF EXISTS public.question_bank_topic(jsonb, boolean, uuid[], text[], integer, integer, boolean, text[], text[], vector, integer);

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
  )
  SELECT pool.id, pool.difficulty, pool.unit, (1 - pool.dist)::double precision, pool.tag_hit, pool.kw_hit
  FROM pool ORDER BY pool.kw_hit DESC, pool.tag_hit DESC, pool.dist NULLS LAST, random()
  LIMIT least(600, greatest(1, p_limit));
END;
$$;

REVOKE ALL ON FUNCTION public.question_bank_topic(jsonb, boolean, uuid[], text[], integer, integer, boolean, text[], text[], vector, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.question_bank_topic(jsonb, boolean, uuid[], text[], integer, integer, boolean, text[], text[], vector, integer, jsonb) TO service_role;

CREATE TABLE IF NOT EXISTS public.qb_chat_logs (
  id          bigserial PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  user_id     uuid,
  request     text,          -- 이번에 사용자가 쓴 말
  history     jsonb,         -- 앞 대화(최근 8개)
  plan        jsonb,         -- AI 가 만든 조건
  reply       text,          -- 챗봇 답
  by          text,          -- 고른 근거: keyword · concept · similarity · unit · ask
  question_ids uuid[],       -- 담은 문항
  ms          integer,       -- 걸린 시간
  error       text
);
CREATE INDEX IF NOT EXISTS qb_chat_logs_created ON public.qb_chat_logs (created_at DESC);
ALTER TABLE public.qb_chat_logs ENABLE ROW LEVEL SECURITY;   -- 정책 없음 = 서버(service_role)만
