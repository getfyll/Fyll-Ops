-- Protect public.business_settings.orderTimelineSettings from destructive empty overwrites.
-- Run in Supabase SQL editor after settings_backup_utils.sql if possible.
--
-- What this does:
-- 1) Creates a small audit table for blocked/allowed timeline writes.
-- 2) Creates a trigger that blocks replacing a populated timeline config with an empty one.
-- 3) Stores the previous populated timeline JSON into data.orderTimelineSettingsLastKnownPopulated.

create table if not exists public.business_settings_timeline_guard_events (
  id uuid primary key default gen_random_uuid(),
  business_id text not null,
  settings_id text not null default 'global',
  event_type text not null,
  previous_timeline jsonb,
  incoming_timeline jsonb,
  created_at timestamptz not null default now()
);

create index if not exists business_settings_timeline_guard_events_business_idx
  on public.business_settings_timeline_guard_events (business_id, created_at desc);

alter table public.business_settings_timeline_guard_events enable row level security;

drop policy if exists business_settings_timeline_guard_events_select_own_business on public.business_settings_timeline_guard_events;
drop policy if exists business_settings_timeline_guard_events_insert_own_business on public.business_settings_timeline_guard_events;

create policy business_settings_timeline_guard_events_select_own_business
  on public.business_settings_timeline_guard_events for select
  using (public.can_access_business(business_id));

create policy business_settings_timeline_guard_events_insert_own_business
  on public.business_settings_timeline_guard_events for insert
  with check (public.can_access_business(business_id));

create or replace function public.timeline_settings_has_meaningful_data(input jsonb)
returns boolean
language sql
immutable
as $$
  with normalized as (
    select coalesce(input, '{}'::jsonb) as payload
  )
  select
    coalesce(jsonb_array_length(coalesce(payload->'orderTypes', '[]'::jsonb)), 0) > 0
    or coalesce(jsonb_array_length(coalesce(payload->'shippingZones', '[]'::jsonb)), 0) > 0
    or exists (
      select 1
      from jsonb_array_elements(coalesce(payload->'orderTypes', '[]'::jsonb)) entry
      where jsonb_typeof(entry->'workflowStatusIds') = 'array'
        and jsonb_array_length(entry->'workflowStatusIds') > 0
    )
  from normalized;
$$;

create or replace function public.guard_business_settings_order_timeline()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  previous_timeline jsonb := coalesce(old.data->'orderTimelineSettings', '{}'::jsonb);
  incoming_timeline jsonb := coalesce(new.data->'orderTimelineSettings', '{}'::jsonb);
  previous_has_data boolean := public.timeline_settings_has_meaningful_data(previous_timeline);
  incoming_has_data boolean := public.timeline_settings_has_meaningful_data(incoming_timeline);
begin
  if coalesce(new.id, '') <> 'global' then
    return new;
  end if;

  if previous_has_data then
    new.data := jsonb_set(
      coalesce(new.data, '{}'::jsonb),
      '{orderTimelineSettingsLastKnownPopulated}',
      previous_timeline,
      true
    );
  end if;

  if previous_has_data and not incoming_has_data then
    insert into public.business_settings_timeline_guard_events (
      business_id,
      settings_id,
      event_type,
      previous_timeline,
      incoming_timeline
    )
    values (
      new.business_id,
      coalesce(new.id, 'global'),
      'blocked_empty_overwrite',
      previous_timeline,
      incoming_timeline
    );

    raise exception 'Blocked empty orderTimelineSettings overwrite because a populated timeline already exists for business %.', new.business_id;
  end if;

  if incoming_has_data then
    insert into public.business_settings_timeline_guard_events (
      business_id,
      settings_id,
      event_type,
      previous_timeline,
      incoming_timeline
    )
    values (
      new.business_id,
      coalesce(new.id, 'global'),
      case when previous_has_data then 'allowed_update' else 'allowed_initial_write' end,
      previous_timeline,
      incoming_timeline
    );
  end if;

  return new;
end;
$$;

drop trigger if exists business_settings_order_timeline_guard on public.business_settings;

create trigger business_settings_order_timeline_guard
before update on public.business_settings
for each row
execute procedure public.guard_business_settings_order_timeline();
