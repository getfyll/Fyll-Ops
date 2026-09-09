import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { GoogleGenerativeAI } from 'npm:@google/generative-ai@0.24.1'

const sanitizeEnvValue = (value: string | undefined | null) => (
  (value ?? '')
    .normalize('NFKC')
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
)

const GEMINI_API_KEY = sanitizeEnvValue(Deno.env.get('GEMINI_API_KEY'))
const DEFAULT_GEMINI_MODEL = sanitizeEnvValue(Deno.env.get('GEMINI_MODEL')) || 'gemini-2.5-flash'
const ALLOWED_ORIGIN = sanitizeEnvValue(Deno.env.get('ALLOWED_ORIGIN')) || '*'
const MAX_INLINE_FILES = 6
const MAX_DATA_URL_LENGTH = 8_000_000

const ALLOWED_MODELS = new Set([
  'gemini-2.5-flash',
])

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type FyllAiGeminiPayload = {
  prompt?: string
  imageDataUrls?: string[]
  model?: string
  responseMimeType?: string
  temperature?: number
}

const jsonResponse = (status: number, body: Record<string, unknown>) => (
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
)

const parseDataUrl = (dataUrl: string): { mimeType: string; data: string } => {
  const match = dataUrl.match(/^data:(.*?);base64,(.*)$/)
  if (!match) throw new Error('Invalid attachment data.')
  return { mimeType: match[1], data: match[2] }
}

const normalizeImageDataUrls = (values: unknown): string[] => {
  if (!Array.isArray(values)) return []
  return Array.from(new Set(
    values
      .map((value) => typeof value === 'string' ? value.trim() : '')
      .filter(Boolean)
      .slice(0, MAX_INLINE_FILES)
  ))
}

const assertSafeInlineFiles = (imageDataUrls: string[]) => {
  for (const dataUrl of imageDataUrls) {
    if (dataUrl.length > MAX_DATA_URL_LENGTH) {
      throw new Error('One attachment is too large for Fyll AI.')
    }
    const { mimeType } = parseDataUrl(dataUrl)
    const normalized = mimeType.trim().toLowerCase()
    const supported = normalized.startsWith('image/')
      || normalized === 'application/pdf'
      || normalized === 'text/plain'
    if (!supported) {
      throw new Error('Unsupported attachment type for Fyll AI.')
    }
  }
}

const getSafeModel = (requestedModel?: string) => {
  const model = (requestedModel || DEFAULT_GEMINI_MODEL).trim()
  if (ALLOWED_MODELS.has(model)) return model
  if (ALLOWED_MODELS.has(DEFAULT_GEMINI_MODEL)) return DEFAULT_GEMINI_MODEL
  return 'gemini-2.5-flash'
}

const getTemperature = (value: unknown) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0.2
  return Math.min(1, Math.max(0, parsed))
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' })
  }

  if (!GEMINI_API_KEY) {
    return jsonResponse(500, { error: 'Fyll AI is missing its private Gemini key.' })
  }

  try {
    const payload = await req.json() as FyllAiGeminiPayload
    const prompt = (payload.prompt ?? '').trim()
    const imageDataUrls = normalizeImageDataUrls(payload.imageDataUrls)

    if (!prompt && imageDataUrls.length === 0) {
      return jsonResponse(400, { error: 'Fyll AI needs a prompt or attachment.' })
    }

    assertSafeInlineFiles(imageDataUrls)

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({
      model: getSafeModel(payload.model),
      generationConfig: {
        responseMimeType: payload.responseMimeType === 'text/plain' ? 'text/plain' : 'application/json',
        temperature: getTemperature(payload.temperature),
      },
    })

    const parts = [
      { text: prompt },
      ...imageDataUrls.map((dataUrl) => {
        const { mimeType, data } = parseDataUrl(dataUrl)
        return { inlineData: { mimeType, data } }
      }),
    ]

    const result = await model.generateContent({
      contents: [{ role: 'user', parts }],
    })
    const response = await result.response

    return jsonResponse(200, { text: response.text() })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Fyll AI request failed.'
    return jsonResponse(500, { error: message })
  }
})
