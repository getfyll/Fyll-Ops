-- ==================================================================
-- FYLL TASKS MVP
-- ==================================================================
-- Lightweight internal task management with assignees, priorities,
-- recurring tasks, and task-specific collaboration threads.
-- Run after collaboration_streams.sql.
-- Safe to run multiple times.
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

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  business_id text not null,
  title text not null check (char_length(trim(title)) between 1 and 140),
  description text not null default '',
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  due_date date,
  created_by text not null,
  completed_at timestamptz,
  completed_by text,
  last_updated_by text,
  recurrence_frequency text check (
    recurrence_frequency is null
    or lower(replace(recurrence_frequency, '-', '_')) in ('daily', 'weekly', 'bi_weekly', 'monthly', 'quarterly', 'yearly')
  ),
  recurrence_interval integer not null default 1 check (recurrence_interval >= 1 and recurrence_interval <= 12),
  recurrence_group_id uuid,
  recurrence_generated_at timestamptz,
  source_task_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_id),
  constraint tasks_source_task_fk
    foreign key (source_task_id)
    references public.tasks(id)
    on delete set null
);

alter table public.tasks
  add column if not exists completed_by text;

alter table public.tasks
  add column if not exists last_updated_by text;

update public.tasks
set
  last_updated_by = coalesce(last_updated_by, created_by),
  completed_by = case
    when status = 'done' and completed_at is not null then coalesce(completed_by, last_updated_by, created_by)
    else completed_by
  end
where last_updated_by is null
  or (status = 'done' and completed_at is not null and completed_by is null);

create table if not exists public.task_assignees (
  id uuid primary key default gen_random_uuid(),
  business_id text not null,
  task_id uuid not null,
  user_id text not null,
  assigned_by text not null,
  created_at timestamptz not null default now(),
  unique (task_id, user_id),
  constraint task_assignees_task_fk
    foreign key (task_id, business_id)
    references public.tasks(id, business_id)
    on delete cascade
);

-- One row per user/task/day reminder already sent.
create table if not exists public.task_due_reminder_log (
  id uuid primary key default gen_random_uuid(),
  business_id text not null,
  task_id uuid not null,
  user_id text not null,
  reminder_date date not null,
  created_at timestamptz not null default now(),
  unique (business_id, task_id, user_id, reminder_date),
  constraint task_due_reminder_log_task_fk
    foreign key (task_id, business_id)
    references public.tasks(id, business_id)
    on delete cascade
);

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'tasks'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%recurrence_frequency%'
  loop
    execute format('alter table public.tasks drop constraint if exists %I', constraint_record.conname);
  end loop;
end $$;

alter table public.tasks
  add constraint tasks_recurrence_frequency_check
  check (
    recurrence_frequency is null
    or lower(replace(recurrence_frequency, '-', '_')) in ('daily', 'weekly', 'bi_weekly', 'monthly', 'quarterly', 'yearly')
  );

create index if not exists tasks_business_status_due_idx
  on public.tasks (business_id, status, due_date asc nulls last, updated_at desc);

create index if not exists tasks_business_recurring_idx
  on public.tasks (business_id, recurrence_frequency, recurrence_generated_at);

create index if not exists task_assignees_business_user_idx
  on public.task_assignees (business_id, user_id, created_at desc);

create index if not exists task_assignees_task_idx
  on public.task_assignees (task_id, created_at asc);

create index if not exists task_due_reminder_log_business_date_idx
  on public.task_due_reminder_log (business_id, reminder_date desc);

create index if not exists task_due_reminder_log_user_date_idx
  on public.task_due_reminder_log (user_id, reminder_date desc);

alter table public.tasks enable row level security;
alter table public.task_assignees enable row level security;
alter table public.task_due_reminder_log enable row level security;

drop policy if exists tasks_select_v1 on public.tasks;
drop policy if exists tasks_insert_v1 on public.tasks;
drop policy if exists tasks_update_v1 on public.tasks;
drop policy if exists tasks_delete_v1 on public.tasks;

create policy tasks_select_v1
  on public.tasks for select
  using (business_id = public.get_user_business_id());

create policy tasks_insert_v1
  on public.tasks for insert
  with check (
    business_id = public.get_user_business_id()
    and created_by = auth.uid()::text
  );

create policy tasks_update_v1
  on public.tasks for update
  using (business_id = public.get_user_business_id());

create policy tasks_delete_v1
  on public.tasks for delete
  using (business_id = public.get_user_business_id());

drop policy if exists task_assignees_select_v1 on public.task_assignees;
drop policy if exists task_assignees_insert_v1 on public.task_assignees;
drop policy if exists task_assignees_delete_v1 on public.task_assignees;

create policy task_assignees_select_v1
  on public.task_assignees for select
  using (business_id = public.get_user_business_id());

create policy task_assignees_insert_v1
  on public.task_assignees for insert
  with check (
    business_id = public.get_user_business_id()
    and assigned_by = auth.uid()::text
  );

create policy task_assignees_delete_v1
  on public.task_assignees for delete
  using (business_id = public.get_user_business_id());

drop policy if exists task_due_reminder_log_select_v1 on public.task_due_reminder_log;
drop policy if exists task_due_reminder_log_insert_v1 on public.task_due_reminder_log;
drop policy if exists task_due_reminder_log_delete_v1 on public.task_due_reminder_log;

create policy task_due_reminder_log_select_v1
  on public.task_due_reminder_log for select
  using (business_id = public.get_user_business_id());

create or replace function public.set_tasks_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  actor_user_id text;
begin
  actor_user_id := coalesce(
    auth.uid()::text,
    nullif(trim(coalesce(new.last_updated_by, '')), ''),
    nullif(trim(coalesce(old.last_updated_by, '')), ''),
    old.created_by
  );

  if new.status = 'done'
    and old.status is distinct from 'done' then
    new.completed_at = coalesce(new.completed_at, now());
    new.completed_by = coalesce(nullif(trim(coalesce(new.completed_by, '')), ''), actor_user_id);
  elsif old.status = 'done'
    and new.status is distinct from 'done' then
    new.completed_at = null;
    new.completed_by = null;
  end if;

  new.last_updated_by = actor_user_id;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
before update on public.tasks
for each row execute function public.set_tasks_updated_at();

alter table public.collaboration_threads
  drop constraint if exists collaboration_threads_entity_type_check;

alter table public.collaboration_threads
  add constraint collaboration_threads_entity_type_check
  check (entity_type in ('order', 'case', 'task'));

create or replace function public.create_task_with_assignees(
  p_business_id text,
  p_title text,
  p_description text,
  p_priority text,
  p_due_date date,
  p_recurrence_frequency text,
  p_recurrence_interval integer,
  p_assignee_user_ids text[]
)
returns public.tasks
language plpgsql
security invoker
set search_path = public
as $$
declare
  inserted_task public.tasks;
  current_user_id text;
  assignee_user_id text;
  normalized_assignees text[];
  effective_priority text;
  effective_recurrence_frequency text;
  effective_recurrence_interval integer;
begin
  if auth.uid() is null then
    raise exception 'No authenticated user.';
  end if;

  current_user_id := auth.uid()::text;

  if p_business_id is null or trim(p_business_id) = '' then
    raise exception 'Business ID is required.';
  end if;

  if p_title is null or char_length(trim(p_title)) = 0 then
    raise exception 'Task title is required.';
  end if;

  effective_priority := lower(coalesce(trim(p_priority), 'medium'));
  if effective_priority not in ('low', 'medium', 'high', 'urgent') then
    raise exception 'Invalid task priority.';
  end if;

  effective_recurrence_frequency := nullif(lower(coalesce(trim(p_recurrence_frequency), '')), '');
  if effective_recurrence_frequency is not null then
    effective_recurrence_frequency := replace(effective_recurrence_frequency, '-', '_');
  end if;
  if effective_recurrence_frequency is not null and effective_recurrence_frequency not in ('daily', 'weekly', 'bi_weekly', 'monthly', 'quarterly', 'yearly') then
    raise exception 'Invalid recurrence frequency.';
  end if;

  effective_recurrence_interval := greatest(coalesce(p_recurrence_interval, 1), 1);

  normalized_assignees := array(
    select distinct trim(value)
    from unnest(coalesce(p_assignee_user_ids, array[]::text[])) as value
    where trim(value) <> ''
  );

  insert into public.tasks (
    business_id,
    title,
    description,
    priority,
    due_date,
    created_by,
    recurrence_frequency,
    recurrence_interval,
    recurrence_group_id
  )
  values (
    p_business_id,
    trim(p_title),
    coalesce(trim(p_description), ''),
    effective_priority,
    p_due_date,
    current_user_id,
    effective_recurrence_frequency,
    effective_recurrence_interval,
    case when effective_recurrence_frequency is null then null else gen_random_uuid() end
  )
  returning * into inserted_task;

  foreach assignee_user_id in array normalized_assignees loop
    insert into public.task_assignees (
      business_id,
      task_id,
      user_id,
      assigned_by
    )
    values (
      p_business_id,
      inserted_task.id,
      assignee_user_id,
      current_user_id
    )
    on conflict (task_id, user_id) do nothing;
  end loop;

  return inserted_task;
end;
$$;

create or replace function public.spawn_next_recurring_task(
  p_task_id uuid,
  p_actor_user_id text default null
)
returns public.tasks
language plpgsql
security invoker
set search_path = public
as $$
declare
  source_task public.tasks;
  next_due_date date;
  spawned_task public.tasks;
  assignee_record record;
  actor_user_id text;
begin
  select *
    into source_task
  from public.tasks
  where id = p_task_id
  for update;

  if source_task.id is null then
    return null;
  end if;

  if source_task.status <> 'done' then
    return null;
  end if;

  if source_task.recurrence_frequency is null or source_task.recurrence_generated_at is not null then
    return null;
  end if;

  actor_user_id := nullif(trim(coalesce(p_actor_user_id, '')), '');
  actor_user_id := coalesce(actor_user_id, auth.uid()::text, source_task.created_by);

  next_due_date := case
    when source_task.due_date is null then null
    when source_task.recurrence_frequency = 'daily' then source_task.due_date + make_interval(days => source_task.recurrence_interval)
    when source_task.recurrence_frequency = 'weekly' then source_task.due_date + make_interval(days => 7 * source_task.recurrence_interval)
    when source_task.recurrence_frequency = 'bi_weekly' then source_task.due_date + make_interval(days => 14 * source_task.recurrence_interval)
    when source_task.recurrence_frequency = 'monthly' then source_task.due_date + make_interval(months => source_task.recurrence_interval)
    when source_task.recurrence_frequency = 'quarterly' then source_task.due_date + make_interval(months => 3 * source_task.recurrence_interval)
    when source_task.recurrence_frequency = 'yearly' then source_task.due_date + make_interval(years => source_task.recurrence_interval)
    else source_task.due_date
  end;

  insert into public.tasks (
    business_id,
    title,
    description,
    status,
    priority,
    due_date,
    created_by,
    recurrence_frequency,
    recurrence_interval,
    recurrence_group_id,
    source_task_id
  )
  values (
    source_task.business_id,
    source_task.title,
    source_task.description,
    'todo',
    source_task.priority,
    next_due_date,
    actor_user_id,
    source_task.recurrence_frequency,
    source_task.recurrence_interval,
    coalesce(source_task.recurrence_group_id, gen_random_uuid()),
    source_task.id
  )
  returning * into spawned_task;

  for assignee_record in
    select user_id
    from public.task_assignees
    where task_id = source_task.id
  loop
    insert into public.task_assignees (
      business_id,
      task_id,
      user_id,
      assigned_by
    )
    values (
      source_task.business_id,
      spawned_task.id,
      assignee_record.user_id,
      actor_user_id
    )
    on conflict (task_id, user_id) do nothing;
  end loop;

  update public.tasks
  set recurrence_generated_at = now()
  where id = source_task.id
    and recurrence_generated_at is null;

  return spawned_task;
end;
$$;

create or replace function public.tasks_spawn_next_on_done()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform public.spawn_next_recurring_task(new.id, auth.uid()::text);
  return new;
end;
$$;

drop trigger if exists tasks_spawn_next_on_done on public.tasks;
create trigger tasks_spawn_next_on_done
after update of status on public.tasks
for each row
when (new.status = 'done' and old.status is distinct from new.status)
execute function public.tasks_spawn_next_on_done();

create or replace function public.complete_task_and_spawn_next(
  p_task_id uuid
)
returns public.tasks
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id text;
  source_task public.tasks;
  spawned_task public.tasks;
begin
  if auth.uid() is null then
    raise exception 'No authenticated user.';
  end if;

  current_user_id := auth.uid()::text;

  select *
    into source_task
  from public.tasks
  where id = p_task_id
    and business_id = public.get_user_business_id()
  limit 1;

  if source_task.id is null then
    raise exception 'Task not found.';
  end if;

  update public.tasks
  set
    status = 'done',
    completed_at = coalesce(completed_at, now())
  where id = source_task.id;

  select *
    into spawned_task
  from public.spawn_next_recurring_task(source_task.id, current_user_id);

  if spawned_task.id is null then
    return (
      select t
      from public.tasks t
      where t.id = source_task.id
    );
  end if;

  return spawned_task;
end;
$$;

do $$
begin
  begin
    alter publication supabase_realtime add table public.tasks;
  exception
    when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.task_assignees;
  exception
    when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.task_due_reminder_log;
  exception
    when duplicate_object then null;
  end;
end $$;

analyze public.tasks;
analyze public.task_assignees;
analyze public.task_due_reminder_log;
