-- ==================================================================
-- FYLL TASKS + EVENTS TIMEZONE MVP
-- ==================================================================
-- Adds timezone support for task events.
-- Safe to run multiple times.
-- ==================================================================

alter table public.tasks
  add column if not exists event_timezone text;

create index if not exists tasks_business_event_timezone_idx
  on public.tasks (business_id, event_timezone);

analyze public.tasks;
