-- Rotate the two Fyll Store email passwords. RUN BY HAND, AFTER 20261101140000_move_cron_secrets_to_vault.sql.
--
-- Why: the old values were shown in a chat log. This replaces them with new random values.
-- Only these two are rotated. CRON_SECRET is left alone because other callers may use it.
--
-- STEPS (do 1 and 3 back to back; in between, the jobs just get "Unauthorized" and try again at their next run):
--   1. Run this whole file in the Supabase SQL editor. It prints nothing sensitive.
--   2. Run this to read the new values (they show only on your screen):
--        select name, decrypted_secret from vault.decrypted_secrets
--        where name in ('fyll_cron_secret', 'reviews_cron_secret');
--   3. Supabase dashboard > Edge Functions > Secrets: set FYLL_CRON_SECRET to the value of fyll_cron_secret,
--      and REVIEWS_CRON_SECRET to the value of reviews_cron_secret.
--   4. If the Fyll Store app or any other service also sends either of these passwords, give it the new value too.

do $$
declare
  v record;
begin
  for v in select id, name from vault.secrets where name in ('fyll_cron_secret', 'reviews_cron_secret') loop
    perform vault.update_secret(v.id, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''));
    raise notice 'rotated %', v.name;
  end loop;

  if not exists (select 1 from vault.secrets where name = 'fyll_cron_secret')
     or not exists (select 1 from vault.secrets where name = 'reviews_cron_secret') then
    raise exception 'Vault secrets not found. Run 20261101140000_move_cron_secrets_to_vault.sql first.';
  end if;
end;
$$;
