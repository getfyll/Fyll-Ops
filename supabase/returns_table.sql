-- ==================================================================
-- FYLL RETURNS TABLE
-- ==================================================================
-- Returns track customer return workflows and link back to cases/orders.
-- Run this in Supabase SQL Editor before using the Returns module.
-- ==================================================================

create table if not exists public.returns (
  id text not null,
  business_id text not null,
  data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.returns drop constraint if exists returns_pkey;
alter table public.returns add primary key (id, business_id);

create index if not exists returns_business_id_idx on public.returns (business_id);
create index if not exists returns_business_updated_desc on public.returns (business_id, updated_at desc);

alter table public.returns enable row level security;

drop policy if exists returns_select_v2 on public.returns;
drop policy if exists returns_insert_v2 on public.returns;
drop policy if exists returns_update_v2 on public.returns;
drop policy if exists returns_delete_v2 on public.returns;

create policy returns_select_v2
  on public.returns for select
  using (business_id = public.get_user_business_id());

create policy returns_insert_v2
  on public.returns for insert
  with check (business_id = public.get_user_business_id());

create policy returns_update_v2
  on public.returns for update
  using (business_id = public.get_user_business_id());

create policy returns_delete_v2
  on public.returns for delete
  using (business_id = public.get_user_business_id());

analyze public.returns;

-- ==================================================================
-- DONE! Returns table is ready
-- ==================================================================
