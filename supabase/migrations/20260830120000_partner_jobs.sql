-- Partners (external opticians/vendors who fit lenses) and the jobs dispatched to them.
-- Follows the same generic id/business_id/data(jsonb) pattern as procurements, deleted_items, etc.

create table if not exists public.partners (
  id text not null,
  business_id text not null,
  data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.partners drop constraint if exists partners_pkey;
alter table public.partners add primary key (id, business_id);

create index if not exists partners_business_id_idx on public.partners (business_id);

alter table public.partners enable row level security;

drop policy if exists partners_select_own_business on public.partners;
drop policy if exists partners_insert_own_business on public.partners;
drop policy if exists partners_update_own_business on public.partners;
drop policy if exists partners_delete_own_business on public.partners;

create policy partners_select_own_business
  on public.partners for select
  using (public.can_access_business(business_id));

create policy partners_insert_own_business
  on public.partners for insert
  with check (public.can_access_business(business_id));

create policy partners_update_own_business
  on public.partners for update
  using (public.can_access_business(business_id))
  with check (public.can_access_business(business_id));

create policy partners_delete_own_business
  on public.partners for delete
  using (public.can_access_business(business_id));

create table if not exists public.partner_jobs (
  id text not null,
  business_id text not null,
  data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.partner_jobs drop constraint if exists partner_jobs_pkey;
alter table public.partner_jobs add primary key (id, business_id);

create index if not exists partner_jobs_business_id_idx on public.partner_jobs (business_id);
create index if not exists partner_jobs_partner_id_idx on public.partner_jobs (((data->>'partnerId')));

alter table public.partner_jobs enable row level security;

drop policy if exists partner_jobs_select_own_business on public.partner_jobs;
drop policy if exists partner_jobs_insert_own_business on public.partner_jobs;
drop policy if exists partner_jobs_update_own_business on public.partner_jobs;
drop policy if exists partner_jobs_delete_own_business on public.partner_jobs;

create policy partner_jobs_select_own_business
  on public.partner_jobs for select
  using (public.can_access_business(business_id));

create policy partner_jobs_insert_own_business
  on public.partner_jobs for insert
  with check (public.can_access_business(business_id));

create policy partner_jobs_update_own_business
  on public.partner_jobs for update
  using (public.can_access_business(business_id))
  with check (public.can_access_business(business_id));

create policy partner_jobs_delete_own_business
  on public.partner_jobs for delete
  using (public.can_access_business(business_id));
