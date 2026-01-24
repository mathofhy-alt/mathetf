-- [REQUIRED] Run this in Supabase Dashboard -> SQL Editor

-- Add missing columns to questions table for math and file management
ALTER TABLE public.questions 
ADD COLUMN IF NOT EXISTS equation_scripts text[],
ADD COLUMN IF NOT EXISTS file_id uuid,
ADD COLUMN IF NOT EXISTS question_index integer;

-- Add index for search optimization
CREATE INDEX IF NOT EXISTS idx_questions_file_id ON public.questions(file_id);

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
