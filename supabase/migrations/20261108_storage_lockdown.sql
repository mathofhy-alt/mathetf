-- 2026-11-08 다운로드/판매원본 보안 수리. 운영 DB에서 자동 실행하지 않는다.
-- IMPORTANT: 이 파일을 한 번에 자동 적용하지 말 것. 배포자는 A/B를 나눠 실행한다.
-- A는 코드 배포 전 실행 가능(새 비공개 버킷 생성 + 해당 버킷 보호).
-- 호환 릴리스 → A → 운영 도구 사본 전환(등록 중지) → 원본 복사(--copy)
-- → 새 코드 배포/열린 탭 새로고침 검증 → B → 원본 제거(--prune).
-- 자세한 절차: C:\selfmade\다운로드수리\deploy_steps.md

-- ===== A: 코드 배포 전 실행 가능 =====
begin;
insert into storage.buckets(id, name, public)
values ('hwpx-originals', 'hwpx-originals', false)
on conflict (id) do update set public = false;
-- 복사 전부터 새 버킷을 보호한다. 기존의 넓은 permissive 정책도 우회하지 못한다.
drop policy if exists "hwpx_originals_server_only" on storage.objects;
create policy "hwpx_originals_server_only" on storage.objects as restrictive
for all to anon, authenticated
using (bucket_id <> 'hwpx-originals')
with check (bucket_id <> 'hwpx-originals');
commit;

-- ===== B: 반드시 새 코드 배포 후 실행 =====
-- 마이페이지/홈/관리자 다운로드·목록·UploadModal 서명 업로드 전환 확인 후 적용.
-- 전체 스크립트를 그대로 migration runner에 넣지 말고 위 배포 순서를 지킨다.
begin;
update storage.buckets set public = false
where id in ('exam-materials', 'mock-materials', 'hwpx-originals', 'pdf-jobs', 'exams');

drop policy if exists "Authenticated users can select" on storage.objects;
drop policy if exists "Authenticated users can upload" on storage.objects;

-- 운영에 이름이 다른 permissive 정책이 있어도 민감 버킷은 클라이언트 접근 불가.
-- service_role은 RLS 우회. 서명 다운로드/서명 업로드 토큰은 서버에서 발급한다.
drop policy if exists "private_materials_server_only" on storage.objects;
create policy "private_materials_server_only" on storage.objects as restrictive
for all to anon, authenticated
using (bucket_id not in ('exam-materials','mock-materials','hwpx-originals','pdf-jobs'))
with check (bucket_id not in ('exam-materials','mock-materials','hwpx-originals','pdf-jobs'));

-- exams는 회원 본인 폴더만. 기존 permissive 소유자 정책과 교집합으로 적용.
drop policy if exists "saved_exams_owner_guard" on storage.objects;
create policy "saved_exams_owner_guard" on storage.objects as restrictive
for all to anon, authenticated
using (bucket_id <> 'exams' or (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id <> 'exams' or (storage.foldername(name))[1] = (select auth.uid())::text);

-- 공개 이미지/PDF/분석글은 공개 유지, 관리자 외 덮어쓰기/삭제/업로드 방어.
drop policy if exists "public_assets_write_guard" on storage.objects;
create policy "public_assets_write_guard" on storage.objects as restrictive
for insert to anon, authenticated
with check (bucket_id not in ('hwpx','exam-previews','mock-previews','exam-free-problems','question-assets','exam-analysis')
    or (auth.jwt()->>'email') = 'mathofhy@naver.com');
drop policy if exists "public_assets_update_guard" on storage.objects;
create policy "public_assets_update_guard" on storage.objects as restrictive
for update to anon, authenticated
using (bucket_id not in ('hwpx','exam-previews','mock-previews','exam-free-problems','question-assets','exam-analysis')
    or (auth.jwt()->>'email') = 'mathofhy@naver.com')
with check (bucket_id not in ('hwpx','exam-previews','mock-previews','exam-free-problems','question-assets','exam-analysis')
    or (auth.jwt()->>'email') = 'mathofhy@naver.com');
drop policy if exists "public_assets_delete_guard" on storage.objects;
create policy "public_assets_delete_guard" on storage.objects as restrictive
for delete to anon, authenticated
using (bucket_id not in ('hwpx','exam-previews','mock-previews','exam-free-problems','question-assets','exam-analysis')
    or (auth.jwt()->>'email') = 'mathofhy@naver.com');

-- 행 RLS는 컬럼을 숨기지 않는다. 전체 SELECT를 회수하고 안전한 기존 컬럼만 허용한다.
-- description도 원본 제보의 files 배열(저장 경로)을 포함하므로 서버로 한정한다.
revoke select on public.exam_materials from public, anon, authenticated;
do $$
declare cols text; private_cols text;
begin
    select string_agg(format('%I', column_name), ', ')
    into private_cols from information_schema.columns
    where table_schema='public' and table_name='exam_materials' and column_name in ('file_path','description');
    if private_cols is not null then
        execute format('revoke select (%s) on public.exam_materials from public, anon, authenticated', private_cols);
    end if;
    select string_agg(format('%I', column_name), ', ' order by ordinal_position)
    into cols from information_schema.columns
    where table_schema='public' and table_name='exam_materials' and column_name not in ('file_path','description');
    execute format('grant select (%s) on public.exam_materials to anon, authenticated', cols);
end $$;
grant all on public.exam_materials to service_role;

-- Canonical key whitelist: identical to src/lib/storage-key.ts. Never LIKE 'uid/%'.
create or replace function public.safe_storage_key(key text) returns boolean
language sql immutable strict parallel safe as $$
    select length(key) between 1 and 1024 and key = normalize(key, NFC)
      and key ~ '^[A-Za-z0-9가-힣_ .(),+\[\]/-]+$'
      and position('..' in key) = 0
      and not exists (select 1 from unnest(string_to_array(key, '/')) part
          where part = '' or part = '.' or part <> btrim(part))
      and lower(split_part(key, '/', 1)) not in
          ('exam-materials','hwpx','hwpx-originals','mock-materials','exam-previews','mock-previews','exam-free-problems','question-assets','exam-analysis','pdf-jobs','exams');
$$;
-- Member listings are now saved by /api/material-upload after upload-proof verification.
-- Existing broad permissive policies cannot re-enable direct member writes.
drop policy if exists "material_upload_path_guard" on public.exam_materials;
create policy "material_upload_path_guard" on public.exam_materials as restrictive
for insert to authenticated
with check ((auth.jwt()->>'email') = 'mathofhy@naver.com'
    and (file_path is null or file_path = '' or public.safe_storage_key(file_path)));

drop policy if exists "material_update_path_guard" on public.exam_materials;
create policy "material_update_path_guard" on public.exam_materials as restrictive
for update to authenticated
using ((auth.jwt()->>'email') = 'mathofhy@naver.com')
with check ((auth.jwt()->>'email') = 'mathofhy@naver.com'
    and (file_path is null or file_path = '' or public.safe_storage_key(file_path)));

-- 기존 view가 테이블 소유자 권한으로 저장 경로를 공개하는 우회로도 닫는다.
do $$
declare r record;
begin
    for r in select schemaname, viewname from pg_views
        where schemaname='public' and definition ilike '%exam_materials%'
          and (definition ilike '%file_path%' or definition ilike '%description%')
    loop
        execute format('revoke select on %I.%I from public, anon, authenticated', r.schemaname, r.viewname);
    end loop;
end $$;
notify pgrst, 'reload schema';
commit;

-- hwpx自体は公開画像(十万件以上)のため公開を維持する。
-- raw_uploadsの原本はStorage APIでhwpx-originalsへコピーして検証後削除する。
-- storage.objectsのbucket_idをSQLで書き換えても実体は移動しないため禁止。
-- --prune完了までは既存の/public/hwpx/raw_uploads/...URLが有効なまま。
