-- Payment push notifications: read the function's bearer secret from Supabase Vault instead of a
-- value written into the trigger. The old hard-coded secret no longer matched the Edge Function, so
-- the function answered 401 "Invalid auth token" and no push was sent. The vault secret
-- (quote_notify_secret) equals the QUOTE_NOTIFY_SECRET Edge Function secret, which may send quote and
-- payment notifications only. If it is missing the trigger skips the notification, and the row is
-- not marked as notified, so nothing is lost silently.

create or replace function public.notify_shared_payment_received()
returns trigger
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  notify_secret text;
  payment_source text;
  previous_status text;
  next_status text;
  should_notify boolean;
begin
  payment_source := lower(trim(coalesce(new.data->>'source', '')));
  previous_status := case
    when tg_op = 'UPDATE' then lower(trim(coalesce(old.data->>'status', '')))
    else ''
  end;
  next_status := lower(trim(coalesce(new.data->>'status', '')));

  should_notify := (
    payment_source in ('storefront', 'fyll_checkout')
    and next_status in ('proof_submitted', 'submitted', 'confirmed', 'verified', 'paid', 'underpaid')
    and (
      tg_op = 'INSERT'
      or (
        tg_op = 'UPDATE'
        and previous_status is distinct from next_status
      )
    )
    and coalesce((new.data->>'paymentNotificationSentAt'), '') = ''
  );

  if should_notify then
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
                      'type', 'payment_received',
                      'businessId', new.business_id,
                      'paymentId', new.id,
                      'paymentReference', coalesce(new.data->>'sourceOrderId', new.id),
                      'source', payment_source,
                      'customerName', new.data->>'customerName',
                      'amount', coalesce(new.data->>'amount', '0'),
                      'status', next_status,
                      'paymentMethod', new.data->>'paymentMethod'
                    ),
      timeout_milliseconds := 10000
    );

    new.data := new.data || jsonb_build_object('paymentNotificationSentAt', now());
  end if;

  return new;
end;
$$;

create or replace function public.notify_social_checkout_payment_received()
returns trigger
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  notify_secret text;
  previous_status text;
  next_status text;
begin
  previous_status := lower(trim(coalesce(old.data->>'status', '')));
  next_status := lower(trim(coalesce(new.data->>'status', '')));

  if tg_op = 'UPDATE'
    and previous_status is distinct from next_status
    and next_status = 'payment_submitted'
    and coalesce((new.data->>'paymentNotificationSentAt'), '') = ''
  then
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
                      'type', 'payment_received',
                      'businessId', new.business_id,
                      'paymentId', new.id,
                      'paymentReference', 'SC-' || new.id,
                      'source', 'social_checkout',
                      'customerName', new.data->>'customerName',
                      'amount', coalesce(new.data->>'amount', '0'),
                      'status', next_status,
                      'paymentMethod', 'bank_transfer',
                      'checkoutCode', new.id
                    ),
      timeout_milliseconds := 10000
    );

    new.data := new.data || jsonb_build_object('paymentNotificationSentAt', now());
  end if;

  return new;
end;
$$;

