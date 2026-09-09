import { GoogleGenerativeAI } from '@/lib/secure-gemini';

const GEMINI_API_KEY = 'server-side';
const GEMINI_MODEL = process.env.EXPO_PUBLIC_GEMINI_MODEL || '';
const MAX_RETRIES = 2;
const RETRY_DELAYS_MS = [1200, 2500];

export type FyllAssistantCardTone = 'positive' | 'negative' | 'neutral';

export type FyllAssistantCard = {
  title: string;
  value: string;
  hint?: string;
  action?: string;
  tone?: FyllAssistantCardTone;
};

export type FyllAssistantResponse = {
  text: string;
  cards: FyllAssistantCard[];
};

export async function askFyllAssistant(params: {
  scope: 'finance' | 'insights';
  question: string;
  periodLabel: string;
  headline: string;
  metrics: { label: string; value: string }[];
  recommendations: string[];
  history?: { role: 'assistant' | 'user'; text: string }[];
}): Promise<FyllAssistantResponse> {
  if (!GEMINI_API_KEY) {
    throw new Error('Fyll AI is not configured. Add GEMINI_API_KEY as a private Supabase secret.');
  }

  const prompt = buildPrompt(params);
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const text = await generateWithModelFallback(genAI, prompt);
  return parseAssistantResponse(text);
}

function buildPrompt(params: {
  scope: 'finance' | 'insights';
  question: string;
  periodLabel: string;
  headline: string;
  metrics: { label: string; value: string }[];
  recommendations: string[];
  history?: { role: 'assistant' | 'user'; text: string }[];
}): string {
  const scopeLabel = params.scope === 'finance' ? 'finance performance' : 'business insights performance';
  const metricsBlock = params.metrics.map((metric) => `- ${metric.label}: ${metric.value}`).join('\n');
  const recommendationBlock = params.recommendations.slice(0, 4).map((item) => `- ${item}`).join('\n');
  const historyBlock = (params.history ?? [])
    .slice(-8)
    .map((turn) => `${turn.role === 'assistant' ? 'Assistant' : 'User'}: ${turn.text}`)
    .join('\n');

  return `
You are Fyll AI, a pragmatic advisor for a Nigerian business across finance, business strategy, operations, and sales.
Answer the user's question about ${scopeLabel} using the provided context.

Rules:
- Be concise, clear, and actionable.
- Use the numbers in context; do not invent values.
- If data is limited, say so clearly.
- Prefer practical next actions over theory.
- Give practical advisory guidance when useful (finance, ops, sales, business decisions).
- Keep text response to at most 6 short lines.

Return ONLY valid JSON in this exact shape:
{
  "text": "main answer to the user",
  "cards": [
    {
      "title": "Metric or insight",
      "value": "primary value",
      "hint": "short context",
      "action": "optional next action",
      "tone": "positive | negative | neutral"
    }
  ]
}

Card rules:
- Return 0-3 cards.
- Cards must use real values from context.
- Only return cards when they add clarity (metrics, actions, comparisons). Do not force cards.
- Never return markdown.

Period: ${params.periodLabel}
Headline: ${params.headline}

Metrics:
${metricsBlock || '- No metrics provided'}

Priority recommendations:
${recommendationBlock || '- No recommendations provided'}

Recent conversation:
${historyBlock || '(no prior conversation)'}

User question:
${params.question}
`.trim();
}

async function generateWithRetry(
  model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>,
  prompt: string
): Promise<string> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      if (attempt >= MAX_RETRIES || !isRetryableGeminiError(error)) {
        throw error;
      }
      await sleep(RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)]);
    }
  }

  throw new Error('Fyll AI assistant failed unexpectedly.');
}

async function generateWithModelFallback(
  genAI: GoogleGenerativeAI,
  prompt: string
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
          temperature: 0.25,
        },
      });
      return await generateWithRetry(model, prompt);
    } catch (error) {
      lastError = error;
      const message = String((error as Error | undefined)?.message || '');
      if (!message.includes('404') && !message.includes('not found')) {
        throw normalizeGeminiError(error);
      }
    }
  }

  throw normalizeGeminiError(lastError);
}

function isRetryableGeminiError(error: unknown): boolean {
  const message = String((error as Error | undefined)?.message || '');
  return message.includes('429') || message.toLowerCase().includes('quota') || message.includes('503');
}

function parseAssistantResponse(rawText: string): FyllAssistantResponse {
  const normalizedRaw = rawText
    .replace(/^```[a-z]*\n?/gi, '')
    .replace(/```$/g, '')
    .trim();
  if (!normalizedRaw) {
    throw new Error('AI assistant returned an empty response.');
  }

  const jsonMatch = normalizedRaw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      text: normalizedRaw,
      cards: [],
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      text?: string;
      cards?: {
        title?: string;
        value?: string;
        hint?: string;
        action?: string;
        tone?: string;
      }[];
    };

    const text = String(parsed.text ?? '').trim() || normalizedRaw;
    const cards: FyllAssistantCard[] = Array.isArray(parsed.cards)
      ? parsed.cards.reduce<FyllAssistantCard[]>((acc, card) => {
        const title = String(card?.title ?? '').trim();
        const value = String(card?.value ?? '').trim();
        if (!title || !value) return acc;

        const hint = String(card?.hint ?? '').trim();
        const action = String(card?.action ?? '').trim();
        const tone = normalizeTone(card?.tone);

        const nextCard: FyllAssistantCard = { title, value };
        if (hint) nextCard.hint = hint;
        if (action) nextCard.action = action;
        if (tone) nextCard.tone = tone;
        acc.push(nextCard);
        return acc;
      }, []).slice(0, 3)
      : [];

    return { text, cards };
  } catch {
    return {
      text: normalizedRaw,
      cards: [],
    };
  }
}

function normalizeTone(value: unknown): FyllAssistantCardTone | undefined {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'positive') return 'positive';
  if (normalized === 'negative') return 'negative';
  if (normalized === 'neutral') return 'neutral';
  return undefined;
}

function normalizeGeminiError(error: unknown): Error {
  const message = String((error as Error | undefined)?.message || '');
  if (message.includes('429') || message.toLowerCase().includes('quota')) {
    return new Error('Gemini API quota exceeded. Check billing/quota and retry.');
  }
  return error instanceof Error ? error : new Error('Fyll AI assistant failed.');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
