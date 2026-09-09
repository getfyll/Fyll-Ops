-- Refund request + payout workflow data table.
-- Run in Supabase SQL editor.

create or replace function public.can_access_business(target_business_id text)
returns boolean
language sql
stable
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

create table if not exists public.refund_requests (
  id text not null,
  business_id text not null,
  data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.refund_requests drop constraint if exists refund_requests_pkey;
alter table public.refund_requests add primary key (id, business_id);

create index if not exists refund_requests_business_id_idx
  on public.refund_requests (business_id);

alter table public.refund_requests enable row level security;

drop policy if exists refund_requests_select_own_business on public.refund_requests;
drop policy if exists refund_requests_insert_own_business on public.refund_requests;
drop policy if exists refund_requests_update_own_business on public.refund_requests;
drop policy if exists refund_requests_delete_own_business on public.refund_requests;

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
