export const TRACKING_PRIMARY_DOMAIN = 'track.fyll.app';
export const RETURNS_PRIMARY_DOMAIN = 'returns.fyll.app';
export const DELIVERY_CONFIRMATION_PRIMARY_DOMAIN = 'confirm.fyll.app';

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

export const isCustomerPortalHostname = (hostname?: string | null) => {
  return isTrackingHostname(hostname)
    || isReturnsHostname(hostname)
    || isDeliveryConfirmationHostname(hostname);
};

export const FYLL_TRACKING_ORIGIN = `https://${TRACKING_PRIMARY_DOMAIN}`;
export const FYLL_RETURNS_ORIGIN = `https://${RETURNS_PRIMARY_DOMAIN}`;
export const FYLL_DELIVERY_CONFIRMATION_ORIGIN = `https://${DELIVERY_CONFIRMATION_PRIMARY_DOMAIN}`;

// Exact Expo route names: never treat an entire customer hostname as permission
// to mount arbitrary ERP screens (including automatically discovered routes).
const CUSTOMER_PORTAL_ROUTES = new Set([
  'track', 'order-tracking', 'start-return', 'confirm-delivery',
  '[businessSlug]/index', '[businessSlug]/[code]',
  '[businessSlug]/order-tracking', '[businessSlug]/order-tracking/[code]',
  '[businessSlug]/start-return',
  '[businessSlug]/confirm-delivery', '[businessSlug]/confirm-delivery/[code]',
]);

export const isCustomerPortalRoute = (routeName: string) =>
  CUSTOMER_PORTAL_ROUTES.has(routeName);
