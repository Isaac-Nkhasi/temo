-- =====================================================================
-- TEMO – Phase 2: Cybersecurity
--   * RBAC matrix is now ENFORCED by the database (has_permission)
--   * Access policies (registration open, verified sellers, listing cap…)
--   * Security incident register (GDPR breach management)
--   * Richer audit log (permission / policy / moderation / incident events)
--   * GDPR rights: export my data, erase my account
--   * Admin-only RPCs used by the separate Security Portal
-- Run ONCE, after 001_schema.sql (and after you registered your admin).
-- =====================================================================

alter table public.profiles add column if not exists deleted_at timestamptz;

-- ---------------------------------------------------------------------
-- 1. Access policies (key/value, editable only by admins)
-- ---------------------------------------------------------------------
create table public.security_policies (
  key         text primary key,
  value       jsonb not null,
  description text not null,
  updated_by  uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now()
);

insert into public.security_policies (key, value, description) values
  ('registration_open',            'true',  'Allow new self-service registrations. Turn off to freeze sign-ups.'),
  ('require_verified_sellers',     'false', 'Only sellers marked "verified" by an admin may publish new listings.'),
  ('max_active_listings_per_seller','50',   'Maximum number of active listings one seller may have.'),
  ('admin_idle_timeout_minutes',   '15',    'Security portal signs administrators out after this many idle minutes.'),
  ('min_password_length',          '8',     'Minimum password length shown at sign-up (also set the same value in Supabase Auth → Providers → Email).'),
  ('require_admin_mfa',            'false', 'Administrator powers only work in a session that passed two-factor (TOTP) verification. Enrol your own factor in the portal BEFORE enabling.');

create function public.policy_bool(p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (value)::text = 'true' from public.security_policies where key = p_key), false)
$$;

create function public.policy_int(p_key text, p_default integer default 0) returns integer
language sql stable security definer set search_path = public as $$
  select coalesce((select (value)::text::integer from public.security_policies where key = p_key), p_default)
$$;

-- ---------------------------------------------------------------------
-- 2. RBAC enforcement helper (admins always pass; suspended users never)
-- ---------------------------------------------------------------------
create function public.has_permission(p_module text, p_action text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when public.is_admin() then true
    else coalesce((
      select case p_action when 'read' then rp.can_read when 'write' then rp.can_write else false end
      from public.profiles pr
      join public.role_permissions rp on rp.role = pr.role
      where pr.id = auth.uid() and pr.status = 'active' and rp.module = p_module
    ), false)
  end
$$;

-- Admin check v2: optionally requires an MFA (aal2) session.
-- Lock-out recovery: SQL Editor -> update public.security_policies set value='false' where key='require_admin_mfa';
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' and status = 'active' from public.profiles where id = auth.uid()), false)
     and (not public.policy_bool('require_admin_mfa') or coalesce(auth.jwt()->>'aal', '') = 'aal2')
$$;

-- The admin role can never be locked out of the security settings.
alter table public.role_permissions
  add constraint admin_keeps_security_access
  check (not (role = 'admin' and module = 'security_settings' and (can_read = false or can_write = false)));

-- ---------------------------------------------------------------------
-- 3. Security incident register
-- ---------------------------------------------------------------------
create table public.security_incidents (
  id                     uuid primary key default gen_random_uuid(),
  title                  text not null check (char_length(title) between 3 and 160),
  description            text not null default '',
  severity               text not null default 'low'  check (severity in ('low', 'medium', 'high', 'critical')),
  status                 text not null default 'open' check (status in ('open', 'investigating', 'contained', 'resolved')),
  personal_data_involved boolean not null default false,
  detected_at            timestamptz not null default now(),
  authority_notified_at  timestamptz,         -- GDPR Art. 33: within 72 hours when personal data is involved
  resolved_at            timestamptz,
  reported_by            uuid references public.profiles(id) on delete set null,
  created_at             timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 4. Row Level Security for the new tables (admin only)
-- ---------------------------------------------------------------------
alter table public.security_policies  enable row level security;
alter table public.security_incidents enable row level security;

create policy policies_admin_read   on public.security_policies for select to authenticated using (public.is_admin());
create policy policies_admin_update on public.security_policies for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy incidents_admin_all   on public.security_incidents for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select, update                 on public.security_policies  to authenticated;
grant select, insert, update, delete on public.security_incidents to authenticated;
grant execute on function public.has_permission(text, text), public.policy_bool(text), public.policy_int(text, integer)
  to anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. Enforce the RBAC matrix + access policies in existing RLS policies
-- ---------------------------------------------------------------------
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using      ((id = auth.uid() and public.has_permission('farmer_profiles', 'write')) or public.is_admin())
  with check ((id = auth.uid() and public.has_permission('farmer_profiles', 'write')) or public.is_admin());

drop policy if exists posts_insert on public.posts;
create policy posts_insert on public.posts for insert to authenticated
  with check (author_id = auth.uid() and public.is_active() and hidden = false and public.has_permission('community', 'write'));

drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert to authenticated
  with check (author_id = auth.uid() and public.is_active() and hidden = false and public.has_permission('community', 'write'));

drop policy if exists likes_insert on public.post_likes;
create policy likes_insert on public.post_likes for insert to authenticated
  with check (user_id = auth.uid() and public.is_active() and public.has_permission('community', 'write'));

drop policy if exists products_insert on public.products;
create policy products_insert on public.products for insert to authenticated
  with check (
    seller_id = auth.uid()
    and public.is_active()
    and public.current_user_role() in ('farmer', 'admin')
    and public.has_permission('marketplace', 'write')
    and (not public.policy_bool('require_verified_sellers')
         or public.is_admin()
         or exists (select 1 from public.profiles p where p.id = auth.uid() and p.verified_seller))
    and (select count(*) from public.products x where x.seller_id = auth.uid() and x.status = 'active')
        < public.policy_int('max_active_listings_per_seller', 50)
  );

-- Ordering now follows the matrix instead of a hardcoded role check.
create or replace function public.place_order(p_product_id uuid, p_quantity integer)
returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  seller public.profiles;
  prod public.products;
  ord public.orders;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null or me.status <> 'active' then
    raise exception 'Your account is not active.' using errcode = '42501';
  end if;
  if not public.has_permission('marketplace', 'write') then
    raise exception 'Your role is not allowed to place orders.' using errcode = '42501';
  end if;

  select * into prod from public.products where id = p_product_id;
  if not found or prod.status <> 'active' then
    raise exception 'This listing is no longer available.';
  end if;
  if prod.seller_id = me.id then
    raise exception 'You cannot order your own listing.';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > prod.stock then
    raise exception 'Requested quantity is not available (in stock: %).', prod.stock;
  end if;

  select * into seller from public.profiles where id = prod.seller_id;

  insert into public.orders (product_id, buyer_id, seller_id, product_name, unit, unit_price, quantity,
                             total_amount, buyer_name, seller_name, pickup_district)
  values (prod.id, me.id, prod.seller_id, prod.name, prod.unit, prod.price, p_quantity,
          prod.price * p_quantity, me.full_name, coalesce(seller.farm_name, seller.full_name), prod.district)
  returning * into ord;

  perform public.log_event('order.placed', 'orders', ord.id::text,
    jsonb_build_object('product_id', prod.id, 'quantity', p_quantity, 'total', ord.total_amount));
  return ord;
end $$;

-- ---------------------------------------------------------------------
-- 6. Registration gate (access policy) – replaces the sign-up trigger body
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  chosen_role public.user_role;
  chosen_district text;
begin
  if not public.policy_bool('registration_open') then
    raise exception 'Registration is currently closed.';
  end if;

  chosen_role := case when meta->>'role' = 'buyer' then 'buyer'::public.user_role else 'farmer'::public.user_role end;
  select name into chosen_district from public.districts where name = meta->>'district';

  insert into public.profiles (id, full_name, phone, district, role, farm_name, farm_type)
  values (
    new.id,
    coalesce(nullif(trim(meta->>'full_name'), ''), split_part(coalesce(new.email, 'user'), '@', 1)),
    nullif(trim(meta->>'phone'), ''),
    chosen_district,
    chosen_role,
    nullif(trim(meta->>'farm_name'), ''),
    nullif(trim(meta->>'farm_type'), '')
  );

  if meta->>'consent' = 'true' then
    insert into public.consent_records (user_id, consent_type, policy_version, granted)
    values (new.id, 'privacy_policy_and_terms', '2026-11', true);
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 7. Profile guard v2: admins cannot change their OWN role/status either
--    (prevents accidental lock-out); GDPR erasure uses a transaction-local bypass.
-- ---------------------------------------------------------------------
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('temo.bypass_guard', true), '') <> 'on' and auth.uid() is not null then
    if new.id = auth.uid() and (new.role is distinct from old.role or new.status is distinct from old.status) then
      raise exception 'You cannot change your own role or account status.' using errcode = '42501';
    end if;
    if not public.is_admin() then
      if new.role is distinct from old.role
         or new.status is distinct from old.status
         or new.verified_seller is distinct from old.verified_seller
         or new.deleted_at is distinct from old.deleted_at
         or new.id is distinct from old.id then
        raise exception 'You are not allowed to change role, status or verification.' using errcode = '42501';
      end if;
    end if;
  end if;

  if new.role is distinct from old.role then
    perform public.log_event('profile.role_changed', 'profiles', new.id::text,
      jsonb_build_object('from', old.role, 'to', new.role));
  end if;
  if new.status is distinct from old.status then
    perform public.log_event('profile.status_changed', 'profiles', new.id::text,
      jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  if new.verified_seller is distinct from old.verified_seller then
    perform public.log_event('profile.verification_changed', 'profiles', new.id::text,
      jsonb_build_object('verified', new.verified_seller));
  end if;

  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 8. Audit triggers for security-relevant changes
-- ---------------------------------------------------------------------
create function public.audit_security_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare o jsonb; n jsonb; r jsonb;
begin
  if tg_op in ('UPDATE', 'DELETE') then o := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then n := to_jsonb(new); end if;
  r := coalesce(n, o);

  if tg_table_name = 'role_permissions' then
    perform public.log_event('permission.changed', 'role_permissions', (r->>'role') || ':' || (r->>'module'),
      jsonb_build_object('op', tg_op,
        'old', case when o is not null then jsonb_build_object('read', o->'can_read', 'write', o->'can_write', 'scope', o->'scope') end,
        'new', case when n is not null then jsonb_build_object('read', n->'can_read', 'write', n->'can_write', 'scope', n->'scope') end));
  elsif tg_table_name = 'security_policies' then
    new.updated_at := now();
    new.updated_by := auth.uid();
    perform public.log_event('policy.changed', 'security_policies', new.key,
      jsonb_build_object('old', o->'value', 'new', n->'value'));
  elsif tg_table_name = 'security_incidents' then
    perform public.log_event('incident.' || lower(tg_op), 'security_incidents', r->>'id',
      jsonb_build_object('severity', r->>'severity', 'status', r->>'status'));
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger audit_role_permissions after insert or update or delete on public.role_permissions
  for each row execute function public.audit_security_change();
create trigger audit_security_policies before update on public.security_policies
  for each row execute function public.audit_security_change();
create trigger audit_security_incidents after insert or update or delete on public.security_incidents
  for each row execute function public.audit_security_change();

create function public.audit_post_moderation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.log_event(case when new.hidden then 'post.hidden' else 'post.restored' end, 'posts', new.id::text,
    jsonb_build_object('author_id', new.author_id));
  return new;
end $$;
create trigger audit_post_moderation after update of hidden on public.posts
  for each row when (old.hidden is distinct from new.hidden)
  execute function public.audit_post_moderation();

-- ---------------------------------------------------------------------
-- 9. Admin-only RPCs for the Security Portal
-- ---------------------------------------------------------------------
create function public.admin_list_users()
returns table (id uuid, email text, full_name text, phone text, district text, role public.user_role,
               status public.account_status, verified_seller boolean, farm_name text,
               created_at timestamptz, last_sign_in_at timestamptz, deleted_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Administrators only.' using errcode = '42501'; end if;
  return query
    select p.id, u.email::text, p.full_name, p.phone, p.district, p.role, p.status, p.verified_seller,
           p.farm_name, p.created_at, u.last_sign_in_at, p.deleted_at
    from public.profiles p join auth.users u on u.id = p.id
    order by p.created_at desc;
end $$;

create function public.admin_update_user(p_user uuid, p_role public.user_role, p_status public.account_status, p_verified boolean)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare result public.profiles;
begin
  if not public.is_admin() then raise exception 'Administrators only.' using errcode = '42501'; end if;
  update public.profiles set role = p_role, status = p_status, verified_seller = p_verified
   where id = p_user and deleted_at is null
   returning * into result;
  if not found then raise exception 'User not found or already erased.'; end if;
  return result;
end $$;

create function public.admin_dashboard() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Administrators only.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'users_total',      (select count(*) from public.profiles where deleted_at is null),
    'users_by_role',    coalesce((select jsonb_object_agg(role, n) from (select role, count(*) n from public.profiles where deleted_at is null group by role) r), '{}'::jsonb),
    'users_suspended',  (select count(*) from public.profiles where status = 'suspended' and deleted_at is null),
    'new_users_7d',     (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'unverified_sellers',(select count(*) from public.profiles where role = 'farmer' and not verified_seller and deleted_at is null),
    'listings_active',  (select count(*) from public.products where status = 'active'),
    'orders_total',     (select count(*) from public.orders),
    'orders_pending',   (select count(*) from public.orders where status = 'pending'),
    'posts_total',      (select count(*) from public.posts where not hidden),
    'posts_hidden',     (select count(*) from public.posts where hidden),
    'audit_24h',        (select count(*) from public.audit_logs where created_at > now() - interval '24 hours'),
    'permission_changes_7d', (select count(*) from public.audit_logs where action = 'permission.changed' and created_at > now() - interval '7 days'),
    'open_incidents',   (select count(*) from public.security_incidents where status <> 'resolved'),
    'consents_recorded',(select count(*) from public.consent_records where granted),
    'gdpr_exports_30d', (select count(*) from public.audit_logs where action = 'gdpr.export' and created_at > now() - interval '30 days'),
    'gdpr_erasures_30d',(select count(*) from public.audit_logs where action = 'gdpr.erasure' and created_at > now() - interval '30 days')
  );
end $$;

create function public.portal_log(p_action text, p_metadata jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Administrators only.' using errcode = '42501'; end if;
  perform public.log_event('portal.' || left(p_action, 60), 'security_portal', null, p_metadata);
end $$;

-- Moderation helper (hide / restore a post)
create function public.admin_set_post_hidden(p_post uuid, p_hidden boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Administrators only.' using errcode = '42501'; end if;
  update public.posts set hidden = p_hidden where id = p_post;
end $$;

create function public.admin_list_posts(p_limit integer default 100)
returns table (id uuid, author_name text, body text, tag text, hidden boolean, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Administrators only.' using errcode = '42501'; end if;
  return query
    select po.id, pr.full_name, po.body, po.tag, po.hidden, po.created_at
    from public.posts po join public.profiles pr on pr.id = po.author_id
    order by po.created_at desc limit greatest(1, least(p_limit, 500));
end $$;

grant execute on function public.admin_list_users(), public.admin_dashboard(), public.admin_list_posts(integer),
  public.admin_set_post_hidden(uuid, boolean), public.portal_log(text, jsonb),
  public.admin_update_user(uuid, public.user_role, public.account_status, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 10. GDPR data-subject rights
-- ---------------------------------------------------------------------
create function public.export_my_data() returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); result jsonb;
begin
  if uid is null then raise exception 'Not signed in.' using errcode = '42501'; end if;
  result := jsonb_build_object(
    'exported_at', now(),
    'account',  (select jsonb_build_object('id', u.id, 'email', u.email, 'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at)
                 from auth.users u where u.id = uid),
    'profile',  (select to_jsonb(p) from public.profiles p where p.id = uid),
    'consents', coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at) from public.consent_records c where c.user_id = uid), '[]'::jsonb),
    'listings', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.products x where x.seller_id = uid), '[]'::jsonb),
    'posts',    coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.posts x where x.author_id = uid), '[]'::jsonb),
    'comments', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.comments x where x.author_id = uid), '[]'::jsonb),
    'saved_products', coalesce((select jsonb_agg(to_jsonb(x)) from public.product_saves x where x.user_id = uid), '[]'::jsonb),
    'orders',   coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.orders x where x.buyer_id = uid or x.seller_id = uid), '[]'::jsonb),
    'blockchain_records', coalesce((select jsonb_agg(to_jsonb(b)) from public.blockchain_records b
                           join public.orders o on o.id = b.order_id where o.buyer_id = uid or o.seller_id = uid), '[]'::jsonb)
  );
  perform public.log_event('gdpr.export', 'profiles', uid::text, '{}'::jsonb);
  return result;
end $$;

create function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); me public.profiles;
begin
  if uid is null then raise exception 'Not signed in.' using errcode = '42501'; end if;
  select * into me from public.profiles where id = uid;
  if me.id is null or me.deleted_at is not null then raise exception 'Account not found.'; end if;
  if me.role = 'admin' then
    raise exception 'Administrator accounts must be removed by another administrator.' using errcode = '42501';
  end if;
  if exists (select 1 from public.orders o
             where (o.buyer_id = uid or o.seller_id = uid) and o.status in ('pending', 'accepted', 'processing')) then
    raise exception 'You still have open orders. Complete or cancel them before deleting your account.';
  end if;

  -- 1. Remove user-generated personal content
  delete from public.post_likes    where user_id = uid;
  delete from public.product_saves where user_id = uid;
  delete from public.comments      where author_id = uid;
  delete from public.posts         where author_id = uid;
  delete from public.products      where seller_id = uid;

  -- 2. Anonymise what must be kept for accounting/traceability (orders, consent evidence)
  update public.orders set buyer_name  = 'Deleted user' where buyer_id  = uid;
  update public.orders set seller_name = 'Deleted user' where seller_id = uid;

  perform set_config('temo.bypass_guard', 'on', true);
  update public.profiles
     set full_name = 'Deleted user', phone = null, district = null, farm_name = null, farm_type = null,
         farm_description = null, verified_seller = false, status = 'suspended', deleted_at = now()
   where id = uid;
  perform set_config('temo.bypass_guard', 'off', true);

  -- 3. Disable and scrub the login
  delete from auth.sessions   where user_id = uid;
  delete from auth.identities where user_id = uid;
  update auth.users
     set email = 'deleted-' || uid::text || '@deleted.invalid', phone = null,
         encrypted_password = '', raw_user_meta_data = '{}'::jsonb, banned_until = '2999-12-31'
   where id = uid;

  perform public.log_event('gdpr.erasure', 'profiles', uid::text, '{}'::jsonb);
end $$;

grant execute on function public.export_my_data(), public.delete_my_account() to authenticated;
