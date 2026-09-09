-- Public customer order list lookup, for account.fyll.store's "My Account"
-- Orders page to also show orders created directly in Fyll Ops (not just
-- orders that came through a checkout.fyll.store payment).
-- Run this in the Supabase SQL editor (same project as
-- lookup_public_order_tracking / confirm_public_order_delivery).
--
-- Same security model as the existing public tracking RPCs: SECURITY
-- DEFINER, granted to anon/authenticated, authorized purely by knowledge of
-- the order's own customer email (no password/session needed) — this
-- mirrors lookup_public_order_tracking's existing authorization approach,
-- just returning every matching order instead of one by tracking code.
--
-- This does not modify any existing data — it only adds a new read-only
-- function.

create or replace function public.list_public_orders_by_email(
  email_input text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_email text := lower(regexp_replace(trim(coalesce(email_input, '')), '\s+', '', 'g'));
  orders_payload jsonb;
begin
  if normalized_email = '' then
    return '[]'::jsonb;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'orderNumber', coalesce(o.data->>'orderNumber', o.id),
        'websiteOrderReference', nullif(coalesce(o.data->>'websiteOrderReference', ''), ''),
        'customerTrackingCode', nullif(coalesce(o.data->>'customerTrackingCode', ''), ''),
        'customerName', coalesce(o.data->>'customerName', ''),
        'customerEmail', coalesce(o.data->>'customerEmail', ''),
        'customerPhone', coalesce(o.data->>'customerPhone', ''),
        'deliveryState', coalesce(o.data->>'deliveryState', ''),
        -- deliveryAddress on public.orders.data is inconsistent by write path:
        -- submit_storefront_order.sql writes a structured object
        -- ({address1, address2, city, state, country, postalCode}); orders
        -- created directly in Fyll Ops (new-order.tsx) still write one flat
        -- string. Branch on the actual shape rather than assuming either —
        -- legacy/manual orders fall back to the whole string as address1.
        'deliveryAddress1', case
          when jsonb_typeof(o.data->'deliveryAddress') = 'object'
            then coalesce(o.data #>> '{deliveryAddress,address1}', '')
          else coalesce(o.data->>'deliveryAddress', '')
        end,
        'deliveryAddress2', case
          when jsonb_typeof(o.data->'deliveryAddress') = 'object'
            then coalesce(o.data #>> '{deliveryAddress,address2}', '')
          else ''
        end,
        'deliveryCity', case
          when jsonb_typeof(o.data->'deliveryAddress') = 'object'
            then coalesce(o.data #>> '{deliveryAddress,city}', '')
          else ''
        end,
        'deliveryCountry', case
          when jsonb_typeof(o.data->'deliveryAddress') = 'object'
            then coalesce(o.data #>> '{deliveryAddress,country}', '')
          else ''
        end,
        'deliveryPostalCode', case
          when jsonb_typeof(o.data->'deliveryAddress') = 'object'
            then coalesce(o.data #>> '{deliveryAddress,postalCode}', '')
          else ''
        end,
        'items', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'productId', item->>'productId',
                'variantId', item->>'variantId',
                'quantity', coalesce((item->>'quantity')::int, 1),
                'unitPrice', coalesce((item->>'unitPrice')::numeric, 0),
                'name', coalesce(nullif(trim(coalesce(p.data->>'name', '')), ''), 'Item'),
                'image', coalesce(
                  (
                    select v->>'imageUrl'
                    from jsonb_array_elements(coalesce(p.data->'variants', '[]'::jsonb)) v
                    where v->>'id' = item->>'variantId'
                    limit 1
                  ),
                  p.data->>'imageUrl'
                )
              )
              order by line.ordinality
            )
            from jsonb_array_elements(coalesce(o.data->'items', '[]'::jsonb)) with ordinality as line(item, ordinality)
            left join public.products p
              on p.id = item->>'productId'
              and regexp_replace(regexp_replace(lower(coalesce(p.business_id, '')), '^biz-', ''), '-', '', 'g')
                = regexp_replace(regexp_replace(lower(coalesce(o.business_id, '')), '^biz-', ''), '-', '', 'g')
          ),
          '[]'::jsonb
        ),
        'status', coalesce(o.data->>'status', ''),
        'paymentMethod', nullif(coalesce(o.data->>'paymentMethod', ''), ''),
        'totalAmount', coalesce(o.data->'totalAmount', '0'::jsonb),
        'subtotal', coalesce(o.data->'subtotal', '0'::jsonb),
        -- deliveryFee is inconsistent by write path like deliveryAddress:
        -- Fyll Ops's own New Order flow (new-order.tsx) writes 'deliveryFee',
        -- but submit_storefront_order.sql writes 'shippingCost' — fall back
        -- to shippingCost rather than defaulting to 0 (which showed as "Free"
        -- on account.fyll.store even when a real fee was charged).
        'deliveryFee', coalesce(o.data->'deliveryFee', o.data->'shippingCost', '0'::jsonb),
        'discountAmount', coalesce(o.data->'discountAmount', '0'::jsonb),
        'logistics', jsonb_build_object(
          'carrierName', coalesce(o.data #>> '{logistics,carrierName}', ''),
          'trackingNumber', nullif(coalesce(o.data #>> '{logistics,trackingNumber}', ''), '')
        ),
        'deliveryConfirmationStatus', nullif(coalesce(o.data->>'deliveryConfirmationStatus', ''), ''),
        'deliveryConfirmationConfirmedAt', nullif(coalesce(o.data->>'deliveryConfirmationConfirmedAt', ''), ''),
        'fulfillmentEffectiveEta', nullif(coalesce(o.data->>'fulfillmentEffectiveEta', ''), ''),
        'createdAt', coalesce(o.data->>'createdAt', o.created_at::text),
        'updatedAt', coalesce(o.data->>'updatedAt', o.updated_at::text),
        'activityLog', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'action', coalesce(entry->>'action', ''),
                'date', coalesce(entry->>'date', '')
              )
              order by ordinality
            )
            from jsonb_array_elements(coalesce(o.data->'activityLog', '[]'::jsonb)) with ordinality as activity(entry, ordinality)
          ),
          '[]'::jsonb
        ),
        'businessName', coalesce(nullif(trim(coalesce(b.data->>'businessName', '')), ''), b.name, ''),
        'businessLogo', b.data->>'businessLogo',
        'businessWebsite', nullif(trim(coalesce(b.data->>'businessWebsite', '')), '')
      )
      order by coalesce(o.updated_at, o.created_at, 'epoch'::timestamptz) desc, o.id asc
    ),
    '[]'::jsonb
  )
  into orders_payload
  from public.orders o
  left join public.businesses b
    on regexp_replace(
      regexp_replace(lower(b.id::text), '^biz-', ''),
      '-',
      '',
      'g'
    ) = regexp_replace(
      regexp_replace(lower(coalesce(o.business_id, '')), '^biz-', ''),
      '-',
      '',
      'g'
    )
  where lower(regexp_replace(coalesce(o.data->>'customerEmail', ''), '\s+', '', 'g')) = normalized_email;

  return orders_payload;
end;
$$;

grant execute on function public.list_public_orders_by_email(text) to anon;
grant execute on function public.list_public_orders_by_email(text) to authenticated;
