-- ==================================================================
-- PAYMENT NOTIFICATIONS — PUSH + IN-APP
-- ==================================================================
-- Sends team-wide notifications when a customer payment lands in Fyll:
-- - public.payments: Storefront + Fyll Checkout payment rows
-- - public.social_checkouts: Social Checkout proof submissions
--
-- Uses the same send-thread-notification Edge Function and CRON_SECRET
-- bearer path as storefront order notifications.
-- ==================================================================

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_shared_payment_received()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
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
    perform net.http_post(
      url        := 'https://pmqmefvzgmlxxbgicdpi.supabase.co/functions/v1/send-thread-notification',
      headers    := jsonb_build_object(
                      'Content-Type',  'application/json',
                      'Authorization', 'Bearer c39eabc8b436342f163f8c4461de14e1f50accab1f45ce1b1848f8ec002f2acf'
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

drop trigger if exists shared_payment_notification_trigger on public.payments;

create trigger shared_payment_notification_trigger
  before insert or update on public.payments
  for each row
  execute function public.notify_shared_payment_received();

create or replace function public.notify_social_checkout_payment_received()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
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
    perform net.http_post(
      url        := 'https://pmqmefvzgmlxxbgicdpi.supabase.co/functions/v1/send-thread-notification',
      headers    := jsonb_build_object(
                      'Content-Type',  'application/json',
                      'Authorization', 'Bearer c39eabc8b436342f163f8c4461de14e1f50accab1f45ce1b1848f8ec002f2acf'
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

drop trigger if exists social_checkout_payment_notification_trigger on public.social_checkouts;

create trigger social_checkout_payment_notification_trigger
  before update on public.social_checkouts
  for each row
  execute function public.notify_social_checkout_payment_received();
