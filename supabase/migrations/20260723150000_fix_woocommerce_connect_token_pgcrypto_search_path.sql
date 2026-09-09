-- Supabase installs pgcrypto functions in the extensions schema on many projects.
-- The original WooCommerce token RPCs used a locked-down search_path that did
-- not include extensions, so gen_random_bytes()/digest() could fail at runtime.

create extension if not exists pgcrypto;

create or replace function public.create_woocommerce_connect_token(
  business_id_input text,
  store_url_input text,
  store_name_input text default null,
  admin_email_input text default null,
  merchant_id_input text default null,
  return_url_input text default null
)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  caller_id uuid := auth.uid();
  normalized_business_id text := trim(coalesce(business_id_input, ''));
  normalized_store_url text := public.normalize_woocommerce_connect_store_url(store_url_input);
  normalized_merchant_id text := nullif(trim(coalesce(merchant_id_input, '')), '');
  raw_token text;
begin
  if caller_id is null then
    raise exception 'Authentication required';
  end if;

  if normalized_business_id = '' then
    raise exception 'Business is required';
  end if;

  if normalized_store_url = '' then
    raise exception 'Store URL is required';
  end if;

  if not public.can_user_connect_woocommerce_business(caller_id, normalized_business_id) then
    raise exception 'You do not have access to this business';
  end if;

  raw_token := 'fct_' || translate(encode(gen_random_bytes(32), 'base64'), '+/=', '-_');

  insert into public.woocommerce_connect_tokens (
    token_hash,
    business_id,
    store_url,
    store_name,
    admin_email,
    merchant_id,
    user_id,
    return_url,
    expires_at
  )
  values (
    encode(digest(raw_token, 'sha256'), 'hex'),
    normalized_business_id,
    normalized_store_url,
    nullif(trim(coalesce(store_name_input, '')), ''),
    nullif(lower(trim(coalesce(admin_email_input, ''))), ''),
    normalized_merchant_id,
    caller_id,
    nullif(trim(coalesce(return_url_input, '')), ''),
    now() + interval '10 minutes'
  );

  return raw_token;
end;
$$;

create or replace function public.consume_woocommerce_connect_token(
  connect_token_input text,
  store_url_input text,
  merchant_id_input text default null
)
returns table (
  token_id uuid,
  business_id text,
  store_url text,
  store_name text,
  admin_email text,
  merchant_id text,
  user_id uuid
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  normalized_token text := trim(coalesce(connect_token_input, ''));
  normalized_store_url text := public.normalize_woocommerce_connect_store_url(store_url_input);
  normalized_merchant_id text := nullif(trim(coalesce(merchant_id_input, '')), '');
begin
  if normalized_token = '' then
    raise exception 'Connect token is required';
  end if;

  if normalized_store_url = '' then
    raise exception 'Store URL is required';
  end if;

  return query
  update public.woocommerce_connect_tokens t
  set used_at = now()
  where t.token_hash = encode(digest(normalized_token, 'sha256'), 'hex')
    and t.store_url = normalized_store_url
    and t.used_at is null
    and t.expires_at > now()
    and (
      t.merchant_id is null
      or t.merchant_id = normalized_merchant_id
    )
  returning
    t.id,
    t.business_id,
    t.store_url,
    t.store_name,
    t.admin_email,
    t.merchant_id,
    t.user_id;
end;
$$;

grant execute on function public.create_woocommerce_connect_token(text, text, text, text, text, text) to authenticated;
grant execute on function public.consume_woocommerce_connect_token(text, text, text) to service_role;
