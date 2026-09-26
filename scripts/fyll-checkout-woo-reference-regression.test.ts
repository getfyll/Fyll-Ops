import { describe, expect, test } from 'bun:test';
import {
  buildRows,
  getWooOrderReference,
} from '../api/integrations/fyll-checkout/orders';

const checkoutPayload = {
  businessId: 'business-a',
  reference: 'FYL-80CEE455',
  paymentStatus: 'paid',
  paymentMethod: 'card',
  amountPaid: 15000,
  customer: { name: 'Ada Customer', email: 'ada@example.com' },
  items: [{ name: 'Classic Frame', quantity: 1, unitPrice: 15000 }],
};

describe('Fyll Checkout WooCommerce order references', () => {
  test('stores the WooCommerce order id instead of the Fyll payment reference', () => {
    const rows = buildRows({
      ...checkoutPayload,
      wooCommerceOrderId: 4821,
    }, []);

    expect(rows.order.orderNumber).toBe('FYL-80CEE455');
    expect(rows.order.websiteOrderReference).toBe('4821');
    expect(rows.payment.sourceOrderId).toBe('FYL-80CEE455');
    expect(rows.payment.websiteOrderReference).toBe('4821');
  });

  test('never falls back to the Fyll payment reference for Woo status sync', () => {
    const rows = buildRows(checkoutPayload, []);

    expect(rows.order.websiteOrderReference).toBeUndefined();
    expect(rows.payment.websiteOrderReference).toBeUndefined();
  });

  test('accepts the Woo order id from nested checkout metadata', () => {
    expect(getWooOrderReference({
      ...checkoutPayload,
      fyllCheckout: { woocommerce_order_id: '9012' },
    }, checkoutPayload.reference)).toBe('9012');
  });
});
