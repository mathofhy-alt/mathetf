-- update_match_questions_purchased_filter.sql
-- 구매한 DB 안에서만 유사문항 검색하도록 RPC 수정

drop function if exists match_questions;

create or replace function match_questions (
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  target_grade text default null,
  target_unit text default null,
  filter_exclude_id uuid default null,
  allowed_bin_ids uuid[] default null  -- 구매한 original_bin_id 목록 (null이면 전체 검색)
)
returns table (
  id uuid,
  question_number int,
  plain_text text,
  school text,
  year text,
  grade text,
  subject text,
  unit text,
  key_concepts text[],
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    questions.id,
    questions.question_number,
    questions.plain_text,
    questions.school,
    questions.year,
    questions.grade,
    questions.subject,
    questions.unit,
    questions.key_concepts,
    (1 - (questions.embedding <=> query_embedding)) as similarity
  from questions
  where 1 - (questions.embedding <=> query_embedding) > match_threshold
  and (filter_exclude_id is null or questions.id != filter_exclude_id)
  -- ★ 핵심: 구매한 DB의 original_bin_id 목록 안에 있는 문항만 검색
  and (allowed_bin_ids is null or questions.original_bin_id = any(allowed_bin_ids))
  order by
    (
      (1 - (questions.embedding <=> query_embedding))
      + (case when target_grade is not null and questions.grade = target_grade then 0.03 else 0 end)
      + (case when target_unit is not null and questions.unit = target_unit then 0.05 else 0 end)
    ) desc
  limit match_count;
end;
$$;
