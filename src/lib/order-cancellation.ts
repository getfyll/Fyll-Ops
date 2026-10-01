import { findOrderTrackingStageByName, type OrderTrackingStage } from '@/lib/order-status';
import type { Order, OrderActivityEntry, OrderStatus, Product } from '@/lib/state/fyll-store';

type CancellationResult = {
  order: Order;
  products: Product[];
  changedProducts: Product[];
  didRestoreStock: boolean;
};

const isCancelledOrder = (order: Order, orderStatuses: OrderStatus[]) => (
  findOrderTrackingStageByName(order.status, orderStatuses) === 'cancelled'
  || order.trackingStage === 'cancelled'
  || order.fulfillmentStage === 'cancelled'
);

export const buildCancelledOrderInventoryUpdate = ({
  order,
  products,
  orderStatuses,
  cancelledBy,
  now = new Date().toISOString(),
}: {
  order: Order;
  products: Product[];
  orderStatuses: OrderStatus[];
  cancelledBy?: string;
  now?: string;
}): CancellationResult => {
  const alreadyCancelled = isCancelledOrder(order, orderStatuses);
  const alreadyRestored = Boolean(order.inventoryRestoredAt);
  const shouldRestoreStock = !alreadyCancelled && !alreadyRestored;
  const stockAdjustments = new Map<string, Map<string, number>>();

  if (shouldRestoreStock) {
    order.items.forEach((item) => {
      const product = products.find((candidate) => candidate.id === item.productId);
      if (!product || product.productType === 'service') return;

      const variants = stockAdjustments.get(item.productId) ?? new Map<string, number>();
      variants.set(item.variantId, (variants.get(item.variantId) ?? 0) + item.quantity);
      stockAdjustments.set(item.productId, variants);
    });
  }

  const nextProducts = products.map((product) => {
    const adjustments = stockAdjustments.get(product.id);
    if (!adjustments) return product;

    return {
      ...product,
      variants: product.variants.map((variant) => {
        const quantity = adjustments.get(variant.id) ?? 0;
        return quantity > 0 ? { ...variant, stock: Math.max(0, variant.stock + quantity) } : variant;
      }),
    };
  });
  const activityEntry: OrderActivityEntry | null = !alreadyCancelled && cancelledBy
    ? { staffName: cancelledBy, action: 'Cancelled order and returned stock', date: now }
    : null;
  const trackingStage: OrderTrackingStage = 'cancelled';

  return {
    order: {
      ...order,
      status: 'Cancelled',
      orderStatus: 'Cancelled',
      tracking: { trackingStage, stage: trackingStage, status: 'Cancelled' },
      trackingStage,
      fulfillmentStage: 'cancelled',
      fulfillmentStatus: 'Cancelled',
      inventoryRestoredAt: shouldRestoreStock ? now : order.inventoryRestoredAt,
      inventoryRestoredBy: shouldRestoreStock ? (cancelledBy ?? 'System') : order.inventoryRestoredBy,
      updatedAt: now,
      updatedBy: cancelledBy ?? order.updatedBy,
      activityLog: activityEntry ? [...(order.activityLog ?? []), activityEntry] : order.activityLog,
    },
    products: nextProducts,
    changedProducts: nextProducts.filter((product) => stockAdjustments.has(product.id)),
    didRestoreStock: stockAdjustments.size > 0,
  };
};
