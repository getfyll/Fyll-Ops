-- ==================================================================
-- DELIVERY FOLLOW-UP EMAILS — DAILY CRON JOB
-- ==================================================================
-- Sends delivery confirmation emails for dispatched orders after each
-- business's configured follow-up delay.
--
-- BEFORE RUNNING:
--   1. In Supabase Edge Functions -> send-delivery-followup -> Secrets,
--      add:
--        CRON_SECRET=<your-secret>
--        APP_BASE_URL=<your-fyll-web-app-url>
--        RESEND_API_KEY=<your-resend-key>
--        RESEND_FROM_EMAIL=<your-from-address>
--
--   2. Replace the placeholder bearer token below with that CRON_SECRET.
--
--   3. Run this file in the Supabase SQL editor.
-- ==================================================================

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.unschedule('fyll-delivery-followups') where exists (
  select 1 from cron.job where jobname = 'fyll-delivery-followups'
);

select cron.schedule(
  'fyll-delivery-followups',
  '0 9 * * *',
  $$
  select net.http_post(
    url        := 'https://pmqmefvzgmlxxbgicdpi.supabase.co/functions/v1/send-delivery-followup',
    headers    := jsonb_build_object(
                    'Content-Type',  'application/json',
                    'Authorization', 'Bearer replace-me-with-your-cron-secret'
                  ),
    body       := '{"type":"delivery_followup_all"}'::jsonb,
    timeout_milliseconds := 30000
  )
  $$
);

select jobname, schedule, command from cron.job where jobname = 'fyll-delivery-followups';
