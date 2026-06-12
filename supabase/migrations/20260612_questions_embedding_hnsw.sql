-- 유사문제 검색(match_questions) 가속용 벡터 인덱스.
-- 현재: 인덱스 없이 전수 비교 → 호출당 ~150ms (DB), 데이터 양에 비례해 느려짐.
-- HNSW 인덱스 후: 수 ms, 수십만 문제까지 거의 일정한 속도.
-- match_questions 는 코사인 거리(<=>) 기반이므로 vector_cosine_ops 사용.

CREATE INDEX IF NOT EXISTS questions_embedding_hnsw
ON questions USING hnsw (embedding vector_cosine_ops);
