-- New-order push notifications (storefront + Fyll Checkout): read the function's bearer secret from
-- Supabase Vault instead of a value written into the trigger. The old hard-coded CRON_SECRET no longer
-- matched the Edge Function, so it answered 401 and no push was sent. Uses the same vault secret
-- (quote_notify_secret) as the payment notifications; send-thread-notification accepts it for
-- storefront_order_created. If the secret is missing the trigger skips the notification.

create or replace function public.notify_storefront_order()
returns trigger
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  notify_secret text;
  is_storefront_order boolean;
begin
  is_storefront_order := (
    (new.data ? 'customerTrackingCode')
    or (new.data ? 'fyllCheckout')
    or lower(coalesce(new.data->>'source', '')) like '%storefront%'
    or lower(coalesce(new.data->>'source', '')) like '%website%'
    or lower(coalesce(new.data->>'source', '')) like '%checkout%'
    or lower(coalesce(new.data->>'platform', '')) like '%storefront%'
  );

  if is_storefront_order then
    select decrypted_secret into notify_secret from vault.decrypted_secrets where name = 'quote_notify_secret' limit 1;
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
