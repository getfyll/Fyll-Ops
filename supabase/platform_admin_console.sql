-- Platform admin console for invite-only business onboarding.
-- Run this in the Supabase SQL editor.
--
-- What it does:
-- 1) Creates a platform_admins allowlist table.
-- 2) Adds protected RPCs for platform admins to list businesses.
-- 3) Adds protected RPCs to manage founder invites across the platform.
-- 4) Adds a protected RPC to update per-business invite limits.
-- 5) Adds protected RPCs to view/update per-business feature access.
--
-- Important:
-- - Normal business users still remain isolated by RLS.
-- - Only emails inserted into public.platform_admins can use these RPCs.

create extension if not exists pgcrypto with schema extensions;

alter table if exists public.founder_referral_invites
  alter column business_id drop not null;

create table if not exists public.platform_admins (
  email text primary key,
  notes text,
  created_at timestamptz not null default now(),
  created_by_user_id uuid
);

alter table public.platform_admins enable row level security;

drop policy if exists platform_admins_self_select on public.platform_admins;
create policy platform_admins_self_select
  on public.platform_admins
  for select
  using (
    lower(email) = lower(
      coalesce(
        (select p.email from public.profiles p where p.id = auth.uid() limit 1),
        ''
      )
    )
  );

create or replace function public.is_platform_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  caller_email text;
begin
  if auth.uid() is null then
    return false;
  end if;

  select lower(trim(coalesce(p.email, '')))
  into caller_email
  from public.profiles p
  where p.id = auth.uid()
  limit 1;

  if coalesce(caller_email, '') = '' then
    return false;
  end if;

  return exists (
    select 1
    from public.platform_admins pa
    where lower(trim(pa.email)) = caller_email
  );
end;
$$;

create or replace function public.platform_admin_me()
returns table (
  email text,
  is_admin boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  caller_email text;
begin
  if auth.uid() is null then
    return query select ''::text, false;
    return;
  end if;

  select lower(trim(coalesce(p.email, '')))
  into caller_email
  from public.profiles p
  where p.id = auth.uid()
  limit 1;

  return query
  select
    coalesce(caller_email, '')::text,
    public.is_platform_admin();
end;
$$;

drop function if exists public.platform_admin_list_businesses(text);
create or replace function public.platform_admin_list_businesses(
  search_input text default null
)
returns table (
  business_id text,
  company_name text,
  business_name text,
  business_slug text,
  business_logo text,
  business_phone text,
  business_website text,
  owner_id text,
  owner_email text,
  created_at timestamptz,
  onboarding_step integer,
  onboarding_completed_at timestamptz,
  invite_limit_total integer,
  invite_used_count integer,
  pending_invite_count integer,
  joined_invite_count integer,
  feature_access jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_search text := lower(trim(coalesce(search_input, '')));
begin
  if not public.is_platform_admin() then
    raise exception 'Platform admin access required';
  end if;

  return query
  with invite_stats as (
    select
      coalesce(nullif(trim(coalesce(fri.joined_business_id::text, '')), ''), nullif(trim(coalesce(fri.business_id::text, '')), '')) as effective_business_id,
      count(*) filter (
        where fri.status = 'joined'
          or (fri.status = 'pending' and fri.expires_at > now())
      )::integer as invite_used_count,
      count(*) filter (where fri.status = 'pending' and fri.expires_at > now())::integer as pending_invite_count,
      count(*) filter (where fri.status = 'joined')::integer as joined_invite_count
    from public.founder_referral_invites fri
    group by coalesce(nullif(trim(coalesce(fri.joined_business_id::text, '')), ''), nullif(trim(coalesce(fri.business_id::text, '')), ''))
  ),
  business_rows as (
    select
      b.id::text as business_id,
      coalesce(b.name, '') as company_name,
      coalesce(nullif(trim(coalesce(b.data->>'businessName', '')), ''), b.name, '') as business_name,
      coalesce(
        nullif(
          regexp_replace(
            regexp_replace(lower(trim(coalesce(b.data->>'businessSlug', ''))), '[^a-z0-9]+', '-', 'g'),
            '(^-|-$)',
            '',
            'g'
          ),
          ''
        ),
        regexp_replace(
          regexp_replace(lower(trim(coalesce(coalesce(nullif(trim(coalesce(b.data->>'businessName', '')), ''), b.name), ''))), '[^a-z0-9]+', '-', 'g'),
          '(^-|-$)',
          '',
          'g'
        )
      ) as business_slug,
      b.data->>'businessLogo' as business_logo,
      b.data->>'businessPhone' as business_phone,
      b.data->>'businessWebsite' as business_website,
      b.owner_id::text as owner_id,
      owner_profile.email as owner_email,
      b.created_at,
      coalesce(b.onboarding_step, 0) as onboarding_step,
      b.onboarding_completed_at,
      coalesce(b.invite_limit_total, 5) as invite_limit_total,
      coalesce(i.invite_used_count, 0) as invite_used_count,
      coalesce(i.pending_invite_count, 0) as pending_invite_count,
      coalesce(i.joined_invite_count, 0) as joined_invite_count,
      coalesce(b.data->'featureAccess', '{}'::jsonb) as feature_access
    from public.businesses b
    left join public.profiles owner_profile
      on owner_profile.id::text = b.owner_id::text
    left join invite_stats i
      on i.effective_business_id = b.id::text
  ),
  invite_business_rows as (
    select distinct on (coalesce(nullif(trim(coalesce(fri.joined_business_id::text, '')), ''), fri.business_id::text))
      coalesce(nullif(trim(coalesce(fri.joined_business_id::text, '')), ''), fri.business_id::text)::text as business_id,
      split_part(lower(fri.recipient_email), '@', 1)::text as company_name,
      split_part(lower(fri.recipient_email), '@', 1)::text as business_name,
      regexp_replace(split_part(lower(fri.recipient_email), '@', 1), '[^a-z0-9]+', '-', 'g')::text as business_slug,
      null::text as business_logo,
      null::text as business_phone,
      null::text as business_website,
      fri.joined_user_id::text as owner_id,
      fri.recipient_email::text as owner_email,
      coalesce(fri.joined_at, fri.created_at) as created_at,
      0::integer as onboarding_step,
      fri.joined_at as onboarding_completed_at,
      5::integer as invite_limit_total,
      coalesce(i.invite_used_count, 0) as invite_used_count,
      coalesce(i.pending_invite_count, 0) as pending_invite_count,
      coalesce(i.joined_invite_count, 0) as joined_invite_count,
      '{}'::jsonb as feature_access
    from public.founder_referral_invites fri
    left join invite_stats i
      on i.effective_business_id = coalesce(nullif(trim(coalesce(fri.joined_business_id::text, '')), ''), fri.business_id::text)
    where fri.status = 'joined'
      and coalesce(nullif(trim(coalesce(fri.joined_business_id::text, '')), ''), nullif(trim(coalesce(fri.business_id::text, '')), '')) <> ''
      and not exists (
        select 1
        from public.businesses b
        where b.id::text = coalesce(nullif(trim(coalesce(fri.joined_business_id::text, '')), ''), fri.business_id::text)
      )
    order by coalesce(nullif(trim(coalesce(fri.joined_business_id::text, '')), ''), fri.business_id::text), coalesce(fri.joined_at, fri.created_at) desc
  ),
  combined_rows as (
    select * from business_rows
    union all
    select * from invite_business_rows
  )
  select
    row.business_id,
    row.company_name,
    row.business_name,
    row.business_slug,
    row.business_logo,
    row.business_phone,
    row.business_website,
    row.owner_id,
    row.owner_email,
    row.created_at,
    row.onboarding_step,
    row.onboarding_completed_at,
    row.invite_limit_total,
    row.invite_used_count,
    row.pending_invite_count,
    row.joined_invite_count,
    row.feature_access
  from combined_rows row
  where normalized_search = ''
    or lower(coalesce(row.company_name, '')) like '%' || normalized_search || '%'
    or lower(coalesce(row.business_name, '')) like '%' || normalized_search || '%'
    or lower(coalesce(row.business_id, '')) like '%' || normalized_search || '%'
    or lower(coalesce(row.business_slug, '')) like '%' || normalized_search || '%'
    or lower(coalesce(row.business_phone, '')) like '%' || normalized_search || '%'
    or lower(coalesce(row.business_website, '')) like '%' || normalized_search || '%'
    or lower(coalesce(row.owner_id, '')) like '%' || normalized_search || '%'
    or lower(coalesce(row.owner_email, '')) like '%' || normalized_search || '%'
  order by coalesce(row.created_at, 'epoch'::timestamptz) desc, row.business_id asc;
end;
$$;

drop function if exists public.platform_admin_list_business_invites(text);
create or replace function public.platform_admin_list_business_invites(
  business_id_input text
)
returns table (
  id uuid,
  business_id text,
  recipient_email text,
  access_code text,
  inviter_name text,
  status text,
  created_at timestamptz,
  expires_at timestamptz,
  cancelled_at timestamptz,
  joined_at timestamptz,
  joined_business_id text,
  joined_user_id uuid,
  email_sent_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_business_id text := trim(coalesce(business_id_input, ''));
begin
  if not public.is_platform_admin() then
    raise exception 'Platform admin access required';
  end if;

  return query
  select
    fri.id,
    fri.business_id,
    fri.recipient_email,
    fri.access_code,
    coalesce(fri.inviter_name, 'Admin') as inviter_name,
    fri.status,
    fri.created_at,
    fri.expires_at,
    fri.cancelled_at,
    fri.joined_at,
    fri.joined_business_id,
    fri.joined_user_id,
    fri.email_sent_at
  from public.founder_referral_invites fri
  where normalized_business_id = ''
    or fri.business_id::text = normalized_business_id
    or fri.joined_business_id::text = normalized_business_id
  order by fri.created_at desc, fri.id desc;
end;
$$;

drop function if exists public.platform_admin_create_founder_invite(text, text, integer);
create or replace function public.platform_admin_create_founder_invite(
  business_id_input text,
  recipient_email_input text,
  expiry_days_input integer default 14
)
returns table (
  id uuid,
  business_id text,
  recipient_email text,
  access_code text,
  inviter_name text,
  status text,
  created_at timestamptz,
  expires_at timestamptz,
  cancelled_at timestamptz,
  joined_at timestamptz,
  joined_business_id text,
  joined_user_id uuid,
  email_sent_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  normalized_business_id text := trim(coalesce(business_id_input, ''));
  normalized_email text := lower(trim(coalesce(recipient_email_input, '')));
  normalized_expiry_days integer := greatest(coalesce(expiry_days_input, 14), 1);
  caller_profile record;
  invite_limit integer;
  invite_usage_count integer;
  pending_existing public.founder_referral_invites%rowtype;
  candidate_code text;
  candidate_hash text;
  new_access_code public.access_codes%rowtype;
  new_referral public.founder_referral_invites%rowtype;
  expires_ts timestamptz;
  attempt integer;
begin
  if not public.is_platform_admin() then
    raise exception 'Platform admin access required';
  end if;

  if normalized_email = '' or position('@' in normalized_email) = 0 then
    raise exception 'Valid email is required';
  end if;

  if normalized_expiry_days > 365 then
    raise exception 'Expiry days is too high';
  end if;

  select p.id, p.name
  into caller_profile
  from public.profiles p
  where p.id = auth.uid()
  limit 1;

  if not found then
    raise exception 'Profile not found';
  end if;

  if normalized_business_id <> '' and not exists (
    select 1
    from public.businesses b
    where b.id::text = normalized_business_id
  ) then
    raise exception 'Business not found';
  end if;

  select *
  into pending_existing
  from public.founder_referral_invites fri
  where (
      (normalized_business_id = '' and nullif(trim(coalesce(fri.business_id::text, '')), '') is null)
      or fri.business_id::text = normalized_business_id
    )
    and lower(fri.recipient_email) = normalized_email
    and fri.status = 'pending'
    and fri.expires_at > now()
  order by fri.created_at desc
  limit 1;

  if found then
    return query
    select
      pending_existing.id,
      pending_existing.business_id,
      pending_existing.recipient_email,
      pending_existing.access_code,
      coalesce(pending_existing.inviter_name, 'Admin'),
      pending_existing.status,
      pending_existing.created_at,
      pending_existing.expires_at,
      pending_existing.cancelled_at,
      pending_existing.joined_at,
      pending_existing.joined_business_id,
      pending_existing.joined_user_id,
      pending_existing.email_sent_at;
    return;
  end if;

  if normalized_business_id <> '' then
    select coalesce(b.invite_limit_total, 5)
    into invite_limit
    from public.businesses b
    where b.id::text = normalized_business_id
    limit 1;

    select count(*)
    into invite_usage_count
    from public.founder_referral_invites fri
    where fri.business_id::text = normalized_business_id
      and (
        fri.status = 'joined'
        or (fri.status = 'pending' and fri.expires_at > now())
      );

    if invite_usage_count >= coalesce(invite_limit, 5) then
      raise exception 'Invite limit reached (% total)', coalesce(invite_limit, 5);
    end if;
  end if;

  expires_ts := now() + make_interval(days => normalized_expiry_days);

  for attempt in 1..8 loop
    candidate_code := public.generate_fyll_invite_code();
    candidate_hash := encode(extensions.digest(candidate_code, 'sha256'), 'hex');

    begin
      insert into public.access_codes (
        code_hash,
        label,
        is_active,
        max_uses,
        expires_at
      )
      values (
        candidate_hash,
        'Platform admin founder invite',
        true,
        1,
        expires_ts
      )
      returning *
      into new_access_code;

      insert into public.founder_referral_invites (
        business_id,
        inviter_user_id,
        inviter_name,
        recipient_email,
        access_code,
        access_code_hash,
        access_code_id,
        status,
        expires_at
      )
      values (
        nullif(normalized_business_id, ''),
        auth.uid(),
        coalesce(nullif(trim(coalesce(caller_profile.name, '')), ''), 'Platform Admin'),
        normalized_email,
        candidate_code,
        candidate_hash,
        new_access_code.id,
        'pending',
        expires_ts
      )
      returning *
      into new_referral;

      return query
      select
        new_referral.id,
        new_referral.business_id,
        new_referral.recipient_email,
        new_referral.access_code,
        coalesce(new_referral.inviter_name, 'Platform Admin'),
        new_referral.status,
        new_referral.created_at,
        new_referral.expires_at,
        new_referral.cancelled_at,
        new_referral.joined_at,
        new_referral.joined_business_id,
        new_referral.joined_user_id,
        new_referral.email_sent_at;
      return;
    exception
      when unique_violation then
        if attempt = 8 then
          raise exception 'Could not generate a unique founder referral code';
        end if;
    end;
  end loop;
end;
$$;

create or replace function public.platform_admin_cancel_founder_invite(
  referral_invite_id_input uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_invite public.founder_referral_invites%rowtype;
begin
  if not public.is_platform_admin() then
    raise exception 'Platform admin access required';
  end if;

  select *
  into target_invite
  from public.founder_referral_invites fri
  where fri.id = referral_invite_id_input
    and fri.status = 'pending'
  limit 1;

  if not found then
    return false;
  end if;

  update public.founder_referral_invites
  set
    status = 'cancelled',
    cancelled_at = now()
  where id = target_invite.id;

  update public.access_codes
  set is_active = false
  where id = target_invite.access_code_id;

  return true;
end;
$$;

create or replace function public.platform_admin_update_business_invite_limit(
  business_id_input text,
  invite_limit_total_input integer
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_business_id text := trim(coalesce(business_id_input, ''));
  normalized_limit integer := greatest(coalesce(invite_limit_total_input, 0), 1);
begin
  if not public.is_platform_admin() then
    raise exception 'Platform admin access required';
  end if;

  update public.businesses
  set invite_limit_total = normalized_limit
  where id::text = normalized_business_id;

  if not found then
    raise exception 'Business not found';
  end if;

  return normalized_limit;
end;
$$;

create or replace function public.platform_admin_update_business_feature_access(
  business_id_input text,
  feature_access_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_business_id text := trim(coalesce(business_id_input, ''));
  normalized_feature_access jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Platform admin access required';
  end if;

  normalized_feature_access := jsonb_build_object(
    'storefront', coalesce((feature_access_input->>'storefront')::boolean, true),
    'socialCheckout', coalesce((feature_access_input->>'socialCheckout')::boolean, true),
    'threads', coalesce((feature_access_input->>'threads')::boolean, true),
    'cases', coalesce((feature_access_input->>'cases')::boolean, true),
    'teamMembers', coalesce((feature_access_input->>'teamMembers')::boolean, true),
    'tasks', coalesce((feature_access_input->>'tasks')::boolean, true),
    'finance', coalesce((feature_access_input->>'finance')::boolean, true),
    'insights', coalesce((feature_access_input->>'insights')::boolean, true),
    'delivery', coalesce((feature_access_input->>'delivery')::boolean, true),
    'returns', coalesce((feature_access_input->>'returns')::boolean, true),
    'announcements', coalesce((feature_access_input->>'announcements')::boolean, true),
    'orderAutomation', coalesce((feature_access_input->>'orderAutomation')::boolean, true),
    'additionalIntegrations', coalesce((feature_access_input->>'additionalIntegrations')::boolean, false),
    'woocommerce', coalesce((feature_access_input->>'woocommerce')::boolean, false),
    'fyllPrint', coalesce((feature_access_input->>'fyllPrint')::boolean, true),
    'aiImport', coalesce((feature_access_input->>'aiImport')::boolean, true)
  );

  update public.businesses
  set data = coalesce(data, '{}'::jsonb) || jsonb_build_object('featureAccess', normalized_feature_access)
  where id::text = normalized_business_id;

  if not found then
    raise exception 'Business not found';
  end if;

  return normalized_feature_access;
end;
$$;

grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.platform_admin_me() to authenticated;
grant execute on function public.platform_admin_list_businesses(text) to authenticated;
grant execute on function public.platform_admin_list_business_invites(text) to authenticated;
grant execute on function public.platform_admin_create_founder_invite(text, text, integer) to authenticated;
grant execute on function public.platform_admin_cancel_founder_invite(uuid) to authenticated;
grant execute on function public.platform_admin_update_business_invite_limit(text, integer) to authenticated;
grant execute on function public.platform_admin_update_business_feature_access(text, jsonb) to authenticated;
