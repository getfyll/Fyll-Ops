-- Make public payment links region-aware and preserve the customer's optional
-- postcode through the contact-details and proof-submission steps.

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
    'country', coalesce(nullif(upper(trim(coalesce(matched_business.data->>'country', ''))), ''), 'NG'),
    'currency', coalesce(nullif(upper(trim(coalesce(matched_business.data->>'currency', ''))), ''), 'NGN'),
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
    'expiresAt', matched.data->'expiresAt',
    'customerName', matched.data->>'customerName',
    'customerPhone', matched.data->>'customerPhone',
    'customerEmail', matched.data->>'customerEmail',
    'deliveryAddress', matched.data->>'deliveryAddress',
    'deliveryState', matched.data->>'deliveryState',
    'deliveryPostcode', matched.data->>'deliveryPostcode'
  );
end;
$$;

grant execute on function public.get_social_checkout_public(text) to anon;
grant execute on function public.get_social_checkout_public(text) to authenticated;

drop function if exists public.submit_social_checkout_payment(text, text, text, text, text, text, text);

create function public.submit_social_checkout_payment(
  code_input text,
  customer_name_input text,
  customer_phone_input text,
  customer_email_input text,
  delivery_address_input text,
  delivery_state_input text,
  delivery_postcode_input text,
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

  updated_data := matched.data || jsonb_build_object(
    'status', 'payment_submitted',
    'customerName', customer_name_input,
    'customerPhone', customer_phone_input,
    'customerEmail', customer_email_input,
    'deliveryAddress', delivery_address_input,
    'deliveryState', delivery_state_input,
    'deliveryPostcode', delivery_postcode_input,
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

grant execute on function public.submit_social_checkout_payment(text, text, text, text, text, text, text, text) to anon;
grant execute on function public.submit_social_checkout_payment(text, text, text, text, text, text, text, text) to authenticated;

drop function if exists public.save_social_checkout_details(text, text, text, text, text, text);

create function public.save_social_checkout_details(
  code_input text,
  customer_name_input text,
  customer_phone_input text,
  customer_email_input text,
  delivery_address_input text,
  delivery_state_input text,
  delivery_postcode_input text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  matched record;
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

  update public.social_checkouts
  set data = matched.data || jsonb_build_object(
        'customerName', customer_name_input,
        'customerPhone', customer_phone_input,
        'customerEmail', customer_email_input,
        'deliveryAddress', delivery_address_input,
        'deliveryState', delivery_state_input,
        'deliveryPostcode', delivery_postcode_input,
        'detailsSavedAt', to_jsonb(now()),
        'updatedAt', to_jsonb(now())
      ),
      updated_at = now()
  where id = code_input and business_id = matched.business_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.save_social_checkout_details(text, text, text, text, text, text, text) to anon;
grant execute on function public.save_social_checkout_details(text, text, text, text, text, text, text) to authenticated;
