-- update_match_questions_hnsw_fast.sql
-- 유사문항 검색이 HNSW 인덱스(questions_embedding_hnsw)를 타도록 개선 + 잠복 버그 제거.
--
-- 1) 성능: 기존 ORDER BY (유사도+부스팅) 수식은 인덱스를 못 타 전수 비교(데이터 비례 느려짐).
--    → 2단계: 인덱스로 최근접 후보 회수 → 후보 안에서 threshold/부스팅 재정렬.
-- 2) 버그: 기존 함수의 allowed_bin_ids 필터는 존재하지 않는 컬럼(questions.original_bin_id)을
--    참조해 유료모드에서 RPC가 즉시 에러나는 잠복 버그였음 (무료모드=null 이라 미발현).
--    questions 에는 exam_materials 연결 컬럼이 없어 DB 레벨 필터가 불가 →
--    구매 필터는 호출측(similar-questions route 의 metadataFilter, JS)에서 적용한다.
--    allowed_bin_ids 파라미터는 호출 호환성을 위해 유지하되 함수 내에서는 사용하지 않음.
--
-- 실행 전 중복 오버로드 정리 포함 (PGRST203 방지).

do $$
declare r record;
begin
  for r in select oid::regprocedure as sig from pg_proc where proname = 'match_questions' loop
    execute 'drop function ' || r.sig;
  end loop;
end $$;

create function match_questions (
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  target_grade text default null,
  target_unit text default null,
  filter_exclude_id uuid default null,
  allowed_bin_ids uuid[] default null  -- [미사용] 호출 호환용. 구매 필터는 route(JS)에서 적용.
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
  -- HNSW 인덱스 경로. ef_search 를 후보 수만큼 올려 충분히 회수.
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
end;
$$;

-- [중요] 소유자 권한 실행 (RLS 우회) — 일반 유저 권한으로 돌면 RLS 평가가 겹쳐 statement timeout 발생.
-- 단, definer 는 RLS 를 우회하므로 익명(anon) 직접 호출을 반드시 차단한다 (스크래핑 방지 유지).
alter function match_questions(vector, double precision, integer, text, text, uuid, uuid[])
  security definer set search_path = public;
revoke execute on function match_questions(vector, double precision, integer, text, text, uuid, uuid[]) from public, anon;
grant execute on function match_questions(vector, double precision, integer, text, text, uuid, uuid[]) to authenticated, service_role;
