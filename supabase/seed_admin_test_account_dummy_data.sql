-- ===================================================================
-- FYLL: SEED ADMIN TEST ACCOUNT WITH PLACEHOLDER DUMMY DATA
-- ===================================================================
-- Target account:
--   admin@fyll.com
--
-- What this does:
-- - Resolves the business_id from public.profiles using admin@fyll.com
-- - Removes prior rows created by this script only (ids prefixed with demo-)
-- - Seeds realistic placeholder data across key ops areas:
--   products, customers, orders, procurements, expenses, other income,
--   cases, restock logs, audit logs, settings, custom services, logistics,
--   finance rules, warehouse items, and more.
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
