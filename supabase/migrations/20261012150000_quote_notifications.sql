-- Push + in-app notifications for quote events: the customer accepts, asks for changes, declines or
-- uploads their deposit proof. Same path as payment notifications: a trigger calls the
-- send-thread-notification Edge Function, which saves an in-app notification for each team member
-- and sends the push.
--
-- The bearer secret is read from Supabase Vault (secret name: quote_notify_secret) instead of being
-- written into this file. It must equal the QUOTE_NOTIFY_SECRET Edge Function secret, which can only
-- trigger quote notifications. Store it once with:
--   select vault.create_secret('<the QUOTE_NOTIFY_SECRET value>', 'quote_notify_secret');
-- Until it exists the trigger quietly does nothing.

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_quote_update()
returns trigger
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  secret text;
begin
  begin
    select decrypted_secret into secret
    from vault.decrypted_secrets
    where name = 'quote_notify_secret'
    limit 1;

    if secret is null or secret = '' then
      return new;
    end if;

    perform net.http_post(
      url     := 'https://pmqmefvzgmlxxbgicdpi.supabase.co/functions/v1/send-thread-notification',
      headers := jsonb_build_object(
                   'Content-Type',  'application/json',
                   'Authorization', 'Bearer ' || secret
                 ),
      body    := jsonb_build_object(
                   'type', 'quote_update',
                   'businessId', new.business_id,
                   'quoteId', new.id,
                   'quoteNumber', new.data->>'quoteNumber',
                   'customerName', new.data->>'customerName',
                   'total', coalesce(new.data->>'total', '0'),
                   'depositAmount', coalesce(new.data->>'depositAmount', '0'),
                   'status', new.data->>'status',
                   'message', new.data->'changesRequest'->>'message',
                   'reason', new.data->>'declineReason'
                 ),
      timeout_milliseconds := 10000
    );
  exception when others then
    -- A failed notification must never block the customer's quote action.
    null;
  end;
  return new;
end;
$$;

drop trigger if exists quote_update_notification_trigger on public.quotes;

create trigger quote_update_notification_trigger
  after update on public.quotes
  for each row
  when (
    old.data->>'status' is distinct from new.data->>'status'
    and new.data->>'status' in ('accepted', 'changes_requested', 'declined', 'proof_submitted')
  )
  execute function public.notify_quote_update();
