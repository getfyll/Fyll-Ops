-- ==================================================================
-- TASK DUE REMINDERS — DAILY CRON JOB
-- ==================================================================
-- Sends overdue/due-today push notifications to task assignees
-- every morning at 7:00 AM UTC (automatically, no user needed).
--
-- BEFORE RUNNING:
--   1. Go to Supabase Dashboard → Edge Functions → send-thread-notification
--      → Secrets → add secret: CRON_SECRET = <your-secret-value>
--      Use any long random string, e.g. from: openssl rand -hex 32
--
--   2. Replace c39eabc8b436342f163f8c4461de14e1f50accab1f45ce1b1848f8ec002f2acf below with that same value.
--
--   3. Run this file in Supabase SQL Editor.
-- ==================================================================

-- Enable required extensions (safe to run even if already enabled)
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Remove any existing schedule with this name before recreating
select cron.unschedule('fyll-task-due-reminders') where exists (
  select 1 from cron.job where jobname = 'fyll-task-due-reminders'
);

-- Schedule: every day at 7:00 AM UTC
select cron.schedule(
  'fyll-task-due-reminders',
  '0 7 * * *',
  $$
  select net.http_post(
    url        := 'https://pmqmefvzgmlxxbgicdpi.supabase.co/functions/v1/send-thread-notification',
    headers    := jsonb_build_object(
                    'Content-Type',  'application/json',
                    'Authorization', 'Bearer c39eabc8b436342f163f8c4461de14e1f50accab1f45ce1b1848f8ec002f2acf'
                  ),
    body       := '{"type":"task_due_reminders_all"}'::jsonb,
    timeout_milliseconds := 30000
  )
  $$
);

-- Verify the schedule was created
select jobname, schedule, command from cron.job where jobname = 'fyll-task-due-reminders';
