-- Keep every Fyll-owned public address on the same business username.
--
-- data.businessSlug drives tracking, returns, delivery confirmation, quotes,
-- and payment/checkout links. data.storefrontSlug drives fyll.store URLs.
-- Previously, changing the storefront handle in the platform console only
-- updated storefrontSlug, so the other public links kept the old username.

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
    raise exception 'Username needs at least one letter or number';
  end if;
  if char_length(next_handle) > 60 then
    raise exception 'Username must be 60 characters or fewer';
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
    raise exception 'Another business already uses that username. Choose a different one.';
  end if;

  update public.businesses
  set data = coalesce(data, '{}'::jsonb) || jsonb_build_object(
    'businessSlug', next_handle,
    'storefrontSlug', next_handle
  )
  where id::text = normalized_business_id;

  return jsonb_build_object(
    'business_slug', next_handle,
    'storefront_slug', next_handle,
    'addresses_changed', true
  );
end;
$$;

grant execute on function public.platform_admin_update_storefront_handle(text, text) to authenticated;
