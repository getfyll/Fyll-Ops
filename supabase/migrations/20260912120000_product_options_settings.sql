-- Separate product options from product variables.
-- Product variables create stock variants. Product options are reusable choices
-- selected per order item without creating stock/SKU variations.

create table if not exists public.product_options (
  id text not null,
  business_id text not null,
  data jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, business_id)
);

create index if not exists product_options_business_id_idx on public.product_options (business_id);

alter table public.product_options enable row level security;

drop policy if exists product_options_select_own_business on public.product_options;
drop policy if exists product_options_insert_own_business on public.product_options;
drop policy if exists product_options_update_own_business on public.product_options;
drop policy if exists product_options_delete_own_business on public.product_options;

create policy product_options_select_own_business
  on public.product_options for select
  using (business_id = (select business_id from public.profiles where id = auth.uid()));
create policy product_options_insert_own_business
  on public.product_options for insert
  with check (business_id = (select business_id from public.profiles where id = auth.uid()));
create policy product_options_update_own_business
  on public.product_options for update
  using (business_id = (select business_id from public.profiles where id = auth.uid()));
create policy product_options_delete_own_business
  on public.product_options for delete
  using (business_id = (select business_id from public.profiles where id = auth.uid()));
