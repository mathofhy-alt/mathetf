-- Add is_sorted column for ingestion workflow
ALTER TABLE questions ADD COLUMN IF NOT EXISTS is_sorted BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_questions_is_sorted ON questions(is_sorted);
