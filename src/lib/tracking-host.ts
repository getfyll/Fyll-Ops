export const TRACKING_PRIMARY_DOMAIN = 'track.fyll.app';
export const RETURNS_PRIMARY_DOMAIN = 'returns.fyll.app';
export const DELIVERY_CONFIRMATION_PRIMARY_DOMAIN = 'confirm.fyll.app';
export const PAYMENT_PRIMARY_DOMAIN = 'payment.fyll.app';

const normalizeHostname = (hostname?: string | null) => {
  if (!hostname) return false;
  return hostname.trim().toLowerCase().replace(/^www\./, '');
};

export const isTrackingHostname = (hostname?: string | null) => {
  return normalizeHostname(hostname) === TRACKING_PRIMARY_DOMAIN;
};

export const isReturnsHostname = (hostname?: string | null) => {
  return normalizeHostname(hostname) === RETURNS_PRIMARY_DOMAIN;
};

export const isDeliveryConfirmationHostname = (hostname?: string | null) => {
  return normalizeHostname(hostname) === DELIVERY_CONFIRMATION_PRIMARY_DOMAIN;
};

export const isPaymentHostname = (hostname?: string | null) => {
  return normalizeHostname(hostname) === PAYMENT_PRIMARY_DOMAIN;
};

export const isCustomerPortalHostname = (hostname?: string | null) => {
  return isTrackingHostname(hostname)
    || isReturnsHostname(hostname)
    || isDeliveryConfirmationHostname(hostname)
    || isPaymentHostname(hostname);
};

export const FYLL_TRACKING_ORIGIN = `https://${TRACKING_PRIMARY_DOMAIN}`;
export const FYLL_RETURNS_ORIGIN = `https://${RETURNS_PRIMARY_DOMAIN}`;
export const FYLL_DELIVERY_CONFIRMATION_ORIGIN = `https://${DELIVERY_CONFIRMATION_PRIMARY_DOMAIN}`;
export const FYLL_PAYMENT_ORIGIN = `https://${PAYMENT_PRIMARY_DOMAIN}`;

// Exact Expo route names: never treat an entire customer hostname as permission
// to mount arbitrary ERP screens (including automatically discovered routes).
const CUSTOMER_PORTAL_ROUTES = new Set([
  'track', 'order-tracking', 'start-return', 'confirm-delivery',
  '[businessSlug]/index', '[businessSlug]/[code]',
  '[businessSlug]/order-tracking', '[businessSlug]/order-tracking/[code]',
  '[businessSlug]/start-return',
  '[businessSlug]/confirm-delivery', '[businessSlug]/confirm-delivery/[code]',
]);

// payment.fyll.app only ever serves the public payment page:
//   /<business>/<code> (short link), /<business>/checkout/<code> (older shape) and /checkout?code=.
const PAYMENT_PORTAL_ROUTES = new Set([
  'checkout', '[businessSlug]/[code]', '[businessSlug]/checkout/[code]',
]);

export const isCustomerPortalRoute = (routeName: string, hostname?: string | null) =>
  isPaymentHostname(hostname)
    ? PAYMENT_PORTAL_ROUTES.has(routeName)
    : CUSTOMER_PORTAL_ROUTES.has(routeName);

// Where to send a visitor who lands on a payment-host URL that isn't a payment page.
export const PAYMENT_FALLBACK_REDIRECT = '/checkout';
