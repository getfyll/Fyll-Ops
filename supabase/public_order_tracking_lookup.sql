-- Public customer tracking lookup for order-tracking pages.
-- Run this in the Supabase SQL editor.
--
-- What it does:
-- 1) Adds a read-only RPC for tracking-code + email lookups.
-- 2) Matches business_id aliases safely (UUID, hyphenated UUID, biz-compact UUID).
-- 3) Optionally narrows the lookup to a branded business slug.
-- 4) Accepts WooCommerce website order references as a customer lookup key.
-- 5) Returns the order plus lightweight business/status/timeline/product context.
--
-- Important:
-- - This script does not modify any existing order or settings data.
-- - It only adds a lookup function and grants execute to anon/authenticated.

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
      coalesce(nullif(trim(coalesce(b.data->>'businessName', '')), ''), b.name) as tracking_business_name,
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
  )
  select
    o.id,
    o.business_id,
    o.data,
    o.created_at,
    o.updated_at
  into matched_order
  from public.orders o
  left join business_matches bm
    on bm.normalized_business_key = regexp_replace(
      regexp_replace(lower(coalesce(o.business_id, '')), '^biz-', ''),
      '-',
      '',
      'g'
    )
  where lower(regexp_replace(coalesce(o.data->>'customerEmail', ''), '\s+', '', 'g')) = normalized_email
    and normalized_code in (
      lower(regexp_replace(coalesce(o.data->>'orderNumber', ''), '[^a-zA-Z0-9]+', '', 'g')),
      lower(regexp_replace(coalesce(o.data->>'websiteOrderReference', ''), '[^a-zA-Z0-9]+', '', 'g')),
      lower(regexp_replace(coalesce(o.data->>'customerTrackingCode', ''), '[^a-zA-Z0-9]+', '', 'g')),
      lower(regexp_replace(coalesce(o.data #>> '{logistics,trackingNumber}', ''), '[^a-zA-Z0-9]+', '', 'g')),
      case
        when lower(regexp_replace(coalesce(o.data->>'orderNumber', o.id), '[^a-zA-Z0-9]+', '', 'g')) like 'ord%' then
          'trk' || substring(lower(regexp_replace(coalesce(o.data->>'orderNumber', o.id), '[^a-zA-Z0-9]+', '', 'g')) from 4)
        when lower(regexp_replace(coalesce(o.data->>'orderNumber', o.id), '[^a-zA-Z0-9]+', '', 'g')) <> '' then
          'trk' || right(lower(regexp_replace(coalesce(o.data->>'orderNumber', o.id), '[^a-zA-Z0-9]+', '', 'g')), 8)
        else
          'trkunknown'
      end
    )
    and (normalized_slug = '' or bm.business_id is not null)
  order by coalesce(o.updated_at, o.created_at, 'epoch'::timestamptz) desc, o.id asc
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
        'name', coalesce(p.data->>'name', '')
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
    'orderNumber', coalesce(matched_order.data->>'orderNumber', ''),
    'websiteOrderReference', nullif(coalesce(matched_order.data->>'websiteOrderReference', ''), ''),
    'customerTrackingCode', nullif(coalesce(matched_order.data->>'customerTrackingCode', ''), ''),
    'customerName', coalesce(matched_order.data->>'customerName', ''),
    'customerEmail', coalesce(matched_order.data->>'customerEmail', ''),
    'deliveryState', coalesce(matched_order.data->>'deliveryState', ''),
    'items', coalesce(matched_order.data->'items', '[]'::jsonb),
    'services', coalesce(matched_order.data->'services', '[]'::jsonb),
    'orderTypeId', nullif(coalesce(matched_order.data->>'orderTypeId', ''), ''),
    'orderTypeName', nullif(coalesce(matched_order.data->>'orderTypeName', ''), ''),
    'status', coalesce(matched_order.data->>'status', ''),
    'totalAmount', coalesce(matched_order.data->'totalAmount', '0'::jsonb),
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
    'updatedAt', coalesce(matched_order.data->>'updatedAt', matched_order.updated_at::text),
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

create or replace function public.get_public_tracking_business(
  business_slug_input text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_slug text := regexp_replace(
    regexp_replace(lower(trim(coalesce(business_slug_input, ''))), '[^a-z0-9]+', '-', 'g'),
    '(^-|-$)',
    '',
    'g'
  );
  matched_business record;
begin
  if normalized_slug = '' then
    return null;
  end if;

  select
    b.id::text as business_id,
    b.name,
    b.data
  into matched_business
  from public.businesses b
  where regexp_replace(
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
  order by coalesce(b.created_at, 'epoch'::timestamptz) desc, b.id asc
  limit 1;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'businessId', matched_business.business_id,
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
    'businessWebsite', nullif(trim(coalesce(matched_business.data->>'businessWebsite', '')), '')
  );
end;
$$;

grant execute on function public.get_public_tracking_business(text) to anon;
grant execute on function public.get_public_tracking_business(text) to authenticated;
