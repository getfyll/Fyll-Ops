-- Public delivery confirmation for customer follow-up emails.
-- Run this in the Supabase SQL editor after public_order_tracking_lookup.sql.
--
-- What it does:
-- 1) Adds a public RPC for delivery confirmation links.
-- 2) Lets a customer mark an order as Delivered or Pending Delivery.
-- 3) Returns the refreshed public tracking payload after the update.
--
-- Important:
-- - Matching still requires the order code/reference plus the customer email.
-- - This is intended for email-link confirmation pages, not staff operations.

create or replace function public.confirm_public_order_delivery(
  tracking_code_input text,
  email_input text,
  business_slug_input text default null,
  received_input boolean default true
)
returns jsonb
language plpgsql
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
  next_data jsonb;
  now_iso text := now()::text;
  current_status text;
begin
  if normalized_code = '' or normalized_email = '' then
    return null;
  end if;

  with business_matches as (
    select
      b.id::text as business_id,
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
    o.data
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

  current_status := lower(trim(coalesce(matched_order.data->>'status', '')));

  if current_status like '%cancel%' then
    return public.lookup_public_order_tracking(tracking_code_input, email_input, business_slug_input);
  end if;

  if received_input = false and (
    coalesce(matched_order.data->>'deliveryConfirmationStatus', '') = 'confirmed'
    or current_status like '%deliver%'
  ) then
    return public.lookup_public_order_tracking(tracking_code_input, email_input, business_slug_input);
  end if;

  next_data := matched_order.data;
  next_data := jsonb_set(next_data, '{updatedAt}', to_jsonb(now_iso), true);
  next_data := jsonb_set(next_data, '{updatedBy}', to_jsonb('Customer'::text), true);
  next_data := jsonb_set(next_data, '{deliveryConfirmationStatus}', to_jsonb(case when received_input then 'confirmed' else 'pending' end), true);
  next_data := jsonb_set(next_data, '{deliveryConfirmationLastResponseAt}', to_jsonb(now_iso), true);
  next_data := jsonb_set(
    next_data,
    '{deliveryConfirmationConfirmedAt}',
    case when received_input then to_jsonb(now_iso) else 'null'::jsonb end,
    true
  );
  next_data := jsonb_set(
    next_data,
    '{status}',
    to_jsonb(case when received_input then 'Delivered' else 'Pending Delivery' end),
    true
  );
  next_data := jsonb_set(
    next_data,
    '{activityLog}',
    coalesce(next_data->'activityLog', '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object(
        'staffName', 'Customer',
        'action', case when received_input then 'Customer confirmed order delivered' else 'Customer reported order still pending delivery' end,
        'date', now_iso
      )
    ),
    true
  );

  update public.orders
  set
    data = next_data,
    updated_at = now()
  where id = matched_order.id
    and business_id = matched_order.business_id;

  return public.lookup_public_order_tracking(tracking_code_input, email_input, business_slug_input);
end;
$$;

grant execute on function public.confirm_public_order_delivery(text, text, text, boolean) to anon;
grant execute on function public.confirm_public_order_delivery(text, text, text, boolean) to authenticated;
