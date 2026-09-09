-- Public delivery-details edit for account.fyll.store's Orders page.
-- Run this in the Supabase SQL editor after public_order_delivery_confirmation.sql.
--
-- What it does:
-- 1) Adds a public write RPC that lets a customer correct their own order's
--    delivery details — recipient name, phone, and address (e.g. a typo, or
--    details that changed after the order was placed).
-- 2) Matching requires the order code/reference plus the customer email —
--    same authorization model as confirm_public_order_delivery /
--    lookup_public_order_tracking.
-- 3) Refuses the edit once the order is cancelled or has passed the
--    fulfillment cutoff (dispatched/out for delivery/delivered) — mirrors
--    account.fyll.store's own inferStage() classification
--    (fyll-account/api/_server/fyll2-tracking.ts) so the UI's Edit button
--    and this RPC agree on when editing is still allowed.
--
-- 4) On success, notifies the business's staff (push + in-app, via the same
--    send-thread-notification Edge Function / CRON_SECRET path used by
--    setup_payment_notifications.sql) so they know to double-check the
--    order before picking/packing it.
--
-- Important:
-- - This does not modify any existing data — it only adds a new write
--   function, scoped to a single order per call.
-- - Supersedes an earlier draft of this RPC (update_public_order_delivery_address,
--   address-only) which was never deployed — no drop needed.
-- - Requires the 'order_delivery_details_updated' payload type to be
--   deployed on send-thread-notification (see that function's index.ts) —
--   deploy it first, or this call harmlessly no-ops against a 400 response.

create extension if not exists pg_net with schema extensions;

create or replace function public.update_public_order_delivery_details(
  tracking_code_input text,
  email_input text,
  customer_name_input text,
  customer_phone_input text,
  address_input jsonb, -- { address1, address2?, city, state, country, postalCode? }
  business_slug_input text default null
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
  new_address jsonb;
begin
  if normalized_code = '' or normalized_email = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_input');
  end if;

  if coalesce(trim(customer_name_input), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'incomplete_name');
  end if;

  if coalesce(address_input->>'address1', '') = '' or coalesce(address_input->>'city', '') = '' then
    return jsonb_build_object('ok', false, 'error', 'incomplete_address');
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
    return jsonb_build_object('ok', false, 'error', 'order_not_found');
  end if;

  current_status := lower(trim(coalesce(matched_order.data->>'status', '')));

  if current_status ~* 'cancel|reject|refund' then
    return jsonb_build_object('ok', false, 'error', 'cancelled');
  end if;

  -- Same classification as inferStage() in fyll-account/api/_server/fyll2-tracking.ts —
  -- editing is only allowed while the order is still received/processing.
  if current_status ~* 'deliver|fulfilled?|collection|\ycollected?\y|\yclosed\y|\ycomplete(d)?\y'
    or current_status ~* 'dispatch|shipp?|in[\s-]?transit|out[\s-]?for[\s-]?delivery|courier|rider|waybill|pick[\s-]?up'
  then
    return jsonb_build_object('ok', false, 'error', 'past_fulfillment_cutoff');
  end if;

  new_address := jsonb_build_object(
    'address1', coalesce(address_input->>'address1', ''),
    'address2', coalesce(address_input->>'address2', ''),
    'city', coalesce(address_input->>'city', ''),
    'state', coalesce(address_input->>'state', ''),
    'country', coalesce(address_input->>'country', ''),
    'postalCode', coalesce(address_input->>'postalCode', '')
  );

  next_data := matched_order.data;
  next_data := jsonb_set(next_data, '{customerName}', to_jsonb(trim(customer_name_input)), true);
  next_data := jsonb_set(next_data, '{customerPhone}', to_jsonb(coalesce(trim(customer_phone_input), '')), true);
  next_data := jsonb_set(next_data, '{deliveryAddress}', new_address, true);
  next_data := jsonb_set(next_data, '{deliveryState}', to_jsonb(coalesce(address_input->>'state', '')), true);
  next_data := jsonb_set(next_data, '{updatedAt}', to_jsonb(now_iso), true);
  next_data := jsonb_set(next_data, '{updatedBy}', to_jsonb('Customer'::text), true);
  next_data := jsonb_set(
    next_data,
    '{activityLog}',
    coalesce(next_data->'activityLog', '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object(
        'staffName', 'Customer',
        'action', 'Customer updated delivery details',
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

  -- Best-effort staff notification — never blocks or fails the edit itself.
  begin
    perform net.http_post(
      url        := 'https://pmqmefvzgmlxxbgicdpi.supabase.co/functions/v1/send-thread-notification',
      headers    := jsonb_build_object(
                      'Content-Type',  'application/json',
                      'Authorization', 'Bearer c39eabc8b436342f163f8c4461de14e1f50accab1f45ce1b1848f8ec002f2acf'
                    ),
      body       := jsonb_build_object(
                      'type', 'order_delivery_details_updated',
                      'businessId', matched_order.business_id,
                      'orderNumber', coalesce(next_data->>'orderNumber', matched_order.id),
                      'customerName', next_data->>'customerName'
                    ),
      timeout_milliseconds := 10000
    );
  exception when others then
    null;
  end;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.update_public_order_delivery_details(text, text, text, text, jsonb, text) to anon;
grant execute on function public.update_public_order_delivery_details(text, text, text, text, jsonb, text) to authenticated;
