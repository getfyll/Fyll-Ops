import type { Order } from '@/lib/state/fyll-store';

export type OrderQcRequirement = {
  key: string;
  label: string;
  order: number;
};

export const DEFAULT_ORDER_QC_REQUIREMENTS: OrderQcRequirement[] = [
  { key: 'no-defects', label: 'No defects', order: 1 },
  { key: 'no-breakage', label: 'No breakage', order: 2 },
  { key: 'no-stains', label: 'No stains', order: 3 },
  { key: 'correct-colour', label: 'Correct colour', order: 4 },
  { key: 'correct-glasses', label: 'Correct glasses', order: 5 },
  { key: 'ready-to-pack', label: 'Ready to pack', order: 6 },
];

export const slugifyOrderQcRequirement = (value: string) => value
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/(^-|-$)+/g, '');

export const buildOrderQcRequirement = (
  label: string,
  existing: OrderQcRequirement[] = []
): OrderQcRequirement => {
  const trimmedLabel = label.trim();
  const baseSlug = slugifyOrderQcRequirement(trimmedLabel) || 'qc-check';
  const existingKeys = new Set(existing.map((item) => item.key));
  let key = baseSlug;
  let suffix = 2;

  while (existingKeys.has(key)) {
    key = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return {
    key,
    label: trimmedLabel,
    order: existing.length + 1,
  };
};

export const sanitizeOrderQcRequirements = (
  requirements?: OrderQcRequirement[] | null,
  fallbackToDefaults = true
): OrderQcRequirement[] => {
  if (!Array.isArray(requirements)) {
    return fallbackToDefaults ? DEFAULT_ORDER_QC_REQUIREMENTS : [];
  }

  const seenKeys = new Set<string>();
  const seenLabels = new Set<string>();
  const sanitized = requirements
    .slice()
    .sort((a, b) => {
      const aOrder = typeof a?.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER;
      const bOrder = typeof b?.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return (a?.label ?? '').localeCompare(b?.label ?? '');
    })
    .reduce<OrderQcRequirement[]>((items, requirement) => {
      const label = requirement?.label?.trim();
      if (!label) return items;

      const labelKey = label.toLowerCase();
      if (seenLabels.has(labelKey)) return items;
      seenLabels.add(labelKey);

      const preferredKey = requirement?.key?.trim() || slugifyOrderQcRequirement(label);
      const baseKey = preferredKey || `qc-check-${items.length + 1}`;
      let key = baseKey;
      let suffix = 2;
      while (seenKeys.has(key)) {
        key = `${baseKey}-${suffix}`;
        suffix += 1;
      }
      seenKeys.add(key);

      items.push({ key, label, order: items.length + 1 });
      return items;
    }, []);

  return sanitized.length > 0 || !fallbackToDefaults
    ? sanitized
    : DEFAULT_ORDER_QC_REQUIREMENTS;
};

export const ORDER_QC_REQUIREMENTS = DEFAULT_ORDER_QC_REQUIREMENTS;

export const getOrderQcChecklist = (order?: Pick<Order, 'qcChecklist'> | null) => (
  order?.qcChecklist ?? []
);

export const isOrderQcChecklistComplete = (
  order?: Pick<Order, 'qcChecklist'> | null,
  requirements: OrderQcRequirement[] = DEFAULT_ORDER_QC_REQUIREMENTS
) => {
  const activeRequirements = sanitizeOrderQcRequirements(requirements, false);
  const checked = new Set(getOrderQcChecklist(order));
  return activeRequirements.every((item) => checked.has(item.key));
};
