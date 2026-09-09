import type { OrderItem, Product } from '@/lib/state/fyll-store';
import type { WooNormalizedOrder } from '@/lib/woocommerce';
import {
  ensureWooProductsExist,
  mapWooOrderToOrderItems,
  resolveWooResidualCharges,
} from '@/lib/woocommerce-link';

type PrepareWooOrderDraftInput = {
  businessId: string;
  wooOrder: WooNormalizedOrder;
  products: Product[];
  addProductsBulk: (products: Product[], businessId?: string | null) => Promise<void>;
  updateProduct: (productId: string, updates: Partial<Product>, businessId?: string | null) => Promise<void>;
};

export type PreparedWooOrderDraft = {
  websiteOrderReference: string;
  customerName: string;
  customerNote: string;
  customerEmail: string;
  customerPhone: string;
  deliveryAddress: string;
  deliveryState: string;
  paymentMethod: string;
  source: string;
  orderDate: Date;
  items: OrderItem[];
  services: [];
  deliveryFee: string;
  additionalCharges: string;
  additionalChargesNote: string;
  discountAmount: string;
};

export const prepareWooOrderDraft = async ({
  businessId,
  wooOrder,
  products,
  addProductsBulk,
  updateProduct,
}: PrepareWooOrderDraftInput): Promise<PreparedWooOrderDraft> => {
  const { productMap } = await ensureWooProductsExist({
    businessId,
    lineItems: wooOrder.lineItems,
    products,
    addProductsBulk,
    updateProduct,
  });

  const mappedItems = mapWooOrderToOrderItems(wooOrder.lineItems, productMap);
  const residualCharges = resolveWooResidualCharges(wooOrder);

  return {
    websiteOrderReference: wooOrder.websiteOrderReference,
    customerName: wooOrder.customerName,
    customerNote: wooOrder.customerNote,
    customerEmail: wooOrder.customerEmail,
    customerPhone: wooOrder.customerPhone,
    deliveryAddress: wooOrder.deliveryAddress,
    deliveryState: wooOrder.deliveryState,
    paymentMethod: wooOrder.paymentMethod,
    source: 'WooCommerce',
    orderDate: new Date(wooOrder.createdAt),
    items: mappedItems,
    services: [],
    deliveryFee: String(wooOrder.shippingAmount || 0),
    additionalCharges: String(residualCharges || 0),
    additionalChargesNote: residualCharges > 0 ? 'WooCommerce taxes and extra charges' : '',
    discountAmount: wooOrder.discountAmount > 0 ? String(wooOrder.discountAmount) : '',
  };
};
