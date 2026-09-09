-- ==================================================================
-- FYLL: DIAGNOSE CORE DATA COUNTS FOR ALL BUSINESSES
-- ==================================================================
-- Purpose:
-- - Shows whether products/orders/settings rows still exist in Supabase
-- - Helps distinguish "data actually missing" from "app not showing data"
-- - Read-only: no inserts, updates, or deletes
-- ==================================================================

with all_businesses as (
  select distinct trim(business_id) as business_id
  from (
    select business_id from public.profiles
    union all
    select business_id from public.orders
    union all
    select business_id from public.products
    union all
    select business_id from public.expenses
    union all
    select business_id from public.cases
    union all
    select business_id from public.business_settings
  ) src
  where coalesce(trim(business_id), '') <> ''
),
profile_names as (
  select
    p.business_id,
    max(coalesce(nullif(trim(p.name), ''), nullif(trim(p.email), ''))) as business_label
  from public.profiles p
  where coalesce(trim(p.business_id), '') <> ''
  group by p.business_id
),
product_counts as (
  select business_id, count(*)::int as product_count, max(updated_at) as last_product_update
  from public.products
  group by business_id
),
order_counts as (
  select business_id, count(*)::int as order_count, max(updated_at) as last_order_update
  from public.orders
  group by business_id
),
status_counts as (
  select business_id, count(*)::int as order_status_count
  from public.order_statuses
  group by business_id
),
source_counts as (
  select business_id, count(*)::int as sale_source_count
  from public.sale_sources
  group by business_id
),
payment_counts as (
  select business_id, count(*)::int as payment_method_count
  from public.payment_methods
  group by business_id
),
category_counts as (
  select business_id, count(*)::int as product_category_count
  from public.product_categories
  group by business_id
),
variable_counts as (
  select business_id, count(*)::int as product_variable_count
  from public.product_variables
  group by business_id
),
carrier_counts as (
  select business_id, count(*)::int as logistics_carrier_count
  from public.logistics_carriers
  group by business_id
),
service_counts as (
  select business_id, count(*)::int as custom_service_count
  from public.custom_services
  group by business_id
)
select
  ab.business_id,
  coalesce(pn.business_label, ab.business_id) as business_label,
  coalesce(pc.product_count, 0) as products,
  coalesce(oc.order_count, 0) as orders,
  coalesce(sc.order_status_count, 0) as order_statuses,
  coalesce(src.sale_source_count, 0) as sale_sources,
  coalesce(pay.payment_method_count, 0) as payment_methods,
  coalesce(cat.product_category_count, 0) as product_categories,
  coalesce(var.product_variable_count, 0) as product_variables,
  coalesce(car.logistics_carrier_count, 0) as logistics_carriers,
  coalesce(serv.custom_service_count, 0) as custom_services,
  pc.last_product_update,
  oc.last_order_update
from all_businesses ab
left join profile_names pn on pn.business_id = ab.business_id
left join product_counts pc on pc.business_id = ab.business_id
left join order_counts oc on oc.business_id = ab.business_id
left join status_counts sc on sc.business_id = ab.business_id
left join source_counts src on src.business_id = ab.business_id
left join payment_counts pay on pay.business_id = ab.business_id
left join category_counts cat on cat.business_id = ab.business_id
left join variable_counts var on var.business_id = ab.business_id
left join carrier_counts car on car.business_id = ab.business_id
left join service_counts serv on serv.business_id = ab.business_id
order by products asc, orders desc, business_label asc;

-- Optional: quick view of businesses where products are 0 but orders still exist
with all_businesses as (
  select distinct trim(business_id) as business_id
  from (
    select business_id from public.profiles
    union all
    select business_id from public.orders
    union all
    select business_id from public.products
  ) src
  where coalesce(trim(business_id), '') <> ''
),
product_counts as (
  select business_id, count(*)::int as product_count
  from public.products
  group by business_id
),
order_counts as (
  select business_id, count(*)::int as order_count
  from public.orders
  group by business_id
)
select
  ab.business_id,
  coalesce(pc.product_count, 0) as products,
  coalesce(oc.order_count, 0) as orders
from all_businesses ab
left join product_counts pc on pc.business_id = ab.business_id
left join order_counts oc on oc.business_id = ab.business_id
where coalesce(pc.product_count, 0) = 0
  and coalesce(oc.order_count, 0) > 0
order by orders desc, business_id asc;
