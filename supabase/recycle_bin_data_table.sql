-- Recycle bin table for deleted entities persisted in Supabase.
-- Run this in the Supabase SQL editor after supabase/data_tables.sql.

create table if not exists public.deleted_items (
  id text not null,
  business_id text not null,
  data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.deleted_items drop constraint if exists deleted_items_pkey;
alter table public.deleted_items add primary key (id, business_id);

create index if not exists deleted_items_business_id_idx on public.deleted_items (business_id);

alter table public.deleted_items enable row level security;

drop policy if exists deleted_items_select_own_business on public.deleted_items;
drop policy if exists deleted_items_insert_own_business on public.deleted_items;
drop policy if exists deleted_items_update_own_business on public.deleted_items;
drop policy if exists deleted_items_delete_own_business on public.deleted_items;

create policy deleted_items_select_own_business
  on public.deleted_items for select
  using (public.can_access_business(business_id));

create policy deleted_items_insert_own_business
  on public.deleted_items for insert
  with check (public.can_access_business(business_id));

create policy deleted_items_update_own_business
  on public.deleted_items for update
  using (public.can_access_business(business_id))
  with check (public.can_access_business(business_id));

create policy deleted_items_delete_own_business
  on public.deleted_items for delete
  using (public.can_access_business(business_id));
