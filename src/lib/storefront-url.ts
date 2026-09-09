import { slugifyBusinessName } from '@/lib/tracking-url';

export const STOREFRONT_PRIMARY_DOMAIN = 'fyll.store';
export const STOREFRONT_FALLBACK_DOMAIN = 'shop.fyll.app';
export const STOREFRONT_HOST_SUFFIX = `.fyll.store`;

export const isStorefrontHostname = (hostname?: string | null) => {
  if (!hostname) return false;
  return hostname === STOREFRONT_PRIMARY_DOMAIN || hostname.endsWith(STOREFRONT_HOST_SUFFIX);
};

export const resolveStorefrontSlug = ({
  storefrontSlug,
  businessName,
  companyName,
}: {
  storefrontSlug?: string | null;
  businessName?: string | null;
  companyName?: string | null;
}) => slugifyBusinessName(storefrontSlug || businessName || companyName || '');

export const buildStorefrontSubdomainUrl = ({
  storefrontSlug,
  businessName,
  companyName,
}: {
  storefrontSlug?: string | null;
  businessName?: string | null;
  companyName?: string | null;
}) => {
  const slug = resolveStorefrontSlug({ storefrontSlug, businessName, companyName });
  return slug ? `https://${slug}.${STOREFRONT_PRIMARY_DOMAIN}` : `https://${STOREFRONT_PRIMARY_DOMAIN}`;
};

export const buildStorefrontDiscoveryUrl = ({
  storefrontSlug,
  businessName,
  companyName,
  domain = STOREFRONT_PRIMARY_DOMAIN,
}: {
  storefrontSlug?: string | null;
  businessName?: string | null;
  companyName?: string | null;
  domain?: string;
}) => {
  const slug = resolveStorefrontSlug({ storefrontSlug, businessName, companyName });
  return slug ? `https://${domain}/${slug}` : `https://${domain}`;
};

export const buildStorefrontUrl = ({
  storefrontSlug,
  businessName,
  companyName,
}: {
  storefrontSlug?: string | null;
  businessName?: string | null;
  companyName?: string | null;
}) => buildStorefrontSubdomainUrl({ storefrontSlug, businessName, companyName });

// Merchant admin/dashboard for managing the storefront — lives under the
// same per-business subdomain as the public shop (e.g. admin.fyll.store/dashboard),
// not a shared URL. It authenticates via the same shared Supabase session and
// resolves the merchant's business with get_user_business_id(), so no
// business_id or token is ever passed in this URL.
export const buildStorefrontDashboardUrl = ({
  storefrontSlug,
  businessName,
  companyName,
}: {
  storefrontSlug?: string | null;
  businessName?: string | null;
  companyName?: string | null;
}) => `${buildStorefrontSubdomainUrl({ storefrontSlug, businessName, companyName })}/dashboard`;

export const buildSuggestedStorefrontUrls = ({
  storefrontSlug,
  businessName,
  companyName,
}: {
  storefrontSlug?: string | null;
  businessName?: string | null;
  companyName?: string | null;
}) => {
  const slug = resolveStorefrontSlug({ storefrontSlug, businessName, companyName });
  return [
    {
      id: 'live-storefront',
      label: 'Live storefront',
      url: slug ? `https://${slug}.${STOREFRONT_PRIMARY_DOMAIN}` : `https://${STOREFRONT_PRIMARY_DOMAIN}`,
    },
    {
      id: 'discovery-page',
      label: 'Discovery page',
      url: slug ? `https://${STOREFRONT_PRIMARY_DOMAIN}/${slug}` : `https://${STOREFRONT_PRIMARY_DOMAIN}`,
    },
    {
      id: 'fallback',
      label: 'Fallback route',
      url: slug ? `https://${STOREFRONT_FALLBACK_DOMAIN}/${slug}` : `https://${STOREFRONT_FALLBACK_DOMAIN}`,
    },
  ];
};
