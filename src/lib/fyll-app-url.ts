import { PLATFORM_ADMIN_HOSTNAME } from '@/lib/platform-admin-url';

export const FYLL_PUBLIC_APP_ORIGIN = 'https://fyll.app';

const stripTrailingSlash = (value: string) => value.replace(/\/$/, '');

const hostnameForUrl = (value: string) => {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
};

export const getFyllPublicAppOrigin = () => {
  const configuredUrl = (
    process.env.EXPO_PUBLIC_FYLL_APP_URL
      ?? process.env.EXPO_PUBLIC_APP_URL
      ?? ''
  ).trim();

  if (!configuredUrl) {
    return FYLL_PUBLIC_APP_ORIGIN;
  }

  const normalizedUrl = stripTrailingSlash(configuredUrl);
  const hostname = hostnameForUrl(normalizedUrl);

  if (hostname === PLATFORM_ADMIN_HOSTNAME) {
    return FYLL_PUBLIC_APP_ORIGIN;
  }

  return normalizedUrl;
};

export const buildFounderAccessLink = (inviteCode: string) => (
  `${getFyllPublicAppOrigin()}/login?access=${encodeURIComponent(inviteCode)}`
);

export const buildTeamInviteLink = (inviteCode: string) => (
  `${getFyllPublicAppOrigin()}/login?invite=${encodeURIComponent(inviteCode)}`
);
