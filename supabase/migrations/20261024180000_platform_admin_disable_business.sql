-- Fyll console: platform admins can disable a business (suspend it) and turn it back on.
-- Disabling does not delete anything: all data stays, and enabling restores access exactly as it was.
-- The main app checks businesses.data->>'disabled' and shows a "This account has been disabled" screen
-- to everyone signed in to that business.

create or replace function public.platform_admin_set_business_disabled(
  business_id_input text,
  disabled_input boolean,
  reason_input text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_business_id text := trim(coalesce(business_id_input, ''));
  business_row public.businesses%rowtype;
  clean_reason text := nullif(left(trim(coalesce(reason_input, '')), 300), '');
begin
  if not public.is_platform_admin() then
    raise exception 'Platform admin access required';
  end if;

  select * into business_row from public.businesses where id::text = normalized_business_id;
  if not found then
    raise exception 'Business not found';
  end if;

  if disabled_input and business_row.owner_id::text = auth.uid()::text then
    raise exception 'You cannot disable your own business.';
  end if;

  if disabled_input then
    update public.businesses
    set data = coalesce(data, '{}'::jsonb) || jsonb_build_object(
      'disabled', true,
      'disabledAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'disabledReason', coalesce(clean_reason, '')
    )
    where id::text = normalized_business_id;
  else
    update public.businesses
    set data = coalesce(data, '{}'::jsonb) - 'disabled' - 'disabledAt' - 'disabledReason'
    where id::text = normalized_business_id;
  end if;

  return jsonb_build_object('business_id', normalized_business_id, 'disabled', disabled_input);
end;
$$;

-- Which businesses are disabled right now (for the console list and filter).
create or replace function public.platform_admin_list_disabled_businesses()
returns table (business_id text, disabled_reason text, disabled_at text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select b.id::text, coalesce(b.data->>'disabledReason', ''), coalesce(b.data->>'disabledAt', '')
  from public.businesses b
  where public.is_platform_admin()
    and b.data->>'disabled' = 'true';
$$;

grant execute on function public.platform_admin_set_business_disabled(text, boolean, text) to authenticated;
grant execute on function public.platform_admin_list_disabled_businesses() to authenticated;
