export interface AuditItem {
  productId: string;
  productName: string;
  categoryName: string;
  variantId: string;
  variantName: string;
  combinedName: string;
  expectedStock: number;
  physicalCount: string;
  sku: string;
  sourceType?: 'product' | 'warehouse';
  unit?: string;
}

export type AuditStatusFilter = 'all' | 'uncounted' | 'discrepancies';

export interface ProductAuditGroup {
  productId: string;
  productName: string;
  items: AuditItem[];
}

export interface CategoryAuditSection {
  categoryName: string;
  data: ProductAuditGroup[];
  totalItems: number;
  countedItems: number;
}
