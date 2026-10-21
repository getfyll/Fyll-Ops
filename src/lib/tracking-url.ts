import {
  FYLL_DELIVERY_CONFIRMATION_ORIGIN,
  FYLL_PAYMENT_ORIGIN,
  FYLL_RETURNS_ORIGIN,
  FYLL_TRACKING_ORIGIN,
  PAYMENT_PRIMARY_DOMAIN,
} from '@/lib/tracking-host';

export const slugifyBusinessName = (value: string) => value
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, '');

export const buildCustomerTrackingPath = ({
  businessName,
  businessSlug,
  trackingCode,
  email,
}: {
  businessName?: string | null;
  businessSlug?: string | null;
  trackingCode: string;
  email?: string | null;
}) => {
  const normalizedCode = trackingCode.trim().toUpperCase();
  const normalizedBusinessSlug = slugifyBusinessName(businessSlug || businessName || '');
  const basePath = normalizedBusinessSlug
    ? `/${normalizedBusinessSlug}/order-tracking/${encodeURIComponent(normalizedCode)}`
    : `/order-tracking?code=${encodeURIComponent(normalizedCode)}`;

  if (!email?.trim()) return basePath;
  const encodedEmail = encodeURIComponent(email.trim());
  return basePath.includes('?')
    ? `${basePath}&email=${encodedEmail}`
    : `${basePath}?email=${encodedEmail}`;
};

export const buildCustomerTrackingHostPath = ({
  businessName,
  businessSlug,
  trackingCode,
  email,
}: {
  businessName?: string | null;
  businessSlug?: string | null;
  trackingCode: string;
  email?: string | null;
}) => {
  const normalizedCode = trackingCode.trim().toUpperCase();
  const normalizedBusinessSlug = slugifyBusinessName(businessSlug || businessName || '');
  const basePath = normalizedBusinessSlug
    ? `/${normalizedBusinessSlug}/${encodeURIComponent(normalizedCode)}`
    : `/${encodeURIComponent(normalizedCode)}`;

  if (!email?.trim()) return basePath;
  return `${basePath}?email=${encodeURIComponent(email.trim())}`;
};

export const buildCustomerTrackingHostUrl = ({
  businessName,
  businessSlug,
  trackingCode,
  email,
}: {
  businessName?: string | null;
  businessSlug?: string | null;
  trackingCode: string;
  email?: string | null;
}) => `${FYLL_TRACKING_ORIGIN}${buildCustomerTrackingHostPath({ businessName, businessSlug, trackingCode, email })}`;

export const buildDeliveryConfirmationHostPath = ({
  businessName,
  businessSlug,
  trackingCode,
  email,
}: {
  businessName?: string | null;
  businessSlug?: string | null;
  trackingCode?: string | null;
  email?: string | null;
}) => {
  const normalizedBusinessSlug = slugifyBusinessName(businessSlug || businessName || '');
  const normalizedCode = trackingCode?.trim().toUpperCase() ?? '';
  const basePath = normalizedBusinessSlug
    ? `/${normalizedBusinessSlug}${normalizedCode ? `/${encodeURIComponent(normalizedCode)}` : ''}`
    : normalizedCode
      ? `/${encodeURIComponent(normalizedCode)}`
      : '/';

  if (!email?.trim()) return basePath;
  return `${basePath}?email=${encodeURIComponent(email.trim())}`;
};

export const buildDeliveryConfirmationHostUrl = ({
  businessName,
  businessSlug,
  trackingCode,
  email,
}: {
  businessName?: string | null;
  businessSlug?: string | null;
  trackingCode?: string | null;
  email?: string | null;
}) => `${FYLL_DELIVERY_CONFIRMATION_ORIGIN}${buildDeliveryConfirmationHostPath({ businessName, businessSlug, trackingCode, email })}`;

export const buildCustomerTrackingUrl = ({
  origin,
  businessName,
  businessSlug,
  trackingCode,
  email,
}: {
  origin: string;
  businessName?: string | null;
  businessSlug?: string | null;
  trackingCode: string;
  email?: string | null;
}) => `${origin}${buildCustomerTrackingPath({ businessName, businessSlug, trackingCode, email })}`;

export const buildSocialCheckoutPath = ({
  businessName,
  businessSlug,
  code,
}: {
  businessName?: string | null;
  businessSlug?: string | null;
  code: string;
}) => {
  const normalizedCode = code.trim().toUpperCase();
  const normalizedBusinessSlug = slugifyBusinessName(businessSlug || businessName || '');
  return normalizedBusinessSlug
    ? `/${normalizedBusinessSlug}/checkout/${encodeURIComponent(normalizedCode)}`
    : `/checkout?code=${encodeURIComponent(normalizedCode)}`;
};

export const buildSocialCheckoutUrl = ({
  origin,
  businessName,
  businessSlug,
  code,
}: {
  origin: string;
  businessName?: string | null;
  businessSlug?: string | null;
  code: string;
}) => {
  // On the payment host the link is the short /<business>/<code>; the dashboard
  // host (and local dev) keep the older /<business>/checkout/<code> shape.
  if (hostnameOf(origin) === PAYMENT_PRIMARY_DOMAIN) {
    const slug = slugifyBusinessName(businessSlug || businessName || '');
    const normalizedCode = code.trim().toUpperCase();
    return slug
      ? `${origin}/${slug}/${encodeURIComponent(normalizedCode)}`
      : `${origin}/checkout?code=${encodeURIComponent(normalizedCode)}`;
  }
  return `${origin}${buildSocialCheckoutPath({ businessName, businessSlug, code })}`;
};

const hostnameOf = (value: string) => {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

// Customers open payment links on payment.fyll.app, never the staff dashboard.
// Local dev / preview deployments keep their own origin so links stay testable.
export const getPaymentLinkOrigin = () => {
  if (typeof window === 'undefined') return FYLL_PAYMENT_ORIGIN;
  const host = window.location.hostname.toLowerCase();
  const isFyllHost = host === 'fyll.app' || host.endsWith('.fyll.app');
  return isFyllHost ? FYLL_PAYMENT_ORIGIN : window.location.origin;
};

export const buildStartReturnPath = ({
  businessName,
  businessSlug,
}: {
  businessName?: string | null;
  businessSlug?: string | null;
}) => {
  const normalizedBusinessSlug = slugifyBusinessName(businessSlug || businessName || '');
  return normalizedBusinessSlug ? `/${normalizedBusinessSlug}/start-return` : '/start-return';
};

export const buildStartReturnUrl = ({
  origin,
  businessName,
  businessSlug,
}: {
  origin: string;
  businessName?: string | null;
  businessSlug?: string | null;
}) => `${origin}${buildStartReturnPath({ businessName, businessSlug })}`;

export const buildStartReturnHostPath = ({
  businessName,
  businessSlug,
}: {
  businessName?: string | null;
  businessSlug?: string | null;
}) => {
  const normalizedBusinessSlug = slugifyBusinessName(businessSlug || businessName || '');
  return normalizedBusinessSlug ? `/${normalizedBusinessSlug}` : '/';
};

export const buildStartReturnHostUrl = ({
  businessName,
  businessSlug,
}: {
  businessName?: string | null;
  businessSlug?: string | null;
}) => `${FYLL_RETURNS_ORIGIN}${buildStartReturnHostPath({ businessName, businessSlug })}`;
