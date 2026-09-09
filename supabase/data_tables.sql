-- Data tables for Supabase sync (JSON payload per row).
-- Run in Supabase SQL editor.

create or replace function public.can_access_business(target_business_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and business_id = target_business_id
    union
    select 1
    from public.team_members
    where user_id = auth.uid()
      and business_id = target_business_id
  );
$$;

create table if not exists public.products (
  id text not null,
  business_id text not null,
  data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.orders (
  id text not null,
  business_id text not null,
  data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.customers (
  id text not null,
  business_id text not null,
  data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.restock_logs (
  id text not null,
  business_id text not null,
  data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.products drop constraint if exists products_pkey;
alter table public.orders drop constraint if exists orders_pkey;
alter table public.customers drop constraint if exists customers_pkey;
alter table public.restock_logs drop constraint if exists restock_logs_pkey;

alter table public.products add primary key (id, business_id);
alter table public.orders add primary key (id, business_id);
alter table public.customers add primary key (id, business_id);
alter table public.restock_logs add primary key (id, business_id);

create index if not exists products_business_id_idx on public.products (business_id);
create index if not exists orders_business_id_idx on public.orders (business_id);
create index if not exists customers_business_id_idx on public.customers (business_id);
create index if not exists restock_logs_business_id_idx on public.restock_logs (business_id);

alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.customers enable row level security;
alter table public.restock_logs enable row level security;

drop policy if exists products_select_own_business on public.products;
drop policy if exists products_insert_own_business on public.products;
drop policy if exists products_update_own_business on public.products;
drop policy if exists products_delete_own_business on public.products;

create policy products_select_own_business
  on public.products for select
  using (public.can_access_business(business_id));

create policy products_insert_own_business
  on public.products for insert
  with check (public.can_access_business(business_id));

create policy products_update_own_business
  on public.products for update
  using (public.can_access_business(business_id))
  with check (public.can_access_business(business_id));

create policy products_delete_own_business
  on public.products for delete
  using (public.can_access_business(business_id));

drop policy if exists orders_select_own_business on public.orders;
drop policy if exists orders_insert_own_business on public.orders;
drop policy if exists orders_update_own_business on public.orders;
drop policy if exists orders_delete_own_business on public.orders;

create policy orders_select_own_business
  on public.orders for select
  using (public.can_access_business(business_id));

create policy orders_insert_own_business
  on public.orders for insert
  with check (public.can_access_business(business_id));

create policy orders_update_own_business
  on public.orders for update
  using (public.can_access_business(business_id))
  with check (public.can_access_business(business_id));

create policy orders_delete_own_business
  on public.orders for delete
  using (public.can_access_business(business_id));

drop policy if exists customers_select_own_business on public.customers;
drop policy if exists customers_insert_own_business on public.customers;
drop policy if exists customers_update_own_business on public.customers;
drop policy if exists customers_delete_own_business on public.customers;

create policy customers_select_own_business
  on public.customers for select
  using (public.can_access_business(business_id));

create policy customers_insert_own_business
  on public.customers for insert
  with check (public.can_access_business(business_id));

create policy customers_update_own_business
  on public.customers for update
  using (public.can_access_business(business_id))
  with check (public.can_access_business(business_id));

create policy customers_delete_own_business
  on public.customers for delete
  using (public.can_access_business(business_id));

drop policy if exists restock_select_own_business on public.restock_logs;
drop policy if exists restock_insert_own_business on public.restock_logs;
drop policy if exists restock_update_own_business on public.restock_logs;
drop policy if exists restock_delete_own_business on public.restock_logs;

create policy restock_select_own_business
  on public.restock_logs for select
  using (public.can_access_business(business_id));

create policy restock_insert_own_business
  on public.restock_logs for insert
  with check (public.can_access_business(business_id));

create policy restock_update_own_business
  on public.restock_logs for update
  using (public.can_access_business(business_id))
  with check (public.can_access_business(business_id));

create policy restock_delete_own_business
  on public.restock_logs for delete
  using (public.can_access_business(business_id));
