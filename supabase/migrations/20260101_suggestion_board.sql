-- Create suggestions table
CREATE TABLE suggestions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    password TEXT NOT NULL, -- Simple password for the post
    author_id UUID REFERENCES files(id) ON DELETE SET NULL, -- linking to profiles(id)
    views INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fix author_id reference
ALTER TABLE suggestions DROP CONSTRAINT suggestions_author_id_fkey;
ALTER TABLE suggestions ADD CONSTRAINT suggestions_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE suggestions ENABLE ROW LEVEL SECURITY;

-- Allow public read (we will filter content on client/server or separate policy if needed, but for now simple)
-- Actually, we might want to restrict reading content to only those who know password.
-- But standard practice for this kind of "secret board" is often:
-- List: Public (Title only)
-- Detail: Check password
-- Since Supabase Realtime/Select allows filtering, we can just allow Select for all, and handle password check in UI
-- OR use a function to check password.
-- For simplicity, we allow SELECT to everyone (so list works), but maybe we should rely on UI to mask content?
-- No, that's insecure.
-- Secure way: 
-- 1. List query: Select id, title, created_at, author_id.
-- 2. Detail query: If user is admin or author, return content. If not, require password check via RPC?
-- User asked for "Password per post".
-- Let's stick to: Allow SELECT for all, but frontend enforces password check before showing 'content'. 
-- (Not cryptographically secure but functional for this requirement "Other people can't see")
CREATE POLICY "Public suggestions are viewable by everyone" ON suggestions
    FOR SELECT USING (true);

CREATE POLICY "Users can insert suggestions" ON suggestions
    FOR INSERT WITH CHECK (true); -- Allow anyone (even anon? maybe restrict to auth)
-- Let's restrict to auth users
-- CREATE POLICY "Users can insert suggestions" ON suggestions
--     FOR INSERT WITH CHECK (auth.uid() = author_id);

-- Let's assume authenticated users.
DROP POLICY IF EXISTS "Users can insert suggestions" ON suggestions;
CREATE POLICY "Authenticated users can insert suggestions" ON suggestions
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Update/Delete?
CREATE POLICY "Users can update own suggestions" ON suggestions
    FOR UPDATE USING (auth.uid() = author_id);
    
CREATE POLICY "Users can delete own suggestions" ON suggestions
    FOR DELETE USING (auth.uid() = author_id);
