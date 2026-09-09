-- Real bill submission: a partner bundles their unbilled priced jobs and
-- sends them to the business as one bill (status starts 'pending'). The
-- business then approves/rejects/queries/marks paid from the app (already
-- authenticated, so those writes go through the normal partner_jobs RLS
-- policies and don't need a new RPC). This migration:
--   1. Patches lookup_partner_portal to return the new per-job bill fields
--      instead of the old paymentStatus/paidAt fields.
--   2. Adds submit_partner_bill, an anon-callable, token-validated RPC that
--      bundles the partner's unbilled priced jobs into a new bill.

create or replace function public.lookup_partner_portal(token_input text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  matched_partner record;
  matched_business record;
  jobs_payload jsonb := '[]'::jsonb;
begin
  if coalesce(trim(token_input), '') = '' then
    return null;
  end if;

  select p.id, p.business_id, p.data
  into matched_partner
  from public.partners p
  where p.data->>'magicLinkToken' = trim(token_input)
  limit 1;

  if not found then
    return null;
  end if;

  select b.id::text as business_id, b.name, b.data
  into matched_business
  from public.businesses b
  where b.id::text = matched_partner.business_id
  limit 1;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', j.id,
        'partnerId', j.data->>'partnerId',
        'orderId', j.data->>'orderId',
        'customerName', j.data->>'customerName',
        'imageUrl', j.data->>'imageUrl',
        'itemLabel', j.data->>'itemLabel',
        'jobType', j.data->>'jobType',
        'documentUrl', j.data->>'documentUrl',
        'documentName', j.data->>'documentName',
        'documentMimeType', j.data->>'documentMimeType',
        'status', j.data->>'status',
        'amount', nullif(j.data->>'amount', '')::numeric,
        'notes', j.data->>'notes',
        'dispatchedAt', j.data->>'dispatchedAt',
        'acceptedAt', j.data->>'acceptedAt',
        'readyAt', j.data->>'readyAt',
        'collectedAt', j.data->>'collectedAt',
        'billedAt', j.data->>'billedAt',
        'billId', j.data->>'billId',
        'billStatus', j.data->>'billStatus',
        'billSubmittedAt', j.data->>'billSubmittedAt',
        'billRespondedAt', j.data->>'billRespondedAt',
        'billNote', j.data->>'billNote',
        'billPaidAt', j.data->>'billPaidAt',
        'createdAt', j.data->>'createdAt'
      )
      order by coalesce(j.data->>'createdAt', j.created_at::text) desc
    ),
    '[]'::jsonb
  )
  into jobs_payload
  from public.partner_jobs j
  where j.business_id = matched_partner.business_id
    and j.data->>'partnerId' = matched_partner.id
    and coalesce(j.data->>'status', '') <> 'awaiting_dispatch';

  return jsonb_build_object(
    'partnerId', matched_partner.id,
    'businessId', matched_partner.business_id,
    'partnerName', coalesce(matched_partner.data->>'name', ''),
    'businessName', coalesce(nullif(trim(coalesce(matched_business.data->>'businessName', '')), ''), matched_business.name, ''),
    'partnerJobStatuses', coalesce(matched_partner.data->'partnerJobStatuses', '[]'::jsonb),
    'statusColors', coalesce(matched_partner.data->'statusColors', '{}'::jsonb),
    'isActive', coalesce((matched_partner.data->>'isActive')::boolean, true),
    'jobs', jobs_payload
  );
end;
$$;

grant execute on function public.lookup_partner_portal(text) to anon;
grant execute on function public.lookup_partner_portal(text) to authenticated;

create or replace function public.submit_partner_bill(token_input text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  matched_partner record;
  new_bill_id text;
  now_iso text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  affected_count integer;
  bill_total numeric;
begin
  if coalesce(trim(token_input), '') = '' then
    return null;
  end if;

  select p.id, p.business_id, p.data
  into matched_partner
  from public.partners p
  where p.data->>'magicLinkToken' = trim(token_input)
  limit 1;

  if not found then
    return null;
  end if;

  select coalesce(sum(nullif(j.data->>'amount', '')::numeric), 0)
  into bill_total
  from public.partner_jobs j
  where j.business_id = matched_partner.business_id
    and j.data->>'partnerId' = matched_partner.id
    and coalesce(j.data->>'billId', '') = ''
    and coalesce(nullif(j.data->>'amount', '')::numeric, 0) > 0
    and coalesce(j.data->>'status', '') <> 'cancelled';

  if bill_total is null or bill_total <= 0 then
    return jsonb_build_object('billId', null, 'total', 0, 'jobCount', 0);
  end if;

  new_bill_id := 'pbill-' || replace(gen_random_uuid()::text, '-', '');

  update public.partner_jobs j
  set
    data = j.data || jsonb_build_object(
      'billId', new_bill_id,
      'billStatus', 'pending',
      'billSubmittedAt', now_iso
    ),
    updated_at = now()
  where j.business_id = matched_partner.business_id
    and j.data->>'partnerId' = matched_partner.id
    and coalesce(j.data->>'billId', '') = ''
    and coalesce(nullif(j.data->>'amount', '')::numeric, 0) > 0
    and coalesce(j.data->>'status', '') <> 'cancelled';

  get diagnostics affected_count = row_count;

  return jsonb_build_object('billId', new_bill_id, 'total', bill_total, 'jobCount', affected_count);
end;
$$;

grant execute on function public.submit_partner_bill(text) to anon;
grant execute on function public.submit_partner_bill(text) to authenticated;
