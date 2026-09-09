import { GoogleGenerativeAI } from '@/lib/secure-gemini';

const GEMINI_API_KEY = 'server-side';
const GEMINI_MODEL = process.env.EXPO_PUBLIC_GEMINI_MODEL || '';
const MAX_RETRIES = 2;
const RETRY_DELAYS_MS = [1200, 2500];
const SUPPORTED_GEMINI_INLINE_MIME_PREFIXES = ['image/'];
const SUPPORTED_GEMINI_INLINE_MIME_TYPES = ['application/pdf', 'text/plain'];

export interface ProcurementLine {
  description: string;
  amount: number;
}

export interface ProcurementDraftData {
  title: string;
  supplier: string;
  totalCost: number;
  quantity: number;
  lines: ProcurementLine[];
  note: string;
  expectedDate: string;
  confidence: 'high' | 'medium' | 'low';
}

const PROCUREMENT_DRAFT_PROMPT = `
You are an AI assistant for a Nigerian business procurement app called Fyll.
Extract a purchase order draft from uploaded receipts, transfer confirmations, or invoice images and optional notes.

Return JSON in this exact shape:
{
  "title": "Short PO title (e.g. 'Office Supplies from ABC Ltd')",
  "supplier": "Supplier/vendor name if visible",
  "totalCost": 0,
  "quantity": 1,
  "lines": [
    { "description": "Brief label for this payment/item", "amount": 0 }
  ],
  "note": "Any useful details from the documents",
  "expectedDate": "YYYY-MM-DD",
  "confidence": "high | medium | low"
}

Rules:
- IMPORTANT: If multiple images are uploaded (e.g. multiple bank transfers), create one line per image/receipt/transfer.
- Each "line" represents one payment or item group. "description" should briefly label it (e.g. "Transfer 1 – Jan 15", "Bank transfer", "Invoice #001").
- "amount" for each line is the exact amount shown on that receipt/transfer — no currency symbols.
- "totalCost" must equal the sum of all line amounts.
- "quantity" must equal the total number of lines.
- If only one image with one amount, create a single line.
- If expected/delivery date is unknown, return a date 7 days from today in YYYY-MM-DD format.
- Keep title concise and business-friendly.
- Extract the supplier/vendor name from the document header or logo.
- Do not include currency symbols in numeric fields.
`;

const PROCUREMENT_DRAFT_KEYS: (keyof ProcurementDraftData)[] = [
  'title', 'supplier', 'totalCost', 'quantity', 'lines', 'note', 'expectedDate', 'confidence',
];

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const looksLikeProcurementDraft = (value: unknown): value is Record<string, unknown> => {
  if (!isRecord(value)) return false;
  const matchedKeys = PROCUREMENT_DRAFT_KEYS.reduce(
    (count, key) => (key in value ? count + 1 : count),
    0
  );
  return matchedKeys >= 3;
};

const coerceProcurementDraft = (value: unknown): ProcurementDraftData | null => {
  if (looksLikeProcurementDraft(value)) return value as unknown as ProcurementDraftData;

  if (Array.isArray(value)) {
    const match = value.find(looksLikeProcurementDraft);
    if (match) return match as unknown as ProcurementDraftData;
    return null;
  }

  if (!isRecord(value)) return null;

  const slots = ['draft', 'procurement', 'result', 'data', 'output', 'order'] as const;
  for (const slot of slots) {
    if (slot in value) {
      const match = coerceProcurementDraft(value[slot]);
      if (match) return match;
    }
  }

  return null;
};

const tryParseJson = (source: string): unknown | null => {
  const trimmed = source.trim();
  if (!trimmed) return null;
  try { return JSON.parse(trimmed) as unknown; } catch { return null; }
};

const stripSingleCodeFence = (source: string): string =>
  source.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

const collectBalancedJsonSegments = (source: string): string[] => {
  const segments: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (inString) {
      if (escaped) { escaped = false; }
      else if (char === '\\') { escaped = true; }
      else if (char === '"') { inString = false; }
      continue;
    }
    if (char === '"') { if (depth > 0) inString = true; continue; }
    if (char === '{' || char === '[') { if (depth === 0) start = i; depth++; continue; }
    if (char === '}' || char === ']') {
      if (depth === 0) continue;
      depth--;
      if (depth === 0 && start >= 0) { segments.push(source.slice(start, i + 1)); start = -1; }
    }
  }
  return segments;
};

const parseProcurementDraftFromResponse = (responseText: string): ProcurementDraftData => {
  const candidates = new Set<string>();
  const trimmed = responseText.trim();
  if (trimmed) candidates.add(trimmed);
  const unfenced = stripSingleCodeFence(responseText);
  if (unfenced) candidates.add(unfenced);
  collectBalancedJsonSegments(responseText)
    .sort((a, b) => b.length - a.length)
    .forEach((s) => candidates.add(s));

  for (const candidate of candidates) {
    const parsed = tryParseJson(candidate);
    if (parsed === null) continue;
    const draft = coerceProcurementDraft(parsed);
    if (draft) return draft;
  }

  throw new Error('Could not parse structured procurement draft JSON from AI response.');
};

const normalizeDate = (value: string | undefined, fallbackDaysAhead = 7): string => {
  const trimmed = (value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (Number.isFinite(parsed.getTime())) return parsed.toISOString().split('T')[0];
  const fallback = new Date();
  fallback.setDate(fallback.getDate() + fallbackDaysAhead);
  return fallback.toISOString().split('T')[0];
};

function normalizeProcurementDraft(draft: ProcurementDraftData): ProcurementDraftData {
  const lines: ProcurementLine[] = Array.isArray(draft.lines)
    ? draft.lines
        .filter((l): l is ProcurementLine => typeof l === 'object' && l !== null)
        .map((l) => ({
          description: String(l.description || '').trim(),
          amount: Number.isFinite(Number(l.amount)) ? Math.max(0, Number(l.amount)) : 0,
        }))
    : [];
  const computedTotal = lines.length > 0
    ? lines.reduce((s, l) => s + l.amount, 0)
    : (Number.isFinite(Number(draft.totalCost)) ? Math.max(0, Number(draft.totalCost)) : 0);
  return {
    title: (draft.title || '').trim(),
    supplier: (draft.supplier || '').trim(),
    totalCost: computedTotal,
    quantity: lines.length > 0 ? lines.length : (Number.isFinite(Number(draft.quantity)) && Number(draft.quantity) >= 1 ? Math.floor(Number(draft.quantity)) : 1),
    lines,
    note: (draft.note || '').trim(),
    expectedDate: normalizeDate(draft.expectedDate),
    confidence: draft.confidence || 'medium',
  };
}

export async function parseProcurementDraft(params: {
  messageText?: string;
  imageDataUrls?: string[];
  suppliers?: string[];
}): Promise<ProcurementDraftData | null> {
  if (!GEMINI_API_KEY) {
    throw new Error('Fyll AI is not configured. Add GEMINI_API_KEY as a private Supabase secret.');
  }

  const text = params.messageText?.trim();
  const imageDataUrls = Array.from(new Set(
    (params.imageDataUrls ?? [])
      .map((v) => v?.trim())
      .filter((v): v is string => Boolean(v))
  ));

  if (!text && imageDataUrls.length === 0) {
    throw new Error('Add receipt image(s) or notes to generate a Fyll AI draft.');
  }

  const suppliersHint = (params.suppliers ?? []).filter(Boolean).slice(0, 30).join(', ');
  const promptText = `${PROCUREMENT_DRAFT_PROMPT}

Known suppliers:
${suppliersHint || '(none)'}

Extra note:
${text || '(none)'}
`;

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const responseText = await generateWithModelFallback(genAI, promptText, imageDataUrls);
  const parsed = parseProcurementDraftFromResponse(responseText);
  return normalizeProcurementDraft(parsed);
}

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } {
  const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);
  if (!match) throw new Error('Invalid image data');
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

async function generateWithRetry(
  model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>,
  promptText: string,
  imageDataUrls: string[] = []
): Promise<string> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (imageDataUrls.length === 0) {
        const result = await model.generateContent(promptText);
        return (await result.response).text();
      }

      const imageParts = imageDataUrls.map((url) => {
        const { mimeType, data } = parseDataUrl(url);
        return { mimeType, data };
      })
        .filter(({ mimeType }) => isSupportedGeminiInlineMimeType(mimeType))
        .map(({ mimeType, data }) => ({ inlineData: { data, mimeType } }));
      if (imageParts.length === 0) {
        throw new Error('Unsupported attachment type for Fyll AI. Please upload image or PDF files.');
      }

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: promptText }, ...imageParts] }],
      });
      return (await result.response).text();
    } catch (error) {
      if (attempt >= MAX_RETRIES || !isRetryableGeminiError(error)) throw error;
      await sleep(RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)]);
    }
  }
  throw new Error('AI procurement draft failed unexpectedly.');
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
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
      });
      return await generateWithRetry(model, promptText, imageDataUrls);
    } catch (error) {
      lastError = error;
      const message = String((error as Error | undefined)?.message || '');
      if (!message.includes('404') && !message.includes('not found')) throw error;
    }
  }

  throw lastError || new Error('No compatible Gemini model found.');
}
