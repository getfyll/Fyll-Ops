import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, NativeScrollEvent, NativeSyntheticEvent, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Check, ChevronLeft, ChevronRight, Clock3, Download, Minus, Package, Plus, Printer, Trash2, Truck, X } from 'lucide-react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { FYLL_LIME, FYLL_LIME_HOVER, FYLL_LIME_INK, MoneyText, isHovered, usePaymentsPalette } from '@/components/payments/payments-ui';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { useTabBarHeight } from '@/lib/useTabBarHeight';
import { DesktopSidebar } from '@/components/DesktopSidebar';
import useFyllStore, { type Order } from '@/lib/state/fyll-store';
import useAuthStore from '@/lib/state/auth-store';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { prepareOrderLabelData } from '@/utils/printOrderLabel';
import { generateQrMatrix } from '@/lib/qrcode';
import { expandParcels, getShippingLabelFileBase } from '@/lib/shipping-label-options';
import { OrderLabel80x90Preview, type OrderLabelData } from '@/components/labels/OrderLabel80x90';
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
  getCachedFyllPrintQueue,
  INVENTORY_QUEUE_LABEL_SIZE,
  mmToPrintPoints,
  recordFyllPrintHistory,
  removeFyllPrintQueueItem,
  SHIPPING_QUEUE_LABEL_SIZE,
  expandInventoryCopies,
  getInventoryItemCopies,
  getShippingItemParcels,
  MAX_INVENTORY_COPIES,
  setFyllPrintQueueItemCopies,
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
        itemCount: (order.items ?? []).reduce((sum, item) => sum + (item.quantity || 0), 0),
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

// A small real QR code for the list thumbnails. All the squares are drawn as one path, so a long queue stays light.
const qrPathCache = new Map<string, { d: string; size: number }>();
function QrMini({ code, size }: { code: string; size: number }) {
  const shape = useMemo(() => {
    const cached = qrPathCache.get(code);
    if (cached) return cached;
    const matrix = generateQrMatrix(code);
    let d = '';
    matrix.forEach((row, y) => row.forEach((filled, x) => {
      if (filled) d += `M${x} ${y}h1v1h-1z`;
    }));
    const next = { d, size: matrix.length };
    qrPathCache.set(code, next);
    return next;
  }, [code]);
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${shape.size} ${shape.size}`}>
      <Path d={shape.d} fill="#111111" />
    </Svg>
  );
}

// A soft lime glow at the top of the preview card, like the cards in Finance.
function LinearGradientWash({ palette }: { palette: ReturnType<typeof usePaymentsPalette> }) {
  return (
    <LinearGradient
      pointerEvents="none"
      colors={palette.isDark ? ['rgba(213,224,87,0.14)', 'rgba(213,224,87,0)'] : ['rgba(213,224,87,0.24)', 'rgba(213,224,87,0)']}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 0.8 }}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
    />
  );
}

export default function FyllPrintScreen() {
  const palette = usePaymentsPalette();
  const router = useRouter();
  const tabBarHeight = useTabBarHeight();
  const { isDesktop } = useBreakpoint();
  const orders = useFyllStore((s) => s.orders);
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const cachedQueue = getCachedFyllPrintQueue(businessId);
  const {
    businessName,
    businessSlug,
    businessLogo,
    businessPhone,
    businessWebsite,
    returnAddress,
  } = useBusinessSettings();
  const [activeCategory, setActiveCategory] = useState<FyllPrintCategory>('shipping');
  const [queue, setQueue] = useState<FyllPrintQueueState>(() => cachedQueue ?? ({
    inventory: [],
    shipping: [],
    history: { inventory: [], shipping: [] },
  }));
  const [selectedQueueItemIds, setSelectedQueueItemIds] = useState<Record<FyllPrintCategory, string[]>>({
    inventory: [],
    shipping: [],
  });
  const [selectedDispatchOrderIds, setSelectedDispatchOrderIds] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<PrintViewMode>('queue');
  const [showDispatchPicker, setShowDispatchPicker] = useState(false);
  const [isLoading, setIsLoading] = useState(() => !cachedQueue);
  const [pendingAction, setPendingAction] = useState<PendingPrintAction | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [isAddingDispatchOrders, setIsAddingDispatchOrders] = useState(false);
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    const cached = getCachedFyllPrintQueue(businessId);
    if (cached) {
      setQueue(cached);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }
    if (!businessId) {
      setQueue({ inventory: [], shipping: [], history: { inventory: [], shipping: [] } });
      setIsLoading(false);
      return;
    }
    const nextQueue = await getFyllPrintQueue(businessId);
    setQueue(nextQueue);
    setIsLoading(false);
  }, [businessId]);

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

  // Product labels count every copy; shipping labels are one per order.
  const counts = useMemo(() => ({
    inventory: queue.inventory.reduce((sum, item) => sum + getInventoryItemCopies(item), 0),
    shipping: queue.shipping.reduce((sum, item) => sum + getShippingItemParcels(item), 0),
  }), [queue.inventory, queue.shipping]);
  const selectedLabelCount = selectedPrintItems.reduce(
    (sum, item) => sum + (item.category === 'inventory' ? getInventoryItemCopies(item) : getShippingItemParcels(item)),
    0
  );

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
        const firstLabel = activeCategory === 'shipping'
          ? printableItems.find((item): item is Extract<FyllPrintQueueItem, { category: 'shipping' }> => item.category === 'shipping')?.labelData
          : null;
        await printHtmlOnWeb(html, firstLabel && printableItems.length === 1 ? getShippingLabelFileBase(firstLabel) : `fyll-print-${activeCategory}-labels`);
      } else if (Platform.OS === 'web') {
        // Both Print.printAsync({ html }) and window.print() on an iframe have proven
        // unreliable on mobile web in this environment — observed printing the top-level
        // app screen instead of the isolated label content, on both iOS Safari and Android
        // Chrome. Generating the PDF bytes directly and downloading the file sidesteps
        // browser print dialogs entirely, so there's no dialog behavior left to be unreliable.
        const dateStamp = new Date().toISOString().slice(0, 10);
        const singleShipping = activeCategory === 'shipping' && printableItems.length === 1 && printableItems[0].category === 'shipping'
          ? printableItems[0].labelData
          : null;
        const filename = singleShipping
          ? `${getShippingLabelFileBase(singleShipping)}.pdf`
          : `fyll-${activeCategory}-labels-${dateStamp}.pdf`;
        if (activeCategory === 'shipping') {
          const shippingItems = printableItems.filter(
            (item): item is Extract<FyllPrintQueueItem, { category: 'shipping' }> => item.category === 'shipping'
          );
          downloadShippingLabelPdf(shippingItems.flatMap((item) => expandParcels(item.labelData)), size.widthMm, size.heightMm, filename);
        } else {
          const inventoryItems = printableItems.filter(
            (item): item is Extract<FyllPrintQueueItem, { category: 'inventory' }> => item.category === 'inventory'
          );
          downloadInventoryLabelPdf(
            expandInventoryCopies(inventoryItems).map((item) => ({
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
      const nextQueue = await recordFyllPrintHistory(activeCategory, historyAction, selectedLabelCount, businessId);
      setQueue(nextQueue);
    } catch (error) {
      console.log('FYLL Print batch error:', error);
    } finally {
      setIsWorking(false);
    }
  };

  const handleRemoveItem = async (item: FyllPrintQueueItem) => {
    const nextQueue = await removeFyllPrintQueueItem(item.category, item.id, businessId);
    setQueue(nextQueue);
    setSelectedQueueItemIds((current) => ({
      ...current,
      [item.category]: current[item.category].filter((id) => id !== item.id),
    }));
  };

  const handleClearCategory = async () => {
    const nextQueue = await clearFyllPrintQueueCategory(activeCategory, businessId);
    setQueue(nextQueue);
    setSelectedQueueItemIds((current) => ({
      ...current,
      [activeCategory]: [],
    }));
  };

  const handleSetCopies = async (item: FyllPrintQueueItem, copies: number) => {
    if (item.category !== 'inventory') return;
    const nextQueue = await setFyllPrintQueueItemCopies(item.id, copies, businessId);
    setQueue(nextQueue);
  };

  const handleRemoveSelected = async () => {
    const ids = [...activeSelectedIds];
    let nextQueue = queue;
    for (const id of ids) {
      nextQueue = await removeFyllPrintQueueItem(activeCategory, id, businessId);
    }
    setQueue(nextQueue);
    setSelectedQueueItemIds((current) => ({ ...current, [activeCategory]: [] }));
  };

  const toggleSelectAll = () => {
    setSelectedQueueItemIds((current) => ({
      ...current,
      [activeCategory]: allSelected ? [] : activeItems.map((item) => item.id),
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
            itemCount: (order.items ?? []).reduce((sum, item) => sum + (item.quantity || 0), 0),
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
        }), businessId);
      }

      const nextQueue = await getFyllPrintQueue(businessId);
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

  // ---------- derived values for the new layout ----------
  const allSelected = activeItems.length > 0 && activeSelectedIds.length === activeItems.length;
  const someSelected = activeSelectedIds.length > 0 && !allSelected;
  const focusedItem = activeItems.find((item) => item.id === focusedItemId) ?? activeItems[0] ?? null;
  // The labels that will print: the selected ones, or all of them. Shipping orders with several parcels get one page each.
  type PreviewPage = { key: string; item: FyllPrintQueueItem; labelData?: OrderLabelData };
  const previewPages = useMemo<PreviewPage[]>(() => selectedPrintItems.flatMap((item): PreviewPage[] => (
    item.category === 'shipping'
      ? expandParcels(item.labelData).map((labelData, index) => ({ key: `${item.id}:${index}`, item, labelData }))
      : [{ key: item.id, item }]
  )), [selectedPrintItems]);
  const carouselRef = useRef<ScrollView | null>(null);
  const [carouselWidth, setCarouselWidth] = useState(0);
  const [previewIndex, setPreviewIndex] = useState(0);
  const lastPageIndex = Math.max(0, previewPages.length - 1);
  const currentPage = previewPages[Math.min(previewIndex, lastPageIndex)] ?? null;

  const goToPreviewPage = (index: number, animated = true) => {
    const next = Math.max(0, Math.min(lastPageIndex, index));
    setPreviewIndex(next);
    if (previewPages[next]) setFocusedItemId(previewPages[next].item.id);
    carouselRef.current?.scrollTo({ x: next * carouselWidth, animated });
  };
  const handleCarouselScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (carouselWidth <= 0) return;
    const index = Math.max(0, Math.min(lastPageIndex, Math.round(event.nativeEvent.contentOffset.x / carouselWidth)));
    if (index !== previewIndex) {
      setPreviewIndex(index);
      if (previewPages[index]) setFocusedItemId(previewPages[index].item.id);
    }
  };
  // New set of labels (selection changed): start from the first.
  useEffect(() => {
    setPreviewIndex(0);
    carouselRef.current?.scrollTo({ x: 0, animated: false });
  }, [previewPages.length, activeCategory]);
  const queuedOrderIds = new Set(queue.shipping.map((item) => item.orderId));
  const readyToDispatchCount = dispatchOrders.filter((order) => !queuedOrderIds.has(order.id)).length;
  const isInventoryTab = activeCategory === 'inventory';
  const sizeText = categorySize.label.replace('x', ' × ');

  const goAddItems = () => {
    if (isInventoryTab) {
      router.push('/(tabs)/inventory' as never);
    } else {
      setShowDispatchPicker(true);
    }
  };

  // Main action: the solid lime pill, like every other main button in the app.
  const limeButton = (label: string, Icon: typeof Plus, onPress: () => void) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={(state) => ({
        height: 42,
        paddingHorizontal: 18,
        borderRadius: 999,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: isHovered(state) || state.pressed ? FYLL_LIME_HOVER : FYLL_LIME,
      })}
    >
      <Icon size={16} color={FYLL_LIME_INK} strokeWidth={2.4} />
      <Text style={{ color: FYLL_LIME_INK, fontSize: 14, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );

  // History is a small round icon button; it picks up a lime tint while the history view is open.
  const historyOpen = viewMode === 'history';
  const historyButton = (
    <Pressable
      onPress={() => setViewMode(historyOpen ? 'queue' : 'history')}
      accessibilityRole="button"
      accessibilityLabel={historyOpen ? 'Back to the queue' : 'Print history'}
      accessibilityState={{ selected: historyOpen }}
      style={(state) => ({
        width: isDesktop ? 42 : 40,
        height: isDesktop ? 42 : 40,
        borderRadius: 21,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: historyOpen ? palette.nudgeBorder : palette.outline,
        backgroundColor: historyOpen ? palette.nudgeBg : isHovered(state) || state.pressed ? palette.softFill : 'transparent',
      })}
    >
      <Clock3 size={17} color={historyOpen ? palette.limeOnSurface : palette.text} strokeWidth={2} />
    </Pressable>
  );

  const capLabel = (text: string) => (
    <Text style={{ color: palette.faint, fontSize: isDesktop ? 11 : 10, fontWeight: '600', letterSpacing: 1.3, textTransform: 'uppercase' }}>{text}</Text>
  );
  const cardStyle = { borderRadius: 22, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border } as const;

  const checkbox = (state: 'on' | 'some' | 'off') => (
    <View style={{ width: 20, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: state === 'off' ? 1.5 : 0, borderColor: palette.outline, backgroundColor: state === 'off' ? 'transparent' : FYLL_LIME }}>
      {state === 'on' ? <Check size={13} color={FYLL_LIME_INK} strokeWidth={3.2} /> : state === 'some' ? <Minus size={13} color={FYLL_LIME_INK} strokeWidth={3.2} /> : null}
    </View>
  );

  // The label itself, as it will print. Product labels show the QR code with the name on the right.
  const renderLabelPreview = (item: FyllPrintQueueItem, scale: 'large' | 'compact' = 'large', labelOverride?: OrderLabelData) => {
    if (item.category === 'shipping') {
      // The real shipping label, drawn by the same component as the order's label page, scaled to fit the card.
      const width = scale === 'large' ? 300 : 210;
      const ratio = item.labelSize.heightMm / item.labelSize.widthMm;
      return (
        <View style={{ width, height: width * ratio, maxWidth: '100%' }}>
          <View style={{ width: 340, transform: [{ scale: width / 340 }], transformOrigin: 'top left' } as never}>
            <OrderLabel80x90Preview data={labelOverride ?? item.labelData} widthMm={item.labelSize.widthMm} heightMm={item.labelSize.heightMm} />
          </View>
        </View>
      );
    }

    const large = scale === 'large';
    const code = item.barcode || item.sku || 'fyll';
    const matrix = generateQrMatrix(code);
    const qr = large ? 96 : 52;
    return (
      <View style={{ width: large ? 280 : 170, maxWidth: '100%', aspectRatio: item.labelSize.widthMm / item.labelSize.heightMm, borderRadius: 10, backgroundColor: '#FFFFFF', padding: large ? 14 : 9, flexDirection: 'row', alignItems: 'center', gap: large ? 14 : 8, shadowColor: '#000000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.35, shadowRadius: 18, elevation: 6 }}>
        <Svg width={qr} height={qr} viewBox={`0 0 ${matrix.length} ${matrix.length}`}>
          {matrix.map((row, rowIndex) => row.map((filled, colIndex) => (
            filled ? <Rect key={`${rowIndex}-${colIndex}`} x={colIndex} y={rowIndex} width={1} height={1} fill="#000000" /> : null
          )))}
        </Svg>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={{ color: '#111111', fontSize: large ? 20 : 12, fontWeight: '800', letterSpacing: -0.2 }} numberOfLines={2}>{item.productName}</Text>
          {item.variantName ? <Text style={{ color: '#444444', fontSize: large ? 12 : 8, fontWeight: '600' }} numberOfLines={2}>{item.variantName}</Text> : null}
          <Text style={{ color: '#666666', fontSize: large ? 10 : 7, fontFamily: Platform.OS === 'web' ? 'ui-monospace, Menlo, monospace' : Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginTop: 2 }} numberOfLines={2}>
            {item.sku && item.barcode && item.sku !== item.barcode ? `${item.sku} · ${item.barcode}` : code}
          </Text>
        </View>
      </View>
    );
  };

  const renderCategoryTab = (category: FyllPrintCategory) => {
    const active = category === activeCategory;
    const meta = FYLL_PRINT_CATEGORY_META[category];
    const Icon = category === 'inventory' ? Package : Truck;
    const size = getCategorySize(category);
    return (
      <Pressable
        key={category}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        onPress={() => {
          setActiveCategory(category);
          setViewMode('queue');
          setFocusedItemId(null);
        }}
        style={(state) => ({
          flex: 1,
          minWidth: 0,
          flexDirection: isDesktop ? 'row' : 'column',
          alignItems: isDesktop ? 'center' : 'flex-start',
          gap: isDesktop ? 14 : 10,
          padding: isDesktop ? 16 : 12,
          paddingHorizontal: isDesktop ? 18 : 12,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: active ? palette.nudgeBorder : palette.border,
          backgroundColor: active ? palette.card : isHovered(state) ? palette.cardHover : 'transparent',
        })}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flex: isDesktop ? 1 : undefined, width: isDesktop ? undefined : '100%' }}>
          <View style={{ width: isDesktop ? 44 : 36, height: isDesktop ? 44 : 36, borderRadius: isDesktop ? 14 : 12, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? FYLL_LIME : palette.softFill }}>
            <Icon size={isDesktop ? 20 : 17} color={active ? FYLL_LIME_INK : palette.muted} strokeWidth={1.9} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <Text style={{ color: palette.text, fontSize: isDesktop ? 15.5 : 12, fontWeight: '600' }} numberOfLines={1}>{meta.label}</Text>
            <Text style={{ color: palette.faint, fontSize: isDesktop ? 13 : 10 }} numberOfLines={1}>
              {category === 'inventory' ? 'Barcodes' : 'Dispatch'} · {size.label.replace('x', ' × ')}
            </Text>
          </View>
          {!isDesktop ? (
            <MoneyText style={{ color: active ? palette.text : palette.faint, fontSize: 22, letterSpacing: -0.5 }}>{counts[category]}</MoneyText>
          ) : null}
        </View>
        {isDesktop ? (
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            <MoneyText style={{ color: active ? palette.text : palette.faint, fontSize: 28, letterSpacing: -0.6 }}>{counts[category]}</MoneyText>
            <Text style={{ color: palette.faint, fontSize: 12 }}>in queue</Text>
          </View>
        ) : null}
      </Pressable>
    );
  };

  const renderQueueRow = (item: FyllPrintQueueItem, index: number) => {
    const selected = activeSelectedIdSet.has(item.id);
    const focused = focusedItem?.id === item.id;
    const title = item.category === 'inventory'
      ? `${item.productName}${item.variantName ? ` · ${item.variantName}` : ''}`
      : item.orderNumber;
    const subtitle = item.category === 'inventory'
      ? item.sku || item.barcode || 'No SKU'
      : `${item.customerName} · ${item.destination || 'No destination'}${getShippingItemParcels(item) > 1 ? ` · ${getShippingItemParcels(item)} parcels` : ''}`;
    return (
      <Pressable
        key={item.id}
        onPress={() => {
          setFocusedItemId(item.id);
          const pageIndex = previewPages.findIndex((page) => page.item.id === item.id);
          if (pageIndex >= 0) goToPreviewPage(pageIndex);
        }}
        style={(state) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: isDesktop ? 14 : 12,
          paddingVertical: isDesktop ? 11 : 10,
          paddingHorizontal: 10,
          marginHorizontal: -10,
          borderRadius: 14,
          backgroundColor: focused && isDesktop ? palette.softFill : isHovered(state) ? palette.cardHover : 'transparent',
        })}
      >
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: selected }}
          accessibilityLabel={`Select ${title}`}
          hitSlop={8}
          onPress={() => toggleQueueItemSelection(item)}
        >
          {checkbox(selected ? 'on' : 'off')}
        </Pressable>
        {isDesktop ? (
          <View style={{ width: 60, height: 36, borderRadius: 5, backgroundColor: '#FFFFFF', paddingHorizontal: 5, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {item.category === 'inventory' ? (
              <>
                <QrMini code={item.barcode || item.sku || 'fyll'} size={26} />
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ height: 3, width: '90%', backgroundColor: '#111111' }} />
                  <View style={{ height: 2, width: '65%', backgroundColor: '#888888' }} />
                </View>
              </>
            ) : (
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ color: '#111111', fontSize: 6, fontWeight: '800', letterSpacing: 0.6 }}>FYLL · SHIP</Text>
                <View style={{ height: 2, width: '85%', backgroundColor: '#999999' }} />
                <View style={{ height: 2, width: '60%', backgroundColor: '#999999' }} />
              </View>
            )}
          </View>
        ) : null}
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={{ color: palette.text, fontSize: isDesktop ? 14 : 12, fontWeight: '500' }} numberOfLines={1}>{title}</Text>
          <Text style={{ color: palette.faint, fontSize: isDesktop ? 14 : 10 }} numberOfLines={1}>{subtitle}</Text>
          {!isDesktop && item.category === 'shipping' ? <Text style={{ color: palette.faint, fontSize: 10 }} numberOfLines={1}>{item.carrierName || 'Shipping'}</Text> : null}
        </View>
        {item.category === 'inventory' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: isDesktop ? 8 : 6 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fewer copies"
              disabled={getInventoryItemCopies(item) <= 1}
              onPress={() => { void handleSetCopies(item, getInventoryItemCopies(item) - 1); }}
              style={(state) => ({ width: isDesktop ? 26 : 24, height: isDesktop ? 26 : 24, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.outline, backgroundColor: state.pressed ? palette.softFill : 'transparent', opacity: getInventoryItemCopies(item) <= 1 ? 0.4 : 1 })}
            >
              <Minus size={13} color={palette.text} strokeWidth={2.2} />
            </Pressable>
            <Text style={{ minWidth: 28, textAlign: 'center', color: palette.text, fontSize: isDesktop ? 14 : 12, fontWeight: '600', fontVariant: ['tabular-nums'] }}>×{getInventoryItemCopies(item)}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="More copies"
              disabled={getInventoryItemCopies(item) >= MAX_INVENTORY_COPIES}
              onPress={() => { void handleSetCopies(item, getInventoryItemCopies(item) + 1); }}
              style={(state) => ({ width: isDesktop ? 26 : 24, height: isDesktop ? 26 : 24, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.outline, backgroundColor: state.pressed ? palette.softFill : 'transparent', opacity: getInventoryItemCopies(item) >= MAX_INVENTORY_COPIES ? 0.4 : 1 })}
            >
              <Plus size={13} color={palette.text} strokeWidth={2.2} />
            </Pressable>
          </View>
        ) : (
          <Text style={{ color: palette.faint, fontSize: isDesktop ? 12.5 : 10 }}>
            {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${title}`}
          onPress={() => { void handleRemoveItem(item); }}
          style={(state) => ({ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: isHovered(state) || state.pressed ? palette.softFill : 'transparent' })}
        >
          <X size={16} color={palette.faint} strokeWidth={2} />
        </Pressable>
      </Pressable>
    );
  };

  const renderQueueList = () => (
    <View style={{ ...cardStyle, overflow: 'hidden', flex: isDesktop ? 1 : undefined }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: palette.hairline }}>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: allSelected }} accessibilityLabel="Select all" hitSlop={8} onPress={toggleSelectAll}>
          {checkbox(allSelected ? 'on' : someSelected ? 'some' : 'off')}
        </Pressable>
        <Text style={{ flex: 1, color: palette.muted, fontSize: isDesktop ? 14 : 12 }}>
          {activeSelectedIds.length > 0
            ? `${activeSelectedIds.length} selected`
            : `${activeItems.length} item${activeItems.length === 1 ? '' : 's'} · ${counts[activeCategory]} label${counts[activeCategory] === 1 ? '' : 's'}`}
        </Text>
        {activeSelectedIds.length > 0 ? (
          <Pressable onPress={() => { void handleRemoveSelected(); }} accessibilityRole="button">
            <Text style={{ color: palette.danger, fontSize: isDesktop ? 13.5 : 12, fontWeight: '600' }}>Remove selected</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={() => { void handleClearCategory(); }} disabled={activeItems.length === 0 || isWorking} accessibilityRole="button" style={{ opacity: activeItems.length === 0 || isWorking ? 0.45 : 1 }}>
          <Text style={{ color: palette.faint, fontSize: isDesktop ? 13.5 : 12, fontWeight: '600' }}>Clear queue</Text>
        </Pressable>
      </View>
      <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 18, paddingVertical: 6 }} showsVerticalScrollIndicator={false}>
        <View style={{ paddingTop: 8, paddingBottom: 4 }}>{capLabel(`${categoryMeta.label} · ${counts[activeCategory]} in queue`)}</View>
        {activeItems.map(renderQueueRow)}
      </ScrollView>
    </View>
  );

  const renderPreviewCard = () => {
    const pageCount = previewPages.length;
    const arrow = (direction: -1 | 1) => {
      const disabled = direction === -1 ? previewIndex <= 0 : previewIndex >= lastPageIndex;
      const Icon = direction === -1 ? ChevronLeft : ChevronRight;
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={direction === -1 ? 'Previous label' : 'Next label'}
          disabled={disabled}
          onPress={() => goToPreviewPage(previewIndex + direction)}
          style={(state) => ({ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.outline, backgroundColor: state.pressed || isHovered(state) ? palette.softFill : 'transparent', opacity: disabled ? 0.35 : 1 })}
        >
          <Icon size={18} color={palette.text} strokeWidth={2.2} />
        </Pressable>
      );
    };
    return (
      <View style={{ ...cardStyle, padding: 18, gap: 14, overflow: 'hidden' }}>
        <LinearGradientWash palette={palette} />
        {capLabel(`Preview · ${sizeText}`)}
        <View onLayout={(event) => setCarouselWidth(event.nativeEvent.layout.width)}>
          {carouselWidth > 0 ? (
            <ScrollView
              ref={carouselRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={handleCarouselScroll}
              style={{ width: carouselWidth }}
            >
              {pageCount === 0 ? (
                <View style={{ width: carouselWidth, alignItems: 'center', paddingVertical: 40 }}>
                  <Text style={{ color: palette.faint, fontSize: 13 }}>Nothing to preview yet</Text>
                </View>
              ) : previewPages.map((page) => (
                <View key={page.key} style={{ width: carouselWidth, alignItems: 'center' }}>
                  {renderLabelPreview(page.item, isDesktop ? 'large' : 'compact', page.labelData)}
                </View>
              ))}
            </ScrollView>
          ) : null}
        </View>
        {pageCount > 1 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            {arrow(-1)}
            <View style={{ alignItems: 'center', gap: 6, flex: 1 }}>
              <Text style={{ color: palette.text, fontSize: isDesktop ? 13 : 12, fontWeight: '600' }} numberOfLines={1}>
                Label {Math.min(previewIndex, lastPageIndex) + 1} of {pageCount}
                {currentPage ? ` · ${currentPage.item.category === 'shipping' ? currentPage.item.orderNumber : currentPage.item.productName}` : ''}
              </Text>
              <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap', justifyContent: 'center' }}>
                {pageCount <= 12 ? previewPages.map((page, index) => (
                  <Pressable key={page.key} accessibilityRole="button" accessibilityLabel={`Show label ${index + 1}`} onPress={() => goToPreviewPage(index)} hitSlop={6}>
                    <View style={{ width: index === previewIndex ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: index === previewIndex ? FYLL_LIME : palette.outline }} />
                  </Pressable>
                )) : null}
              </View>
            </View>
            {arrow(1)}
          </View>
        ) : (
          <Text style={{ color: palette.faint, fontSize: isDesktop ? 12.5 : 10, textAlign: 'center' }}>
            {pageCount === 1 ? 'Select more to swipe through them' : 'Nothing to preview yet'}
          </Text>
        )}
      </View>
    );
  };

  // The printer is chosen in the device's print dialog, so the card says so instead of naming one.
  const renderPrinterCard = () => (
    <View style={{ ...cardStyle, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.nudgeBg, borderWidth: 1, borderColor: palette.nudgeBorder }}>
        <Printer size={16} color={palette.limeOnSurface} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={{ color: palette.text, fontSize: isDesktop ? 14.5 : 12, fontWeight: '500' }}>Label printer</Text>
        <Text style={{ color: palette.faint, fontSize: isDesktop ? 12.5 : 10 }}>{categorySize.label.replace('x', ' × ')} roll · pick the printer in the print dialog</Text>
      </View>
    </View>
  );

  const renderReadyCard = () => {
    const canAct = selectedPrintCount > 0 && !isWorking;
    const primaryAction: PendingPrintAction = isDesktop ? 'print' : 'download';
    return (
      <View style={{ ...cardStyle, padding: 18, gap: 14 }}>
        <View style={{ gap: 4 }}>
          {capLabel('Ready to print')}
          <MoneyText style={{ color: palette.text, fontSize: isDesktop ? 32 : 26, letterSpacing: -0.8 }}>{selectedLabelCount} label{selectedLabelCount === 1 ? '' : 's'}</MoneyText>
          <Text style={{ color: palette.faint, fontSize: isDesktop ? 13 : 10 }}>{activeSelectedIds.length > 0 ? 'Selected items only' : 'Everything in this queue'}</Text>
        </View>
        <Pressable
          onPress={() => setPendingAction(primaryAction)}
          disabled={!canAct}
          accessibilityRole="button"
          style={(state) => ({ height: 50, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: canAct ? (isHovered(state) || state.pressed ? FYLL_LIME_HOVER : FYLL_LIME) : palette.softFill })}
        >
          {isWorking ? (
            <ActivityIndicator color={FYLL_LIME_INK} />
          ) : (
            <>
              {isDesktop ? <Printer size={17} color={canAct ? FYLL_LIME_INK : palette.faint} strokeWidth={2.2} /> : <Download size={17} color={canAct ? FYLL_LIME_INK : palette.faint} strokeWidth={2.2} />}
              <Text style={{ color: canAct ? FYLL_LIME_INK : palette.faint, fontSize: 15, fontWeight: '700' }}>
                {isDesktop
                  ? activeSelectedIds.length > 0 ? `Print selected (${selectedLabelCount})` : `Print all (${selectedLabelCount})`
                  : activeSelectedIds.length > 0 ? `Download selected (${selectedLabelCount})` : `Download labels (${selectedLabelCount})`}
              </Text>
            </>
          )}
        </Pressable>
        {isDesktop ? (
          <Pressable onPress={() => setPendingAction('download')} disabled={!canAct} accessibilityRole="button" style={{ height: 40, alignItems: 'center', justifyContent: 'center', opacity: canAct ? 1 : 0.45 }}>
            <Text style={{ color: palette.muted, fontSize: 13.5, fontWeight: '600' }}>Download as PDF</Text>
          </Pressable>
        ) : null}
      </View>
    );
  };

  const renderEmpty = () => (
    <View style={{ ...cardStyle, flex: isDesktop ? 1 : undefined, alignItems: 'center', justifyContent: 'center', gap: 12, padding: isDesktop ? 40 : 28 }}>
      <View style={{ width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.nudgeBg }}>
        {isInventoryTab ? <Package size={28} color={palette.limeOnSurface} strokeWidth={1.8} /> : <Truck size={28} color={palette.limeOnSurface} strokeWidth={1.8} />}
      </View>
      <Text style={{ color: palette.text, fontSize: isDesktop ? 18 : 14, fontWeight: '600', textAlign: 'center' }}>
        {isInventoryTab ? 'No product labels queued' : 'No shipping labels queued'}
      </Text>
      <Text style={{ color: palette.faint, fontSize: isDesktop ? 14 : 12, lineHeight: isDesktop ? 21 : 18, textAlign: 'center', maxWidth: 400 }}>
        {isInventoryTab
          ? 'Open a product in Inventory and choose Print labels, or add products here.'
          : `Add orders that are ready to dispatch and their ${sizeText} labels will wait here.`}
      </Text>
      <Pressable
        onPress={goAddItems}
        accessibilityRole="button"
        style={(state) => ({ marginTop: 6, height: 46, paddingHorizontal: 22, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: isHovered(state) || state.pressed ? FYLL_LIME_HOVER : FYLL_LIME })}
      >
        <Text style={{ color: FYLL_LIME_INK, fontSize: 15, fontWeight: '700' }}>{isInventoryTab ? 'Add products' : 'Add dispatch orders'}</Text>
      </Pressable>
      {!isInventoryTab && readyToDispatchCount > 0 ? (
        <Text style={{ color: palette.faint, fontSize: isDesktop ? 13 : 10 }}>{readyToDispatchCount} order{readyToDispatchCount === 1 ? ' is' : 's are'} ready to dispatch</Text>
      ) : null}
    </View>
  );

  const renderHistory = () => {
    const items = queue.history[activeCategory] ?? [];
    return (
      <View style={{ ...cardStyle, overflow: 'hidden' }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 12 }}>{capLabel(`${categoryMeta.label.replace('Labels', 'print history')}`)}</View>
        {items.length > 0 ? items.slice(0, 10).map((item) => (
          <View key={item.id} style={{ minHeight: 64, paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: palette.hairline, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: FYLL_LIME }}>
              <Check size={13} color={FYLL_LIME_INK} strokeWidth={3} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: palette.text, fontSize: isDesktop ? 14 : 12, fontWeight: '500' }} numberOfLines={1}>Batch #{item.id.slice(-6).toUpperCase()} · {item.itemCount} label{item.itemCount === 1 ? '' : 's'}</Text>
              <Text style={{ color: palette.faint, fontSize: isDesktop ? 12.5 : 10, marginTop: 2 }}>
                {new Date(item.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
            <View style={{ height: 30, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center', backgroundColor: palette.softFill }}>
              <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '600' }}>{item.action === 'download' ? 'PDF' : 'Print'}</Text>
            </View>
          </View>
        )) : (
          <Text style={{ color: palette.faint, fontSize: isDesktop ? 14 : 12, paddingHorizontal: 20, paddingBottom: 24 }}>No {categoryMeta.shortLabel.toLowerCase()} print history yet.</Text>
        )}
      </View>
    );
  };

  const renderDispatchOrderPicker = () => (
    <View style={{ gap: 14 }}>
      {dispatchOrders.length > 0 ? (
        <View style={{ gap: 10 }}>
          {dispatchOrders.map((order) => {
            const selected = selectedDispatchOrderIds.includes(order.id);
            const alreadyQueued = queuedOrderIds.has(order.id);
            return (
              <Pressable
                key={order.id}
                onPress={() => toggleDispatchOrder(order.id)}
                style={(state) => ({ borderRadius: 20, borderWidth: 1, borderColor: selected ? palette.nudgeBorder : palette.border, backgroundColor: selected ? palette.nudgeBg : isHovered(state) ? palette.cardHover : palette.card, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 })}
              >
                {checkbox(selected ? 'on' : 'off')}
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={{ color: palette.text, fontSize: isDesktop ? 13 : 12, fontWeight: '600' }} numberOfLines={1}>{order.orderNumber} · {order.customerName}</Text>
                  <Text style={{ color: palette.faint, fontSize: isDesktop ? 11 : 12 }} numberOfLines={1}>{order.logistics?.carrierName || 'No carrier'} · {order.deliveryState || 'No destination'}</Text>
                </View>
                {alreadyQueued ? (
                  <View style={{ height: 24, paddingHorizontal: 10, borderRadius: 999, justifyContent: 'center', backgroundColor: palette.softFill }}>
                    <Text style={{ color: palette.muted, fontSize: isDesktop ? 11 : 12, fontWeight: '600' }}>Queued</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={{ ...cardStyle, padding: 20, gap: 6 }}>
          <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>No dispatch orders found</Text>
          <Text style={{ color: palette.faint, fontSize: 12, lineHeight: 18 }}>Orders will appear here once they have a dispatched status or dispatch logistics.</Text>
        </View>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: palette.page }}>
      {isDesktop ? <DesktopSidebar /> : null}
      <View style={{ flex: 1, backgroundColor: palette.page }}>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: isDesktop ? 40 : 16, paddingTop: isDesktop ? 32 : 14, paddingBottom: isDesktop ? 60 : tabBarHeight + 24, width: '100%', maxWidth: isDesktop ? 1400 : undefined, alignSelf: isDesktop ? 'flex-start' : 'stretch', gap: isDesktop ? 22 : 16 }}
            showsVerticalScrollIndicator={false}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <MoneyText style={{ color: palette.text, fontSize: isDesktop ? 28 : 22, letterSpacing: -0.6 }}>Fyll Print</MoneyText>
                <Text style={{ color: palette.faint, fontSize: isDesktop ? 14 : 10 }} numberOfLines={2}>Product labels and shipping labels print from separate queues.</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {historyButton}
                {isDesktop ? limeButton(isInventoryTab ? 'Add products' : 'Add dispatch orders', Plus, goAddItems) : null}
              </View>
            </View>

            <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: isDesktop ? 12 : 10 }}>
              {CATEGORY_OPTIONS.map(renderCategoryTab)}
            </View>

            {viewMode === 'history' ? (
              renderHistory()
            ) : isLoading ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <ActivityIndicator color={palette.text} />
              </View>
            ) : activeItems.length === 0 ? (
              renderEmpty()
            ) : isDesktop ? (
              <View style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-start' }}>
                <View style={{ flex: 1, minWidth: 0 }}>{renderQueueList()}</View>
                <View style={{ width: 340, gap: 14 }}>
                  {renderReadyCard()}
                  {renderPreviewCard()}
                  {renderPrinterCard()}
                </View>
              </View>
            ) : (
              <View style={{ gap: 16 }}>
                {renderReadyCard()}
                {renderQueueList()}
                {renderPreviewCard()}
                {renderPrinterCard()}
              </View>
            )}
          </ScrollView>

          <Modal visible={showDispatchPicker} transparent animationType="fade" onRequestClose={() => setShowDispatchPicker(false)}>
            <View style={{ flex: 1, backgroundColor: palette.isDark ? 'rgba(0,0,0,0.62)' : 'rgba(20,20,20,0.38)', alignItems: 'center', justifyContent: isDesktop ? 'center' : 'flex-end' }}>
              <View style={{ width: '100%', maxWidth: isDesktop ? 760 : undefined, maxHeight: isDesktop ? '86%' : '92%', borderRadius: isDesktop ? 28 : 0, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: palette.page, borderWidth: 1, borderColor: palette.border, overflow: 'hidden' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 18, borderBottomWidth: 1, borderBottomColor: palette.hairline }}>
                  <View style={{ flex: 1 }}>
                    <MoneyText style={{ color: palette.text, fontSize: isDesktop ? 22 : 18, letterSpacing: -0.5 }}>Add dispatch orders</MoneyText>
                    <Text style={{ color: palette.faint, fontSize: 12, marginTop: 2 }}>{selectedDispatchOrders.length > 0 ? `${selectedDispatchOrders.length} selected` : 'Pick the orders to print labels for'}</Text>
                  </View>
                  <Pressable onPress={() => setShowDispatchPicker(false)} accessibilityRole="button" accessibilityLabel="Close" style={(state) => ({ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: state.pressed ? palette.softFill : palette.inset, borderWidth: 1, borderColor: palette.border })}>
                    <X size={17} color={palette.muted} strokeWidth={2.4} />
                  </Pressable>
                </View>
                <ScrollView contentContainerStyle={{ padding: 18 }} showsVerticalScrollIndicator={false}>
                  {renderDispatchOrderPicker()}
                </ScrollView>
                <View style={{ padding: 18, borderTopWidth: 1, borderTopColor: palette.hairline }}>
                  <Pressable
                    onPress={handleAddDispatchOrdersToQueue}
                    disabled={selectedDispatchOrders.length === 0 || isAddingDispatchOrders}
                    accessibilityRole="button"
                    style={(state) => ({ height: 50, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: isHovered(state) || state.pressed ? FYLL_LIME_HOVER : FYLL_LIME, opacity: selectedDispatchOrders.length === 0 || isAddingDispatchOrders ? 0.45 : 1 })}
                  >
                    {isAddingDispatchOrders ? <ActivityIndicator color={FYLL_LIME_INK} /> : (
                      <Text style={{ color: FYLL_LIME_INK, fontSize: 15, fontWeight: '700' }}>Add {selectedDispatchOrders.length || ''} to queue</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>

          <Modal visible={pendingAction !== null} transparent animationType="fade" onRequestClose={() => setPendingAction(null)}>
            <View style={{ flex: 1, backgroundColor: palette.isDark ? 'rgba(0,0,0,0.62)' : 'rgba(20,20,20,0.38)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
              <View style={{ width: '100%', maxWidth: 420, borderRadius: 28, padding: 20, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <MoneyText style={{ color: palette.text, fontSize: 22, letterSpacing: -0.5, flex: 1 }}>Paper check</MoneyText>
                  <Pressable onPress={() => setPendingAction(null)} accessibilityRole="button" accessibilityLabel="Close" style={(state) => ({ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: state.pressed ? palette.softFill : palette.inset, borderWidth: 1, borderColor: palette.border })}>
                    <X size={16} color={palette.muted} strokeWidth={2.4} />
                  </Pressable>
                </View>
                <Text style={{ color: palette.muted, fontSize: 14, lineHeight: 21, marginTop: 12 }}>{categoryMeta.reminder}</Text>
                <Text style={{ color: palette.faint, fontSize: 12, lineHeight: 18, marginTop: 10 }}>
                  This batch contains {activeSelectedIds.length > 0 ? `${selectedLabelCount} selected` : `all ${selectedLabelCount}`} {categoryMeta.shortLabel.toLowerCase()} label{selectedLabelCount === 1 ? '' : 's'}. The other FYLL Print queue will not be included or cleared.
                </Text>
                <Pressable
                  onPress={() => pendingAction && executeBatchAction(pendingAction)}
                  accessibilityRole="button"
                  style={(state) => ({ marginTop: 18, height: 50, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: isHovered(state) || state.pressed ? FYLL_LIME_HOVER : FYLL_LIME })}
                >
                  <Text style={{ color: FYLL_LIME_INK, fontSize: 15, fontWeight: '700' }}>{pendingAction === 'download' ? 'Download PDF' : 'Continue'}</Text>
                </Pressable>
              </View>
            </View>
          </Modal>
        </SafeAreaView>

        {/* Phones: the add action is the round + button, like Orders and Threads. */}
        {!isDesktop && viewMode === 'queue' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isInventoryTab ? 'Add products' : 'Add dispatch orders'}
            onPress={goAddItems}
            style={(state) => ({
              position: 'absolute',
              right: 20,
              bottom: Math.max(96, tabBarHeight - 48),
              width: 56,
              height: 56,
              borderRadius: 28,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: isHovered(state) || state.pressed ? FYLL_LIME_HOVER : FYLL_LIME,
              zIndex: 50,
              ...(Platform.OS === 'web'
                ? ({ boxShadow: '0 10px 28px rgba(0,0,0,0.35)' } as object)
                : { shadowColor: '#000000', shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 8 }),
            })}
          >
            <Plus size={24} color={FYLL_LIME_INK} strokeWidth={2.6} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
