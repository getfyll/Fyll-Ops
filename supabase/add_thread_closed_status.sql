-- ============================================================
-- Add closed status to collaboration_threads
-- Run in Supabase SQL Editor. Safe to run multiple times.
-- ============================================================

alter table public.collaboration_threads
  add column if not exists is_closed boolean not null default false,
  add column if not exists closed_by text,
  add column if not exists closed_at timestamptz;

-- Index for listing open/closed threads
create index if not exists collaboration_threads_is_closed_idx
  on public.collaboration_threads (business_id, is_closed);
