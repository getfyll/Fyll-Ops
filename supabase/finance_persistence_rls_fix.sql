-- Fix settings/data persistence for owners and team users.
-- Run this in Supabase SQL editor.
--
-- Symptom:
-- Finance rules, salary templates, fixed costs, warehouse settings/items, or
-- inventory rows appear saved locally but disappear after refresh/reopen.
--
-- Cause:
-- Older RLS policies often only checked public.profiles.business_id. Staff and
-- manager accounts can be linked through public.team_members instead, so
-- Supabase rejects writes under RLS and the app falls back to local state.

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

do $$
declare
  target_table text;
  data_tables text[] := array[
    'products',
    'orders',
    'customers',
    'restock_logs',
    'procurements',
    'expenses',
    'other_incomes',
    'expense_requests',
    'refund_requests',
    'cases',
    'audit_logs'
  ];
  settings_tables text[] := array[
    'order_statuses',
    'sale_sources',
    'custom_services',
    'payment_methods',
    'logistics_carriers',
    'product_variables',
    'expense_categories',
    'product_categories',
    'case_statuses',
    'business_settings'
  ];
begin
  foreach target_table in array (data_tables || settings_tables)
  loop
    execute format(
      'create table if not exists public.%I (
        id text not null,
        business_id text not null,
        data jsonb not null default ''{}''::jsonb,
        created_by text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )',
      target_table
    );

    execute format('alter table public.%I add column if not exists id text', target_table);
    execute format('alter table public.%I add column if not exists business_id text', target_table);
    execute format('alter table public.%I add column if not exists data jsonb default ''{}''::jsonb', target_table);
    execute format('alter table public.%I add column if not exists created_by text', target_table);
    execute format('alter table public.%I add column if not exists created_at timestamptz default now()', target_table);
    execute format('alter table public.%I add column if not exists updated_at timestamptz default now()', target_table);

    if not exists (
      select 1
      from pg_indexes
      where schemaname = 'public'
        and tablename = target_table
        and indexdef ilike '%unique%'
        and indexdef ilike '%(id, business_id)%'
    ) then
      execute format(
        'create unique index %I on public.%I (id, business_id)',
        target_table || '_id_business_id_uidx',
        target_table
      );
    end if;

    execute format(
      'create index if not exists %I on public.%I (business_id)',
      target_table || '_business_id_idx',
      target_table
    );

    execute format('alter table public.%I enable row level security', target_table);

    -- Remove common older policies. Extra permissive policies are harmless, but
    -- these drops keep the database from carrying conflicting legacy names.
    execute format('drop policy if exists %I on public.%I', target_table || '_select', target_table);
    execute format('drop policy if exists %I on public.%I', target_table || '_insert', target_table);
    execute format('drop policy if exists %I on public.%I', target_table || '_update', target_table);
    execute format('drop policy if exists %I on public.%I', target_table || '_delete', target_table);
    execute format('drop policy if exists %I on public.%I', target_table || '_select_own_business', target_table);
    execute format('drop policy if exists %I on public.%I', target_table || '_insert_own_business', target_table);
    execute format('drop policy if exists %I on public.%I', target_table || '_update_own_business', target_table);
    execute format('drop policy if exists %I on public.%I', target_table || '_delete_own_business', target_table);

    execute format(
      'create policy %I on public.%I for select using (public.can_access_business(business_id))',
      target_table || '_select_own_business',
      target_table
    );
    execute format(
      'create policy %I on public.%I for insert with check (public.can_access_business(business_id))',
      target_table || '_insert_own_business',
      target_table
    );
    execute format(
      'create policy %I on public.%I for update using (public.can_access_business(business_id)) with check (public.can_access_business(business_id))',
      target_table || '_update_own_business',
      target_table
    );
    execute format(
      'create policy %I on public.%I for delete using (public.can_access_business(business_id))',
      target_table || '_delete_own_business',
      target_table
    );
  end loop;
end $$;
