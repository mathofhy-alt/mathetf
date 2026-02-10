-- 1. Create payment_history table
CREATE TABLE IF NOT EXISTS public.payment_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    payment_id TEXT NOT NULL, -- PortOne payment_id
    merchant_uid TEXT, -- Order ID
    amount INTEGER NOT NULL,
    points_added INTEGER NOT NULL,
    status TEXT DEFAULT 'PAID', -- PAID, CANCELLED, FAILED
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Add RLS (Row Level Security)
ALTER TABLE public.payment_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own payment history"
    ON public.payment_history FOR SELECT
    USING (auth.uid() = user_id);

-- 3. Point Update Trigger (Optional but safer)
-- We'll handle point updates in the API for now, but ensure column exists.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'purchased_points') THEN
        ALTER TABLE public.profiles ADD COLUMN purchased_points INTEGER DEFAULT 0;
    END IF;
END $$;

-- 4. Atomic Point Update Function
CREATE OR REPLACE FUNCTION public.increment_points(target_user_id UUID, amount INTEGER)
RETURNS VOID AS $$
BEGIN
    UPDATE public.profiles
    SET purchased_points = COALESCE(purchased_points, 0) + amount,
        updated_at = now()
    WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
