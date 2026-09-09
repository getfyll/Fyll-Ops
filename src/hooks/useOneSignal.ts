import { useEffect, useState } from 'react';
import Constants from 'expo-constants';
import { isPartnerPortalHostname } from '@/lib/partner-host';

const ONESIGNAL_SDK_URL = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';

let lastLoggedInUserId: string | null = null;
let loginInFlightUserId: string | null = null;
let oneSignalInitPromise: Promise<void> | null = null;
let oneSignalInitCompleted = false;
let oneSignalIdentitySyncPromise: Promise<void> | null = null;
let oneSignalListenersRegistered = false;
let desiredExternalUserId: string | null = null;
const desiredUserTags = new Map<string, string>();

const getCurrentExternalId = (oneSignal: any): string | null => {
  const externalId = oneSignal?.User?.externalId;
  return typeof externalId === 'string' && externalId.length > 0 ? externalId : null;
};

const syncDesiredTags = async (oneSignal: any) => {
  const entries = Array.from(desiredUserTags.entries())
    .map(([key, value]) => [key.trim(), value.trim()] as const)
    .filter(([key, value]) => key.length > 0 && value.length > 0);
  if (entries.length === 0) return;

  try {
    if (typeof oneSignal?.User?.addTags === 'function') {
      await oneSignal.User.addTags(Object.fromEntries(entries));
      return;
    }

    await Promise.all(entries.map(async ([key, value]) => {
      await oneSignal.User.addTag(key, value);
    }));
  } catch (err) {
    console.warn('[OneSignal] addTags error:', err);
  }
};

const isIdentityConflictError = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;

  const status = 'status' in error && typeof error.status === 'number' ? error.status : undefined;
  const code = 'code' in error ? String((error as { code?: unknown }).code ?? '') : '';
  const message = 'message' in error && typeof error.message === 'string' ? error.message : '';
  const normalizedMessage = message.toLowerCase();

  return status === 409
    || code === '409'
    || (normalizedMessage.includes('409') && normalizedMessage.includes('conflict'))
    || normalizedMessage.includes('identity');
};

declare global {
  interface Window {
    OneSignalDeferred?: ((os: any) => void)[];
    OneSignal?: any;
  }
}

const isPartnerPortalContext = () => {
  if (typeof window === 'undefined') return false;
  const pathname = window.location.pathname;
  return isPartnerPortalHostname(window.location.hostname)
    || pathname.startsWith('/partner')
    || pathname.startsWith('/partner-login')
    || pathname.startsWith('/partner-invite');
};

const getAppId = () => {
  if (isPartnerPortalContext()) {
    return Constants.expoConfig?.extra?.partnerOnesignalAppId
      ?? process.env.EXPO_PUBLIC_PARTNER_ONESIGNAL_APP_ID
      ?? Constants.expoConfig?.extra?.onesignalAppId
      ?? process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID
      ?? '';
  }

  return Constants.expoConfig?.extra?.onesignalAppId ?? process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID ?? '';
};

const getSafariWebId = () => {
  if (isPartnerPortalContext()) {
    return Constants.expoConfig?.extra?.partnerOnesignalSafariWebId
      ?? process.env.EXPO_PUBLIC_PARTNER_ONESIGNAL_SAFARI_WEB_ID
      ?? '';
  }

  return Constants.expoConfig?.extra?.onesignalSafariWebId ?? process.env.EXPO_PUBLIC_ONESIGNAL_SAFARI_WEB_ID ?? '';
};

const getServiceWorkerUrl = () => {
  if (typeof window === 'undefined') return '/service-worker.js';
  return new URL('/service-worker.js', window.location.origin).toString();
};

const ONESIGNAL_SERVICE_WORKER_PATH = 'onesignal/OneSignalSDKWorker.js';
const ONESIGNAL_SERVICE_WORKER_UPDATER_PATH = 'onesignal/OneSignalSDKUpdaterWorker.js';
const ONESIGNAL_SERVICE_WORKER_SCOPE = '/onesignal/';

const isAlreadyInitializedError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.toLowerCase().includes('already initialized');
};

// The OneSignal app is locked in its dashboard to these production origins —
// init() throws "Can only be used on: https://www.fyll.app" on any other
// origin (localhost, preview URLs, etc). That failure is permanent for a
// given origin, so there's no point attempting (and retrying) it there.
const ONESIGNAL_AUTHORIZED_HOSTNAMES = new Set(['fyll.app', 'www.fyll.app', 'partner.fyll.app']);

const isOneSignalAuthorizedOrigin = () => {
  if (typeof window === 'undefined') return false;
  return ONESIGNAL_AUTHORIZED_HOSTNAMES.has(window.location.hostname.toLowerCase());
};

const logCurrentSubscriptionState = (oneSignal: any, reason: string) => {
  const pushSubscription = oneSignal?.User?.PushSubscription;
  console.log('[OneSignal] sync state', {
    reason,
    externalId: getCurrentExternalId(oneSignal),
    onesignalId: oneSignal?.User?.onesignalId ?? null,
    subscriptionId: pushSubscription?.id ?? null,
    optedIn: pushSubscription?.optedIn ?? null,
    permission: oneSignal?.Notifications?.permission ?? null,
  });
};

const ensureOneSignalIdentity = async (oneSignal: any, reason: string) => {
  const targetUserId = desiredExternalUserId?.trim() ?? '';
  if (!targetUserId) return;
  if (oneSignalIdentitySyncPromise) {
    await oneSignalIdentitySyncPromise;
    return;
  }

  oneSignalIdentitySyncPromise = (async () => {
    loginInFlightUserId = targetUserId;
    try {
      const existingExternalId = getCurrentExternalId(oneSignal);
      if (existingExternalId === targetUserId) {
        await syncDesiredTags(oneSignal);
        lastLoggedInUserId = targetUserId;
        logCurrentSubscriptionState(oneSignal, `${reason}:already-linked`);
        return;
      }

      if (existingExternalId && existingExternalId !== targetUserId) {
        await oneSignal.logout();
      }

      await oneSignal.login(targetUserId);
      await syncDesiredTags(oneSignal);
      lastLoggedInUserId = targetUserId;
      logCurrentSubscriptionState(oneSignal, `${reason}:login`);
    } catch (err) {
      if (isIdentityConflictError(err)) {
        const externalIdAfterConflict = getCurrentExternalId(oneSignal);
        if (externalIdAfterConflict === targetUserId) {
          await syncDesiredTags(oneSignal);
          lastLoggedInUserId = targetUserId;
          logCurrentSubscriptionState(oneSignal, `${reason}:conflict-reused`);
          return;
        }

        try {
          await oneSignal.logout();
          await oneSignal.login(targetUserId);
          await syncDesiredTags(oneSignal);
          lastLoggedInUserId = targetUserId;
          logCurrentSubscriptionState(oneSignal, `${reason}:conflict-retry`);
          return;
        } catch (retryErr) {
          console.warn('[OneSignal] login retry after identity conflict failed:', retryErr);
        }
      } else {
        console.warn('[OneSignal] identity sync error:', err);
      }
    } finally {
      loginInFlightUserId = null;
      oneSignalIdentitySyncPromise = null;
    }
  })();

  await oneSignalIdentitySyncPromise;
};

const registerOneSignalListeners = (oneSignal: any) => {
  if (oneSignalListenersRegistered) return;

  try {
    oneSignal?.User?.addEventListener?.('change', (event: unknown) => {
      console.log('[OneSignal] user state changed', event);
    });

    oneSignal?.Notifications?.addEventListener?.('permissionChange', (permission: boolean) => {
      console.log('[OneSignal] permission changed', { permission });
      if (permission) {
        void ensureOneSignalIdentity(oneSignal, 'permission-change');
      }
    });

    oneSignal?.User?.PushSubscription?.addEventListener?.('change', (event: unknown) => {
      console.log('[OneSignal] push subscription changed', event);
      void ensureOneSignalIdentity(oneSignal, 'push-subscription-change');
    });

    oneSignalListenersRegistered = true;
  } catch (err) {
    console.warn('[OneSignal] listener registration error:', err);
  }
};

const loginOneSignalUser = (userId: string) => {
  const normalizedUserId = userId.trim();
  if (typeof window === 'undefined' || !normalizedUserId) return;

  desiredExternalUserId = normalizedUserId;
  desiredUserTags.set('user_id', normalizedUserId);

  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async (OneSignal: any) => {
    try {
      registerOneSignalListeners(OneSignal);
      await ensureOneSignalIdentity(OneSignal, 'login-call');

      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          const sw = reg.active ?? reg.installing ?? reg.waiting;
          const scriptUrl = sw?.scriptURL ?? '';
          const scope = reg.scope ?? '';
          const isStale =
            (scriptUrl.includes('OneSignalSDKWorker') || scriptUrl.includes('OneSignalSDK.sw')) &&
            !scope.includes('/onesignal');
          if (isStale) {
            console.log('[OneSignal] Removing stale duplicate worker after login:', scope);
            await reg.unregister();
          }
        }
      }
    } catch (err) {
      console.warn('[OneSignal] login error:', err);
    }
  });
};

const setOneSignalTag = (key: string, value: string) => {
  const normalizedKey = key.trim();
  const normalizedValue = value.trim();
  if (typeof window === 'undefined' || !normalizedKey || !normalizedValue) return;

  desiredUserTags.set(normalizedKey, normalizedValue);
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async (OneSignal: any) => {
    try {
      registerOneSignalListeners(OneSignal);
      await syncDesiredTags(OneSignal);
      if (desiredExternalUserId) {
        await ensureOneSignalIdentity(OneSignal, `tag-sync:${normalizedKey}`);
      }
    } catch (err) {
      console.warn(`[OneSignal] addTag ${normalizedKey} error:`, err);
    }
  });
};

const logoutOneSignalUser = () => {
  if (typeof window === 'undefined') return;
  desiredExternalUserId = null;
  desiredUserTags.clear();
  loginInFlightUserId = null;
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async (OneSignal: any) => {
    try {
      await OneSignal.logout();
      lastLoggedInUserId = null;
      console.log('[OneSignal] Logged out');
    } catch (err) {
      console.warn('[OneSignal] logout error:', err);
    }
  });
};

const getOneSignalDebugState = async () => {
  if (typeof window === 'undefined') return null;

  return await new Promise<Record<string, unknown> | null>((resolve) => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal: any) => {
      try {
        const pushSubscription = OneSignal?.User?.PushSubscription;
        let tags: Record<string, string> | null = null;

        try {
          if (typeof OneSignal?.User?.getTags === 'function') {
            const result = await OneSignal.User.getTags();
            tags = result && typeof result === 'object'
              ? Object.fromEntries(
                Object.entries(result as Record<string, unknown>)
                  .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
              )
              : null;
          }
        } catch (tagError) {
          console.warn('[OneSignal] debug getTags error:', tagError);
        }

        resolve({
          desiredExternalUserId,
          lastLoggedInUserId,
          loginInFlightUserId,
          permission: OneSignal?.Notifications?.permission ?? null,
          externalId: getCurrentExternalId(OneSignal),
          onesignalId: OneSignal?.User?.onesignalId ?? null,
          subscriptionId: pushSubscription?.id ?? null,
          subscriptionToken: pushSubscription?.token ?? null,
          optedIn: pushSubscription?.optedIn ?? null,
          tags,
        });
      } catch (err) {
        console.warn('[OneSignal] debug state error:', err);
        resolve(null);
      }
    });
  });
};

const forceOneSignalResync = async () => {
  if (typeof window === 'undefined') return null;

  return await new Promise<Record<string, unknown> | null>((resolve) => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal: any) => {
      try {
        registerOneSignalListeners(OneSignal);
        await ensureOneSignalIdentity(OneSignal, 'manual-resync');
        const snapshot = await getOneSignalDebugState();
        resolve(snapshot);
      } catch (err) {
        console.warn('[OneSignal] manual resync error:', err);
        resolve(null);
      }
    });
  });
};

export function useOneSignal() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!isOneSignalAuthorizedOrigin()) {
      console.log(`[OneSignal] Skipping init on unauthorized origin: ${window.location.origin}`);
      return;
    }

    const appId = getAppId();
    if (!appId) {
      console.warn('[OneSignal] No app ID found, skipping init');
      return;
    }

    const queueOneSignalInit = () => {
      window.OneSignalDeferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred.push(async (OneSignal: any) => {
        try {
          if (!oneSignalInitPromise) {
            oneSignalInitPromise = (async () => {
              await OneSignal.init({
                appId,
                safari_web_id: getSafariWebId(),
                allowLocalhostAsSecureOrigin: true,
                notifyButton: { enable: true },
                serviceWorkerPath: ONESIGNAL_SERVICE_WORKER_PATH,
                serviceWorkerUpdaterPath: ONESIGNAL_SERVICE_WORKER_UPDATER_PATH,
                serviceWorkerParam: { scope: ONESIGNAL_SERVICE_WORKER_SCOPE },
              });
              oneSignalInitCompleted = true;
              console.log('[OneSignal] Initialized with app ID:', appId);
            })().catch((err) => {
              oneSignalInitPromise = null;
              oneSignalInitCompleted = false;
              throw err;
            });
          }

          await oneSignalInitPromise;
          registerOneSignalListeners(OneSignal);
          setIsReady(true);
        } catch (err) {
          if (isAlreadyInitializedError(err)) {
            oneSignalInitCompleted = true;
            registerOneSignalListeners(OneSignal);
            setIsReady(true);
            console.warn('[OneSignal] init skipped because SDK was already initialized');
            return;
          }
          console.warn('[OneSignal] init error:', err);
        }
      });
    };

    const bootstrap = async () => {
      if ('serviceWorker' in navigator) {
        try {
          // Unregister any stale root-scope OneSignal service workers from older SDK
          // versions. These create duplicate push subscriptions alongside the current
          // /onesignal/ scoped worker, causing multiple notifications per message.
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(
            registrations
              .filter((reg) => {
                const scope = reg.scope ?? '';
                const isRootScope = scope.endsWith('/') && !scope.includes('/onesignal');
                const sw = reg.active ?? reg.installing ?? reg.waiting;
                const scriptUrl = sw?.scriptURL ?? '';
                const isLegacyOneSignal =
                  scriptUrl.includes('OneSignalSDKWorker') ||
                  scriptUrl.includes('OneSignalSDK.sw');
                return isRootScope && isLegacyOneSignal;
              })
              .map((reg) => {
                console.log('[OneSignal] Removing stale root-scope worker:', reg.scope);
                return reg.unregister();
              })
          );

          await navigator.serviceWorker.register(getServiceWorkerUrl());
          await navigator.serviceWorker.ready;
        } catch (err) {
          console.warn('[OneSignal] service worker pre-registration failed:', err);
        }
      }
      if (oneSignalInitCompleted) {
        setIsReady(true);
      }
      queueOneSignalInit();
    };

    if (document.querySelector('script[data-onesignal-sdk]')) {
      void bootstrap();
      return;
    }

    const script = document.createElement('script');
    script.src = ONESIGNAL_SDK_URL;
    script.async = true;
    script.defer = true;
    script.setAttribute('data-onesignal-sdk', 'true');
    document.head.appendChild(script);

    void bootstrap();
  }, []);

  return {
    isReady,
    loginOneSignalUser,
    logoutOneSignalUser,
    setOneSignalTag,
    getOneSignalDebugState,
    forceOneSignalResync,
  };
}
