-- Distinguish business owners from invited team members without overloading role.
-- Run in Supabase SQL editor.
--
-- Why:
-- - `role` answers "what can this person do?" (admin / manager / staff)
-- - it should not also answer "how did this person join this business?"
-- - today owners and team members can both look like generic admin rows
--
-- This script adds:
-- - public.profiles.account_type: `business_owner` | `team_member`
-- - public.team_members.membership_type: `owner` | `team_member`
-- - public.business_user_directory view for clean downstream reads

create or replace function public.normalize_business_identity(input text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    regexp_replace(lower(coalesce(input, '')), '^biz-', ''),
    '-',
    '',
    'g'
  );
$$;

alter table public.profiles
  add column if not exists account_type text;

alter table public.team_members
  add column if not exists membership_type text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_account_type_check'
  ) then
    alter table public.profiles
      add constraint profiles_account_type_check
      check (account_type in ('business_owner', 'team_member'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'team_members_membership_type_check'
  ) then
    alter table public.team_members
      add constraint team_members_membership_type_check
      check (membership_type in ('owner', 'team_member'));
  end if;
end $$;

update public.profiles p
set account_type = case
  when exists (
    select 1
    from public.businesses b
    where b.owner_id = p.id::text
      and public.normalize_business_identity(b.id::text) = public.normalize_business_identity(p.business_id::text)
  ) then 'business_owner'
  when exists (
    select 1
    from public.team_members tm
    where tm.user_id = p.id
      and public.normalize_business_identity(tm.business_id::text) = public.normalize_business_identity(p.business_id::text)
  ) then 'team_member'
  when lower(coalesce(p.role, '')) = 'admin' then 'business_owner'
  else 'team_member'
end
where coalesce(p.account_type, '') = '';

update public.team_members tm
set membership_type = case
  when exists (
    select 1
    from public.businesses b
    where b.owner_id = tm.user_id::text
      and public.normalize_business_identity(b.id::text) = public.normalize_business_identity(tm.business_id::text)
  ) then 'owner'
  else 'team_member'
end
where coalesce(tm.membership_type, '') = '';

create index if not exists idx_profiles_account_type
  on public.profiles (account_type);

create index if not exists idx_team_members_membership_type
  on public.team_members (membership_type);

create or replace view public.business_user_directory as
select
  p.id::text as user_id,
  p.business_id::text as business_id,
  public.normalize_business_identity(p.business_id::text) as canonical_business_id,
  p.email,
  p.name,
  p.role,
  p.account_type,
  case
    when exists (
      select 1
      from public.team_members tm
      where tm.user_id = p.id
        and public.normalize_business_identity(tm.business_id::text) = public.normalize_business_identity(p.business_id::text)
        and coalesce(tm.membership_type, 'team_member') = 'owner'
    ) then 'owner'
    when exists (
      select 1
      from public.team_members tm
      where tm.user_id = p.id
        and public.normalize_business_identity(tm.business_id::text) = public.normalize_business_identity(p.business_id::text)
    ) then 'team_member'
    else null
  end as membership_type,
  (p.account_type = 'business_owner') as is_business_owner,
  exists (
    select 1
    from public.team_members tm
    where tm.user_id = p.id
      and public.normalize_business_identity(tm.business_id::text) = public.normalize_business_identity(p.business_id::text)
      and coalesce(tm.membership_type, 'team_member') = 'team_member'
  ) as is_team_member
from public.profiles p;

comment on column public.profiles.account_type is
  'Identity relationship to the business. business_owner means the user owns/created the business. team_member means they joined through team membership.';

comment on column public.team_members.membership_type is
  'Membership row classification. owner means this row represents the business owner mirrored into team_members. team_member means invited staff/manager/admin.';
