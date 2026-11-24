-- Fyll Pay QR: a reusable payment page per business at payment.fyll.app/<business>/pay.
--
-- Security model:
-- * The QR only holds a link. The bank details always come from the business's own
--   payment account marked for Fyll Pay (payment_accounts.data->>'fyllPayQr' = 'true'),
--   which only signed-in staff of that business can set. Nobody can make a Fyll Pay page
--   show someone else's account by editing a link.
-- * No row is created until the customer submits a receipt, so scanning alone leaves
--   nothing behind in Payments.
-- * Submissions land in social_checkouts as 'payment_submitted', so the existing Payments
--   review screen and the payment-received notification trigger handle them unchanged.

-- Safe to re-run: clears any earlier attempt so the return type can be text.
drop function if exists public.fyll_pay_business_id_for_slug(text);

create or replace function public.fyll_pay_business_id_for_slug(business_slug_input text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select b.id::text
  from public.businesses b
  where coalesce(regexp_replace(lower(trim(coalesce(business_slug_input, ''))), '[^a-z0-9]+', '', 'g'), '') <> ''
    and regexp_replace(lower(trim(coalesce(business_slug_input, ''))), '[^a-z0-9]+', '', 'g') in (
      regexp_replace(lower(coalesce(b.data->>'businessSlug', '')), '[^a-z0-9]+', '', 'g'),
      regexp_replace(lower(coalesce(b.data->>'storefrontSlug', '')), '[^a-z0-9]+', '', 'g')
    )
  order by b.id::text
  limit 1;
$$;

revoke all on function public.fyll_pay_business_id_for_slug(text) from public;

create or replace function public.get_fyll_pay_public(business_slug_input text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  target_id text;
  matched_business record;
  account jsonb;
begin
  target_id := public.fyll_pay_business_id_for_slug(business_slug_input);
  if target_id is null then
    return null;
  end if;

  select name, data into matched_business from public.businesses where id::text = target_id;

  select pa.data into account
  from public.payment_accounts pa
  where pa.business_id = target_id
    and coalesce(pa.data->>'fyllPayQr', 'false') = 'true'
  order by pa.updated_at desc nulls last
  limit 1;

  return jsonb_build_object(
    'businessName', coalesce(nullif(trim(coalesce(matched_business.data->>'businessName', '')), ''), matched_business.name, 'Fyll'),
    'businessLogo', matched_business.data->>'businessLogo',
    'country', coalesce(nullif(upper(trim(coalesce(matched_business.data->>'country', ''))), ''), 'NG'),
    'currency', coalesce(nullif(upper(trim(coalesce(matched_business.data->>'currency', ''))), ''), 'NGN'),
    'enabled', account is not null,
    'bankAccount', case when account is null then null
      else account - 'id' - 'isDefault' - 'fyllPayQr' end
  );
end;
$$;

grant execute on function public.get_fyll_pay_public(text) to anon;
grant execute on function public.get_fyll_pay_public(text) to authenticated;

create or replace function public.submit_fyll_pay_payment(
  business_slug_input text,
  code_input text,
  amount_input numeric,
  customer_name_input text,
  customer_phone_input text,
  customer_email_input text,
  proof_image_url_input text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_id text;
  account jsonb;
  normalized_code text := upper(trim(coalesce(code_input, '')));
  clean_name text := regexp_replace(trim(coalesce(customer_name_input, '')), '\s+', ' ', 'g');
  clean_phone text := trim(coalesce(customer_phone_input, ''));
  clean_email text := lower(trim(coalesce(customer_email_input, '')));
  proof_url text := trim(coalesce(proof_image_url_input, ''));
  recent_count integer;
  now_ts timestamptz := now();
  draft jsonb;
begin
  target_id := public.fyll_pay_business_id_for_slug(business_slug_input);
  if target_id is null then
    return jsonb_build_object('ok', false, 'error', 'business_not_found');
  end if;

  select pa.data into account
  from public.payment_accounts pa
  where pa.business_id = target_id
    and coalesce(pa.data->>'fyllPayQr', 'false') = 'true'
  order by pa.updated_at desc nulls last
  limit 1;
  if account is null then
    return jsonb_build_object('ok', false, 'error', 'not_enabled');
  end if;

  -- Same alphabet and length as generateCheckoutCode() in the app.
  if normalized_code !~ '^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{10}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;
  if amount_input is null or amount_input <= 0 or amount_input > 1000000000 then
    return jsonb_build_object('ok', false, 'error', 'invalid_amount');
  end if;
  if char_length(clean_name) < 2 or char_length(clean_name) > 80 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;
  if char_length(regexp_replace(clean_phone, '\D', '', 'g')) < 7 or char_length(clean_phone) > 24 then
    return jsonb_build_object('ok', false, 'error', 'invalid_phone');
  end if;
  if clean_email <> '' and (char_length(clean_email) > 160 or clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    return jsonb_build_object('ok', false, 'error', 'invalid_email');
  end if;
  -- The receipt must be the one uploaded for this code in the public proofs bucket.
  if proof_url = '' or position(('/social-checkout-proofs/' || normalized_code || '/') in proof_url) = 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_receipt');
  end if;

  if exists (select 1 from public.social_checkouts where id = normalized_code) then
    return jsonb_build_object('ok', false, 'error', 'duplicate');
  end if;

  -- Keep a public page from flooding one business's Payments list.
  select count(*) into recent_count
  from public.social_checkouts sc
  where sc.business_id = target_id
    and sc.data->>'source' = 'fyll_pay_qr'
    and sc.created_at > now_ts - interval '1 hour';
  if recent_count >= 60 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  draft := jsonb_build_object(
    'id', normalized_code,
    'businessId', target_id,
    'status', 'awaiting_payment',
    'source', 'fyll_pay_qr',
    'billNote', 'Paid with Fyll Pay QR',
    'amount', round(amount_input, 2),
    'bankAccount', account - 'id' - 'isDefault' - 'fyllPayQr',
    'createdBy', 'Fyll Pay QR',
    'createdByUserId', '',
    'createdAt', to_jsonb(now_ts),
    'expiresAt', to_jsonb(now_ts + interval '24 hours'),
    'updatedAt', to_jsonb(now_ts),
    'customerName', clean_name,
    'customerPhone', clean_phone,
    'customerEmail', nullif(clean_email, '')
  );

  insert into public.social_checkouts (id, business_id, data, created_at, updated_at)
  values (normalized_code, target_id, draft, now_ts, now_ts);

  -- Moving it to payment_submitted in a separate update fires the existing
  -- payment-received notification trigger (it only listens for updates).
  update public.social_checkouts
  set data = data || jsonb_build_object(
        'status', 'payment_submitted',
        'proofImageUrl', proof_url,
        'submittedAt', to_jsonb(now_ts),
        'updatedAt', to_jsonb(now_ts)
      ),
      updated_at = now_ts
  where id = normalized_code and business_id = target_id;

  return jsonb_build_object('ok', true, 'code', normalized_code);
end;
$$;

grant execute on function public.submit_fyll_pay_payment(text, text, numeric, text, text, text, text) to anon;
grant execute on function public.submit_fyll_pay_payment(text, text, numeric, text, text, text, text) to authenticated;
