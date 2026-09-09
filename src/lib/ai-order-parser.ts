import { GoogleGenerativeAI } from '@/lib/secure-gemini';

const GEMINI_API_KEY = 'server-side';
const GEMINI_MODEL = process.env.EXPO_PUBLIC_GEMINI_MODEL || '';
const MAX_RETRIES = 2;
const RETRY_DELAYS_MS = [1200, 2500];

export interface ParsedOrderLineItem {
  productName: string;
  variantInfo: string;
  quantity: number;
  unitPrice: number;
}

export interface ParsedServiceLineItem {
  serviceName: string;
  quantity: number;
  unitPrice: number;
  notes: string;
}

export interface ParsedOrderData {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  deliveryAddress: string;
  deliveryState: string;
  deliveryFee: number;
  orderTotal: number;
  websiteOrderReference: string;
  items: ParsedOrderLineItem[];
  services: ParsedServiceLineItem[];
  notes: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface ParseOrderInput {
  messageText?: string;
  imageDataUrls?: string[];
  productCatalogNames?: string[];
  serviceCatalogNames?: string[];
}

const ORDER_DRAFT_PROMPT = `
You are an AI assistant for a Nigerian eyewear business called Fyll.
Extract order information from WhatsApp/DM text and optional screenshot(s).

Extract:
1. Customer full name
2. Phone number (Nigerian format where possible)
3. Email (if present)
4. Delivery address
5. Delivery state
6. PRODUCT lines (frames, lenses, accessories, etc.)
7. SERVICE lines (installation, fitting, lens upgrade, repair, etc.)
8. Delivery fee
9. Order total
10. Website/order reference
11. Notes

Important rules:
- If a line is a SERVICE, put it in "services", not "items".
- If a line is a PRODUCT, put it in "items", not "services".
- Use quantity=1 when quantity is missing.
- Keep money numeric only (no currency symbols).
- If unsure between product vs service, favor "service" when it is an action/job, favor "item" when it is a physical thing.
- If screenshots are provided, combine details from both text and screenshots.

Return JSON in this exact format:
{
  "customerName": "Full Name",
  "customerPhone": "+234XXXXXXXXXX",
  "customerEmail": "email@example.com",
  "deliveryAddress": "Full street address",
  "deliveryState": "State name",
  "deliveryFee": 0,
  "orderTotal": 0,
  "websiteOrderReference": "45876",
  "items": [
    {
      "productName": "Product name",
      "variantInfo": "Color or variant",
      "quantity": 1,
      "unitPrice": 0
    }
  ],
  "services": [
    {
      "serviceName": "Service name",
      "quantity": 1,
      "unitPrice": 0,
      "notes": ""
    }
  ],
  "notes": "Any special requests or notes",
  "confidence": "high"
}

If information is missing, use empty string "" for text fields and 0 for numeric fields.
Confidence must be "high", "medium", or "low".
`;

export async function parseOrderFromText(input: string | ParseOrderInput): Promise<ParsedOrderData | null> {
  if (!GEMINI_API_KEY) {
    throw new Error('Fyll AI is not configured. Add GEMINI_API_KEY as a private Supabase secret.');
  }

  const params = normalizeInput(input);
  if (!params.messageText && params.imageDataUrls.length === 0) {
    throw new Error('Paste order text or upload screenshot(s) first.');
  }

  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const responseText = await generateWithModelFallback(genAI, buildPrompt(params), params.imageDataUrls);
    const parsedData = parseOrderJson(responseText);
    const normalized = normalizeParsedOrder(parsedData);

    if (
      !normalized.customerName
      && !normalized.customerPhone
      && normalized.items.length === 0
      && normalized.services.length === 0
    ) {
      return null;
    }

    return normalized;
  } catch (error) {
    console.error('AI parsing error:', error);
    throw normalizeGeminiError(error);
  }
}

function normalizeInput(input: string | ParseOrderInput): Required<ParseOrderInput> {
  if (typeof input === 'string') {
    return {
      messageText: input.trim(),
      imageDataUrls: [],
      productCatalogNames: [],
      serviceCatalogNames: [],
    };
  }

  return {
    messageText: (input.messageText ?? '').trim(),
    imageDataUrls: Array.from(new Set(
      (input.imageDataUrls ?? [])
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    )),
    productCatalogNames: Array.from(new Set(
      (input.productCatalogNames ?? [])
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    )),
    serviceCatalogNames: Array.from(new Set(
      (input.serviceCatalogNames ?? [])
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    )),
  };
}

function buildPrompt(input: Required<ParseOrderInput>): string {
  const productHints = input.productCatalogNames.slice(0, 200).join(', ');
  const serviceHints = input.serviceCatalogNames.slice(0, 200).join(', ');

  return `${ORDER_DRAFT_PROMPT}

Known product names in this business:
${productHints || '(none provided)'}

Known service names in this business:
${serviceHints || '(none provided)'}

Message to parse:
${input.messageText || '(no text provided)'}

Screenshots attached: ${input.imageDataUrls.length}
`;
}

function parseOrderJson(responseText: string): unknown {
  const direct = tryParseJson(responseText);
  if (direct !== null) return direct;

  const unfenced = responseText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const unfencedParsed = tryParseJson(unfenced);
  if (unfencedParsed !== null) return unfencedParsed;

  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Could not extract JSON from AI response');
  }

  const fallback = tryParseJson(jsonMatch[0]);
  if (fallback === null) {
    throw new Error('Could not parse JSON from AI response');
  }
  return fallback;
}

function tryParseJson(source: string): unknown | null {
  const trimmed = source.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

function normalizeParsedOrder(raw: unknown): ParsedOrderData {
  const asObject = (value: unknown): Record<string, unknown> => (
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {}
  );

  const root = asObject(raw);

  const normalizedItems: ParsedOrderLineItem[] = Array.isArray(root.items)
    ? root.items.map((item) => {
      const row = asObject(item);
      return {
        productName: String(row.productName ?? '').trim(),
        variantInfo: String(row.variantInfo ?? '').trim(),
        quantity: clampPositiveInt(row.quantity, 1),
        unitPrice: toNonNegativeNumber(row.unitPrice),
      };
    }).filter((item) => item.productName !== '')
    : [];

  const normalizedServices: ParsedServiceLineItem[] = Array.isArray(root.services)
    ? root.services.map((service) => {
      const row = asObject(service);
      return {
        serviceName: String(row.serviceName ?? '').trim(),
        quantity: clampPositiveInt(row.quantity, 1),
        unitPrice: toNonNegativeNumber(row.unitPrice),
        notes: String(row.notes ?? '').trim(),
      };
    }).filter((service) => service.serviceName !== '')
    : [];

  const confidenceRaw = String(root.confidence ?? '').trim().toLowerCase();
  const confidence: ParsedOrderData['confidence'] = (
    confidenceRaw === 'high' || confidenceRaw === 'medium' || confidenceRaw === 'low'
      ? confidenceRaw
      : 'medium'
  );

  return {
    customerName: String(root.customerName ?? '').trim(),
    customerPhone: String(root.customerPhone ?? '').trim(),
    customerEmail: String(root.customerEmail ?? '').trim(),
    deliveryAddress: String(root.deliveryAddress ?? '').trim(),
    deliveryState: String(root.deliveryState ?? '').trim(),
    deliveryFee: toNonNegativeNumber(root.deliveryFee),
    orderTotal: toNonNegativeNumber(root.orderTotal),
    websiteOrderReference: String(root.websiteOrderReference ?? '').trim(),
    items: normalizedItems,
    services: normalizedServices,
    notes: String(root.notes ?? '').trim(),
    confidence,
  };
}

function clampPositiveInt(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function toNonNegativeNumber(value: unknown): number {
  const parsed = Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
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

      const imageParts = imageDataUrls.map((imageDataUrl) => {
        const { mimeType, data } = parseDataUrl(imageDataUrl);
        return { inlineData: { data, mimeType } };
      });

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: promptText }, ...imageParts] }],
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

  throw new Error('AI parsing failed unexpectedly.');
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
    throw new Error('Invalid image data. Use a base64 data URL.');
  }
  return { mimeType: match[1], data: match[2] };
}

function isRetryableGeminiError(error: unknown): boolean {
  const message = String((error as Error | undefined)?.message || '');
  return message.includes('429') || message.toLowerCase().includes('quota') || message.includes('503');
}

function normalizeGeminiError(error: unknown): Error {
  const message = String((error as Error | undefined)?.message || '');
  if (message.includes('429') || message.toLowerCase().includes('quota')) {
    return new Error(
      'Gemini API quota exceeded. Confirm the key is from the correct project, the Gemini API is enabled, and billing/quota is active. Then retry.'
    );
  }
  return error instanceof Error ? error : new Error('AI parsing failed.');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Helper to format parsed data for quick display in the UI.
export function formatParsedOrder(data: ParsedOrderData): string {
  let formatted = `**Customer Information:**\n`;
  formatted += `Name: ${data.customerName || 'Not found'}\n`;
  formatted += `Phone: ${data.customerPhone || 'Not found'}\n`;
  formatted += `Email: ${data.customerEmail || 'Not found'}\n`;
  formatted += `State: ${data.deliveryState || 'Not found'}\n`;
  formatted += `Address: ${data.deliveryAddress || 'Not found'}\n\n`;

  formatted += `**Products:**\n`;
  if (data.items.length > 0) {
    data.items.forEach((item, idx) => {
      formatted += `${idx + 1}. ${item.quantity}x ${item.productName}`;
      if (item.variantInfo) {
        formatted += ` (${item.variantInfo})`;
      }
      if (item.unitPrice) {
        formatted += ` - ₦${item.unitPrice.toLocaleString()}`;
      }
      formatted += '\n';
    });
  } else {
    formatted += 'No products found\n';
  }

  formatted += `\n**Services:**\n`;
  if (data.services.length > 0) {
    data.services.forEach((service, idx) => {
      formatted += `${idx + 1}. ${service.quantity}x ${service.serviceName}`;
      if (service.unitPrice) {
        formatted += ` - ₦${service.unitPrice.toLocaleString()}`;
      }
      if (service.notes) {
        formatted += ` (${service.notes})`;
      }
      formatted += '\n';
    });
  } else {
    formatted += 'No services found\n';
  }

  if (data.deliveryFee) {
    formatted += `\n**Delivery Fee:** ₦${data.deliveryFee.toLocaleString()}\n`;
  }
  if (data.orderTotal) {
    formatted += `**Order Total:** ₦${data.orderTotal.toLocaleString()}\n`;
  }
  if (data.websiteOrderReference) {
    formatted += `**Order Ref:** ${data.websiteOrderReference}\n`;
  }

  if (data.notes) {
    formatted += `\n**Notes:** ${data.notes}\n`;
  }

  formatted += `\n**Confidence:** ${data.confidence.toUpperCase()}`;

  return formatted;
}
