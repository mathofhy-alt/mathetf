-- [REQUIRED] Run this in Supabase Dashboard -> SQL Editor

-- 1. Create 'hwpx' Storage Bucket
insert into storage.buckets (id, name, public, file_size_limit)
values ('hwpx', 'hwpx', true, 52428800) -- 50MB Limit
on conflict (id) do nothing;

-- 2. Enable Public Access (Downloads)
drop policy if exists "Public Select hwpx" on storage.objects;
create policy "Public Select hwpx"
on storage.objects for select
using ( bucket_id = 'hwpx' );

-- 3. Enable Uploads (Auth + Service Role)
drop policy if exists "Insert hwpx" on storage.objects;
create policy "Insert hwpx"
on storage.objects for insert
with check ( bucket_id = 'hwpx' );

-- 4. Enable Updates
drop policy if exists "Update hwpx" on storage.objects;
create policy "Update hwpx"
on storage.objects for update
using ( bucket_id = 'hwpx' );
