-- Public tracking: show the customer their own delivery details and product
-- photos on track.fyll.app.
--
-- Same two functions as 20260724120000_public_tracking_lookup_external_refs
-- and 20261001130000_public_purchase_tracking, with only these additions:
--   * order payload: deliveryAddress, customerPhone, deliveryFee,
--     additionalCharges(+Note), discountAmount (itemised receipt)
--   * products payload: imageUrl
--   * social checkout payload: customerPhone
-- Lookups stay gated by order reference + the customer's own email, so these
-- details are only shown to the person who placed the order.
--
-- Run once in the Supabase SQL editor (or via supabase db push).

create or replace function public.lookup_public_order_tracking(
  tracking_code_input text,
  email_input text,
  business_slug_input text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_code text := lower(regexp_replace(trim(coalesce(tracking_code_input, '')), '[^a-zA-Z0-9]+', '', 'g'));
  normalized_email text := lower(regexp_replace(trim(coalesce(email_input, '')), '\s+', '', 'g'));
  normalized_slug text := regexp_replace(
    regexp_replace(lower(trim(coalesce(business_slug_input, ''))), '[^a-z0-9]+', '-', 'g'),
    '(^-|-$)',
    '',
    'g'
  );
  matched_order record;
  matched_business record;
  normalized_business_key text;
  products_payload jsonb := '[]'::jsonb;
  order_statuses_payload jsonb := '[]'::jsonb;
  order_timeline_settings_payload jsonb := '{}'::jsonb;
  public_order_payload jsonb := '{}'::jsonb;
begin
  if normalized_code = '' or normalized_email = '' then
    return null;
  end if;

  with business_matches as (
    select
      b.id::text as business_id,
      b.name,
      b.data,
      regexp_replace(
        regexp_replace(lower(b.id::text), '^biz-', ''),
        '-',
        '',
        'g'
      ) as normalized_business_key
    from public.businesses b
    where normalized_slug = ''
      or regexp_replace(
        regexp_replace(lower(trim(coalesce(b.data->>'businessSlug', ''))), '[^a-z0-9]+', '-', 'g'),
        '(^-|-$)',
        '',
        'g'
      ) = normalized_slug
      or regexp_replace(
        regexp_replace(lower(trim(coalesce(coalesce(nullif(trim(coalesce(b.data->>'businessName', '')), ''), b.name), ''))), '[^a-z0-9]+', '-', 'g'),
        '(^-|-$)',
        '',
        'g'
      ) = normalized_slug
  ),
  candidate_orders as (
    select
      o.id,
      o.business_id,
      o.data,
      o.created_at,
      o.updated_at,
      bm.business_id as matched_business_id,
      array_remove(array[
        lower(regexp_replace(coalesce(o.id, ''), '[^a-zA-Z0-9]+', '', 'g')),
        lower(regexp_replace(coalesce(o.data->>'id', ''), '[^a-zA-Z0-9]+', '', 'g')),
        lower(regexp_replace(coalesce(o.data->>'orderNumber', ''), '[^a-zA-Z0-9]+', '', 'g')),
        lower(regexp_replace(coalesce(o.data->>'websiteOrderReference', ''), '[^a-zA-Z0-9]+', '', 'g')),
        lower(regexp_replace(coalesce(o.data->>'customerTrackingCode', ''), '[^a-zA-Z0-9]+', '', 'g')),
        lower(regexp_replace(coalesce(o.data->>'externalOrderId', ''), '[^a-zA-Z0-9]+', '', 'g')),
        lower(regexp_replace(coalesce(o.data->>'externalOrderNumber', ''), '[^a-zA-Z0-9]+', '', 'g')),
        lower(regexp_replace(coalesce(o.data->>'sourceOrderId', ''), '[^a-zA-Z0-9]+', '', 'g')),
        lower(regexp_replace(coalesce(o.data->>'sourceOrderNumber', ''), '[^a-zA-Z0-9]+', '', 'g')),
        lower(regexp_replace(coalesce(o.data #>> '{fyllCheckout,reference}', ''), '[^a-zA-Z0-9]+', '', 'g')),
        lower(regexp_replace(coalesce(o.data #>> '{woocommerce,id}', ''), '[^a-zA-Z0-9]+', '', 'g')),
        lower(regexp_replace(coalesce(o.data #>> '{woocommerce,orderId}', ''), '[^a-zA-Z0-9]+', '', 'g')),
        lower(regexp_replace(coalesce(o.data #>> '{woocommerce,number}', ''), '[^a-zA-Z0-9]+', '', 'g')),
        lower(regexp_replace(coalesce(o.data #>> '{logistics,trackingNumber}', ''), '[^a-zA-Z0-9]+', '', 'g')),
        case
          -- Storefront references are displayed as SF-<order suffix> even
          -- though the linked order itself is stored as ORD-<suffix>.
          when lower(regexp_replace(coalesce(o.data->>'orderNumber', o.id), '[^a-zA-Z0-9]+', '', 'g')) like 'ord%' then
            'sf' || substring(lower(regexp_replace(coalesce(o.data->>'orderNumber', o.id), '[^a-zA-Z0-9]+', '', 'g')) from 4)
          else null
        end,
        case
          when lower(regexp_replace(coalesce(o.data->>'orderNumber', o.id), '[^a-zA-Z0-9]+', '', 'g')) like 'ord%' then
            'trk' || substring(lower(regexp_replace(coalesce(o.data->>'orderNumber', o.id), '[^a-zA-Z0-9]+', '', 'g')) from 4)
          when lower(regexp_replace(coalesce(o.data->>'orderNumber', o.id), '[^a-zA-Z0-9]+', '', 'g')) <> '' then
            'trk' || right(lower(regexp_replace(coalesce(o.data->>'orderNumber', o.id), '[^a-zA-Z0-9]+', '', 'g')), 8)
          else null
        end
      ], '') as lookup_codes
    from public.orders o
    left join business_matches bm
      on bm.normalized_business_key = regexp_replace(
        regexp_replace(lower(coalesce(o.business_id, '')), '^biz-', ''),
        '-',
        '',
        'g'
      )
    where (normalized_slug = '' or bm.business_id is not null)
      and normalized_email in (
        lower(regexp_replace(coalesce(o.data->>'customerEmail', ''), '\s+', '', 'g')),
        lower(regexp_replace(coalesce(o.data #>> '{customer,email}', ''), '\s+', '', 'g')),
        lower(regexp_replace(coalesce(o.data #>> '{billing,email}', ''), '\s+', '', 'g')),
        lower(regexp_replace(coalesce(o.data #>> '{fyllCheckout,customerEmail}', ''), '\s+', '', 'g'))
      )
  )
  select
    co.id,
    co.business_id,
    co.data,
    co.created_at,
    co.updated_at
  into matched_order
  from candidate_orders co
  where exists (
    select 1
    from unnest(co.lookup_codes) candidate(code)
    where candidate.code = normalized_code
      or (
        length(normalized_code) >= 4
        and length(candidate.code) > length(normalized_code)
        and right(candidate.code, length(normalized_code)) = normalized_code
      )
  )
  order by coalesce(co.updated_at, co.created_at, 'epoch'::timestamptz) desc, co.id asc
  limit 1;

  if not found then
    return null;
  end if;

  normalized_business_key := regexp_replace(
    regexp_replace(lower(coalesce(matched_order.business_id, '')), '^biz-', ''),
    '-',
    '',
    'g'
  );

  select
    b.id::text as business_id,
    b.name,
    b.data
  into matched_business
  from public.businesses b
  where regexp_replace(
    regexp_replace(lower(b.id::text), '^biz-', ''),
    '-',
    '',
    'g'
  ) = normalized_business_key
  order by coalesce(b.created_at, 'epoch'::timestamptz) desc, b.id asc
  limit 1;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'name', coalesce(p.data->>'name', ''),
        'imageUrl', nullif(coalesce(p.data->>'imageUrl', ''), '')
      )
      order by coalesce(p.updated_at, p.created_at, 'epoch'::timestamptz) desc, p.id asc
    ),
    '[]'::jsonb
  )
  into products_payload
  from public.products p
  where regexp_replace(
    regexp_replace(lower(coalesce(p.business_id, '')), '^biz-', ''),
    '-',
    '',
    'g'
  ) = normalized_business_key
    and p.id in (
      select distinct item->>'productId'
      from jsonb_array_elements(coalesce(matched_order.data->'items', '[]'::jsonb)) item
      where coalesce(item->>'productId', '') <> ''
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', os.id,
        'name', coalesce(os.data->>'name', ''),
        'color', coalesce(os.data->>'color', '#6B7280'),
        'order', coalesce((os.data->>'order')::integer, 999999),
        'trackingStage', coalesce(os.data->>'trackingStage', 'received')
      )
      order by coalesce((os.data->>'order')::integer, 999999), os.id asc
    ),
    '[]'::jsonb
  )
  into order_statuses_payload
  from public.order_statuses os
  where regexp_replace(
    regexp_replace(lower(coalesce(os.business_id, '')), '^biz-', ''),
    '-',
    '',
    'g'
  ) = normalized_business_key;

  select coalesce(bs.data->'orderTimelineSettings', '{}'::jsonb)
  into order_timeline_settings_payload
  from public.business_settings bs
  where bs.id = 'global'
    and regexp_replace(
      regexp_replace(lower(coalesce(bs.business_id, '')), '^biz-', ''),
      '-',
      '',
      'g'
    ) = normalized_business_key
  order by
    jsonb_array_length(coalesce(bs.data->'orderTimelineSettings'->'orderTypes', '[]'::jsonb)) desc,
    jsonb_array_length(coalesce(bs.data->'orderTimelineSettings'->'shippingZones', '[]'::jsonb)) desc,
    coalesce(bs.updated_at, bs.created_at, 'epoch'::timestamptz) desc,
    bs.business_id asc
  limit 1;

  public_order_payload := jsonb_build_object(
    'id', coalesce(matched_order.data->>'id', matched_order.id),
    'businessId', matched_order.business_id,
    'orderNumber', coalesce(nullif(matched_order.data->>'orderNumber', ''), matched_order.data->>'websiteOrderReference', matched_order.id),
    'websiteOrderReference', nullif(coalesce(matched_order.data->>'websiteOrderReference', matched_order.data #>> '{fyllCheckout,reference}', ''), ''),
    'customerTrackingCode', nullif(coalesce(matched_order.data->>'customerTrackingCode', ''), ''),
    'customerName', coalesce(matched_order.data->>'customerName', matched_order.data #>> '{customer,name}', ''),
    'customerEmail', coalesce(matched_order.data->>'customerEmail', matched_order.data #>> '{customer,email}', matched_order.data #>> '{billing,email}', ''),
    'deliveryState', coalesce(matched_order.data->>'deliveryState', ''),
    'deliveryAddress', coalesce(matched_order.data->>'deliveryAddress', ''),
    'customerPhone', coalesce(matched_order.data->>'customerPhone', matched_order.data #>> '{customer,phone}', matched_order.data #>> '{billing,phone}', ''),
    'deliveryFee', coalesce(matched_order.data->'deliveryFee', '0'::jsonb),
    'additionalCharges', coalesce(matched_order.data->'additionalCharges', '0'::jsonb),
    'additionalChargesNote', coalesce(matched_order.data->>'additionalChargesNote', ''),
    'discountAmount', coalesce(matched_order.data->'discountAmount', '0'::jsonb),
    'items', coalesce(matched_order.data->'items', '[]'::jsonb),
    'services', coalesce(matched_order.data->'services', '[]'::jsonb),
    'orderTypeId', nullif(coalesce(matched_order.data->>'orderTypeId', ''), ''),
    'orderTypeName', nullif(coalesce(matched_order.data->>'orderTypeName', ''), ''),
    'status', coalesce(matched_order.data->>'status', matched_order.data->>'orderStatus', 'Order received'),
    'totalAmount', coalesce(matched_order.data->'totalAmount', matched_order.data->'amount', '0'::jsonb),
    'logistics', jsonb_build_object(
      'carrierId', coalesce(matched_order.data #>> '{logistics,carrierId}', ''),
      'carrierName', coalesce(matched_order.data #>> '{logistics,carrierName}', ''),
      'trackingNumber', nullif(coalesce(matched_order.data #>> '{logistics,trackingNumber}', ''), ''),
      'dispatchDate', nullif(coalesce(matched_order.data #>> '{logistics,dispatchDate}', ''), ''),
      'datePickedUp', nullif(coalesce(matched_order.data #>> '{logistics,datePickedUp}', ''), '')
    ),
    'fulfillmentStage', nullif(coalesce(matched_order.data->>'fulfillmentStage', ''), ''),
    'fulfillmentStartedAt', nullif(coalesce(matched_order.data->>'fulfillmentStartedAt', ''), ''),
    'fulfillmentTimelineDays', coalesce(matched_order.data->'fulfillmentTimelineDays', '6'::jsonb),
    'fulfillmentOriginalEta', nullif(coalesce(matched_order.data->>'fulfillmentOriginalEta', ''), ''),
    'fulfillmentEffectiveEta', nullif(coalesce(matched_order.data->>'fulfillmentEffectiveEta', ''), ''),
    'deliveryConfirmationStatus', nullif(coalesce(matched_order.data->>'deliveryConfirmationStatus', ''), ''),
    'deliveryConfirmationRequestedAt', nullif(coalesce(matched_order.data->>'deliveryConfirmationRequestedAt', ''), ''),
    'deliveryConfirmationConfirmedAt', nullif(coalesce(matched_order.data->>'deliveryConfirmationConfirmedAt', ''), ''),
    'deliveryConfirmationLastResponseAt', nullif(coalesce(matched_order.data->>'deliveryConfirmationLastResponseAt', ''), ''),
    'orderDate', coalesce(matched_order.data->>'orderDate', matched_order.created_at::text),
    'createdAt', coalesce(matched_order.data->>'createdAt', matched_order.created_at::text),
    'updatedAt', coalesce(matched_order.data->>'updatedAt', matched_order.updated_at::text, matched_order.created_at::text),
    'activityLog', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'action', coalesce(entry->>'action', ''),
            'date', coalesce(entry->>'date', '')
          )
          order by ordinality
        )
        from jsonb_array_elements(coalesce(matched_order.data->'activityLog', '[]'::jsonb)) with ordinality as activity(entry, ordinality)
      ),
      '[]'::jsonb
    )
  );

  return jsonb_build_object(
    'businessId', matched_order.business_id,
    'businessSlug', coalesce(
      nullif(regexp_replace(
        regexp_replace(lower(trim(coalesce(matched_business.data->>'businessSlug', ''))), '[^a-z0-9]+', '-', 'g'),
        '(^-|-$)',
        '',
        'g'
      ), ''),
      regexp_replace(
        regexp_replace(lower(trim(coalesce(coalesce(nullif(trim(coalesce(matched_business.data->>'businessName', '')), ''), matched_business.name), ''))), '[^a-z0-9]+', '-', 'g'),
        '(^-|-$)',
        '',
        'g'
      )
    ),
    'businessName', coalesce(nullif(trim(coalesce(matched_business.data->>'businessName', '')), ''), matched_business.name, ''),
    'businessLogo', matched_business.data->>'businessLogo',
    'businessWebsite', nullif(trim(coalesce(matched_business.data->>'businessWebsite', '')), ''),
    'order', public_order_payload,
    'products', products_payload,
    'orderStatuses', order_statuses_payload,
    'orderTimelineSettings', order_timeline_settings_payload
  );
end;
$$;

grant execute on function public.lookup_public_order_tracking(text, text, text) to anon;
grant execute on function public.lookup_public_order_tracking(text, text, text) to authenticated;

create or replace function public.lookup_public_purchase_tracking(
  tracking_code_input text,
  email_input text,
  business_slug_input text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_code text := lower(regexp_replace(trim(coalesce(tracking_code_input, '')), '[^a-zA-Z0-9]+', '', 'g'));
  normalized_email text := lower(regexp_replace(trim(coalesce(email_input, '')), '\s+', '', 'g'));
  normalized_slug text := lower(regexp_replace(trim(coalesce(business_slug_input, '')), '[^a-zA-Z0-9]+', '', 'g'));
  checkout_record record;
  business_record record;
  linked_order record;
  order_result jsonb;
  order_lookup_code text;
  checkout_payload jsonb;
  resolved_business_slug text;
begin
  if normalized_code = '' or normalized_email = '' then
    return null;
  end if;

  -- Preserve the existing order lookup for ordinary order/tracking codes.
  order_result := public.lookup_public_order_tracking(
    tracking_code_input,
    email_input,
    business_slug_input
  );

  select sc.id, sc.business_id, sc.data, sc.created_at, sc.updated_at
  into checkout_record
  from public.social_checkouts sc
  join public.businesses b
    on lower(regexp_replace(regexp_replace(b.id::text, '^biz-', ''), '-', '', 'g'))
      = lower(regexp_replace(regexp_replace(coalesce(sc.business_id, ''), '^biz-', ''), '-', '', 'g'))
  where lower(regexp_replace(coalesce(sc.data->>'customerEmail', ''), '\s+', '', 'g')) = normalized_email
    and (
      lower(regexp_replace(sc.id, '[^a-zA-Z0-9]+', '', 'g')) = normalized_code
      or lower(regexp_replace('SC-' || sc.id, '[^a-zA-Z0-9]+', '', 'g')) = normalized_code
      or (
        coalesce(sc.data->>'convertedOrderId', '') <> ''
        and exists (
          select 1
          from public.orders linked
          where linked.id = sc.data->>'convertedOrderId'
            and lower(regexp_replace(coalesce(linked.data->>'customerEmail', ''), '\s+', '', 'g')) = normalized_email
            and normalized_code in (
              lower(regexp_replace(coalesce(linked.data->>'orderNumber', ''), '[^a-zA-Z0-9]+', '', 'g')),
              lower(regexp_replace(coalesce(linked.data->>'websiteOrderReference', ''), '[^a-zA-Z0-9]+', '', 'g')),
              lower(regexp_replace(coalesce(linked.data->>'customerTrackingCode', ''), '[^a-zA-Z0-9]+', '', 'g'))
            )
        )
      )
    )
    and (
      normalized_slug = ''
      or lower(regexp_replace(coalesce(b.data->>'businessSlug', ''), '[^a-zA-Z0-9]+', '', 'g')) = normalized_slug
      or lower(regexp_replace(coalesce(nullif(trim(coalesce(b.data->>'businessName', '')), ''), b.name, ''), '[^a-zA-Z0-9]+', '', 'g')) = normalized_slug
    )
  order by coalesce(sc.updated_at, sc.created_at, 'epoch'::timestamptz) desc
  limit 1;

  if checkout_record.id is null then
    return order_result;
  end if;

  select b.id::text as business_id, b.name, b.data
  into business_record
  from public.businesses b
  where lower(regexp_replace(regexp_replace(b.id::text, '^biz-', ''), '-', '', 'g'))
    = lower(regexp_replace(regexp_replace(coalesce(checkout_record.business_id, ''), '^biz-', ''), '-', '', 'g'))
  order by coalesce(b.created_at, 'epoch'::timestamptz) desc
  limit 1;

  resolved_business_slug := coalesce(
    nullif(trim(coalesce(business_record.data->>'businessSlug', '')), ''),
    lower(regexp_replace(coalesce(nullif(trim(coalesce(business_record.data->>'businessName', '')), ''), business_record.name, ''), '[^a-zA-Z0-9]+', '-', 'g'))
  );

  checkout_payload := jsonb_build_object(
    'code', checkout_record.id,
    'status', case
      when checkout_record.data->>'status' = 'awaiting_payment'
        and nullif(checkout_record.data->>'expiresAt', '') is not null
        and (checkout_record.data->>'expiresAt')::timestamptz < now()
      then 'expired'
      else coalesce(checkout_record.data->>'status', 'awaiting_payment')
    end,
    'amount', coalesce(checkout_record.data->'amount', '0'::jsonb),
    'billNote', coalesce(checkout_record.data->>'billNote', ''),
    'customerName', coalesce(checkout_record.data->>'customerName', ''),
    'customerEmail', coalesce(checkout_record.data->>'customerEmail', ''),
    'deliveryAddress', coalesce(checkout_record.data->>'deliveryAddress', ''),
    'deliveryState', coalesce(checkout_record.data->>'deliveryState', ''),
    'customerPhone', coalesce(checkout_record.data->>'customerPhone', ''),
    'submittedAt', nullif(coalesce(checkout_record.data->>'submittedAt', ''), ''),
    'reviewedAt', nullif(coalesce(checkout_record.data->>'reviewedAt', ''), ''),
    'convertedOrderId', nullif(coalesce(checkout_record.data->>'convertedOrderId', ''), ''),
    'createdAt', coalesce(checkout_record.data->>'createdAt', checkout_record.created_at::text),
    'updatedAt', coalesce(checkout_record.data->>'updatedAt', checkout_record.updated_at::text),
    'activityLog', coalesce(checkout_record.data->'activityLog', '[]'::jsonb)
  );

  if coalesce(checkout_record.data->>'convertedOrderId', '') <> '' then
    select o.id, o.data
    into linked_order
    from public.orders o
    where o.id = checkout_record.data->>'convertedOrderId'
      and lower(regexp_replace(coalesce(o.data->>'customerEmail', ''), '\s+', '', 'g')) = normalized_email
    limit 1;

    if linked_order.id is not null then
      order_lookup_code := coalesce(
        nullif(linked_order.data->>'customerTrackingCode', ''),
        nullif(linked_order.data->>'orderNumber', ''),
        nullif(linked_order.data->>'websiteOrderReference', ''),
        linked_order.id
      );
      order_result := public.lookup_public_order_tracking(
        order_lookup_code,
        email_input,
        resolved_business_slug
      );
    end if;
  end if;

  if order_result is not null then
    return order_result || jsonb_build_object(
      'businessPhone', nullif(trim(coalesce(business_record.data->>'businessPhone', '')), ''),
      'socialCheckout', checkout_payload
    );
  end if;

  return jsonb_build_object(
    'businessId', checkout_record.business_id,
    'businessSlug', resolved_business_slug,
    'businessName', coalesce(nullif(trim(coalesce(business_record.data->>'businessName', '')), ''), business_record.name, 'Fyll'),
    'businessLogo', nullif(coalesce(business_record.data->>'businessLogo', ''), ''),
    'businessPhone', nullif(trim(coalesce(business_record.data->>'businessPhone', '')), ''),
    'businessWebsite', nullif(trim(coalesce(business_record.data->>'businessWebsite', '')), ''),
    'order', null,
    'socialCheckout', checkout_payload,
    'products', '[]'::jsonb,
    'orderStatuses', '[]'::jsonb,
    'orderTimelineSettings', null
  );
end;
$$;

grant execute on function public.lookup_public_purchase_tracking(text, text, text) to anon;
grant execute on function public.lookup_public_purchase_tracking(text, text, text) to authenticated;
