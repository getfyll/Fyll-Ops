import { GoogleGenerativeAI } from '@/lib/secure-gemini';

const GEMINI_API_KEY = 'server-side';
const GEMINI_MODEL = process.env.EXPO_PUBLIC_GEMINI_MODEL || '';
const MAX_RETRIES = 2;
const RETRY_DELAYS_MS = [1200, 2500];
const SUPPORTED_GEMINI_INLINE_MIME_PREFIXES = ['image/'];
const SUPPORTED_GEMINI_INLINE_MIME_TYPES = ['application/pdf', 'text/plain'];

export type ExpenseDraftType = 'one-time' | 'recurring';
export type ExpenseDraftFrequency = 'Monthly' | 'Quarterly' | 'Yearly';

export interface ExpenseDraftLineItem {
  label: string;
  amount: number;
  category: string;
  kind: 'base' | 'charge';
}

export interface ExpenseDraftData {
  name: string;
  merchant: string;
  category: string;
  amount: number;
  expenseDate: string;
  type: ExpenseDraftType;
  frequency: ExpenseDraftFrequency;
  note: string;
  confidence: 'high' | 'medium' | 'low';
  lineItems?: ExpenseDraftLineItem[];
}

const EXPENSE_DRAFT_PROMPT = `
You are an AI assistant for a Nigerian business finance app called Fyll.
Extract an expense draft from uploaded receipt image(s) and optional notes.

Return JSON in this exact shape:
{
  "name": "Short expense title",
  "merchant": "Supplier/merchant name if visible",
  "category": "Best matching category",
  "amount": 0,
  "expenseDate": "YYYY-MM-DD",
  "type": "one-time | recurring",
  "frequency": "Monthly | Quarterly | Yearly",
  "note": "Any useful details from receipt",
  "confidence": "high | medium | low",
  "lineItems": [
    {
      "label": "Base amount",
      "amount": 0,
      "category": "Category name",
      "kind": "base | charge"
    }
  ]
}

Rules:
- If amount is unknown, return 0.
- If date is unknown, return today's date in YYYY-MM-DD.
- Default type to "one-time" unless recurring subscription/rent/salary/bill is clearly indicated.
- If type is one-time, frequency should still be "Monthly".
- Keep title concise and business-friendly.
`;

const EXPENSE_DRAFT_KEYS: (keyof ExpenseDraftData)[] = [
  'name',
  'merchant',
  'category',
  'amount',
  'expenseDate',
  'type',
  'frequency',
  'note',
  'confidence',
  'lineItems',
];

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const looksLikeExpenseDraft = (value: unknown): value is Record<string, unknown> => {
  if (!isRecord(value)) return false;
  const matchedKeys = EXPENSE_DRAFT_KEYS.reduce(
    (count, key) => (key in value ? count + 1 : count),
    0
  );
  return matchedKeys >= 3;
};

const coerceExpenseDraft = (value: unknown): ExpenseDraftData | null => {
  if (looksLikeExpenseDraft(value)) return value as unknown as ExpenseDraftData;

  if (Array.isArray(value)) {
    const match = value.find(looksLikeExpenseDraft);
    if (match) return match as unknown as ExpenseDraftData;
    return null;
  }

  if (!isRecord(value)) return null;

  const objectSlots = ['draft', 'expense', 'result', 'data', 'output'] as const;
  for (const slot of objectSlots) {
    if (slot in value) {
      const match = coerceExpenseDraft(value[slot]);
      if (match) return match;
    }
  }

  const arraySlots = ['drafts', 'expenses', 'results', 'items'] as const;
  for (const slot of arraySlots) {
    if (slot in value) {
      const match = coerceExpenseDraft(value[slot]);
      if (match) return match;
    }
  }

  return null;
};

const tryParseJson = (source: string): unknown | null => {
  const trimmed = source.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
};

const stripSingleCodeFence = (source: string): string => {
  const trimmed = source.trim();
  return trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
};

const collectFenceBlocks = (source: string): string[] => {
  const blocks: string[] = [];
  const pattern = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match = pattern.exec(source);
  while (match) {
    if (match[1]) blocks.push(match[1].trim());
    match = pattern.exec(source);
  }
  return blocks;
};

const collectBalancedJsonSegments = (source: string): string[] => {
  const segments: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      if (depth > 0) inString = true;
      continue;
    }

    if (char === '{' || char === '[') {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }

    if (char === '}' || char === ']') {
      if (depth === 0) continue;
      depth -= 1;
      if (depth === 0 && start >= 0) {
        segments.push(source.slice(start, index + 1));
        start = -1;
      }
    }
  }

  return segments;
};

const parseExpenseDraftFromResponse = (responseText: string): ExpenseDraftData => {
  const candidates = new Set<string>();
  const trimmed = responseText.trim();
  if (trimmed) candidates.add(trimmed);

  const unfenced = stripSingleCodeFence(responseText);
  if (unfenced) candidates.add(unfenced);

  collectFenceBlocks(responseText).forEach((block) => candidates.add(block));

  const balancedSegments = collectBalancedJsonSegments(responseText)
    .sort((left, right) => right.length - left.length);
  balancedSegments.forEach((segment) => candidates.add(segment));

  for (const candidate of candidates) {
    const parsed = tryParseJson(candidate);
    if (parsed === null) continue;
    const draft = coerceExpenseDraft(parsed);
    if (draft) return draft;
  }

  throw new Error('Could not parse structured expense draft JSON from AI response.');
};

export async function parseMultipleExpenseDrafts(params: {
  imageDataUrls: string[];
  categories?: string[];
  suppliers?: string[];
}): Promise<ExpenseDraftData[]> {
  if (params.imageDataUrls.length === 0) return [];

  const results = await Promise.allSettled(
    params.imageDataUrls.map((url) =>
      parseExpenseDraft({
        imageDataUrls: [url],
        categories: params.categories,
        suppliers: params.suppliers,
      })
    )
  );

  return results
    .filter((r): r is PromiseFulfilledResult<ExpenseDraftData | null> => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter((d): d is ExpenseDraftData => d !== null);
}

export async function parseExpenseDraft(params: {
  messageText?: string;
  imageDataUrls?: string[];
  categories?: string[];
  suppliers?: string[];
}): Promise<ExpenseDraftData | null> {
  if (!GEMINI_API_KEY) {
    throw new Error('Fyll AI is not configured. Add GEMINI_API_KEY as a private Supabase secret.');
  }

  const text = params.messageText?.trim();
  const imageDataUrls = Array.from(new Set(
    (params.imageDataUrls ?? [])
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value))
  ));

  if (!text && imageDataUrls.length === 0) {
    throw new Error('Add receipt image(s) or notes to generate a Fyll AI draft.');
  }

  const categoriesHint = (params.categories ?? []).filter(Boolean).slice(0, 30).join(', ');
  const suppliersHint = (params.suppliers ?? []).filter(Boolean).slice(0, 30).join(', ');
  const promptText = `${EXPENSE_DRAFT_PROMPT}

Known categories:
${categoriesHint || '(none)'}

Known suppliers:
${suppliersHint || '(none)'}

Extra note:
${text || '(none)'}
`;

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const responseText = await generateWithModelFallback(genAI, promptText, imageDataUrls);
  const parsed = parseExpenseDraftFromResponse(responseText);
  return normalizeDraft(parsed, params.categories ?? []);
}

const normalizeType = (value: string | undefined): ExpenseDraftType => {
  const normalized = (value ?? '').trim().toLowerCase();
  if (normalized === 'recurring') return 'recurring';
  return 'one-time';
};

const normalizeFrequency = (value: string | undefined): ExpenseDraftFrequency => {
  const normalized = (value ?? '').trim().toLowerCase();
  if (normalized === 'quarterly') return 'Quarterly';
  if (normalized === 'yearly' || normalized === 'annual') return 'Yearly';
  return 'Monthly';
};

const normalizeDate = (value: string | undefined): string => {
  const trimmed = (value ?? '').trim();
  const direct = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (direct) return trimmed;

  const parsed = new Date(trimmed);
  if (Number.isFinite(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }
  return new Date().toISOString().split('T')[0];
};

function normalizeDraft(draft: ExpenseDraftData, knownCategories: string[]): ExpenseDraftData {
  const type = normalizeType(draft.type);
  const frequency = normalizeFrequency(draft.frequency);
  const normalizedCategory = (draft.category || '').trim();
  const matchingCategory = knownCategories.find(
    (category) => category.trim().toLowerCase() === normalizedCategory.toLowerCase()
  );

  const lineItems = Array.isArray(draft.lineItems)
    ? draft.lineItems
      .map((line, index) => {
        const kind: 'base' | 'charge' = line?.kind === 'charge' ? 'charge' : (index === 0 ? 'base' : 'charge');
        return {
          label: (line?.label || '').trim() || (index === 0 ? 'Base Amount' : 'Additional Charge'),
          amount: Number.isFinite(Number(line?.amount)) ? Number(line?.amount) : 0,
          category: ((line?.category || '').trim() || normalizedCategory || matchingCategory || 'General'),
          kind,
        };
      })
      .filter((line) => line.amount >= 0)
    : [];

  const computedLineTotal = lineItems.reduce((sum, line) => sum + line.amount, 0);
  const normalizedAmount = Number.isFinite(Number(draft.amount)) ? Number(draft.amount) : 0;
  const amount = computedLineTotal > 0 ? computedLineTotal : normalizedAmount;

  return {
    name: (draft.name || '').trim(),
    merchant: (draft.merchant || '').trim(),
    category: matchingCategory ?? normalizedCategory,
    amount,
    expenseDate: normalizeDate(draft.expenseDate),
    type,
    frequency: type === 'one-time' ? 'Monthly' : frequency,
    note: (draft.note || '').trim(),
    confidence: draft.confidence || 'medium',
    lineItems,
  };
}

async function generateWithRetry(
  model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>,
  promptText: string,
  imageDataUrls: string[] = []
): Promise<string> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      if (imageDataUrls.length === 0) {
        const result = await model.generateContent(promptText);
        const response = await result.response;
        return response.text();
      }

      const parsedImageParts = imageDataUrls.map((imageDataUrl) => parseDataUrl(imageDataUrl));
      const imageParts = parsedImageParts
        .filter(({ mimeType }) => isSupportedGeminiInlineMimeType(mimeType))
        .map(({ mimeType, data }) => ({ inlineData: { data, mimeType } }));
      if (imageParts.length === 0) {
        throw new Error('Unsupported attachment type for Fyll AI. Please upload image or PDF files.');
      }

      const result = await model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [{ text: promptText }, ...imageParts],
          },
        ],
      });
      const response = await result.response;
      return response.text();
    } catch (error) {
      if (attempt >= MAX_RETRIES || !isRetryableGeminiError(error)) {
        throw error;
      }
      await sleep(RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)]);
    }
  }

  throw new Error('AI expense draft failed unexpectedly.');
}

async function generateWithModelFallback(
  genAI: GoogleGenerativeAI,
  promptText: string,
  imageDataUrls: string[]
): Promise<string> {
  const models = GEMINI_MODEL ? [GEMINI_MODEL] : [
    'gemini-2.5-flash',
    'gemini-1.5-flash',
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash-002',
    'gemini-1.5-pro',
  ];

  let lastError: unknown = null;

  for (const modelName of models) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      });
      return await generateWithRetry(model, promptText, imageDataUrls);
    } catch (error) {
      lastError = error;
      const message = String((error as Error | undefined)?.message || '');
      if (!message.includes('404') && !message.includes('not found')) {
        throw error;
      }
    }
  }

  throw lastError || new Error('No compatible Gemini model found.');
}

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } {
  const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);
  if (!match) {
    throw new Error('Invalid image data');
  }
  return { mimeType: match[1], data: match[2] };
}

function isSupportedGeminiInlineMimeType(mimeType: string): boolean {
  const normalized = mimeType.trim().toLowerCase();
  if (!normalized) return false;
  if (SUPPORTED_GEMINI_INLINE_MIME_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return true;
  return SUPPORTED_GEMINI_INLINE_MIME_TYPES.includes(normalized);
}

function isRetryableGeminiError(error: unknown): boolean {
  const message = String((error as Error | undefined)?.message || '');
  return message.includes('429') || message.toLowerCase().includes('quota') || message.includes('503');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
