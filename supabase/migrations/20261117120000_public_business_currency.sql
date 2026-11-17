-- Customer-facing pages (tracking, quotes, storefront) are visited by people who
-- are not signed in, so they can't read the business's settings. This returns
-- only the business's currency code so those pages show the right symbol.
-- Look up by business id, business slug, or quote code (whichever the page has).
create or replace function public.get_public_business_currency(
  business_id_input text default null,
  business_slug_input text default null,
  quote_code_input text default null
)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  target_id uuid;
  normalized_slug text;
  result text;
begin
  if coalesce(trim(business_id_input), '') <> '' then
    begin
      target_id := trim(business_id_input)::uuid;
    exception when invalid_text_representation then
      target_id := null;
    end;
  end if;

  if target_id is null and coalesce(trim(quote_code_input), '') <> '' then
    select q.business_id into target_id
    from public.quotes q
    where q.id = upper(trim(quote_code_input));
  end if;

  if target_id is null and coalesce(trim(business_slug_input), '') <> '' then
    normalized_slug := regexp_replace(
      regexp_replace(lower(trim(business_slug_input)), '[^a-z0-9]+', '-', 'g'),
      '(^-|-$)', '', 'g'
    );
    select b.id into target_id
    from public.businesses b
    where regexp_replace(
      regexp_replace(lower(trim(coalesce(b.data->>'businessSlug', ''))), '[^a-z0-9]+', '-', 'g'),
      '(^-|-$)', '', 'g'
    ) = normalized_slug
    limit 1;
  end if;

  if target_id is null then
    return null;
  end if;

  select nullif(upper(trim(b.data->>'currency')), '') into result
  from public.businesses b
  where b.id = target_id;

  return result;
end;
$$;

grant execute on function public.get_public_business_currency(text, text, text) to anon, authenticated;
