import { describe, expect, test } from 'bun:test';
import { isCustomerPortalHostname, isCustomerPortalRoute } from '../src/lib/tracking-host';

describe('customer portal isolation', () => {
  test('recognizes only customer domains', () => {
    for (const host of ['track.fyll.app', 'returns.fyll.app', 'confirm.fyll.app', 'WWW.TRACK.FYLL.APP']) {
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
});
