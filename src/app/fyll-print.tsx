import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, Clock3, Download, Package, Plus, Printer, Trash2, Truck, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useThemeColors } from '@/lib/theme';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { useTabBarHeight } from '@/lib/useTabBarHeight';
import { DesktopSidebar } from '@/components/DesktopSidebar';
import useFyllStore, { type Order } from '@/lib/state/fyll-store';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { prepareOrderLabelData } from '@/utils/printOrderLabel';
import { generateQrMatrix } from '@/lib/qrcode';
import { formatAddressValue } from '@/lib/format-address';
import { downloadInventoryLabelPdf, downloadShippingLabelPdf } from '@/lib/shipping-label-pdf';
import { printHtmlOnWeb } from '@/lib/print-html-web';
import {
  addFyllPrintQueueItem,
  buildInventoryQueueHtml,
  buildShippingQueueHtml,
  clearFyllPrintQueueCategory,
  createShippingPrintQueueItem,
  FYLL_PRINT_CATEGORY_META,
  FyllPrintCategory,
  FyllPrintQueueItem,
  FyllPrintQueueState,
  getFyllPrintQueue,
  INVENTORY_QUEUE_LABEL_SIZE,
  mmToPrintPoints,
  recordFyllPrintHistory,
  removeFyllPrintQueueItem,
  SHIPPING_QUEUE_LABEL_SIZE,
} from '@/lib/fyll-print-queue';

type PendingPrintAction = 'print' | 'download';
type PrintViewMode = 'queue' | 'history';

const CATEGORY_OPTIONS: FyllPrintCategory[] = ['shipping', 'inventory'];

const getCategorySize = (category: FyllPrintCategory) => (
  category === 'inventory' ? INVENTORY_QUEUE_LABEL_SIZE : SHIPPING_QUEUE_LABEL_SIZE
);

const getCategoryHtml = (category: FyllPrintCategory, queue: FyllPrintQueueState) => (
  category === 'inventory'
    ? buildInventoryQueueHtml(queue.inventory)
    : buildShippingQueueHtml(queue.shipping)
);

const getCategoryItemsHtml = (category: FyllPrintCategory, items: FyllPrintQueueItem[]) => (
  category === 'inventory'
    ? buildInventoryQueueHtml(items.filter((item): item is Extract<FyllPrintQueueItem, { category: 'inventory' }> => item.category === 'inventory'))
    : buildShippingQueueHtml(items.filter((item): item is Extract<FyllPrintQueueItem, { category: 'shipping' }> => item.category === 'shipping'))
);

const refreshShippingItemsWithBusinessSettings = (
  items: FyllPrintQueueItem[],
  business: {
    businessName: string;
    businessSlug?: string;
    businessLogo: string | null;
    businessPhone: string;
    businessWebsite: string;
    returnAddress: string;
  },
  orderLookup?: Map<string, Order>,
): FyllPrintQueueItem[] => items.map((item) => {
  if (item.category !== 'shipping') return item;
  const order = orderLookup?.get(item.orderId);
  if (order) {
    const refreshedLabelData = prepareOrderLabelData(
      {
        orderNumber: order.orderNumber,
        customerTrackingCode: order.customerTrackingCode,
        websiteOrderReference: order.websiteOrderReference,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        customerPhone: order.customerPhone,
        deliveryAddress: order.deliveryAddress,
        deliveryState: order.deliveryState,
        logistics: {
          ...order.logistics,
          carrierName: item.carrierName || order.logistics?.carrierName,
        },
      },
      business,
    );

    return {
      ...item,
      labelData: refreshedLabelData,
    };
  }

  return {
    ...item,
    labelData: {
      ...item.labelData,
      businessName: business.businessName || item.labelData.businessName,
      businessLogo: business.businessLogo ?? item.labelData.businessLogo,
      businessPhone: business.businessPhone,
      businessWebsite: business.businessWebsite,
      returnAddress: business.returnAddress,
    },
  };
});

const isDispatchOrder = (order: Order) => {
  const status = (order.status ?? '').trim().toLowerCase();
  if (status.includes('cancel') || status.includes('refund') || status === 'delivered' || status === 'completed') {
    return false;
  }
  return (
    status.includes('dispatch')
    || Boolean(order.logistics?.dispatchDate || order.logistics?.datePickedUp)
  );
};

export default function FyllPrintScreen() {
  const colors = useThemeColors();
  const { isDesktop } = useBreakpoint();
  const tabBarHeight = useTabBarHeight();
  const isDark = colors.bg.primary === '#111111';
  const orders = useFyllStore((s) => s.orders);
  const {
    businessName,
    businessSlug,
    businessLogo,
    businessPhone,
    businessWebsite,
    returnAddress,
  } = useBusinessSettings();
  const [activeCategory, setActiveCategory] = useState<FyllPrintCategory>('shipping');
  const [queue, setQueue] = useState<FyllPrintQueueState>({
    inventory: [],
    shipping: [],
    history: { inventory: [], shipping: [] },
  });
  const [selectedQueueItemIds, setSelectedQueueItemIds] = useState<Record<FyllPrintCategory, string[]>>({
    inventory: [],
    shipping: [],
  });
  const [selectedDispatchOrderIds, setSelectedDispatchOrderIds] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<PrintViewMode>('queue');
  const [showDispatchPicker, setShowDispatchPicker] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<PendingPrintAction | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [isAddingDispatchOrders, setIsAddingDispatchOrders] = useState(false);

  const loadQueue = useCallback(async () => {
    setIsLoading(true);
    const nextQueue = await getFyllPrintQueue();
    setQueue(nextQueue);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const activeItems = queue[activeCategory] as FyllPrintQueueItem[];
  const activeSelectedIds = selectedQueueItemIds[activeCategory] ?? [];
  const activeSelectedIdSet = useMemo(() => new Set(activeSelectedIds), [activeSelectedIds]);
  const selectedPrintItems = useMemo(() => (
    activeSelectedIds.length > 0
      ? activeItems.filter((item) => activeSelectedIdSet.has(item.id))
      : activeItems
  ), [activeItems, activeSelectedIdSet, activeSelectedIds.length]);
  const selectedPrintCount = selectedPrintItems.length;
  const categoryMeta = FYLL_PRINT_CATEGORY_META[activeCategory];
  const categorySize = getCategorySize(activeCategory);

  const counts = useMemo(() => ({
    inventory: queue.inventory.length,
    shipping: queue.shipping.length,
  }), [queue.inventory.length, queue.shipping.length]);

  const dispatchOrders = useMemo(() => (
    orders
      .filter(isDispatchOrder)
      .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
  ), [orders]);

  const selectedDispatchOrders = useMemo(() => {
    const selected = new Set(selectedDispatchOrderIds);
    return dispatchOrders.filter((order) => selected.has(order.id));
  }, [dispatchOrders, selectedDispatchOrderIds]);

  const executeBatchAction = async (action: PendingPrintAction) => {
    if (selectedPrintCount === 0 || isWorking) return;

    setPendingAction(null);
    setIsWorking(true);
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    try {
      const printableItems = refreshShippingItemsWithBusinessSettings(selectedPrintItems, {
        businessName: businessName || 'Fyll',
        businessSlug,
        businessLogo,
        businessPhone,
        businessWebsite,
        returnAddress,
      }, new Map(orders.map((order) => [order.id, order])));
      const html = getCategoryItemsHtml(activeCategory, printableItems);
      const size = getCategorySize(activeCategory);
      const width = mmToPrintPoints(size.widthMm);
      const height = mmToPrintPoints(size.heightMm);

      let historyAction: PendingPrintAction = action;
      if (Platform.OS === 'web' && action === 'print' && isDesktop) {
        // Desktop browsers' print dialog has rendered this correctly via a hidden iframe —
        // keep that path since it gives desktop users the native "print or save as PDF"
        // dialog directly, which is a nicer flow than forcing a silent file download.
        await printHtmlOnWeb(html);
      } else if (Platform.OS === 'web') {
        // Both Print.printAsync({ html }) and window.print() on an iframe have proven
        // unreliable on mobile web in this environment — observed printing the top-level
        // app screen instead of the isolated label content, on both iOS Safari and Android
        // Chrome. Generating the PDF bytes directly and downloading the file sidesteps
        // browser print dialogs entirely, so there's no dialog behavior left to be unreliable.
        const dateStamp = new Date().toISOString().slice(0, 10);
        const filename = `fyll-${activeCategory}-labels-${dateStamp}.pdf`;
        if (activeCategory === 'shipping') {
          const shippingItems = printableItems.filter(
            (item): item is Extract<FyllPrintQueueItem, { category: 'shipping' }> => item.category === 'shipping'
          );
          downloadShippingLabelPdf(shippingItems.map((item) => item.labelData), size.widthMm, size.heightMm, filename);
        } else {
          const inventoryItems = printableItems.filter(
            (item): item is Extract<FyllPrintQueueItem, { category: 'inventory' }> => item.category === 'inventory'
          );
          downloadInventoryLabelPdf(
            inventoryItems.map((item) => ({
              sku: item.sku,
              barcode: item.barcode,
              productName: item.productName,
              variantName: item.variantName,
            })),
            size.widthMm,
            size.heightMm,
            filename
          );
        }
        historyAction = 'download';
      } else if (action === 'print') {
        await Print.printAsync({ html, width, height });
      } else {
        const { uri } = await Print.printToFileAsync({ html, width, height, base64: false });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, {
            mimeType: 'application/pdf',
            dialogTitle: `${categoryMeta.shortLabel} Label Batch`,
            UTI: 'com.adobe.pdf',
          });
        }
      }
      const nextQueue = await recordFyllPrintHistory(activeCategory, historyAction, selectedPrintCount);
      setQueue(nextQueue);
    } catch (error) {
      console.log('FYLL Print batch error:', error);
    } finally {
      setIsWorking(false);
    }
  };

  const renderHistory = () => {
    const items = queue.history[activeCategory] ?? [];

    return (
      <View
        style={{
          borderRadius: 28,
          borderWidth: 1,
          borderColor: colors.border.light,
          backgroundColor: colors.bg.primary,
          overflow: 'hidden',
        }}
      >
        <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '400', letterSpacing: 1, textTransform: 'uppercase', paddingHorizontal: 24, paddingTop: 22, paddingBottom: 18 }}>
          {categoryMeta.label.replace('Labels', 'Print History')}
        </Text>
        {items.length > 0 ? (
          <View>
            {items.slice(0, 5).map((item) => (
              <View
                key={item.id}
                style={{
                  minHeight: 72,
                  paddingHorizontal: 24,
                  borderTopWidth: 1,
                  borderTopColor: colors.border.light,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                }}
              >
                <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: '#10B981', alignItems: 'center', justifyContent: 'center' }}>
                  <Check size={11} color="#10B981" strokeWidth={2} />
                </View>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '500' }}>
                    Batch #{item.id.slice(-6).toUpperCase()}
                  </Text>
                  <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '400' }}>
                    · {item.itemCount} label{item.itemCount === 1 ? '' : 's'}
                  </Text>
                </View>
                <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '400' }}>
                  {new Date(item.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </Text>
                <View
                  style={{
                    height: 34,
                    borderRadius: 999,
                    paddingHorizontal: 14,
                    borderWidth: 1,
                    borderColor: colors.border.light,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 7,
                  }}
                >
                  <Download size={14} color={colors.text.primary} />
                  <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '500' }}>
                    {item.action === 'download' ? 'PDF' : 'Print'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Text style={{ color: colors.text.secondary, fontSize: 12, lineHeight: 18, paddingHorizontal: 24, paddingBottom: 24 }}>
            No {categoryMeta.shortLabel.toLowerCase()} print history yet.
          </Text>
        )}
      </View>
    );
  };

  const handleRemoveItem = async (item: FyllPrintQueueItem) => {
    const nextQueue = await removeFyllPrintQueueItem(item.category, item.id);
    setQueue(nextQueue);
    setSelectedQueueItemIds((current) => ({
      ...current,
      [item.category]: current[item.category].filter((id) => id !== item.id),
    }));
  };

  const handleClearCategory = async () => {
    const nextQueue = await clearFyllPrintQueueCategory(activeCategory);
    setQueue(nextQueue);
    setSelectedQueueItemIds((current) => ({
      ...current,
      [activeCategory]: [],
    }));
  };

  const toggleQueueItemSelection = (item: FyllPrintQueueItem) => {
    setSelectedQueueItemIds((current) => {
      const categorySelection = current[item.category] ?? [];
      return {
        ...current,
        [item.category]: categorySelection.includes(item.id)
          ? categorySelection.filter((id) => id !== item.id)
          : [...categorySelection, item.id],
      };
    });
  };

  const toggleDispatchOrder = (orderId: string) => {
    setSelectedDispatchOrderIds((current) => (
      current.includes(orderId)
        ? current.filter((id) => id !== orderId)
        : [...current, orderId]
    ));
  };

  const handleAddDispatchOrdersToQueue = async () => {
    if (selectedDispatchOrders.length === 0 || isAddingDispatchOrders) return;

    setIsAddingDispatchOrders(true);
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    try {
      for (const order of selectedDispatchOrders) {
        const labelData = prepareOrderLabelData(
          {
            orderNumber: order.orderNumber,
            customerTrackingCode: order.customerTrackingCode,
            websiteOrderReference: order.websiteOrderReference,
            customerName: order.customerName,
            customerEmail: order.customerEmail,
            customerPhone: order.customerPhone,
            deliveryAddress: order.deliveryAddress,
            deliveryState: order.deliveryState,
            logistics: {
              ...order.logistics,
              carrierName: order.logistics?.carrierName,
            },
          },
          {
            businessName: businessName || 'Fyll',
            businessSlug,
            businessLogo,
            businessPhone,
            businessWebsite,
            returnAddress,
          }
        );
        await addFyllPrintQueueItem(createShippingPrintQueueItem({
          orderId: order.id,
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          destination: order.deliveryState || order.deliveryAddress || '',
          carrierName: order.logistics?.carrierName || 'Shipping',
          labelData,
        }));
      }

      const nextQueue = await getFyllPrintQueue();
      setQueue(nextQueue);
      setSelectedDispatchOrderIds([]);
      setActiveCategory('shipping');
      setShowDispatchPicker(false);
      setViewMode('queue');
    } catch (error) {
      console.log('Add dispatch orders to print queue error:', error);
    } finally {
      setIsAddingDispatchOrders(false);
    }
  };

  const renderDispatchOrderPicker = () => (
    <View
      style={{
        borderRadius: 22,
        borderWidth: 1,
        borderColor: colors.border.light,
        backgroundColor: colors.bg.primary,
        padding: 16,
        marginBottom: 18,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '500' }}>
            Dispatch orders
          </Text>
        </View>
        <Pressable
          onPress={handleAddDispatchOrdersToQueue}
          disabled={selectedDispatchOrders.length === 0 || isAddingDispatchOrders}
          style={{
            minHeight: 44,
            borderRadius: 999,
            paddingHorizontal: 16,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.text.primary,
            opacity: selectedDispatchOrders.length === 0 || isAddingDispatchOrders ? 0.5 : 1,
          }}
        >
          {isAddingDispatchOrders ? (
            <ActivityIndicator color={colors.bg.primary} />
          ) : (
            <Text style={{ color: colors.bg.primary, fontSize: 12, fontWeight: '500' }}>
              Add {selectedDispatchOrders.length || ''} to Queue
            </Text>
          )}
        </Pressable>
      </View>

      {dispatchOrders.length > 0 ? (
        <View style={{ marginTop: 14, gap: 10 }}>
          {dispatchOrders.map((order) => {
            const selected = selectedDispatchOrderIds.includes(order.id);
            const alreadyQueued = queue.shipping.some((item) => item.orderId === order.id);
            return (
              <Pressable
                key={order.id}
                onPress={() => toggleDispatchOrder(order.id)}
                style={{
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: selected ? colors.text.primary : colors.border.light,
                  backgroundColor: selected ? colors.bg.secondary : colors.bg.primary,
                  padding: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    borderWidth: 1,
                    borderColor: selected ? colors.text.primary : colors.border.medium,
                    backgroundColor: selected ? colors.text.primary : colors.bg.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {selected ? <Check size={14} color={colors.bg.primary} strokeWidth={3} /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '500' }} numberOfLines={1}>
                    {order.orderNumber} · {order.customerName}
                  </Text>
                  <Text style={{ color: colors.text.secondary, fontSize: 12, marginTop: 3 }} numberOfLines={1}>
                    {order.logistics?.carrierName || 'No carrier'} · {order.deliveryState || 'No destination'}
                  </Text>
                </View>
                {alreadyQueued ? (
                  <View style={{ borderRadius: 999, backgroundColor: colors.bg.secondary, paddingHorizontal: 10, paddingVertical: 6 }}>
                    <Text style={{ color: colors.text.secondary, fontSize: 11, fontWeight: '400' }}>Queued</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={{ marginTop: 14, borderRadius: 16, padding: 18, backgroundColor: colors.bg.secondary }}>
          <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '500' }}>
            No dispatch orders found
          </Text>
          <Text style={{ color: colors.text.secondary, fontSize: 12, lineHeight: 18, marginTop: 5 }}>
            Orders will appear here once they have a dispatched status or dispatch logistics.
          </Text>
        </View>
      )}
    </View>
  );

  const renderItem = (item: FyllPrintQueueItem) => {
    const title = item.category === 'inventory'
      ? `${item.productName}${item.variantName ? ` - ${item.variantName}` : ''}`
      : item.orderNumber;
    const subtitle = item.category === 'inventory'
      ? `${item.sku || item.barcode || 'No SKU'} · ${item.labelSize.label}`
      : `${item.customerName} · ${item.destination || 'No destination'}`;
    const helper = item.category === 'inventory'
      ? 'Inventory/Product label'
      : `${item.carrierName || 'Shipping label'} · ${item.labelSize.label}`;

    return (
      <View
        key={item.id}
        style={{
          borderRadius: 18,
          borderWidth: 1,
          borderColor: colors.border.light,
          backgroundColor: colors.bg.primary,
          padding: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.bg.secondary,
          }}
        >
          {item.category === 'inventory' ? (
            <Package size={18} color={colors.text.primary} />
          ) : (
            <Truck size={18} color={colors.text.primary} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '500' }} numberOfLines={1}>
            {title}
          </Text>
          <Text style={{ color: colors.text.secondary, fontSize: 12, marginTop: 3 }} numberOfLines={1}>
            {subtitle}
          </Text>
          <Text style={{ color: colors.text.muted, fontSize: 11, marginTop: 4 }} numberOfLines={1}>
            {helper}
          </Text>
        </View>
        <Pressable
          onPress={() => handleRemoveItem(item)}
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.bg.secondary,
          }}
        >
          <Trash2 size={15} color={colors.text.secondary} />
        </Pressable>
      </View>
    );
  };

  const renderLabelPreview = (item: FyllPrintQueueItem, compact = false) => {
    if (item.category === 'shipping') {
      const deliveryAddressText = formatAddressValue(item.labelData.deliveryAddress);

      return (
        <View
          style={{
            width: compact ? 96 : 132,
            maxWidth: '100%',
            aspectRatio: item.labelSize.widthMm / item.labelSize.heightMm,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: '#D7D7D7',
            backgroundColor: '#FFFFFF',
            padding: compact ? 7 : 10,
            shadowColor: '#000000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.08,
            shadowRadius: 4,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: '#111111', fontSize: compact ? 6 : 9, fontWeight: '500', letterSpacing: compact ? 0.5 : 1 }}>FYLL · SHIP</Text>
            <Text style={{ color: '#777777', fontSize: compact ? 6 : 8 }} numberOfLines={1}>{item.carrierName}</Text>
          </View>
          <View style={{ borderTopWidth: 1, borderStyle: 'dashed', borderColor: '#D6D6D6', marginTop: compact ? 6 : 12, paddingTop: compact ? 6 : 12 }}>
            <Text style={{ color: '#999999', fontSize: compact ? 6 : 10, fontWeight: '400', letterSpacing: compact ? 0.5 : 1 }}>TO</Text>
            <Text style={{ color: '#111111', fontSize: compact ? 7 : 9, fontWeight: '500', marginTop: compact ? 2 : 4 }} numberOfLines={1}>
              {item.customerName}
            </Text>
            <Text style={{ color: '#555555', fontSize: compact ? 6 : 8, lineHeight: compact ? 8 : 11, marginTop: compact ? 2 : 3 }} numberOfLines={compact ? 2 : 3}>
              {deliveryAddressText}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: compact ? 12 : 28, marginTop: compact ? 7 : 14 }}>
            <View>
              <Text style={{ color: '#999999', fontSize: compact ? 6 : 10, fontWeight: '400', letterSpacing: compact ? 0.5 : 1 }}>ORDER</Text>
              <Text style={{ color: '#111111', fontSize: compact ? 6 : 8, fontWeight: '500', marginTop: compact ? 1 : 3 }} numberOfLines={1}>{item.orderNumber}</Text>
            </View>
            <View>
              <Text style={{ color: '#999999', fontSize: compact ? 6 : 10, fontWeight: '400', letterSpacing: compact ? 0.5 : 1 }}>TYPE</Text>
              <Text style={{ color: '#111111', fontSize: compact ? 6 : 8, fontWeight: '500', marginTop: compact ? 1 : 3 }}>SHIP</Text>
            </View>
          </View>
          <Text style={{ color: '#111111', fontSize: compact ? 6 : 8, fontWeight: '500', letterSpacing: compact ? 0.5 : 1, textAlign: 'center', marginTop: 'auto' }}>
            {item.labelData.logisticsProvider || item.orderNumber}
          </Text>
        </View>
      );
    }

    const isLandscape = item.labelSize.widthMm >= item.labelSize.heightMm;
    return (
      <View
        style={{
          width: compact ? 96 : 170,
          maxWidth: '100%',
          aspectRatio: item.labelSize.widthMm / item.labelSize.heightMm,
          borderRadius: 8,
          borderWidth: 1.5,
          borderColor: '#111111',
          backgroundColor: '#FFFFFF',
          padding: compact ? 7 : 10,
          flexDirection: isLandscape ? 'row' : 'column',
          alignItems: 'center',
          justifyContent: isLandscape ? 'flex-start' : 'center',
          gap: compact ? 6 : 10,
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.08,
          shadowRadius: 4,
        }}
      >
        <View
          style={{
            width: compact ? 24 : 36,
            height: compact ? 24 : 36,
            borderRadius: 4,
            borderWidth: 1,
            borderColor: '#111111',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Package size={compact ? 12 : 18} color="#111111" strokeWidth={2} />
        </View>
        <View style={{ flex: 1, alignItems: isLandscape ? 'flex-start' : 'center', justifyContent: 'center', minWidth: 0 }}>
          <Text style={{ color: '#000000', fontSize: compact ? 9 : 13, fontWeight: '800', letterSpacing: 0.3 }} numberOfLines={1}>
            {item.sku || item.barcode || 'No SKU'}
          </Text>
          <Text
            style={{ color: '#111111', fontSize: compact ? 7 : 10, fontWeight: '600', marginTop: 3, textAlign: isLandscape ? 'left' : 'center' }}
            numberOfLines={2}
          >
            {[item.productName, item.variantName].filter(Boolean).join(' — ')}
          </Text>
        </View>
      </View>
    );
  };

  const renderCategoryCard = (category: FyllPrintCategory) => {
    const active = category === activeCategory;
    const meta = FYLL_PRINT_CATEGORY_META[category];
    const Icon = category === 'inventory' ? Package : Truck;
    const accent = category === 'inventory' ? '#4F46E5' : '#059669';
    const accentBg = category === 'inventory' ? '#EEF2FF' : '#ECFDF5';

    return (
      <Pressable
        key={category}
        onPress={() => {
          setActiveCategory(category);
          setViewMode('queue');
        }}
        style={{
          flex: 1,
          minWidth: isDesktop ? 280 : 0,
          flexBasis: isDesktop ? undefined : '48%',
          borderRadius: isDesktop ? 28 : 20,
          borderWidth: 1,
          borderColor: active ? '#111111' : colors.border.light,
          backgroundColor: colors.bg.primary,
          padding: isDesktop ? 24 : 14,
        }}
      >
        <View style={{ flexDirection: isDesktop ? 'row' : 'column', alignItems: isDesktop ? 'flex-start' : 'stretch', justifyContent: 'space-between', gap: isDesktop ? 16 : 12 }}>
          <View style={{ flexDirection: isDesktop ? 'row' : 'column', alignItems: isDesktop ? 'center' : 'flex-start', gap: isDesktop ? 14 : 10, flex: 1 }}>
            <View
              style={{
                width: isDesktop ? 50 : 38,
                height: isDesktop ? 50 : 38,
                borderRadius: isDesktop ? 18 : 14,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: accentBg,
                borderWidth: 1,
                borderColor: `${accent}33`,
              }}
            >
              <Icon size={isDesktop ? 24 : 19} color={accent} strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '500', lineHeight: 16 }} numberOfLines={2}>
                {meta.label}
              </Text>
              <Text style={{ color: colors.text.secondary, fontSize: 11, fontWeight: '400', marginTop: 4 }} numberOfLines={2}>
                Label size · {meta.dimensions.replace('x', ' × ')}
              </Text>
            </View>
          </View>
          <Text style={{ color: colors.text.primary, fontSize: isDesktop ? 26 : 24, fontWeight: '500', lineHeight: 30, position: isDesktop ? 'relative' : 'absolute', right: isDesktop ? undefined : 14, top: isDesktop ? undefined : 14 }}>
            {counts[category]}
          </Text>
        </View>
        <Text style={{ color: colors.text.secondary, fontSize: 9, fontWeight: '400', letterSpacing: 1, marginTop: isDesktop ? 22 : 14 }}>
          {active ? 'CURRENTLY VIEWING' : 'TAP TO OPEN QUEUE'}
        </Text>
      </Pressable>
    );
  };

  const renderQueueCard = (item: FyllPrintQueueItem) => {
    const selected = selectedQueueItemIds[item.category].includes(item.id);
    const title = item.category === 'inventory' ? item.productName : item.orderNumber;
    const secondary = item.category === 'inventory' ? (item.variantName || 'Default') : item.customerName;
    const details = item.category === 'inventory'
      ? item.sku || item.barcode || 'No SKU'
      : `${item.destination || 'No destination'} · ${item.carrierName || 'Shipping'}`;

    return (
      <Pressable
        key={item.id}
        onPress={() => toggleQueueItemSelection(item)}
        style={{
          flex: 1,
          minWidth: isDesktop ? 560 : '100%',
          maxWidth: isDesktop ? 'calc(50% - 7px)' as never : undefined,
          borderRadius: isDesktop ? 24 : 18,
          borderWidth: 1,
          borderColor: selected ? colors.text.primary : colors.border.light,
          backgroundColor: colors.bg.primary,
          padding: isDesktop ? 18 : 12,
          flexDirection: 'row',
          gap: isDesktop ? 16 : 12,
        }}
      >
        <View
          style={{
            borderRadius: isDesktop ? 22 : 16,
            backgroundColor: colors.bg.secondary,
            padding: isDesktop ? 10 : 8,
            width: isDesktop ? 154 : undefined,
            alignItems: 'center',
            justifyContent: 'center',
            alignSelf: 'flex-start',
          }}
        >
          {renderLabelPreview(item, !isDesktop)}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0, paddingRight: isDesktop ? 4 : 0 }}>
              <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '500' }} numberOfLines={1}>
                {title}
              </Text>
              <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '400', marginTop: 5 }} numberOfLines={2}>
                {secondary}
              </Text>
              <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '400', marginTop: 5 }} numberOfLines={2}>
                {details}
              </Text>
              <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '400', marginTop: 10 }}>
                Added {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: isDesktop ? 8 : 8, flexShrink: 0, width: isDesktop ? 166 : undefined, justifyContent: 'flex-end' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: isDesktop ? 8 : 0 }}>
                <View
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 3,
                    borderWidth: 1.5,
                    borderColor: selected ? colors.text.primary : colors.text.secondary,
                    backgroundColor: selected ? colors.text.primary : colors.bg.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {selected ? <Check size={11} color={colors.bg.primary} strokeWidth={3} /> : null}
                </View>
                {isDesktop ? (
                  <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '500' }}>Select</Text>
                ) : null}
              </View>
              <Pressable
                onPress={(event) => {
                  event.stopPropagation();
                  void handleRemoveItem(item);
                }}
                style={{
                  minHeight: isDesktop ? 38 : 30,
                  width: isDesktop ? undefined : 30,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: colors.border.light,
                  paddingHorizontal: isDesktop ? 14 : 0,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 7,
                }}
              >
                <Trash2 size={14} color={colors.text.secondary} />
                {isDesktop ? (
                  <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '400' }}>Remove</Text>
                ) : null}
              </Pressable>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', marginTop: 10, gap: 10 }}>
            <View
              style={{
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 6,
                backgroundColor: item.category === 'shipping' ? '#ECFDF5' : '#EEF2FF',
                borderWidth: 1,
                borderColor: item.category === 'shipping' ? '#A7F3D0' : '#C7D2FE',
              }}
            >
              <Text style={{ color: item.category === 'shipping' ? '#059669' : '#4F46E5', fontSize: 10, fontWeight: '400', letterSpacing: 1 }}>
                {item.labelSize.label.replace('x', ' × ').toUpperCase()}
              </Text>
            </View>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.bg.primary }}>
      {isDesktop ? <DesktopSidebar /> : null}
      <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <SafeAreaView
        style={{
          flex: 1,
        }}
        edges={['top']}
      >
        <ScrollView
          style={{ flex: 1, backgroundColor: colors.bg.primary }}
          contentContainerStyle={{ paddingHorizontal: isDesktop ? 20 : 18, paddingTop: isDesktop ? 20 : 18, paddingBottom: isDesktop ? 60 : tabBarHeight + 24, width: '100%', maxWidth: isDesktop ? 1400 : undefined, alignSelf: isDesktop ? 'flex-start' : 'stretch' }}
          showsVerticalScrollIndicator={false}
        >
          {isDesktop ? (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 18, marginBottom: 28 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text.primary, fontSize: 26, fontWeight: '700', lineHeight: 32 }}>
                  Fyll Print
                </Text>
                <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: '400', marginTop: 8, lineHeight: 18 }}>
                  Two isolated print queues. Barcode labels and shipping labels never mix.
                </Text>
              </View>
              <Pressable
                onPress={() => setShowDispatchPicker(true)}
                style={{
                  minHeight: 48,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: colors.border.light,
                  backgroundColor: colors.bg.primary,
                  paddingHorizontal: 18,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 10,
                }}
              >
                <Plus size={18} color={colors.text.primary} strokeWidth={2.4} />
                <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '500' }}>
                  Add dispatch orders
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ marginBottom: 22 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: colors.text.primary, fontSize: 22, fontWeight: '700', lineHeight: 28 }}>
                    Fyll Print
                  </Text>
                  <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '400', marginTop: 3, lineHeight: 14 }} numberOfLines={2}>
                    Two isolated print queues. Barcode labels and shipping labels never mix.
                  </Text>
                </View>
                <Pressable
                  onPress={() => setShowDispatchPicker(true)}
                  style={{
                    minHeight: 40,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: colors.border.light,
                    backgroundColor: colors.bg.primary,
                    paddingHorizontal: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 8,
                  }}
                >
                  <Plus size={17} color={colors.text.primary} strokeWidth={2.4} />
                  <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '500' }}>
                    Add dispatch orders
                  </Text>
                </Pressable>
              </View>
              <View style={{ height: 1, backgroundColor: colors.border.light, marginTop: 16, marginHorizontal: -18 }} />
            </View>
          )}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: isDesktop ? 14 : 10, marginBottom: isDesktop ? 26 : 24 }}>
            {CATEGORY_OPTIONS.map(renderCategoryCard)}
          </View>

          <View style={{ flexDirection: isDesktop ? 'row' : 'column', justifyContent: 'space-between', alignItems: isDesktop ? 'center' : 'stretch', gap: isDesktop ? 12 : 14, marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', gap: 8, width: isDesktop ? undefined : '100%', flexShrink: 0 }}>
              <Pressable
                onPress={() => setViewMode('queue')}
                style={{
                  flex: isDesktop ? undefined : 1,
                  minHeight: 44,
                  borderRadius: 999,
                  paddingHorizontal: 18,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 8,
                  backgroundColor: viewMode === 'queue' ? colors.text.primary : colors.bg.primary,
                  borderWidth: 1,
                  borderColor: viewMode === 'queue' ? colors.text.primary : colors.border.light,
                }}
              >
                <Printer size={15} color={viewMode === 'queue' ? colors.bg.primary : colors.text.secondary} />
                <Text style={{ color: viewMode === 'queue' ? colors.bg.primary : colors.text.secondary, fontSize: 12, fontWeight: '500' }}>
                  Queue ({activeItems.length})
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setViewMode('history')}
                style={{
                  flex: isDesktop ? undefined : 1,
                  minHeight: 44,
                  borderRadius: 999,
                  paddingHorizontal: 18,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 8,
                  backgroundColor: viewMode === 'history' ? colors.text.primary : colors.bg.primary,
                  borderWidth: 1,
                  borderColor: viewMode === 'history' ? colors.text.primary : colors.border.light,
                }}
              >
                <Clock3 size={15} color={viewMode === 'history' ? colors.bg.primary : colors.text.secondary} />
                <Text style={{ color: viewMode === 'history' ? colors.bg.primary : colors.text.secondary, fontSize: 12, fontWeight: '500' }}>
                  History
                </Text>
              </Pressable>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <Pressable
                onPress={handleClearCategory}
                disabled={activeItems.length === 0 || isWorking}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, opacity: activeItems.length === 0 || isWorking ? 0.45 : 1 }}
              >
                <Trash2 size={17} color={colors.text.secondary} />
                <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '400' }}>Clear queue</Text>
              </Pressable>
              <Pressable
                onPress={() => setPendingAction(isDesktop ? 'print' : 'download')}
                disabled={selectedPrintCount === 0 || isWorking}
                style={{
                  minHeight: 44,
                  borderRadius: 999,
                  paddingHorizontal: 18,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 9,
                  backgroundColor: isDark ? '#FFFFFF' : '#111111',
                  opacity: selectedPrintCount === 0 || isWorking ? 0.45 : 1,
                  marginLeft: 'auto',
                }}
              >
                {isWorking ? (
                  <ActivityIndicator color={isDark ? '#111111' : '#FFFFFF'} />
                ) : (
                  <>
                    {isDesktop ? <Printer size={17} color={isDark ? '#111111' : '#FFFFFF'} /> : <Download size={17} color={isDark ? '#111111' : '#FFFFFF'} />}
                    <Text style={{ color: isDark ? '#111111' : '#FFFFFF', fontSize: 12, fontWeight: '500' }}>
                      {isDesktop
                        ? activeSelectedIds.length > 0
                          ? `Print selected (${selectedPrintCount})`
                          : `Print batch · all (${activeItems.length})`
                        : activeSelectedIds.length > 0
                          ? `Download selected (${selectedPrintCount})`
                          : `Download labels (${activeItems.length})`}
                    </Text>
                  </>
                )}
              </Pressable>
              {isDesktop ? (
                <Pressable
                  onPress={() => setPendingAction('download')}
                  disabled={selectedPrintCount === 0 || isWorking}
                  style={{
                    minHeight: 44,
                    width: 48,
                    borderRadius: 999,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: colors.bg.primary,
                    borderWidth: 1,
                    borderColor: colors.border.light,
                    opacity: selectedPrintCount === 0 || isWorking ? 0.45 : 1,
                  }}
                >
                  <Download size={17} color={colors.text.primary} />
                </Pressable>
              ) : null}
            </View>
          </View>

          {viewMode === 'history' ? (
            renderHistory()
          ) : isLoading ? (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              <ActivityIndicator color={colors.text.primary} />
            </View>
          ) : activeItems.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
              {activeItems.map(renderQueueCard)}
            </View>
          ) : (
            <View
              style={{
                borderRadius: 24,
                borderWidth: 1,
                borderColor: colors.border.light,
                backgroundColor: colors.bg.primary,
                padding: 34,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '500' }}>
                No {categoryMeta.shortLabel.toLowerCase()} labels queued
              </Text>
              <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '400', lineHeight: 18, textAlign: 'center', marginTop: 8 }}>
                Use Add dispatch orders or add product labels from inventory. Each label stays in its own queue.
              </Text>
            </View>
          )}
        </ScrollView>

        <Modal visible={showDispatchPicker} transparent animationType="fade" onRequestClose={() => setShowDispatchPicker(false)}>
          <View
            style={{
              flex: 1,
              backgroundColor: colors.bg.primary,
              alignItems: 'center',
              justifyContent: 'flex-start',
            }}
          >
            <View
              style={{
                width: '100%',
                maxWidth: isDesktop ? 760 : undefined,
                height: '100%',
                borderRadius: isDesktop ? 28 : 0,
                backgroundColor: colors.bg.secondary,
                borderWidth: isDesktop ? 1 : 0,
                borderColor: colors.border.light,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 18,
                  backgroundColor: colors.bg.primary,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border.light,
                }}
              >
                <View>
                  <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '500' }}>Add dispatch orders</Text>
                </View>
                <Pressable
                  onPress={() => setShowDispatchPicker(false)}
                  style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg.secondary }}
                >
                  <X size={18} color={colors.text.primary} />
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={{ padding: 18 }} showsVerticalScrollIndicator={false}>
                {renderDispatchOrderPicker()}
              </ScrollView>
            </View>
          </View>
        </Modal>

        <Modal visible={pendingAction !== null} transparent animationType="fade" onRequestClose={() => setPendingAction(null)}>
          <View
            style={{
              flex: 1,
              backgroundColor: 'rgba(0,0,0,0.35)',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
            }}
          >
            <View
              style={{
                width: '100%',
                maxWidth: 420,
                borderRadius: 24,
                padding: 20,
                backgroundColor: colors.bg.primary,
                borderWidth: 1,
                borderColor: colors.border.light,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: '500', flex: 1 }}>
                  Paper check
                </Text>
                <Pressable onPress={() => setPendingAction(null)} style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg.secondary }}>
                  <X size={17} color={colors.text.primary} />
                </Pressable>
              </View>
              <Text style={{ color: colors.text.secondary, fontSize: 13, fontWeight: '400', lineHeight: 20, marginTop: 12 }}>
                {categoryMeta.reminder}
              </Text>
              <Text style={{ color: colors.text.muted, fontSize: 12, lineHeight: 18, marginTop: 10 }}>
                This batch contains {activeSelectedIds.length > 0 ? `${selectedPrintCount} selected` : `all ${selectedPrintCount}`} {categoryMeta.shortLabel.toLowerCase()} label{selectedPrintCount === 1 ? '' : 's'}. The other FYLL Print queue will not be included or cleared.
              </Text>
              <Pressable
                onPress={() => pendingAction && executeBatchAction(pendingAction)}
                style={{
                  marginTop: 18,
                  height: 50,
                  borderRadius: 999,
                  backgroundColor: colors.text.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: colors.bg.primary, fontSize: 13, fontWeight: '500' }}>
                  {pendingAction === 'download' ? 'Download PDF' : 'Continue'}
                </Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
      </View>
    </View>
  );
}
