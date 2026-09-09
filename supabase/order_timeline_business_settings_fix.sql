-- Fix Order Timeline / Shipping Zone persistence in public.business_settings
-- Run this in the Supabase SQL editor.
--
-- Why this exists:
-- - Order timelines, shipping zones, workflowStatusIds and related fulfillment
--   settings are saved inside public.business_settings.data.orderTimelineSettings.
-- - Older RLS policies on public.business_settings often only allow access when
--   auth.uid() matches public.profiles.business_id ownership directly.
-- - Team / manager accounts linked through public.team_members can then fail
--   writes under RLS, which makes settings appear to save locally but disappear
--   after refresh or on another device.
--
-- What this script does:
-- 1) Creates/refreshes public.can_access_business(target_business_id text)
--    so both owners and team users can pass RLS.
-- 2) Replaces public.business_settings RLS policies to use that helper.
-- 3) Ensures every known business has a baseline "global" row.
-- 4) Backfills a safe orderTimelineSettings object if missing.

create or replace function public.can_access_business(target_business_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and (
        business_id = target_business_id
        or regexp_replace(regexp_replace(lower(coalesce(business_id, '')), '^biz-', ''), '-', '', 'g')
          = regexp_replace(regexp_replace(lower(coalesce(target_business_id, '')), '^biz-', ''), '-', '', 'g')
      )
    union
    select 1
    from public.team_members
    where user_id = auth.uid()
      and (
        business_id = target_business_id
        or regexp_replace(regexp_replace(lower(coalesce(business_id, '')), '^biz-', ''), '-', '', 'g')
          = regexp_replace(regexp_replace(lower(coalesce(target_business_id, '')), '^biz-', ''), '-', '', 'g')
      )
  );
$$;

grant execute on function public.can_access_business(text) to authenticated;

create table if not exists public.business_settings (
  id text not null,
  business_id text not null,
  data jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, business_id)
);

alter table public.business_settings add column if not exists id text;
alter table public.business_settings add column if not exists business_id text;
alter table public.business_settings add column if not exists data jsonb default '{}'::jsonb;
alter table public.business_settings add column if not exists created_by text;
alter table public.business_settings add column if not exists created_at timestamptz default now();
alter table public.business_settings add column if not exists updated_at timestamptz default now();

create index if not exists business_settings_business_id_idx
  on public.business_settings (business_id);

with ranked_business_settings as (
  select
    ctid,
    row_number() over (
      partition by id, business_id
      order by coalesce(updated_at, created_at, 'epoch'::timestamptz) desc, ctid desc
    ) as row_number
  from public.business_settings
)
delete from public.business_settings bs
using ranked_business_settings ranked
where bs.ctid = ranked.ctid
  and ranked.row_number > 1;

create unique index if not exists business_settings_id_business_id_uidx
  on public.business_settings (id, business_id);

alter table public.business_settings enable row level security;

drop policy if exists business_settings_select on public.business_settings;
drop policy if exists business_settings_insert on public.business_settings;
drop policy if exists business_settings_update on public.business_settings;
drop policy if exists business_settings_delete on public.business_settings;
drop policy if exists business_settings_select_own_business on public.business_settings;
drop policy if exists business_settings_insert_own_business on public.business_settings;
drop policy if exists business_settings_update_own_business on public.business_settings;
drop policy if exists business_settings_delete_own_business on public.business_settings;

create policy business_settings_select_own_business
  on public.business_settings for select
  using (public.can_access_business(business_id));

create policy business_settings_insert_own_business
  on public.business_settings for insert
  with check (public.can_access_business(business_id));

create policy business_settings_update_own_business
  on public.business_settings for update
  using (public.can_access_business(business_id))
  with check (public.can_access_business(business_id));

create policy business_settings_delete_own_business
  on public.business_settings for delete
  using (public.can_access_business(business_id));

with known_businesses as (
  select distinct business_id
  from public.profiles
  where business_id is not null
  union
  select distinct business_id
  from public.team_members
  where business_id is not null
  union
  select distinct business_id
  from public.business_settings
  where business_id is not null
)
insert into public.business_settings (id, business_id, data, created_at, updated_at)
select
  'global',
  kb.business_id,
  '{}'::jsonb,
  now(),
  now()
from known_businesses kb
where not exists (
  select 1
  from public.business_settings bs
  where bs.id = 'global'
    and bs.business_id = kb.business_id
);

update public.business_settings
set
  data = jsonb_set(
    coalesce(data, '{}'::jsonb),
    '{orderTimelineSettings}',
    jsonb_build_object(
      'warningThresholdPercent',
        coalesce(data->'orderTimelineSettings'->'warningThresholdPercent', '80'::jsonb),
      'defaultOrderType',
        coalesce(
          data->'orderTimelineSettings'->'defaultOrderType',
          jsonb_build_object(
            'id', 'default-order-type',
            'name', 'Standard order',
            'minBusinessDays', 3,
            'maxBusinessDays', 7,
            'shippingZoneId', null,
            'workflowStatusIds', '[]'::jsonb
          )
        ),
      'orderTypes',
        coalesce(data->'orderTimelineSettings'->'orderTypes', '[]'::jsonb),
      'shippingZones',
        coalesce(data->'orderTimelineSettings'->'shippingZones', '[]'::jsonb)
    ),
    true
  ),
  updated_at = now()
where id = 'global'
  and (data is null or jsonb_typeof(data) <> 'object'
    or not (coalesce(data, '{}'::jsonb) ? 'orderTimelineSettings')
    or not (coalesce(data->'orderTimelineSettings', '{}'::jsonb) ? 'orderTypes')
    or not (coalesce(data->'orderTimelineSettings', '{}'::jsonb) ? 'shippingZones')
    or not (coalesce(data->'orderTimelineSettings', '{}'::jsonb) ? 'warningThresholdPercent')
    or not (coalesce(data->'orderTimelineSettings', '{}'::jsonb) ? 'defaultOrderType'));

-- Empty orderTypes/shippingZones are valid. Do not seed hard-coded defaults
-- here; otherwise users cannot intentionally delete all timelines or zones.

-- Optional diagnostic: this should show exactly what the app will load/save.
-- select
--   id,
--   business_id,
--   jsonb_array_length(coalesce(data->'orderTimelineSettings'->'orderTypes', '[]'::jsonb)) as order_type_count,
--   jsonb_array_length(coalesce(data->'orderTimelineSettings'->'shippingZones', '[]'::jsonb)) as shipping_zone_count,
--   data->'orderTimelineSettings'->'orderTypes' as order_types,
--   data->'orderTimelineSettings'->'shippingZones' as shipping_zones
-- from public.business_settings
-- where id = 'global'
-- order by updated_at desc;

-- Optional verification:
-- select
--   business_id,
--   data->'orderTimelineSettings' as order_timeline_settings
-- from public.business_settings
-- where id = 'global'
-- order by updated_at desc;
