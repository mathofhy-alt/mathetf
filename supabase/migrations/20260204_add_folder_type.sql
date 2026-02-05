-- Migration to add folder_type column
-- First, identifying the table name. Based on standard Supabase patterns used here.
-- Defaulting existing folders to 'exam' type to preserve current structure for Saved Exams.

ALTER TABLE folders 
ADD COLUMN IF NOT EXISTS folder_type TEXT DEFAULT 'exam';

-- Add check constraint to ensure validity
ALTER TABLE folders 
ADD CONSTRAINT check_folder_type CHECK (folder_type IN ('db', 'exam', 'all'));
