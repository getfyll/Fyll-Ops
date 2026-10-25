-- ==================================================================
-- STOREFRONT ORDER NOTIFICATIONS — PUSH + IN-APP
-- ==================================================================
-- Fires whenever a new row lands in public.orders that explicitly came
-- from the public storefront (fyll.store), and notifies every
-- team member on that business via OneSignal push + an in-app
-- notification (bell icon), by calling the send-thread-notification
-- edge function with type "storefront_order_created".
--
-- The storefront's checkout backend lives in a separate codebase, so
-- this trigger can't assume a single exact field name — it matches on
-- any of the signals a storefront order is likely to carry:
--   - data->'fyllCheckout' is present
--   - data->>'source' / data->>'platform' identifies Storefront or Website
-- Social Checkout is deliberately excluded because it has its own payment
-- notification flow.
--
-- Applied to the linked project (pmqmefvzgmlxxbgicdpi) via
-- `supabase db push`, reusing the same CRON_SECRET already deployed for
-- the task-due-reminders cron job (see setup_task_cron.sql).
-- ==================================================================

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_storefront_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
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
    perform net.http_post(
      url        := 'https://pmqmefvzgmlxxbgicdpi.supabase.co/functions/v1/send-thread-notification',
      headers    := jsonb_build_object(
                      'Content-Type',  'application/json',
                      'Authorization', 'Bearer c39eabc8b436342f163f8c4461de14e1f50accab1f45ce1b1848f8ec002f2acf'
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

drop trigger if exists storefront_order_notification_trigger on public.orders;

create trigger storefront_order_notification_trigger
  after insert on public.orders
  for each row
  execute function public.notify_storefront_order();
