-- Create phone_verifications table
CREATE TABLE IF NOT EXISTS public.phone_verifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    phone_number TEXT NOT NULL UNIQUE,
    otp_code TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.phone_verifications ENABLE ROW LEVEL SECURITY;

-- Allow service role to do everything
CREATE POLICY "Service role can manage verifications"
    ON public.phone_verifications
    FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

-- (Optional) If we want anonymous users to be able to upsert their own verifications before signup,
-- it's safer to just handle this entirely SERVER-SIDE via service_role key to prevent abuse.
-- Therefore, NO policies for public/anon users on this table. Only the secure Edge Functions/API routes will access it.
