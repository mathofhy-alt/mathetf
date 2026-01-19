-- 1. Create the table for exam materials
create table exam_materials (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  
  -- Metadata
  title text not null,
  description text,
  
  -- Dimensions
  region text not null,
  district text not null,
  school text not null,
  grade integer not null,
  exam_year integer not null default 2024, -- Added year
  semester integer not null, -- 1 or 2
  exam_type text not null, -- '중간고사', '기말고사'
  subject text not null, -- '공통수학1', '대수', etc.
  
  -- File Info
  file_type text not null, -- 'PDF' or 'HWP'
  content_type text not null, -- '문제' or '문제+해설'
  file_path text not null, -- Storage path
  price integer not null,
  
  -- Uploader
  uploader_id uuid default auth.uid() references auth.users(id),
  uploader_name text, -- Optional display name
  
  -- Metrics
  sales_count integer default 0
);

-- 2. Create Storage Bucket (Private)
insert into storage.buckets (id, name, public) 
values ('exam-materials', 'exam-materials', false);

-- 3. Set up Storage Policies
-- Allow authenticated users to download (via Signed URL)
create policy "Authenticated users can select"
  on storage.objects for select
  using ( bucket_id = 'exam-materials' and auth.role() = 'authenticated' );

-- Allow authenticated users to upload
create policy "Authenticated users can upload"
  on storage.objects for insert
  with check ( bucket_id = 'exam-materials' and auth.role() = 'authenticated' );

-- 4. Set up Table Policies (Row Level Security)
alter table exam_materials enable row level security;

-- Everyone can read stats (title, price, school, etc)
create policy "Enable read access for all users"
  on exam_materials for select
  using ( true );

-- Authenticated users can insert their own uploads
create policy "Enable insert for authenticated users only"
  on exam_materials for insert
  with check ( auth.uid() = uploader_id );


-- =========================================================================
-- NEW: Profiles & Points System
-- =========================================================================

-- 5. Profiles table (Points)
create table profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  points integer default 0 not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table profiles enable row level security;

create policy "Users can view own profile" 
  on profiles for select 
  using ( auth.uid() = id );

-- Trigger to create profile on signup
create or replace function public.handle_new_user() 
returns trigger as $$
begin
  insert into public.profiles (id, points)
  values (new.id, 0); -- 0 Points on signup
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- 6. Purchases table (History)
create table purchases (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) not null,
  exam_id uuid references exam_materials(id) not null,
  seller_id uuid references profiles(id), -- For easier commission tracking
  price integer not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  download_count integer default 0
);
alter table purchases enable row level security;

create policy "Users can view own purchases" 
  on purchases for select 
  using ( auth.uid() = user_id );

-- 7. Purchase Transaction Function (The Core Logic)
-- Call this via Supabase RPC: supabase.rpc('purchase_exam', { p_exam_id: '...', p_seller_id: '...', p_price: ... })
create or replace function purchase_exam(
  p_exam_id uuid,
  p_seller_id uuid,
  p_price integer
) returns json
language plpgsql
security definer
as $$
declare
  buyer_points integer;
  upload_commission integer;
begin
  -- 1. Check buyer points
  select points into buyer_points from profiles where id = auth.uid();
  if buyer_points < p_price then
    return json_build_object('success', false, 'message', '포인트가 부족합니다.');
  end if;

  -- 2. Deduct from buyer
  update profiles 
  set points = points - p_price, updated_at = now() 
  where id = auth.uid();

  -- 3. Add commission to seller (10%)
  if p_seller_id is not null and p_seller_id != auth.uid() then
    upload_commission := floor(p_price * 0.1);
    update profiles
    set points = points + upload_commission, updated_at = now()
    where id = p_seller_id;
  end if;

  -- 4. Record purchase
  insert into purchases (user_id, exam_id, seller_id, price)
  values (auth.uid(), p_exam_id, p_seller_id, p_price);

  -- 5. Update sales count
  update exam_materials
  set sales_count = sales_count + 1
  where id = p_exam_id;

  return json_build_object('success', true, 'message', '구매 완료');
exception when others then
  return json_build_object('success', false, 'message', SQLERRM);
end;
$$;

-- 8. Payment History (PortOne)
create table payment_history (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) not null,
  payment_id text, -- PortOne PaymentId or imp_uid
  merchant_uid text not null, -- Order ID
  amount integer not null,
  points_added integer not null,
  status text not null, -- 'PAID', 'FAILED'
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table payment_history enable row level security;

create policy "Users can view own payments" 
  on payment_history for select 
  using ( auth.uid() = user_id );
