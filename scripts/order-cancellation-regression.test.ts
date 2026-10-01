import { describe, expect, test } from 'bun:test';
import { buildCancelledOrderInventoryUpdate } from '../src/lib/order-cancellation';
import type { Order, OrderStatus, Product } from '../src/lib/state/fyll-store';

const statuses: OrderStatus[] = [
  { id: 'processing', name: 'Processing', color: '#999999', order: 1, trackingStage: 'processing' },
  { id: 'cancelled', name: 'Cancelled', color: '#EF4444', order: 2, trackingStage: 'cancelled' },
];

const order = {
  id: 'order-1',
  orderNumber: 'ORD-1',
  customerName: 'Test Customer',
  customerEmail: '',
  customerPhone: '',
  deliveryState: '',
  deliveryAddress: '',
  items: [{ productId: 'turkey', variantId: 'turkey-silver', quantity: 1, unitPrice: 15000 }],
  services: [],
  additionalCharges: 0,
  additionalChargesNote: '',
  deliveryFee: 4500,
  paymentMethod: 'Bank transfer',
  status: 'Processing',
  source: 'Fyll Checkout',
  subtotal: 15000,
  totalAmount: 19500,
  orderDate: '2026-10-01T10:00:00.000Z',
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
} as Order;

const products = [{
  id: 'turkey',
  name: 'Turkey',
  description: '',
  categories: [],
  lowStockThreshold: 1,
  createdAt: '2026-10-01T10:00:00.000Z',
  productType: 'product',
  variants: [
    { id: 'turkey-black', sku: 'turkey-black', barcode: '', stock: 4, sellingPrice: 15000, variableValues: { Colour: 'Black' } },
    { id: 'turkey-silver', sku: 'turkey-silver', barcode: '', stock: 2, sellingPrice: 15000, variableValues: { Colour: 'Silver' } },
  ],
}] satisfies Product[];

describe('order cancellation inventory flow', () => {
  test('cancels the order and restores only the exact ordered variant', () => {
    const result = buildCancelledOrderInventoryUpdate({
      order,
      products,
      orderStatuses: statuses,
      cancelledBy: 'Tayo',
      now: '2026-10-01T12:00:00.000Z',
    });

    expect(result.order.status).toBe('Cancelled');
    expect(result.order.trackingStage).toBe('cancelled');
    expect(result.order.inventoryRestoredAt).toBe('2026-10-01T12:00:00.000Z');
    expect(result.products[0]?.variants[0]?.stock).toBe(4);
    expect(result.products[0]?.variants[1]?.stock).toBe(3);
  });

  test('does not return stock twice when cancellation is retried', () => {
    const first = buildCancelledOrderInventoryUpdate({ order, products, orderStatuses: statuses });
    const retry = buildCancelledOrderInventoryUpdate({
      order: first.order,
      products: first.products,
      orderStatuses: statuses,
    });

    expect(retry.didRestoreStock).toBe(false);
    expect(retry.products[0]?.variants[1]?.stock).toBe(3);
  });
});
