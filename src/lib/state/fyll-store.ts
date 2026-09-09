import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";
import { storage } from "@/lib/storage";
import { supabaseData } from "@/lib/supabase/data";
import { supabaseSettings } from "@/lib/supabase/settings";
import { capitalizeDisplayLabel } from "@/lib/display-format";
import { findOrderTrackingStageByName, sanitizeOrderStatus, sanitizeOrderStatuses, type OrderTrackingStage } from "@/lib/order-status";
import { syncFyllOrderStatusToWooCommerce } from "@/lib/woocommerce";
import { formatAddressValue, normalizeDeliveryStateValue } from "@/lib/format-address";
import {
  buildOrderQcRequirement,
  DEFAULT_ORDER_QC_REQUIREMENTS,
  sanitizeOrderQcRequirements,
  type OrderQcRequirement,
} from "@/lib/order-qc";

const WEB_PERSIST_PREVIEW_LIMIT = 50;

const removeDataUrisForWebPersist = <T,>(value: T): T => {
  if (typeof value === 'string') {
    return (value.trim().startsWith('data:') ? '' : value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => removeDataUrisForWebPersist(item)) as T;
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const next: Record<string, unknown> = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, nested]) => {
    next[key] = removeDataUrisForWebPersist(nested);
  });
  return next as T;
};

const toWebPersistPreview = <T,>(items: T[], limit = WEB_PERSIST_PREVIEW_LIMIT): T[] => (
  items.slice(0, limit).map((item) => removeDataUrisForWebPersist(item))
);

const sanitizeProductForWebPersist = (product: Product): Product => ({
  ...product,
  variants: (product.variants ?? []).map((variant) => ({
    ...variant,
  })),
});

// Nigeria States
export const NIGERIA_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno',
  'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'Abuja', 'Gombe',
  'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara',
  'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau',
  'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara'
];

// Types
export interface ProductVariable {
  id: string;
  name: string; // e.g., "Color", "Size", "Material"
  values: string[]; // e.g., ["Gold", "Silver", "Matte Black"]
}

export interface ProductVariant {
  id: string;
  sku: string;
  barcode: string;
  variableValues: Record<string, string>; // e.g., { "Color": "Gold" }
  stock: number;
  sellingPrice: number;
  imageUrl?: string; // Optional variant-specific image
  wooCommerceProductId?: string;
  wooCommerceVariationId?: string;
  sourceProductId?: string;
  sourceVariantId?: string;
}

export type ProductType = 'product' | 'service';

export type ServiceVariableType = 'Select' | 'Number' | 'Toggle' | 'Text';
export type ServiceFieldType = 'Text' | 'Date' | 'Time' | 'Number' | 'Price' | 'Select';

export interface ServiceVariableOption {
  value: string;
  amount?: number;
}

export interface ServiceVariable {
  id: string;
  name: string;
  type: ServiceVariableType;
  options?: (string | ServiceVariableOption)[];
  required?: boolean;
  defaultValue?: string;
}

export interface ServiceField {
  id: string;
  label: string;
  type?: ServiceFieldType;
  options?: (string | ServiceVariableOption)[];
  required?: boolean;
  defaultValue?: string;
  value?: string; // legacy fallback
}

export interface Product {
  id: string;
  name: string;
  description: string;
  categories: string[]; // Support multiple categories
  variants: ProductVariant[];
  lowStockThreshold: number;
  createdAt: string;
  productType: ProductType;
  imageUrl?: string; // Optional product image
  createdBy?: string; // Staff name who created the product
  useGlobalStock?: boolean; // true = single stock value, false = per-variant stock
  globalStock?: number; // Optional global stock value when useGlobalStock is true
  serviceTags?: string[];
  serviceUsesGlobalPricing?: boolean; // true = single service price, false = option-based pricing
  serviceVariables?: ServiceVariable[];
  serviceFields?: ServiceField[];
  // New Design tracking
  isNewDesign?: boolean; // Default false
  designYear?: number; // Default current year when isNewDesign is true
  designLaunchedAt?: string; // Auto-set when isNewDesign is first toggled ON
  // Discontinued tracking
  isDiscontinued?: boolean; // Default false - hide from New Order picker when true
  discontinuedAt?: string; // Auto-set when isDiscontinued is first toggled ON
  // Set to 'woocommerce-plugin' by Fyll Store's WooCommerce sync (see
  // api/woocommerce/sync/products.js in the Fyll Store repo) — undefined for
  // products created directly in Ops. Used to hide synced-in products from
  // the main inventory view by default (see inventory/index.tsx
  // showSyncedProducts), so a connected WooCommerce catalog doesn't clutter
  // an already-audited manual inventory.
  catalogSource?: string;
  wooCommerceProductId?: string;
  sourceProductId?: string;
  websiteProductId?: string;
  // Archive: a lighter-weight alternative to Delete/Recycle Bin — keeps the
  // product record fully intact (no snapshot/recycle-bin mechanics) and just
  // hides it from the default inventory view. Meant for cases like "this
  // manual product now has a WooCommerce-synced counterpart, get it out of
  // the way without deleting it." See inventory/index.tsx showHiddenProducts.
  isArchived?: boolean; // Default false
  archivedAt?: string; // Auto-set when isArchived is first toggled ON
}

// Currency settings
export type CurrencyCode = 'NGN' | 'USD' | 'EUR' | 'GBP';

export interface CurrencySettings {
  code: CurrencyCode;
  symbol: string;
  name: string;
}

export const CURRENCIES: Record<CurrencyCode, CurrencySettings> = {
  NGN: { code: 'NGN', symbol: '₦', name: 'Nigerian Naira' },
  USD: { code: 'USD', symbol: '$', name: 'US Dollar' },
  EUR: { code: 'EUR', symbol: '€', name: 'Euro' },
  GBP: { code: 'GBP', symbol: '£', name: 'British Pound' },
};

export const formatCurrency = (amount: number | null | undefined, currencyCode: CurrencyCode = 'NGN'): string => {
  const currency = CURRENCIES[currencyCode];
  const safeAmount = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
  return `${currency.symbol}${safeAmount.toLocaleString()}`;
};

// Custom Service for orders
export interface CustomService {
  id: string;
  name: string;
  defaultPrice: number;
}

export interface OrderTypeTimeline {
  id: string;
  name: string;
  minBusinessDays: number;
  maxBusinessDays: number;
  shippingZoneId?: string | null;
  workflowStatusIds?: string[];
}

export interface ShippingZoneTimeline {
  id: string;
  name: string;
  states: string[];
  shippingFee: number;
  minBusinessDays: number;
  maxBusinessDays: number;
}

export interface OrderTimelineSettings {
  warningThresholdPercent: number;
  defaultOrderType: OrderTypeTimeline;
  orderTypes: OrderTypeTimeline[];
  shippingZones: ShippingZoneTimeline[];
}

// Order Service item
export interface OrderService {
  serviceId: string;
  name: string;
  price: number;
}

// Payment Method
export interface PaymentMethod {
  id: string;
  name: string;
}

export type OrderClassification = 'Sale' | 'PR' | 'Gift';

export const ORDER_CLASSIFICATIONS: OrderClassification[] = ['Sale', 'PR', 'Gift'];

// Logistics Carrier
export interface LogisticsCarrier {
  id: string;
  name: string;
}

// Logistics Info for order
export interface LogisticsInfo {
  carrierId: string;
  carrierName: string;
  trackingNumber: string;
  dispatchDate: string;
  datePickedUp?: string; // Date Picked Up/Shipped
  trackingStage?: OrderTrackingStage;
  stage?: OrderTrackingStage;
  status?: string;
}

// Customer for CRM
export interface Customer {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  defaultAddress: string;
  defaultState: string;
  createdAt: string;
}

// Refund for orders
export interface Refund {
  id: string;
  orderId: string;
  amount: number;
  date: string;
  reason: string;
  proofImageUri?: string;
  createdAt: string;
}

export interface OrderItem {
  productId: string;
  variantId: string;
  quantity: number;
  unitPrice: number;
  productName?: string;
  variantName?: string;
  serviceId?: string;
  serviceVariables?: ServiceOrderVariable[];
  serviceFields?: ServiceOrderField[];
}

// Bank account a business gets paid into for Social Checkout links.
// Firestore-era note doesn't apply here — this is Supabase-backed via the
// generic settings table `payment_accounts` (see src/lib/supabase/settings.ts).
export interface BankAccount {
  id: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  isDefault?: boolean;
}

// A Social Checkout draft — a lightweight, pre-product "checkout link" staff
// generate for DM orders (WhatsApp/Instagram). Can't reuse Order/OrderItem
// because OrderItem.productId/variantId are required; billNote is just the
// pasted DM bill as free text — there's no structured item list at creation
// time. Real product/variant/quantity resolution only happens at review,
// where staff builds `resolvedItems` from scratch by reading the note (see
// social-checkout/[id].tsx). Stored in the `social_checkouts` table (same
// generic id/business_id/data-jsonb shape as `orders`) via supabaseData.
export type SocialCheckoutStatus = 'awaiting_payment' | 'payment_submitted' | 'verified' | 'rejected' | 'cancelled' | 'expired';

export const SOCIAL_CHECKOUT_EXPIRY_MS = 24 * 60 * 60 * 1000;

// 'expired' is never written to the row itself — a draft stays
// 'awaiting_payment' in storage until the customer pays. This derives the
// display status by comparing expiresAt against now, so both the public
// checkout page and staff screens agree without a cron job flipping status.
export function getSocialCheckoutEffectiveStatus(draft: Pick<SocialCheckoutDraft, 'status' | 'expiresAt'>): SocialCheckoutStatus {
  if (draft.status === 'awaiting_payment' && draft.expiresAt && new Date(draft.expiresAt).getTime() < Date.now()) {
    return 'expired';
  }
  return draft.status;
}

export interface SocialCheckoutResolvedItem {
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  quantity: number;
}

export interface SocialCheckoutDraft {
  id: string; // == the shareable link code
  businessId: string;
  status: SocialCheckoutStatus;

  billNote: string;
  amount: number;
  bankAccount: { bankName: string; accountName: string; accountNumber: string };
  createdBy: string;
  createdByUserId: string;
  createdAt: string;
  expiresAt: string;

  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  deliveryAddress?: string;
  deliveryState?: string;
  proofImageUrl?: string;
  submittedAt?: string;

  resolvedItems?: SocialCheckoutResolvedItem[];
  reviewedBy?: string;
  reviewedAt?: string;
  convertedOrderId?: string;
  paymentSubmittedEmailSentAt?: string;
  paymentConfirmedEmailSentAt?: string;
  paymentRejectedEmailSentAt?: string;
  orderCreatedEmailSentAt?: string;
  activityLog?: Array<{
    id: string;
    action: string;
    actor: string;
    createdAt: string;
  }>;
  updatedAt: string;
}

export interface ServiceOrderVariable {
  id: string;
  name: string;
  type: ServiceVariableType;
  value?: string;
  options?: (string | ServiceVariableOption)[];
  required?: boolean;
}

export interface ServiceOrderField {
  id: string;
  label: string;
  type: ServiceFieldType;
  options?: (string | ServiceVariableOption)[];
  value?: string;
  required?: boolean;
}

// Prescription info for orders (internal only)
export interface PrescriptionInfo {
  fileUrl?: string; // Uploaded prescription image/PDF URL
  text?: string; // Manual prescription text entry
  uploadedAt?: string; // Timestamp when prescription was added
  uploadedBy?: string; // User ID/name who uploaded
}

export interface Order {
  id: string;
  orderNumber: string;
  customerTrackingCode?: string;
  websiteOrderReference?: string; // WooCommerce order reference (e.g. WC #10234)
  customerId?: string; // Link to Customer
  customerName: string;
  customerNote?: string;
  customerEmail: string;
  customerPhone: string;
  deliveryState: string;
  deliveryAddress: string;
  items: OrderItem[];
  services: OrderService[];
  additionalCharges: number;
  additionalChargesNote: string;
  deliveryFee: number;
  orderTypeId?: string;
  orderTypeName?: string;
  discountCode?: string; // Discount/promo code applied
  discountAmount?: number; // Discount amount
  paymentMethod: string;
  orderClassification?: OrderClassification;
  logistics?: LogisticsInfo;
  tracking?: {
    trackingStage?: OrderTrackingStage;
    stage?: OrderTrackingStage;
    status?: string;
  };
  trackingStage?: OrderTrackingStage;
  prescription?: PrescriptionInfo; // Prescription details (internal)
  status: string;
  orderStatus?: string;
  source: string; // WhatsApp, Instagram, etc.
  fyllCheckout?: {
    reference?: string;
    amountPaid?: number;
    expectedAmount?: number;
    balanceDue?: number;
  };
  subtotal: number; // Products only
  totalAmount: number; // Grand total
  refund?: Refund; // Refund info if refunded
  fulfillmentStage?: 'pending' | 'processing' | 'completed' | 'cancelled';
  fulfillmentStatus?: string;
  fulfillmentStartedAt?: string;
  fulfillmentTimelineDays?: number;
  fulfillmentOriginalEta?: string;
  fulfillmentEffectiveEta?: string;
  deliveryConfirmationStatus?: 'requested' | 'pending' | 'confirmed';
  deliveryConfirmationRequestedAt?: string;
  deliveryConfirmationConfirmedAt?: string;
  deliveryConfirmationLastResponseAt?: string;
  orderDate: string; // ISO string - the date the order was placed (for stats/grouping)
  createdAt: string;
  updatedAt: string;
  createdBy?: string; // Staff name who created the order
  updatedBy?: string; // Staff name who last updated the order
  activityLog?: OrderActivityEntry[]; // Trail of all staff activity
  qcPhotos?: string[]; // QC proof photos (storage paths)
  qcVerified?: boolean; // QC verified flag
  qcVerifiedBy?: string; // Staff name who verified QC
  qcVerifiedAt?: string; // ISO timestamp when QC was verified
  qcChecklist?: string[]; // Completed QC requirement keys
  qcNote?: string; // QC note/remarks
}

const normalizeOrderAddressFields = <T extends Partial<Order>>(order: T): T => {
  const nextOrder = { ...order };

  if ('deliveryAddress' in nextOrder) {
    nextOrder.deliveryAddress = formatAddressValue((nextOrder as Record<string, unknown>).deliveryAddress);
  }

  if ('deliveryState' in nextOrder) {
    nextOrder.deliveryState = normalizeDeliveryStateValue(
      (nextOrder as Record<string, unknown>).deliveryState,
      (nextOrder as Record<string, unknown>).deliveryAddress
    );
  }

  return nextOrder;
};

const mapTrackingStageToFulfillmentStage = (
  trackingStage: OrderTrackingStage
): NonNullable<Order['fulfillmentStage']> => {
  if (trackingStage === 'cancelled') return 'cancelled';
  if (trackingStage === 'delivered' || trackingStage === 'completed') return 'completed';
  if (trackingStage === 'processing' || trackingStage === 'out-for-delivery') return 'processing';
  return 'pending';
};

const buildSharedOrderTrackingFields = (
  statusName: string,
  statusConfig?: Pick<OrderStatus, 'name' | 'trackingStage'> | null
): Pick<Order, 'tracking' | 'trackingStage' | 'fulfillmentStage' | 'fulfillmentStatus' | 'orderStatus'> => {
  const trackingStage = statusConfig?.trackingStage ?? findOrderTrackingStageByName(statusName, statusConfig ? [statusConfig] : []);

  return {
    tracking: {
      trackingStage,
      stage: trackingStage,
      status: statusName,
    },
    trackingStage,
    fulfillmentStage: mapTrackingStageToFulfillmentStage(trackingStage),
    fulfillmentStatus: statusName,
    orderStatus: statusName,
  };
};

export interface OrderActivityEntry {
  staffName: string;
  action: string; // e.g. "Created order", "Updated status to Shipped"
  date: string; // ISO string
}

export interface ProcurementItem {
  productId: string;
  variantId: string;
  quantity: number;
  costAtPurchase: number;
  productName?: string;
  variantName?: string;
  inventoryProductId?: string;
  quantityReceived?: number;
  unitCost?: number;
  serviceFee?: number;
  deliveryFee?: number;
  shippingClearanceFee?: number;
  additionalFee?: number;
  currentSellingPrice?: number;
  targetMarginPercent?: number;
  expectedProfit?: number;
  landedUnitCost?: number;
  paymentDate?: string;
  status?: string;
  isNewProduct?: boolean;
  imageUrl?: string;
  properties?: string[];
  qcImageUri?: string;
  qcConfirmedAt?: string;
  qcCheckedProperties?: string[];
  qcCheckedQualityChecks?: string[];
  isSample?: boolean;
}

export interface ProcurementAttachment {
  uri: string;
  name: string;
  mimeType?: string;
  storagePath?: string;
  fileSize?: number;
}

export interface Procurement {
  id: string;
  title?: string;
  supplierName: string;
  items: ProcurementItem[];
  totalCost: number;
  notes: string;
  createdAt: string;
  createdBy?: string;
  attachments?: ProcurementAttachment[];
}

export type PartnerBillingCycle = 'manual' | 'weekly' | 'biweekly' | 'monthly';

export interface Partner {
  id: string;
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  notes?: string;
  allowedJobStatuses?: PartnerJobStatus[];
  businessJobStatuses?: PartnerJobStatus[];
  partnerJobStatuses?: PartnerJobStatus[];
  statusColors?: Record<string, { bg: string; text: string }>;
  // How this partner's jobs are grouped for billing in their portal.
  // 'manual' (default when absent) keeps today's behavior: partner picks
  // any unbilled jobs freely. Weekly/biweekly/monthly auto-bucket unbilled
  // jobs into periods so the partner sends one bill per period.
  billingCycle?: PartnerBillingCycle;
  magicLinkToken: string;
  isActive: boolean;
  createdAt: string;
  createdBy?: string;
}

export type PartnerJobStatus = string;

export type PartnerBillStatus = 'pending' | 'approved' | 'rejected' | 'queried' | 'paid';

export interface PartnerJob {
  id: string;
  partnerId: string;
  orderId?: string;
  customerName: string;
  imageUrl?: string;
  itemLabel?: string;
  jobType?: string;
  jobService?: string;
  documentUrl?: string;
  documentName?: string;
  documentMimeType?: string;
  status: PartnerJobStatus;
  amount?: number;
  notes?: string;
  dispatchedAt?: string;
  acceptedAt?: string;
  readyAt?: string;
  collectedAt?: string;
  billedAt?: string;
  // Set once the partner bundles this job into a bill and submits it for
  // business review. Jobs sharing a billId are one bill; billStatus/notes
  // are duplicated across them so business actions can update the whole
  // batch with the same loop used elsewhere in this store.
  billId?: string;
  billStatus?: PartnerBillStatus;
  billSubmittedAt?: string;
  billRespondedAt?: string;
  billRespondedBy?: string;
  billNote?: string;
  billPaidAt?: string;
  // Denormalized from the latest open row in partnerJobIssues, so job lists
  // and the partner portal can flag/hold a job without an extra fetch.
  hasOpenIssue?: boolean;
  createdAt: string;
  createdBy?: string;
}

export type PartnerJobIssueStatus = 'open' | 'resolved';

// A defect/complaint reported by the business against a job it sent to a
// partner. Separate from the general Cases system (which is customer-facing)
// — deliberately simple, no comment thread, just a single report + optional
// resolution note, and it flags the job's payment on hold while open.
export interface PartnerJobIssue {
  id: string;
  partnerId: string;
  jobId: string;
  orderId?: string;
  description: string;
  screenshotUrl?: string;
  status: PartnerJobIssueStatus;
  createdAt: string;
  createdBy?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNote?: string;
}

export type ExpensePaymentStatus = 'draft' | 'partial' | 'paid';

export interface Expense {
  id: string;
  category: string;
  description: string;
  amount: number;
  date: string;
  createdAt: string;
  createdBy?: string; // Staff name who created the expense
  status?: ExpensePaymentStatus;
}

export type OtherIncomeType = 'grant' | 'owner-contribution' | 'loan' | 'other-income';

export interface OtherIncome {
  id: string;
  title: string;
  source: string;
  type: OtherIncomeType;
  amount: number;
  date: string;
  note?: string;
  createdAt: string;
  createdBy?: string;
}

export type ExpenseRequestStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

export type RefundRequestStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'paid' | 'void';

export interface ExpenseRequestReceipt {
  id: string;
  fileName: string;
  storagePath: string;
  mimeType?: string;
  fileSize?: number;
}

export interface ExpenseRequestLineItem {
  id: string;
  label: string;
  amount: number;
  category: string;
  kind: 'base' | 'charge';
  source?: 'manual' | 'system';
}

export interface RefundRequestAttachment {
  id: string;
  fileName: string;
  storagePath: string;
  mimeType?: string;
  fileSize?: number;
}

export interface ExpenseRequest {
  id: string;
  title: string;
  category: string;
  amount: number;
  date: string;
  merchant?: string;
  type: 'one-time' | 'recurring';
  frequency?: string;
  note?: string;
  status: ExpenseRequestStatus;
  submittedByUserId: string;
  submittedByName?: string;
  submittedAt?: string;
  reviewedByUserId?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  approvedExpenseId?: string;
  applyBankCharges?: boolean;
  receipts?: ExpenseRequestReceipt[];
  lineItems?: ExpenseRequestLineItem[];
  createdAt: string;
  updatedAt?: string;
}

export interface RefundRequest {
  id: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  amount: number;
  requestedDate: string;
  reason: string;
  status: RefundRequestStatus;
  refundType: 'full' | 'partial';
  note?: string;
  attachments?: RefundRequestAttachment[];
  proofAttachments?: RefundRequestAttachment[];
  source?: 'order' | 'finance';
  submittedByUserId: string;
  submittedByName?: string;
  submittedAt?: string;
  reviewedByUserId?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  paidAt?: string;
  paidByUserId?: string;
  paidByName?: string;
  paymentReference?: string;
  applyBankCharges?: boolean;
  bankChargeAmount?: number;
  stampDutyAmount?: number;
  totalDebitAmount?: number;
  voidedAt?: string;
  voidedByUserId?: string;
  voidedByName?: string;
  voidReason?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface OrderStatus {
  id: string;
  name: string;
  color: string;
  order: number;
  trackingStage?: OrderTrackingStage;
  wooCommerceStatusSlug?: string;
}

export interface SaleSource {
  id: string;
  name: string;
  icon: string;
}

export interface ExpenseCategory {
  id: string;
  name: string;
}

export interface FinanceSupplier {
  id: string;
  name: string;
  contactName?: string;
  email?: string;
  paymentTerms?: string;
}

export interface ProcurementStatusOption {
  id: string;
  name: string;
  order: number;
  color?: string;
}

export type FixedCostFrequency = 'Monthly' | 'Quarterly' | 'Yearly';

export interface FixedCostSetting {
  id: string;
  name: string;
  category: string;
  amount: number;
  frequency: FixedCostFrequency;
  supplierName?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface SalaryTemplateLine {
  id: string;
  employeeName: string;
  amount: number;
}

export interface SalaryTemplate {
  id: string;
  name: string;
  category: string;
  lines: SalaryTemplateLine[];
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export type WarehouseCountFrequency = 'Monthly' | 'Bi-Monthly';

export interface WarehouseCountEntry {
  id: string;
  quantity: number;
  countedAt: string;
  countedBy?: string;
  notes?: string;
}

export interface WarehouseItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  imageUrl?: string;
  currentStock: number;
  reorderLevel?: number;
  countFrequency: WarehouseCountFrequency;
  lastCountedAt?: string;
  lastCountedBy?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
  countHistory?: WarehouseCountEntry[];
}

export interface WarehouseCategoryOption {
  id: string;
  name: string;
}

export interface WarehouseUnitOption {
  id: string;
  name: string;
}

export interface BankChargeTier {
  id: string;
  maxAmount: number | null; // null = catch-all "over previous tier"
  fixedFee: number;
}

export interface RevenueRule {
  id: string;
  name: string;        // e.g. "Paystack", "Flutterwave"
  channel: string;     // "All Payment Methods" or matches order.paymentMethod
  percentFee: number;  // e.g. 1.5 means 1.5%
  flatFee: number;     // e.g. 100 means ₦100 flat
  enabled: boolean;
}

export interface FinanceRules {
  vatRate: number; // e.g. 0.075 = 7.5%
  bankChargeTiers: BankChargeTier[];
  revenueRules: RevenueRule[];
  incomingStampDuty: number; // ₦50 bank debit on every incoming credit (CBN stamp duty)
}

export interface OrderAutomationRule {
  id: string;
  enabled: boolean;
  fromStatus: string;
  toStatus: string;
  afterDays: number;
}

export interface AuditLogItem {
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  expectedStock: number;
  actualStock: number;
  discrepancy: number;
}

export interface AuditLogActivityChange {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  previousExpectedStock?: number;
  nextExpectedStock?: number;
  previousActualStock: number;
  nextActualStock: number;
  previousDiscrepancy: number;
  nextDiscrepancy: number;
}

export interface AuditLogActivity {
  id: string;
  action: string;
  performedBy?: string;
  createdAt: string;
  changes: AuditLogActivityChange[];
}

export interface AuditLog {
  id: string;
  month: number; // 0-11
  year: number;
  itemsAudited: number;
  discrepancies: number;
  completedAt: string;
  performedBy?: string;
  scope?: 'products' | 'warehouse';
  items: AuditLogItem[];
  activityLog?: AuditLogActivity[];
}

export interface RestockLog {
  id: string;
  productId: string;
  variantId: string;
  quantityAdded: number;
  previousStock: number;
  newStock: number;
  timestamp: string;
  performedBy?: string;
  sourceType?: 'manual_restock' | 'procurement_receipt';
  sourceLabel?: string;
  note?: string;
  procurementId?: string;
  procurementItemIndex?: number;
}

// Case Types for FYLL Cases feature
export type CaseType = 'Repair' | 'Replacement' | 'Refund' | 'Partial Refund' | 'Return' | 'Goodwill' | 'Other';
export type CaseStatus = string;
export type CasePriority = 'Critical' | 'High' | 'Medium' | 'Low';
export type CaseSource = 'Email' | 'Phone' | 'Chat' | 'Web' | 'In-Store' | 'Other';

// Case timeline entry for audit history
export interface CaseTimelineEntry {
  id: string;
  date: string; // ISO timestamp
  action: string; // e.g., "Status changed to Under Review", "Note added: ..."
  user: string; // Who performed the action
}
export interface CaseAttachment {
  id: string;
  label: string;
  uri: string;
  preview?: string;
  description?: string;
  uploadedAt: string;
}
export interface CaseStatusOption {
  id: string;
  name: string;
  color: string;
  description?: string;
  order?: number;
}

export interface ResolutionTypeOption {
  id: string;
  name: string;
  description?: string;
  order?: number;
}

export type ResolutionType = string;

export interface CaseResolution {
  type: ResolutionType;
  notes: string;
  value?: number; // For refund/credit amount
  resolvedAt: string; // ISO timestamp
  resolvedBy?: string; // Staff name
}

export interface Case {
  id: string;
  caseNumber: string; // Auto-generated like "CASE-001234"
  returnId?: string; // Optional - linked return workflow
  orderId?: string; // Optional - linked order (standalone cases may not have one)
  orderNumber?: string; // Denormalized for display
  customerId?: string; // Optional - linked customer
  customerName: string; // Denormalized for display
  type: CaseType;
  status: CaseStatus;
  priority?: CasePriority; // Critical, High, Medium, Low
  assignedTo?: string; // Optional staff name assigned to this case
  source?: CaseSource; // Email, Phone, Chat, Web, In-Store, Other
  issueSummary: string; // Short description
  originalCustomerMessage?: string; // Full customer complaint/message
  resolution?: CaseResolution;
  attachments?: CaseAttachment[];
  timeline?: CaseTimelineEntry[]; // Audit history of all actions
  createdAt: string;
  updatedAt: string;
  createdBy?: string; // Staff name who created
  updatedBy?: string; // Staff name who last updated
}

export const CASE_TYPES: CaseType[] = [
  'Repair',
  'Replacement',
  'Refund',
  'Return',
  'Goodwill',
  'Other'
];

export type ReturnReason = 'wrong_item' | 'damaged' | 'changed_mind' | 'other';
export type ReturnResolution = 'refund' | 'exchange';
export type ReturnStatus = 'initiated' | 'picked_up' | 'received' | 'processed';
export type ReturnShippingPayer = 'seller' | 'customer';

export interface ReturnNote {
  id: string;
  text: string;
  createdAt: string;
  createdBy: string;
}

export interface ReturnActivityEntry {
  id: string;
  date: string;
  action: string;
  user: string;
}

export interface ReturnRequest {
  id: string;
  ref: string;
  caseId?: string;
  orderId: string;
  orderNumber: string;
  customerId?: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  itemSummary?: string;
  reason: ReturnReason;
  otherReason?: string;
  resolution: ReturnResolution;
  shippingPayer: ReturnShippingPayer;
  status: ReturnStatus;
  notes?: string;
  returnNotes?: ReturnNote[];
  activity?: ReturnActivityEntry[];
  customerMessage?: string;
  proofImages?: string[];
  returnReceivedEmailSentAt?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

export const RETURN_REASONS: Array<{ value: ReturnReason; label: string; description: string }> = [
  { value: 'wrong_item', label: 'Wrong item received', description: 'Seller covers return shipping.' },
  { value: 'damaged', label: 'Item arrived damaged', description: 'Seller covers return shipping.' },
  { value: 'changed_mind', label: 'Changed mind', description: 'Customer covers return shipping.' },
  { value: 'other', label: 'Other reason', description: 'Customer covers return shipping.' },
];

export const RETURN_RESOLUTIONS: Array<{ value: ReturnResolution; label: string }> = [
  { value: 'refund', label: 'Refund' },
  { value: 'exchange', label: 'Exchange' },
];

export const RETURN_STATUSES: Array<{ value: ReturnStatus; label: string }> = [
  { value: 'initiated', label: 'Return initiated' },
  { value: 'picked_up', label: 'Return picked up' },
  { value: 'received', label: 'Return received' },
  { value: 'processed', label: 'Refund / exchange processed' },
];

export const getReturnShippingPayer = (reason: ReturnReason): ReturnShippingPayer => (
  reason === 'wrong_item' || reason === 'damaged' ? 'seller' : 'customer'
);

export const CASE_PRIORITIES: CasePriority[] = ['Critical', 'High', 'Medium', 'Low'];

export const CASE_PRIORITY_COLORS: Record<CasePriority, string> = {
  'Critical': '#DC2626', // Red
  'High': '#F59E0B', // Amber
  'Medium': '#3B82F6', // Blue
  'Low': '#6B7280', // Gray
};

export const CASE_SOURCES: CaseSource[] = ['Email', 'Phone', 'Chat', 'Web', 'Other'];
export const CASE_STATUS_COLORS: Record<string, string> = {
  'Open': '#3B82F6', // Blue
  'Under Review': '#F59E0B', // Amber
  'Awaiting Customer': '#8B5CF6', // Purple
  'Awaiting Internal Action': '#F97316', // Orange
  'Resolved': '#10B981', // Green
  'Closed': '#6B7280', // Gray
};

export const DEFAULT_CASE_STATUS_OPTIONS: CaseStatusOption[] = [
  {
    id: 'case-status-open',
    name: 'Open',
    color: CASE_STATUS_COLORS['Open'],
    description: 'New cases waiting for review',
    order: 1,
  },
  {
    id: 'case-status-under-review',
    name: 'Under Review',
    color: CASE_STATUS_COLORS['Under Review'],
    description: 'Case is being investigated internally',
    order: 2,
  },
  {
    id: 'case-status-awaiting-customer',
    name: 'Awaiting Customer',
    color: CASE_STATUS_COLORS['Awaiting Customer'],
    description: 'Waiting on customer for more info',
    order: 3,
  },
  {
    id: 'case-status-awaiting-team',
    name: 'Awaiting Internal Action',
    color: CASE_STATUS_COLORS['Awaiting Internal Action'],
    description: 'Requires action from our team',
    order: 4,
  },
  {
    id: 'case-status-resolved',
    name: 'Resolved',
    color: CASE_STATUS_COLORS['Resolved'],
    description: 'Issue has been resolved with customer',
    order: 5,
  },
  {
    id: 'case-status-closed',
    name: 'Closed',
    color: CASE_STATUS_COLORS['Closed'],
    description: 'Case archived or closed after follow-up',
    order: 6,
  },
];

export const RESOLUTION_TYPES: ResolutionType[] = [
  'Refund Issued',
  'Credit Applied',
  'Replacement Sent',
  'Repair Completed',
  'No Action Required',
  'Other'
];

export type UserRole = 'owner' | 'staff';
export type ThemeMode = 'system' | 'light' | 'dark';
export type DeletedEntityType =
  | 'customer'
  | 'product'
  | 'order'
  | 'procurement'
  | 'procurement-item'
  | 'expense'
  | 'other-income'
  | 'expense-request'
  | 'refund-request'
  | 'case'
  | 'return'
  | 'partner'
  | 'partner-job';

export interface DeletedItem {
  id: string;
  entityId: string;
  entityType: DeletedEntityType;
  label: string;
  deletedAt: string;
  data: unknown;
  parentId?: string;
  parentLabel?: string;
}

interface FyllStore {
  // Sync state
  isBackgroundSyncing: boolean;
  lastDataSyncAt: string | null;
  lastFullDataSyncAt: string | null;
  setIsBackgroundSyncing: (value: boolean) => void;
  setDataSyncTimestamps: (timestamps: { lastDataSyncAt?: string | null; lastFullDataSyncAt?: string | null }) => void;

  // Theme
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;

  // User
  userRole: UserRole;
  setUserRole: (role: UserRole) => void;

  // Global Low Stock Threshold
  useGlobalLowStockThreshold: boolean;
  globalLowStockThreshold: number;
  setUseGlobalLowStockThreshold: (use: boolean) => void;
  setGlobalLowStockThreshold: (threshold: number) => void;
  getEffectiveLowStockThreshold: (product: Product) => number;

  // Order Auto-Completion
  autoCompleteOrders: boolean;
  autoCompleteAfterDays: number;
  autoCompleteFromStatus: string;
  autoCompleteToStatus: string;
  orderAutomations: OrderAutomationRule[];
  deliveryFollowUpEnabled: boolean;
  deliveryFollowUpDelayDays: number;
  deliveryFollowUpResendDays: number;
  deliveryFollowUpFromName: string;
  orderStatusEmailEnabled: boolean;
  setAutoCompleteOrders: (enabled: boolean) => void;
  setAutoCompleteAfterDays: (days: number) => void;
  setAutoCompleteFromStatus: (status: string) => void;
  setAutoCompleteToStatus: (status: string) => void;
  setOrderAutomations: (rules: OrderAutomationRule[]) => void;
  addOrderAutomation: (rule?: Partial<OrderAutomationRule>) => void;
  updateOrderAutomation: (id: string, updates: Partial<OrderAutomationRule>) => void;
  deleteOrderAutomation: (id: string) => void;
  setDeliveryFollowUpEnabled: (enabled: boolean) => void;
  setDeliveryFollowUpDelayDays: (days: number) => void;
  setDeliveryFollowUpResendDays: (days: number) => void;
  setDeliveryFollowUpFromName: (value: string) => void;
  setOrderStatusEmailEnabled: (enabled: boolean) => void;

  // Global Categories
  categories: string[];
  addCategory: (category: string) => void;
  updateCategory: (previous: string, next: string) => void;
  deleteCategory: (category: string, businessId?: string | null) => void;
  saveGlobalSettings: (businessId?: string | null) => Promise<{ success: boolean; error?: string }>;

  // Customers (CRM)
  customers: Customer[];
  addCustomer: (customer: Customer, businessId?: string | null) => Promise<void>;
  updateCustomer: (id: string, customer: Partial<Customer>) => void;
  deleteCustomer: (id: string, businessId?: string | null) => void;

  // Products
  products: Product[];
  productVariables: ProductVariable[];
  addProduct: (product: Product, businessId?: string | null) => Promise<void>;
  addProductsBulk: (products: Product[], businessId?: string | null) => Promise<void>;
  updateProduct: (id: string, product: Partial<Product>, businessId?: string | null) => Promise<void>;
  deleteProduct: (id: string, businessId?: string | null) => Promise<void>;
  addProductVariable: (variable: ProductVariable) => void;
  updateProductVariable: (id: string, variable: Partial<ProductVariable>) => void;
  deleteProductVariable: (id: string, businessId?: string | null) => void;
  updateVariantStock: (productId: string, variantId: string, delta: number, businessId?: string | null) => Promise<void>;
  addProductVariant: (productId: string, variant: ProductVariant) => void;
  updateProductVariant: (productId: string, variantId: string, variant: Partial<ProductVariant>) => void;
  deleteProductVariant: (productId: string, variantId: string) => void;

  // Restock Logs
  restockLogs: RestockLog[];
  addRestockLog: (log: Omit<RestockLog, 'id' | 'timestamp'>) => void;
  getRestockLogsForVariant: (productId: string, variantId: string, limit?: number) => RestockLog[];
  recordInventoryStockMovement: (
    movements: Array<{
      productId: string;
      variantId: string;
      quantityDelta: number;
      performedBy?: string;
      sourceType?: RestockLog['sourceType'];
      sourceLabel?: string;
      note?: string;
      procurementId?: string;
      procurementItemIndex?: number;
    }>,
    businessId?: string | null
  ) => Promise<void>;
  restockVariant: (productId: string, variantId: string, quantity: number, performedBy?: string, businessId?: string | null) => Promise<void>;

  // Warehouse (simplified stock counting)
  warehouseItems: WarehouseItem[];
  warehouseCategories: WarehouseCategoryOption[];
  warehouseUnits: WarehouseUnitOption[];
  addWarehouseItem: (item: WarehouseItem, businessId?: string | null) => void;
  updateWarehouseItem: (id: string, updates: Partial<WarehouseItem>, businessId?: string | null) => void;
  deleteWarehouseItem: (id: string, businessId?: string | null) => void;
  recordWarehouseCount: (
    id: string,
    payload: { quantity: number; countedAt?: string; countedBy?: string; notes?: string },
    businessId?: string | null
  ) => void;
  addWarehouseCategory: (name: string, businessId?: string | null) => void;
  updateWarehouseCategory: (id: string, name: string, businessId?: string | null) => void;
  deleteWarehouseCategory: (id: string, businessId?: string | null) => void;
  addWarehouseUnit: (name: string, businessId?: string | null) => void;
  deleteWarehouseUnit: (id: string, businessId?: string | null) => void;

  // Orders
  orders: Order[];
  orderStatuses: OrderStatus[];
  qcChecklistRequirements: OrderQcRequirement[];
  saleSources: SaleSource[];
  addOrder: (order: Order, businessId?: string | null) => Promise<void>;
  updateOrder: (id: string, order: Partial<Order>, businessId?: string | null) => Promise<void>;
  cancelOrder: (id: string, businessId?: string | null, cancelledBy?: string) => Promise<void>;
  deleteOrder: (id: string, businessId?: string | null) => Promise<void>;
  addOrderStatus: (status: OrderStatus) => void;
  updateOrderStatus: (id: string, status: Partial<OrderStatus>) => void;
  reorderOrderStatuses: (orderedIds: string[]) => void;
  deleteOrderStatus: (id: string, businessId?: string | null) => void;
  addQcChecklistRequirement: (label: string) => void;
  deleteQcChecklistRequirement: (key: string) => void;
  resetQcChecklistRequirements: () => void;
  addSaleSource: (source: SaleSource) => void;
  updateSaleSource: (id: string, source: Partial<SaleSource>) => void;
  deleteSaleSource: (id: string, businessId?: string | null) => void;

  // Custom Services
  customServices: CustomService[];
  orderTimelineSettings: OrderTimelineSettings;
  addCustomService: (service: CustomService) => void;
  updateCustomService: (id: string, service: Partial<CustomService>) => void;
  deleteCustomService: (id: string, businessId?: string | null) => void;
  updateOrderTimelineSettings: (settings: OrderTimelineSettings) => void;
  saveOrderTimelineSettings: (
    settings: OrderTimelineSettings,
    businessId?: string | null
  ) => Promise<{ success: boolean; error?: string }>;

  // Payment Methods
  paymentMethods: PaymentMethod[];
  addPaymentMethod: (method: PaymentMethod) => void;
  updatePaymentMethod: (id: string, method: Partial<PaymentMethod>, businessId?: string | null) => void;
  bulkRenameOrderPaymentMethod: (fromName: string, toName: string, businessId?: string | null) => void;
  deletePaymentMethod: (id: string, businessId?: string | null) => void;

  // Logistics Carriers
  logisticsCarriers: LogisticsCarrier[];
  addLogisticsCarrier: (carrier: LogisticsCarrier) => void;
  updateLogisticsCarrier: (id: string, carrier: Partial<LogisticsCarrier>) => void;
  deleteLogisticsCarrier: (id: string, businessId?: string | null) => void;

  // Procurement
  procurements: Procurement[];
  addProcurement: (procurement: Procurement, businessId?: string | null) => void;
  updateProcurement: (id: string, procurement: Partial<Procurement>, businessId?: string | null) => void;
  deleteProcurement: (id: string, businessId?: string | null) => void;

  partners: Partner[];
  addPartner: (partner: Partner, businessId?: string | null) => void;
  updatePartner: (id: string, partner: Partial<Partner>, businessId?: string | null) => void;
  deletePartner: (id: string, businessId?: string | null) => void;

  partnerJobs: PartnerJob[];
  addPartnerJob: (job: PartnerJob, businessId?: string | null) => void;
  updatePartnerJob: (id: string, job: Partial<PartnerJob>, businessId?: string | null) => void;
  deletePartnerJob: (id: string, businessId?: string | null) => void;

  partnerJobIssues: PartnerJobIssue[];
  addPartnerJobIssue: (issue: PartnerJobIssue, businessId?: string | null) => Promise<void>;
  updatePartnerJobIssue: (id: string, issue: Partial<PartnerJobIssue>, businessId?: string | null) => void;

  // Expenses
  expenses: Expense[];
  otherIncomes: OtherIncome[];
  expenseRequests: ExpenseRequest[];
  refundRequests: RefundRequest[];
  expenseCategories: ExpenseCategory[];
  financeSuppliers: FinanceSupplier[];
  procurementStatusOptions: ProcurementStatusOption[];
  fixedCosts: FixedCostSetting[];
  salaryTemplates: SalaryTemplate[];
  addExpense: (expense: Expense, businessId?: string | null) => void;
  updateExpense: (id: string, expense: Partial<Expense>, businessId?: string | null) => void;
  deleteExpense: (id: string, businessId?: string | null) => void;
  addOtherIncome: (income: OtherIncome, businessId?: string | null) => Promise<void>;
  updateOtherIncome: (id: string, updates: Partial<OtherIncome>, businessId?: string | null) => Promise<void>;
  deleteOtherIncome: (id: string, businessId?: string | null) => Promise<void>;
  addExpenseRequest: (request: ExpenseRequest, businessId?: string | null) => void;
  updateExpenseRequest: (id: string, updates: Partial<ExpenseRequest>, businessId?: string | null) => void;
  deleteExpenseRequest: (id: string, businessId?: string | null) => void;
  addRefundRequest: (request: RefundRequest, businessId?: string | null) => Promise<void>;
  updateRefundRequest: (id: string, updates: Partial<RefundRequest>, businessId?: string | null) => Promise<void>;
  deleteRefundRequest: (id: string, businessId?: string | null) => Promise<void>;
  addExpenseCategory: (category: ExpenseCategory) => void;
  updateExpenseCategory: (id: string, category: Partial<ExpenseCategory>) => void;
  deleteExpenseCategory: (id: string, businessId?: string | null) => void;
  addFinanceSupplier: (supplier: FinanceSupplier, businessId?: string | null) => void;
  updateFinanceSupplier: (id: string, supplier: Partial<FinanceSupplier>, businessId?: string | null) => void;
  deleteFinanceSupplier: (id: string, businessId?: string | null) => void;
  addProcurementStatusOption: (status: ProcurementStatusOption) => void;
  updateProcurementStatusOption: (id: string, status: Partial<ProcurementStatusOption>) => void;
  deleteProcurementStatusOption: (id: string) => void;
  addFixedCost: (cost: FixedCostSetting, businessId?: string | null) => void;
  updateFixedCost: (id: string, updates: Partial<FixedCostSetting>, businessId?: string | null) => void;
  deleteFixedCost: (id: string, businessId?: string | null) => void;
  addSalaryTemplate: (template: SalaryTemplate, businessId?: string | null) => void;
  updateSalaryTemplate: (id: string, updates: Partial<SalaryTemplate>, businessId?: string | null) => void;
  deleteSalaryTemplate: (id: string, businessId?: string | null) => void;
  financeRules: FinanceRules;
  updateFinanceRules: (rules: Partial<FinanceRules>, businessId?: string | null) => Promise<void>;
  addRevenueRule: (rule: RevenueRule, businessId?: string | null) => Promise<void>;
  updateRevenueRule: (id: string, updates: Partial<RevenueRule>, businessId?: string | null) => Promise<void>;
  deleteRevenueRule: (id: string, businessId?: string | null) => Promise<void>;

  // Audit Logs
  auditLogs: AuditLog[];
  addAuditLog: (log: AuditLog) => void;
  updateAuditLog: (id: string, updates: Partial<AuditLog>) => void;
  hasAuditForMonth: (month: number, year: number) => boolean;

  // Cases
  cases: Case[];
  addCase: (caseItem: Case, businessId?: string | null) => Promise<void>;
  updateCase: (id: string, updates: Partial<Case>, businessId?: string | null) => Promise<void>;
  deleteCase: (id: string, businessId?: string | null) => void;
  getCasesForOrder: (orderId: string) => Case[];

  // Returns
  returns: ReturnRequest[];
  addReturn: (returnItem: ReturnRequest, businessId?: string | null) => Promise<void>;
  updateReturn: (id: string, updates: Partial<ReturnRequest>, businessId?: string | null) => Promise<void>;
  deleteReturn: (id: string, businessId?: string | null) => Promise<void>;
  getReturnsForOrder: (orderId: string) => ReturnRequest[];
  getReturnsForCase: (caseId: string) => ReturnRequest[];
  caseStatuses: CaseStatusOption[];
  addCaseStatus: (status: CaseStatusOption) => void;
  updateCaseStatus: (id: string, updates: Partial<CaseStatusOption>) => void;
  deleteCaseStatus: (id: string, businessId?: string | null) => void;

  // Resolution Types
  resolutionTypes: ResolutionTypeOption[];
  addResolutionType: (type: ResolutionTypeOption) => void;
  updateResolutionType: (id: string, updates: Partial<ResolutionTypeOption>) => void;
  deleteResolutionType: (id: string, businessId?: string | null) => void;

  // Recycle Bin
  recycleBin: DeletedItem[];
  restoreDeletedItem: (deletedItemId: string, businessId?: string | null) => Promise<void>;
  permanentlyDeleteRecycleBinItem: (deletedItemId: string, businessId?: string | null) => Promise<void>;
  clearRecycleBin: () => void;

  // Reset
  resetStore: () => void;
}

// Generate unique IDs
const generateId = () => Math.random().toString(36).substring(2, 15);

// Generate barcode
const generateBarcode = () => {
  return Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join('');
};

// Initial Mint Eyewear Data
const initialOrderStatuses: OrderStatus[] = [];

const initialSaleSources: SaleSource[] = [];

export const DEFAULT_EXPENSE_CATEGORY_NAMES: string[] = [
  'Rent & Utilities',
  'Salaries & Wages',
  'Marketing & Ads',
  'Software & Subscriptions',
  'Logistics & Delivery',
  'Inventory Purchases',
  'Procurement',
  'Repairs & Maintenance',
  'Internet & Communication',
  'Bank Charges & Fees',
  'Professional Services',
  'Travel & Transport',
  'Meals & Entertainment',
  'Office Supplies',
  'Insurance',
  'Training & Education',
  'Taxes & Levies',
  'Licenses & Compliance',
  'Equipment',
  'Miscellaneous',
];

const initialExpenseCategories: ExpenseCategory[] = DEFAULT_EXPENSE_CATEGORY_NAMES.map((name, index) => ({
  id: `expense-category-${index + 1}`,
  name,
}));
const initialFinanceSuppliers: FinanceSupplier[] = [];
const initialProcurementStatusOptions: ProcurementStatusOption[] = [
  { id: 'proc-status-draft', name: 'Draft', order: 1, color: '#6B7280' },
  { id: 'proc-status-sent', name: 'Sent', order: 2, color: '#3B82F6' },
  { id: 'proc-status-confirmed', name: 'Confirmed', order: 3, color: '#111827' },
  { id: 'proc-status-received', name: 'Received', order: 4, color: '#10B981' },
  { id: 'proc-status-cancelled', name: 'Cancelled', order: 5, color: '#EF4444' },
];
const initialFixedCosts: FixedCostSetting[] = [];
const initialSalaryTemplates: SalaryTemplate[] = [];
const initialWarehouseItems: WarehouseItem[] = [];
const initialWarehouseCategories: WarehouseCategoryOption[] = [
  { id: 'warehouse-category-packaging', name: 'Packaging' },
  { id: 'warehouse-category-materials', name: 'Materials' },
  { id: 'warehouse-category-assets', name: 'Assets' },
];
const initialWarehouseUnits: WarehouseUnitOption[] = [
  { id: 'warehouse-unit-pcs', name: 'pcs' },
  { id: 'warehouse-unit-boxes', name: 'boxes' },
  { id: 'warehouse-unit-rolls', name: 'rolls' },
  { id: 'warehouse-unit-packs', name: 'packs' },
];

const initialFinanceRules: FinanceRules = {
  vatRate: 0.075,
  bankChargeTiers: [
    { id: 'tier-1', maxAmount: 5000, fixedFee: 10 },
    { id: 'tier-2', maxAmount: 50000, fixedFee: 25 },
    { id: 'tier-3', maxAmount: null, fixedFee: 50 },
  ],
  revenueRules: [],
  incomingStampDuty: 50,
};

const initialCustomServices: CustomService[] = [];

const initialOrderTimelineSettings: OrderTimelineSettings = {
  warningThresholdPercent: 80,
  defaultOrderType: {
    id: 'order-type-standard',
    name: 'Standard order',
    minBusinessDays: 3,
    maxBusinessDays: 7,
    shippingZoneId: null,
    workflowStatusIds: [],
  },
  orderTypes: [],
  shippingZones: [],
};

const initialPaymentMethods: PaymentMethod[] = [];

const initialLogisticsCarriers: LogisticsCarrier[] = [];

const initialProductVariables: ProductVariable[] = [];

const initialExpenseRequests: ExpenseRequest[] = [];
const initialRefundRequests: RefundRequest[] = [];

const initialCategories: string[] = [];

const initialState = {
  isBackgroundSyncing: false,
  lastDataSyncAt: null as string | null,
  lastFullDataSyncAt: null as string | null,
  themeMode: 'system' as ThemeMode,
  userRole: 'owner' as UserRole,
  useGlobalLowStockThreshold: false,
  globalLowStockThreshold: 5,
  autoCompleteOrders: false,
  autoCompleteAfterDays: 10,
  autoCompleteFromStatus: '',
  autoCompleteToStatus: '',
  orderAutomations: [] as OrderAutomationRule[],
  deliveryFollowUpEnabled: false,
  deliveryFollowUpDelayDays: 7,
  deliveryFollowUpResendDays: 7,
  deliveryFollowUpFromName: '',
  orderStatusEmailEnabled: false,
  categories: initialCategories,
  customers: [] as Customer[],
  products: [] as Product[],
  productVariables: initialProductVariables,
  orders: [] as Order[],
  orderStatuses: initialOrderStatuses,
  qcChecklistRequirements: DEFAULT_ORDER_QC_REQUIREMENTS,
  saleSources: initialSaleSources,
  customServices: initialCustomServices,
  orderTimelineSettings: initialOrderTimelineSettings,
  paymentMethods: initialPaymentMethods,
  logisticsCarriers: initialLogisticsCarriers,
  procurements: [] as Procurement[],
  partners: [] as Partner[],
  partnerJobs: [] as PartnerJob[],
  partnerJobIssues: [] as PartnerJobIssue[],
  expenses: [] as Expense[],
  otherIncomes: [] as OtherIncome[],
  expenseRequests: initialExpenseRequests,
  refundRequests: initialRefundRequests,
  expenseCategories: initialExpenseCategories,
  financeSuppliers: initialFinanceSuppliers,
  procurementStatusOptions: initialProcurementStatusOptions,
  fixedCosts: initialFixedCosts,
  salaryTemplates: initialSalaryTemplates,
  warehouseItems: initialWarehouseItems,
  warehouseCategories: initialWarehouseCategories,
  warehouseUnits: initialWarehouseUnits,
  financeRules: initialFinanceRules,
  auditLogs: [] as AuditLog[],
  restockLogs: [] as RestockLog[],
  cases: [] as Case[],
  returns: [] as ReturnRequest[],
  caseStatuses: DEFAULT_CASE_STATUS_OPTIONS,
  recycleBin: [] as DeletedItem[],
};

const slugify = (value: string) => value
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/(^-|-$)+/g, '');

const normalizeWarehouseOptionName = (value: string) => capitalizeDisplayLabel(value.trim());

const buildCategoryItems = (categories: string[]) => {
  const items = new Map<string, { id: string; name: string }>();
  categories.forEach((category) => {
    const trimmed = category.trim();
    if (!trimmed) return;
    const slug = slugify(trimmed);
    const id = slug || trimmed;
    if (!items.has(id)) {
      items.set(id, { id, name: trimmed });
    }
  });
  return Array.from(items.values());
};

const dedupeByName = <T extends { name: string }>(items: T[]) => {
  const seen = new Set<string>();
  const result: T[] = [];
  items.forEach((item) => {
    const key = item.name.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push(item);
  });
  return result;
};

const normalizeTimelineDays = (value: number | undefined, fallback: number) => {
  const raw = Number(value ?? fallback);
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.max(1, Math.round(raw));
};

const sanitizeOrderTypeTimeline = (
  item: Partial<OrderTypeTimeline> | null | undefined,
  fallback: OrderTypeTimeline
): OrderTypeTimeline => {
  const minBusinessDays = normalizeTimelineDays(item?.minBusinessDays, fallback.minBusinessDays);
  const maxBusinessDays = Math.max(
    minBusinessDays,
    normalizeTimelineDays(item?.maxBusinessDays, fallback.maxBusinessDays)
  );

  return {
    id: item?.id?.trim() || fallback.id,
    name: item?.name?.trim() || fallback.name,
    minBusinessDays,
    maxBusinessDays,
    shippingZoneId: item?.shippingZoneId?.trim() || null,
    workflowStatusIds: Array.from(
      new Set((item?.workflowStatusIds ?? fallback.workflowStatusIds ?? []).map((statusId) => statusId?.trim()).filter(Boolean))
    ),
  };
};

const sanitizeShippingZoneTimeline = (
  item: Partial<ShippingZoneTimeline> | null | undefined,
  fallback: ShippingZoneTimeline
): ShippingZoneTimeline => {
  const shippingFeeRaw = Number(item?.shippingFee ?? fallback.shippingFee);
  const shippingFee = Number.isFinite(shippingFeeRaw) && shippingFeeRaw >= 0
    ? shippingFeeRaw
    : fallback.shippingFee;
  const minBusinessDays = normalizeTimelineDays(item?.minBusinessDays, fallback.minBusinessDays);
  const maxBusinessDays = Math.max(
    minBusinessDays,
    normalizeTimelineDays(item?.maxBusinessDays, fallback.maxBusinessDays)
  );

  return {
    id: item?.id?.trim() || fallback.id,
    name: item?.name?.trim() || fallback.name,
    states: Array.from(new Set((item?.states ?? fallback.states).map((state) => state.trim()).filter(Boolean))),
    shippingFee,
    minBusinessDays,
    maxBusinessDays,
  };
};

const sanitizeOrderTimelineSettings = (
  settings: Partial<OrderTimelineSettings> | null | undefined
): OrderTimelineSettings => {
  const defaultOrderType = sanitizeOrderTypeTimeline(
    settings?.defaultOrderType,
    initialOrderTimelineSettings.defaultOrderType
  );
  const shippingZones = (settings?.shippingZones ?? initialOrderTimelineSettings.shippingZones)
    .map((item, index) => sanitizeShippingZoneTimeline(item, {
      id: `shipping-zone-${index + 1}`,
      name: item?.name?.trim() || `Shipping zone ${index + 1}`,
      states: [],
      shippingFee: 0,
      minBusinessDays: 1,
      maxBusinessDays: 3,
    }))
    .filter((item, index, list) => list.findIndex((entry) => entry.id === item.id) === index);
  const normalizeShippingZoneId = (shippingZoneId: string | null | undefined) => (
    shippingZoneId && shippingZones.some((zone) => zone.id === shippingZoneId)
      ? shippingZoneId
      : null
  );
  const orderTypes = (settings?.orderTypes ?? initialOrderTimelineSettings.orderTypes)
    .map((item, index) => sanitizeOrderTypeTimeline(item, {
      ...defaultOrderType,
      id: `order-type-${index + 1}`,
      name: item?.name?.trim() || `Order type ${index + 1}`,
    }))
    .map((item) => ({
      ...item,
      shippingZoneId: normalizeShippingZoneId(item.shippingZoneId),
    }))
    .filter((item, index, list) => list.findIndex((entry) => entry.id === item.id) === index);

  const warningThresholdPercent = Math.min(
    100,
    Math.max(50, normalizeTimelineDays(settings?.warningThresholdPercent, initialOrderTimelineSettings.warningThresholdPercent))
  );

  return {
    warningThresholdPercent,
    defaultOrderType: {
      ...defaultOrderType,
      shippingZoneId: normalizeShippingZoneId(defaultOrderType.shippingZoneId),
    },
    orderTypes,
    shippingZones,
  };
};

const getGlobalBusinessSettingsData = <T extends Record<string, unknown>>(
  rows: Array<{ id: string; data: T; updated_at?: string | null; created_at?: string | null }>
): T => {
  const getRowScore = (row: { data: T }) => {
    const settings = row.data?.orderTimelineSettings as Partial<OrderTimelineSettings> | undefined;
    const orderTypes = settings?.orderTypes ?? [];
    const shippingZones = settings?.shippingZones ?? [];
    const workflowSteps = orderTypes.reduce((total, item) => (
      total + (Array.isArray(item.workflowStatusIds) ? item.workflowStatusIds.length : 0)
    ), 0);
    return (orderTypes.length * 100) + (shippingZones.length * 10) + workflowSteps;
  };
  const getRowTime = (row: { updated_at?: string | null; created_at?: string | null }) => (
    new Date(row.updated_at ?? row.created_at ?? 0).getTime() || 0
  );
  const candidates = rows.filter((row) => row.id === 'global' || row.data?.id === 'global');
  const usableRows = candidates.length > 0 ? candidates : rows;
  const bestRow = usableRows.reduce<typeof usableRows[number] | null>((best, row) => {
    if (!best) return row;
    const scoreDelta = getRowScore(row) - getRowScore(best);
    if (scoreDelta > 0) return row;
    if (scoreDelta === 0) {
      const timeDelta = getRowTime(row) - getRowTime(best);
      if (timeDelta > 0) return row;
    }
    return best;
  }, null);
  return (bestRow?.data ?? {}) as T;
};

const getOrderTimelineSettingsSignature = (settings: OrderTimelineSettings) => JSON.stringify(
  sanitizeOrderTimelineSettings(settings)
);

const hasMeaningfulOrderTimelineSettings = (
  settings: Partial<OrderTimelineSettings> | null | undefined
) => {
  if (!settings) return false;

  const orderTypes = Array.isArray(settings.orderTypes) ? settings.orderTypes : [];
  const shippingZones = Array.isArray(settings.shippingZones) ? settings.shippingZones : [];
  const workflowSteps = orderTypes.reduce((total, item) => (
    total + (Array.isArray(item?.workflowStatusIds) ? item.workflowStatusIds.length : 0)
  ), 0);

  return orderTypes.length > 0 || shippingZones.length > 0 || workflowSteps > 0;
};

const getRemoteOrderTimelineSettings = (
  rows: Array<{ id: string; data: Record<string, unknown>; updated_at?: string | null; created_at?: string | null }>
) => {
  const existingSettings = getGlobalBusinessSettingsData(rows);
  return sanitizeOrderTimelineSettings(
    (existingSettings.orderTimelineSettings ?? null) as Partial<OrderTimelineSettings> | null
  );
};

const mergeBusinessSettingsWithProtectedOrderTimeline = ({
  existingSettings,
  incomingSettings,
}: {
  existingSettings: Record<string, unknown>;
  incomingSettings: OrderTimelineSettings;
}) => {
  const remoteOrderTimelineSettings = sanitizeOrderTimelineSettings(
    (existingSettings.orderTimelineSettings ?? null) as Partial<OrderTimelineSettings> | null
  );
  const incomingHasData = hasMeaningfulOrderTimelineSettings(incomingSettings);
  const remoteHasData = hasMeaningfulOrderTimelineSettings(remoteOrderTimelineSettings);

  if (!incomingHasData && remoteHasData) {
    return {
      mergedOrderTimelineSettings: remoteOrderTimelineSettings,
      protectedFromOverwrite: true,
      backupOrderTimelineSettings: remoteOrderTimelineSettings,
    };
  }

  return {
    mergedOrderTimelineSettings: incomingSettings,
    protectedFromOverwrite: false,
    backupOrderTimelineSettings: incomingHasData ? incomingSettings : remoteOrderTimelineSettings,
  };
};

const createDeletedItem = (
  entityType: DeletedEntityType,
  entityId: string,
  label: string,
  data: unknown,
  parent?: { id: string; label: string }
): DeletedItem => ({
  id: `deleted-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  entityId,
  entityType,
  label: label.trim() || entityId,
  deletedAt: new Date().toISOString(),
  data,
  parentId: parent?.id,
  parentLabel: parent?.label,
});

const RECYCLE_BIN_TABLE = 'deleted_items';

const persistDeletedItemsToSupabase = async (
  businessId: string,
  deletedItems: DeletedItem[]
) => {
  if (!deletedItems.length) return;
  await supabaseData.upsertCollection(RECYCLE_BIN_TABLE, businessId, deletedItems);
};

const deleteDeletedItemsFromSupabase = async (
  businessId: string,
  deletedItemIds: string[]
) => {
  if (!deletedItemIds.length) return;
  await supabaseData.deleteByIds(RECYCLE_BIN_TABLE, businessId, deletedItemIds);
};

const getProcurementItemSignature = (item: ProcurementItem): string => JSON.stringify({
  productId: item.productId ?? '',
  variantId: item.variantId ?? '',
  productName: item.productName ?? '',
  variantName: item.variantName ?? '',
  quantity: item.quantity ?? 0,
  costAtPurchase: item.costAtPurchase ?? 0,
  unitCost: item.unitCost ?? 0,
  serviceFee: item.serviceFee ?? 0,
  deliveryFee: item.deliveryFee ?? 0,
  shippingClearanceFee: item.shippingClearanceFee ?? 0,
  additionalFee: item.additionalFee ?? 0,
});

const findRemovedProcurementItems = (
  previousItems: ProcurementItem[],
  nextItems: ProcurementItem[]
): Array<{ item: ProcurementItem; index: number }> => {
  const remaining = new Map<string, number>();
  nextItems.forEach((item) => {
    const key = getProcurementItemSignature(item);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  });

  const removed: Array<{ item: ProcurementItem; index: number }> = [];
  previousItems.forEach((item, index) => {
    if ((item.productId ?? '').startsWith('charge-')) return;
    const key = getProcurementItemSignature(item);
    const count = remaining.get(key) ?? 0;
    if (count > 0) {
      remaining.set(key, count - 1);
      return;
    }
    removed.push({ item, index });
  });

  return removed;
};

const persistFinanceSuppliersToBusinessSettings = async (
  businessId: string,
  financeSuppliers: FinanceSupplier[],
) => {
  const existingRows = await supabaseSettings.fetchSettings<Record<string, unknown>>('business_settings', businessId);
  const existingSettings = getGlobalBusinessSettingsData(existingRows);
  const mergedSettings = [{
    ...existingSettings,
    id: 'global',
    financeSuppliers,
  }];
  await supabaseSettings.upsertSettings('business_settings', businessId, mergedSettings);
};

const persistFinanceRulesToBusinessSettings = async (
  businessId: string,
  financeRules: FinanceRules,
) => {
  const existingRows = await supabaseSettings.fetchSettings<Record<string, unknown>>('business_settings', businessId);
  const existingSettings = getGlobalBusinessSettingsData(existingRows);
  const mergedSettings = [{
    ...existingSettings,
    id: 'global',
    financeRules,
  }];
  await supabaseSettings.upsertSettings('business_settings', businessId, mergedSettings);
};

const persistFixedCostsToBusinessSettings = async (
  businessId: string,
  fixedCosts: FixedCostSetting[],
) => {
  const existingRows = await supabaseSettings.fetchSettings<Record<string, unknown>>('business_settings', businessId);
  const existingSettings = getGlobalBusinessSettingsData(existingRows);
  const mergedSettings = [{
    ...existingSettings,
    id: 'global',
    fixedCosts,
  }];
  await supabaseSettings.upsertSettings('business_settings', businessId, mergedSettings);
};

const persistSalaryTemplatesToBusinessSettings = async (
  businessId: string,
  salaryTemplates: SalaryTemplate[],
) => {
  const existingRows = await supabaseSettings.fetchSettings<Record<string, unknown>>('business_settings', businessId);
  const existingSettings = getGlobalBusinessSettingsData(existingRows);
  const mergedSettings = [{
    ...existingSettings,
    id: 'global',
    salaryTemplates,
  }];
  await supabaseSettings.upsertSettings('business_settings', businessId, mergedSettings);
};

const persistWarehouseItemsToBusinessSettings = async (
  businessId: string,
  warehouseItems: WarehouseItem[],
) => {
  const existingRows = await supabaseSettings.fetchSettings<Record<string, unknown>>('business_settings', businessId);
  const existingSettings = getGlobalBusinessSettingsData(existingRows);
  const mergedSettings = [{
    ...existingSettings,
    id: 'global',
    warehouseItems,
  }];
  await supabaseSettings.upsertSettings('business_settings', businessId, mergedSettings);
};

const persistWarehousePreferencesToBusinessSettings = async (
  businessId: string,
  payload: { warehouseCategories: WarehouseCategoryOption[]; warehouseUnits: WarehouseUnitOption[] },
) => {
  const existingRows = await supabaseSettings.fetchSettings<Record<string, unknown>>('business_settings', businessId);
  const existingSettings = getGlobalBusinessSettingsData(existingRows);
  const mergedSettings = [{
    ...existingSettings,
    id: 'global',
    warehouseCategories: payload.warehouseCategories,
    warehouseUnits: payload.warehouseUnits,
  }];
  await supabaseSettings.upsertSettings('business_settings', businessId, mergedSettings);
};

const persistOrderTimelineSettingsToBusinessSettings = async (
  businessId: string,
  orderTimelineSettings: OrderTimelineSettings,
) => {
  const sanitizedSettings = sanitizeOrderTimelineSettings(orderTimelineSettings);
  const existingRows = await supabaseSettings.fetchSettings<Record<string, unknown>>('business_settings', businessId);
  const existingSettings = getGlobalBusinessSettingsData(existingRows);
  const remoteOrderTimelineSettings = getRemoteOrderTimelineSettings(existingRows);
  const incomingHasData = hasMeaningfulOrderTimelineSettings(sanitizedSettings);
  const remoteHasData = hasMeaningfulOrderTimelineSettings(remoteOrderTimelineSettings);

  if (!incomingHasData && remoteHasData) {
    throw new Error('Blocked empty order timeline overwrite because Supabase still has populated timeline settings.');
  }

  const mergedSettings = [{
    ...existingSettings,
    id: 'global',
    orderTimelineSettings: sanitizedSettings,
    orderTimelineSettingsLastKnownPopulated: incomingHasData ? sanitizedSettings : remoteOrderTimelineSettings,
  }];
  await supabaseSettings.upsertSettings('business_settings', businessId, mergedSettings);

  const verificationRows = await supabaseSettings.fetchSettings<Record<string, unknown>>('business_settings', businessId);
  const persistedSettings = getGlobalBusinessSettingsData(verificationRows);
  const persistedOrderTimelineSettings = sanitizeOrderTimelineSettings(
    (persistedSettings.orderTimelineSettings ?? null) as Partial<OrderTimelineSettings> | null
  );

  if (getOrderTimelineSettingsSignature(persistedOrderTimelineSettings) !== getOrderTimelineSettingsSignature(sanitizedSettings)) {
    throw new Error('Order timeline settings did not persist to Supabase.');
  }
};

const normalizeAfterDays = (value: number | undefined) => {
  return Number.isFinite(value) && (value ?? 0) > 0 ? Math.floor(value as number) : 10;
};

const normalizeFixedCostFrequency = (value?: string): FixedCostFrequency => {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'quarterly') return 'Quarterly';
  if (normalized === 'yearly' || normalized === 'annual') return 'Yearly';
  return 'Monthly';
};

const sanitizeSalaryTemplateLines = (lines: SalaryTemplateLine[] | undefined): SalaryTemplateLine[] => (
  (lines ?? [])
    .filter((line) => line.id.trim() && line.employeeName.trim() && Number.isFinite(line.amount) && line.amount > 0)
    .map((line) => ({
      id: line.id.trim(),
      employeeName: line.employeeName.trim(),
      amount: Number(line.amount),
    }))
);

const sanitizeWarehouseItems = (items: WarehouseItem[] | undefined): WarehouseItem[] => (
  (items ?? [])
    .filter((item) => item.id.trim() && item.name.trim())
    .map((item) => ({
      ...item,
      id: item.id.trim(),
      name: item.name.trim(),
      category: normalizeWarehouseOptionName(item.category || 'General'),
      unit: normalizeWarehouseOptionName(item.unit || 'pcs'),
      imageUrl: item.imageUrl?.trim() || undefined,
      currentStock: Math.max(0, Number(item.currentStock ?? 0)),
      reorderLevel: Number.isFinite(item.reorderLevel) ? Math.max(0, Number(item.reorderLevel)) : undefined,
      countFrequency: item.countFrequency === 'Bi-Monthly' ? 'Bi-Monthly' : 'Monthly',
      notes: item.notes?.trim() ?? '',
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: item.updatedAt || item.createdAt || new Date().toISOString(),
      countHistory: (item.countHistory ?? [])
        .filter((entry) => entry.id.trim() && Number.isFinite(entry.quantity))
        .map((entry) => ({
          id: entry.id.trim(),
          quantity: Math.max(0, Number(entry.quantity)),
          countedAt: entry.countedAt || item.lastCountedAt || item.createdAt || new Date().toISOString(),
          countedBy: entry.countedBy?.trim() || undefined,
          notes: entry.notes?.trim() || undefined,
        }))
        .sort((a, b) => new Date(b.countedAt).getTime() - new Date(a.countedAt).getTime())
        .slice(0, 60),
    }))
);

const sanitizeWarehouseOptions = <T extends { id: string; name: string }>(
  items: T[] | undefined,
  fallback: T[],
): T[] => {
  const seen = new Set<string>();
  const cleaned = (items ?? [])
    .filter((item) => item.id.trim() && item.name.trim())
    .map((item) => ({ ...item, id: item.id.trim(), name: normalizeWarehouseOptionName(item.name) }))
    .filter((item) => {
      const key = item.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return cleaned.length > 0 ? cleaned : fallback;
};

const sanitizeOrderAutomationRule = (
  rule: Partial<OrderAutomationRule> | null | undefined,
  fallbackId: string
): OrderAutomationRule | null => {
  if (!rule) return null;
  const id = String(rule.id ?? fallbackId).trim();
  if (!id) return null;
  return {
    id,
    enabled: rule.enabled ?? true,
    fromStatus: (rule.fromStatus ?? '').trim(),
    toStatus: (rule.toStatus ?? '').trim(),
    afterDays: normalizeAfterDays(rule.afterDays),
  };
};

const sanitizeOrderAutomations = (
  rules: (Partial<OrderAutomationRule> | null | undefined)[]
): OrderAutomationRule[] => {
  const seen = new Set<string>();
  const nextRules: OrderAutomationRule[] = [];
  rules.forEach((rule, index) => {
    const sanitized = sanitizeOrderAutomationRule(rule, `automation-${index + 1}`);
    if (!sanitized || seen.has(sanitized.id)) return;
    seen.add(sanitized.id);
    nextRules.push(sanitized);
  });
  return nextRules;
};

const resolveLegacyAutomationFields = (rules: OrderAutomationRule[]) => {
  const firstRule = rules[0];
  return {
    autoCompleteAfterDays: firstRule?.afterDays ?? 10,
    autoCompleteFromStatus: firstRule?.fromStatus ?? '',
    autoCompleteToStatus: firstRule?.toStatus ?? '',
  };
};

const useFyllStore = create<FyllStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Sync state
      setIsBackgroundSyncing: (value) => set({ isBackgroundSyncing: value }),
      setDataSyncTimestamps: ({ lastDataSyncAt, lastFullDataSyncAt }) => set((state) => ({
        lastDataSyncAt: lastDataSyncAt ?? state.lastDataSyncAt,
        lastFullDataSyncAt: lastFullDataSyncAt ?? state.lastFullDataSyncAt,
      })),

      // Theme
      setThemeMode: (mode) => set({ themeMode: mode }),

      // User
      setUserRole: (role) => set({ userRole: role }),

      // Global Low Stock Threshold
      setUseGlobalLowStockThreshold: (use) => set({ useGlobalLowStockThreshold: use }),
      setGlobalLowStockThreshold: (threshold) => set({ globalLowStockThreshold: threshold }),
      getEffectiveLowStockThreshold: (product) => {
        const state = get();
        return state.useGlobalLowStockThreshold ? state.globalLowStockThreshold : product.lowStockThreshold;
      },

      restoreDeletedItem: async (deletedItemId, businessId) => {
        const deletedItem = get().recycleBin.find((item) => item.id === deletedItemId);
        if (!deletedItem) return;

        const removeFromBin = () => set({
          recycleBin: get().recycleBin.filter((item) => item.id !== deletedItemId),
        });

        switch (deletedItem.entityType) {
          case 'customer': {
            const customer = deletedItem.data as Customer;
            set({ customers: [...get().customers.filter((item) => item.id !== customer.id), customer] });
            if (businessId) await supabaseData.upsertCollection('customers', businessId, [customer]);
            if (businessId) {
              await deleteDeletedItemsFromSupabase(businessId, [deletedItem.id]).catch((error) => {
                console.warn('Supabase recycle bin cleanup failed:', error);
              });
            }
            removeFromBin();
            return;
          }
          case 'product': {
            const product = deletedItem.data as Product;
            set({ products: [...get().products.filter((item) => item.id !== product.id), product] });
            if (businessId) await supabaseData.upsertCollection('products', businessId, [product]);
            if (businessId) {
              await deleteDeletedItemsFromSupabase(businessId, [deletedItem.id]).catch((error) => {
                console.warn('Supabase recycle bin cleanup failed:', error);
              });
            }
            removeFromBin();
            return;
          }
          case 'order': {
            const order = deletedItem.data as Order;
            set({ orders: [...get().orders.filter((item) => item.id !== order.id), order] });
            if (businessId) await supabaseData.upsertCollection('orders', businessId, [order]);
            if (businessId) {
              await deleteDeletedItemsFromSupabase(businessId, [deletedItem.id]).catch((error) => {
                console.warn('Supabase recycle bin cleanup failed:', error);
              });
            }
            removeFromBin();
            return;
          }
          case 'procurement': {
            const procurement = deletedItem.data as Procurement;
            set({ procurements: [...get().procurements.filter((item) => item.id !== procurement.id), procurement] });
            if (businessId) await supabaseData.upsertCollection('procurements', businessId, [procurement]);
            if (businessId) {
              await deleteDeletedItemsFromSupabase(businessId, [deletedItem.id]).catch((error) => {
                console.warn('Supabase recycle bin cleanup failed:', error);
              });
            }
            removeFromBin();
            return;
          }
          case 'partner': {
            const partner = deletedItem.data as Partner;
            set({ partners: [...get().partners.filter((item) => item.id !== partner.id), partner] });
            if (businessId) await supabaseData.upsertCollection('partners', businessId, [partner]);
            if (businessId) {
              await deleteDeletedItemsFromSupabase(businessId, [deletedItem.id]).catch((error) => {
                console.warn('Supabase recycle bin cleanup failed:', error);
              });
            }
            removeFromBin();
            return;
          }
          case 'partner-job': {
            const job = deletedItem.data as PartnerJob;
            set({ partnerJobs: [...get().partnerJobs.filter((item) => item.id !== job.id), job] });
            if (businessId) await supabaseData.upsertCollection('partner_jobs', businessId, [job]);
            if (businessId) {
              await deleteDeletedItemsFromSupabase(businessId, [deletedItem.id]).catch((error) => {
                console.warn('Supabase recycle bin cleanup failed:', error);
              });
            }
            removeFromBin();
            return;
          }
          case 'procurement-item': {
            const procurementId = deletedItem.parentId;
            const procurement = get().procurements.find((item) => item.id === procurementId);
            if (!procurement) {
              throw new Error('Original procurement not found for deleted line.');
            }
            const restoredItem = deletedItem.data as ProcurementItem;
            const nextProcurement: Procurement = {
              ...procurement,
              items: [...procurement.items, restoredItem],
              totalCost: (procurement.totalCost ?? 0) + (restoredItem.costAtPurchase ?? 0),
            };
            set({
              procurements: get().procurements.map((item) => item.id === nextProcurement.id ? nextProcurement : item),
            });
            if (businessId) await supabaseData.upsertCollection('procurements', businessId, [nextProcurement]);
            if (businessId) {
              await deleteDeletedItemsFromSupabase(businessId, [deletedItem.id]).catch((error) => {
                console.warn('Supabase recycle bin cleanup failed:', error);
              });
            }
            removeFromBin();
            return;
          }
          case 'expense': {
            const expense = deletedItem.data as Expense;
            set({ expenses: [...get().expenses.filter((item) => item.id !== expense.id), expense] });
            if (businessId) await supabaseData.upsertCollection('expenses', businessId, [expense]);
            if (businessId) {
              await deleteDeletedItemsFromSupabase(businessId, [deletedItem.id]).catch((error) => {
                console.warn('Supabase recycle bin cleanup failed:', error);
              });
            }
            removeFromBin();
            return;
          }
          case 'other-income': {
            const income = deletedItem.data as OtherIncome;
            set({ otherIncomes: [...get().otherIncomes.filter((item) => item.id !== income.id), income] });
            if (businessId) await supabaseData.upsertCollection('other_incomes', businessId, [income]);
            if (businessId) {
              await deleteDeletedItemsFromSupabase(businessId, [deletedItem.id]).catch((error) => {
                console.warn('Supabase recycle bin cleanup failed:', error);
              });
            }
            removeFromBin();
            return;
          }
          case 'expense-request': {
            const request = deletedItem.data as ExpenseRequest;
            set({ expenseRequests: [...get().expenseRequests.filter((item) => item.id !== request.id), request] });
            if (businessId) await supabaseData.upsertCollection('expense_requests', businessId, [request]);
            if (businessId) {
              await deleteDeletedItemsFromSupabase(businessId, [deletedItem.id]).catch((error) => {
                console.warn('Supabase recycle bin cleanup failed:', error);
              });
            }
            removeFromBin();
            return;
          }
          case 'refund-request': {
            const request = deletedItem.data as RefundRequest;
            set({ refundRequests: [...get().refundRequests.filter((item) => item.id !== request.id), request] });
            if (businessId) await supabaseData.upsertCollection('refund_requests', businessId, [request]);
            if (businessId) {
              await deleteDeletedItemsFromSupabase(businessId, [deletedItem.id]).catch((error) => {
                console.warn('Supabase recycle bin cleanup failed:', error);
              });
            }
            removeFromBin();
            return;
          }
          case 'case': {
            const caseItem = deletedItem.data as Case;
            set({ cases: [...get().cases.filter((item) => item.id !== caseItem.id), caseItem] });
            if (businessId) await supabaseData.upsertCollection('cases', businessId, [caseItem]);
            if (businessId) {
              await deleteDeletedItemsFromSupabase(businessId, [deletedItem.id]).catch((error) => {
                console.warn('Supabase recycle bin cleanup failed:', error);
              });
            }
            removeFromBin();
            return;
          }
          case 'return': {
            const returnItem = deletedItem.data as ReturnRequest;
            set({ returns: [...get().returns.filter((item) => item.id !== returnItem.id), returnItem] });
            if (businessId) await supabaseData.upsertCollection('returns', businessId, [returnItem]);
            if (businessId) {
              await deleteDeletedItemsFromSupabase(businessId, [deletedItem.id]).catch((error) => {
                console.warn('Supabase recycle bin cleanup failed:', error);
              });
            }
            removeFromBin();
            return;
          }
        }
      },
      permanentlyDeleteRecycleBinItem: async (deletedItemId, businessId) => {
        set({
          recycleBin: get().recycleBin.filter((item) => item.id !== deletedItemId),
        });

        if (!businessId) return;
        await deleteDeletedItemsFromSupabase(businessId, [deletedItemId]).catch((error) => {
          console.warn('Supabase recycle bin delete failed:', error);
        });
      },
      clearRecycleBin: () => set({ recycleBin: [] }),

      // Order Auto-Completion
      setAutoCompleteOrders: (enabled) => set({ autoCompleteOrders: enabled }),
      setAutoCompleteAfterDays: (days) => set((state) => {
        const nextAfterDays = normalizeAfterDays(days);
        const nextRules = state.orderAutomations.length > 0
          ? state.orderAutomations.map((rule, index) => (
            index === 0 ? { ...rule, afterDays: nextAfterDays } : rule
          ))
          : [{
            id: generateId(),
            enabled: true,
            fromStatus: state.autoCompleteFromStatus,
            toStatus: state.autoCompleteToStatus,
            afterDays: nextAfterDays,
          }];
        return {
          autoCompleteAfterDays: nextAfterDays,
          orderAutomations: nextRules,
        };
      }),
      setAutoCompleteFromStatus: (status) => set((state) => {
        const nextStatus = status.trim();
        const nextRules = state.orderAutomations.length > 0
          ? state.orderAutomations.map((rule, index) => (
            index === 0 ? { ...rule, fromStatus: nextStatus } : rule
          ))
          : [{
            id: generateId(),
            enabled: true,
            fromStatus: nextStatus,
            toStatus: state.autoCompleteToStatus,
            afterDays: normalizeAfterDays(state.autoCompleteAfterDays),
          }];
        return {
          autoCompleteFromStatus: nextStatus,
          orderAutomations: nextRules,
        };
      }),
      setAutoCompleteToStatus: (status) => set((state) => {
        const nextStatus = status.trim();
        const nextRules = state.orderAutomations.length > 0
          ? state.orderAutomations.map((rule, index) => (
            index === 0 ? { ...rule, toStatus: nextStatus } : rule
          ))
          : [{
            id: generateId(),
            enabled: true,
            fromStatus: state.autoCompleteFromStatus,
            toStatus: nextStatus,
            afterDays: normalizeAfterDays(state.autoCompleteAfterDays),
          }];
        return {
          autoCompleteToStatus: nextStatus,
          orderAutomations: nextRules,
        };
      }),
      setDeliveryFollowUpEnabled: (enabled) => set({ deliveryFollowUpEnabled: enabled }),
      setDeliveryFollowUpDelayDays: (days) => set({
        deliveryFollowUpDelayDays: Number.isFinite(days) && days > 0 ? Math.floor(days) : 7,
      }),
      setDeliveryFollowUpResendDays: (days) => set({
        deliveryFollowUpResendDays: Number.isFinite(days) && days > 0 ? Math.floor(days) : 7,
      }),
      setDeliveryFollowUpFromName: (value) => set({
        deliveryFollowUpFromName: value.trim().slice(0, 80),
      }),
      setOrderStatusEmailEnabled: (enabled) => set({ orderStatusEmailEnabled: enabled }),
      setOrderAutomations: (rules) => set(() => {
        const nextRules = sanitizeOrderAutomations(rules);
        return {
          ...resolveLegacyAutomationFields(nextRules),
          orderAutomations: nextRules,
        };
      }),
      addOrderAutomation: (rule) => set((state) => {
        const nextRule = sanitizeOrderAutomationRule({
          id: rule?.id ?? generateId(),
          enabled: rule?.enabled ?? true,
          fromStatus: rule?.fromStatus ?? '',
          toStatus: rule?.toStatus ?? '',
          afterDays: rule?.afterDays ?? state.autoCompleteAfterDays,
        }, generateId());
        if (!nextRule) return {};
        const nextRules = [...state.orderAutomations, nextRule];
        return {
          ...resolveLegacyAutomationFields(nextRules),
          orderAutomations: nextRules,
        };
      }),
      updateOrderAutomation: (id, updates) => set((state) => {
        const nextRules = state.orderAutomations.map((rule) => (
          rule.id === id
            ? (sanitizeOrderAutomationRule({ ...rule, ...updates, id: rule.id }, rule.id) ?? rule)
            : rule
        ));
        return {
          ...resolveLegacyAutomationFields(nextRules),
          orderAutomations: nextRules,
        };
      }),
      deleteOrderAutomation: (id) => set((state) => {
        const nextRules = state.orderAutomations.filter((rule) => rule.id !== id);
        return {
          ...resolveLegacyAutomationFields(nextRules),
          orderAutomations: nextRules,
        };
      }),

      // Global Categories
      addCategory: (category) => {
        const current = get().categories;
        const normalized = category.trim();
        if (!normalized) return;
        const exists = current.some((existing) => existing.trim().toLowerCase() === normalized.toLowerCase());
        if (!exists) {
          set({ categories: [...current, normalized] });
        }
      },
      updateCategory: (previous, next) => {
        const trimmedNext = next.trim();
        if (!trimmedNext) return;
        const normalizedNext = trimmedNext.toLowerCase();
        const nextCategories = get().categories
          .map((category) => (category === previous ? trimmedNext : category))
          .filter((category, index, list) => list.findIndex(
            (item) => item.trim().toLowerCase() === category.trim().toLowerCase()
          ) === index);
        if (nextCategories.some((category) => category.trim().toLowerCase() === normalizedNext)) {
          set({ categories: nextCategories });
          return;
        }
        set({ categories: nextCategories });
      },
      deleteCategory: (category, businessId) => {
        set({ categories: get().categories.filter((c) => c !== category) });
        if (!businessId) return;
        const slug = slugify(category.trim());
        const id = slug || category.trim();
        supabaseSettings
          .deleteSettings('product_categories', businessId, [id])
          .catch((error) => console.warn('Supabase category delete failed:', error));
      },
      saveGlobalSettings: async (businessId) => {
        if (!businessId) {
          return { success: false, error: 'No business selected.' };
        }

        try {
          const state = get();
          const orderStatuses = sanitizeOrderStatuses(
            dedupeByName(state.orderStatuses ?? []).filter((status) => status.name.trim())
          )
            .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
            .map((status, index) => ({ ...status, order: index + 1 }));
          const saleSources = dedupeByName(state.saleSources ?? []).filter((source) => source.name.trim());
          const customServices = dedupeByName(state.customServices ?? []).filter((service) => service.name.trim());
          const orderTimelineSettings = sanitizeOrderTimelineSettings(state.orderTimelineSettings);
          const paymentMethods = dedupeByName(state.paymentMethods ?? []).filter((method) => method.name.trim());
          const logisticsCarriers = dedupeByName(state.logisticsCarriers ?? []).filter((carrier) => carrier.name.trim());
          const productVariables = dedupeByName(state.productVariables ?? []).filter((variable) => variable.name.trim());
          const expenseCategories = dedupeByName(state.expenseCategories ?? []).filter((category) => category.name.trim());
          const financeSuppliers = dedupeByName(state.financeSuppliers ?? []).filter((supplier) => supplier.name.trim());
          const procurementStatusOptions = dedupeByName(state.procurementStatusOptions ?? [])
            .filter((status) => status.name.trim())
            .sort((a, b) => a.order - b.order)
            .map((status, index) => ({ ...status, order: index + 1 }));
          const fixedCosts = (state.fixedCosts ?? [])
            .filter((cost) => (
              cost.id.trim()
              && cost.name.trim()
              && cost.category.trim()
              && Number.isFinite(cost.amount)
              && cost.amount > 0
            ))
            .map((cost) => ({
              ...cost,
              name: cost.name.trim(),
              category: cost.category.trim(),
              amount: Number(cost.amount),
              frequency: normalizeFixedCostFrequency(cost.frequency),
              supplierName: cost.supplierName?.trim() ?? '',
              notes: cost.notes?.trim() ?? '',
              createdAt: cost.createdAt || new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
          const salaryTemplates = (state.salaryTemplates ?? [])
            .filter((template) => template.id.trim() && template.name.trim())
            .map((template) => ({
              ...template,
              name: template.name.trim(),
              category: template.category?.trim() || 'Salaries & Wages',
              lines: sanitizeSalaryTemplateLines(template.lines),
              notes: template.notes?.trim() ?? '',
              createdAt: template.createdAt || new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }))
            .filter((template) => template.lines.length > 0)
            .sort((a, b) => a.name.localeCompare(b.name));
          const warehouseItems = sanitizeWarehouseItems(state.warehouseItems);
          const warehouseCategories = sanitizeWarehouseOptions(state.warehouseCategories, initialWarehouseCategories);
          const warehouseUnits = sanitizeWarehouseOptions(state.warehouseUnits, initialWarehouseUnits);
          const qcChecklistRequirements = sanitizeOrderQcRequirements(state.qcChecklistRequirements, false);
          const normalizedProcurementStatusOptions = procurementStatusOptions.length > 0
            ? procurementStatusOptions
            : initialProcurementStatusOptions;
          const caseStatuses = dedupeByName(state.caseStatuses ?? []).filter((status) => status.name.trim());
          const categories = (state.categories ?? []).filter((category) => category.trim());
          const categoryItems = buildCategoryItems(categories);
          const categoryNames = categoryItems.map((item) => item.name);
          const sanitizedOrderAutomations = sanitizeOrderAutomations(state.orderAutomations ?? []);
          const shouldUseLegacyFallback = Boolean(
            state.autoCompleteFromStatus.trim() || state.autoCompleteToStatus.trim()
          );
          const fallbackOrderAutomation = shouldUseLegacyFallback
            ? sanitizeOrderAutomationRule({
              id: 'automation-legacy',
              enabled: true,
              fromStatus: state.autoCompleteFromStatus,
              toStatus: state.autoCompleteToStatus,
              afterDays: state.autoCompleteAfterDays,
            }, 'automation-legacy')
            : null;
          const orderAutomations = sanitizedOrderAutomations.length > 0
            ? sanitizedOrderAutomations
            : (fallbackOrderAutomation ? [fallbackOrderAutomation] : []);
          const legacyAutomation = resolveLegacyAutomationFields(orderAutomations);
          const existingBusinessSettingsRows = await supabaseSettings.fetchSettings<Record<string, unknown>>('business_settings', businessId);
          const existingBusinessSettings = getGlobalBusinessSettingsData(existingBusinessSettingsRows);
          const {
            mergedOrderTimelineSettings,
            protectedFromOverwrite,
            backupOrderTimelineSettings,
          } = mergeBusinessSettingsWithProtectedOrderTimeline({
            existingSettings: existingBusinessSettings,
            incomingSettings: orderTimelineSettings,
          });
          const businessSettings = [{
            id: 'global',
            useGlobalLowStockThreshold: state.useGlobalLowStockThreshold ?? false,
            globalLowStockThreshold: state.globalLowStockThreshold ?? 0,
            autoCompleteOrders: state.autoCompleteOrders ?? false,
            autoCompleteAfterDays: legacyAutomation.autoCompleteAfterDays,
            autoCompleteFromStatus: legacyAutomation.autoCompleteFromStatus,
            autoCompleteToStatus: legacyAutomation.autoCompleteToStatus,
            orderAutomations,
            deliveryFollowUpEnabled: state.deliveryFollowUpEnabled ?? false,
            deliveryFollowUpDelayDays: Number.isFinite(state.deliveryFollowUpDelayDays) && state.deliveryFollowUpDelayDays > 0
              ? Math.floor(state.deliveryFollowUpDelayDays)
              : 7,
            deliveryFollowUpResendDays: Number.isFinite(state.deliveryFollowUpResendDays) && state.deliveryFollowUpResendDays > 0
              ? Math.floor(state.deliveryFollowUpResendDays)
              : 7,
            deliveryFollowUpFromName: state.deliveryFollowUpFromName.trim(),
            orderStatusEmailEnabled: state.orderStatusEmailEnabled ?? false,
            orderTimelineSettings: mergedOrderTimelineSettings,
            orderTimelineSettingsLastKnownPopulated: backupOrderTimelineSettings,
            financeSuppliers,
            procurementStatusOptions: normalizedProcurementStatusOptions,
            fixedCosts,
            salaryTemplates,
            warehouseItems,
            warehouseCategories,
            warehouseUnits,
            qcChecklistRequirements,
            financeRules: state.financeRules,
          }];

          set({
            orderStatuses,
            saleSources,
            customServices,
            paymentMethods,
            logisticsCarriers,
            productVariables,
            expenseCategories,
            financeSuppliers,
            procurementStatusOptions: normalizedProcurementStatusOptions,
            fixedCosts,
            salaryTemplates,
            warehouseItems,
            warehouseCategories,
            warehouseUnits,
            qcChecklistRequirements,
            caseStatuses,
            categories: categoryNames,
            orderAutomations,
            autoCompleteAfterDays: legacyAutomation.autoCompleteAfterDays,
            autoCompleteFromStatus: legacyAutomation.autoCompleteFromStatus,
            autoCompleteToStatus: legacyAutomation.autoCompleteToStatus,
            deliveryFollowUpEnabled: state.deliveryFollowUpEnabled ?? false,
            deliveryFollowUpDelayDays: Number.isFinite(state.deliveryFollowUpDelayDays) && state.deliveryFollowUpDelayDays > 0
              ? Math.floor(state.deliveryFollowUpDelayDays)
              : 7,
            deliveryFollowUpResendDays: Number.isFinite(state.deliveryFollowUpResendDays) && state.deliveryFollowUpResendDays > 0
              ? Math.floor(state.deliveryFollowUpResendDays)
              : 7,
            deliveryFollowUpFromName: state.deliveryFollowUpFromName.trim(),
            orderStatusEmailEnabled: state.orderStatusEmailEnabled ?? false,
            orderTimelineSettings: mergedOrderTimelineSettings,
          });

          if (protectedFromOverwrite) {
            console.warn('🛡️ Preserved populated Supabase order timeline settings instead of overwriting them with an empty local payload.');
          }

          const syncTable = async <T extends { id: string }>(table: string, items: T[]) => {
            const existing = await supabaseSettings.fetchSettings<{ id: string }>(table, businessId);
            const existingIds = existing.map((row) => row.id);
            const nextIds = new Set(items.map((item) => item.id));
            const removed = existingIds.filter((id) => !nextIds.has(id));

            if (items.length === 0 && existingIds.length > 0) {
              console.warn(`🛡️ Blocked bulk deletion of ALL rows in ${table} during settings save`);
              return;
            }

            await supabaseSettings.upsertSettings(table, businessId, items);
            await supabaseSettings.deleteSettings(table, businessId, removed);
          };

          await Promise.all([
            syncTable('order_statuses', orderStatuses),
            syncTable('sale_sources', saleSources),
            syncTable('custom_services', customServices),
            syncTable('payment_methods', paymentMethods),
            syncTable('logistics_carriers', logisticsCarriers),
            syncTable('product_variables', productVariables),
            syncTable('expense_categories', expenseCategories),
            syncTable('case_statuses', caseStatuses),
            syncTable('product_categories', categoryItems),
            supabaseSettings.upsertSettings('business_settings', businessId, businessSettings),
          ]);

          return { success: true };
        } catch (err) {
          console.warn('Global settings save failed:', err);
          return { success: false, error: 'Failed to sync settings.' };
        }
      },

      // Customers (CRM)
      addCustomer: async (customer, businessId) => {
        set({ customers: [...get().customers, customer] });
        if (businessId) {
          supabaseData
            .upsertCollection('customers', businessId, [customer])
            .catch((error) => console.warn('Supabase customer add failed:', error));
        }
      },
      updateCustomer: (id, updates) => set({
        customers: get().customers.map((c) => c.id === id ? { ...c, ...updates } : c),
      }),
      deleteCustomer: (id, businessId) => {
        const deletedCustomer = get().customers.find((c) => c.id === id);
        const deletedCustomerItem = deletedCustomer
          ? createDeletedItem('customer', deletedCustomer.id, deletedCustomer.fullName || deletedCustomer.phone || 'Customer', deletedCustomer)
          : null;
        set({
          customers: get().customers.filter((c) => c.id !== id),
          recycleBin: deletedCustomerItem
            ? [deletedCustomerItem, ...get().recycleBin]
            : get().recycleBin,
        });

        if (!businessId) return;
        void Promise.all([
          supabaseData.deleteByIds('customers', businessId, [id]),
          deletedCustomerItem ? persistDeletedItemsToSupabase(businessId, [deletedCustomerItem]) : Promise.resolve(),
        ]).catch((error) => console.warn('Supabase customer delete failed:', error));
      },

      // Products
      addProduct: async (product, businessId) => {
        console.log('➕ Adding product:', product.name, 'ID:', product.id);
        const previousProducts = get().products;
        set({ products: [...previousProducts, product] });

        if (!businessId) return;
        try {
          await supabaseData.upsertCollection('products', businessId, [product]);
        } catch (error) {
          set({ products: previousProducts });
          console.warn('Supabase product create failed:', error);
          throw error;
        }
      },
      addProductsBulk: async (productsToAdd, businessId) => {
        if (!productsToAdd.length) return;

        const previousProducts = get().products;
        set({ products: [...previousProducts, ...productsToAdd] });

        if (!businessId) return;
        try {
          await supabaseData.upsertCollection('products', businessId, productsToAdd);
        } catch (error) {
          set({ products: previousProducts });
          console.warn('Supabase product bulk create failed:', error);
          throw error;
        }
      },
      updateProduct: async (id, updates, businessId) => {
        const previousProducts = get().products;
        const nextProducts = previousProducts.map((p) => p.id === id ? { ...p, ...updates } : p);
        set({
          products: nextProducts,
        });

        if (!businessId) return;
        const updated = nextProducts.find((p) => p.id === id);
        if (!updated) return;
        try {
          await supabaseData.upsertCollection('products', businessId, [updated]);
        } catch (error) {
          set({ products: previousProducts });
          console.warn('Supabase product update failed:', error);
          throw error;
        }
      },
      deleteProduct: async (id, businessId) => {
        const previousProducts = get().products;
        const deletedProduct = previousProducts.find((p) => p.id === id);
        const previousRecycleBin = get().recycleBin;
        const deletedProductItem = deletedProduct
          ? createDeletedItem('product', deletedProduct.id, deletedProduct.name, deletedProduct)
          : null;
        set({
          products: previousProducts.filter((p) => p.id !== id),
          recycleBin: deletedProductItem
            ? [deletedProductItem, ...previousRecycleBin]
            : previousRecycleBin,
        });

        if (!businessId) return;
        try {
          if (deletedProductItem) {
            await persistDeletedItemsToSupabase(businessId, [deletedProductItem]).catch((error) => {
              console.warn('Supabase recycle bin product snapshot failed:', error);
            });
          }
          await supabaseData.deleteByIds('products', businessId, [id]);
        } catch (error) {
          set({ products: previousProducts, recycleBin: previousRecycleBin });
          if (deletedProductItem) {
            await deleteDeletedItemsFromSupabase(businessId, [deletedProductItem.id]).catch((recoveryError) => {
              console.warn('Supabase recycle bin product cleanup failed:', recoveryError);
            });
          }
          console.warn('Supabase product delete failed:', error);
          throw error;
        }
      },
      addProductVariable: (variable) => set({ productVariables: [...get().productVariables, variable] }),
      updateProductVariable: (id, updates) => set({
        productVariables: get().productVariables.map((v) => v.id === id ? { ...v, ...updates } : v),
      }),
      deleteProductVariable: (id, businessId) => {
        set({ productVariables: get().productVariables.filter((v) => v.id !== id) });
        if (!businessId) return;
        supabaseSettings
          .deleteSettings('product_variables', businessId, [id])
          .catch((error) => console.warn('Supabase product variable delete failed:', error));
      },
      updateVariantStock: async (productId, variantId, delta, businessId) => {
        const previousProducts = get().products;
        const nextProducts = previousProducts.map((product) => (
          product.id === productId
            ? {
              ...product,
              variants: product.variants.map((variant) => (
                variant.id === variantId
                  ? { ...variant, stock: Math.max(0, variant.stock + delta) }
                  : variant
              )),
            }
            : product
        ));

        set({ products: nextProducts });

        if (!businessId) return;
        const updatedProduct = nextProducts.find((product) => product.id === productId);
        if (!updatedProduct) return;
        try {
          await supabaseData.upsertCollection('products', businessId, [updatedProduct]);
        } catch (error) {
          set({ products: previousProducts });
          console.warn('Supabase variant stock update failed:', error);
          throw error;
        }
      },

      addProductVariant: (productId, variant) => set({
        products: get().products.map((p) =>
          p.id === productId
            ? { ...p, variants: [...p.variants, variant] }
            : p
        ),
      }),

      updateProductVariant: (productId, variantId, updates) => set({
        products: get().products.map((p) =>
          p.id === productId
            ? {
              ...p,
              variants: p.variants.map((v) =>
                v.id === variantId ? { ...v, ...updates } : v
              ),
            }
            : p
        ),
      }),

      deleteProductVariant: (productId, variantId) => set({
        products: get().products.map((p) =>
          p.id === productId
            ? { ...p, variants: p.variants.filter((v) => v.id !== variantId) }
            : p
        ),
      }),

      // Warehouse
      addWarehouseItem: (item, businessId) => {
        const nextWarehouseItems = sanitizeWarehouseItems([
          ...get().warehouseItems.filter((existing) => existing.id !== item.id),
          item,
        ]);
        set({ warehouseItems: nextWarehouseItems });
        if (!businessId) return;
        persistWarehouseItemsToBusinessSettings(businessId, nextWarehouseItems)
          .catch((error) => console.warn('Supabase warehouse item add failed:', error));
      },
      updateWarehouseItem: (id, updates, businessId) => {
        const nextWarehouseItems = sanitizeWarehouseItems(
          get().warehouseItems.map((item) => (
            item.id === id
              ? {
                ...item,
                ...updates,
                updatedAt: new Date().toISOString(),
              }
              : item
          ))
        );
        set({ warehouseItems: nextWarehouseItems });
        if (!businessId) return;
        persistWarehouseItemsToBusinessSettings(businessId, nextWarehouseItems)
          .catch((error) => console.warn('Supabase warehouse item update failed:', error));
      },
      deleteWarehouseItem: (id, businessId) => {
        const nextWarehouseItems = sanitizeWarehouseItems(
          get().warehouseItems.filter((item) => item.id !== id)
        );
        set({ warehouseItems: nextWarehouseItems });
        if (!businessId) return;
        persistWarehouseItemsToBusinessSettings(businessId, nextWarehouseItems)
          .catch((error) => console.warn('Supabase warehouse item delete failed:', error));
      },
      recordWarehouseCount: (id, payload, businessId) => {
        const nowIso = new Date().toISOString();
        const countedAt = payload.countedAt ?? nowIso;
        const normalizedQuantity = Math.max(0, Number(payload.quantity ?? 0));
        const nextWarehouseItems = sanitizeWarehouseItems(
          get().warehouseItems.map((item) => {
            if (item.id !== id) return item;
            const nextHistory = [
              ...(item.countHistory ?? []),
              {
                id: generateId(),
                quantity: normalizedQuantity,
                countedAt,
                countedBy: payload.countedBy?.trim() || undefined,
                notes: payload.notes?.trim() || undefined,
              },
            ]
              .sort((a, b) => new Date(b.countedAt).getTime() - new Date(a.countedAt).getTime())
              .slice(0, 60);
            return {
              ...item,
              currentStock: normalizedQuantity,
              lastCountedAt: countedAt,
              lastCountedBy: payload.countedBy?.trim() || item.lastCountedBy,
              updatedAt: nowIso,
              countHistory: nextHistory,
            };
          })
        );
        set({ warehouseItems: nextWarehouseItems });
        if (!businessId) return;
        persistWarehouseItemsToBusinessSettings(businessId, nextWarehouseItems)
          .catch((error) => console.warn('Supabase warehouse count update failed:', error));
      },
      addWarehouseCategory: (name, businessId) => {
        const normalized = normalizeWarehouseOptionName(name);
        if (!normalized) return;
        const existing = get().warehouseCategories;
        if (existing.some((item) => item.name.toLowerCase() === normalized.toLowerCase())) return;
        const nextWarehouseCategories = sanitizeWarehouseOptions(
          [...existing, { id: `warehouse-category-${slugify(normalized) || generateId()}`, name: normalized }],
          initialWarehouseCategories
        );
        const nextWarehouseUnits = sanitizeWarehouseOptions(get().warehouseUnits, initialWarehouseUnits);
        set({ warehouseCategories: nextWarehouseCategories });
        if (!businessId) return;
        persistWarehousePreferencesToBusinessSettings(businessId, {
          warehouseCategories: nextWarehouseCategories,
          warehouseUnits: nextWarehouseUnits,
        }).catch((error) => console.warn('Supabase warehouse category add failed:', error));
      },
      updateWarehouseCategory: (id, name, businessId) => {
        const normalized = normalizeWarehouseOptionName(name);
        if (!normalized) return;
        const existing = get().warehouseCategories;
        if (existing.some((item) => item.id !== id && item.name.toLowerCase() === normalized.toLowerCase())) return;
        const nextWarehouseCategories = sanitizeWarehouseOptions(
          existing.map((item) => (item.id === id ? { ...item, name: normalized } : item)),
          initialWarehouseCategories
        );
        const nextWarehouseUnits = sanitizeWarehouseOptions(get().warehouseUnits, initialWarehouseUnits);
        set({ warehouseCategories: nextWarehouseCategories });
        if (!businessId) return;
        persistWarehousePreferencesToBusinessSettings(businessId, {
          warehouseCategories: nextWarehouseCategories,
          warehouseUnits: nextWarehouseUnits,
        }).catch((error) => console.warn('Supabase warehouse category update failed:', error));
      },
      deleteWarehouseCategory: (id, businessId) => {
        const nextWarehouseCategories = sanitizeWarehouseOptions(
          get().warehouseCategories.filter((item) => item.id !== id),
          initialWarehouseCategories
        );
        const nextWarehouseUnits = sanitizeWarehouseOptions(get().warehouseUnits, initialWarehouseUnits);
        set({ warehouseCategories: nextWarehouseCategories });
        if (!businessId) return;
        persistWarehousePreferencesToBusinessSettings(businessId, {
          warehouseCategories: nextWarehouseCategories,
          warehouseUnits: nextWarehouseUnits,
        }).catch((error) => console.warn('Supabase warehouse category delete failed:', error));
      },
      addWarehouseUnit: (name, businessId) => {
        const normalized = normalizeWarehouseOptionName(name);
        if (!normalized) return;
        const existing = get().warehouseUnits;
        if (existing.some((item) => item.name.toLowerCase() === normalized.toLowerCase())) return;
        const nextWarehouseUnits = sanitizeWarehouseOptions(
          [...existing, { id: `warehouse-unit-${slugify(normalized) || generateId()}`, name: normalized }],
          initialWarehouseUnits
        );
        const nextWarehouseCategories = sanitizeWarehouseOptions(get().warehouseCategories, initialWarehouseCategories);
        set({ warehouseUnits: nextWarehouseUnits });
        if (!businessId) return;
        persistWarehousePreferencesToBusinessSettings(businessId, {
          warehouseCategories: nextWarehouseCategories,
          warehouseUnits: nextWarehouseUnits,
        }).catch((error) => console.warn('Supabase warehouse unit add failed:', error));
      },
      deleteWarehouseUnit: (id, businessId) => {
        const nextWarehouseUnits = sanitizeWarehouseOptions(
          get().warehouseUnits.filter((item) => item.id !== id),
          initialWarehouseUnits
        );
        const nextWarehouseCategories = sanitizeWarehouseOptions(get().warehouseCategories, initialWarehouseCategories);
        set({ warehouseUnits: nextWarehouseUnits });
        if (!businessId) return;
        persistWarehousePreferencesToBusinessSettings(businessId, {
          warehouseCategories: nextWarehouseCategories,
          warehouseUnits: nextWarehouseUnits,
        }).catch((error) => console.warn('Supabase warehouse unit delete failed:', error));
      },

      // Orders
      addOrder: async (order, businessId) => {
        const statusConfig = get().orderStatuses.find(
          (status) => status.name.trim().toLowerCase() === order.status.trim().toLowerCase()
        );
        const normalizedOrder = normalizeOrderAddressFields({
          ...order,
          ...buildSharedOrderTrackingFields(order.status, statusConfig),
        });
        const previousOrders = get().orders;
        set({ orders: [...previousOrders, normalizedOrder] });
        if (!businessId) {
          throw new Error('No business selected for order sync.');
        }
        try {
          await supabaseData.upsertCollection('orders', businessId, [normalizedOrder]);
        } catch (error) {
          set({ orders: previousOrders });
          console.warn('Supabase order add failed:', error);
          throw error;
        }
      },
      updateOrder: async (id, updates, businessId) => {
        const previousOrder = get().orders.find((o) => o.id === id);
        const nextStatus = typeof updates.status === 'string' ? updates.status.trim() : '';
        const matchedStatusConfig = nextStatus
          ? get().orderStatuses.find((status) => status.name.trim().toLowerCase() === nextStatus.toLowerCase())
          : undefined;
        const shouldSyncWooStatus = Boolean(
          businessId
          && previousOrder
          && nextStatus
          && nextStatus !== previousOrder.status
          && updates.updatedBy !== 'WooCommerce Sync'
        );
        const isDeliveryConfirmationStatus = (status?: string) => {
          const normalized = status?.trim().toLowerCase();
          return normalized === 'delivery confirmation';
        };
        const shouldTryDeliveryConfirmationEmail = Boolean(
          businessId
          && previousOrder
          && nextStatus
          && nextStatus !== previousOrder.status
          && (
            matchedStatusConfig?.wooCommerceStatusSlug === 'delivery-confirm'
            || isDeliveryConfirmationStatus(nextStatus)
          )
          && updates.updatedBy !== 'WooCommerce Sync'
        );
        const shouldForceDeliveryConfirmationEmail = Boolean(
          businessId
          && previousOrder
          && updates.deliveryConfirmationRequestedAt
          && updates.deliveryConfirmationRequestedAt !== previousOrder.deliveryConfirmationRequestedAt
          && (
            isDeliveryConfirmationStatus(nextStatus)
            || isDeliveryConfirmationStatus(previousOrder.status)
            || matchedStatusConfig?.wooCommerceStatusSlug === 'delivery-confirm'
          )
          && updates.updatedBy !== 'WooCommerce Sync'
        );
        const shouldSendOrderStatusChangeEmail = Boolean(
          get().orderStatusEmailEnabled
          && businessId
          && previousOrder
          && nextStatus
          && nextStatus !== previousOrder.status
          && !shouldTryDeliveryConfirmationEmail
          && !shouldForceDeliveryConfirmationEmail
          && updates.updatedBy !== 'WooCommerce Sync'
        );
        const appendSystemOrderActivity = async (orderId: string, action: string) => {
          const currentOrder = get().orders.find((o) => o.id === orderId);
          if (!currentOrder || !businessId) return;

          const nextOrder = {
            ...currentOrder,
            updatedAt: new Date().toISOString(),
            activityLog: [
              ...(currentOrder.activityLog ?? []),
              {
                staffName: 'System',
                action,
                date: new Date().toISOString(),
              },
            ],
          };

          set({
            orders: get().orders.map((order) => (
              order.id === orderId ? nextOrder : order
            )),
          });

          try {
            await supabaseData.upsertCollection('orders', businessId, [nextOrder]);
          } catch (error) {
            console.warn('Supabase WooCommerce activity log update failed:', error);
          }
        };

        set({
          orders: get().orders.map((o) => {
            if (o.id !== id) return o;
            const sharedTrackingFields = nextStatus
              ? buildSharedOrderTrackingFields(nextStatus, matchedStatusConfig)
              : {};
            const merged = normalizeOrderAddressFields({
              ...o,
              ...updates,
              ...sharedTrackingFields,
              updatedAt: new Date().toISOString(),
            });
            // Auto-append to activity log when updatedBy is provided
            if (updates.updatedBy) {
              // Determine what was updated to create a specific action message
              let action = '';
              if (
                updates.deliveryConfirmationStatus === 'confirmed'
                && updates.deliveryConfirmationStatus !== o.deliveryConfirmationStatus
              ) {
                action = 'Customer confirmed delivery';
              } else if (
                updates.deliveryConfirmationStatus === 'pending'
                && updates.deliveryConfirmationStatus !== o.deliveryConfirmationStatus
              ) {
                action = 'Customer is still expecting delivery';
              } else if (
                updates.deliveryConfirmationRequestedAt
                && updates.deliveryConfirmationRequestedAt !== o.deliveryConfirmationRequestedAt
              ) {
                action = 'Sent delivery confirmation email';
              } else if (updates.status && updates.status !== o.status) {
                action = `Updated status to ${updates.status}`;
              } else if (updates.fulfillmentStage && updates.fulfillmentStage !== o.fulfillmentStage) {
                action = `Updated fulfillment to ${updates.fulfillmentStage}`;
              } else if (updates.logistics) {
                action = 'Updated logistics';
              } else if (updates.prescription) {
                action = 'Updated prescription';
              } else if (updates.refund) {
                action = 'Processed refund';
              } else if (updates.customerName || updates.customerPhone || updates.deliveryAddress || updates.deliveryState) {
                action = 'Updated customer details';
              } else if (updates.items) {
                action = 'Updated order items';
              } else {
                // Fallback for other updates (notes, payment, etc.)
                action = 'Updated order';
              }

              const entry: OrderActivityEntry = {
                staffName: updates.updatedBy,
                action,
                date: new Date().toISOString(),
              };
              merged.activityLog = [...(o.activityLog || []), entry];
            }
            return merged;
          }),
        });
        if (businessId) {
          const updated = get().orders.find((o) => o.id === id);
          if (updated) {
            supabaseData
              .upsertCollection('orders', businessId, [updated])
              .then(async () => {
                if (shouldTryDeliveryConfirmationEmail || shouldForceDeliveryConfirmationEmail) {
                  try {
                    const { error } = await supabase.functions.invoke('send-delivery-followup', {
                      body: {
                        type: 'delivery_followup_status_trigger',
                        businessId,
                        orderId: id,
                        forceSend: true,
                      },
                    });

                    if (error) {
                      throw error;
                    }

                    await appendSystemOrderActivity(id, 'Sent delivery confirmation email after status changed to Delivery Confirmation');
                  } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    await appendSystemOrderActivity(id, `Delivery confirmation status email trigger failed: ${message}`);
                    console.warn('Delivery confirmation status email trigger failed:', error);
                  }
                }

                if (shouldSendOrderStatusChangeEmail) {
                  try {
                    const { error } = await supabase.functions.invoke('send-order-status-email', {
                      body: {
                        businessId,
                        orderId: id,
                        previousStatus: previousOrder?.status ?? '',
                        newStatus: nextStatus,
                      },
                    });

                    if (error) {
                      throw error;
                    }

                    await appendSystemOrderActivity(id, `Sent order status update email for status changed to ${nextStatus}`);
                  } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    console.warn('Order status change email trigger failed:', message);
                  }
                }

                if (!shouldSyncWooStatus) return;
                try {
                  const result = await syncFyllOrderStatusToWooCommerce({
                    businessId,
                    orderId: id,
                    status: nextStatus,
                  });

                  if (result.skipped) {
                    const silentSkipReasons = new Set([
                      'woocommerce-disabled',
                      'woocommerce-not-configured',
                      'missing-woocommerce-config',
                    ]);

                    if (result.reason && silentSkipReasons.has(result.reason)) {
                      return;
                    }

                    const details = [
                      `reason=${result.reason ?? 'unknown'}`,
                      result.debug?.fyllStatus ? `status=${result.debug.fyllStatus}` : null,
                      result.debug?.reference ? `reference=${result.debug.reference}` : null,
                      result.debug?.matchedBusinessId ? `business=${result.debug.matchedBusinessId}` : null,
                      result.debug?.matchedOrderBusinessId ? `orderBusiness=${result.debug.matchedOrderBusinessId}` : null,
                    ].filter(Boolean).join(', ');
                    await appendSystemOrderActivity(id, `Skipped WooCommerce staff status sync (${details})`);
                    return;
                  }

                  const details = [
                    `status=${result.updatedStatus}`,
                    result.debug?.reference ? `reference=${result.debug.reference}` : null,
                    result.order?.externalId ? `wooOrder=${result.order.externalId}` : null,
                  ].filter(Boolean).join(', ');
                  await appendSystemOrderActivity(id, `Synced WooCommerce staff status (${details})`);
                } catch (error) {
                  const message = error instanceof Error ? error.message : 'Unknown error';
                  await appendSystemOrderActivity(id, `WooCommerce staff status sync failed: ${message}`);
                  console.warn('WooCommerce staff status sync failed:', error);
                }
              })
              .catch((error) => console.warn('Supabase order update failed:', error));
          }
        }
      },
      cancelOrder: async (id, businessId, cancelledBy) => {
        const previousOrders = get().orders;
        const previousProducts = get().products;
        const previousOrderStatuses = get().orderStatuses;
        const orderToCancel = previousOrders.find((order) => order.id === id);

        if (!orderToCancel) return;

        const isAlreadyCancelled = (orderToCancel.status ?? '').toLowerCase().includes('cancel');
        const now = new Date().toISOString();
        const nextOrderStatuses = previousOrderStatuses.some((status) => status.name.trim().toLowerCase() === 'cancelled')
          ? previousOrderStatuses
          : [
            ...previousOrderStatuses,
            {
              id: 'order-status-cancelled',
              name: 'Cancelled',
              color: '#6B7280',
              order: previousOrderStatuses.length + 1,
              trackingStage: 'cancelled' as OrderTrackingStage,
            },
          ];

        const stockAdjustments = new Map<string, Map<string, number>>();
        if (!isAlreadyCancelled) {
          orderToCancel.items.forEach((item) => {
            const product = previousProducts.find((candidate) => candidate.id === item.productId);
            if (!product || product.productType === 'service') return;

            const existingProductAdjustments = stockAdjustments.get(item.productId) ?? new Map<string, number>();
            existingProductAdjustments.set(
              item.variantId,
              (existingProductAdjustments.get(item.variantId) ?? 0) + item.quantity
            );
            stockAdjustments.set(item.productId, existingProductAdjustments);
          });
        }

        const nextProducts = previousProducts.map((product) => {
          const productAdjustments = stockAdjustments.get(product.id);
          if (!productAdjustments) return product;

          return {
            ...product,
            variants: product.variants.map((variant) => {
              const restoreQty = productAdjustments.get(variant.id) ?? 0;
              if (!restoreQty) return variant;
              return {
                ...variant,
                stock: Math.max(0, variant.stock + restoreQty),
              };
            }),
          };
        });

        const restoredProducts = nextProducts.filter((product) => stockAdjustments.has(product.id));
        const previousRestoredProducts = previousProducts.filter((product) => stockAdjustments.has(product.id));
        const nextOrders = previousOrders.map((order) => {
          if (order.id !== id) return order;

          const nextActivityLog = cancelledBy
            ? [
              ...(order.activityLog ?? []),
              {
                staffName: cancelledBy,
                action: 'Cancelled order',
                date: now,
              },
            ]
            : order.activityLog;

          return {
            ...order,
            status: 'Cancelled',
            ...buildSharedOrderTrackingFields('Cancelled', {
              name: 'Cancelled',
              trackingStage: 'cancelled',
            }),
            updatedAt: now,
            updatedBy: cancelledBy ?? order.updatedBy,
            activityLog: nextActivityLog,
          };
        });

        const cancelledOrder = nextOrders.find((order) => order.id === id);
        if (!cancelledOrder) return;

        set({
          orders: nextOrders,
          products: nextProducts,
          orderStatuses: nextOrderStatuses,
        });

        if (!businessId) return;
        try {
          const syncTasks: Promise<unknown>[] = [
            supabaseData.upsertCollection('orders', businessId, [cancelledOrder]),
          ];

          if (restoredProducts.length > 0) {
            syncTasks.push(supabaseData.upsertCollection('products', businessId, restoredProducts));
          }

          if (nextOrderStatuses !== previousOrderStatuses) {
            syncTasks.push(supabaseSettings.upsertSettings('order_statuses', businessId, nextOrderStatuses));
          }

          await Promise.all(syncTasks);
        } catch (error) {
          set({
            orders: previousOrders,
            products: previousProducts,
            orderStatuses: previousOrderStatuses,
          });

          await Promise.all([
            supabaseData.upsertCollection('orders', businessId, [orderToCancel]).catch((recoveryError) => {
              console.warn('Supabase order cancel recovery failed:', recoveryError);
            }),
            previousRestoredProducts.length > 0
              ? supabaseData.upsertCollection('products', businessId, previousRestoredProducts).catch((recoveryError) => {
                console.warn('Supabase cancelled stock recovery failed:', recoveryError);
              })
              : Promise.resolve(),
            nextOrderStatuses !== previousOrderStatuses
              ? supabaseSettings.upsertSettings('order_statuses', businessId, previousOrderStatuses).catch((recoveryError) => {
                console.warn('Supabase order status cancel recovery failed:', recoveryError);
              })
              : Promise.resolve(),
          ]);

          console.warn('Supabase order cancel failed:', error);
          throw error;
        }
      },
      deleteOrder: async (id, businessId) => {
        const previousOrders = get().orders;
        const previousProducts = get().products;
        const previousRecycleBin = get().recycleBin;
        const orderToDelete = previousOrders.find((order) => order.id === id);

        if (!orderToDelete) return;

        const stockAdjustments = new Map<string, Map<string, number>>();
        orderToDelete.items.forEach((item) => {
          const product = previousProducts.find((candidate) => candidate.id === item.productId);
          if (!product || product.productType === 'service') return;

          const existingProductAdjustments = stockAdjustments.get(item.productId) ?? new Map<string, number>();
          existingProductAdjustments.set(
            item.variantId,
            (existingProductAdjustments.get(item.variantId) ?? 0) + item.quantity
          );
          stockAdjustments.set(item.productId, existingProductAdjustments);
        });

        const nextProducts = previousProducts.map((product) => {
          const productAdjustments = stockAdjustments.get(product.id);
          if (!productAdjustments) return product;

          return {
            ...product,
            variants: product.variants.map((variant) => {
              const restoreQty = productAdjustments.get(variant.id) ?? 0;
              if (!restoreQty) return variant;
              return {
                ...variant,
                stock: Math.max(0, variant.stock + restoreQty),
              };
            }),
          };
        });

        const restoredProducts = nextProducts.filter((product) => stockAdjustments.has(product.id));
        const previousRestoredProducts = previousProducts.filter((product) => stockAdjustments.has(product.id));
        const nextOrders = previousOrders.filter((order) => order.id !== id);
        const deletedOrderItem = createDeletedItem(
          'order',
          orderToDelete.id,
          orderToDelete.orderNumber || orderToDelete.customerName || 'Order',
          orderToDelete
        );

        set({
          orders: nextOrders,
          products: nextProducts,
          recycleBin: [deletedOrderItem, ...previousRecycleBin],
        });

        if (!businessId) return;
        try {
          if (restoredProducts.length > 0) {
            await supabaseData.upsertCollection('products', businessId, restoredProducts);
          }
          await persistDeletedItemsToSupabase(businessId, [deletedOrderItem]).catch((error) => {
            console.warn('Supabase recycle bin order snapshot failed:', error);
          });
          await supabaseData.deleteByIds('orders', businessId, [id]);
        } catch (error) {
          set({
            orders: previousOrders,
            products: previousProducts,
            recycleBin: previousRecycleBin,
          });

          await Promise.all([
            supabaseData.upsertCollection('orders', businessId, [orderToDelete]).catch((recoveryError) => {
              console.warn('Supabase order delete recovery failed:', recoveryError);
            }),
            previousRestoredProducts.length > 0
              ? supabaseData.upsertCollection('products', businessId, previousRestoredProducts).catch((recoveryError) => {
                console.warn('Supabase stock restore recovery failed:', recoveryError);
              })
              : Promise.resolve(),
            deleteDeletedItemsFromSupabase(businessId, [deletedOrderItem.id]).catch((recoveryError) => {
              console.warn('Supabase recycle bin order cleanup failed:', recoveryError);
            }),
          ]);

          console.warn('Supabase order delete failed:', error);
          throw error;
        }
      },
      addOrderStatus: (status) => set({ orderStatuses: [...get().orderStatuses, sanitizeOrderStatus(status, get().orderStatuses.length)] }),
      updateOrderStatus: (id, updates) => set({
        orderStatuses: get().orderStatuses.map((s, index) => (
          s.id === id ? sanitizeOrderStatus({ ...s, ...updates }, index) : sanitizeOrderStatus(s, index)
        )),
      }),
      reorderOrderStatuses: (orderedIds) => set((state) => {
        const byId = new Map(state.orderStatuses.map((status) => [status.id, status]));
        const ordered = orderedIds
          .map((id) => byId.get(id))
          .filter((status): status is OrderStatus => Boolean(status));
        const orderedIdSet = new Set(orderedIds);
        const remaining = state.orderStatuses
          .filter((status) => !orderedIdSet.has(status.id))
          .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

        return {
          orderStatuses: [...ordered, ...remaining].map((status, index) => (
            sanitizeOrderStatus({ ...status, order: index + 1 }, index)
          )),
        };
      }),
      deleteOrderStatus: (id, businessId) => {
        set({ orderStatuses: get().orderStatuses.filter((s) => s.id !== id) });
        if (!businessId) return;
        supabaseSettings
          .deleteSettings('order_statuses', businessId, [id])
          .catch((error) => console.warn('Supabase order status delete failed:', error));
      },
      addQcChecklistRequirement: (label) => {
        const trimmedLabel = label.trim();
        if (!trimmedLabel) return;
        set((state) => {
          const current = sanitizeOrderQcRequirements(state.qcChecklistRequirements, false);
          const exists = current.some((item) => item.label.trim().toLowerCase() === trimmedLabel.toLowerCase());
          if (exists) return state;
          return {
            qcChecklistRequirements: sanitizeOrderQcRequirements([
              ...current,
              buildOrderQcRequirement(trimmedLabel, current),
            ], false),
          };
        });
      },
      deleteQcChecklistRequirement: (key) => set((state) => ({
        qcChecklistRequirements: sanitizeOrderQcRequirements(
          state.qcChecklistRequirements.filter((item) => item.key !== key),
          false
        ),
      })),
      resetQcChecklistRequirements: () => set({
        qcChecklistRequirements: DEFAULT_ORDER_QC_REQUIREMENTS,
      }),
      addSaleSource: (source) => set({ saleSources: [...get().saleSources, source] }),
      updateSaleSource: (id, updates) => set({
        saleSources: get().saleSources.map((s) => s.id === id ? { ...s, ...updates } : s),
      }),
      deleteSaleSource: (id, businessId) => {
        set({ saleSources: get().saleSources.filter((s) => s.id !== id) });
        if (!businessId) return;
        supabaseSettings
          .deleteSettings('sale_sources', businessId, [id])
          .catch((error) => console.warn('Supabase sale source delete failed:', error));
      },

      // Custom Services
      addCustomService: (service) => set({ customServices: [...get().customServices, service] }),
      updateCustomService: (id, updates) => set({
        customServices: get().customServices.map((s) => s.id === id ? { ...s, ...updates } : s),
      }),
      deleteCustomService: (id, businessId) => {
        set({ customServices: get().customServices.filter((s) => s.id !== id) });
        if (!businessId) return;
        supabaseSettings
          .deleteSettings('custom_services', businessId, [id])
          .catch((error) => console.warn('Supabase custom service delete failed:', error));
      },
      updateOrderTimelineSettings: (settings) => set({
        orderTimelineSettings: sanitizeOrderTimelineSettings(settings),
      }),
      saveOrderTimelineSettings: async (settings, businessId) => {
        const sanitized = sanitizeOrderTimelineSettings(settings);

        if (!businessId) {
          return { success: false, error: 'No business selected.' };
        }

        const previousSettings = get().orderTimelineSettings;
        set({ orderTimelineSettings: sanitized });

        try {
          await persistOrderTimelineSettingsToBusinessSettings(businessId, sanitized);
          return { success: true };
        } catch (error) {
          console.warn('Supabase order timeline settings save failed:', error);
          set({ orderTimelineSettings: previousSettings });
          return { success: false, error: 'Failed to sync settings.' };
        }
      },

      // Payment Methods
      addPaymentMethod: (method) => set({ paymentMethods: [...get().paymentMethods, method] }),
      updatePaymentMethod: (id, updates, businessId) => {
        const previousMethod = get().paymentMethods.find((method) => method.id === id);
        const previousName = previousMethod?.name?.trim();
        const nextName = updates.name?.trim();
        const shouldCascadeOrderRename = Boolean(previousName && nextName && previousName !== nextName);
        const now = new Date().toISOString();
        let renamedOrders: Order[] = [];

        set({
          paymentMethods: get().paymentMethods.map((m) => m.id === id ? { ...m, ...updates } : m),
          orders: shouldCascadeOrderRename
            ? get().orders.map((order) => {
              if (order.paymentMethod.trim().toLowerCase() !== previousName!.toLowerCase()) return order;
              const renamedOrder = {
                ...order,
                paymentMethod: nextName!,
                updatedAt: now,
              };
              renamedOrders.push(renamedOrder);
              return renamedOrder;
            })
            : get().orders,
        });

        if (businessId && renamedOrders.length > 0) {
          supabaseData
            .upsertCollection('orders', businessId, renamedOrders)
            .catch((error) => console.warn('Supabase payment method cascade update failed:', error));
        }
      },
      bulkRenameOrderPaymentMethod: (fromName, toName, businessId) => {
        const normalizedFromName = fromName.trim();
        const normalizedToName = toName.trim();
        if (!normalizedFromName || !normalizedToName || normalizedFromName.toLowerCase() === normalizedToName.toLowerCase()) return;

        const now = new Date().toISOString();
        const renamedOrders: Order[] = [];
        set({
          orders: get().orders.map((order) => {
            if (order.paymentMethod.trim().toLowerCase() !== normalizedFromName.toLowerCase()) return order;
            const renamedOrder = {
              ...order,
              paymentMethod: normalizedToName,
              updatedAt: now,
            };
            renamedOrders.push(renamedOrder);
            return renamedOrder;
          }),
        });

        if (businessId && renamedOrders.length > 0) {
          supabaseData
            .upsertCollection('orders', businessId, renamedOrders)
            .catch((error) => console.warn('Supabase payment method bulk rename failed:', error));
        }
      },
      deletePaymentMethod: (id, businessId) => {
        set({ paymentMethods: get().paymentMethods.filter((m) => m.id !== id) });
        if (!businessId) return;
        supabaseSettings
          .deleteSettings('payment_methods', businessId, [id])
          .catch((error) => console.warn('Supabase payment method delete failed:', error));
      },

      // Logistics Carriers
      addLogisticsCarrier: (carrier) => set({ logisticsCarriers: [...get().logisticsCarriers, carrier] }),
      updateLogisticsCarrier: (id, updates) => set({
        logisticsCarriers: get().logisticsCarriers.map((c) => c.id === id ? { ...c, ...updates } : c),
      }),
      deleteLogisticsCarrier: (id, businessId) => {
        set({ logisticsCarriers: get().logisticsCarriers.filter((c) => c.id !== id) });
        if (!businessId) return;
        supabaseSettings
          .deleteSettings('logistics_carriers', businessId, [id])
          .catch((error) => console.warn('Supabase logistics carrier delete failed:', error));
      },

      // Procurement
      addProcurement: (procurement, businessId) => {
        set({ procurements: [...get().procurements, procurement] });
        if (!businessId) return;
        supabaseData
          .upsertCollection('procurements', businessId, [procurement])
          .catch((error) => console.warn('Supabase procurement add failed:', error));
      },
      updateProcurement: (id, updates, businessId) => {
        const existingProcurement = get().procurements.find((p) => p.id === id);
        const removedItems = existingProcurement && updates.items && updates.items.length < existingProcurement.items.length
          ? findRemovedProcurementItems(existingProcurement.items, updates.items)
          : [];
        const deletedProcurementItems = removedItems.length && existingProcurement
          ? removedItems.map(({ item, index }) => createDeletedItem(
              'procurement-item',
              `${id}:${index}:${Date.now().toString(36)}`,
              item.productName || item.variantName || `Procurement line ${index + 1}`,
              item,
              { id, label: existingProcurement.title || existingProcurement.supplierName || id }
            ))
          : [];
        set({
          procurements: get().procurements.map((p) => p.id === id ? { ...p, ...updates } : p),
          recycleBin: deletedProcurementItems.length
            ? [
                ...deletedProcurementItems,
                ...get().recycleBin,
              ]
            : get().recycleBin,
        });
        if (!businessId) return;
        const updated = get().procurements.find((p) => p.id === id);
        if (!updated) return;
        if (deletedProcurementItems.length) {
          void persistDeletedItemsToSupabase(businessId, deletedProcurementItems).catch((error) => {
            console.warn('Supabase procurement line recycle bin sync failed:', error);
          });
        }
        supabaseData
          .upsertCollection('procurements', businessId, [updated])
          .catch((error) => console.warn('Supabase procurement update failed:', error));
      },
      deleteProcurement: (id, businessId) => {
        const deletedProcurement = get().procurements.find((p) => p.id === id);
        const deletedProcurementItem = deletedProcurement
          ? createDeletedItem('procurement', deletedProcurement.id, deletedProcurement.title || deletedProcurement.supplierName || 'Procurement', deletedProcurement)
          : null;
        set({
          procurements: get().procurements.filter((p) => p.id !== id),
          recycleBin: deletedProcurementItem
            ? [deletedProcurementItem, ...get().recycleBin]
            : get().recycleBin,
        });
        if (!businessId) return;
        void Promise.all([
          supabaseData.deleteByIds('procurements', businessId, [id]),
          deletedProcurementItem ? persistDeletedItemsToSupabase(businessId, [deletedProcurementItem]) : Promise.resolve(),
        ]).catch((error) => console.warn('Supabase procurement delete failed:', error));
      },

      // Partners
      addPartner: (partner, businessId) => {
        set({ partners: [...get().partners, partner] });
        if (!businessId) return;
        supabaseData
          .upsertCollection('partners', businessId, [partner])
          .catch((error) => console.warn('Supabase partner add failed:', error));
      },
      updatePartner: (id, updates, businessId) => {
        set({ partners: get().partners.map((p) => p.id === id ? { ...p, ...updates } : p) });
        if (!businessId) return;
        const updated = get().partners.find((p) => p.id === id);
        if (!updated) return;
        supabaseData
          .upsertCollection('partners', businessId, [updated])
          .catch((error) => console.warn('Supabase partner update failed:', error));
      },
      deletePartner: (id, businessId) => {
        const deletedPartner = get().partners.find((p) => p.id === id);
        const deletedPartnerItem = deletedPartner
          ? createDeletedItem('partner', deletedPartner.id, deletedPartner.name || 'Partner', deletedPartner)
          : null;
        set({
          partners: get().partners.filter((p) => p.id !== id),
          recycleBin: deletedPartnerItem ? [deletedPartnerItem, ...get().recycleBin] : get().recycleBin,
        });
        if (!businessId) return;
        void Promise.all([
          supabaseData.deleteByIds('partners', businessId, [id]),
          deletedPartnerItem ? persistDeletedItemsToSupabase(businessId, [deletedPartnerItem]) : Promise.resolve(),
        ]).catch((error) => console.warn('Supabase partner delete failed:', error));
      },

      // Partner jobs
      addPartnerJob: (job, businessId) => {
        set({ partnerJobs: [...get().partnerJobs, job] });
        if (!businessId) return;
        supabaseData
          .upsertCollection('partner_jobs', businessId, [job])
          .catch((error) => console.warn('Supabase partner job add failed:', error));
      },
      updatePartnerJob: (id, updates, businessId) => {
        set({ partnerJobs: get().partnerJobs.map((j) => j.id === id ? { ...j, ...updates } : j) });
        if (!businessId) return;
        const updated = get().partnerJobs.find((j) => j.id === id);
        if (!updated) return;
        supabaseData
          .upsertCollection('partner_jobs', businessId, [updated])
          .catch((error) => console.warn('Supabase partner job update failed:', error));
      },
      deletePartnerJob: (id, businessId) => {
        const deletedJob = get().partnerJobs.find((j) => j.id === id);
        const deletedJobItem = deletedJob
          ? createDeletedItem('partner-job', deletedJob.id, deletedJob.customerName || 'Partner job', deletedJob)
          : null;
        set({
          partnerJobs: get().partnerJobs.filter((j) => j.id !== id),
          recycleBin: deletedJobItem ? [deletedJobItem, ...get().recycleBin] : get().recycleBin,
        });
        if (!businessId) return;
        void Promise.all([
          supabaseData.deleteByIds('partner_jobs', businessId, [id]),
          deletedJobItem ? persistDeletedItemsToSupabase(businessId, [deletedJobItem]) : Promise.resolve(),
        ]).catch((error) => console.warn('Supabase partner job delete failed:', error));
      },

      // Partner job issues
      addPartnerJobIssue: async (issue, businessId) => {
        set({ partnerJobIssues: [...get().partnerJobIssues, issue] });
        if (!businessId) return;
        try {
          await supabaseData.upsertCollection('partner_job_issues', businessId, [issue]);
        } catch (error) {
          console.warn('Supabase partner job issue add failed:', error);
          throw error;
        }
      },
      updatePartnerJobIssue: (id, updates, businessId) => {
        set({ partnerJobIssues: get().partnerJobIssues.map((i) => i.id === id ? { ...i, ...updates } : i) });
        if (!businessId) return;
        const updated = get().partnerJobIssues.find((i) => i.id === id);
        if (!updated) return;
        supabaseData
          .upsertCollection('partner_job_issues', businessId, [updated])
          .catch((error) => console.warn('Supabase partner job issue update failed:', error));
      },

      // Expenses
      addExpense: (expense, businessId) => {
        set({ expenses: [...get().expenses, expense] });
        if (!businessId) return;
        supabaseData
          .upsertCollection('expenses', businessId, [expense])
          .catch((error) => console.warn('Supabase expense add failed:', error));
      },
      updateExpense: (id, updates, businessId) => {
        set({
          expenses: get().expenses.map((e) => e.id === id ? { ...e, ...updates } : e),
        });
        if (!businessId) return;
        const updated = get().expenses.find((e) => e.id === id);
        if (!updated) return;
        supabaseData
          .upsertCollection('expenses', businessId, [updated])
          .catch((error) => console.warn('Supabase expense update failed:', error));
      },
      deleteExpense: (id, businessId) => {
        const deletedExpense = get().expenses.find((e) => e.id === id);
        const deletedExpenseItem = deletedExpense
          ? createDeletedItem('expense', deletedExpense.id, deletedExpense.description || deletedExpense.category || 'Expense', deletedExpense)
          : null;
        set({
          expenses: get().expenses.filter((e) => e.id !== id),
          recycleBin: deletedExpenseItem
            ? [deletedExpenseItem, ...get().recycleBin]
            : get().recycleBin,
        });
        if (!businessId) return;
        void Promise.all([
          supabaseData.deleteByIds('expenses', businessId, [id]),
          deletedExpenseItem ? persistDeletedItemsToSupabase(businessId, [deletedExpenseItem]) : Promise.resolve(),
        ]).catch((error) => console.warn('Supabase expense delete failed:', error));
      },
      addOtherIncome: async (income, businessId) => {
        const previousOtherIncomes = get().otherIncomes;
        set({ otherIncomes: [...previousOtherIncomes, income] });
        if (!businessId) return;
        try {
          await supabaseData.upsertCollection('other_incomes', businessId, [income]);
        } catch (error) {
          set({ otherIncomes: previousOtherIncomes });
          console.warn('Supabase other income add failed:', error);
          throw error;
        }
      },
      updateOtherIncome: async (id, updates, businessId) => {
        const previousOtherIncomes = get().otherIncomes;
        set({
          otherIncomes: previousOtherIncomes.map((income) => (
            income.id === id ? { ...income, ...updates } : income
          )),
        });
        if (!businessId) return;
        const updated = get().otherIncomes.find((income) => income.id === id);
        if (!updated) return;
        try {
          await supabaseData.upsertCollection('other_incomes', businessId, [updated]);
        } catch (error) {
          set({ otherIncomes: previousOtherIncomes });
          console.warn('Supabase other income update failed:', error);
          throw error;
        }
      },
      deleteOtherIncome: async (id, businessId) => {
        const previousOtherIncomes = get().otherIncomes;
        const previousRecycleBin = get().recycleBin;
        const deletedIncome = get().otherIncomes.find((income) => income.id === id);
        const deletedIncomeItem = deletedIncome
          ? createDeletedItem('other-income', deletedIncome.id, deletedIncome.title || deletedIncome.source || 'Other income', deletedIncome)
          : null;
        set({
          otherIncomes: previousOtherIncomes.filter((income) => income.id !== id),
          recycleBin: deletedIncomeItem
            ? [deletedIncomeItem, ...get().recycleBin]
            : get().recycleBin,
        });
        if (!businessId) return;
        try {
          if (deletedIncomeItem) {
            await persistDeletedItemsToSupabase(businessId, [deletedIncomeItem]).catch((error) => {
              console.warn('Supabase recycle bin other income snapshot failed:', error);
            });
          }
          await supabaseData.deleteByIds('other_incomes', businessId, [id]);
        } catch (error) {
          set({ otherIncomes: previousOtherIncomes, recycleBin: previousRecycleBin });
          if (deletedIncomeItem) {
            await deleteDeletedItemsFromSupabase(businessId, [deletedIncomeItem.id]).catch((recoveryError) => {
              console.warn('Supabase recycle bin other income cleanup failed:', recoveryError);
            });
          }
          console.warn('Supabase other income delete failed:', error);
          throw error;
        }
      },
      addExpenseRequest: (request, businessId) => {
        set({ expenseRequests: [...get().expenseRequests, request] });
        if (!businessId) return;
        supabaseData
          .upsertCollection('expense_requests', businessId, [request])
          .catch((error) => console.warn('Supabase expense request add failed:', error));
      },
      updateExpenseRequest: (id, updates, businessId) => {
        set({
          expenseRequests: get().expenseRequests.map((request) => (
            request.id === id
              ? { ...request, ...updates, updatedAt: updates.updatedAt ?? new Date().toISOString() }
              : request
          )),
        });
        if (!businessId) return;
        const updated = get().expenseRequests.find((request) => request.id === id);
        if (!updated) return;
        supabaseData
          .upsertCollection('expense_requests', businessId, [updated])
          .catch((error) => console.warn('Supabase expense request update failed:', error));
      },
      deleteExpenseRequest: (id, businessId) => {
        const deletedRequest = get().expenseRequests.find((request) => request.id === id);
        const deletedExpenseRequestItem = deletedRequest
          ? createDeletedItem('expense-request', deletedRequest.id, deletedRequest.title || deletedRequest.category || 'Expense request', deletedRequest)
          : null;
        set({
          expenseRequests: get().expenseRequests.filter((request) => request.id !== id),
          recycleBin: deletedExpenseRequestItem
            ? [deletedExpenseRequestItem, ...get().recycleBin]
            : get().recycleBin,
        });
        if (!businessId) return;
        void Promise.all([
          supabaseData.deleteByIds('expense_requests', businessId, [id]),
          deletedExpenseRequestItem ? persistDeletedItemsToSupabase(businessId, [deletedExpenseRequestItem]) : Promise.resolve(),
        ]).catch((error) => console.warn('Supabase expense request delete failed:', error));
      },
      addRefundRequest: async (request, businessId) => {
        const previousRefundRequests = get().refundRequests;
        set({ refundRequests: [...previousRefundRequests, request] });
        if (!businessId) return;
        try {
          await supabaseData.upsertCollection('refund_requests', businessId, [request]);
        } catch (error) {
          set({ refundRequests: previousRefundRequests });
          console.warn('Supabase refund request add failed:', error);
          throw error;
        }
      },
      updateRefundRequest: async (id, updates, businessId) => {
        const previousRefundRequests = get().refundRequests;
        const nextRefundRequests = previousRefundRequests.map((request) => (
          request.id === id
            ? { ...request, ...updates, updatedAt: updates.updatedAt ?? new Date().toISOString() }
            : request
        ));
        set({ refundRequests: nextRefundRequests });
        if (!businessId) return;
        const updated = nextRefundRequests.find((request) => request.id === id);
        if (!updated) return;
        try {
          await supabaseData.upsertCollection('refund_requests', businessId, [updated]);
        } catch (error) {
          set({ refundRequests: previousRefundRequests });
          console.warn('Supabase refund request update failed:', error);
          throw error;
        }
      },
      deleteRefundRequest: async (id, businessId) => {
        const previousRefundRequests = get().refundRequests;
        const previousRecycleBin = get().recycleBin;
        const deletedRequest = previousRefundRequests.find((request) => request.id === id);
        const deletedRefundRequestItem = deletedRequest
          ? createDeletedItem('refund-request', deletedRequest.id, deletedRequest.orderId || 'Refund request', deletedRequest)
          : null;
        set({
          refundRequests: previousRefundRequests.filter((request) => request.id !== id),
          recycleBin: deletedRefundRequestItem
            ? [deletedRefundRequestItem, ...previousRecycleBin]
            : previousRecycleBin,
        });
        if (!businessId) return;
        try {
          if (deletedRefundRequestItem) {
            await persistDeletedItemsToSupabase(businessId, [deletedRefundRequestItem]).catch((error) => {
              console.warn('Supabase recycle bin refund snapshot failed:', error);
            });
          }
          await supabaseData.deleteByIds('refund_requests', businessId, [id]);
        } catch (error) {
          set({ refundRequests: previousRefundRequests, recycleBin: previousRecycleBin });
          if (deletedRefundRequestItem) {
            await deleteDeletedItemsFromSupabase(businessId, [deletedRefundRequestItem.id]).catch((recoveryError) => {
              console.warn('Supabase recycle bin refund cleanup failed:', recoveryError);
            });
          }
          console.warn('Supabase refund request delete failed:', error);
          throw error;
        }
      },
      addExpenseCategory: (category) => set({ expenseCategories: [...get().expenseCategories, category] }),
      updateExpenseCategory: (id, updates) => set({
        expenseCategories: get().expenseCategories.map((c) => c.id === id ? { ...c, ...updates } : c),
      }),
      deleteExpenseCategory: (id, businessId) => {
        set({ expenseCategories: get().expenseCategories.filter((c) => c.id !== id) });
        if (!businessId) return;
        supabaseSettings
          .deleteSettings('expense_categories', businessId, [id])
          .catch((error) => console.warn('Supabase expense category delete failed:', error));
      },
      addFinanceSupplier: (supplier, businessId) => {
        const nextFinanceSuppliers = dedupeByName([...get().financeSuppliers, supplier]);
        set({ financeSuppliers: nextFinanceSuppliers });
        if (!businessId) return;
        persistFinanceSuppliersToBusinessSettings(businessId, nextFinanceSuppliers)
          .catch((error) => console.warn('Supabase finance suppliers add failed:', error));
      },
      updateFinanceSupplier: (id, updates, businessId) => {
        const nextFinanceSuppliers = get().financeSuppliers.map((supplier) => (
          supplier.id === id ? { ...supplier, ...updates } : supplier
        ));
        set({ financeSuppliers: nextFinanceSuppliers });
        if (!businessId) return;
        persistFinanceSuppliersToBusinessSettings(businessId, nextFinanceSuppliers)
          .catch((error) => console.warn('Supabase finance suppliers update failed:', error));
      },
      deleteFinanceSupplier: (id, businessId) => {
        const nextFinanceSuppliers = get().financeSuppliers.filter((supplier) => supplier.id !== id);
        set({ financeSuppliers: nextFinanceSuppliers });
        if (!businessId) return;
        persistFinanceSuppliersToBusinessSettings(businessId, nextFinanceSuppliers)
          .catch((error) => console.warn('Supabase finance suppliers delete failed:', error));
      },
      addProcurementStatusOption: (status) => set(() => {
        const existing = dedupeByName(get().procurementStatusOptions);
        const insertIndex = Math.max(0, Math.min(existing.length, Math.floor(status.order || existing.length + 1) - 1));
        const next = [...existing];
        next.splice(insertIndex, 0, status);
        return {
          procurementStatusOptions: dedupeByName(next)
            .map((option, index) => ({ ...option, order: index + 1 })),
        };
      }),
      updateProcurementStatusOption: (id, updates) => set(() => {
        const current = get().procurementStatusOptions;
        const target = current.find((option) => option.id === id);
        if (!target) return { procurementStatusOptions: current };

        const nextTarget = { ...target, ...updates };
        const others = current
          .filter((option) => option.id !== id)
          .sort((a, b) => a.order - b.order);

        if (typeof updates.order === 'number' && Number.isFinite(updates.order)) {
          const insertIndex = Math.max(0, Math.min(others.length, Math.floor(updates.order) - 1));
          others.splice(insertIndex, 0, nextTarget);
          return {
            procurementStatusOptions: others.map((option, index) => ({ ...option, order: index + 1 })),
          };
        }

        return {
          procurementStatusOptions: [...others, nextTarget]
            .sort((a, b) => a.order - b.order)
            .map((option, index) => ({ ...option, order: index + 1 })),
        };
      }),
      deleteProcurementStatusOption: (id) => {
        set({
          procurementStatusOptions: get().procurementStatusOptions
            .filter((option) => option.id !== id)
            .sort((a, b) => a.order - b.order)
            .map((option, index) => ({ ...option, order: index + 1 })),
        });
      },
      addFixedCost: (cost, businessId) => {
        const nextFixedCosts = [...get().fixedCosts.filter((item) => item.id !== cost.id), cost];
        set({ fixedCosts: nextFixedCosts });
        if (!businessId) return;
        persistFixedCostsToBusinessSettings(businessId, nextFixedCosts)
          .catch((error) => console.warn('Supabase fixed cost add failed:', error));
      },
      updateFixedCost: (id, updates, businessId) => {
        const nextFixedCosts = get().fixedCosts.map((cost) => (
          cost.id === id ? { ...cost, ...updates, updatedAt: new Date().toISOString() } : cost
        ));
        set({ fixedCosts: nextFixedCosts });
        if (!businessId) return;
        persistFixedCostsToBusinessSettings(businessId, nextFixedCosts)
          .catch((error) => console.warn('Supabase fixed cost update failed:', error));
      },
      deleteFixedCost: (id, businessId) => {
        const nextFixedCosts = get().fixedCosts.filter((cost) => cost.id !== id);
        set({ fixedCosts: nextFixedCosts });
        if (!businessId) return;
        persistFixedCostsToBusinessSettings(businessId, nextFixedCosts)
          .catch((error) => console.warn('Supabase fixed cost delete failed:', error));
      },
      addSalaryTemplate: (template, businessId) => {
        const nextSalaryTemplates = [...get().salaryTemplates.filter((item) => item.id !== template.id), template];
        set({ salaryTemplates: nextSalaryTemplates });
        if (!businessId) return;
        persistSalaryTemplatesToBusinessSettings(businessId, nextSalaryTemplates)
          .catch((error) => console.warn('Supabase salary template add failed:', error));
      },
      updateSalaryTemplate: (id, updates, businessId) => {
        const nextSalaryTemplates = get().salaryTemplates.map((template) => (
          template.id === id ? { ...template, ...updates, updatedAt: new Date().toISOString() } : template
        ));
        set({ salaryTemplates: nextSalaryTemplates });
        if (!businessId) return;
        persistSalaryTemplatesToBusinessSettings(businessId, nextSalaryTemplates)
          .catch((error) => console.warn('Supabase salary template update failed:', error));
      },
      deleteSalaryTemplate: (id, businessId) => {
        const nextSalaryTemplates = get().salaryTemplates.filter((template) => template.id !== id);
        set({ salaryTemplates: nextSalaryTemplates });
        if (!businessId) return;
        persistSalaryTemplatesToBusinessSettings(businessId, nextSalaryTemplates)
          .catch((error) => console.warn('Supabase salary template delete failed:', error));
      },
      updateFinanceRules: async (rules, businessId) => {
        const previousFinanceRules = get().financeRules;
        const nextFinanceRules = { ...get().financeRules, ...rules };
        set({ financeRules: nextFinanceRules });
        if (!businessId) return;
        try {
          await persistFinanceRulesToBusinessSettings(businessId, nextFinanceRules);
        } catch (error) {
          set({ financeRules: previousFinanceRules });
          console.warn('Supabase finance rules update failed:', error);
          throw error;
        }
      },
      addRevenueRule: async (rule, businessId) => {
        const previousFinanceRules = get().financeRules;
        const nextFinanceRules = {
          ...get().financeRules,
          revenueRules: [...(get().financeRules.revenueRules ?? []), rule],
        };
        set({ financeRules: nextFinanceRules });
        if (!businessId) return;
        try {
          await persistFinanceRulesToBusinessSettings(businessId, nextFinanceRules);
        } catch (error) {
          set({ financeRules: previousFinanceRules });
          console.warn('Supabase revenue rule add failed:', error);
          throw error;
        }
      },
      updateRevenueRule: async (id, updates, businessId) => {
        const previousFinanceRules = get().financeRules;
        const nextFinanceRules = {
          ...get().financeRules,
          revenueRules: (get().financeRules.revenueRules ?? []).map((r) => (
            r.id === id ? { ...r, ...updates } : r
          )),
        };
        set({ financeRules: nextFinanceRules });
        if (!businessId) return;
        try {
          await persistFinanceRulesToBusinessSettings(businessId, nextFinanceRules);
        } catch (error) {
          set({ financeRules: previousFinanceRules });
          console.warn('Supabase revenue rule update failed:', error);
          throw error;
        }
      },
      deleteRevenueRule: async (id, businessId) => {
        const previousFinanceRules = get().financeRules;
        const nextFinanceRules = {
          ...get().financeRules,
          revenueRules: (get().financeRules.revenueRules ?? []).filter((r) => r.id !== id),
        };
        set({ financeRules: nextFinanceRules });
        if (!businessId) return;
        try {
          await persistFinanceRulesToBusinessSettings(businessId, nextFinanceRules);
        } catch (error) {
          set({ financeRules: previousFinanceRules });
          console.warn('Supabase revenue rule delete failed:', error);
          throw error;
        }
      },

      // Audit Logs
      addAuditLog: (log) => set({ auditLogs: [...get().auditLogs, log] }),
      updateAuditLog: (id, updates) => set((state) => ({
        auditLogs: state.auditLogs.map((log) => (log.id === id ? { ...log, ...updates } : log)),
      })),
      hasAuditForMonth: (month, year) => {
        return get().auditLogs.some((log) => log.month === month && log.year === year);
      },

      // Restock Logs
      addRestockLog: (log) => set({
        restockLogs: [...get().restockLogs, {
          ...log,
          id: generateId(),
          timestamp: new Date().toISOString(),
        }],
      }),

      getRestockLogsForVariant: (productId, variantId, limit = 10) => {
        return get().restockLogs
          .filter((log) => log.productId === productId && log.variantId === variantId)
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, limit);
      },

      recordInventoryStockMovement: async (movements, businessId) => {
        const { products, restockLogs } = get();
        const normalizedMovements = movements.filter((movement) => (
          movement.productId
          && movement.variantId
          && Number.isFinite(movement.quantityDelta)
          && movement.quantityDelta !== 0
        ));
        if (!normalizedMovements.length) return;

        const productById = new Map(products.map((product) => [product.id, product]));
        const stockByKey = new Map<string, number>();
        products.forEach((product) => {
          product.variants.forEach((variant) => {
            stockByKey.set(`${product.id}:${variant.id}`, Math.max(0, Number(variant.stock ?? 0)));
          });
        });

        const touchedProductIds = new Set<string>();
        const createdLogs: RestockLog[] = [];

        normalizedMovements.forEach((movement) => {
          const product = productById.get(movement.productId);
          const variant = product?.variants.find((candidate) => candidate.id === movement.variantId);
          if (!product || !variant) return;

          const stockKey = `${movement.productId}:${movement.variantId}`;
          const previousStock = stockByKey.get(stockKey) ?? Math.max(0, Number(variant.stock ?? 0));
          const newStock = Math.max(0, previousStock + movement.quantityDelta);
          const appliedDelta = newStock - previousStock;
          if (appliedDelta === 0) return;

          stockByKey.set(stockKey, newStock);
          touchedProductIds.add(movement.productId);
          createdLogs.push({
            id: generateId(),
            productId: movement.productId,
            variantId: movement.variantId,
            quantityAdded: appliedDelta,
            previousStock,
            newStock,
            timestamp: new Date().toISOString(),
            performedBy: movement.performedBy,
            sourceType: movement.sourceType,
            sourceLabel: movement.sourceLabel,
            note: movement.note,
            procurementId: movement.procurementId,
            procurementItemIndex: movement.procurementItemIndex,
          });
        });

        if (!touchedProductIds.size || !createdLogs.length) return;

        const nextProducts = products.map((product) => {
          if (!touchedProductIds.has(product.id)) return product;
          return {
            ...product,
            variants: product.variants.map((variant) => {
              const stockKey = `${product.id}:${variant.id}`;
              const nextStock = stockByKey.get(stockKey);
              return typeof nextStock === 'number' && nextStock !== variant.stock
                ? { ...variant, stock: nextStock }
                : variant;
            }),
          };
        });
        const nextRestockLogs = [...restockLogs, ...createdLogs];

        set({
          products: nextProducts,
          restockLogs: nextRestockLogs,
        });

        if (!businessId) return;
        const updatedProducts = nextProducts.filter((item) => touchedProductIds.has(item.id));

        // Save products (inventory stock) — critical, revert local state if this fails
        if (updatedProducts.length) {
          try {
            await supabaseData.upsertCollection('products', businessId, updatedProducts);
          } catch (error) {
            set({ products, restockLogs });
            console.warn('Supabase stock movement update failed:', error);
            throw error;
          }
        }

        // Save restock logs — non-critical, never revert products if this fails
        if (createdLogs.length) {
          supabaseData.upsertCollection('restock_logs', businessId, createdLogs)
            .catch((error) => console.warn('Supabase restock log save failed (non-critical):', error));
        }
      },

      restockVariant: async (productId, variantId, quantity, performedBy, businessId) => {
        if (quantity <= 0) return;
        await get().recordInventoryStockMovement([
          {
            productId,
            variantId,
            quantityDelta: quantity,
            performedBy,
            sourceType: 'manual_restock',
          },
        ], businessId);
      },

      caseStatuses: DEFAULT_CASE_STATUS_OPTIONS,
      addCaseStatus: (status) => {
        const normalizedName = status.name.trim();
        if (!normalizedName) return;
        const normalizedStatus: CaseStatusOption = {
          ...status,
          name: normalizedName,
          color: status.color || '#6B7280',
          description: status.description?.trim(),
        };
        set({
          caseStatuses: [...get().caseStatuses, normalizedStatus],
        });
      },
      updateCaseStatus: (id, updates) => {
        set({
          caseStatuses: get().caseStatuses.map((existing) => (
            existing.id === id
              ? {
                ...existing,
                ...updates,
                name: updates.name?.trim() ?? existing.name,
                color: updates.color ?? existing.color,
                description: updates.description ?? existing.description,
              }
              : existing
          )),
        });
      },
      deleteCaseStatus: (id, businessId) => {
        const currentStatuses = get().caseStatuses;
        const removedStatus = currentStatuses.find((status) => status.id === id);
        if (!removedStatus) return;
        const remainingStatuses = currentStatuses.filter((status) => status.id !== id);
        const fallbackStatus = remainingStatuses[0]?.name ?? removedStatus.name ?? 'Open';
        set({
          caseStatuses: remainingStatuses,
          cases: get().cases.map((c) =>
            c.status === removedStatus.name ? { ...c, status: fallbackStatus } : c
          ),
        });
        if (!businessId) return;
        supabaseSettings
          .deleteSettings('case_statuses', businessId, [id])
          .catch((error) => console.warn('Supabase case status delete failed:', error));
      },

      // Resolution Types
      resolutionTypes: [
        { id: 'rt-1', name: 'Refund Issued', order: 1 },
        { id: 'rt-2', name: 'Credit Applied', order: 2 },
        { id: 'rt-3', name: 'Replacement Sent', order: 3 },
        { id: 'rt-4', name: 'Repair Completed', order: 4 },
        { id: 'rt-5', name: 'No Action Required', order: 5 },
        { id: 'rt-6', name: 'Other', order: 6 },
      ],
      addResolutionType: (type) => {
        set({ resolutionTypes: [...get().resolutionTypes, type] });
      },
      updateResolutionType: (id, updates) => {
        set({
          resolutionTypes: get().resolutionTypes.map((rt) =>
            rt.id === id
              ? {
                ...rt,
                ...updates,
                name: updates.name?.trim() ?? rt.name,
                description: updates.description ?? rt.description,
              }
              : rt
          ),
        });
      },
      deleteResolutionType: (id, businessId) => {
        const current = get().resolutionTypes;
        const removed = current.find((rt) => rt.id === id);
        if (!removed) return;
        const remaining = current.filter((rt) => rt.id !== id);
        const fallback = remaining[0]?.name ?? 'Other';
        set({
          resolutionTypes: remaining,
          cases: get().cases.map((c) =>
            c.resolution?.type === removed.name
              ? { ...c, resolution: { ...c.resolution, type: fallback } }
              : c
          ),
        });
        if (!businessId) return;
        supabaseSettings
          .deleteSettings('resolution_types', businessId, [id])
          .catch((error) => console.warn('Supabase resolution type delete failed:', error));
      },

      // Cases
      addCase: async (caseItem, businessId) => {
        const previousCases = get().cases;
        set({ cases: [...previousCases, caseItem] });
        if (!businessId) {
          throw new Error('No business selected for case sync.');
        }
        try {
          await supabaseData.upsertCollection('cases', businessId, [caseItem]);
        } catch (error) {
          set({ cases: previousCases });
          console.warn('Supabase case add failed:', error);
          throw error;
        }
      },

      updateCase: async (id, updates, businessId) => {
        set({
          cases: get().cases.map((c) => {
            if (c.id !== id) return c;
            const merged = { ...c, ...updates, updatedAt: new Date().toISOString() };

            // If timeline was explicitly provided in updates, use it as-is
            if (updates.timeline) {
              merged.timeline = updates.timeline;
            } else if (updates.updatedBy) {
              // Auto-append to timeline when updatedBy is provided but no explicit timeline
              const changes: string[] = [];
              if (updates.status && updates.status !== c.status) {
                changes.push(`Status → ${updates.status}`);
              }
              if (updates.priority && updates.priority !== c.priority) {
                changes.push(`Priority → ${updates.priority}`);
              }
              if (updates.assignedTo && updates.assignedTo !== c.assignedTo) {
                changes.push(`Assigned to ${updates.assignedTo}`);
              }
              if (updates.resolution && !c.resolution) {
                changes.push(`Resolution added: ${updates.resolution.type}`);
              }
              if (updates.type && updates.type !== c.type) {
                changes.push(`Type → ${updates.type}`);
              }
              if (updates.customerName && updates.customerName !== c.customerName) {
                changes.push(`Customer → ${updates.customerName}`);
              }
              if (updates.issueSummary && updates.issueSummary !== c.issueSummary) {
                changes.push('Issue summary updated');
              }
              if (updates.source && updates.source !== c.source) {
                changes.push(`Source → ${updates.source}`);
              }
              const action = changes.length > 0 ? changes.join(', ') : 'Case details updated';

              const timelineEntry: CaseTimelineEntry = {
                id: Math.random().toString(36).substring(2, 15),
                date: new Date().toISOString(),
                action,
                user: updates.updatedBy,
              };
              merged.timeline = [...(c.timeline || []), timelineEntry];
            }
            return merged;
          }),
        });
        if (businessId) {
          const updated = get().cases.find((c) => c.id === id);
          if (updated) {
            supabaseData
              .upsertCollection('cases', businessId, [updated])
              .catch((error) => console.warn('Supabase case update failed:', error));
          }
        }
      },

      deleteCase: (id, businessId) => {
        const deletedCase = get().cases.find((c) => c.id === id);
        const deletedCaseItem = deletedCase
          ? createDeletedItem('case', deletedCase.id, deletedCase.caseNumber || deletedCase.customerName || 'Case', deletedCase)
          : null;
        set({
          cases: get().cases.filter((c) => c.id !== id),
          recycleBin: deletedCaseItem
            ? [deletedCaseItem, ...get().recycleBin]
            : get().recycleBin,
        });
        if (!businessId) return;
        void Promise.all([
          supabaseData.deleteByIds('cases', businessId, [id]),
          deletedCaseItem ? persistDeletedItemsToSupabase(businessId, [deletedCaseItem]) : Promise.resolve(),
        ]).catch((error) => console.warn('Supabase case delete failed:', error));
      },

      getCasesForOrder: (orderId) => {
        return get().cases.filter((c) => c.orderId === orderId);
      },

      // Returns
      addReturn: async (returnItem, businessId) => {
        const previousReturns = get().returns;
        set({ returns: [...previousReturns.filter((item) => item.id !== returnItem.id), returnItem] });
        if (!businessId) {
          throw new Error('No business selected for return sync.');
        }
        try {
          await supabaseData.upsertCollection('returns', businessId, [returnItem]);
        } catch (error) {
          set({ returns: previousReturns });
          console.warn('Supabase return add failed:', error);
          throw error;
        }
      },

      updateReturn: async (id, updates, businessId) => {
        const previousReturns = get().returns;
        const nextReturns = previousReturns.map((item) => (
          item.id === id
            ? {
              ...item,
              ...updates,
              updatedAt: new Date().toISOString(),
            }
            : item
        ));
        set({ returns: nextReturns });
        if (!businessId) return;
        const updated = nextReturns.find((item) => item.id === id);
        if (!updated) return;
        try {
          await supabaseData.upsertCollection('returns', businessId, [updated]);
        } catch (error) {
          set({ returns: previousReturns });
          console.warn('Supabase return update failed:', error);
          throw error;
        }
      },

      deleteReturn: async (id, businessId) => {
        const previousReturns = get().returns;
        const previousRecycleBin = get().recycleBin;
        const deletedReturn = previousReturns.find((item) => item.id === id);
        const deletedReturnItem = deletedReturn
          ? createDeletedItem('return', deletedReturn.id, deletedReturn.ref || deletedReturn.orderNumber || 'Return', deletedReturn)
          : null;
        set({
          returns: previousReturns.filter((item) => item.id !== id),
          recycleBin: deletedReturnItem ? [deletedReturnItem, ...previousRecycleBin] : previousRecycleBin,
        });
        if (!businessId) return;
        try {
          await Promise.all([
            supabaseData.deleteByIds('returns', businessId, [id]),
            deletedReturnItem ? persistDeletedItemsToSupabase(businessId, [deletedReturnItem]) : Promise.resolve(),
          ]);
        } catch (error) {
          set({ returns: previousReturns, recycleBin: previousRecycleBin });
          console.warn('Supabase return delete failed:', error);
          throw error;
        }
      },

      getReturnsForOrder: (orderId) => {
        return get().returns.filter((item) => item.orderId === orderId);
      },

      getReturnsForCase: (caseId) => {
        return get().returns.filter((item) => item.caseId === caseId);
      },

      // Reset
      resetStore: () => set(initialState),
    }),
    {
      name: "fyll-storage",
      storage: createJSONStorage(() => storage),
      partialize: (state) => {
          const base = {
            themeMode: state.themeMode,
            userRole: state.userRole,
            lastDataSyncAt: state.lastDataSyncAt,
            lastFullDataSyncAt: state.lastFullDataSyncAt,
          useGlobalLowStockThreshold: state.useGlobalLowStockThreshold,
          globalLowStockThreshold: state.globalLowStockThreshold,
          autoCompleteOrders: state.autoCompleteOrders,
          autoCompleteAfterDays: state.autoCompleteAfterDays,
          autoCompleteFromStatus: state.autoCompleteFromStatus,
          autoCompleteToStatus: state.autoCompleteToStatus,
          orderAutomations: state.orderAutomations,
          deliveryFollowUpEnabled: state.deliveryFollowUpEnabled,
          deliveryFollowUpDelayDays: state.deliveryFollowUpDelayDays,
          deliveryFollowUpResendDays: state.deliveryFollowUpResendDays,
          deliveryFollowUpFromName: state.deliveryFollowUpFromName,
          orderStatusEmailEnabled: state.orderStatusEmailEnabled,
          categories: state.categories,
          customers: state.customers,
          products: state.products,
          orders: state.orders,
          restockLogs: state.restockLogs,
          procurements: state.procurements,
          expenses: state.expenses,
          otherIncomes: state.otherIncomes,
          expenseRequests: state.expenseRequests,
          refundRequests: state.refundRequests,
          cases: state.cases,
          returns: state.returns,
          productVariables: state.productVariables,
          orderStatuses: state.orderStatuses,
          qcChecklistRequirements: state.qcChecklistRequirements,
          saleSources: state.saleSources,
          customServices: state.customServices,
          paymentMethods: state.paymentMethods,
          logisticsCarriers: state.logisticsCarriers,
          expenseCategories: state.expenseCategories,
          financeSuppliers: state.financeSuppliers,
          procurementStatusOptions: state.procurementStatusOptions,
          fixedCosts: state.fixedCosts,
          salaryTemplates: state.salaryTemplates,
          warehouseItems: state.warehouseItems,
          warehouseCategories: state.warehouseCategories,
          warehouseUnits: state.warehouseUnits,
          financeRules: state.financeRules,
          auditLogs: state.auditLogs,
          caseStatuses: state.caseStatuses,
          recycleBin: state.recycleBin,
        };

        if (Platform.OS !== 'web') return base;

        return {
          ...base,
          customers: toWebPersistPreview(state.customers),
          products: toWebPersistPreview(state.products.map((product) => sanitizeProductForWebPersist(product))),
          orders: toWebPersistPreview(state.orders),
          restockLogs: toWebPersistPreview(state.restockLogs, 10),
          procurements: toWebPersistPreview(state.procurements, 10),
          expenses: toWebPersistPreview(state.expenses, 10),
          otherIncomes: toWebPersistPreview(state.otherIncomes, 10),
          expenseRequests: toWebPersistPreview(state.expenseRequests, 10),
          refundRequests: toWebPersistPreview(state.refundRequests, 10),
          cases: toWebPersistPreview(state.cases, 25),
          returns: toWebPersistPreview(state.returns, 25),
          warehouseItems: toWebPersistPreview(state.warehouseItems, 25),
          auditLogs: toWebPersistPreview(state.auditLogs, 25),
          recycleBin: toWebPersistPreview(state.recycleBin, 25),
        };
      },
      version: 2,
      migrate: (persistedState) => {
        if (!persistedState || typeof persistedState !== 'object') return persistedState;
        const nextState = { ...(persistedState as Record<string, unknown>) };
        delete nextState.orderTimelineSettings;
        return nextState;
      },
      merge: (persistedState, currentState) => {
        if (!persistedState || typeof persistedState !== 'object') return currentState;
        const nextState = { ...(persistedState as Record<string, unknown>) };
        delete nextState.orderTimelineSettings;
        return {
          ...currentState,
          ...nextState,
        } as FyllStore;
      },
    }
  )
);

// Helper functions
export const generateProductId = generateId;
export const generateVariantBarcode = generateBarcode;
export const generateOrderNumber = () => `ORD-${String(Date.now()).slice(-6)}`;
export const generateCaseNumber = () => `CASE-${String(Date.now()).slice(-6)}`;
export const generateCaseId = generateId;

export default useFyllStore;
