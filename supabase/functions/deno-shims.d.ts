declare module 'https://deno.land/std@0.168.0/http/server.ts' {
  export function serve(
    handler: (req: Request) => Response | Promise<Response>,
  ): void;
}

declare module 'https://esm.sh/@supabase/supabase-js@2' {
  export function createClient(url: string, key: string, options?: unknown): any;
}

declare module 'npm:@google/generative-ai@0.24.1' {
  export class GoogleGenerativeAI {
    constructor(apiKey: string);
    getGenerativeModel(options: {
      model: string;
      generationConfig?: {
        responseMimeType?: string;
        temperature?: number;
      };
    }): {
      generateContent(input: unknown): Promise<{
        response: Promise<{
          text(): string;
        }> | {
          text(): string;
        };
      }>;
    };
  }
}

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};
