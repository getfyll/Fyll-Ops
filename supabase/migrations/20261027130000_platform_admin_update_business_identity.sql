-- Update every editable business identity field atomically from the platform console.
-- The public username is the explicit source of truth for all Fyll-owned customer URLs;
-- changing a display name no longer changes an address behind the admin's back.

create or replace function public.platform_admin_update_business_identity(
  business_id_input text,
  business_name_input text,
  company_name_input text,
  public_username_input text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_business_id text := trim(coalesce(business_id_input, ''));
  next_business_name text := regexp_replace(trim(coalesce(business_name_input, '')), '\s+', ' ', 'g');
  next_company_name text := regexp_replace(trim(coalesce(company_name_input, '')), '\s+', ' ', 'g');
  next_username text := regexp_replace(lower(trim(coalesce(public_username_input, ''))), '[^a-z0-9]+', '', 'g');
  next_name_slug text;
  business_row public.businesses%rowtype;
  addresses_changed boolean;
begin
  if not public.is_platform_admin() then
    raise exception 'Platform admin access required';
  end if;

  select * into business_row
  from public.businesses
  where id::text = normalized_business_id;

  if not found then
    raise exception 'Business not found';
  end if;

  if next_business_name = '' or next_company_name = '' or next_username = '' then
    raise exception 'Business name, company name, and public username are required';
  end if;
  if char_length(next_business_name) > 80 then
    raise exception 'Business name must be 80 characters or fewer';
  end if;
  if char_length(next_company_name) > 120 then
    raise exception 'Company name must be 120 characters or fewer';
  end if;
  if char_length(next_username) > 60 then
    raise exception 'Public username must be 60 characters or fewer';
  end if;

  next_name_slug := regexp_replace(lower(next_business_name), '[^a-z0-9]+', '', 'g');
  if next_name_slug = '' then
    raise exception 'Business name needs at least one letter or number';
  end if;

  if exists (
    select 1
    from public.businesses other
    where other.id::text <> normalized_business_id
      and (
        next_username in (
          regexp_replace(lower(coalesce(other.data->>'storefrontSlug', '')), '[^a-z0-9]+', '', 'g'),
          regexp_replace(lower(coalesce(other.data->>'businessSlug', '')), '[^a-z0-9]+', '', 'g'),
          regexp_replace(lower(coalesce(nullif(trim(coalesce(other.data->>'businessName', '')), ''), other.name, '')), '[^a-z0-9]+', '', 'g')
        )
        or next_name_slug in (
          regexp_replace(lower(coalesce(other.data->>'storefrontSlug', '')), '[^a-z0-9]+', '', 'g'),
          regexp_replace(lower(coalesce(other.data->>'businessSlug', '')), '[^a-z0-9]+', '', 'g'),
          regexp_replace(lower(coalesce(nullif(trim(coalesce(other.data->>'businessName', '')), ''), other.name, '')), '[^a-z0-9]+', '', 'g')
        )
      )
  ) then
    raise exception 'Another business already uses that name or public username';
  end if;

  addresses_changed :=
    next_username is distinct from regexp_replace(lower(coalesce(business_row.data->>'businessSlug', '')), '[^a-z0-9]+', '', 'g')
    or next_username is distinct from regexp_replace(lower(coalesce(business_row.data->>'storefrontSlug', '')), '[^a-z0-9]+', '', 'g');

  update public.businesses
  set name = next_company_name,
      data = coalesce(data, '{}'::jsonb) || jsonb_build_object(
        'businessName', next_business_name,
        'businessSlug', next_username,
        'storefrontSlug', next_username
      )
  where id::text = normalized_business_id;

  return jsonb_build_object(
    'business_name', next_business_name,
    'company_name', next_company_name,
    'business_slug', next_username,
    'storefront_slug', next_username,
    'addresses_changed', addresses_changed
  );
end;
$$;

grant execute on function public.platform_admin_update_business_identity(text, text, text, text) to authenticated;
