-- Invite-only founder access codes + onboarding metadata.
-- Run in Supabase SQL editor.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.access_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  label text,
  is_active boolean not null default true,
  max_uses integer,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.access_code_redemptions (
  id uuid primary key default gen_random_uuid(),
  access_code_id uuid not null references public.access_codes(id) on delete cascade,
  email text not null,
  business_name text,
  business_id text,
  redeemed_by_user_id uuid,
  redeemed_at timestamptz not null default now()
);

create unique index if not exists access_code_redemptions_code_email_key
  on public.access_code_redemptions (access_code_id, lower(email));

create index if not exists access_code_redemptions_access_code_id_idx
  on public.access_code_redemptions (access_code_id);

alter table public.access_codes enable row level security;
alter table public.access_code_redemptions enable row level security;

create or replace function public.normalize_access_code(code_input text)
returns text
language sql
immutable
as $$
  select upper(trim(coalesce(code_input, '')));
$$;

create or replace function public.validate_access_code(access_code_input text)
returns table (
  is_valid boolean,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_code text;
  target_code public.access_codes%rowtype;
  usage_count integer;
begin
  normalized_code := public.normalize_access_code(access_code_input);

  if normalized_code = '' then
    return query select false, 'Access code is required.';
    return;
  end if;

  select *
  into target_code
  from public.access_codes
  where code_hash = encode(extensions.digest(normalized_code, 'sha256'), 'hex')
  limit 1;

  if not found then
    return query select false, 'Invalid access code.';
    return;
  end if;

  if not target_code.is_active then
    return query select false, 'This access code is inactive.';
    return;
  end if;

  if target_code.expires_at is not null and target_code.expires_at <= now() then
    return query select false, 'This access code has expired.';
    return;
  end if;

  select count(*)
  into usage_count
  from public.access_code_redemptions r
  where r.access_code_id = target_code.id;

  if target_code.max_uses is not null and usage_count >= target_code.max_uses then
    return query select false, 'This access code has reached its usage limit.';
    return;
  end if;

  return query select true, 'Access granted.';
end;
$$;

create or replace function public.redeem_access_code(
  access_code_input text,
  email_input text,
  business_name_input text default null,
  business_id_input text default null
)
returns table (
  success boolean,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_code text;
  normalized_email text;
  target_code public.access_codes%rowtype;
  usage_count integer;
begin
  normalized_code := public.normalize_access_code(access_code_input);
  normalized_email := lower(trim(coalesce(email_input, '')));

  if normalized_code = '' then
    return query select false, 'Access code is required.';
    return;
  end if;

  if normalized_email = '' then
    return query select false, 'Email is required.';
    return;
  end if;

  select *
  into target_code
  from public.access_codes
  where code_hash = encode(extensions.digest(normalized_code, 'sha256'), 'hex')
  for update;

  if not found then
    return query select false, 'Invalid access code.';
    return;
  end if;

  if not target_code.is_active then
    return query select false, 'This access code is inactive.';
    return;
  end if;

  if target_code.expires_at is not null and target_code.expires_at <= now() then
    return query select false, 'This access code has expired.';
    return;
  end if;

  if exists (
    select 1
    from public.access_code_redemptions r
    where r.access_code_id = target_code.id
      and lower(r.email) = normalized_email
  ) then
    return query select true, 'Access code redemption already recorded.';
    return;
  end if;

  select count(*)
  into usage_count
  from public.access_code_redemptions r
  where r.access_code_id = target_code.id;

  if target_code.max_uses is not null and usage_count >= target_code.max_uses then
    return query select false, 'This access code has reached its usage limit.';
    return;
  end if;

  insert into public.access_code_redemptions (
    access_code_id,
    email,
    business_name,
    business_id,
    redeemed_by_user_id
  )
  values (
    target_code.id,
    normalized_email,
    nullif(trim(coalesce(business_name_input, '')), ''),
    nullif(trim(coalesce(business_id_input, '')), ''),
    auth.uid()
  );

  return query select true, 'Access code redeemed.';
end;
$$;

grant execute on function public.validate_access_code(text) to anon, authenticated;
grant execute on function public.redeem_access_code(text, text, text, text) to anon, authenticated;

insert into public.access_codes (code_hash, label, is_active, max_uses)
values (
  encode(extensions.digest('MINT2026', 'sha256'), 'hex'),
  'Founding cohort',
  true,
  100
)
on conflict (code_hash) do nothing;

alter table public.businesses
  add column if not exists onboarding_step integer not null default 0,
  add column if not exists onboarding_bottlenecks text[] not null default '{}'::text[],
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists invite_limit_total integer not null default 5;
