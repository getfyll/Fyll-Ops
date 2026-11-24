-- Newsletter sign-ups from fyll.app (footer "Get product updates from Fyll").
--
-- The public website can only ADD an email, through subscribe_newsletter(). Nobody can read,
-- change or delete the list through the API: there are no policies on the table, so only the
-- Supabase dashboard (and service role) sees it. Export it from Table Editor > newsletter_subscribers.

create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  source text not null default 'fyll.app',
  created_at timestamptz not null default now()
);

create unique index if not exists newsletter_subscribers_email_key
  on public.newsletter_subscribers (lower(email));

alter table public.newsletter_subscribers enable row level security;
revoke all on public.newsletter_subscribers from anon, authenticated;

create or replace function public.subscribe_newsletter(email_input text, source_input text default 'fyll.app')
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_email text := lower(trim(coalesce(email_input, '')));
  clean_source text := left(trim(coalesce(nullif(source_input, ''), 'fyll.app')), 60);
  recent_count integer;
begin
  if char_length(clean_email) > 254 or clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_email');
  end if;

  -- Light guard against a script flooding the list.
  select count(*) into recent_count
  from public.newsletter_subscribers
  where created_at > now() - interval '10 minutes';
  if recent_count >= 200 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  insert into public.newsletter_subscribers (email, source)
  values (clean_email, clean_source)
  on conflict ((lower(email))) do nothing;

  -- Same answer whether they were new or already on the list, so the list can't be probed.
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.subscribe_newsletter(text, text) from public;
grant execute on function public.subscribe_newsletter(text, text) to anon, authenticated;
