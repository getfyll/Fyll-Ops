-- Backfill default finance settings for ALL existing businesses.
-- Safe to run multiple times (idempotent).
--
-- What it does:
-- 1) Inserts default expense categories into public.expense_categories
--    for every existing business in public.businesses.
-- 2) Inserts baseline public.business_settings row (id = 'global')
--    for businesses that do not yet have one.
-- 3) Does NOT overwrite existing rows (uses ON CONFLICT DO NOTHING).

do $$
declare
  _expense_names text[] := array[
    'Rent & Utilities',
    'Salaries & Wages',
    'Marketing & Ads',
    'Software & Subscriptions',
    'Logistics & Delivery',
    'Inventory Purchases',
    'Procurement',
    'Repairs & Maintenance',
    'Internet & Communication',
    'Bank Charges & Fees',
    'Professional Services',
    'Travel & Transport',
    'Meals & Entertainment',
    'Office Supplies',
    'Insurance',
    'Training & Education',
    'Taxes & Levies',
    'Licenses & Compliance',
    'Equipment',
    'Miscellaneous'
  ];
  _procurement_statuses jsonb := jsonb_build_array(
    jsonb_build_object('id', 'proc-status-draft', 'name', 'Draft', 'order', 1),
    jsonb_build_object('id', 'proc-status-sent', 'name', 'Sent', 'order', 2),
    jsonb_build_object('id', 'proc-status-confirmed', 'name', 'Confirmed', 'order', 3),
    jsonb_build_object('id', 'proc-status-received', 'name', 'Received', 'order', 4),
    jsonb_build_object('id', 'proc-status-cancelled', 'name', 'Cancelled', 'order', 5)
  );
begin
  insert into public.expense_categories (id, business_id, data, created_at, updated_at)
  select
    item.category_id,
    item.business_id,
    jsonb_build_object('id', item.category_id, 'name', item.category_name),
    now(),
    now()
  from (
    select
      b.id::text as business_id,
      cat.name as category_name,
      'expense-category-' || coalesce(
        nullif(
          regexp_replace(
            regexp_replace(lower(cat.name), '[^a-z0-9]+', '-', 'g'),
            '(^-|-$)',
            '',
            'g'
          ),
          ''
        ),
        cat.idx::text
      ) as category_id
    from public.businesses b
    cross join lateral unnest(_expense_names) with ordinality as cat(name, idx)
  ) as item
  on conflict (id, business_id) do nothing;

  insert into public.business_settings (id, business_id, data, created_at, updated_at)
  select
    'global',
    b.id::text,
    jsonb_build_object(
      'id', 'global',
      'useGlobalLowStockThreshold', false,
      'globalLowStockThreshold', 0,
      'autoCompleteOrders', false,
      'autoCompleteAfterDays', 10,
      'autoCompleteFromStatus', '',
      'autoCompleteToStatus', '',
      'orderAutomations', '[]'::jsonb,
      'financeSuppliers', '[]'::jsonb,
      'procurementStatusOptions', _procurement_statuses,
      'fixedCosts', '[]'::jsonb
    ),
    now(),
    now()
  from public.businesses b
  on conflict (id, business_id) do nothing;
end;
$$;

-- Optional verification queries:
-- select business_id, count(*) as expense_category_count
-- from public.expense_categories
-- group by business_id
-- order by business_id;
--
-- select business_id, id
-- from public.business_settings
-- where id = 'global'
-- order by business_id;

