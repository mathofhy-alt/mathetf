-- update_match_questions_hnsw_fast.sql
-- 유사문항 검색이 HNSW 인덱스(questions_embedding_hnsw)를 타도록 개선.
--
-- 문제: 기존 함수는 ORDER BY (유사도+부스팅) 조합 수식이라 인덱스를 못 타고 전수 비교(데이터 비례 느려짐).
-- 해결: 2단계 — ① 인덱스로 최근접 후보를 빠르게 뽑고 ② 후보 안에서 threshold/부스팅 재정렬.
--       allowed_bin_ids(구매 필터)가 있을 땐 후보 누락 위험이 있어 기존 정확 스캔을 유지(분기).
-- 시그니처/반환 동일 → create or replace 로 무중단 교체. 결과는 기존과 사실상 동일.

create or replace function match_questions (
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  target_grade text default null,
  target_unit text default null,
  filter_exclude_id uuid default null,
  allowed_bin_ids uuid[] default null
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
declare
  cand_limit int := least(greatest(match_count * 4, 200), 1000);
begin
  if allowed_bin_ids is null then
    -- [빠른 경로] HNSW 인덱스 사용. ef_search 를 후보 수만큼 올려 충분히 회수.
    perform set_config('hnsw.ef_search', cand_limit::text, true);
    return query
    with candidates as (
      select q.id, q.question_number, q.plain_text, q.school, q.year, q.grade,
             q.subject, q.unit, q.key_concepts,
             (1 - (q.embedding <=> query_embedding)) as sim
      from questions q
      order by q.embedding <=> query_embedding   -- ← 이 형태만 인덱스를 탐
      limit cand_limit
    )
    select c.id, c.question_number, c.plain_text, c.school, c.year, c.grade,
           c.subject, c.unit, c.key_concepts, c.sim as similarity
    from candidates c
    where c.sim > match_threshold
      and (filter_exclude_id is null or c.id != filter_exclude_id)
    order by
      ( c.sim
        + (case when target_grade is not null and c.grade = target_grade then 0.03 else 0 end)
        + (case when target_unit is not null and c.unit = target_unit then 0.05 else 0 end)
      ) desc
    limit match_count;
  else
    -- [정확 경로] 구매 필터 검색: 후보 누락 없이 기존 전수 비교 유지.
    return query
    select
      questions.id, questions.question_number, questions.plain_text, questions.school,
      questions.year, questions.grade, questions.subject, questions.unit,
      questions.key_concepts,
      (1 - (questions.embedding <=> query_embedding)) as similarity
    from questions
    where 1 - (questions.embedding <=> query_embedding) > match_threshold
      and (filter_exclude_id is null or questions.id != filter_exclude_id)
      and (questions.original_bin_id = any(allowed_bin_ids))
    order by
      ( (1 - (questions.embedding <=> query_embedding))
        + (case when target_grade is not null and questions.grade = target_grade then 0.03 else 0 end)
        + (case when target_unit is not null and questions.unit = target_unit then 0.05 else 0 end)
      ) desc
    limit match_count;
  end if;
end;
$$;
