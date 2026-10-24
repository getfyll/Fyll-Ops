-- One-time clean-up for storefront payments left "pending" in Fyll Ops even though the order has
-- already moved past payment (paid / preparing / shipped / delivered) in the storefront dashboard.
-- Approving there used to change the order only, never the payment record Ops reads.
--
-- Only payment records are changed. Old order statuses are deliberately left alone: rewriting them
-- would fire the order-status email to customers again.
-- The payment-notification trigger would otherwise push "New storefront payment" to your team for each
-- row, so paymentNotificationSentAt is set in the same update to keep this quiet.
--
-- To preview first, run the SELECT at the bottom.

update public.payments p
set data = p.data || jsonb_build_object(
  'status', 'verified',
  'updatedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'paymentNotificationSentAt', coalesce(nullif(p.data->>'paymentNotificationSentAt', ''), to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
  'activityLog', coalesce(p.data->'activityLog', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
    'id', 'payment-approved-sync-' || p.id,
    'action', 'Approved storefront payment (synced from the storefront dashboard)',
    'actor', 'Fyll sync',
    'createdAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  ))
)
from public.orders o
where p.data->>'source' = 'storefront'
  and lower(coalesce(p.data->>'status', '')) = 'pending'
  and p.business_id = o.business_id
  and (p.data->>'sourceOrderId' = o.id or p.data->>'sourceOrderId' = o.data->>'orderNumber')
  and lower(coalesce(o.data->>'status', '')) in ('paid', 'preparing', 'processing', 'shipped', 'delivered');

-- Preview (run this on its own BEFORE the update above to see which payments would change):
-- select p.id, p.business_id, p.data->>'customerName' as customer, p.data->>'amount' as amount, o.data->>'status' as order_status
-- from public.payments p
-- join public.orders o on o.business_id = p.business_id
--   and (p.data->>'sourceOrderId' = o.id or p.data->>'sourceOrderId' = o.data->>'orderNumber')
-- where p.data->>'source' = 'storefront'
--   and lower(coalesce(p.data->>'status', '')) = 'pending'
--   and lower(coalesce(o.data->>'status', '')) in ('paid', 'preparing', 'processing', 'shipped', 'delivered');
