-- Partner portal: lets a partner open their magic-link URL (/partner/{token})
-- with no login, and see + update only their own jobs for one business.
-- Access is granted via SECURITY DEFINER functions that re-validate the
-- token server-side, mirroring the existing public-tracking pattern
-- (lookup_public_order_tracking / update_storefront_payment_status) rather
-- than opening RLS or introducing an anonymous auth session.

create index if not exists partners_magic_link_token_idx
  on public.partners ((data->>'magicLinkToken'));

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
        'paymentStatus', coalesce(j.data->>'paymentStatus', 'unpaid'),
        'paidAt', j.data->>'paidAt',
        'createdAt', j.data->>'createdAt'
      )
      order by coalesce(j.data->>'createdAt', j.created_at::text) desc
    ),
    '[]'::jsonb
  )
  into jobs_payload
  from public.partner_jobs j
  where j.business_id = matched_partner.business_id
    and j.data->>'partnerId' = matched_partner.id;

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

  updated_data := matched_job.data || jsonb_build_object('status', status_input);
  if status_input = 'ready' then
    updated_data := updated_data || jsonb_build_object('readyAt', now_iso);
  elsif status_input = 'in_progress' and coalesce(matched_job.data->>'acceptedAt', '') = '' then
    updated_data := updated_data || jsonb_build_object('acceptedAt', now_iso);
  end if;

  update public.partner_jobs
  set data = updated_data, updated_at = now()
  where id = matched_job.id and business_id = matched_job.business_id;

  return updated_data;
end;
$$;

grant execute on function public.update_partner_portal_job_status(text, text, text) to anon;
grant execute on function public.update_partner_portal_job_status(text, text, text) to authenticated;
