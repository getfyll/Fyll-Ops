-- Run the four Fyll Store email jobs every 30 minutes instead of every 5, to reduce constant database and edge-function
-- load. Each run only asks "is anything due to send?", and review requests, cart reminders, back-in-stock emails and
-- new-review alerts do not need a 5-minute rhythm.
--
-- The start minutes are staggered so the four jobs no longer all fire at the same moment.
-- This changes the schedule only. The job commands (and the secrets inside them) are left exactly as they are.
-- Safe to run again.

select cron.alter_job(job_id := jobid, schedule := '0,30 * * * *')
from cron.job where jobname = 'notify-new-reviews';

select cron.alter_job(job_id := jobid, schedule := '7,37 * * * *')
from cron.job where jobname = 'send-due-back-in-stock-notifications';

select cron.alter_job(job_id := jobid, schedule := '14,44 * * * *')
from cron.job where jobname = 'send-due-abandoned-cart-recoveries';

select cron.alter_job(job_id := jobid, schedule := '21,51 * * * *')
from cron.job where jobname = 'send-due-review-requests';
