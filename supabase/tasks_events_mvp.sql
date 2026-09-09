-- ==================================================================
-- FYLL TASKS + EVENTS MVP
-- ==================================================================
-- Incremental migration for task/event support on top of tasks_mvp.sql.
-- Safe to run multiple times.
-- ==================================================================

alter table public.tasks
  add column if not exists item_type text not null default 'task';

alter table public.tasks
  add column if not exists starts_at timestamptz;

alter table public.tasks
  add column if not exists ends_at timestamptz;

alter table public.tasks
  add column if not exists location text;

alter table public.tasks
  add column if not exists meeting_link text;

update public.tasks
set item_type = 'task'
where item_type is null
   or trim(item_type) = '';

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
      and pg_get_constraintdef(c.oid) ilike '%item_type%'
  loop
    execute format('alter table public.tasks drop constraint if exists %I', constraint_record.conname);
  end loop;
end $$;

alter table public.tasks
  add constraint tasks_item_type_check
  check (item_type in ('task', 'event'));

create index if not exists tasks_business_item_type_due_idx
  on public.tasks (business_id, item_type, due_date asc nulls last, updated_at desc);

analyze public.tasks;
