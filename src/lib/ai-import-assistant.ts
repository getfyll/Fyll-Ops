import { GoogleGenerativeAI } from '@/lib/secure-gemini';

export type ImportEntityType = 'orders' | 'customers' | 'products' | 'expenses';
export type ImportSelectionType = ImportEntityType | 'auto';
export type ImportConfidence = 'high' | 'medium' | 'low';

export interface ImportMappingSuggestion {
  selectedType: ImportSelectionType;
  detectedType: ImportEntityType;
  confidence: ImportConfidence;
  usedAI: boolean;
  note: string;
  mapping: Record<string, string | null>;
}

export const IMPORT_FIELD_DEFINITIONS: Record<ImportEntityType, string[]> = {
  customers: ['name', 'email', 'phone', 'address', 'city', 'state'],
  products: ['name', 'category', 'color', 'sku', 'selling_price', 'stock'],
  orders: [
    'order_number',
    'import_group',
    'website_order_reference',
    'customer_name',
    'customer_email',
    'customer_phone',
    'delivery_state',
    'delivery_address',
    'product_name',
    'item_sku',
    'item_barcode',
    'quantity',
    'unit_price',
    'order_date',
    'delivery_fee',
    'additional_charges',
    'additional_charges_note',
    'discount_code',
    'discount_amount',
    'payment_method',
    'source',
    'status',
  ],
  expenses: ['name', 'amount', 'date', 'category', 'supplier', 'type', 'frequency', 'notes'],
};

export const IMPORT_REQUIRED_FIELDS: Record<ImportEntityType, string[]> = {
  customers: ['name'],
  products: ['name'],
  orders: ['customer_name', 'delivery_state', 'delivery_address', 'product_name', 'quantity'],
  expenses: ['name', 'amount'],
};

const FIELD_ALIASES: Record<ImportEntityType, Record<string, string[]>> = {
  customers: {
    name: ['name', 'customer_name', 'full_name', 'customer full name'],
    email: ['email', 'email_address', 'customer_email'],
    phone: ['phone', 'phone_number', 'mobile', 'telephone', 'customer_phone'],
    address: ['address', 'street', 'street_address', 'delivery_address'],
    city: ['city', 'town'],
    state: ['state', 'province', 'region', 'delivery_state'],
  },
  products: {
    name: ['product_name', 'name', 'item_name'],
    category: ['category', 'product_category'],
    color: ['color', 'colour', 'variant', 'variant_color'],
    sku: ['sku', 'item_sku', 'variant_sku'],
    selling_price: ['selling_price', 'price', 'unit_price', 'item_price', 'sale_price'],
    stock: ['stock', 'quantity_on_hand', 'qty_on_hand', 'inventory'],
  },
  orders: {
    order_number: ['order_number', 'order_no', 'order', 'id'],
    import_group: ['import_group', 'order_group', 'group_key'],
    website_order_reference: ['website_order_reference', 'website_reference', 'external_order_reference', 'woocommerce_order_id'],
    customer_name: ['customer_name', 'name', 'billing_name', 'full_name'],
    customer_email: ['customer_email', 'email', 'billing_email'],
    customer_phone: ['customer_phone', 'phone', 'phone_number', 'billing_phone'],
    delivery_state: ['delivery_state', 'state', 'shipping_state'],
    delivery_address: ['delivery_address', 'address', 'shipping_address', 'shipping_address_1'],
    product_name: ['product_name', 'item_name', 'product', 'line_item_name'],
    item_sku: ['item_sku', 'sku', 'variant_sku'],
    item_barcode: ['item_barcode', 'barcode', 'variant_barcode'],
    quantity: ['quantity', 'qty', 'item_quantity'],
    unit_price: ['unit_price', 'item_price', 'price', 'line_total'],
    order_date: ['order_date', 'date', 'created_at', 'date_created'],
    delivery_fee: ['delivery_fee', 'shipping_fee', 'shipping_total'],
    additional_charges: ['additional_charges', 'extra_charges', 'fees'],
    additional_charges_note: ['additional_charges_note', 'charges_note', 'fee_notes'],
    discount_code: ['discount_code', 'coupon', 'coupon_code'],
    discount_amount: ['discount_amount', 'discount', 'coupon_amount'],
    payment_method: ['payment_method', 'payment_gateway'],
    source: ['source', 'channel', 'sale_source', 'platform'],
    status: ['status', 'order_status'],
  },
  expenses: {
    name: ['name', 'expense_name', 'description', 'title'],
    amount: ['amount', 'total', 'expense_amount', 'value'],
    date: ['date', 'expense_date', 'transaction_date', 'created_at'],
    category: ['category', 'expense_category'],
    supplier: ['supplier', 'merchant', 'vendor', 'payee'],
    type: ['type', 'expense_type'],
    frequency: ['frequency', 'recurrence'],
    notes: ['notes', 'note', 'memo', 'comment'],
  },
};

const GEMINI_API_KEY = 'server-side';
const GEMINI_MODEL = process.env.EXPO_PUBLIC_GEMINI_MODEL || 'gemini-2.5-flash';

const normalizeHeader = (value: string) => (
  value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
);

const normalizeConfidence = (value?: string): ImportConfidence => {
  const normalized = (value ?? '').trim().toLowerCase();
  if (normalized === 'high' || normalized === 'medium' || normalized === 'low') return normalized;
  return 'medium';
};

const buildHeaderIndex = (headers: string[]) => {
  const headerMap = new Map<string, string>();
  headers.forEach((header) => {
    const normalized = normalizeHeader(header);
    if (!headerMap.has(normalized)) headerMap.set(normalized, header);
  });
  return headerMap;
};

const findHeaderForAlias = (aliases: string[], headerMap: Map<string, string>): string | null => {
  for (const alias of aliases) {
    const exact = headerMap.get(normalizeHeader(alias));
    if (exact) return exact;
  }

  for (const alias of aliases) {
    const normalizedAlias = normalizeHeader(alias);
    for (const [normalizedHeader, originalHeader] of headerMap.entries()) {
      if (normalizedHeader.includes(normalizedAlias) || normalizedAlias.includes(normalizedHeader)) {
        return originalHeader;
      }
    }
  }

  return null;
};

const mapHeadersHeuristically = (headers: string[], type: ImportEntityType): Record<string, string | null> => {
  const headerMap = buildHeaderIndex(headers);
  const aliases = FIELD_ALIASES[type];
  const mapping: Record<string, string | null> = {};

  Object.entries(aliases).forEach(([field, fieldAliases]) => {
    mapping[field] = findHeaderForAlias(fieldAliases, headerMap);
  });

  return mapping;
};

const scoreType = (headers: string[], type: ImportEntityType): number => {
  const mapping = mapHeadersHeuristically(headers, type);
  const required = IMPORT_REQUIRED_FIELDS[type];
  const allFields = IMPORT_FIELD_DEFINITIONS[type];

  let score = 0;
  required.forEach((field) => {
    if (mapping[field]) score += 3;
  });
  allFields.forEach((field) => {
    if (!required.includes(field) && mapping[field]) score += 1;
  });
  return score;
};

export const detectImportTypeFromHeaders = (headers: string[]): { detectedType: ImportEntityType; confidence: ImportConfidence } => {
  const candidates: ImportEntityType[] = ['orders', 'customers', 'products', 'expenses'];
  const scores = candidates.map((type) => ({ type, score: scoreType(headers, type) }));
  scores.sort((a, b) => b.score - a.score);

  const top = scores[0];
  const second = scores[1];
  const confidence: ImportConfidence = top.score >= 12
    ? 'high'
    : (top.score >= 6 && (top.score - second.score >= 2) ? 'medium' : 'low');

  return {
    detectedType: top.type,
    confidence,
  };
};

const toRowObjects = (headers: string[], rows: string[][]) => rows.slice(0, 6).map((row) => {
  const item: Record<string, string> = {};
  headers.forEach((header, index) => {
    item[header] = row[index] ?? '';
  });
  return item;
});

const sanitizeDetectedType = (value: string | undefined, fallback: ImportEntityType): ImportEntityType => {
  const normalized = (value ?? '').trim().toLowerCase();
  if (normalized === 'orders' || normalized === 'customers' || normalized === 'products' || normalized === 'expenses') {
    return normalized;
  }
  return fallback;
};

const sanitizeAiMapping = (
  mapping: Record<string, string | null> | undefined,
  allowedFields: string[],
  headers: string[]
): Record<string, string | null> => {
  const normalizedHeaderLookup = new Map<string, string>();
  headers.forEach((header) => {
    normalizedHeaderLookup.set(normalizeHeader(header), header);
  });

  const output: Record<string, string | null> = {};
  allowedFields.forEach((field) => {
    const raw = mapping?.[field];
    if (!raw) {
      output[field] = null;
      return;
    }
    const resolved = normalizedHeaderLookup.get(normalizeHeader(raw));
    output[field] = resolved ?? null;
  });
  return output;
};

const mergeMappings = (
  heuristic: Record<string, string | null>,
  ai: Record<string, string | null>
): Record<string, string | null> => {
  const merged: Record<string, string | null> = { ...heuristic };
  Object.entries(ai).forEach(([field, header]) => {
    if (header) merged[field] = header;
  });
  return merged;
};

const buildAiPrompt = (
  selectedType: ImportSelectionType,
  headers: string[],
  sampleRows: Record<string, string>[]
) => {
  const typeInstruction = selectedType === 'auto'
    ? 'Detect one dataset type from: orders, customers, products, expenses.'
    : `Use dataset type: ${selectedType}.`;

  return `You map CSV columns for data import. ${typeInstruction}

Rules:
- Return only strict JSON.
- Keep mapping values as exact header names from the provided headers.
- Use null when no header match exists.
- confidence must be high, medium, or low.

Field schema:
${JSON.stringify(IMPORT_FIELD_DEFINITIONS)}

CSV headers:
${JSON.stringify(headers)}

Sample rows:
${JSON.stringify(sampleRows)}

Output JSON format:
{
  "detectedType": "orders|customers|products|expenses",
  "confidence": "high|medium|low",
  "mapping": { "field_name": "Exact Header" | null },
  "note": "short note"
}`;
};

const parseJsonFromText = (text: string): Record<string, any> | null => {
  const direct = text.trim();
  try {
    return JSON.parse(direct);
  } catch {
    const match = direct.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
};

const requestAiMapping = async (
  selectedType: ImportSelectionType,
  headers: string[],
  sampleRows: Record<string, string>[]
) => {
  if (!GEMINI_API_KEY) return null;

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
    },
  });

  const result = await model.generateContent(buildAiPrompt(selectedType, headers, sampleRows));
  const response = await result.response;
  const text = response.text();
  return parseJsonFromText(text);
};

export const suggestImportMapping = async (params: {
  selectedType: ImportSelectionType;
  headers: string[];
  rows: string[][];
}): Promise<ImportMappingSuggestion> => {
  const { selectedType, headers, rows } = params;

  const heuristicDetection = detectImportTypeFromHeaders(headers);
  const initialType = selectedType === 'auto' ? heuristicDetection.detectedType : selectedType;
  const heuristicMapping = mapHeadersHeuristically(headers, initialType);

  let detectedType: ImportEntityType = initialType;
  let confidence: ImportConfidence = selectedType === 'auto' ? heuristicDetection.confidence : 'medium';
  let finalMapping = heuristicMapping;
  let note = selectedType === 'auto'
    ? `Detected ${initialType} from headers.`
    : `Using ${initialType} mapping template.`;
  let usedAI = false;

  try {
    const aiPayload = await requestAiMapping(selectedType, headers, toRowObjects(headers, rows));
    if (aiPayload) {
      const aiDetectedType = sanitizeDetectedType(
        typeof aiPayload.detectedType === 'string' ? aiPayload.detectedType : undefined,
        initialType
      );
      detectedType = selectedType === 'auto' ? aiDetectedType : initialType;
      confidence = normalizeConfidence(typeof aiPayload.confidence === 'string' ? aiPayload.confidence : confidence);

      const allowedFields = IMPORT_FIELD_DEFINITIONS[detectedType];
      const aiMapping = sanitizeAiMapping(
        typeof aiPayload.mapping === 'object' && aiPayload.mapping
          ? (aiPayload.mapping as Record<string, string | null>)
          : undefined,
        allowedFields,
        headers
      );
      const nextHeuristic = mapHeadersHeuristically(headers, detectedType);
      finalMapping = mergeMappings(nextHeuristic, aiMapping);

      const aiNote = typeof aiPayload.note === 'string' ? aiPayload.note.trim() : '';
      note = aiNote || `AI mapped columns for ${detectedType}.`;
      usedAI = true;
    }
  } catch {
    // Keep heuristic mapping if AI fails.
    const fallbackType = selectedType === 'auto' ? detectedType : initialType;
    finalMapping = mapHeadersHeuristically(headers, fallbackType);
    note = `AI unavailable, used smart header matching for ${fallbackType}.`;
    usedAI = false;
  }

  return {
    selectedType,
    detectedType,
    confidence,
    usedAI,
    note,
    mapping: finalMapping,
  };
};

export const readMappedValue = (
  row: Record<string, string>,
  mapping: Record<string, string | null>,
  field: string
): string => {
  const header = mapping[field];
  if (!header) return '';
  return (row[header] ?? '').trim();
};

export const parseCurrencyNumber = (value: string): number => {
  const sanitized = value
    .replace(/[^0-9,.-]/g, '')
    .replace(/,(?=\d{3}(\D|$))/g, '');
  const parsed = Number.parseFloat(sanitized);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const parseFlexibleDateToIso = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return new Date().toISOString();

  const isoParsed = new Date(trimmed);
  if (!Number.isNaN(isoParsed.getTime())) return isoParsed.toISOString();

  const slashMatch = trimmed.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (slashMatch) {
    const d1 = Number.parseInt(slashMatch[1], 10);
    const d2 = Number.parseInt(slashMatch[2], 10);
    const yRaw = Number.parseInt(slashMatch[3], 10);
    const year = yRaw < 100 ? 2000 + yRaw : yRaw;

    // Day-first fallback used across the app.
    const dayFirst = new Date(year, d2 - 1, d1);
    if (!Number.isNaN(dayFirst.getTime())) return dayFirst.toISOString();
  }

  return new Date().toISOString();
};
