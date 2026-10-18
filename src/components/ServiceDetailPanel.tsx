import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Briefcase, Edit2 } from 'lucide-react-native';
import useFyllStore, { Product, ServiceVariableOption, formatCurrency } from '@/lib/state/fyll-store';
import useAuthStore from '@/lib/state/auth-store';
import { useThemeColors } from '@/lib/theme';
import { normalizeProductType } from '@/lib/product-utils';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { MoneyText, usePaymentsPalette } from '@/components/payments/payments-ui';
import { DetailSection, DetailImagePreview, DetailActionButton } from './SplitViewLayout';
import { ResolvedAttachmentImage } from './ResolvedAttachmentImage';

interface ServiceDetailPanelProps {
  serviceId: string;
  from?: 'inventory' | 'services';
  onEdit?: () => void;
}

const normalizeOption = (option: string | ServiceVariableOption): ServiceVariableOption => (
  typeof option === 'string'
    ? { value: option }
    : { value: option.value, amount: option.amount }
);

const isServiceProduct = (product: Product) => {
  if (normalizeProductType(product.productType) === 'service') return true;
  return Boolean(
    product.serviceTags?.length ||
    product.serviceVariables?.length ||
    product.serviceFields?.length
  );
};

export function ServiceDetailPanel({ serviceId, from, onEdit }: ServiceDetailPanelProps) {
  const colors = useThemeColors();
  const palette = usePaymentsPalette();
  const router = useRouter();
  const { isDesktop } = useBreakpoint();
  const isWideDesktop = Platform.OS === 'web' && isDesktop;
  const isDark = colors.bg.primary === '#111111';

  const products = useFyllStore((s) => s.products);
  const orders = useFyllStore((s) => s.orders);
  const updateProduct = useFyllStore((s) => s.updateProduct);
  const userRole = useFyllStore((s) => s.userRole);
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const currentUserRole = useAuthStore((s) => s.currentUser?.role ?? null);
  const [isStatusSaving, setIsStatusSaving] = useState(false);
  const service = useMemo(
    () => products.find((product) => product.id === serviceId && isServiceProduct(product)),
    [products, serviceId]
  );
  const performance = useMemo(() => {
    const optionCounts = new Map<string, number>();
    let bookings = 0;
    let revenue = 0;
    orders.forEach((order) => {
      const status = (order.status ?? '').toLowerCase();
      if (status.includes('cancel') || status.includes('refund')) return;
      (order.services ?? []).forEach((line) => {
        if (line.serviceId !== serviceId) return;
        bookings += 1;
        revenue += Number(line.price) || 0;
      });
      (order.items ?? []).forEach((item) => {
        if (item.serviceId !== serviceId) return;
        const quantity = item.quantity > 0 ? item.quantity : 1;
        bookings += quantity;
        revenue += (Number(item.unitPrice) || 0) * quantity;
        (item.serviceVariables ?? []).forEach((variable) => {
          const value = variable.value?.trim();
          if (value) optionCounts.set(value, (optionCounts.get(value) ?? 0) + quantity);
        });
      });
    });
    const options = Array.from(optionCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    return { bookings, revenue, options };
  }, [orders, serviceId]);
  const canManageStatus = userRole === 'owner' || currentUserRole === 'admin' || currentUserRole === 'manager';

  if (!service) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <Briefcase size={48} color={colors.text.muted} strokeWidth={1.5} />
        <Text style={{ color: colors.text.muted, fontSize: 16, marginTop: 16 }}>
          Select a service to view details
        </Text>
      </View>
    );
  }

  const basePrice = service.variants[0]?.sellingPrice ?? 0;
  const tags = service.serviceTags ?? [];
  const variables = service.serviceVariables ?? [];
  const fields = service.serviceFields ?? [];
  const durationField = fields.find((field) => field.id === 'duration' || field.label.trim().toLowerCase() === 'duration');
  const additionalFields = fields.filter((field) => field !== durationField);
  const usesGlobalPricing = service.serviceUsesGlobalPricing ?? true;
  const optionPrices = variables.flatMap((variable) => (
    (variable.options ?? [])
      .map(normalizeOption)
      .map((option) => option.amount)
      .filter((amount): amount is number => typeof amount === 'number' && Number.isFinite(amount))
  ));
  const startingOptionPrice = optionPrices.length > 0 ? Math.min(...optionPrices) : 0;

  const handleEdit = () => {
    if (onEdit) {
      onEdit();
      return;
    }
    const path = from === 'inventory'
      ? `/services/${service.id}?from=inventory`
      : `/services/${service.id}`;
    router.push(path);
  };

  const handleToggleServiceActive = async () => {
    if (!service || isStatusSaving) return;
    setIsStatusSaving(true);
    const nextInactive = !(service.isDiscontinued ?? false);
    try {
      await updateProduct(service.id, {
        isDiscontinued: nextInactive,
        discontinuedAt: nextInactive
          ? (service.discontinuedAt ?? new Date().toISOString())
          : undefined,
      }, businessId);
    } catch (error) {
      console.warn('Service status update failed:', error);
    } finally {
      setIsStatusSaving(false);
    }
  };

  if (isWideDesktop) {
    const cardStyle = { borderRadius: 18, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border } as const;
    const labelStyle = { color: palette.faint, fontSize: 10, fontWeight: '600' as const, letterSpacing: 0.7, textTransform: 'uppercase' as const };
    const headingStyle = { color: palette.text, fontSize: 16, fontWeight: '600' as const };

    return (
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 20, width: '100%', backgroundColor: palette.page, paddingTop: 16 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 20 }}>
          <View style={{ ...cardStyle, padding: 20, flexDirection: 'row', gap: 22 }}>
            <View style={{ width: 220, height: 170, borderRadius: 14, overflow: 'hidden', backgroundColor: palette.softFill, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {service.imageUrl ? (
                <ResolvedAttachmentImage imageUrl={service.imageUrl} style={{ width: 220, height: 170 }} resizeMode="cover" />
              ) : (
                <View style={{ alignItems: 'center', gap: 7 }}>
                  <Briefcase size={26} color={palette.faint} strokeWidth={1.6} />
                  <Text style={{ color: palette.faint, fontSize: 12.5 }}>No service image</Text>
                </View>
              )}
            </View>

            <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', rowGap: 20, columnGap: 24, alignContent: 'flex-start' }}>
              <View style={{ width: '45%', flexGrow: 1, gap: 5 }}>
                <Text style={labelStyle}>Price</Text>
                <MoneyText style={{ color: palette.text, fontSize: 22 }} numberOfLines={1}>
                  {usesGlobalPricing ? formatCurrency(basePrice) : startingOptionPrice > 0 ? `From ${formatCurrency(startingOptionPrice)}` : 'Variable'}
                </MoneyText>
                <Text style={{ color: palette.faint, fontSize: 12.5 }}>{usesGlobalPricing ? 'One fixed price' : 'Priced by option'}</Text>
              </View>
              <View style={{ width: '45%', flexGrow: 1, gap: 5 }}>
                <Text style={labelStyle}>Duration</Text>
                <MoneyText style={{ color: palette.text, fontSize: 22 }} numberOfLines={1}>{durationField?.defaultValue?.trim() || 'Not set'}</MoneyText>
                <Text style={{ color: palette.faint, fontSize: 12.5 }}>Booking length</Text>
              </View>
              <View style={{ width: '45%', flexGrow: 1, gap: 8 }}>
                <Text style={labelStyle}>Tags</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {tags.length ? tags.map((tag) => (
                    <View key={tag} style={{ height: 30, paddingHorizontal: 11, borderRadius: 999, justifyContent: 'center', backgroundColor: palette.softFill }}>
                      <Text style={{ color: palette.textSoft, fontSize: 12.5, fontWeight: '600' }}>{tag}</Text>
                    </View>
                  )) : <Text style={{ color: palette.faint, fontSize: 13 }}>No tags</Text>}
                </View>
              </View>
              <View style={{ width: '45%', flexGrow: 1, gap: 5 }}>
                <Text style={labelStyle}>Configuration</Text>
                <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>{variables.length} {variables.length === 1 ? 'variable' : 'variables'}</Text>
                <Text style={{ color: palette.faint, fontSize: 12.5 }}>{additionalFields.length} additional {additionalFields.length === 1 ? 'field' : 'fields'}</Text>
              </View>
              {service.description?.trim() ? (
                <View style={{ width: '100%', gap: 5 }}>
                  <Text style={labelStyle}>Description</Text>
                  <Text style={{ color: palette.textSoft, fontSize: 14, lineHeight: 20 }}>{service.description.trim()}</Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={{ ...cardStyle, paddingHorizontal: 20, paddingTop: 6, paddingBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 14, paddingBottom: 12 }}>
              <View style={{ gap: 2 }}>
                <Text style={headingStyle}>Variables</Text>
                <Text style={{ color: palette.faint, fontSize: 13 }}>{variables.length} customer {variables.length === 1 ? 'option' : 'options'} configured</Text>
              </View>
            </View>
            {variables.length ? (
              <>
                <View style={{ flexDirection: 'row', gap: 14, paddingTop: 10, paddingBottom: 8 }}>
                  <Text style={[labelStyle, { flex: 1.2 }]}>Variable</Text>
                  <Text style={[labelStyle, { width: 100 }]}>Type</Text>
                  <Text style={[labelStyle, { flex: 1 }]}>Options</Text>
                  <Text style={[labelStyle, { width: 80 }]}>Required</Text>
                </View>
                {variables.map((variable) => {
                  const options = (variable.options ?? []).map(normalizeOption);
                  return (
                    <View key={variable.id} style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 14, borderTopWidth: 1, borderTopColor: palette.hairline }}>
                      <Text style={{ flex: 1.2, color: palette.text, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{variable.name || 'Untitled variable'}</Text>
                      <Text style={{ width: 100, color: palette.muted, fontSize: 13 }}>{variable.type}</Text>
                      <Text style={{ flex: 1, color: palette.muted, fontSize: 13 }} numberOfLines={2}>{options.map((option) => option.value).join(', ') || '—'}</Text>
                      <Text style={{ width: 80, color: variable.required ? palette.text : palette.faint, fontSize: 13, fontWeight: '600' }}>{variable.required ? 'Yes' : 'No'}</Text>
                    </View>
                  );
                })}
              </>
            ) : <Text style={{ color: palette.faint, fontSize: 13.5, paddingVertical: 18 }}>No variables configured.</Text>}
          </View>

          <View style={{ ...cardStyle, paddingHorizontal: 20, paddingTop: 6, paddingBottom: 8 }}>
            <View style={{ paddingTop: 14, paddingBottom: 12, gap: 2 }}>
              <Text style={headingStyle}>Additional fields</Text>
              <Text style={{ color: palette.faint, fontSize: 13 }}>{additionalFields.length} order-time {additionalFields.length === 1 ? 'field' : 'fields'}</Text>
            </View>
            {additionalFields.length ? additionalFields.map((field) => (
              <View key={field.id} style={{ minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 14, borderTopWidth: 1, borderTopColor: palette.hairline }}>
                <Text style={{ flex: 1, color: palette.text, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{field.label || 'Untitled field'}</Text>
                <Text style={{ width: 100, color: palette.muted, fontSize: 13 }}>{field.type ?? 'Text'}</Text>
                <Text style={{ width: 90, color: field.required ? palette.text : palette.faint, fontSize: 13, fontWeight: '600' }}>{field.required ? 'Required' : 'Optional'}</Text>
              </View>
            )) : <Text style={{ color: palette.faint, fontSize: 13.5, paddingVertical: 18 }}>No additional fields configured.</Text>}
          </View>
        </View>

        <View style={{ width: 420, gap: 16 }}>
          <View style={{ ...cardStyle, padding: 20, gap: 14 }}>
            <View style={{ gap: 4 }}>
              <Text style={labelStyle}>Availability</Text>
              <MoneyText style={{ color: palette.text, fontSize: 32, letterSpacing: -0.8 }}>{service.isDiscontinued ? 'Inactive' : 'Active'}</MoneyText>
              <Text style={{ color: service.isDiscontinued ? palette.danger : palette.tones.verified.ink, fontSize: 13, fontWeight: '600' }}>
                {service.isDiscontinued ? 'Hidden from new orders' : 'Available for new orders'}
              </Text>
            </View>
            <View style={{ height: 1, backgroundColor: palette.hairline }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={labelStyle}>Pricing</Text>
              <Text style={{ color: palette.text, fontSize: 13.5, fontWeight: '600' }}>{usesGlobalPricing ? 'Fixed' : 'By option'}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={labelStyle}>Variables</Text>
              <Text style={{ color: palette.text, fontSize: 13.5, fontWeight: '600' }}>{variables.length}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={labelStyle}>Fields</Text>
              <Text style={{ color: palette.text, fontSize: 13.5, fontWeight: '600' }}>{additionalFields.length}</Text>
            </View>
          </View>

          <View style={{ ...cardStyle, padding: 20, gap: 14 }}>
            <View style={{ gap: 4 }}>
              <Text style={labelStyle}>Bookings</Text>
              <MoneyText style={{ color: palette.text, fontSize: 32, letterSpacing: -0.8 }}>{performance.bookings}</MoneyText>
              <Text style={{ color: palette.faint, fontSize: 13 }}>{formatCurrency(performance.revenue)} revenue generated</Text>
            </View>
            <View style={{ height: 1, backgroundColor: palette.hairline }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Text style={labelStyle}>Most selected options</Text>
              <Text style={{ color: palette.faint, fontSize: 13 }}>{performance.bookings} all time</Text>
            </View>
            {performance.options.length ? performance.options.map((option, index) => {
              const maxCount = Math.max(1, performance.options[0]?.count ?? 1);
              return (
                <View key={option.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ width: 90, color: palette.textSoft, fontSize: 13.5 }} numberOfLines={1}>{option.name}</Text>
                  <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: palette.softFill, overflow: 'hidden' }}>
                    <View style={{ width: `${(option.count / maxCount) * 100}%`, height: 6, borderRadius: 3, backgroundColor: index === 0 ? palette.text : palette.isDark ? '#6B6C63' : '#BDBDB4' }} />
                  </View>
                  <Text style={{ width: 28, textAlign: 'right', color: palette.text, fontSize: 13.5, fontWeight: '600' }}>{option.count}</Text>
                </View>
              );
            }) : <Text style={{ color: palette.faint, fontSize: 13.5 }}>No bookings yet.</Text>}
          </View>

          <View style={{ ...cardStyle, padding: 20, gap: 12 }}>
            <Text style={headingStyle}>Service actions</Text>
            {canManageStatus ? (
              <Pressable
                onPress={handleToggleServiceActive}
                disabled={isStatusSaving}
                accessibilityRole="switch"
                accessibilityState={{ checked: Boolean(service.isDiscontinued), disabled: isStatusSaving }}
                style={{ minHeight: 50, paddingHorizontal: 14, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, backgroundColor: palette.dangerBg, borderWidth: 1, borderColor: palette.dangerBorder, opacity: isStatusSaving ? 0.55 : 1 }}
              >
                <Text style={{ color: palette.danger, fontSize: 13.5, fontWeight: '600' }}>{isStatusSaving ? 'Saving…' : 'Deactivate service'}</Text>
                <View style={{ width: 44, height: 26, borderRadius: 999, backgroundColor: service.isDiscontinued ? palette.danger : palette.dangerBorder, padding: 3 }}>
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF', transform: [{ translateX: service.isDiscontinued ? 18 : 0 }] }} />
                </View>
              </Pressable>
            ) : null}
            {!onEdit ? (
              <Pressable onPress={handleEdit} style={{ height: 42, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.inverseBg }}>
                <Text style={{ color: palette.inverseText, fontSize: 13.5, fontWeight: '600' }}>Edit service</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, flexDirection: isWideDesktop ? 'row' : 'column', alignItems: 'flex-start', gap: isWideDesktop ? 20 : 0, backgroundColor: palette.page }}>
      <View style={{ flex: 1, width: '100%', minWidth: 0 }}>
      <View style={{ marginHorizontal: 20, marginTop: 16, paddingBottom: 16, borderRadius: 18, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, overflow: 'hidden' }}>
      <DetailImagePreview imageUrl={service.imageUrl} />

      <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
          <Text style={{ color: palette.text, fontSize: 18, fontWeight: '600', flex: 1, letterSpacing: -0.2 }} numberOfLines={2}>
            {service.name}
          </Text>
          {service.isDiscontinued ? (
            <View
              style={{
                backgroundColor: 'rgba(156, 163, 175, 0.18)',
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 6,
                marginLeft: 6,
              }}
            >
              <Text style={{ color: '#9CA3AF', fontSize: 11, fontWeight: '700' }}>INACTIVE</Text>
            </View>
          ) : null}
        </View>
        <Text style={{ color: palette.faint, fontSize: 13 }} numberOfLines={2}>
          {tags.length > 0 ? tags.join(', ') : 'Uncategorised service'}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', paddingHorizontal: 20, paddingTop: 16, gap: 12 }}>
        <View style={{ flex: 1, backgroundColor: palette.inset, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: palette.border }}>
          <Text style={{ color: palette.faint, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase' }}>Duration</Text>
          <Text style={{ color: palette.text, fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'], marginTop: 4 }} numberOfLines={1}>
            {durationField?.defaultValue?.trim() || 'Not set'}
          </Text>
          <Text style={{ color: palette.faint, fontSize: 11, marginTop: 6 }}>Booking length</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: palette.inset, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: palette.border }}>
          <Text style={{ color: palette.faint, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase' }}>Service price</Text>
          <Text style={{ color: palette.text, fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'], marginTop: 4 }} numberOfLines={1}>
            {usesGlobalPricing
              ? formatCurrency(basePrice)
              : startingOptionPrice > 0
                ? `From ${formatCurrency(startingOptionPrice)}`
                : 'Variable'}
          </Text>
          <Text style={{ color: palette.faint, fontSize: 11, marginTop: 6 }}>
            {usesGlobalPricing ? 'fixed price' : 'priced by option'}
          </Text>
        </View>
      </View>

      {service.description?.trim() ? (
        <DetailSection title="Description">
          <Text style={{ color: colors.text.secondary, fontSize: 14, lineHeight: 20 }}>
            {service.description.trim()}
          </Text>
        </DetailSection>
      ) : null}
      </View>

      <DetailSection title={`Variables (${variables.length})`}>
        {variables.length === 0 ? (
          <Text style={{ color: colors.text.muted, fontSize: 13 }}>No service variables configured.</Text>
        ) : (
          <View style={{ gap: 12 }}>
            {variables.map((variable, index) => {
              const options = (variable.options ?? []).map(normalizeOption);
              return (
                <View
                  key={variable.id}
                  style={{
                    paddingTop: index === 0 ? 0 : 12,
                    borderTopWidth: index === 0 ? 0 : 1,
                    borderTopColor: colors.border.light,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '700' }}>{variable.name || 'Untitled'}</Text>
                    <Text style={{ color: colors.text.tertiary, fontSize: 12 }}>{variable.type}</Text>
                  </View>

                  <Text style={{ color: colors.text.muted, fontSize: 12, marginTop: 4 }}>
                    {variable.required ? 'Required' : 'Optional'}
                    {variable.defaultValue ? ` • Default: ${variable.defaultValue}` : ''}
                  </Text>

                  {options.length > 0 && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      {options.map((option) => (
                        <View
                          key={`${variable.id}-${option.value}`}
                          style={{
                            borderRadius: 999,
                            paddingHorizontal: 10,
                            paddingVertical: 5,
                            backgroundColor: colors.bg.secondary,
                            borderWidth: 1,
                            borderColor: colors.border.light,
                          }}
                        >
                          <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600' }}>
                            {option.value}
                            {typeof option.amount === 'number' && Number.isFinite(option.amount)
                              ? ` (+${formatCurrency(option.amount)})`
                              : ''}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </DetailSection>
      </View>

      <View style={{ width: isWideDesktop ? 400 : '100%', flexShrink: 0, ...(isWideDesktop ? { alignSelf: 'flex-start', position: 'sticky' as const, top: 20 } : {}) }}>
      <DetailSection title="Service setup">
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: colors.text.tertiary, fontSize: 13 }}>Pricing method</Text>
            <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '600' }}>
              {usesGlobalPricing ? 'One fixed price' : 'Varies by option'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: colors.text.tertiary, fontSize: 13 }}>Availability</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: service.isDiscontinued ? 'transparent' : palette.tones.verified.dot, borderWidth: service.isDiscontinued ? 1.5 : 0, borderColor: palette.faint }} />
              <Text style={{ color: service.isDiscontinued ? colors.text.muted : colors.text.primary, fontSize: 13, fontWeight: '600' }}>
                {service.isDiscontinued ? 'Inactive' : 'Active'}
              </Text>
            </View>
          </View>
        </View>
      </DetailSection>

      {tags.length > 0 && (
        <DetailSection title={`Tags (${tags.length})`}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {tags.map((tag) => (
              <View key={tag} style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}>
                <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600' }}>{tag}</Text>
              </View>
            ))}
          </View>
        </DetailSection>
      )}

      <DetailSection title={`Additional fields (${additionalFields.length})`}>
        {additionalFields.length === 0 ? (
          <Text style={{ color: colors.text.muted, fontSize: 13 }}>No service fields configured.</Text>
        ) : (
          <View style={{ gap: 12 }}>
            {additionalFields.map((field, index) => {
              const options = (field.options ?? []).map(normalizeOption);
              return (
                <View
                  key={field.id}
                  style={{
                    paddingTop: index === 0 ? 0 : 12,
                    borderTopWidth: index === 0 ? 0 : 1,
                    borderTopColor: colors.border.light,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '700' }}>{field.label || 'Untitled'}</Text>
                    <Text style={{ color: colors.text.tertiary, fontSize: 12 }}>{field.type ?? 'Text'}</Text>
                  </View>

                  <Text style={{ color: colors.text.muted, fontSize: 12, marginTop: 4 }}>
                    {field.required ? 'Required' : 'Optional'}
                    {field.defaultValue ? ` • Default: ${field.defaultValue}` : ''}
                  </Text>

                  {options.length > 0 && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      {options.map((option) => (
                        <View
                          key={`${field.id}-${option.value}`}
                          style={{
                            borderRadius: 999,
                            paddingHorizontal: 10,
                            paddingVertical: 5,
                            backgroundColor: colors.bg.secondary,
                            borderWidth: 1,
                            borderColor: colors.border.light,
                          }}
                        >
                          <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600' }}>
                            {option.value}
                            {typeof option.amount === 'number' && Number.isFinite(option.amount)
                              ? ` (+${formatCurrency(option.amount)})`
                              : ''}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </DetailSection>

      <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24 }}>
        {canManageStatus ? (
          <Pressable
            onPress={handleToggleServiceActive}
            disabled={isStatusSaving}
            accessibilityRole="switch"
            accessibilityState={{ checked: Boolean(service.isDiscontinued), disabled: isStatusSaving }}
            className="active:opacity-80"
            style={{
              backgroundColor: palette.dangerBg,
              borderWidth: 1,
              borderColor: palette.dangerBorder,
              borderRadius: 14,
              minHeight: 50,
              paddingHorizontal: 14,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              opacity: isStatusSaving ? 0.6 : 1,
            }}
          >
            <Text style={{ color: palette.danger, fontSize: 14, fontWeight: '600' }}>{isStatusSaving ? 'Saving…' : 'Deactivate service'}</Text>
            <View style={{ width: 44, height: 26, borderRadius: 999, backgroundColor: service.isDiscontinued ? palette.danger : palette.dangerBorder, padding: 3 }}>
              <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF', transform: [{ translateX: service.isDiscontinued ? 18 : 0 }] }} />
            </View>
          </Pressable>
        ) : null}
        {!onEdit ? <View style={{ marginTop: canManageStatus ? 12 : 0 }}>
        <DetailActionButton
          label="Edit Service"
          icon={<Edit2 size={18} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={2} />}
          onPress={handleEdit}
        />
        </View> : null}
      </View>
      </View>
    </View>
  );
}
