import {
  FYLL_DELIVERY_CONFIRMATION_ORIGIN,
  FYLL_RETURNS_ORIGIN,
  FYLL_TRACKING_ORIGIN,
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
}) => `${origin}${buildSocialCheckoutPath({ businessName, businessSlug, code })}`;

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
