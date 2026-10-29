-- Preserve the capitalization requested by Blooming Blends on its public
-- storefront. The storefront hero renders data.businessName verbatim; the
-- storefront editor preview previously made the name look uppercase through
-- presentation styling even while the stored value remained title case.
--
-- This deliberately leaves businessSlug and storefrontSlug unchanged, so no
-- public URL moves as a result of this display-only correction.

update public.businesses
set data = coalesce(data, '{}'::jsonb) || jsonb_build_object(
  'businessName', 'BLOOMING BLENDS'
)
where regexp_replace(lower(coalesce(data->>'storefrontSlug', '')), '[^a-z0-9]+', '', 'g') = 'bloomingblends'
  and coalesce(data->>'businessName', '') is distinct from 'BLOOMING BLENDS';
