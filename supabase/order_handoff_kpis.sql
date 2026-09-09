-- ==================================================================
-- FYLL ORDER HANDOFF KPI + SLA + ESCALATION
-- ==================================================================
-- Measures:
-- 1) On-time handoff rate (same local day, before cutoff)
-- 2) Median handoff latency (hours)
-- 3) Overdue backlog (older than SLA, not fully handed off)
--
-- Includes:
-- - SLA config table per business
-- - order handoff events table (woocommerce/options_group)
-- - auto-capture trigger from orders row updates
-- - KPI views for dashboard
-- - checkpoint + escalation log function
-- - optional recovery task auto-creation (if tasks tables exist)
--
-- Safe to run multiple times.
-- Run after data_tables.sql (and tasks_mvp.sql if you want auto task creation).
-- ==================================================================

create extension if not exists pgcrypto;

create or replace function public.get_user_business_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select business_id
  from public.profiles
  where id = auth.uid()
  limit 1;
$$;

create or replace function public.try_parse_timestamptz(p_value text)
returns timestamptz
language plpgsql
immutable
as $$
begin
  if p_value is null or trim(p_value) = '' then
    return null;
  end if;
  return p_value::timestamptz;
exception
  when others then
    return null;
end;
$$;

create or replace function public.set_order_handoff_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.order_handoff_sla_config (
  business_id text primary key,
  timezone text not null default 'Africa/Lagos',
  same_day_cutoff_local time not null default time '16:00',
  overdue_after_hours integer not null default 24 check (overdue_after_hours between 1 and 240),
  require_woocommerce boolean not null default true,
  require_options_group boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_handoff_events (
  id uuid primary key default gen_random_uuid(),
  business_id text not null,
  order_id text not null,
  handoff_target text not null check (handoff_target in ('woocommerce', 'options_group')),
  handed_off_at timestamptz not null,
  handed_off_by text,
  source text not null default 'manual'
    check (source in ('manual', 'auto_reference', 'auto_status', 'auto_activity', 'system')),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, order_id, handoff_target),
  constraint order_handoff_events_order_fk
    foreign key (order_id, business_id)
    references public.orders(id, business_id)
    on delete cascade
);

create table if not exists public.order_handoff_checkpoint_log (
  id uuid primary key default gen_random_uuid(),
  business_id text not null,
  checkpoint_date date not null,
  checkpoint_type text not null check (checkpoint_type in ('midday', 'pre_cutoff', 'eod')),
  eligible_orders integer not null default 0,
  handed_off_orders integer not null default 0,
  on_time_handoff_rate numeric(6,2) not null default 0,
  median_required_handoff_latency_hours numeric(10,2),
  overdue_backlog integer not null default 0,
  triggered boolean not null default false,
  reason text not null default '',
  recovery_task_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, checkpoint_date, checkpoint_type)
);

create index if not exists order_handoff_events_business_target_time_idx
  on public.order_handoff_events (business_id, handoff_target, handed_off_at desc);

create index if not exists order_handoff_events_business_order_idx
  on public.order_handoff_events (business_id, order_id);

create index if not exists order_handoff_checkpoint_log_business_date_idx
  on public.order_handoff_checkpoint_log (business_id, checkpoint_date desc);

create index if not exists order_handoff_checkpoint_log_triggered_idx
  on public.order_handoff_checkpoint_log (business_id, triggered, checkpoint_date desc);

alter table public.order_handoff_sla_config enable row level security;
alter table public.order_handoff_events enable row level security;
alter table public.order_handoff_checkpoint_log enable row level security;

drop policy if exists order_handoff_sla_config_select_v1 on public.order_handoff_sla_config;
drop policy if exists order_handoff_sla_config_insert_v1 on public.order_handoff_sla_config;
drop policy if exists order_handoff_sla_config_update_v1 on public.order_handoff_sla_config;
drop policy if exists order_handoff_sla_config_delete_v1 on public.order_handoff_sla_config;

create policy order_handoff_sla_config_select_v1
  on public.order_handoff_sla_config for select
  using (business_id = public.get_user_business_id());

create policy order_handoff_sla_config_insert_v1
  on public.order_handoff_sla_config for insert
  with check (business_id = public.get_user_business_id());

create policy order_handoff_sla_config_update_v1
  on public.order_handoff_sla_config for update
  using (business_id = public.get_user_business_id());

create policy order_handoff_sla_config_delete_v1
  on public.order_handoff_sla_config for delete
  using (business_id = public.get_user_business_id());

drop policy if exists order_handoff_events_select_v1 on public.order_handoff_events;
drop policy if exists order_handoff_events_insert_v1 on public.order_handoff_events;
drop policy if exists order_handoff_events_update_v1 on public.order_handoff_events;
drop policy if exists order_handoff_events_delete_v1 on public.order_handoff_events;

create policy order_handoff_events_select_v1
  on public.order_handoff_events for select
  using (business_id = public.get_user_business_id());

create policy order_handoff_events_insert_v1
  on public.order_handoff_events for insert
  with check (business_id = public.get_user_business_id());

create policy order_handoff_events_update_v1
  on public.order_handoff_events for update
  using (business_id = public.get_user_business_id());

create policy order_handoff_events_delete_v1
  on public.order_handoff_events for delete
  using (business_id = public.get_user_business_id());

drop policy if exists order_handoff_checkpoint_log_select_v1 on public.order_handoff_checkpoint_log;
drop policy if exists order_handoff_checkpoint_log_insert_v1 on public.order_handoff_checkpoint_log;
drop policy if exists order_handoff_checkpoint_log_update_v1 on public.order_handoff_checkpoint_log;
drop policy if exists order_handoff_checkpoint_log_delete_v1 on public.order_handoff_checkpoint_log;

create policy order_handoff_checkpoint_log_select_v1
  on public.order_handoff_checkpoint_log for select
  using (business_id = public.get_user_business_id());

create policy order_handoff_checkpoint_log_insert_v1
  on public.order_handoff_checkpoint_log for insert
  with check (business_id = public.get_user_business_id());

create policy order_handoff_checkpoint_log_update_v1
  on public.order_handoff_checkpoint_log for update
  using (business_id = public.get_user_business_id());

create policy order_handoff_checkpoint_log_delete_v1
  on public.order_handoff_checkpoint_log for delete
  using (business_id = public.get_user_business_id());

drop trigger if exists order_handoff_sla_config_set_updated_at on public.order_handoff_sla_config;
create trigger order_handoff_sla_config_set_updated_at
before update on public.order_handoff_sla_config
for each row execute function public.set_order_handoff_updated_at();

drop trigger if exists order_handoff_events_set_updated_at on public.order_handoff_events;
create trigger order_handoff_events_set_updated_at
before update on public.order_handoff_events
for each row execute function public.set_order_handoff_updated_at();

drop trigger if exists order_handoff_checkpoint_log_set_updated_at on public.order_handoff_checkpoint_log;
create trigger order_handoff_checkpoint_log_set_updated_at
before update on public.order_handoff_checkpoint_log
for each row execute function public.set_order_handoff_updated_at();

create or replace function public.is_options_handoff_status(p_status text)
returns boolean
language sql
immutable
as $$
  select coalesce(trim(lower(p_status)), '') ~ '(process|dispatch|shipp|in[\s-]?transit|out[\s-]?for[\s-]?delivery|deliver|fulfill|ready|courier|rider)'
$$;

create or replace function public.upsert_order_handoff_event(
  p_order_id text,
  p_handoff_target text,
  p_handed_off_at timestamptz default now(),
  p_source text default 'manual',
  p_note text default '',
  p_business_id text default null,
  p_handed_off_by text default null
)
returns public.order_handoff_events
language plpgsql
security invoker
set search_path = public
as $$
declare
  effective_business_id text;
  effective_handed_off_by text;
  normalized_target text;
  normalized_source text;
  existing_order_id text;
  saved_row public.order_handoff_events;
begin
  normalized_target := lower(trim(coalesce(p_handoff_target, '')));
  if normalized_target not in ('woocommerce', 'options_group') then
    raise exception 'Invalid handoff target.';
  end if;

  normalized_source := lower(trim(coalesce(p_source, 'manual')));
  if normalized_source not in ('manual', 'auto_reference', 'auto_status', 'auto_activity', 'system') then
    raise exception 'Invalid handoff source.';
  end if;

  effective_business_id := nullif(trim(coalesce(p_business_id, '')), '');
  if effective_business_id is null then
    effective_business_id := public.get_user_business_id();
  end if;
  if effective_business_id is null then
    raise exception 'Business ID is required.';
  end if;

  select o.id
    into existing_order_id
  from public.orders o
  where o.business_id = effective_business_id
    and o.id = p_order_id
  limit 1;

  if existing_order_id is null then
    raise exception 'Order not found.';
  end if;

  effective_handed_off_by := nullif(trim(coalesce(p_handed_off_by, '')), '');
  effective_handed_off_by := coalesce(effective_handed_off_by, auth.uid()::text);

  insert into public.order_handoff_events (
    business_id,
    order_id,
    handoff_target,
    handed_off_at,
    handed_off_by,
    source,
    note
  )
  values (
    effective_business_id,
    p_order_id,
    normalized_target,
    coalesce(p_handed_off_at, now()),
    effective_handed_off_by,
    normalized_source,
    coalesce(p_note, '')
  )
  on conflict (business_id, order_id, handoff_target)
  do update
  set
    handed_off_at = least(public.order_handoff_events.handed_off_at, excluded.handed_off_at),
    handed_off_by = coalesce(public.order_handoff_events.handed_off_by, excluded.handed_off_by),
    source = case
      when public.order_handoff_events.source = 'manual' then public.order_handoff_events.source
      else excluded.source
    end,
    note = case
      when coalesce(excluded.note, '') = '' then public.order_handoff_events.note
      else excluded.note
    end,
    updated_at = now()
  returning * into saved_row;

  return saved_row;
end;
$$;

create or replace function public.capture_order_handoff_events_from_order_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_ref text;
  old_ref text;
  new_status text;
  old_status text;
  new_is_options_status boolean;
  old_is_options_status boolean;
  event_timestamp timestamptz;
  actor_user_id text;
begin
  if new.business_id is null or new.id is null then
    return new;
  end if;

  new_ref := nullif(trim(coalesce(new.data->>'websiteOrderReference', '')), '');
  old_ref := case
    when tg_op = 'UPDATE' then nullif(trim(coalesce(old.data->>'websiteOrderReference', '')), '')
    else null
  end;

  new_status := nullif(trim(coalesce(new.data->>'status', '')), '');
  old_status := case
    when tg_op = 'UPDATE' then nullif(trim(coalesce(old.data->>'status', '')), '')
    else null
  end;

  new_is_options_status := public.is_options_handoff_status(new_status);
  old_is_options_status := public.is_options_handoff_status(old_status);

  event_timestamp := coalesce(
    public.try_parse_timestamptz(new.data->>'updatedAt'),
    new.updated_at,
    now()
  );
  actor_user_id := coalesce(auth.uid()::text, nullif(trim(coalesce(new.data->>'updatedBy', '')), ''), 'system:auto');

  if new_ref is not null and old_ref is null then
    perform public.upsert_order_handoff_event(
      p_order_id := new.id,
      p_handoff_target := 'woocommerce',
      p_handed_off_at := event_timestamp,
      p_source := 'auto_reference',
      p_note := 'websiteOrderReference captured automatically.',
      p_business_id := new.business_id,
      p_handed_off_by := actor_user_id
    );
  end if;

  if new_is_options_status and not old_is_options_status then
    perform public.upsert_order_handoff_event(
      p_order_id := new.id,
      p_handoff_target := 'options_group',
      p_handed_off_at := event_timestamp,
      p_source := 'auto_status',
      p_note := format('Status moved into options workflow: %s', coalesce(new_status, 'unknown')),
      p_business_id := new.business_id,
      p_handed_off_by := actor_user_id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists orders_capture_handoff_events on public.orders;
create trigger orders_capture_handoff_events
after insert or update of data on public.orders
for each row execute function public.capture_order_handoff_events_from_order_row();

create or replace view public.order_handoff_order_fact_v1
with (security_invoker = true)
as
with base as (
  select
    o.business_id,
    o.id as order_id,
    o.data,
    coalesce(
      public.try_parse_timestamptz(o.data->>'createdAt'),
      public.try_parse_timestamptz(o.data->>'orderDate'),
      o.created_at
    ) as order_created_at,
    coalesce(
      nullif(trim(o.data->>'status'), ''),
      'Unknown'
    ) as order_status,
    coalesce(cfg.timezone, 'Africa/Lagos') as timezone,
    coalesce(cfg.same_day_cutoff_local, time '16:00') as same_day_cutoff_local,
    coalesce(cfg.overdue_after_hours, 24) as overdue_after_hours,
    coalesce(cfg.require_woocommerce, true) as require_woocommerce,
    coalesce(cfg.require_options_group, true) as require_options_group,
    ev.woocommerce_handoff_at,
    ev.options_group_handoff_at
  from public.orders o
  left join public.order_handoff_sla_config cfg
    on cfg.business_id = o.business_id
  left join lateral (
    select
      max(case when e.handoff_target = 'woocommerce' then e.handed_off_at end) as woocommerce_handoff_at,
      max(case when e.handoff_target = 'options_group' then e.handed_off_at end) as options_group_handoff_at
    from public.order_handoff_events e
    where e.business_id = o.business_id
      and e.order_id = o.id
  ) ev on true
),
computed as (
  select
    b.*,
    (b.order_created_at at time zone b.timezone) as order_created_local_ts,
    case
      when b.require_woocommerce and b.require_options_group then greatest(b.woocommerce_handoff_at, b.options_group_handoff_at)
      when b.require_woocommerce then b.woocommerce_handoff_at
      when b.require_options_group then b.options_group_handoff_at
      else coalesce(b.woocommerce_handoff_at, b.options_group_handoff_at)
    end as required_handoff_at
  from base b
)
select
  c.business_id,
  c.order_id,
  c.order_status,
  c.order_created_at,
  c.order_created_local_ts,
  c.order_created_local_ts::date as order_created_local_date,
  c.timezone,
  c.same_day_cutoff_local,
  c.overdue_after_hours,
  c.require_woocommerce,
  c.require_options_group,
  c.woocommerce_handoff_at,
  c.options_group_handoff_at,
  c.required_handoff_at,
  extract(epoch from (c.woocommerce_handoff_at - c.order_created_at)) / 3600.0 as woocommerce_latency_hours,
  extract(epoch from (c.options_group_handoff_at - c.order_created_at)) / 3600.0 as options_group_latency_hours,
  extract(epoch from (c.required_handoff_at - c.order_created_at)) / 3600.0 as required_handoff_latency_hours,
  (
    c.required_handoff_at is not null
    and (c.required_handoff_at at time zone c.timezone)::date = c.order_created_local_ts::date
    and (c.required_handoff_at at time zone c.timezone)::time <= c.same_day_cutoff_local
  ) as is_on_time_handoff,
  (
    lower(coalesce(c.order_status, '')) ~ '(refund|cancel|void|reject)'
  ) as is_excluded_from_handoff_kpi
from computed c;

create or replace view public.order_handoff_kpi_daily_v1
with (security_invoker = true)
as
select
  f.business_id,
  f.order_created_local_date as kpi_date,
  count(*) filter (where not f.is_excluded_from_handoff_kpi) as eligible_orders,
  count(*) filter (
    where not f.is_excluded_from_handoff_kpi
      and f.required_handoff_at is not null
  ) as handed_off_orders,
  count(*) filter (
    where not f.is_excluded_from_handoff_kpi
      and f.is_on_time_handoff
  ) as on_time_orders,
  round(
    (
      100.0 * count(*) filter (
        where not f.is_excluded_from_handoff_kpi
          and f.is_on_time_handoff
      )::numeric
    ) / nullif(count(*) filter (where not f.is_excluded_from_handoff_kpi), 0),
    2
  ) as on_time_handoff_rate,
  round(
    percentile_cont(0.5) within group (
      order by f.required_handoff_latency_hours
    )::numeric,
    2
  ) as median_required_handoff_latency_hours,
  round(
    percentile_cont(0.5) within group (
      order by f.woocommerce_latency_hours
    )::numeric,
    2
  ) as median_woocommerce_latency_hours,
  round(
    percentile_cont(0.5) within group (
      order by f.options_group_latency_hours
    )::numeric,
    2
  ) as median_options_group_latency_hours,
  count(*) filter (
    where not f.is_excluded_from_handoff_kpi
      and f.required_handoff_at is null
      and now() > f.order_created_at + make_interval(hours => f.overdue_after_hours)
  ) as overdue_backlog_now
from public.order_handoff_order_fact_v1 f
group by f.business_id, f.order_created_local_date;

create or replace view public.order_handoff_overdue_backlog_v1
with (security_invoker = true)
as
select
  f.business_id,
  count(*)::integer as overdue_backlog,
  min(f.order_created_at) as oldest_order_created_at,
  round(max(extract(epoch from (now() - f.order_created_at)) / 3600.0)::numeric, 2) as max_age_hours
from public.order_handoff_order_fact_v1 f
where not f.is_excluded_from_handoff_kpi
  and f.required_handoff_at is null
  and now() > f.order_created_at + make_interval(hours => f.overdue_after_hours)
group by f.business_id;

create or replace view public.order_handoff_checkpoint_weekly_v1
with (security_invoker = true)
as
select
  l.business_id,
  date_trunc('week', l.checkpoint_date::timestamp)::date as week_start_date,
  count(*) filter (where l.checkpoint_type = 'eod') as eod_runs,
  count(*) filter (where l.checkpoint_type = 'eod' and l.triggered) as eod_miss_count,
  round(avg(l.on_time_handoff_rate)::numeric, 2) as avg_on_time_handoff_rate,
  max(l.overdue_backlog) as max_overdue_backlog
from public.order_handoff_checkpoint_log l
group by l.business_id, date_trunc('week', l.checkpoint_date::timestamp)::date;

create or replace function public.run_order_handoff_checkpoint(
  p_business_id text default null,
  p_checkpoint_type text default 'eod',
  p_checkpoint_date date default current_date,
  p_recovery_assignee_user_ids text[] default array[]::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  effective_business_id text;
  checkpoint_type_normalized text;
  eligible_orders_count integer := 0;
  handed_off_orders_count integer := 0;
  on_time_handoff_rate_value numeric := 0;
  median_latency_hours_value numeric := null;
  overdue_backlog_count integer := 0;
  should_trigger boolean := false;
  reason_text text := '';
  actor_user_id text;
  recovery_title text;
  recovery_description text;
  recovery_task_id uuid;
  assignee_user_id text;
  details_payload jsonb;
begin
  checkpoint_type_normalized := lower(trim(coalesce(p_checkpoint_type, 'eod')));
  if checkpoint_type_normalized not in ('midday', 'pre_cutoff', 'eod') then
    raise exception 'Invalid checkpoint type.';
  end if;

  effective_business_id := nullif(trim(coalesce(p_business_id, '')), '');
  if effective_business_id is null then
    effective_business_id := public.get_user_business_id();
  end if;
  if effective_business_id is null then
    raise exception 'Business ID is required.';
  end if;

  actor_user_id := coalesce(auth.uid()::text, 'system:kpi');

  select
    coalesce(k.eligible_orders, 0),
    coalesce(k.handed_off_orders, 0),
    coalesce(k.on_time_handoff_rate, 0),
    k.median_required_handoff_latency_hours
  into
    eligible_orders_count,
    handed_off_orders_count,
    on_time_handoff_rate_value,
    median_latency_hours_value
  from public.order_handoff_kpi_daily_v1 k
  where k.business_id = effective_business_id
    and k.kpi_date = p_checkpoint_date;

  if not found then
    eligible_orders_count := 0;
    handed_off_orders_count := 0;
    on_time_handoff_rate_value := 0;
    median_latency_hours_value := null;
  end if;

  select coalesce(b.overdue_backlog, 0)
    into overdue_backlog_count
  from public.order_handoff_overdue_backlog_v1 b
  where b.business_id = effective_business_id;

  if not found then
    overdue_backlog_count := 0;
  end if;

  if checkpoint_type_normalized = 'eod' then
    should_trigger := (on_time_handoff_rate_value < 100) or (overdue_backlog_count > 0);
    reason_text := concat_ws(
      '; ',
      case when on_time_handoff_rate_value < 100 then format('On-time handoff is %s%%', on_time_handoff_rate_value) end,
      case when overdue_backlog_count > 0 then format('Overdue backlog is %s', overdue_backlog_count) end
    );
  end if;

  if reason_text = '' then
    reason_text := 'SLA checkpoint passed.';
  end if;

  details_payload := jsonb_build_object(
    'eligibleOrders', eligible_orders_count,
    'handedOffOrders', handed_off_orders_count,
    'onTimeHandoffRate', on_time_handoff_rate_value,
    'medianRequiredHandoffLatencyHours', median_latency_hours_value,
    'overdueBacklog', overdue_backlog_count
  );

  if should_trigger
    and to_regclass('public.tasks') is not null
    and to_regclass('public.task_assignees') is not null then
    recovery_title := format('Recovery: order handoff backlog (%s)', p_checkpoint_date);
    recovery_description := format(
      'KPI checkpoint failed for %s. On-time handoff rate: %s%%. Overdue backlog: %s. Clear backlog before end of next business day.',
      p_checkpoint_date,
      on_time_handoff_rate_value,
      overdue_backlog_count
    );

    select t.id
      into recovery_task_id
    from public.tasks t
    where t.business_id = effective_business_id
      and lower(t.title) = lower(recovery_title)
      and t.due_date = p_checkpoint_date + 1
      and t.status <> 'done'
    order by t.created_at desc
    limit 1;

    if recovery_task_id is null then
      insert into public.tasks (
        business_id,
        title,
        description,
        status,
        priority,
        due_date,
        created_by
      )
      values (
        effective_business_id,
        recovery_title,
        recovery_description,
        'todo',
        'high',
        p_checkpoint_date + 1,
        actor_user_id
      )
      returning id into recovery_task_id;

      foreach assignee_user_id in array coalesce(p_recovery_assignee_user_ids, array[]::text[]) loop
        if assignee_user_id is null or trim(assignee_user_id) = '' then
          continue;
        end if;

        insert into public.task_assignees (
          business_id,
          task_id,
          user_id,
          assigned_by
        )
        values (
          effective_business_id,
          recovery_task_id,
          trim(assignee_user_id),
          actor_user_id
        )
        on conflict (task_id, user_id) do nothing;
      end loop;
    end if;
  end if;

  insert into public.order_handoff_checkpoint_log (
    business_id,
    checkpoint_date,
    checkpoint_type,
    eligible_orders,
    handed_off_orders,
    on_time_handoff_rate,
    median_required_handoff_latency_hours,
    overdue_backlog,
    triggered,
    reason,
    recovery_task_id,
    details
  )
  values (
    effective_business_id,
    p_checkpoint_date,
    checkpoint_type_normalized,
    eligible_orders_count,
    handed_off_orders_count,
    on_time_handoff_rate_value,
    median_latency_hours_value,
    overdue_backlog_count,
    should_trigger,
    reason_text,
    recovery_task_id,
    details_payload
  )
  on conflict (business_id, checkpoint_date, checkpoint_type)
  do update
  set
    eligible_orders = excluded.eligible_orders,
    handed_off_orders = excluded.handed_off_orders,
    on_time_handoff_rate = excluded.on_time_handoff_rate,
    median_required_handoff_latency_hours = excluded.median_required_handoff_latency_hours,
    overdue_backlog = excluded.overdue_backlog,
    triggered = excluded.triggered,
    reason = excluded.reason,
    recovery_task_id = excluded.recovery_task_id,
    details = excluded.details,
    updated_at = now();

  return jsonb_build_object(
    'businessId', effective_business_id,
    'checkpointDate', p_checkpoint_date,
    'checkpointType', checkpoint_type_normalized,
    'eligibleOrders', eligible_orders_count,
    'handedOffOrders', handed_off_orders_count,
    'onTimeHandoffRate', on_time_handoff_rate_value,
    'medianRequiredHandoffLatencyHours', median_latency_hours_value,
    'overdueBacklog', overdue_backlog_count,
    'triggered', should_trigger,
    'reason', reason_text,
    'recoveryTaskId', recovery_task_id
  );
end;
$$;

do $$
begin
  begin
    alter publication supabase_realtime add table public.order_handoff_events;
  exception
    when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.order_handoff_checkpoint_log;
  exception
    when duplicate_object then null;
  end;
end $$;

analyze public.order_handoff_sla_config;
analyze public.order_handoff_events;
analyze public.order_handoff_checkpoint_log;
