-- DANGER: wipes everything in the public schema (tables, views, functions, data).
-- Only use on a development project when you want to re-run 001_schema.sql from scratch.
-- Does not delete auth users or storage files (delete the 'product-images' policies/bucket manually if re-running).
drop policy if exists "product images public read" on storage.objects;
drop policy if exists "product images own upload" on storage.objects;
drop policy if exists "product images own update" on storage.objects;
drop policy if exists "product images own delete" on storage.objects;

drop trigger if exists on_auth_user_created on auth.users;
drop schema public cascade;
create schema public;
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, service_role;
alter default privileges in schema public grant all on tables to postgres, service_role;
alter default privileges in schema public grant all on functions to postgres, service_role;
alter default privileges in schema public grant all on sequences to postgres, service_role;
