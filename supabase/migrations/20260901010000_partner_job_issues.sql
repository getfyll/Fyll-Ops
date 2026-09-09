-- Job issues (defects/complaints) reported by the business against a job it
-- dispatched to a partner. Deliberately separate from the general Cases
-- system (customer-facing) and from comment threads (none here by design) —
-- a single report that puts the job's payment on hold until resolved.
-- Follows the same generic id/business_id/data(jsonb) pattern as partner_jobs.

create table if not exists public.partner_job_issues (
  id text not null,
  business_id text not null,
  data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.partner_job_issues drop constraint if exists partner_job_issues_pkey;
alter table public.partner_job_issues add primary key (id, business_id);

create index if not exists partner_job_issues_business_id_idx on public.partner_job_issues (business_id);
create index if not exists partner_job_issues_job_id_idx on public.partner_job_issues (((data->>'jobId')));
create index if not exists partner_job_issues_partner_id_idx on public.partner_job_issues (((data->>'partnerId')));

alter table public.partner_job_issues enable row level security;

drop policy if exists partner_job_issues_select_own_business on public.partner_job_issues;
drop policy if exists partner_job_issues_insert_own_business on public.partner_job_issues;
drop policy if exists partner_job_issues_update_own_business on public.partner_job_issues;
drop policy if exists partner_job_issues_delete_own_business on public.partner_job_issues;

create policy partner_job_issues_select_own_business
  on public.partner_job_issues for select
  using (public.can_access_business(business_id));

create policy partner_job_issues_insert_own_business
  on public.partner_job_issues for insert
  with check (public.can_access_business(business_id));

create policy partner_job_issues_update_own_business
  on public.partner_job_issues for update
  using (public.can_access_business(business_id))
  with check (public.can_access_business(business_id));

create policy partner_job_issues_delete_own_business
  on public.partner_job_issues for delete
  using (public.can_access_business(business_id));

-- Surface the open-issue flag to the partner portal RPCs so a partner can see
-- why a job's payment is on hold, without needing direct table access
-- (these functions are security definer and already bypass RLS).
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
  partner_email text;
begin
  if coalesce(trim(token_input), '') = '' then
    return null;
  end if;

  select p.id, p.business_id, p.data, p.auth_user_id
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

  if matched_partner.auth_user_id is not null then
    select email into partner_email from auth.users where id = matched_partner.auth_user_id;
  end if;

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
        'jobService', j.data->>'jobService',
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
        'createdAt', j.data->>'createdAt',
        'hasOpenIssue', coalesce((j.data->>'hasOpenIssue')::boolean, false),
        'openIssueDescription', open_issue.description
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
  left join lateral (
    select i.data->>'description' as description
    from public.partner_job_issues i
    where i.business_id = j.business_id
      and i.data->>'jobId' = j.id
      and coalesce(i.data->>'status', 'open') = 'open'
    order by i.created_at desc
    limit 1
  ) open_issue on true
  where j.business_id = matched_partner.business_id
    and j.data->>'partnerId' = matched_partner.id
    and coalesce(j.data->>'status', '') <> 'awaiting_dispatch';

  return jsonb_build_object(
    'partnerId', matched_partner.id,
    'businessId', matched_partner.business_id,
    'partnerName', coalesce(matched_partner.data->>'name', ''),
    'businessName', coalesce(nullif(trim(coalesce(matched_business.data->>'businessName', '')), ''), matched_business.name, ''),
    'email', coalesce(partner_email, matched_partner.data->>'email'),
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

create or replace function public.lookup_partner_portal_by_auth()
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
  partner_email text;
begin
  if auth.uid() is null then
    return null;
  end if;

  select p.id, p.business_id, p.data
  into matched_partner
  from public.partners p
  where p.auth_user_id = auth.uid()
  limit 1;

  if not found then
    return null;
  end if;

  select b.id::text as business_id, b.name, b.data
  into matched_business
  from public.businesses b
  where b.id::text = matched_partner.business_id
  limit 1;

  select email into partner_email from auth.users where id = auth.uid();

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
        'jobService', j.data->>'jobService',
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
        'createdAt', j.data->>'createdAt',
        'hasOpenIssue', coalesce((j.data->>'hasOpenIssue')::boolean, false),
        'openIssueDescription', open_issue.description
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
  left join lateral (
    select i.data->>'description' as description
    from public.partner_job_issues i
    where i.business_id = j.business_id
      and i.data->>'jobId' = j.id
      and coalesce(i.data->>'status', 'open') = 'open'
    order by i.created_at desc
    limit 1
  ) open_issue on true
  where j.business_id = matched_partner.business_id
    and j.data->>'partnerId' = matched_partner.id
    and coalesce(j.data->>'status', '') <> 'awaiting_dispatch';

  return jsonb_build_object(
    'partnerId', matched_partner.id,
    'businessId', matched_partner.business_id,
    'partnerName', coalesce(matched_partner.data->>'name', ''),
    'businessName', coalesce(nullif(trim(coalesce(matched_business.data->>'businessName', '')), ''), matched_business.name, ''),
    'email', coalesce(partner_email, matched_partner.data->>'email'),
    'partnerJobStatuses', coalesce(matched_partner.data->'partnerJobStatuses', '[]'::jsonb),
    'statusColors', coalesce(matched_partner.data->'statusColors', '{}'::jsonb),
    'billingCycle', coalesce(nullif(matched_partner.data->>'billingCycle', ''), 'manual'),
    'isActive', coalesce((matched_partner.data->>'isActive')::boolean, true),
    'jobs', jobs_payload
  );
end;
$$;

grant execute on function public.lookup_partner_portal_by_auth() to authenticated;

-- Exclude jobs with an open issue from being newly added to a bill, so a
-- disputed job's payment stays on hold until the business resolves it.
-- Jobs already attached to a bill are untouched by this change.
create or replace function public.submit_partner_bill(
  token_input text,
  job_ids_input text[] default null
)
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
  if coalesce(trim(token_input), '') <> '' then
    select p.id, p.business_id, p.data
    into matched_partner
    from public.partners p
    where p.data->>'magicLinkToken' = trim(token_input)
    limit 1;
  elsif auth.uid() is not null then
    select p.id, p.business_id, p.data
    into matched_partner
    from public.partners p
    where p.auth_user_id = auth.uid()
    limit 1;
  end if;

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
    and coalesce(j.data->>'status', '') <> 'cancelled'
    and coalesce((j.data->>'hasOpenIssue')::boolean, false) = false
    and (job_ids_input is null or j.id = any(job_ids_input));

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
    and coalesce(j.data->>'status', '') <> 'cancelled'
    and coalesce((j.data->>'hasOpenIssue')::boolean, false) = false
    and (job_ids_input is null or j.id = any(job_ids_input));

  get diagnostics affected_count = row_count;

  return jsonb_build_object('billId', new_bill_id, 'total', bill_total, 'jobCount', affected_count);
end;
$$;

grant execute on function public.submit_partner_bill(text, text[]) to anon;
grant execute on function public.submit_partner_bill(text, text[]) to authenticated;

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
  if coalesce(trim(bill_id_input), '') = '' then
    return null;
  end if;

  if coalesce(trim(token_input), '') <> '' then
    select p.id, p.business_id, p.data
    into matched_partner
    from public.partners p
    where p.data->>'magicLinkToken' = trim(token_input)
    limit 1;
  elsif auth.uid() is not null then
    select p.id, p.business_id, p.data
    into matched_partner
    from public.partners p
    where p.auth_user_id = auth.uid()
    limit 1;
  end if;

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

  update public.partner_jobs j
  set data = (j.data - 'billId' - 'billStatus' - 'billSubmittedAt' - 'billNote' - 'billRespondedAt' - 'billPaidAt'),
      updated_at = now()
  where j.business_id = matched_partner.business_id
    and j.data->>'partnerId' = matched_partner.id
    and j.data->>'billId' = bill_id_input
    and not (j.id = any(job_ids_input));

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
    and coalesce(j.data->>'status', '') <> 'cancelled'
    and coalesce((j.data->>'hasOpenIssue')::boolean, false) = false;

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
