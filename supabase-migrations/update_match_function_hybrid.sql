-- Drop existing function first to update signature safely
drop function if exists match_questions;

-- Re-create function with filter parameters
create or replace function match_questions (
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  filter_grade text default null,
  filter_unit text default null,
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
    1 - (questions.embedding <=> query_embedding) as similarity
  from questions
  where 1 - (questions.embedding <=> query_embedding) > match_threshold
  -- Apply filters if provided
  and (filter_grade is null or questions.grade = filter_grade)
  and (filter_unit is null or questions.unit = filter_unit)
  and (filter_exclude_id is null or questions.id != filter_exclude_id)
  order by questions.embedding <=> query_embedding
  limit match_count;
end;
$$;
