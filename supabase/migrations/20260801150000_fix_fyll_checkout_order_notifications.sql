-- ==================================================================
-- FIX: Fyll Checkout orders never triggered "new order" notifications
-- ==================================================================
-- public.orders rows created by api/integrations/fyll-checkout/orders.ts
-- are tagged data->>'source' = 'Fyll Checkout' and carry a nested
-- data->'fyllCheckout' object, but not 'customerTrackingCode'. The
-- original notify_storefront_order() only matched sources containing
-- "storefront" or "website", so Fyll Checkout orders were silently
-- skipped. This broadens detection to also match "checkout" sources
-- and the presence of the fyllCheckout object.
-- ==================================================================

create or replace function public.notify_storefront_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
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
