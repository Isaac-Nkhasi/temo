-- =====================================================================
-- TEMO – Lesotho Farmer Community App
-- Phase 1: database schema, RBAC, Row Level Security, order workflow
-- Run ONCE on a fresh Supabase project (SQL Editor -> New query -> Run).
-- If you need to start over, run supabase/000_reset.sql first.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Types
-- ---------------------------------------------------------------------
create type public.user_role       as enum ('farmer', 'buyer', 'agri_officer', 'admin');
create type public.account_status  as enum ('active', 'suspended', 'pending_verification');
create type public.product_category as enum ('Produce', 'Livestock', 'Seeds', 'Equipment');
create type public.product_status  as enum ('active', 'sold_out', 'removed');
create type public.order_status    as enum ('pending', 'accepted', 'processing', 'completed', 'cancelled', 'rejected');

-- ---------------------------------------------------------------------
-- 2. Reference data: Lesotho districts (coordinates used for weather)
-- ---------------------------------------------------------------------
create table public.districts (
  name      text primary key,
  latitude  numeric(8,5) not null,
  longitude numeric(8,5) not null
);

insert into public.districts (name, latitude, longitude) values
  ('Maseru',        -29.31000, 27.48000),
  ('Berea',         -29.20000, 27.90000),
  ('Leribe',        -28.87000, 28.05000),
  ('Butha-Buthe',   -28.77000, 28.25000),
  ('Mokhotlong',    -29.29000, 29.07000),
  ('Thaba-Tseka',   -29.52000, 28.61000),
  ('Qacha''s Nek',  -30.11000, 28.69000),
  ('Quthing',       -30.40000, 27.70000),
  ('Mohale''s Hoek',-30.15000, 27.47000),
  ('Mafeteng',      -29.82000, 27.24000);

-- ---------------------------------------------------------------------
-- 3. Profiles (one per auth user)
-- ---------------------------------------------------------------------
create table public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  full_name        text not null,
  phone            text,
  district         text references public.districts(name),
  role             public.user_role not null default 'farmer',
  status           public.account_status not null default 'active',
  verified_seller  boolean not null default false,
  farm_name        text,
  farm_type        text,
  farm_description text,
  language         text not null default 'en',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 4. Helper functions used by RLS policies
--    SECURITY DEFINER so they can read profiles without recursing into RLS.
-- ---------------------------------------------------------------------
create function public.current_user_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' and status = 'active' from public.profiles where id = auth.uid()), false)
$$;

create function public.is_active() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select status = 'active' from public.profiles where id = auth.uid()), false)
$$;

-- ---------------------------------------------------------------------
-- 5. Audit log (written only by trusted functions, readable by admins)
-- ---------------------------------------------------------------------
create table public.audit_logs (
  id         bigint generated always as identity primary key,
  actor_id   uuid,
  action     text not null,
  entity     text,
  entity_id  text,
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

create function public.log_event(p_action text, p_entity text, p_entity_id text, p_metadata jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
  values (auth.uid(), p_action, p_entity, p_entity_id, coalesce(p_metadata, '{}'::jsonb));
$$;
-- Internal only: clients must not be able to forge audit entries.
revoke all on function public.log_event(text, text, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Sign-up trigger: create the profile + consent record.
--    Self-service sign-up can ONLY ever create a farmer or a buyer.
--    Officers/admins are promoted by an administrator.
-- ---------------------------------------------------------------------
create table public.consent_records (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  consent_type   text not null,
  policy_version text not null,
  granted        boolean not null,
  created_at     timestamptz not null default now()
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  chosen_role public.user_role;
  chosen_district text;
begin
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 7. Profile guard: users cannot promote themselves or verify themselves.
--    (SQL Editor / service role have auth.uid() = null and are allowed.)
-- ---------------------------------------------------------------------
create function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role
       or new.status is distinct from old.status
       or new.verified_seller is distinct from old.verified_seller
       or new.id is distinct from old.id then
      raise exception 'You are not allowed to change role, status or verification.' using errcode = '42501';
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

create trigger guard_profile_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------------------------------------------------------------------
-- 8. RBAC permission matrix (managed from the security portal in Phase 3)
-- ---------------------------------------------------------------------
create table public.role_permissions (
  role      public.user_role not null,
  module    text not null,
  can_read  boolean not null default false,
  can_write boolean not null default false,
  scope     text not null default 'none' check (scope in ('none', 'own', 'limited', 'all')),
  primary key (role, module)
);

insert into public.role_permissions (role, module, can_read, can_write, scope) values
  ('farmer','home',true,false,'all'),('buyer','home',true,false,'all'),('agri_officer','home',true,false,'all'),('admin','home',true,true,'all'),
  ('farmer','community',true,true,'all'),('buyer','community',true,true,'all'),('agri_officer','community',true,true,'all'),('admin','community',true,true,'all'),
  ('farmer','marketplace',true,true,'own'),('buyer','marketplace',true,true,'own'),('agri_officer','marketplace',true,false,'all'),('admin','marketplace',true,true,'all'),
  ('farmer','insights',true,false,'all'),('buyer','insights',true,false,'all'),('agri_officer','insights',true,true,'all'),('admin','insights',true,true,'all'),
  ('farmer','farmer_profiles',true,true,'own'),('buyer','farmer_profiles',true,true,'own'),('agri_officer','farmer_profiles',true,false,'limited'),('admin','farmer_profiles',true,true,'all'),
  ('farmer','blockchain_records',true,false,'own'),('buyer','blockchain_records',true,false,'own'),('agri_officer','blockchain_records',true,false,'all'),('admin','blockchain_records',true,true,'all'),
  ('farmer','security_settings',false,false,'none'),('buyer','security_settings',false,false,'none'),('agri_officer','security_settings',false,false,'none'),('admin','security_settings',true,true,'all');

-- ---------------------------------------------------------------------
-- 9. Marketplace
-- ---------------------------------------------------------------------
create table public.products (
  id          uuid primary key default gen_random_uuid(),
  seller_id   uuid not null references public.profiles(id) on delete cascade,
  name        text not null check (char_length(name) between 2 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  category    public.product_category not null default 'Produce',
  price       numeric(12,2) not null check (price >= 0),
  unit        text not null default '',               -- e.g. '20 kg', '50 kg', 'head'
  stock       integer not null check (stock >= 0),
  district    text references public.districts(name),
  image_url   text,
  status      public.product_status not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index products_status_idx on public.products (status, created_at desc);
create index products_seller_idx on public.products (seller_id);

create table public.product_saves (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table public.orders (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid references public.products(id) on delete set null,
  buyer_id       uuid not null references public.profiles(id),
  seller_id      uuid not null references public.profiles(id),
  -- snapshots so the order (and its future blockchain hash) never changes
  product_name   text not null,
  unit           text not null default '',
  unit_price     numeric(12,2) not null,
  quantity       integer not null check (quantity > 0),
  total_amount   numeric(12,2) not null,
  buyer_name     text not null,
  seller_name    text not null,
  pickup_district text,
  status         public.order_status not null default 'pending',
  accepted_at    timestamptz,
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index orders_buyer_idx  on public.orders (buyer_id, created_at desc);
create index orders_seller_idx on public.orders (seller_id, created_at desc);

-- Filled by the blockchain service in Phase 4 (service role only).
create table public.blockchain_records (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null unique references public.orders(id) on delete cascade,
  data_hash        text not null,                -- keccak256/sha256 of the order snapshot
  tx_hash          text,
  contract_address text,
  chain_id         integer,
  block_number     bigint,
  chain_record_id  bigint,
  status           text not null default 'pending' check (status in ('pending', 'confirmed', 'failed')),
  error            text,
  created_at       timestamptz not null default now(),
  confirmed_at     timestamptz
);

-- ---------------------------------------------------------------------
-- 10. Community
-- ---------------------------------------------------------------------
create table public.posts (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references public.profiles(id) on delete cascade,
  tag        text not null default 'Question' check (tag in ('Crops', 'Livestock', 'Weather', 'Question')),
  body       text not null check (char_length(body) between 1 and 2000),
  image_url  text,
  hidden     boolean not null default false,      -- moderation
  created_at timestamptz not null default now()
);
create index posts_created_idx on public.posts (created_at desc);

create table public.post_likes (
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 1000),
  hidden     boolean not null default false,
  created_at timestamptz not null default now()
);
create index comments_post_idx on public.comments (post_id, created_at);

-- ---------------------------------------------------------------------
-- 11. Read models (views). These deliberately expose ONLY non-sensitive
--     columns (no phone, no email) so private profile data stays private.
-- ---------------------------------------------------------------------
create view public.market_listings as
select p.id, p.seller_id, p.name, p.description, p.category, p.price, p.unit, p.stock,
       p.district, p.image_url, p.status, p.created_at,
       coalesce(pr.farm_name, pr.full_name) as seller_name,
       pr.verified_seller
from public.products p
join public.profiles pr on pr.id = p.seller_id
where p.status = 'active' and pr.status = 'active';

create view public.community_feed as
select po.id, po.author_id, po.tag, po.body, po.image_url, po.created_at,
       pr.full_name as author_name,
       pr.district  as author_district,
       (select count(*) from public.post_likes l where l.post_id = po.id)::int as like_count,
       (select count(*) from public.comments c where c.post_id = po.id and not c.hidden)::int as comment_count,
       exists (select 1 from public.post_likes l where l.post_id = po.id and l.user_id = auth.uid()) as liked_by_me
from public.posts po
join public.profiles pr on pr.id = po.author_id
where not po.hidden;

create view public.comments_feed as
select c.id, c.post_id, c.author_id, c.body, c.created_at, pr.full_name as author_name
from public.comments c
join public.profiles pr on pr.id = c.author_id
where not c.hidden;

create function public.my_stats() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'posts',         (select count(*) from public.posts where author_id = auth.uid() and not hidden),
    'listings',      (select count(*) from public.products where seller_id = auth.uid() and status <> 'removed'),
    'helpful_votes', (select count(*) from public.post_likes l join public.posts p on p.id = l.post_id where p.author_id = auth.uid())
  )
$$;

-- ---------------------------------------------------------------------
-- 12. Order workflow (all state changes go through these functions so the
--     rules cannot be bypassed from the browser)
--     pending -> accepted -> processing -> completed   (or rejected/cancelled)
-- ---------------------------------------------------------------------
create function public.place_order(p_product_id uuid, p_quantity integer)
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
  if me.role = 'agri_officer' then
    raise exception 'Agricultural officers cannot place orders.' using errcode = '42501';
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

create function public.set_order_status(p_order_id uuid, p_status public.order_status)
returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  ord public.orders;
  is_seller boolean;
  is_buyer boolean;
begin
  if not public.is_active() then
    raise exception 'Your account is not active.' using errcode = '42501';
  end if;

  select * into ord from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found.'; end if;

  is_seller := ord.seller_id = auth.uid();
  is_buyer  := ord.buyer_id  = auth.uid();
  if not (is_seller or is_buyer) then
    raise exception 'You are not part of this order.' using errcode = '42501';
  end if;

  if p_status = 'accepted' and is_seller and ord.status = 'pending' then
    update public.products
       set stock = stock - ord.quantity,
           status = case when stock - ord.quantity <= 0 then 'sold_out'::public.product_status else status end,
           updated_at = now()
     where id = ord.product_id and stock >= ord.quantity;
    if not found then raise exception 'Not enough stock left to accept this order.'; end if;
    ord.accepted_at := now();

  elsif p_status = 'rejected' and is_seller and ord.status = 'pending' then
    null;

  elsif p_status = 'processing' and is_seller and ord.status = 'accepted' then
    null;

  elsif p_status = 'completed' and is_buyer and ord.status = 'processing' then
    ord.completed_at := now();            -- buyer confirms receipt

  elsif p_status = 'cancelled' and (
          (is_buyer  and ord.status = 'pending')
       or (is_seller and ord.status in ('accepted', 'processing'))) then
    if ord.status in ('accepted', 'processing') then   -- give the stock back
      update public.products
         set stock = stock + ord.quantity,
             status = case when status = 'sold_out' then 'active'::public.product_status else status end,
             updated_at = now()
       where id = ord.product_id;
    end if;

  else
    raise exception 'Invalid status change: % -> % for your role.', ord.status, p_status;
  end if;

  update public.orders
     set status = p_status, accepted_at = ord.accepted_at, completed_at = ord.completed_at, updated_at = now()
   where id = ord.id
   returning * into ord;

  perform public.log_event('order.' || p_status::text, 'orders', ord.id::text, '{}'::jsonb);
  return ord;
end $$;

-- ---------------------------------------------------------------------
-- 13. Row Level Security
-- ---------------------------------------------------------------------
alter table public.districts          enable row level security;
alter table public.profiles           enable row level security;
alter table public.role_permissions   enable row level security;
alter table public.audit_logs         enable row level security;
alter table public.consent_records    enable row level security;
alter table public.products           enable row level security;
alter table public.product_saves      enable row level security;
alter table public.orders             enable row level security;
alter table public.blockchain_records enable row level security;
alter table public.posts              enable row level security;
alter table public.post_likes         enable row level security;
alter table public.comments           enable row level security;

-- districts: public reference data
create policy districts_read on public.districts for select using (true);

-- profiles: private. Own row + admins. (Public bits are exposed via views.)
create policy profiles_read_own   on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

-- role_permissions: everyone signed-in can read, only admins change
create policy role_permissions_read  on public.role_permissions for select to authenticated using (true);
create policy role_permissions_admin on public.role_permissions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- audit_logs: admin read only (inserts go through log_event)
create policy audit_logs_admin_read on public.audit_logs for select to authenticated using (public.is_admin());

-- consent_records
create policy consent_read_own   on public.consent_records for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy consent_insert_own on public.consent_records for insert to authenticated with check (user_id = auth.uid());

-- products
create policy products_read on public.products for select
  using (status = 'active' or seller_id = auth.uid() or public.is_admin());
create policy products_insert on public.products for insert to authenticated
  with check (seller_id = auth.uid() and public.is_active() and public.current_user_role() in ('farmer', 'admin'));
create policy products_update on public.products for update to authenticated
  using (seller_id = auth.uid() or public.is_admin())
  with check ((seller_id = auth.uid() and public.is_active()) or public.is_admin());
create policy products_delete on public.products for delete to authenticated
  using (seller_id = auth.uid() or public.is_admin());

-- product_saves: private to the user
create policy saves_own on public.product_saves for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- orders: parties + admin can read; NO direct writes (use the functions above)
create policy orders_read on public.orders for select to authenticated
  using (buyer_id = auth.uid() or seller_id = auth.uid() or public.is_admin());

-- blockchain_records: order parties, officers (read all), admin
create policy blockchain_read on public.blockchain_records for select to authenticated
  using (
    public.current_user_role() in ('agri_officer', 'admin')
    or exists (select 1 from public.orders o
               where o.id = order_id and (o.buyer_id = auth.uid() or o.seller_id = auth.uid()))
  );

-- posts
create policy posts_read on public.posts for select using (not hidden or author_id = auth.uid() or public.is_admin());
create policy posts_insert on public.posts for insert to authenticated
  with check (author_id = auth.uid() and public.is_active() and hidden = false);
create policy posts_update on public.posts for update to authenticated
  using (author_id = auth.uid() or public.is_admin())
  with check ((author_id = auth.uid() and hidden = false) or public.is_admin());
create policy posts_delete on public.posts for delete to authenticated
  using (author_id = auth.uid() or public.is_admin());

-- likes
create policy likes_read   on public.post_likes for select using (true);
create policy likes_insert on public.post_likes for insert to authenticated with check (user_id = auth.uid() and public.is_active());
create policy likes_delete on public.post_likes for delete to authenticated using (user_id = auth.uid());

-- comments
create policy comments_read on public.comments for select using (not hidden or author_id = auth.uid() or public.is_admin());
create policy comments_insert on public.comments for insert to authenticated
  with check (author_id = auth.uid() and public.is_active() and hidden = false);
create policy comments_update on public.comments for update to authenticated
  using (author_id = auth.uid() or public.is_admin())
  with check ((author_id = auth.uid() and hidden = false) or public.is_admin());
create policy comments_delete on public.comments for delete to authenticated
  using (author_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------
-- 14. Explicit grants (RLS above decides what each row-level request may do)
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

grant select on public.districts, public.market_listings, public.community_feed, public.comments_feed,
                public.products, public.posts, public.post_likes, public.comments to anon;

grant select on public.districts, public.market_listings, public.community_feed, public.comments_feed,
                public.role_permissions, public.audit_logs, public.blockchain_records, public.orders
  to authenticated;
grant select, update                 on public.profiles          to authenticated;
grant select, insert, update, delete on public.products          to authenticated;
grant select, insert, update, delete on public.posts             to authenticated;
grant select, insert, update, delete on public.comments          to authenticated;
grant select, insert, delete         on public.post_likes        to authenticated;
grant select, insert, delete         on public.product_saves     to authenticated;
grant select, insert                 on public.consent_records   to authenticated;
grant insert, update, delete         on public.role_permissions  to authenticated;  -- admin-only via RLS

grant execute on function public.current_user_role(), public.is_admin(), public.is_active() to anon, authenticated;
grant execute on function public.place_order(uuid, integer)                to authenticated;
grant execute on function public.set_order_status(uuid, public.order_status) to authenticated;
grant execute on function public.my_stats()                                to authenticated;

-- ---------------------------------------------------------------------
-- 15. Storage: public bucket for product images; users write only to
--     their own folder (<user-id>/<file>).
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "product images public read" on storage.objects for select
  using (bucket_id = 'product-images');
create policy "product images own upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "product images own update" on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "product images own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text);
