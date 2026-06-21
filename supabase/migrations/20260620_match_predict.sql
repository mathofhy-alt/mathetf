-- 예상문제 매칭 RPC (타임아웃 개선판)
-- 문제: HNSW 인덱스 + WHERE 필터 조합 시, 필터에 맞는 행을 찾으려 그래프를 과도하게 순회 → statement timeout.
-- 해결: MATERIALIZED CTE 로 "필터(단원/난이도/학교)를 먼저" 적용해 작은 후보집합을 만든 뒤,
--       그 작은 집합에서만 코사인 거리로 정렬 → 인덱스 없이도 빠름(questions 자체가 6천 행 규모).

create or replace function match_predict(
  query_embedding vector(1536),
  target_units text[],
  min_diff int,
  max_diff int,
  exclude_school text default null,
  match_count int default 150
)
returns table (
  id uuid,
  unit text,
  difficulty text,
  subject text,
  grade text,
  school text,
  year text,
  semester text,
  question_number text,
  source_db_id text,
  key_concepts jsonb,
  similarity float
)
language sql stable
as $$
  with cand as materialized (
    select
      q.id, q.unit, q.difficulty, q.subject, q.grade, q.school,
      q.year, q.semester, q.question_number, q.source_db_id, q.key_concepts,
      q.embedding
    from questions q
    where q.work_status = 'sorted'
      and q.embedding is not null
      and q.unit = any(target_units)
      and q.difficulty ~ '^[0-9]+$'
      and q.difficulty::int between min_diff and max_diff
      and (exclude_school is null or q.school <> exclude_school)
  )
  select
    c.id, c.unit, c.difficulty, c.subject, c.grade,
    c.school, c.year::text, c.semester, c.question_number::text,
    c.source_db_id, to_jsonb(c.key_concepts),
    1 - (c.embedding <=> query_embedding) as similarity
  from cand c
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
