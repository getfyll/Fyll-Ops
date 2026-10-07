-- Primary Fyll accounts
--
-- A "Fyll account" is a person, signed in with a PRIMARY email (for example the
-- founder's Gmail). It can be linked to one or more businesses as their owner and
-- used to sign in to every Fyll product. "Work" logins (admin@mint.co, a manager,
-- a staff member) keep working exactly as before.
--
-- How it fits the existing model:
--   * a primary account is a normal auth user flagged with
--     user_metadata.account_kind = 'primary' (so the signup trigger does NOT
--     create a business for it);
--   * linking a business gives that auth user a team_members row in the business,
--     so the existing can_access_business() RLS check works unchanged;
--   * profiles.business_id on the primary user is the ACTIVE business pointer,
--     changed with set_active_business();
--   * links start 'pending' and become 'active' only once the primary email is
--     verified (activate_primary_links()).
--
-- Run in the Supabase SQL editor. Safe to run more than once.

-- 1. Tables -----------------------------------------------------------------

create table if not exists public.fyll_accounts (
  id uuid primary key references auth.users(id) on delete cascade,
  primary_email text not null,
  name text,
  created_at timestamptz not null default now()
);

create unique index if not exists fyll_accounts_primary_email_key
  on public.fyll_accounts (lower(primary_email));

create table if not exists public.account_business_links (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.fyll_accounts(id) on delete cascade,
  business_id text not null,
  status text not null default 'pending' check (status in ('pending', 'active')),
  linked_by uuid,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  unique (account_id, business_id)
);

create index if not exists account_business_links_business_idx
  on public.account_business_links (business_id);

alter table public.fyll_accounts enable row level security;
alter table public.account_business_links enable row level security;

drop policy if exists "fyll_accounts_select_own" on public.fyll_accounts;
create policy "fyll_accounts_select_own"
  on public.fyll_accounts for select
  using (id = auth.uid());

drop policy if exists "account_business_links_select" on public.account_business_links;
create policy "account_business_links_select"
  on public.account_business_links for select
  using (account_id = auth.uid());

-- No insert / update / delete policies: rows are written only by the
-- primary-account edge function (service role) and the security definer
-- functions below.

-- 2. Don't create a business for a primary-account signup --------------------
-- Patches the LIVE handle_new_user() in place (several versions of it exist in
-- this repo), adding an early branch for account_kind = 'primary'.

do $$
declare
  fn_def text;
begin
  select pg_get_functiondef('public.handle_new_user'::regproc) into fn_def;

  if fn_def is null then
    raise notice 'handle_new_user() not found; primary accounts will not be able to skip business creation.';
  elsif position('account_kind' in fn_def) = 0 then
    fn_def := regexp_replace(
      fn_def,
      '\mbegin\M',
      E'begin\n'
      || E'  if coalesce(new.raw_user_meta_data->>''account_kind'', '''') = ''primary'' then\n'
      || E'    insert into public.fyll_accounts (id, primary_email, name)\n'
      || E'    values (new.id, new.email, coalesce(new.raw_user_meta_data->>''name'', split_part(new.email, ''@'', 1)))\n'
      || E'    on conflict (id) do nothing;\n'
      || E'    return new;\n'
      || E'  end if;\n',
      'i'
    );
    execute fn_def;
  end if;
end $$;

-- 3. Functions ----------------------------------------------------------------

create or replace function public.is_primary_account()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.fyll_accounts where id = auth.uid());
$$;

-- Internal: makes one link real (membership in the business + an active-business
-- pointer on the account's profile). Not callable by clients.
create or replace function public.activate_primary_link(p_account uuid, p_business text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  account public.fyll_accounts%rowtype;
begin
  select * into account from public.fyll_accounts where id = p_account;
  if not found then
    raise exception 'Unknown primary account.';
  end if;

  insert into public.team_members (user_id, email, name, role, business_id, created_at, last_login, membership_type)
  values (
    p_account,
    account.primary_email,
    coalesce(account.name, split_part(account.primary_email, '@', 1)),
    'admin',
    p_business,
    now(),
    now(),
    'owner'
  )
  on conflict (user_id, business_id) do nothing;

  update public.account_business_links
    set status = 'active', activated_at = coalesce(activated_at, now())
    where account_id = p_account and business_id = p_business;

  -- First business becomes the active one; later links never move it.
  insert into public.profiles (id, email, name, role, business_id, created_at, account_type)
  values (
    p_account,
    account.primary_email,
    coalesce(account.name, split_part(account.primary_email, '@', 1)),
    'admin',
    p_business,
    now(),
    'business_owner'
  )
  on conflict (id) do nothing;
end;
$$;

-- Turns pending links into real memberships once the primary email is verified.
-- Safe to call on every sign-in: returns 0 for anyone who is not a verified
-- primary account with pending links.
create or replace function public.activate_primary_links()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  activated integer := 0;
  link record;
begin
  if auth.uid() is null then
    return 0;
  end if;

  if not exists (select 1 from public.fyll_accounts where id = auth.uid()) then
    return 0;
  end if;

  if not exists (
    select 1 from auth.users where id = auth.uid() and email_confirmed_at is not null
  ) then
    return 0;
  end if;

  for link in
    select * from public.account_business_links
    where account_id = auth.uid() and status = 'pending'
  loop
    perform public.activate_primary_link(auth.uid(), link.business_id);
    activated := activated + 1;
  end loop;

  return activated;
end;
$$;

-- Service role only: records a link, and activates it straight away when the
-- primary email is already verified (or the caller proved ownership by password).
create or replace function public.link_primary_account(
  p_account uuid,
  p_business text,
  p_linked_by uuid,
  p_activate boolean
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.account_business_links (account_id, business_id, status, linked_by)
  values (p_account, p_business, 'pending', p_linked_by)
  on conflict (account_id, business_id) do nothing;

  if p_activate then
    perform public.activate_primary_link(p_account, p_business);
    return 'active';
  end if;

  return 'pending';
end;
$$;

-- Service role only: true once handle_new_user() knows to skip business creation
-- for primary accounts. The edge function refuses to create accounts until then.
create or replace function public.primary_accounts_ready()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select position('account_kind' in pg_get_functiondef('public.handle_new_user'::regproc)) > 0;
$$;

-- The businesses this signed-in user belongs to, with the active one flagged.
create or replace function public.get_my_businesses()
returns table (business_id text, name text, role text, is_active boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    tm.business_id::text,
    coalesce(b.name, 'Business'),
    tm.role::text,
    (p.business_id::text = tm.business_id::text) as is_active
  from public.team_members tm
  left join public.businesses b on b.id::text = tm.business_id::text
  left join public.profiles p on p.id = tm.user_id
  where tm.user_id = auth.uid()
  order by (p.business_id::text = tm.business_id::text) desc, b.name;
$$;

-- Points the signed-in primary account at one of its businesses.
create or replace function public.set_active_business(target_business_id text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;

  if not exists (select 1 from public.fyll_accounts where id = auth.uid()) then
    raise exception 'Only a primary Fyll account can switch businesses this way.';
  end if;

  if not exists (
    select 1 from public.team_members
    where user_id = auth.uid() and business_id = target_business_id
  ) then
    raise exception 'You are not a member of that business.';
  end if;

  update public.profiles set business_id = target_business_id where id = auth.uid();
end;
$$;

-- What the business admin sees under "Primary email": the linked address and
-- whether it is verified yet. Only admins of the business get a row.
create or replace function public.get_business_primary_link(target_business_id text)
returns table (primary_email text, status text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select a.primary_email, l.status
  from public.account_business_links l
  join public.fyll_accounts a on a.id = l.account_id
  where l.business_id = target_business_id
    and (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.business_id = target_business_id and p.role = 'admin'
      )
      or exists (
        select 1 from public.team_members tm
        where tm.user_id = auth.uid() and tm.business_id = target_business_id and tm.role = 'admin'
      )
    )
  limit 1;
$$;

revoke all on function public.is_primary_account() from public;
revoke all on function public.activate_primary_links() from public;
revoke all on function public.get_my_businesses() from public;
revoke all on function public.set_active_business(text) from public;
revoke all on function public.get_business_primary_link(text) from public;
grant execute on function public.is_primary_account() to authenticated;
grant execute on function public.activate_primary_links() to authenticated;
grant execute on function public.get_my_businesses() to authenticated;
grant execute on function public.set_active_business(text) to authenticated;
grant execute on function public.get_business_primary_link(text) to authenticated;

revoke all on function public.activate_primary_link(uuid, text) from public, authenticated;
revoke all on function public.link_primary_account(uuid, text, uuid, boolean) from public, authenticated;
revoke all on function public.primary_accounts_ready() from public, authenticated;
grant execute on function public.activate_primary_link(uuid, text) to service_role;
grant execute on function public.link_primary_account(uuid, text, uuid, boolean) to service_role;
grant execute on function public.primary_accounts_ready() to service_role;

-- 4. Verification codes ----------------------------------------------------------
-- The 6-digit code emailed to a new primary email. Only a hash is stored; rows are
-- written and read by the primary-account edge function (service role) alone.

create table if not exists public.primary_email_codes (
  account_id uuid primary key references public.fyll_accounts(id) on delete cascade,
  business_id text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  last_sent_at timestamptz not null default now()
);

alter table public.primary_email_codes enable row level security;
-- No policies on purpose: clients can never read or write codes.
