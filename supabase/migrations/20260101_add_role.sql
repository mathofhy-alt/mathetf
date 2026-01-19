-- Add Role Column
ALTER TABLE profiles 
ADD COLUMN role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin'));

-- Grant access to admin page logic (policy example if using RLS, but here we enforce in app)
-- For now just the schema change.

-- Example to make a user admin (Run this manually in Supabase SQL Editor with your email)
-- UPDATE profiles SET role = 'admin' WHERE id = 'YOUR_USER_ID_HERE';
-- OR
-- UPDATE profiles SET role = 'admin' WHERE email = 'YOUR_EMAIL_HERE'; (if email column exists in profiles)
