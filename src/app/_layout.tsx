import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, usePathname, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from '@/lib/useColorScheme';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import useAuthStore from '@/lib/state/auth-store';
import useFyllStore from '@/lib/state/fyll-store';
import { useEffect, useRef, useState } from 'react';
import { useSupabaseSync } from '@/hooks/useSupabaseSync';
import { Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaProvider, initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LayoutDashboard, Package, ShoppingCart, MoreHorizontal, MessageSquare } from 'lucide-react-native';
import { useWebPushNotifications } from '@/hooks/useWebPushNotifications';
import { useExpoPushRegistration } from '@/hooks/useExpoPushNotifications';
import NetInfo from '@react-native-community/netinfo';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/lib/supabase';
import { isStorefrontHostname } from '@/lib/storefront-url';
import { isPlatformAdminHostname } from '@/lib/platform-admin-url';
import { isPartnerPortalHostname } from '@/lib/partner-host';
import { FYLL_PUBLIC_APP_ORIGIN } from '@/lib/fyll-app-url';
import {
  isCustomerPortalHostname,
  isDeliveryConfirmationHostname,
  isReturnsHostname,
} from '@/lib/tracking-host';
import { GlobalFloatingActions } from '@/components/GlobalFloatingActions';
import { RootErrorBoundary } from '@/components/RootErrorBoundary';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { useThemeColors } from '@/lib/theme';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { isBusinessFeatureEnabled, type BusinessFeatureKey } from '@/lib/feature-access';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();
WebBrowser.maybeCompleteAuthSession();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});
const webInitialMetrics = {
  frame: { x: 0, y: 0, width: 0, height: 0 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
const PUBLIC_ROUTE_SEGMENTS = new Set(['login', 'welcome', 'start', 'request-invite', 'track', 'order-tracking', 'confirm-delivery', 'start-return', 'checkout', 'platform-admin-login', 'partner', 'partner-login', 'partner-invite']);
const WOO_CONNECT_SESSION_KEY = 'fyll_woocommerce_connect_params';
const ROUTE_FEATURES: Record<string, BusinessFeatureKey> = {
  payments: 'socialCheckout',
  'social-checkout': 'socialCheckout',
  'storefront-payment': 'socialCheckout',
  'payment-accounts': 'socialCheckout',
  threads: 'threads',
  cases: 'cases',
  case: 'cases',
  team: 'teamMembers',
  invitations: 'teamMembers',
  tasks: 'tasks',
  task: 'tasks',
  finance: 'finance',
  calculator: 'finance',
  insights: 'insights',
  deliveries: 'delivery',
  returns: 'returns',
  announcements: 'announcements',
  'storefront-settings': 'storefront',
  'storefront-prototype': 'storefront',
  'storefront-product': 'storefront',
  'storefront-cart': 'storefront',
  'storefront-checkout': 'storefront',
  'storefront-thank-you': 'storefront',
  'woocommerce-settings': 'woocommerce',
  'order-automation': 'orderAutomation',
  'email-settings': 'orderAutomation',
  'fyll-print': 'fyllPrint',
  'import-ai': 'aiImport',
};

function RootMobileBottomNav({ visible }: { visible: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  const isLight = colors.bg.primary === '#FFFFFF';
  const activeBg = isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.14)';
  const tabBarHeight = Platform.OS === 'ios' ? 82 : 76;
  const items = [
    {
      key: 'home',
      label: 'Home',
      route: '/(tabs)' as const,
      Icon: LayoutDashboard,
      active: pathname === '/' || pathname === '/(tabs)',
    },
    {
      key: 'inventory',
      label: 'Inventory',
      route: '/(tabs)/inventory' as const,
      Icon: Package,
      active: pathname.startsWith('/inventory') || pathname.startsWith('/product') || pathname.startsWith('/new-product'),
    },
    {
      key: 'orders',
      label: 'Orders',
      route: '/(tabs)/orders' as const,
      Icon: ShoppingCart,
      active: pathname.startsWith('/orders') || pathname.startsWith('/order/') || pathname.startsWith('/new-order'),
    },
    {
      key: 'threads',
      label: 'Threads',
      route: '/(tabs)/threads' as const,
      Icon: MessageSquare,
      active: pathname.startsWith('/threads'),
    },
    {
      key: 'more',
      label: 'More',
      route: '/(tabs)/settings' as const,
      Icon: MoreHorizontal,
      active: pathname.startsWith('/settings') || pathname.startsWith('/partners') || pathname.startsWith('/partner-bills') || pathname.startsWith('/finance') || pathname.startsWith('/case') || pathname.startsWith('/return') || pathname.startsWith('/team') || pathname.startsWith('/task'),
    },
  ];

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 28,
        zIndex: 200,
        elevation: 200,
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingBottom: Math.max(14, insets.bottom + 6),
      }}
    >
      <View
        style={{
          width: '100%',
          height: tabBarHeight,
          borderRadius: 999,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: isLight ? 'rgba(255, 255, 255, 0.72)' : 'rgba(255, 255, 255, 0.12)',
          backgroundColor: isLight ? 'rgba(255, 255, 255, 0.78)' : 'rgba(24, 24, 24, 0.72)',
          shadowColor: '#000000',
          shadowOpacity: isLight ? 0.14 : 0.28,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 10 },
          elevation: 18,
        }}
      >
        <BlurView
          intensity={Platform.OS === 'ios' ? 38 : 26}
          tint={isLight ? 'light' : 'dark'}
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            paddingTop: 7,
            paddingBottom: Platform.OS === 'ios' ? 12 : 8,
            paddingHorizontal: 6,
          }}
        >
          {items.map((item) => {
            const color = item.active ? colors.tabBar.active : colors.tabBar.inactive;
            return (
              <Pressable
                key={item.key}
                onPress={() => router.push(item.route as never)}
                style={{
                  flex: 1,
                  height: 62,
                  alignItems: 'center',
                  justifyContent: 'center',
                  ...(Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0, outlineColor: 'transparent' } as any) : {}),
                }}
              >
                <View
                  style={{
                    width: 54,
                    height: 40,
                    marginTop: 2,
                    borderRadius: 999,
                    backgroundColor: item.active ? activeBg : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <item.Icon size={23} color={color} strokeWidth={item.active ? 2.5 : 2} />
                </View>
                <Text
                  style={{
                    color,
                    fontSize: 10,
                    fontWeight: '600',
                    lineHeight: 12,
                    height: 12,
                  }}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </BlurView>
      </View>
    </View>
  );
}

function RootLayoutNav({ colorScheme }: { colorScheme: 'light' | 'dark' | null | undefined }) {
  const router = useRouter();
  const pathname = usePathname();
  const segments = useSegments();
  const colors = useThemeColors();
  const { isDesktop, isMobile } = useBreakpoint();
  const routeSegments = segments as string[];
  const firstSegment = String(routeSegments[0] ?? '');
  const secondSegment = String(routeSegments[1] ?? '');
  const isStorefrontHost = Platform.OS === 'web' && typeof window !== 'undefined'
    ? isStorefrontHostname(window.location.hostname)
    : false;
  const isPlatformAdminHost = Platform.OS === 'web' && typeof window !== 'undefined'
    ? isPlatformAdminHostname(window.location.hostname)
    : false;
  const isCustomerPortalHost = Platform.OS === 'web' && typeof window !== 'undefined'
    ? isCustomerPortalHostname(window.location.hostname)
    : false;
  const isReturnsHost = Platform.OS === 'web' && typeof window !== 'undefined'
    ? isReturnsHostname(window.location.hostname)
    : false;
  const isDeliveryConfirmationHost = Platform.OS === 'web' && typeof window !== 'undefined'
    ? isDeliveryConfirmationHostname(window.location.hostname)
    : false;
  const isPartnerPortalHost = Platform.OS === 'web' && typeof window !== 'undefined'
    ? isPartnerPortalHostname(window.location.hostname)
    : false;
  const inPublicRoute = PUBLIC_ROUTE_SEGMENTS.has(firstSegment)
    || secondSegment === 'confirm-delivery'
    || secondSegment === 'order-tracking'
    || secondSegment === 'start-return'
    || secondSegment === 'track'
    || secondSegment === 'checkout'
    || isCustomerPortalHost
    || isStorefrontHost
    || isPlatformAdminHost
    || isPartnerPortalHost;
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { featureAccess, isLoading: isLoadingBusinessSettings } = useBusinessSettings();
  const isOfflineMode = useAuthStore((s) => s.isOfflineMode);
  const setOfflineMode = useAuthStore((s) => s.setOfflineMode);
  const syncWithSupabaseSession = useAuthStore((s) => s.syncWithSupabaseSession);
  const refreshTeamData = useAuthStore((s) => s.refreshTeamData);
  const currentUserId = useAuthStore((s) => s.currentUser?.id ?? null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [hasHiddenNativeSplash, setHasHiddenNativeSplash] = useState(false);
  const [isBootstrappingApp, setIsBootstrappingApp] = useState(true);
  const bootstrapStartedRef = useRef(false);
  const isNavigationReady = isHydrated && !isBootstrappingApp;
  const showGlobalFloatingActions = Platform.OS === 'web'
    && isDesktop
    && isAuthenticated
    && !inPublicRoute
    && pathname !== '/'
    && pathname !== '/(tabs)'
    && !pathname.startsWith('/threads')
    && !pathname.startsWith('/(tabs)/threads');
  const isBottomActionRoute = firstSegment === 'new-order'
    || firstSegment === 'order'
    || firstSegment === 'order-edit'
    || firstSegment === 'new-product'
    || firstSegment === 'new-service'
    || firstSegment === 'product'
    || firstSegment === 'procurement'
    || firstSegment === 'expense'
    || firstSegment === 'case'
    || firstSegment === 'task'
    || firstSegment === 'return'
    || firstSegment === 'social-checkout'
    || firstSegment === 'storefront-payment'
    || firstSegment === 'payment-accounts';
  const showRootMobileBottomNav = isMobile
    && isAuthenticated
    && !inPublicRoute
    && firstSegment !== '(tabs)'
    && !isBottomActionRoute;

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || !isPartnerPortalHost) return;
    document.title = 'Fyll Partner';

    const setLinkHref = (selector: string, href: string) => {
      const link = document.querySelector<HTMLLinkElement>(selector);
      if (link) link.href = href;
    };
    setLinkHref('link[rel="icon"]', '/favicon-partner-32.png');
    setLinkHref('link[rel="shortcut icon"]', '/favicon-partner-32.png');
    setLinkHref('link[rel="apple-touch-icon"]', '/icons/apple-touch-icon-partner-180.png');
    setLinkHref('link[rel="manifest"]', '/manifest-partner.json');
  }, [isPartnerPortalHost]);

  useEffect(() => {
    const checkHydration = () => {
      const authHydrated = useAuthStore.persist.hasHydrated();
      const fyllHydrated = useFyllStore.persist.hasHydrated();
      if (authHydrated && fyllHydrated) {
        setIsHydrated(true);
        return true;
      }
      return false;
    };

    if (checkHydration()) {
      return;
    }

    const unsubAuth = useAuthStore.persist.onFinishHydration(() => {
      if (checkHydration()) {
        unsubAuth();
        unsubFyll();
      }
    });

    const unsubFyll = useFyllStore.persist.onFinishHydration(() => {
      if (checkHydration()) {
        unsubAuth();
        unsubFyll();
      }
    });

    return () => {
      unsubAuth();
      unsubFyll();
    };
  }, []);

  useEffect(() => {
    if (!isHydrated || hasHiddenNativeSplash) return;
    SplashScreen.hideAsync()
      .catch(() => undefined)
      .finally(() => {
        setHasHiddenNativeSplash(true);
      });
  }, [hasHiddenNativeSplash, isHydrated]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const offline = state.isConnected === false || state.isInternetReachable === false;
      setOfflineMode(offline);
    });
    return () => unsubscribe();
  }, [setOfflineMode]);

  useEffect(() => {
    if (!isHydrated || bootstrapStartedRef.current) return;
    if (isStorefrontHost) {
      bootstrapStartedRef.current = true;
      setIsBootstrappingApp(false);
      return;
    }

    if (isPartnerPortalHost) {
      bootstrapStartedRef.current = true;
      setIsBootstrappingApp(false);
      const partnerPortalRoutes = new Set(['login', 'partner', 'partner-login', 'partner-invite']);
      if (!partnerPortalRoutes.has(firstSegment)) {
        router.replace('/login');
      }
      return;
    }

    if (isCustomerPortalHost) {
      if (!firstSegment) {
        router.replace(
          isReturnsHost
            ? '/start-return'
            : isDeliveryConfirmationHost
              ? '/confirm-delivery'
              : '/order-tracking'
        );
      }
      return;
    }
    bootstrapStartedRef.current = true;

    let cancelled = false;
    const bootstrap = async () => {
      if (inPublicRoute) {
        if (!cancelled) {
          setIsBootstrappingApp(false);
        }
        return;
      }

      if (!isOfflineMode) {
        await syncWithSupabaseSession().catch((error) => {
          console.warn('Session restore failed:', error);
        });
      }

      if (!cancelled) {
        setIsBootstrappingApp(false);
      }
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [firstSegment, inPublicRoute, isCustomerPortalHost, isDeliveryConfirmationHost, isHydrated, isOfflineMode, isPartnerPortalHost, isReturnsHost, isStorefrontHost, router, syncWithSupabaseSession]);

  useEffect(() => {
    if (!isHydrated || !isAuthenticated || !currentUserId) return;

    const channel = supabase
      .channel(`auth-role-sync-${currentUserId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${currentUserId}` },
        () => {
          syncWithSupabaseSession().catch((error) => {
            console.warn('Profile role sync failed:', error);
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'team_members', filter: `user_id=eq.${currentUserId}` },
        () => {
          syncWithSupabaseSession().catch((error) => {
            console.warn('Team member role sync failed:', error);
          });
          refreshTeamData().catch((error) => {
            console.warn('Team refresh after role update failed:', error);
          });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, isAuthenticated, isHydrated, refreshTeamData, syncWithSupabaseSession]);

  useEffect(() => {
    // Wait for the navigation to be ready before attempting navigation
    if (!isNavigationReady) return;

    if (isStorefrontHost) {
      const storefrontRoutes = new Set([
        '',
        'storefront-prototype',
        'storefront-product',
        'storefront-cart',
        'storefront-checkout',
        'storefront-thank-you',
      ]);
      if (!storefrontRoutes.has(firstSegment)) {
        router.replace('/storefront-prototype');
      }
      return;
    }

    if (isPlatformAdminHost) {
      const platformAdminRoutes = new Set(['platform-admin', 'platform-admin-login']);
      if (!platformAdminRoutes.has(firstSegment)) {
        if (firstSegment === '' || firstSegment === 'login') {
          // Bare console.fyll.app visit — send to the admin login/dashboard.
          router.replace(isAuthenticated ? '/platform-admin' : '/platform-admin-login');
        } else if (typeof window !== 'undefined') {
          // A regular business/staff route (e.g. a stale or misconfigured
          // /login?access=... invite link) landing on the console subdomain
          // must never be swallowed into the platform-admin login — bounce
          // it back to the real app domain with the full path/query intact,
          // rather than silently forcing the visitor into an admin-only screen.
          window.location.href = `${FYLL_PUBLIC_APP_ORIGIN}${window.location.pathname}${window.location.search}`;
        }
      } else if (isAuthenticated && firstSegment === 'platform-admin-login') {
        router.replace('/platform-admin');
      } else if (!isAuthenticated && firstSegment === 'platform-admin') {
        router.replace('/platform-admin-login');
      }
      return;
    }

    if (isPartnerPortalHost) {
      const partnerPortalRoutes = new Set(['login', 'partner', 'partner-login', 'partner-invite']);
      if (!partnerPortalRoutes.has(firstSegment)) {
        router.replace('/login');
      }
      return;
    }

    if (!isAuthenticated && !inPublicRoute) {
      if (segments[0] === 'platform-admin') {
        router.replace('/platform-admin-login');
      } else if (firstSegment === '') {
        router.replace('/start');
      } else {
        const isWooCommerceConnectRoute = firstSegment === 'woocommerce' && secondSegment === 'connect';
        const returnTo = isWooCommerceConnectRoute && typeof window !== 'undefined'
          ? `${window.location.pathname}${window.location.search}`
          : '';
        if (isWooCommerceConnectRoute && typeof window !== 'undefined') {
          try {
            const searchParams = new URLSearchParams(window.location.search);
            const storeUrl = searchParams.get('store_url') || searchParams.get('storeUrl') || searchParams.get('site_url') || searchParams.get('siteUrl') || '';
            const returnUrl = searchParams.get('return_url') || searchParams.get('returnUrl') || '';
            if (storeUrl || returnUrl) {
              window.sessionStorage.setItem(WOO_CONNECT_SESSION_KEY, JSON.stringify({
                storeUrl,
                storeName: searchParams.get('store_name') || searchParams.get('storeName') || searchParams.get('site_name') || searchParams.get('siteName') || '',
                adminEmail: searchParams.get('admin_email') || searchParams.get('adminEmail') || '',
                merchantId: searchParams.get('merchant_id') || searchParams.get('merchantId') || '',
                returnUrl,
              }));
            }
          } catch {
            // Best-effort preservation for the WooCommerce connect handoff.
          }
        }
        router.replace(returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : '/login');
      }
    } else if (isAuthenticated && segments[0] === 'login') {
      const returnTo = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('returnTo')
        : null;
      router.replace(returnTo?.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/(tabs)');
    } else if (isAuthenticated && segments[0] === 'platform-admin-login') {
      router.replace('/platform-admin');
    } else if (isAuthenticated && !isLoadingBusinessSettings && !inPublicRoute) {
      const protectedRoute = firstSegment === '(tabs)' ? secondSegment : firstSegment;
      const routeFeature = ROUTE_FEATURES[protectedRoute];
      if (routeFeature && !isBusinessFeatureEnabled(featureAccess, routeFeature)) {
        router.replace('/settings');
      } else if (protectedRoute === 'woocommerce-settings' && !isBusinessFeatureEnabled(featureAccess, 'additionalIntegrations')) {
        router.replace('/settings');
      }
    }
  }, [featureAccess, firstSegment, inPublicRoute, isAuthenticated, isCustomerPortalHost, isDeliveryConfirmationHost, isLoadingBusinessSettings, isNavigationReady, isPartnerPortalHost, isPlatformAdminHost, isReturnsHost, isStorefrontHost, router, secondSegment, segments]);

  if (!isHydrated || !hasHiddenNativeSplash) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <RootErrorBoundary>
        <Stack
          screenOptions={{
            animation: 'none',
            contentStyle: { backgroundColor: colors.bg.primary },
          }}
        >
          <Stack.Screen name="start" options={{ headerShown: false }} />
          <Stack.Screen name="request-invite" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="platform-admin-login" options={{ headerShown: false }} />
          <Stack.Screen name="welcome" options={{ headerShown: false }} />
          <Stack.Screen name="track" options={{ headerShown: false }} />
          <Stack.Screen name="confirm-delivery" options={{ headerShown: false }} />
          <Stack.Screen name="order-tracking" options={{ headerShown: false }} />
          <Stack.Screen name="start-return" options={{ headerShown: false }} />
          <Stack.Screen name="[businessSlug]/index" options={{ headerShown: false }} />
          <Stack.Screen name="[businessSlug]/confirm-delivery" options={{ headerShown: false }} />
          <Stack.Screen name="[businessSlug]/confirm-delivery/[code]" options={{ headerShown: false }} />
          <Stack.Screen name="[businessSlug]/order-tracking" options={{ headerShown: false }} />
          <Stack.Screen name="[businessSlug]/order-tracking/[code]" options={{ headerShown: false }} />
          <Stack.Screen name="[businessSlug]/[code]" options={{ headerShown: false }} />
          <Stack.Screen name="[businessSlug]/start-return" options={{ headerShown: false }} />
          <Stack.Screen name="checkout" options={{ headerShown: false }} />
          <Stack.Screen name="[businessSlug]/checkout/[code]" options={{ headerShown: false }} />
          <Stack.Screen name="social-checkout/new" options={{ headerShown: false }} />
          <Stack.Screen name="social-checkout/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="storefront-payment/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="payment-accounts" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
          <Stack.Screen name="new-order" options={{ headerShown: false }} />
          <Stack.Screen name="new-product" options={{ headerShown: false }} />
          <Stack.Screen name="new-service" options={{ headerShown: false }} />
          <Stack.Screen name="scan" options={{ presentation: 'fullScreenModal', headerShown: false }} />
          <Stack.Screen name="order/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="order-edit/[id]" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="case/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="cases" options={{ headerShown: false }} />
          <Stack.Screen name="product/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="customer/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="expense/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="procurement/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="product-variables" options={{ headerShown: false }} />
          <Stack.Screen name="category-manager" options={{ headerShown: false }} />
          <Stack.Screen name="label-print" options={{ headerShown: false }} />
          <Stack.Screen name="fyll-print" options={{ headerShown: false }} />
          <Stack.Screen name="partners" options={{ headerShown: false }} />
          <Stack.Screen name="partner-bills/[billId]" options={{ headerShown: false }} />
          <Stack.Screen name="partner/[token]" options={{ headerShown: false }} />
          <Stack.Screen name="partner-login" options={{ headerShown: false }} />
          <Stack.Screen name="partner-invite/[code]" options={{ headerShown: false }} />
          <Stack.Screen name="returns" options={{ headerShown: false }} />
          <Stack.Screen name="return/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="fulfillment-pipeline" options={{ headerShown: false }} />
          <Stack.Screen name="order-label-preview" options={{ headerShown: false }} />
          <Stack.Screen name="ai-order" options={{ headerShown: false }} />
          <Stack.Screen name="ai-case" options={{ headerShown: false }} />
          <Stack.Screen name="team" options={{ headerShown: false }} />
          <Stack.Screen name="task/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="restock" options={{ headerShown: false }} />
          <Stack.Screen name="add-team-member" options={{ headerShown: false }} />
          <Stack.Screen name="import-products" options={{ headerShown: false }} />
          <Stack.Screen name="import-customers" options={{ headerShown: false }} />
          <Stack.Screen name="import-orders" options={{ headerShown: false }} />
          <Stack.Screen name="import-ai" options={{ headerShown: false }} />
          <Stack.Screen name="insights/today" options={{ headerShown: false }} />
          <Stack.Screen name="insights/sales" options={{ headerShown: false }} />
          <Stack.Screen name="insights/orders" options={{ headerShown: false }} />
          <Stack.Screen name="insights/customers" options={{ headerShown: false }} />
          <Stack.Screen name="insights/refunds" options={{ headerShown: false }} />
          <Stack.Screen name="insights/locations" options={{ headerShown: false }} />
          <Stack.Screen name="insights/platforms" options={{ headerShown: false }} />
          <Stack.Screen name="insights/logistics" options={{ headerShown: false }} />
          <Stack.Screen name="insights/addons" options={{ headerShown: false }} />
          <Stack.Screen name="insights/services" options={{ headerShown: false }} />
          <Stack.Screen name="insights/partner-jobs" options={{ headerShown: false }} />
          <Stack.Screen name="insights/partner-services" options={{ headerShown: false }} />
          <Stack.Screen name="insights/partner-bills" options={{ headerShown: false }} />
          <Stack.Screen name="business-settings" options={{ headerShown: false }} />
          <Stack.Screen name="storefront-settings" options={{ headerShown: false }} />
          <Stack.Screen name="order-automation" options={{ headerShown: false }} />
          <Stack.Screen name="email-settings" options={{ headerShown: false }} />
          <Stack.Screen name="account-settings" options={{ headerShown: false }} />
          <Stack.Screen name="warehouse-settings" options={{ headerShown: false }} />
          <Stack.Screen name="woocommerce/connect" options={{ headerShown: false }} />
          <Stack.Screen name="platform-admin" options={{ headerShown: false }} />
          <Stack.Screen name="pdf-viewer" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
          <Stack.Screen name="debug-env" options={{ headerShown: false }} />
          <Stack.Screen name="debug-info" options={{ headerShown: false }} />
          <Stack.Screen name="debug-business" options={{ headerShown: false }} />
          <Stack.Screen name="debug-seed-fyll-checkout" options={{ headerShown: false }} />
          <Stack.Screen name="supabase-check" options={{ headerShown: false }} />
        </Stack>
        <RootMobileBottomNav visible={showRootMobileBottomNav} />
        {showGlobalFloatingActions ? <GlobalFloatingActions /> : null}
      </RootErrorBoundary>
    </ThemeProvider>
  );
}



export default function RootLayout() {
  const colorScheme = useColorScheme();
  const segments = useSegments();
  const inPublicRoute = PUBLIC_ROUTE_SEGMENTS.has(segments[0] ?? '');
  const isPartnerPortalNotificationContext = Platform.OS === 'web' && (
    (typeof window !== 'undefined' && isPartnerPortalHostname(window.location.hostname)) ||
    segments[0] === 'partner' ||
    segments[0] === 'partner-login' ||
    segments[0] === 'partner-invite'
  );

  useSupabaseSync();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const businessId = useAuthStore((s) => s.businessId);
  const currentUserId = useAuthStore((s) => s.currentUser?.id ?? null);
  const { isReady, promptForPermission, setUserTag, tagWithBusinessId, loginUser, logoutUser } = useWebPushNotifications();
  useExpoPushRegistration(isAuthenticated ? currentUserId : null, isAuthenticated ? businessId : null);

  useEffect(() => {
    if (!isReady) return;

    if (isPartnerPortalNotificationContext) {
      return;
    }

    if (!isAuthenticated) {
      logoutUser();
      return;
    }
    // Link this device/browser to the Supabase user ID in OneSignal
    // so push notifications can be delivered to specific users
    if (currentUserId) {
      loginUser(currentUserId);
      setUserTag('user_id', currentUserId);
    }
    if (businessId) {
      tagWithBusinessId(businessId);
    }
    // Request push permission — no-op if already granted/denied
    promptForPermission();
  }, [isReady, isAuthenticated, businessId, currentUserId, isPartnerPortalNotificationContext, promptForPermission, setUserTag, tagWithBusinessId, loginUser, logoutUser]);

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider initialMetrics={Platform.OS === 'web' ? webInitialMetrics : initialWindowMetrics}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <KeyboardProvider>
            <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
            <RootLayoutNav colorScheme={colorScheme} />
          </KeyboardProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
