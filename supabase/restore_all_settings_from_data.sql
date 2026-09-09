-- ==================================================================
-- FYLL: RESTORE ALL SETTINGS FROM EXISTING DATA (SAFE UPSERT)
-- ==================================================================
-- What this restores for one business:
-- - order_statuses            from orders.data.status
-- - sale_sources             from orders.data.source
-- - payment_methods          from orders.data.paymentMethod
-- - logistics_carriers       from orders.data.logistics.carrierName
-- - custom_services          from orders.data.services[]
-- - expense_categories       from expenses.data.category + business_settings.fixedCosts
-- - product_categories       from products.data.categories[]
-- - product_variables        from products.data.variants[].variableValues
-- - case_statuses            from cases.data.status, with safe defaults if missing
--
-- Safe behavior:
-- - UPSERT only
-- - No deletes
-- - Does not touch orders, products, customers, or services data
-- - Can be run directly in Supabase SQL editor
-- ==================================================================

create extension if not exists pgcrypto;

do $$
declare
  v_business_id_input text := 'REPLACE_WITH_YOUR_BUSINESS_ID';
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
      'Could not resolve business_id. Set v_business_id_input or v_email_input first.';
  end if;

  perform set_config('app.restore_business_id', v_business_id, false);
end $$;

-- ------------------------------------------------------------------
-- 1) DIAGNOSTIC COUNTS BEFORE RESTORE
-- ------------------------------------------------------------------
with my_business as (
  select current_setting('app.restore_business_id')::text as business_id
)
select 'case_statuses' as table_name, count(*)::int as row_count
from public.case_statuses t join my_business mb on t.business_id = mb.business_id
union all
select 'custom_services', count(*)::int
from public.custom_services t join my_business mb on t.business_id = mb.business_id
union all
select 'expense_categories', count(*)::int
from public.expense_categories t join my_business mb on t.business_id = mb.business_id
union all
select 'logistics_carriers', count(*)::int
from public.logistics_carriers t join my_business mb on t.business_id = mb.business_id
union all
select 'order_statuses', count(*)::int
from public.order_statuses t join my_business mb on t.business_id = mb.business_id
union all
select 'payment_methods', count(*)::int
from public.payment_methods t join my_business mb on t.business_id = mb.business_id
union all
select 'product_categories', count(*)::int
from public.product_categories t join my_business mb on t.business_id = mb.business_id
union all
select 'product_variables', count(*)::int
from public.product_variables t join my_business mb on t.business_id = mb.business_id
union all
select 'sale_sources', count(*)::int
from public.sale_sources t join my_business mb on t.business_id = mb.business_id
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
rows_to_upsert as (
  select
    id,
    min(raw_name) as name,
    row_number() over (order by min(raw_name) asc) as position
  from normalized
  group by id
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
  coalesce(auth.uid()::text, 'system-restore'),
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
  coalesce(auth.uid()::text, 'system-restore'),
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
  coalesce(auth.uid()::text, 'system-restore'),
  now()
from rows_to_upsert r
cross join my_business mb
on conflict (id, business_id)
do update set
  data = excluded.data,
  updated_at = now();

-- ------------------------------------------------------------------
-- 5) RESTORE LOGISTICS CARRIERS
-- ------------------------------------------------------------------
with my_business as (
  select current_setting('app.restore_business_id')::text as business_id
),
source_values as (
  select distinct trim(o.data->'logistics'->>'carrierName') as value
  from public.orders o
  join my_business mb on o.business_id = mb.business_id
  where coalesce(trim(o.data->'logistics'->>'carrierName'), '') <> ''
),
normalized as (
  select
    value as raw_name,
    'logistics-carrier-' ||
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
insert into public.logistics_carriers (id, business_id, data, created_by, updated_at)
select
  r.id,
  mb.business_id,
  jsonb_build_object(
    'id', r.id,
    'name', r.name
  ),
  coalesce(auth.uid()::text, 'system-restore'),
  now()
from rows_to_upsert r
cross join my_business mb
on conflict (id, business_id)
do update set
  data = excluded.data,
  updated_at = now();

-- ------------------------------------------------------------------
-- 6) RESTORE CUSTOM SERVICES
-- ------------------------------------------------------------------
with my_business as (
  select current_setting('app.restore_business_id')::text as business_id
),
raw_services as (
  select
    trim(service.value->>'name') as service_name_raw,
    lower(trim(service.value->>'name')) as service_name_key,
    max(
      case
        when jsonb_typeof(service.value->'price') = 'number'
          then (service.value->>'price')::numeric
        else 0
      end
    ) as default_price
  from public.orders o
  join my_business mb on o.business_id = mb.business_id
  cross join lateral jsonb_array_elements(coalesce(o.data->'services', '[]'::jsonb)) as service(value)
  where coalesce(trim(service.value->>'name'), '') <> ''
  group by trim(service.value->>'name'), lower(trim(service.value->>'name'))
),
rows_to_upsert as (
  select
    'custom-service-' ||
      coalesce(
        nullif(regexp_replace(service_name_key, '[^a-z0-9]+', '-', 'g'), ''),
        substr(md5(service_name_key), 1, 8)
      ) as id,
    min(service_name_raw) as name,
    max(default_price) as default_price
  from raw_services
  group by service_name_key
)
insert into public.custom_services (id, business_id, data, created_by, updated_at)
select
  r.id,
  mb.business_id,
  jsonb_build_object(
    'id', r.id,
    'name', r.name,
    'defaultPrice', coalesce(r.default_price, 0)
  ),
  coalesce(auth.uid()::text, 'system-restore'),
  now()
from rows_to_upsert r
cross join my_business mb
on conflict (id, business_id)
do update set
  data = excluded.data,
  updated_at = now();

-- ------------------------------------------------------------------
-- 7) RESTORE EXPENSE CATEGORIES
-- ------------------------------------------------------------------
with my_business as (
  select current_setting('app.restore_business_id')::text as business_id
),
source_values as (
  select trim(e.data->>'category') as value
  from public.expenses e
  join my_business mb on e.business_id = mb.business_id
  where coalesce(trim(e.data->>'category'), '') <> ''

  union

  select trim(fc.value->>'category') as value
  from public.business_settings bs
  join my_business mb on bs.business_id = mb.business_id
  cross join lateral jsonb_array_elements(coalesce(bs.data->'fixedCosts', '[]'::jsonb)) as fc(value)
  where coalesce(trim(fc.value->>'category'), '') <> ''

  union

  select value
  from (
    values
      ('Rent & Utilities'),
      ('Salaries & Wages'),
      ('Marketing & Ads'),
      ('Software & Subscriptions'),
      ('Logistics & Delivery'),
      ('Inventory Purchases'),
      ('Procurement'),
      ('Repairs & Maintenance'),
      ('Internet & Communication'),
      ('Bank Charges & Fees'),
      ('Professional Services'),
      ('Travel & Transport'),
      ('Meals & Entertainment'),
      ('Office Supplies'),
      ('Insurance'),
      ('Training & Education'),
      ('Taxes & Levies'),
      ('Licenses & Compliance'),
      ('Equipment'),
      ('Miscellaneous')
  ) defaults(value)
),
normalized as (
  select
    trim(value) as raw_name,
    'expense-category-' ||
      coalesce(
        nullif(regexp_replace(lower(trim(value)), '[^a-z0-9]+', '-', 'g'), ''),
        substr(md5(lower(trim(value))), 1, 8)
      ) as id
  from source_values
  where coalesce(trim(value), '') <> ''
),
rows_to_upsert as (
  select
    id,
    min(raw_name) as name
  from normalized
  group by id
)
insert into public.expense_categories (id, business_id, data, created_by, updated_at)
select
  r.id,
  mb.business_id,
  jsonb_build_object(
    'id', r.id,
    'name', r.name
  ),
  coalesce(auth.uid()::text, 'system-restore'),
  now()
from rows_to_upsert r
cross join my_business mb
on conflict (id, business_id)
do update set
  data = excluded.data,
  updated_at = now();

-- ------------------------------------------------------------------
-- 8) RESTORE PRODUCT CATEGORIES
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
  coalesce(auth.uid()::text, 'system-restore'),
  now()
from rows_to_upsert r
cross join my_business mb
on conflict (id, business_id)
do update set
  data = excluded.data,
  updated_at = now();

-- ------------------------------------------------------------------
-- 9) RESTORE PRODUCT VARIABLES (+ VALUES)
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
  coalesce(auth.uid()::text, 'system-restore'),
  now()
from rows_to_upsert r
cross join my_business mb
on conflict (id, business_id)
do update set
  data = excluded.data,
  updated_at = now();

-- ------------------------------------------------------------------
-- 10) RESTORE CASE STATUSES
-- ------------------------------------------------------------------
with my_business as (
  select current_setting('app.restore_business_id')::text as business_id
),
case_values as (
  select trim(c.data->>'status') as value
  from public.cases c
  join my_business mb on c.business_id = mb.business_id
  where coalesce(trim(c.data->>'status'), '') <> ''

  union

  select value
  from (
    values
      ('Open'),
      ('Under Review'),
      ('Awaiting Customer'),
      ('Awaiting Internal Action'),
      ('Resolved'),
      ('Closed')
  ) defaults(value)
),
normalized as (
  select
    trim(value) as raw_name,
    'case-status-' ||
      coalesce(
        nullif(regexp_replace(lower(trim(value)), '[^a-z0-9]+', '-', 'g'), ''),
        substr(md5(lower(trim(value))), 1, 8)
      ) as id
  from case_values
  where coalesce(trim(value), '') <> ''
),
rows_to_upsert as (
  select
    id,
    min(raw_name) as name,
    row_number() over (order by min(raw_name) asc) as position
  from normalized
  group by id
),
colored_rows as (
  select
    id,
    name,
    position,
    case lower(name)
      when 'open' then '#3B82F6'
      when 'under review' then '#F59E0B'
      when 'awaiting customer' then '#8B5CF6'
      when 'awaiting internal action' then '#F97316'
      when 'resolved' then '#10B981'
      when 'closed' then '#6B7280'
      else '#6B7280'
    end as color,
    case lower(name)
      when 'open' then 'New cases waiting for review'
      when 'under review' then 'Case is being investigated internally'
      when 'awaiting customer' then 'Waiting on customer for more info'
      when 'awaiting internal action' then 'Requires action from our team'
      when 'resolved' then 'Issue has been resolved with customer'
      when 'closed' then 'Case archived or closed after follow-up'
      else null
    end as description
  from rows_to_upsert
)
insert into public.case_statuses (id, business_id, data, created_by, updated_at)
select
  r.id,
  mb.business_id,
  jsonb_build_object(
    'id', r.id,
    'name', r.name,
    'color', r.color,
    'description', r.description,
    'order', r.position
  ),
  coalesce(auth.uid()::text, 'system-restore'),
  now()
from colored_rows r
cross join my_business mb
on conflict (id, business_id)
do update set
  data = excluded.data,
  updated_at = now();

-- ------------------------------------------------------------------
-- 11) DIAGNOSTIC COUNTS AFTER RESTORE
-- ------------------------------------------------------------------
with my_business as (
  select current_setting('app.restore_business_id')::text as business_id
)
select 'case_statuses' as table_name, count(*)::int as row_count
from public.case_statuses t join my_business mb on t.business_id = mb.business_id
union all
select 'custom_services', count(*)::int
from public.custom_services t join my_business mb on t.business_id = mb.business_id
union all
select 'expense_categories', count(*)::int
from public.expense_categories t join my_business mb on t.business_id = mb.business_id
union all
select 'logistics_carriers', count(*)::int
from public.logistics_carriers t join my_business mb on t.business_id = mb.business_id
union all
select 'order_statuses', count(*)::int
from public.order_statuses t join my_business mb on t.business_id = mb.business_id
union all
select 'payment_methods', count(*)::int
from public.payment_methods t join my_business mb on t.business_id = mb.business_id
union all
select 'product_categories', count(*)::int
from public.product_categories t join my_business mb on t.business_id = mb.business_id
union all
select 'product_variables', count(*)::int
from public.product_variables t join my_business mb on t.business_id = mb.business_id
union all
select 'sale_sources', count(*)::int
from public.sale_sources t join my_business mb on t.business_id = mb.business_id
order by table_name;

-- ==================================================================
-- DONE
-- ==================================================================
