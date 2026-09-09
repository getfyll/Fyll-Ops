-- 1. Patch lookup_partner_portal to also return rejectedAt, so the portal
--    can show a rejected job in its activity timeline.
-- 2. Allow a partner to reject a freshly-sent job ('cancelled') even
--    though 'cancelled' is not normally part of the business-configured
--    partnerJobStatuses whitelist. Everything else keeps the existing
--    whitelist check.

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
        'rejectedAt', j.data->>'rejectedAt',
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

create or replace function public.update_partner_portal_job_status(
  token_input text,
  job_id_input text,
  status_input text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  matched_partner record;
  matched_job record;
  allowed_statuses jsonb;
  is_allowed boolean := false;
  updated_data jsonb;
  now_iso text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if coalesce(trim(token_input), '') = ''
    or coalesce(trim(job_id_input), '') = ''
    or coalesce(trim(status_input), '') = '' then
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

  allowed_statuses := coalesce(matched_partner.data->'partnerJobStatuses', '[]'::jsonb);
  select exists (
    select 1 from jsonb_array_elements_text(allowed_statuses) s
    where s = status_input
  ) into is_allowed;

  if status_input = 'cancelled' then
    is_allowed := true;
  end if;

  if not is_allowed then
    raise exception 'Status not allowed for this partner';
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

  if status_input = 'cancelled' and coalesce(matched_job.data->>'status', '') <> 'sent' then
    raise exception 'This job can no longer be rejected';
  end if;

  updated_data := matched_job.data || jsonb_build_object('status', status_input);
  if status_input = 'ready' then
    updated_data := updated_data || jsonb_build_object('readyAt', now_iso);
  elsif status_input = 'in_progress' and coalesce(matched_job.data->>'acceptedAt', '') = '' then
    updated_data := updated_data || jsonb_build_object('acceptedAt', now_iso);
  elsif status_input = 'cancelled' then
    updated_data := updated_data || jsonb_build_object('rejectedAt', now_iso);
  end if;

  update public.partner_jobs
  set data = updated_data, updated_at = now()
  where id = matched_job.id and business_id = matched_job.business_id;

  return updated_data;
end;
$$;

grant execute on function public.update_partner_portal_job_status(text, text, text) to anon;
grant execute on function public.update_partner_portal_job_status(text, text, text) to authenticated;
