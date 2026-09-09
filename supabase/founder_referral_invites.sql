-- Founder referral invites (VIP growth engine) separate from team invites.
-- This uses access_codes for validation and redemption, but tracks founder-invite history
-- in a dedicated table so links open founder signup, not team join.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.founder_referral_invites (
  id uuid primary key default gen_random_uuid(),
  business_id text not null,
  inviter_user_id uuid not null,
  inviter_name text,
  recipient_email text not null,
  access_code text not null unique,
  access_code_hash text not null unique,
  access_code_id uuid not null references public.access_codes(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  cancelled_at timestamptz,
  joined_at timestamptz,
  joined_business_id text,
  joined_user_id uuid,
  email_sent_at timestamptz,
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'founder_referral_invites_status_check'
      and conrelid = 'public.founder_referral_invites'::regclass
  ) then
    alter table public.founder_referral_invites
      add constraint founder_referral_invites_status_check
      check (status in ('pending', 'joined', 'cancelled', 'expired'));
  end if;
end $$;

create index if not exists founder_referral_invites_business_id_idx
  on public.founder_referral_invites (business_id);

create index if not exists founder_referral_invites_status_idx
  on public.founder_referral_invites (status);

create index if not exists founder_referral_invites_recipient_email_idx
  on public.founder_referral_invites (lower(recipient_email));

alter table public.founder_referral_invites enable row level security;

drop policy if exists founder_referral_invites_select_same_business on public.founder_referral_invites;
create policy founder_referral_invites_select_same_business
  on public.founder_referral_invites
  for select
  using (business_id = (select p.business_id from public.profiles p where p.id = auth.uid()));

create or replace function public.touch_founder_referral_invites_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists founder_referral_invites_touch_updated_at on public.founder_referral_invites;
create trigger founder_referral_invites_touch_updated_at
before update on public.founder_referral_invites
for each row execute function public.touch_founder_referral_invites_updated_at();

-- Keep local copy here so this migration is independently runnable.
create or replace function public.generate_fyll_invite_code()
returns text
language plpgsql
as $$
declare
  chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result_code text := 'FYLL-';
  i integer;
begin
  for i in 1..4 loop
    result_code := result_code || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  end loop;
  result_code := result_code || '-';
  for i in 1..2 loop
    result_code := result_code || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  end loop;
  return result_code;
end;
$$;

drop function if exists public.create_founder_referral_invite(text, text);
create or replace function public.create_founder_referral_invite(
  recipient_email_input text,
  inviter_name_input text default null
)
returns table (
  id uuid,
  email text,
  role text,
  invite_code text,
  invited_by text,
  invited_at timestamptz,
  expires_at timestamptz,
  business_id text,
  status text,
  joined_at timestamptz,
  joined_user_id uuid,
  email_sent_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_profile record;
  normalized_email text;
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
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select p.id, p.role, p.business_id, p.name
  into caller_profile
  from public.profiles p
  where p.id = auth.uid()
  limit 1;

  if not found then
    raise exception 'Profile not found';
  end if;

  if lower(coalesce(caller_profile.role, '')) <> 'admin' then
    raise exception 'Only admins can create founder referrals';
  end if;

  if coalesce(caller_profile.business_id, '') = '' then
    raise exception 'No business selected';
  end if;

  normalized_email := lower(trim(coalesce(recipient_email_input, '')));
  if normalized_email = '' or position('@' in normalized_email) = 0 then
    raise exception 'Valid email is required';
  end if;

  select *
  into pending_existing
  from public.founder_referral_invites fri
  where fri.business_id = caller_profile.business_id
    and lower(fri.recipient_email) = normalized_email
    and fri.status = 'pending'
    and fri.expires_at > now()
  order by fri.created_at desc
  limit 1;

  if found then
    return query
    select
      pending_existing.id,
      pending_existing.recipient_email,
      'admin'::text,
      pending_existing.access_code,
      coalesce(pending_existing.inviter_name, 'Admin'),
      pending_existing.created_at,
      pending_existing.expires_at,
      pending_existing.business_id,
      pending_existing.status,
      pending_existing.joined_at,
      pending_existing.joined_user_id,
      pending_existing.email_sent_at;
    return;
  end if;

  select coalesce(b.invite_limit_total, 5)
  into invite_limit
  from public.businesses b
  where b.id = caller_profile.business_id
  limit 1;

  invite_limit := coalesce(invite_limit, 5);

  select count(*)
  into invite_usage_count
  from public.founder_referral_invites fri
  where fri.business_id = caller_profile.business_id
    and (
      fri.status = 'joined'
      or (fri.status = 'pending' and fri.expires_at > now())
    );

  if invite_usage_count >= invite_limit then
    raise exception 'Invite limit reached (% total)', invite_limit;
  end if;

  expires_ts := now() + interval '30 days';

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
        'Founder referral',
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
        caller_profile.business_id,
        auth.uid(),
        coalesce(nullif(trim(coalesce(inviter_name_input, '')), ''), coalesce(caller_profile.name, 'Admin')),
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
        new_referral.recipient_email,
        'admin'::text,
        new_referral.access_code,
        coalesce(new_referral.inviter_name, 'Admin'),
        new_referral.created_at,
        new_referral.expires_at,
        new_referral.business_id,
        new_referral.status,
        new_referral.joined_at,
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

grant execute on function public.create_founder_referral_invite(text, text) to authenticated;

drop function if exists public.cancel_founder_referral_invite(uuid);
create or replace function public.cancel_founder_referral_invite(referral_invite_id_input uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target_invite public.founder_referral_invites%rowtype;
  caller_profile record;
begin
  if auth.uid() is null then
    return false;
  end if;

  select p.id, p.role, p.business_id
  into caller_profile
  from public.profiles p
  where p.id = auth.uid()
  limit 1;

  if not found or lower(coalesce(caller_profile.role, '')) <> 'admin' then
    return false;
  end if;

  select *
  into target_invite
  from public.founder_referral_invites fri
  where fri.id = referral_invite_id_input
    and fri.business_id = caller_profile.business_id
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

grant execute on function public.cancel_founder_referral_invite(uuid) to authenticated;

drop function if exists public.mark_founder_referral_invite_redeemed(text, text, uuid);
create or replace function public.mark_founder_referral_invite_redeemed(
  access_code_input text,
  joined_business_id_input text default null,
  joined_user_id_input uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_code text;
  updated_count integer;
begin
  normalized_code := public.normalize_access_code(access_code_input);
  if normalized_code = '' then
    return false;
  end if;

  update public.founder_referral_invites fri
  set
    status = 'joined',
    joined_at = now(),
    joined_business_id = nullif(trim(coalesce(joined_business_id_input, '')), ''),
    joined_user_id = coalesce(joined_user_id_input, auth.uid())
  where fri.access_code = normalized_code
    and fri.status = 'pending';

  get diagnostics updated_count = row_count;

  if updated_count > 0 then
    update public.access_codes
    set is_active = false
    where code_hash = encode(extensions.digest(normalized_code, 'sha256'), 'hex');
  end if;

  return updated_count > 0;
end;
$$;

grant execute on function public.mark_founder_referral_invite_redeemed(text, text, uuid) to anon, authenticated;
