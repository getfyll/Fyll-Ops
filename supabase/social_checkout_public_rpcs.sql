-- Public Social Checkout RPCs — customer-facing /checkout/[code] page.
-- Run this in the Supabase SQL editor after social_checkout_tables.sql.
--
-- What it does:
-- 1) Adds a read-only RPC for looking up a checkout draft by its shareable
--    code — no business_id needed from the client, the code alone is the
--    lookup key (10 random chars, ~50 bits of entropy, generated client-side
--    by generateCheckoutCode.ts).
-- 2) Adds a write RPC that lets an anonymous customer submit their payment
--    proof/details exactly once per draft — it only succeeds while the
--    draft's status is still 'awaiting_payment', so a submitted/verified
--    draft can never be re-submitted or tampered with afterwards.
--
-- Important:
-- - Neither RPC exposes anything beyond what's needed for the payment page.
-- - The underlying social_checkouts table itself has NO anon grants at all
--   (see social_checkout_tables.sql) — these two RPCs are the only way an
--   unauthenticated client can ever touch this data, same pattern as
--   public_order_tracking_lookup.sql / public_order_delivery_confirmation.sql.

create or replace function public.get_social_checkout_public(code_input text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  matched record;
  matched_business record;
begin
  select id, business_id, data into matched
  from public.social_checkouts
  where id = code_input;

  if matched.id is null then
    return null;
  end if;

  select name, data into matched_business
  from public.businesses
  where id = matched.business_id;

  return jsonb_build_object(
    'businessId', matched.business_id,
    'businessName', coalesce(nullif(trim(coalesce(matched_business.data->>'businessName', '')), ''), matched_business.name, 'Fyll'),
    'businessLogo', matched_business.data->>'businessLogo',
    'status', case
      when matched.data->>'status' = 'awaiting_payment'
        and (matched.data->>'expiresAt') is not null
        and (matched.data->>'expiresAt')::timestamptz < now()
      then 'expired'
      else matched.data->>'status'
    end,
    'amount', matched.data->'amount',
    'billNote', matched.data->'billNote',
    'bankAccount', matched.data->'bankAccount',
    'expiresAt', matched.data->'expiresAt'
  );
end;
$$;

grant execute on function public.get_social_checkout_public(text) to anon;
grant execute on function public.get_social_checkout_public(text) to authenticated;

create or replace function public.submit_social_checkout_payment(
  code_input text,
  customer_name_input text,
  customer_phone_input text,
  customer_email_input text,
  delivery_address_input text,
  delivery_state_input text,
  proof_image_url_input text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  matched record;
  updated_data jsonb;
begin
  select id, business_id, data into matched
  from public.social_checkouts
  where id = code_input
    and data->>'status' = 'awaiting_payment';

  if matched.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found_or_already_submitted');
  end if;

  if (matched.data->>'expiresAt') is not null
    and (matched.data->>'expiresAt')::timestamptz < now()
  then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  updated_data := matched.data
    || jsonb_build_object(
      'status', 'payment_submitted',
      'customerName', customer_name_input,
      'customerPhone', customer_phone_input,
      'customerEmail', customer_email_input,
      'deliveryAddress', delivery_address_input,
      'deliveryState', delivery_state_input,
      'proofImageUrl', proof_image_url_input,
      'submittedAt', to_jsonb(now()),
      'updatedAt', to_jsonb(now())
    );

  update public.social_checkouts
  set data = updated_data, updated_at = now()
  where id = code_input and business_id = matched.business_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.submit_social_checkout_payment(text, text, text, text, text, text, text) to anon;
grant execute on function public.submit_social_checkout_payment(text, text, text, text, text, text, text) to authenticated;
