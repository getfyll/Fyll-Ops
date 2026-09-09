-- Growth engine upgrade for invites: status history, invite limits, admin-only invite creation.
-- Run after supabase/invites.sql

create extension if not exists pgcrypto;

alter table public.businesses
  add column if not exists invite_limit_total integer not null default 5;

alter table public.invites
  add column if not exists status text not null default 'pending',
  add column if not exists created_by_user_id uuid,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by_user_id uuid,
  add column if not exists joined_at timestamptz,
  add column if not exists joined_user_id uuid,
  add column if not exists email_sent_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'invites_status_check'
      and conrelid = 'public.invites'::regclass
  ) then
    alter table public.invites
      add constraint invites_status_check
      check (status in ('pending', 'joined', 'cancelled', 'expired'));
  end if;
end $$;

create index if not exists invites_status_idx on public.invites (status);
create index if not exists invites_created_by_user_id_idx on public.invites (created_by_user_id);

update public.invites
set status = 'expired'
where status = 'pending'
  and expires_at <= now();

create or replace function public.touch_invites_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists invites_touch_updated_at on public.invites;
create trigger invites_touch_updated_at
before update on public.invites
for each row execute function public.touch_invites_updated_at();

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

create or replace function public.create_business_invite(
  email_input text,
  role_input text,
  invited_by_input text default null
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
  created_by_user_id uuid,
  email_sent_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_profile record;
  normalized_email text;
  normalized_role text;
  invite_limit integer;
  invite_usage_count integer;
  pending_existing public.invites%rowtype;
  candidate_code text;
  new_invite public.invites%rowtype;
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
    raise exception 'Only admins can invite team members';
  end if;

  if coalesce(caller_profile.business_id, '') = '' then
    raise exception 'No business selected';
  end if;

  normalized_email := lower(trim(coalesce(email_input, '')));
  normalized_role := lower(trim(coalesce(role_input, '')));

  if normalized_email = '' or position('@' in normalized_email) = 0 then
    raise exception 'Valid email is required';
  end if;

  if normalized_role not in ('admin', 'manager', 'staff') then
    raise exception 'Invalid role';
  end if;

  if exists (
    select 1
    from public.team_members tm
    where tm.business_id = caller_profile.business_id
      and lower(tm.email) = normalized_email
  ) then
    raise exception 'User already exists';
  end if;

  select *
  into pending_existing
  from public.invites i
  where i.business_id = caller_profile.business_id
    and lower(i.email) = normalized_email
    and i.status = 'pending'
    and i.expires_at > now()
  order by i.invited_at desc
  limit 1;

  if found then
    return query
    select
      pending_existing.id,
      pending_existing.email,
      pending_existing.role,
      pending_existing.invite_code,
      pending_existing.invited_by,
      pending_existing.invited_at,
      pending_existing.expires_at,
      pending_existing.business_id,
      pending_existing.status,
      pending_existing.created_by_user_id,
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
  from public.invites i
  where i.business_id = caller_profile.business_id
    and (
      i.status = 'joined'
      or (i.status = 'pending' and i.expires_at > now())
    );

  if invite_usage_count >= invite_limit then
    raise exception 'Invite limit reached (% total)', invite_limit;
  end if;

  for attempt in 1..8 loop
    candidate_code := public.generate_fyll_invite_code();

    begin
      insert into public.invites (
        email,
        role,
        invite_code,
        invited_by,
        invited_at,
        expires_at,
        business_id,
        status,
        created_by_user_id
      )
      values (
        normalized_email,
        normalized_role,
        candidate_code,
        coalesce(nullif(trim(coalesce(invited_by_input, '')), ''), coalesce(caller_profile.name, 'Admin')),
        now(),
        now() + interval '7 days',
        caller_profile.business_id,
        'pending',
        auth.uid()
      )
      returning *
      into new_invite;

      return query
      select
        new_invite.id,
        new_invite.email,
        new_invite.role,
        new_invite.invite_code,
        new_invite.invited_by,
        new_invite.invited_at,
        new_invite.expires_at,
        new_invite.business_id,
        new_invite.status,
        new_invite.created_by_user_id,
        new_invite.email_sent_at;
      return;
    exception
      when unique_violation then
        if attempt = 8 then
          raise exception 'Could not generate a unique invite code';
        end if;
    end;
  end loop;
end;
$$;

grant execute on function public.create_business_invite(text, text, text) to authenticated;

-- Return shape changed (status/joined columns added), so this must be dropped first.
drop function if exists public.get_invite_by_code(text);

create or replace function public.get_invite_by_code(invite_code_input text)
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
  joined_user_id uuid
)
language sql
security definer
set search_path = public
as $$
  select
    i.id,
    i.email,
    i.role,
    i.invite_code,
    i.invited_by,
    i.invited_at,
    i.expires_at,
    i.business_id,
    i.status,
    i.joined_at,
    i.joined_user_id
  from public.invites i
  where i.invite_code = invite_code_input
    and i.status = 'pending'
    and i.expires_at > now()
  limit 1;
$$;

create or replace function public.delete_invite(invite_id_input uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_count integer;
begin
  update public.invites
  set
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_by_user_id = auth.uid()
  where id = invite_id_input
    and status = 'pending'
    and business_id = (
      select business_id
      from public.profiles
      where id = auth.uid()
    );

  get diagnostics affected_count = row_count;
  return affected_count > 0;
end;
$$;
