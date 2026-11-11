-- Promote an existing user to admin / agricultural officer (run in the SQL Editor).
-- Replace the email, then run ONE of the two statements.
update public.profiles set role = 'admin'        where id = (select id from auth.users where email = 'you@example.com');
-- update public.profiles set role = 'agri_officer' where id = (select id from auth.users where email = 'officer@example.com');
-- Mark a seller as verified:
-- update public.profiles set verified_seller = true where id = (select id from auth.users where email = 'farmer@example.com');
