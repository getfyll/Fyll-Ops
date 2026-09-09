import { GoogleGenerativeAI } from '@/lib/secure-gemini';
import { CasePriority, CaseSource, CaseType, CASE_PRIORITIES, CASE_SOURCES, CASE_TYPES } from '@/lib/state/fyll-store';

const GEMINI_API_KEY = 'server-side';
const GEMINI_MODEL = process.env.EXPO_PUBLIC_GEMINI_MODEL || '';
const MAX_RETRIES = 2;
const RETRY_DELAYS_MS = [1200, 2500];

export interface CaseDraftData {
  issueSummary: string;
  context: string;
  caseType: CaseType;
  priority: CasePriority;
  source: CaseSource;
  confidence: 'high' | 'medium' | 'low';
}

const CASE_DRAFT_PROMPT = `
You are an AI assistant for a Nigerian eyewear business called Fyll. Your job is to draft a support case from a customer message or screenshot.

Create a concise case heading and a clear context summary. Infer case type and priority.

Return JSON in this exact format:
{
  "issueSummary": "Short heading (4-10 words)",
  "context": "Short paragraph describing what happened, key details, and what the customer wants.",
  "caseType": "Repair | Replacement | Refund | Goodwill | Other",
  "priority": "Critical | High | Medium | Low",
  "source": "Email | Phone | Chat | Web | Other",
  "confidence": "high | medium | low"
}

Rules:
- If you are unsure, use "Other" for caseType and "Medium" for priority.
- Use "Chat" when the text looks like WhatsApp or social DM.
- If multiple screenshots are attached, combine details from all of them into one coherent situation summary.
- Never include sensitive personal data beyond what is in the text/screenshot.
- Keep the heading short and professional.
`;

export async function parseCaseDraft(params: {
  messageText?: string;
  imageDataUrls?: string[];
  imageDataUrl?: string;
}): Promise<CaseDraftData | null> {
  if (!GEMINI_API_KEY) {
    throw new Error('Fyll AI is not configured. Add GEMINI_API_KEY as a private Supabase secret.');
  }

  const text = params.messageText?.trim();
  const imageDataUrls = Array.from(new Set(
    (params.imageDataUrls ?? [])
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value))
  ));
  if (params.imageDataUrl?.trim()) {
    imageDataUrls.push(params.imageDataUrl.trim());
  }
  const uniqueImageDataUrls = Array.from(new Set(imageDataUrls));

  if (!text && uniqueImageDataUrls.length === 0) {
    throw new Error('Provide a message or screenshot to generate a draft.');
  }

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const responseText = await generateWithModelFallback(genAI, text, uniqueImageDataUrls);

  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Could not extract JSON from AI response');
  }

  const parsed = JSON.parse(jsonMatch[0]) as CaseDraftData;

  return normalizeDraft(parsed);
}

function normalizeDraft(draft: CaseDraftData): CaseDraftData {
  const normalizedType = CASE_TYPES.includes(draft.caseType) ? draft.caseType : 'Other';
  const normalizedPriority = CASE_PRIORITIES.includes(draft.priority) ? draft.priority : 'Medium';
  const normalizedSource = CASE_SOURCES.includes(draft.source) ? draft.source : 'Other';

  return {
    issueSummary: (draft.issueSummary || '').trim(),
    context: (draft.context || '').trim(),
    caseType: normalizedType,
    priority: normalizedPriority,
    source: normalizedSource,
    confidence: draft.confidence || 'medium',
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

      const imageParts = imageDataUrls.map((imageDataUrl) => {
        const { mimeType, data } = parseDataUrl(imageDataUrl);
        return { inlineData: { data, mimeType } };
      });
      const result = await model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [
              { text: promptText },
              ...imageParts,
            ],
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

  throw new Error('AI case draft failed unexpectedly.');
}

async function generateWithModelFallback(
  genAI: GoogleGenerativeAI,
  messageText?: string,
  imageDataUrls: string[] = []
): Promise<string> {
  const models = GEMINI_MODEL ? [GEMINI_MODEL] : [
    'gemini-2.5-flash',
    'gemini-1.5-flash',
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash-002',
    'gemini-1.5-pro',
  ];

  let lastError: unknown = null;
  const promptText = `${CASE_DRAFT_PROMPT}\n\nCustomer message:\n${messageText || '(no text provided)'}\n\nScreenshots attached: ${imageDataUrls.length}\n`;

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

function isRetryableGeminiError(error: unknown): boolean {
  const message = String((error as Error | undefined)?.message || '');
  return message.includes('429') || message.toLowerCase().includes('quota') || message.includes('503');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
