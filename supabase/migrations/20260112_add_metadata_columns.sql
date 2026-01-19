-- Migration: Add Metadata Columns for Question DB
-- Date: 2026-01-12
-- Description: Adds region, district, grade, unit, etc. to questions table.

-- Add new columns if they do not exist
ALTER TABLE questions ADD COLUMN IF NOT EXISTS region text;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS district text;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS school text;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS grade text;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS year text;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS semester text;
-- 'unit' and 'difficulty' and 'subject' usually exist, but ensure them just in case
ALTER TABLE questions ADD COLUMN IF NOT EXISTS unit text;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS difficulty text;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS subject text;

-- Create an index for faster filtering in the future DB Download page
CREATE INDEX IF NOT EXISTS idx_questions_meta ON questions (region, district, school, grade, subject);
