-- 1. Patch lookup_partner_portal to also return the partner's billingCycle
--    setting, so the portal can auto-group unbilled jobs into weekly /
--    biweekly / monthly periods instead of always showing one flat list.
-- 2. Add update_partner_bill_jobs: lets a partner add/remove jobs from a
--    bill they've already submitted, as long as the business hasn't
--    reviewed it yet (billStatus = 'pending').

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
        'orderNumber', o.data->>'orderNumber',
        'customerName', j.data->>'customerName',
        'imageUrl', j.data->>'imageUrl',
        'itemLabel', j.data->>'itemLabel',
        'jobType', j.data->>'jobType',
        'notes', j.data->>'notes',
        'documentUrl', j.data->>'documentUrl',
        'documentName', j.data->>'documentName',
        'documentMimeType', j.data->>'documentMimeType',
        'status', j.data->>'status',
        'amount', nullif(j.data->>'amount', '')::numeric,
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
  left join public.orders o
    on o.id = j.data->>'orderId'
    and o.business_id = j.business_id
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
    'billingCycle', coalesce(nullif(matched_partner.data->>'billingCycle', ''), 'manual'),
    'isActive', coalesce((matched_partner.data->>'isActive')::boolean, true),
    'jobs', jobs_payload
  );
end;
$$;

grant execute on function public.lookup_partner_portal(text) to anon;
grant execute on function public.lookup_partner_portal(text) to authenticated;

create or replace function public.update_partner_bill_jobs(
  token_input text,
  bill_id_input text,
  job_ids_input text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  matched_partner record;
  bill_status text;
  now_iso text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  bill_total numeric;
  job_count integer;
begin
  if coalesce(trim(token_input), '') = '' or coalesce(trim(bill_id_input), '') = '' then
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

  select j.data->>'billStatus'
  into bill_status
  from public.partner_jobs j
  where j.business_id = matched_partner.business_id
    and j.data->>'partnerId' = matched_partner.id
    and j.data->>'billId' = bill_id_input
  limit 1;

  if bill_status is null then
    return null;
  end if;

  if bill_status <> 'pending' then
    raise exception 'This bill has already been reviewed and can no longer be edited';
  end if;

  -- Drop jobs that were in this bill but aren't in the new selection.
  update public.partner_jobs j
  set data = (j.data - 'billId' - 'billStatus' - 'billSubmittedAt' - 'billNote' - 'billRespondedAt' - 'billPaidAt'),
      updated_at = now()
  where j.business_id = matched_partner.business_id
    and j.data->>'partnerId' = matched_partner.id
    and j.data->>'billId' = bill_id_input
    and not (j.id = any(job_ids_input));

  -- Add newly selected, still-unbilled, priced jobs into this bill.
  update public.partner_jobs j
  set data = j.data || jsonb_build_object(
        'billId', bill_id_input,
        'billStatus', 'pending',
        'billSubmittedAt', coalesce(j.data->>'billSubmittedAt', now_iso)
      ),
      updated_at = now()
  where j.business_id = matched_partner.business_id
    and j.data->>'partnerId' = matched_partner.id
    and j.id = any(job_ids_input)
    and coalesce(j.data->>'billId', '') in ('', bill_id_input)
    and coalesce(nullif(j.data->>'amount', '')::numeric, 0) > 0
    and coalesce(j.data->>'status', '') <> 'cancelled';

  select coalesce(sum(nullif(j.data->>'amount', '')::numeric), 0), count(*)
  into bill_total, job_count
  from public.partner_jobs j
  where j.business_id = matched_partner.business_id
    and j.data->>'partnerId' = matched_partner.id
    and j.data->>'billId' = bill_id_input;

  if job_count = 0 then
    return jsonb_build_object('billId', null, 'total', 0, 'jobCount', 0);
  end if;

  return jsonb_build_object('billId', bill_id_input, 'total', bill_total, 'jobCount', job_count);
end;
$$;

grant execute on function public.update_partner_bill_jobs(text, text, text[]) to anon;
grant execute on function public.update_partner_bill_jobs(text, text, text[]) to authenticated;
