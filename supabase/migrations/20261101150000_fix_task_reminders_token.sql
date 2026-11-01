-- Repair the daily task reminders job (fyll-task-due-reminders, 07:00).
--
-- Its password does not match any current secret. The send-thread-notification function only accepts the project's
-- CRON_SECRET for scheduled calls, so this job's calls are very likely being rejected as "Unauthorized", which means
-- task due-date reminders are not being sent.
--
-- fyll-delivery-followups already sends the correct CRON_SECRET. After 20261101140000_move_cron_secrets_to_vault.sql
-- that value sits in Vault as "cron_secret", so this points the reminders job at it.
--
-- NOTE: this makes the reminders start working, so people may begin receiving task due reminders at 07:00 again.
-- Run it only after the Vault migration. Safe to run again.

do $$
declare
  job_row record;
  cmd text;
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'cron_secret') then
    raise exception 'Vault secret cron_secret not found. Run 20261101140000_move_cron_secrets_to_vault.sql first.';
  end if;

  select jobid, command into job_row from cron.job where jobname = 'fyll-task-due-reminders';
  if not found then
    raise notice 'fyll-task-due-reminders not found, nothing to do';
    return;
  end if;

  cmd := regexp_replace(job_row.command, 'name = ''task_reminders_legacy_token''', 'name = ''cron_secret''');

  if cmd is distinct from job_row.command then
    perform cron.alter_job(job_id := job_row.jobid, command := cmd);
    raise notice 'fyll-task-due-reminders now uses cron_secret';
  else
    raise notice 'fyll-task-due-reminders already uses cron_secret, nothing to do';
  end if;
end;
$$;
