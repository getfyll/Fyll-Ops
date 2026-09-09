-- Settings tables for global configuration sync.
-- Run in Supabase SQL editor.

create extension if not exists pgcrypto;

-- Shared settings table schema helper
create table if not exists public.order_statuses (
  id text not null,
  business_id text not null,
  data jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, business_id)
);

create table if not exists public.sale_sources (
  id text not null,
  business_id text not null,
  data jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, business_id)
);

create table if not exists public.custom_services (
  id text not null,
  business_id text not null,
  data jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, business_id)
);

create table if not exists public.case_statuses (
  id text not null,
  business_id text not null,
  data jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, business_id)
);

create table if not exists public.payment_methods (
  id text not null,
  business_id text not null,
  data jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, business_id)
);

create table if not exists public.logistics_carriers (
  id text not null,
  business_id text not null,
  data jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, business_id)
);

create table if not exists public.product_variables (
  id text not null,
  business_id text not null,
  data jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, business_id)
);

create table if not exists public.expense_categories (
  id text not null,
  business_id text not null,
  data jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, business_id)
);

create table if not exists public.product_categories (
  id text not null,
  business_id text not null,
  data jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, business_id)
);

create table if not exists public.business_settings (
  id text not null,
  business_id text not null,
  data jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, business_id)
);

create index if not exists order_statuses_business_id_idx on public.order_statuses (business_id);
create index if not exists sale_sources_business_id_idx on public.sale_sources (business_id);
create index if not exists custom_services_business_id_idx on public.custom_services (business_id);
create index if not exists payment_methods_business_id_idx on public.payment_methods (business_id);
create index if not exists logistics_carriers_business_id_idx on public.logistics_carriers (business_id);
create index if not exists product_variables_business_id_idx on public.product_variables (business_id);
create index if not exists expense_categories_business_id_idx on public.expense_categories (business_id);
create index if not exists product_categories_business_id_idx on public.product_categories (business_id);
create index if not exists case_statuses_business_id_idx on public.case_statuses (business_id);
create index if not exists business_settings_business_id_idx on public.business_settings (business_id);

alter table public.order_statuses enable row level security;
alter table public.sale_sources enable row level security;
alter table public.custom_services enable row level security;
alter table public.payment_methods enable row level security;
alter table public.logistics_carriers enable row level security;
alter table public.product_variables enable row level security;
alter table public.expense_categories enable row level security;
alter table public.product_categories enable row level security;
alter table public.case_statuses enable row level security;
alter table public.business_settings enable row level security;

-- Policies
drop policy if exists order_statuses_select_own_business on public.order_statuses;
drop policy if exists order_statuses_insert_own_business on public.order_statuses;
drop policy if exists order_statuses_update_own_business on public.order_statuses;
drop policy if exists order_statuses_delete_own_business on public.order_statuses;

create policy order_statuses_select_own_business
  on public.order_statuses for select
  using (business_id = (select business_id from public.profiles where id = auth.uid()));
create policy order_statuses_insert_own_business
  on public.order_statuses for insert
  with check (business_id = (select business_id from public.profiles where id = auth.uid()));
create policy order_statuses_update_own_business
  on public.order_statuses for update
  using (business_id = (select business_id from public.profiles where id = auth.uid()));
create policy order_statuses_delete_own_business
  on public.order_statuses for delete
  using (business_id = (select business_id from public.profiles where id = auth.uid()));

drop policy if exists case_statuses_select_own_business on public.case_statuses;
drop policy if exists case_statuses_insert_own_business on public.case_statuses;
drop policy if exists case_statuses_update_own_business on public.case_statuses;
drop policy if exists case_statuses_delete_own_business on public.case_statuses;

create policy case_statuses_select_own_business
  on public.case_statuses for select
  using (business_id = (select business_id from public.profiles where id = auth.uid()));
create policy case_statuses_insert_own_business
  on public.case_statuses for insert
  with check (business_id = (select business_id from public.profiles where id = auth.uid()));
create policy case_statuses_update_own_business
  on public.case_statuses for update
  using (business_id = (select business_id from public.profiles where id = auth.uid()));
create policy case_statuses_delete_own_business
  on public.case_statuses for delete
  using (business_id = (select business_id from public.profiles where id = auth.uid()));

drop policy if exists sale_sources_select_own_business on public.sale_sources;
drop policy if exists sale_sources_insert_own_business on public.sale_sources;
drop policy if exists sale_sources_update_own_business on public.sale_sources;
drop policy if exists sale_sources_delete_own_business on public.sale_sources;

create policy sale_sources_select_own_business
  on public.sale_sources for select
  using (business_id = (select business_id from public.profiles where id = auth.uid()));
create policy sale_sources_insert_own_business
  on public.sale_sources for insert
  with check (business_id = (select business_id from public.profiles where id = auth.uid()));
create policy sale_sources_update_own_business
  on public.sale_sources for update
  using (business_id = (select business_id from public.profiles where id = auth.uid()));
create policy sale_sources_delete_own_business
  on public.sale_sources for delete
  using (business_id = (select business_id from public.profiles where id = auth.uid()));

drop policy if exists custom_services_select_own_business on public.custom_services;
drop policy if exists custom_services_insert_own_business on public.custom_services;
drop policy if exists custom_services_update_own_business on public.custom_services;
drop policy if exists custom_services_delete_own_business on public.custom_services;

create policy custom_services_select_own_business
  on public.custom_services for select
  using (business_id = (select business_id from public.profiles where id = auth.uid()));
create policy custom_services_insert_own_business
  on public.custom_services for insert
  with check (business_id = (select business_id from public.profiles where id = auth.uid()));
create policy custom_services_update_own_business
  on public.custom_services for update
  using (business_id = (select business_id from public.profiles where id = auth.uid()));
create policy custom_services_delete_own_business
  on public.custom_services for delete
  using (business_id = (select business_id from public.profiles where id = auth.uid()));

drop policy if exists payment_methods_select_own_business on public.payment_methods;
drop policy if exists payment_methods_insert_own_business on public.payment_methods;
drop policy if exists payment_methods_update_own_business on public.payment_methods;
drop policy if exists payment_methods_delete_own_business on public.payment_methods;

create policy payment_methods_select_own_business
  on public.payment_methods for select
  using (business_id = (select business_id from public.profiles where id = auth.uid()));
create policy payment_methods_insert_own_business
  on public.payment_methods for insert
  with check (business_id = (select business_id from public.profiles where id = auth.uid()));
create policy payment_methods_update_own_business
  on public.payment_methods for update
  using (business_id = (select business_id from public.profiles where id = auth.uid()));
create policy payment_methods_delete_own_business
  on public.payment_methods for delete
  using (business_id = (select business_id from public.profiles where id = auth.uid()));

drop policy if exists logistics_carriers_select_own_business on public.logistics_carriers;
drop policy if exists logistics_carriers_insert_own_business on public.logistics_carriers;
drop policy if exists logistics_carriers_update_own_business on public.logistics_carriers;
drop policy if exists logistics_carriers_delete_own_business on public.logistics_carriers;

create policy logistics_carriers_select_own_business
  on public.logistics_carriers for select
  using (business_id = (select business_id from public.profiles where id = auth.uid()));
create policy logistics_carriers_insert_own_business
  on public.logistics_carriers for insert
  with check (business_id = (select business_id from public.profiles where id = auth.uid()));
create policy logistics_carriers_update_own_business
  on public.logistics_carriers for update
  using (business_id = (select business_id from public.profiles where id = auth.uid()));
create policy logistics_carriers_delete_own_business
  on public.logistics_carriers for delete
  using (business_id = (select business_id from public.profiles where id = auth.uid()));

drop policy if exists product_variables_select_own_business on public.product_variables;
drop policy if exists product_variables_insert_own_business on public.product_variables;
drop policy if exists product_variables_update_own_business on public.product_variables;
drop policy if exists product_variables_delete_own_business on public.product_variables;

create policy product_variables_select_own_business
  on public.product_variables for select
  using (business_id = (select business_id from public.profiles where id = auth.uid()));
create policy product_variables_insert_own_business
  on public.product_variables for insert
  with check (business_id = (select business_id from public.profiles where id = auth.uid()));
create policy product_variables_update_own_business
  on public.product_variables for update
  using (business_id = (select business_id from public.profiles where id = auth.uid()));
create policy product_variables_delete_own_business
  on public.product_variables for delete
  using (business_id = (select business_id from public.profiles where id = auth.uid()));

drop policy if exists expense_categories_select_own_business on public.expense_categories;
drop policy if exists expense_categories_insert_own_business on public.expense_categories;
drop policy if exists expense_categories_update_own_business on public.expense_categories;
drop policy if exists expense_categories_delete_own_business on public.expense_categories;

create policy expense_categories_select_own_business
  on public.expense_categories for select
  using (business_id = (select business_id from public.profiles where id = auth.uid()));
create policy expense_categories_insert_own_business
  on public.expense_categories for insert
  with check (business_id = (select business_id from public.profiles where id = auth.uid()));
create policy expense_categories_update_own_business
  on public.expense_categories for update
  using (business_id = (select business_id from public.profiles where id = auth.uid()));
create policy expense_categories_delete_own_business
  on public.expense_categories for delete
  using (business_id = (select business_id from public.profiles where id = auth.uid()));

drop policy if exists product_categories_select_own_business on public.product_categories;
drop policy if exists product_categories_insert_own_business on public.product_categories;
drop policy if exists product_categories_update_own_business on public.product_categories;
drop policy if exists product_categories_delete_own_business on public.product_categories;

create policy product_categories_select_own_business
  on public.product_categories for select
  using (business_id = (select business_id from public.profiles where id = auth.uid()));
create policy product_categories_insert_own_business
  on public.product_categories for insert
  with check (business_id = (select business_id from public.profiles where id = auth.uid()));
create policy product_categories_update_own_business
  on public.product_categories for update
  using (business_id = (select business_id from public.profiles where id = auth.uid()));
create policy product_categories_delete_own_business
  on public.product_categories for delete
  using (business_id = (select business_id from public.profiles where id = auth.uid()));

drop policy if exists business_settings_select_own_business on public.business_settings;
drop policy if exists business_settings_insert_own_business on public.business_settings;
drop policy if exists business_settings_update_own_business on public.business_settings;
drop policy if exists business_settings_delete_own_business on public.business_settings;

create policy business_settings_select_own_business
  on public.business_settings for select
  using (
    business_id = (
      select p.business_id
      from public.profiles p
      where p.id::text = (select auth.uid())::text
      limit 1
    )
  );
create policy business_settings_insert_own_business
  on public.business_settings for insert
  with check (
    business_id = (
      select p.business_id
      from public.profiles p
      where p.id::text = (select auth.uid())::text
      limit 1
    )
  );
create policy business_settings_update_own_business
  on public.business_settings for update
  using (
    business_id = (
      select p.business_id
      from public.profiles p
      where p.id::text = (select auth.uid())::text
      limit 1
    )
  );
create policy business_settings_delete_own_business
  on public.business_settings for delete
  using (
    business_id = (
      select p.business_id
      from public.profiles p
      where p.id::text = (select auth.uid())::text
      limit 1
    )
  );
