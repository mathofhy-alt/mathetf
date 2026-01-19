-- Remove Outdated Constraints
-- The previous schema likely enforced 'High/Mid/Low' or specific Unit names.
-- Since we updated to '1-10' scale and free-text Units, these constraints must be removed.

ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_difficulty_check;
ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_unit_check;
ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_grade_check;

-- Reload Schema Cache just in case
NOTIFY pgrst, 'reload schema';
