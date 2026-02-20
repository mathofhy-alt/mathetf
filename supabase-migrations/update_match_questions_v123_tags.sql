-- update_match_questions_v123_tags.sql
-- Drop existing function to update return type and logic
drop function if exists match_questions;

-- Re-create function with 'target' parameters for boosting and including key_concepts
create or replace function match_questions (
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  target_grade text default null,
  target_unit text default null,
  filter_exclude_id uuid default null
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
  order by
    (
      (1 - (questions.embedding <=> query_embedding)) -- Base Similarity
      + (case when target_grade is not null and questions.grade = target_grade then 0.03 else 0 end) -- Grade Boost (+3%)
      + (case when target_unit is not null and questions.unit = target_unit then 0.05 else 0 end) -- Unit Boost (+5%)
    ) desc
  limit match_count;
end;
$$;
