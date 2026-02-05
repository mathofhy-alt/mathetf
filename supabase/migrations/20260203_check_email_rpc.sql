-- Create a secure function to check if an email exists
-- This function accesses auth.users (which is restricted) but only returns a boolean
-- It uses SECURITY DEFINER to run with the privileges of the creator (postgres/admin)

create or replace function check_email_exists(email_input text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return exists (
    select 1
    from auth.users
    where email = email_input
  );
end;
$$;

-- Grant execute permission to public (anon and authenticated users)
grant execute on function check_email_exists(text) to public;
