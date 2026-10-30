-- ===================================================================
-- FYLL: SEED ADMIN SHOWCASE ACCOUNT WITH REALISTIC DEMO DATA
-- ===================================================================
-- Target account:
--   admin@fyll.com
--
-- What this does:
-- - Resolves the business_id from public.profiles using admin@fyll.com
-- - Removes prior rows created by this script only (ids prefixed with demo-)
-- - Seeds a screenshot-ready, high-volume dataset across key ops areas:
--   products, customers, orders, procurements, expenses, other income,
--   bills/payments, cases, refunds, returns, restock logs, audit logs,
--   settings, custom services, logistics, finance rules, and more.
-- - Expected demo volume when the optional tables exist:
--   50 catalog records, 48 customers, 128 orders, 60 payment links,
--   24 cases, 16 refund requests, 12 returns, and 30 expenses.
--
-- Safe behavior:
-- - Does NOT delete non-demo records
-- - Uses predictable ids so the script can be rerun safely
-- ===================================================================

create extension if not exists pgcrypto;

do $$
declare
  v_email_input text := 'admin@fyll.com';
  v_business_id text;
begin
  select p.business_id
    into v_business_id
  from public.profiles p
  where lower(p.email) = lower(trim(v_email_input))
    and coalesce(p.business_id, '') <> ''
  order by p.created_at desc nulls last
  limit 1;

  if coalesce(trim(v_business_id), '') = '' then
    raise exception
      'Could not resolve business_id for %. Helper: SELECT id,email,business_id FROM public.profiles ORDER BY created_at DESC LIMIT 20;',
      v_email_input;
  end if;

  perform set_config('app.seed_business_id', v_business_id, false);
  perform set_config('app.seed_email', v_email_input, false);
end $$;

-- Keep generated customer identities consistent across customers, orders,
-- payment links, cases, refunds, and returns. These are fictional names and
-- use example.com addresses so the showcase never points at a real customer.
create temporary table if not exists fyll_demo_customer_roster (
  customer_no integer primary key,
  full_name text not null,
  email text not null
) on commit preserve rows;

truncate table pg_temp.fyll_demo_customer_roster;

insert into pg_temp.fyll_demo_customer_roster (customer_no, full_name, email)
values
  (1, 'Aisha Bello', 'aisha.bello@example.com'),
  (2, 'Tobi Adeyemi', 'tobi.adeyemi@example.com'),
  (3, 'Amara Okafor', 'amara.okafor@example.com'),
  (4, 'Daniel Etim', 'daniel.etim@example.com'),
  (5, 'Kemi Balogun', 'kemi.balogun@example.com'),
  (6, 'Ifeanyi Nwosu', 'ifeanyi.nwosu@example.com'),
  (7, 'Temilade Ajayi', 'temilade.ajayi@example.com'),
  (8, 'Femi Akinola', 'femi.akinola@example.com'),
  (9, 'Nneka Eze', 'nneka.eze@example.com'),
  (10, 'Seyi Ogunleye', 'seyi.ogunleye@example.com'),
  (11, 'Adaobi Obi', 'adaobi.obi@example.com'),
  (12, 'David Okoro', 'david.okoro@example.com'),
  (13, 'Zara Lawal', 'zara.lawal@example.com'),
  (14, 'Chinedu Umeh', 'chinedu.umeh@example.com'),
  (15, 'Mariam Yusuf', 'mariam.yusuf@example.com'),
  (16, 'Kunle Dada', 'kunle.dada@example.com'),
  (17, 'Efe Omoregie', 'efe.omoregie@example.com'),
  (18, 'Lola Alabi', 'lola.alabi@example.com'),
  (19, 'Obinna Kalu', 'obinna.kalu@example.com'),
  (20, 'Ruth Essien', 'ruth.essien@example.com'),
  (21, 'Hauwa Musa', 'hauwa.musa@example.com'),
  (22, 'Damilola Peters', 'damilola.peters@example.com'),
  (23, 'Chisom Anozie', 'chisom.anozie@example.com'),
  (24, 'Yinka Salami', 'yinka.salami@example.com'),
  (25, 'Imani Cole', 'imani.cole@example.com'),
  (26, 'Noah Williams', 'noah.williams@example.com'),
  (27, 'Sophia Mensah', 'sophia.mensah@example.com'),
  (28, 'Elijah Grant', 'elijah.grant@example.com'),
  (29, 'Naomi Clarke', 'naomi.clarke@example.com'),
  (30, 'Lucas Martin', 'lucas.martin@example.com'),
  (31, 'Maya Thompson', 'maya.thompson@example.com'),
  (32, 'Ethan Walker', 'ethan.walker@example.com'),
  (33, 'Leila Hassan', 'leila.hassan@example.com'),
  (34, 'Samuel Boateng', 'samuel.boateng@example.com'),
  (35, 'Isabella Reed', 'isabella.reed@example.com'),
  (36, 'Jacob Evans', 'jacob.evans@example.com'),
  (37, 'Fatima Diallo', 'fatima.diallo@example.com'),
  (38, 'Michael Chen', 'michael.chen@example.com'),
  (39, 'Olivia Brooks', 'olivia.brooks@example.com'),
  (40, 'Nathan Scott', 'nathan.scott@example.com');

-- -------------------------------------------------------------------
-- Clean up prior demo rows only
-- -------------------------------------------------------------------

with mb as (select current_setting('app.seed_business_id')::text as business_id)
delete from public.products p using mb
where p.business_id = mb.business_id
  and p.id like 'demo-%';

with mb as (select current_setting('app.seed_business_id')::text as business_id)
delete from public.customers c using mb
where c.business_id = mb.business_id
  and c.id like 'demo-%';

with mb as (select current_setting('app.seed_business_id')::text as business_id)
delete from public.orders o using mb
where o.business_id = mb.business_id
  and o.id like 'demo-%';

with mb as (select current_setting('app.seed_business_id')::text as business_id)
delete from public.procurements p using mb
where p.business_id = mb.business_id
  and p.id like 'demo-%';

with mb as (select current_setting('app.seed_business_id')::text as business_id)
delete from public.expenses e using mb
where e.business_id = mb.business_id
  and e.id like 'demo-%';

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'other_incomes'
  ) then
    execute $sql$
      with mb as (select current_setting('app.seed_business_id')::text as business_id)
      delete from public.other_incomes oi using mb
      where oi.business_id = mb.business_id
        and oi.id like 'demo-%'
    $sql$;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'expense_requests'
  ) then
    execute $sql$
      with mb as (select current_setting('app.seed_business_id')::text as business_id)
      delete from public.expense_requests er using mb
      where er.business_id = mb.business_id
        and er.id like 'demo-%'
    $sql$;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'refund_requests'
  ) then
    execute $sql$
      with mb as (select current_setting('app.seed_business_id')::text as business_id)
      delete from public.refund_requests rr using mb
      where rr.business_id = mb.business_id
        and rr.id like 'demo-%'
    $sql$;
  end if;
end $$;

do $$
declare
  v_table_name text;
begin
  foreach v_table_name in array array['social_checkouts', 'payment_accounts', 'returns']
  loop
    if exists (
      select 1 from information_schema.tables t
      where t.table_schema = 'public' and t.table_name = v_table_name
    ) then
      execute format(
        'delete from public.%I where business_id = %L and (id like ''demo-%%'' or id like ''SC-DEMO%%'')',
        v_table_name,
        current_setting('app.seed_business_id')
      );
    end if;
  end loop;
end $$;

with mb as (select current_setting('app.seed_business_id')::text as business_id)
delete from public.cases c using mb
where c.business_id = mb.business_id
  and c.id like 'demo-%';

with mb as (select current_setting('app.seed_business_id')::text as business_id)
delete from public.restock_logs r using mb
where r.business_id = mb.business_id
  and r.id like 'demo-%';

with mb as (select current_setting('app.seed_business_id')::text as business_id)
delete from public.audit_logs a using mb
where a.business_id = mb.business_id
  and a.id like 'demo-%';

with mb as (select current_setting('app.seed_business_id')::text as business_id)
delete from public.order_statuses s using mb
where s.business_id = mb.business_id
  and s.id like 'demo-%';

with mb as (select current_setting('app.seed_business_id')::text as business_id)
delete from public.sale_sources s using mb
where s.business_id = mb.business_id
  and s.id like 'demo-%';

with mb as (select current_setting('app.seed_business_id')::text as business_id)
delete from public.custom_services s using mb
where s.business_id = mb.business_id
  and s.id like 'demo-%';

with mb as (select current_setting('app.seed_business_id')::text as business_id)
delete from public.payment_methods s using mb
where s.business_id = mb.business_id
  and s.id like 'demo-%';

with mb as (select current_setting('app.seed_business_id')::text as business_id)
delete from public.logistics_carriers s using mb
where s.business_id = mb.business_id
  and s.id like 'demo-%';

with mb as (select current_setting('app.seed_business_id')::text as business_id)
delete from public.product_variables s using mb
where s.business_id = mb.business_id
  and s.id like 'demo-%';

with mb as (select current_setting('app.seed_business_id')::text as business_id)
delete from public.expense_categories s using mb
where s.business_id = mb.business_id
  and s.id like 'demo-%';

with mb as (select current_setting('app.seed_business_id')::text as business_id)
delete from public.product_categories s using mb
where s.business_id = mb.business_id
  and s.id like 'demo-%';

with mb as (select current_setting('app.seed_business_id')::text as business_id)
delete from public.case_statuses s using mb
where s.business_id = mb.business_id
  and s.id like 'demo-%';

with mb as (select current_setting('app.seed_business_id')::text as business_id)
delete from public.business_settings s using mb
where s.business_id = mb.business_id
  and s.id = 'global';

-- -------------------------------------------------------------------
-- Settings
-- -------------------------------------------------------------------

with mb as (select current_setting('app.seed_business_id')::text as business_id)
insert into public.order_statuses (id, business_id, data, created_by, updated_at)
select v.id, mb.business_id, v.data, current_setting('app.seed_email'), now()
from mb
cross join (
  values
    ('demo-order-status-new', $${
      "id":"demo-order-status-new","name":"New","color":"#3B82F6","order":1,"trackingStage":"received"
    }$$::jsonb),
    ('demo-order-status-processing', $${
      "id":"demo-order-status-processing","name":"Processing","color":"#F59E0B","order":2,"trackingStage":"processing"
    }$$::jsonb),
    ('demo-order-status-lens', $${
      "id":"demo-order-status-lens","name":"Lens Processing","color":"#8B5CF6","order":3,"trackingStage":"processing"
    }$$::jsonb),
    ('demo-order-status-qc', $${
      "id":"demo-order-status-qc","name":"Quality Check","color":"#38BDF8","order":4,"trackingStage":"processing"
    }$$::jsonb),
    ('demo-order-status-pending-delivery', $${
      "id":"demo-order-status-pending-delivery","name":"Pending Delivery","color":"#84CC16","order":5,"trackingStage":"out-for-delivery"
    }$$::jsonb),
    ('demo-order-status-dispatched', $${
      "id":"demo-order-status-dispatched","name":"Dispatched","color":"#F97316","order":6,"trackingStage":"out-for-delivery"
    }$$::jsonb),
    ('demo-order-status-delivery-confirmation', $${
      "id":"demo-order-status-delivery-confirmation","name":"Delivery Confirmation","color":"#EC4899","order":7,"trackingStage":"out-for-delivery"
    }$$::jsonb),
    ('demo-order-status-delivered', $${
      "id":"demo-order-status-delivered","name":"Delivered","color":"#10B981","order":8,"trackingStage":"delivered"
    }$$::jsonb),
    ('demo-order-status-completed', $${
      "id":"demo-order-status-completed","name":"Completed","color":"#22C55E","order":9,"trackingStage":"delivered"
    }$$::jsonb),
    ('demo-order-status-cancelled', $${
      "id":"demo-order-status-cancelled","name":"Cancelled","color":"#6B7280","order":10,"trackingStage":"cancelled"
    }$$::jsonb),
    ('demo-order-status-refunded', $${
      "id":"demo-order-status-refunded","name":"Refunded","color":"#EF4444","order":11,"trackingStage":"cancelled"
    }$$::jsonb)
) as v(id, data)
on conflict (id, business_id)
do update set data = excluded.data, updated_at = now();

with mb as (select current_setting('app.seed_business_id')::text as business_id)
insert into public.sale_sources (id, business_id, data, created_by, updated_at)
select v.id, mb.business_id, v.data, current_setting('app.seed_email'), now()
from mb
cross join (
  values
    ('demo-sale-source-instagram', $${"id":"demo-sale-source-instagram","name":"Instagram","icon":"instagram"}$$::jsonb),
    ('demo-sale-source-whatsapp', $${"id":"demo-sale-source-whatsapp","name":"WhatsApp","icon":"message-circle"}$$::jsonb),
    ('demo-sale-source-website', $${"id":"demo-sale-source-website","name":"Website","icon":"globe"}$$::jsonb),
    ('demo-sale-source-walkin', $${"id":"demo-sale-source-walkin","name":"Walk-in","icon":"store"}$$::jsonb),
    ('demo-sale-source-threads', $${"id":"demo-sale-source-threads","name":"Threads","icon":"at-sign"}$$::jsonb)
) as v(id, data)
on conflict (id, business_id)
do update set data = excluded.data, updated_at = now();

with mb as (select current_setting('app.seed_business_id')::text as business_id)
insert into public.payment_methods (id, business_id, data, created_by, updated_at)
select v.id, mb.business_id, v.data, current_setting('app.seed_email'), now()
from mb
cross join (
  values
    ('demo-payment-bank-transfer', $${"id":"demo-payment-bank-transfer","name":"Bank Transfer"}$$::jsonb),
    ('demo-payment-pos', $${"id":"demo-payment-pos","name":"POS"}$$::jsonb),
    ('demo-payment-cash', $${"id":"demo-payment-cash","name":"Cash"}$$::jsonb)
) as v(id, data)
on conflict (id, business_id)
do update set data = excluded.data, updated_at = now();

with mb as (select current_setting('app.seed_business_id')::text as business_id)
insert into public.logistics_carriers (id, business_id, data, created_by, updated_at)
select v.id, mb.business_id, v.data, current_setting('app.seed_email'), now()
from mb
cross join (
  values
    ('demo-logistics-gig', $${"id":"demo-logistics-gig","name":"GIG Logistics"}$$::jsonb),
    ('demo-logistics-kwik', $${"id":"demo-logistics-kwik","name":"Kwik Delivery"}$$::jsonb),
    ('demo-logistics-dhl', $${"id":"demo-logistics-dhl","name":"DHL"}$$::jsonb),
    ('demo-logistics-ftd', $${"id":"demo-logistics-ftd","name":"FTD"}$$::jsonb)
) as v(id, data)
on conflict (id, business_id)
do update set data = excluded.data, updated_at = now();

with mb as (select current_setting('app.seed_business_id')::text as business_id)
insert into public.product_variables (id, business_id, data, created_by, updated_at)
select v.id, mb.business_id, v.data, current_setting('app.seed_email'), now()
from mb
cross join (
  values
    ('demo-product-variable-color', $${"id":"demo-product-variable-color","name":"Color","values":["Black","Tortoise","Champagne","Grey","Blue","Gold","Silver","Green"]}$$::jsonb),
    ('demo-product-variable-size', $${"id":"demo-product-variable-size","name":"Size","values":["48-20","50-19","52-18","54-17","Medium","Large"]}$$::jsonb),
    ('demo-product-variable-material', $${"id":"demo-product-variable-material","name":"Material","values":["Acetate","Metal","TR90","Titanium"]}$$::jsonb)
) as v(id, data)
on conflict (id, business_id)
do update set data = excluded.data, updated_at = now();

with mb as (select current_setting('app.seed_business_id')::text as business_id)
insert into public.product_categories (id, business_id, data, created_by, updated_at)
select v.id, mb.business_id, v.data, current_setting('app.seed_email'), now()
from mb
cross join (
  values
    ('demo-category-optical', $${"id":"demo-category-optical","name":"Optical"}$$::jsonb),
    ('demo-category-sunglasses', $${"id":"demo-category-sunglasses","name":"Sunglasses"}$$::jsonb),
    ('demo-category-blue-light', $${"id":"demo-category-blue-light","name":"Blue-light"}$$::jsonb),
    ('demo-category-accessories', $${"id":"demo-category-accessories","name":"Accessories"}$$::jsonb),
    ('demo-category-skincare', $${"id":"demo-category-skincare","name":"Skincare"}$$::jsonb),
    ('demo-category-fragrance', $${"id":"demo-category-fragrance","name":"Fragrance"}$$::jsonb),
    ('demo-category-books', $${"id":"demo-category-books","name":"Books"}$$::jsonb),
    ('demo-category-home', $${"id":"demo-category-home","name":"Home"}$$::jsonb),
    ('demo-category-wellness', $${"id":"demo-category-wellness","name":"Wellness"}$$::jsonb),
    ('demo-category-jewelry', $${"id":"demo-category-jewelry","name":"Jewelry"}$$::jsonb),
    ('demo-category-bags', $${"id":"demo-category-bags","name":"Bags"}$$::jsonb),
    ('demo-category-tech', $${"id":"demo-category-tech","name":"Tech"}$$::jsonb),
    ('demo-category-services', $${"id":"demo-category-services","name":"Services"}$$::jsonb)
) as v(id, data)
on conflict (id, business_id)
do update set data = excluded.data, updated_at = now();

with mb as (select current_setting('app.seed_business_id')::text as business_id)
insert into public.expense_categories (id, business_id, data, created_by, updated_at)
select v.id, mb.business_id, v.data, current_setting('app.seed_email'), now()
from mb
cross join (
  values
    ('demo-expense-category-inventory', $${"id":"demo-expense-category-inventory","name":"Inventory"}$$::jsonb),
    ('demo-expense-category-marketing', $${"id":"demo-expense-category-marketing","name":"Marketing"}$$::jsonb),
    ('demo-expense-category-logistics', $${"id":"demo-expense-category-logistics","name":"Logistics"}$$::jsonb),
    ('demo-expense-category-rent', $${"id":"demo-expense-category-rent","name":"Rent"}$$::jsonb),
    ('demo-expense-category-utilities', $${"id":"demo-expense-category-utilities","name":"Utilities"}$$::jsonb),
    ('demo-expense-category-software', $${"id":"demo-expense-category-software","name":"Software"}$$::jsonb),
    ('demo-expense-category-salaries', $${"id":"demo-expense-category-salaries","name":"Salaries"}$$::jsonb)
) as v(id, data)
on conflict (id, business_id)
do update set data = excluded.data, updated_at = now();

with mb as (select current_setting('app.seed_business_id')::text as business_id)
insert into public.custom_services (id, business_id, data, created_by, updated_at)
select v.id, mb.business_id, v.data, current_setting('app.seed_email'), now()
from mb
cross join (
  values
    ('demo-service-eye-test', $${"id":"demo-service-eye-test","name":"Eye Test","defaultPrice":15000}$$::jsonb),
    ('demo-service-reglazing', $${"id":"demo-service-reglazing","name":"Lens Reglazing","defaultPrice":25000}$$::jsonb),
    ('demo-service-frame-repair', $${"id":"demo-service-frame-repair","name":"Frame Repair","defaultPrice":12000}$$::jsonb),
    ('demo-service-nose-pad', $${"id":"demo-service-nose-pad","name":"Nose Pad Replacement","defaultPrice":5000}$$::jsonb)
) as v(id, data)
on conflict (id, business_id)
do update set data = excluded.data, updated_at = now();

with mb as (select current_setting('app.seed_business_id')::text as business_id)
insert into public.case_statuses (id, business_id, data, created_by, updated_at)
select v.id, mb.business_id, v.data, current_setting('app.seed_email'), now()
from mb
cross join (
  values
    ('demo-case-status-open', $${"id":"demo-case-status-open","name":"Open","color":"#3B82F6","description":"New case raised","order":1}$$::jsonb),
    ('demo-case-status-review', $${"id":"demo-case-status-review","name":"Under Review","color":"#F59E0B","description":"Investigating issue","order":2}$$::jsonb),
    ('demo-case-status-awaiting', $${"id":"demo-case-status-awaiting","name":"Awaiting Customer","color":"#8B5CF6","description":"Waiting on customer response","order":3}$$::jsonb),
    ('demo-case-status-resolved', $${"id":"demo-case-status-resolved","name":"Resolved","color":"#10B981","description":"Resolution proposed","order":4}$$::jsonb),
    ('demo-case-status-closed', $${"id":"demo-case-status-closed","name":"Closed","color":"#6B7280","description":"Case closed","order":5}$$::jsonb)
) as v(id, data)
on conflict (id, business_id)
do update set data = excluded.data, updated_at = now();

with mb as (select current_setting('app.seed_business_id')::text as business_id)
insert into public.business_settings (id, business_id, data, created_by, updated_at)
select
  'global',
  mb.business_id,
  $${
    "id":"global",
    "useGlobalLowStockThreshold":false,
    "globalLowStockThreshold":5,
    "autoCompleteOrders":true,
    "autoCompleteAfterDays":10,
    "autoCompleteFromStatus":"Dispatched",
    "autoCompleteToStatus":"Delivery Confirmation",
    "orderAutomations":[
      {"id":"demo-automation-dispatched-followup","enabled":true,"fromStatus":"Dispatched","toStatus":"Delivery Confirmation","afterDays":10}
    ],
    "deliveryFollowUpEnabled":true,
    "deliveryFollowUpDelayDays":10,
    "deliveryFollowUpResendDays":3,
    "deliveryFollowUpFromName":"Fyll Test Ops",
    "orderTimelineSettings":{
      "warningThresholdPercent":80,
      "defaultOrderType":{"id":"timeline-rtw-ng","name":"RTW NG","minBusinessDays":3,"maxBusinessDays":7,"workflowStatusIds":["demo-order-status-new","demo-order-status-processing","demo-order-status-qc","demo-order-status-pending-delivery","demo-order-status-dispatched","demo-order-status-delivered"]},
      "orderTypes":[
        {"id":"timeline-rtw-ng","name":"RTW NG","minBusinessDays":3,"maxBusinessDays":7,"workflowStatusIds":["demo-order-status-new","demo-order-status-processing","demo-order-status-qc","demo-order-status-pending-delivery","demo-order-status-dispatched","demo-order-status-delivered"]},
        {"id":"timeline-custom-lens","name":"Custom Lens NG","minBusinessDays":7,"maxBusinessDays":13,"workflowStatusIds":["demo-order-status-new","demo-order-status-lens","demo-order-status-qc","demo-order-status-pending-delivery","demo-order-status-dispatched","demo-order-status-delivered"]},
        {"id":"timeline-priority","name":"Priority Express","minBusinessDays":2,"maxBusinessDays":4,"workflowStatusIds":["demo-order-status-new","demo-order-status-processing","demo-order-status-pending-delivery","demo-order-status-dispatched","demo-order-status-completed"]}
      ],
      "shippingZones":[
        {"id":"zone-lagos","name":"Lagos Metro","states":["Lagos"],"shippingFee":4500,"minBusinessDays":1,"maxBusinessDays":2},
        {"id":"zone-south-west","name":"South West","states":["Ogun","Oyo","Osun","Ondo","Ekiti"],"shippingFee":6500,"minBusinessDays":2,"maxBusinessDays":4},
        {"id":"zone-nationwide","name":"Nationwide","states":["FCT","Rivers","Enugu","Delta","Kaduna","Kano"],"shippingFee":8500,"minBusinessDays":3,"maxBusinessDays":7}
      ]
    },
    "financeSuppliers":[
      {"id":"demo-supplier-aro","name":"Aro Eyewear Enterprise","contactName":"Aro Supply Desk","email":"supply@aro-demo.com","paymentTerms":"50% upfront / 50% on delivery"},
      {"id":"demo-supplier-optix","name":"Optix Lens Lab","contactName":"Kemi Adedeji","email":"ops@optix-demo.com","paymentTerms":"14 days"},
      {"id":"demo-supplier-gig","name":"GIG Logistics","contactName":"Enterprise Support","email":"enterprise@gig-demo.com","paymentTerms":"Monthly"}
    ],
    "procurementStatusOptions":[
      {"id":"demo-proc-status-draft","name":"Draft","order":1,"color":"#9CA3AF"},
      {"id":"demo-proc-status-sent","name":"Sent","order":2,"color":"#3B82F6"},
      {"id":"demo-proc-status-confirmed","name":"Confirmed","order":3,"color":"#F59E0B"},
      {"id":"demo-proc-status-received","name":"Received","order":4,"color":"#10B981"},
      {"id":"demo-proc-status-cancelled","name":"Cancelled","order":5,"color":"#6B7280"}
    ],
    "fixedCosts":[
      {"id":"demo-fixed-rent","name":"Showroom Rent","category":"Rent","amount":350000,"frequency":"Monthly","supplierName":"Marina Property Co","notes":"Victoria Island showroom","createdAt":"2026-01-01T09:00:00.000Z","updatedAt":"2026-07-01T09:00:00.000Z"},
      {"id":"demo-fixed-software","name":"Software Stack","category":"Software","amount":95000,"frequency":"Monthly","supplierName":"Ops Tooling","notes":"Subscriptions and SaaS","createdAt":"2026-01-01T09:00:00.000Z","updatedAt":"2026-07-01T09:00:00.000Z"}
    ],
    "salaryTemplates":[
      {"id":"demo-salary-core","name":"Core Ops Payroll","category":"Salaries","lines":[
        {"id":"demo-salary-line-1","employeeName":"Bisi Ade","amount":180000},
        {"id":"demo-salary-line-2","employeeName":"John Eze","amount":220000},
        {"id":"demo-salary-line-3","employeeName":"Tara Obi","amount":165000}
      ],"notes":"Monthly salary template","createdAt":"2026-01-01T09:00:00.000Z","updatedAt":"2026-07-01T09:00:00.000Z"}
    ],
    "warehouseCategories":[
      {"id":"demo-warehouse-category-packaging","name":"Packaging"},
      {"id":"demo-warehouse-category-raw-material","name":"Raw Material"},
      {"id":"demo-warehouse-category-store","name":"Store Use"}
    ],
    "warehouseUnits":[
      {"id":"demo-warehouse-unit-pcs","name":"pcs"},
      {"id":"demo-warehouse-unit-pairs","name":"pairs"},
      {"id":"demo-warehouse-unit-rolls","name":"rolls"}
    ],
    "warehouseItems":[
      {"id":"demo-warehouse-item-case-box","name":"Hard Case Box","category":"Packaging","unit":"pcs","currentStock":220,"reorderLevel":80,"countFrequency":"Monthly","lastCountedAt":"2026-07-10T09:00:00.000Z","lastCountedBy":"Admin Test","notes":"Used for premium optical packaging","createdAt":"2026-02-12T09:00:00.000Z","updatedAt":"2026-07-10T09:00:00.000Z"},
      {"id":"demo-warehouse-item-microfiber","name":"Microfiber Cloth","category":"Packaging","unit":"pcs","currentStock":540,"reorderLevel":150,"countFrequency":"Monthly","lastCountedAt":"2026-07-10T09:00:00.000Z","lastCountedBy":"Admin Test","notes":"Branded cloth for orders","createdAt":"2026-02-12T09:00:00.000Z","updatedAt":"2026-07-10T09:00:00.000Z"},
      {"id":"demo-warehouse-item-photo-samples","name":"Content Sample Frames","category":"Store Use","unit":"pairs","currentStock":12,"reorderLevel":4,"countFrequency":"Bi-Monthly","lastCountedAt":"2026-07-05T09:00:00.000Z","lastCountedBy":"Admin Test","notes":"Not for sale; used for campaign shoots","createdAt":"2026-03-01T09:00:00.000Z","updatedAt":"2026-07-05T09:00:00.000Z"}
    ],
    "financeRules":{
      "vatRate":0.075,
      "bankChargeTiers":[
        {"id":"demo-bank-tier-1","maxAmount":5000,"fixedFee":10},
        {"id":"demo-bank-tier-2","maxAmount":50000,"fixedFee":25},
        {"id":"demo-bank-tier-3","maxAmount":null,"fixedFee":50}
      ],
      "revenueRules":[
        {"id":"demo-revenue-bank-transfer","name":"Bank Transfer Fees","channel":"Bank Transfer","percentFee":0,"flatFee":0,"enabled":true},
        {"id":"demo-revenue-pos","name":"POS Fees","channel":"POS","percentFee":1.5,"flatFee":100,"enabled":true}
      ],
      "incomingStampDuty":50
    }
  }$$::jsonb,
  current_setting('app.seed_email'),
  now()
from mb
on conflict (id, business_id)
do update set data = excluded.data, updated_at = now();

-- -------------------------------------------------------------------
-- Customers
-- -------------------------------------------------------------------

with mb as (select current_setting('app.seed_business_id')::text as business_id)
insert into public.customers (id, business_id, data, updated_at)
select v.id, mb.business_id, v.data, now()
from mb
cross join (
  values
    ('demo-customer-zainab', $${"id":"demo-customer-zainab","fullName":"Zainab Sarumi","email":"zainab.sarumi@example.com","phone":"+2347011100001","defaultAddress":"15 Admiralty Way, Lekki Phase 1","defaultState":"Lagos","createdAt":"2026-01-08T10:00:00.000Z"}$$::jsonb),
    ('demo-customer-maya', $${"id":"demo-customer-maya","fullName":"Maya Johnson","email":"maya.johnson@example.com","phone":"+2347011100002","defaultAddress":"2B Bourdillon Road, Ikoyi","defaultState":"Lagos","createdAt":"2026-01-12T10:00:00.000Z"}$$::jsonb),
    ('demo-customer-chuka', $${"id":"demo-customer-chuka","fullName":"Chuka Eze","email":"chuka.eze@example.com","phone":"+2347011100003","defaultAddress":"12 Stadium Road, Port Harcourt","defaultState":"Rivers","createdAt":"2026-02-02T10:00:00.000Z"}$$::jsonb),
    ('demo-customer-bruno', $${"id":"demo-customer-bruno","fullName":"Bruno Bernard","email":"bruno.bernard@example.com","phone":"+2347011100004","defaultAddress":"7 Independence Layout, Enugu","defaultState":"Enugu","createdAt":"2026-02-20T10:00:00.000Z"}$$::jsonb),
    ('demo-customer-favour', $${"id":"demo-customer-favour","fullName":"Favour Agbai","email":"favour.agbai@example.com","phone":"+2347011100005","defaultAddress":"44 Ring Road, Ibadan","defaultState":"Oyo","createdAt":"2026-03-10T10:00:00.000Z"}$$::jsonb),
    ('demo-customer-bolu', $${"id":"demo-customer-bolu","fullName":"Boluwatife Adegeye","email":"bolu.adeg@example.com","phone":"+2347011100006","defaultAddress":"56 GRA, Abeokuta","defaultState":"Ogun","createdAt":"2026-03-20T10:00:00.000Z"}$$::jsonb),
    ('demo-customer-kamal', $${"id":"demo-customer-kamal","fullName":"Kamaldeen Raji","email":"kamal.raji@example.com","phone":"+2347011100007","defaultAddress":"13 Wuse 2, Abuja","defaultState":"FCT","createdAt":"2026-04-11T10:00:00.000Z"}$$::jsonb),
    ('demo-customer-ngozi', $${"id":"demo-customer-ngozi","fullName":"Ngozi Nwosu","email":"ngozi.nwosu@example.com","phone":"+2347011100008","defaultAddress":"17 Awolowo Road, Ikoyi","defaultState":"Lagos","createdAt":"2026-05-15T10:00:00.000Z"}$$::jsonb)
) as v(id, data)
on conflict (id, business_id)
do update set data = excluded.data, updated_at = now();

-- -------------------------------------------------------------------
-- Products
-- -------------------------------------------------------------------

with mb as (select current_setting('app.seed_business_id')::text as business_id)
insert into public.products (id, business_id, data, updated_at)
select v.id, mb.business_id, v.data, now()
from mb
cross join (
  values
    ('demo-product-amina', $${
      "id":"demo-product-amina",
      "name":"Amina Cat Eye",
      "description":"Best-selling acetate cat eye for daily wear.",
      "categories":["Optical"],
      "variants":[
        {"id":"demo-variant-amina-black","sku":"AMINA-BLACK","barcode":"2001001001","variableValues":{"Color":"Black","Size":"52-18","Material":"Acetate"},"stock":14,"sellingPrice":38000,"imageUrl":"https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=1200&q=80"},
        {"id":"demo-variant-amina-tortoise","sku":"AMINA-TORTOISE","barcode":"2001001002","variableValues":{"Color":"Tortoise","Size":"52-18","Material":"Acetate"},"stock":9,"sellingPrice":38000,"imageUrl":"https://images.unsplash.com/photo-1577803645773-f96470509666?auto=format&fit=crop&w=1200&q=80"}
      ],
      "lowStockThreshold":5,
      "createdAt":"2026-01-10T09:00:00.000Z",
      "productType":"product",
      "imageUrl":"https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=1200&q=80",
      "createdBy":"Admin Test",
      "useGlobalStock":false,
      "isNewDesign":true,
      "designYear":2026,
      "designLaunchedAt":"2026-01-10T09:00:00.000Z"
    }$$::jsonb),
    ('demo-product-zuri', $${
      "id":"demo-product-zuri",
      "name":"Zuri Square",
      "description":"Clean square optical frame in lightweight TR90.",
      "categories":["Optical","Blue-light"],
      "variants":[
        {"id":"demo-variant-zuri-grey","sku":"ZURI-GREY","barcode":"2001001003","variableValues":{"Color":"Grey","Size":"50-19","Material":"TR90"},"stock":11,"sellingPrice":42000,"imageUrl":"https://images.unsplash.com/photo-1591076482161-42ce6da69f67?auto=format&fit=crop&w=1200&q=80"},
        {"id":"demo-variant-zuri-champagne","sku":"ZURI-CHAMPAGNE","barcode":"2001001004","variableValues":{"Color":"Champagne","Size":"50-19","Material":"TR90"},"stock":6,"sellingPrice":42000,"imageUrl":"https://images.unsplash.com/photo-1589782182703-2aaa69037b5b?auto=format&fit=crop&w=1200&q=80"}
      ],
      "lowStockThreshold":4,
      "createdAt":"2026-01-18T09:00:00.000Z",
      "productType":"product",
      "imageUrl":"https://images.unsplash.com/photo-1591076482161-42ce6da69f67?auto=format&fit=crop&w=1200&q=80",
      "createdBy":"Admin Test",
      "useGlobalStock":false
    }$$::jsonb),
    ('demo-product-atlas', $${
      "id":"demo-product-atlas",
      "name":"Atlas Aviator",
      "description":"Metal aviator for bright outdoor days.",
      "categories":["Sunglasses"],
      "variants":[
        {"id":"demo-variant-atlas-gold","sku":"ATLAS-GOLD","barcode":"2001001005","variableValues":{"Color":"Gold","Size":"54-17","Material":"Metal"},"stock":7,"sellingPrice":46000,"imageUrl":"https://images.unsplash.com/photo-1572635196237-14b3f281503f?auto=format&fit=crop&w=1200&q=80"},
        {"id":"demo-variant-atlas-silver","sku":"ATLAS-SILVER","barcode":"2001001006","variableValues":{"Color":"Silver","Size":"54-17","Material":"Metal"},"stock":4,"sellingPrice":46000,"imageUrl":"https://images.unsplash.com/photo-1511920170033-f8396924c348?auto=format&fit=crop&w=1200&q=80"}
      ],
      "lowStockThreshold":3,
      "createdAt":"2026-02-01T09:00:00.000Z",
      "productType":"product",
      "imageUrl":"https://images.unsplash.com/photo-1572635196237-14b3f281503f?auto=format&fit=crop&w=1200&q=80",
      "createdBy":"Admin Test",
      "useGlobalStock":false
    }$$::jsonb),
    ('demo-product-kairo', $${
      "id":"demo-product-kairo",
      "name":"Kairo Blue-Light",
      "description":"Slim blue-light filter frame for screen-heavy days.",
      "categories":["Blue-light","Optical"],
      "variants":[
        {"id":"demo-variant-kairo-black","sku":"KAIRO-BLACK","barcode":"2001001007","variableValues":{"Color":"Black","Size":"48-20","Material":"Titanium"},"stock":8,"sellingPrice":52000,"imageUrl":"https://images.unsplash.com/photo-1574258495973-f010dfbb5371?auto=format&fit=crop&w=1200&q=80"},
        {"id":"demo-variant-kairo-green","sku":"KAIRO-GREEN","barcode":"2001001008","variableValues":{"Color":"Green","Size":"48-20","Material":"Titanium"},"stock":5,"sellingPrice":52000,"imageUrl":"https://images.unsplash.com/photo-1508296695146-257a814070b4?auto=format&fit=crop&w=1200&q=80"}
      ],
      "lowStockThreshold":3,
      "createdAt":"2026-02-12T09:00:00.000Z",
      "productType":"product",
      "imageUrl":"https://images.unsplash.com/photo-1574258495973-f010dfbb5371?auto=format&fit=crop&w=1200&q=80",
      "createdBy":"Admin Test",
      "useGlobalStock":false
    }$$::jsonb),
    ('demo-product-spray', $${
      "id":"demo-product-spray",
      "name":"Lens Cleaning Spray",
      "description":"Compact anti-streak spray for coated lenses.",
      "categories":["Accessories"],
      "variants":[
        {"id":"demo-variant-spray-15ml","sku":"SPRAY-15ML","barcode":"2001001009","variableValues":{"Size":"Medium"},"stock":32,"sellingPrice":4500,"imageUrl":"https://images.unsplash.com/photo-1585386959984-a41552231658?auto=format&fit=crop&w=1200&q=80"}
      ],
      "lowStockThreshold":10,
      "createdAt":"2026-02-28T09:00:00.000Z",
      "productType":"product",
      "imageUrl":"https://images.unsplash.com/photo-1585386959984-a41552231658?auto=format&fit=crop&w=1200&q=80",
      "createdBy":"Admin Test",
      "useGlobalStock":true,
      "globalStock":32
    }$$::jsonb),
    ('demo-product-case', $${
      "id":"demo-product-case",
      "name":"Premium Hard Case",
      "description":"Structured protective case for optical and sunglass orders.",
      "categories":["Accessories"],
      "variants":[
        {"id":"demo-variant-case-black","sku":"CASE-BLACK","barcode":"2001001010","variableValues":{"Color":"Black"},"stock":24,"sellingPrice":6500,"imageUrl":"https://images.unsplash.com/photo-1625591340248-6d4d4d93cf9d?auto=format&fit=crop&w=1200&q=80"}
      ],
      "lowStockThreshold":8,
      "createdAt":"2026-03-04T09:00:00.000Z",
      "productType":"product",
      "imageUrl":"https://images.unsplash.com/photo-1625591340248-6d4d4d93cf9d?auto=format&fit=crop&w=1200&q=80",
      "createdBy":"Admin Test",
      "useGlobalStock":true,
      "globalStock":24
    }$$::jsonb),
    ('demo-service-eyecare', $${
      "id":"demo-service-eyecare",
      "name":"Comprehensive Eye Test",
      "description":"In-store eye test with consultation and prescription summary.",
      "categories":["Services"],
      "variants":[
        {"id":"demo-service-eyecare-main","sku":"SERVICE-EYECARE","barcode":"2001001011","variableValues":{},"stock":0,"sellingPrice":15000}
      ],
      "lowStockThreshold":0,
      "createdAt":"2026-03-12T09:00:00.000Z",
      "productType":"service",
      "createdBy":"Admin Test",
      "serviceUsesGlobalPricing":true,
      "serviceTags":["clinic","consultation"],
      "serviceVariables":[
        {"id":"demo-service-var-visit","name":"Visit Type","type":"Select","options":["Walk-in","Appointment"],"required":true,"defaultValue":"Appointment"}
      ],
      "serviceFields":[
        {"id":"demo-service-field-date","label":"Appointment Date","type":"Date","required":true},
        {"id":"demo-service-field-time","label":"Appointment Time","type":"Time","required":true}
      ]
    }$$::jsonb)
) as v(id, data)
on conflict (id, business_id)
do update set data = excluded.data, updated_at = now();

-- Add 43 varied retail products to the six physical products and one service
-- above, giving the showcase business exactly 50 catalog records.
with
  mb as (select current_setting('app.seed_business_id')::text as business_id),
  catalog(n, name, category, price, stock, description, image_url) as (
    values
      (1, 'Dewdrop Gel Cleanser', 'Skincare', 12500, 28, 'A gentle daily gel cleanser for balanced, refreshed skin.', 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?auto=format&fit=crop&w=1200&q=80'),
      (2, 'Cloud Milk Cleanser', 'Skincare', 14500, 19, 'A creamy low-foam cleanser for dry and sensitive skin.', 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?auto=format&fit=crop&w=1200&q=80'),
      (3, 'Vitamin C Brightening Serum', 'Skincare', 18500, 16, 'A lightweight antioxidant serum for a brighter-looking complexion.', 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?auto=format&fit=crop&w=1200&q=80'),
      (4, 'Barrier Repair Moisturiser', 'Skincare', 16800, 22, 'Ceramide-rich daily moisture support with a soft finish.', 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?auto=format&fit=crop&w=1200&q=80'),
      (5, 'Daily Veil SPF 50', 'Skincare', 15500, 31, 'Broad-spectrum facial sunscreen with no heavy residue.', 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?auto=format&fit=crop&w=1200&q=80'),
      (6, 'Rosewater Hydrating Mist', 'Skincare', 9500, 12, 'A fine hydrating mist for a quick midday refresh.', 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?auto=format&fit=crop&w=1200&q=80'),
      (7, 'Overnight Renewal Mask', 'Skincare', 21000, 7, 'A nourishing overnight mask for softer-feeling skin by morning.', 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?auto=format&fit=crop&w=1200&q=80'),
      (8, 'Shea Lip Treatment', 'Skincare', 6500, 38, 'A rich conditioning balm for smooth, comfortable lips.', 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?auto=format&fit=crop&w=1200&q=80'),
      (9, 'Amber No. 7 Eau de Parfum', 'Fragrance', 42000, 14, 'Warm amber, vanilla and soft woods in a lasting eau de parfum.', 'https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=1200&q=80'),
      (10, 'Citrus Grove Eau de Parfum', 'Fragrance', 38500, 11, 'Bright bergamot, neroli and green citrus notes.', 'https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=1200&q=80'),
      (11, 'Midnight Oud Parfum Oil', 'Fragrance', 28000, 9, 'A concentrated roll-on blend of oud, spice and musk.', 'https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=1200&q=80'),
      (12, 'Soft Linen Body Mist', 'Fragrance', 14500, 26, 'A clean floral body mist for everyday layering.', 'https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=1200&q=80'),
      (13, 'Coastal Fig Eau de Parfum', 'Fragrance', 39500, 8, 'Green fig, sea salt and cedar with a smooth dry-down.', 'https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=1200&q=80'),
      (14, 'Discovery Scent Set', 'Fragrance', 22000, 18, 'Six miniature fragrances for sampling or gifting.', 'https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=1200&q=80'),
      (15, 'The Quiet Morning', 'Books', 8500, 24, 'A reflective guide to building calm and intentional routines.', 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=1200&q=80'),
      (16, 'Notes on Building Well', 'Books', 11000, 17, 'Practical essays on thoughtful products, teams and businesses.', 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=1200&q=80'),
      (17, 'A Table for Everyone', 'Books', 13500, 13, 'A modern cookbook for generous weeknight meals and gatherings.', 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=1200&q=80'),
      (18, 'Small Spaces, Beautiful Living', 'Books', 16500, 10, 'Design ideas for warm, functional and expressive small homes.', 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=1200&q=80'),
      (19, 'The Creative Practice Journal', 'Books', 7500, 33, 'A guided journal with prompts for consistent creative work.', 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=1200&q=80'),
      (20, 'Lagos in Colour', 'Books', 24000, 6, 'A photographic celebration of the city, its people and textures.', 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=1200&q=80'),
      (21, 'Silk Twill Scarf', 'Accessories', 18500, 15, 'A printed square scarf for styling around the neck, hair or bag.', 'https://images.unsplash.com/photo-1523779917675-b6ed3a42a561?auto=format&fit=crop&w=1200&q=80'),
      (22, 'Classic Leather Cardholder', 'Accessories', 15000, 21, 'A slim leather cardholder with four slots and a centre pocket.', 'https://images.unsplash.com/photo-1523779917675-b6ed3a42a561?auto=format&fit=crop&w=1200&q=80'),
      (23, 'Everyday Canvas Cap', 'Accessories', 9000, 29, 'A softly structured cotton cap with an adjustable back strap.', 'https://images.unsplash.com/photo-1523779917675-b6ed3a42a561?auto=format&fit=crop&w=1200&q=80'),
      (24, 'Ribbed Cotton Socks Set', 'Accessories', 7800, 35, 'Three pairs of breathable ribbed socks in neutral tones.', 'https://images.unsplash.com/photo-1523779917675-b6ed3a42a561?auto=format&fit=crop&w=1200&q=80'),
      (25, 'Travel Jewellery Case', 'Accessories', 17500, 12, 'A compact zipped organiser for rings, earrings and chains.', 'https://images.unsplash.com/photo-1523779917675-b6ed3a42a561?auto=format&fit=crop&w=1200&q=80'),
      (26, 'Woven Key Loop', 'Accessories', 5500, 42, 'A durable woven wrist loop with a polished metal clasp.', 'https://images.unsplash.com/photo-1523779917675-b6ed3a42a561?auto=format&fit=crop&w=1200&q=80'),
      (27, 'Compact Pocket Mirror', 'Accessories', 6000, 27, 'A slim double mirror designed for bags and travel kits.', 'https://images.unsplash.com/photo-1523779917675-b6ed3a42a561?auto=format&fit=crop&w=1200&q=80'),
      (28, 'Sandalwood Ceramic Candle', 'Home', 16500, 20, 'A hand-poured candle with sandalwood, tonka and amber notes.', 'https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&w=1200&q=80'),
      (29, 'Linen Room Spray', 'Home', 12000, 23, 'A fresh room mist with cotton blossom and white tea.', 'https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&w=1200&q=80'),
      (30, 'Speckled Stoneware Mug', 'Home', 10500, 16, 'A handmade-style stoneware mug with a tactile glazed finish.', 'https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&w=1200&q=80'),
      (31, 'Woven Catchall Basket', 'Home', 19500, 8, 'A natural fibre basket for shelves, desks or bedside storage.', 'https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&w=1200&q=80'),
      (32, 'Marble Incense Holder', 'Home', 13500, 5, 'A weighty stone incense holder with subtle natural variation.', 'https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&w=1200&q=80'),
      (33, 'Calm Evening Tea Blend', 'Wellness', 8500, 30, 'A caffeine-free blend of chamomile, lemongrass and mint.', 'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=1200&q=80'),
      (34, 'Eucalyptus Bath Salts', 'Wellness', 11000, 17, 'Mineral bath salts scented with eucalyptus and rosemary.', 'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=1200&q=80'),
      (35, 'Cork Yoga Block', 'Wellness', 12500, 14, 'A firm natural cork support for stretching and yoga practice.', 'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=1200&q=80'),
      (36, 'Satin Sleep Mask', 'Wellness', 9500, 25, 'A softly padded sleep mask with a comfortable elastic strap.', 'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=1200&q=80'),
      (37, 'Sculpted Gold Hoop Earrings', 'Jewelry', 22500, 11, 'Polished sculptural hoops with a lightweight feel.', 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=1200&q=80'),
      (38, 'Fine Chain Pendant', 'Jewelry', 28000, 7, 'A delicate adjustable chain with a minimal polished pendant.', 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=1200&q=80'),
      (39, 'Stacking Ring Trio', 'Jewelry', 19500, 9, 'Three slim rings designed to wear together or separately.', 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=1200&q=80'),
      (40, 'Market Day Canvas Tote', 'Bags', 14000, 32, 'A roomy heavyweight canvas tote with an interior pocket.', 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=1200&q=80'),
      (41, 'Mini Crossbody Bag', 'Bags', 32000, 10, 'A compact structured crossbody with an adjustable strap.', 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=1200&q=80'),
      (42, 'Portable Bluetooth Speaker', 'Tech', 36000, 13, 'A compact wireless speaker with clear sound and all-day battery.', 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1200&q=80'),
      (43, 'Braided USB-C Cable', 'Tech', 8500, 40, 'A durable fast-charging cable with reinforced braided housing.', 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1200&q=80')
  ),
  product_images(images) as (
    values (array[
      'https://images.unsplash.com/photo-1556228578-8c89e6adf883?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1611930022073-b7a4ba5fcccd?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1570194065650-d99fb4b38b7b?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1601049541289-9b1b7bbbfe19?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1594035910387-fea47794261f?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1588405748880-12d1d2a59f75?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1610461888750-10bfc601b874?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1595425970377-c9703cf48b6d?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1585386959984-a41552231658?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1495446815901-a7297e633e8d?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1511108690759-009324a90311?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1532012197267-da84d127e765?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1523779917675-b6ed3a42a561?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1521369909029-2afed882baee?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1586350977771-b3b0abd50c82?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1617038260897-41a1f14a8f59?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1606760227091-3dd870d97f1d?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1619451334792-150fd785ee74?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1602874801006-e26b78b9b64b?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1618220179428-22790b461013?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1594631252845-29fc4cc8cde9?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1575410229391-19b4da01cc94?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1599447421416-3414500d18a5?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1515377905703-c4788e51af15?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1615526675159-e248c3021d3f?auto=format&fit=crop&w=1200&q=80'
    ]::text[])
  )
insert into public.products (id, business_id, data, updated_at)
select
  format('demo-product-catalog-%s', lpad(catalog.n::text, 3, '0')),
  mb.business_id,
  jsonb_build_object(
    'id', format('demo-product-catalog-%s', lpad(catalog.n::text, 3, '0')),
    'name', catalog.name,
    'description', catalog.description,
    'categories', jsonb_build_array(catalog.category),
    'variants', jsonb_build_array(jsonb_build_object(
      'id', format('demo-variant-catalog-%s', lpad(catalog.n::text, 3, '0')),
      'sku', format('CAT-%s', lpad(catalog.n::text, 4, '0')),
      'barcode', format('300200%s', lpad(catalog.n::text, 4, '0')),
      'variableValues', '{}'::jsonb,
      'stock', catalog.stock,
      'sellingPrice', catalog.price,
      'imageUrl', product_images.images[catalog.n]
    )),
    'lowStockThreshold', 5,
    'createdAt', now() - make_interval(days => 120 - (catalog.n * 2)),
    'productType', 'product',
    'imageUrl', product_images.images[catalog.n],
    'createdBy', 'Admin Demo',
    'useGlobalStock', true,
    'globalStock', catalog.stock
  ),
  now()
from mb
cross join catalog
cross join product_images
on conflict (id, business_id)
do update set data = excluded.data, updated_at = excluded.updated_at;

-- -------------------------------------------------------------------
-- Orders
-- -------------------------------------------------------------------

with mb as (select current_setting('app.seed_business_id')::text as business_id)
insert into public.orders (id, business_id, data, updated_at)
select v.id, mb.business_id, v.data, now()
from mb
cross join (
  values
    ('demo-order-001', $${
      "id":"demo-order-001","orderNumber":"ORD-510819","customerTrackingCode":"TRK510819","customerId":"demo-customer-zainab","customerName":"Zainab Sarumi","customerEmail":"zainab.sarumi@example.com","customerPhone":"+2347011100001","deliveryState":"Lagos","deliveryAddress":"15 Admiralty Way, Lekki Phase 1","items":[{"productId":"demo-product-amina","variantId":"demo-variant-amina-black","quantity":1,"unitPrice":38000},{"productId":"demo-product-spray","variantId":"demo-variant-spray-15ml","quantity":1,"unitPrice":4500}],"services":[],"additionalCharges":0,"additionalChargesNote":"","deliveryFee":4500,"orderTypeId":"timeline-rtw-ng","orderTypeName":"RTW NG","paymentMethod":"Bank Transfer","orderClassification":"Sale","status":"Processing","source":"Instagram","subtotal":42500,"totalAmount":47000,"orderDate":"2026-07-07T10:00:00.000Z","createdAt":"2026-07-07T10:00:00.000Z","updatedAt":"2026-07-07T11:00:00.000Z","createdBy":"Admin Test","updatedBy":"Admin Test","activityLog":[{"staffName":"Admin Test","action":"Created order","date":"2026-07-07T10:00:00.000Z"},{"staffName":"Admin Test","action":"Updated status to Processing","date":"2026-07-07T11:00:00.000Z"}]
    }$$::jsonb),
    ('demo-order-002', $${
      "id":"demo-order-002","orderNumber":"ORD-080918","customerTrackingCode":"TRK080918","customerId":"demo-customer-bruno","customerName":"Bruno Bernard","customerEmail":"bruno.bernard@example.com","customerPhone":"+2347011100004","deliveryState":"Enugu","deliveryAddress":"7 Independence Layout, Enugu","items":[{"productId":"demo-product-zuri","variantId":"demo-variant-zuri-grey","quantity":1,"unitPrice":42000}],"services":[],"additionalCharges":3000,"additionalChargesNote":"Blue-cut upgrade","deliveryFee":8500,"orderTypeId":"timeline-custom-lens","orderTypeName":"Custom Lens NG","paymentMethod":"Bank Transfer","orderClassification":"Sale","status":"Lens Processing","source":"Website","subtotal":42000,"totalAmount":53500,"orderDate":"2026-07-06T14:00:00.000Z","createdAt":"2026-07-06T14:00:00.000Z","updatedAt":"2026-07-08T09:00:00.000Z","createdBy":"Admin Test","updatedBy":"Lab Team","activityLog":[{"staffName":"Admin Test","action":"Created order","date":"2026-07-06T14:00:00.000Z"},{"staffName":"Lab Team","action":"Updated status to Lens Processing","date":"2026-07-08T09:00:00.000Z"}]
    }$$::jsonb),
    ('demo-order-003', $${
      "id":"demo-order-003","orderNumber":"ORD-494148","customerTrackingCode":"TRK494148","customerId":"demo-customer-favour","customerName":"Favour Agbai","customerEmail":"favour.agbai@example.com","customerPhone":"+2347011100005","deliveryState":"Oyo","deliveryAddress":"44 Ring Road, Ibadan","items":[{"productId":"demo-product-atlas","variantId":"demo-variant-atlas-gold","quantity":1,"unitPrice":46000}],"services":[],"additionalCharges":0,"additionalChargesNote":"","deliveryFee":6500,"orderTypeId":"timeline-rtw-ng","orderTypeName":"RTW NG","paymentMethod":"POS","orderClassification":"Sale","logistics":{"carrierId":"demo-logistics-gig","carrierName":"GIG Logistics","trackingNumber":"GIG78420011","dispatchDate":"2026-07-09","datePickedUp":"2026-07-09"},"status":"Dispatched","source":"Instagram","subtotal":46000,"totalAmount":52500,"orderDate":"2026-07-04T12:00:00.000Z","createdAt":"2026-07-04T12:00:00.000Z","updatedAt":"2026-07-09T13:00:00.000Z","createdBy":"Admin Test","updatedBy":"Ops Lead","activityLog":[{"staffName":"Admin Test","action":"Created order","date":"2026-07-04T12:00:00.000Z"},{"staffName":"Ops Lead","action":"Updated status to Dispatched","date":"2026-07-09T13:00:00.000Z"}]
    }$$::jsonb),
    ('demo-order-004', $${
      "id":"demo-order-004","orderNumber":"ORD-022064","customerTrackingCode":"TRK022064","customerId":"demo-customer-kamal","customerName":"Kamaldeen Raji","customerEmail":"kamal.raji@example.com","customerPhone":"+2347011100007","deliveryState":"FCT","deliveryAddress":"13 Wuse 2, Abuja","items":[{"productId":"demo-product-kairo","variantId":"demo-variant-kairo-black","quantity":1,"unitPrice":52000},{"productId":"demo-product-case","variantId":"demo-variant-case-black","quantity":1,"unitPrice":6500}],"services":[],"additionalCharges":0,"additionalChargesNote":"","deliveryFee":8500,"orderTypeId":"timeline-rtw-ng","orderTypeName":"RTW NG","paymentMethod":"Bank Transfer","orderClassification":"Sale","logistics":{"carrierId":"demo-logistics-dhl","carrierName":"DHL","trackingNumber":"DHL-ABJ-2291","dispatchDate":"2026-07-02","datePickedUp":"2026-07-02"},"status":"Delivery Confirmation","source":"Website","subtotal":58500,"totalAmount":67000,"orderDate":"2026-07-02T16:00:00.000Z","createdAt":"2026-07-02T16:00:00.000Z","updatedAt":"2026-07-12T10:00:00.000Z","createdBy":"Admin Test","updatedBy":"Automation","deliveryConfirmationStatus":"requested","deliveryConfirmationRequestedAt":"2026-07-12T10:00:00.000Z","activityLog":[{"staffName":"Admin Test","action":"Created order","date":"2026-07-02T16:00:00.000Z"},{"staffName":"Ops Lead","action":"Updated status to Dispatched","date":"2026-07-02T18:00:00.000Z"},{"staffName":"Automation","action":"Updated status to Delivery Confirmation","date":"2026-07-12T10:00:00.000Z"}]
    }$$::jsonb),
    ('demo-order-005', $${
      "id":"demo-order-005","orderNumber":"ORD-120778","customerTrackingCode":"TRK120778","customerId":"demo-customer-bruno","customerName":"Bruno Bernard","customerEmail":"bruno.bernard@example.com","customerPhone":"+2347011100004","deliveryState":"Enugu","deliveryAddress":"7 Independence Layout, Enugu","items":[{"productId":"demo-product-zuri","variantId":"demo-variant-zuri-champagne","quantity":1,"unitPrice":42000}],"services":[],"additionalCharges":0,"additionalChargesNote":"","deliveryFee":8500,"orderTypeId":"timeline-rtw-ng","orderTypeName":"RTW NG","paymentMethod":"Bank Transfer","orderClassification":"Sale","logistics":{"carrierId":"demo-logistics-gig","carrierName":"GIG Logistics","trackingNumber":"GIG78419902","dispatchDate":"2026-06-14","datePickedUp":"2026-06-14"},"status":"Delivered","source":"Website","subtotal":42000,"totalAmount":50500,"orderDate":"2026-06-12T10:00:00.000Z","createdAt":"2026-06-12T10:00:00.000Z","updatedAt":"2026-06-18T14:00:00.000Z","createdBy":"Admin Test","updatedBy":"Ops Lead","deliveryConfirmationStatus":"confirmed","deliveryConfirmationRequestedAt":"2026-06-17T09:00:00.000Z","deliveryConfirmationConfirmedAt":"2026-06-18T14:00:00.000Z","activityLog":[{"staffName":"Admin Test","action":"Created order","date":"2026-06-12T10:00:00.000Z"},{"staffName":"Ops Lead","action":"Updated status to Delivered","date":"2026-06-18T14:00:00.000Z"}]
    }$$::jsonb),
    ('demo-order-006', $${
      "id":"demo-order-006","orderNumber":"ORD-161361","customerTrackingCode":"TRK161361","customerId":"demo-customer-maya","customerName":"Maya Johnson","customerEmail":"maya.johnson@example.com","customerPhone":"+2347011100002","deliveryState":"Lagos","deliveryAddress":"2B Bourdillon Road, Ikoyi","items":[],"services":[{"serviceId":"demo-service-eye-test","name":"Eye Test","price":15000}],"additionalCharges":0,"additionalChargesNote":"","deliveryFee":0,"orderTypeId":"timeline-priority","orderTypeName":"Priority Express","paymentMethod":"Cash","orderClassification":"Sale","status":"Completed","source":"Walk-in","subtotal":0,"totalAmount":15000,"orderDate":"2026-06-16T13:00:00.000Z","createdAt":"2026-06-16T13:00:00.000Z","updatedAt":"2026-06-16T14:00:00.000Z","createdBy":"Admin Test","updatedBy":"Admin Test","activityLog":[{"staffName":"Admin Test","action":"Created order","date":"2026-06-16T13:00:00.000Z"},{"staffName":"Admin Test","action":"Completed service order","date":"2026-06-16T14:00:00.000Z"}]
    }$$::jsonb),
    ('demo-order-007', $${
      "id":"demo-order-007","orderNumber":"ORD-772513","customerTrackingCode":"TRK772513","customerId":"demo-customer-chuka","customerName":"Chuka Eze","customerEmail":"chuka.eze@example.com","customerPhone":"+2347011100003","deliveryState":"Rivers","deliveryAddress":"12 Stadium Road, Port Harcourt","items":[{"productId":"demo-product-amina","variantId":"demo-variant-amina-tortoise","quantity":1,"unitPrice":38000}],"services":[],"additionalCharges":2000,"additionalChargesNote":"Photochromic add-on","deliveryFee":8500,"orderTypeId":"timeline-custom-lens","orderTypeName":"Custom Lens NG","paymentMethod":"Bank Transfer","orderClassification":"Sale","status":"Refunded","source":"WhatsApp","subtotal":38000,"totalAmount":48500,"orderDate":"2026-05-21T09:00:00.000Z","createdAt":"2026-05-21T09:00:00.000Z","updatedAt":"2026-05-28T10:00:00.000Z","createdBy":"Admin Test","updatedBy":"Finance","refund":{"id":"demo-refund-001","orderId":"demo-order-007","amount":48500,"date":"2026-05-28T10:00:00.000Z","reason":"Customer requested cancellation before dispatch","createdAt":"2026-05-28T10:00:00.000Z"},"activityLog":[{"staffName":"Admin Test","action":"Created order","date":"2026-05-21T09:00:00.000Z"},{"staffName":"Finance","action":"Refunded order","date":"2026-05-28T10:00:00.000Z"}]
    }$$::jsonb),
    ('demo-order-008', $${
      "id":"demo-order-008","orderNumber":"ORD-865691","customerTrackingCode":"TRK865691","customerId":"demo-customer-ngozi","customerName":"Ngozi Nwosu","customerEmail":"ngozi.nwosu@example.com","customerPhone":"+2347011100008","deliveryState":"Lagos","deliveryAddress":"17 Awolowo Road, Ikoyi","items":[{"productId":"demo-product-kairo","variantId":"demo-variant-kairo-green","quantity":1,"unitPrice":52000},{"productId":"demo-product-spray","variantId":"demo-variant-spray-15ml","quantity":2,"unitPrice":4500}],"services":[],"additionalCharges":0,"additionalChargesNote":"","deliveryFee":4500,"orderTypeId":"timeline-rtw-ng","orderTypeName":"RTW NG","paymentMethod":"POS","orderClassification":"PR","status":"Quality Check","source":"Threads","subtotal":61000,"totalAmount":65500,"orderDate":"2026-07-10T15:00:00.000Z","createdAt":"2026-07-10T15:00:00.000Z","updatedAt":"2026-07-11T09:00:00.000Z","createdBy":"Admin Test","updatedBy":"QC Team","activityLog":[{"staffName":"Admin Test","action":"Created order","date":"2026-07-10T15:00:00.000Z"},{"staffName":"QC Team","action":"Updated status to Quality Check","date":"2026-07-11T09:00:00.000Z"}],"qcVerified":true,"qcVerifiedBy":"QC Team","qcVerifiedAt":"2026-07-11T09:15:00.000Z","qcChecklist":["lens-clean","frame-polish"],"qcNote":"Ready for dispatch"
    }$$::jsonb)
) as v(id, data)
on conflict (id, business_id)
do update set data = excluded.data, updated_at = now();

-- -------------------------------------------------------------------
-- Procurements
-- -------------------------------------------------------------------

with mb as (select current_setting('app.seed_business_id')::text as business_id)
insert into public.procurements (id, business_id, data, updated_at)
select v.id, mb.business_id, v.data, now()
from mb
cross join (
  values
    ('demo-procurement-june-optical', $${
      "id":"demo-procurement-june-optical",
      "title":"June Optical Replenishment",
      "supplierName":"Aro Eyewear Enterprise",
      "items":[
        {"productId":"demo-product-amina","variantId":"demo-variant-amina-black","quantity":8,"costAtPurchase":160000,"productName":"Amina Cat Eye","variantName":"Black","quantityReceived":8,"unitCost":20000,"currentSellingPrice":38000,"paymentDate":"2026-06-02","status":"Received","landedUnitCost":21800,"expectedProfit":129600,"properties":["Acetate","Optical"],"isSample":false},
        {"productId":"demo-product-zuri","variantId":"demo-variant-zuri-grey","quantity":6,"costAtPurchase":132000,"productName":"Zuri Square","variantName":"Grey","quantityReceived":6,"unitCost":22000,"currentSellingPrice":42000,"paymentDate":"2026-06-02","status":"Received","landedUnitCost":24100,"expectedProfit":107400,"properties":["TR90","Blue-light"],"isSample":false}
      ],
      "totalCost":292000,
      "notes":"Core optical restock for July sales push.",
      "createdAt":"2026-06-02T09:00:00.000Z",
      "createdBy":"Admin Test"
    }$$::jsonb),
    ('demo-procurement-june-samples', $${
      "id":"demo-procurement-june-samples",
      "title":"Campaign Sample Frames",
      "supplierName":"Aro Eyewear Enterprise",
      "items":[
        {"productId":"demo-product-amina","variantId":"demo-variant-amina-tortoise","quantity":1,"costAtPurchase":18000,"productName":"Amina Cat Eye","variantName":"Tortoise","quantityReceived":1,"unitCost":18000,"currentSellingPrice":38000,"paymentDate":"2026-06-12","status":"Received","landedUnitCost":19500,"expectedProfit":0,"properties":["Content","Sample"],"isSample":true},
        {"productId":"demo-product-atlas","variantId":"demo-variant-atlas-gold","quantity":1,"costAtPurchase":21000,"productName":"Atlas Aviator","variantName":"Gold","quantityReceived":1,"unitCost":21000,"currentSellingPrice":46000,"paymentDate":"2026-06-12","status":"Received","landedUnitCost":22600,"expectedProfit":0,"properties":["Campaign","Sample"],"isSample":true}
      ],
      "totalCost":39000,
      "notes":"Non-sale samples for reels and launch content.",
      "createdAt":"2026-06-12T10:00:00.000Z",
      "createdBy":"Admin Test"
    }$$::jsonb),
    ('demo-procurement-july-packaging', $${
      "id":"demo-procurement-july-packaging",
      "title":"Packaging & Accessories Restock",
      "supplierName":"Optix Lens Lab",
      "items":[
        {"productId":"demo-product-spray","variantId":"demo-variant-spray-15ml","quantity":40,"costAtPurchase":80000,"productName":"Lens Cleaning Spray","variantName":"15ml","quantityReceived":40,"unitCost":2000,"currentSellingPrice":4500,"paymentDate":"2026-07-01","status":"Received","landedUnitCost":2150,"expectedProfit":94000,"properties":["Accessory"],"isSample":false},
        {"productId":"demo-product-case","variantId":"demo-variant-case-black","quantity":30,"costAtPurchase":105000,"productName":"Premium Hard Case","variantName":"Black","quantityReceived":30,"unitCost":3500,"currentSellingPrice":6500,"paymentDate":"2026-07-01","status":"Received","landedUnitCost":3720,"expectedProfit":83400,"properties":["Packaging"],"isSample":false}
      ],
      "totalCost":185000,
      "notes":"July accessory replenishment.",
      "createdAt":"2026-07-01T09:00:00.000Z",
      "createdBy":"Admin Test"
    }$$::jsonb)
) as v(id, data)
on conflict (id, business_id)
do update set data = excluded.data, updated_at = now();

-- -------------------------------------------------------------------
-- Expenses
-- -------------------------------------------------------------------

with mb as (select current_setting('app.seed_business_id')::text as business_id)
insert into public.expenses (id, business_id, data, updated_at)
select v.id, mb.business_id, v.data, now()
from mb
cross join (
  values
    ('demo-expense-rent-july', $${"id":"demo-expense-rent-july","category":"Rent","description":"Victoria Island showroom rent - July","amount":350000,"date":"2026-07-01","createdAt":"2026-07-01T08:00:00.000Z","createdBy":"Admin Test","status":"paid"}$$::jsonb),
    ('demo-expense-meta-july', $${"id":"demo-expense-meta-july","category":"Marketing","description":"Meta ads campaign for July collection","amount":185000,"date":"2026-07-05","createdAt":"2026-07-05T10:00:00.000Z","createdBy":"Admin Test","status":"paid"}$$::jsonb),
    ('demo-expense-delivery-july', $${"id":"demo-expense-delivery-july","category":"Logistics","description":"Courier settlements for dispatched orders","amount":64000,"date":"2026-07-08","createdAt":"2026-07-08T11:00:00.000Z","createdBy":"Admin Test","status":"partial"}$$::jsonb),
    ('demo-expense-power-july', $${"id":"demo-expense-power-july","category":"Utilities","description":"Diesel and power backup","amount":42000,"date":"2026-07-03","createdAt":"2026-07-03T09:00:00.000Z","createdBy":"Admin Test","status":"paid"}$$::jsonb),
    ('demo-expense-software-july', $${"id":"demo-expense-software-july","category":"Software","description":"Subscriptions for ops stack","amount":95000,"date":"2026-07-02","createdAt":"2026-07-02T12:00:00.000Z","createdBy":"Admin Test","status":"paid"}$$::jsonb),
    ('demo-expense-payroll-july', $${"id":"demo-expense-payroll-july","category":"Salaries","description":"Core team payroll","amount":565000,"date":"2026-07-10","createdAt":"2026-07-10T16:00:00.000Z","createdBy":"Admin Test","status":"draft"}$$::jsonb)
) as v(id, data)
on conflict (id, business_id)
do update set data = excluded.data, updated_at = now();

-- -------------------------------------------------------------------
-- Optional finance tables
-- -------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'other_incomes'
  ) then
    execute $sql$
      with mb as (select current_setting('app.seed_business_id')::text as business_id)
      insert into public.other_incomes (id, business_id, data, updated_at)
      select v.id, mb.business_id, v.data, now()
      from mb
      cross join (
        values
          ('demo-income-investor', '{"id":"demo-income-investor","title":"Founder Injection","source":"Founder","type":"owner-contribution","amount":1500000,"date":"2026-04-01","note":"Working capital top-up","createdAt":"2026-04-01T09:00:00.000Z","createdBy":"Admin Test"}'::jsonb),
          ('demo-income-styling', '{"id":"demo-income-styling","title":"Brand Styling Fee","source":"Corporate Styling","type":"other-income","amount":220000,"date":"2026-06-28","note":"Event styling project","createdAt":"2026-06-28T14:00:00.000Z","createdBy":"Admin Test"}'::jsonb)
      ) as v(id, data)
      on conflict (id, business_id)
      do update set data = excluded.data, updated_at = now()
    $sql$;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'expense_requests'
  ) then
    execute $sql$
      with mb as (select current_setting('app.seed_business_id')::text as business_id)
      insert into public.expense_requests (id, business_id, data, updated_at)
      select v.id, mb.business_id, v.data, now()
      from mb
      cross join (
        values
          ('demo-expense-request-1', '{"id":"demo-expense-request-1","title":"Prescription Lab Settlement","category":"Inventory","amount":368060.75,"date":"2026-07-07","merchant":"Aro Eyewear Enterprise","type":"one-time","status":"submitted","submittedByUserId":"demo-user-haleemah","submittedByName":"Haleemah","submittedAt":"2026-07-07T09:30:00.000Z","applyBankCharges":true,"lineItems":[{"id":"demo-expense-request-line-1","label":"Aro Prescription Payment","amount":368060.75,"category":"Inventory","kind":"base","source":"manual"}],"createdAt":"2026-07-07T09:30:00.000Z","updatedAt":"2026-07-07T09:30:00.000Z"}'::jsonb)
      ) as v(id, data)
      on conflict (id, business_id)
      do update set data = excluded.data, updated_at = now()
    $sql$;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'refund_requests'
  ) then
    execute $sql$
      with mb as (select current_setting('app.seed_business_id')::text as business_id)
      insert into public.refund_requests (id, business_id, data, updated_at)
      select v.id, mb.business_id, v.data, now()
      from mb
      cross join (
        values
          ('demo-refund-request-1', '{"id":"demo-refund-request-1","orderId":"demo-order-007","orderNumber":"ORD-772513","customerName":"Chuka Eze","customerPhone":"+2347011100003","customerEmail":"chuka.eze@example.com","amount":48500,"requestedDate":"2026-05-27","reason":"Customer cancelled before dispatch","status":"paid","refundType":"full","source":"order","submittedByUserId":"demo-user-finance","submittedByName":"Finance","submittedAt":"2026-05-27T09:00:00.000Z","reviewedByUserId":"demo-user-finance","reviewedByName":"Finance","reviewedAt":"2026-05-28T09:00:00.000Z","paidAt":"2026-05-28T10:00:00.000Z","paidByUserId":"demo-user-finance","paidByName":"Finance","paymentReference":"RFD-20260528-001","applyBankCharges":false,"totalDebitAmount":48500,"createdAt":"2026-05-27T09:00:00.000Z","updatedAt":"2026-05-28T10:00:00.000Z"}'::jsonb)
      ) as v(id, data)
      on conflict (id, business_id)
      do update set data = excluded.data, updated_at = now()
    $sql$;
  end if;
end $$;

-- -------------------------------------------------------------------
-- Cases
-- -------------------------------------------------------------------

with mb as (select current_setting('app.seed_business_id')::text as business_id)
insert into public.cases (id, business_id, data, updated_at)
select v.id, mb.business_id, v.data, now()
from mb
cross join (
  values
    ('demo-case-001', $${
      "id":"demo-case-001",
      "caseNumber":"CASE-120401",
      "orderId":"demo-order-004",
      "orderNumber":"ORD-022064",
      "customerId":"demo-customer-kamal",
      "customerName":"Kamaldeen Raji",
      "type":"Other",
      "status":"Awaiting Customer",
      "priority":"Medium",
      "assignedTo":"Support Lead",
      "source":"Chat",
      "issueSummary":"Customer has not confirmed receipt after dispatch.",
      "originalCustomerMessage":"I got the follow-up email but I need to check with the office front desk first.",
      "timeline":[
        {"id":"demo-case-001-t1","date":"2026-07-12T10:15:00.000Z","action":"Case created from delivery follow-up","user":"Automation"},
        {"id":"demo-case-001-t2","date":"2026-07-12T11:00:00.000Z","action":"Assigned to Support Lead","user":"Admin Test"}
      ],
      "createdAt":"2026-07-12T10:15:00.000Z",
      "updatedAt":"2026-07-12T11:00:00.000Z",
      "createdBy":"Automation",
      "updatedBy":"Admin Test"
    }$$::jsonb),
    ('demo-case-002', $${
      "id":"demo-case-002",
      "caseNumber":"CASE-120402",
      "orderId":"demo-order-005",
      "orderNumber":"ORD-120778",
      "customerId":"demo-customer-bruno",
      "customerName":"Bruno Bernard",
      "type":"Repair",
      "status":"Under Review",
      "priority":"High",
      "assignedTo":"Workshop",
      "source":"Email",
      "issueSummary":"Left temple loosened after one week of wear.",
      "originalCustomerMessage":"The frame is fine but the left arm feels loose already.",
      "timeline":[
        {"id":"demo-case-002-t1","date":"2026-06-24T09:00:00.000Z","action":"Case created","user":"Support Lead"},
        {"id":"demo-case-002-t2","date":"2026-06-24T10:30:00.000Z","action":"Assigned to Workshop","user":"Support Lead"}
      ],
      "createdAt":"2026-06-24T09:00:00.000Z",
      "updatedAt":"2026-06-24T10:30:00.000Z",
      "createdBy":"Support Lead",
      "updatedBy":"Support Lead"
    }$$::jsonb),
    ('demo-case-003', $${
      "id":"demo-case-003",
      "caseNumber":"CASE-120403",
      "orderId":"demo-order-007",
      "orderNumber":"ORD-772513",
      "customerId":"demo-customer-chuka",
      "customerName":"Chuka Eze",
      "type":"Refund",
      "status":"Closed",
      "priority":"Low",
      "assignedTo":"Finance",
      "source":"Phone",
      "issueSummary":"Refund completed for cancelled order.",
      "resolution":{"type":"Refund","notes":"Full refund approved and paid.","value":48500,"resolvedAt":"2026-05-28T10:00:00.000Z","resolvedBy":"Finance"},
      "timeline":[
        {"id":"demo-case-003-t1","date":"2026-05-27T13:00:00.000Z","action":"Case created","user":"Support Lead"},
        {"id":"demo-case-003-t2","date":"2026-05-28T10:00:00.000Z","action":"Refund paid and case closed","user":"Finance"}
      ],
      "createdAt":"2026-05-27T13:00:00.000Z",
      "updatedAt":"2026-05-28T10:00:00.000Z",
      "createdBy":"Support Lead",
      "updatedBy":"Finance"
    }$$::jsonb)
) as v(id, data)
on conflict (id, business_id)
do update set data = excluded.data, updated_at = now();

-- -------------------------------------------------------------------
-- Restock logs
-- -------------------------------------------------------------------

with mb as (select current_setting('app.seed_business_id')::text as business_id)
insert into public.restock_logs (id, business_id, data, updated_at)
select v.id, mb.business_id, v.data, now()
from mb
cross join (
  values
    ('demo-restock-001', $${"id":"demo-restock-001","productId":"demo-product-amina","variantId":"demo-variant-amina-black","quantityAdded":8,"previousStock":6,"newStock":14,"timestamp":"2026-06-02T09:30:00.000Z","performedBy":"Admin Test","sourceType":"procurement_receipt","sourceLabel":"June Optical Replenishment","procurementId":"demo-procurement-june-optical","procurementItemIndex":0}$$::jsonb),
    ('demo-restock-002', $${"id":"demo-restock-002","productId":"demo-product-zuri","variantId":"demo-variant-zuri-grey","quantityAdded":6,"previousStock":5,"newStock":11,"timestamp":"2026-06-02T09:35:00.000Z","performedBy":"Admin Test","sourceType":"procurement_receipt","sourceLabel":"June Optical Replenishment","procurementId":"demo-procurement-june-optical","procurementItemIndex":1}$$::jsonb),
    ('demo-restock-003', $${"id":"demo-restock-003","productId":"demo-product-spray","variantId":"demo-variant-spray-15ml","quantityAdded":40,"previousStock":0,"newStock":40,"timestamp":"2026-07-01T09:15:00.000Z","performedBy":"Admin Test","sourceType":"procurement_receipt","sourceLabel":"Packaging & Accessories Restock","procurementId":"demo-procurement-july-packaging","procurementItemIndex":0}$$::jsonb),
    ('demo-restock-004', $${"id":"demo-restock-004","productId":"demo-product-case","variantId":"demo-variant-case-black","quantityAdded":30,"previousStock":0,"newStock":30,"timestamp":"2026-07-01T09:20:00.000Z","performedBy":"Admin Test","sourceType":"procurement_receipt","sourceLabel":"Packaging & Accessories Restock","procurementId":"demo-procurement-july-packaging","procurementItemIndex":1}$$::jsonb)
) as v(id, data)
on conflict (id, business_id)
do update set data = excluded.data, updated_at = now();

-- -------------------------------------------------------------------
-- Audit logs
-- -------------------------------------------------------------------

with mb as (select current_setting('app.seed_business_id')::text as business_id)
insert into public.audit_logs (id, business_id, data, updated_at)
select v.id, mb.business_id, v.data, now()
from mb
cross join (
  values
    ('demo-audit-june', $${
      "id":"demo-audit-june",
      "month":5,
      "year":2026,
      "itemsAudited":6,
      "discrepancies":1,
      "completedAt":"2026-06-30T18:00:00.000Z",
      "performedBy":"Admin Test",
      "items":[
        {"productId":"demo-product-amina","variantId":"demo-variant-amina-black","productName":"Amina Cat Eye","variantName":"Black","sku":"AMINA-BLACK","expectedStock":14,"actualStock":14,"discrepancy":0},
        {"productId":"demo-product-atlas","variantId":"demo-variant-atlas-gold","productName":"Atlas Aviator","variantName":"Gold","sku":"ATLAS-GOLD","expectedStock":8,"actualStock":7,"discrepancy":-1}
      ]
    }$$::jsonb),
    ('demo-audit-july', $${
      "id":"demo-audit-july",
      "month":6,
      "year":2026,
      "itemsAudited":7,
      "discrepancies":0,
      "completedAt":"2026-07-12T18:00:00.000Z",
      "performedBy":"Admin Test",
      "items":[
        {"productId":"demo-product-zuri","variantId":"demo-variant-zuri-grey","productName":"Zuri Square","variantName":"Grey","sku":"ZURI-GREY","expectedStock":11,"actualStock":11,"discrepancy":0},
        {"productId":"demo-product-spray","variantId":"demo-variant-spray-15ml","productName":"Lens Cleaning Spray","variantName":"15ml","sku":"SPRAY-15ML","expectedStock":32,"actualStock":32,"discrepancy":0}
      ]
    }$$::jsonb)
) as v(id, data)
on conflict (id, business_id)
do update set data = excluded.data, updated_at = now();

-- -------------------------------------------------------------------
-- Showcase volume: recent, varied data for screenshots and testing
-- -------------------------------------------------------------------

with
  mb as (select current_setting('app.seed_business_id')::text as business_id),
  generated as (
    select
      n,
      format('demo-customer-volume-%s', lpad(n::text, 3, '0')) as id,
      now() - make_interval(days => 180 - (n * 3)) as created_at
    from generate_series(1, 40) as n
  )
insert into public.customers (id, business_id, data, updated_at)
select
  generated.id,
  mb.business_id,
  jsonb_build_object(
    'id', generated.id,
    'fullName', roster.full_name,
    'email', roster.email,
    'phone', format('+23480255%s', lpad(generated.n::text, 5, '0')),
    'defaultAddress', format('%s Fyll Showcase Avenue', 10 + generated.n),
    'defaultState', (array['Lagos', 'FCT', 'Rivers', 'Oyo', 'Ogun', 'Enugu'])[((generated.n - 1) % 6) + 1],
    'createdAt', generated.created_at
  ),
  generated.created_at
from mb
cross join generated
join pg_temp.fyll_demo_customer_roster roster on roster.customer_no = generated.n
on conflict (id, business_id)
do update set data = excluded.data, updated_at = excluded.updated_at;

with
  mb as (select current_setting('app.seed_business_id')::text as business_id),
  generated as (
    select
      n,
      format('demo-order-volume-%s', lpad(n::text, 3, '0')) as id,
      format('ORD-DEMO-%s', lpad(n::text, 4, '0')) as order_number,
      format('TRKDEMO%s', lpad(n::text, 4, '0')) as tracking_code,
      now() - make_interval(days => n - 1, hours => (n % 9) + 8) as ordered_at,
      (array['Processing', 'Lens Processing', 'Quality Check', 'Pending Delivery', 'Dispatched', 'Delivery Confirmation', 'Delivered', 'Completed', 'Cancelled', 'Refunded'])[((n - 1) % 10) + 1] as status,
      (array['Instagram', 'WhatsApp', 'Website', 'Walk-in', 'Threads'])[((n - 1) % 5) + 1] as source,
      (array['Bank Transfer', 'POS', 'Cash'])[((n - 1) % 3) + 1] as payment_method,
      32000 + ((n % 11) * 4500) as subtotal,
      case when n % 4 = 0 then 8500 else 4500 end as delivery_fee
    from generate_series(1, 120) as n
  )
insert into public.orders (id, business_id, data, updated_at)
select
  generated.id,
  mb.business_id,
  jsonb_build_object(
    'id', generated.id,
    'orderNumber', generated.order_number,
    'customerTrackingCode', generated.tracking_code,
    'customerId', format('demo-customer-volume-%s', lpad((((generated.n - 1) % 40) + 1)::text, 3, '0')),
    'customerName', (select full_name from pg_temp.fyll_demo_customer_roster where customer_no = ((generated.n - 1) % 40) + 1),
    'customerEmail', (select email from pg_temp.fyll_demo_customer_roster where customer_no = ((generated.n - 1) % 40) + 1),
    'customerPhone', format('+23480255%s', lpad((((generated.n - 1) % 40) + 1)::text, 5, '0')),
    'deliveryState', (array['Lagos', 'FCT', 'Rivers', 'Oyo', 'Ogun', 'Enugu'])[((generated.n - 1) % 6) + 1],
    'deliveryAddress', format('%s Fyll Showcase Avenue', 10 + (((generated.n - 1) % 40) + 1)),
    'items', case
      when generated.n % 12 = 0 then '[]'::jsonb
      else jsonb_build_array(jsonb_build_object(
        'productId', (array['demo-product-amina', 'demo-product-zuri', 'demo-product-atlas', 'demo-product-kairo'])[((generated.n - 1) % 4) + 1],
        'variantId', (array['demo-variant-amina-black', 'demo-variant-zuri-grey', 'demo-variant-atlas-gold', 'demo-variant-kairo-black'])[((generated.n - 1) % 4) + 1],
        'quantity', case when generated.n % 9 = 0 then 2 else 1 end,
        'unitPrice', generated.subtotal
      ))
    end,
    'services', case
      when generated.n % 12 = 0 then jsonb_build_array(jsonb_build_object('serviceId', 'demo-service-eye-test', 'name', 'Eye Test', 'price', 15000))
      else '[]'::jsonb
    end,
    'additionalCharges', case when generated.n % 7 = 0 then 5000 else 0 end,
    'additionalChargesNote', case when generated.n % 7 = 0 then 'Premium lens coating' else '' end,
    'deliveryFee', case when generated.n % 12 = 0 then 0 else generated.delivery_fee end,
    'orderTypeId', case when generated.n % 5 = 0 then 'timeline-custom-lens' else 'timeline-rtw-ng' end,
    'orderTypeName', case when generated.n % 5 = 0 then 'Custom Lens NG' else 'RTW NG' end,
    'paymentMethod', generated.payment_method,
    'orderClassification', case when generated.n % 13 = 0 then 'PR' else 'Sale' end,
    'status', generated.status,
    'orderStatus', generated.status,
    'source', generated.source,
    'subtotal', case when generated.n % 12 = 0 then 0 else generated.subtotal end,
    'totalAmount', case when generated.n % 12 = 0 then 15000 else generated.subtotal + generated.delivery_fee + case when generated.n % 7 = 0 then 5000 else 0 end end,
    'trackingStage', case
      when generated.status in ('Delivered', 'Completed') then 'delivered'
      when generated.status in ('Cancelled', 'Refunded') then 'cancelled'
      when generated.status in ('Dispatched', 'Delivery Confirmation') then 'out-for-delivery'
      else 'processing'
    end,
    'fulfillmentStage', case
      when generated.status in ('Delivered', 'Completed') then 'completed'
      when generated.status in ('Cancelled', 'Refunded') then 'cancelled'
      else 'processing'
    end,
    'orderDate', generated.ordered_at,
    'createdAt', generated.ordered_at,
    'updatedAt', generated.ordered_at + interval '6 hours',
    'createdBy', 'Admin Demo',
    'updatedBy', case when generated.n % 3 = 0 then 'Operations Team' else 'Admin Demo' end,
    'refund', case when generated.status = 'Refunded' then jsonb_build_object(
      'id', format('demo-refund-volume-%s', lpad(generated.n::text, 3, '0')),
      'orderId', generated.id,
      'amount', generated.subtotal + generated.delivery_fee,
      'date', generated.ordered_at + interval '2 days',
      'reason', 'Customer requested a refund during the demo workflow',
      'createdAt', generated.ordered_at + interval '2 days'
    ) else null end,
    'activityLog', jsonb_build_array(
      jsonb_build_object('staffName', 'Admin Demo', 'action', 'Created order', 'date', generated.ordered_at),
      jsonb_build_object('staffName', 'Operations Team', 'action', format('Updated status to %s', generated.status), 'date', generated.ordered_at + interval '6 hours')
    )
  ),
  generated.ordered_at + interval '6 hours'
from mb
cross join generated
on conflict (id, business_id)
do update set data = excluded.data, updated_at = excluded.updated_at;

with
  mb as (select current_setting('app.seed_business_id')::text as business_id),
  generated as (
    select
      n,
      format('demo-case-volume-%s', lpad(n::text, 3, '0')) as id,
      now() - make_interval(days => (n * 3) - 2) as created_at,
      (array['Open', 'Under Review', 'Awaiting Customer', 'Resolved', 'Closed'])[((n - 1) % 5) + 1] as status,
      (array['Repair', 'Replacement', 'Refund', 'Return', 'Goodwill', 'Other'])[((n - 1) % 6) + 1] as case_type
    from generate_series(1, 21) as n
  )
insert into public.cases (id, business_id, data, updated_at)
select
  generated.id,
  mb.business_id,
  jsonb_build_object(
    'id', generated.id,
    'caseNumber', format('CASE-DEMO-%s', lpad(generated.n::text, 3, '0')),
    'orderId', format('demo-order-volume-%s', lpad(generated.n::text, 3, '0')),
    'orderNumber', format('ORD-DEMO-%s', lpad(generated.n::text, 4, '0')),
    'customerId', format('demo-customer-volume-%s', lpad((((generated.n - 1) % 40) + 1)::text, 3, '0')),
    'customerName', (select full_name from pg_temp.fyll_demo_customer_roster where customer_no = ((generated.n - 1) % 40) + 1),
    'type', generated.case_type,
    'status', generated.status,
    'priority', (array['Low', 'Medium', 'High', 'Critical'])[((generated.n - 1) % 4) + 1],
    'assignedTo', (array['Support Lead', 'Operations Team', 'Finance', 'Workshop'])[((generated.n - 1) % 4) + 1],
    'source', (array['Email', 'Phone', 'Chat', 'Web', 'In-Store'])[((generated.n - 1) % 5) + 1],
    'issueSummary', (array['Frame adjustment requested', 'Delivery arrived later than expected', 'Customer requested an exchange', 'Payment requires investigation', 'Lens specification needs correction', 'Return received for inspection'])[((generated.n - 1) % 6) + 1],
    'originalCustomerMessage', 'This is realistic placeholder content for the Fyll showcase account.',
    'timeline', jsonb_build_array(
      jsonb_build_object('id', generated.id || '-timeline-1', 'date', generated.created_at, 'action', 'Case created', 'user', 'Support Lead'),
      jsonb_build_object('id', generated.id || '-timeline-2', 'date', generated.created_at + interval '3 hours', 'action', format('Status changed to %s', generated.status), 'user', 'Operations Team')
    ),
    'resolution', case when generated.status in ('Resolved', 'Closed') then jsonb_build_object(
      'type', generated.case_type,
      'notes', 'Resolved successfully for demonstration purposes.',
      'value', case when generated.case_type = 'Refund' then 25000 else null end,
      'resolvedAt', generated.created_at + interval '2 days',
      'resolvedBy', 'Support Lead'
    ) else null end,
    'createdAt', generated.created_at,
    'updatedAt', generated.created_at + interval '3 hours',
    'createdBy', 'Support Lead',
    'updatedBy', 'Operations Team'
  ),
  generated.created_at + interval '3 hours'
from mb
cross join generated
on conflict (id, business_id)
do update set data = excluded.data, updated_at = excluded.updated_at;

with
  mb as (select current_setting('app.seed_business_id')::text as business_id),
  generated as (
    select
      n,
      format('demo-expense-volume-%s', lpad(n::text, 3, '0')) as id,
      now() - make_interval(days => n * 4) as expense_at
    from generate_series(1, 24) as n
  )
insert into public.expenses (id, business_id, data, updated_at)
select
  generated.id,
  mb.business_id,
  jsonb_build_object(
    'id', generated.id,
    'category', (array['Inventory', 'Marketing', 'Logistics', 'Rent', 'Utilities', 'Software'])[((generated.n - 1) % 6) + 1],
    'description', format('Showcase operating expense %s', generated.n),
    'amount', 18000 + ((generated.n % 8) * 12500),
    'date', to_char(generated.expense_at, 'YYYY-MM-DD'),
    'createdAt', generated.expense_at,
    'createdBy', 'Admin Demo',
    'status', case when generated.n % 5 = 0 then 'partial' else 'paid' end
  ),
  generated.expense_at
from mb
cross join generated
on conflict (id, business_id)
do update set data = excluded.data, updated_at = excluded.updated_at;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'payment_accounts'
  ) then
    execute $sql$
      with mb as (select current_setting('app.seed_business_id')::text as business_id)
      insert into public.payment_accounts (id, business_id, data, created_by, updated_at)
      select
        'demo-payment-account-primary',
        mb.business_id,
        jsonb_build_object(
          'id', 'demo-payment-account-primary',
          'bankName', 'Fyll Demo Bank',
          'accountName', 'Fyll Showcase Store',
          'accountNumber', '0123456789',
          'isDefault', true
        ),
        'Admin Demo',
        now()
      from mb
      on conflict (id, business_id)
      do update set data = excluded.data, updated_at = excluded.updated_at
    $sql$;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'social_checkouts'
  ) then
    execute $sql$
      with
        mb as (select current_setting('app.seed_business_id')::text as business_id),
        generated as (
          select
            n,
            format('SC-DEMO%s', lpad(n::text, 4, '0')) as id,
            now() - make_interval(days => n - 1, hours => 2) as created_at,
            (array['verified', 'verified', 'payment_submitted', 'awaiting_payment', 'rejected', 'cancelled'])[((n - 1) % 6) + 1] as status
          from generate_series(1, 60) as n
        )
      insert into public.social_checkouts (id, business_id, data, updated_at)
      select
        generated.id,
        mb.business_id,
        jsonb_build_object(
          'id', generated.id,
          'businessId', mb.business_id,
          'status', generated.status,
          'billNote', format('Demo bill %s — optical frame, prescription lenses and delivery', generated.n),
          'amount', 28000 + ((generated.n % 12) * 5500),
          'bankAccount', jsonb_build_object('bankName', 'Fyll Demo Bank', 'accountName', 'Fyll Showcase Store', 'accountNumber', '0123456789'),
          'createdBy', 'Admin Demo',
          'createdByUserId', 'demo-admin-user',
          'createdAt', generated.created_at,
          'expiresAt', generated.created_at + interval '1 day',
          'customerName', (select full_name from pg_temp.fyll_demo_customer_roster where customer_no = ((generated.n - 1) % 40) + 1),
          'customerPhone', format('+23480255%s', lpad((((generated.n - 1) % 40) + 1)::text, 5, '0')),
          'customerEmail', (select email from pg_temp.fyll_demo_customer_roster where customer_no = ((generated.n - 1) % 40) + 1),
          'deliveryAddress', format('%s Fyll Showcase Avenue', 10 + (((generated.n - 1) % 40) + 1)),
          'deliveryState', (array['Lagos', 'FCT', 'Rivers', 'Oyo', 'Ogun', 'Enugu'])[((generated.n - 1) % 6) + 1],
          'submittedAt', case when generated.status in ('payment_submitted', 'verified', 'rejected') then generated.created_at + interval '3 hours' else null end,
          'reviewedBy', case when generated.status in ('verified', 'rejected') then 'Finance Team' else null end,
          'reviewedAt', case when generated.status in ('verified', 'rejected') then generated.created_at + interval '5 hours' else null end,
          'convertedOrderId', case when generated.status = 'verified' then format('demo-order-volume-%s', lpad(generated.n::text, 3, '0')) else null end,
          'updatedAt', generated.created_at + interval '5 hours',
          'activityLog', jsonb_build_array(
            jsonb_build_object('id', generated.id || '-activity-1', 'action', 'Payment link created', 'actor', 'Admin Demo', 'createdAt', generated.created_at),
            jsonb_build_object('id', generated.id || '-activity-2', 'action', format('Payment status: %s', generated.status), 'actor', 'Finance Team', 'createdAt', generated.created_at + interval '5 hours')
          )
        ),
        generated.created_at + interval '5 hours'
      from mb
      cross join generated
      on conflict (id, business_id)
      do update set data = excluded.data, updated_at = excluded.updated_at
    $sql$;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'refund_requests'
  ) then
    execute $sql$
      with
        mb as (select current_setting('app.seed_business_id')::text as business_id),
        generated as (
          select
            n,
            format('demo-refund-request-volume-%s', lpad(n::text, 3, '0')) as id,
            now() - make_interval(days => n * 6) as requested_at,
            (array['draft', 'submitted', 'approved', 'rejected', 'paid'])[((n - 1) % 5) + 1] as status
          from generate_series(1, 15) as n
        )
      insert into public.refund_requests (id, business_id, data, updated_at)
      select
        generated.id,
        mb.business_id,
        jsonb_build_object(
          'id', generated.id,
          'orderId', format('demo-order-volume-%s', lpad((generated.n * 5)::text, 3, '0')),
          'orderNumber', format('ORD-DEMO-%s', lpad((generated.n * 5)::text, 4, '0')),
          'customerName', (select full_name from pg_temp.fyll_demo_customer_roster where customer_no = ((generated.n * 5 - 1) % 40) + 1),
          'customerPhone', format('+23480255%s', lpad((((generated.n * 5 - 1) % 40) + 1)::text, 5, '0')),
          'customerEmail', (select email from pg_temp.fyll_demo_customer_roster where customer_no = ((generated.n * 5 - 1) % 40) + 1),
          'amount', 15000 + ((generated.n % 7) * 6500),
          'requestedDate', to_char(generated.requested_at, 'YYYY-MM-DD'),
          'reason', (array['Duplicate payment', 'Order cancelled before dispatch', 'Item returned after inspection', 'Incorrect lens specification', 'Goodwill refund approved'])[((generated.n - 1) % 5) + 1],
          'status', generated.status,
          'refundType', case when generated.n % 3 = 0 then 'partial' else 'full' end,
          'source', 'order',
          'submittedByUserId', 'demo-finance-user',
          'submittedByName', 'Finance Team',
          'submittedAt', generated.requested_at,
          'reviewedByUserId', case when generated.status in ('approved', 'rejected', 'paid') then 'demo-finance-lead' else null end,
          'reviewedByName', case when generated.status in ('approved', 'rejected', 'paid') then 'Finance Lead' else null end,
          'reviewedAt', case when generated.status in ('approved', 'rejected', 'paid') then generated.requested_at + interval '1 day' else null end,
          'rejectionReason', case when generated.status = 'rejected' then 'Request did not meet the refund policy.' else null end,
          'paidAt', case when generated.status = 'paid' then generated.requested_at + interval '2 days' else null end,
          'paidByUserId', case when generated.status = 'paid' then 'demo-finance-lead' else null end,
          'paidByName', case when generated.status = 'paid' then 'Finance Lead' else null end,
          'paymentReference', case when generated.status = 'paid' then format('RFD-DEMO-%s', lpad(generated.n::text, 3, '0')) else null end,
          'applyBankCharges', false,
          'totalDebitAmount', 15000 + ((generated.n % 7) * 6500),
          'createdAt', generated.requested_at,
          'updatedAt', generated.requested_at + interval '1 day'
        ),
        generated.requested_at + interval '1 day'
      from mb
      cross join generated
      on conflict (id, business_id)
      do update set data = excluded.data, updated_at = excluded.updated_at
    $sql$;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'returns'
  ) then
    execute $sql$
      with
        mb as (select current_setting('app.seed_business_id')::text as business_id),
        generated as (
          select
            n,
            format('demo-return-volume-%s', lpad(n::text, 3, '0')) as id,
            now() - make_interval(days => n * 7) as created_at,
            (array['initiated', 'picked_up', 'received', 'processed'])[((n - 1) % 4) + 1] as status
          from generate_series(1, 12) as n
        )
      insert into public.returns (id, business_id, data, updated_at)
      select
        generated.id,
        mb.business_id,
        jsonb_build_object(
          'id', generated.id,
          'ref', format('RET-DEMO-%s', lpad(generated.n::text, 3, '0')),
          'caseId', format('demo-case-volume-%s', lpad(generated.n::text, 3, '0')),
          'orderId', format('demo-order-volume-%s', lpad((generated.n * 4)::text, 3, '0')),
          'orderNumber', format('ORD-DEMO-%s', lpad((generated.n * 4)::text, 4, '0')),
          'customerId', format('demo-customer-volume-%s', lpad((((generated.n * 4 - 1) % 40) + 1)::text, 3, '0')),
          'customerName', (select full_name from pg_temp.fyll_demo_customer_roster where customer_no = ((generated.n * 4 - 1) % 40) + 1),
          'customerEmail', (select email from pg_temp.fyll_demo_customer_roster where customer_no = ((generated.n * 4 - 1) % 40) + 1),
          'customerPhone', format('+23480255%s', lpad((((generated.n * 4 - 1) % 40) + 1)::text, 5, '0')),
          'itemSummary', 'Optical frame and prescription lenses',
          'reason', (array['wrong_item', 'damaged', 'changed_mind', 'other'])[((generated.n - 1) % 4) + 1],
          'resolution', case when generated.n % 2 = 0 then 'exchange' else 'refund' end,
          'shippingPayer', case when generated.n % 3 = 0 then 'customer' else 'seller' end,
          'status', generated.status,
          'notes', 'Showcase return workflow record.',
          'activity', jsonb_build_array(
            jsonb_build_object('id', generated.id || '-activity-1', 'date', generated.created_at, 'action', 'Return initiated', 'user', 'Support Lead'),
            jsonb_build_object('id', generated.id || '-activity-2', 'date', generated.created_at + interval '1 day', 'action', format('Return status: %s', generated.status), 'user', 'Operations Team')
          ),
          'createdAt', generated.created_at,
          'updatedAt', generated.created_at + interval '1 day',
          'createdBy', 'Support Lead',
          'updatedBy', 'Operations Team'
        ),
        generated.created_at + interval '1 day'
      from mb
      cross join generated
      on conflict (id, business_id)
      do update set data = excluded.data, updated_at = excluded.updated_at
    $sql$;
  end if;
end $$;

-- -------------------------------------------------------------------
-- Diagnostics
-- -------------------------------------------------------------------

with summary as (
  select current_setting('app.seed_business_id')::text as business_id
)
select 'Seed complete for business_id ' || business_id as result
from summary;

with mb as (select current_setting('app.seed_business_id')::text as business_id)
select 'products' as table_name, count(*)::int as row_count from public.products p join mb on p.business_id = mb.business_id
union all
select 'customers', count(*)::int from public.customers c join mb on c.business_id = mb.business_id
union all
select 'orders', count(*)::int from public.orders o join mb on o.business_id = mb.business_id
union all
select 'procurements', count(*)::int from public.procurements p join mb on p.business_id = mb.business_id
union all
select 'expenses', count(*)::int from public.expenses e join mb on e.business_id = mb.business_id
union all
select 'cases', count(*)::int from public.cases c join mb on c.business_id = mb.business_id
union all
select 'restock_logs', count(*)::int from public.restock_logs r join mb on r.business_id = mb.business_id
union all
select 'audit_logs', count(*)::int from public.audit_logs a join mb on a.business_id = mb.business_id
order by table_name;
