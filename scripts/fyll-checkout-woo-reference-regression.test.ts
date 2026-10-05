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

  test('matches the purchased colour instead of defaulting to the first variant', () => {
    const rows = buildRows({
      ...checkoutPayload,
      amountPaid: 19500,
      expectedAmount: 19500,
      shipping: { name: 'Lagos Mainland & Island', price: 4500 },
      items: [{ name: 'Turkey Silver', quantity: 1, unitPrice: 15000 }],
    }, [{
      id: 'turkey',
      data: {
        name: 'Turkey',
        variants: [
          { id: 'turkey-black', sku: 'turkey-black', variableValues: { Color: 'Black' } },
          { id: 'turkey-silver', sku: 'turkey-silver', variableValues: { Color: 'Silver' } },
        ],
      },
    }]);

    expect(rows.order.items[0]?.productId).toBe('turkey');
    expect(rows.order.items[0]?.variantId).toBe('turkey-silver');
    expect(rows.order.items[0]?.variantName).toBe('Silver');
  });

  test('preserves checkout SKU and variation identifiers on the payment', () => {
    const rows = buildRows({
      ...checkoutPayload,
      items: [{
        name: 'Turkey Silver',
        sku: 'turkey-silver',
        image_url: 'https://example.com/turkey-silver.jpg',
        product_id: 42,
        variation_id: 84,
        quantity: 1,
        unitPrice: 15000,
      }],
    }, []);

    expect(rows.payment.items[0]?.sku).toBe('turkey-silver');
    expect(rows.payment.items[0]?.imageUrl).toBe('https://example.com/turkey-silver.jpg');
    expect(rows.payment.items[0]?.productId).toBe('42');
    expect(rows.payment.items[0]?.variationId).toBe('84');
  });

  test('copies delivery onto the payment as a separately renderable charge', () => {
    const rows = buildRows({
      ...checkoutPayload,
      amountPaid: 19500,
      expectedAmount: 19500,
      shipping: { name: 'Lagos Mainland & Island', price: 4500, address: 'Lagos' },
    }, []);

    expect(rows.order.deliveryFee).toBe(4500);
    expect(rows.payment.deliveryFee).toBe(4500);
    expect(rows.payment.shippingFee).toBe(4500);
    expect(rows.payment.shippingLines).toEqual([{
      name: 'Lagos Mainland & Island',
      amount: 4500,
      total: 4500,
      price: 4500,
    }]);
  });

  test('splits a priced Woo line-item add-on from the base product without changing the total', () => {
    const rows = buildRows({
      ...checkoutPayload,
      amountPaid: 49500,
      expectedAmount: 49500,
      shipping: { name: 'Delivery', price: 7500 },
      items: [{
        name: 'Jaja Brown',
        quantity: 1,
        unitPrice: 42000,
        lineTotal: 42000,
        meta_data: [{
          display_key: 'Non Prescription Lens Add-on',
          display_value: 'ar+bluelight+phc (₦22,000.00)',
        }],
      }],
    }, []);

    expect(rows.payment.items).toHaveLength(2);
    expect(rows.payment.items[0]?.lineTotal).toBe(20000);
    expect(rows.payment.items[1]).toMatchObject({
      type: 'addon',
      lineTotal: 22000,
    });
    expect(rows.order.items[0]?.unitPrice).toBe(20000);
    expect(rows.order.services[0]?.price).toBe(22000);
    expect(rows.order.totalAmount).toBe(49500);
  });

  test('turns a rejected checkout payment into a cancelled order', () => {
    const rows = buildRows({
      ...checkoutPayload,
      paymentStatus: 'rejected',
    }, []);

    expect(rows.payment.status).toBe('rejected');
    expect(rows.order.status).toBe('Cancelled');
    expect(rows.order.orderStatus).toBe('Cancelled');
  });
});
