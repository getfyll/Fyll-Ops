-- Ensure shared payment rows keep enough delivery data for order creation.
-- Storefront/Fyll Checkout integrations can send a payment event before the
-- app creates or relinks the FYLL order. When the payment points at an
-- existing order, copy the order's delivery snapshot onto the payment row so
-- Fyll.app can create/link follow-up orders without losing address/state.

create or replace function public.enrich_payment_delivery_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  matched_order record;
  source_order_id text := trim(coalesce(new.data->>'sourceOrderId', ''));
  source_value text := lower(trim(coalesce(new.data->>'source', '')));
  current_delivery_address text := trim(coalesce(new.data->>'deliveryAddress', new.data->>'delivery_address', ''));
  current_delivery_state text := trim(coalesce(new.data->>'deliveryState', new.data->>'delivery_state', ''));
  current_delivery_fee text := trim(coalesce(
    new.data->>'deliveryFee',
    new.data->>'delivery_fee',
    new.data->>'shippingFee',
    new.data->>'shipping_fee',
    new.data->>'shippingCost',
    new.data->>'shipping_cost',
    ''
  ));
begin
  if source_order_id = '' or source_value not in ('storefront', 'fyll_checkout') then
    return new;
  end if;

  if current_delivery_address <> '' and current_delivery_state <> '' then
    return new;
  end if;

  select o.data
  into matched_order
  from public.orders o
  where o.business_id = new.business_id
    and (
      o.id = source_order_id
      or o.data->>'orderNumber' = source_order_id
      or o.data->>'websiteOrderReference' = source_order_id
      or o.data->'fyllCheckout'->>'reference' = source_order_id
    )
  order by coalesce(o.updated_at, o.created_at, 'epoch'::timestamptz) desc
  limit 1;

  if matched_order.data is null then
    return new;
  end if;

  if current_delivery_address = '' and trim(coalesce(matched_order.data->>'deliveryAddress', '')) <> '' then
    new.data := new.data || jsonb_build_object(
      'deliveryAddress', trim(coalesce(matched_order.data->>'deliveryAddress', '')),
      'delivery_address', trim(coalesce(matched_order.data->>'deliveryAddress', ''))
    );
  end if;

  if current_delivery_state = '' and trim(coalesce(matched_order.data->>'deliveryState', '')) <> '' then
    new.data := new.data || jsonb_build_object(
      'deliveryState', trim(coalesce(matched_order.data->>'deliveryState', '')),
      'delivery_state', trim(coalesce(matched_order.data->>'deliveryState', ''))
    );
  end if;

  if current_delivery_fee = '' and trim(coalesce(matched_order.data->>'deliveryFee', '')) <> '' then
    new.data := new.data || jsonb_build_object(
      'deliveryFee', (matched_order.data->>'deliveryFee')::numeric,
      'delivery_fee', (matched_order.data->>'deliveryFee')::numeric,
      'shippingFee', (matched_order.data->>'deliveryFee')::numeric,
      'shipping_fee', (matched_order.data->>'deliveryFee')::numeric
    );
  end if;

  return new;
end;
$$;

drop trigger if exists payment_delivery_snapshot_trigger on public.payments;

create trigger payment_delivery_snapshot_trigger
  before insert or update on public.payments
  for each row
  execute function public.enrich_payment_delivery_snapshot();

with matched as (
  select
    p.id,
    p.business_id,
    o.data as order_data
  from public.payments p
  join public.orders o
    on o.business_id = p.business_id
   and (
     o.id = trim(coalesce(p.data->>'sourceOrderId', ''))
     or o.data->>'orderNumber' = trim(coalesce(p.data->>'sourceOrderId', ''))
     or o.data->>'websiteOrderReference' = trim(coalesce(p.data->>'sourceOrderId', ''))
     or o.data->'fyllCheckout'->>'reference' = trim(coalesce(p.data->>'sourceOrderId', ''))
   )
  where lower(trim(coalesce(p.data->>'source', ''))) in ('storefront', 'fyll_checkout')
)
update public.payments p
set data = p.data
  || case
    when trim(coalesce(p.data->>'deliveryAddress', p.data->>'delivery_address', '')) = ''
      and trim(coalesce(matched.order_data->>'deliveryAddress', '')) <> ''
    then jsonb_build_object(
      'deliveryAddress', trim(coalesce(matched.order_data->>'deliveryAddress', '')),
      'delivery_address', trim(coalesce(matched.order_data->>'deliveryAddress', ''))
    )
    else '{}'::jsonb
  end
  || case
    when trim(coalesce(p.data->>'deliveryState', p.data->>'delivery_state', '')) = ''
      and trim(coalesce(matched.order_data->>'deliveryState', '')) <> ''
    then jsonb_build_object(
      'deliveryState', trim(coalesce(matched.order_data->>'deliveryState', '')),
      'delivery_state', trim(coalesce(matched.order_data->>'deliveryState', ''))
    )
    else '{}'::jsonb
  end
  || case
    when trim(coalesce(
        p.data->>'deliveryFee',
        p.data->>'delivery_fee',
        p.data->>'shippingFee',
        p.data->>'shipping_fee',
        p.data->>'shippingCost',
        p.data->>'shipping_cost',
        ''
      )) = ''
      and trim(coalesce(matched.order_data->>'deliveryFee', '')) <> ''
    then jsonb_build_object(
      'deliveryFee', (matched.order_data->>'deliveryFee')::numeric,
      'delivery_fee', (matched.order_data->>'deliveryFee')::numeric,
      'shippingFee', (matched.order_data->>'deliveryFee')::numeric,
      'shipping_fee', (matched.order_data->>'deliveryFee')::numeric
    )
    else '{}'::jsonb
  end
from matched
where p.id = matched.id
  and p.business_id = matched.business_id;
