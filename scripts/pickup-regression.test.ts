import { describe, expect, test } from 'bun:test';
import {
  COLLECTED_STATUS_PATTERN,
  EMPTY_PICKUP_SETTINGS,
  PICKUP_ORDER_MARKERS,
  READY_FOR_PICKUP_STATUS_PATTERN,
  buildPickupDetails,
  formatPickupHours,
  getMissingPickupFields,
  isPickupOrder,
  normalizePickupSettings,
  orderStatusAppliesToOrder,
  withPickupTransportZone,
} from '../src/lib/pickup';
import { findOrderTrackingStageByName, sanitizeOrderStatus, type OrderTrackingStage } from '../src/lib/order-status';
import { getFulfillmentPipelineBucket, getOrderFulfillmentStage, getPublicTrackingStep } from '../src/lib/fulfillment';
import { getPickupStatesForCountry } from '../src/lib/pickup-locations';

const configured = normalizePickupSettings({
  enabled: true,
  country: 'Nigeria',
  states: ['Lagos'],
  locationName: 'Lekki store',
  areaName: 'Lekki Phase 1',
  fullAddress: '12 Admiralty Way, Lekki',
  contactName: 'Ada',
  contactPhone: '+2348000000000',
  days: ['Monday', 'Tuesday'],
  startTime: '09:00',
  endTime: '17:00',
});

describe('pickup order markers', () => {
  test('any one of the three markers makes an order a pickup order', () => {
    expect(isPickupOrder({ fulfillmentMethod: 'pickup' })).toBe(true);
    expect(isPickupOrder({ fulfillmentType: 'pickup' })).toBe(true);
    expect(isPickupOrder({ shippingOptionId: 'pickup' })).toBe(true);
  });

  test('delivery and empty orders are not pickup', () => {
    expect(isPickupOrder({ fulfillmentMethod: 'delivery' })).toBe(false);
    expect(isPickupOrder({ shippingOptionId: 'standard' })).toBe(false);
    expect(isPickupOrder({})).toBe(false);
    expect(isPickupOrder(null)).toBe(false);
    expect(isPickupOrder(undefined)).toBe(false);
  });

  test('what Ops writes is recognised by Ops and by the Store (all three markers)', () => {
    expect(PICKUP_ORDER_MARKERS).toEqual({ fulfillmentMethod: 'pickup', fulfillmentType: 'pickup', shippingOptionId: 'pickup' });
    expect(isPickupOrder(PICKUP_ORDER_MARKERS)).toBe(true);
  });

  test('the order snapshot is always enabled, even when the public pickup option is off', () => {
    const off = normalizePickupSettings({ ...configured, enabled: false });
    expect(buildPickupDetails(off).enabled).toBe(true);
    expect(buildPickupDetails(off).locationName).toBe('Lekki store');
  });
});

describe('pickup settings', () => {
  test('reads anything stored into the full shape', () => {
    expect(normalizePickupSettings(undefined)).toEqual(EMPTY_PICKUP_SETTINGS);
    expect(normalizePickupSettings('nope')).toEqual(EMPTY_PICKUP_SETTINGS);
    expect(normalizePickupSettings({ days: ['Monday', 3, ''], states: 'Lagos' }).days).toEqual(['Monday']);
    expect(normalizePickupSettings({ days: ['Monday'], states: 'Lagos' }).states).toEqual([]);
  });

  test('asks for the same fields the Store asks for before pickup can be on', () => {
    expect(getMissingPickupFields(EMPTY_PICKUP_SETTINGS)).toEqual([
      'location name', 'checkout area', 'full address', 'contact name', 'contact number', 'pickup day', 'state',
    ]);
    expect(getMissingPickupFields(configured)).toEqual([]);
  });

  test('hours read like the Store: days, then the opening hours', () => {
    expect(formatPickupHours(configured)).toBe('Monday, Tuesday · 9:00 AM–5:00 PM');
  });

  test('turning pickup on adds the Store\'s "pickup" delivery zone and keeps the others; turning it off removes only that one', () => {
    const existing = [{ id: 'lagos', name: 'Lagos', amount: 3000 }, { id: 'pickup', name: 'Old pickup' }];
    const on = withPickupTransportZone(existing, configured);
    expect(on.map((zone) => zone.id)).toEqual(['lagos', 'pickup']);
    expect(on[1]).toMatchObject({ id: 'pickup', name: 'Lekki store', states: ['Lagos'], amount: 0, feeCollectedBy: 'free', requireRiderFeeAck: false });
    expect(on[1].timeline).toBe('Monday, Tuesday · 9:00 AM–5:00 PM');
    expect(withPickupTransportZone(existing, { ...configured, enabled: false }).map((zone) => zone.id)).toEqual(['lagos']);
    expect(withPickupTransportZone(undefined, configured).map((zone) => zone.id)).toEqual(['pickup']);
  });

  test('states match the Store\'s names for the countries it serves', () => {
    expect(getPickupStatesForCountry('Nigeria')).toContain('Lagos');
    expect(getPickupStatesForCountry('United States').length).toBe(50);
    expect(getPickupStatesForCountry('Atlantis')).toEqual([]);
  });
});

describe('pickup statuses', () => {
  test('the names keep matching what the Store reads', () => {
    expect(READY_FOR_PICKUP_STATUS_PATTERN.test('Ready for pickup')).toBe(true);
    expect(READY_FOR_PICKUP_STATUS_PATTERN.test('Ready for Pick-up')).toBe(true);
    expect(COLLECTED_STATUS_PATTERN.test('Collected by customer')).toBe(true);
  });

  test('"Ready for pickup" is out for delivery and "Collected by customer" is delivered, even with no saved stage', () => {
    expect(findOrderTrackingStageByName('Ready for pickup', [])).toBe('out-for-delivery');
    expect(findOrderTrackingStageByName('Collected by customer', [])).toBe('delivered');
    expect(sanitizeOrderStatus<{ name: string; trackingStage?: OrderTrackingStage }>({ name: 'Ready for pickup' }).trackingStage).toBe('out-for-delivery');
    expect(sanitizeOrderStatus<{ name: string; trackingStage?: OrderTrackingStage }>({ name: 'Collected by customer' }).trackingStage).toBe('delivered');
  });

  test('Ready for pickup stays an active order; Collected by customer ends it like Delivered', () => {
    expect(getOrderFulfillmentStage({ status: 'Ready for pickup' })).toBe('processing');
    expect(getFulfillmentPipelineBucket({ status: 'Ready for pickup' })).toBe('dispatch');
    expect(getPublicTrackingStep({ status: 'Ready for pickup' })).toBe('out-for-delivery');

    expect(getOrderFulfillmentStage({ status: 'Collected by customer' })).toBe('completed');
    expect(getFulfillmentPipelineBucket({ status: 'Collected by customer' })).toBe('delivered');
    expect(getPublicTrackingStep({ status: 'Collected by customer' })).toBe('delivered');
    expect(getOrderFulfillmentStage({ status: 'Delivered' })).toBe('completed');
  });

  test('a status limited to pickup only shows for pickup orders, but an order already on it keeps it', () => {
    const ready = { name: 'Ready for pickup', appliesTo: 'pickup' as const };
    const delivered = { name: 'Delivered', appliesTo: 'delivery' as const };
    const preparing = { name: 'Preparing' };
    expect(orderStatusAppliesToOrder(ready, true)).toBe(true);
    expect(orderStatusAppliesToOrder(ready, false)).toBe(false);
    expect(orderStatusAppliesToOrder(delivered, true)).toBe(false);
    expect(orderStatusAppliesToOrder(delivered, false)).toBe(true);
    expect(orderStatusAppliesToOrder(preparing, true)).toBe(true);
    expect(orderStatusAppliesToOrder(preparing, false)).toBe(true);
    expect(orderStatusAppliesToOrder(ready, false, 'Ready for pickup')).toBe(true);
  });
});
