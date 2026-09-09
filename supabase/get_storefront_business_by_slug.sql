-- Public storefront connector — the one RPC the Fyll Store frontend calls to
-- resolve a public storefront slug into everything it needs to render the
-- page: business profile, theme, announcement banner, policies, categories,
-- public products, and bank transfer accounts for checkout.
--
-- Run this in the shared Supabase SQL editor (same project Ops writes to).
--
-- Contract:
-- - Ops (this app) is the source of truth. Storefront never creates or owns
--   a business row — it only resolves a slug and reads public selling data
--   that Ops already saved into businesses.data.
-- - Only returns businesses with storefrontEnabled = true in businesses.data.
-- - Products sync automatically: any non-discontinued product (or absent,
--   which defaults to 'product' — same convention as normalizeProductType()
--   in the app) is public. There is no separate per-product visibility flag
--   — hide an item from the storefront by marking it discontinued in Ops.
-- - security definer + anon grant, same pattern as
--   get_social_checkout_public in social_checkout_public_rpcs.sql. Nothing
--   beyond public storefront fields is exposed — no customer/order data,
--   no WooCommerce credentials, no staff-only fields.

-- Dropped first because Postgres won't let CREATE OR REPLACE rename an
-- existing function's parameter — safe to drop since it's read-only (stable,
-- no side effects) and immediately recreated below.
drop function if exists public.get_storefront_business_by_slug(text);

create or replace function public.get_storefront_business_by_slug(storefront_slug_input text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  matched record;
  business_data jsonb;
  products_json jsonb;
  categories_json jsonb;
  bank_accounts_json jsonb;
begin
  select id, name, data into matched
  from public.businesses
  where lower(trim(data->>'storefrontSlug')) = lower(trim(storefront_slug_input))
    and coalesce((data->>'storefrontEnabled')::boolean, false) = true
  limit 1;

  if matched.id is null then
    return null;
  end if;

  business_data := matched.data;

  select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'name', p.data->>'name',
        'description', p.data->>'description',
        'categories', coalesce(p.data->'categories', '[]'::jsonb),
        'imageUrl', p.data->>'imageUrl',
        'useGlobalStock', coalesce((p.data->>'useGlobalStock')::boolean, false),
        'globalStock', (p.data->>'globalStock')::numeric,
        'variants', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'id', v->>'id',
                'variableValues', coalesce(v->'variableValues', '{}'::jsonb),
                'sellingPrice', (v->>'sellingPrice')::numeric,
                'stock', (v->>'stock')::numeric,
                'imageUrl', v->>'imageUrl'
              )
            )
            from jsonb_array_elements(coalesce(p.data->'variants', '[]'::jsonb)) as v
          ),
          '[]'::jsonb
        )
      )
      order by p.created_at asc
    ), '[]'::jsonb)
    into products_json
  from public.products p
  where p.business_id = matched.id
    and coalesce((p.data->>'isDiscontinued')::boolean, false) = false
    and lower(coalesce(p.data->>'productType', 'product')) not like 'service%';

  select coalesce(jsonb_agg(distinct cat), '[]'::jsonb)
    into categories_json
  from public.products p,
       jsonb_array_elements_text(coalesce(p.data->'categories', '[]'::jsonb)) as cat
  where p.business_id = matched.id
    and coalesce((p.data->>'isDiscontinued')::boolean, false) = false
    and lower(coalesce(p.data->>'productType', 'product')) not like 'service%';

  select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', pa.id,
        'bank', pa.data->>'bankName',
        'bankName', pa.data->>'bankName',
        'accountName', pa.data->>'accountName',
        'accountNumber', pa.data->>'accountNumber'
      )
    ), '[]'::jsonb)
    into bank_accounts_json
  from public.payment_accounts pa
  where pa.business_id = matched.id;

  return jsonb_build_object(
    'businessId', matched.id,
    'businessName', coalesce(nullif(trim(coalesce(business_data->>'businessName', '')), ''), matched.name, 'Fyll'),
    'businessLogo', business_data->>'businessLogo',
    'businessWebsite', business_data->>'businessWebsite',
    'storefrontSlug', business_data->>'storefrontSlug',
    'storefrontCustomDomain', business_data->>'storefrontCustomDomain',
    'theme', jsonb_build_object(
      'accentColor', business_data->>'storefrontAccentColor',
      'heroBackgroundMode', business_data->>'storefrontHeroBackgroundMode',
      'heroBackgroundColor', business_data->>'storefrontHeroBackgroundColor',
      'heroBackgroundImage', business_data->>'storefrontHeroBackgroundImage'
    ),
    'announcement', jsonb_build_object(
      'enabled', coalesce((business_data->>'storefrontAnnouncementEnabled')::boolean, false),
      'texts', coalesce(business_data->'storefrontAnnouncementTexts', '[]'::jsonb)
    ),
    'menuItems', coalesce(business_data->'storefrontMenuItems', '[]'::jsonb),
    'policies', jsonb_build_object(
      'refundPolicy', business_data->>'refundPolicy',
      'deliveryPolicy', business_data->>'deliveryPolicy',
      'deliveryZones', coalesce(business_data->'deliveryZones', '[]'::jsonb)
    ),
    'categories', categories_json,
    'products', products_json,
    'bankAccounts', bank_accounts_json
  );
end;
$$;

grant execute on function public.get_storefront_business_by_slug(text) to anon;
grant execute on function public.get_storefront_business_by_slug(text) to authenticated;
