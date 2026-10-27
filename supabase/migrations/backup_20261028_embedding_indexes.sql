-- [백업 2026-10-28] 지운 색인 2개를 되살리는 명령 — 실행하지 않는 보관용 파일
--
-- 왜 지웠나: questions.embedding 한 칸에 벡터 색인이 3개 겹쳐 있었다
--   (questions_embedding_hnsw = 6/12 마이그레이션, 아래 두 개 = 기록 없음 — Supabase 화면에서 직접 만든 것으로 보임).
--   아래 두 개는 pg_stat 사용 횟수 0, 각 ~0.8~0.9GB. 문항을 쓸 때마다 색인을 모두 다시 써서
--   10/27 교과서 5,247문항 마무리 때 DB 시간 초과가 25번 났다. 대표 승인(10/28)으로 삭제.
--   남긴 것: questions_embedding_hnsw(embedding), questions_embedding_statement_hnsw(embedding_statement).
--
-- 되살리려면 아래를 한 번 실행(색인 하나당 몇십 분, 그동안 사이트는 정상 동작):

CREATE INDEX CONCURRENTLY IF NOT EXISTS questions_embedding_idx
  ON public.questions USING ivfflat (embedding vector_cosine_ops) WITH (lists = '100');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_questions_embedding_hnsw
  ON public.questions USING hnsw (embedding vector_cosine_ops) WITH (m = '16', ef_construction = '64');
