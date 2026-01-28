-- Add is_sorted column to questions table
ALTER TABLE questions 
ADD COLUMN IF NOT EXISTS is_sorted BOOLEAN DEFAULT FALSE;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_questions_is_sorted ON questions(is_sorted);

-- Comment
COMMENT ON COLUMN questions.is_sorted IS 'Status indicating if the question has been sorted/reviewed';
