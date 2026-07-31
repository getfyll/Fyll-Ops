import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, Modal, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Package, Edit2, Printer, PackagePlus, Plus, Minus, Clock, Trash2, ClipboardCheck, Archive, ArchiveRestore } from 'lucide-react-native';
import useFyllStore, { formatCurrency } from '@/lib/state/fyll-store';
import useAuthStore from '@/lib/state/auth-store';
import { useThemeColors } from '@/lib/theme';
import { DetailSection, DetailImagePreview, DetailActionButton } from './SplitViewLayout';
import * as Haptics from 'expo-haptics';
import { normalizeProductType } from '@/lib/product-utils';

interface ProductDetailPanelProps {
  productId: string;
  onClose?: () => void;
}

export function ProductDetailPanel({ productId, onClose }: ProductDetailPanelProps) {
  const colors = useThemeColors();
  const router = useRouter();
  const isDark = colors.bg.primary === '#111111';

  const products = useFyllStore((s) => s.products);
  const updateProduct = useFyllStore((s) => s.updateProduct);
  const deleteProduct = useFyllStore((s) => s.deleteProduct);
  const userRole = useFyllStore((s) => s.userRole);
  const restockLogs = useFyllStore((s) => s.restockLogs);
  const auditLogs = useFyllStore((s) => s.auditLogs);
  const orders = useFyllStore((s) => s.orders);
  const useGlobalLowStockThreshold = useFyllStore((s) => s.useGlobalLowStockThreshold);
  const globalLowStockThreshold = useFyllStore((s) => s.globalLowStockThreshold);
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const currentUserRole = useAuthStore((s) => s.currentUser?.role ?? null);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [isStatusSaving, setIsStatusSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const product = useMemo(() => products.find((p) => p.id === productId), [products, productId]);
  const isOwner = userRole === 'owner';
  const canManageStatus = userRole === 'owner' || currentUserRole === 'admin' || currentUserRole === 'manager';
  const primaryDisplayImage = useMemo(
    () => product?.imageUrl ?? product?.variants.find((variant) => variant.imageUrl?.trim())?.imageUrl,
    [product]
  );

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
    }
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  };

  useEffect(() => {
    return () => {
      if (toastTimer.current) {
        clearTimeout(toastTimer.current);
      }
    };
  }, []);

  // Get effective threshold for this product
  const effectiveThreshold = useMemo(() => {
    if (!product) return 5;
    return useGlobalLowStockThreshold ? globalLowStockThreshold : product.lowStockThreshold;
  }, [product, useGlobalLowStockThreshold, globalLowStockThreshold]);

  // Get recent restock logs for this product (last 3)
  const recentRestocks = useMemo(() => {
    if (!productId) return [];
    return restockLogs
      .filter((log) => log.productId === productId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 3);
  }, [restockLogs, productId]);

  const inventoryActivity = useMemo(() => {
    if (!product) return [] as Array<{
      id: string;
      type: 'sold' | 'restock' | 'audit_adjustment';
      variantName: string;
      quantity: number;
      delta: number;
      at: string;
      subtitle: string;
      actor?: string;
    }>;

    const variantNameById = new Map(
      product.variants.map((variant) => [
        variant.id,
        Object.values(variant.variableValues ?? {}).join(' / ') || variant.sku || 'Variant',
      ])
    );

    const saleEvents = orders.flatMap((order) => {
      const status = (order.status ?? '').toLowerCase();
      if (status.includes('cancel') || status.includes('refund')) return [];

      return (order.items ?? [])
        .filter((item) => item.productId === product.id && item.quantity > 0)
        .map((item, index) => {
          const orderRef = order.orderNumber
            ? `ORD-${order.orderNumber.replace(/^ORD[-\s]*/i, '')}`
            : 'Order';
          return {
            id: `sale-${order.id}-${item.variantId}-${index}`,
            type: 'sold' as const,
            variantName: variantNameById.get(item.variantId) ?? 'Unknown variant',
            quantity: item.quantity,
            delta: -Math.abs(item.quantity),
            at: order.orderDate ?? order.createdAt ?? order.updatedAt ?? new Date().toISOString(),
            subtitle: `${orderRef} · ${order.customerName || 'Unknown customer'}`,
            actor: order.createdBy,
          };
        });
    });

    const restockEvents = restockLogs
      .filter((log) => log.productId === product.id)
      .map((log) => ({
        id: `restock-${log.id}`,
        type: 'restock' as const,
        variantName: variantNameById.get(log.variantId) ?? 'Unknown variant',
        quantity: Math.abs(log.quantityAdded),
        delta: log.quantityAdded,
        at: log.timestamp,
        subtitle: log.note?.trim()
          ? `${log.note.trim()} · ${log.previousStock} → ${log.newStock}`
          : `${log.previousStock} → ${log.newStock}`,
        actor: log.performedBy,
      }));

    const auditAdjustmentEvents = auditLogs.flatMap((audit) => (
      (audit.items ?? [])
        .filter((item) => item.productId === product.id && item.discrepancy !== 0)
        .map((item, index) => ({
          id: `audit-${audit.id}-${item.variantId}-${index}`,
          type: 'audit_adjustment' as const,
          variantName: variantNameById.get(item.variantId) ?? item.variantName ?? 'Unknown variant',
          quantity: Math.abs(item.discrepancy),
          delta: item.discrepancy,
          at: audit.completedAt ?? new Date().toISOString(),
          subtitle: `Audit count · ${item.expectedStock} → ${item.actualStock}`,
          actor: audit.performedBy,
        }))
    ));

    return [...saleEvents, ...restockEvents, ...auditAdjustmentEvents]
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 12);
  }, [orders, product, restockLogs, auditLogs]);

  if (!product) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <Package size={48} color={colors.text.muted} strokeWidth={1.5} />
        <Text style={{ color: colors.text.muted, fontSize: 16, marginTop: 16 }}>
          Select a product to view details
        </Text>
      </View>
    );
  }

  const productType = normalizeProductType(product.productType);
  const isService = productType === 'service';
  const totalStock = isService ? 0 : product.variants.reduce((sum, v) => sum + v.stock, 0);
  const totalValue = product.variants.reduce((sum, v) => sum + v.stock * v.sellingPrice, 0);
  const lowStockCount = isService
    ? 0
    : product.variants.filter((v) => v.stock > 0 && v.stock <= effectiveThreshold).length;
  const servicePrice = product.variants[0]?.sellingPrice ?? 0;
  const showStockControls = isOwner && !isService;

  const handleAdjustStock = (variantId: string, delta: number) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const nextVariants = product.variants.map((variant) => (
      variant.id === variantId
        ? { ...variant, stock: Math.max(0, variant.stock + delta) }
        : variant
    ));
    void updateProduct(product.id, { variants: nextVariants }, businessId);
  };

  const handleEdit = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    router.push(`/product/${product.id}`);
  };

  const handleDelete = () => {
    if (Platform.OS === 'web') {
      const active = document.activeElement as HTMLElement | null;
      active?.blur();
    }
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setPendingDelete(true);
  };

  const confirmDelete = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      if (Platform.OS !== 'web') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
      await deleteProduct(product.id, businessId);
      setPendingDelete(false);
      showToast('success', 'Product moved to Recycle Bin.');
      onClose?.();
    } catch (error) {
      console.warn('Product recycle bin move failed:', error);
      showToast('error', 'Could not move product to Recycle Bin.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleArchived = async () => {
    if (!product || isArchiving) return;
    setIsArchiving(true);
    const nextArchived = !(product.isArchived ?? false);
    try {
      await updateProduct(product.id, {
        isArchived: nextArchived,
        archivedAt: nextArchived
          ? (product.archivedAt ?? new Date().toISOString())
          : undefined,
      }, businessId);
      showToast('success', nextArchived ? 'Product archived.' : 'Product unarchived.');
    } catch (error) {
      console.warn('Product archive toggle failed:', error);
      showToast('error', 'Could not update archive status.');
    } finally {
      setIsArchiving(false);
    }
  };

  const handleToggleProductActive = async () => {
    if (!product || isStatusSaving) return;
    setIsStatusSaving(true);
    const nextInactive = !(product.isDiscontinued ?? false);
    try {
      await updateProduct(product.id, {
        isDiscontinued: nextInactive,
        discontinuedAt: nextInactive
          ? (product.discontinuedAt ?? new Date().toISOString())
          : undefined,
      }, businessId);
    } catch (error) {
      console.warn('Product status update failed:', error);
    } finally {
      setIsStatusSaving(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Product Image */}
      <DetailImagePreview imageUrl={primaryDisplayImage} />

      {/* Product Info */}
      <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
          <Text style={{ color: colors.text.primary, fontSize: 22, fontWeight: '700', flex: 1 }}>
            {product.name}
          </Text>
          {product.isNewDesign && (
            <View style={{ backgroundColor: '#3B82F6', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>
                New {product.designYear || new Date().getFullYear()}
              </Text>
            </View>
          )}
          {product.isDiscontinued && (
            <View style={{ backgroundColor: 'rgba(156, 163, 175, 0.18)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginLeft: 6 }}>
              <Text style={{ color: '#9CA3AF', fontSize: 11, fontWeight: '700' }}>INACTIVE</Text>
            </View>
          )}
          {product.isArchived && (
            <View style={{ backgroundColor: 'rgba(156, 163, 175, 0.18)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginLeft: 6 }}>
              <Text style={{ color: '#9CA3AF', fontSize: 11, fontWeight: '700' }}>ARCHIVED</Text>
            </View>
          )}
        </View>
        <Text style={{ color: colors.text.muted, fontSize: 13 }}>
          {product.categories?.join(', ') || 'Uncategorized'}
        </Text>
      </View>

      {/* Stats */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 20, paddingTop: 16, gap: 12 }}>
        <View
          style={{
            flex: 1,
            backgroundColor: colors.bg.card,
            borderRadius: 16,
            padding: 14,
            borderWidth: 1,
            borderColor: colors.border.light,
          }}
        >
          <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: '500' }}>
            {isService ? 'Service Type' : 'Total Stock'}
          </Text>
          <Text style={{ color: colors.text.primary, fontSize: 24, fontWeight: '700', marginTop: 4 }}>
            {isService ? 'Service' : totalStock}
          </Text>
          {!isService && lowStockCount > 0 && (
            <View style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginTop: 6, alignSelf: 'flex-start' }}>
              <Text style={{ color: '#F59E0B', fontSize: 12, fontWeight: '600' }}>{lowStockCount} low</Text>
            </View>
          )}
          {!isService && lowStockCount === 0 && totalStock === 0 && (
            <View style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginTop: 6, alignSelf: 'flex-start' }}>
              <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '600' }}>Out of stock</Text>
            </View>
          )}
        </View>
        {isOwner && (
          <View
            style={{
              flex: 1,
              backgroundColor: colors.bg.card,
              borderRadius: 16,
              padding: 14,
              borderWidth: 1,
              borderColor: colors.border.light,
            }}
          >
          <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: '500' }}>
            {isService ? 'Service Price' : 'Stock Value'}
          </Text>
          <Text style={{ color: '#10B981', fontSize: 24, fontWeight: '700', marginTop: 4 }}>
            {formatCurrency(isService ? servicePrice : totalValue)}
          </Text>
          <Text style={{ color: colors.text.muted, fontSize: 11, marginTop: 6 }}>
            {isService ? 'default charge' : 'at retail price'}
          </Text>
          </View>
        )}
      </View>

      {/* Description */}
      {product.description && (
        <DetailSection title="Description">
          <Text style={{ color: colors.text.secondary, fontSize: 14, lineHeight: 20 }}>
            {product.description}
          </Text>
        </DetailSection>
      )}

      {/* Variants */}
      <DetailSection title={`Variants (${product.variants.length})`}>
        {product.variants.map((variant, index) => {
          const variantName = Object.values(variant.variableValues).join(' / ');
          const displayVariantName = variantName.toUpperCase();
          const displaySku = variant.sku.toUpperCase();
          const isLowStock = variant.stock <= effectiveThreshold;
          const isOutOfStock = variant.stock === 0;
          const statusColor = isOutOfStock ? '#EF4444' : isLowStock ? '#F59E0B' : '#10B981';

          return (
            <View
              key={variant.id}
              style={{
                paddingVertical: 12,
                borderTopWidth: index > 0 ? 1 : 0,
                borderTopColor: colors.border.light,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: '600' }}>{displayVariantName}</Text>
                  <Text style={{ color: colors.text.muted, fontSize: 12, marginTop: 2 }}>SKU: {displaySku}</Text>
                </View>
                <View style={{ backgroundColor: `${statusColor}15`, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                  <Text style={{ color: statusColor, fontSize: 13, fontWeight: '600' }}>{variant.stock} units</Text>
                </View>
              </View>

              {/* Stock Controls */}
              {showStockControls && (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Pressable
                      onPress={() =>
                        router.push({
                          pathname: '/restock',
                          params: { productId: product.id, variantId: variant.id },
                        })
                      }
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 8,
                        backgroundColor: 'rgba(16, 185, 129, 0.15)',
                      }}
                    >
                      <PackagePlus size={14} color="#10B981" strokeWidth={2} />
                      <Text style={{ color: '#10B981', fontSize: 12, fontWeight: '600', marginLeft: 4 }}>Restock</Text>
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        router.push({
                          pathname: '/label-print',
                          params: { productId: product.id, variantId: variant.id },
                        })
                      }
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 8,
                        backgroundColor: colors.bg.secondary,
                      }}
                    >
                      <Printer size={14} color={colors.text.tertiary} strokeWidth={2} />
                    </Pressable>
                  </View>

                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      borderRadius: 10,
                      backgroundColor: colors.border.light,
                    }}
                  >
                    <Pressable
                      onPress={() => handleAdjustStock(variant.id, -1)}
                      disabled={variant.stock === 0}
                      style={{ padding: 8, opacity: variant.stock === 0 ? 0.4 : 1 }}
                    >
                      <Minus size={16} color={colors.text.primary} strokeWidth={2} />
                    </Pressable>
                    <View style={{ width: 32, alignItems: 'center' }}>
                      <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600' }}>{variant.stock}</Text>
                    </View>
                    <Pressable
                      onPress={() => handleAdjustStock(variant.id, 1)}
                      style={{ padding: 8 }}
                    >
                      <Plus size={16} color={colors.text.primary} strokeWidth={2} />
                    </Pressable>
                  </View>
                </View>
              )}

              {isOwner && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border.light }}>
                  <Text style={{ color: colors.text.tertiary, fontSize: 13 }}>Sale Price</Text>
                  <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '600' }}>{formatCurrency(variant.sellingPrice)}</Text>
                </View>
              )}
            </View>
          );
        })}
      </DetailSection>

      {/* Recent Restocks */}
      {recentRestocks.length > 0 && (
        <DetailSection title="Recent Restocks">
          {recentRestocks.map((log, index) => {
            const variant = product.variants.find((v) => v.id === log.variantId);
            const variantName = variant ? Object.values(variant.variableValues).join(' / ') : 'Unknown';
            const date = new Date(log.timestamp);
            const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const isPositiveRestock = log.quantityAdded >= 0;
            const restockAccentColor = isPositiveRestock ? '#10B981' : '#EF4444';

            return (
              <View
                key={log.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 10,
                  borderTopWidth: index > 0 ? 1 : 0,
                  borderTopColor: colors.border.light,
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: isPositiveRestock ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12,
                  }}
                >
                  {isPositiveRestock ? (
                    <PackagePlus size={16} color={restockAccentColor} strokeWidth={2} />
                  ) : (
                    <Minus size={16} color={restockAccentColor} strokeWidth={2.4} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '500' }}>
                    {log.quantityAdded >= 0 ? '+' : '-'}{Math.abs(log.quantityAdded)} units
                  </Text>
                  <Text style={{ color: colors.text.muted, fontSize: 12 }}>
                    {variantName} · {log.note?.trim() ? `${log.note.trim()} · ` : ''}{log.previousStock} → {log.newStock}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Clock size={12} color={colors.text.muted} strokeWidth={2} />
                  <Text style={{ color: colors.text.muted, fontSize: 12, marginLeft: 4 }}>{formattedDate}</Text>
                </View>
              </View>
            );
          })}
        </DetailSection>
      )}

      <DetailSection title="Inventory Activity">
        {inventoryActivity.length === 0 ? (
          <Text style={{ color: colors.text.muted, fontSize: 13 }}>
            No stock movement yet.
          </Text>
        ) : (
          <ScrollView
            style={{ maxHeight: 260 }}
            nestedScrollEnabled
            showsVerticalScrollIndicator
          >
            {inventoryActivity.map((entry, index) => {
              const date = new Date(entry.at);
              const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              const isRestock = entry.type === 'restock';
              const isAuditAdjustment = entry.type === 'audit_adjustment';
              const isPositiveDelta = entry.delta >= 0;
              const activityLabel = isAuditAdjustment
                ? `${isPositiveDelta ? '+' : '-'}${entry.quantity} units adjusted`
                : isRestock
                  ? `${isPositiveDelta ? '+' : '-'}${entry.quantity} units ${isPositiveDelta ? 'restocked' : 'adjusted'}`
                  : `-${entry.quantity} units sold`;
              const accentColor = isAuditAdjustment
                ? (isPositiveDelta ? '#10B981' : '#EF4444')
                : (isRestock ? (isPositiveDelta ? '#10B981' : '#EF4444') : '#EF4444');
              return (
                <View
                  key={entry.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 10,
                    borderTopWidth: index > 0 ? 1 : 0,
                    borderTopColor: colors.border.light,
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: isAuditAdjustment
                        ? (isPositiveDelta ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)')
                        : (isRestock
                          ? (isPositiveDelta ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)')
                          : 'rgba(239, 68, 68, 0.15)'),
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 12,
                    }}
                  >
                    {isAuditAdjustment ? (
                      <ClipboardCheck size={15} color={accentColor} strokeWidth={2} />
                    ) : isRestock ? (
                      isPositiveDelta
                        ? <PackagePlus size={16} color={accentColor} strokeWidth={2} />
                        : <Minus size={16} color={accentColor} strokeWidth={2.4} />
                    ) : (
                      <Minus size={16} color="#EF4444" strokeWidth={2.4} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '500' }}>
                      {activityLabel}
                    </Text>
                    <Text style={{ color: colors.text.muted, fontSize: 12 }}>
                      {entry.variantName} · {entry.subtitle}
                    </Text>
                    {entry.actor ? (
                      <Text style={{ color: colors.text.muted, fontSize: 11, marginTop: 2 }}>
                        by {entry.actor}
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Clock size={12} color={colors.text.muted} strokeWidth={2} />
                    <Text style={{ color: colors.text.muted, fontSize: 12, marginLeft: 4 }}>{formattedDate}</Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}
      </DetailSection>
      {/* Actions */}
      <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24 }}>
        {canManageStatus ? (
          <Pressable
            onPress={handleToggleProductActive}
            disabled={isStatusSaving}
            className="rounded-full items-center justify-center active:opacity-80"
            style={{
              backgroundColor: product.isDiscontinued ? 'rgba(16, 185, 129, 0.15)' : 'rgba(156, 163, 175, 0.18)',
              height: 48,
              opacity: isStatusSaving ? 0.6 : 1,
            }}
          >
            <Text
              style={{
                color: product.isDiscontinued ? '#10B981' : '#9CA3AF',
                fontSize: 15,
                fontWeight: '600',
              }}
            >
              {isStatusSaving
                ? 'Saving...'
                : product.isDiscontinued
                  ? 'Activate Product'
                  : 'Deactivate Product'}
            </Text>
          </Pressable>
        ) : null}
        <View style={{ marginTop: canManageStatus ? 12 : 0 }}>
        <DetailActionButton
          label="Edit Product"
          icon={<Edit2 size={18} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={2} />}
          onPress={handleEdit}
        />
        </View>
        <Pressable
          onPress={handleToggleArchived}
          disabled={isArchiving}
          className="rounded-full items-center justify-center mt-3 active:opacity-80"
          style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light, height: 48, opacity: isArchiving ? 0.6 : 1 }}
        >
          <View className="flex-row items-center">
            {product.isArchived ? (
              <ArchiveRestore size={18} color={colors.text.primary} strokeWidth={2} />
            ) : (
              <Archive size={18} color={colors.text.primary} strokeWidth={2} />
            )}
            <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: '600', marginLeft: 8 }}>
              {isArchiving ? 'Saving...' : product.isArchived ? 'Unarchive Product' : 'Archive Product'}
            </Text>
          </View>
        </Pressable>
        <Pressable
          onPress={handleDelete}
          className="rounded-full items-center justify-center mt-3 active:opacity-80"
          style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', height: 48 }}
        >
          <View className="flex-row items-center">
            <Trash2 size={18} color="#EF4444" strokeWidth={2} />
            <Text style={{ color: '#EF4444', fontSize: 15, fontWeight: '600', marginLeft: 8 }}>
              Delete Product
            </Text>
          </View>
        </Pressable>
      </View>

      <Modal
        visible={pendingDelete}
        animationType="fade"
        transparent
        onRequestClose={() => {
          if (!isDeleting) {
            setPendingDelete(false);
          }
        }}
      >
        <Pressable
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
          onPress={() => {
            if (!isDeleting) {
              setPendingDelete(false);
            }
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="w-[90%] rounded-2xl overflow-hidden"
            style={{ backgroundColor: colors.bg.primary, maxWidth: 360 }}
          >
            <View className="px-5 py-4" style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
              <Text style={{ color: colors.text.primary }} className="font-bold text-lg">Move to Recycle Bin</Text>
              <Text style={{ color: colors.text.tertiary }} className="text-sm mt-1">
                {product.name
                  ? `Move ${product.name} out of active inventory and keep it recoverable from Recycle Bin?`
                  : 'Move this product out of active inventory and keep it recoverable from Recycle Bin?'}
              </Text>
            </View>
            <View className="px-5 py-4 flex-row gap-3">
              <Pressable
                onPress={() => {
                  if (!isDeleting) {
                    setPendingDelete(false);
                  }
                }}
                className="flex-1 rounded-full items-center"
                style={{
                  backgroundColor: colors.bg.secondary,
                  height: 48,
                  justifyContent: 'center',
                  opacity: isDeleting ? 0.5 : 1,
                }}
                disabled={isDeleting}
              >
                <Text style={{ color: colors.text.tertiary }} className="font-medium">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={confirmDelete}
                className="flex-1 rounded-full items-center"
                style={{
                  backgroundColor: '#EF4444',
                  height: 48,
                  justifyContent: 'center',
                  opacity: isDeleting ? 0.7 : 1,
                }}
                disabled={isDeleting}
              >
                <Text className="text-white font-semibold">
                  {isDeleting ? 'Moving...' : 'Move'}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {toast ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 20,
            right: 20,
            bottom: 24,
            alignItems: 'center',
          }}
        >
          <View
            style={{
              backgroundColor: toast.type === 'success' ? '#111111' : '#7F1D1D',
              borderRadius: 999,
              paddingHorizontal: 16,
              paddingVertical: 12,
              minHeight: 44,
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600' }}>
              {toast.message}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}
