import { describe, expect, test } from 'bun:test';
import { isPickupTimeline, resolveOrderTimeline } from '../src/lib/fulfillment';
import type { OrderTimelineSettings } from '../src/lib/state/fyll-store';

const settings: OrderTimelineSettings = {
  warningThresholdPercent: 80,
  defaultOrderType: { id: 'default', name: 'Standard', minBusinessDays: 3, maxBusinessDays: 7 },
  orderTypes: [
    { id: 'lagos', name: 'Lagos delivery', minBusinessDays: 2, maxBusinessDays: 4, shippingZoneId: 'zone-lagos', fulfillmentMethod: 'delivery' },
    { id: 'everywhere', name: 'Standard delivery', minBusinessDays: 3, maxBusinessDays: 6, shippingZoneId: null },
    { id: 'pickup', name: 'Store collection', minBusinessDays: 1, maxBusinessDays: 2, shippingZoneId: null, fulfillmentMethod: 'pickup' },
  ],
  shippingZones: [
    { id: 'zone-lagos', name: 'Lagos delivery', states: ['Lagos'], shippingFee: 0, minBusinessDays: 1, maxBusinessDays: 3 },
    // A catch-all zone with no states: pick up must never add its delivery days.
    { id: 'zone-all', name: 'Everywhere', states: [], shippingFee: 0, minBusinessDays: 2, maxBusinessDays: 5 },
  ],
};

describe('pick-up fulfillment timelines', () => {
  test('a timeline is a pick-up timeline when marked, or when an unmarked one is named Pick up', () => {
    expect(isPickupTimeline({ name: 'Store collection', fulfillmentMethod: 'pickup' })).toBe(true);
    expect(isPickupTimeline({ name: 'Pick up' })).toBe(true);
    expect(isPickupTimeline({ name: 'Pickup (Lekki)' })).toBe(true);
    expect(isPickupTimeline({ name: 'Pick up', fulfillmentMethod: 'delivery' })).toBe(false);
    expect(isPickupTimeline({ name: 'Lagos delivery' })).toBe(false);
  });

  test('a pick-up order uses the pick-up timeline and only its processing days', () => {
    const result = resolveOrderTimeline({ deliveryState: '', fulfillmentMethod: 'pickup' }, settings);
    expect(result.orderType.id).toBe('pickup');
    expect(result.shippingZone).toBeNull();
    expect(result.deliveryDays).toBe(0);
    expect(result.minBusinessDays).toBe(1);
    expect(result.maxBusinessDays).toBe(2);
  });

  test('pick up never adds delivery days, even when a state or a catch-all zone exists', () => {
    const withState = resolveOrderTimeline({ deliveryState: 'Lagos', fulfillmentMethod: 'pickup' }, settings);
    expect(withState.deliveryDays).toBe(0);
    expect(withState.maxBusinessDays).toBe(2);
  });

  test('a delivery order never lands on a pick-up timeline by itself', () => {
    const noState = resolveOrderTimeline({ deliveryState: '', fulfillmentMethod: 'delivery' }, settings);
    expect(noState.orderType.id).not.toBe('pickup');
    const unspecified = resolveOrderTimeline({ deliveryState: 'Abuja' }, settings);
    expect(unspecified.orderType.id).not.toBe('pickup');
  });

  test('delivery orders still add delivery days from their state', () => {
    const lagos = resolveOrderTimeline({ deliveryState: 'Lagos', fulfillmentMethod: 'delivery' }, settings);
    expect(lagos.orderType.id).toBe('lagos');
    expect(lagos.deliveryDays).toBe(3);
    expect(lagos.maxBusinessDays).toBe(4 + 3);
  });

  test('an explicitly chosen timeline always wins', () => {
    const chosen = resolveOrderTimeline({ orderTypeId: 'everywhere', deliveryState: '', fulfillmentMethod: 'pickup' }, settings);
    expect(chosen.orderType.id).toBe('everywhere');
    expect(chosen.deliveryDays).toBe(0);
  });

  test('without any pick-up timeline, a pick-up order still gets processing days only', () => {
    const noPickupType: OrderTimelineSettings = { ...settings, orderTypes: settings.orderTypes.filter((type) => type.id !== 'pickup') };
    const result = resolveOrderTimeline({ deliveryState: '', fulfillmentMethod: 'pickup' }, noPickupType);
    expect(result.deliveryDays).toBe(0);
    expect(result.maxBusinessDays).toBe(result.processingDays);
  });
});
