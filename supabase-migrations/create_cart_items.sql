-- Create cart_items table for the shopping cart system
CREATE TABLE IF NOT EXISTS public.cart_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL, -- e.g., 'MOCK_EXAM', 'HWP_DOC', 'PERSONAL_DB'
    item_id TEXT NOT NULL,   -- ID of the actual product
    title TEXT NOT NULL,     -- Snapshot of the product title
    price INTEGER NOT NULL,  -- Snapshot of the price at the time of adding
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_cart_items_user_id ON cart_items(user_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_created_at ON cart_items(created_at);

-- Set up Row Level Security (RLS)
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;

-- Create ALL policy for users to manage only their own cart items
CREATE POLICY "Users can manage their own cart items"
ON cart_items
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
