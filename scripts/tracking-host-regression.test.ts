import { describe, expect, test } from 'bun:test';
import { isCustomerPortalHostname, isCustomerPortalRoute } from '../src/lib/tracking-host';
import { buildSocialCheckoutPath, buildSocialCheckoutUrl } from '../src/lib/tracking-url';

describe('customer portal isolation', () => {
  test('recognizes only customer domains', () => {
    for (const host of ['track.fyll.app', 'returns.fyll.app', 'confirm.fyll.app', 'payment.fyll.app', 'WWW.TRACK.FYLL.APP']) {
      expect(isCustomerPortalHostname(host)).toBe(true);
    }
    for (const host of ['app.fyll.app', 'track.fyll.app.evil.example', null]) {
      expect(isCustomerPortalHostname(host)).toBe(false);
    }
  });
  test('denies ERP routes, including the root tab group and unregistered screens', () => {
    for (const route of ['', '(tabs)', '(tabs)/orders', 'orders', 'order/[id]', 'customers', 'finance', 'login', 'supabase-check', 'debug-env', 'new-internal-screen']) {
      expect(isCustomerPortalRoute(route)).toBe(false);
    }
  });
  test('preserves customer landing pages and token links', () => {
    for (const route of ['order-tracking', 'track', 'start-return', 'confirm-delivery', '[businessSlug]/index', '[businessSlug]/[code]', '[businessSlug]/order-tracking', '[businessSlug]/order-tracking/[code]', '[businessSlug]/start-return', '[businessSlug]/confirm-delivery', '[businessSlug]/confirm-delivery/[code]']) {
      expect(isCustomerPortalRoute(route)).toBe(true);
    }
  });
  test('allows quote links only on the payment host', () => {
    expect(isCustomerPortalRoute('[businessSlug]/quote/[code]', 'payment.fyll.app')).toBe(true);
    expect(isCustomerPortalRoute('q/[code]', 'payment.fyll.app')).toBe(true);
    expect(isCustomerPortalRoute('[businessSlug]/quote/[code]', 'track.fyll.app')).toBe(false);
  });
  test('allows bill links only on the payment host', () => {
    expect(isCustomerPortalRoute('[businessSlug]/bill/[code]', 'payment.fyll.app')).toBe(true);
    expect(isCustomerPortalRoute('[businessSlug]/bill/[code]', 'returns.fyll.app')).toBe(false);
  });
  test('builds the canonical public bill URL', () => {
    expect(buildSocialCheckoutPath({ businessName: 'Blooming Blends', code: 'sc-123' }))
      .toBe('/bloomingblends/bill/SC-123');
    expect(buildSocialCheckoutUrl({
      origin: 'https://payment.fyll.app',
      businessSlug: 'bloomingblends',
      code: 'sc-123',
    })).toBe('https://payment.fyll.app/bloomingblends/bill/SC-123');
  });
});
