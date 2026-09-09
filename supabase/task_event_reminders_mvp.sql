-- ==================================================================
-- FYLL TASK EVENT REMINDERS MVP
-- ==================================================================
-- Adds dedupe storage for event reminder notifications.
-- Safe to run multiple times.
-- ==================================================================

create table if not exists public.task_event_reminder_log (
  id uuid primary key default gen_random_uuid(),
  business_id text not null,
  task_id uuid not null,
  user_id text not null,
  reminder_key text not null,
  created_at timestamptz not null default now(),
  unique (business_id, task_id, user_id, reminder_key),
  constraint task_event_reminder_log_task_fk
    foreign key (task_id, business_id)
    references public.tasks(id, business_id)
    on delete cascade
);

create index if not exists task_event_reminder_log_business_idx
  on public.task_event_reminder_log (business_id, created_at desc);

create index if not exists task_event_reminder_log_task_idx
  on public.task_event_reminder_log (task_id, created_at desc);

alter table public.task_event_reminder_log enable row level security;

analyze public.task_event_reminder_log;
