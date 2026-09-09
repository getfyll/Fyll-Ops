-- Seed default settings for every newly created business.
-- Run this once in Supabase SQL Editor.
--
-- What it does:
-- 1) Adds default order statuses to public.order_statuses when none exist
-- 2) Adds default expense categories to public.expense_categories
-- 3) Ensures a baseline public.business_settings row (id = 'global')
-- 4) Runs automatically for every future row inserted into public.businesses

drop trigger if exists trg_seed_defaults_on_business_create on public.businesses;
drop function if exists public.seed_defaults_on_business_create();

create or replace function public.seed_defaults_on_business_create()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
  _order_statuses jsonb := jsonb_build_array(
    jsonb_build_object(
      'id', 'order-status-pending-payment',
      'name', 'Payment approval',
      'color', '#F59E0B',
      'order', 1,
      'trackingStage', 'pending-payment'
    ),
    jsonb_build_object(
      'id', 'order-status-payment-confirmed',
      'name', 'Payment confirmed',
      'color', '#3B82F6',
      'order', 2,
      'trackingStage', 'received'
    ),
    jsonb_build_object(
      'id', 'order-status-preparing',
      'name', 'Preparing',
      'color', '#8B5CF6',
      'order', 3,
      'trackingStage', 'processing'
    ),
    jsonb_build_object(
      'id', 'order-status-out-for-delivery',
      'name', 'Out for delivery',
      'color', '#F97316',
      'order', 4,
      'trackingStage', 'out-for-delivery'
    ),
    jsonb_build_object(
      'id', 'order-status-delivered',
      'name', 'Delivered',
      'color', '#10B981',
      'order', 5,
      'trackingStage', 'delivered'
    ),
    jsonb_build_object(
      'id', 'order-status-completed',
      'name', 'Completed',
      'color', '#22C55E',
      'order', 6,
      'trackingStage', 'completed'
    )
  );
  _qc_checklist_requirements jsonb := jsonb_build_array(
    jsonb_build_object('key', 'no-defects', 'label', 'No defects', 'order', 1),
    jsonb_build_object('key', 'no-breakage', 'label', 'No breakage', 'order', 2),
    jsonb_build_object('key', 'no-stains', 'label', 'No stains', 'order', 3),
    jsonb_build_object('key', 'correct-colour', 'label', 'Correct colour', 'order', 4),
    jsonb_build_object('key', 'correct-glasses', 'label', 'Correct glasses', 'order', 5),
    jsonb_build_object('key', 'ready-to-pack', 'label', 'Ready to pack', 'order', 6)
  );
  _status jsonb;
  _i int;
  _name text;
  _slug text;
  _id text;
begin
  -- Seed the standard order workflow only when this business has no statuses.
  if not exists (
    select 1
    from public.order_statuses os
    where os.business_id = new.id::text
  ) then
    for _status in select value from jsonb_array_elements(_order_statuses) loop
      insert into public.order_statuses (id, business_id, data, created_by, created_at, updated_at)
      values (
        _status->>'id',
        new.id::text,
        _status,
        new.owner_id::text,
        now(),
        now()
      )
      on conflict (id, business_id) do nothing;
    end loop;
  end if;

  -- Seed expense category settings for this business.
  for _i in 1..coalesce(array_length(_expense_names, 1), 0) loop
    _name := _expense_names[_i];
    _slug := regexp_replace(lower(_name), '[^a-z0-9]+', '-', 'g');
    _slug := regexp_replace(_slug, '(^-|-$)', '', 'g');
    _id := 'expense-category-' || coalesce(nullif(_slug, ''), _i::text);

    insert into public.expense_categories (id, business_id, data, created_at, updated_at)
    values (
      _id,
      new.id::text,
      jsonb_build_object('id', _id, 'name', _name),
      now(),
      now()
    )
    on conflict (id, business_id) do update
      set data = excluded.data,
          updated_at = now();
  end loop;

  -- Ensure a baseline business settings document exists.
  insert into public.business_settings (id, business_id, data, created_at, updated_at)
  values (
    'global',
    new.id::text,
    jsonb_build_object(
      'id', 'global',
      'useGlobalLowStockThreshold', false,
      'globalLowStockThreshold', 0,
      'autoCompleteOrders', false,
      'autoCompleteAfterDays', 10,
      'autoCompleteFromStatus', '',
      'autoCompleteToStatus', '',
      'orderAutomations', '[]'::jsonb,
      'qcChecklistRequirements', _qc_checklist_requirements,
      'financeSuppliers', '[]'::jsonb,
      'procurementStatusOptions', _procurement_statuses,
      'fixedCosts', '[]'::jsonb
    ),
    now(),
    now()
  )
  on conflict (id, business_id) do nothing;

  return new;
end;
$$;

create trigger trg_seed_defaults_on_business_create
after insert on public.businesses
for each row
execute procedure public.seed_defaults_on_business_create();

-- Backfill existing businesses only when they have zero order statuses.
with default_statuses as (
  select *
  from (
    values
      (1, 'order-status-pending-payment', 'Payment approval', '#F59E0B', 'pending-payment'),
      (2, 'order-status-payment-confirmed', 'Payment confirmed', '#059669', 'received'),
      (3, 'order-status-preparing', 'Preparing', '#8B5CF6', 'processing'),
      (4, 'order-status-out-for-delivery', 'Out for delivery', '#F97316', 'out-for-delivery'),
      (5, 'order-status-delivered', 'Delivered', '#10B981', 'delivered'),
      (6, 'order-status-completed', 'Completed', '#22C55E', 'completed')
  ) as status_rows(position, id, name, color, tracking_stage)
),
businesses_without_statuses as (
  select businesses.id::text as business_id, businesses.owner_id::text as owner_id
  from public.businesses businesses
  where not exists (
    select 1
    from order_statuses os
    where os.business_id = businesses.id
  )
)
insert into public.order_statuses (id, business_id, data, created_by, created_at, updated_at)
select
  default_statuses.id,
  businesses_without_statuses.business_id,
  jsonb_build_object(
    'id', default_statuses.id,
    'name', default_statuses.name,
    'color', default_statuses.color,
    'order', default_statuses.position,
    'trackingStage', default_statuses.tracking_stage
  ),
  businesses_without_statuses.owner_id,
  now(),
  now()
from businesses_without_statuses
cross join default_statuses
on conflict (id, business_id) do nothing;
