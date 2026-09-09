-- ==================================================================
-- FYLL: RESTORE CORE SETTINGS FROM EXISTING DATA (SAFE UPSERT)
-- ==================================================================
-- What this restores (for the business id you set below):
-- - order_statuses (from orders.data.status)
-- - sale_sources (from orders.data.source)
-- - payment_methods (from orders.data.paymentMethod)
-- - product_categories (from products.data.categories[])
-- - product_variables (from products.data.variants[].variableValues)
--
-- Safe behavior:
-- - Uses UPSERT only (no deletes)
-- - Keeps existing custom rows
-- - Rebuilds known rows from actual order/product data
-- ==================================================================

create extension if not exists pgcrypto;

-- REQUIRED: set your business id here before running.
-- Example: 'biz-1234567890abcdef'
do $$
declare
  v_business_id_input text := 'biz-2e38ebb3f2dc4d00bd812b05afc1cbf2';
  v_email_input text := 'REPLACE_WITH_YOUR_EMAIL';
  v_business_id text;
  v_business_count int;
begin
  if trim(v_business_id_input) <> '' and v_business_id_input <> 'REPLACE_WITH_YOUR_BUSINESS_ID' then
    v_business_id := trim(v_business_id_input);
  elsif trim(v_email_input) <> '' and v_email_input <> 'REPLACE_WITH_YOUR_EMAIL' then
    select p.business_id
      into v_business_id
    from public.profiles p
    where lower(p.email) = lower(trim(v_email_input))
      and coalesce(p.business_id, '') <> ''
    order by p.created_at desc nulls last
    limit 1;
  else
    select count(distinct p.business_id)::int
      into v_business_count
    from public.profiles p
    where coalesce(p.business_id, '') <> '';

    if v_business_count = 1 then
      select max(p.business_id)
        into v_business_id
      from public.profiles p
      where coalesce(p.business_id, '') <> '';
    end if;
  end if;

  if coalesce(trim(v_business_id), '') = '' then
    raise exception
      'Could not resolve business_id. Set v_business_id_input OR v_email_input. Helper: SELECT id,email,business_id FROM public.profiles ORDER BY created_at DESC LIMIT 20;';
  end if;

  perform set_config('app.restore_business_id', v_business_id, false);
end $$;

-- ------------------------------------------------------------------
-- 1) QUICK DIAGNOSTIC COUNTS
-- ------------------------------------------------------------------
with my_business as (
  select current_setting('app.restore_business_id')::text as business_id
)
select 'order_statuses' as table_name, count(*)::int as row_count
from public.order_statuses os
join my_business mb on os.business_id = mb.business_id
union all
select 'sale_sources', count(*)::int
from public.sale_sources ss
join my_business mb on ss.business_id = mb.business_id
union all
select 'payment_methods', count(*)::int
from public.payment_methods pm
join my_business mb on pm.business_id = mb.business_id
union all
select 'product_categories', count(*)::int
from public.product_categories pc
join my_business mb on pc.business_id = mb.business_id
union all
select 'product_variables', count(*)::int
from public.product_variables pv
join my_business mb on pv.business_id = mb.business_id
order by table_name;

-- ------------------------------------------------------------------
-- 2) RESTORE ORDER STATUSES
-- ------------------------------------------------------------------
with my_business as (
  select current_setting('app.restore_business_id')::text as business_id
),
source_values as (
  select distinct trim(o.data->>'status') as value
  from public.orders o
  join my_business mb on o.business_id = mb.business_id
  where coalesce(trim(o.data->>'status'), '') <> ''
),
normalized as (
  select
    value as raw_name,
    'order-status-' ||
      coalesce(
        nullif(regexp_replace(lower(value), '[^a-z0-9]+', '-', 'g'), ''),
        substr(md5(lower(value)), 1, 8)
      ) as id
  from source_values
),
dedup as (
  select
    id,
    min(raw_name) as name
  from normalized
  group by id
),
rows_to_upsert as (
  select
    name,
    id,
    row_number() over (order by name asc) as position
  from dedup
)
insert into public.order_statuses (id, business_id, data, created_by, updated_at)
select
  r.id,
  mb.business_id,
  jsonb_build_object(
    'id', r.id,
    'name', r.name,
    'color', '#6B7280',
    'order', r.position
  ),
  auth.uid()::text,
  now()
from rows_to_upsert r
cross join my_business mb
on conflict (id, business_id)
do update set
  data = excluded.data,
  updated_at = now();

-- ------------------------------------------------------------------
-- 3) RESTORE SALE SOURCES
-- ------------------------------------------------------------------
with my_business as (
  select current_setting('app.restore_business_id')::text as business_id
),
source_values as (
  select distinct trim(o.data->>'source') as value
  from public.orders o
  join my_business mb on o.business_id = mb.business_id
  where coalesce(trim(o.data->>'source'), '') <> ''
),
normalized as (
  select
    value as raw_name,
    'sale-source-' ||
      coalesce(
        nullif(regexp_replace(lower(value), '[^a-z0-9]+', '-', 'g'), ''),
        substr(md5(lower(value)), 1, 8)
      ) as id
  from source_values
),
rows_to_upsert as (
  select
    id,
    min(raw_name) as name
  from normalized
  group by id
)
insert into public.sale_sources (id, business_id, data, created_by, updated_at)
select
  r.id,
  mb.business_id,
  jsonb_build_object(
    'id', r.id,
    'name', r.name,
    'icon', 'circle'
  ),
  auth.uid()::text,
  now()
from rows_to_upsert r
cross join my_business mb
on conflict (id, business_id)
do update set
  data = excluded.data,
  updated_at = now();

-- ------------------------------------------------------------------
-- 4) RESTORE PAYMENT METHODS
-- ------------------------------------------------------------------
with my_business as (
  select current_setting('app.restore_business_id')::text as business_id
),
source_values as (
  select distinct trim(o.data->>'paymentMethod') as value
  from public.orders o
  join my_business mb on o.business_id = mb.business_id
  where coalesce(trim(o.data->>'paymentMethod'), '') <> ''
),
normalized as (
  select
    value as raw_name,
    'payment-method-' ||
      coalesce(
        nullif(regexp_replace(lower(value), '[^a-z0-9]+', '-', 'g'), ''),
        substr(md5(lower(value)), 1, 8)
      ) as id
  from source_values
),
rows_to_upsert as (
  select
    id,
    min(raw_name) as name
  from normalized
  group by id
)
insert into public.payment_methods (id, business_id, data, created_by, updated_at)
select
  r.id,
  mb.business_id,
  jsonb_build_object(
    'id', r.id,
    'name', r.name
  ),
  auth.uid()::text,
  now()
from rows_to_upsert r
cross join my_business mb
on conflict (id, business_id)
do update set
  data = excluded.data,
  updated_at = now();

-- ------------------------------------------------------------------
-- 5) RESTORE PRODUCT CATEGORIES
-- ------------------------------------------------------------------
with my_business as (
  select current_setting('app.restore_business_id')::text as business_id
),
source_values as (
  select distinct trim(cat.value) as value
  from public.products p
  join my_business mb on p.business_id = mb.business_id
  cross join lateral jsonb_array_elements_text(coalesce(p.data->'categories', '[]'::jsonb)) as cat(value)
  where coalesce(trim(cat.value), '') <> ''
),
normalized as (
  select
    value as raw_name,
    coalesce(
      nullif(regexp_replace(lower(value), '[^a-z0-9]+', '-', 'g'), ''),
      substr(md5(lower(value)), 1, 8)
    ) as id
  from source_values
),
rows_to_upsert as (
  select
    id,
    min(raw_name) as name
  from normalized
  group by id
)
insert into public.product_categories (id, business_id, data, created_by, updated_at)
select
  r.id,
  mb.business_id,
  jsonb_build_object(
    'id', r.id,
    'name', r.name
  ),
  auth.uid()::text,
  now()
from rows_to_upsert r
cross join my_business mb
on conflict (id, business_id)
do update set
  data = excluded.data,
  updated_at = now();

-- ------------------------------------------------------------------
-- 6) RESTORE PRODUCT VARIABLES (+ VALUES)
-- ------------------------------------------------------------------
with my_business as (
  select current_setting('app.restore_business_id')::text as business_id
),
raw_pairs as (
  select
    trim(kv.key) as variable_name_raw,
    lower(trim(kv.key)) as variable_name_key,
    trim(kv.value) as variable_value_raw,
    lower(trim(kv.value)) as variable_value_key
  from public.products p
  join my_business mb on p.business_id = mb.business_id
  cross join lateral jsonb_array_elements(coalesce(p.data->'variants', '[]'::jsonb)) as v(variant)
  cross join lateral jsonb_each_text(coalesce(v.variant->'variableValues', '{}'::jsonb)) as kv(key, value)
  where coalesce(trim(kv.key), '') <> ''
    and coalesce(trim(kv.value), '') <> ''
),
dedup_pairs as (
  select
    variable_name_key,
    min(variable_name_raw) as variable_name,
    variable_value_key,
    min(variable_value_raw) as variable_value
  from raw_pairs
  group by variable_name_key, variable_value_key
),
aggregated as (
  select
    variable_name_key,
    min(variable_name) as variable_name,
    array_agg(variable_value order by variable_value) as values_array
  from dedup_pairs
  group by variable_name_key
),
rows_to_upsert as (
  select
    variable_name as name,
    'product-variable-' ||
      coalesce(
        nullif(regexp_replace(variable_name_key, '[^a-z0-9]+', '-', 'g'), ''),
        substr(md5(variable_name_key), 1, 8)
      ) as id,
    values_array
  from aggregated
)
insert into public.product_variables (id, business_id, data, created_by, updated_at)
select
  r.id,
  mb.business_id,
  jsonb_build_object(
    'id', r.id,
    'name', r.name,
    'values', to_jsonb(r.values_array)
  ),
  auth.uid()::text,
  now()
from rows_to_upsert r
cross join my_business mb
on conflict (id, business_id)
do update set
  data = excluded.data,
  updated_at = now();

-- ------------------------------------------------------------------
-- 7) POST-RESTORE COUNTS
-- ------------------------------------------------------------------
with my_business as (
  select current_setting('app.restore_business_id')::text as business_id
)
select 'order_statuses' as table_name, count(*)::int as row_count
from public.order_statuses os
join my_business mb on os.business_id = mb.business_id
union all
select 'sale_sources', count(*)::int
from public.sale_sources ss
join my_business mb on ss.business_id = mb.business_id
union all
select 'payment_methods', count(*)::int
from public.payment_methods pm
join my_business mb on pm.business_id = mb.business_id
union all
select 'product_categories', count(*)::int
from public.product_categories pc
join my_business mb on pc.business_id = mb.business_id
union all
select 'product_variables', count(*)::int
from public.product_variables pv
join my_business mb on pv.business_id = mb.business_id
order by table_name;

-- ==================================================================
-- DONE
-- ==================================================================
