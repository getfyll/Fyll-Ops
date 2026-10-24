-- Partner accounts get an empty "New Business" row automatically when they sign up, which then shows
-- up in the Fyll console as if it were a real business. Relabel those rows as partners:
--   - the name becomes "Partner · <partner name>" (what the console list shows)
--   - the row remembers it is a partner account and which business it works with, so the console
--     can show "Partner of <business>" and link to it.
-- Only rows still called "New Business" and owned by a partner login are touched, so this is safe to re-run.

update public.businesses b
set
  name = 'Partner · ' || coalesce(nullif(trim(p.data->>'name'), ''), 'Partner'),
  data = coalesce(b.data, '{}'::jsonb) || jsonb_build_object(
    'businessName', 'Partner · ' || coalesce(nullif(trim(p.data->>'name'), ''), 'Partner'),
    'accountType', 'partner',
    'partnerId', p.id,
    'partnerOfBusinessId', p.business_id
  )
from public.partners p
where p.auth_user_id::text = b.owner_id::text
  and b.name = 'New Business';

-- Console panel: also return which business a partner account works with.
-- (Same function as before with one extra key; signature and permissions are unchanged.)
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
  linked_business public.businesses%rowtype;
  partner_of jsonb := null;
begin
  if not public.is_platform_admin() then
    raise exception 'Platform admin access required';
  end if;

  select * into business_row from public.businesses where id::text = trim(coalesce(business_id_input, ''));
  if not found then
    raise exception 'Business not found';
  end if;

  display_name := coalesce(nullif(trim(coalesce(business_row.data->>'businessName', '')), ''), business_row.name, '');

  if business_row.data->>'accountType' = 'partner' and coalesce(business_row.data->>'partnerOfBusinessId', '') <> '' then
    select * into linked_business from public.businesses where id::text = business_row.data->>'partnerOfBusinessId';
    if found then
      partner_of := jsonb_build_object(
        'business_id', linked_business.id::text,
        'business_name', coalesce(nullif(trim(coalesce(linked_business.data->>'businessName', '')), ''), linked_business.name, '')
      );
    end if;
  end if;

  -- Same fallback the main app uses when no handle has been saved: the name, letters and digits only.
  return jsonb_build_object(
    'business_slug', coalesce(
      nullif(regexp_replace(lower(coalesce(business_row.data->>'businessSlug', '')), '[^a-z0-9]+', '', 'g'), ''),
      regexp_replace(lower(display_name), '[^a-z0-9]+', '', 'g')
    ),
    'storefront_slug', coalesce(
      nullif(regexp_replace(lower(coalesce(business_row.data->>'storefrontSlug', '')), '[^a-z0-9]+', '', 'g'), ''),
      regexp_replace(lower(display_name), '[^a-z0-9]+', '', 'g')
    ),
    'partner_of', partner_of
  );
end;
$$;

grant execute on function public.platform_admin_get_business_handles(text) to authenticated;
