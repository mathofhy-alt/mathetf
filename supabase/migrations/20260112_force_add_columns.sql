-- Migration: Force Add Metadata Columns
-- Description: Ensures all metadata columns exist even if the table was already created.

ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS region text;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS district text;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS school text;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS grade text;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS year text;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS semester text;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS unit text;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS difficulty text;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS subject text;

-- Update Index
DROP INDEX IF EXISTS idx_questions_meta;
CREATE INDEX idx_questions_meta ON public.questions (region, district, school, grade, subject);

-- Force Cache Reload (Put this in the script too if running via SQL Editor)
NOTIFY pgrst, 'reload schema';
