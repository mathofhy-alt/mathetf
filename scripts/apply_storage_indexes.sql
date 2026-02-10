-- [V67] Storage Performance Optimization Indexes
-- Run these in your Supabase SQL Editor to maximize loading speed.

-- 1. Optimized Index for user_items
-- Speeds up filtering by user, folder, and item type (saved_exam vs personal_db)
CREATE INDEX IF NOT EXISTS idx_user_items_composite 
ON public.user_items (user_id, folder_id, type);

-- 2. Optimized Index for folders
-- Speeds up tree navigation and hierarchical queries
CREATE INDEX IF NOT EXISTS idx_folders_composite 
ON public.folders (user_id, parent_id, folder_type);

-- 3. Additional Index for sorting
CREATE INDEX IF NOT EXISTS idx_user_items_created_at
ON public.user_items (created_at DESC);

-- Analyze to update statistics
ANALYZE public.user_items;
ANALYZE public.folders;
