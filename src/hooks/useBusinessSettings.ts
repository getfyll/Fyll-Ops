import { useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import useAuthStore from '@/lib/state/auth-store';
import { supabase } from '@/lib/supabase';
import { slugifyBusinessName } from '@/lib/tracking-url';
import { resolveStorefrontSlug } from '@/lib/storefront-url';
import {
  DEFAULT_BUSINESS_FEATURE_ACCESS,
  normalizeBusinessFeatureAccess,
  type BusinessFeatureAccess,
} from '@/lib/feature-access';

export interface BusinessSettings {
  companyName: string;
  businessName: string;
  businessSlug: string;
  businessNameLastUpdatedAt: string | null;
  businessLogo: string | null;
  businessPhone: string;
  businessWebsite: string;
  returnAddress: string;
  storefrontEnabled: boolean;
  storefrontSlug: string;
  storefrontCustomDomain: string;
  woocommerceEnabled: boolean;
  woocommerceStoreUrl: string;
  woocommerceConsumerKey: string;
  woocommerceConsumerSecret: string;
  woocommerceAutoLinkOrders: boolean;
  featureAccess: BusinessFeatureAccess;
}

interface BusinessSettingsResult {
  companyName: string;
  businessName: string;
  businessSlug: string;
  businessNameLastUpdatedAt: string | null;
  canEditBusinessName: boolean;
  businessNameNextEditableAt: string | null;
  businessLogo: string | null;
  businessPhone: string;
  businessWebsite: string;
  returnAddress: string;
  storefrontEnabled: boolean;
  storefrontSlug: string;
  storefrontCustomDomain: string;
  woocommerceEnabled: boolean;
  woocommerceStoreUrl: string;
  woocommerceConsumerKey: string;
  woocommerceConsumerSecret: string;
  woocommerceAutoLinkOrders: boolean;
  hasWooCommerceConnection: boolean;
  featureAccess: BusinessFeatureAccess;
  isLoading: boolean;
  updateBusinessName: (name: string) => Promise<{ success: boolean; error?: string }>;
  updateBusinessLogo: (logoUri: string | null) => Promise<void>;
  saveSettings: (settings: Partial<BusinessSettings>) => Promise<{ success: boolean; error?: string }>;
}

const BUSINESS_SETTINGS_KEY = 'fyll_business_settings';
const BUSINESS_NAME_EDIT_LOCK_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_CACHEABLE_LOGO_LENGTH = 120_000;
const getSettingsKey = (businessId?: string | null) =>
  businessId ? `${BUSINESS_SETTINGS_KEY}:${businessId}` : BUSINESS_SETTINGS_KEY;

const DEFAULT_SETTINGS: BusinessSettings = {
  companyName: '',
  businessName: '',
  businessSlug: '',
  businessNameLastUpdatedAt: null,
  businessLogo: null,
  businessPhone: '',
  businessWebsite: '',
  returnAddress: '',
  storefrontEnabled: false,
  storefrontSlug: '',
  storefrontCustomDomain: '',
  woocommerceEnabled: false,
  woocommerceStoreUrl: '',
  woocommerceConsumerKey: '',
  woocommerceConsumerSecret: '',
  woocommerceAutoLinkOrders: false,
  featureAccess: DEFAULT_BUSINESS_FEATURE_ACCESS,
};

const normalizeTimestamp = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const normalizeBoolean = (value: unknown, fallback = false) =>
  typeof value === 'boolean' ? value : fallback;

const shouldSkipLogoCache = (value: string | null) => {
  if (!value) return false;
  if (value.startsWith('data:image/') && value.length > MAX_CACHEABLE_LOGO_LENGTH) return true;
  return value.length > MAX_CACHEABLE_LOGO_LENGTH;
};

const sanitizePersistedBusinessLogo = (value: string | null) => {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (/^(data:image\/|blob:|file:)/i.test(normalized)) return null;
  return normalized;
};

const resolveBusinessSlug = (slug: unknown, businessName: string, companyName = '') => {
  const slugInput = typeof slug === 'string' ? slug : '';
  return slugifyBusinessName(slugInput || businessName || companyName);
};

const getCacheableSettings = (settings: BusinessSettings): BusinessSettings => ({
  ...settings,
  businessSlug: resolveBusinessSlug(settings.businessSlug, settings.businessName, settings.companyName),
  businessLogo: shouldSkipLogoCache(settings.businessLogo) ? null : settings.businessLogo,
});

const persistSettingsCache = async (businessId: string | null | undefined, settings: BusinessSettings) => {
  const key = getSettingsKey(businessId);
  const cacheableSettings = getCacheableSettings(settings);

  try {
    await AsyncStorage.setItem(key, JSON.stringify(cacheableSettings));
    return;
  } catch (error) {
    console.warn('Failed to cache business settings, retrying with trimmed payload:', error);
  }

  try {
    await AsyncStorage.removeItem(key);
  } catch {}

  try {
    await AsyncStorage.setItem(
      key,
      JSON.stringify({
        ...cacheableSettings,
        businessLogo: null,
      } satisfies BusinessSettings)
    );
  } catch (error) {
    console.warn('Failed to persist business settings cache after trimming:', error);
  }
};

const getBusinessNameEditAvailability = (settings: Pick<BusinessSettings, 'businessNameLastUpdatedAt'>) => {
  const lastUpdatedAt = normalizeTimestamp(settings.businessNameLastUpdatedAt);
  if (!lastUpdatedAt) {
    return {
      canEditBusinessName: true,
      businessNameNextEditableAt: null,
    };
  }

  const nextEditableAt = new Date(new Date(lastUpdatedAt).getTime() + BUSINESS_NAME_EDIT_LOCK_MS);
  const canEditBusinessName = Date.now() >= nextEditableAt.getTime();

  return {
    canEditBusinessName,
    businessNameNextEditableAt: canEditBusinessName ? null : nextEditableAt.toISOString(),
  };
};

const buildSettingsErrorMessage = (fallback: string, error: unknown) => {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && error.message.trim()) {
    return `${fallback} ${error.message.trim()}`;
  }
  return fallback;
};

const fetchBusinessSettings = async (
  businessId: string | null | undefined,
  isOfflineMode: boolean
): Promise<BusinessSettings> => {
  try {
    // Try loading from Supabase businesses table (for online mode)
    if (businessId && !isOfflineMode) {
      const { data: business, error } = await supabase
        .from('businesses')
        .select('*')
        .eq('id', businessId)
        .maybeSingle();

      if (!error && business) {
        const data = (business as { data?: Record<string, unknown> | null }).data ?? null;
        const companyName = typeof business.name === 'string' ? business.name : '';
        const storedBusinessName = typeof data?.businessName === 'string' ? data.businessName.trim() : '';
        const businessName = storedBusinessName || companyName;
        const remoteSettings: BusinessSettings = {
          companyName,
          businessName,
          businessSlug: resolveBusinessSlug(data?.businessSlug, businessName, companyName),
          businessNameLastUpdatedAt: normalizeTimestamp(data?.businessNameUpdatedAt),
          businessLogo: (data?.businessLogo as string | null) ?? null,
          businessPhone: (data?.businessPhone as string) ?? '',
          businessWebsite: (data?.businessWebsite as string) ?? '',
          returnAddress: (data?.returnAddress as string) ?? '',
          storefrontEnabled: normalizeBoolean(data?.storefrontEnabled),
          storefrontSlug: resolveStorefrontSlug({
            storefrontSlug: typeof data?.storefrontSlug === 'string' ? data.storefrontSlug : '',
            businessName,
            companyName,
          }),
          storefrontCustomDomain: typeof data?.storefrontCustomDomain === 'string' ? data.storefrontCustomDomain : '',
          woocommerceEnabled: normalizeBoolean(data?.woocommerceEnabled),
          woocommerceStoreUrl: typeof data?.woocommerceStoreUrl === 'string' ? data.woocommerceStoreUrl : '',
          woocommerceConsumerKey: typeof data?.woocommerceConsumerKey === 'string' ? data.woocommerceConsumerKey : '',
          woocommerceConsumerSecret: typeof data?.woocommerceConsumerSecret === 'string' ? data.woocommerceConsumerSecret : '',
          woocommerceAutoLinkOrders: normalizeBoolean(data?.woocommerceAutoLinkOrders),
          featureAccess: normalizeBusinessFeatureAccess(data?.featureAccess),
        };

        await persistSettingsCache(businessId, remoteSettings);
        return remoteSettings;
      }
    }

    // Fallback to AsyncStorage (offline or if Supabase fails)
    const key = getSettingsKey(businessId);
    const stored = await AsyncStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<BusinessSettings>;
      const businessName = parsed.businessName?.trim() || parsed.companyName?.trim() || '';
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        businessName,
        businessSlug: resolveBusinessSlug(parsed.businessSlug, businessName, parsed.companyName ?? ''),
        featureAccess: normalizeBusinessFeatureAccess(parsed.featureAccess),
      };
    }

    // Only use legacy key when there is no business selected
    if (!businessId) {
      const legacy = await AsyncStorage.getItem(BUSINESS_SETTINGS_KEY);
      if (legacy) {
        const parsed = JSON.parse(legacy) as Partial<BusinessSettings>;
        const businessName = parsed.businessName?.trim() || parsed.companyName?.trim() || '';
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          businessName,
          businessSlug: resolveBusinessSlug(parsed.businessSlug, businessName, parsed.companyName ?? ''),
          featureAccess: normalizeBusinessFeatureAccess(parsed.featureAccess),
        };
      }
    }

    return DEFAULT_SETTINGS;
  } catch (err) {
    console.log('Failed to load business settings:', err);
    return DEFAULT_SETTINGS;
  }
};

const businessSettingsQueryKey = (businessId: string | null | undefined, isOfflineMode: boolean) => [
  'businessSettings',
  businessId ?? 'none',
  isOfflineMode,
] as const;

/**
 * Hook for managing business settings
 * Syncs business name with businesses table (like Instagram account)
 * Other settings stored in JSONB data column
 */
export function useBusinessSettings(): BusinessSettingsResult {
  const businessId = useAuthStore((s) => s.businessId);
  const isOfflineMode = useAuthStore((s) => s.isOfflineMode);
  const isApplyingRemote = useRef(false);
  const queryClient = useQueryClient();

  const queryKey = businessSettingsQueryKey(businessId, isOfflineMode);
  // Shared across every screen that calls this hook, so navigating between
  // screens reuses the cached result instead of re-fetching and flashing a
  // loading state each time (see: app "refreshing" on every navigation).
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchBusinessSettings(businessId, isOfflineMode),
  });
  const settings = data ?? DEFAULT_SETTINGS;

  const setSettings = useCallback((next: BusinessSettings) => {
    queryClient.setQueryData(queryKey, next);
  }, [queryClient, queryKey]);

  // Set up realtime subscription for cross-browser sync on businesses table
  useEffect(() => {
    if (!businessId || isOfflineMode) return;

    const channel = supabase
      .channel(`business-${businessId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'businesses',
          filter: `id=eq.${businessId}`,
        },
        (payload) => {
          if (isApplyingRemote.current) return;

          console.log('Business updated via realtime:', payload);
          const newData = payload.new as Record<string, unknown>;

          if (newData) {
            const data = newData.data as Record<string, unknown> | null;
            const companyName = typeof newData.name === 'string' ? newData.name : '';
            const storedBusinessName = typeof data?.businessName === 'string' ? data.businessName.trim() : '';
            const businessName = storedBusinessName || companyName;
            const updatedSettings: BusinessSettings = {
              companyName,
              businessName,
              businessSlug: resolveBusinessSlug(data?.businessSlug, businessName, companyName),
              businessNameLastUpdatedAt: normalizeTimestamp(data?.businessNameUpdatedAt),
              businessLogo: (data?.businessLogo as string | null) ?? null,
              businessPhone: (data?.businessPhone as string) ?? '',
              businessWebsite: (data?.businessWebsite as string) ?? '',
              returnAddress: (data?.returnAddress as string) ?? '',
              storefrontEnabled: normalizeBoolean(data?.storefrontEnabled),
              storefrontSlug: resolveStorefrontSlug({
                storefrontSlug: typeof data?.storefrontSlug === 'string' ? data.storefrontSlug : '',
                businessName,
                companyName,
              }),
              storefrontCustomDomain: typeof data?.storefrontCustomDomain === 'string' ? data.storefrontCustomDomain : '',
              woocommerceEnabled: normalizeBoolean(data?.woocommerceEnabled),
              woocommerceStoreUrl: typeof data?.woocommerceStoreUrl === 'string' ? data.woocommerceStoreUrl : '',
              woocommerceConsumerKey: typeof data?.woocommerceConsumerKey === 'string' ? data.woocommerceConsumerKey : '',
              woocommerceConsumerSecret: typeof data?.woocommerceConsumerSecret === 'string' ? data.woocommerceConsumerSecret : '',
              woocommerceAutoLinkOrders: normalizeBoolean(data?.woocommerceAutoLinkOrders),
              featureAccess: normalizeBusinessFeatureAccess(data?.featureAccess),
            };

            setSettings(updatedSettings);
            void persistSettingsCache(businessId, updatedSettings);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [businessId, isOfflineMode]);

  const saveSettingsToStorage = useCallback(async (newSettings: BusinessSettings): Promise<{ success: boolean; error?: string }> => {
    const trimmedCompanyName = newSettings.companyName.trim();
    const trimmedBusinessName = newSettings.businessName.trim();
    if (!trimmedCompanyName) {
      return { success: false, error: 'Company name cannot be empty' };
    }
    if (!trimmedBusinessName) {
      return { success: false, error: 'Business name cannot be empty' };
    }

    try {
      isApplyingRemote.current = true;
      const previousBusinessName = settings.businessName.trim();
      const isBusinessNameChanging = trimmedBusinessName !== previousBusinessName;
      const { canEditBusinessName, businessNameNextEditableAt } = getBusinessNameEditAvailability(settings);

      if (isBusinessNameChanging && !canEditBusinessName) {
        const nextDateLabel = businessNameNextEditableAt
          ? new Date(businessNameNextEditableAt).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })
          : null;
        return {
          success: false,
          error: nextDateLabel
            ? `Business name can only be changed once a year. Next change available ${nextDateLabel}.`
            : 'Business name can only be changed once a year.',
        };
      }

      const normalizedSettings: BusinessSettings = {
        ...newSettings,
        companyName: trimmedCompanyName,
        businessName: trimmedBusinessName,
        businessSlug: resolveBusinessSlug(newSettings.businessSlug, trimmedBusinessName, trimmedCompanyName),
        businessLogo: sanitizePersistedBusinessLogo(newSettings.businessLogo),
        businessNameLastUpdatedAt: isBusinessNameChanging
          ? new Date().toISOString()
          : normalizeTimestamp(newSettings.businessNameLastUpdatedAt),
        storefrontSlug: resolveStorefrontSlug({
          storefrontSlug: newSettings.storefrontSlug,
          businessName: trimmedBusinessName,
          companyName: trimmedCompanyName,
        }),
        storefrontCustomDomain: newSettings.storefrontCustomDomain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, ''),
        woocommerceStoreUrl: newSettings.woocommerceStoreUrl.trim().replace(/\/+$/, ''),
        woocommerceConsumerKey: newSettings.woocommerceConsumerKey.trim(),
        woocommerceConsumerSecret: newSettings.woocommerceConsumerSecret.trim(),
      };

      if (
        normalizedSettings.woocommerceEnabled &&
        (
          !normalizedSettings.woocommerceStoreUrl ||
          !normalizedSettings.woocommerceConsumerKey ||
          !normalizedSettings.woocommerceConsumerSecret
        )
      ) {
        return {
          success: false,
          error: 'Add the WooCommerce store URL, consumer key, and consumer secret before enabling WooCommerce.',
        };
      }

      // Save to Supabase businesses table (for online mode)
      if (businessId && !isOfflineMode) {
        const { data: businessRow } = await supabase
          .from('businesses')
          .select('data')
          .eq('id', businessId)
          .maybeSingle();

        const existingData = (businessRow?.data as Record<string, unknown> | null) ?? {};
        const mergedData = {
          ...existingData,
          businessName: normalizedSettings.businessName,
          businessSlug: normalizedSettings.businessSlug,
          businessNameUpdatedAt: normalizedSettings.businessNameLastUpdatedAt,
          businessLogo: normalizedSettings.businessLogo,
          businessPhone: normalizedSettings.businessPhone,
          businessWebsite: normalizedSettings.businessWebsite,
          returnAddress: normalizedSettings.returnAddress,
          storefrontEnabled: normalizedSettings.storefrontEnabled,
          storefrontSlug: normalizedSettings.storefrontSlug,
          storefrontCustomDomain: normalizedSettings.storefrontCustomDomain,
          woocommerceEnabled: normalizedSettings.woocommerceEnabled,
          woocommerceStoreUrl: normalizedSettings.woocommerceStoreUrl,
          woocommerceConsumerKey: normalizedSettings.woocommerceConsumerKey,
          woocommerceConsumerSecret: normalizedSettings.woocommerceConsumerSecret,
          woocommerceAutoLinkOrders: normalizedSettings.woocommerceAutoLinkOrders,
          featureAccess: normalizeBusinessFeatureAccess(normalizedSettings.featureAccess),
        };

        let { error: businessError } = await supabase
          .from('businesses')
          .update({
            name: normalizedSettings.companyName,
            data: mergedData,
          })
          .eq('id', businessId);

        if (businessError && businessError.message?.includes('column')) {
          console.warn('Failed to save to Supabase:', businessError);
          return { success: false, error: buildSettingsErrorMessage('Could not sync settings.', businessError) };
        } else if (businessError) {
          console.warn('Failed to save to Supabase:', businessError);
          return { success: false, error: buildSettingsErrorMessage('Could not sync settings.', businessError) };
        }
      }

      setSettings(normalizedSettings);
      await persistSettingsCache(businessId, normalizedSettings);

      return { success: true };
    } catch (err) {
      console.error('Failed to save settings:', err);
      return { success: false, error: buildSettingsErrorMessage('Failed to save settings.', err) };
    } finally {
      isApplyingRemote.current = false;
    }
  }, [businessId, isOfflineMode, settings]);

  const updateBusinessName = useCallback(async (name: string): Promise<{ success: boolean; error?: string }> => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return { success: false, error: 'Business name cannot be empty' };
    }

    const newSettings: BusinessSettings = {
      ...settings,
      businessName: trimmedName,
    };
    return saveSettingsToStorage(newSettings);
  }, [saveSettingsToStorage, settings]);

  const updateBusinessLogo = useCallback(async (logoUri: string | null): Promise<void> => {
    const newSettings: BusinessSettings = {
      ...settings,
      businessLogo: logoUri,
    };
    await saveSettingsToStorage(newSettings);
  }, [saveSettingsToStorage, settings]);

  const saveSettings = useCallback(async (partialSettings: Partial<BusinessSettings>): Promise<{ success: boolean; error?: string }> => {
    const resolvedName = partialSettings.businessName?.trim() || settings.businessName.trim();
    const resolvedCompanyName = partialSettings.companyName?.trim() || settings.companyName.trim();
    const newSettings: BusinessSettings = {
      ...settings,
      ...partialSettings,
      companyName: resolvedCompanyName,
      businessName: resolvedName,
    };

    if (!resolvedCompanyName) {
      return { success: false, error: 'Company name cannot be empty' };
    }
    if (!resolvedName) {
      return { success: false, error: 'Business name cannot be empty' };
    }

    return saveSettingsToStorage(newSettings);
  }, [saveSettingsToStorage, settings]);

  const { canEditBusinessName, businessNameNextEditableAt } = getBusinessNameEditAvailability(settings);

    return {
      companyName: settings.companyName,
      businessName: settings.businessName,
      businessSlug: settings.businessSlug || resolveBusinessSlug(settings.businessSlug, settings.businessName, settings.companyName),
      businessNameLastUpdatedAt: settings.businessNameLastUpdatedAt,
    canEditBusinessName,
    businessNameNextEditableAt,
      businessLogo: settings.businessLogo,
      businessPhone: settings.businessPhone,
      businessWebsite: settings.businessWebsite,
      returnAddress: settings.returnAddress,
      storefrontEnabled: settings.storefrontEnabled,
      storefrontSlug: resolveStorefrontSlug({
        storefrontSlug: settings.storefrontSlug,
        businessName: settings.businessName,
        companyName: settings.companyName,
      }),
      storefrontCustomDomain: settings.storefrontCustomDomain,
      woocommerceEnabled: settings.woocommerceEnabled,
      woocommerceStoreUrl: settings.woocommerceStoreUrl,
      woocommerceConsumerKey: settings.woocommerceConsumerKey,
      woocommerceConsumerSecret: settings.woocommerceConsumerSecret,
      woocommerceAutoLinkOrders: settings.woocommerceAutoLinkOrders,
      featureAccess: normalizeBusinessFeatureAccess(settings.featureAccess),
      hasWooCommerceConnection: Boolean(
        settings.woocommerceStoreUrl.trim()
        && settings.woocommerceConsumerKey.trim()
        && settings.woocommerceConsumerSecret.trim()
      ),
      isLoading,
      updateBusinessName,
      updateBusinessLogo,
      saveSettings,
  };
}
