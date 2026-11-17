// Replacement orders: a free resend for a case (e.g. glasses arrived scratched).
// The replacement is a normal order — new order number, goes through fulfilment,
// takes stock — but it is classified 'Replacement' so it never counts as a sale,
// and it stays linked to the original order and the case both ways.
import useFyllStore, {
  generateOrderNumber,
  type Case,
  type Order,
  type OrderItem,
} from '@/lib/state/fyll-store';
import { addBusinessDays, getCustomerTrackingCode, resolveOrderTimeline } from '@/lib/fulfillment';
import { normalizeProductType } from '@/lib/product-utils';
import { isPickupOrder } from '@/lib/pickup';

export interface ReplacementLine {
  item: OrderItem;
  quantity: number;
}

export const isReplacementOrder = (order?: Pick<Order, 'replacementFor' | 'orderClassification'> | null) => (
  Boolean(order?.replacementFor?.caseId) || order?.orderClassification === 'Replacement'
);

/** Product and variant names for an order line, looked up from inventory (orders often store only the ids). */
export const describeOrderItem = (item: OrderItem): { productName: string; variantName: string } => {
  const product = useFyllStore.getState().products.find((p) => p.id === item.productId);
  const variant = product?.variants.find((v) => v.id === item.variantId);
  const variantName = variant ? Object.values(variant.variableValues ?? {}).filter(Boolean).join(' / ') : (item.variantName ?? '');
  return { productName: product?.name || item.productName || 'Product unavailable', variantName };
};

/** Physical (non-service) lines from the original order that can be resent. */
export const getReplaceableItems = (order: Order): OrderItem[] => {
  const products = useFyllStore.getState().products;
  return order.items.filter((item) => {
    if (item.serviceId) return false;
    const product = products.find((p) => p.id === item.productId);
    return product ? normalizeProductType(product.productType) !== 'service' : true;
  });
};

export async function createReplacementOrder({
  caseItem,
  originalOrder,
  lines,
  staffName,
  businessId,
}: {
  caseItem: Case;
  originalOrder: Order;
  lines: ReplacementLine[];
  staffName: string;
  businessId: string | null;
}): Promise<Order> {
  const store = useFyllStore.getState();
  const chosen = lines.filter((line) => line.quantity > 0);
  if (chosen.length === 0) throw new Error('Pick at least one item to resend.');
  if (!businessId) throw new Error('No business selected.');

  const now = new Date();
  const nowIso = now.toISOString();
  const pickup = isPickupOrder(originalOrder);
  const timeline = resolveOrderTimeline(
    {
      orderTypeId: originalOrder.orderTypeId,
      orderTypeName: originalOrder.orderTypeName,
      deliveryState: originalOrder.deliveryState,
      deliveryAddress: originalOrder.deliveryAddress,
      fulfillmentMethod: pickup ? 'pickup' : 'delivery',
    },
    store.orderTimelineSettings,
  );
  const eta = addBusinessDays(new Date(now), timeline.maxBusinessDays).toISOString();
  const orderNumber = generateOrderNumber();
  const id = Math.random().toString(36).substring(2, 15);

  const items: OrderItem[] = chosen.map(({ item, quantity }) => ({
    productId: item.productId,
    variantId: item.variantId,
    productName: describeOrderItem(item).productName,
    variantName: describeOrderItem(item).variantName || undefined,
    selectedOptions: item.selectedOptions,
    quantity,
    unitPrice: 0,
  }));

  const order: Order = {
    id,
    orderNumber,
    customerTrackingCode: getCustomerTrackingCode({ id: '', orderNumber, customerTrackingCode: undefined }),
    customerId: originalOrder.customerId,
    customerName: originalOrder.customerName,
    customerEmail: originalOrder.customerEmail,
    customerPhone: originalOrder.customerPhone,
    deliveryState: originalOrder.deliveryState,
    deliveryAddress: originalOrder.deliveryAddress,
    deliveryPostcode: originalOrder.deliveryPostcode,
    fulfillmentMethod: originalOrder.fulfillmentMethod,
    fulfillmentType: originalOrder.fulfillmentType,
    pickupDetails: originalOrder.pickupDetails,
    orderTypeId: timeline.orderType.id,
    orderTypeName: timeline.orderType.name,
    items,
    services: [],
    additionalCharges: 0,
    additionalChargesNote: '',
    deliveryFee: 0,
    paymentMethod: 'Replacement',
    orderClassification: 'Replacement',
    replacementFor: {
      orderId: originalOrder.id,
      orderNumber: originalOrder.orderNumber,
      caseId: caseItem.id,
      caseNumber: caseItem.caseNumber,
    },
    status: 'Processing',
    source: 'Replacement',
    subtotal: 0,
    totalAmount: 0,
    prescription: originalOrder.prescription,
    customerNote: `Replacement for ${originalOrder.orderNumber} (${caseItem.caseNumber})`,
    fulfillmentStartedAt: nowIso,
    fulfillmentTimelineDays: timeline.maxBusinessDays,
    fulfillmentOriginalEta: eta,
    fulfillmentEffectiveEta: eta,
    orderDate: nowIso,
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: staffName,
    activityLog: [{ staffName, action: `Created as a replacement for ${originalOrder.orderNumber} from ${caseItem.caseNumber}`, date: nowIso }],
  };

  await store.addOrder(order, businessId);

  // Take the resent items out of stock, same as a normal new order.
  await Promise.all(items.map((item) => store.updateVariantStock(item.productId, item.variantId, -item.quantity, businessId)));

  // Link back on the case…
  const summary = items.map((item) => `${item.quantity}× ${item.productName ?? 'item'}`).join(', ');
  await store.updateCase(caseItem.id, {
    replacementOrders: [
      ...(caseItem.replacementOrders ?? []),
      { orderId: id, orderNumber, createdAt: nowIso, createdBy: staffName },
    ],
    timeline: [
      ...(caseItem.timeline ?? []),
      { id: Math.random().toString(36).substring(2, 12), date: nowIso, action: `Replacement order ${orderNumber} created (${summary})`, user: staffName },
    ],
    updatedAt: nowIso,
    updatedBy: staffName,
  }, businessId);

  // …and on the original order's activity log.
  await store.updateOrder(originalOrder.id, {
    activityLog: [
      ...(originalOrder.activityLog ?? []),
      { staffName, action: `Replacement ${orderNumber} sent from ${caseItem.caseNumber}`, date: nowIso },
    ],
    updatedAt: nowIso,
    updatedBy: staffName,
  }, businessId);

  return order;
}
