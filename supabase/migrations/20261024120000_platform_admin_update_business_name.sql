-- Fyll console: platform admins can edit a business's names.
--   - Business name (data.businessName): what the main app shows. Changing it also moves the
--     customer-facing addresses that follow it — the tracking / payment link name and the
--     storefront address (<name>.fyll.store) — so links already shared under the old name stop
--     working. The new name must not already be used by another business.
--   - Company name (businesses.name): changed on its own; it does not affect any address.
-- Custom storefront domains are not touched. Unlike the main app's once-a-year limit, an admin
-- can rename anytime, and doing so does not use up the business's own yearly rename.

create or replace function public.platform_admin_update_business_name(
  business_id_input text,
  business_name_input text default null,
  company_name_input text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_business_id text := trim(coalesce(business_id_input, ''));
  requested_business_name text := regexp_replace(trim(coalesce(business_name_input, '')), '\s+', ' ', 'g');
  requested_company_name text := regexp_replace(trim(coalesce(company_name_input, '')), '\s+', ' ', 'g');
  business_row public.businesses%rowtype;
  current_business_name text;
  next_business_name text;
  next_company_name text;
  next_slug text;
  name_changed boolean;
  result_data jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Platform admin access required';
  end if;

  select * into business_row from public.businesses where id::text = normalized_business_id;
  if not found then
    raise exception 'Business not found';
  end if;

  current_business_name := coalesce(nullif(trim(coalesce(business_row.data->>'businessName', '')), ''), business_row.name, '');
  next_business_name := coalesce(nullif(requested_business_name, ''), current_business_name);
  next_company_name := coalesce(nullif(requested_company_name, ''), business_row.name, '');

  if next_business_name = '' then
    raise exception 'Business name cannot be empty';
  end if;
  if char_length(next_business_name) > 80 or char_length(next_company_name) > 120 then
    raise exception 'Name is too long';
  end if;

  name_changed := next_business_name is distinct from current_business_name;
  result_data := coalesce(business_row.data, '{}'::jsonb) || jsonb_build_object('businessName', next_business_name);

  if name_changed then
    -- Same rule the main app uses for addresses: lowercase letters and digits only.
    next_slug := regexp_replace(lower(next_business_name), '[^a-z0-9]+', '', 'g');
    if next_slug = '' then
      raise exception 'Business name needs at least one letter or number';
    end if;

    if exists (
      select 1
      from public.businesses other
      where other.id::text <> normalized_business_id
        and next_slug in (
          regexp_replace(lower(coalesce(other.data->>'businessSlug', '')), '[^a-z0-9]+', '', 'g'),
          regexp_replace(lower(coalesce(other.data->>'storefrontSlug', '')), '[^a-z0-9]+', '', 'g'),
          regexp_replace(lower(coalesce(nullif(trim(coalesce(other.data->>'businessName', '')), ''), other.name, '')), '[^a-z0-9]+', '', 'g')
        )
    ) then
      raise exception 'Another business already uses that name or address. Choose a different name.';
    end if;

    result_data := result_data || jsonb_build_object('businessSlug', next_slug, 'storefrontSlug', next_slug);
  end if;

  update public.businesses
  set name = next_company_name,
      data = result_data
  where id::text = normalized_business_id;

  return jsonb_build_object(
    'business_name', next_business_name,
    'company_name', next_company_name,
    'business_slug', coalesce(result_data->>'businessSlug', ''),
    'storefront_slug', coalesce(result_data->>'storefrontSlug', ''),
    'addresses_changed', name_changed
  );
end;
$$;

grant execute on function public.platform_admin_update_business_name(text, text, text) to authenticated;
