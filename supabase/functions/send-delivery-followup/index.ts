import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const sanitizeEnvValue = (value: string | undefined | null) => (
  (value ?? '')
    .normalize('NFKC')
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
)

const SUPABASE_URL = sanitizeEnvValue(Deno.env.get('SUPABASE_URL'))
const SUPABASE_SERVICE_ROLE_KEY = sanitizeEnvValue(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))
const RESEND_API_KEY = sanitizeEnvValue(Deno.env.get('RESEND_API_KEY'))
const RESEND_FROM_EMAIL = sanitizeEnvValue(Deno.env.get('RESEND_FROM_EMAIL'))
const ONESIGNAL_APP_ID = sanitizeEnvValue(Deno.env.get('ONESIGNAL_APP_ID'))
const ONESIGNAL_REST_API_KEY = sanitizeEnvValue(Deno.env.get('ONESIGNAL_REST_API_KEY'))
const APP_BASE_URL = sanitizeEnvValue(Deno.env.get('APP_BASE_URL'))
const ALLOWED_ORIGIN = sanitizeEnvValue(Deno.env.get('ALLOWED_ORIGIN')) || '*'
const CRON_SECRET = sanitizeEnvValue(Deno.env.get('CRON_SECRET'))
const FYLL_WORDMARK_URL = APP_BASE_URL
  ? new URL('/fyll-wordmark-email.png', APP_BASE_URL).toString()
  : ''
const FYLL_ICON_URL = APP_BASE_URL
  ? new URL('/icons/icon-192.png', APP_BASE_URL).toString()
  : ''
const BUSINESS_ASSETS_PUBLIC_BASE = SUPABASE_URL
  ? `${SUPABASE_URL.replace(/\/+$/, '')}/storage/v1/object/public/business-assets/`
  : ''

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type DeliveryFollowUpPayload = {
  type?: 'delivery_followup_all' | 'delivery_followup_single' | 'delivery_followup_status_trigger' | 'delivery_confirmation_result' | 'delivery_followup_test' | 'delivery_confirmation_notification_test'
  businessId?: string
  orderId?: string
  trackingCode?: string
  email?: string
  businessSlug?: string
  received?: boolean
  variant?: 'prompt' | 'delivered' | 'pending'
  forceSend?: boolean
}

type BusinessRow = {
  id: string
  business_id: string | null
  data: Record<string, unknown> | null
}

type OrderRow = {
  id: string
  business_id: string | null
  data: Record<string, unknown> | null
}

type SettingsRow = {
  data: Record<string, unknown> | null
}

const jsonResponse = (status: number, body: Record<string, unknown>) => (
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
)

const getBearerToken = (req: Request) => {
  const authHeader = req.headers.get('Authorization') ?? ''
  const [scheme, token] = authHeader.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null
  return token
}

const getAdminClient = () => (
  createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
)

const normalizeSlug = (value: string) => (
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
)

const normalizeBusinessName = (value: string) => value.trim() || 'Fyll'
const buildSenderName = (businessName: string) => `${normalizeBusinessName(businessName)} - Fyll`
const DELIVERY_FOLLOW_UP_RESEND_DAYS = 7
const PENDING_DELIVERY_STATUS_REGEX = /(pending[\s-]?delivery|delivery[\s-]?pending|awaiting[\s-]?delivery|still[\s-]?expect)/i
const DELIVERY_CONFIRMATION_STATUS_REGEX = /delivery[\s-]?confirmation/i
const DELIVERED_STATUS_REGEX = /\b(delivered|complete(d)?|fulfilled?|collected?)\b/i
const DELIVERY_CONFIRMATION_NOTIFICATION_TYPES = {
  delivered: 'delivery_confirmation_received',
  pending: 'delivery_confirmation_pending',
} as const

const toTrimmedString = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
const toBoolean = (value: unknown) => value === true
const getFirstName = (value: string) => toTrimmedString(value).split(/\s+/).filter(Boolean)[0] || 'there'
const compactBusinessId = (value: string | null | undefined) => (
  (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^biz-/, '')
    .replace(/-/g, '')
)
const getBusinessIdAliases = (value: string | null | undefined) => {
  const compact = compactBusinessId(value)
  if (!compact) return []
  return Array.from(new Set([value?.trim() ?? '', `biz-${compact}`].filter(Boolean)))
}
const buildDeliveryConfirmationNotificationPayload = ({
  businessName,
  customerName,
  orderId,
  orderLabel,
  received,
  isTest = false,
}: {
  businessName: string
  customerName: string
  orderId?: string
  orderLabel: string
  received: boolean
  isTest?: boolean
}) => {
  const type = received
    ? DELIVERY_CONFIRMATION_NOTIFICATION_TYPES.delivered
    : DELIVERY_CONFIRMATION_NOTIFICATION_TYPES.pending
  const body = received
    ? `${customerName || 'A customer'} confirmed ${orderLabel} was delivered.`
    : `${customerName || 'A customer'} said ${orderLabel} is still pending delivery.`

  return {
    type,
    body,
    businessName,
    customerName,
    entityType: 'order',
    ...(orderId ? { entityId: orderId, orderId } : {}),
    orderNumber: orderLabel,
    received,
    ...(isTest ? { isTest: true } : {}),
  }
}

const sendOneSignalNotification = async ({
  recipients,
  heading,
  content,
  data,
  collapseId,
}: {
  recipients: string[]
  heading: string
  content: string
  data: Record<string, unknown>
  collapseId?: string
}) => {
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY || recipients.length === 0) {
    return {
      mode: 'skipped',
      reason: !ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY ? 'missing-onesignal-config' : 'no-recipients',
      deliveredCount: 0,
    }
  }

  const isV2Key = ONESIGNAL_REST_API_KEY.startsWith('os_v2_')
  const authHeader = isV2Key
    ? `Key ${ONESIGNAL_REST_API_KEY}`
    : `Basic ${ONESIGNAL_REST_API_KEY}`

  const requestOneSignal = async (
    payload: Record<string, unknown>,
    mode: 'alias' | 'tag',
  ) => {
    const controller = new AbortController()
    const timeoutMs = 12000
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch('https://api.onesignal.com/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })

      const result = await response.json().catch(() => ({}))
      return {
        ok: response.ok,
        result,
        status: response.status,
        mode,
      }
    } catch (error) {
      const timeoutError = error instanceof Error && error.name === 'AbortError'
      return {
        ok: false,
        result: {
          error: timeoutError
            ? `OneSignal ${mode} request timed out after ${timeoutMs}ms`
            : (error instanceof Error ? error.message : String(error)),
        },
        status: 0,
        mode,
      }
    } finally {
      clearTimeout(timeoutId)
    }
  }

  const sharedPayload: Record<string, unknown> = {
    app_id: ONESIGNAL_APP_ID,
    headings: { en: heading },
    contents: { en: content },
    data,
  }

  if (collapseId) {
    sharedPayload.collapse_id = collapseId
  }

  const aliasAttempt = await requestOneSignal({
    ...sharedPayload,
    include_aliases: { external_id: recipients },
    target_channel: 'push',
  }, 'alias')

  const aliasRecipients = typeof (aliasAttempt.result as { recipients?: unknown })?.recipients === 'number'
    ? ((aliasAttempt.result as { recipients?: number }).recipients ?? 0)
    : null
  const aliasHasInvalidAliases = Boolean((aliasAttempt.result as { errors?: { invalid_aliases?: unknown } })?.errors?.invalid_aliases)
  if (aliasAttempt.ok && !aliasHasInvalidAliases && (aliasRecipients === null || aliasRecipients > 0)) {
    return {
      mode: 'pushed',
      status: aliasAttempt.status,
      deliveredCount: aliasRecipients ?? recipients.length,
      result: aliasAttempt.result,
    }
  }

  const tagSuccesses: Array<{ recipient: string; result: unknown }> = []
  const tagFailures: Array<{ recipient: string; status: number; result: unknown }> = []

  for (const recipient of recipients) {
    const tagAttempt = await requestOneSignal({
      ...sharedPayload,
      filters: [
        { field: 'tag', key: 'user_id', relation: '=', value: recipient },
      ],
      target_channel: 'push',
    }, 'tag')

    const tagRecipients = typeof (tagAttempt.result as { recipients?: unknown })?.recipients === 'number'
      ? ((tagAttempt.result as { recipients?: number }).recipients ?? 0)
      : null

    if (tagAttempt.ok && (tagRecipients === null || tagRecipients > 0)) {
      tagSuccesses.push({ recipient, result: tagAttempt.result })
    } else {
      tagFailures.push({ recipient, status: tagAttempt.status, result: tagAttempt.result })
    }
  }

  if (tagSuccesses.length > 0) {
    return {
      mode: 'tag_fallback',
      deliveredCount: tagSuccesses.length,
      failedCount: tagFailures.length,
    }
  }

  const isZeroRecipientResult = (value: unknown) => {
    if (!value || typeof value !== 'object') return false
    const recipientsValue = (value as { recipients?: unknown }).recipients
    return typeof recipientsValue === 'number' && recipientsValue === 0
  }

  const aliasWasZeroRecipients = aliasAttempt.ok && isZeroRecipientResult(aliasAttempt.result)
  const tagWasZeroRecipients = tagFailures.length === recipients.length
    && tagFailures.every((failure) => failure.status === 200 && isZeroRecipientResult(failure.result))

  if (aliasWasZeroRecipients && tagWasZeroRecipients) {
    return { mode: 'no_subscribers', deliveredCount: 0, failedCount: 0 }
  }

  console.warn('Delivery confirmation OneSignal push failed:', {
    aliasStatus: aliasAttempt.status,
    aliasResult: aliasAttempt.result,
    tagFailures,
  })

  return {
    mode: 'failed',
    deliveredCount: 0,
    failedCount: recipients.length,
    result: aliasAttempt.result,
  }
}
const normalizeImageUrl = (value: unknown) => {
  const trimmed = toTrimmedString(value)
  if (!trimmed) return ''
  if (/^(https?:)?\/\//i.test(trimmed) || trimmed.startsWith('data:image/')) return trimmed
  return ''
}

const normalizeEmailImageUrl = (value: unknown) => {
  const trimmed = toTrimmedString(value)
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) {
    if (SUPABASE_URL) {
      try {
        const parsed = new URL(trimmed)
        const supabaseOrigin = new URL(SUPABASE_URL).origin
        if (parsed.origin === supabaseOrigin) {
          const signedPrefix = '/storage/v1/object/sign/business-assets/'
          const authenticatedPrefix = '/storage/v1/object/authenticated/business-assets/'
          const publicPrefix = '/storage/v1/object/public/business-assets/'

          if (parsed.pathname.startsWith(signedPrefix)) {
            return new URL(parsed.pathname.slice(signedPrefix.length), BUSINESS_ASSETS_PUBLIC_BASE).toString()
          }

          if (parsed.pathname.startsWith(authenticatedPrefix)) {
            return new URL(parsed.pathname.slice(authenticatedPrefix.length), BUSINESS_ASSETS_PUBLIC_BASE).toString()
          }

          if (parsed.pathname.startsWith(publicPrefix)) {
            return new URL(parsed.pathname.slice(publicPrefix.length), BUSINESS_ASSETS_PUBLIC_BASE).toString()
          }
        }
      } catch {
        return trimmed
      }
    }

    return trimmed
  }
  if (/^\/\//.test(trimmed)) return `https:${trimmed}`
  if (BUSINESS_ASSETS_PUBLIC_BASE && !trimmed.startsWith('data:image/')) {
    return new URL(trimmed.replace(/^\/+/, ''), BUSINESS_ASSETS_PUBLIC_BASE).toString()
  }
  return ''
}

const toPositiveInt = (value: unknown, fallback: number) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : fallback
}

const getDispatchBaseDate = (order: Record<string, unknown>) => {
  const logistics = order.logistics && typeof order.logistics === 'object'
    ? order.logistics as Record<string, unknown>
    : null
  return toTrimmedString(logistics?.dispatchDate)
    || toTrimmedString(logistics?.datePickedUp)
    || toTrimmedString(order.fulfillmentEffectiveEta)
    || toTrimmedString(order.updatedAt)
    || toTrimmedString(order.createdAt)
}

const addDays = (isoLike: string, days: number) => {
  const base = new Date(isoLike)
  if (Number.isNaN(base.getTime())) return null
  base.setUTCDate(base.getUTCDate() + days)
  return base
}

const escapeHtml = (value: string) => (
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
)

const buildConfirmUrl = ({
  code,
  email,
  businessSlug,
}: {
  code: string
  email: string
  businessSlug?: string | null
}) => {
  const normalizedBusinessSlug = normalizeSlug(businessSlug ?? '')
  const pathname = normalizedBusinessSlug
    ? `/${normalizedBusinessSlug}/confirm-delivery/${encodeURIComponent(code)}`
    : '/confirm-delivery'
  const url = new URL(pathname, APP_BASE_URL)
  url.searchParams.set('code', code)
  url.searchParams.set('email', email)
  if (normalizedBusinessSlug) {
    url.searchParams.set('businessSlug', normalizedBusinessSlug)
  }
  return url.toString()
}

const buildTrackingUrl = ({
  code,
  email,
  businessSlug,
}: {
  code: string
  email?: string | null
  businessSlug?: string | null
}) => {
  const normalizedBusinessSlug = normalizeSlug(businessSlug ?? '')
  const pathname = normalizedBusinessSlug
    ? `/${normalizedBusinessSlug}/order-tracking/${encodeURIComponent(code)}`
    : '/order-tracking'
  const url = new URL(pathname, APP_BASE_URL)
  if (!normalizedBusinessSlug) {
    url.searchParams.set('code', code)
  }
  if (email?.trim()) {
    url.searchParams.set('email', email.trim())
  }
  return url.toString()
}

const buildShopUrl = ({
  businessWebsite,
}: {
  businessWebsite?: string | null
}) => {
  const trimmed = toTrimmedString(businessWebsite)
  if (!trimmed) return APP_BASE_URL
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

const normalizeWooStoreUrl = (value: unknown) => {
  const trimmed = toTrimmedString(value)
  if (!trimmed) return ''
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(withProtocol)
    url.pathname = ''
    url.search = ''
    url.hash = ''
    return url.toString().replace(/\/+$/, '')
  } catch {
    return ''
  }
}

const buildWooApiUrl = (
  storeUrl: string,
  path: string,
  params: Record<string, string | number>,
  consumerKey: string,
  consumerSecret: string,
) => {
  const url = new URL(`${storeUrl}${path}`)
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, String(value))
  })
  url.searchParams.set('consumer_key', consumerKey)
  url.searchParams.set('consumer_secret', consumerSecret)
  return url.toString()
}

const fetchWoo = async (
  storeUrl: string,
  consumerKey: string,
  consumerSecret: string,
  path: string,
  params: Record<string, string | number>,
) => {
  const response = await fetch(buildWooApiUrl(storeUrl, path, params, consumerKey, consumerSecret), {
    method: 'GET',
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(text.trim() || `WooCommerce request failed with status ${response.status}.`)
  }

  return response.json()
}

const updateWoo = async (
  storeUrl: string,
  consumerKey: string,
  consumerSecret: string,
  path: string,
  params: Record<string, string | number>,
  body: Record<string, unknown>,
) => {
  const response = await fetch(buildWooApiUrl(storeUrl, path, params, consumerKey, consumerSecret), {
    method: 'PUT',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(text.trim() || `WooCommerce request failed with status ${response.status}.`)
  }

  return response.json()
}

const normalizeWooLookupValue = (value: string | undefined | null) => {
  const trimmed = (value ?? '').trim().toLowerCase()
  if (!trimmed) return ''
  return trimmed
    .replace(/^wc[\s#:-]*/i, '')
    .replace(/^order[\s#:-]*/i, '')
    .replace(/^#/, '')
    .trim()
}

const normalizeWooStatusSlug = (value: unknown) => (
  toTrimmedString(value)
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)+/g, '')
)

type WooOrder = {
  id?: number
  number?: string
  status?: string
}

const findWooOrderByReference = async (
  storeUrl: string,
  consumerKey: string,
  consumerSecret: string,
  rawReference: string,
) => {
  const reference = normalizeWooLookupValue(rawReference)
  if (!reference) return null

  const numericReference = /^\d+$/.test(reference) ? reference : ''
  if (numericReference) {
    try {
      const directOrder = await fetchWoo(
        storeUrl,
        consumerKey,
        consumerSecret,
        `/wp-json/wc/v3/orders/${numericReference}`,
        {},
      ) as WooOrder

      if (directOrder?.id) {
        return directOrder
      }
    } catch {
      // Fall back to paginated lookup by order number/reference.
    }
  }

  const perPage = 50
  const maxPages = 6

  for (let page = 1; page <= maxPages; page += 1) {
    const batch = await fetchWoo(
      storeUrl,
      consumerKey,
      consumerSecret,
      '/wp-json/wc/v3/orders',
      {
        per_page: perPage,
        page,
        orderby: 'date',
        order: 'desc',
      },
    ) as WooOrder[]

    if (!Array.isArray(batch) || batch.length === 0) break

    const matchedOrder = batch.find((wooOrder) => {
      const candidates = [
        normalizeWooLookupValue(String(wooOrder.number ?? '')),
        normalizeWooLookupValue(String(wooOrder.id ?? '')),
      ]
      return candidates.includes(reference)
    })

    if (matchedOrder?.id) {
      return matchedOrder
    }

    if (batch.length < perPage) break
  }

  return null
}

const findConfiguredWooStatusSlug = async ({
  admin,
  businessId,
  fyllStatusName,
}: {
  admin: ReturnType<typeof getAdminClient>
  businessId: string | null
  fyllStatusName: string
}) => {
  if (!businessId || !fyllStatusName.trim()) return ''

  const { data, error } = await admin
    .from('order_statuses')
    .select('data')
    .eq('business_id', businessId)

  if (error) throw error

  const normalizedStatusName = fyllStatusName.trim().toLowerCase()
  const matched = ((data ?? []) as SettingsRow[])
    .map((row) => row.data ?? {})
    .find((entry) => toTrimmedString(entry.name).toLowerCase() === normalizedStatusName)

  return normalizeWooStatusSlug(matched?.wooCommerceStatusSlug)
}

const syncWooDeliveryStatus = async ({
  admin,
  businessId,
  businessData,
  order,
  received,
}: {
  admin: ReturnType<typeof getAdminClient>
  businessId: string | null
  businessData: Record<string, unknown>
  order: Record<string, unknown>
  received: boolean
}) => {
  const storeUrl = normalizeWooStoreUrl(businessData.woocommerceStoreUrl)
  const consumerKey = toTrimmedString(businessData.woocommerceConsumerKey)
  const consumerSecret = toTrimmedString(businessData.woocommerceConsumerSecret)
  const reference = toTrimmedString(order.websiteOrderReference)

  if (!toBoolean(businessData.woocommerceEnabled) || !storeUrl || !consumerKey || !consumerSecret || !reference) {
    return {
      attempted: false,
      reason: !reference ? 'missing-website-order-reference' : 'woocommerce-not-configured',
    }
  }

  const matchedOrder = await findWooOrderByReference(
    storeUrl,
    consumerKey,
    consumerSecret,
    reference,
  )

  if (!matchedOrder?.id) {
    return {
      attempted: true,
      success: false,
      reason: 'woo-order-not-found',
      reference,
    }
  }

  const fyllStatusName = received ? 'Delivered' : 'Pending Delivery'
  const configuredStatusSlug = await findConfiguredWooStatusSlug({
    admin,
    businessId,
    fyllStatusName,
  })
  const nextStatus = configuredStatusSlug || (received ? 'delivered' : 'pending-delivery')
  const updatedOrder = await updateWoo(
    storeUrl,
    consumerKey,
    consumerSecret,
    `/wp-json/wc/v3/orders/${matchedOrder.id}`,
    {},
    { status: nextStatus },
  ) as WooOrder

  return {
    attempted: true,
    success: true,
    reference,
    status: String(updatedOrder.status ?? nextStatus).trim() || nextStatus,
    orderId: String(updatedOrder.id ?? matchedOrder.id),
  }
}

const renderEmailShell = ({
  brandName,
  brandLogoUrl,
  preheader,
  eyebrow,
  title,
  subtitle,
  highlightLabel,
  highlightValue,
  ctaLabel,
  ctaUrl,
  footerNote,
}: {
  brandName: string
  brandLogoUrl?: string
  preheader: string
  eyebrow?: string
  title: string
  subtitle: string
  highlightLabel: string
  highlightValue: string
  ctaLabel: string
  ctaUrl: string
  footerNote: string
}) => `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${escapeHtml(title)}</title>
      </head>
      <body style="margin:0;padding:0;background-color:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;-webkit-font-smoothing:antialiased;">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f9fafb;padding:40px 0;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:500px;margin:0 auto;background-color:#ffffff;padding:48px;border:1px solid #e5e7eb;border-radius:12px;">
                <tr>
                  <td>
                    <div style="text-align:center;margin-bottom:32px;">
                      ${brandLogoUrl
                        ? `<img src="${brandLogoUrl}" alt="${escapeHtml(brandName)}" style="max-width:140px;max-height:40px;width:auto;height:auto;display:inline-block;border:0;outline:none;text-decoration:none;" />`
                        : `<div style="font-weight:700;font-size:24px;letter-spacing:-0.03em;color:#111827;">${escapeHtml(brandName)}</div>`
                      }
                    </div>
                    ${eyebrow ? `<div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.1em;text-align:center;margin-bottom:14px;">${escapeHtml(eyebrow)}</div>` : ''}
                    <h1 style="font-size:26px;font-weight:600;line-height:1.25;margin:0 0 16px 0;color:#111827;text-align:center;letter-spacing:-0.02em;">${escapeHtml(title)}</h1>
                    <p style="font-size:15px;line-height:1.6;color:#4b5563;margin:0 0 32px 0;text-align:center;">${escapeHtml(subtitle)}</p>
                    <div style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:24px;margin-bottom:32px;text-align:center;">
                      <div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">${escapeHtml(highlightLabel)}</div>
                      <div style="font-size:16px;font-weight:600;color:#111827;">${escapeHtml(highlightValue)}</div>
                    </div>
                    <div style="text-align:center;margin-bottom:40px;">
                      <a href="${ctaUrl}" style="display:inline-block;background-color:#000000;color:#ffffff !important;text-decoration:none;font-weight:500;padding:15px 36px;border-radius:9999px;font-size:14px;text-align:center;">${escapeHtml(ctaLabel)}</a>
                    </div>
                    <div style="text-align:center;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:24px;line-height:1.6;letter-spacing:0.02em;">
                      ${escapeHtml(footerNote)}<br />
                      <div style="margin-top:10px;">
                        <img src="${FYLL_WORDMARK_URL}" alt="Fyll" style="max-width:92px;max-height:24px;width:auto;height:auto;display:inline-block;border:0;outline:none;text-decoration:none;" />
                      </div>
                      <div style="margin-top:6px;">Powered by Fyll</div>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `

const buildPromptEmail = ({
  customerName,
  businessName,
  businessLogoUrl,
  orderLabel,
  confirmUrl,
}: {
  customerName: string
  businessName: string
  businessLogoUrl?: string
  orderLabel: string
  confirmUrl: string
}) => ({
  subject: `Has your order arrived? ${orderLabel}`,
  html: renderEmailShell({
    brandName: businessName,
    brandLogoUrl: businessLogoUrl,
    preheader: `Confirm whether ${orderLabel} has arrived.`,
    eyebrow: 'Delivery confirmation',
    title: `Hi ${getFirstName(customerName)}, has your order arrived?`,
    subtitle: `It has been a few days since your ${businessName} order left for delivery. Please take a second to let us know if everything arrived safely.`,
    highlightLabel: 'Order reference',
    highlightValue: orderLabel,
    ctaLabel: 'Confirm Delivery Status',
    ctaUrl: confirmUrl,
    footerNote: `This secure FYLL link is for ${customerName}.`,
  }),
  text: [
    `Hi ${getFirstName(customerName)},`,
    '',
    `Has your ${businessName} order arrived?`,
    `Order reference: ${orderLabel}`,
    `Confirm delivery status: ${confirmUrl}`,
  ].join('\n'),
})

const buildDeliveredConfirmationEmail = ({
  customerName,
  businessName,
  businessLogoUrl,
  orderLabel,
  shopUrl,
}: {
  customerName: string
  businessName: string
  businessLogoUrl?: string
  orderLabel: string
  shopUrl: string
}) => ({
  subject: `Delivery confirmed for ${orderLabel}`,
  html: renderEmailShell({
    brandName: businessName,
    brandLogoUrl: businessLogoUrl,
    preheader: `Your delivery confirmation for ${orderLabel} was received.`,
    eyebrow: 'Delivery confirmed',
    title: 'Your delivery has been confirmed',
    subtitle: `Thanks ${customerName}. We have updated ${orderLabel} as delivered for ${businessName}.`,
    highlightLabel: 'Updated order',
    highlightValue: orderLabel,
    ctaLabel: 'Continue Shopping',
    ctaUrl: shopUrl,
    footerNote: `Your delivery response has been recorded successfully.`,
  }),
  text: [
    `Hi ${customerName},`,
    '',
    `We have confirmed delivery for ${orderLabel}.`,
    `Continue shopping: ${shopUrl}`,
  ].join('\n'),
})

const buildPendingConfirmationEmail = ({
  customerName,
  businessName,
  businessLogoUrl,
  orderLabel,
  trackingUrl,
}: {
  customerName: string
  businessName: string
  businessLogoUrl?: string
  orderLabel: string
  trackingUrl: string
}) => ({
  subject: `We marked ${orderLabel} as pending delivery`,
  html: renderEmailShell({
    brandName: businessName,
    brandLogoUrl: businessLogoUrl,
    preheader: `${orderLabel} is now marked as pending delivery.`,
    eyebrow: 'Pending delivery',
    title: 'We are still tracking your order',
    subtitle: `Thanks ${customerName}. We have marked ${orderLabel} as pending delivery and ${businessName} will keep following up on it.`,
    highlightLabel: 'Tracked order',
    highlightValue: orderLabel,
    ctaLabel: 'View Order Status',
    ctaUrl: trackingUrl,
    footerNote: `We have recorded your update and will keep following up on this order.`,
  }),
  text: [
    `Hi ${customerName},`,
    '',
    `${orderLabel} has been marked as pending delivery.`,
    `View order status: ${trackingUrl}`,
  ].join('\n'),
})

const sendEmail = async ({
  toEmail,
  subject,
  html,
  text,
  fromName,
}: {
  toEmail: string
  subject: string
  html: string
  text: string
  fromName?: string | null
}) => {
  const normalizedFromName = toTrimmedString(fromName) || 'Fyll'
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${normalizedFromName} <${RESEND_FROM_EMAIL}>`,
      to: [toEmail],
      subject,
      html,
      text,
    }),
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(`Resend failed: ${JSON.stringify(payload)}`)
  }
}

const updateOrderAfterSend = async (
  admin: ReturnType<typeof getAdminClient>,
  row: OrderRow,
  nextData: Record<string, unknown>,
) => {
  const { error } = await admin
    .from('orders')
    .update({
      data: nextData,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .eq('business_id', row.business_id)

  if (error) throw error
}

const listBusinessNotificationRecipientIds = async (
  admin: ReturnType<typeof getAdminClient>,
  businessId: string | null,
) => {
  const aliases = getBusinessIdAliases(businessId)
  if (aliases.length === 0) return []

  const normalizedBusinessId = compactBusinessId(businessId)
  const recipientIds = new Set<string>()

  const { data: profiles, error: profilesError } = await admin
    .from('profiles')
    .select('id,business_id')
    .in('business_id', aliases)

  if (profilesError) throw profilesError

  ;(profiles ?? []).forEach((row: { id?: string | null; business_id?: string | null }) => {
    if (compactBusinessId(row.business_id) !== normalizedBusinessId) return
    const userId = toTrimmedString(row.id)
    if (userId) recipientIds.add(userId)
  })

  const { data: teamMembers, error: teamMembersError } = await admin
    .from('team_members')
    .select('user_id,business_id')
    .in('business_id', aliases)

  if (teamMembersError) throw teamMembersError

  ;(teamMembers ?? []).forEach((row: { user_id?: string | null; business_id?: string | null }) => {
    if (compactBusinessId(row.business_id) !== normalizedBusinessId) return
    const userId = toTrimmedString(row.user_id)
    if (userId) recipientIds.add(userId)
  })

  return Array.from(recipientIds)
}

const insertDeliveryConfirmationNotifications = async ({
  admin,
  businessId,
  recipientUserIds,
  payload,
}: {
  admin: ReturnType<typeof getAdminClient>
  businessId: string | null
  recipientUserIds: string[]
  payload: Record<string, unknown>
}) => {
  const rows = recipientUserIds.map((recipientUserId) => ({
    business_id: businessId,
    user_id: recipientUserId,
    actor_user_id: null,
    event_type: 'reply',
    payload,
  }))

  const { error } = await admin
    .from('collaboration_notifications')
    .insert(rows)

  if (error) throw error
  return { notified: recipientUserIds.length }
}

const persistDeliveryConfirmationNotification = async ({
  admin,
  row,
  businessName,
  customerName,
  orderLabel,
  received,
}: {
  admin: ReturnType<typeof getAdminClient>
  row: OrderRow
  businessName: string
  customerName: string
  orderLabel: string
  received: boolean
}) => {
  const recipientUserIds = await listBusinessNotificationRecipientIds(admin, row.business_id)
  if (recipientUserIds.length === 0) return { notified: 0 }

  const payload = buildDeliveryConfirmationNotificationPayload({
    businessName,
    customerName,
    orderId: row.id,
    orderLabel,
    received,
  })

  return await insertDeliveryConfirmationNotifications({
    admin,
    businessId: row.business_id,
    recipientUserIds,
    payload,
  })
}

const sendTestDeliveryConfirmationNotification = async ({
  admin,
  businessId,
  businessName,
  received,
}: {
  admin: ReturnType<typeof getAdminClient>
  businessId: string
  businessName: string
  received: boolean
}) => {
  const recipientUserIds = await listBusinessNotificationRecipientIds(admin, businessId)
  if (recipientUserIds.length === 0) return { notified: 0 }

  const payload = buildDeliveryConfirmationNotificationPayload({
    businessName,
    customerName: 'Test Customer',
    orderLabel: 'TEST-NOTIFICATION',
    received,
    isTest: true,
  })

  return await insertDeliveryConfirmationNotifications({
    admin,
    businessId,
    recipientUserIds,
    payload: {
      ...payload,
      body: received
        ? 'Test customer delivery confirmation: delivered.'
        : 'Test customer delivery confirmation: pending delivery.',
    },
  })
}

const pushDeliveryConfirmationNotification = async ({
  admin,
  businessId,
  businessName,
  customerName,
  orderId,
  orderLabel,
  received,
  isTest = false,
}: {
  admin: ReturnType<typeof getAdminClient>
  businessId: string | null
  businessName: string
  customerName: string
  orderId?: string
  orderLabel: string
  received: boolean
  isTest?: boolean
}) => {
  const recipientUserIds = await listBusinessNotificationRecipientIds(admin, businessId)
  if (recipientUserIds.length === 0) {
    return { mode: 'skipped', reason: 'no-recipients', deliveredCount: 0 }
  }

  const payload = buildDeliveryConfirmationNotificationPayload({
    businessName,
    customerName,
    orderId,
    orderLabel,
    received,
    isTest,
  })

  return await sendOneSignalNotification({
    recipients: recipientUserIds,
    heading: received ? 'Delivery confirmed' : 'Delivery still pending',
    content: isTest
      ? payload.body
      : received
        ? `${customerName || 'A customer'} confirmed ${orderLabel}.`
        : `${customerName || 'A customer'} reported ${orderLabel} is still pending.`,
    data: payload,
    collapseId: isTest
      ? `delivery-confirmation-test:${compactBusinessId(businessId)}:${received ? 'delivered' : 'pending'}`
      : `delivery-confirmation:${orderId ?? orderLabel}:${received ? 'delivered' : 'pending'}`,
  })
}

const describeDeliveryConfirmationPushResult = (pushResult: Record<string, unknown> | null) => {
  if (!pushResult) return null

  const mode = toTrimmedString(pushResult.mode)
  const reason = toTrimmedString(pushResult.reason)
  const deliveredCount = Number(pushResult.deliveredCount)
  const normalizedDeliveredCount = Number.isFinite(deliveredCount) ? deliveredCount : null
  const resultError = pushResult.result && typeof pushResult.result === 'object'
    ? toTrimmedString((pushResult.result as Record<string, unknown>).error)
    : ''
  const directError = toTrimmedString(pushResult.error)
  const errorMessage = directError || resultError

  if (mode === 'pushed' || mode === 'tag_fallback' || mode === 'direct_subscription') {
    return `Sent delivery confirmation push notification${normalizedDeliveredCount !== null ? ` (${normalizedDeliveredCount} recipient${normalizedDeliveredCount === 1 ? '' : 's'})` : ''}`
  }
  if (mode === 'no_subscribers') {
    return 'Skipped delivery confirmation push notification: no subscribed recipients'
  }
  if (mode === 'skipped') {
    return `Skipped delivery confirmation push notification: ${reason || 'not-run'}`
  }
  if (mode === 'failed') {
    return `Delivery confirmation push notification failed: ${errorMessage || reason || 'unknown error'}`
  }

  return `Delivery confirmation push notification result: ${mode || reason || 'unknown'}`
}

const recordWooSyncResult = async ({
  admin,
  row,
  order,
  wooSync,
  pushResult,
  received,
}: {
  admin: ReturnType<typeof getAdminClient>
  row: OrderRow
  order: Record<string, unknown>
  wooSync: Record<string, unknown>
  pushResult?: Record<string, unknown> | null
  received: boolean
}) => {
  const nowIso = new Date().toISOString()
  const activityLog = Array.isArray(order.activityLog) ? order.activityLog : []
  const attempted = wooSync.attempted === true
  const succeeded = wooSync.success === true
  const pushAction = describeDeliveryConfirmationPushResult(pushResult ?? null)
  const nextData = {
    ...order,
    wooCommerceLastDeliverySyncAt: nowIso,
    wooCommerceLastDeliverySyncStatus: attempted
      ? (succeeded ? 'success' : 'failed')
      : 'skipped',
    wooCommerceLastDeliverySyncTargetStatus: received ? 'delivered' : 'pending-delivery',
    wooCommerceLastDeliverySyncError: typeof wooSync.error === 'string'
      ? wooSync.error
      : typeof wooSync.reason === 'string' && !succeeded
        ? wooSync.reason
        : null,
    wooCommerceLastDeliverySyncReference: typeof wooSync.reference === 'string'
      ? wooSync.reference
      : toTrimmedString(order.websiteOrderReference) || null,
    wooCommerceLastDeliverySyncWooOrderId: typeof wooSync.orderId === 'string'
      ? wooSync.orderId
      : null,
    deliveryConfirmationLastPushNotificationAt: pushResult ? nowIso : order.deliveryConfirmationLastPushNotificationAt ?? null,
    deliveryConfirmationLastPushNotificationMode: pushResult ? (toTrimmedString(pushResult.mode) || null) : order.deliveryConfirmationLastPushNotificationMode ?? null,
    deliveryConfirmationLastPushNotificationDeliveredCount: pushResult && Number.isFinite(Number(pushResult.deliveredCount))
      ? Number(pushResult.deliveredCount)
      : (order.deliveryConfirmationLastPushNotificationDeliveredCount ?? null),
    deliveryConfirmationLastPushNotificationError: pushResult
      ? (
          toTrimmedString(pushResult.error)
          || (
            pushResult.result && typeof pushResult.result === 'object'
              ? toTrimmedString((pushResult.result as Record<string, unknown>).error)
              : ''
          )
          || toTrimmedString(pushResult.reason)
          || null
        )
      : (order.deliveryConfirmationLastPushNotificationError ?? null),
    activityLog: [
      ...activityLog,
      {
        staffName: 'System',
        action: attempted
          ? (
              succeeded
                ? `Synced WooCommerce delivery status to ${String(wooSync.status ?? (received ? 'delivered' : 'pending-delivery'))}`
                : `WooCommerce delivery sync failed: ${String(wooSync.error ?? wooSync.reason ?? 'unknown error')}`
            )
          : `Skipped WooCommerce delivery sync: ${String(wooSync.reason ?? 'not-run')}`,
        date: nowIso,
      },
      ...(pushAction ? [{
        staffName: 'System',
        action: pushAction,
        date: nowIso,
      }] : []),
    ],
  }

  await updateOrderAfterSend(admin, row, nextData)
}

const processOrder = async ({
  admin,
  row,
  businessName,
  businessSlug,
  delayDays,
  resendDays,
  forceSend = false,
}: {
  admin: ReturnType<typeof getAdminClient>
  row: OrderRow
  businessName: string
  businessSlug?: string | null
  delayDays: number
  resendDays: number
  forceSend?: boolean
}) => {
  const order = row.data ?? {}
  const customerEmail = toTrimmedString(order.customerEmail).toLowerCase()
  const customerName = toTrimmedString(order.customerName) || 'there'
  const currentStatus = toTrimmedString(order.status).toLowerCase()
  const confirmationStatus = toTrimmedString(order.deliveryConfirmationStatus).toLowerCase()
  const requestedAt = toTrimmedString(order.deliveryConfirmationRequestedAt)
  const lastEmailSentAt = toTrimmedString(order.deliveryConfirmationLastEmailSentAt) || requestedAt
  const lastResponseAt = toTrimmedString(order.deliveryConfirmationLastResponseAt)
  const code = toTrimmedString(order.customerTrackingCode)
    || toTrimmedString(order.websiteOrderReference)
    || toTrimmedString(order.orderNumber)

  const isPendingDeliveryStatus = PENDING_DELIVERY_STATUS_REGEX.test(currentStatus)
  const isDeliveryConfirmationStatus = DELIVERY_CONFIRMATION_STATUS_REGEX.test(currentStatus)
  const isDeliveredStatus = DELIVERED_STATUS_REGEX.test(currentStatus)
    && !isPendingDeliveryStatus
    && !isDeliveryConfirmationStatus

  if (!customerEmail || !code) return { skipped: true, reason: 'missing-code-or-email' }
  if (confirmationStatus === 'confirmed') return { skipped: true, reason: 'already-confirmed' }
  if (currentStatus.includes('cancel')) return { skipped: true, reason: 'cancelled' }
  if (isDeliveredStatus) return { skipped: true, reason: 'already-delivered' }

  const dispatchBase = getDispatchBaseDate(order)
  const initialDueAt = dispatchBase ? addDays(dispatchBase, delayDays) : null
  const resendDueAt = lastResponseAt && confirmationStatus === 'pending'
    ? addDays(lastResponseAt, resendDays)
    : lastEmailSentAt
      ? addDays(lastEmailSentAt, resendDays)
      : null
  const dueAt = requestedAt || confirmationStatus === 'requested' || confirmationStatus === 'pending'
    ? resendDueAt
    : initialDueAt
  if (!forceSend && (!dueAt || dueAt.getTime() > Date.now())) return { skipped: true, reason: 'not-due' }

  const confirmUrl = buildConfirmUrl({ code, email: customerEmail, businessSlug })
  const orderLabel = toTrimmedString(order.websiteOrderReference) || toTrimmedString(order.orderNumber) || code
  const emailContent = buildPromptEmail({
    customerName,
    businessName,
    businessLogoUrl: normalizeEmailImageUrl(order.businessLogo),
    orderLabel,
    confirmUrl,
  })

  await sendEmail({
    toEmail: customerEmail,
    fromName: buildSenderName(businessName),
    ...emailContent,
  })

  const nowIso = new Date().toISOString()
  const activityLog = Array.isArray(order.activityLog) ? order.activityLog : []
  const isResend = Boolean(requestedAt)
  const nextEmailCount = Number.isFinite(Number(order.deliveryConfirmationEmailCount))
    ? Math.max(0, Math.floor(Number(order.deliveryConfirmationEmailCount))) + 1
    : 1
  const nextData = {
    ...order,
    updatedAt: nowIso,
    updatedBy: 'System',
    deliveryConfirmationStatus: confirmationStatus === 'pending' ? 'pending' : 'requested',
    deliveryConfirmationRequestedAt: requestedAt || nowIso,
    deliveryConfirmationLastEmailSentAt: nowIso,
    deliveryConfirmationEmailCount: nextEmailCount,
    activityLog: [
      ...activityLog,
      {
        staffName: 'System',
        action: isResend
          ? (
              lastResponseAt && confirmationStatus === 'pending'
                ? 'Resent delivery confirmation email after pending delivery response'
                : 'Resent delivery confirmation email after no customer response'
            )
          : 'Sent delivery confirmation email',
        date: nowIso,
      },
    ],
  }

  await updateOrderAfterSend(admin, row, nextData)
  return { skipped: false }
}

const findOrderForConfirmationResult = async ({
  admin,
  trackingCode,
  email,
  businessSlug,
}: {
  admin: ReturnType<typeof getAdminClient>
  trackingCode: string
  email: string
  businessSlug?: string | null
}) => {
  const normalizedTrackingCode = toTrimmedString(trackingCode).toUpperCase()
  const normalizedEmail = toTrimmedString(email).toLowerCase()
  const normalizedSlug = normalizeSlug(businessSlug ?? '')
  if (!normalizedTrackingCode || !normalizedEmail) return null

  const { data: orderRows, error } = await admin
    .from('orders')
    .select('id,business_id,data')

  if (error) throw error

  const rows = (orderRows ?? []) as OrderRow[]
  for (const row of rows) {
    const order = row.data ?? {}
    const matchesEmail = toTrimmedString(order.customerEmail).toLowerCase() === normalizedEmail
    if (!matchesEmail) continue

    const candidateCodes = [
      toTrimmedString(order.customerTrackingCode).toUpperCase(),
      toTrimmedString(order.websiteOrderReference).toUpperCase(),
      toTrimmedString(order.orderNumber).toUpperCase(),
      `TRK-${toTrimmedString(row.id).slice(-6).toUpperCase()}`,
    ].filter(Boolean)

    if (!candidateCodes.includes(normalizedTrackingCode)) continue

    if (!normalizedSlug) return row

    const { data: businessRow, error: businessError } = await admin
      .from('businesses')
      .select('id,name,data')
      .eq('id', row.business_id)
      .maybeSingle()

    if (businessError) throw businessError

    const businessData = (businessRow?.data ?? {}) as Record<string, unknown>
    const rowSlug = normalizeSlug(
      toTrimmedString(businessData.businessSlug)
        || toTrimmedString(businessData.businessName)
        || toTrimmedString(businessRow?.name)
    )

    if (rowSlug === normalizedSlug) {
      return row
    }
  }

  return null
}

const sendConfirmationResultEmail = async ({
  admin,
  trackingCode,
  email,
  businessSlug,
  received,
}: {
  admin: ReturnType<typeof getAdminClient>
  trackingCode: string
  email: string
  businessSlug?: string | null
  received: boolean
}) => {
  const row = await findOrderForConfirmationResult({ admin, trackingCode, email, businessSlug })
  if (!row) return { sent: false, reason: 'order-not-found' }

  const order = row.data ?? {}
  const customerEmail = toTrimmedString(order.customerEmail).toLowerCase()
  const customerName = toTrimmedString(order.customerName) || 'there'
  const orderLabel = toTrimmedString(order.websiteOrderReference)
    || toTrimmedString(order.orderNumber)
    || toTrimmedString(order.customerTrackingCode)
    || trackingCode

  const { data: businessRow, error: businessError } = await admin
    .from('businesses')
    .select('id,name,data')
    .eq('id', row.business_id)
    .maybeSingle()

  if (businessError) throw businessError

  const businessData = (businessRow?.data ?? {}) as Record<string, unknown>
  const businessName = normalizeBusinessName(
    toTrimmedString(businessData.businessName) || toTrimmedString(businessRow?.name)
  )
  const resolvedBusinessSlug = normalizeSlug(
    toTrimmedString(businessData.businessSlug)
      || toTrimmedString(businessData.businessName)
      || toTrimmedString(businessRow?.name)
      || businessSlug
      || ''
  )
  const businessWebsite = toTrimmedString(businessData.businessWebsite)
  const businessLogoUrl = normalizeEmailImageUrl(businessData.businessLogo)
  let wooSync: Record<string, unknown> = {
    attempted: false,
    reason: 'not-run',
  }

  try {
    wooSync = await syncWooDeliveryStatus({
      admin,
      businessId: row.business_id,
      businessData,
      order,
      received,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'WooCommerce delivery sync failed.'
    console.warn('WooCommerce delivery sync failed:', message)
    wooSync = {
      attempted: true,
      success: false,
      reason: 'sync-error',
      error: message,
    }
  }

  const trackingUrl = buildTrackingUrl({
    code: trackingCode,
    email: customerEmail,
    businessSlug: resolvedBusinessSlug || null,
  })
  const shopUrl = buildShopUrl({ businessWebsite })

  const emailContent = received
      ? buildDeliveredConfirmationEmail({
          customerName,
          businessName,
          businessLogoUrl,
          orderLabel,
          shopUrl,
        })
      : buildPendingConfirmationEmail({
          customerName,
          businessName,
          businessLogoUrl,
          orderLabel,
          trackingUrl,
        })

  await sendEmail({
    toEmail: customerEmail,
    fromName: buildSenderName(businessName),
    ...emailContent,
  })

  let pushResult: Record<string, unknown> | null = null
  try {
    pushResult = await pushDeliveryConfirmationNotification({
      admin,
      businessId: row.business_id,
      businessName,
      customerName,
      orderId: row.id,
      orderLabel,
      received,
    }) as Record<string, unknown>
  } catch (pushError) {
    console.warn(
      'Delivery confirmation push notification failed:',
      pushError instanceof Error ? pushError.message : String(pushError),
    )
  }

  await recordWooSyncResult({
    admin,
    row,
    order,
    wooSync,
    pushResult,
    received,
  })

  try {
    await persistDeliveryConfirmationNotification({
      admin,
      row,
      businessName,
      customerName,
      orderLabel,
      received,
    })
  } catch (notificationError) {
    console.warn(
      'Delivery confirmation in-app notification persistence failed:',
      notificationError instanceof Error ? notificationError.message : String(notificationError),
    )
  }

  return {
    sent: true,
    wooSync,
    pushResult,
  }
}

const sendTestDeliveryEmail = async ({
  admin,
  businessId,
  businessSlug,
  email,
  variant,
}: {
  admin: ReturnType<typeof getAdminClient>
  businessId: string
  businessSlug?: string | null
  email: string
  variant: 'prompt' | 'delivered' | 'pending'
}) => {
  const { data: businessRow, error: businessError } = await admin
    .from('businesses')
    .select('id,name,data')
    .eq('id', businessId)
    .maybeSingle()

  if (businessError) throw businessError
  if (!businessRow) throw new Error('Business not found.')

  const businessData = (businessRow.data ?? {}) as Record<string, unknown>
  const businessName = normalizeBusinessName(
    toTrimmedString(businessData.businessName) || toTrimmedString(businessRow.name)
  )
  const resolvedBusinessSlug = normalizeSlug(
    toTrimmedString(businessData.businessSlug)
      || toTrimmedString(businessData.businessName)
      || toTrimmedString(businessRow.name)
      || businessSlug
      || ''
  )
  const businessWebsite = toTrimmedString(businessData.businessWebsite)
  const businessLogoUrl = normalizeEmailImageUrl(businessData.businessLogo)
  const customerEmail = toTrimmedString(email).toLowerCase()
  const customerName = 'Test Customer'
  const orderLabel = 'TEST-001'
  const trackingCode = 'TEST-001'

  const emailContent = variant === 'prompt'
    ? buildPromptEmail({
        customerName,
        businessName,
        businessLogoUrl,
        orderLabel,
        confirmUrl: buildConfirmUrl({
          code: trackingCode,
          email: customerEmail,
          businessSlug: resolvedBusinessSlug || null,
        }),
      })
    : variant === 'delivered'
      ? buildDeliveredConfirmationEmail({
          customerName,
          businessName,
          businessLogoUrl,
          orderLabel,
          shopUrl: buildShopUrl({ businessWebsite }),
        })
      : buildPendingConfirmationEmail({
          customerName,
          businessName,
          businessLogoUrl,
          orderLabel,
          trackingUrl: buildTrackingUrl({
            code: trackingCode,
            email: customerEmail,
            businessSlug: resolvedBusinessSlug || null,
          }),
        })

  await sendEmail({
    toEmail: customerEmail,
    fromName: buildSenderName(businessName),
    ...emailContent,
  })

  return {
    sent: true,
    variant,
    businessName,
    senderName: buildSenderName(businessName),
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !RESEND_API_KEY || !RESEND_FROM_EMAIL || !APP_BASE_URL) {
    return jsonResponse(500, { error: 'Missing required function secrets.' })
  }

  try {
    const payload = (await req.json().catch(() => ({}))) as DeliveryFollowUpPayload
    const type = payload.type ?? 'delivery_followup_all'
    const isCronRequest = type === 'delivery_followup_all'

    if (isCronRequest) {
      const token = getBearerToken(req)
      if (!CRON_SECRET || token !== CRON_SECRET) {
        return jsonResponse(401, { error: 'Unauthorized cron request.' })
      }
    }

    const admin = getAdminClient()

    if (type === 'delivery_followup_test') {
      const token = getBearerToken(req)
      const businessId = toTrimmedString(payload.businessId)
      const email = toTrimmedString(payload.email).toLowerCase()
      const variant = payload.variant ?? 'prompt'

      if (!token) {
        return jsonResponse(401, { error: 'Unauthorized test request.' })
      }

      const { data: authData, error: authError } = await admin.auth.getUser(token)
      if (authError || !authData.user) {
        return jsonResponse(401, { error: 'Unauthorized test request.' })
      }

      if (!businessId || !email) {
        return jsonResponse(400, { error: 'Missing business or test email.' })
      }

      const result = await sendTestDeliveryEmail({
        admin,
        businessId,
        businessSlug: payload.businessSlug ?? null,
        email,
        variant,
      })

      return jsonResponse(200, {
        success: true,
        ...result,
      })
    }

    if (type === 'delivery_confirmation_notification_test') {
      const token = getBearerToken(req)
      const businessId = toTrimmedString(payload.businessId)
      const received = payload.received === true

      if (!token) {
        return jsonResponse(401, { error: 'Unauthorized test request.' })
      }

      const { data: authData, error: authError } = await admin.auth.getUser(token)
      if (authError || !authData.user) {
        return jsonResponse(401, { error: 'Unauthorized test request.' })
      }

      if (!businessId) {
        return jsonResponse(400, { error: 'Missing business for test notification.' })
      }

      const { data: businessRow, error: businessError } = await admin
        .from('businesses')
        .select('id,name,data')
        .eq('id', businessId)
        .maybeSingle()

      if (businessError) throw businessError
      if (!businessRow) {
        return jsonResponse(404, { error: 'Business not found.' })
      }

      const businessData = (businessRow.data ?? {}) as Record<string, unknown>
      const businessName = normalizeBusinessName(
        toTrimmedString(businessData.businessName) || toTrimmedString(businessRow.name),
      )

      const result = await sendTestDeliveryConfirmationNotification({
        admin,
        businessId,
        businessName,
        received,
      })

      const pushResult = await pushDeliveryConfirmationNotification({
        admin,
        businessId,
        businessName,
        customerName: 'Test Customer',
        orderLabel: 'TEST-NOTIFICATION',
        received,
        isTest: true,
      })

      return jsonResponse(200, {
        success: true,
        ...result,
        pushResult,
      })
    }

    if (type === 'delivery_confirmation_result') {
      const trackingCode = toTrimmedString(payload.trackingCode)
      const email = toTrimmedString(payload.email).toLowerCase()
      const received = payload.received === true

      if (!trackingCode || !email) {
        return jsonResponse(400, { error: 'Missing tracking code or email.' })
      }

      const result = await sendConfirmationResultEmail({
        admin,
        trackingCode,
        email,
        businessSlug: payload.businessSlug ?? null,
        received,
      })

      return jsonResponse(200, {
        success: true,
        ...result,
      })
    }

    if (type === 'delivery_followup_status_trigger') {
      const businessId = toTrimmedString(payload.businessId)
      const orderId = toTrimmedString(payload.orderId)

      if (!businessId || !orderId) {
        return jsonResponse(400, { error: 'Missing business or order.' })
      }

      const { data: businessRow, error: businessLookupError } = await admin
        .from('businesses')
        .select('id,name,data')
        .eq('id', businessId)
        .maybeSingle()

      if (businessLookupError) throw businessLookupError

      const businessData = (businessRow?.data ?? {}) as Record<string, unknown>
      const businessName = normalizeBusinessName(
        toTrimmedString(businessData.businessName) || toTrimmedString(businessRow?.name)
      )
      const businessLogoUrl = normalizeEmailImageUrl(businessData.businessLogo)
      const businessSlug = normalizeSlug(
        toTrimmedString(businessData.businessSlug)
          || toTrimmedString(businessData.businessName)
          || toTrimmedString(businessRow?.name)
      )

      const { data: settingsRow, error: settingsError } = await admin
        .from('business_settings')
        .select('data')
        .eq('business_id', businessId)
        .eq('id', 'global')
        .maybeSingle()

      if (settingsError) throw settingsError

      const settingsData = (settingsRow?.data ?? {}) as Record<string, unknown>
      const delayDays = toPositiveInt(settingsData.deliveryFollowUpDelayDays, 7)
      const resendDays = toPositiveInt(settingsData.deliveryFollowUpResendDays, DELIVERY_FOLLOW_UP_RESEND_DAYS)

      const { data: orderRow, error: orderError } = await admin
        .from('orders')
        .select('id,business_id,data')
        .eq('business_id', businessId)
        .eq('id', orderId)
        .maybeSingle()

      if (orderError) throw orderError
      if (!orderRow) {
        return jsonResponse(404, { error: 'Order was not found.' })
      }

      const result = await processOrder({
        admin,
        row: {
          ...(orderRow as OrderRow),
          data: {
            ...(((orderRow as OrderRow).data) ?? {}),
            businessLogo: businessLogoUrl,
          },
        },
        businessName,
        businessSlug,
        delayDays,
        resendDays,
        forceSend: payload.forceSend === true,
      })

      return jsonResponse(200, {
        success: true,
        ...result,
      })
    }
    const { data: businessRows, error: businessError } = await admin
      .from('business_settings')
      .select('id,business_id,data')
      .eq('id', 'global')

    if (businessError) throw businessError

    const enabledBusinesses = ((businessRows ?? []) as BusinessRow[])
      .filter((row: BusinessRow) => Boolean(row.business_id))
      .filter((row: BusinessRow) => row.data?.deliveryFollowUpEnabled === true)
      .filter((row: BusinessRow) => !payload.businessId || row.business_id === payload.businessId)

    let sent = 0
    let skipped = 0

    for (const settingsRow of enabledBusinesses) {
      const businessId = settingsRow.business_id as string
      const delayDays = toPositiveInt(settingsRow.data?.deliveryFollowUpDelayDays, 7)
      const resendDays = toPositiveInt(settingsRow.data?.deliveryFollowUpResendDays, DELIVERY_FOLLOW_UP_RESEND_DAYS)
      const { data: businessRow, error: businessLookupError } = await admin
        .from('businesses')
        .select('id,name,data')
        .eq('id', businessId)
        .maybeSingle()

      if (businessLookupError) throw businessLookupError

      const businessData = (businessRow?.data ?? {}) as Record<string, unknown>
      const businessName = normalizeBusinessName(
        toTrimmedString(businessData.businessName) || toTrimmedString(businessRow?.name)
      )
      const businessLogoUrl = normalizeEmailImageUrl(businessData.businessLogo)
      const businessSlug = normalizeSlug(
        toTrimmedString(businessData.businessSlug)
          || toTrimmedString(businessData.businessName)
          || toTrimmedString(businessRow?.name)
      )

      let ordersQuery = admin
        .from('orders')
        .select('id,business_id,data')
        .eq('business_id', businessId)

      if (payload.orderId) {
        ordersQuery = ordersQuery.eq('id', payload.orderId)
      }

      const { data: orderRows, error: ordersError } = await ordersQuery
      if (ordersError) throw ordersError

      for (const row of (orderRows ?? []) as OrderRow[]) {
        const result = await processOrder({
          admin,
          row: {
            ...row,
            data: {
              ...(row.data ?? {}),
              businessLogo: businessLogoUrl,
            },
          },
          businessName,
          businessSlug,
          delayDays,
          resendDays,
        })
        if (result.skipped) {
          skipped += 1
        } else {
          sent += 1
        }
      }
    }

    return jsonResponse(200, {
      success: true,
      sent,
      skipped,
      businesses: enabledBusinesses.length,
    })
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: (error as Error)?.message ?? 'Unexpected error',
    })
  }
})
