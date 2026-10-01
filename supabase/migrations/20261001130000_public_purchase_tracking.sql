-- Extends public tracking so a social-checkout payment can be followed before
-- an order exists, then continue at the same URL after staff creates the order.

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
