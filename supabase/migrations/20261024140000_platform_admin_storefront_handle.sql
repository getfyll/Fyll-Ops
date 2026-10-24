-- Fyll console: platform admins can read and change a business's storefront handle on its own
-- (businesses cannot change it themselves — they send a request, and an admin applies it here).
-- Changing it moves the storefront address (<handle>.fyll.store), so links already shared under the
-- old handle stop working. The handle must not already be used by another business.

create or replace function public.platform_admin_get_business_handles(
  business_id_input text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  business_row public.businesses%rowtype;
  display_name text;
begin
  if not public.is_platform_admin() then
    raise exception 'Platform admin access required';
  end if;

  select * into business_row from public.businesses where id::text = trim(coalesce(business_id_input, ''));
  if not found then
    raise exception 'Business not found';
  end if;

  display_name := coalesce(nullif(trim(coalesce(business_row.data->>'businessName', '')), ''), business_row.name, '');

  -- Same fallback the main app uses when no handle has been saved: the name, letters and digits only.
  return jsonb_build_object(
    'business_slug', coalesce(
      nullif(regexp_replace(lower(coalesce(business_row.data->>'businessSlug', '')), '[^a-z0-9]+', '', 'g'), ''),
      regexp_replace(lower(display_name), '[^a-z0-9]+', '', 'g')
    ),
    'storefront_slug', coalesce(
      nullif(regexp_replace(lower(coalesce(business_row.data->>'storefrontSlug', '')), '[^a-z0-9]+', '', 'g'), ''),
      regexp_replace(lower(display_name), '[^a-z0-9]+', '', 'g')
    )
  );
end;
$$;

create or replace function public.platform_admin_update_storefront_handle(
  business_id_input text,
  handle_input text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_business_id text := trim(coalesce(business_id_input, ''));
  next_handle text := regexp_replace(lower(trim(coalesce(handle_input, ''))), '[^a-z0-9]+', '', 'g');
begin
  if not public.is_platform_admin() then
    raise exception 'Platform admin access required';
  end if;

  if next_handle = '' then
    raise exception 'Handle needs at least one letter or number';
  end if;
  if char_length(next_handle) > 60 then
    raise exception 'Handle must be 60 characters or fewer';
  end if;

  if not exists (select 1 from public.businesses where id::text = normalized_business_id) then
    raise exception 'Business not found';
  end if;

  if exists (
    select 1
    from public.businesses other
    where other.id::text <> normalized_business_id
      and next_handle in (
        regexp_replace(lower(coalesce(other.data->>'storefrontSlug', '')), '[^a-z0-9]+', '', 'g'),
        regexp_replace(lower(coalesce(other.data->>'businessSlug', '')), '[^a-z0-9]+', '', 'g'),
        regexp_replace(lower(coalesce(nullif(trim(coalesce(other.data->>'businessName', '')), ''), other.name, '')), '[^a-z0-9]+', '', 'g')
      )
  ) then
    raise exception 'Another business already uses that handle. Choose a different one.';
  end if;

  update public.businesses
  set data = coalesce(data, '{}'::jsonb) || jsonb_build_object('storefrontSlug', next_handle)
  where id::text = normalized_business_id;

  return jsonb_build_object('storefront_slug', next_handle);
end;
$$;

grant execute on function public.platform_admin_get_business_handles(text) to authenticated;
grant execute on function public.platform_admin_update_storefront_handle(text, text) to authenticated;
