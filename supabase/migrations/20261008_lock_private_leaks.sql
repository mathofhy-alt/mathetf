-- 회원 전용 시중교재(work_status='private')가 새는 두 구멍을 막는다 (2026-10-08)
--
-- 1) match_questions (유사문항 벡터 검색, SECURITY DEFINER = RLS 우회)
--    운영 함수에 work_status 조건이 없었다. 10/8 실측: 쎈 미적분I 문항 임베딩으로 30건 요청 → 13건이 private(쎈 미적분I).
--    시험지출제 유사문항 모달의 폴백 경로(api/pro/similar-questions)와, 로그인 회원의 rpc 직접 호출로 id·본문이 샜다.
--    → 후보를 sorted 로 한정한다(pending 대기 문항도 함께 막힘). 시그니처·권한은 그대로(CREATE OR REPLACE).
--    HNSW 는 WHERE 를 인덱스 탐색 뒤 거르므로 후보가 조금 줄 수 있다 — private·pending 은 전체의 약 8% 라 영향 미미.
--
-- 2) storage 'hwpx' 버킷 정책 (supabase_hwpx_setup.sql)
--    SELECT·INSERT·UPDATE 가 bucket_id 조건만으로 누구에게나 열려 있었다. 10/8 실측: 비로그인 anon 키로
--    auto_captures/·manual_captures/ 목록 조회 성공 → 파일명의 문항 id 로 시중교재 문제·해설 캡쳐를 전부 받을 수 있고,
--    누구나 캡쳐를 덮어쓸 수도 있었다.
--    → 정책을 운영자로 좁힌다. 공개 버킷의 /object/public/ 주소 읽기는 정책과 무관하게 계속 된다(사이트 이미지 표시 영향 없음).
--      서버 쓰기는 service_role(RLS 우회)이라 영향 없음. 관리자 수동 캡쳐(api/admin/upload-capture, 운영자 세션·upsert)는 운영자 정책으로 유지.

create or replace function match_questions (
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  target_grade text default null,
  target_unit text default null,
  filter_exclude_id uuid default null,
  allowed_bin_ids uuid[] default null  -- [미사용] 호출 호환용
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
security definer
set search_path = public
as $$
declare
  cand_limit int := least(greatest(match_count * 4, 200), 1000);
begin
  perform set_config('hnsw.ef_search', cand_limit::text, true);
  return query
  with candidates as (
    select q.id, q.question_number, q.plain_text, q.school, q.year, q.grade,
           q.subject, q.unit, q.key_concepts,
           (1 - (q.embedding <=> query_embedding)) as sim
    from questions q
    where q.work_status = 'sorted'            -- [10/8] private(시중교재)·pending 제외
    order by q.embedding <=> query_embedding
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

revoke execute on function match_questions(vector, double precision, integer, text, text, uuid, uuid[]) from public, anon;
grant execute on function match_questions(vector, double precision, integer, text, text, uuid, uuid[]) to authenticated, service_role;

-- 운영 정책 이름이 설정 파일과 다를 수 있다 → 이름과 무관하게 'hwpx' 를 참조하는 storage.objects 정책을 전부 지운다
do $$
declare r record;
begin
  for r in select policyname from pg_policies
           where schemaname = 'storage' and tablename = 'objects'
             and (coalesce(qual, '') like '%hwpx%' or coalesce(with_check, '') like '%hwpx%') loop
    execute format('drop policy %I on storage.objects', r.policyname);
    raise notice 'dropped %', r.policyname;
  end loop;
end $$;

create policy "hwpx_select_admin" on storage.objects for select
  using (bucket_id = 'hwpx' and (auth.jwt() ->> 'email') = 'mathofhy@naver.com');
create policy "hwpx_insert_admin" on storage.objects for insert
  with check (bucket_id = 'hwpx' and (auth.jwt() ->> 'email') = 'mathofhy@naver.com');
create policy "hwpx_update_admin" on storage.objects for update
  using (bucket_id = 'hwpx' and (auth.jwt() ->> 'email') = 'mathofhy@naver.com');
create policy "hwpx_delete_admin" on storage.objects for delete
  using (bucket_id = 'hwpx' and (auth.jwt() ->> 'email') = 'mathofhy@naver.com');
