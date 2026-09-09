-- Social Checkout: payment_accounts (settings) and social_checkouts (drafts).
-- Run in Supabase SQL editor. Mirrors the shape/RLS pattern in data_tables.sql
-- (public.can_access_business is already defined there).

create table if not exists public.payment_accounts (
  id text not null,
  business_id text not null,
  data jsonb not null,
  created_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.social_checkouts (
  id text not null,
  business_id text not null,
  data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.payment_accounts drop constraint if exists payment_accounts_pkey;
alter table public.social_checkouts drop constraint if exists social_checkouts_pkey;

alter table public.payment_accounts add primary key (id, business_id);
alter table public.social_checkouts add primary key (id, business_id);

create index if not exists payment_accounts_business_id_idx on public.payment_accounts (business_id);
create index if not exists social_checkouts_business_id_idx on public.social_checkouts (business_id);

alter table public.payment_accounts enable row level security;
alter table public.social_checkouts enable row level security;

-- payment_accounts: staff-only, no anon access at all.
drop policy if exists payment_accounts_select_own_business on public.payment_accounts;
drop policy if exists payment_accounts_insert_own_business on public.payment_accounts;
drop policy if exists payment_accounts_update_own_business on public.payment_accounts;
drop policy if exists payment_accounts_delete_own_business on public.payment_accounts;

create policy payment_accounts_select_own_business
  on public.payment_accounts for select
  using (public.can_access_business(business_id));

create policy payment_accounts_insert_own_business
  on public.payment_accounts for insert
  with check (public.can_access_business(business_id));

create policy payment_accounts_update_own_business
  on public.payment_accounts for update
  using (public.can_access_business(business_id))
  with check (public.can_access_business(business_id));

create policy payment_accounts_delete_own_business
  on public.payment_accounts for delete
  using (public.can_access_business(business_id));

-- social_checkouts: staff-only too. The public /checkout page NEVER touches
-- this table directly — it only calls the two SECURITY DEFINER RPCs in
-- social_checkout_public_rpcs.sql, which bypass RLS narrowly and safely.
drop policy if exists social_checkouts_select_own_business on public.social_checkouts;
drop policy if exists social_checkouts_insert_own_business on public.social_checkouts;
drop policy if exists social_checkouts_update_own_business on public.social_checkouts;
drop policy if exists social_checkouts_delete_own_business on public.social_checkouts;

create policy social_checkouts_select_own_business
  on public.social_checkouts for select
  using (public.can_access_business(business_id));

create policy social_checkouts_insert_own_business
  on public.social_checkouts for insert
  with check (public.can_access_business(business_id));

create policy social_checkouts_update_own_business
  on public.social_checkouts for update
  using (public.can_access_business(business_id))
  with check (public.can_access_business(business_id));

create policy social_checkouts_delete_own_business
  on public.social_checkouts for delete
  using (public.can_access_business(business_id));
