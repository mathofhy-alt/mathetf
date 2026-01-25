-- Create a function to search for similar questions
-- This function is called via Supabase RPC

create or replace function match_questions (
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  question_number int,
  plain_text text,
  school text,
  year text,
  grade text,
  subject text,
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
    1 - (questions.embedding <=> query_embedding) as similarity
  from questions
  where 1 - (questions.embedding <=> query_embedding) > match_threshold
  order by questions.embedding <=> query_embedding
  limit match_count;
end;
$$;
