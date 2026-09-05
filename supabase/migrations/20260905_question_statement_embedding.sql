-- [유사문항 2종] '문제 유사' 검색을 위한 발문 전용 임베딩.
--
-- 왜 필요한가:
--   지금 questions.embedding 은 content_xml 을 통째로 임베딩한 값이다.
--   그런데 HML 파서가 미주(ENDNOTE = 해설)를 문항 안에 함께 담기 때문에,
--   실측하면 그 텍스트의 약 75%가 해설이고 발문은 25%뿐이다.
--   즉 지금의 '유사문항'은 사실상 **풀이 유사**다.
--   사용자가 '문제 유사 / 풀이 유사'를 직접 고르게 하려면 발문만의 임베딩이 따로 있어야 한다.
--
-- 발문 추출은 정규식이 아니라 구조로 한다 — content_xml 에서 <ENDNOTE>…</ENDNOTE> 를 통째로 제거.
-- 표본 40개 전수 확인: ENDNOTE 가 문항당 정확히 1개, 제거 후 해설 잔여 문구 0건.
--
-- ⚠ 이 파일은 Supabase SQL 편집기에서 직접 실행해야 한다(이 저장소엔 SQL 실행 경로가 없다).
-- ⚠ 실행 후 scratch_backfill_statement_emb.py 로 값을 채운다. 채우기 전까지 컬럼은 NULL 이고,
--   API 는 NULL 이면 기존 '풀이 유사'로 자동 폴백하므로 중간 상태에서도 화면은 정상 동작한다.

-- 1) 발문 전용 임베딩 컬럼 (text-embedding-3-small = 1536차원, 기존 embedding 과 동일)
ALTER TABLE questions
    ADD COLUMN IF NOT EXISTS embedding_statement vector(1536);

COMMENT ON COLUMN questions.embedding_statement IS
    '발문(문제 지문+선택지)만으로 만든 임베딩. embedding 은 해설까지 포함(약 75%가 해설)이라 성격이 다르다.';

-- 2) 코사인 검색 인덱스 — 기존 questions_embedding_hnsw 와 같은 방식
CREATE INDEX IF NOT EXISTS questions_embedding_statement_hnsw
    ON questions USING hnsw (embedding_statement vector_cosine_ops);

-- 3) 발문 기준 유사문항 검색 RPC
--    기존 match_questions 와 시그니처·반환 컬럼을 똑같이 맞춘다(라우트가 결과를 그대로 클라이언트에 넘긴다).
--    반환 10개: id, school, grade, year, subject, unit, question_number, key_concepts, plain_text, similarity
--    ⚠ allowed_bin_ids 는 기존 함수와 마찬가지로 받기만 하고 쓰지 않는다.
--      questions 에 exam_materials 와 이어지는 컬럼이 없어 DB 레벨 필터가 불가능했고,
--      구매 범위 필터는 라우트(metadataFilter)에서 한다. 시그니처를 맞춰 호출부를 단순하게 두는 것이다.
CREATE OR REPLACE FUNCTION match_questions_statement(
    query_embedding    vector(1536),
    match_threshold    double precision,
    match_count        integer,
    filter_exclude_id  uuid    DEFAULT NULL,
    target_unit        text    DEFAULT NULL,
    allowed_bin_ids    text[]  DEFAULT NULL
)
RETURNS TABLE (
    id              uuid,
    school          text,
    grade           text,
    year            text,
    subject         text,
    unit            text,
    question_number integer,
    key_concepts    text[],
    plain_text      text,
    similarity      double precision
)
LANGUAGE sql STABLE
AS $$
    -- ⚠ 명시 캐스팅 — 컬럼이 varchar 면 RETURNS TABLE(text) 와 안 맞아
    --   "structure of query does not match function result type" 로 생성이 실패한다.
    SELECT
        q.id,
        q.school::text,
        q.grade::text,
        q.year::text,
        q.subject::text,
        q.unit::text,
        q.question_number::integer,
        q.key_concepts::text[],
        q.plain_text::text,
        (1 - (q.embedding_statement <=> query_embedding))::double precision AS similarity
    FROM questions q
    WHERE q.embedding_statement IS NOT NULL
      AND q.work_status = 'sorted'
      AND (filter_exclude_id IS NULL OR q.id <> filter_exclude_id)
      AND (target_unit IS NULL OR q.unit = target_unit)
      AND 1 - (q.embedding_statement <=> query_embedding) > match_threshold
    ORDER BY q.embedding_statement <=> query_embedding
    LIMIT match_count;
$$;
