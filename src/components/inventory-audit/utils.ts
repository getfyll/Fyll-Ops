import type { AuditLog, AuditLogItem, Product, WarehouseItem } from '@/lib/state/fyll-store';
import { normalizeProductType } from '@/lib/product-utils';
import type { AuditItem, CategoryAuditSection, ProductAuditGroup } from './types';

export const UNCATEGORIZED_CATEGORY = 'Uncategorized';

export const getVariantName = (variableValues: Record<string, string>): string => {
  const values = Object.values(variableValues ?? {}).filter((value) => value.trim().length > 0);
  if (values.length === 0) return 'Default';
  return values.join(' / ');
};

export const parseCount = (value: string): number | null => {
  if (!value.trim()) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const normalizeCategoryKey = (value: string): string => value
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const resolveConfiguredCategory = (categoryName: string, configuredCategories: string[]): string | null => {
  const categoryKey = normalizeCategoryKey(categoryName);
  if (!categoryKey) return null;

  return configuredCategories.find((category) => normalizeCategoryKey(category) === categoryKey) ?? null;
};

const resolveProductAuditCategory = (product: Product, configuredCategories: string[] = []): string => {
  const rawCategory = product.categories?.find((category) => category.trim().length > 0)?.trim() ?? '';
  const exactCategory = resolveConfiguredCategory(rawCategory, configuredCategories);
  if (exactCategory) return exactCategory;

  const rawKey = normalizeCategoryKey(rawCategory);
  const productText = normalizeCategoryKey(`${product.name} ${product.variants.map((variant) => variant.sku).join(' ')}`);
  const eyewearCategory = resolveConfiguredCategory('Eyewear', configuredCategories);
  const cupsCategory = resolveConfiguredCategory('Cups and Bottles', configuredCategories);
  const glassesCaseCategory = resolveConfiguredCategory('Glasses Case', configuredCategories);
  const lensCleaningSprayCategory = resolveConfiguredCategory('Lens Cleaning Spray', configuredCategories);

  if (cupsCategory && ['cup', 'cups', 'bottle', 'bottles'].includes(rawKey)) return cupsCategory;
  if (glassesCaseCategory && (rawKey.includes('case') || productText.includes('case'))) return glassesCaseCategory;
  if (lensCleaningSprayCategory && (rawKey.includes('spray') || productText.includes('spray'))) return lensCleaningSprayCategory;
  if (
    eyewearCategory &&
    (
      !rawKey ||
      ['clip on', 'clipon', 'glasses', 'optical', 'sunglasses', 'eyewear'].includes(rawKey) ||
      productText.includes('glass') ||
      productText.includes('lens') ||
      productText.includes('frame')
    )
  ) {
    return eyewearCategory;
  }

  return rawCategory || UNCATEGORIZED_CATEGORY;
};

export const isAuditableProduct = (product: Product): boolean => {
  const legacyProductStatus = product as Product & {
    active?: boolean;
    isInactive?: boolean;
    status?: string;
  };

  if (normalizeProductType(product.productType) === 'service') return false;
  if (
    product.isArchived ||
    product.isDiscontinued ||
    legacyProductStatus.isInactive ||
    legacyProductStatus.active === false ||
    legacyProductStatus.status?.trim().toLowerCase() === 'inactive'
  ) {
    return false;
  }
  if (product.catalogSource === 'woocommerce-plugin') return false;
  if (product.createdBy === 'WooCommerce Sync') return false;
  if (product.wooCommerceProductId || product.sourceProductId || product.websiteProductId) return false;
  if (product.variants.some((variant) => variant.wooCommerceProductId || variant.sourceProductId)) return false;
  const looksLikeService = Boolean(
    product.serviceTags?.length ||
    product.serviceVariables?.length ||
    product.serviceFields?.length
  );
  return !looksLikeService;
};

export const buildAuditItems = (products: Product[], configuredCategories: string[] = []): AuditItem[] => {
  return products.filter(isAuditableProduct).flatMap((product) => {
    const categoryName = resolveProductAuditCategory(product, configuredCategories);

    return product.variants.map((variant) => {
      const variantName = getVariantName(variant.variableValues);
      return {
        productId: product.id,
        productName: product.name,
        categoryName,
        variantId: variant.id,
        variantName,
        combinedName: `${product.name} ${variantName}`,
        expectedStock: variant.stock,
        physicalCount: '',
        sku: variant.sku,
        sourceType: 'product',
      };
    });
  });
};

export const buildWarehouseAuditItems = (warehouseItems: WarehouseItem[]): AuditItem[] => {
  return warehouseItems.map((item) => ({
    productId: item.id,
    productName: item.name,
    categoryName: item.category?.trim() || 'Warehouse',
    variantId: item.id,
    variantName: item.unit || 'Item',
    combinedName: `${item.name} ${item.category} ${item.unit}`,
    expectedStock: item.currentStock,
    physicalCount: '',
    sku: item.unit || 'warehouse',
    sourceType: 'warehouse',
    unit: item.unit,
  }));
};

export const reconcileAuditItemsWithInventory = (
  items: AuditItem[],
  products: Product[],
  warehouseItems: WarehouseItem[],
  scope: 'products' | 'warehouse',
  configuredCategories: string[] = []
): AuditItem[] => {
  if (scope === 'warehouse') {
    const warehouseItemById = new Map(warehouseItems.map((item) => [item.id, item]));

    return items
      .map((item) => {
        const warehouseItem = warehouseItemById.get(item.variantId) ?? warehouseItemById.get(item.productId);
        if (!warehouseItem) return null;

        const categoryName = warehouseItem.category?.trim() || 'Warehouse';
        const variantName = warehouseItem.unit || 'Item';
        const nextItem: AuditItem = {
          ...item,
          productId: warehouseItem.id,
          productName: warehouseItem.name,
          categoryName,
          variantId: warehouseItem.id,
          variantName,
          combinedName: `${warehouseItem.name} ${warehouseItem.category} ${warehouseItem.unit}`,
          expectedStock: warehouseItem.currentStock,
          sku: warehouseItem.unit || 'warehouse',
          sourceType: 'warehouse' as const,
          unit: warehouseItem.unit,
        };
        return nextItem;
      })
      .filter((item): item is AuditItem => item !== null);
  }

  const productById = new Map(products.filter(isAuditableProduct).map((product) => [product.id, product]));

  return items
    .map((item) => {
      const product = productById.get(item.productId);
      if (!product) return null;

      const variant = product.variants.find((candidate) => candidate.id === item.variantId);
      if (!variant) return null;

      const categoryName = resolveProductAuditCategory(product, configuredCategories);
      const variantName = getVariantName(variant.variableValues);
      const nextItem: AuditItem = {
        ...item,
        productName: product.name,
        categoryName,
        variantName,
        combinedName: `${product.name} ${variantName}`,
        expectedStock: variant.stock,
        sku: variant.sku,
        sourceType: 'product' as const,
      };
      return nextItem;
    })
    .filter((item): item is AuditItem => item !== null);
};

export const buildCategorySections = (items: AuditItem[]): CategoryAuditSection[] => {
  const categoryMap = new Map<string, Map<string, ProductAuditGroup>>();

  items.forEach((item) => {
    if (!categoryMap.has(item.categoryName)) {
      categoryMap.set(item.categoryName, new Map<string, ProductAuditGroup>());
    }

    const productMap = categoryMap.get(item.categoryName);
    if (!productMap) return;

    if (!productMap.has(item.productId)) {
      productMap.set(item.productId, {
        productId: item.productId,
        productName: item.productName,
        items: [],
      });
    }

    productMap.get(item.productId)?.items.push(item);
  });

  return Array.from(categoryMap.entries())
    .map(([categoryName, productMap]) => {
      const products = Array.from(productMap.values())
        .map((product) => ({
          ...product,
          items: [...product.items].sort((a, b) => a.variantName.localeCompare(b.variantName)),
        }))
        .sort((a, b) => a.productName.localeCompare(b.productName));

      const totalItems = products.reduce((sum, product) => sum + product.items.length, 0);
      const countedItems = products.reduce(
        (sum, product) =>
          sum + product.items.filter((item) => parseCount(item.physicalCount) !== null).length,
        0
      );

      return {
        categoryName,
        data: products,
        totalItems,
        countedItems,
      };
    })
    .sort((a, b) => a.categoryName.localeCompare(b.categoryName));
};

export const getAuditProgress = (items: AuditItem[]) => {
  const total = items.length;
  const counted = items.filter((item) => parseCount(item.physicalCount) !== null).length;
  const discrepancyCount = items.filter((item) => {
    const actual = parseCount(item.physicalCount);
    return actual !== null && actual !== item.expectedStock;
  }).length;
  const matchCount = items.filter((item) => {
    const actual = parseCount(item.physicalCount);
    return actual !== null && actual === item.expectedStock;
  }).length;

  return {
    total,
    counted,
    discrepancyCount,
    matchCount,
    completionRatio: total > 0 ? counted / total : 0,
  };
};

export const getAccuracyPercentage = (items: AuditLogItem[]): number => {
  if (!items.length) return 100;
  const matched = items.filter((item) => item.actualStock === item.expectedStock).length;
  return Math.round((matched / items.length) * 100);
};

export const getVarianceBreakdown = (items: AuditLogItem[]) => {
  let short = 0;
  let over = 0;
  let matched = 0;

  items.forEach((item) => {
    if (item.discrepancy < 0) short += 1;
    else if (item.discrepancy > 0) over += 1;
    else matched += 1;
  });

  return { short, over, matched };
};

export const getLiveVarianceBreakdown = (items: AuditItem[]) => {
  let short = 0;
  let over = 0;
  let matched = 0;
  let pending = 0;

  items.forEach((item) => {
    const actual = parseCount(item.physicalCount);
    if (actual === null) {
      pending += 1;
    } else if (actual < item.expectedStock) {
      short += 1;
    } else if (actual > item.expectedStock) {
      over += 1;
    } else {
      matched += 1;
    }
  });

  return { short, over, matched, pending };
};

export const getAuditSummary = (log: AuditLog) => {
  const items = log.items ?? [];
  const accuracy = getAccuracyPercentage(items);

  return {
    id: log.id,
    completedAt: log.completedAt,
    dateLabel: new Date(log.completedAt).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
    itemsAudited: log.itemsAudited,
    discrepancies: log.discrepancies,
    performedBy: log.performedBy ?? 'Team',
    accuracy,
  };
};
