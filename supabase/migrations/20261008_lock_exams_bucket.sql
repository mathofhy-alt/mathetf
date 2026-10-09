-- 회원이 저장한 시험지 파일(storage 'exams')을 본인만 보게 잠근다 (2026-10-08)
-- 왜: 버킷이 public + 목록 조회가 anon 에게 열려 있었다. 10/8 실측: 비로그인으로 회원 200명 폴더 목록 조회 →
--     {회원id}/{시험지id}.hml(문제+해설 전체, 수 MB) 를 공개 주소로 누구나 받을 수 있었다.
-- 사이트 코드는 전부 회원 세션으로 자기 폴더({auth.uid()}/...)에만 upload/download/remove 한다(공개 주소 미사용, 10/8 grep).
--   → 버킷 비공개 + 본인 폴더 정책. 서버 service_role 은 RLS 우회라 영향 없음.

update storage.buckets set public = false where id = 'exams';

do $$
declare r record;
begin
  for r in select policyname from pg_policies
           where schemaname = 'storage' and tablename = 'objects'
             and (coalesce(qual, '') like '%''exams''%' or coalesce(with_check, '') like '%''exams''%') loop
    execute format('drop policy %I on storage.objects', r.policyname);
    raise notice 'dropped %', r.policyname;
  end loop;
end $$;

create policy "exams_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'exams' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "exams_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'exams' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "exams_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'exams' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "exams_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'exams' and (storage.foldername(name))[1] = (select auth.uid())::text);
