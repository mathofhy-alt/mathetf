
-- Folders Table: Virtual directory structure
create table if not exists folders (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  parent_id uuid references folders(id) on delete cascade,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Exam Papers Table: Saved set of questions
create table if not exists exam_papers (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  folder_id uuid references folders(id) on delete set null,
  title text not null,
  question_ids jsonb not null, -- Array of Question IDs
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS
alter table folders enable row level security;
alter table exam_papers enable row level security;

create policy "Users can manage their own folders"
  on folders for all
  using ( auth.uid() = user_id );

create policy "Users can manage their own exam papers"
  on exam_papers for all
  using ( auth.uid() = user_id );
