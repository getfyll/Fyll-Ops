import type { OrderItem, Product, ProductVariant } from '@/lib/state/fyll-store';
import type { WooNormalizedLineItem, WooNormalizedOrder, WooNormalizedProduct } from '@/lib/woocommerce';

const slugifyValue = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/(^-|-$)+/g, '');

export const normalizeWooLookupValue = (value: string | null | undefined) => {
  const trimmed = (value ?? '').trim().toLowerCase();
  if (!trimmed) return '';
  return trimmed
    .replace(/^wc[\s#:-]*/i, '')
    .replace(/^order[\s#:-]*/i, '')
    .replace(/^#/, '')
    .trim();
};

export const getWooImportedProductId = (item: WooNormalizedLineItem) => (
  item.productId?.trim() || `woo-product-${slugifyValue(item.name) || item.id}`
);

export const getWooImportedVariantId = (item: WooNormalizedLineItem, productId: string) => (
  item.variationId?.trim() || `${productId}-default`
);

const extractWooIdToken = (value: string | null | undefined) => {
  const token = (value ?? '')
    .trim()
    .replace(/^woo-product-/, '')
    .replace(/^woo-variant-/, '')
    .replace(/-default$/, '')
    .trim();

  return token && token.toLowerCase() !== 'default' ? token : '';
};

const buildWooFallbackSku = (
  name: string,
  productId: string | null | undefined,
  variantId: string | null | undefined
) => {
  const productToken = extractWooIdToken(productId);
  const variantToken = extractWooIdToken(variantId);
  const idToken = variantToken && variantToken !== productToken
    ? `${productToken || 'PRODUCT'}-${variantToken}`
    : productToken || variantToken;

  if (idToken) return `WOO-${idToken.toUpperCase()}`;

  const nameToken = slugifyValue(name).replace(/-/g, '').slice(0, 12).toUpperCase();
  return nameToken ? `WOO-${nameToken}` : 'WOO-PRODUCT';
};

const normalizeWooSku = (
  sku: string | null | undefined,
  name: string,
  productId: string | null | undefined,
  variantId: string | null | undefined
) => {
  const trimmed = (sku ?? '').trim();
  if (trimmed && trimmed.toUpperCase() !== 'WOO--DEFAULT') return trimmed;
  return buildWooFallbackSku(name, productId, variantId);
};

export const resolveWooResidualCharges = (order: WooNormalizedOrder) => {
  const residual = order.totalAmount - order.subtotalAmount - order.shippingAmount + order.discountAmount;
  const rounded = Number(residual.toFixed(2));
  return rounded > 0 ? rounded : 0;
};

export const buildWooImportedProduct = (item: WooNormalizedLineItem, timestamp: string): Product => {
  const productId = getWooImportedProductId(item);
  const variantId = getWooImportedVariantId(item, productId);

  return {
    id: productId,
    name: item.name,
    description: 'Imported automatically from WooCommerce orders.',
    categories: ['WooCommerce'],
    variants: [
      {
        id: variantId,
        sku: normalizeWooSku(item.sku, item.name, productId, variantId),
        barcode: '',
        variableValues: { Source: 'WooCommerce' },
        stock: 0,
        sellingPrice: item.unitPrice,
      },
    ],
    lowStockThreshold: 0,
    createdAt: timestamp,
    productType: 'product',
    createdBy: 'WooCommerce Sync',
    useGlobalStock: false,
  };
};

const buildWooCatalogVariant = (item: WooNormalizedProduct): ProductVariant => ({
  id: item.variationId,
  sku: normalizeWooSku(item.sku, item.name, item.productId, item.variationId),
  barcode: '',
  variableValues: Object.keys(item.attributes ?? {}).length > 0
    ? item.attributes
    : {},
  stock: item.stock,
  sellingPrice: item.price,
  imageUrl: item.imageUrl || undefined,
  wooCommerceProductId: item.productId.replace(/^woo-product-/, ''),
  wooCommerceVariationId: item.variationId.replace(/^woo-variant-/, ''),
  sourceProductId: item.productId,
  sourceVariantId: item.variationId,
});

export const buildWooCatalogProduct = (
  productId: string,
  items: WooNormalizedProduct[],
  timestamp: string
): Product => {
  const firstItem = items[0];

  return {
    id: productId,
    name: firstItem?.name || 'WooCommerce Product',
    description: 'Imported automatically from WooCommerce catalog.',
    categories: firstItem?.categories?.length ? firstItem.categories : ['WooCommerce'],
    variants: items.map(buildWooCatalogVariant),
    lowStockThreshold: 0,
    createdAt: timestamp,
    productType: 'product',
    imageUrl: firstItem?.imageUrl || undefined,
    createdBy: 'WooCommerce Sync',
    useGlobalStock: false,
    wooCommerceProductId: productId.replace(/^woo-product-/, ''),
    sourceProductId: productId,
    websiteProductId: productId.replace(/^woo-product-/, ''),
  };
};

type EnsureWooProductsInput = {
  businessId: string;
  lineItems: WooNormalizedLineItem[];
  products: Product[];
  addProductsBulk: (products: Product[], businessId?: string | null) => Promise<void>;
  updateProduct: (productId: string, updates: Partial<Product>, businessId?: string | null) => Promise<void>;
};

export const ensureWooProductsExist = async ({
  businessId,
  lineItems,
  products,
  addProductsBulk,
  updateProduct,
}: EnsureWooProductsInput) => {
  const timestamp = new Date().toISOString();
  const productMap = new Map<string, Product>(products.map((product) => [product.id, product]));
  const createdProducts: Product[] = [];
  const productUpdates = new Map<string, ProductVariant[]>();

  for (const lineItem of lineItems) {
    const productId = getWooImportedProductId(lineItem);
    const variantId = getWooImportedVariantId(lineItem, productId);
    const existingProduct = productMap.get(productId);

    if (!existingProduct) {
      const nextProduct = buildWooImportedProduct(lineItem, timestamp);
      createdProducts.push(nextProduct);
      productMap.set(nextProduct.id, nextProduct);
      continue;
    }

    const existingVariant = existingProduct.variants.find((variant) => variant.id === variantId);
    if (existingVariant) continue;

    const nextVariants = [
      ...existingProduct.variants,
      {
        id: variantId,
        sku: normalizeWooSku(lineItem.sku, lineItem.name, productId, variantId),
        barcode: '',
        variableValues: { Source: 'WooCommerce' },
        stock: 0,
        sellingPrice: lineItem.unitPrice,
      },
    ];

    productUpdates.set(existingProduct.id, nextVariants);
    productMap.set(existingProduct.id, {
      ...existingProduct,
      variants: nextVariants,
    });
  }

  if (createdProducts.length > 0) {
    await addProductsBulk(createdProducts, businessId);
  }

  for (const [productId, variants] of productUpdates.entries()) {
    await updateProduct(productId, { variants }, businessId);
  }

  return {
    productMap,
    createdCount: createdProducts.length,
    updatedCount: productUpdates.size,
  };
};

type EnsureWooCatalogProductsInput = {
  businessId: string;
  wooProducts: WooNormalizedProduct[];
  products: Product[];
  addProductsBulk: (products: Product[], businessId?: string | null) => Promise<void>;
  updateProduct: (productId: string, updates: Partial<Product>, businessId?: string | null) => Promise<void>;
};

export const ensureWooCatalogProductsExist = async ({
  businessId,
  wooProducts,
  products,
  addProductsBulk,
  updateProduct,
}: EnsureWooCatalogProductsInput) => {
  const timestamp = new Date().toISOString();
  const existingProducts = new Map<string, Product>(products.map((product) => [product.id, product]));
  const grouped = new Map<string, WooNormalizedProduct[]>();

  wooProducts.forEach((item) => {
    if (!item.productId || !item.variationId) return;
    const current = grouped.get(item.productId) ?? [];
    current.push(item);
    grouped.set(item.productId, current);
  });

  const createdProducts: Product[] = [];
  const updatedProducts: Product[] = [];

  for (const [productId, groupItems] of grouped.entries()) {
    const existingProduct = existingProducts.get(productId);
    const nextImportedProduct = buildWooCatalogProduct(productId, groupItems, timestamp);

    if (!existingProduct) {
      createdProducts.push(nextImportedProduct);
      continue;
    }

    const existingVariants = new Map(existingProduct.variants.map((variant) => [variant.id, variant]));
    const nextVariants = nextImportedProduct.variants.map((variant) => ({
      ...(existingVariants.get(variant.id) ?? variant),
      ...variant,
    }));

    updatedProducts.push({
      ...existingProduct,
      name: nextImportedProduct.name,
      categories: nextImportedProduct.categories,
      imageUrl: nextImportedProduct.imageUrl ?? existingProduct.imageUrl,
      variants: nextVariants,
      catalogSource: undefined,
      wooCommerceProductId: nextImportedProduct.wooCommerceProductId,
      sourceProductId: nextImportedProduct.sourceProductId,
      websiteProductId: nextImportedProduct.websiteProductId,
      useGlobalStock: false,
    });
  }

  if (createdProducts.length > 0) {
    await addProductsBulk(createdProducts, businessId);
  }

  for (const product of updatedProducts) {
    await updateProduct(product.id, product, businessId);
  }

  return {
    fetchedCount: wooProducts.length,
    productCount: grouped.size,
    createdCount: createdProducts.length,
    updatedCount: updatedProducts.length,
  };
};

export const mapWooOrderToOrderItems = (
  lineItems: WooNormalizedLineItem[],
  productMap: Map<string, Product>
): OrderItem[] => (
  lineItems.map((lineItem) => {
    const productId = getWooImportedProductId(lineItem);
    const product = productMap.get(productId);
    const fallbackVariantId = getWooImportedVariantId(lineItem, productId);
    const variantId = product?.variants.find((variant) => variant.id === fallbackVariantId)?.id
      ?? product?.variants[0]?.id
      ?? fallbackVariantId;

    return {
      productId,
      variantId,
      quantity: lineItem.quantity,
      unitPrice: lineItem.unitPrice,
    };
  })
);
