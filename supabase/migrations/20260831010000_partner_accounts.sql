-- Real email+password accounts for partners, alongside the existing
-- magic-link token access (both keep working).
--
-- 1. partners.auth_user_id links a partner row to a Supabase Auth user.
-- 2. partner_invites: business-created invites a partner redeems to set up
--    an account (mirrors the existing team `invites` table, no roles).
-- 3. get_partner_invite / accept_partner_invite: signup-screen RPCs.
-- 4. lookup_partner_portal_by_auth: session-based equivalent of
--    lookup_partner_portal(token_input). Both now also return an `email`.
-- 5. The 4 existing mutation RPCs accept a null/empty token_input and, in
--    that case, resolve the partner via auth.uid() instead.

alter table public.partners
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;

create index if not exists partners_auth_user_id_idx on public.partners (auth_user_id);

create table if not exists public.partner_invites (
  id text primary key,
  partner_id text not null,
  business_id text not null,
  email text not null,
  invite_code text not null unique,
  status text not null default 'pending',
  created_at timestamptz default now(),
  joined_at timestamptz,
  joined_auth_user_id uuid
);

create index if not exists partner_invites_business_id_idx on public.partner_invites (business_id);
create index if not exists partner_invites_partner_id_idx on public.partner_invites (partner_id);

alter table public.partner_invites enable row level security;

drop policy if exists partner_invites_select_own_business on public.partner_invites;
drop policy if exists partner_invites_insert_own_business on public.partner_invites;
drop policy if exists partner_invites_update_own_business on public.partner_invites;
drop policy if exists partner_invites_delete_own_business on public.partner_invites;

create policy partner_invites_select_own_business
  on public.partner_invites for select
  using (public.can_access_business(business_id));

create policy partner_invites_insert_own_business
  on public.partner_invites for insert
  with check (public.can_access_business(business_id));

create policy partner_invites_update_own_business
  on public.partner_invites for update
  using (public.can_access_business(business_id))
  with check (public.can_access_business(business_id));

create policy partner_invites_delete_own_business
  on public.partner_invites for delete
  using (public.can_access_business(business_id));

-- 3a. get_partner_invite: public-safe lookup for the signup screen.
create or replace function public.get_partner_invite(invite_code_input text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  matched_invite record;
  matched_partner record;
  matched_business record;
begin
  if coalesce(trim(invite_code_input), '') = '' then
    return null;
  end if;

  select *
  into matched_invite
  from public.partner_invites
  where invite_code = trim(invite_code_input)
  limit 1;

  if not found or matched_invite.status <> 'pending' then
    return null;
  end if;

  select p.id, p.business_id, p.data
  into matched_partner
  from public.partners p
  where p.id = matched_invite.partner_id
    and p.business_id = matched_invite.business_id
  limit 1;

  if not found then
    return null;
  end if;

  select b.id::text as business_id, b.name, b.data
  into matched_business
  from public.businesses b
  where b.id::text = matched_invite.business_id
  limit 1;

  return jsonb_build_object(
    'inviteCode', matched_invite.invite_code,
    'partnerId', matched_invite.partner_id,
    'businessId', matched_invite.business_id,
    'email', matched_invite.email,
    'partnerName', coalesce(matched_partner.data->>'name', ''),
    'businessName', coalesce(nullif(trim(coalesce(matched_business.data->>'businessName', '')), ''), matched_business.name, '')
  );
end;
$$;

grant execute on function public.get_partner_invite(text) to anon;
grant execute on function public.get_partner_invite(text) to authenticated;

-- 3b. accept_partner_invite: called right after supabase.auth.signUp, links
-- the freshly-created auth user to the partner row.
create or replace function public.accept_partner_invite(invite_code_input text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  matched_invite record;
  current_email text;
  now_iso text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if coalesce(trim(invite_code_input), '') = '' then
    return null;
  end if;

  select *
  into matched_invite
  from public.partner_invites
  where invite_code = trim(invite_code_input)
  limit 1;

  if not found or matched_invite.status <> 'pending' then
    raise exception 'Invalid or expired invite code';
  end if;

  select email into current_email from auth.users where id = auth.uid();

  if current_email is null or lower(current_email) <> lower(matched_invite.email) then
    raise exception 'Invite email does not match the signed-in account';
  end if;

  update public.partners
  set auth_user_id = auth.uid()
  where id = matched_invite.partner_id
    and business_id = matched_invite.business_id;

  update public.partner_invites
  set status = 'joined',
      joined_at = now(),
      joined_auth_user_id = auth.uid()
  where id = matched_invite.id;

  return jsonb_build_object('partnerId', matched_invite.partner_id, 'businessId', matched_invite.business_id);
end;
$$;

grant execute on function public.accept_partner_invite(text) to authenticated;

-- 4. lookup_partner_portal_by_auth: session equivalent of lookup_partner_portal.
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

-- Also add `email` to the token-based lookup for consistency.
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

-- 5. Widen the 4 mutation RPCs to also accept an authenticated session
-- (token_input null/empty) instead of requiring a token.

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
  if coalesce(trim(job_id_input), '') = '' or coalesce(trim(status_input), '') = '' then
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
  if coalesce(trim(job_id_input), '') = '' then
    return null;
  end if;

  if amount_input is null or amount_input < 0 then
    raise exception 'Fee must be a non-negative amount';
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

  if coalesce(matched_job.data->>'billStatus', '') in ('approved', 'paid') then
    raise exception 'This bill has already been approved or paid and its fee is locked';
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
