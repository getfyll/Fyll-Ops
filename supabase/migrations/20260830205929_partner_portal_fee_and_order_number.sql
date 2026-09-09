-- 1. Patch lookup_partner_portal to also return the friendly order number
--    (previously only the raw orderId was available client-side), so the
--    partner portal table can match the business Partner Jobs table.
-- 2. Add update_partner_portal_job_fee: lets a partner set/edit the fee on
--    their own unbilled jobs. Locked once a job has been bundled into a
--    submitted bill (billId set), same immutability rule as a real invoice.

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
    'isActive', coalesce((matched_partner.data->>'isActive')::boolean, true),
    'jobs', jobs_payload
  );
end;
$$;

grant execute on function public.lookup_partner_portal(text) to anon;
grant execute on function public.lookup_partner_portal(text) to authenticated;

create or replace function public.update_partner_portal_job_fee(
  token_input text,
  job_id_input text,
  amount_input numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  matched_partner record;
  matched_job record;
  updated_data jsonb;
begin
  if coalesce(trim(token_input), '') = '' or coalesce(trim(job_id_input), '') = '' then
    return null;
  end if;

  if amount_input is null or amount_input < 0 then
    raise exception 'Fee must be a non-negative amount';
  end if;

  select p.id, p.business_id, p.data
  into matched_partner
  from public.partners p
  where p.data->>'magicLinkToken' = trim(token_input)
  limit 1;

  if not found then
    return null;
  end if;

  select j.id, j.business_id, j.data
  into matched_job
  from public.partner_jobs j
  where j.id = job_id_input
    and j.business_id = matched_partner.business_id
    and j.data->>'partnerId' = matched_partner.id
  limit 1;

  if not found then
    return null;
  end if;

  if coalesce(matched_job.data->>'billId', '') <> '' then
    raise exception 'This job has already been billed and its fee is locked';
  end if;

  updated_data := matched_job.data || jsonb_build_object('amount', amount_input);

  update public.partner_jobs
  set data = updated_data, updated_at = now()
  where id = matched_job.id and business_id = matched_job.business_id;

  return updated_data;
end;
$$;

grant execute on function public.update_partner_portal_job_fee(text, text, numeric) to anon;
grant execute on function public.update_partner_portal_job_fee(text, text, numeric) to authenticated;
