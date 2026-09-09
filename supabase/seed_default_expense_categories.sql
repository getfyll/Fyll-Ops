-- Seed default expense categories for a business.
-- Replace 'YOUR_BUSINESS_ID' with your actual business_id before running.
-- Run in Supabase SQL editor.

-- This uses ON CONFLICT to avoid duplicates if re-run.

do $$
declare
  _biz text := 'YOUR_BUSINESS_ID';   -- <-- replace this
  _cats text[] := array[
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
  _i int;
  _id text;
begin
  for _i in 1..array_length(_cats, 1) loop
    _id := 'expense-category-' || _i;
    insert into public.expense_categories (id, business_id, data, created_at, updated_at)
    values (
      _id,
      _biz,
      jsonb_build_object('name', _cats[_i]),
      now(),
      now()
    )
    on conflict (id, business_id) do update
      set data = jsonb_build_object('name', _cats[_i]),
          updated_at = now();
  end loop;
end;
$$;
