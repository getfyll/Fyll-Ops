import React, { useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Briefcase, Edit2 } from 'lucide-react-native';
import useFyllStore, { Product, ServiceVariableOption, formatCurrency } from '@/lib/state/fyll-store';
import useAuthStore from '@/lib/state/auth-store';
import { useThemeColors } from '@/lib/theme';
import { normalizeProductType } from '@/lib/product-utils';
import { DetailSection, DetailActionButton } from './SplitViewLayout';

interface ServiceDetailPanelProps {
  serviceId: string;
  from?: 'inventory' | 'services';
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

export function ServiceDetailPanel({ serviceId, from }: ServiceDetailPanelProps) {
  const colors = useThemeColors();
  const router = useRouter();
  const isDark = colors.bg.primary === '#111111';

  const products = useFyllStore((s) => s.products);
  const updateProduct = useFyllStore((s) => s.updateProduct);
  const userRole = useFyllStore((s) => s.userRole);
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const currentUserRole = useAuthStore((s) => s.currentUser?.role ?? null);
  const [isStatusSaving, setIsStatusSaving] = useState(false);
  const service = useMemo(
    () => products.find((product) => product.id === serviceId && isServiceProduct(product)),
    [products, serviceId]
  );
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
  const usesGlobalPricing = service.serviceUsesGlobalPricing ?? true;

  const handleEdit = () => {
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

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
        <View
          style={{
            backgroundColor: colors.bg.card,
            borderRadius: 16,
            padding: 16,
            borderWidth: 1,
            borderColor: colors.border.light,
          }}
        >
          <Text style={{ color: colors.text.primary, fontSize: 24, fontWeight: '700' }} numberOfLines={2}>
            {service.name}
          </Text>

          <Text style={{ color: colors.text.muted, marginTop: 8 }}>
            {service.description?.trim() || 'No description'}
          </Text>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <View
              style={{
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 5,
                backgroundColor: usesGlobalPricing ? 'rgba(16,185,129,0.15)' : 'rgba(59,130,246,0.15)',
              }}
            >
              <Text
                style={{
                  color: usesGlobalPricing ? '#10B981' : '#3B82F6',
                  fontSize: 12,
                  fontWeight: '700',
                }}
              >
                {usesGlobalPricing ? 'Global Pricing' : 'Option Pricing'}
              </Text>
            </View>
            <View
              style={{
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 5,
                backgroundColor: service.isDiscontinued ? 'rgba(156,163,175,0.2)' : 'rgba(16,185,129,0.15)',
              }}
            >
              <Text
                style={{
                  color: service.isDiscontinued ? '#9CA3AF' : '#10B981',
                  fontSize: 12,
                  fontWeight: '700',
                }}
              >
                {service.isDiscontinued ? 'Inactive' : 'Active'}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <DetailSection title="Pricing">
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: colors.text.tertiary, fontSize: 14 }}>Base Price</Text>
            <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '700' }}>
              {formatCurrency(basePrice)}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: colors.text.tertiary, fontSize: 14 }}>Mode</Text>
            <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600' }}>
              {usesGlobalPricing ? 'Single global service price' : 'Option-based amounts'}
            </Text>
          </View>
        </View>
      </DetailSection>

      {tags.length > 0 && (
        <DetailSection title={`Tags (${tags.length})`}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {tags.map((tag) => (
              <View
                key={tag}
                style={{
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  backgroundColor: colors.bg.secondary,
                  borderWidth: 1,
                  borderColor: colors.border.light,
                }}
              >
                <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600' }}>{tag}</Text>
              </View>
            ))}
          </View>
        </DetailSection>
      )}

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

      <DetailSection title={`Fields (${fields.length})`}>
        {fields.length === 0 ? (
          <Text style={{ color: colors.text.muted, fontSize: 13 }}>No service fields configured.</Text>
        ) : (
          <View style={{ gap: 12 }}>
            {fields.map((field, index) => {
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
            className="rounded-full items-center justify-center active:opacity-80"
            style={{
              backgroundColor: service.isDiscontinued ? 'rgba(16, 185, 129, 0.15)' : 'rgba(156, 163, 175, 0.18)',
              height: 48,
              opacity: isStatusSaving ? 0.6 : 1,
            }}
          >
            <Text
              style={{
                color: service.isDiscontinued ? '#10B981' : '#9CA3AF',
                fontSize: 15,
                fontWeight: '600',
              }}
            >
              {isStatusSaving
                ? 'Saving...'
                : service.isDiscontinued
                  ? 'Activate Service'
                  : 'Deactivate Service'}
            </Text>
          </Pressable>
        ) : null}
        <View style={{ marginTop: canManageStatus ? 12 : 0 }}>
        <DetailActionButton
          label="Edit Service"
          icon={<Edit2 size={18} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={2} />}
          onPress={handleEdit}
        />
        </View>
      </View>
    </View>
  );
}
