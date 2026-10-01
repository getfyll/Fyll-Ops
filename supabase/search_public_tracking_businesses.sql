-- Public business search for track.fyll.app ("Which business did you buy from?").
-- Run once in the Supabase SQL editor.
--
-- Only businesses with a published storefront are searchable: publishing a
-- storefront is the business's own choice to be found publicly. Returns
-- public display details only (name, slug, logo, sector, city) — never
-- contact details, owners or orders. Needs 2+ characters and returns at
-- most 8 matches so the full business list can't be scraped by browsing.
--
-- The slug matches get_public_tracking_business (businessSlug, else the
-- business name), so a picked result works with the existing order lookup.

create or replace function public.search_public_tracking_businesses(query_input text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  -- strip LIKE wildcards so the query is matched literally
  normalized_query text := replace(replace(replace(lower(trim(coalesce(query_input, ''))), '\', ''), '%', ''), '_', '');
begin
  if length(normalized_query) < 2 then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'name', matches.display_name,
      'slug', matches.slug,
      'logo', matches.logo,
      'category', matches.category,
      'city', matches.city
    ) order by matches.starts_with desc, matches.display_name asc)
    from (
      select
        names.display_name,
        regexp_replace(
          regexp_replace(lower(trim(coalesce(nullif(trim(b.data->>'businessSlug'), ''), names.display_name))), '[^a-z0-9]+', '-', 'g'),
          '(^-|-$)', '', 'g'
        ) as slug,
        nullif(trim(coalesce(b.data->>'businessLogo', '')), '') as logo,
        nullif(trim(coalesce(b.data->>'businessSectorCategory', '')), '') as category,
        nullif(trim(coalesce(b.data->>'businessCity', '')), '') as city,
        lower(names.display_name) like normalized_query || '%' as starts_with
      from public.businesses b
      cross join lateral (
        select coalesce(nullif(trim(coalesce(b.data->>'businessName', '')), ''), b.name) as display_name
      ) names
      where coalesce((b.data->>'storefrontEnabled')::boolean, false) = true
        and coalesce((b.data->>'storefrontPublished')::boolean, true) = true
        and names.display_name is not null
        and lower(names.display_name) like '%' || normalized_query || '%'
      order by (lower(names.display_name) like normalized_query || '%') desc, names.display_name asc
      limit 8
    ) matches
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.search_public_tracking_businesses(text) to anon;
grant execute on function public.search_public_tracking_businesses(text) to authenticated;
