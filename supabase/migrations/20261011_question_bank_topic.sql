-- 시험지출제 'AI로 만들기' (2026-10-11) — 고른 범위 안에서 '주제 문장'과 발문이 가까운 순으로 후보를 준다.
--
-- 왜 새 함수인가:
--   match_questions_statement 는 HNSW 근사 검색이라 단원·난이도 같은 조건을 붙이면 후보가 40개 안팎에서 잘린다
--   (20260620_match_predict.sql 의 같은 문제). 여기선 조건으로 먼저 거른 뒤 그 안을 전부 비교한다(정확).
--   ⚠ 거리 계산을 MATERIALIZED CTE 안에 둔다 — 밖에서 ORDER BY <=> LIMIT 을 하면 플래너가 HNSW 인덱스를 골라
--     같은 '잘림'이 다시 생길 수 있다. CTE 에는 벡터가 아니라 거리(숫자)만 담는다.
--   단원 없이 '전체'를 주제로 훑으면 6만 개 벡터를 읽는다 → 라우트가 단원을 꼭 정해서 부른다.
--
-- p_whole=true  : '전체 출제자료' — question_bank_all(제외 목록) 길 (20261001_question_bank_speed.sql)
-- p_whole=false : 고른 자료만 — question_bank_candidates(범위 규칙)
-- p_targets    : '과목|단원' 목록 — 같은 단원 이름이 과목마다 내용이 달라 짝으로 거른다(도함수의활용: 수학II·미적분I·미적분II)
-- p_concepts   : 개념 태그 — 하나라도 붙은 문항을 tag_hit
-- p_patterns   : 본문(plain_text, 띄어쓰기 뺀 것) ILIKE 패턴('%비율관계%', 띄어쓰기 없이) — 하나라도 맞으면 kw_hit.
--                태그가 없는 주제(삼차함수 비율)를 해설 속 말로 잡는다
-- p_query=null  : 주제 없음 — 조건 안에서 무작위
-- 정렬: kw_hit → tag_hit → 주제 문장과의 거리 (어디까지를 '맞는 문항'으로 볼지는 라우트가 정한다)

CREATE OR REPLACE FUNCTION public.question_bank_topic(
    p_scope jsonb, p_whole boolean, p_excluded uuid[], p_targets text[],
    p_min integer, p_max integer, p_include_off boolean,
    p_concepts text[], p_patterns text[], p_query vector(1536), p_limit integer)
RETURNS TABLE (id uuid, difficulty text, unit text, similarity double precision, tag_hit boolean, kw_hit boolean)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, extensions, pg_temp AS $$
#variable_conflict use_column
BEGIN
  IF p_whole THEN
    RETURN QUERY
    WITH pool AS MATERIALIZED (
      SELECT c.id, c.difficulty::text AS difficulty, c.unit::text AS unit,
             CASE WHEN p_query IS NULL THEN NULL ELSE (c.embedding_statement <=> p_query) END AS dist,
             coalesce(c.key_concepts && p_concepts, false) AS tag_hit,
             coalesce(cardinality(p_patterns) > 0 AND replace(c.plain_text, ' ', '') ILIKE ANY(p_patterns), false) AS kw_hit
      FROM public.question_bank_all(p_excluded) c
      WHERE (p_include_off OR c.is_off_curriculum = false)
        AND (cardinality(p_targets) = 0 OR (c.subject || '|' || c.unit) = ANY(p_targets))
        AND c.difficulty::text IN (SELECT generate_series(greatest(1, p_min), least(10, p_max))::text)
        AND (p_query IS NULL OR c.embedding_statement IS NOT NULL)
    )
    SELECT pool.id, pool.difficulty, pool.unit, (1 - pool.dist)::double precision, pool.tag_hit, pool.kw_hit
    FROM pool ORDER BY pool.kw_hit DESC, pool.tag_hit DESC, pool.dist NULLS LAST, random()
    LIMIT least(600, greatest(1, p_limit));
  ELSE
    RETURN QUERY
    WITH pool AS MATERIALIZED (
      SELECT c.id, c.difficulty::text AS difficulty, c.unit::text AS unit,
             CASE WHEN p_query IS NULL THEN NULL ELSE (c.embedding_statement <=> p_query) END AS dist,
             coalesce(c.key_concepts && p_concepts, false) AS tag_hit,
             coalesce(cardinality(p_patterns) > 0 AND replace(c.plain_text, ' ', '') ILIKE ANY(p_patterns), false) AS kw_hit
      FROM public.question_bank_candidates(p_scope, p_excluded) c
      WHERE (p_include_off OR c.is_off_curriculum = false)
        AND (cardinality(p_targets) = 0 OR (c.subject || '|' || c.unit) = ANY(p_targets))
        AND c.difficulty::text IN (SELECT generate_series(greatest(1, p_min), least(10, p_max))::text)
        AND (p_query IS NULL OR c.embedding_statement IS NOT NULL)
    )
    SELECT pool.id, pool.difficulty, pool.unit, (1 - pool.dist)::double precision, pool.tag_hit, pool.kw_hit
    FROM pool ORDER BY pool.kw_hit DESC, pool.tag_hit DESC, pool.dist NULLS LAST, random()
    LIMIT least(600, greatest(1, p_limit));
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.question_bank_topic(jsonb, boolean, uuid[], text[], integer, integer, boolean, text[], text[], vector, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.question_bank_topic(jsonb, boolean, uuid[], text[], integer, integer, boolean, text[], text[], vector, integer) TO service_role;

-- 'AI로 만들기' 프롬프트용 — '과목|단원' 별 개념 태그와 문항 수 {"수학II|도함수의활용": {"#함수의극대극소": 443, ...}}
-- (facets 는 태그 이름만 줘서 많이 쓰는 태그를 앞에 두거나 오표기 꼬리를 거를 수 없다) 라우트가 1시간 캐시한다.
CREATE OR REPLACE FUNCTION public.question_bank_concept_counts()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  SELECT coalesce(jsonb_object_agg(t, tags), '{}'::jsonb) FROM (
    SELECT t, jsonb_object_agg(concept, n) AS tags FROM (
      SELECT q.subject || '|' || q.unit AS t, concept, count(*) AS n
      FROM public.questions q, unnest(q.key_concepts) AS concept
      WHERE q.work_status = 'sorted' AND q.subject IS NOT NULL AND q.unit IS NOT NULL
      GROUP BY 1, 2
    ) a GROUP BY t
  ) b;
$$;
REVOKE ALL ON FUNCTION public.question_bank_concept_counts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.question_bank_concept_counts() TO service_role;
