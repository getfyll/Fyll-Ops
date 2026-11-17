-- Restock requests: a shared team list of items to buy next. Anyone on the team can ask for an
-- inventory item (or something not stocked yet); repeat asks stack on the same open request.
-- Same generic id/business_id/data(jsonb) pattern as the other business tables.

create table if not exists public.restock_requests (
  id text not null,
  business_id text not null,
  data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.restock_requests drop constraint if exists restock_requests_pkey;
alter table public.restock_requests add primary key (id, business_id);

create index if not exists restock_requests_business_id_idx on public.restock_requests (business_id);

alter table public.restock_requests enable row level security;

drop policy if exists restock_requests_select_own_business on public.restock_requests;
drop policy if exists restock_requests_insert_own_business on public.restock_requests;
drop policy if exists restock_requests_update_own_business on public.restock_requests;
drop policy if exists restock_requests_delete_own_business on public.restock_requests;

create policy restock_requests_select_own_business
  on public.restock_requests for select
  using (public.can_access_business(business_id));

create policy restock_requests_insert_own_business
  on public.restock_requests for insert
  with check (public.can_access_business(business_id));

create policy restock_requests_update_own_business
  on public.restock_requests for update
  using (public.can_access_business(business_id))
  with check (public.can_access_business(business_id));

create policy restock_requests_delete_own_business
  on public.restock_requests for delete
  using (public.can_access_business(business_id));
