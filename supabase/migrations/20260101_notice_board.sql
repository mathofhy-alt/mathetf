-- Create notices table
CREATE TABLE notices (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    author_id UUID REFERENCES files(id) ON DELETE SET NULL, -- specific to auth.users usually, but here profiles(id)
    views INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fix author_id reference to auth.users or profiles
-- Assuming profiles table exists and is linked to auth.users
ALTER TABLE notices DROP CONSTRAINT notices_author_id_fkey;
ALTER TABLE notices ADD CONSTRAINT notices_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- Add RLS policies (optional but recommended)
ALTER TABLE notices ENABLE ROW LEVEL SECURITY;

-- Allow read access to everyone
CREATE POLICY "Public notices are viewable by everyone" ON notices
    FOR SELECT USING (true);

-- Allow write access only to admins (for now, let's allow all authenticated users to write for simplicity as requested "I can post")
-- Or better, checked against specific email or admin flag. User said "Make it so I can read my posts", implies writing.
-- Let's allow authenticated users to insert.
CREATE POLICY "Users can create notices" ON notices
    FOR INSERT WITH CHECK (auth.uid() = author_id);

-- Allow update/delete own notices
CREATE POLICY "Users can update own notices" ON notices
    FOR UPDATE USING (auth.uid() = author_id);

CREATE POLICY "Users can delete own notices" ON notices
    FOR DELETE USING (auth.uid() = author_id);
