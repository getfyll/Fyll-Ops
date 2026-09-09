export const PARTNER_PORTAL_PRIMARY_DOMAIN = 'partner.fyll.app';

const normalizeHostname = (hostname?: string | null) => {
  if (!hostname) return false;
  return hostname.trim().toLowerCase().replace(/^www\./, '');
};

export const isPartnerPortalHostname = (hostname?: string | null) => {
  return normalizeHostname(hostname) === PARTNER_PORTAL_PRIMARY_DOMAIN;
};

export const FYLL_PARTNER_PORTAL_ORIGIN = `https://${PARTNER_PORTAL_PRIMARY_DOMAIN}`;
