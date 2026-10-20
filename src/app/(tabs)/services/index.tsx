import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Briefcase, Search, Plus, ChevronLeft, ChevronRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import useFyllStore, { formatCurrency, Product } from '@/lib/state/fyll-store';
import { useThemeColors } from '@/lib/theme';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { getActiveSplitCardStyle } from '@/lib/selection-style';
import { normalizeProductType } from '@/lib/product-utils';
import { DESKTOP_PAGE_HEADER_MIN_HEIGHT, usePageHeadingStyle } from '@/lib/page-heading';
import { SplitViewLayout } from '@/components/SplitViewLayout';
import { ServiceDetailPanel } from '@/components/ServiceDetailPanel';
import { getSettingsWebPanelStyles } from '@/lib/settings-web-panel';
import { InventoryMobileFab } from '@/components/InventoryMobileFab';
import { ResolvedAttachmentImage } from '@/components/ResolvedAttachmentImage';
import { capitalizeDisplayLabel } from '@/lib/display-format';
import { SearchClearButton } from '@/components/SearchClearButton';
import { useFonts, BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque';
import { FYLL_LIME, FYLL_LIME_INK, isHovered, usePaymentsPalette } from '@/components/payments/payments-ui';

const SERVICE_TABLE_COLUMNS = { price: 110, added: 120, status: 120, trail: 28, gap: 16 } as const;

export default function ServicesScreen() {
  const [bricolageLoaded] = useFonts({ BricolageGrotesque_700Bold });
  const colors = useThemeColors();
  const palette = usePaymentsPalette();
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { isMobile, isDesktop } = useBreakpoint();
  const isDark = colors.bg.primary === '#111111';
  const isWebDesktop = Platform.OS === 'web' && isDesktop;
  const showSplitView = !isMobile && !isWebDesktop;
  const pageHeadingStyle = usePageHeadingStyle(isMobile);
  const mobileSectionHeadingStyle = isMobile
    ? { ...pageHeadingStyle, fontWeight: '600' as const }
    : pageHeadingStyle;
  const desktopHeaderMinHeight = DESKTOP_PAGE_HEADER_MIN_HEIGHT;
  const openedFromSettings = from === 'settings';
  const panelStyles = getSettingsWebPanelStyles(openedFromSettings, colors.bg.primary, colors.border.light);
  const separatorColor = palette.border;
  const tableHeadStyle = { color: colors.text.muted, fontSize: 10, fontWeight: '600' as const, letterSpacing: 0.6, textTransform: 'uppercase' as const };

  const products = useFyllStore((s) => s.products);
  const isServiceProduct = (product: Product) => {
    if (normalizeProductType(product.productType) === 'service') return true;
    return Boolean(
      product.serviceTags?.length ||
      product.serviceVariables?.length ||
      product.serviceFields?.length
    );
  };

  const services = useMemo(
    () => products.filter((p) => isServiceProduct(p)),
    [products]
  );
  const serviceSummary = useMemo(() => {
    const active = services.filter((service) => !service.isDiscontinued).length;
    const totalPrice = services.reduce((sum, service) => sum + (service.variants[0]?.sellingPrice ?? 0), 0);
    return {
      active,
      inactive: services.length - active,
      averagePrice: services.length ? totalPrice / services.length : 0,
    };
  }, [services]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);

  const filteredServices = useMemo(() => {
    let result = services;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((service) =>
        service.name.toLowerCase().includes(query)
        || service.serviceTags?.some((tag) => tag.toLowerCase().includes(query))
      );
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [services, searchQuery]);

  const selectedService = useMemo(
    () => filteredServices.find((service) => service.id === selectedServiceId) ?? null,
    [filteredServices, selectedServiceId]
  );

  useEffect(() => {
    if (!showSplitView) return;
    if (selectedServiceId && filteredServices.some((service) => service.id === selectedServiceId)) return;
    setSelectedServiceId(filteredServices[0]?.id ?? null);
  }, [showSplitView, filteredServices, selectedServiceId]);

  const navigateToServiceDetail = (serviceId: string) => {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    router.push(`/services/${serviceId}`);
  };

  const handleOpenService = (serviceId: string) => {
    if (showSplitView) {
      if (Platform.OS !== 'web') Haptics.selectionAsync();
      setSelectedServiceId(serviceId);
      return;
    }
    navigateToServiceDetail(serviceId);
  };

  const handleAddService = () => {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    router.push('/new-service');
  };

  const handleBackToSettings = () => {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    router.push('/settings');
  };

  const renderRow = (service: Product, index: number) => {
    const category = service.serviceTags?.[0] ?? '—';
    const price = service.variants[0]?.sellingPrice ?? 0;
    const statusLabel = service.isDiscontinued ? 'Inactive' : 'Active';
    const statusColor = service.isDiscontinued ? palette.faint : '#97A91E';
    const dateLabel = new Date(service.createdAt).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const isSelected = showSplitView && selectedServiceId === service.id;

    return (
      <Pressable
        key={service.id}
        onPress={() => handleOpenService(service.id)}
        style={(state) => ({
          height: 66,
          flexDirection: 'row',
          alignItems: 'center',
          gap: SERVICE_TABLE_COLUMNS.gap,
          paddingHorizontal: 22,
          backgroundColor: isSelected
            ? (isDark ? 'rgba(244,244,239,0.04)' : 'rgba(17,17,17,0.03)')
            : isHovered(state)
              ? (isDark ? 'rgba(255,255,255,0.025)' : '#FAFAF7')
              : 'transparent',
          borderBottomWidth: index === filteredServices.length - 1 ? 0 : 1,
          borderBottomColor: palette.hairline,
          ...getActiveSplitCardStyle({ isSelected, showSplitView, isDark, colors }),
        })}
      >
        <View style={{ flex: 2.4, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 38, height: 38, borderRadius: 10, overflow: 'hidden', flexShrink: 0, backgroundColor: palette.softFill, alignItems: 'center', justifyContent: 'center' }}>
            {service.imageUrl ? (
              <ResolvedAttachmentImage imageUrl={service.imageUrl} style={{ width: 38, height: 38 }} resizeMode="cover" />
            ) : (
              <Briefcase size={17} color={palette.faint} strokeWidth={1.7} />
            )}
          </View>
          <View style={{ minWidth: 0, flex: 1 }}>
            <Text style={{ color: palette.text, fontSize: 13.5, fontWeight: '600' }} numberOfLines={1}>{capitalizeDisplayLabel(service.name)}</Text>
            <Text style={{ color: palette.faint, fontSize: 11.5, marginTop: 2 }} numberOfLines={1}>Service</Text>
          </View>
        </View>
        <Text style={{ color: palette.textSoft, flex: 1, fontSize: 13 }} numberOfLines={1}>{category}</Text>
        <Text style={{ color: palette.text, width: SERVICE_TABLE_COLUMNS.price, textAlign: 'right', fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] }} numberOfLines={1}>{formatCurrency(price)}</Text>
        <Text style={{ color: palette.faint, width: SERVICE_TABLE_COLUMNS.added, fontSize: 13 }} numberOfLines={1}>{dateLabel}</Text>
        <View style={{ width: SERVICE_TABLE_COLUMNS.status, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: service.isDiscontinued ? 'transparent' : statusColor, borderWidth: service.isDiscontinued ? 1.5 : 0, borderColor: palette.faint }} />
          <Text style={{ color: service.isDiscontinued ? palette.faint : palette.text, fontSize: 13, fontWeight: '600' }}>{statusLabel}</Text>
        </View>
        <View style={{ width: SERVICE_TABLE_COLUMNS.trail, alignItems: 'flex-end' }}>
          <ChevronRight size={16} color={palette.faint} strokeWidth={2.2} />
        </View>
      </Pressable>
    );
  };

  const compactMasterContent = (
    <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
      <View
        className="px-5 pb-2"
        style={{
          paddingTop: openedFromSettings ? 24 : 16,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          {openedFromSettings ? (
            <Pressable
              onPress={handleBackToSettings}
              className="w-10 h-10 rounded-xl items-center justify-center active:opacity-50"
              style={{ backgroundColor: colors.bg.secondary }}
            >
              <ChevronLeft size={20} color={colors.text.primary} strokeWidth={2} />
            </Pressable>
          ) : null}

          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ color: palette.text, ...mobileSectionHeadingStyle, fontWeight: bricolageLoaded ? '400' : '700', fontFamily: bricolageLoaded ? 'BricolageGrotesque_700Bold' : undefined, letterSpacing: -0.6 }}>
                Services
              </Text>
              <Text style={{ color: palette.faint }} className="text-sm mt-1">
                Manage what your business offers
              </Text>
            </View>
            <Pressable
              onPress={handleAddService}
              className="rounded-full items-center justify-center active:opacity-80"
              style={{ paddingHorizontal: 16, height: 40, flexDirection: 'row', gap: 6, backgroundColor: FYLL_LIME }}
            >
              <Plus size={15} color={FYLL_LIME_INK} strokeWidth={2.6} />
              <Text style={{ color: FYLL_LIME_INK, fontSize: 14, fontWeight: '600' }}>New service</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View style={{ marginHorizontal: 20, marginTop: 10, borderRadius: 20, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, padding: 18, gap: 14 }}>
        <View style={{ gap: 4 }}>
          <Text style={{ color: palette.faint, fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' }}>Service catalogue</Text>
          <Text style={{ color: palette.text, fontSize: 30, lineHeight: 34, fontWeight: bricolageLoaded ? '400' : '700', fontFamily: bricolageLoaded ? 'BricolageGrotesque_700Bold' : undefined, letterSpacing: -0.9 }}>{services.length} services</Text>
          <Text style={{ color: palette.muted, fontSize: 13 }}>{serviceSummary.active} currently available</Text>
        </View>
        <View style={{ height: 1, backgroundColor: palette.hairline }} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[
            ['Active', serviceSummary.active, '#97A91E'],
            ['Inactive', serviceSummary.inactive, palette.faint],
            ['Avg. price', formatCurrency(serviceSummary.averagePrice), FYLL_LIME],
          ].map(([label, value, dot]) => (
            <View key={String(label)} style={{ flex: 1, gap: 3 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: String(dot) }} />
                <Text style={{ color: palette.faint, fontSize: 11 }}>{label}</Text>
              </View>
              <Text style={{ color: palette.text, fontSize: 17, fontWeight: '600' }} numberOfLines={1}>{value}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className="px-5 pt-3">
        <View
          className="flex-row items-center rounded-full px-4"
          style={{ height: 48, backgroundColor: palette.inputBg, borderWidth: 1, borderColor: palette.outline }}
        >
          <Search size={18} color={colors.text.muted} strokeWidth={2} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search services..."
            placeholderTextColor={colors.input.placeholder}
            className="flex-1 ml-3"
            style={{ color: colors.input.text }}
          />
          <SearchClearButton visible={Boolean(searchQuery.trim())} onPress={() => setSearchQuery('')} />
        </View>
      </View>

      <View className="px-5 pt-4 pb-24">
        {filteredServices.length === 0 ? (
          <View className="items-center justify-center py-20">
            <View className="w-20 h-20 rounded-2xl items-center justify-center mb-4" style={{ backgroundColor: colors.border.light }}>
              <Briefcase size={36} color={colors.text.muted} strokeWidth={1.5} />
            </View>
            <Text style={{ color: colors.text.tertiary }} className="text-base mb-1">No services found</Text>
            <Text style={{ color: colors.text.muted }} className="text-sm mb-4">Add your first service to get started</Text>
            <Pressable onPress={handleAddService} className="rounded-full active:opacity-80 px-6 py-3 flex-row items-center" style={{ backgroundColor: colors.accent.primary }}>
              <Plus size={16} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={2.5} />
              <Text style={{ color: isDark ? '#000000' : '#FFFFFF' }} className="font-semibold ml-1.5">Create First Service</Text>
            </Pressable>
          </View>
        ) : (
          filteredServices.map((service) => {
            const category = service.serviceTags?.[0] ?? '—';
            const price = service.variants[0]?.sellingPrice ?? 0;
            const isSelected = showSplitView && selectedServiceId === service.id;
            const statusLabel = service.isDiscontinued ? 'Inactive' : 'Active';
            const statusColor = service.isDiscontinued ? '#9CA3AF' : '#10B981';

            return (
              <Pressable
                key={service.id}
                onPress={() => handleOpenService(service.id)}
                className="active:opacity-70"
                style={{
                  backgroundColor: colors.bg.card,
                  borderRadius: 18,
                  overflow: 'hidden',
                  marginBottom: 12,
                  borderWidth: 1,
                  borderColor: palette.border,
                  ...getActiveSplitCardStyle({ isSelected, showSplitView, isDark, colors }),
                }}
              >
                <View className="p-3 flex-row items-center">
                  <View className="flex-row items-center flex-1">
                    {service.imageUrl ? (
                      <View className="w-12 h-12 rounded-lg overflow-hidden" style={{ borderWidth: 0.5, borderColor: separatorColor }}>
                        <ResolvedAttachmentImage
                          imageUrl={service.imageUrl}
                          style={{ width: 48, height: 48 }}
                          resizeMode="cover"
                        />
                      </View>
                    ) : (
                      <View
                        className="w-12 h-12 rounded-xl items-center justify-center"
                        style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)' }}
                      >
                        <Briefcase size={22} color="#10B981" strokeWidth={1.6} />
                      </View>
                    )}
                    <View className="ml-3 flex-1">
                      <Text style={{ color: colors.text.primary }} className="font-semibold text-base">
                        {capitalizeDisplayLabel(service.name)}
                      </Text>
                      <Text style={{ color: colors.text.muted }} className="text-xs mt-0.5">
                        {category} · {formatCurrency(price)}
                      </Text>
                    </View>
                  </View>
                  <View className="flex-row items-center">
                    <View
                      className="rounded-full px-3 py-1 flex-row items-center mr-2"
                      style={{ backgroundColor: `${statusColor}20` }}
                    >
                      <Text style={{ color: statusColor }} className="text-xs font-semibold">
                        {statusLabel}
                      </Text>
                    </View>
                    <ChevronRight size={20} color={colors.text.tertiary} strokeWidth={2} />
                  </View>
                </View>
              </Pressable>
            );
          })
        )}
      </View>
    </ScrollView>
  );

  const splitDetailContent = selectedServiceId
    ? <ServiceDetailPanel serviceId={selectedServiceId} />
    : null;

  return (
    <View style={panelStyles.outer}>
      <View style={panelStyles.inner}>
      <SafeAreaView className="flex-1" edges={isWebDesktop ? [] : ['top']}>
        {isWebDesktop ? (
          <View style={{ flex: 1 }}>
            <View>
              <View
                style={{
                  width: '100%',
                  maxWidth: 1456,
                  alignSelf: 'flex-start',
                  minHeight: desktopHeaderMinHeight,
                  paddingLeft: 28,
                  paddingRight: 28,
                  paddingTop: 28,
                  paddingBottom: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                {openedFromSettings ? (
                  <Pressable
                    onPress={handleBackToSettings}
                    className="w-10 h-10 rounded-xl items-center justify-center active:opacity-50"
                    style={{ backgroundColor: colors.bg.secondary }}
                  >
                    <ChevronLeft size={20} color={colors.text.primary} strokeWidth={2} />
                  </Pressable>
                ) : null}

                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <View>
                    <Text style={{ color: palette.text, ...pageHeadingStyle, fontWeight: bricolageLoaded ? '400' : '700', fontFamily: bricolageLoaded ? 'BricolageGrotesque_700Bold' : undefined, letterSpacing: -0.6 }}>
                      Services
                    </Text>
                    <Text style={{ color: palette.faint, fontSize: 14, marginTop: 4 }}>
                      Manage pricing, availability and service options.
                    </Text>
                  </View>
                  <Pressable
                    onPress={handleAddService}
                    className="flex-row items-center px-4 rounded-full active:opacity-80"
                    style={{ backgroundColor: FYLL_LIME, height: 40, gap: 6 }}
                  >
                    <Plus size={15} color={FYLL_LIME_INK} strokeWidth={2.6} />
                    <Text style={{ color: FYLL_LIME_INK, fontSize: 14, fontWeight: '600' }}>
                      New service
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{
                width: '100%',
                maxWidth: 1456,
                alignSelf: 'flex-start',
                paddingLeft: 28,
                paddingRight: 28,
                paddingTop: 18,
                paddingBottom: 40,
              }}
              showsVerticalScrollIndicator={false}
            >
              <View style={{ flexDirection: 'row', borderRadius: 20, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, overflow: 'hidden', marginBottom: 18 }}>
                {[
                  ['Services', `${services.length} total`, 'Catalogue size', 1.3, null],
                  ['Active', String(serviceSummary.active), 'Available to sell', 1, '#97A91E'],
                  ['Inactive', String(serviceSummary.inactive), 'Hidden from sale', 1, palette.faint],
                  ['Avg. price', formatCurrency(serviceSummary.averagePrice), 'Across services', 1, FYLL_LIME],
                ].map(([label, value, caption, flex, dot], index) => (
                  <View key={String(label)} style={{ flex: Number(flex), paddingHorizontal: 22, paddingVertical: 18, gap: 4, borderLeftWidth: index ? 1 : 0, borderLeftColor: palette.hairline }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {dot ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: String(dot) }} /> : null}
                      <Text style={{ color: palette.faint, fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' }}>{label}</Text>
                    </View>
                    <Text style={{ color: palette.text, fontSize: index ? 22 : 28, fontWeight: index ? '600' : bricolageLoaded ? '400' : '700', fontFamily: !index && bricolageLoaded ? 'BricolageGrotesque_700Bold' : undefined, letterSpacing: index ? -0.5 : -0.9 }} numberOfLines={1}>{value}</Text>
                    <Text style={{ color: palette.muted, fontSize: 13 }}>{caption}</Text>
                  </View>
                ))}
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View
                  className="flex-row items-center rounded-full px-4"
                  style={{
                    height: 44,
                    width: '30%',
                    maxWidth: 420,
                    minWidth: 320,
                    backgroundColor: palette.inputBg,
                    borderWidth: 1,
                    borderColor: palette.outline,
                  }}
                >
                  <Search size={18} color={colors.text.muted} strokeWidth={2} />
                  <TextInput
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Search services..."
                    placeholderTextColor={colors.input.placeholder}
                    style={{ flex: 1, marginLeft: 8, color: colors.input.text, fontSize: 14 }}
                  />
                  <SearchClearButton visible={Boolean(searchQuery.trim())} onPress={() => setSearchQuery('')} />
                </View>
              </View>

              <View
                style={{
                  marginTop: 16,
                  borderWidth: 1,
                  borderColor: separatorColor,
                  borderRadius: 20,
                  overflow: 'hidden',
                  backgroundColor: palette.card,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SERVICE_TABLE_COLUMNS.gap, paddingHorizontal: 22, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: palette.hairline }}>
                  <Text style={[tableHeadStyle, { flex: 2.4 }]}>Service</Text>
                  <Text style={[tableHeadStyle, { flex: 1 }]}>Tag</Text>
                  <Text style={[tableHeadStyle, { width: SERVICE_TABLE_COLUMNS.price, textAlign: 'right' }]}>Price</Text>
                  <Text style={[tableHeadStyle, { width: SERVICE_TABLE_COLUMNS.added }]}>Added</Text>
                  <Text style={[tableHeadStyle, { width: SERVICE_TABLE_COLUMNS.status }]}>Status</Text>
                  <View style={{ width: SERVICE_TABLE_COLUMNS.trail }} />
                </View>

                {filteredServices.length === 0 ? (
                  <View style={{ padding: 40, alignItems: 'center' }}>
                    <View style={{ width: 80, height: 80, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 16, backgroundColor: colors.border.light }}>
                      <Briefcase size={36} color={colors.text.muted} strokeWidth={1.5} />
                    </View>
                    <Text style={{ color: colors.text.tertiary, fontSize: 16, marginBottom: 4 }}>No services found</Text>
                    <Text style={{ color: colors.text.muted, fontSize: 14, marginBottom: 16 }}>Add your first service to get started</Text>
                    <Pressable onPress={handleAddService} style={{ backgroundColor: colors.accent.primary, borderRadius: 999, paddingHorizontal: 24, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' }}>
                      <Plus size={16} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={2.5} />
                      <Text style={{ color: isDark ? '#000000' : '#FFFFFF', fontWeight: '600', marginLeft: 6 }}>Create First Service</Text>
                    </Pressable>
                  </View>
                ) : (
                  filteredServices.map(renderRow)
                )}
              </View>
            </ScrollView>
          </View>
        ) : showSplitView ? (
          <SplitViewLayout
            detailContent={splitDetailContent}
            detailTitle={selectedService?.name || 'Service Details'}
            onCloseDetail={() => setSelectedServiceId(null)}
          >
            {compactMasterContent}
          </SplitViewLayout>
        ) : (
          compactMasterContent
        )}
        {!isWebDesktop ? (
          <InventoryMobileFab currentSection="services" />
        ) : null}
      </SafeAreaView>
      </View>
    </View>
  );
}
