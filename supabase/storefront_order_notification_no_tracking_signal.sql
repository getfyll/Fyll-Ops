-- Stop "New storefront order" WhatsApp/push alerts for orders made inside Fyll Ops.
--
-- notify_storefront_order() treated any new order carrying a customerTrackingCode as a storefront order.
-- Every order created in the Ops app gets a tracking code, so manual and Social Checkout orders were announced
-- as "new storefront order" on top of the new-order / payment alerts. Real storefront orders are still caught
-- by the other signals (fyllCheckout, source/platform mentioning storefront, website or checkout).
--
-- Edits the live function in place so the vault secret lookup and URL stay exactly as deployed.

do $$
declare
  def text;
  patched text;
begin
  select pg_get_functiondef(p.oid)
    into def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'notify_storefront_order';

  if def is null then
    raise exception 'notify_storefront_order() not found';
  end if;

  patched := regexp_replace(def, '\(new\.data \? ''customerTrackingCode''\)\s*or\s*', '');

  if patched = def then
    raise exception 'customerTrackingCode signal not found in notify_storefront_order(); nothing changed';
  end if;

  execute patched;
end;
$$;
