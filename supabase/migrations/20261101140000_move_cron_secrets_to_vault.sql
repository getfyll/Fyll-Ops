-- Move the passwords out of the scheduled-job definitions and into Supabase Vault.
--
-- The jobs below carried their passwords as readable text inside cron.job, where anyone who can see the job list
-- (or a log of it) can read them. This stores each value in Vault and rewrites the job so it reads the value from
-- Vault each time it runs, the same way the payment and order notification triggers already do.
--
-- This changes NO behaviour: every job keeps sending the exact same value it sends today. It never prints a secret.
-- Safe to run again: jobs that already read from Vault are skipped.
--
--   job                                     header                    vault secret
--   notify-new-reviews                      x-reviews-cron-secret     reviews_cron_secret
--   send-due-back-in-stock-notifications    x-fyll-cron-secret        fyll_cron_secret
--   send-due-abandoned-cart-recoveries      x-fyll-cron-secret        fyll_cron_secret
--   send-due-review-requests                x-fyll-cron-secret        fyll_cron_secret
--   fyll-delivery-followups                 Authorization (Bearer)    cron_secret               (= CRON_SECRET)
--   fyll-task-due-reminders                 Authorization (Bearer)    task_reminders_legacy_token

do $$
declare
  m record;
  job_row record;
  cmd text;
  token_match text[];
  existing text;
  header_re text;
  value_re text;
  vault_ref text;
  replacement text;
  moved integer := 0;
begin
  for m in
    select * from (values
      ('notify-new-reviews',                     'x-reviews-cron-secret', 'reviews_cron_secret',        ''),
      ('send-due-back-in-stock-notifications',   'x-fyll-cron-secret',    'fyll_cron_secret',           ''),
      ('send-due-abandoned-cart-recoveries',     'x-fyll-cron-secret',    'fyll_cron_secret',           ''),
      ('send-due-review-requests',               'x-fyll-cron-secret',    'fyll_cron_secret',           ''),
      ('fyll-delivery-followups',                'Authorization',         'cron_secret',                'Bearer '),
      ('fyll-task-due-reminders',                'Authorization',         'task_reminders_legacy_token','Bearer ')
    ) as t(jobname, header_name, vault_name, prefix)
  loop
    select jobid, command into job_row from cron.job where jobname = m.jobname;
    if not found then
      raise notice 'job % not found, skipped', m.jobname;
      continue;
    end if;
    cmd := job_row.command;

    -- 'Header', 'value'   or   'Authorization', 'Bearer value'
    header_re := '''' || m.header_name || '''\s*,\s*';
    value_re  := case when m.prefix = '' then '' else 'Bearer\s+' end || '([^'']+)';
    token_match := regexp_match(cmd, header_re || '''' || value_re || '''');

    if token_match is null then
      raise notice 'job % already reads from Vault (or has no matching header), skipped', m.jobname;
      continue;
    end if;

    select decrypted_secret into existing from vault.decrypted_secrets where name = m.vault_name;
    if existing is null then
      perform vault.create_secret(token_match[1], m.vault_name, 'Password used by the scheduled job ' || m.jobname);
    elsif existing is distinct from token_match[1] then
      raise exception 'Vault secret % already exists with a different value; resolve this before moving job %', m.vault_name, m.jobname;
    end if;

    vault_ref := '(select decrypted_secret from vault.decrypted_secrets where name = ''' || m.vault_name || ''' limit 1)';
    replacement := '\1' || case when m.prefix = '' then vault_ref else '''Bearer '' || ' || vault_ref end;

    cmd := regexp_replace(cmd, '(' || header_re || ')''' || value_re || '''', replacement);

    if cmd is distinct from job_row.command then
      perform cron.alter_job(job_id := job_row.jobid, command := cmd);
      moved := moved + 1;
      raise notice 'job % now reads its password from Vault secret %', m.jobname, m.vault_name;
    end if;
  end loop;

  raise notice 'jobs updated: %', moved;
end;
$$;
