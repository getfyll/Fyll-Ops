-- Ensure the business user directory view runs with the querying user's
-- permissions/RLS context instead of the view owner's privileges.

create or replace view public.business_user_directory
with (security_invoker = true) as
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
