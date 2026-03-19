-- Create purchased_items table to track what users have bought
CREATE TABLE IF NOT EXISTS public.purchased_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    payment_id TEXT NULL,    -- References payment_history.payment_id
    item_type TEXT NOT NULL, -- 'MOCK_EXAM', 'HWP_DOC', 'PERSONAL_DB'
    item_id TEXT NOT NULL,
    title TEXT NOT NULL,
    price_paid INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for checking ownership
CREATE INDEX IF NOT EXISTS idx_purchased_items_user_id ON purchased_items(user_id);
CREATE INDEX IF NOT EXISTS idx_purchased_items_item ON purchased_items(item_type, item_id);

-- RLS Policies
ALTER TABLE purchased_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own purchased items"
ON purchased_items
FOR SELECT
USING (auth.uid() = user_id);

-- Only admins/service role can insert into purchased_items
CREATE POLICY "Service role can insert purchased items"
ON purchased_items
FOR INSERT
WITH CHECK (true);
