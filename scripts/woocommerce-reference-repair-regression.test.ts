import { describe, expect, test } from 'bun:test';
import { matchWooOrdersForReferenceRepair } from '../src/lib/woocommerce-reference-repair';

const fyllOrder = {
  id: 'fyll-order-a',
  source: 'Fyll Checkout',
  websiteOrderReference: 'FYL-80CEE455',
  customerEmail: 'tobbyy@gmail.com',
  customerPhone: '',
  totalAmount: 25000,
  orderDate: '2026-09-25T10:00:00.000Z',
  createdAt: '2026-09-25T10:00:00.000Z',
  fyllCheckout: { reference: 'FYL-80CEE455' },
};

const wooOrder = {
  externalId: '49135',
  customerEmail: 'tobbyy@gmail.com',
  customerPhone: '',
  totalAmount: 25000,
  createdAt: '2026-09-25T10:02:00.000Z',
  metadataValues: ['FYL-80CEE455'],
};

describe('bulk WooCommerce reference repair', () => {
  test('prefers an exact Fyll Checkout reference found in Woo metadata', () => {
    const matches = matchWooOrdersForReferenceRepair([wooOrder], [fyllOrder]);
    expect(matches.get('49135')).toBe('fyll-order-a');
  });

  test('uses a unique contact, amount, and order-date match when metadata is absent', () => {
    const matches = matchWooOrdersForReferenceRepair([
      { ...wooOrder, metadataValues: [] },
    ], [fyllOrder]);
    expect(matches.get('49135')).toBe('fyll-order-a');
  });

  test('does not guess when the fallback match is ambiguous', () => {
    const matches = matchWooOrdersForReferenceRepair([
      { ...wooOrder, metadataValues: [] },
    ], [
      fyllOrder,
      { ...fyllOrder, id: 'fyll-order-b', websiteOrderReference: undefined },
    ]);
    expect(matches.size).toBe(0);
  });

  test('does not overwrite an order that already has a real Woo reference', () => {
    const matches = matchWooOrdersForReferenceRepair([wooOrder], [
      { ...fyllOrder, websiteOrderReference: '49135' },
    ]);
    expect(matches.size).toBe(0);
  });
});
