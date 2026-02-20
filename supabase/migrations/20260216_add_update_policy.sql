-- Migration: Add Update Policy for Questions Table
-- Date: 2026-02-16
-- Description: Enables UPDATE operations for all users (or authenticated users) on the questions table.

DO $$ 
BEGIN
    -- Drop the catch-all policy if it exists and replace with more specific ones if needed, 
    -- or just add the missing UPDATE policy.
    -- Based on turn 5304, the existing policies are for SELECT and INSERT.
    
    IF NOT EXISTS (
        select 1 from pg_policies 
        where tablename = 'questions' 
        and policyname = 'Enable update for all users'
    ) THEN
        create policy "Enable update for all users" on public.questions
        for update using (true) with check (true);
        RAISE NOTICE 'Added UPDATE policy for questions table.';
    ELSE
        RAISE NOTICE 'UPDATE policy already exists.';
    END IF;
END $$;
