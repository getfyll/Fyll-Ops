-- Expense request + approval workflow data table.
-- Run in Supabase SQL editor.

create table if not exists public.expense_requests (
  id text not null,
  business_id text not null,
  data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.expense_requests drop constraint if exists expense_requests_pkey;
alter table public.expense_requests add primary key (id, business_id);

create index if not exists expense_requests_business_id_idx
  on public.expense_requests (business_id);

alter table public.expense_requests enable row level security;

drop policy if exists expense_requests_select_own_business on public.expense_requests;
drop policy if exists expense_requests_insert_own_business on public.expense_requests;
drop policy if exists expense_requests_update_own_business on public.expense_requests;
drop policy if exists expense_requests_delete_own_business on public.expense_requests;

create policy expense_requests_select_own_business
  on public.expense_requests for select
  using (business_id = (select business_id from public.profiles where id = auth.uid()));

create policy expense_requests_insert_own_business
  on public.expense_requests for insert
  with check (business_id = (select business_id from public.profiles where id = auth.uid()));

create policy expense_requests_update_own_business
  on public.expense_requests for update
  using (business_id = (select business_id from public.profiles where id = auth.uid()));

create policy expense_requests_delete_own_business
  on public.expense_requests for delete
  using (business_id = (select business_id from public.profiles where id = auth.uid()));
