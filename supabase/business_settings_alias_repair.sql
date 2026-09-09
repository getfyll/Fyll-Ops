-- Repair duplicated public.business_settings rows across business_id aliases
-- Run this in the Supabase SQL editor after the app-side business_settings fix.
--
-- What it does:
-- 1) Creates a backup table if missing.
-- 2) Stores a full snapshot of current public.business_settings rows before repair.
-- 3) Groups rows by normalized business identity:
--      - strips "biz-" prefix
--      - strips hyphens
--      - lowercases
-- 4) Chooses the richest row per (normalized business, id) using:
--      - more order types
--      - more shipping zones
--      - more workflow steps
--      - then newest updated_at
-- 5) Copies that winner payload to all existing alias rows for the same business/id.
-- 6) Ensures a canonical hyphenated UUID row exists when the business_id is UUID-shaped.
--
-- Important:
-- - This script does NOT delete any business_settings rows.
-- - It is designed to be non-destructive and reversible via the backup table.

create table if not exists public.business_settings_alias_repair_backups (
  backup_id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  note text,
  snapshot jsonb not null
);

insert into public.business_settings_alias_repair_backups (note, snapshot)
select
  'Pre-alias-repair snapshot',
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', bs.id,
          'business_id', bs.business_id,
          'data', bs.data,
          'created_by', bs.created_by,
          'created_at', bs.created_at,
          'updated_at', bs.updated_at
        )
        order by bs.business_id, bs.id, bs.updated_at nulls last
      )
      from public.business_settings bs
    ),
    '[]'::jsonb
  );

with normalized_rows as (
  select
    bs.id,
    bs.business_id,
    bs.data,
    bs.created_by,
    bs.created_at,
    bs.updated_at,
    regexp_replace(
      regexp_replace(lower(coalesce(bs.business_id, '')), '^biz-', ''),
      '-',
      '',
      'g'
    ) as normalized_business_key,
    case
      when regexp_replace(
        regexp_replace(lower(coalesce(bs.business_id, '')), '^biz-', ''),
        '-',
        '',
        'g'
      ) ~ '^[a-f0-9]{32}$'
      then lower(
        substr(
          regexp_replace(
            regexp_replace(lower(coalesce(bs.business_id, '')), '^biz-', ''),
            '-',
            '',
            'g'
          ),
          1,
          8
        ) || '-' ||
        substr(
          regexp_replace(
            regexp_replace(lower(coalesce(bs.business_id, '')), '^biz-', ''),
            '-',
            '',
            'g'
          ),
          9,
          4
        ) || '-' ||
        substr(
          regexp_replace(
            regexp_replace(lower(coalesce(bs.business_id, '')), '^biz-', ''),
            '-',
            '',
            'g'
          ),
          13,
          4
        ) || '-' ||
        substr(
          regexp_replace(
            regexp_replace(lower(coalesce(bs.business_id, '')), '^biz-', ''),
            '-',
            '',
            'g'
          ),
          17,
          4
        ) || '-' ||
        substr(
          regexp_replace(
            regexp_replace(lower(coalesce(bs.business_id, '')), '^biz-', ''),
            '-',
            '',
            'g'
          ),
          21,
          12
        )
      )
      else lower(coalesce(bs.business_id, ''))
    end as canonical_business_id,
    coalesce(jsonb_array_length(coalesce(bs.data->'orderTimelineSettings'->'orderTypes', '[]'::jsonb)), 0) as order_type_count,
    coalesce(jsonb_array_length(coalesce(bs.data->'orderTimelineSettings'->'shippingZones', '[]'::jsonb)), 0) as shipping_zone_count,
    coalesce((
      select sum(jsonb_array_length(coalesce(item->'workflowStatusIds', '[]'::jsonb)))
      from jsonb_array_elements(coalesce(bs.data->'orderTimelineSettings'->'orderTypes', '[]'::jsonb)) item
    ), 0) as workflow_step_count,
    coalesce(bs.updated_at, bs.created_at, 'epoch'::timestamptz) as row_time
  from public.business_settings bs
),
ranked_rows as (
  select
    nr.*,
    row_number() over (
      partition by nr.normalized_business_key, nr.id
      order by
        nr.order_type_count desc,
        nr.shipping_zone_count desc,
        nr.workflow_step_count desc,
        nr.row_time desc,
        nr.business_id asc
    ) as row_rank
  from normalized_rows nr
  where nr.normalized_business_key <> ''
),
winners as (
  select *
  from ranked_rows
  where row_rank = 1
),
updated_alias_rows as (
  update public.business_settings target
  set
    data = winner.data,
    updated_at = greatest(coalesce(target.updated_at, 'epoch'::timestamptz), coalesce(winner.updated_at, 'epoch'::timestamptz))
  from normalized_rows target_norm
  join winners winner
    on winner.normalized_business_key = target_norm.normalized_business_key
   and winner.id = target_norm.id
  where target.id = target_norm.id
    and target.business_id = target_norm.business_id
    and (
      target.data is distinct from winner.data
    )
  returning target.id, target.business_id
),
missing_canonical_rows as (
  select
    winner.id,
    winner.canonical_business_id as business_id,
    winner.data,
    winner.created_by,
    coalesce(winner.created_at, now()) as created_at,
    coalesce(winner.updated_at, now()) as updated_at
  from winners winner
  where winner.canonical_business_id <> ''
    and winner.canonical_business_id <> winner.business_id
    and not exists (
      select 1
      from public.business_settings existing
      where existing.id = winner.id
        and lower(existing.business_id) = winner.canonical_business_id
    )
)
insert into public.business_settings (
  id,
  business_id,
  data,
  created_by,
  created_at,
  updated_at
)
select
  id,
  business_id,
  data,
  created_by,
  created_at,
  updated_at
from missing_canonical_rows
on conflict (id, business_id) do update
set
  data = excluded.data,
  updated_at = greatest(public.business_settings.updated_at, excluded.updated_at);

-- Optional verification:
-- select
--   business_id,
--   id,
--   jsonb_array_length(coalesce(data->'orderTimelineSettings'->'orderTypes', '[]'::jsonb)) as order_type_count,
--   jsonb_array_length(coalesce(data->'orderTimelineSettings'->'shippingZones', '[]'::jsonb)) as shipping_zone_count,
--   updated_at
-- from public.business_settings
-- where id = 'global'
-- order by business_id;

