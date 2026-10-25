-- Order flow is directional:
--   Storefront -> Fyll Ops -> optional WooCommerce
--   Fyll Ops -> optional WooCommerce (never Storefront)
-- Only genuine Storefront / Fyll Checkout origins should therefore produce
-- storefront_order_created. A WooCommerce destination does not change origin.
-- All Fyll Ops orders now receive a customerTrackingCode, so that field is not
-- a safe storefront signal.

create or replace function public.notify_storefront_order()
returns trigger
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  notify_secret text;
  order_source text;
  order_platform text;
  is_social_checkout_order boolean;
  is_storefront_order boolean;
begin
  order_source := lower(regexp_replace(trim(coalesce(new.data->>'source', '')), '[_-]+', ' ', 'g'));
  order_platform := lower(regexp_replace(trim(coalesce(new.data->>'platform', '')), '[_-]+', ' ', 'g'));

  is_social_checkout_order := (
    order_source = 'social checkout'
    or coalesce(new.data->>'websiteOrderReference', '') ~* '^SC-'
    or coalesce(new.data->>'socialCheckoutReference', '') <> ''
  );

  is_storefront_order := not is_social_checkout_order and (
    (new.data ? 'fyllCheckout')
    or order_source like '%storefront%'
    or order_source in ('website', 'web store', 'fyll checkout')
    or order_platform like '%storefront%'
  );

  if is_storefront_order then
    select decrypted_secret
      into notify_secret
      from vault.decrypted_secrets
     where name = 'quote_notify_secret'
     limit 1;

    if notify_secret is null or notify_secret = '' then
      return new;
    end if;

    perform net.http_post(
      url        := 'https://pmqmefvzgmlxxbgicdpi.supabase.co/functions/v1/send-thread-notification',
      headers    := jsonb_build_object(
                      'Content-Type',  'application/json',
                      'Authorization', 'Bearer ' || notify_secret
                    ),
      body       := jsonb_build_object(
                      'type', 'storefront_order_created',
                      'businessId', new.business_id,
                      'orderNumber', coalesce(new.data->>'orderNumber', new.id),
                      'customerName', new.data->>'customerName',
                      'totalAmount', coalesce(new.data->>'totalAmount', new.total_amount::text),
                      'trackingCode', new.data->>'customerTrackingCode'
                    ),
      timeout_milliseconds := 10000
    );
  end if;

  return new;
end;
$$;
