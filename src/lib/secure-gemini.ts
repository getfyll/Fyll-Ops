import { supabase } from '@/lib/supabase';

type GeminiInlineDataPart = {
  inlineData: {
    data: string;
    mimeType: string;
  };
};

type GeminiTextPart = {
  text: string;
};

type GeminiPart = GeminiTextPart | GeminiInlineDataPart;

type GeminiGenerateContentInput =
  | string
  | {
      contents?: {
        role?: string;
        parts?: GeminiPart[];
      }[];
    };

type GeminiGenerationConfig = {
  responseMimeType?: string;
  temperature?: number;
};

type GeminiModelOptions = {
  model: string;
  generationConfig?: GeminiGenerationConfig;
};

type FyllAiFunctionResponse = {
  text?: string;
  error?: string;
};

type SupabaseFunctionError = Error & {
  context?: {
    json?: () => Promise<unknown>;
    text?: () => Promise<string>;
  };
};

const getFunctionErrorMessage = async (error: unknown): Promise<string> => {
  const functionError = error as SupabaseFunctionError;
  const context = functionError?.context;

  if (context?.json) {
    try {
      const body = await context.json();
      if (body && typeof body === 'object' && 'error' in body) {
        const message = (body as { error?: unknown }).error;
        if (typeof message === 'string' && message.trim()) return message.trim();
      }
    } catch {
      // Fall through to text/message fallback.
    }
  }

  if (context?.text) {
    try {
      const text = await context.text();
      if (text.trim()) return text.trim();
    } catch {
      // Fall through to generic message fallback.
    }
  }

  return functionError?.message || 'Fyll AI request failed.';
};

const inlineDataToDataUrl = (part: GeminiInlineDataPart): string => {
  const mimeType = part.inlineData.mimeType || 'application/octet-stream';
  return `data:${mimeType};base64,${part.inlineData.data}`;
};

const normalizeGenerateContentInput = (input: GeminiGenerateContentInput) => {
  if (typeof input === 'string') {
    return { prompt: input, imageDataUrls: [] as string[] };
  }

  const parts = input.contents?.flatMap((content) => content.parts ?? []) ?? [];
  const prompt = parts
    .filter((part): part is GeminiTextPart => 'text' in part)
    .map((part) => part.text)
    .join('\n')
    .trim();
  const imageDataUrls = parts
    .filter((part): part is GeminiInlineDataPart => 'inlineData' in part)
    .map(inlineDataToDataUrl);

  return { prompt, imageDataUrls };
};

export class GoogleGenerativeAI {
  constructor(_apiKey?: string) {}

  getGenerativeModel(options: GeminiModelOptions) {
    return {
      generateContent: async (input: GeminiGenerateContentInput) => {
        const { prompt, imageDataUrls } = normalizeGenerateContentInput(input);
        const { data, error } = await supabase.functions.invoke<FyllAiFunctionResponse>('fyll-ai-gemini', {
          body: {
            prompt,
            imageDataUrls,
            model: options.model,
            responseMimeType: options.generationConfig?.responseMimeType,
            temperature: options.generationConfig?.temperature,
          },
        });

        if (error) {
          throw new Error(await getFunctionErrorMessage(error));
        }

        if (data?.error) {
          throw new Error(data.error);
        }

        const text = data?.text ?? '';
        return {
          response: {
            text: () => text,
          },
        };
      },
    };
  }
}
