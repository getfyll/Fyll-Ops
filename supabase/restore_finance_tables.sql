-- Restore finance data tables for FYLL sync (expenses + procurements + other income).
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

create table if not exists public.expenses (
  id text not null,
  business_id text not null,
  data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.other_incomes (
  id text not null,
  business_id text not null,
  data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.procurements (
  id text not null,
  business_id text not null,
  data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.expense_requests (
  id text not null,
  business_id text not null,
  data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.refund_requests (
  id text not null,
  business_id text not null,
  data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.expenses drop constraint if exists expenses_pkey;
alter table public.other_incomes drop constraint if exists other_incomes_pkey;
alter table public.procurements drop constraint if exists procurements_pkey;
alter table public.expense_requests drop constraint if exists expense_requests_pkey;
alter table public.refund_requests drop constraint if exists refund_requests_pkey;

alter table public.expenses add primary key (id, business_id);
alter table public.other_incomes add primary key (id, business_id);
alter table public.procurements add primary key (id, business_id);
alter table public.expense_requests add primary key (id, business_id);
alter table public.refund_requests add primary key (id, business_id);

create index if not exists expenses_business_id_idx on public.expenses (business_id);
create index if not exists other_incomes_business_id_idx on public.other_incomes (business_id);
create index if not exists procurements_business_id_idx on public.procurements (business_id);
create index if not exists expense_requests_business_id_idx on public.expense_requests (business_id);
create index if not exists refund_requests_business_id_idx on public.refund_requests (business_id);

alter table public.expenses enable row level security;
alter table public.other_incomes enable row level security;
alter table public.procurements enable row level security;
alter table public.expense_requests enable row level security;
alter table public.refund_requests enable row level security;

drop policy if exists expenses_select_own_business on public.expenses;
drop policy if exists expenses_insert_own_business on public.expenses;
drop policy if exists expenses_update_own_business on public.expenses;
drop policy if exists expenses_delete_own_business on public.expenses;

create policy expenses_select_own_business
  on public.expenses for select
  using (business_id = (select business_id from public.profiles where id = auth.uid()));

create policy expenses_insert_own_business
  on public.expenses for insert
  with check (business_id = (select business_id from public.profiles where id = auth.uid()));

create policy expenses_update_own_business
  on public.expenses for update
  using (business_id = (select business_id from public.profiles where id = auth.uid()));

create policy expenses_delete_own_business
  on public.expenses for delete
  using (business_id = (select business_id from public.profiles where id = auth.uid()));

drop policy if exists other_incomes_select_own_business on public.other_incomes;
drop policy if exists other_incomes_insert_own_business on public.other_incomes;
drop policy if exists other_incomes_update_own_business on public.other_incomes;
drop policy if exists other_incomes_delete_own_business on public.other_incomes;

create policy other_incomes_select_own_business
  on public.other_incomes for select
  using (public.can_access_business(business_id));

create policy other_incomes_insert_own_business
  on public.other_incomes for insert
  with check (public.can_access_business(business_id));

create policy other_incomes_update_own_business
  on public.other_incomes for update
  using (public.can_access_business(business_id));

create policy other_incomes_delete_own_business
  on public.other_incomes for delete
  using (public.can_access_business(business_id));

drop policy if exists procurements_select_own_business on public.procurements;
drop policy if exists procurements_insert_own_business on public.procurements;
drop policy if exists procurements_update_own_business on public.procurements;
drop policy if exists procurements_delete_own_business on public.procurements;

create policy procurements_select_own_business
  on public.procurements for select
  using (public.can_access_business(business_id));

create policy procurements_insert_own_business
  on public.procurements for insert
  with check (public.can_access_business(business_id));

create policy procurements_update_own_business
  on public.procurements for update
  using (public.can_access_business(business_id))
  with check (public.can_access_business(business_id));

create policy procurements_delete_own_business
  on public.procurements for delete
  using (public.can_access_business(business_id));

drop policy if exists expense_requests_select_own_business on public.expense_requests;
drop policy if exists expense_requests_insert_own_business on public.expense_requests;
drop policy if exists expense_requests_update_own_business on public.expense_requests;
drop policy if exists expense_requests_delete_own_business on public.expense_requests;
drop policy if exists refund_requests_select_own_business on public.refund_requests;
drop policy if exists refund_requests_insert_own_business on public.refund_requests;
drop policy if exists refund_requests_update_own_business on public.refund_requests;
drop policy if exists refund_requests_delete_own_business on public.refund_requests;

create policy expense_requests_select_own_business
  on public.expense_requests for select
  using (public.can_access_business(business_id));

create policy expense_requests_insert_own_business
  on public.expense_requests for insert
  with check (public.can_access_business(business_id));

create policy expense_requests_update_own_business
  on public.expense_requests for update
  using (public.can_access_business(business_id));

create policy expense_requests_delete_own_business
  on public.expense_requests for delete
  using (public.can_access_business(business_id));

create policy refund_requests_select_own_business
  on public.refund_requests for select
  using (public.can_access_business(business_id));

create policy refund_requests_insert_own_business
  on public.refund_requests for insert
  with check (public.can_access_business(business_id));

create policy refund_requests_update_own_business
  on public.refund_requests for update
  using (public.can_access_business(business_id));

create policy refund_requests_delete_own_business
  on public.refund_requests for delete
  using (public.can_access_business(business_id));
