-- Tracking address (data.businessSlug) could stay on an old name.
--
-- platform_admin_update_business_name only recalculated the slugs when the business name changed in that save.
-- A business whose display name was already changed earlier (e.g. by the business itself) kept its old tracking
-- address when an admin later renamed it in the console, so track.fyll.app/<old-name> kept showing.
--
-- 1) Patch the function: when the name did NOT change but the tracking address no longer matches the name, resync
--    only the tracking address (the storefront handle is left alone, since it can be set separately).
-- 2) Fix Blooming Blends, whose tracking address is still "bloomingjuices".
--
-- The function is patched in place so the rest of its logic stays exactly as deployed.

do $$
declare
  def text;
  patched text;
  marker text := E'  update public.businesses\n  set name = next_company_name,';
  resync text := E'  if not name_changed then
    next_slug := regexp_replace(lower(next_business_name), ''[^a-z0-9]+'', '''', ''g'');
    if next_slug <> ''''
      and next_slug is distinct from regexp_replace(lower(coalesce(business_row.data->>''businessSlug'', '''')), ''[^a-z0-9]+'', '''', ''g'')
      and not exists (
        select 1
        from public.businesses other
        where other.id::text <> normalized_business_id
          and next_slug in (
            regexp_replace(lower(coalesce(other.data->>''businessSlug'', '''')), ''[^a-z0-9]+'', '''', ''g''),
            regexp_replace(lower(coalesce(other.data->>''storefrontSlug'', '''')), ''[^a-z0-9]+'', '''', ''g''),
            regexp_replace(lower(coalesce(nullif(trim(coalesce(other.data->>''businessName'', '''')), ''''), other.name, '''')), ''[^a-z0-9]+'', '''', ''g'')
          )
      )
    then
      result_data := result_data || jsonb_build_object(''businessSlug'', next_slug);
    end if;
  end if;

';
begin
  select pg_get_functiondef(p.oid)
    into def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'platform_admin_update_business_name'
     and pg_get_function_identity_arguments(p.oid) like '%company_name_input%';

  if def is null then
    raise exception 'platform_admin_update_business_name (3 args) not found';
  end if;
  if position('if not name_changed then' in def) > 0 then
    return; -- already patched
  end if;
  if position(marker in def) = 0 then
    raise exception 'expected update statement not found; nothing changed';
  end if;

  patched := replace(def, marker, resync || marker);
  execute patched;
end;
$$;

-- Blooming Blends: tracking address follows the name. (No other business uses "bloomingblends".)
update public.businesses
set data = coalesce(data, '{}'::jsonb) || jsonb_build_object('businessSlug', 'bloomingblends')
where id = 'biz-09a7865e45ca459883dfda5cb10bb376'
  and coalesce(data->>'businessSlug', '') <> 'bloomingblends'
  and not exists (
    select 1 from public.businesses other
    where other.id <> 'biz-09a7865e45ca459883dfda5cb10bb376'
      and 'bloomingblends' in (
        regexp_replace(lower(coalesce(other.data->>'businessSlug', '')), '[^a-z0-9]+', '', 'g'),
        regexp_replace(lower(coalesce(other.data->>'storefrontSlug', '')), '[^a-z0-9]+', '', 'g')
      )
  );
