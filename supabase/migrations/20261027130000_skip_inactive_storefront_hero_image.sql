-- A solid-color hero was still processing and returning a 2.3 MB embedded
-- background image saved from a previous design. On Blooming Blends this
-- pushed response construction past the public API's statement timeout,
-- leaving different browsers stuck on their last locally cached storefront.
--
-- Remove the inactive image only from the function's local working record.
-- The saved branding, image-mode heroes, catalog, URLs, and all other public
-- fields remain unchanged. Patch the deployed body in place to preserve its
-- complete, newer storefront contract rather than replacing it with an older
-- copy of the resolver bundled with Ops.

do $$
declare
  function_definition text;
  marker text := '  canonical_storefront_slug :=';
  image_guard text := E'  -- Skip inactive hero image in public storefront payload.\n  if coalesce(nullif(trim(matched_business.data->>''storefrontHeroBackgroundMode''), ''''), ''color'') <> ''image'' then\n    matched_business.data := matched_business.data - ''storefrontHeroBackgroundImage'';\n  end if;\n\n';
begin
  select pg_get_functiondef('public.get_storefront_business_by_slug(text)'::regprocedure)
  into function_definition;

  if position('Skip inactive hero image in public storefront payload.' in function_definition) > 0 then
    return;
  end if;
  if position(marker in function_definition) = 0 then
    raise exception 'Expected storefront resolver marker not found; no changes applied';
  end if;

  execute replace(function_definition, marker, image_guard || marker);
end;
$$;
