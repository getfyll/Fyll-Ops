import { describe, expect, test } from 'bun:test';
import { formatAddressValue, normalizeOrderAddressFields } from '../src/lib/format-address';

describe('storefront address normalization', () => {
  test('formats the storefront address object used by checkout orders', () => {
    expect(formatAddressValue({
      address1: '14 Admiralty Way',
      address2: 'Suite 3',
      city: 'Lekki',
      state: 'Lagos',
      country: 'Nigeria',
    })).toBe('14 Admiralty Way, Suite 3, Lekki, Lagos, Nigeria');
  });

  test('supports alternate line and postal-code field names', () => {
    expect(formatAddressValue({
      line1: '22 Allen Avenue',
      line2: 'Second floor',
      locality: 'Ikeja',
      region: 'Lagos',
      postal_code: '100271',
    })).toBe('22 Allen Avenue, Second floor, Ikeja, Lagos, 100271');
  });

  test('normalizes a remotely loaded order before it reaches text inputs', () => {
    const order = normalizeOrderAddressFields({
      id: 'storefront-order-1',
      deliveryAddress: { street: '8 Bourdillon Road', city: 'Ikoyi', state: 'Lagos' },
      deliveryState: 'Lagos',
    });

    expect((order as Record<string, unknown>).deliveryAddress).toBe('8 Bourdillon Road, Ikoyi, Lagos');
    expect(order.deliveryState).toBe('Lagos');
  });

  test('does not expose a pre-stringified object placeholder', () => {
    expect(formatAddressValue('[object Object]')).toBe('');
  });

  test('recovers from a placeholder when the storefront shipping object is available', () => {
    const order = normalizeOrderAddressFields({
      deliveryAddress: '[object Object]',
      deliveryState: '',
      shipping: { address1: '5 Marina Road', city: 'Lagos', state: 'Lagos' },
    });

    expect(order.deliveryAddress).toBe('5 Marina Road, Lagos');
    expect(order.deliveryState).toBe('Lagos');
  });
});
