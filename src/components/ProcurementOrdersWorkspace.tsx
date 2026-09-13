import React, { useCallback, useMemo, useState } from 'react';
import { Dimensions, Image, Modal, Pressable, ScrollView, Text, TextInput, View, type ViewStyle } from 'react-native';
import { pickImageSimple, pickMultipleImagesSimple } from '@/hooks/useImagePicker';
import { Search, Plus, ArrowDownUp, MoreHorizontal, ChevronDown, AlertCircle, Calendar, ChevronLeft, ChevronRight, Check, Filter, X } from 'lucide-react-native';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import { format } from 'date-fns';
import useFyllStore, { type Procurement, type ProcurementStatusOption, type Product, type ProductVariable, type WarehouseItem } from '@/lib/state/fyll-store';
import useAuthStore from '@/lib/state/auth-store';
import { uploadProductMediaIfNeeded } from '@/lib/product-media';
import { uploadBusinessAttachment } from '@/lib/storage-attachments';
import { ProcurementCreateInventoryProductModal } from '@/components/ProcurementCreateInventoryProductModal';
import { ResolvedAttachmentImage } from '@/components/ResolvedAttachmentImage';
import type { StatsColors } from '@/lib/theme';
import { SearchClearButton } from '@/components/SearchClearButton';

export type ProcurementWorkspaceSection =
  | 'orders'
  | 'receive-goods'
  | 'suppliers'
  | 'cost-breakdown'
  | 'margin-tracker'
  | 'fee-templates';

type ProcurementStatusFilter = string;
type ProcurementDateFilter = '7d' | 'month' | '30d' | 'year';
type GoodsReceiptFilter = 'all' | 'awaiting' | 'partial' | 'complete';
type GoodsReceiptSort = 'date' | 'urgency' | 'progress';
type BulkEditField =
  | 'poNumber'
  | 'date'
  | 'qtyOrdered'
  | 'unitCost'
  | 'serviceFee'
  | 'shippingClearanceFee'
  | 'deliveryFee'
  | 'status';
export type ProcurementOrderStatus = string;
export type ProcurementProductSelection = {
  productId?: string;
  variantId?: string;
  productName: string;
  variantName?: string;
  imageUrl?: string;
  isNewProduct?: boolean;
};
export type ProcurementReceivedUpdate = {
  procurementId: string;
  itemIndex: number;
  quantityReceived: number;
  dateReceived: string;
  isSample?: boolean;
};

type ProcurementOrderLine = {
  id: string;
  procurementId: string;
  itemIndex: number;
  productId: string;
  procurementTitle: string;
  poNumber: string;
  supplier: string;
  productName: string;
  variantName?: string;
  sourceTag: 'product' | 'warehouse' | 'new product';
  isNewProduct: boolean;
  dateLabel: string;
  dateValue: string;
  dateReceivedLabel: string;
  createdAtMs: number;
  qtyOrdered: number;
  qtyReceived: number;
  isSample: boolean;
  status: ProcurementOrderStatus;
  unitCost: number;
  serviceFee: number;
  shippingFee: number;
  localDeliveryFee: number;
  additionalFee: number;
  deliveryCost: number;
  sellingPrice: number;
  marginPercent: number;
  expectedProfit: number;
  imageUrl?: string;
};

type InventoryProductOption = {
  productId: string;
  variantId?: string;
  productName: string;
  variantName: string;
  displayName: string;
  category: string;
  sku: string;
  stock: number;
  imageUrl?: string;
};

type GoodsReceiptShipment = {
  id: string;
  poNumber: string;
  title: string;
  supplier: string;
  dateLabel: string;
  createdAtMs: number;
  linkedOrderCount: number;
  rows: ProcurementOrderLine[];
  qtyOrdered: number;
  qtyReceived: number;
  outstandingQty: number;
  progress: number;
  status: ProcurementOrderStatus;
  hasDiscrepancy: boolean;
};

interface ProcurementOrdersWorkspaceProps {
  colors: StatsColors;
  procurements: Procurement[];
  products: Product[];
  warehouseItems: WarehouseItem[];
  statusOptions: ProcurementStatusOption[];
  onNewOrder: () => void;
  onEdit: (procurementId: string, itemIndex?: number) => void;
  onDuplicate: (procurementId: string, itemIndex?: number) => void;
  onDelete: (procurementId: string, itemIndex?: number) => void;
  onMoveItem: (sourceProcurementId: string, itemIndex: number, targetProcurementId: string) => void;
  onStatusChange: (procurementId: string, itemIndex: number, status: ProcurementOrderStatus) => void;
  onCreateStatus: (statusName: string, color?: string) => void;
  onRenameStatus: (previousStatusName: string, nextStatusName: string, color?: string) => void;
  onReceivedChange: (updates: ProcurementReceivedUpdate[]) => void;
  onProductChange: (procurementId: string, itemIndex: number, selection: ProcurementProductSelection) => void;
  onPoNumberChange: (procurementId: string, poNumber: string, itemIndex?: number) => void;
  onDateChange: (procurementId: string, date: string) => void;
  onItemFeeChange: (procurementId: string, itemIndex: number, field: 'unitCost' | 'serviceFee' | 'shippingClearanceFee' | 'deliveryFee', value: number) => void;
  onQtyOrderedChange: (procurementId: string, itemIndex: number, qty: number) => void;
  onCreateInventoryProduct: (data: { name: string; variantType?: string; variants: { name: string; price: number; imageUri?: string | null }[]; isNewProduct?: boolean; imageUri?: string }) => Promise<{ productId: string; variantId?: string; variantName?: string; imageUrl?: string }>;
  onSaveQC?: (procurementId: string, itemIndex: number, qcImageUri: string, qcCheckedProperties: string[], qcCheckedQualityChecks: string[], quantityReceived?: number, dateReceived?: string) => void;
  productVariables: ProductVariable[];
  activeSection?: ProcurementWorkspaceSection;
  isMobile?: boolean;
  loading?: boolean;
}

const extractMetadataValue = (source: string | undefined, key: string): string | null => {
  if (!source) return null;
  const regex = new RegExp(`\\[${key}:([^\\]]+)\\]`, 'i');
  const match = source.match(regex);
  return match?.[1]?.trim() || null;
};

const toStatusLabel = (value: string | null | undefined): ProcurementOrderStatus => {
  const normalized = (value ?? '').trim();
  if (!normalized) return 'Ordered';
  return normalized
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

const statusKey = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();
const isReceivedStatus = (value: string | null | undefined) => statusKey(value).includes('receive');
const isPartialStatus = (value: string | null | undefined) => statusKey(value).includes('partial');
const isOrderedStatus = (value: string | null | undefined) => statusKey(value).includes('order');
const isSameStatus = (left: string | null | undefined, right: string | null | undefined) => {
  return statusKey(left) === statusKey(right);
};

const procurementDateFilterOptions: { key: ProcurementDateFilter; label: string }[] = [
  { key: '7d', label: 'Last 7 days' },
  { key: 'month', label: 'This Month' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'year', label: 'This Year' },
];

const procurementStatusColorOptions = [
  '#111827',
  '#6B7280',
  '#3B82F6',
  '#06B6D4',
  '#10B981',
  '#84CC16',
  '#F59E0B',
  '#F97316',
  '#EF4444',
  '#A855F7',
];

const bulkEditFieldOptions: { key: BulkEditField; label: string; placeholder: string }[] = [
  { key: 'poNumber', label: 'PO Number', placeholder: 'PO-1234' },
  { key: 'date', label: 'Date', placeholder: 'dd/mm/yyyy' },
  { key: 'qtyOrdered', label: 'Ordered', placeholder: '0' },
  { key: 'unitCost', label: 'Product Cost', placeholder: '0' },
  { key: 'serviceFee', label: 'Service Fee', placeholder: '0' },
  { key: 'shippingClearanceFee', label: 'Shipping & Clearance', placeholder: '0' },
  { key: 'deliveryFee', label: 'Logistics Fee', placeholder: '0' },
  { key: 'status', label: 'Status', placeholder: 'Select status' },
];

const COST_CATEGORY_COLORS = {
  product: '#6EB5FF',
  service: '#B79FFF',
  logistics: '#FFAA55',
  clearance: '#5CE8C8',
  other: '#8A8A95',
};
const COST_DONUT_RADIUS = 90;
const COST_DONUT_CIRCUMFERENCE = 2 * Math.PI * COST_DONUT_RADIUS;

const summaryCardStyle = (colors: StatsColors, isMobile: boolean, width?: string): ViewStyle => ({
  flex: isMobile ? undefined : 1,
  width: isMobile ? (width as ViewStyle['width'] ?? '48.5%') : undefined,
  minWidth: 0,
  borderRadius: 16,
  backgroundColor: colors.bg.card,
  borderWidth: colors.card.borderWidth,
  borderColor: colors.card.borderColor,
  padding: 20,
});

const analyticsPanelStyle = (colors: StatsColors): ViewStyle => ({
  borderRadius: 16,
  backgroundColor: colors.bg.card,
  borderWidth: colors.card.borderWidth,
  borderColor: colors.card.borderColor,
});

const tintColor = (hexColor: string, fallback: string) => {
  const normalized = hexColor.trim().replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return fallback;
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, 0.14)`;
};

const getDateFilterStartMs = (filter: ProcurementDateFilter) => {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (filter === '7d') {
    start.setDate(start.getDate() - 6);
    return start.getTime();
  }
  if (filter === '30d') {
    start.setDate(start.getDate() - 29);
    return start.getTime();
  }
  if (filter === 'month') {
    start.setDate(1);
    return start.getTime();
  }

  start.setMonth(0, 1);
  return start.getTime();
};

const formatMoney = (value: number) => {
  const rounded = Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
  return `₦${rounded.toLocaleString('en-NG', { maximumFractionDigits: rounded % 1 === 0 ? 0 : 2 })}`;
};

const resolveMode = (procurement: Procurement): 'procurement' | 'costing' => {
  const mode = extractMetadataValue(procurement.notes, 'mode')?.trim().toLowerCase();
  return mode === 'costing' ? 'costing' : 'procurement';
};

const resolvePONumber = (procurement: Procurement): string => {
  const metadataPo = extractMetadataValue(procurement.notes, 'po');
  if (metadataPo) return metadataPo;
  return `PO-${procurement.id.slice(-4).toUpperCase().padStart(4, '0')}`;
};

const toDateLabel = (value: string | null | undefined) => {
  const normalized = value?.trim();
  if (!normalized) return '-';
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return normalized;
  return format(date, 'dd/MM/yyyy');
};

const isCurrentMonthDate = (value?: string | null) => {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
};

const toInputDate = (value?: string | null) => {
  const normalized = value?.trim();
  const britishDateMatch = normalized?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const date = britishDateMatch
    ? new Date(Number(britishDateMatch[3]), Number(britishDateMatch[2]) - 1, Number(britishDateMatch[1]))
    : (normalized ? new Date(normalized) : new Date());
  if (Number.isNaN(date.getTime())) return format(new Date(), 'yyyy-MM-dd');
  return format(date, 'yyyy-MM-dd');
};

const parseInputDate = (value?: string | null) => {
  const normalized = value?.trim();
  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return new Date();
  const [year, month, day] = normalized.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

const normalizeBulkEditDate = (value: string): string | null => {
  const normalized = value.trim();
  if (!normalized) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
  const britishMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!britishMatch) return null;
  const day = Number(britishMatch[1]);
  const month = Number(britishMatch[2]);
  const year = Number(britishMatch[3]);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime()) || date.getDate() !== day || date.getMonth() !== month - 1 || date.getFullYear() !== year) return null;
  return format(date, 'yyyy-MM-dd');
};

const parseBulkNumberValue = (value: string): number | null => {
  const parsed = Number(value.replace(/,/g, '').replace(/[^\d.-]/g, '').trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const normalizePoLookupValue = (value: string): string => (
  value
    .trim()
    .toUpperCase()
    .replace(/^PO[\s-]*/i, '')
);

const buildRows = (procurements: Procurement[], products: Product[], warehouseItems: WarehouseItem[]): ProcurementOrderLine[] => {
  const rows: ProcurementOrderLine[] = [];
  const productById = new Map(products.map((product) => [product.id, product] as const));
  const warehouseItemById = new Map(warehouseItems.map((item) => [item.id, item] as const));

  procurements
    .forEach((procurement) => {
      const createdAtMs = new Date(procurement.createdAt).getTime();
      const poNumber = resolvePONumber(procurement);
      const supplier = procurement.supplierName?.trim() || 'Unknown supplier';
      const procurementTitle = procurement.title?.trim() || poNumber;
      const procurementStatus = toStatusLabel(extractMetadataValue(procurement.notes, 'status'));
      const dateReceived = extractMetadataValue(procurement.notes, 'received_date');

      procurement.items
        .forEach((item, itemIndex) => {
          if (item.productId.startsWith('charge-')) return;
          const linkedInventoryProduct = item.inventoryProductId ? productById.get(item.inventoryProductId) : undefined;
          const linkedInventoryVariant = linkedInventoryProduct?.variants.find((variant) => variant.id === item.variantId);
          const linkedWarehouseItem = warehouseItemById.get(item.productId);
          const isInventoryLinked = Boolean(linkedInventoryProduct);
          const isWarehouseLinked = !isInventoryLinked && Boolean(linkedWarehouseItem);
          const isNewInventoryProduct = isCurrentMonthDate(linkedInventoryProduct?.createdAt);
          const qtyOrdered = Math.max(0, Number(item.quantity ?? 0));
          const qtyReceivedRaw = Number(item.quantityReceived ?? 0);
          const qtyReceived = Math.max(0, Number.isFinite(qtyReceivedRaw) ? qtyReceivedRaw : 0);
          const unitCost = Math.max(0, Number(item.unitCost ?? item.costAtPurchase ?? 0));
          const serviceFee = Math.max(0, Number(item.serviceFee ?? 0));
          const shippingFee = Math.max(0, Number(item.shippingClearanceFee ?? 0));
          const localDeliveryFee = Math.max(0, Number(item.deliveryFee ?? 0));
          const additionalFee = Math.max(0, Number(item.additionalFee ?? 0));
          const deliveryCost = Math.max(0, Number(item.landedUnitCost ?? (unitCost + serviceFee + shippingFee + localDeliveryFee + additionalFee)));
          const sellingPrice = Math.max(0, Number(item.currentSellingPrice ?? 0));
          const marginPercent = sellingPrice > 0 ? ((sellingPrice - deliveryCost) / sellingPrice) * 100 : 0;
          const expectedProfit = Number.isFinite(item.expectedProfit as number)
            ? Number(item.expectedProfit)
            : Math.max(0, sellingPrice - deliveryCost) * qtyOrdered;

          const autoStatus: ProcurementOrderStatus = qtyReceived <= 0
            ? 'Ordered'
            : qtyReceived >= qtyOrdered
              ? 'Received'
              : 'Partial';
          const itemStatus = item.status?.trim();

          const productName = item.productName?.trim() || item.variantName?.trim() || 'Untitled item';
          const variantName = item.variantName?.trim() || '';
          const displayProductName = variantName && productName !== variantName && !productName.toLowerCase().includes(variantName.toLowerCase())
            ? `${productName} ${variantName}`
            : productName;

          const displayStatus = itemStatus
            ? toStatusLabel(itemStatus)
            : qtyReceived > 0
              ? autoStatus
              : procurementStatus;

          rows.push({
            id: `${procurement.id}-${itemIndex}`,
            procurementId: procurement.id,
            itemIndex,
            productId: item.inventoryProductId || item.productId,
            procurementTitle,
            poNumber,
            supplier,
            productName: displayProductName,
            variantName,
            sourceTag: isInventoryLinked ? 'product' : isWarehouseLinked ? 'warehouse' : 'new product',
            isNewProduct: Boolean(item.isNewProduct) || (isInventoryLinked ? isNewInventoryProduct : true),
            dateLabel: toDateLabel(procurement.createdAt),
            dateValue: toInputDate(procurement.createdAt),
            dateReceivedLabel: toDateLabel(dateReceived),
            createdAtMs: Number.isNaN(createdAtMs) ? 0 : createdAtMs,
            qtyOrdered,
            qtyReceived,
            isSample: Boolean(item.isSample),
            status: displayStatus,
            unitCost,
            serviceFee,
            shippingFee,
            localDeliveryFee,
            additionalFee,
            deliveryCost,
            sellingPrice,
            marginPercent,
            expectedProfit,
            imageUrl: item.imageUrl || linkedInventoryVariant?.imageUrl || linkedInventoryProduct?.imageUrl,
          });
        });
    });

  return rows.sort((a, b) => b.createdAtMs - a.createdAtMs);
};

export function ProcurementOrdersWorkspace({
  colors,
  procurements,
  products,
  warehouseItems,
  statusOptions,
  onNewOrder,
  onEdit,
  onDuplicate,
  onDelete,
  onMoveItem,
  onStatusChange,
  onCreateStatus,
  onRenameStatus,
  onReceivedChange,
  onProductChange,
  onPoNumberChange,
  onDateChange,
  onItemFeeChange,
  onQtyOrderedChange,
  onCreateInventoryProduct,
  onSaveQC,
  productVariables,
  activeSection,
  isMobile = false,
  loading = false,
}: ProcurementOrdersWorkspaceProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProcurementStatusFilter>('all');
  const [dateFilter, setDateFilter] = useState<ProcurementDateFilter>('30d');
  const [showAllComposition, setShowAllComposition] = useState(false);
  const [showAllLanded, setShowAllLanded] = useState(false);
  const [showAllPoStack, setShowAllPoStack] = useState(false);
  const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest');
  const [showOrderFilterSheet, setShowOrderFilterSheet] = useState(false);
  const [showReceiptFilterSheet, setShowReceiptFilterSheet] = useState(false);
  const [selectedMobileOrderLineId, setSelectedMobileOrderLineId] = useState<string | null>(null);
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);
  const [openStatusMenuId, setOpenStatusMenuId] = useState<string | null>(null);
  const [openProductMenuId, setOpenProductMenuId] = useState<string | null>(null);
  const [openPoMenuId, setOpenPoMenuId] = useState<string | null>(null);
  const [productQueries, setProductQueries] = useState<Record<string, string>>({});
  const [poQueries, setPoQueries] = useState<Record<string, string>>({});
  const [openDateCellId, setOpenDateCellId] = useState<string | null>(null);
  const [datePickerMonth, setDatePickerMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [bulkEditField, setBulkEditField] = useState<BulkEditField>('status');
  const [bulkEditValue, setBulkEditValue] = useState('');
  const [showBulkEditFieldDropdown, setShowBulkEditFieldDropdown] = useState(false);
  const [receiveModalRows, setReceiveModalRows] = useState<ProcurementOrderLine[]>([]);
  const [receiveQuantityDraft, setReceiveQuantityDraft] = useState('');
  const [receiveDateDraft, setReceiveDateDraft] = useState(toInputDate());
  const [receiveSampleDraft, setReceiveSampleDraft] = useState(false);
  const [productContextMenu, setProductContextMenu] = useState<{
    row: ProcurementOrderLine;
    x: number;
    y: number;
  } | null>(null);
  const [receiptFilter, setReceiptFilter] = useState<GoodsReceiptFilter>('all');
  const [receiptSort, setReceiptSort] = useState<GoodsReceiptSort>('date');
  const [expandedShipmentIds, setExpandedShipmentIds] = useState<string[]>([]);
  const [receiveNowDrafts, setReceiveNowDrafts] = useState<Record<string, string>>({});
  const [confirmedReceiptRowIds, setConfirmedReceiptRowIds] = useState<string[]>([]);
  const [receiptNotes, setReceiptNotes] = useState<Record<string, string>>({});
  const [receiptProductPreview, setReceiptProductPreview] = useState<ProcurementOrderLine | null>(null);
  const [feeDrafts, setFeeDrafts] = useState<Record<string, string>>({});
  const [openFeeCellKey, setOpenFeeCellKey] = useState<string | null>(null);
  const [selectedMarginWaterfallRowId, setSelectedMarginWaterfallRowId] = useState<string | null>(null);
  const [showMarginWaterfallDropdown, setShowMarginWaterfallDropdown] = useState(false);
  const [createProductDraft, setCreateProductDraft] = useState<{
    rowId: string;
    procurementId: string;
    itemIndex: number;
    name: string;
    variantType: string;
    variants: { id: string; name: string; price: string; imageUri?: string | null }[];
    isNewProduct: boolean;
    imageUri: string | null;
  } | null>(null);
  const [createProductSaving, setCreateProductSaving] = useState(false);
  const [qcModal, setQcModal] = useState<{ row: ProcurementOrderLine; shipmentId: string } | null>(null);
  const [qcImages, setQcImages] = useState<string[]>([]);
  const [qcCheckedProps, setQcCheckedProps] = useState<string[]>([]);
  const [qcCheckedQualityChecks, setQcCheckedQualityChecks] = useState<string[]>([]);
  const [qcImageLoading, setQcImageLoading] = useState(false);
  const [qcSaving, setQcSaving] = useState(false);
  const [qcSaveError, setQcSaveError] = useState('');
  const [statusEditor, setStatusEditor] = useState<{
    mode: 'create' | 'edit';
    row: ProcurementOrderLine;
    originalName?: string;
  } | null>(null);
  const [statusNameDraft, setStatusNameDraft] = useState('');
  const [statusColorDraft, setStatusColorDraft] = useState(procurementStatusColorOptions[0]);
  const [showAddItemOrderPicker, setShowAddItemOrderPicker] = useState(false);
  const [addItemOrderSearch, setAddItemOrderSearch] = useState('');
  const [movingItemRow, setMovingItemRow] = useState<ProcurementOrderLine | null>(null);
  const [moveItemSearch, setMoveItemSearch] = useState('');
  const updateProcurementInStore = useFyllStore((s) => s.updateProcurement);
  const updateProductInStore = useFyllStore((s) => s.updateProduct);
  const addProductVariable = useFyllStore((s) => s.addProductVariable);
  const updateProductVariable = useFyllStore((s) => s.updateProductVariable);
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const resolvedSection = activeSection ?? 'orders';
  const procurementQualityChecks = ['No visible defects', 'No breakage', 'No stains', 'Correct colour', 'Correct glasses/model'];

  const syncInventoryVariantImage = useCallback((item: Procurement['items'][number], imageUrl: string) => {
    if (!item.inventoryProductId || !item.variantId) return;
    const product = products.find((candidate) => candidate.id === item.inventoryProductId);
    if (!product) return;
    let changed = false;
    const nextVariants = product.variants.map((variant) => {
      if (variant.id !== item.variantId || variant.imageUrl === imageUrl) return variant;
      changed = true;
      return { ...variant, imageUrl };
    });
    if (!changed) return;
    void updateProductInStore(product.id, { variants: nextVariants }, businessId);
  }, [businessId, products, updateProductInStore]);

  const rows = useMemo(() => buildRows(procurements, products, warehouseItems), [procurements, products, warehouseItems]);
  const inventoryProductOptions = useMemo<InventoryProductOption[]>(() => (
    products
      .filter((product) => product.productType !== 'service')
      .flatMap((product) => {
        const productName = product.name.trim();
        const category = product.categories?.[0]?.trim() ?? '';
        const variants = product.variants ?? [];

        if (variants.length === 0) {
          return [{
            productId: product.id,
            productName,
            variantName: '',
            displayName: productName,
            category,
            sku: '',
            stock: product.useGlobalStock ? (product.globalStock ?? 0) : 0,
            imageUrl: product.imageUrl,
          }];
        }

        return variants.map((variant) => {
          const variantName = Object.values(variant.variableValues ?? {})
            .map((value) => value.trim())
            .filter(Boolean)
            .join(' / ');
          const displayName = variantName
            ? `${productName} - ${variantName}`
            : (variant.sku ? `${productName} - ${variant.sku}` : productName);
          return {
            productId: product.id,
            variantId: variant.id,
            productName,
            variantName,
            displayName,
            category,
            sku: variant.sku?.trim() ?? '',
            stock: product.useGlobalStock ? (product.globalStock ?? variant.stock ?? 0) : (variant.stock ?? 0),
            imageUrl: variant.imageUrl || product.imageUrl,
          };
        });
      })
      .filter((option) => option.displayName.length > 0)
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
  ), [products]);
  const availableVariantValuesByType = useMemo(() => {
    const valuesByType = new Map<string, Set<string>>();

    productVariables.forEach((variable) => {
      const key = variable.name.trim().toLowerCase();
      if (!key) return;
      const existing = valuesByType.get(key) ?? new Set<string>();
      variable.values.forEach((value) => {
        const normalized = value.trim();
        if (normalized) existing.add(normalized);
      });
      valuesByType.set(key, existing);
    });

    products.forEach((product) => {
      product.variants.forEach((variant) => {
        Object.entries(variant.variableValues ?? {}).forEach(([rawType, rawValue]) => {
          const key = rawType.trim().toLowerCase();
          const value = rawValue.trim();
          if (!key || !value) return;
          const existing = valuesByType.get(key) ?? new Set<string>();
          existing.add(value);
          valuesByType.set(key, existing);
        });
      });
    });

    return valuesByType;
  }, [productVariables, products]);
  const persistVariantValueOption = useCallback((variantType: string, rawValue: string) => {
    const normalizedType = variantType.trim();
    const normalizedValue = rawValue.trim();
    if (!normalizedType || !normalizedValue) return;

    const existingVariable = productVariables.find(
      (variable) => variable.name.trim().toLowerCase() === normalizedType.toLowerCase()
    );

    if (existingVariable) {
      const alreadyExists = existingVariable.values.some(
        (value) => value.trim().toLowerCase() === normalizedValue.toLowerCase()
      );
      if (alreadyExists) return;
      updateProductVariable(existingVariable.id, {
        values: [...existingVariable.values, normalizedValue],
      });
      return;
    }

    addProductVariable({
      id: `product-variable-${Date.now().toString(36)}`,
      name: normalizedType,
      values: [normalizedValue],
    });
  }, [addProductVariable, productVariables, updateProductVariable]);
  const existingPoNumbers = useMemo(() => {
    const values = new Set<string>();
    rows.forEach((row) => {
      const normalized = row.poNumber.trim().toUpperCase();
      if (normalized) values.add(normalized);
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [rows]);
  const addItemOrderOptions = useMemo(() => {
    const query = addItemOrderSearch.trim().toLowerCase();
    return procurements
      .map((procurement) => ({
        id: procurement.id,
        poNumber: resolvePONumber(procurement),
        title: procurement.title?.trim() || '',
        supplier: procurement.supplierName?.trim() || 'Unknown supplier',
        createdAtMs: new Date(procurement.createdAt).getTime(),
      }))
      .filter((option) => {
        if (!query) return true;
        return [option.poNumber, option.title, option.supplier].join(' ').toLowerCase().includes(query);
      })
      .sort((a, b) => b.createdAtMs - a.createdAtMs);
  }, [addItemOrderSearch, procurements]);
  const moveItemOrderOptions = useMemo(() => {
    const query = moveItemSearch.trim().toLowerCase();
    return procurements
      .filter((procurement) => procurement.id !== movingItemRow?.procurementId)
      .map((procurement) => ({
        id: procurement.id,
        poNumber: resolvePONumber(procurement),
        title: procurement.title?.trim() || '',
        supplier: procurement.supplierName?.trim() || 'Unknown supplier',
        createdAtMs: new Date(procurement.createdAt).getTime(),
      }))
      .filter((option) => {
        if (!query) return true;
        return [option.poNumber, option.title, option.supplier].join(' ').toLowerCase().includes(query);
      })
      .sort((a, b) => b.createdAtMs - a.createdAtMs);
  }, [moveItemSearch, movingItemRow, procurements]);
  const effectiveStatusOptions = useMemo<ProcurementStatusOption[]>(() => {
    const defaults: ProcurementStatusOption[] = [
      { id: 'proc-order-status-ordered', name: 'Ordered', order: 1, color: '#3B82F6' },
      { id: 'proc-order-status-partial', name: 'Partial', order: 2, color: '#F59E0B' },
      { id: 'proc-order-status-received', name: 'Received', order: 3, color: '#10B981' },
    ];
    const merged = [...(statusOptions ?? []), ...defaults]
      .filter((option) => option.name.trim())
      .sort((a, b) => a.order - b.order);
    const seen = new Set<string>();
    return merged.filter((option) => {
      const key = statusKey(option.name);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [statusOptions]);
  const accentColor = colors.text.primary;
  const accentSoftColor = colors.bg.input;
  const surfaceColor = colors.bg.card;
  const inputColor = colors.bg.input;
  const textPrimaryColor = colors.text.primary;
  const textSecondaryColor = colors.text.secondary;
  const textMutedColor = colors.text.tertiary;
  const gridLineColor = colors.divider;
  const outlinedFieldColor = colors.bg.card;
  const viewportHeight = Dimensions.get('window').height;
  const productContextMenuHeight = 176;
  const tableColumns = useMemo(() => [
    { label: '', width: '3%', center: true },
    { label: 'Product', width: '20%' },
    { label: 'PO Number', width: '11%' },
    { label: 'Date', width: '9%' },
    { label: 'Ordered', width: '6%', center: true },
    { label: 'Product Cost', width: '8.5%', center: true },
    { label: 'Service Fee', width: '7.5%', center: true },
    { label: 'Shipping & Clearance', width: '10%', center: true },
    { label: 'Logistics Fee', width: '8.5%', center: true },
    { label: 'Status', width: '12%', center: true },
    { label: '', width: '4.5%', center: true },
  ], []);
  const tableCellStyle = (columnIndex: number, extra: ViewStyle = {}): ViewStyle => ({
    width: tableColumns[columnIndex]?.width as ViewStyle['width'],
    flexGrow: 0,
    flexShrink: 0,
    minWidth: 0,
    height: '100%',
    borderRightWidth: columnIndex < tableColumns.length - 1 ? 1 : 0,
    borderRightColor: gridLineColor,
    ...extra,
  });
  const skeletonBlock = (width: ViewStyle['width'], height: number = 12, radius: number = 6, opacity: number = 0.72) => (
    <View style={{ width, height, borderRadius: radius, backgroundColor: inputColor, opacity }} />
  );
  const renderOrderRowsSkeleton = () => (
    <View>
      {Array.from({ length: isMobile ? 5 : 9 }).map((_, rowIndex) => (
        <View
          key={`procurement-order-loading-${rowIndex}`}
          style={{
            height: isMobile ? undefined : 48,
            minHeight: isMobile ? 64 : undefined,
            paddingHorizontal: isMobile ? 12 : 0,
            paddingVertical: isMobile ? 12 : 0,
            borderBottomWidth: rowIndex === (isMobile ? 4 : 8) ? 0 : 1,
            borderBottomColor: colors.divider,
            flexDirection: 'row',
            alignItems: 'center',
            gap: isMobile ? 12 : 0,
          }}
        >
          {isMobile ? (
            <>
              <View style={{ flex: 1, gap: 8 }}>
                {skeletonBlock('62%', 14, 7, 0.86)}
                {skeletonBlock('84%', 11, 6, 0.62)}
                {skeletonBlock(72, 18, 999, 0.58)}
              </View>
              <View style={{ width: 104, alignItems: 'flex-end', gap: 8 }}>
                {skeletonBlock(80, 13, 7, 0.76)}
                {skeletonBlock(66, 22, 999, 0.58)}
              </View>
            </>
          ) : (
            tableColumns.map((column, columnIndex) => (
              <View
                key={`procurement-order-loading-cell-${rowIndex}-${column.label}-${columnIndex}`}
                style={tableCellStyle(columnIndex, { justifyContent: 'center', paddingHorizontal: columnIndex === 0 ? 8 : 12 })}
              >
                {columnIndex === 0 || columnIndex === tableColumns.length - 1
                  ? null
                  : skeletonBlock(column.center ? '58%' : '76%', columnIndex === 9 ? 22 : 12, columnIndex === 9 ? 999 : 6, columnIndex === 1 ? 0.86 : 0.62)}
              </View>
            ))
          )}
        </View>
      ))}
    </View>
  );
  const closeFloatingMenus = () => {
    setOpenActionMenuId(null);
    setOpenStatusMenuId(null);
    setOpenProductMenuId(null);
    setOpenPoMenuId(null);
    setOpenDateCellId(null);
    setOpenFeeCellKey(null);
    setShowBulkEditFieldDropdown(false);
    setShowOrderFilterSheet(false);
    setShowReceiptFilterSheet(false);
    setShowMarginWaterfallDropdown(false);
    setProductContextMenu(null);
  };
  const openProductContextMenu = (row: ProcurementOrderLine, x: number, y: number) => {
    setOpenActionMenuId(null);
    setOpenStatusMenuId(null);
    setOpenProductMenuId(null);
    setOpenPoMenuId(null);
    setOpenDateCellId(null);
    setOpenFeeCellKey(null);
    setProductContextMenu({ row, x, y });
  };
  const productContextMenuItem = (label: string, onPress: () => void, tone: 'default' | 'danger' = 'default', withDivider: boolean = true) => (
    <Pressable
      onPress={onPress}
      style={({ hovered, pressed }) => ({
        minHeight: 44,
        paddingHorizontal: 14,
        justifyContent: 'center',
        borderBottomWidth: withDivider ? 1 : 0,
        borderBottomColor: colors.divider,
        backgroundColor: hovered ? accentSoftColor : pressed ? tintColor(textPrimaryColor, surfaceColor) : 'transparent',
        outlineWidth: hovered ? 1 : 0,
        outlineColor: hovered ? colors.divider : 'transparent',
        outlineOffset: -1,
      })}
    >
      <Text style={{ color: tone === 'danger' ? '#FF5A5F' : textPrimaryColor, fontSize: 14, fontWeight: '400' }}>{label}</Text>
    </Pressable>
  );
  const hasFloatingMenuOpen = Boolean(openActionMenuId || openStatusMenuId || openProductMenuId || openPoMenuId || openDateCellId || openFeeCellKey);

  const periodRows = useMemo(() => {
    const startMs = getDateFilterStartMs(dateFilter);
    return rows.filter((row) => row.createdAtMs >= startMs);
  }, [dateFilter, rows]);

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const next = periodRows.filter((row) => {
      if (statusFilter !== 'all' && statusKey(row.status) !== statusFilter) return false;
      if (!query) return true;
      return [
        row.productName,
        row.poNumber,
        row.supplier,
        row.dateLabel,
        row.dateReceivedLabel,
      ].join(' ').toLowerCase().includes(query);
    });

    return next.sort((a, b) => {
      if (sortBy === 'oldest') return a.createdAtMs - b.createdAtMs;
      return b.createdAtMs - a.createdAtMs;
    });
  }, [periodRows, searchQuery, sortBy, statusFilter]);

  const stats = useMemo(() => {
    const totalOrders = new Set(periodRows.map((row) => row.procurementId)).size;
    const pendingReceipt = periodRows.filter((row) => row.qtyReceived < row.qtyOrdered).length;
    const totalQtyExpected = periodRows.reduce((sum, row) => sum + row.qtyOrdered, 0);
    const totalQtyReceived = periodRows.reduce((sum, row) => sum + row.qtyReceived, 0);
    return { totalOrders, pendingReceipt, totalQtyExpected, totalQtyReceived };
  }, [periodRows]);

  const receiptShipments = useMemo<GoodsReceiptShipment[]>(() => {
    const grouped = new Map<string, ProcurementOrderLine[]>();
    periodRows.forEach((row) => {
      const poGroupKey = row.poNumber.trim().toLowerCase() || row.procurementId;
      const current = grouped.get(poGroupKey) ?? [];
      current.push(row);
      grouped.set(poGroupKey, current);
    });

    return Array.from(grouped.entries()).map(([poGroupKey, groupedRows]) => {
      const sortedRows = [...groupedRows].sort((a, b) => b.createdAtMs - a.createdAtMs);
      const firstRow = sortedRows[0];
      const supplierNames = Array.from(new Set(sortedRows.map((row) => row.supplier).filter(Boolean)));
      const linkedOrderCount = new Set(sortedRows.map((row) => row.procurementId)).size;
      const qtyOrdered = groupedRows.reduce((sum, row) => sum + row.qtyOrdered, 0);
      const qtyReceived = groupedRows.reduce((sum, row) => sum + row.qtyReceived, 0);
      const outstandingQty = Math.max(0, qtyOrdered - qtyReceived);
      const progress = qtyOrdered > 0 ? Math.min(100, Math.round((qtyReceived / qtyOrdered) * 100)) : 0;
      const status: ProcurementOrderStatus = qtyReceived <= 0
        ? 'Ordered'
        : qtyReceived >= qtyOrdered
          ? 'Received'
          : 'Partial';

      return {
        id: poGroupKey,
        poNumber: firstRow?.poNumber ?? 'PO',
        title: firstRow?.poNumber ? `${firstRow.poNumber} receiving list` : 'Linked PO receiving list',
        supplier: supplierNames.length > 1 ? `${supplierNames.length} suppliers` : supplierNames[0] ?? 'Unknown supplier',
        dateLabel: firstRow?.dateLabel ?? '-',
        createdAtMs: firstRow?.createdAtMs ?? 0,
        linkedOrderCount,
        rows: sortedRows,
        qtyOrdered,
        qtyReceived,
        outstandingQty,
        progress,
        status,
        hasDiscrepancy: groupedRows.some((row) => row.qtyReceived > 0 && row.qtyReceived !== row.qtyOrdered),
      };
    });
  }, [periodRows]);

  const filteredReceiptShipments = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const next = receiptShipments.filter((shipment) => {
      if (receiptFilter === 'awaiting' && shipment.qtyReceived > 0) return false;
      if (receiptFilter === 'partial' && !isPartialStatus(shipment.status)) return false;
      if (receiptFilter === 'complete' && !isReceivedStatus(shipment.status)) return false;
      if (!query) return true;
      return [
        shipment.poNumber,
        shipment.title,
        shipment.supplier,
        shipment.dateLabel,
        ...shipment.rows.map((row) => row.productName),
      ].join(' ').toLowerCase().includes(query);
    });

    return next.sort((a, b) => {
      if (receiptSort === 'progress') return a.progress - b.progress;
      if (receiptSort === 'urgency') {
        if (a.outstandingQty !== b.outstandingQty) return b.outstandingQty - a.outstandingQty;
        return a.createdAtMs - b.createdAtMs;
      }
      return b.createdAtMs - a.createdAtMs;
    });
  }, [receiptFilter, receiptShipments, receiptSort, searchQuery]);

  const receiptStats = useMemo(() => {
    const pendingReceipt = periodRows.filter((row) => row.qtyOrdered > 0 && row.qtyReceived <= 0).length;
    const outstandingQty = periodRows.reduce((sum, row) => sum + Math.max(0, row.qtyOrdered - row.qtyReceived), 0);
    const totalReceived = periodRows
      .filter((row) => row.qtyReceived > 0)
      .reduce((sum, row) => sum + row.qtyReceived, 0);
    const totalUnitsExpected = periodRows.reduce((sum, row) => sum + row.qtyOrdered, 0);
    const discrepancyQty = periodRows.reduce((sum, row) => (
      row.qtyReceived > 0 && row.qtyReceived !== row.qtyOrdered
        ? sum + (row.qtyReceived - row.qtyOrdered)
        : sum
    ), 0);
    const discrepancyLabel = discrepancyQty > 0 ? `+${discrepancyQty}` : `${discrepancyQty}`;
    return { pendingReceipt, outstandingQty, totalReceived, totalUnitsExpected, discrepancyQty, discrepancyLabel };
  }, [periodRows]);

  const costAnalysis = useMemo(() => {
    const totalQuantity = periodRows.reduce((sum, row) => sum + row.qtyOrdered, 0);
    const productCost = periodRows.reduce((sum, row) => sum + (row.unitCost * row.qtyOrdered), 0);
    const serviceFees = periodRows.reduce((sum, row) => sum + (row.serviceFee * row.qtyOrdered), 0);
    const logisticsFees = periodRows.reduce((sum, row) => sum + (row.localDeliveryFee * row.qtyOrdered), 0);
    const clearanceFees = periodRows.reduce((sum, row) => sum + (row.shippingFee * row.qtyOrdered), 0);
    const otherFees = periodRows.reduce((sum, row) => sum + (row.additionalFee * row.qtyOrdered), 0);
    const totalProcured = productCost + serviceFees + logisticsFees + clearanceFees + otherFees;
    const nonProductFees = serviceFees + logisticsFees + clearanceFees + otherFees;
    const avgCostPerUnit = totalQuantity > 0 ? totalProcured / totalQuantity : 0;
    const productCount = new Set(periodRows.map((row) => row.productName.trim().toLowerCase()).filter(Boolean)).size;
    const percentOfTotal = (value: number) => totalProcured > 0 ? Math.round((value / totalProcured) * 100) : 0;

    const categories = [
      { key: 'product', label: 'Product Cost', value: productCost, color: COST_CATEGORY_COLORS.product },
      { key: 'service', label: 'Service Fee', value: serviceFees, color: COST_CATEGORY_COLORS.service },
      { key: 'logistics', label: 'Logistics', value: logisticsFees, color: COST_CATEGORY_COLORS.logistics },
      { key: 'clearance', label: 'Shipping & Clearance', value: clearanceFees, color: COST_CATEGORY_COLORS.clearance },
      { key: 'other', label: 'Other Fees', value: otherFees, color: COST_CATEGORY_COLORS.other },
    ].map((category) => ({ ...category, percent: percentOfTotal(category.value) }));

    const productMap = new Map<string, {
      productName: string;
      qty: number;
      product: number;
      service: number;
      logistics: number;
      clearance: number;
      other: number;
    }>();
    periodRows.forEach((row) => {
      const key = row.productName.trim().toLowerCase() || row.id;
      const current = productMap.get(key) ?? {
        productName: row.productName,
        qty: 0,
        product: 0,
        service: 0,
        logistics: 0,
        clearance: 0,
        other: 0,
      };
      current.qty += row.qtyOrdered;
      current.product += row.unitCost * row.qtyOrdered;
      current.service += row.serviceFee * row.qtyOrdered;
      current.logistics += row.localDeliveryFee * row.qtyOrdered;
      current.clearance += row.shippingFee * row.qtyOrdered;
      current.other += row.additionalFee * row.qtyOrdered;
      productMap.set(key, current);
    });

    const productRows = Array.from(productMap.values())
      .map((row) => {
        const total = row.product + row.service + row.logistics + row.clearance + row.other;
        const landedPerUnit = row.qty > 0 ? total / row.qty : 0;
        const feePercent = total > 0 ? Math.round(((row.service + row.logistics + row.clearance + row.other) / total) * 100) : 0;
        return { ...row, total, landedPerUnit, feePercent };
      })
      .sort((a, b) => b.total - a.total);

    const poMap = new Map<string, {
      poNumber: string;
      total: number;
      product: number;
      service: number;
      logistics: number;
      clearance: number;
      other: number;
    }>();
    periodRows.forEach((row) => {
      const current = poMap.get(row.poNumber) ?? {
        poNumber: row.poNumber,
        total: 0,
        product: 0,
        service: 0,
        logistics: 0,
        clearance: 0,
        other: 0,
      };
      const product = row.unitCost * row.qtyOrdered;
      const service = row.serviceFee * row.qtyOrdered;
      const logistics = row.localDeliveryFee * row.qtyOrdered;
      const clearance = row.shippingFee * row.qtyOrdered;
      const other = row.additionalFee * row.qtyOrdered;
      current.product += product;
      current.service += service;
      current.logistics += logistics;
      current.clearance += clearance;
      current.other += other;
      current.total += product + service + logistics + clearance + other;
      poMap.set(row.poNumber, current);
    });

    const poRows = Array.from(poMap.values()).sort((a, b) => b.total - a.total);

    return {
      totalQuantity,
      productCost,
      nonProductFees,
      totalProcured,
      avgCostPerUnit,
      productCount,
      productCostPercent: percentOfTotal(productCost),
      feePercent: percentOfTotal(nonProductFees),
      categories,
      productRows,
      poRows,
    };
  }, [periodRows]);
  const costDonutSegments = useMemo(() => {
    const nonZero = costAnalysis.categories.filter((c) => c.value > 0);
    if (nonZero.length === 0) return [];
    const total = Math.max(costAnalysis.totalProcured, 1);
    const MIN_ARC = COST_DONUT_CIRCUMFERENCE * 0.06;
    const rawArcs = nonZero.map((c) => (c.value / total) * COST_DONUT_CIRCUMFERENCE);
    const clampedArcs = rawArcs.map((arc) => Math.max(arc, MIN_ARC));
    const clampedTotal = clampedArcs.reduce((s, a) => s + a, 0);
    const scale = COST_DONUT_CIRCUMFERENCE / clampedTotal;
    const finalArcs = clampedArcs.map((arc) => arc * scale);
    let offset = 0;
    return nonZero.map((c, i) => {
      const seg = { ...c, dashLength: finalArcs[i], dashOffset: -offset };
      offset += finalArcs[i];
      return seg;
    });
  }, [costAnalysis.categories, costAnalysis.totalProcured]);
  const dominantCostCategory = costAnalysis.categories.reduce(
    (best, category) => (category.value > best.value ? category : best),
    costAnalysis.categories[0] ?? { key: 'product', label: 'Product Cost', value: 0, color: COST_CATEGORY_COLORS.product, percent: 0 }
  );
  const marginAnalysis = useMemo(() => {
    const targetFallback = 40;
    const rowsWithMargin = periodRows
      .filter((row) => row.deliveryCost > 0 || row.sellingPrice > 0)
      .map((row) => {
        const targetMargin = row.marginPercent > 0 ? row.marginPercent : targetFallback;
        const sellingPrice = row.sellingPrice;
        const landedCost = row.deliveryCost;
        const profitPerUnit = sellingPrice - landedCost;
        const actualMargin = sellingPrice > 0 ? (profitPerUnit / sellingPrice) * 100 : 0;
        const gap = actualMargin - targetMargin;
        const status = gap >= 0 ? 'hitting' : gap >= -10 ? 'below' : 'miss';
        const statusColor = status === 'hitting' ? '#C8F061' : status === 'below' ? '#F59E0B' : '#EF4444';
        const suggestedPrice = targetMargin > 0 && targetMargin < 100
          ? landedCost / (1 - (targetMargin / 100))
          : landedCost;
        const profitUnits = row.qtyReceived > 0 ? row.qtyReceived : row.qtyOrdered;
        const totalProfit = profitPerUnit * profitUnits;

        return {
          ...row,
          targetMargin,
          landedCost,
          sellingPrice,
          profitPerUnit,
          actualMargin,
          gap,
          status,
          statusColor,
          suggestedPrice,
          profitUnits,
          totalProfit,
        };
      })
      .sort((a, b) => b.totalProfit - a.totalProfit);

    const marginCap = rowsWithMargin.length > 0
      ? rowsWithMargin.reduce((sum, row) => sum + row.actualMargin, 0) / rowsWithMargin.length
      : 0;
    const averageTarget = rowsWithMargin.length > 0
      ? rowsWithMargin.reduce((sum, row) => sum + row.targetMargin, 0) / rowsWithMargin.length
      : targetFallback;
    const hittingCount = rowsWithMargin.filter((row) => row.status === 'hitting').length;
    const totalExpectedProfit = rowsWithMargin.reduce((sum, row) => sum + row.totalProfit, 0);
    const best = rowsWithMargin.slice().sort((a, b) => b.actualMargin - a.actualMargin)[0] ?? null;
    const weakest = rowsWithMargin.slice().sort((a, b) => a.actualMargin - b.actualMargin)[0] ?? null;
    const waterfallRow = rowsWithMargin.find((row) => row.sellingPrice > 0) ?? rowsWithMargin[0] ?? null;

    return {
      rows: rowsWithMargin,
      averageMargin: marginCap,
      averageTarget,
      averageGap: marginCap - averageTarget,
      hittingCount,
      totalExpectedProfit,
      best,
      weakest,
      waterfallRow,
    };
  }, [periodRows]);
  const marginWaterfallOptions = useMemo(() => {
    const belowTarget = marginAnalysis.rows.filter((row) => row.gap < 0);
    const hittingTarget = marginAnalysis.rows.filter((row) => row.gap >= 0);
    return [...belowTarget, ...hittingTarget];
  }, [marginAnalysis.rows]);
  const selectedMarginWaterfallRow = useMemo(() => (
    marginWaterfallOptions.find((row) => row.id === selectedMarginWaterfallRowId)
      ?? marginWaterfallOptions[0]
      ?? marginAnalysis.waterfallRow
      ?? null
  ), [marginAnalysis.waterfallRow, marginWaterfallOptions, selectedMarginWaterfallRowId]);

  const allVisibleRowsSelected = filteredRows.length > 0 && filteredRows.every((row) => selectedRowIds.includes(row.id));
  const orderFilterCount = (statusFilter !== 'all' ? 1 : 0)
    + (sortBy !== 'newest' ? 1 : 0);
  const receiptFilterCount = (receiptFilter !== 'all' ? 1 : 0)
    + (receiptSort !== 'date' ? 1 : 0);
  const selectedVisibleRows = useMemo(
    () => filteredRows.filter((row) => selectedRowIds.includes(row.id)),
    [filteredRows, selectedRowIds]
  );
  const selectedMobileOrderLine = useMemo(
    () => filteredRows.find((row) => row.id === selectedMobileOrderLineId) ?? rows.find((row) => row.id === selectedMobileOrderLineId) ?? null,
    [filteredRows, rows, selectedMobileOrderLineId]
  );
  const activeBulkEditOption = bulkEditFieldOptions.find((option) => option.key === bulkEditField) ?? bulkEditFieldOptions[0];

  const applyBulkEdit = () => {
    const targetRows = selectedVisibleRows;
    if (targetRows.length === 0) return;
    closeFloatingMenus();

    if (bulkEditField === 'status') {
      const nextStatus = bulkEditValue.trim();
      if (!nextStatus) return;
      targetRows.forEach((row) => onStatusChange(row.procurementId, row.itemIndex, nextStatus));
    } else if (bulkEditField === 'poNumber') {
      const nextPoNumber = bulkEditValue.trim().toUpperCase();
      if (!nextPoNumber) return;
      const updatedProcurements = new Set<string>();
      targetRows.forEach((row) => {
        if (updatedProcurements.has(row.procurementId)) return;
        updatedProcurements.add(row.procurementId);
        onPoNumberChange(row.procurementId, nextPoNumber);
      });
    } else if (bulkEditField === 'date') {
      const nextDate = normalizeBulkEditDate(bulkEditValue);
      if (!nextDate) return;
      const updatedProcurements = new Set<string>();
      targetRows.forEach((row) => {
        if (updatedProcurements.has(row.procurementId)) return;
        updatedProcurements.add(row.procurementId);
        onDateChange(row.procurementId, nextDate);
      });
    } else {
      const parsedValue = parseBulkNumberValue(bulkEditValue);
      if (parsedValue === null) return;
      targetRows.forEach((row) => {
        if (bulkEditField === 'qtyOrdered') {
          onQtyOrderedChange(row.procurementId, row.itemIndex, Math.round(parsedValue));
        } else {
          onItemFeeChange(row.procurementId, row.itemIndex, bulkEditField, parsedValue);
        }
      });
    }

    setBulkEditValue('');
    setSelectedRowIds((previous) => previous.filter((rowId) => !targetRows.some((row) => row.id === rowId)));
  };

  const openReceiveModal = (targetRows: ProcurementOrderLine[]) => {
    if (targetRows.length === 0) return;
    closeFloatingMenus();
    setReceiveModalRows(targetRows);
    setReceiveSampleDraft(targetRows.every((row) => row.isSample));
    if (targetRows.length === 1) {
      const row = targetRows[0];
      setReceiveQuantityDraft(String(row.qtyReceived > 0 ? row.qtyReceived : row.qtyOrdered));
      setReceiveDateDraft(row.dateReceivedLabel === '-' ? toInputDate() : toInputDate(row.dateReceivedLabel));
    } else {
      setReceiveQuantityDraft('');
      setReceiveDateDraft(toInputDate());
    }
  };

  const closeReceiveModal = () => {
    setReceiveModalRows([]);
    setReceiveQuantityDraft('');
    setReceiveDateDraft(toInputDate());
    setReceiveSampleDraft(false);
  };

  const saveReceivedModal = () => {
    const parsedQuantity = Number(String(receiveQuantityDraft).replace(/,/g, '').trim());
    const hasSharedQuantity = Number.isFinite(parsedQuantity) && parsedQuantity >= 0;
    const updates = receiveModalRows.map((row) => {
      const nextQuantity = hasSharedQuantity ? Math.max(0, parsedQuantity) : row.qtyOrdered;
      return {
        procurementId: row.procurementId,
        itemIndex: row.itemIndex,
        quantityReceived: nextQuantity,
        dateReceived: receiveDateDraft || toInputDate(),
        isSample: receiveSampleDraft,
      };
    });
    onReceivedChange(updates);
    setConfirmedReceiptRowIds((previous) => Array.from(new Set([
      ...previous,
      ...receiveModalRows.map((row) => row.id),
    ])));
    setReceiveNowDrafts((previous) => {
      const next = { ...previous };
      receiveModalRows.forEach((row) => {
        delete next[row.id];
      });
      return next;
    });
    setSelectedRowIds((previous) => previous.filter((rowId) => !receiveModalRows.some((row) => row.id === rowId)));
    closeReceiveModal();
  };

  const toggleShipmentExpanded = (shipmentId: string) => {
    setExpandedShipmentIds((previous) => (
      previous.includes(shipmentId)
        ? previous.filter((id) => id !== shipmentId)
        : [...previous, shipmentId]
    ));
  };

  const getReceiveNowDraft = (row: ProcurementOrderLine) => {
    const existingDraft = receiveNowDrafts[row.id];
    if (existingDraft !== undefined) return existingDraft;
    return String(row.qtyReceived);
  };

  const getDraftReceivedQuantity = (row: ProcurementOrderLine) => {
    const parsedQuantity = Number(getReceiveNowDraft(row).replace(/,/g, '').trim());
    if (!Number.isFinite(parsedQuantity)) return 0;
    return Math.max(0, parsedQuantity);
  };

  const saveReceiptLine = (row: ProcurementOrderLine) => {
    openReceiveModal([{
      ...row,
      qtyReceived: getDraftReceivedQuantity(row),
    }]);
  };

  const parseQcImageValue = (value?: string) => {
    if (!value?.trim()) return [];
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
      }
    } catch {
      // Legacy single-image values are stored as a plain string.
    }
    return [value].filter((item) => item.trim().length > 0);
  };

  const isPersistedStoragePath = (uri: string) => {
    const normalized = uri.trim();
    if (!normalized) return false;
    return !/^(https?:|file:|blob:|data:|ph:|assets-library:|content:)/i.test(normalized);
  };

  const persistQcImages = useCallback(async (row: ProcurementOrderLine, images: string[]) => {
    if (!images.length) return [];
    if (!businessId) {
      throw new Error('Missing business account. Please sign in again before saving QC proof.');
    }

    const persistedImages: string[] = [];
    for (const [index, imageUri] of images.entries()) {
      const normalizedUri = imageUri.trim();
      if (!normalizedUri) continue;
      if (isPersistedStoragePath(normalizedUri)) {
        persistedImages.push(normalizedUri);
        continue;
      }

      const uploaded = await uploadBusinessAttachment({
        businessId,
        folder: `procurement/qc/${row.procurementId}/${row.itemIndex}`,
        uri: normalizedUri,
        fileName: `qc-proof-${index + 1}.jpg`,
        mimeType: 'image/jpeg',
        compressImages: true,
      });
      persistedImages.push(uploaded.storagePath);
    }
    return persistedImages;
  }, [businessId]);

  const openQcModalForRow = (row: ProcurementOrderLine, shipmentId: string) => {
    const qcItem = procurements.find((p) => p.id === row.procurementId)?.items[row.itemIndex];
    setQcModal({ row, shipmentId });
    setQcImages(parseQcImageValue(qcItem?.qcImageUri));
    setQcCheckedProps(qcItem?.qcCheckedProperties ?? []);
    setQcCheckedQualityChecks(qcItem?.qcCheckedQualityChecks ?? []);
    setQcSaveError('');
  };

  const saveReceiptShipment = (shipment: GoodsReceiptShipment) => {
    const updates = shipment.rows.map((row) => ({
      procurementId: row.procurementId,
      itemIndex: row.itemIndex,
      quantityReceived: getDraftReceivedQuantity(row),
      dateReceived: toInputDate(),
    }));
    onReceivedChange(updates);
    setConfirmedReceiptRowIds((previous) => Array.from(new Set([...previous, ...shipment.rows.map((row) => row.id)])));
    setReceiveNowDrafts((previous) => {
      const next = { ...previous };
      shipment.rows.forEach((row) => { delete next[row.id]; });
      return next;
    });
  };

  const mobileOrderTextWeight = isMobile && resolvedSection === 'orders' ? '400' : '600';
  const mobileOrderStrongWeight = isMobile && resolvedSection === 'orders' ? '600' : '800';

  const statusChip = (label: string, active: boolean, onPress: () => void) => (
    <Pressable
      key={label}
      onPress={() => {
        closeFloatingMenus();
        onPress();
      }}
      style={{
        height: 32,
        borderRadius: 999,
        borderWidth: active ? 0 : 1,
        borderColor: colors.divider,
        backgroundColor: active ? colors.bar : colors.bg.card,
        paddingHorizontal: 12,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: active ? colors.bg.screen : textSecondaryColor, fontSize: 12, fontWeight: mobileOrderTextWeight }}>{label}</Text>
    </Pressable>
  );

  const getStatusOption = (status: string | null | undefined) => (
    effectiveStatusOptions.find((option) => isSameStatus(option.name, status))
  );

  const getStatusConfig = (status: ProcurementOrderLine['status']) => {
    const optionColor = getStatusOption(status)?.color;
    if (optionColor) return { label: toStatusLabel(status), text: optionColor, bg: tintColor(optionColor, inputColor) };
    if (isReceivedStatus(status)) return { label: toStatusLabel(status), text: textPrimaryColor, bg: inputColor };
    if (isPartialStatus(status)) return { label: toStatusLabel(status), text: '#F59E0B', bg: tintColor('#F59E0B', inputColor) };
    if (isOrderedStatus(status)) return { label: toStatusLabel(status), text: '#3B82F6', bg: tintColor('#3B82F6', inputColor) };
    return { label: toStatusLabel(status), text: textSecondaryColor, bg: inputColor };
  };

  const statusBadge = (status: ProcurementOrderLine['status'], showChevron = false) => {
    const config = getStatusConfig(status);
    return (
      <View style={{ alignSelf: 'flex-start', height: 22, borderRadius: 6, paddingHorizontal: 7, backgroundColor: config.bg, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4 }}>
        <Text style={{ color: config.text, fontSize: isMobile ? 10 : 10.5, fontWeight: isMobile ? '500' : '600' }}>{config.label}</Text>
        {showChevron ? <ChevronDown size={10} color={config.text} strokeWidth={2.4} /> : null}
      </View>
    );
  };

  const openStatusEditor = (mode: 'create' | 'edit', row: ProcurementOrderLine) => {
    const currentConfig = getStatusConfig(row.status);
    setOpenStatusMenuId(null);
    setStatusEditor({ mode, row, originalName: mode === 'edit' ? row.status : undefined });
    setStatusNameDraft(mode === 'edit' ? toStatusLabel(row.status) : '');
    setStatusColorDraft(mode === 'edit' ? currentConfig.text : procurementStatusColorOptions[0]);
  };

  const saveStatusEditor = () => {
    const draftName = statusNameDraft.trim();
    if (!draftName || !statusEditor?.row) return;
    const normalizedName = toStatusLabel(draftName);

    if (statusEditor.mode === 'edit' && statusEditor.originalName) {
      onRenameStatus(statusEditor.originalName, normalizedName, statusColorDraft);
      if (!isSameStatus(statusEditor.originalName, normalizedName)) {
        onStatusChange(statusEditor.row.procurementId, statusEditor.row.itemIndex, normalizedName);
      }
    } else {
      onCreateStatus(normalizedName, statusColorDraft);
      onStatusChange(statusEditor.row.procurementId, statusEditor.row.itemIndex, normalizedName);
    }

    setStatusEditor(null);
    setStatusNameDraft('');
    setStatusColorDraft(procurementStatusColorOptions[0]);
  };

  const statusMenuItem = (row: ProcurementOrderLine, status: ProcurementOrderStatus) => {
    const config = getStatusConfig(status);
    const isActive = isSameStatus(row.status, status);
    return (
      <Pressable
        key={status}
        onPress={() => {
          setOpenStatusMenuId(null);
          if (!isActive) onStatusChange(row.procurementId, row.itemIndex, status);
        }}
        style={{
          height: 34,
          paddingHorizontal: 10,
          justifyContent: 'center',
          backgroundColor: isActive ? inputColor : surfaceColor,
        }}
      >
      <Text style={{ color: config.text, fontSize: 12, fontWeight: '600' }}>{config.label}</Text>
      </Pressable>
    );
  };

  const orderLineCostRows = (row: ProcurementOrderLine) => [
    { label: 'Product Cost', value: row.unitCost },
    { label: 'Service Fee', value: row.serviceFee },
    { label: 'Shipping & Clearance', value: row.shippingFee },
    { label: 'Logistics Fee', value: row.localDeliveryFee },
    { label: 'Other Fees', value: row.additionalFee },
    { label: 'Landed Cost / Unit', value: row.deliveryCost },
  ];

  const orderLineProfitRows = (row: ProcurementOrderLine) => {
    const sellingPrice = row.sellingPrice;
    const profitPerUnit = sellingPrice - row.deliveryCost;
    const expectedProfit = row.expectedProfit;
    return [
      { label: 'Selling Price / Unit', value: sellingPrice, type: 'currency' as const },
      { label: 'Landed Cost / Unit', value: row.deliveryCost, type: 'currency' as const },
      { label: 'Profit / Unit', value: profitPerUnit, type: 'currency' as const },
      { label: 'Margin', value: row.marginPercent, type: 'percent' as const },
      { label: 'Total Expected Profit', value: expectedProfit, type: 'currency' as const },
    ];
  };

  const profitValueColor = (value: number) => (
    value > 0 ? '#10B981' : value < 0 ? '#EF4444' : textPrimaryColor
  );

  const statusUtilityMenuItem = (label: string, onPress: () => void) => (
    <Pressable
      onPress={onPress}
      style={{
        height: 34,
        paddingHorizontal: 10,
        justifyContent: 'center',
        backgroundColor: surfaceColor,
      }}
    >
      <Text style={{ color: textPrimaryColor, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );

  const selectCalendarDate = (row: ProcurementOrderLine, date: Date) => {
    const nextDate = format(date, 'yyyy-MM-dd');
    if (nextDate !== row.dateValue) {
      onDateChange(row.procurementId, nextDate);
    }
    setOpenDateCellId(null);
  };

  const renderDatePicker = (row: ProcurementOrderLine) => {
    const selectedDate = parseInputDate(row.dateValue);
    const [monthYear, monthNumber] = datePickerMonth.split('-').map(Number);
    const visibleMonth = Number.isFinite(monthYear) && Number.isFinite(monthNumber)
      ? new Date(monthYear, monthNumber - 1, 1)
      : new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    const firstDayIndex = visibleMonth.getDay();
    const daysInMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate();
    const calendarCells = [
      ...Array.from({ length: firstDayIndex }, () => null),
      ...Array.from({ length: daysInMonth }, (_, index) => new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), index + 1)),
    ];

    return (
      <View
        style={{
          position: 'absolute',
          top: 30,
          left: 0,
          width: 232,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.divider,
          backgroundColor: surfaceColor,
          padding: 10,
          zIndex: 1002,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <Pressable
            onPress={() => {
              const previousMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
              setDatePickerMonth(format(previousMonth, 'yyyy-MM'));
            }}
            style={{ width: 28, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: inputColor }}
          >
            <ChevronLeft size={14} color={textSecondaryColor} strokeWidth={2.3} />
          </Pressable>
          <Text style={{ color: textPrimaryColor, fontSize: 12, fontWeight: '700' }}>
            {format(visibleMonth, 'MMM yyyy')}
          </Text>
          <Pressable
            onPress={() => {
              const nextMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
              setDatePickerMonth(format(nextMonth, 'yyyy-MM'));
            }}
            style={{ width: 28, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: inputColor }}
          >
            <ChevronRight size={14} color={textSecondaryColor} strokeWidth={2.3} />
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
            <Text key={`${day}-${index}`} style={{ width: 30, height: 22, color: textMutedColor, fontSize: 10, fontWeight: '700', textAlign: 'center' }}>
              {day}
            </Text>
          ))}
          {calendarCells.map((date, index) => {
            const isSelected = date ? format(date, 'yyyy-MM-dd') === row.dateValue : false;
            return (
              <Pressable
                key={date ? format(date, 'yyyy-MM-dd') : `blank-${index}`}
                disabled={!date}
                onPress={() => date && selectCalendarDate(row, date)}
                style={{
                  width: 30,
                  height: 28,
                  borderRadius: 7,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isSelected ? accentColor : 'transparent',
                }}
              >
                <Text style={{ color: isSelected ? surfaceColor : textSecondaryColor, fontSize: 11, fontWeight: isSelected ? '700' : '500' }}>
                  {date ? date.getDate() : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  };

  const actionMenuItem = (label: string, color: string, onPress: () => void) => (
    <Pressable
      onPress={() => {
        setOpenActionMenuId(null);
        onPress();
      }}
      style={({ hovered, pressed }) => ({
        minHeight: 44,
        paddingHorizontal: 14,
        justifyContent: 'center',
        backgroundColor: hovered ? accentSoftColor : pressed ? tintColor(textPrimaryColor, surfaceColor) : surfaceColor,
        outlineWidth: hovered ? 1 : 0,
        outlineColor: hovered ? colors.divider : 'transparent',
        outlineOffset: -1,
      })}
    >
      <Text style={{ color, fontSize: 14, fontWeight: '400' }}>{label}</Text>
    </Pressable>
  );

  const renderProductMenu = (row: ProcurementOrderLine) => {
    const rawQuery = productQueries[row.id] ?? row.productName;
    const query = rawQuery.trim().toLowerCase();

    const matches = (query
      ? inventoryProductOptions.filter((v) =>
          v.productName.toLowerCase().includes(query) ||
          v.variantName.toLowerCase().includes(query) ||
          v.displayName.toLowerCase().includes(query) ||
          v.sku.toLowerCase().includes(query) ||
          v.category.toLowerCase().includes(query)
        )
      : inventoryProductOptions
    );

    const exactMatch = inventoryProductOptions.some((v) => v.displayName.trim().toLowerCase() === query);

    return (
      <View
        style={{
          position: 'absolute',
          top: 45,
          left: 5,
          width: 260,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.divider,
          backgroundColor: surfaceColor,
          overflow: 'hidden',
          zIndex: 1002,
          shadowColor: '#000',
          shadowOpacity: 0.35,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
        }}
      >
        {matches.length > 0 ? (
          <ScrollView
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: 300 }}
          >
            {matches.map((v) => (
              <Pressable
                key={`${v.productId}-${v.variantId ?? 'product'}`}
                onPress={() => {
                  setOpenProductMenuId(null);
                  setProductQueries((previous) => ({ ...previous, [row.id]: v.displayName }));
                  onProductChange(row.procurementId, row.itemIndex, {
                    productId: v.productId,
                    variantId: v.variantId,
                    productName: v.productName,
                    variantName: v.variantName,
                    imageUrl: v.imageUrl,
                  });
                }}
                style={{
                  minHeight: 42,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.divider,
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: textPrimaryColor, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>{v.displayName}</Text>
                <Text style={{ color: v.stock > 0 ? '#10B981' : textMutedColor, fontSize: 10, marginTop: 2 }} numberOfLines={1}>
                  {v.variantId
                    ? `${v.stock} in stock${v.sku ? ` · ${v.sku}` : ''}`
                    : `${v.stock} in stock${v.category ? ` · ${v.category}` : ''}`}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <View style={{ minHeight: 42, paddingHorizontal: 10, justifyContent: 'center' }}>
            <Text style={{ color: textMutedColor, fontSize: 12 }}>No matching inventory products</Text>
          </View>
        )}
        {rawQuery.trim() && !exactMatch ? (
          <Pressable
            onPress={() => {
              const productName = rawQuery.trim();
              setOpenProductMenuId(null);
              setCreateProductDraft({
                rowId: row.id,
                procurementId: row.procurementId,
                itemIndex: row.itemIndex,
                name: productName,
                variantType: '',
                variants: [{ id: Math.random().toString(36).slice(2), name: '', price: '', imageUri: null }],
                isNewProduct: false,
                imageUri: null,
              });
            }}
            style={{ minHeight: 38, paddingHorizontal: 10, paddingVertical: 8, justifyContent: 'center', borderTopWidth: 1, borderTopColor: colors.divider, flexDirection: 'row', alignItems: 'center', gap: 6 }}
          >
            <Plus size={12} color={accentColor} strokeWidth={2.5} />
            <Text style={{ color: accentColor, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>Add "{rawQuery.trim()}" to inventory</Text>
          </Pressable>
        ) : null}
      </View>
    );
  };

  const renderPoMenu = (row: ProcurementOrderLine) => {
    const rawQuery = poQueries[row.id] ?? '';
    const query = rawQuery.trim().toLowerCase();
    const normalizedLookupQuery = normalizePoLookupValue(rawQuery);
    const candidatePoNumbers = Array.from(new Set([
      ...existingPoNumbers,
      row.poNumber.trim().toUpperCase(),
    ].filter(Boolean)));
    const matches = (query
      ? candidatePoNumbers.filter((poNumber) => (
        poNumber.toLowerCase().includes(query)
        || normalizePoLookupValue(poNumber).includes(normalizedLookupQuery)
      ))
      : candidatePoNumbers
    ).slice(0, 6);
    const exactMatchedPoNumber = candidatePoNumbers.find((poNumber) => (
      poNumber.toLowerCase() === query
      || normalizePoLookupValue(poNumber) === normalizedLookupQuery
    ));
    const exactMatch = Boolean(exactMatchedPoNumber);

    return (
      <View
        style={{
          position: 'absolute',
          top: 36,
          left: 5,
          width: 180,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.divider,
          backgroundColor: surfaceColor,
          overflow: 'hidden',
          zIndex: 1002,
        }}
      >
        {matches.map((poNumber) => (
          <Pressable
            key={poNumber}
            onPress={() => {
              setOpenPoMenuId(null);
              setPoQueries((previous) => ({ ...previous, [row.id]: poNumber }));
              onPoNumberChange(row.procurementId, poNumber, row.itemIndex);
            }}
            style={{
              minHeight: 34,
              paddingHorizontal: 10,
              paddingVertical: 8,
              borderBottomWidth: 1,
              borderBottomColor: colors.divider,
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: textPrimaryColor, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
              {poNumber}
            </Text>
          </Pressable>
        ))}
        {rawQuery.trim() && !exactMatch ? (
          <Pressable
            onPress={() => {
              const poNumber = exactMatchedPoNumber ?? rawQuery.trim().toUpperCase();
              setOpenPoMenuId(null);
              setPoQueries((previous) => ({ ...previous, [row.id]: poNumber }));
              onPoNumberChange(row.procurementId, poNumber, row.itemIndex);
            }}
            style={{ minHeight: 34, paddingHorizontal: 10, paddingVertical: 8, justifyContent: 'center' }}
          >
            <Text style={{ color: '#6EB5FF', fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
              Use "{rawQuery.trim().toUpperCase()}"
            </Text>
          </Pressable>
        ) : null}
        {matches.length === 0 && !rawQuery.trim() ? (
          <View style={{ minHeight: 40, paddingHorizontal: 10, justifyContent: 'center' }}>
            <Text style={{ color: textMutedColor, fontSize: 12 }}>No PO numbers yet</Text>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={{ width: '100%', alignSelf: 'stretch' }}>
      <View style={{ minHeight: 640 }}>
          {resolvedSection === 'orders' ? (
            <>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ flexGrow: 0 }}
                contentContainerStyle={{ flexDirection: 'row', gap: 8, paddingRight: isMobile ? 8 : 0 }}
              >
                {procurementDateFilterOptions.map((option) => statusChip(
                  option.label,
                  dateFilter === option.key,
                  () => setDateFilter(option.key)
                ))}
              </ScrollView>

              <View style={{ flexDirection: 'row', flexWrap: isMobile ? 'wrap' : 'nowrap', gap: isMobile ? 10 : 12, marginTop: 14 }}>
                {[
                  { label: 'Total orders', value: `${stats.totalOrders}`, helper: procurementDateFilterOptions.find((option) => option.key === dateFilter)?.label ?? 'Selected period' },
                  { label: 'Pending receipt', value: `${stats.pendingReceipt}`, helper: 'Awaiting confirmation' },
                  { label: 'Total qty expected', value: `${stats.totalQtyExpected}`, helper: 'Ordered quantity' },
                  { label: 'Total qty received', value: `${stats.totalQtyReceived}`, helper: 'Confirmed quantity' },
                ].map((card) => (
                  <View
                    key={card.label}
                    style={summaryCardStyle(colors, isMobile)}
                  >
                    <Text style={{ color: textMutedColor, fontSize: isMobile ? 10 : 8, fontWeight: mobileOrderTextWeight, marginBottom: 8 }}>
                      {card.label}
                    </Text>
                    {loading ? (
                      skeletonBlock('46%', 18, 8, 0.82)
                    ) : (
                      <Text style={{ color: textPrimaryColor, fontSize: 16, lineHeight: 18, fontWeight: mobileOrderStrongWeight }} numberOfLines={1}>
                        {card.value}
                      </Text>
                    )}
                    {loading ? (
                      <View style={{ marginTop: 8 }}>
                        {skeletonBlock('68%', 10, 6, 0.56)}
                      </View>
                    ) : (
                      <Text style={{ color: textMutedColor, fontSize: 10, fontWeight: '500', marginTop: 8 }} numberOfLines={1}>{card.helper}</Text>
                    )}
                  </View>
                ))}
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: isMobile ? 10 : 8, marginTop: 14, flexWrap: isMobile ? 'nowrap' : 'nowrap' }}>
                <View style={{ height: isMobile ? 40 : 34, width: isMobile ? undefined : 300, flex: isMobile ? 1 : undefined, minWidth: 0, borderRadius: 999, borderWidth: 1, borderColor: colors.divider, backgroundColor: isMobile ? 'transparent' : outlinedFieldColor, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 }}>
                  <Search size={isMobile ? 15 : 14} color={textMutedColor} strokeWidth={2} />
                  <TextInput
                    value={searchQuery}
                    onFocus={closeFloatingMenus}
                    onChangeText={(text) => {
                      closeFloatingMenus();
                      setSearchQuery(text);
                    }}
                    placeholder="Search product, PO number, supplier..."
                    placeholderTextColor={textMutedColor}
                    style={{ flex: 1, marginLeft: 8, color: textPrimaryColor, fontSize: isMobile ? 14 : 12 }}
                  />
                  <SearchClearButton visible={Boolean(searchQuery.trim())} onPress={() => { closeFloatingMenus(); setSearchQuery(''); }} />
                </View>

                <View style={{ position: 'relative' }}>
                  {isMobile && orderFilterCount > 0 ? (
                    <View style={{ position: 'absolute', top: -6, right: 1, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.bar, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, zIndex: 2 }}>
                      <Text style={{ color: colors.bg.screen, fontSize: 9, fontWeight: '700' }}>{orderFilterCount > 9 ? '9+' : orderFilterCount}</Text>
                    </View>
                  ) : null}
                  <Pressable
                    onPress={() => {
                      closeFloatingMenus();
                      if (isMobile) {
                        setShowOrderFilterSheet(true);
                      } else {
                        setSortBy((prev) => prev === 'newest' ? 'oldest' : 'newest');
                      }
                    }}
                    style={{ width: isMobile ? 38 : undefined, height: isMobile ? 38 : 34, borderRadius: 999, borderWidth: 1, borderColor: colors.divider, backgroundColor: isMobile ? 'transparent' : inputColor, paddingHorizontal: isMobile ? 0 : 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}
                  >
                    {isMobile ? <Filter size={16} color={orderFilterCount > 0 ? colors.bar : colors.text.tertiary} strokeWidth={2} /> : <ArrowDownUp size={13} color={textSecondaryColor} strokeWidth={2} />}
                    {!isMobile ? (
                      <Text style={{ color: textSecondaryColor, fontSize: 12, fontWeight: '500' }}>
                        {sortBy === 'newest' ? 'Newest' : 'Oldest'}
                      </Text>
                    ) : null}
                  </Pressable>
                </View>

                {!isMobile ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                  {statusChip('All', statusFilter === 'all', () => setStatusFilter('all'))}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ flexGrow: 0, flexShrink: 1 }}
                    contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                  >
                    {effectiveStatusOptions.map((option) => {
                      const optionKey = statusKey(option.name);
                      return (
                        <React.Fragment key={optionKey}>
                          {statusChip(option.name, statusFilter === optionKey, () => setStatusFilter(optionKey))}
                        </React.Fragment>
                      );
                    })}
                  </ScrollView>
                </View>
                ) : null}
              </View>

              {isMobile ? (
                <Modal
                  visible={showOrderFilterSheet}
                  transparent
                  animationType="fade"
                  onRequestClose={() => setShowOrderFilterSheet(false)}
                >
                  <Pressable
                    onPress={() => setShowOrderFilterSheet(false)}
                    style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.32)', justifyContent: 'flex-end', padding: 12 }}
                  >
                    <Pressable
                      onPress={(event) => event.stopPropagation()}
                      style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.divider, backgroundColor: surfaceColor, padding: 16, gap: 16 }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                        <View>
                          <Text style={{ color: textPrimaryColor, fontSize: 16, fontWeight: mobileOrderStrongWeight }}>Filter & Sort</Text>
                          <Text style={{ color: textMutedColor, fontSize: 12, marginTop: 2 }}>Procurement Orders</Text>
                        </View>
                        <Pressable
                          onPress={() => setShowOrderFilterSheet(false)}
                          style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: colors.divider, backgroundColor: inputColor, alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Text style={{ color: textSecondaryColor, fontSize: 16, fontWeight: mobileOrderStrongWeight }}>×</Text>
                        </Pressable>
                      </View>

                      <View style={{ gap: 8 }}>
                        <Text style={{ color: textMutedColor, fontSize: 10, fontWeight: mobileOrderStrongWeight, letterSpacing: 1, textTransform: 'uppercase' }}>Status</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                          <Pressable
                            onPress={() => setStatusFilter('all')}
                            style={{ height: 34, borderRadius: 999, borderWidth: statusFilter === 'all' ? 0 : 1, borderColor: colors.divider, backgroundColor: statusFilter === 'all' ? colors.bar : inputColor, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' }}
                          >
                            <Text style={{ color: statusFilter === 'all' ? colors.bg.screen : textSecondaryColor, fontSize: 12, fontWeight: mobileOrderStrongWeight }}>All</Text>
                          </Pressable>
                          {effectiveStatusOptions.map((option) => {
                            const optionKey = statusKey(option.name);
                            const isActive = statusFilter === optionKey;
                            const config = getStatusConfig(option.name);
                            return (
                              <Pressable
                                key={option.id}
                                onPress={() => setStatusFilter(optionKey)}
                                style={{ height: 34, borderRadius: 999, borderWidth: isActive ? 0 : 1, borderColor: colors.divider, backgroundColor: isActive ? config.bg : inputColor, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' }}
                              >
                                <Text style={{ color: isActive ? config.text : textSecondaryColor, fontSize: 12, fontWeight: mobileOrderStrongWeight }}>{option.name}</Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>

                      <View style={{ gap: 8 }}>
                        <Text style={{ color: textMutedColor, fontSize: 10, fontWeight: mobileOrderStrongWeight, letterSpacing: 1, textTransform: 'uppercase' }}>Sort</Text>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          {([
                            { key: 'newest' as const, label: 'Newest first' },
                            { key: 'oldest' as const, label: 'Oldest first' },
                          ]).map((option) => {
                            const isActive = sortBy === option.key;
                            return (
                              <Pressable
                                key={option.key}
                                onPress={() => setSortBy(option.key)}
                                style={{ flex: 1, height: 38, borderRadius: 10, borderWidth: isActive ? 0 : 1, borderColor: colors.divider, backgroundColor: isActive ? colors.bar : inputColor, alignItems: 'center', justifyContent: 'center' }}
                              >
                                <Text style={{ color: isActive ? colors.bg.screen : textSecondaryColor, fontSize: 12, fontWeight: mobileOrderStrongWeight }}>{option.label}</Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>

                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <Pressable
                          onPress={() => {
                            setStatusFilter('all');
                            setSortBy('newest');
                          }}
                          style={{ flex: 1, height: 42, borderRadius: 999, borderWidth: 1, borderColor: colors.divider, alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Text style={{ color: textSecondaryColor, fontSize: 13, fontWeight: mobileOrderStrongWeight }}>Reset</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => setShowOrderFilterSheet(false)}
                          style={{ flex: 1, height: 42, borderRadius: 999, backgroundColor: colors.bar, alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Text style={{ color: colors.bg.screen, fontSize: 13, fontWeight: mobileOrderStrongWeight }}>Apply</Text>
                        </Pressable>
                      </View>
                    </Pressable>
                  </Pressable>
                </Modal>
              ) : null}

              {selectedVisibleRows.length > 0 ? (
                <View style={{ marginTop: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.divider, backgroundColor: surfaceColor, paddingHorizontal: 12, paddingVertical: 10, zIndex: 2000, elevation: 50, overflow: 'visible' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, overflow: 'visible' }}>
                    <Text style={{ color: textPrimaryColor, fontSize: 12, fontWeight: '700' }}>
                      {selectedVisibleRows.length} selected
                    </Text>
                    <View style={{ width: 220, position: 'relative', zIndex: showBulkEditFieldDropdown ? 4000 : 1, elevation: showBulkEditFieldDropdown ? 80 : 0 }}>
                      <Pressable
                        onPress={() => {
                          setOpenActionMenuId(null);
                          setOpenStatusMenuId(null);
                          setOpenProductMenuId(null);
                          setOpenPoMenuId(null);
                          setOpenDateCellId(null);
                          setOpenFeeCellKey(null);
                          setShowBulkEditFieldDropdown((previous) => !previous);
                        }}
                        style={{ height: 32, borderRadius: 8, borderWidth: 1, borderColor: colors.divider, backgroundColor: inputColor, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
                      >
                        <Text style={{ color: textSecondaryColor, fontSize: 12, fontWeight: '700' }} numberOfLines={1}>
                          {activeBulkEditOption.label}
                        </Text>
                        <ChevronDown size={14} color={textMutedColor} strokeWidth={2.2} />
                      </Pressable>
                      {showBulkEditFieldDropdown ? (
                        <View
                          style={{
                            position: 'absolute',
                            top: 36,
                            left: 0,
                            right: 0,
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: colors.divider,
                            backgroundColor: surfaceColor,
                            overflow: 'hidden',
                            zIndex: 5000,
                            elevation: 90,
                            shadowColor: '#000000',
                            shadowOpacity: 0.22,
                            shadowRadius: 14,
                            shadowOffset: { width: 0, height: 8 },
                          }}
                        >
                          {bulkEditFieldOptions.map((option) => {
                            const isActive = bulkEditField === option.key;
                            return (
                              <Pressable
                                key={option.key}
                                onPress={() => {
                                  setBulkEditField(option.key);
                                  setBulkEditValue(option.key === 'status' ? (effectiveStatusOptions[0]?.name ?? '') : '');
                                  setShowBulkEditFieldDropdown(false);
                                }}
                                style={{ minHeight: 32, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: isActive ? inputColor : surfaceColor, borderBottomWidth: 1, borderBottomColor: colors.divider }}
                              >
                                <Text style={{ color: isActive ? textPrimaryColor : textSecondaryColor, fontSize: 12, fontWeight: '700' }}>
                                  {option.label}
                                </Text>
                                {isActive ? <Check size={13} color={textPrimaryColor} strokeWidth={2.6} /> : null}
                              </Pressable>
                            );
                          })}
                        </View>
                      ) : null}
                    </View>
                    {bulkEditField === 'status' ? (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={{ flex: 1, minWidth: 160 }}
                        contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}
                      >
                        {effectiveStatusOptions.map((option) => {
                          const isActive = isSameStatus(bulkEditValue, option.name);
                          const config = getStatusConfig(option.name);
                          return (
                            <Pressable
                              key={option.id}
                              onPress={() => setBulkEditValue(option.name)}
                              style={{
                                height: 30,
                                borderRadius: 999,
                                borderWidth: isActive ? 0 : 1,
                                borderColor: colors.divider,
                                backgroundColor: isActive ? config.bg : inputColor,
                                paddingHorizontal: 10,
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <Text style={{ color: config.text, fontSize: 11, fontWeight: '700' }}>{option.name}</Text>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    ) : (
                      <TextInput
                        value={bulkEditValue}
                        onChangeText={(text) => setBulkEditValue(bulkEditField === 'poNumber' ? text.toUpperCase() : text)}
                        placeholder={activeBulkEditOption.placeholder}
                        placeholderTextColor={textMutedColor}
                        keyboardType={bulkEditField === 'date' || bulkEditField === 'poNumber' ? 'default' : 'numeric'}
                        style={{ flex: 1, minWidth: 160, height: 34, borderRadius: 8, borderWidth: 1, borderColor: colors.divider, backgroundColor: inputColor, color: textPrimaryColor, paddingHorizontal: 10, fontSize: 12 }}
                      />
                    )}
                    <Pressable
                      onPress={applyBulkEdit}
                      style={{ height: 34, borderRadius: 999, backgroundColor: colors.bar, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Text style={{ color: colors.bg.screen, fontSize: 12, fontWeight: '800' }}>Apply to selected</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        setSelectedRowIds([]);
                        setBulkEditValue('');
                        setShowBulkEditFieldDropdown(false);
                      }}
                      style={{ height: 34, borderRadius: 999, borderWidth: 1, borderColor: colors.divider, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Text style={{ color: textSecondaryColor, fontSize: 11, fontWeight: '700' }}>Clear</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}

              {isMobile ? (
                <>
                  <View style={{ marginTop: 12, borderWidth: 1, borderColor: colors.divider, borderRadius: 16, overflow: 'hidden', backgroundColor: surfaceColor }}>
                    {loading ? (
                      renderOrderRowsSkeleton()
                    ) : filteredRows.length === 0 ? (
                      <View style={{ minHeight: 180, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                        <Text style={{ color: textMutedColor, fontSize: 14 }}>No procurement rows found</Text>
                      </View>
                    ) : filteredRows.map((row, index) => {
                      const config = getStatusConfig(row.status);
                      return (
                        <Pressable
                          key={row.id}
                          onPress={() => setSelectedMobileOrderLineId(row.id)}
                          style={{ paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: index === filteredRows.length - 1 ? 0 : 1, borderBottomColor: colors.divider }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={{ color: textPrimaryColor, fontSize: 14, fontWeight: '400' }} numberOfLines={1}>
                                {row.productName}
                              </Text>
                              <Text style={{ color: textMutedColor, fontSize: 12, marginTop: 3 }} numberOfLines={1}>
                                {row.poNumber} · {row.dateLabel}
                              </Text>
                              <View style={{ flexDirection: 'row', alignSelf: 'flex-start', gap: 4, marginTop: 7 }}>
                                {row.sourceTag === 'product' ? (
                                  <View style={{ borderRadius: 999, paddingHorizontal: 6, height: 18, backgroundColor: inputColor, alignItems: 'center', justifyContent: 'center' }}>
                                    <Text style={{ color: accentColor, fontSize: 10, fontWeight: mobileOrderTextWeight }}>product</Text>
                                  </View>
                                ) : null}
                                {row.sourceTag === 'warehouse' ? (
                                  <View style={{ borderRadius: 999, paddingHorizontal: 6, height: 18, backgroundColor: '#64748B22', alignItems: 'center', justifyContent: 'center' }}>
                                    <Text style={{ color: '#64748B', fontSize: 10, fontWeight: mobileOrderTextWeight }}>warehouse</Text>
                                  </View>
                                ) : null}
                                {row.isNewProduct ? (
                                  <View style={{ borderRadius: 999, paddingHorizontal: 6, height: 18, backgroundColor: '#6EB5FF22', alignItems: 'center', justifyContent: 'center' }}>
                                    <Text style={{ color: '#6EB5FF', fontSize: 10, fontWeight: mobileOrderTextWeight }}>new product</Text>
                                  </View>
                                ) : null}
                                {row.isSample ? (
                                  <View style={{ borderRadius: 999, paddingHorizontal: 6, height: 18, backgroundColor: '#F59E0B22', alignItems: 'center', justifyContent: 'center' }}>
                                    <Text style={{ color: '#F59E0B', fontSize: 10, fontWeight: mobileOrderTextWeight }}>sample</Text>
                                  </View>
                                ) : null}
                              </View>
                            </View>
                            <View style={{ alignItems: 'flex-end', minWidth: 108 }}>
                              <Text style={{ color: textPrimaryColor, fontSize: 14, fontWeight: '400' }} numberOfLines={1}>
                                {row.qtyOrdered} ordered
                              </Text>
                              <View style={{ borderRadius: 999, paddingHorizontal: 9, height: 24, marginTop: 7, backgroundColor: config.bg, alignItems: 'center', justifyContent: 'center' }}>
                                <Text style={{ color: config.text, fontSize: 10, fontWeight: '500' }} numberOfLines={1}>{config.label}</Text>
                              </View>
                            </View>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Modal
                    visible={Boolean(selectedMobileOrderLine)}
                    animationType="none"
                    onRequestClose={() => setSelectedMobileOrderLineId(null)}
                  >
                    <View style={{ flex: 1, backgroundColor: colors.bg.screen, paddingTop: 16 }}>
                      {selectedMobileOrderLine ? (
                        <>
                          <View style={{ paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.divider, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={{ color: textPrimaryColor, fontSize: 22, fontWeight: mobileOrderStrongWeight }} numberOfLines={2}>{selectedMobileOrderLine.productName}</Text>
                              <Text style={{ color: textMutedColor, fontSize: 13, marginTop: 4 }} numberOfLines={1}>{selectedMobileOrderLine.poNumber} · {selectedMobileOrderLine.dateLabel}</Text>
                            </View>
                            <Pressable
                              onPress={() => setSelectedMobileOrderLineId(null)}
                              style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: inputColor, alignItems: 'center', justifyContent: 'center' }}
                            >
                              <Text style={{ color: textSecondaryColor, fontSize: 20, fontWeight: mobileOrderStrongWeight }}>×</Text>
                            </Pressable>
                          </View>

                          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 18, gap: 14, paddingBottom: 34 }}>
                            <View style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.divider, backgroundColor: surfaceColor, overflow: 'hidden' }}>
                              {[
                                { label: 'PO Number', value: selectedMobileOrderLine.poNumber },
                                { label: 'Date', value: selectedMobileOrderLine.dateLabel },
                                { label: 'Supplier', value: selectedMobileOrderLine.supplier },
                                { label: 'Qty Ordered', value: String(selectedMobileOrderLine.qtyOrdered) },
                                { label: 'Qty Received', value: String(selectedMobileOrderLine.qtyReceived) },
                                { label: 'Status', value: selectedMobileOrderLine.status },
                              ].map((item) => (
                                <View key={item.label} style={{ minHeight: 48, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.divider, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
                                  <Text style={{ color: textMutedColor, fontSize: 12, fontWeight: mobileOrderTextWeight }}>{item.label}</Text>
                                  <Text style={{ color: textPrimaryColor, fontSize: 14, fontWeight: mobileOrderTextWeight, flex: 1, textAlign: 'right' }} numberOfLines={2}>{item.value}</Text>
                                </View>
                              ))}
                            </View>

                            {/* New product + image card */}
                            {(() => {
                              const row = selectedMobileOrderLine;
                              const procurement = procurements.find((p) => p.id === row.procurementId);
                              const item = procurement?.items[row.itemIndex];
                              if (!item) return null;
                              const existingProduct = item.inventoryProductId ? products.find((p) => p.id === item.inventoryProductId) : null;
                              const existingVariant = existingProduct?.variants.find((variant) => variant.id === item.variantId);
                              const existingImage = item.imageUrl || existingVariant?.imageUrl || existingProduct?.imageUrl || null;
                              const isNew = row.isNewProduct;
                              return (
                                <View style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.divider, backgroundColor: surfaceColor, gap: 10, padding: 14 }}>
                                  {/* Badges */}
                                  <View style={{ flexDirection: 'row', gap: 6 }}>
                                    {row.sourceTag === 'product' ? (
                                      <View style={{ borderRadius: 999, paddingHorizontal: 7, height: 18, backgroundColor: tintColor('#10B981', inputColor), alignItems: 'center', justifyContent: 'center' }}>
                                        <Text style={{ color: '#10B981', fontSize: 10, fontWeight: '600' }}>product</Text>
                                      </View>
                                    ) : null}
                                    {row.sourceTag === 'warehouse' ? (
                                      <View style={{ borderRadius: 999, paddingHorizontal: 7, height: 18, backgroundColor: tintColor('#64748B', inputColor), alignItems: 'center', justifyContent: 'center' }}>
                                        <Text style={{ color: '#64748B', fontSize: 10, fontWeight: '600' }}>warehouse</Text>
                                      </View>
                                    ) : null}
                                    {isNew ? (
                                      <View style={{ borderRadius: 999, paddingHorizontal: 7, height: 18, backgroundColor: '#6EB5FF22', alignItems: 'center', justifyContent: 'center' }}>
                                        <Text style={{ color: '#6EB5FF', fontSize: 10, fontWeight: '600' }}>new product</Text>
                                      </View>
                                    ) : null}
                                    {row.isSample ? (
                                      <View style={{ borderRadius: 999, paddingHorizontal: 7, height: 18, backgroundColor: '#F59E0B22', alignItems: 'center', justifyContent: 'center' }}>
                                        <Text style={{ color: '#F59E0B', fontSize: 10, fontWeight: '600' }}>sample</Text>
                                      </View>
                                    ) : null}
                                  </View>
                                  <Text style={{ color: textMutedColor, fontSize: 11 }}>
                                    The new product badge appears automatically for manual products or inventory products created this month.
                                  </Text>
                                  {/* Image */}
                                  <View>
                                    <Text style={{ color: textMutedColor, fontSize: 10, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 }}>Product image</Text>
                                    {existingImage ? (
                                      <View style={{ height: 110, borderRadius: 10, overflow: 'hidden', position: 'relative' }}>
                                        <ResolvedAttachmentImage imageUrl={existingImage} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                                        <View style={{ position: 'absolute', bottom: 6, right: 6, flexDirection: 'row', gap: 6 }}>
                                          <Pressable
                                            onPress={async () => {
                                              const rawUri = await pickImageSimple();
                                              if (!rawUri || !procurement) return;
                                              const storagePath = await uploadProductMediaIfNeeded({
                                                businessId,
                                                productId: item.inventoryProductId || procurement.id,
                                                uri: rawUri,
                                                fileName: `item-${row.itemIndex}-image.jpg`,
                                              });
                                              const imageUrl = storagePath ?? rawUri;
                                              const nextItems = procurement.items.map((it, i) =>
                                                i === row.itemIndex ? { ...it, imageUrl } : it
                                              );
                                              updateProcurementInStore(procurement.id, { items: nextItems }, businessId);
                                              syncInventoryVariantImage(item, imageUrl);
                                            }}
                                            style={{ height: 26, paddingHorizontal: 10, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}
                                          >
                                            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600' }}>Change</Text>
                                          </Pressable>
                                          <Pressable
                                            onPress={() => {
                                              if (!procurement) return;
                                              const nextItems = procurement.items.map((it, i) =>
                                                i === row.itemIndex ? { ...it, imageUrl: undefined } : it
                                              );
                                              updateProcurementInStore(procurement.id, { items: nextItems }, businessId);
                                            }}
                                            style={{ width: 26, height: 26, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}
                                          >
                                            <X size={11} color="#fff" strokeWidth={2.5} />
                                          </Pressable>
                                        </View>
                                      </View>
                                    ) : (
                                      <Pressable
                                        onPress={async () => {
                                          const rawUri = await pickImageSimple();
                                          if (!rawUri || !procurement) return;
                                          const storagePath = await uploadProductMediaIfNeeded({
                                            businessId,
                                            productId: item.inventoryProductId || procurement.id,
                                            uri: rawUri,
                                            fileName: `item-${row.itemIndex}-image.jpg`,
                                          });
                                          const imageUrl = storagePath ?? rawUri;
                                          const nextItems = procurement.items.map((it, i) =>
                                            i === row.itemIndex ? { ...it, imageUrl } : it
                                          );
                                          updateProcurementInStore(procurement.id, { items: nextItems }, businessId);
                                          syncInventoryVariantImage(item, imageUrl);
                                        }}
                                        style={{ height: 72, borderRadius: 10, borderWidth: 1, borderColor: colors.divider, borderStyle: 'dashed', backgroundColor: inputColor, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}
                                      >
                                        <Plus size={14} color={textMutedColor} strokeWidth={2} />
                                        <Text style={{ color: textMutedColor, fontSize: 12 }}>Upload image</Text>
                                      </Pressable>
                                    )}
                                  </View>
                                </View>
                              );
                            })()}

                            <View style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.divider, backgroundColor: surfaceColor, overflow: 'hidden' }}>
                              <Text style={{ color: textMutedColor, fontSize: 11, fontWeight: mobileOrderStrongWeight, letterSpacing: 1.1, textTransform: 'uppercase', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.divider }}>Cost Breakdown</Text>
                              {orderLineCostRows(selectedMobileOrderLine).map((item) => (
                                <View key={item.label} style={{ minHeight: 46, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.divider, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
                                  <Text style={{ color: textSecondaryColor, fontSize: 13 }}>{item.label}</Text>
                                  <Text style={{ color: textPrimaryColor, fontSize: 14, fontWeight: mobileOrderStrongWeight }}>₦{item.value.toLocaleString()}</Text>
                                </View>
                              ))}
                            </View>

                            <View style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.divider, backgroundColor: surfaceColor, overflow: 'hidden' }}>
                              <Text style={{ color: textMutedColor, fontSize: 11, fontWeight: mobileOrderStrongWeight, letterSpacing: 1.1, textTransform: 'uppercase', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.divider }}>Profit Breakdown</Text>
                              {orderLineProfitRows(selectedMobileOrderLine).map((item) => (
                                <View key={item.label} style={{ minHeight: 46, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.divider, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
                                  <Text style={{ color: textSecondaryColor, fontSize: 13 }}>{item.label}</Text>
                                  <Text style={{ color: item.label === 'Selling Price / Unit' ? textPrimaryColor : profitValueColor(item.value), fontSize: 14, fontWeight: mobileOrderStrongWeight }}>
                                    {item.type === 'percent' ? `${item.value.toFixed(1)}%` : `₦${item.value.toLocaleString()}`}
                                  </Text>
                                </View>
                              ))}
                            </View>

                            <View style={{ flexDirection: 'row', gap: 10 }}>
                              <Pressable
                                onPress={() => {
                                  const row = selectedMobileOrderLine;
                                  setSelectedMobileOrderLineId(null);
                                  onEdit(row.procurementId, row.itemIndex);
                                }}
                                style={{ flex: 1, height: 44, borderRadius: 999, backgroundColor: colors.bar, alignItems: 'center', justifyContent: 'center' }}
                              >
                                <Text style={{ color: colors.bg.screen, fontSize: 14, fontWeight: mobileOrderStrongWeight }}>Edit</Text>
                              </Pressable>
                              <Pressable
                                onPress={() => {
                                  const row = selectedMobileOrderLine;
                                  setSelectedMobileOrderLineId(null);
                                  onDuplicate(row.procurementId, row.itemIndex);
                                }}
                                style={{ flex: 1, height: 44, borderRadius: 999, borderWidth: 1, borderColor: colors.divider, alignItems: 'center', justifyContent: 'center' }}
                              >
                                <Text style={{ color: textSecondaryColor, fontSize: 14, fontWeight: mobileOrderStrongWeight }}>Duplicate</Text>
                              </Pressable>
                            </View>
                          </ScrollView>
                        </>
                      ) : null}
                    </View>
                  </Modal>
                </>
              ) : (
              <View style={{ marginTop: 12, borderWidth: 1, borderColor: colors.divider, borderRadius: 8, overflow: 'visible', zIndex: 20 }}>
                  <View style={{ width: '100%', minWidth: 0, position: 'relative' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', height: 38, borderBottomWidth: 1, borderBottomColor: gridLineColor, backgroundColor: 'transparent', zIndex: 1 }}>
                      {tableColumns.map((column, columnIndex) => (
                        <View
                          key={`${column.label}-${column.width}`}
                          style={tableCellStyle(columnIndex, {
                            paddingHorizontal: columnIndex === 2 || columnIndex === 3 ? 14 : 7,
                            justifyContent: 'center',
                          })}
                        >
                          {columnIndex === 0 ? (
                            <Pressable
                              onPress={() => {
                                closeFloatingMenus();
                                setSelectedRowIds((previous) => (
                                  allVisibleRowsSelected
                                    ? previous.filter((rowId) => !filteredRows.some((row) => row.id === rowId))
                                    : Array.from(new Set([...previous, ...filteredRows.map((row) => row.id)]))
                                ));
                              }}
                              style={{ width: 14, height: 14, borderRadius: 3, borderWidth: 1, borderColor: allVisibleRowsSelected ? colors.bar : colors.divider, backgroundColor: allVisibleRowsSelected ? colors.bar : inputColor, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' }}
                            >
                              {allVisibleRowsSelected ? <Check size={10} color={colors.bg.screen} strokeWidth={3} /> : null}
                            </Pressable>
                          ) : (
                            <Text style={{ color: textMutedColor, fontSize: 8.5, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', textAlign: column.center ? 'center' : 'left' }} numberOfLines={1}>
                              {column.label}
                            </Text>
                          )}
                        </View>
                      ))}
                    </View>

                    {hasFloatingMenuOpen ? (
                      <Pressable
                        onPress={closeFloatingMenus}
                        style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 900 }}
                      />
                    ) : null}

                    {loading ? (
                      renderOrderRowsSkeleton()
                    ) : filteredRows.length === 0 ? (
                      <View style={{ height: 180, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: textMutedColor, fontSize: 14 }}>No procurement rows found</Text>
                      </View>
                    ) : filteredRows.map((row) => (
                      <View
                        key={row.id}
                        style={{
                          height: 48,
                          borderBottomWidth: 1,
                          borderBottomColor: colors.divider,
                          flexDirection: 'row',
                          alignItems: 'center',
                          position: 'relative',
                          zIndex: openActionMenuId === row.id || openStatusMenuId === row.id || openProductMenuId === row.id || openPoMenuId === row.id || openDateCellId === row.id ? 1000 : 1,
                          backgroundColor: 'transparent',
                        }}
                      >
                        <View style={tableCellStyle(0, { paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' })}>
                          <Pressable
                            onPress={() => {
                              closeFloatingMenus();
                              setSelectedRowIds((previous) => (
                                previous.includes(row.id)
                                  ? previous.filter((rowId) => rowId !== row.id)
                                  : [...previous, row.id]
                              ));
                            }}
                            style={{ width: 14, height: 14, borderRadius: 3, borderWidth: 1, borderColor: selectedRowIds.includes(row.id) ? colors.bar : colors.divider, backgroundColor: selectedRowIds.includes(row.id) ? colors.bar : inputColor, alignItems: 'center', justifyContent: 'center' }}
                          >
                            {selectedRowIds.includes(row.id) ? <Check size={10} color={colors.bg.screen} strokeWidth={3} /> : null}
                          </Pressable>
                        </View>
                        <View style={tableCellStyle(1, { paddingHorizontal: 10, justifyContent: 'center', position: 'relative', zIndex: openProductMenuId === row.id ? 1001 : 1 })}>
                          {openProductMenuId === row.id ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              <TextInput
                                value={productQueries[row.id] ?? row.productName}
                                autoFocus
                                onFocus={() => {
                                  setOpenActionMenuId(null);
                                  setOpenStatusMenuId(null);
                                  setOpenPoMenuId(null);
                                  setOpenProductMenuId(row.id);
                                  setProductQueries((previous) => ({ ...previous, [row.id]: previous[row.id] ?? row.productName }));
                                }}
                                onChangeText={(text) => {
                                  setOpenProductMenuId(row.id);
                                  setProductQueries((previous) => ({ ...previous, [row.id]: text }));
                                }}
                                onSubmitEditing={() => {
                                  const productName = (productQueries[row.id] ?? row.productName).trim();
                                  if (!productName) return;
                                  setOpenProductMenuId(null);
                                  onProductChange(row.procurementId, row.itemIndex, { productName });
                                }}
                                placeholder="Search product..."
                                placeholderTextColor={textMutedColor}
                                style={{
                                  height: 20,
                                  padding: 0,
                                  color: textPrimaryColor,
                                  fontSize: 10.5,
                                  fontWeight: '500',
                                  flex: 1,
                                }}
                              />
                              <SearchClearButton
                                visible={Boolean((productQueries[row.id] ?? '').trim())}
                                onPress={() => {
                                  setOpenProductMenuId(row.id);
                                  setProductQueries((previous) => ({ ...previous, [row.id]: '' }));
                                }}
                                size={12}
                                style={{ width: 20, height: 20, borderRadius: 10, marginLeft: 4 }}
                              />
                            </View>
                          ) : (
                            <Pressable
                              onPress={() => {
                                setOpenActionMenuId(null);
                                setOpenStatusMenuId(null);
                                setOpenPoMenuId(null);
                                setOpenProductMenuId(row.id);
                                setProductQueries((previous) => ({ ...previous, [row.id]: previous[row.id] ?? row.productName }));
                              }}
                              {...(!isMobile ? {
                                onContextMenu: (event: any) => {
                                  event.preventDefault?.();
                                  event.stopPropagation?.();
                                  const pageX = Number(event?.nativeEvent?.pageX ?? event?.pageX ?? 0);
                                  const pageY = Number(event?.nativeEvent?.pageY ?? event?.pageY ?? 0);
                                  openProductContextMenu(row, pageX, pageY);
                                },
                              } : {})}
                              style={{ minHeight: 18, justifyContent: 'center' }}
                            >
                              <Text style={{ color: textPrimaryColor, fontSize: 10.5, fontWeight: '500' }} numberOfLines={1}>
                                {row.productName}
                              </Text>
                            </Pressable>
                          )}
                          <View style={{ flexDirection: 'row', alignSelf: 'flex-start', gap: 3, marginTop: 1 }}>
                            {row.sourceTag === 'product' ? (
                              <View style={{ borderRadius: 999, paddingHorizontal: 4, height: 13, backgroundColor: inputColor, alignItems: 'center', justifyContent: 'center' }}>
                                <Text style={{ color: accentColor, fontSize: 8.5, fontWeight: '500' }}>product</Text>
                              </View>
                            ) : null}
                            {row.sourceTag === 'warehouse' ? (
                              <View style={{ borderRadius: 999, paddingHorizontal: 4, height: 13, backgroundColor: '#64748B22', alignItems: 'center', justifyContent: 'center' }}>
                                <Text style={{ color: '#64748B', fontSize: 8.5, fontWeight: '500' }}>warehouse</Text>
                              </View>
                            ) : null}
                            {row.isNewProduct ? (
                              <View style={{ borderRadius: 999, paddingHorizontal: 4, height: 13, backgroundColor: '#6EB5FF22', alignItems: 'center', justifyContent: 'center' }}>
                                <Text style={{ color: '#6EB5FF', fontSize: 8.5, fontWeight: '500' }}>new product</Text>
                              </View>
                            ) : null}
                            {row.isSample ? (
                              <View style={{ borderRadius: 999, paddingHorizontal: 4, height: 13, backgroundColor: '#F59E0B22', alignItems: 'center', justifyContent: 'center' }}>
                                <Text style={{ color: '#F59E0B', fontSize: 8.5, fontWeight: '500' }}>sample</Text>
                              </View>
                            ) : null}
                          </View>
                          {openProductMenuId === row.id ? renderProductMenu(row) : null}
                        </View>
                        <View style={tableCellStyle(2, { paddingHorizontal: 14, justifyContent: 'center', position: 'relative', zIndex: openPoMenuId === row.id ? 1001 : 1 })}>
                          {openPoMenuId === row.id ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              <TextInput
                                value={poQueries[row.id] ?? row.poNumber}
                                autoFocus
                                onFocus={() => {
                                  setOpenActionMenuId(null);
                                  setOpenStatusMenuId(null);
                                  setOpenProductMenuId(null);
                                  setOpenPoMenuId(row.id);
                                  setPoQueries((previous) => ({ ...previous, [row.id]: previous[row.id] ?? '' }));
                                }}
                                onChangeText={(text) => {
                                  setOpenPoMenuId(row.id);
                                  setPoQueries((previous) => ({ ...previous, [row.id]: text.toUpperCase() }));
                                }}
                                onSubmitEditing={() => {
                                  const poNumber = (poQueries[row.id] ?? row.poNumber).trim().toUpperCase();
                                  if (!poNumber) return;
                                  setOpenPoMenuId(null);
                                  onPoNumberChange(row.procurementId, poNumber, row.itemIndex);
                                }}
                                placeholder={row.poNumber || 'Search PO...'}
                                placeholderTextColor={textMutedColor}
                                style={{
                                  height: 22,
                                  padding: 0,
                                  color: textPrimaryColor,
                                  fontSize: 10.5,
                                  fontWeight: '600',
                                  flex: 1,
                                }}
                              />
                              <SearchClearButton
                                visible={Boolean((poQueries[row.id] ?? '').trim())}
                                onPress={() => {
                                  setOpenPoMenuId(row.id);
                                  setPoQueries((previous) => ({ ...previous, [row.id]: '' }));
                                }}
                                size={12}
                                style={{ width: 20, height: 20, borderRadius: 10, marginLeft: 4 }}
                              />
                            </View>
                          ) : (
                            <Pressable
                              onPress={() => {
                                setOpenActionMenuId(null);
                                setOpenStatusMenuId(null);
                                setOpenProductMenuId(null);
                                setOpenPoMenuId(row.id);
                                setPoQueries((previous) => ({ ...previous, [row.id]: previous[row.id] ?? '' }));
                              }}
                              style={{ minHeight: 22, justifyContent: 'center' }}
                            >
                              <Text style={{ color: textSecondaryColor, fontSize: 10.5, fontWeight: '600' }} numberOfLines={1}>{row.poNumber}</Text>
                            </Pressable>
                          )}
                          {openPoMenuId === row.id ? renderPoMenu(row) : null}
                        </View>
                        <View style={tableCellStyle(3, { paddingHorizontal: 14, justifyContent: 'center', position: 'relative', zIndex: openDateCellId === row.id ? 1001 : 1 })}>
                          <Pressable
                            onPress={() => {
                              closeFloatingMenus();
                              setOpenDateCellId(row.id);
                              setDatePickerMonth(row.dateValue.slice(0, 7));
                            }}
                            style={{ minHeight: 22, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 5 }}
                          >
                            <Text style={{ color: textSecondaryColor, fontSize: 10.5 }} numberOfLines={1}>{row.dateLabel}</Text>
                            <Calendar size={11} color={textMutedColor} strokeWidth={2} />
                          </Pressable>
                          {openDateCellId === row.id ? renderDatePicker(row) : null}
                        </View>
                        <View style={tableCellStyle(4, { paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' })}>
                          {openFeeCellKey === `${row.id}:qty` ? (
                            <TextInput
                              value={feeDrafts[`${row.id}:qty`] ?? String(row.qtyOrdered)}
                              autoFocus
                              onBlur={() => {
                                const next = Math.max(0, Math.round(Number(String(feeDrafts[`${row.id}:qty`] ?? row.qtyOrdered).replace(/,/g, '').trim()) || 0));
                                onQtyOrderedChange(row.procurementId, row.itemIndex, next);
                                setOpenFeeCellKey(null);
                              }}
                              onSubmitEditing={() => {
                                const next = Math.max(0, Math.round(Number(String(feeDrafts[`${row.id}:qty`] ?? row.qtyOrdered).replace(/,/g, '').trim()) || 0));
                                onQtyOrderedChange(row.procurementId, row.itemIndex, next);
                                setOpenFeeCellKey(null);
                              }}
                              onChangeText={(text) => setFeeDrafts((prev) => ({ ...prev, [`${row.id}:qty`]: text }))}
                              keyboardType="numeric"
                              placeholder="0"
                              placeholderTextColor={textMutedColor}
                              style={{ width: '100%', height: 24, color: textPrimaryColor, fontSize: 10.5, fontWeight: '600', textAlign: 'center', borderBottomWidth: 1, borderBottomColor: accentColor }}
                            />
                          ) : (
                            <Pressable
                              onPress={() => { closeFloatingMenus(); setOpenFeeCellKey(`${row.id}:qty`); setFeeDrafts((prev) => ({ ...prev, [`${row.id}:qty`]: String(row.qtyOrdered) })); }}
                              style={{ width: '100%', height: 24, alignItems: 'center', justifyContent: 'center' }}
                            >
                              <Text style={{ color: textPrimaryColor, fontSize: 10.5, fontWeight: '600', textAlign: 'center' }}>{row.qtyOrdered}</Text>
                            </Pressable>
                          )}
                        </View>
                        {([
                          { index: 5, field: 'unitCost' as const, value: row.unitCost },
                          { index: 6, field: 'serviceFee' as const, value: row.serviceFee },
                          { index: 7, field: 'shippingClearanceFee' as const, value: row.shippingFee },
                          { index: 8, field: 'deliveryFee' as const, value: row.localDeliveryFee },
                        ]).map(({ index, field, value }) => {
                          const cellKey = `${row.id}:${field}`;
                          const isEditing = openFeeCellKey === cellKey;
                          const draft = feeDrafts[cellKey] ?? String(value > 0 ? value : '');
                          return (
                            <View key={field} style={tableCellStyle(index, { paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' })}>
                              {isEditing ? (
                                <TextInput
                                  value={draft}
                                  autoFocus
                                  onChangeText={(text) => setFeeDrafts((prev) => ({ ...prev, [cellKey]: text }))}
                                  onBlur={() => {
                                    const parsed = Number(draft.replace(/,/g, '').trim());
                                    const next = Number.isFinite(parsed) && parsed >= 0 ? parsed : value;
                                    onItemFeeChange(row.procurementId, row.itemIndex, field, next);
                                    setFeeDrafts((prev) => { const n = { ...prev }; delete n[cellKey]; return n; });
                                    setOpenFeeCellKey(null);
                                  }}
                                  onSubmitEditing={() => {
                                    const parsed = Number(draft.replace(/,/g, '').trim());
                                    const next = Number.isFinite(parsed) && parsed >= 0 ? parsed : value;
                                    onItemFeeChange(row.procurementId, row.itemIndex, field, next);
                                    setFeeDrafts((prev) => { const n = { ...prev }; delete n[cellKey]; return n; });
                                    setOpenFeeCellKey(null);
                                  }}
                                  keyboardType="numeric"
                                  placeholder="0"
                                  placeholderTextColor={textMutedColor}
                                  style={{ width: '100%', height: 24, color: textPrimaryColor, fontSize: 10.5, fontWeight: '600', textAlign: 'center', borderBottomWidth: 1, borderBottomColor: accentColor }}
                                />
                              ) : (
                                <Pressable onPress={() => { closeFloatingMenus(); setOpenFeeCellKey(cellKey); setFeeDrafts((prev) => ({ ...prev, [cellKey]: String(value > 0 ? value : '') })); }} style={{ width: '100%', height: 24, alignItems: 'center', justifyContent: 'center' }}>
                                  <Text style={{ color: value > 0 ? textPrimaryColor : textMutedColor, fontSize: 10.5, fontWeight: value > 0 ? '600' : '400', textAlign: 'center' }}>{value > 0 ? value.toLocaleString() : '0'}</Text>
                                </Pressable>
                              )}
                            </View>
                          );
                        })}
                        <View style={tableCellStyle(9, { paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: openStatusMenuId === row.id ? 1001 : 1 })}>
                          <Pressable
                            onPress={() => {
                              setOpenActionMenuId(null);
                              setOpenProductMenuId(null);
                              setOpenPoMenuId(null);
                              setOpenStatusMenuId((current) => current === row.id ? null : row.id);
                            }}
                            style={{ alignSelf: 'center' }}
                          >
                            {statusBadge(row.status, true)}
                          </Pressable>
                          {openStatusMenuId === row.id ? (
                            <View
                              style={{
                                position: 'absolute',
                                top: 28,
                                left: 5,
                                width: 150,
                                borderRadius: 8,
                                borderWidth: 1,
                                borderColor: colors.divider,
                                backgroundColor: surfaceColor,
                                overflow: 'hidden',
                                zIndex: 1002,
                              }}
                            >
                              {effectiveStatusOptions.map((option) => statusMenuItem(row, option.name))}
                              <View style={{ height: 1, backgroundColor: colors.divider }} />
                              {statusUtilityMenuItem('New status', () => openStatusEditor('create', row))}
                              {statusUtilityMenuItem('Edit status', () => openStatusEditor('edit', row))}
                            </View>
                          ) : null}
                        </View>
                        <View style={tableCellStyle(10, { alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: openActionMenuId === row.id ? 1001 : 1 })}>
                          <Pressable
                            onPress={() => {
                              setOpenStatusMenuId(null);
                              setOpenProductMenuId(null);
                              setOpenPoMenuId(null);
                              setOpenActionMenuId((current) => current === row.id ? null : row.id);
                            }}
                            style={{ width: 26, height: 24, borderRadius: 6, borderWidth: 1, borderColor: openActionMenuId === row.id ? accentColor : colors.divider, alignItems: 'center', justifyContent: 'center', backgroundColor: openActionMenuId === row.id ? accentSoftColor : 'transparent' }}
                          >
                            <MoreHorizontal size={12} color={textSecondaryColor} strokeWidth={2} />
                          </Pressable>
                          {openActionMenuId === row.id ? (
                            <View
                              style={{
                                position: 'absolute',
                                top: 30,
                                right: 0,
                                width: 132,
                                borderRadius: 8,
                                borderWidth: 1,
                                borderColor: colors.divider,
                                backgroundColor: surfaceColor,
                                overflow: 'hidden',
                                zIndex: 1002,
                              }}
                            >
                              {actionMenuItem('Edit', textPrimaryColor, () => onEdit(row.procurementId, row.itemIndex))}
                              {actionMenuItem('Duplicate', textPrimaryColor, () => onDuplicate(row.procurementId, row.itemIndex))}
                              {actionMenuItem('Move to another PO', textPrimaryColor, () => {
                                setOpenActionMenuId(null);
                                setMoveItemSearch('');
                                setMovingItemRow(row);
                              })}
                              {actionMenuItem('Delete', '#FF5A5F', () => onDelete(row.procurementId, row.itemIndex))}
                            </View>
                          ) : null}
                        </View>
                      </View>
                    ))}

                    <Pressable
                      onPress={() => {
                        closeFloatingMenus();
                        setAddItemOrderSearch('');
                        setShowAddItemOrderPicker(true);
                      }}
                      style={{ height: 44, borderTopWidth: 1, borderTopColor: colors.divider, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 }}
                    >
                      <Plus size={14} color={accentColor} strokeWidth={2.5} />
                      <Text style={{ color: textMutedColor, fontSize: 14 }}>Add item to an existing order</Text>
                    </Pressable>
                  </View>
              </View>
              )}
            </>
          ) : resolvedSection === 'cost-breakdown' ? (
            <>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ flexGrow: 0 }}
                contentContainerStyle={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}
              >
                {procurementDateFilterOptions.map((option) => statusChip(
                  option.label,
                  dateFilter === option.key,
                  () => setDateFilter(option.key)
                ))}
              </ScrollView>

              <View style={{ flexDirection: 'row', flexWrap: isMobile ? 'wrap' : 'nowrap', gap: isMobile ? 10 : 12, marginTop: 16 }}>
                {[
                  { label: 'Total procured', value: formatMoney(costAnalysis.totalProcured), helper: `${costAnalysis.totalQuantity} units`, color: textPrimaryColor },
                  { label: 'Product cost', value: formatMoney(costAnalysis.productCost), helper: `${costAnalysis.productCostPercent}% of total`, color: COST_CATEGORY_COLORS.product },
                  { label: 'Fees & logistics', value: formatMoney(costAnalysis.nonProductFees), helper: `${costAnalysis.feePercent}% of total`, color: COST_CATEGORY_COLORS.logistics },
                  { label: 'Avg cost / unit', value: formatMoney(costAnalysis.avgCostPerUnit), helper: `${costAnalysis.productCount} products tracked`, color: '#C8F061' },
                ].map((card) => (
                  <View key={card.label} style={summaryCardStyle(colors, isMobile)}>
                    <Text style={{ color: textMutedColor, fontSize: 10, fontWeight: '600', marginBottom: 8 }}>{card.label}</Text>
                    <Text style={{ color: card.color, fontSize: 17, lineHeight: 20, fontWeight: '700' }} numberOfLines={1}>{card.value}</Text>
                    <Text style={{ color: textMutedColor, fontSize: 10, fontWeight: '500', marginTop: 8 }} numberOfLines={1}>{card.helper}</Text>
                  </View>
                ))}
              </View>

              <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 14, marginTop: 16 }}>
                <View style={[analyticsPanelStyle(colors), { overflow: 'hidden' }, !isMobile && { flex: 1 }]}>
                  <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
                    <Text style={{ color: textPrimaryColor, fontSize: 13, fontWeight: '700' }}>Fee Type Split</Text>
                    <Text style={{ color: textMutedColor, fontSize: 10, marginTop: 3 }}>Where costs are distributed across categories</Text>
                  </View>
                  {isMobile ? (
                    <View style={{ alignItems: 'center' }}>
                      <Svg width={220} height={220} viewBox="0 0 240 240">
                        <Circle cx={120} cy={120} r={COST_DONUT_RADIUS} stroke={inputColor} strokeWidth={24} fill="none" />
                        {costDonutSegments.map((seg) => (
                          <Circle
                            key={seg.key}
                            cx={120}
                            cy={120}
                            r={COST_DONUT_RADIUS}
                            stroke={seg.color}
                            strokeWidth={24}
                            fill="none"
                            strokeDasharray={`${seg.dashLength} ${COST_DONUT_CIRCUMFERENCE}`}
                            strokeDashoffset={COST_DONUT_CIRCUMFERENCE / 4 + seg.dashOffset}
                          />
                        ))}
                        <SvgText x={120} y={112} textAnchor="middle" fill={dominantCostCategory.color} fontSize="30" fontWeight="700">
                          {dominantCostCategory.percent}%
                        </SvgText>
                        <SvgText x={120} y={134} textAnchor="middle" fill={textMutedColor} fontSize="12">
                          {dominantCostCategory.label.split(' ')[0].toLowerCase()}
                        </SvgText>
                      </Svg>
                      <View style={{ width: '100%', paddingHorizontal: 16, paddingBottom: 16, paddingTop: 4, gap: 14 }}>
                        {costAnalysis.categories.map((category) => (
                          <View key={category.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <View style={{ width: 8, height: 8, borderRadius: 3, backgroundColor: category.color }} />
                            <Text style={{ flex: 1, color: textSecondaryColor, fontSize: 13 }}>{category.label}</Text>
                            <Text style={{ color: textPrimaryColor, fontSize: 13, fontWeight: '600' }}>{formatMoney(category.value)}</Text>
                            <Text style={{ color: textMutedColor, fontSize: 11, width: 36, textAlign: 'right' }}>{category.percent}%</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : (
                    <View style={{ padding: 16 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                          <Svg width={300} height={300} viewBox="0 0 240 240">
                            <Circle cx={120} cy={120} r={COST_DONUT_RADIUS} stroke={inputColor} strokeWidth={24} fill="none" />
                            {costDonutSegments.map((seg) => (
                              <Circle
                                key={seg.key}
                                cx={120}
                                cy={120}
                                r={COST_DONUT_RADIUS}
                                stroke={seg.color}
                                strokeWidth={24}
                                fill="none"
                                strokeDasharray={`${seg.dashLength} ${COST_DONUT_CIRCUMFERENCE}`}
                                strokeDashoffset={COST_DONUT_CIRCUMFERENCE / 4 + seg.dashOffset}
                              />
                            ))}
                            <SvgText x={120} y={112} textAnchor="middle" fill={dominantCostCategory.color} fontSize="30" fontWeight="700">
                              {dominantCostCategory.percent}%
                            </SvgText>
                            <SvgText x={120} y={134} textAnchor="middle" fill={textMutedColor} fontSize="12">
                              {dominantCostCategory.label.split(' ')[0].toLowerCase()}
                            </SvgText>
                          </Svg>
                        </View>
                        <View style={{ flex: 1, gap: 12 }}>
                          {costAnalysis.categories.map((category) => (
                            <View key={category.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <View style={{ width: 8, height: 8, borderRadius: 3, backgroundColor: category.color }} />
                              <Text style={{ flex: 1, color: textSecondaryColor, fontSize: 12 }}>{category.label}</Text>
                              <Text style={{ color: textPrimaryColor, fontSize: 12, fontWeight: '600' }}>{formatMoney(category.value)}</Text>
                              <Text style={{ color: textMutedColor, fontSize: 10, width: 34, textAlign: 'right' }}>{category.percent}%</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    </View>
                  )}
                </View>

                <View style={[analyticsPanelStyle(colors), !isMobile && { flex: 1 }]}>
                  <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: colors.divider, borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: 'hidden' }}>
                    <Text style={{ color: textPrimaryColor, fontSize: 13, fontWeight: '700' }}>Cost Composition per Product</Text>
                    <Text style={{ color: textMutedColor, fontSize: 10, marginTop: 3 }}>How fees stack into each product landed cost</Text>
                  </View>
                  <View style={{ padding: 16, paddingBottom: 24, gap: 12 }}>
                    {(showAllComposition ? costAnalysis.productRows : costAnalysis.productRows.slice(0, 6)).map((row) => {
                      const segmentTotal = Math.max(row.total, 1);
                      return (
                        <View key={row.productName} style={{ gap: 6 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={{ flex: 1, color: textSecondaryColor, fontSize: 12 }} numberOfLines={1}>{row.productName}</Text>
                            <Text style={{ color: textPrimaryColor, fontSize: 11, fontWeight: '600' }}>{formatMoney(row.landedPerUnit)}</Text>
                          </View>
                          <View style={{ height: 18, borderRadius: 6, overflow: 'hidden', backgroundColor: inputColor, flexDirection: 'row', gap: 1 }}>
                            <View style={{ flex: Math.max(0.1, row.product / segmentTotal), backgroundColor: COST_CATEGORY_COLORS.product }} />
                            <View style={{ flex: Math.max(0.1, row.service / segmentTotal), backgroundColor: COST_CATEGORY_COLORS.service }} />
                            <View style={{ flex: Math.max(0.1, row.logistics / segmentTotal), backgroundColor: COST_CATEGORY_COLORS.logistics }} />
                            <View style={{ flex: Math.max(0.1, row.clearance / segmentTotal), backgroundColor: COST_CATEGORY_COLORS.clearance }} />
                            {row.other > 0 ? <View style={{ flex: Math.max(0.1, row.other / segmentTotal), backgroundColor: COST_CATEGORY_COLORS.other }} /> : null}
                          </View>
                        </View>
                      );
                    })}
                    {costAnalysis.productRows.length === 0 ? (
                      <Text style={{ color: textMutedColor, fontSize: 12 }}>No procurement costs in this period.</Text>
                    ) : null}
                    {costAnalysis.productRows.length > 6 ? (
                      <Pressable onPress={() => setShowAllComposition((v) => !v)} style={{ paddingVertical: 8, alignItems: 'center' }}>
                        <Text style={{ color: textMutedColor, fontSize: 12, fontWeight: '600' }}>{showAllComposition ? 'Show less' : `Show ${costAnalysis.productRows.length - 6} more`}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16, paddingBottom: 20 }}>
                    {([
                      { label: 'Product', color: COST_CATEGORY_COLORS.product },
                      { label: 'Service', color: COST_CATEGORY_COLORS.service },
                      { label: 'Logistics', color: COST_CATEGORY_COLORS.logistics },
                      { label: 'Clearance', color: COST_CATEGORY_COLORS.clearance },
                      { label: 'Other', color: COST_CATEGORY_COLORS.other },
                    ] as const).map((item) => (
                      <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 99, backgroundColor: item.color }} />
                        <Text style={{ color: textMutedColor, fontSize: 10 }}>{item.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>

              <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 14, marginTop: 16 }}>
                <View style={[analyticsPanelStyle(colors), !isMobile && { flex: 1 }]}>
                  <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: colors.divider, borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: 'hidden' }}>
                    <Text style={{ color: textPrimaryColor, fontSize: 13, fontWeight: '700' }}>Landed Cost per Unit</Text>
                    <Text style={{ color: textMutedColor, fontSize: 10, marginTop: 3 }}>Total cost to acquire one unit, all fees included</Text>
                  </View>
                  <View style={{ padding: 16, paddingBottom: 36, gap: 12 }}>
                    {costAnalysis.productRows
                      .slice()
                      .sort((a, b) => b.landedPerUnit - a.landedPerUnit)
                      .slice(0, showAllLanded ? undefined : 6)
                      .map((row) => {
                        const max = Math.max(...costAnalysis.productRows.map((item) => item.landedPerUnit), 1);
                        const width = Math.max(4, Math.round((row.landedPerUnit / max) * 100));
                        return (
                          <View key={`${row.productName}-landed`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <Text style={{ color: textSecondaryColor, fontSize: 12, width: isMobile ? 120 : 150 }} numberOfLines={1}>{row.productName}</Text>
                            <View style={{ flex: 1, height: 8, borderRadius: 999, backgroundColor: inputColor, overflow: 'hidden' }}>
                              <View style={{ width: `${width}%`, height: 8, borderRadius: 999, backgroundColor: width > 80 ? '#C8F061' : COST_CATEGORY_COLORS.product }} />
                            </View>
                            <Text style={{ color: textPrimaryColor, fontSize: 11, fontWeight: '600', width: 82, textAlign: 'right' }}>{formatMoney(row.landedPerUnit)}</Text>
                          </View>
                        );
                      })}
                    {costAnalysis.productRows.length > 6 ? (
                      <Pressable onPress={() => setShowAllLanded((v) => !v)} style={{ paddingVertical: 8, alignItems: 'center' }}>
                        <Text style={{ color: textMutedColor, fontSize: 12, fontWeight: '600' }}>{showAllLanded ? 'Show less' : `Show ${costAnalysis.productRows.length - 6} more`}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>

                <View style={[analyticsPanelStyle(colors), !isMobile && { flex: 1 }]}>
                  <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: colors.divider, borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: 'hidden' }}>
                    <Text style={{ color: textPrimaryColor, fontSize: 13, fontWeight: '700' }}>PO Cost Stack</Text>
                    <Text style={{ color: textMutedColor, fontSize: 10, marginTop: 3 }}>Top purchase orders by landed cost</Text>
                  </View>
                  <View style={{ padding: 16, paddingBottom: 24, gap: 12 }}>
                    {(showAllPoStack ? costAnalysis.poRows : costAnalysis.poRows.slice(0, 6)).map((row) => {
                      const segmentTotal = Math.max(row.total, 1);
                      return (
                        <View key={row.poNumber} style={{ gap: 6 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={{ flex: 1, color: textSecondaryColor, fontSize: 12, fontWeight: '600' }}>{row.poNumber}</Text>
                            <Text style={{ color: textPrimaryColor, fontSize: 11, fontWeight: '700' }}>{formatMoney(row.total)}</Text>
                          </View>
                          <View style={{ height: 18, borderRadius: 6, overflow: 'hidden', backgroundColor: inputColor, flexDirection: 'row', gap: 1 }}>
                            <View style={{ flex: Math.max(0.1, row.product / segmentTotal), backgroundColor: COST_CATEGORY_COLORS.product }} />
                            <View style={{ flex: Math.max(0.1, row.service / segmentTotal), backgroundColor: COST_CATEGORY_COLORS.service }} />
                            <View style={{ flex: Math.max(0.1, row.logistics / segmentTotal), backgroundColor: COST_CATEGORY_COLORS.logistics }} />
                            <View style={{ flex: Math.max(0.1, row.clearance / segmentTotal), backgroundColor: COST_CATEGORY_COLORS.clearance }} />
                            {row.other > 0 ? <View style={{ flex: Math.max(0.1, row.other / segmentTotal), backgroundColor: COST_CATEGORY_COLORS.other }} /> : null}
                          </View>
                        </View>
                      );
                    })}
                    {costAnalysis.poRows.length > 6 ? (
                      <Pressable onPress={() => setShowAllPoStack((v) => !v)} style={{ paddingVertical: 8, alignItems: 'center' }}>
                        <Text style={{ color: textMutedColor, fontSize: 12, fontWeight: '600' }}>{showAllPoStack ? 'Show less' : `Show ${costAnalysis.poRows.length - 6} more`}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16, paddingBottom: 20 }}>
                    {([
                      { label: 'Product', color: COST_CATEGORY_COLORS.product },
                      { label: 'Service', color: COST_CATEGORY_COLORS.service },
                      { label: 'Logistics', color: COST_CATEGORY_COLORS.logistics },
                      { label: 'Clearance', color: COST_CATEGORY_COLORS.clearance },
                      { label: 'Other', color: COST_CATEGORY_COLORS.other },
                    ] as const).map((item) => (
                      <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 99, backgroundColor: item.color }} />
                        <Text style={{ color: textMutedColor, fontSize: 10 }}>{item.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>

              <View style={[analyticsPanelStyle(colors), { overflow: 'hidden', marginTop: 16 }]}>
                <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
                  <Text style={{ color: textPrimaryColor, fontSize: 13, fontWeight: '700' }}>Full Cost Table</Text>
                  <Text style={{ color: textMutedColor, fontSize: 10, marginTop: 3 }}>Every fee column per product in this period</Text>
                </View>
                <ScrollView
                  horizontal={isMobile}
                  showsHorizontalScrollIndicator={false}
                  style={{ width: '100%' }}
                  contentContainerStyle={{ width: isMobile ? 860 : '100%' }}
                >
                  <View style={{ width: '100%' }}>
                    <View style={{ flexDirection: 'row', minHeight: 36, backgroundColor: surfaceColor, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
                      {[
                        ['Product', 2],
                        ['Qty', 0.7],
                        ['Unit Cost', 1],
                        ['Service', 1],
                        ['Logistics', 1],
                        ['Clearance', 1],
                        ['Other', 0.9],
                        ['Landed / Unit', 1.2],
                        ['Total Landed', 1.2],
                        ['Fee %', 0.8],
                      ].map(([label, flex]) => (
                        <View key={String(label)} style={{ flex: Number(flex), paddingHorizontal: 10, justifyContent: 'center', alignItems: label === 'Product' ? 'flex-start' : 'flex-end' }}>
                          <Text style={{ color: textMutedColor, fontSize: 8.5, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase' }}>{label}</Text>
                        </View>
                      ))}
                    </View>
                    {costAnalysis.productRows.map((row) => (
                      <View key={`${row.productName}-table`} style={{ flexDirection: 'row', minHeight: 44, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
                        <View style={{ flex: 2, paddingHorizontal: 10, justifyContent: 'center' }}>
                          <Text style={{ color: textPrimaryColor, fontSize: 12 }} numberOfLines={1}>{row.productName}</Text>
                        </View>
                        <View style={{ flex: 0.7, paddingHorizontal: 10, justifyContent: 'center', alignItems: 'flex-end' }}><Text style={{ color: textSecondaryColor, fontSize: 12 }}>{row.qty}</Text></View>
                        <View style={{ flex: 1, paddingHorizontal: 10, justifyContent: 'center', alignItems: 'flex-end' }}><Text style={{ color: textSecondaryColor, fontSize: 12 }}>{formatMoney(row.qty > 0 ? row.product / row.qty : 0)}</Text></View>
                        <View style={{ flex: 1, paddingHorizontal: 10, justifyContent: 'center', alignItems: 'flex-end' }}><Text style={{ color: textSecondaryColor, fontSize: 12 }}>{formatMoney(row.qty > 0 ? row.service / row.qty : 0)}</Text></View>
                        <View style={{ flex: 1, paddingHorizontal: 10, justifyContent: 'center', alignItems: 'flex-end' }}><Text style={{ color: textSecondaryColor, fontSize: 12 }}>{formatMoney(row.qty > 0 ? row.logistics / row.qty : 0)}</Text></View>
                        <View style={{ flex: 1, paddingHorizontal: 10, justifyContent: 'center', alignItems: 'flex-end' }}><Text style={{ color: textSecondaryColor, fontSize: 12 }}>{formatMoney(row.qty > 0 ? row.clearance / row.qty : 0)}</Text></View>
                        <View style={{ flex: 0.9, paddingHorizontal: 10, justifyContent: 'center', alignItems: 'flex-end' }}><Text style={{ color: textSecondaryColor, fontSize: 12 }}>{formatMoney(row.qty > 0 ? row.other / row.qty : 0)}</Text></View>
                        <View style={{ flex: 1.2, paddingHorizontal: 10, justifyContent: 'center', alignItems: 'flex-end' }}><Text style={{ color: textPrimaryColor, fontSize: 12, fontWeight: '700' }}>{formatMoney(row.landedPerUnit)}</Text></View>
                        <View style={{ flex: 1.2, paddingHorizontal: 10, justifyContent: 'center', alignItems: 'flex-end' }}><Text style={{ color: '#C8F061', fontSize: 12, fontWeight: '700' }}>{formatMoney(row.total)}</Text></View>
                        <View style={{ flex: 0.8, paddingHorizontal: 10, justifyContent: 'center', alignItems: 'flex-end' }}>
                          <View style={{ borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: tintColor(row.feePercent > 30 ? '#EF4444' : row.feePercent > 18 ? '#F59E0B' : '#10B981', inputColor) }}>
                            <Text style={{ color: row.feePercent > 30 ? '#EF4444' : row.feePercent > 18 ? '#F59E0B' : '#10B981', fontSize: 10, fontWeight: '700' }}>{row.feePercent}%</Text>
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </View>
            </>
          ) : resolvedSection === 'margin-tracker' ? (
            <>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ flexGrow: 0 }}
                contentContainerStyle={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}
              >
                {procurementDateFilterOptions.map((option) => statusChip(
                  option.label,
                  dateFilter === option.key,
                  () => setDateFilter(option.key)
                ))}
              </ScrollView>

              <View style={{ flexDirection: 'row', flexWrap: isMobile ? 'wrap' : 'nowrap', gap: isMobile ? 10 : 12, marginTop: 16 }}>
                {[
                  { label: 'Portfolio avg margin', value: `${marginAnalysis.averageMargin.toFixed(1)}%`, helper: `Target ${marginAnalysis.averageTarget.toFixed(0)}% · Gap ${marginAnalysis.averageGap >= 0 ? '+' : ''}${marginAnalysis.averageGap.toFixed(1)}pp`, color: marginAnalysis.averageGap >= 0 ? '#C8F061' : '#F59E0B' },
                  { label: 'Products hitting target', value: `${marginAnalysis.hittingCount} / ${marginAnalysis.rows.length}`, helper: `${marginAnalysis.rows.length > 0 ? Math.round((marginAnalysis.hittingCount / marginAnalysis.rows.length) * 100) : 0}% hit rate`, color: '#C8F061' },
                  { label: 'Best margin', value: marginAnalysis.best ? `${marginAnalysis.best.actualMargin.toFixed(1)}%` : '0%', helper: marginAnalysis.best?.productName ?? 'No product yet', color: '#C8F061' },
                  { label: 'Weakest margin', value: marginAnalysis.weakest ? `${marginAnalysis.weakest.actualMargin.toFixed(1)}%` : '0%', helper: marginAnalysis.weakest ? `${Math.abs(Math.min(0, marginAnalysis.weakest.gap)).toFixed(1)}pp below` : 'No product yet', color: '#F59E0B' },
                  { label: 'Total expected profit', value: formatMoney(marginAnalysis.totalExpectedProfit), helper: 'On received or ordered stock', color: marginAnalysis.totalExpectedProfit >= 0 ? '#C8F061' : '#EF4444' },
                ].map((card, index) => (
                  <View key={card.label} style={summaryCardStyle(colors, isMobile, index === 4 ? '100%' : '48.5%')}>
                    <Text style={{ color: textMutedColor, fontSize: 10, fontWeight: '600', marginBottom: 8 }}>{card.label}</Text>
                    <Text style={{ color: card.color, fontSize: 17, lineHeight: 20, fontWeight: '700' }} numberOfLines={1}>{card.value}</Text>
                    <Text style={{ color: textMutedColor, fontSize: 10, fontWeight: '500', marginTop: 8 }} numberOfLines={1}>{card.helper}</Text>
                  </View>
                ))}
              </View>

              <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 14, marginTop: 16 }}>
                <View style={[analyticsPanelStyle(colors), { overflow: 'hidden' }, !isMobile && { flex: 1 }]}>
                  <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
                    <Text style={{ color: textPrimaryColor, fontSize: 13, fontWeight: '700' }}>Target vs Actual Margin</Text>
                    <Text style={{ color: textMutedColor, fontSize: 10, marginTop: 3 }}>Marker line is the target margin for each product</Text>
                  </View>
                  <View style={{ padding: 16, paddingBottom: 32, gap: 16 }}>
                    {marginAnalysis.rows.slice(0, 6).map((row) => {
                      const actualWidth = Math.max(2, Math.min(100, row.actualMargin));
                      const targetLeft = Math.max(0, Math.min(100, row.targetMargin));
                      return (
                        <View key={`${row.id}-margin-gauge`} style={{ gap: 7 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <Text style={{ flex: 1, color: textPrimaryColor, fontSize: 12.5, fontWeight: '600' }} numberOfLines={1}>{row.productName}</Text>
                            <Text style={{ color: row.statusColor, fontSize: 12, fontWeight: '700' }}>{row.actualMargin.toFixed(1)}%</Text>
                            <Text style={{ color: textMutedColor, fontSize: 10 }}>target {row.targetMargin.toFixed(0)}%</Text>
                          </View>
                          <View style={{ height: 10, borderRadius: 999, backgroundColor: inputColor, position: 'relative' }}>
                            <View style={{ width: `${actualWidth}%`, height: 10, borderRadius: 999, backgroundColor: row.statusColor }} />
                            <View style={{ position: 'absolute', left: `${targetLeft}%`, top: -3, width: 2, height: 16, borderRadius: 1, backgroundColor: textMutedColor }} />
                          </View>
                          <Text style={{ color: row.statusColor, fontSize: 10, fontWeight: '600' }}>
                            {row.gap >= 0 ? `+${row.gap.toFixed(1)}pp above target` : `${row.gap.toFixed(1)}pp below target · raise price to ${formatMoney(row.suggestedPrice)}`}
                          </Text>
                        </View>
                      );
                    })}
                    {marginAnalysis.rows.length === 0 ? (
                      <Text style={{ color: textMutedColor, fontSize: 12 }}>No margin data in this period. Add selling prices in Procurement Orders to track margins.</Text>
                    ) : null}
                  </View>
                </View>

                <View style={[analyticsPanelStyle(colors), { flex: 1, overflow: 'visible', zIndex: showMarginWaterfallDropdown ? 30 : 1 }]}>
                  <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: colors.divider, flexDirection: isMobile ? 'column' : 'row', gap: 10, alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between', position: 'relative', zIndex: 40 }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: textPrimaryColor, fontSize: 13, fontWeight: '700' }}>Price → Profit Waterfall</Text>
                      <Text style={{ color: textMutedColor, fontSize: 10, marginTop: 3 }} numberOfLines={1}>
                        {selectedMarginWaterfallRow ? `${selectedMarginWaterfallRow.productName} · ${formatMoney(selectedMarginWaterfallRow.sellingPrice)} selling price` : 'No product selected'}
                      </Text>
                    </View>
                    <View style={{ position: 'relative', width: isMobile ? '100%' : 240, zIndex: 60 }}>
                      <Pressable
                        onPress={() => {
                          closeFloatingMenus();
                          setShowMarginWaterfallDropdown((current) => !current);
                        }}
                        style={{ height: 34, borderRadius: 999, borderWidth: 1, borderColor: colors.divider, backgroundColor: inputColor, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                      >
                        <Text style={{ flex: 1, color: textSecondaryColor, fontSize: 11.5, fontWeight: '600' }} numberOfLines={1}>
                          {selectedMarginWaterfallRow ? selectedMarginWaterfallRow.productName : 'Select product'}
                        </Text>
                        <ChevronDown size={14} color={textMutedColor} strokeWidth={2.4} />
                      </Pressable>
                      {showMarginWaterfallDropdown ? (
                        <View style={{ position: 'absolute', top: 40, left: 0, right: 0, maxHeight: 260, borderRadius: 12, borderWidth: 1, borderColor: colors.divider, backgroundColor: surfaceColor, overflow: 'hidden', zIndex: 100 }}>
                          <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                            {marginWaterfallOptions.map((row) => {
                              const isActive = selectedMarginWaterfallRow?.id === row.id;
                              return (
                                <Pressable
                                  key={`${row.id}-waterfall-option`}
                                  onPress={() => {
                                    setSelectedMarginWaterfallRowId(row.id);
                                    setShowMarginWaterfallDropdown(false);
                                  }}
                                  style={{ minHeight: 44, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.divider, backgroundColor: isActive ? inputColor : surfaceColor }}
                                >
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <Text style={{ flex: 1, color: textPrimaryColor, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>{row.productName}</Text>
                                    <Text style={{ color: row.statusColor, fontSize: 11, fontWeight: '700' }}>{row.actualMargin.toFixed(1)}%</Text>
                                  </View>
                                  <Text style={{ color: row.statusColor, fontSize: 10, marginTop: 3 }} numberOfLines={1}>
                                    {row.gap < 0 ? `${row.gap.toFixed(1)}pp below target` : `+${row.gap.toFixed(1)}pp above target`}
                                  </Text>
                                </Pressable>
                              );
                            })}
                            {marginWaterfallOptions.length === 0 ? (
                              <View style={{ minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' }}>
                                <Text style={{ color: textMutedColor, fontSize: 12 }}>No products with margin data</Text>
                              </View>
                            ) : null}
                          </ScrollView>
                        </View>
                      ) : null}
                    </View>
                  </View>
                  <View style={{ padding: 16, gap: 10 }}>
                    {selectedMarginWaterfallRow ? ([
                      { label: 'Selling Price', value: selectedMarginWaterfallRow.sellingPrice, color: textMutedColor, sign: '' },
                      { label: 'Product Cost', value: selectedMarginWaterfallRow.unitCost, color: COST_CATEGORY_COLORS.product, sign: '-' },
                      { label: 'Service Fee', value: selectedMarginWaterfallRow.serviceFee, color: COST_CATEGORY_COLORS.service, sign: '-' },
                      { label: 'Logistics', value: selectedMarginWaterfallRow.localDeliveryFee, color: COST_CATEGORY_COLORS.logistics, sign: '-' },
                      { label: 'Clearance', value: selectedMarginWaterfallRow.shippingFee, color: COST_CATEGORY_COLORS.clearance, sign: '-' },
                      { label: 'Gross Profit', value: selectedMarginWaterfallRow.profitPerUnit, color: selectedMarginWaterfallRow.statusColor, sign: '' },
                    ]).map((item) => {
                      const max = Math.max(selectedMarginWaterfallRow?.sellingPrice ?? 1, 1);
                      const width = Math.max(4, Math.min(100, (Math.abs(item.value) / max) * 100));
                      return (
                        <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <Text style={{ color: textSecondaryColor, fontSize: 11.5, width: 110 }} numberOfLines={1}>{item.label}</Text>
                          <View style={{ flex: 1, height: 22, borderRadius: 6, backgroundColor: inputColor, overflow: 'hidden' }}>
                            <View style={{ width: `${width}%`, height: 22, borderRadius: 6, backgroundColor: item.color, justifyContent: 'center', paddingHorizontal: 8 }}>
                              <Text style={{ color: item.label === 'Selling Price' ? textPrimaryColor : colors.bg.screen, fontSize: 10, fontWeight: '700' }} numberOfLines={1}>{formatMoney(Math.abs(item.value))}</Text>
                            </View>
                          </View>
                          <Text style={{ color: item.color, fontSize: 11, fontWeight: '700', width: 86, textAlign: 'right' }}>
                            {item.sign}{formatMoney(Math.abs(item.value))}
                          </Text>
                        </View>
                      );
                    }) : (
                      <Text style={{ color: textMutedColor, fontSize: 12 }}>No margin waterfall yet.</Text>
                    )}

                    {selectedMarginWaterfallRow ? (
                      <View style={{ marginTop: 8, borderRadius: 12, backgroundColor: surfaceColor, borderWidth: 1, borderColor: colors.divider, padding: 12 }}>
                        <Text style={{ color: textMutedColor, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 }}>Suggested price</Text>
                        <Text style={{ color: '#C8F061', fontSize: 16, fontWeight: '700', marginTop: 6 }}>{formatMoney(selectedMarginWaterfallRow.suggestedPrice)}</Text>
                        <Text style={{ color: textMutedColor, fontSize: 11, marginTop: 3 }}>To hit {selectedMarginWaterfallRow.targetMargin.toFixed(0)}% target margin</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>

              <View style={[analyticsPanelStyle(colors), { overflow: 'hidden', marginTop: 16 }]}>
                <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
                  <Text style={{ color: textPrimaryColor, fontSize: 13, fontWeight: '700' }}>Full Margin Table</Text>
                  <Text style={{ color: textMutedColor, fontSize: 10, marginTop: 3 }}>Landed cost, selling price, actual vs target, and expected profit</Text>
                </View>
                <ScrollView
                  horizontal={isMobile}
                  showsHorizontalScrollIndicator={false}
                  style={{ width: '100%' }}
                  contentContainerStyle={{ width: isMobile ? 940 : '100%' }}
                >
                  <View style={{ width: '100%' }}>
                    <View style={{ flexDirection: 'row', minHeight: 36, backgroundColor: surfaceColor, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
                      {[
                        ['Product', 2],
                        ['Landed / Unit', 1.15],
                        ['Selling Price', 1.15],
                        ['Profit / Unit', 1.15],
                        ['Target', 0.8],
                        ['Actual', 0.9],
                        ['vs Target', 0.95],
                        ['Qty', 0.7],
                        ['Total Profit', 1.15],
                        ['Status', 0.95],
                      ].map(([label, flex]) => (
                        <View key={String(label)} style={{ flex: Number(flex), paddingHorizontal: 10, justifyContent: 'center', alignItems: label === 'Product' || label === 'Status' ? 'flex-start' : 'flex-end' }}>
                          <Text style={{ color: textMutedColor, fontSize: 8.5, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase' }}>{label}</Text>
                        </View>
                      ))}
                    </View>
                    {marginAnalysis.rows.map((row) => (
                      <View key={`${row.id}-margin-table`} style={{ flexDirection: 'row', minHeight: 46, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
                        <View style={{ flex: 2, paddingHorizontal: 10, justifyContent: 'center' }}><Text style={{ color: textPrimaryColor, fontSize: 12 }} numberOfLines={1}>{row.productName}</Text></View>
                        <View style={{ flex: 1.15, paddingHorizontal: 10, justifyContent: 'center', alignItems: 'flex-end' }}><Text style={{ color: textSecondaryColor, fontSize: 12 }}>{formatMoney(row.landedCost)}</Text></View>
                        <View style={{ flex: 1.15, paddingHorizontal: 10, justifyContent: 'center', alignItems: 'flex-end' }}><Text style={{ color: textSecondaryColor, fontSize: 12 }}>{formatMoney(row.sellingPrice)}</Text></View>
                        <View style={{ flex: 1.15, paddingHorizontal: 10, justifyContent: 'center', alignItems: 'flex-end' }}><Text style={{ color: row.statusColor, fontSize: 12, fontWeight: '700' }}>{formatMoney(row.profitPerUnit)}</Text></View>
                        <View style={{ flex: 0.8, paddingHorizontal: 10, justifyContent: 'center', alignItems: 'flex-end' }}><Text style={{ color: textMutedColor, fontSize: 12 }}>{row.targetMargin.toFixed(0)}%</Text></View>
                        <View style={{ flex: 0.9, paddingHorizontal: 10, justifyContent: 'center', alignItems: 'flex-end' }}>
                          <View style={{ borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: tintColor(row.statusColor, inputColor) }}>
                            <Text style={{ color: row.statusColor, fontSize: 10, fontWeight: '700' }}>{row.actualMargin.toFixed(1)}%</Text>
                          </View>
                        </View>
                        <View style={{ flex: 0.95, paddingHorizontal: 10, justifyContent: 'center', alignItems: 'flex-end' }}><Text style={{ color: row.statusColor, fontSize: 11, fontWeight: '700' }}>{row.gap >= 0 ? '+' : ''}{row.gap.toFixed(1)}pp</Text></View>
                        <View style={{ flex: 0.7, paddingHorizontal: 10, justifyContent: 'center', alignItems: 'flex-end' }}><Text style={{ color: textSecondaryColor, fontSize: 12 }}>{row.profitUnits}</Text></View>
                        <View style={{ flex: 1.15, paddingHorizontal: 10, justifyContent: 'center', alignItems: 'flex-end' }}><Text style={{ color: row.totalProfit >= 0 ? '#C8F061' : '#EF4444', fontSize: 12, fontWeight: '700' }}>{formatMoney(row.totalProfit)}</Text></View>
                        <View style={{ flex: 0.95, paddingHorizontal: 10, justifyContent: 'center', alignItems: 'flex-start' }}>
                          <View style={{ borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: tintColor(row.statusColor, inputColor) }}>
                            <Text style={{ color: row.statusColor, fontSize: 10, fontWeight: '700' }}>{row.status === 'hitting' ? 'Hitting' : row.status === 'below' ? 'Below' : 'Miss'}</Text>
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </View>
            </>
          ) : resolvedSection === 'receive-goods' ? (
            <>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                {procurementDateFilterOptions.map((option) => statusChip(
                  option.label,
                  dateFilter === option.key,
                  () => setDateFilter(option.key)
                ))}
              </View>

              <View style={{ flexDirection: 'row', flexWrap: isMobile ? 'wrap' : 'nowrap', gap: isMobile ? 10 : 12 }}>
                {[
                  { label: 'Pending confirmation', value: `${receiptStats.pendingReceipt}`, helper: 'Product lines unconfirmed', color: '#F59E0B' },
                  { label: 'Outstanding qty', value: `${receiptStats.outstandingQty}`, helper: 'Units still outstanding', color: '#3B82F6' },
                  { label: 'Total received', value: `${receiptStats.totalReceived}`, helper: 'Units confirmed', color: '#10B981' },
                  { label: 'Total units expected', value: `${receiptStats.totalUnitsExpected}`, helper: 'Across active orders', color: textPrimaryColor },
                  { label: 'Discrepancies', value: receiptStats.discrepancyLabel, helper: 'Received minus ordered', color: receiptStats.discrepancyQty === 0 ? textPrimaryColor : '#EF4444' },
                ].map((card, index) => (
                  <View
                    key={card.label}
                    style={summaryCardStyle(colors, isMobile, index === 4 ? '100%' : '48.5%')}
                  >
                    <Text style={{ color: textMutedColor, fontSize: isMobile ? 10 : 8, fontWeight: '600', marginBottom: 8 }}>
                      {card.label}
                    </Text>
                    <Text style={{ color: card.color, fontSize: 16, lineHeight: 18, fontWeight: '700' }} numberOfLines={1}>{card.value}</Text>
                    <Text style={{ color: textMutedColor, fontSize: 10, fontWeight: '500', marginTop: 8 }} numberOfLines={1}>{card.helper}</Text>
                  </View>
                ))}
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: isMobile ? 10 : 8, marginTop: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
                <View style={{ height: isMobile ? 40 : 34, width: isMobile ? undefined : 300, flex: isMobile ? 1 : undefined, minWidth: 0, borderRadius: 999, borderWidth: 1, borderColor: colors.divider, backgroundColor: isMobile ? 'transparent' : outlinedFieldColor, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 }}>
                  <Search size={isMobile ? 15 : 14} color={textMutedColor} strokeWidth={2} />
                  <TextInput
                    value={searchQuery}
                    onFocus={closeFloatingMenus}
                    onChangeText={(text) => {
                      closeFloatingMenus();
                      setSearchQuery(text);
                    }}
                    placeholder="Search PO, product, supplier..."
                    placeholderTextColor={textMutedColor}
                    style={{ flex: 1, marginLeft: 8, color: textPrimaryColor, fontSize: isMobile ? 14 : 12 }}
                  />
                  <SearchClearButton visible={Boolean(searchQuery.trim())} onPress={() => { closeFloatingMenus(); setSearchQuery(''); }} />
                </View>

                <View style={{ position: 'relative' }}>
                  {isMobile && receiptFilterCount > 0 ? (
                    <View style={{ position: 'absolute', top: -6, right: 1, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.bar, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, zIndex: 2 }}>
                      <Text style={{ color: colors.bg.screen, fontSize: 9, fontWeight: '700' }}>{receiptFilterCount > 9 ? '9+' : receiptFilterCount}</Text>
                    </View>
                  ) : null}
                  <Pressable
                    onPress={() => {
                      closeFloatingMenus();
                      if (isMobile) {
                        setShowReceiptFilterSheet(true);
                      } else {
                        setReceiptSort((current) => (
                          current === 'date' ? 'urgency' : current === 'urgency' ? 'progress' : 'date'
                        ));
                      }
                    }}
                    style={{ width: isMobile ? 38 : undefined, height: isMobile ? 38 : 34, borderRadius: 999, borderWidth: 1, borderColor: colors.divider, backgroundColor: isMobile ? 'transparent' : inputColor, paddingHorizontal: isMobile ? 0 : 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}
                  >
                    {isMobile ? <Filter size={16} color={receiptFilterCount > 0 ? colors.bar : colors.text.tertiary} strokeWidth={2} /> : <ArrowDownUp size={13} color={textSecondaryColor} strokeWidth={2} />}
                    {!isMobile ? (
                      <Text style={{ color: textSecondaryColor, fontSize: 12, fontWeight: '500' }}>
                        {receiptSort === 'date' ? 'Date ordered' : receiptSort === 'urgency' ? 'Urgency' : '% received'}
                      </Text>
                    ) : null}
                  </Pressable>
                </View>

                {!isMobile ? (
                  <>
                    {statusChip('All Orders', receiptFilter === 'all', () => setReceiptFilter('all'))}
                    {statusChip('Awaiting', receiptFilter === 'awaiting', () => setReceiptFilter('awaiting'))}
                    {statusChip('Partial', receiptFilter === 'partial', () => setReceiptFilter('partial'))}
                    {statusChip('Complete', receiptFilter === 'complete', () => setReceiptFilter('complete'))}
                  </>
                ) : null}

                {!isMobile ? <View style={{ flex: 1 }} /> : null}

              </View>

              {isMobile ? (
                <Modal
                  visible={showReceiptFilterSheet}
                  transparent
                  animationType="fade"
                  onRequestClose={() => setShowReceiptFilterSheet(false)}
                >
                  <Pressable
                    onPress={() => setShowReceiptFilterSheet(false)}
                    style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.32)', justifyContent: 'flex-end', padding: 12 }}
                  >
                    <Pressable
                      onPress={(event) => event.stopPropagation()}
                      style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.divider, backgroundColor: surfaceColor, padding: 16, gap: 16 }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                        <View>
                          <Text style={{ color: textPrimaryColor, fontSize: 16, fontWeight: mobileOrderStrongWeight }}>Filter & Sort</Text>
                          <Text style={{ color: textMutedColor, fontSize: 12, marginTop: 2 }}>Goods Received</Text>
                        </View>
                        <Pressable
                          onPress={() => setShowReceiptFilterSheet(false)}
                          style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: colors.divider, backgroundColor: inputColor, alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Text style={{ color: textSecondaryColor, fontSize: 16, fontWeight: mobileOrderStrongWeight }}>×</Text>
                        </Pressable>
                      </View>

                      <View style={{ gap: 8 }}>
                        <Text style={{ color: textMutedColor, fontSize: 10, fontWeight: mobileOrderStrongWeight, letterSpacing: 1, textTransform: 'uppercase' }}>Receipt status</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                          {([
                            { key: 'all' as const, label: 'All Orders' },
                            { key: 'awaiting' as const, label: 'Awaiting' },
                            { key: 'partial' as const, label: 'Partial' },
                            { key: 'complete' as const, label: 'Complete' },
                          ]).map((option) => {
                            const isActive = receiptFilter === option.key;
                            return (
                              <Pressable
                                key={option.key}
                                onPress={() => setReceiptFilter(option.key)}
                                style={{ height: 34, borderRadius: 999, borderWidth: isActive ? 0 : 1, borderColor: colors.divider, backgroundColor: isActive ? colors.bar : inputColor, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' }}
                              >
                                <Text style={{ color: isActive ? colors.bg.screen : textSecondaryColor, fontSize: 12, fontWeight: mobileOrderStrongWeight }}>{option.label}</Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>

                      <View style={{ gap: 8 }}>
                        <Text style={{ color: textMutedColor, fontSize: 10, fontWeight: mobileOrderStrongWeight, letterSpacing: 1, textTransform: 'uppercase' }}>Sort</Text>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          {([
                            { key: 'date' as const, label: 'Date' },
                            { key: 'urgency' as const, label: 'Urgency' },
                            { key: 'progress' as const, label: '% received' },
                          ]).map((option) => {
                            const isActive = receiptSort === option.key;
                            return (
                              <Pressable
                                key={option.key}
                                onPress={() => setReceiptSort(option.key)}
                                style={{ flex: 1, height: 38, borderRadius: 10, borderWidth: isActive ? 0 : 1, borderColor: colors.divider, backgroundColor: isActive ? colors.bar : inputColor, alignItems: 'center', justifyContent: 'center' }}
                              >
                                <Text style={{ color: isActive ? colors.bg.screen : textSecondaryColor, fontSize: 12, fontWeight: mobileOrderStrongWeight }}>{option.label}</Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>

                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <Pressable
                          onPress={() => {
                            setReceiptFilter('all');
                            setReceiptSort('date');
                          }}
                          style={{ flex: 1, height: 42, borderRadius: 999, borderWidth: 1, borderColor: colors.divider, alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Text style={{ color: textSecondaryColor, fontSize: 13, fontWeight: mobileOrderStrongWeight }}>Reset</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => setShowReceiptFilterSheet(false)}
                          style={{ flex: 1, height: 42, borderRadius: 999, backgroundColor: colors.bar, alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Text style={{ color: colors.bg.screen, fontSize: 13, fontWeight: mobileOrderStrongWeight }}>Apply</Text>
                        </Pressable>
                      </View>
                    </Pressable>
                  </Pressable>
                </Modal>
              ) : null}

              <View style={{ marginTop: 16, gap: 12 }}>
                {filteredReceiptShipments.length === 0 ? (
                  <View style={{ minHeight: 220, borderRadius: 10, borderWidth: 1, borderColor: colors.divider, backgroundColor: surfaceColor, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                    <Text style={{ color: textPrimaryColor, fontSize: 16, fontWeight: '600' }}>No goods to receive</Text>
                    <Text style={{ color: textMutedColor, fontSize: 12, marginTop: 4 }}>Matching procurement orders will appear here.</Text>
                  </View>
                ) : filteredReceiptShipments.map((shipment, shipmentIndex) => {
                  const isExpanded = expandedShipmentIds.includes(shipment.id) || (expandedShipmentIds.length === 0 && shipmentIndex === 0);
                  const config = getStatusConfig(shipment.status);
                  const isComplete = isReceivedStatus(shipment.status);
                  const hasDraftDiscrepancy = shipment.rows.some((row) => {
                    const nextQuantity = getDraftReceivedQuantity(row);
                    return nextQuantity > 0 && nextQuantity !== row.qtyOrdered;
                  });
                  const showDiscrepancyWarning = shipment.hasDiscrepancy || hasDraftDiscrepancy;

                  return (
                    <View
                      key={shipment.id}
                      style={{
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: colors.divider,
                        borderLeftWidth: 3,
                        borderLeftColor: isComplete ? '#10B981' : shipment.hasDiscrepancy ? '#F59E0B' : colors.divider,
                        backgroundColor: surfaceColor,
                        overflow: 'hidden',
                        opacity: isComplete ? 0.82 : 1,
                      }}
                    >
                      <Pressable
                        onPress={() => toggleShipmentExpanded(shipment.id)}
                        style={{ paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}
                      >
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={{ color: textMutedColor, fontSize: 10.5, fontWeight: '600' }}>{shipment.poNumber}</Text>
                            {statusBadge(shipment.status)}
                          </View>
                          <Text style={{ color: textPrimaryColor, fontSize: 14, fontWeight: '600', marginTop: 4 }} numberOfLines={1}>{shipment.title}</Text>
                          <Text style={{ color: textMutedColor, fontSize: 11, marginTop: 3 }} numberOfLines={1}>
                            Supplier: {shipment.supplier} · Ordered {shipment.dateLabel} · {shipment.linkedOrderCount} linked order{shipment.linkedOrderCount === 1 ? '' : 's'} · {shipment.rows.length} item{shipment.rows.length === 1 ? '' : 's'}
                          </Text>
                        </View>

                        <View style={{ width: 140, alignItems: 'flex-end', gap: 5 }}>
                          <Text style={{ color: textSecondaryColor, fontSize: 11, fontWeight: '600' }}>{shipment.qtyReceived}/{shipment.qtyOrdered} units</Text>
                          <View style={{ width: 120, height: 6, borderRadius: 999, backgroundColor: colors.bg.input, overflow: 'hidden' }}>
                            <View style={{ width: `${shipment.progress}%`, height: 6, borderRadius: 999, backgroundColor: config.text }} />
                          </View>
                        </View>

                        <ChevronDown
                          size={16}
                          color={textMutedColor}
                          strokeWidth={2.4}
                          style={{ transform: [{ rotate: isExpanded ? '180deg' : '0deg' }] }}
                        />
                      </Pressable>

                      {isExpanded ? (
                        <View style={{ borderTopWidth: 1, borderTopColor: colors.divider }}>
                          {showDiscrepancyWarning ? (
                            <View style={{ marginHorizontal: 14, marginTop: 12, borderRadius: 8, borderWidth: 1, borderColor: tintColor('#F59E0B', colors.divider), backgroundColor: tintColor('#F59E0B', inputColor), paddingHorizontal: 10, paddingVertical: 8 }}>
                              <Text style={{ color: '#F59E0B', fontSize: 11, fontWeight: '600' }}>
                                Some items do not match the expected quantity. Confirm the correct received quantities or leave a note before closing the receipt.
                              </Text>
                            </View>
                          ) : null}

                          <View style={{ flexDirection: 'row', minHeight: 32, backgroundColor: surfaceColor, borderBottomWidth: 1, borderBottomColor: colors.divider, marginTop: showDiscrepancyWarning ? 12 : 0 }}>
                            {(isMobile ? ['Product', 'Expected', 'Confirm Qty', 'Action'] : ['Product', 'Ordered', 'Expected', 'Confirm Qty', 'Action', 'QC']).map((label) => (
                              <View
                                key={label}
                                style={{
                                  flex: label === 'Product' ? (isMobile ? 1.7 : 2) : label === 'Confirm Qty' ? 1.25 : 1,
                                  paddingHorizontal: isMobile ? 8 : 10,
                                  justifyContent: 'center',
                                  alignItems: label === 'Product' ? 'flex-start' : (label === 'Action' || label === 'QC') ? 'center' : 'flex-end',
                                }}
                              >
                                <Text style={{ color: textSecondaryColor, fontSize: 8.5, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>{label}</Text>
                              </View>
                            ))}
                          </View>

                          {shipment.rows.map((row) => {
                            const draftQuantity = getDraftReceivedQuantity(row);
                            const draftChanged = draftQuantity !== row.qtyReceived;
                            const rowSaved = confirmedReceiptRowIds.includes(row.id) && !draftChanged;
                            const rowFullyReceived = row.qtyReceived >= row.qtyOrdered && !draftChanged;
                            const hasRowDiscrepancy = (row.qtyReceived > 0 && row.qtyReceived !== row.qtyOrdered)
                              || (draftQuantity > 0 && draftQuantity !== row.qtyOrdered);
                            const savedQcRaw = procurements.find((p) => p.id === row.procurementId)?.items[row.itemIndex]?.qcImageUri;
                            const qcDone = !!savedQcRaw;
                            return (
                              <View
                                key={row.id}
                                style={{ minHeight: 54, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: hasRowDiscrepancy ? 'rgba(239,68,68,0.25)' : colors.divider, backgroundColor: hasRowDiscrepancy ? 'rgba(239,68,68,0.04)' : 'transparent' }}
                              >
                                <Pressable
                                  onPress={() => setReceiptProductPreview(row)}
                                  style={{ flex: isMobile ? 1.7 : 2, paddingHorizontal: isMobile ? 8 : 10, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'stretch' }}
                                >
                                  <View style={{ flex: 1 }}>
                                    <Text style={{ color: textPrimaryColor, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>{row.productName}</Text>
                                    <View style={{ flexDirection: 'row', alignSelf: 'flex-start', gap: 3, marginTop: 3 }}>
                                      {row.sourceTag === 'product' ? (
                                        <View style={{ borderRadius: 999, paddingHorizontal: 5, height: 14, backgroundColor: tintColor('#10B981', inputColor), alignItems: 'center', justifyContent: 'center' }}>
                                          <Text style={{ color: '#10B981', fontSize: 8.5, fontWeight: '600' }}>product</Text>
                                        </View>
                                      ) : null}
                                      {row.sourceTag === 'warehouse' ? (
                                        <View style={{ borderRadius: 999, paddingHorizontal: 5, height: 14, backgroundColor: tintColor('#64748B', inputColor), alignItems: 'center', justifyContent: 'center' }}>
                                          <Text style={{ color: '#64748B', fontSize: 8.5, fontWeight: '600' }}>warehouse</Text>
                                        </View>
                                      ) : null}
                                      {row.isNewProduct ? (
                                        <View style={{ borderRadius: 999, paddingHorizontal: 5, height: 14, backgroundColor: tintColor('#3B82F6', inputColor), alignItems: 'center', justifyContent: 'center' }}>
                                          <Text style={{ color: '#3B82F6', fontSize: 8.5, fontWeight: '600' }}>new product</Text>
                                        </View>
                                      ) : null}
                                      {row.isSample ? (
                                        <View style={{ borderRadius: 999, paddingHorizontal: 5, height: 14, backgroundColor: tintColor('#F59E0B', inputColor), alignItems: 'center', justifyContent: 'center' }}>
                                          <Text style={{ color: '#F59E0B', fontSize: 8.5, fontWeight: '600' }}>sample</Text>
                                        </View>
                                      ) : null}
                                    </View>
                                  </View>
                                  {hasRowDiscrepancy ? <AlertCircle size={14} color="#EF4444" strokeWidth={2.5} /> : null}
                                </Pressable>
                                {!isMobile ? (
                                  <View style={{ flex: 1, paddingHorizontal: 10, alignItems: 'flex-end' }}>
                                    <Text style={{ color: textPrimaryColor, fontSize: 12, fontWeight: '600' }}>{row.qtyOrdered}</Text>
                                  </View>
                                ) : null}
                                <View style={{ flex: 1, paddingHorizontal: isMobile ? 8 : 10, alignItems: 'flex-end' }}>
                                  <Text style={{ color: textSecondaryColor, fontSize: 12 }}>{row.qtyOrdered}</Text>
                                </View>
                                <View style={{ flex: 1.25, paddingHorizontal: isMobile ? 8 : 10, alignItems: 'flex-end' }}>
                                  <TextInput
                                    value={getReceiveNowDraft(row)}
                                    onChangeText={(text) => {
                                      setReceiveNowDrafts((previous) => ({ ...previous, [row.id]: text }));
                                      setConfirmedReceiptRowIds((previous) => previous.filter((rowId) => rowId !== row.id));
                                    }}
                                    keyboardType="number-pad"
                                    placeholder="0"
                                    placeholderTextColor={textMutedColor}
                                    style={{
                                      width: isMobile ? 58 : 72,
                                      height: 30,
                                      borderRadius: 7,
                                      borderWidth: 1,
                                      borderColor: colors.divider,
                                      backgroundColor: colors.bg.input,
                                      color: textPrimaryColor,
                                      paddingHorizontal: 8,
                                      fontSize: 12,
                                      textAlign: 'right',
                                    }}
                                  />
                                </View>
                                <View style={{ flex: 1, paddingHorizontal: isMobile ? 8 : 10, alignItems: 'center' }}>
                                  {(() => {
                                    const btnLabel = rowSaved ? 'Saved' : rowFullyReceived ? 'Confirmed' : draftChanged ? 'Update' : row.qtyReceived > 0 ? 'Confirmed' : 'Confirm';
                                    const btnIsConfirmed = btnLabel === 'Saved' || btnLabel === 'Confirmed';
                                    const btnBg = btnIsConfirmed ? 'rgba(16,185,129,0.15)' : btnLabel === 'Confirm' ? '#3B82F6' : 'rgba(245,158,11,0.15)';
                                    const btnBorder = btnIsConfirmed ? '#10B981' : btnLabel === 'Confirm' ? '#3B82F6' : '#F59E0B';
                                    const btnText = btnIsConfirmed ? '#10B981' : btnLabel === 'Confirm' ? '#fff' : '#F59E0B';
                                    return (
                                      <Pressable
                                        onPress={() => {
                                          if (isMobile) {
                                            openQcModalForRow(row, shipment.id);
                                            return;
                                          }
                                          saveReceiptLine(row);
                                        }}
                                        style={{ width: 72, height: 28, borderRadius: 7, borderWidth: 1, borderColor: btnBorder, backgroundColor: btnBg, alignItems: 'center', justifyContent: 'center' }}
                                      >
                                        <Text style={{ color: btnText, fontSize: 10.5, fontWeight: '700' }}>{btnLabel}</Text>
                                      </Pressable>
                                    );
                                  })()}
                                </View>
                                {!isMobile ? (
                                  <View style={{ flex: 1, paddingHorizontal: 10, alignItems: 'center' }}>
                                    <Pressable
                                      onPress={() => openQcModalForRow(row, shipment.id)}
                                      style={{ width: 72, height: 28, borderRadius: 7, borderWidth: 1, borderColor: qcDone ? '#10B981' : colors.divider, backgroundColor: qcDone ? tintColor('#10B981', inputColor) : 'transparent', alignItems: 'center', justifyContent: 'center' }}
                                    >
                                      <Text style={{ color: qcDone ? '#10B981' : textSecondaryColor, fontSize: 10.5, fontWeight: '600' }}>
                                        {qcDone ? 'Verified' : 'QC'}
                                      </Text>
                                    </Pressable>
                                  </View>
                                ) : null}
                              </View>
                            );
                          })}

                          <View style={{ padding: 12, backgroundColor: surfaceColor, borderTopWidth: 1, borderTopColor: colors.divider, flexDirection: 'row', alignItems: 'stretch', gap: 10 }}>
                            <TextInput
                              value={receiptNotes[shipment.id] ?? ''}
                              onChangeText={(text) => setReceiptNotes((previous) => ({ ...previous, [shipment.id]: text }))}
                              placeholder="Receipt note or discrepancy..."
                              placeholderTextColor={textMutedColor}
                              multiline
                              style={{
                                flex: 1,
                                minHeight: 34,
                                maxHeight: 68,
                                borderRadius: 8,
                                borderWidth: 1,
                                borderColor: colors.divider,
                                backgroundColor: surfaceColor,
                                color: textPrimaryColor,
                                paddingHorizontal: 10,
                                paddingVertical: 8,
                                fontSize: 11,
                              }}
                            />
                            <Pressable
                              onPress={() => saveReceiptShipment(shipment)}
                              style={{ minHeight: 34, borderRadius: 8, backgroundColor: '#111111', paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' }}
                            >
                              <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>Confirm All</Text>
                            </Pressable>
                          </View>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </>
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40 }}>
              <View style={{ width: 460, maxWidth: '100%', borderRadius: 12, borderWidth: 1, borderColor: colors.divider, backgroundColor: surfaceColor, padding: 24 }}>
                <Text style={{ color: textPrimaryColor, fontSize: 22, fontWeight: '600', marginBottom: 6 }}>
                  {resolvedSection === 'suppliers' ? 'Suppliers'
                      : 'Fee Templates'}
                </Text>
                <Text style={{ color: textSecondaryColor, fontSize: 14 }}>
                  This sub-page is now available under Procurement and ready for detailed workflows.
                </Text>
              </View>
            </View>
          )}
      </View>

      <Modal
        visible={receiptProductPreview !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setReceiptProductPreview(null)}
      >
        <Pressable
          onPress={() => setReceiptProductPreview(null)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 18 }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 430,
              maxHeight: '88%',
              borderRadius: 18,
              borderWidth: 1,
              borderColor: colors.divider,
              backgroundColor: surfaceColor,
              overflow: 'hidden',
            }}
          >
            {receiptProductPreview ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={{ height: 240, backgroundColor: inputColor, alignItems: 'center', justifyContent: 'center' }}>
                  {receiptProductPreview.imageUrl ? (
                    <ResolvedAttachmentImage
                      imageUrl={receiptProductPreview.imageUrl}
                      style={{ width: '100%', height: '100%' }}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={{ alignItems: 'center', gap: 8 }}>
                      <Plus size={28} color={textMutedColor} strokeWidth={1.8} />
                      <Text style={{ color: textMutedColor, fontSize: 12 }}>No product image added</Text>
                    </View>
                  )}
                  <Pressable
                    onPress={() => setReceiptProductPreview(null)}
                    style={{ position: 'absolute', top: 12, right: 12, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.62)', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <X size={16} color="#fff" strokeWidth={2.6} />
                  </Pressable>
                </View>

                <View style={{ padding: 18, gap: 14 }}>
                  <View>
                    <Text style={{ color: textPrimaryColor, fontSize: 18, fontWeight: '700' }} numberOfLines={2}>
                      {receiptProductPreview.productName}
                    </Text>
                    <Text style={{ color: textMutedColor, fontSize: 12, marginTop: 4 }} numberOfLines={1}>
                      {receiptProductPreview.poNumber} · {receiptProductPreview.supplier}
                    </Text>
                    <View style={{ flexDirection: 'row', alignSelf: 'flex-start', gap: 5, marginTop: 8 }}>
                      {receiptProductPreview.sourceTag === 'product' ? (
                        <View style={{ borderRadius: 999, paddingHorizontal: 7, height: 18, backgroundColor: tintColor('#10B981', inputColor), alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ color: '#10B981', fontSize: 10, fontWeight: '700' }}>product</Text>
                        </View>
                      ) : null}
                      {receiptProductPreview.sourceTag === 'warehouse' ? (
                        <View style={{ borderRadius: 999, paddingHorizontal: 7, height: 18, backgroundColor: tintColor('#64748B', inputColor), alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ color: '#64748B', fontSize: 10, fontWeight: '700' }}>warehouse</Text>
                        </View>
                      ) : null}
                      {receiptProductPreview.isNewProduct ? (
                        <View style={{ borderRadius: 999, paddingHorizontal: 7, height: 18, backgroundColor: tintColor('#3B82F6', inputColor), alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ color: '#3B82F6', fontSize: 10, fontWeight: '700' }}>new product</Text>
                        </View>
                      ) : null}
                      {receiptProductPreview.isSample ? (
                        <View style={{ borderRadius: 999, paddingHorizontal: 7, height: 18, backgroundColor: tintColor('#F59E0B', inputColor), alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ color: '#F59E0B', fontSize: 10, fontWeight: '700' }}>sample</Text>
                        </View>
                      ) : null}
                      {statusBadge(receiptProductPreview.status)}
                    </View>
                  </View>

                  <View style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.divider, overflow: 'hidden' }}>
                    {[
                      ['Expected qty', String(receiptProductPreview.qtyOrdered)],
                      ['Confirmed qty', String(receiptProductPreview.qtyReceived)],
                      ['Outstanding qty', String(Math.max(0, receiptProductPreview.qtyOrdered - receiptProductPreview.qtyReceived))],
                      ['Unit cost', formatMoney(receiptProductPreview.unitCost)],
                      ['Landed cost / unit', formatMoney(receiptProductPreview.deliveryCost)],
                      ['Expected profit', formatMoney(receiptProductPreview.expectedProfit)],
                    ].map(([label, value], index) => (
                      <View
                        key={label}
                        style={{ minHeight: 40, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.divider }}
                      >
                        <Text style={{ color: textMutedColor, fontSize: 12 }}>{label}</Text>
                        <Text style={{ color: textPrimaryColor, fontSize: 12, fontWeight: '700' }}>{value}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Pressable
                      onPress={() => setReceiptProductPreview(null)}
                      style={{ flex: 1, height: 42, borderRadius: 12, borderWidth: 1, borderColor: colors.divider, backgroundColor: inputColor, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Text style={{ color: textSecondaryColor, fontSize: 13, fontWeight: '700' }}>Close</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        openQcModalForRow(receiptProductPreview, receiptProductPreview.poNumber);
                        setReceiptProductPreview(null);
                      }}
                      style={{ flex: 1, height: 42, borderRadius: 12, backgroundColor: accentColor, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Text style={{ color: colors.bg.screen, fontSize: 13, fontWeight: '800' }}>Open QC</Text>
                    </Pressable>
                  </View>
                </View>
              </ScrollView>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showAddItemOrderPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddItemOrderPicker(false)}
      >
        <Pressable
          onPress={() => setShowAddItemOrderPicker(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 18 }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 430,
              maxHeight: '78%',
              borderRadius: 18,
              borderWidth: 1,
              borderColor: colors.divider,
              backgroundColor: surfaceColor,
              overflow: 'hidden',
            }}
          >
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: colors.divider, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: textPrimaryColor, fontSize: 16, fontWeight: '700' }}>Which order is this item for?</Text>
                <Pressable onPress={() => setShowAddItemOrderPicker(false)} style={{ padding: 4 }}>
                  <X size={18} color={textMutedColor} strokeWidth={2} />
                </Pressable>
              </View>
              <Text style={{ color: textMutedColor, fontSize: 12 }}>
                Pick the existing PO you already created for this batch of goods. The item will be added to it — this will not create a new PO.
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: inputColor, borderRadius: 10, paddingHorizontal: 10, height: 38 }}>
                <Search size={14} color={textMutedColor} strokeWidth={2} />
                <TextInput
                  placeholder="Search PO number, name, or supplier…"
                  placeholderTextColor={textMutedColor}
                  value={addItemOrderSearch}
                  onChangeText={setAddItemOrderSearch}
                  style={{ flex: 1, marginLeft: 8, color: textPrimaryColor, fontSize: 13 }}
                />
                <SearchClearButton visible={Boolean(addItemOrderSearch.trim())} onPress={() => setAddItemOrderSearch('')} />
              </View>
            </View>
            <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
              {addItemOrderOptions.length === 0 ? (
                <View style={{ padding: 24, alignItems: 'center' }}>
                  <Text style={{ color: textMutedColor, fontSize: 13, textAlign: 'center' }}>
                    No existing orders found. Create one with "+ New Order" first, then come back here to add items to it.
                  </Text>
                </View>
              ) : (
                addItemOrderOptions.map((option) => (
                  <Pressable
                    key={option.id}
                    onPress={() => {
                      setShowAddItemOrderPicker(false);
                      onEdit(option.id);
                    }}
                    style={({ pressed }) => ({
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      borderBottomWidth: 1,
                      borderBottomColor: colors.divider,
                      backgroundColor: pressed ? accentSoftColor : 'transparent',
                    })}
                  >
                    <Text style={{ color: textPrimaryColor, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>
                      {option.title || option.poNumber}
                    </Text>
                    <Text style={{ color: textMutedColor, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                      {option.poNumber} · {option.supplier}
                    </Text>
                  </Pressable>
                ))
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={movingItemRow !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setMovingItemRow(null)}
      >
        <Pressable
          onPress={() => setMovingItemRow(null)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 18 }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 430,
              maxHeight: '78%',
              borderRadius: 18,
              borderWidth: 1,
              borderColor: colors.divider,
              backgroundColor: surfaceColor,
              overflow: 'hidden',
            }}
          >
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: colors.divider, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: textPrimaryColor, fontSize: 16, fontWeight: '700' }}>Move "{movingItemRow?.productName}" to which PO?</Text>
                <Pressable onPress={() => setMovingItemRow(null)} style={{ padding: 4 }}>
                  <X size={18} color={textMutedColor} strokeWidth={2} />
                </Pressable>
              </View>
              <Text style={{ color: textMutedColor, fontSize: 12 }}>
                The item moves into the PO you pick and stays visible here. Nothing is deleted.
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: inputColor, borderRadius: 10, paddingHorizontal: 10, height: 38 }}>
                <Search size={14} color={textMutedColor} strokeWidth={2} />
                <TextInput
                  placeholder="Search PO number, name, or supplier…"
                  placeholderTextColor={textMutedColor}
                  value={moveItemSearch}
                  onChangeText={setMoveItemSearch}
                  style={{ flex: 1, marginLeft: 8, color: textPrimaryColor, fontSize: 13 }}
                />
                <SearchClearButton visible={Boolean(moveItemSearch.trim())} onPress={() => setMoveItemSearch('')} />
              </View>
            </View>
            <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
              {moveItemOrderOptions.length === 0 ? (
                <View style={{ padding: 24, alignItems: 'center' }}>
                  <Text style={{ color: textMutedColor, fontSize: 13, textAlign: 'center' }}>
                    No other orders to move this item into.
                  </Text>
                </View>
              ) : (
                moveItemOrderOptions.map((option) => (
                  <Pressable
                    key={option.id}
                    onPress={() => {
                      if (movingItemRow) {
                        onMoveItem(movingItemRow.procurementId, movingItemRow.itemIndex, option.id);
                      }
                      setMovingItemRow(null);
                    }}
                    style={({ pressed }) => ({
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      borderBottomWidth: 1,
                      borderBottomColor: colors.divider,
                      backgroundColor: pressed ? accentSoftColor : 'transparent',
                    })}
                  >
                    <Text style={{ color: textPrimaryColor, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>
                      {option.title || option.poNumber}
                    </Text>
                    <Text style={{ color: textMutedColor, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                      {option.poNumber} · {option.supplier}
                    </Text>
                  </Pressable>
                ))
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={productContextMenu !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setProductContextMenu(null)}
      >
        <Pressable
          onPress={() => setProductContextMenu(null)}
          style={{ flex: 1, backgroundColor: 'transparent' }}
        >
          {productContextMenu ? (
            (() => {
              const left = Math.max(12, productContextMenu.x - 12);
              const preferredTop = Math.max(12, productContextMenu.y - 12);
              const shouldFlipUp = preferredTop + productContextMenuHeight > viewportHeight - 12;
              const top = shouldFlipUp
                ? Math.max(12, productContextMenu.y - productContextMenuHeight + 12)
                : preferredTop;

              return (
                <Pressable
                  onPress={(event) => event.stopPropagation()}
                  style={{
                    position: 'absolute',
                    left,
                    top,
                    width: 220,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: colors.divider,
                    backgroundColor: surfaceColor,
                    overflow: 'hidden',
                    shadowColor: '#000000',
                    shadowOpacity: 0.07,
                    shadowRadius: 8,
                    shadowOffset: { width: 0, height: 4 },
                    elevation: 4,
                  }}
                >
                  {productContextMenuItem('Edit product', () => {
                    const row = productContextMenu.row;
                    setProductContextMenu(null);
                    onEdit(row.procurementId, row.itemIndex);
                  })}
                  {productContextMenuItem('Duplicate product', () => {
                    const row = productContextMenu.row;
                    setProductContextMenu(null);
                    onDuplicate(row.procurementId, row.itemIndex);
                  })}
                  {productContextMenuItem('Rename in table', () => {
                    const row = productContextMenu.row;
                    setProductContextMenu(null);
                    setOpenProductMenuId(row.id);
                    setProductQueries((previous) => ({ ...previous, [row.id]: previous[row.id] ?? row.productName }));
                  })}
                  {productContextMenuItem('Delete product', () => {
                    const row = productContextMenu.row;
                    setProductContextMenu(null);
                    onDelete(row.procurementId, row.itemIndex);
                  }, 'danger', false)}
                </Pressable>
              );
            })()
          ) : null}
        </Pressable>
      </Modal>

      <Modal
        visible={receiveModalRows.length > 0}
        transparent
        animationType="fade"
        onRequestClose={closeReceiveModal}
      >
        <Pressable
          onPress={closeReceiveModal}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 420,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: colors.divider,
              backgroundColor: surfaceColor,
              padding: 20,
              gap: 14,
            }}
          >
            <View>
              <Text style={{ color: textPrimaryColor, fontSize: 20, fontWeight: '700' }}>
                Update Received
              </Text>
              <Text style={{ color: textMutedColor, fontSize: 12, marginTop: 4 }}>
                {receiveModalRows.length === 1
                  ? receiveModalRows[0]?.productName
                  : `${receiveModalRows.length} selected rows`}
              </Text>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={{ color: textMutedColor, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>
                Qty Received
              </Text>
              <TextInput
                value={receiveQuantityDraft}
                onChangeText={setReceiveQuantityDraft}
                keyboardType="number-pad"
                placeholder={receiveModalRows.length > 1 ? 'Leave blank to receive full qty' : '0'}
                placeholderTextColor={textMutedColor}
                style={{
                  height: 44,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.divider,
                  backgroundColor: inputColor,
                  color: textPrimaryColor,
                  paddingHorizontal: 12,
                  fontSize: 14,
                }}
              />
            </View>

            <View style={{ gap: 6 }}>
              <Text style={{ color: textMutedColor, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>
                Date Received
              </Text>
              <TextInput
                value={receiveDateDraft}
                onChangeText={setReceiveDateDraft}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={textMutedColor}
                style={{
                  height: 44,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.divider,
                  backgroundColor: inputColor,
                  color: textPrimaryColor,
                  paddingHorizontal: 12,
                  fontSize: 14,
                }}
              />
            </View>

            <Pressable
              onPress={() => setReceiveSampleDraft((previous) => !previous)}
              style={{
                minHeight: 52,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: receiveSampleDraft ? '#F59E0B' : colors.divider,
                backgroundColor: receiveSampleDraft ? 'rgba(245,158,11,0.08)' : inputColor,
                paddingHorizontal: 12,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: textPrimaryColor, fontSize: 14, fontWeight: '600' }}>
                  Sample / Non-sale
                </Text>
                <Text style={{ color: textMutedColor, fontSize: 11, marginTop: 3 }}>
                  Record receipt without adding to sellable inventory.
                </Text>
              </View>
              <View
                style={{
                  width: 42,
                  height: 24,
                  borderRadius: 999,
                  backgroundColor: receiveSampleDraft ? '#F59E0B' : colors.divider,
                  padding: 3,
                  justifyContent: 'center',
                }}
              >
                <View
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 999,
                    backgroundColor: '#FFFFFF',
                    alignSelf: receiveSampleDraft ? 'flex-end' : 'flex-start',
                  }}
                />
              </View>
            </Pressable>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <Pressable
                onPress={closeReceiveModal}
                style={{ flex: 1, height: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.divider, alignItems: 'center', justifyContent: 'center', backgroundColor: inputColor }}
              >
                <Text style={{ color: textSecondaryColor, fontSize: 14, fontWeight: '600' }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={saveReceivedModal}
                style={{ flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: textPrimaryColor }}
              >
                <Text style={{ color: colors.bg.screen, fontSize: 14, fontWeight: '700' }}>Update</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={Boolean(statusEditor)}
        transparent
        animationType="fade"
        onRequestClose={() => setStatusEditor(null)}
      >
        <Pressable
          onPress={() => setStatusEditor(null)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 380,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: colors.divider,
              backgroundColor: surfaceColor,
              padding: 20,
              gap: 14,
            }}
          >
            <View>
              <Text style={{ color: textPrimaryColor, fontSize: 20, fontWeight: '700' }}>
                {statusEditor?.mode === 'edit' ? 'Edit Status' : 'New Status'}
              </Text>
              <Text style={{ color: textMutedColor, fontSize: 12, marginTop: 4 }}>
                This status will be available in Procurement Orders.
              </Text>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={{ color: textMutedColor, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>
                Status Name
              </Text>
              <TextInput
                value={statusNameDraft}
                onChangeText={setStatusNameDraft}
                autoFocus
                placeholder="Enter status name"
                placeholderTextColor={textMutedColor}
                style={{
                  height: 44,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.divider,
                  backgroundColor: inputColor,
                  color: textPrimaryColor,
                  paddingHorizontal: 12,
                  fontSize: 14,
                }}
              />
            </View>

            <View style={{ gap: 8 }}>
              <Text style={{ color: textMutedColor, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>
                Status Color
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {procurementStatusColorOptions.map((color) => {
                  const isSelected = color.toLowerCase() === statusColorDraft.toLowerCase();
                  return (
                    <Pressable
                      key={color}
                      onPress={() => setStatusColorDraft(color)}
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 15,
                        borderWidth: isSelected ? 2 : 1,
                        borderColor: isSelected ? textPrimaryColor : colors.divider,
                        backgroundColor: color,
                      }}
                    />
                  );
                })}
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <Pressable
                onPress={() => setStatusEditor(null)}
                style={{ flex: 1, height: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.divider, alignItems: 'center', justifyContent: 'center', backgroundColor: inputColor }}
              >
                <Text style={{ color: textSecondaryColor, fontSize: 14, fontWeight: '600' }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={saveStatusEditor}
                style={{ flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: textPrimaryColor }}
              >
                <Text style={{ color: colors.bg.screen, fontSize: 14, fontWeight: '700' }}>Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* QC modal */}
      <Modal
        visible={qcModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => { setQcModal(null); setQcImages([]); setQcCheckedProps([]); setQcCheckedQualityChecks([]); }}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: isMobile ? 'stretch' : 'center', justifyContent: isMobile ? 'flex-start' : 'center', padding: isMobile ? 0 : 20 }}
          onPress={() => { if (qcSaving) return; setQcModal(null); setQcImages([]); setQcCheckedProps([]); setQcCheckedQualityChecks([]); setQcSaveError(''); }}
        >
          <Pressable
            style={{
              width: '100%',
              maxWidth: isMobile ? undefined : 420,
              height: isMobile ? '100%' : undefined,
              maxHeight: isMobile ? undefined : '90%',
              backgroundColor: surfaceColor,
              borderRadius: isMobile ? 0 : 16,
              overflow: 'hidden',
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={{ paddingHorizontal: isMobile ? 18 : 20, paddingTop: isMobile ? 18 : 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.divider, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: textPrimaryColor, fontSize: isMobile ? 21 : 16, fontWeight: '700', marginBottom: 4 }}>Quality Control</Text>
                <Text style={{ color: textMutedColor, fontSize: 13 }} numberOfLines={2}>Confirm quantity received and upload QC evidence for this item.</Text>
              </View>
              <Pressable
                onPress={() => { if (qcSaving) return; setQcModal(null); setQcImages([]); setQcCheckedProps([]); setQcCheckedQualityChecks([]); setQcSaveError(''); }}
                style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.divider, backgroundColor: inputColor, alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={16} color={textSecondaryColor} strokeWidth={2.5} />
              </Pressable>
            </View>

            {qcModal ? (
              <>
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  style={{ flex: isMobile ? 1 : undefined }}
                  contentContainerStyle={{ padding: isMobile ? 18 : 20, paddingBottom: 18 }}
                >
                <View style={{ borderRadius: 10, backgroundColor: inputColor, padding: 12, marginBottom: 16 }}>
                  <Text style={{ color: textPrimaryColor, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{qcModal.row.productName}</Text>
                  <Text style={{ color: textMutedColor, fontSize: 11, marginTop: 3 }}>
                    PO: {qcModal.row.poNumber} · Ordered: {qcModal.row.qtyOrdered}
                  </Text>
                </View>

                <View style={{ height: 160, borderRadius: 12, overflow: 'hidden', backgroundColor: inputColor, borderWidth: 1, borderColor: colors.divider, marginBottom: 16, alignItems: 'center', justifyContent: 'center' }}>
                  {qcModal.row.imageUrl ? (
                    <ResolvedAttachmentImage imageUrl={qcModal.row.imageUrl} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  ) : (
                    <Text style={{ color: textMutedColor, fontSize: 12 }}>No product image</Text>
                  )}
                </View>

                {/* Properties checklist */}
                {(() => {
                  const qcItem = procurements.find((p) => p.id === qcModal.row.procurementId)?.items[qcModal.row.itemIndex];
                  const props = qcItem?.properties ?? [];
                  const checkedCount = props.filter((p) => qcCheckedProps.includes(p)).length;
                  if (props.length === 0) return (
                    <View style={{ borderRadius: 10, backgroundColor: inputColor, borderWidth: 1, borderColor: colors.divider, padding: 12, marginBottom: 16 }}>
                      <Text style={{ color: textMutedColor, fontSize: 12 }}>No product properties defined for this item. Add features in the Procurement Orders panel to verify them here.</Text>
                    </View>
                  );
                  return (
                    <View style={{ marginBottom: 16 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <Text style={{ color: textMutedColor, fontSize: 10, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase' }}>Product properties</Text>
                        <Text style={{ color: checkedCount === props.length ? '#10B981' : textMutedColor, fontSize: 10, fontWeight: '600' }}>{checkedCount}/{props.length} verified</Text>
                      </View>
                      <View style={{ borderRadius: 10, borderWidth: 1, borderColor: colors.divider, overflow: 'hidden' }}>
                        {props.map((prop, pi) => {
                          const checked = qcCheckedProps.includes(prop);
                          return (
                            <Pressable
                              key={prop}
                              onPress={() => setQcCheckedProps((prev) =>
                                checked ? prev.filter((p) => p !== prop) : [...prev, prop]
                              )}
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 11, borderTopWidth: pi === 0 ? 0 : 1, borderTopColor: colors.divider, backgroundColor: checked ? tintColor('#10B981', inputColor) : 'transparent' }}
                            >
                              <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: checked ? '#10B981' : colors.divider, backgroundColor: checked ? '#10B981' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                                {checked ? <Check size={12} color="#fff" strokeWidth={3} /> : null}
                              </View>
                              <Text style={{ flex: 1, color: checked ? textPrimaryColor : textSecondaryColor, fontSize: 13, fontWeight: checked ? '600' : '400' }}>{prop}</Text>
                              {checked ? <Text style={{ color: '#10B981', fontSize: 10, fontWeight: '600' }}>✓</Text> : null}
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  );
                })()}

                <View style={{ marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text style={{ color: textMutedColor, fontSize: 10, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase' }}>Receiving quality</Text>
                    <Text style={{ color: procurementQualityChecks.every((item) => qcCheckedQualityChecks.includes(item)) ? '#10B981' : textMutedColor, fontSize: 10, fontWeight: '600' }}>
                      {procurementQualityChecks.filter((item) => qcCheckedQualityChecks.includes(item)).length}/{procurementQualityChecks.length} checked
                    </Text>
                  </View>
                  <View style={{ borderRadius: 10, borderWidth: 1, borderColor: colors.divider, overflow: 'hidden' }}>
                    {procurementQualityChecks.map((check, index) => {
                      const checked = qcCheckedQualityChecks.includes(check);
                      return (
                        <Pressable
                          key={check}
                          onPress={() => setQcCheckedQualityChecks((prev) => (
                            checked ? prev.filter((item) => item !== check) : [...prev, check]
                          ))}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 11, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.divider, backgroundColor: checked ? tintColor('#10B981', inputColor) : 'transparent' }}
                        >
                          <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: checked ? '#10B981' : colors.divider, backgroundColor: checked ? '#10B981' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                            {checked ? <Check size={12} color="#fff" strokeWidth={3} /> : null}
                          </View>
                          <Text style={{ flex: 1, color: checked ? textPrimaryColor : textSecondaryColor, fontSize: 13, fontWeight: checked ? '600' : '400' }}>{check}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <Text style={{ color: textMutedColor, fontSize: 10, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 }}>QC images <Text style={{ color: textMutedColor, fontWeight: '400', textTransform: 'none' }}>(optional)</Text></Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ flexGrow: 0, marginBottom: 20 }}
                  contentContainerStyle={{ flexDirection: 'row', gap: 8 }}
                >
                  {qcImages.map((uri, idx) => (
                    <View key={`${uri}-${idx}`} style={{ width: 88, height: 88, borderRadius: 10, overflow: 'hidden', position: 'relative' }}>
                      {isPersistedStoragePath(uri) ? (
                        <ResolvedAttachmentImage imageUrl={uri} style={{ width: 88, height: 88 }} resizeMode="cover" />
                      ) : (
                        <Image source={{ uri }} style={{ width: 88, height: 88 }} resizeMode="cover" />
                      )}
                      <Pressable
                        onPress={() => setQcImages((prev) => prev.filter((_, i) => i !== idx))}
                        style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.60)', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <X size={11} color="#fff" strokeWidth={2.5} />
                      </Pressable>
                    </View>
                  ))}
                  <Pressable
                    onPress={async () => {
                      setQcImageLoading(true);
                      try {
                        const uris = await pickMultipleImagesSimple();
                        if (uris.length > 0) setQcImages((prev) => [...prev, ...uris]);
                      } finally {
                        setQcImageLoading(false);
                      }
                    }}
                    style={{ width: 88, height: 88, borderRadius: 10, borderWidth: 1, borderColor: colors.divider, borderStyle: 'dashed', backgroundColor: inputColor, alignItems: 'center', justifyContent: 'center', gap: 4 }}
                  >
                    <Plus size={18} color={textMutedColor} strokeWidth={2} />
                    <Text style={{ color: textMutedColor, fontSize: 10 }}>{qcImageLoading ? '…' : 'Add photos'}</Text>
                  </Pressable>
                </ScrollView>

                <Text style={{ color: textMutedColor, fontSize: 10, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 }}>Confirm quantity</Text>
                <TextInput
                  value={getReceiveNowDraft(qcModal.row)}
                  onChangeText={(text) => {
                    setReceiveNowDrafts((prev) => ({ ...prev, [qcModal.row.id]: text }));
                    setConfirmedReceiptRowIds((prev) => prev.filter((id) => id !== qcModal.row.id));
                  }}
                  keyboardType="number-pad"
                  placeholder={String(qcModal.row.qtyOrdered)}
                  placeholderTextColor={textMutedColor}
                  style={{ height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.bg.input, color: textPrimaryColor, paddingHorizontal: 12, fontSize: 14, marginBottom: 16 }}
                />
                {qcSaveError ? (
                  <Text style={{ color: '#EF4444', fontSize: 11, fontWeight: '600', marginTop: -6, marginBottom: 12 }}>
                    {qcSaveError}
                  </Text>
                ) : null}
                </ScrollView>

                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, paddingHorizontal: isMobile ? 18 : 20, paddingVertical: 14, paddingBottom: isMobile ? 18 : 14, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: surfaceColor }}>
                  <Pressable
                    disabled={qcSaving}
                    onPress={() => { setQcModal(null); setQcImages([]); setQcCheckedProps([]); setQcCheckedQualityChecks([]); setQcSaveError(''); }}
                    style={{ flex: isMobile ? 1 : undefined, height: 44, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.divider, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ color: textSecondaryColor, fontSize: 14, fontWeight: '600' }}>Cancel</Text>
                  </Pressable>
                  {(() => {
                    const row = qcModal.row;
                    const qcItem = procurements.find((p) => p.id === row.procurementId)?.items[row.itemIndex];
                    const props = qcItem?.properties ?? [];
                    const propertiesComplete = props.length === 0 || props.every((prop) => qcCheckedProps.includes(prop));
                    const qualityComplete = procurementQualityChecks.every((check) => qcCheckedQualityChecks.includes(check));
                    const proofAdded = qcImages.length > 0;
                    const canConfirmQc = propertiesComplete && qualityComplete && proofAdded;
                    return (
                      <Pressable
                        disabled={!canConfirmQc || qcSaving}
                        onPress={async () => {
                          if (!canConfirmQc) return;
                          setQcSaving(true);
                          setQcSaveError('');
                          try {
                            const persistedImages = await persistQcImages(row, qcImages);
                            saveReceiptLine(row);
                            if (onSaveQC) {
                              onSaveQC(row.procurementId, row.itemIndex, JSON.stringify(persistedImages), qcCheckedProps, qcCheckedQualityChecks, getDraftReceivedQuantity(row), toInputDate());
                            }
                            setQcModal(null);
                            setQcImages([]);
                            setQcCheckedProps([]);
                            setQcCheckedQualityChecks([]);
                          } catch (error) {
                            console.warn('QC proof upload failed:', error);
                            setQcSaveError('QC image could not be uploaded. Please try again.');
                          } finally {
                            setQcSaving(false);
                          }
                        }}
                        style={{ flex: isMobile ? 1 : undefined, height: 44, paddingHorizontal: 20, borderRadius: 12, backgroundColor: canConfirmQc ? accentColor : inputColor, borderWidth: canConfirmQc ? 0 : 1, borderColor: colors.divider, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Text style={{ color: canConfirmQc ? colors.bg.screen : textMutedColor, fontSize: 14, fontWeight: '700' }}>
                          {qcSaving ? 'Saving...' : proofAdded ? 'Confirm QC' : 'Add proof first'}
                        </Text>
                      </Pressable>
                    );
                  })()}
                </View>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <ProcurementCreateInventoryProductModal
        visible={createProductDraft !== null}
        draft={createProductDraft}
        setDraft={setCreateProductDraft}
        colors={colors}
        productVariables={productVariables}
        availableVariantValuesByType={availableVariantValuesByType}
        onPersistVariantValue={persistVariantValueOption}
        onClose={() => setCreateProductDraft(null)}
        saveDisabled={
          createProductSaving
          || !createProductDraft?.name.trim()
          || !createProductDraft.variants.some((variant) => variant.name.trim())
        }
        saveLabel={createProductSaving ? 'Saving…' : 'Save to Inventory'}
        isMobile={isMobile}
        onSave={async () => {
          if (!createProductDraft) return;
          const name = createProductDraft.name.trim();
          const validVariants = createProductDraft.variants.filter((variant) => variant.name.trim());
          if (!name || !validVariants.length) return;

          validVariants.forEach((variant) => {
            persistVariantValueOption(createProductDraft.variantType, variant.name);
          });

          setCreateProductSaving(true);
          try {
            const createdProduct = await onCreateInventoryProduct({
              name,
              variantType: createProductDraft.variantType.trim() || undefined,
              variants: validVariants.map((variant) => ({
                name: variant.name.trim(),
                price: parseFloat(variant.price.replace(/,/g, '')) || 0,
                imageUri: variant.imageUri ?? null,
              })),
              isNewProduct: createProductDraft.isNewProduct,
              imageUri: createProductDraft.imageUri ?? undefined,
            });
            const rowId = createProductDraft.rowId;
            onProductChange(createProductDraft.procurementId, createProductDraft.itemIndex, {
              productId: createdProduct.productId,
              variantId: createdProduct.variantId,
              variantName: createdProduct.variantName,
              productName: name,
              imageUrl: createdProduct.imageUrl ?? createProductDraft.imageUri ?? undefined,
              isNewProduct: createProductDraft.isNewProduct,
            });
            setProductQueries((prev) => ({ ...prev, [rowId]: name }));
            setCreateProductDraft(null);
            setOpenProductMenuId(null);
          } finally {
            setCreateProductSaving(false);
          }
        }}
      />
    </View>
  );
}
