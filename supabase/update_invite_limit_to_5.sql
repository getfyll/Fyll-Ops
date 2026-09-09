-- Raise invite limit default from 3 to 5 for founder/team invite flows.

alter table if exists public.businesses
  alter column invite_limit_total set default 5;

-- Upgrade existing businesses still on the legacy default.
update public.businesses
set invite_limit_total = 5
where invite_limit_total = 3;
