-- ==================================================================
-- FYLL SETTINGS BACKUP UTILS
-- ==================================================================
-- One-click backup + restore for settings tables.
--
-- Covered tables:
-- - order_statuses
-- - sale_sources
-- - custom_services
-- - payment_methods
-- - logistics_carriers
-- - product_variables
-- - expense_categories
-- - product_categories
-- - case_statuses
-- - business_settings
--
-- Usage examples:
--   select public.create_settings_backup('biz-xxx', 'before large update');
--   select * from public.list_settings_backups('biz-xxx', 20);
--   select public.restore_settings_backup('<backup-uuid>', 'biz-xxx', 'merge');
--   select public.restore_settings_backup('<backup-uuid>', 'biz-xxx', 'replace');
-- ==================================================================

create extension if not exists pgcrypto;

create or replace function public.get_user_business_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select business_id
  from public.profiles
  where id = auth.uid()
  limit 1;
$$;

create table if not exists public.settings_backups (
  id uuid primary key default gen_random_uuid(),
  business_id text not null,
  note text,
  snapshot jsonb not null,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists settings_backups_business_created_idx
  on public.settings_backups (business_id, created_at desc);

alter table public.settings_backups enable row level security;

drop policy if exists settings_backups_select_v1 on public.settings_backups;
drop policy if exists settings_backups_insert_v1 on public.settings_backups;
drop policy if exists settings_backups_delete_v1 on public.settings_backups;

create policy settings_backups_select_v1
  on public.settings_backups for select
  using (business_id = public.get_user_business_id());

create policy settings_backups_insert_v1
  on public.settings_backups for insert
  with check (business_id = public.get_user_business_id());

create policy settings_backups_delete_v1
  on public.settings_backups for delete
  using (business_id = public.get_user_business_id());

create or replace function public.create_settings_backup(
  p_business_id text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id text;
  v_user_business_id text;
  v_backup_id uuid;
  v_snapshot jsonb;
begin
  v_business_id := coalesce(nullif(trim(p_business_id), ''), public.get_user_business_id());
  v_user_business_id := public.get_user_business_id();

  if coalesce(v_business_id, '') = '' then
    raise exception 'Missing business_id. Pass p_business_id when running from SQL editor.';
  end if;

  if auth.uid() is not null
     and coalesce(v_user_business_id, '') <> ''
     and v_business_id <> v_user_business_id then
    raise exception 'Unauthorized business_id for backup.';
  end if;

  v_snapshot := jsonb_build_object(
    'order_statuses', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id,
        'data', t.data,
        'created_by', t.created_by,
        'created_at', t.created_at,
        'updated_at', t.updated_at
      ) order by t.id), '[]'::jsonb)
      from public.order_statuses t
      where t.business_id = v_business_id
    ),
    'sale_sources', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id,
        'data', t.data,
        'created_by', t.created_by,
        'created_at', t.created_at,
        'updated_at', t.updated_at
      ) order by t.id), '[]'::jsonb)
      from public.sale_sources t
      where t.business_id = v_business_id
    ),
    'custom_services', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id,
        'data', t.data,
        'created_by', t.created_by,
        'created_at', t.created_at,
        'updated_at', t.updated_at
      ) order by t.id), '[]'::jsonb)
      from public.custom_services t
      where t.business_id = v_business_id
    ),
    'payment_methods', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id,
        'data', t.data,
        'created_by', t.created_by,
        'created_at', t.created_at,
        'updated_at', t.updated_at
      ) order by t.id), '[]'::jsonb)
      from public.payment_methods t
      where t.business_id = v_business_id
    ),
    'logistics_carriers', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id,
        'data', t.data,
        'created_by', t.created_by,
        'created_at', t.created_at,
        'updated_at', t.updated_at
      ) order by t.id), '[]'::jsonb)
      from public.logistics_carriers t
      where t.business_id = v_business_id
    ),
    'product_variables', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id,
        'data', t.data,
        'created_by', t.created_by,
        'created_at', t.created_at,
        'updated_at', t.updated_at
      ) order by t.id), '[]'::jsonb)
      from public.product_variables t
      where t.business_id = v_business_id
    ),
    'expense_categories', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id,
        'data', t.data,
        'created_by', t.created_by,
        'created_at', t.created_at,
        'updated_at', t.updated_at
      ) order by t.id), '[]'::jsonb)
      from public.expense_categories t
      where t.business_id = v_business_id
    ),
    'product_categories', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id,
        'data', t.data,
        'created_by', t.created_by,
        'created_at', t.created_at,
        'updated_at', t.updated_at
      ) order by t.id), '[]'::jsonb)
      from public.product_categories t
      where t.business_id = v_business_id
    ),
    'case_statuses', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id,
        'data', t.data,
        'created_by', t.created_by,
        'created_at', t.created_at,
        'updated_at', t.updated_at
      ) order by t.id), '[]'::jsonb)
      from public.case_statuses t
      where t.business_id = v_business_id
    ),
    'business_settings', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id,
        'data', t.data,
        'created_by', t.created_by,
        'created_at', t.created_at,
        'updated_at', t.updated_at
      ) order by t.id), '[]'::jsonb)
      from public.business_settings t
      where t.business_id = v_business_id
    )
  );

  insert into public.settings_backups (
    business_id,
    note,
    snapshot,
    created_by
  )
  values (
    v_business_id,
    nullif(trim(p_note), ''),
    v_snapshot,
    auth.uid()::text
  )
  returning id into v_backup_id;

  return v_backup_id;
end;
$$;

create or replace function public.list_settings_backups(
  p_business_id text default null,
  p_limit int default 20
)
returns table (
  id uuid,
  business_id text,
  note text,
  created_by text,
  created_at timestamptz,
  item_counts jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id text;
  v_user_business_id text;
  v_limit int;
begin
  v_business_id := coalesce(nullif(trim(p_business_id), ''), public.get_user_business_id());
  v_user_business_id := public.get_user_business_id();
  v_limit := greatest(coalesce(p_limit, 20), 1);

  if coalesce(v_business_id, '') = '' then
    raise exception 'Missing business_id. Pass p_business_id when running from SQL editor.';
  end if;

  if auth.uid() is not null
     and coalesce(v_user_business_id, '') <> ''
     and v_business_id <> v_user_business_id then
    raise exception 'Unauthorized business_id for listing backups.';
  end if;

  return query
  select
    sb.id,
    sb.business_id,
    sb.note,
    sb.created_by,
    sb.created_at,
    jsonb_build_object(
      'order_statuses', jsonb_array_length(coalesce(sb.snapshot->'order_statuses', '[]'::jsonb)),
      'sale_sources', jsonb_array_length(coalesce(sb.snapshot->'sale_sources', '[]'::jsonb)),
      'custom_services', jsonb_array_length(coalesce(sb.snapshot->'custom_services', '[]'::jsonb)),
      'payment_methods', jsonb_array_length(coalesce(sb.snapshot->'payment_methods', '[]'::jsonb)),
      'logistics_carriers', jsonb_array_length(coalesce(sb.snapshot->'logistics_carriers', '[]'::jsonb)),
      'product_variables', jsonb_array_length(coalesce(sb.snapshot->'product_variables', '[]'::jsonb)),
      'expense_categories', jsonb_array_length(coalesce(sb.snapshot->'expense_categories', '[]'::jsonb)),
      'product_categories', jsonb_array_length(coalesce(sb.snapshot->'product_categories', '[]'::jsonb)),
      'case_statuses', jsonb_array_length(coalesce(sb.snapshot->'case_statuses', '[]'::jsonb)),
      'business_settings', jsonb_array_length(coalesce(sb.snapshot->'business_settings', '[]'::jsonb))
    ) as item_counts
  from public.settings_backups sb
  where sb.business_id = v_business_id
  order by sb.created_at desc
  limit v_limit;
end;
$$;

create or replace function public.restore_settings_backup(
  p_backup_id uuid,
  p_business_id text default null,
  p_mode text default 'merge'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id text;
  v_user_business_id text;
  v_mode text;
  v_snapshot jsonb;
  v_order_statuses_count int := 0;
  v_sale_sources_count int := 0;
  v_custom_services_count int := 0;
  v_payment_methods_count int := 0;
  v_logistics_carriers_count int := 0;
  v_product_variables_count int := 0;
  v_expense_categories_count int := 0;
  v_product_categories_count int := 0;
  v_case_statuses_count int := 0;
  v_business_settings_count int := 0;
begin
  v_business_id := coalesce(nullif(trim(p_business_id), ''), public.get_user_business_id());
  v_user_business_id := public.get_user_business_id();
  v_mode := lower(coalesce(trim(p_mode), 'merge'));

  if coalesce(v_business_id, '') = '' then
    raise exception 'Missing business_id. Pass p_business_id when running from SQL editor.';
  end if;

  if v_mode not in ('merge', 'replace') then
    raise exception 'Invalid mode %. Allowed: merge, replace.', p_mode;
  end if;

  if auth.uid() is not null
     and coalesce(v_user_business_id, '') <> ''
     and v_business_id <> v_user_business_id then
    raise exception 'Unauthorized business_id for restore.';
  end if;

  select sb.snapshot
    into v_snapshot
  from public.settings_backups sb
  where sb.id = p_backup_id
    and sb.business_id = v_business_id
  limit 1;

  if v_snapshot is null then
    raise exception 'Backup % not found for business %.', p_backup_id, v_business_id;
  end if;

  if v_mode = 'replace' then
    delete from public.order_statuses where business_id = v_business_id;
    delete from public.sale_sources where business_id = v_business_id;
    delete from public.custom_services where business_id = v_business_id;
    delete from public.payment_methods where business_id = v_business_id;
    delete from public.logistics_carriers where business_id = v_business_id;
    delete from public.product_variables where business_id = v_business_id;
    delete from public.expense_categories where business_id = v_business_id;
    delete from public.product_categories where business_id = v_business_id;
    delete from public.case_statuses where business_id = v_business_id;
    delete from public.business_settings where business_id = v_business_id;
  end if;

  insert into public.order_statuses (id, business_id, data, created_by, created_at, updated_at)
  select
    elem->>'id',
    v_business_id,
    elem->'data',
    nullif(elem->>'created_by', ''),
    coalesce((elem->>'created_at')::timestamptz, now()),
    now()
  from jsonb_array_elements(coalesce(v_snapshot->'order_statuses', '[]'::jsonb)) elem
  where coalesce(elem->>'id', '') <> ''
  on conflict (id, business_id) do update set
    data = excluded.data,
    updated_at = now();
  get diagnostics v_order_statuses_count = row_count;

  insert into public.sale_sources (id, business_id, data, created_by, created_at, updated_at)
  select
    elem->>'id',
    v_business_id,
    elem->'data',
    nullif(elem->>'created_by', ''),
    coalesce((elem->>'created_at')::timestamptz, now()),
    now()
  from jsonb_array_elements(coalesce(v_snapshot->'sale_sources', '[]'::jsonb)) elem
  where coalesce(elem->>'id', '') <> ''
  on conflict (id, business_id) do update set
    data = excluded.data,
    updated_at = now();
  get diagnostics v_sale_sources_count = row_count;

  insert into public.custom_services (id, business_id, data, created_by, created_at, updated_at)
  select
    elem->>'id',
    v_business_id,
    elem->'data',
    nullif(elem->>'created_by', ''),
    coalesce((elem->>'created_at')::timestamptz, now()),
    now()
  from jsonb_array_elements(coalesce(v_snapshot->'custom_services', '[]'::jsonb)) elem
  where coalesce(elem->>'id', '') <> ''
  on conflict (id, business_id) do update set
    data = excluded.data,
    updated_at = now();
  get diagnostics v_custom_services_count = row_count;

  insert into public.payment_methods (id, business_id, data, created_by, created_at, updated_at)
  select
    elem->>'id',
    v_business_id,
    elem->'data',
    nullif(elem->>'created_by', ''),
    coalesce((elem->>'created_at')::timestamptz, now()),
    now()
  from jsonb_array_elements(coalesce(v_snapshot->'payment_methods', '[]'::jsonb)) elem
  where coalesce(elem->>'id', '') <> ''
  on conflict (id, business_id) do update set
    data = excluded.data,
    updated_at = now();
  get diagnostics v_payment_methods_count = row_count;

  insert into public.logistics_carriers (id, business_id, data, created_by, created_at, updated_at)
  select
    elem->>'id',
    v_business_id,
    elem->'data',
    nullif(elem->>'created_by', ''),
    coalesce((elem->>'created_at')::timestamptz, now()),
    now()
  from jsonb_array_elements(coalesce(v_snapshot->'logistics_carriers', '[]'::jsonb)) elem
  where coalesce(elem->>'id', '') <> ''
  on conflict (id, business_id) do update set
    data = excluded.data,
    updated_at = now();
  get diagnostics v_logistics_carriers_count = row_count;

  insert into public.product_variables (id, business_id, data, created_by, created_at, updated_at)
  select
    elem->>'id',
    v_business_id,
    elem->'data',
    nullif(elem->>'created_by', ''),
    coalesce((elem->>'created_at')::timestamptz, now()),
    now()
  from jsonb_array_elements(coalesce(v_snapshot->'product_variables', '[]'::jsonb)) elem
  where coalesce(elem->>'id', '') <> ''
  on conflict (id, business_id) do update set
    data = excluded.data,
    updated_at = now();
  get diagnostics v_product_variables_count = row_count;

  insert into public.expense_categories (id, business_id, data, created_by, created_at, updated_at)
  select
    elem->>'id',
    v_business_id,
    elem->'data',
    nullif(elem->>'created_by', ''),
    coalesce((elem->>'created_at')::timestamptz, now()),
    now()
  from jsonb_array_elements(coalesce(v_snapshot->'expense_categories', '[]'::jsonb)) elem
  where coalesce(elem->>'id', '') <> ''
  on conflict (id, business_id) do update set
    data = excluded.data,
    updated_at = now();
  get diagnostics v_expense_categories_count = row_count;

  insert into public.product_categories (id, business_id, data, created_by, created_at, updated_at)
  select
    elem->>'id',
    v_business_id,
    elem->'data',
    nullif(elem->>'created_by', ''),
    coalesce((elem->>'created_at')::timestamptz, now()),
    now()
  from jsonb_array_elements(coalesce(v_snapshot->'product_categories', '[]'::jsonb)) elem
  where coalesce(elem->>'id', '') <> ''
  on conflict (id, business_id) do update set
    data = excluded.data,
    updated_at = now();
  get diagnostics v_product_categories_count = row_count;

  insert into public.case_statuses (id, business_id, data, created_by, created_at, updated_at)
  select
    elem->>'id',
    v_business_id,
    elem->'data',
    nullif(elem->>'created_by', ''),
    coalesce((elem->>'created_at')::timestamptz, now()),
    now()
  from jsonb_array_elements(coalesce(v_snapshot->'case_statuses', '[]'::jsonb)) elem
  where coalesce(elem->>'id', '') <> ''
  on conflict (id, business_id) do update set
    data = excluded.data,
    updated_at = now();
  get diagnostics v_case_statuses_count = row_count;

  insert into public.business_settings (id, business_id, data, created_by, created_at, updated_at)
  select
    elem->>'id',
    v_business_id,
    elem->'data',
    nullif(elem->>'created_by', ''),
    coalesce((elem->>'created_at')::timestamptz, now()),
    now()
  from jsonb_array_elements(coalesce(v_snapshot->'business_settings', '[]'::jsonb)) elem
  where coalesce(elem->>'id', '') <> ''
  on conflict (id, business_id) do update set
    data = excluded.data,
    updated_at = now();
  get diagnostics v_business_settings_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'backup_id', p_backup_id,
    'business_id', v_business_id,
    'mode', v_mode,
    'upsert_row_counts', jsonb_build_object(
      'order_statuses', v_order_statuses_count,
      'sale_sources', v_sale_sources_count,
      'custom_services', v_custom_services_count,
      'payment_methods', v_payment_methods_count,
      'logistics_carriers', v_logistics_carriers_count,
      'product_variables', v_product_variables_count,
      'expense_categories', v_expense_categories_count,
      'product_categories', v_product_categories_count,
      'case_statuses', v_case_statuses_count,
      'business_settings', v_business_settings_count
    )
  );
end;
$$;

analyze public.settings_backups;

-- ==================================================================
-- DONE
-- ==================================================================
