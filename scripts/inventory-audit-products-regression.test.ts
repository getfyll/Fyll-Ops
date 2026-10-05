import { describe, expect, test } from 'bun:test';
import type { Product } from '../src/lib/state/fyll-store';
import { buildAuditItems, isAuditableProduct, reconcileAuditItemsWithInventory } from '../src/components/inventory-audit/utils';

const linkedProduct: Product = {
  id: 'pedro',
  name: 'Pedro',
  description: '',
  categories: ['Eyewear'],
  variants: [{
    id: 'pedro-black',
    sku: 'pedro-black',
    barcode: '',
    variableValues: { Colour: 'Black' },
    stock: 4,
    sellingPrice: 20000,
    wooCommerceProductId: '49135',
    sourceProductId: 'woo-product-49135',
  }],
  lowStockThreshold: 1,
  createdAt: '2026-10-01T00:00:00.000Z',
  productType: 'product',
  useGlobalStock: false,
  wooCommerceProductId: '49135',
  sourceProductId: 'woo-product-49135',
  websiteProductId: '49135',
};

describe('inventory audit product eligibility', () => {
  test('includes real Fyll inventory products that are linked to WooCommerce', () => {
    expect(isAuditableProduct(linkedProduct)).toBe(true);
    expect(buildAuditItems([linkedProduct])).toHaveLength(1);
  });

  test('adds a newly eligible product to an active audit without clearing existing counts', () => {
    const existingProduct = { ...linkedProduct, id: 'existing', name: 'Existing' };
    const existingItem = { ...buildAuditItems([existingProduct])[0], physicalCount: '3' };
    const reconciled = reconcileAuditItemsWithInventory(
      [existingItem],
      [existingProduct, linkedProduct],
      [],
      'products',
      ['Eyewear'],
    );

    expect(reconciled).toHaveLength(2);
    expect(reconciled.find((item) => item.productId === 'existing')?.physicalCount).toBe('3');
    expect(reconciled.find((item) => item.productId === 'pedro')?.physicalCount).toBe('');
  });
});
