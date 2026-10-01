import { describe, expect, test } from 'bun:test';
import { buildDashboardSnapshot, isCompleteDashboardSnapshot } from '../src/lib/dashboard-snapshot';

describe('verified dashboard snapshot', () => {
  test('stores exact aggregate totals independently of preview list limits', () => {
    const snapshot = buildDashboardSnapshot({
      businessId: 'business-a',
      asOf: new Date('2026-09-26T12:00:00.000Z'),
      updatedAt: '2026-09-26T12:01:00.000Z',
      products: [
        { id: 'product-a', variants: [{ id: 'a' }, { id: 'b' }] },
        { id: 'product-b', variants: [{ id: 'c' }] },
      ] as never,
      orders: [
        {
          id: 'order-current-complete',
          status: 'Completed',
          orderDate: '2026-09-10T12:00:00.000Z',
          createdAt: '2026-09-10T12:00:00.000Z',
          totalAmount: 1000,
          subtotal: 800,
          deliveryFee: 100,
          services: [{ price: 100 }],
        },
        {
          id: 'order-current-active',
          status: 'Processing',
          orderDate: '2026-09-20T12:00:00.000Z',
          createdAt: '2026-09-20T12:00:00.000Z',
          totalAmount: 300,
          subtotal: 300,
          services: [],
        },
        {
          id: 'order-previous',
          status: 'Completed',
          orderDate: '2026-08-20T12:00:00.000Z',
          createdAt: '2026-08-20T12:00:00.000Z',
          totalAmount: 500,
          subtotal: 500,
          services: [],
        },
      ] as never,
      customers: [{ id: 'customer-a' }, { id: 'customer-b' }] as never,
      cases: [{ status: 'Open' }, { status: 'Resolved' }] as never,
      partnerJobs: [{ status: 'sent' }, { status: 'billed' }] as never,
    });

    expect(snapshot.businessId).toBe('business-a');
    expect(snapshot.periodKey).toBe('2026-09');
    expect(snapshot.totalRevenue).toBe(1300);
    expect(snapshot.revenueChange).toBe(160);
    expect(snapshot.pendingOrders).toBe(1);
    expect(snapshot.totalOrders).toBe(3);
    expect(snapshot.productCount).toBe(2);
    expect(snapshot.inventoryVariantCount).toBe(3);
    expect(snapshot.customerCount).toBe(2);
    expect(snapshot.openCasesCount).toBe(1);
    expect(snapshot.activePartnerJobsCount).toBe(1);
    expect(snapshot.fulfillment).toEqual({ processing: 1, dispatch: 0, delivered: 2 });
  });

  test('stores the secondary Home sections from the complete datasets', () => {
    const snapshot = buildDashboardSnapshot({
      businessId: 'business-b',
      asOf: new Date('2026-09-26T12:00:00.000Z'),
      products: [
        {
          id: 'product-a',
          name: 'Classic Frame',
          variants: [{ id: 'variant-a', sku: 'FRAME-1', variableValues: { Color: 'Black' } }],
        },
        {
          id: 'product-b',
          name: 'Clear Lens',
          variants: [{ id: 'variant-b', sku: 'LENS-1', variableValues: {} }],
        },
      ] as never,
      orders: [
        {
          id: 'older-order',
          orderNumber: '#100',
          customerName: 'Older Customer',
          status: 'Completed',
          source: 'Instagram',
          orderDate: '2026-09-24T10:00:00.000Z',
          createdAt: '2026-09-24T10:00:00.000Z',
          totalAmount: 200,
          subtotal: 200,
          deliveryFee: 0,
          services: [],
          items: [{ productId: 'product-b', variantId: 'variant-b', quantity: 1 }],
        },
        {
          id: 'newer-order',
          orderNumber: '#101',
          customerName: 'New Customer',
          status: 'Processing',
          source: 'WhatsApp',
          orderDate: '2026-09-26T11:00:00.000Z',
          createdAt: '2026-09-26T11:00:00.000Z',
          totalAmount: 600,
          subtotal: 600,
          deliveryFee: 0,
          services: [],
          items: [{
            productId: 'product-a',
            variantId: 'variant-a',
            quantity: 3,
            selectedOptions: { Size: 'Medium' },
          }],
        },
      ] as never,
      customers: [] as never,
      cases: [] as never,
      partners: [{ id: 'partner-a', name: 'Prime Lab' }] as never,
      partnerJobs: [{
        id: 'job-a',
        partnerId: 'partner-a',
        customerName: 'Job Customer',
        status: 'in_progress',
        createdAt: '2026-09-26T09:00:00.000Z',
      }] as never,
      expenseRequests: [
        { id: 'request-a', status: 'submitted', submittedByUserId: 'user-a' },
        { id: 'request-b', status: 'submitted', submittedByUserId: 'user-b' },
        { id: 'request-c', status: 'approved', submittedByUserId: 'user-a' },
      ] as never,
      auditLogs: [{ id: 'audit-a', month: 8, year: 2026 }] as never,
    });

    expect(snapshot.schemaVersion).toBe(3);
    expect(snapshot.revenueTrend7d.total).toBe(800);
    expect(snapshot.revenueTrend7d.ordersTotal).toBe(2);
    expect(snapshot.mostSoldProducts[0]).toEqual({
      productId: 'product-a',
      name: 'Classic Frame',
      sku: 'FRAME-1',
      quantity: 3,
    });
    expect(snapshot.platformBreakdown).toEqual([
      { label: 'Instagram', value: 1, percentage: 50 },
      { label: 'WhatsApp', value: 1, percentage: 50 },
    ]);
    expect(snapshot.recentOrders[0]).toMatchObject({
      id: 'newer-order',
      itemName: 'Classic Frame',
      itemDetail: 'Black / Size: Medium',
    });
    expect(snapshot.recentPartnerJobs[0]).toMatchObject({
      id: 'job-a',
      partnerName: 'Prime Lab',
    });
    expect(snapshot.newOrdersLast24Hours).toBe(1);
    expect(snapshot.submittedExpenseRequestCount).toBe(2);
    expect(snapshot.submittedExpenseRequestCountByUser).toEqual({ 'user-a': 1, 'user-b': 1 });
    expect(snapshot.hasAuditForPeriod).toBe(true);
    expect(isCompleteDashboardSnapshot(snapshot)).toBe(true);
    expect(isCompleteDashboardSnapshot({ businessId: 'legacy' } as never)).toBe(false);
  });

  test('excludes cancelled and rejected-payment orders from every sales metric', () => {
    const snapshot = buildDashboardSnapshot({
      businessId: 'business-c',
      asOf: new Date('2026-10-01T12:00:00.000Z'),
      products: [{
        id: 'turkey',
        name: 'Turkey',
        variants: [{ id: 'turkey-black', sku: 'TURKEY-BLACK', variableValues: { Color: 'Black' } }],
      }] as never,
      orders: [{
        id: 'cancelled-order',
        orderNumber: 'FYL-CANCELLED',
        customerName: 'Zainab Sarumi',
        status: 'Cancelled',
        source: 'Fyll Checkout',
        orderDate: '2026-10-01T10:00:00.000Z',
        createdAt: '2026-10-01T10:00:00.000Z',
        totalAmount: 19500,
        subtotal: 15000,
        deliveryFee: 4500,
        services: [],
        items: [{ productId: 'turkey', variantId: 'turkey-black', quantity: 1 }],
      }, {
        id: 'failed-order',
        orderNumber: 'FYL-FAILED',
        customerName: 'Failed Customer',
        status: 'Payment failed',
        source: 'Fyll Checkout',
        orderDate: '2026-10-01T11:00:00.000Z',
        createdAt: '2026-10-01T11:00:00.000Z',
        totalAmount: 9000,
        subtotal: 9000,
        deliveryFee: 0,
        services: [],
        items: [{ productId: 'turkey', variantId: 'turkey-black', quantity: 1 }],
      }] as never,
      customers: [] as never,
      cases: [] as never,
      partnerJobs: [] as never,
    });

    expect(snapshot.totalRevenue).toBe(0);
    expect(snapshot.productSales).toBe(0);
    expect(snapshot.deliveryFees).toBe(0);
    expect(snapshot.pendingOrders).toBe(0);
    expect(snapshot.revenueTrend7d.total).toBe(0);
    expect(snapshot.revenueTrend7d.ordersTotal).toBe(0);
    expect(snapshot.mostSoldProducts).toEqual([]);
    expect(snapshot.platformBreakdown).toEqual([]);
    expect(snapshot.newOrdersLast24Hours).toBe(0);
    expect(snapshot.totalOrders).toBe(2);
    expect(snapshot.recentOrders).toHaveLength(2);
  });
});
