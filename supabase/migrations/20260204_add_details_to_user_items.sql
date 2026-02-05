-- Add 'details' column to 'user_items' table to store exam metadata (question_count, difficulty, etc.)
ALTER TABLE user_items 
ADD COLUMN IF NOT EXISTS details JSONB;

-- Optional: Create GIN index for faster querying of details
CREATE INDEX IF NOT EXISTS idx_user_items_details ON user_items USING gin (details);
