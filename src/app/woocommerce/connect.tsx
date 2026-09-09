import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Check, ExternalLink, Globe } from 'lucide-react-native';
import Svg, { Path, Text as SvgText } from 'react-native-svg';

import { supabase } from '@/lib/supabase';
import useAuthStore from '@/lib/state/auth-store';
import { useThemeColors } from '@/lib/theme';

const fyllWordmark = require('../../../assets/fyllfyll wordmark.png');

type ConnectBusiness = {
  id: string;
  name: string;
  businessName: string;
  logo: string | null;
  website: string;
};

const getParam = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
const CONNECT_SESSION_KEY = 'fyll_woocommerce_connect_params';

const getUrlParam = (name: string) => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get(name) ?? '';
};

const getStoredConnectParams = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(CONNECT_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Record<'storeUrl' | 'storeName' | 'adminEmail' | 'merchantId' | 'returnUrl', string>>;
    return parsed;
  } catch {
    return null;
  }
};

const storeConnectParams = (values: {
  storeUrl: string;
  storeName: string;
  adminEmail: string;
  merchantId: string;
  returnUrl: string;
}) => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  if (!values.storeUrl && !values.returnUrl) return;
  try {
    window.sessionStorage.setItem(CONNECT_SESSION_KEY, JSON.stringify(values));
  } catch {
    // Session storage can be unavailable in restrictive browser modes.
  }
};

const clearStoredConnectParams = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(CONNECT_SESSION_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }
};

const normalizeStoreUrl = (value: string) => value.trim().replace(/\/+$/, '');

const getBusinessDisplayName = (business: ConnectBusiness) =>
  business.businessName || business.name || 'Untitled business';

const buildReturnUrl = (returnUrl: string, token: string, businessId: string, state?: string | null) => {
  const url = new URL(returnUrl);
  url.searchParams.set('fyll_connect_token', token);
  url.searchParams.set('connection_token', token);
  url.searchParams.set('business_id', businessId);
  if (state?.trim() && !url.searchParams.has('state')) {
    url.searchParams.set('state', state.trim());
  }
  return url.toString();
};

function WooCommerceMark() {
  return (
    <Svg width={44} height={28} viewBox="0 0 88 56" fill="none">
      <Path
        d="M12 4H76C82.6274 4 88 9.37258 88 16V31C88 37.6274 82.6274 43 76 43H54L44.5 52L46.5 43H12C5.37258 43 0 37.6274 0 31V16C0 9.37258 5.37258 4 12 4Z"
        fill="#96588A"
      />
      <SvgText
        x="44"
        y="30"
        fill="#FFFFFF"
        fontSize="18"
        fontWeight="700"
        textAnchor="middle"
        fontFamily="Arial, sans-serif"
      >
        Woo
      </SvgText>
    </Svg>
  );
}

export default function WooCommerceConnectScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const currentUser = useAuthStore((s) => s.currentUser);
  const fallbackBusinessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const params = useLocalSearchParams<{
    store_url?: string | string[];
    storeUrl?: string | string[];
    site_url?: string | string[];
    siteUrl?: string | string[];
    store_name?: string | string[];
    storeName?: string | string[];
    site_name?: string | string[];
    siteName?: string | string[];
    admin_email?: string | string[];
    adminEmail?: string | string[];
    merchant_id?: string | string[];
    merchantId?: string | string[];
    return_url?: string | string[];
    returnUrl?: string | string[];
    state?: string | string[];
  }>();

  const storedParams = useMemo(() => getStoredConnectParams(), []);
  const storeUrl = normalizeStoreUrl(
    getParam(params.store_url)
    || getParam(params.storeUrl)
    || getParam(params.site_url)
    || getParam(params.siteUrl)
    || getUrlParam('store_url')
    || getUrlParam('storeUrl')
    || getUrlParam('site_url')
    || getUrlParam('siteUrl')
    || storedParams?.storeUrl
    || ''
  );
  const storeName = (
    getParam(params.store_name)
    || getParam(params.storeName)
    || getParam(params.site_name)
    || getParam(params.siteName)
    || getUrlParam('store_name')
    || getUrlParam('storeName')
    || getUrlParam('site_name')
    || getUrlParam('siteName')
    || storedParams?.storeName
    || ''
  ).trim();
  const adminEmail = (
    getParam(params.admin_email)
    || getParam(params.adminEmail)
    || getUrlParam('admin_email')
    || getUrlParam('adminEmail')
    || storedParams?.adminEmail
    || ''
  ).trim().toLowerCase();
  const merchantId = (
    getParam(params.merchant_id)
    || getParam(params.merchantId)
    || getUrlParam('merchant_id')
    || getUrlParam('merchantId')
    || storedParams?.merchantId
    || ''
  ).trim();
  const returnUrl = (
    getParam(params.return_url)
    || getParam(params.returnUrl)
    || getUrlParam('return_url')
    || getUrlParam('returnUrl')
    || storedParams?.returnUrl
    || ''
  ).trim();
  const connectState = (
    getParam(params.state)
    || getUrlParam('state')
    || ''
  ).trim();

  const [businesses, setBusinesses] = useState<ConnectBusiness[]>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);
  const [isLoadingBusinesses, setIsLoadingBusinesses] = useState(true);
  const [isApproving, setIsApproving] = useState(false);
  const [error, setError] = useState('');

  const selectedBusiness = useMemo(
    () => businesses.find((business) => business.id === selectedBusinessId) ?? null,
    [businesses, selectedBusinessId]
  );

  const missingRequiredParams = !storeUrl || !returnUrl;

  useEffect(() => {
    storeConnectParams({ storeUrl, storeName, adminEmail, merchantId, returnUrl });
  }, [adminEmail, merchantId, returnUrl, storeName, storeUrl]);

  useEffect(() => {
    if (!isAuthenticated || !currentUser?.id) return;

    const loadBusinesses = async () => {
      setIsLoadingBusinesses(true);
      setError('');
      try {
        const businessIds = new Set<string>();
        if (fallbackBusinessId) businessIds.add(fallbackBusinessId);

        const [{ data: profileRows }, { data: teamRows }, { data: ownedRows, error: ownedError }] = await Promise.all([
          supabase
            .from('profiles')
            .select('business_id')
            .eq('id', currentUser.id),
          supabase
            .from('team_members')
            .select('business_id')
            .eq('user_id', currentUser.id),
          supabase
            .from('businesses')
            .select('id, name, data')
            .eq('owner_id', currentUser.id),
        ]);

        if (ownedError) throw ownedError;

        (Array.isArray(profileRows) ? profileRows : []).forEach((row: { business_id?: string | null }) => {
          if (row.business_id) businessIds.add(row.business_id);
        });
        (Array.isArray(teamRows) ? teamRows : []).forEach((row: { business_id?: string | null }) => {
          if (row.business_id) businessIds.add(row.business_id);
        });

        const businessMap = new Map<string, ConnectBusiness>();
        (Array.isArray(ownedRows) ? ownedRows : []).forEach((row: { id: string; name?: string | null; data?: Record<string, unknown> | null }) => {
          const data = row.data ?? {};
          businessMap.set(row.id, {
            id: row.id,
            name: row.name ?? '',
            businessName: typeof data.businessName === 'string' ? data.businessName : '',
            logo: typeof data.businessLogo === 'string' ? data.businessLogo : null,
            website: typeof data.businessWebsite === 'string' ? data.businessWebsite : '',
          });
        });

        const idsToFetch = Array.from(businessIds).filter((id) => !businessMap.has(id));
        if (idsToFetch.length > 0) {
          const { data: linkedRows, error: linkedError } = await supabase
            .from('businesses')
            .select('id, name, data')
            .in('id', idsToFetch);
          if (linkedError) throw linkedError;
          (Array.isArray(linkedRows) ? linkedRows : []).forEach((row: { id: string; name?: string | null; data?: Record<string, unknown> | null }) => {
            const data = row.data ?? {};
            businessMap.set(row.id, {
              id: row.id,
              name: row.name ?? '',
              businessName: typeof data.businessName === 'string' ? data.businessName : '',
              logo: typeof data.businessLogo === 'string' ? data.businessLogo : null,
              website: typeof data.businessWebsite === 'string' ? data.businessWebsite : '',
            });
          });
        }

        const nextBusinesses = Array.from(businessMap.values())
          .sort((a, b) => getBusinessDisplayName(a).localeCompare(getBusinessDisplayName(b)));
        setBusinesses(nextBusinesses);
        setSelectedBusinessId((current) => {
          if (current && nextBusinesses.some((business) => business.id === current)) return current;
          if (fallbackBusinessId && nextBusinesses.some((business) => business.id === fallbackBusinessId)) return fallbackBusinessId;
          return nextBusinesses[0]?.id ?? null;
        });
      } catch (err) {
        console.error('Failed to load businesses for WooCommerce connect:', err);
        setError('Could not load your Fyll businesses. Please refresh and try again.');
      } finally {
        setIsLoadingBusinesses(false);
      }
    };

    void loadBusinesses();
  }, [currentUser?.id, fallbackBusinessId, isAuthenticated]);

  const handleApprove = async () => {
    if (!selectedBusiness || missingRequiredParams || !currentUser?.id) return;
    setIsApproving(true);
    setError('');
    try {
      const { data, error: tokenError } = await supabase.rpc('create_woocommerce_connect_token', {
        business_id_input: selectedBusiness.id,
        store_url_input: storeUrl,
        store_name_input: storeName || null,
        admin_email_input: adminEmail || null,
        merchant_id_input: merchantId || null,
        return_url_input: returnUrl,
      });
      if (tokenError) throw tokenError;
      const token = typeof data === 'string' ? data : '';
      if (!token) throw new Error('Connect token was not created.');

      const redirectUrl = buildReturnUrl(returnUrl, token, selectedBusiness.id, connectState);
      clearStoredConnectParams();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.href = redirectUrl;
        return;
      }
      await Linking.openURL(redirectUrl);
    } catch (err) {
      console.error('Failed to approve WooCommerce connect:', err);
      setError(err instanceof Error ? err.message : 'Could not connect this WooCommerce store.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsApproving(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg.secondary }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, minHeight: '100%', paddingHorizontal: 20, paddingVertical: 32 }}>
          <View style={{ flex: 1, minHeight: Platform.OS === 'web' ? 'calc(100vh - 64px)' as never : undefined, justifyContent: 'center', alignItems: 'center' }}>
            <Pressable
              onPress={() => router.replace('/(tabs)')}
              style={{
                position: 'absolute',
                top: Platform.OS === 'web' ? 0 : 4,
                left: Platform.OS === 'web' ? 8 : 0,
                padding: 10,
                zIndex: 2,
              }}
            >
              <ArrowLeft size={22} color={colors.text.primary} strokeWidth={2} />
            </Pressable>

            <View style={{ width: '100%', maxWidth: 420, alignSelf: 'center', gap: 20 }}>
              <View style={{ alignItems: 'center' }}>
                <Image
                  source={fyllWordmark}
                  resizeMode="contain"
                  style={{ width: 112, height: 32 }}
                />
              </View>

              <LinearGradient
                colors={['#FFFFFF', '#F8FFE8', '#EAF8B8']}
                start={{ x: 0.08, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  borderRadius: 28,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.62)',
                  padding: Platform.OS === 'web' ? 24 : 20,
                  gap: 15,
                  shadowColor: '#C7D86A',
                  shadowOpacity: 0.18,
                  shadowRadius: 26,
                  shadowOffset: { width: 0, height: 14 },
                }}
              >
                <View style={{ marginBottom: 10 }}>
                  <WooCommerceMark />
                </View>
                <View>
                  <Text style={{ color: '#111111', fontSize: 24, fontWeight: '600', lineHeight: 31 }}>Connect WooCommerce store</Text>
                  <Text style={{ color: 'rgba(17,17,17,0.68)', fontSize: 14, lineHeight: 22, marginTop: 9 }}>
                    Choose the existing Fyll business that should receive orders and settings from this WooCommerce store.
                  </Text>
                </View>

                <View style={{ borderRadius: 18, borderWidth: 1, borderColor: 'rgba(17,17,17,0.10)', backgroundColor: 'rgba(255,255,255,0.58)', padding: 14, gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Globe size={16} color="rgba(17,17,17,0.52)" strokeWidth={2} />
                    <Text style={{ color: '#111111', fontSize: 14, fontWeight: '600' }}>{storeName || 'WooCommerce store'}</Text>
                  </View>
                  <Text style={{ color: 'rgba(17,17,17,0.66)', fontSize: 13 }}>{storeUrl || 'Missing store URL'}</Text>
                  {merchantId ? <Text style={{ color: 'rgba(17,17,17,0.48)', fontSize: 12 }}>Merchant ID: {merchantId}</Text> : null}
                  {adminEmail ? <Text style={{ color: 'rgba(17,17,17,0.48)', fontSize: 12 }}>Admin email: {adminEmail}</Text> : null}
                </View>

                {missingRequiredParams ? (
                  <Text style={{ color: '#DC2626', fontSize: 13 }}>This connect link is missing required store or return information. Go back to WordPress and start again.</Text>
                ) : null}

                {isLoadingBusinesses ? (
                  <View style={{ paddingVertical: 28, alignItems: 'center', gap: 10 }}>
                    <ActivityIndicator color="#111111" />
                    <Text style={{ color: 'rgba(17,17,17,0.66)', fontSize: 13 }}>Loading your businesses...</Text>
                  </View>
                ) : businesses.length === 0 ? (
                  <View style={{ gap: 12 }}>
                    <Text style={{ color: '#111111', fontSize: 15, fontWeight: '600' }}>Create a Fyll business first</Text>
                    <Text style={{ color: 'rgba(17,17,17,0.66)', fontSize: 13, lineHeight: 20 }}>
                      This connection must be attached to an existing Fyll business. Create one in Fyll, then return to WordPress and start the connection again.
                    </Text>
                    <Pressable
                      onPress={() => router.replace('/business-settings')}
                      style={{ height: 46, borderRadius: 999, backgroundColor: colors.text.primary, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Text style={{ color: colors.bg.primary, fontSize: 14, fontWeight: '600' }}>Go to business settings</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={{ gap: 10 }}>
                    <Text style={{ color: '#111111', fontSize: 15, fontWeight: '600' }}>Choose business</Text>
                    {businesses.map((business) => {
                      const selected = business.id === selectedBusinessId;
                      return (
                        <Pressable
                          key={business.id}
                          onPress={() => setSelectedBusinessId(business.id)}
                          style={{
                            borderRadius: 18,
                            borderWidth: 1,
                            borderColor: selected ? '#111111' : 'rgba(17,17,17,0.10)',
                            backgroundColor: selected ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.50)',
                            padding: 14,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 12,
                          }}
                        >
                          <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: selected ? '#111111' : 'rgba(17,17,17,0.28)', alignItems: 'center', justifyContent: 'center' }}>
                            {selected ? <Check size={13} color="#111111" strokeWidth={3} /> : null}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: '#111111', fontSize: 14, fontWeight: '600' }}>{getBusinessDisplayName(business)}</Text>
                            <Text style={{ color: 'rgba(17,17,17,0.48)', fontSize: 12, marginTop: 3 }}>{business.website || business.id}</Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                {error ? <Text style={{ color: '#DC2626', fontSize: 13, lineHeight: 19 }}>{error}</Text> : null}

                <Pressable
                  onPress={() => { void handleApprove(); }}
                  disabled={!selectedBusiness || missingRequiredParams || isApproving || isLoadingBusinesses}
                  style={{
                  height: 50,
                    borderRadius: 999,
                    backgroundColor: '#111111',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 8,
                    opacity: !selectedBusiness || missingRequiredParams || isApproving || isLoadingBusinesses ? 0.55 : 1,
                    marginTop: 6,
                  }}
                >
                  {isApproving ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '600' }}>Sign in to Fyll</Text>
                      <ExternalLink size={16} color="#FFFFFF" strokeWidth={2.2} />
                    </>
                  )}
                </Pressable>
              </LinearGradient>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
