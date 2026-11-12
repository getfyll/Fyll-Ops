import type { OrderItem, Product, ProductVariant } from '@/lib/state/fyll-store';

// Website (storefront / WooCommerce) orders list the website's own product and variant ids,
// which differ from the inventory product the website item is linked to (Inventory > Linking).
// This resolves an order line to a specific inventory product + variant so sales made on the
// website show up in that product's activity and sold counts.

type LooseOrderItem = OrderItem & Record<string, unknown>;

const normalizeKey = (value: unknown) => (
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^wc[\s#:-]*/i, '')
    .replace(/^woo[\s#:-]*/i, '')
    .replace(/^product[\s#:-]*/i, '')
    .replace(/^variation[\s#:-]*/i, '')
    .replace(/^variant[\s#:-]*/i, '')
    .replace(/[^a-z0-9]+/g, '')
);

const keysOf = (values: unknown[]) => values.map(normalizeKey).filter(Boolean);

const productKeys = (product: Product) => keysOf([
  product.wooCommerceProductId,
  product.sourceProductId,
  product.websiteProductId,
]);

const variantKeys = (variant: ProductVariant) => keysOf([
  variant.wooCommerceVariationId,
  variant.sourceVariantId,
]);

const itemProductKeys = (item: LooseOrderItem) => keysOf([
  item.productId,
  item.wooCommerceId,
  item.wooCommerceProductId,
  item.websiteProductId,
  item.sourceProductId,
]);

const itemVariantKeys = (item: LooseOrderItem) => keysOf([
  item.variantId,
  item.wooVariationId,
  item.wooCommerceVariationId,
  item.sourceVariantId,
]);

/** Returns the inventory variant an order line belongs to, or null if it isn't for this product. */
export function resolveOrderItemVariant(rawItem: OrderItem, product: Product): { variantId: string } | null {
  const item = rawItem as LooseOrderItem;

  // Created in Ops (or the website sells the inventory product directly).
  if (item.productId === product.id) {
    return { variantId: item.variantId };
  }

  const itemSku = normalizeKey(item.variantSku ?? item.sku);
  const skuVariant = itemSku
    ? product.variants.find((variant) => normalizeKey(variant.sku) === itemSku)
    : undefined;

  const productLinked = (() => {
    const wanted = productKeys(product);
    return wanted.length > 0 && itemProductKeys(item).some((key) => wanted.includes(key));
  })();

  if (!productLinked && !skuVariant) return null;

  const wantedVariantKeys = itemVariantKeys(item);
  const linkedVariant = wantedVariantKeys.length > 0
    ? product.variants.find((variant) => variantKeys(variant).some((key) => wantedVariantKeys.includes(key)))
    : undefined;

  const variant = skuVariant
    ?? linkedVariant
    ?? product.variants.find((candidate) => candidate.id === item.variantId)
    ?? (product.variants.length === 1 ? product.variants[0] : undefined);

  return { variantId: variant?.id ?? item.variantId };
}

/**
 * Who to show as the seller of an order. Orders made by a staff member keep their name. Orders nobody on the team
 * made are named after where they came from: "WooCommerce" for synced website orders, "Storefront" for Fyll
 * Storefront / Fyll Checkout orders. Anything else with no author stays undefined (callers show "System").
 */
export function getOrderActorLabel(order: { createdBy?: string; source?: string } & Record<string, unknown>): string | undefined {
  const channel = [order.source, order.platform, order.salesChannel, order.channel]
    .map((value) => String(value ?? '').toLowerCase().replace(/[_-]+/g, ' '))
    .join(' ');
  const creator = order.createdBy?.trim();
  const noStaffMember = !creator || /^(system|woocommerce sync|woocommerce|fyll storefront|storefront)$/i.test(creator);

  if (/^woocommerce( sync)?$/i.test(creator ?? '')) return 'WooCommerce';
  if (!noStaffMember) return creator;
  if (/storefront|fyll store|fyll checkout/.test(channel)) return 'Storefront';
  if (/woo ?commerce/.test(channel)) return 'WooCommerce';
  return undefined;
}

/**
 * Builds a fast lookup that attributes any order line (including website / WooCommerce lines) to an inventory
 * product, for reports that cover every product at once. Matching order: the inventory product id, a linked website
 * product id, then a variant SKU.
 */
export function buildOrderItemProductResolver(products: Product[]) {
  const byId = new Map<string, Product>();
  const byWebsiteKey = new Map<string, Product>();
  const bySku = new Map<string, Product>();

  products.forEach((product) => {
    byId.set(product.id, product);
    productKeys(product).forEach((key) => {
      if (!byWebsiteKey.has(key)) byWebsiteKey.set(key, product);
    });
    product.variants.forEach((variant) => {
      const sku = normalizeKey(variant.sku);
      if (sku && !bySku.has(sku)) bySku.set(sku, product);
    });
  });

  return (rawItem: OrderItem): Product | null => {
    const item = rawItem as LooseOrderItem;
    const direct = byId.get(item.productId);
    if (direct) return direct;
    for (const key of itemProductKeys(item)) {
      const linked = byWebsiteKey.get(key);
      if (linked) return linked;
    }
    const sku = normalizeKey(item.variantSku ?? item.sku);
    return sku ? bySku.get(sku) ?? null : null;
  };
}
