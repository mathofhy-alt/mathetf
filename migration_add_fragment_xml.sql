-- [REQUIRED] Run this in Supabase Dashboard -> SQL Editor

-- Add `fragment_xml` and `fragment_len` columns to questions table
ALTER TABLE public.questions
ADD COLUMN IF NOT EXISTS fragment_xml TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS fragment_len INT NOT NULL DEFAULT 0;

-- Optional: Index on fragment_len to find empty ones easily
CREATE INDEX IF NOT EXISTS idx_questions_fragment_len ON public.questions(fragment_len);
