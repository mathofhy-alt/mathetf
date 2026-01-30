-- Folders Table
CREATE TABLE IF NOT EXISTS folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for folders
CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders(user_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id);

-- User Items Table within Folders
CREATE TABLE IF NOT EXISTS user_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    folder_id UUID REFERENCES folders(id) ON DELETE CASCADE, -- Nullable for Root items
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- Denormalized for RLS
    type TEXT NOT NULL CHECK (type IN ('personal_db', 'saved_exam')),
    reference_id UUID NOT NULL, -- FK to exam_materials or saved_exams (polymorphic-ish)
    name TEXT, -- Optional override name
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(folder_id, type, reference_id) -- Prevent duplicate links in same folder
);

-- Indexes for user_items
CREATE INDEX IF NOT EXISTS idx_user_items_folder_id ON user_items(folder_id);
CREATE INDEX IF NOT EXISTS idx_user_items_user_id ON user_items(user_id);

-- RLS Policies
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own folders" 
    ON folders FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own folders" 
    ON folders FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own folders" 
    ON folders FOR UPDATE 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own folders" 
    ON folders FOR DELETE 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own items" 
    ON user_items FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own items" 
    ON user_items FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own items" 
    ON user_items FOR UPDATE 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own items" 
    ON user_items FOR DELETE 
    USING (auth.uid() = user_id);
