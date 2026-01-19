
-- Questions Table: Stores individual question fragments
create table if not exists questions (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  
  -- Metadata
  subject text, -- e.g., 'Mathematics'
  unit text,    -- e.g., 'Polynomials'
  difficulty text check (difficulty in ('Easy', 'Medium', 'Hard', 'Killer')),
  source_db_id text, -- e.g., 'KyunggiHigh_2025_1_Mid'
  question_number int, -- Original number in the file
  
  -- Content
  content_xml text not null, -- The core OWPML XML fragment for the question body
  plain_text text, -- Stripped text for full-text search
  
  -- Assets
  images jsonb default '[]'::jsonb -- List of image paths derived from the HWPX
);

-- Explanations Table: Stores endnotes/explanations linked to questions
create table if not exists explanations (
  id uuid default gen_random_uuid() primary key,
  question_id uuid references questions(id) on delete cascade,
  content_xml text not null,
  original_endnote_id int -- To help with remapping later
);

-- Enable Row Level Security (RLS)
alter table questions enable row level security;
alter table explanations enable row level security;

-- Policies (Simple for now: Public Read, Authenticated Insert/Update)
create policy "Public questions are viewable by everyone"
  on questions for select
  using ( true );

create policy "Users can insert their own questions (Admin logic later)"
  on questions for insert
  with check ( true ); 
