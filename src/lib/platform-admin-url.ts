// The platform-level (super-admin) console lives at its own subdomain,
// separate from any per-business storefront/dashboard subdomain. Visiting
// this host always lands on /platform-admin-login or /platform-admin,
// resolved via the same auth-store session used everywhere else in the app.
export const PLATFORM_ADMIN_HOSTNAME = 'console.fyll.app';

export const isPlatformAdminHostname = (hostname?: string | null) => {
  if (!hostname) return false;
  const normalizedHostname = hostname.trim().toLowerCase().replace(/^www\./, '');
  return normalizedHostname === PLATFORM_ADMIN_HOSTNAME;
};
