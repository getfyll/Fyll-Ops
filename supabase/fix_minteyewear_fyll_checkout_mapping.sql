-- Repairs the Fyll Checkout -> Fyll.app business mapping for Mint Eyewear.
-- Confirmed businessId via public storefront resolver:
--   storefrontSlug: mint-eyewear
--   businessId: biz-2e38ebb3f2dc4d00bd812b05afc1cbf2

update public.businesses
set data = coalesce(data, '{}'::jsonb)
  || jsonb_build_object(
    'woocommerceEnabled', true,
    'woocommerceStoreUrl', 'https://minteyewear.co',
    'woocommerceMerchantId', 'MER-EC8AD9A5',
    'woocommerceLastMappingRepairedAt', now()
  )
where id = 'biz-2e38ebb3f2dc4d00bd812b05afc1cbf2';

select
  id as business_id,
  name,
  data->>'woocommerceStoreUrl' as woocommerce_store_url,
  data->>'woocommerceMerchantId' as woocommerce_merchant_id
from public.businesses
where id = 'biz-2e38ebb3f2dc4d00bd812b05afc1cbf2';
