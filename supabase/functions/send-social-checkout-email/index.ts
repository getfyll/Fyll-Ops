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
const FYLL_WORDMARK_URL = APP_BASE_URL
  ? new URL('/fyll-wordmark-email.png', APP_BASE_URL).toString()
  : ''
const BUSINESS_ASSETS_PUBLIC_BASE = SUPABASE_URL
  ? `${SUPABASE_URL.replace(/\/+$/, '')}/storage/v1/object/public/business-assets/`
  : ''

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type SocialCheckoutEmailPayload = {
  type?: 'payment_submitted' | 'payment_confirmed' | 'payment_rejected' | 'order_created'
  businessId?: string
  checkoutCode?: string
  orderId?: string
}

type DataRow = {
  id: string
  business_id: string | null
  name?: string | null
  data: Record<string, unknown> | null
}

type OrderEmailLine = {
  name: string
  detail?: string
  quantity: number
  amount: number
}

const jsonResponse = (status: number, body: Record<string, unknown>) => (
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
)

const getAdminClient = () => (
  createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
)

const toTrimmedString = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
const getFirstName = (value: string) => toTrimmedString(value).split(/\s+/).filter(Boolean)[0] || 'there'
const normalizeBusinessName = (value: string) => value.trim() || 'Fyll'
const buildSenderName = (businessName: string) => `${normalizeBusinessName(businessName)} - Fyll`
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

const escapeHtml = (value: string) => (
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
)

const formatCurrency = (amount: unknown) => {
  const numeric = Number(amount) || 0
  return `₦${numeric.toLocaleString('en-NG', { maximumFractionDigits: 0 })}`
}

const normalizeSlug = (value: string) => (
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
)

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

const buildCheckoutUrl = ({
  code,
  businessSlug,
}: {
  code: string
  businessSlug?: string | null
}) => {
  const normalizedBusinessSlug = normalizeSlug(businessSlug ?? '')
  const pathname = normalizedBusinessSlug
    ? `/${normalizedBusinessSlug}/checkout/${encodeURIComponent(code)}`
    : '/checkout'
  const url = new URL(pathname, APP_BASE_URL)
  if (!normalizedBusinessSlug) {
    url.searchParams.set('code', code)
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

const renderNote = (value: string) => escapeHtml(value).replace(/\n/g, '<br />')

const toNumber = (value: unknown) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

const toArray = (value: unknown): Record<string, unknown>[] => (
  Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : []
)

const getVariantName = (product: Record<string, unknown> | undefined, variantId: string) => {
  const variants = toArray(product?.variants)
  const variant = variants.find((item) => toTrimmedString(item.id) === variantId)
  return toTrimmedString(variant?.name)
    || toTrimmedString(variant?.variantName)
    || toTrimmedString(variant?.label)
}

const buildOrderEmailLines = ({
  order,
  productsById,
}: {
  order: Record<string, unknown> | null
  productsById: Map<string, Record<string, unknown>>
}) => {
  if (!order) return [] as OrderEmailLine[]

  const itemLines = toArray(order.items).map((item, index) => {
    const productId = toTrimmedString(item.productId)
    const variantId = toTrimmedString(item.variantId)
    const quantity = Math.max(1, toNumber(item.quantity) || 1)
    const unitPrice = toNumber(item.unitPrice)
    const product = productId ? productsById.get(productId) : undefined
    const productName = toTrimmedString(product?.productName)
      || toTrimmedString(product?.name)
      || toTrimmedString(item.productName)
      || `Item ${index + 1}`
    const variantName = getVariantName(product, variantId)
      || toTrimmedString(item.variantName)

    return {
      name: productName,
      detail: variantName,
      quantity,
      amount: unitPrice * quantity,
    }
  })

  const serviceLines = toArray(order.services).map((service, index) => ({
    name: toTrimmedString(service.name) || `Service ${index + 1}`,
    quantity: 1,
    amount: toNumber(service.price),
  }))

  return [...itemLines, ...serviceLines]
}

const renderOrderSummaryTable = ({
  lines,
  order,
  fallbackAmount,
}: {
  lines: OrderEmailLine[]
  order: Record<string, unknown> | null
  fallbackAmount: number
}) => {
  const lineSubtotal = lines.reduce((sum, line) => sum + line.amount, 0)
  const storedSubtotal = toNumber(order?.subtotal)
  const servicesTotal = toArray(order?.services).reduce((sum, service) => sum + toNumber(service.price), 0)
  const subtotal = lineSubtotal || storedSubtotal + servicesTotal
  const deliveryFee = toNumber(order?.deliveryFee)
  const additionalCharges = toNumber(order?.additionalCharges)
  const additionalChargesNote = toTrimmedString(order?.additionalChargesNote)
  const discountAmount = toNumber(order?.discountAmount)
  const totalAmount = toNumber(order?.totalAmount) || fallbackAmount || subtotal + deliveryFee + additionalCharges - discountAmount
  const safeLines = lines.length > 0
    ? lines
    : [{ name: 'Checkout payment', quantity: 1, amount: fallbackAmount }]

  const rows = safeLines.map((line) => `
    <tr>
      <td style="padding:14px 0;border-bottom:1px solid #e5e7eb;vertical-align:top;">
        <div style="font-size:14px;font-weight:600;color:#111827;line-height:1.4;">${escapeHtml(line.name)}</div>
        ${line.detail ? `<div style="font-size:12px;color:#6b7280;line-height:1.4;margin-top:2px;">${escapeHtml(line.detail)}</div>` : ''}
      </td>
      <td align="center" style="padding:14px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280;vertical-align:top;">${line.quantity}</td>
      <td align="right" style="padding:14px 0;border-bottom:1px solid #e5e7eb;font-size:14px;font-weight:600;color:#111827;vertical-align:top;">${escapeHtml(formatCurrency(line.amount))}</td>
    </tr>
  `).join('')

  const summaryRows = [
    subtotal > 0 ? ['Subtotal', formatCurrency(subtotal), false] : null,
    deliveryFee > 0 ? ['Delivery', formatCurrency(deliveryFee), false] : null,
    additionalCharges > 0 ? [additionalChargesNote || 'Add-ons', formatCurrency(additionalCharges), false] : null,
    discountAmount > 0 ? ['Discount', `-${formatCurrency(discountAmount)}`, false] : null,
    ['Total', formatCurrency(totalAmount), true],
  ].filter(Boolean) as Array<[string, string, boolean]>

  const summary = summaryRows.map(([label, value, isTotal]) => `
    <tr>
      <td colspan="2" align="right" style="padding:${isTotal ? '14px 0 0' : '8px 0 0'};font-size:${isTotal ? '15px' : '13px'};font-weight:${isTotal ? '700' : '500'};color:${isTotal ? '#111827' : '#6b7280'};">${escapeHtml(label)}</td>
      <td align="right" style="padding:${isTotal ? '14px 0 0' : '8px 0 0'};font-size:${isTotal ? '16px' : '13px'};font-weight:${isTotal ? '700' : '600'};color:#111827;">${escapeHtml(value)}</td>
    </tr>
  `).join('')

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
      <tr>
        <th align="left" style="padding:0 0 8px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.1em;border-bottom:1px solid #e5e7eb;">Item</th>
        <th align="center" style="padding:0 10px 8px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.1em;border-bottom:1px solid #e5e7eb;">Qty</th>
        <th align="right" style="padding:0 0 8px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.1em;border-bottom:1px solid #e5e7eb;">Amount</th>
      </tr>
      ${rows}
      ${summary}
    </table>
  `
}

const renderOrderCreatedEmail = ({
  brandName,
  brandLogoUrl,
  preheader,
  title,
  subtitle,
  orderNumber,
  paymentLabel,
  ctaUrl,
  orderSummaryHtml,
}: {
  brandName: string
  brandLogoUrl?: string
  preheader: string
  title: string
  subtitle: string
  orderNumber: string
  paymentLabel: string
  ctaUrl: string
  orderSummaryHtml: string
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
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background-color:#ffffff;padding:40px;border:1px solid #e5e7eb;border-radius:12px;">
              <tr>
                <td>
                  <div style="text-align:left;margin-bottom:28px;">
                    ${brandLogoUrl
                      ? `<img src="${brandLogoUrl}" alt="${escapeHtml(brandName)}" style="max-width:140px;max-height:40px;width:auto;height:auto;display:inline-block;border:0;outline:none;text-decoration:none;" />`
                      : `<div style="font-weight:700;font-size:24px;letter-spacing:-0.03em;color:#111827;">${escapeHtml(brandName)}</div>`
                    }
                  </div>
                  <div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:12px;">Order created</div>
                  <h1 style="font-size:26px;font-weight:600;line-height:1.25;margin:0 0 12px 0;color:#111827;letter-spacing:-0.02em;">${escapeHtml(title)}</h1>
                  <p style="font-size:15px;line-height:1.6;color:#4b5563;margin:0 0 24px 0;">${escapeHtml(subtitle)}</p>
                  <div style="margin-bottom:28px;">
                    <a href="${ctaUrl}" style="display:inline-block;background-color:#000000;color:#ffffff !important;text-decoration:none;font-weight:500;padding:15px 32px;border-radius:9999px;font-size:14px;text-align:center;">Track Order</a>
                  </div>
                  <div style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:24px;">
                    <div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">Order reference</div>
                    <div style="font-size:18px;font-weight:700;color:#111827;">${escapeHtml(orderNumber)}</div>
                    <div style="font-size:12px;color:#6b7280;margin-top:6px;">Linked payment reference ${escapeHtml(paymentLabel)}</div>
                  </div>
                  <div style="background-color:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:32px;">
                    <div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:14px;">Order summary</div>
                    ${orderSummaryHtml}
                  </div>
                  <div style="text-align:left;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:24px;line-height:1.6;letter-spacing:0.02em;">
                    You are receiving this because this order was created from a confirmed social checkout payment.<br />
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

const renderEmailShell = ({
  brandName,
  brandLogoUrl,
  preheader,
  eyebrow,
  title,
  subtitle,
  highlightLabel,
  highlightValue,
  noteLabel,
  noteValue,
  ctaLabel,
  ctaUrl,
  footerNote,
}: {
  brandName: string
  brandLogoUrl?: string
  preheader: string
  eyebrow: string
  title: string
  subtitle: string
  highlightLabel: string
  highlightValue: string
  noteLabel?: string
  noteValue?: string
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
                  <div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.1em;text-align:center;margin-bottom:14px;">${escapeHtml(eyebrow)}</div>
                  <h1 style="font-size:26px;font-weight:600;line-height:1.25;margin:0 0 16px 0;color:#111827;text-align:center;letter-spacing:-0.02em;">${escapeHtml(title)}</h1>
                  <p style="font-size:15px;line-height:1.6;color:#4b5563;margin:0 0 32px 0;text-align:center;">${escapeHtml(subtitle)}</p>
                  <div style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:24px;margin-bottom:24px;text-align:center;">
                    <div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">${escapeHtml(highlightLabel)}</div>
                    <div style="font-size:18px;font-weight:600;color:#111827;">${escapeHtml(highlightValue)}</div>
                  </div>
                  ${noteValue ? `
                    <div style="background-color:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:32px;">
                      <div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:10px;">${escapeHtml(noteLabel ?? 'Details')}</div>
                      <div style="font-size:14px;line-height:1.65;color:#374151;">${renderNote(noteValue)}</div>
                    </div>
                  ` : ''}
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

const buildEmailContent = ({
  type,
  customerName,
  businessName,
  businessLogoUrl,
  checkoutCode,
  amount,
  billNote,
  checkoutUrl,
  orderNumber,
  trackingUrl,
  order,
  orderLines,
}: {
  type: NonNullable<SocialCheckoutEmailPayload['type']>
  customerName: string
  businessName: string
  businessLogoUrl?: string
  checkoutCode: string
  amount: number
  billNote: string
  checkoutUrl: string
  orderNumber?: string
  trackingUrl?: string
  order?: Record<string, unknown> | null
  orderLines?: OrderEmailLine[]
}) => {
  const firstName = getFirstName(customerName)
  const paymentLabel = `SC-${checkoutCode}`
  const amountLabel = formatCurrency(amount)

  if (type === 'payment_submitted') {
    return {
      subject: `We received your payment proof - ${paymentLabel}`,
      html: renderEmailShell({
        brandName: businessName,
        brandLogoUrl: businessLogoUrl,
        preheader: `Your payment proof for ${amountLabel} is awaiting review.`,
        eyebrow: 'Payment received',
        title: `Hi ${firstName}, we received your payment proof`,
        subtitle: `${businessName} is reviewing your bank transfer now. You will receive another email once your payment is confirmed.`,
        highlightLabel: 'Amount received for review',
        highlightValue: amountLabel,
        noteLabel: 'Bill',
        noteValue: billNote,
        ctaLabel: 'View Payment Link',
        ctaUrl: checkoutUrl,
        footerNote: `Payment reference ${paymentLabel}.`,
      }),
      text: [
        `Hi ${firstName},`,
        '',
        `We received your payment proof for ${amountLabel}.`,
        `${businessName} is reviewing your bank transfer now.`,
        '',
        `Payment reference: ${paymentLabel}`,
        `Payment link: ${checkoutUrl}`,
      ].join('\n'),
    }
  }

  if (type === 'payment_confirmed') {
    return {
      subject: `Payment confirmed - ${paymentLabel}`,
      html: renderEmailShell({
        brandName: businessName,
        brandLogoUrl: businessLogoUrl,
        preheader: `Your ${businessName} payment has been confirmed.`,
        eyebrow: 'Payment confirmed',
        title: `Hi ${firstName}, your payment is confirmed`,
        subtitle: `${businessName} has confirmed your payment. Your order will be created and processed next.`,
        highlightLabel: 'Confirmed payment',
        highlightValue: amountLabel,
        noteLabel: 'Bill',
        noteValue: billNote,
        ctaLabel: 'View Payment Link',
        ctaUrl: checkoutUrl,
        footerNote: `Payment reference ${paymentLabel}.`,
      }),
      text: [
        `Hi ${firstName},`,
        '',
        `Your payment of ${amountLabel} has been confirmed.`,
        `${businessName} will create and process your order next.`,
        '',
        `Payment reference: ${paymentLabel}`,
      ].join('\n'),
    }
  }

  if (type === 'payment_rejected') {
    return {
      subject: `Payment proof needs attention - ${paymentLabel}`,
      html: renderEmailShell({
        brandName: businessName,
        brandLogoUrl: businessLogoUrl,
        preheader: `${businessName} could not verify your payment proof.`,
        eyebrow: 'Payment not verified',
        title: `Hi ${firstName}, your payment proof needs attention`,
        subtitle: `${businessName} could not verify the payment proof you submitted. Please contact the seller so they can confirm the transfer details or send you a new payment link.`,
        highlightLabel: 'Payment submitted for review',
        highlightValue: amountLabel,
        noteLabel: 'Bill',
        noteValue: billNote,
        ctaLabel: 'View Payment Link',
        ctaUrl: checkoutUrl,
        footerNote: `Payment reference ${paymentLabel}.`,
      }),
      text: [
        `Hi ${firstName},`,
        '',
        `${businessName} could not verify your payment proof for ${amountLabel}.`,
        'Please contact the seller so they can confirm the transfer details or send you a new payment link.',
        '',
        `Payment reference: ${paymentLabel}`,
        `Payment link: ${checkoutUrl}`,
      ].join('\n'),
    }
  }

  return {
    subject: `Your order has been created - ${orderNumber ?? paymentLabel}`,
    html: renderOrderCreatedEmail({
      brandName: businessName,
      brandLogoUrl: businessLogoUrl,
      preheader: `${businessName} has created your order.`,
      title: `Hi ${firstName}, your order has been created`,
      subtitle: `${businessName} has created your order from your confirmed payment. Track the order below and review the bill summary.`,
      orderNumber: orderNumber || paymentLabel,
      paymentLabel,
      ctaUrl: trackingUrl || checkoutUrl,
      orderSummaryHtml: renderOrderSummaryTable({
        lines: orderLines ?? [],
        order: order ?? null,
        fallbackAmount: amount,
      }),
    }),
    text: [
      `Hi ${firstName},`,
      '',
      `${businessName} has created your order.`,
      `Order reference: ${orderNumber || paymentLabel}`,
      `Linked payment reference: ${paymentLabel}`,
      '',
      'Order summary:',
      ...(orderLines && orderLines.length > 0
        ? orderLines.map((line) => `- ${line.name}${line.detail ? ` (${line.detail})` : ''} x${line.quantity}: ${formatCurrency(line.amount)}`)
        : [`- Checkout payment: ${amountLabel}`]),
      trackingUrl ? `Track order: ${trackingUrl}` : '',
    ].filter(Boolean).join('\n'),
  }
}

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
  fromName: string
}) => {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${fromName} <${RESEND_FROM_EMAIL}>`,
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

  const response = await fetch('https://api.onesignal.com/notifications', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader,
      'Idempotency-Key': `social-checkout-payment:${String(data.checkoutCode ?? '')}:${recipients.slice().sort().join(',')}`,
    },
    body: JSON.stringify({
      app_id: ONESIGNAL_APP_ID,
      headings: { en: heading },
      contents: { en: content },
      data,
      ...(collapseId ? { collapse_id: collapseId } : {}),
      include_aliases: { external_id: recipients },
      target_channel: 'push',
    }),
  })

  const result = await response.json().catch(() => ({}))
  if (response.ok) {
    const deliveredCount = typeof (result as { recipients?: unknown }).recipients === 'number'
      ? ((result as { recipients?: number }).recipients ?? recipients.length)
      : recipients.length
    return { mode: 'pushed', deliveredCount, result }
  }

  console.warn('Social checkout OneSignal notification failed:', result)
  return { mode: 'failed', deliveredCount: 0, result }
}

const listBusinessNotificationRecipientIds = async (
  admin: ReturnType<typeof getAdminClient>,
  businessId: string,
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

const notifyTeamPaymentSubmitted = async ({
  admin,
  businessId,
  checkoutCode,
  customerName,
  amountLabel,
}: {
  admin: ReturnType<typeof getAdminClient>
  businessId: string
  checkoutCode: string
  customerName: string
  amountLabel: string
}) => {
  const recipientUserIds = await listBusinessNotificationRecipientIds(admin, businessId)
  if (recipientUserIds.length === 0) {
    return { skipped: true, reason: 'no-recipients' }
  }

  const customerLabel = customerName || 'A customer'
  const paymentReference = `SC-${checkoutCode}`
  const notificationPayload = {
    type: 'social_checkout_payment_submitted',
    entityType: 'payment',
    entityId: checkoutCode,
    checkoutCode,
    paymentReference,
    customerName: customerLabel,
    amount: amountLabel,
    body: `${customerLabel} submitted proof for ${paymentReference} (${amountLabel}).`,
  }

  const { error } = await admin
    .from('collaboration_notifications')
    .insert(recipientUserIds.map((recipientUserId) => ({
      business_id: businessId,
      user_id: recipientUserId,
      actor_user_id: null,
      event_type: 'reply',
      payload: notificationPayload,
    })))

  if (error) throw error

  const push = await sendOneSignalNotification({
    recipients: recipientUserIds,
    heading: 'Payment proof submitted',
    content: `${customerLabel} paid ${amountLabel}. Review ${paymentReference}.`,
    data: notificationPayload,
    collapseId: `social-checkout-payment:${checkoutCode}`,
  })

  return { notified: recipientUserIds.length, push }
}

const getBusiness = async (admin: ReturnType<typeof getAdminClient>, businessId: string) => {
  const { data, error } = await admin
    .from('businesses')
    .select('id, name, data')
    .eq('id', businessId)
    .maybeSingle()

  if (error) throw error
  return data as DataRow | null
}

const getCheckout = async (admin: ReturnType<typeof getAdminClient>, businessId: string, checkoutCode: string) => {
  const { data, error } = await admin
    .from('social_checkouts')
    .select('id, business_id, data')
    .eq('business_id', businessId)
    .eq('id', checkoutCode)
    .maybeSingle()

  if (error) throw error
  return data as DataRow | null
}

const getOrder = async (admin: ReturnType<typeof getAdminClient>, businessId: string, orderId: string) => {
  const { data, error } = await admin
    .from('orders')
    .select('id, business_id, data')
    .eq('business_id', businessId)
    .eq('id', orderId)
    .maybeSingle()

  if (error) throw error
  return data as DataRow | null
}

const getProducts = async (admin: ReturnType<typeof getAdminClient>, businessId: string, productIds: string[]) => {
  const ids = Array.from(new Set(productIds.map((id) => id.trim()).filter(Boolean)))
  if (ids.length === 0) return new Map<string, Record<string, unknown>>()

  const { data, error } = await admin
    .from('products')
    .select('id, business_id, data')
    .eq('business_id', businessId)
    .in('id', ids)

  if (error) throw error

  return new Map(
    ((data ?? []) as DataRow[])
      .filter((row) => row.data)
      .map((row) => [row.id, row.data as Record<string, unknown>])
  )
}

const updateCheckoutData = async (
  admin: ReturnType<typeof getAdminClient>,
  row: DataRow,
  nextData: Record<string, unknown>,
) => {
  const { error } = await admin
    .from('social_checkouts')
    .update({
      data: nextData,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .eq('business_id', row.business_id)

  if (error) throw error
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' })
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !RESEND_API_KEY || !RESEND_FROM_EMAIL || !APP_BASE_URL) {
    return jsonResponse(500, { error: 'Email service is not configured.' })
  }

  try {
    const payload = await req.json().catch(() => null) as SocialCheckoutEmailPayload | null
    const type = payload?.type
    const businessId = toTrimmedString(payload?.businessId)
    const checkoutCode = toTrimmedString(payload?.checkoutCode).toUpperCase()

    if (!type || !businessId || !checkoutCode) {
      return jsonResponse(400, { error: 'Missing type, businessId, or checkoutCode.' })
    }

    const admin = getAdminClient()
    const checkoutRow = await getCheckout(admin, businessId, checkoutCode)
    if (!checkoutRow?.data) return jsonResponse(404, { error: 'Payment link not found.' })

    const checkout = checkoutRow.data
    const customerEmail = toTrimmedString(checkout.customerEmail).toLowerCase()
    if (!customerEmail || !customerEmail.includes('@')) {
      return jsonResponse(200, { skipped: true, reason: 'missing-customer-email' })
    }

    const businessRow = await getBusiness(admin, businessId)
    const businessData = businessRow?.data ?? {}
    const businessName = normalizeBusinessName(
      toTrimmedString(businessData.businessName)
      || toTrimmedString(businessRow?.name)
      || 'Fyll'
    )
    const businessLogoUrl = normalizeEmailImageUrl(businessData.businessLogo)
    const businessSlug = toTrimmedString(businessData.businessSlug)
      || toTrimmedString(businessData.slug)
      || normalizeSlug(businessName)

    let order: Record<string, unknown> | null = null
    let orderLines: OrderEmailLine[] = []
    let resolvedOrderId = ''
    if (type === 'order_created') {
      const orderId = toTrimmedString(payload?.orderId) || toTrimmedString(checkout.convertedOrderId)
      if (orderId) {
        resolvedOrderId = orderId
        const orderRow = await getOrder(admin, businessId, orderId)
        order = orderRow?.data ?? null
      }
      const productIds = toArray(order?.items).map((item) => toTrimmedString(item.productId)).filter(Boolean)
      const productsById = await getProducts(admin, businessId, productIds)
      orderLines = buildOrderEmailLines({ order, productsById })
    }

    const sentKey = type === 'payment_submitted'
      ? 'paymentSubmittedEmailSentAt'
      : type === 'payment_confirmed'
        ? 'paymentConfirmedEmailSentAt'
        : type === 'payment_rejected'
          ? 'paymentRejectedEmailSentAt'
          : 'orderCreatedEmailSentAt'

    if (toTrimmedString(checkout[sentKey])) {
      if (type !== 'order_created') {
        return jsonResponse(200, { skipped: true, reason: 'already-sent' })
      }

      const previousEmailOrderId = toTrimmedString(checkout.orderCreatedEmailOrderId)
      if (!resolvedOrderId || (previousEmailOrderId && previousEmailOrderId === resolvedOrderId)) {
        return jsonResponse(200, { skipped: true, reason: 'already-sent' })
      }
    }

    const orderNumber = toTrimmedString(order?.orderNumber)
    const orderTrackingCode = toTrimmedString(order?.customerTrackingCode)
      || toTrimmedString(order?.websiteOrderReference)
      || orderNumber
    const trackingUrl = type === 'order_created' && orderTrackingCode
      ? buildTrackingUrl({ code: orderTrackingCode, email: customerEmail, businessSlug })
      : ''
    const checkoutUrl = buildCheckoutUrl({ code: checkoutCode, businessSlug })
    const emailContent = buildEmailContent({
      type,
      customerName: toTrimmedString(checkout.customerName) || toTrimmedString(order?.customerName) || 'there',
      businessName,
      businessLogoUrl,
      checkoutCode,
      amount: Number(checkout.amount) || Number(order?.totalAmount) || 0,
      billNote: toTrimmedString(checkout.billNote) || 'No bill details provided.',
      checkoutUrl,
      orderNumber,
      trackingUrl,
      order,
      orderLines,
    })

    await sendEmail({
      toEmail: customerEmail,
      fromName: buildSenderName(businessName),
      ...emailContent,
    })

    let teamNotification: unknown = null
    if (type === 'payment_submitted') {
      try {
        teamNotification = await notifyTeamPaymentSubmitted({
          admin,
          businessId,
          checkoutCode,
          customerName: toTrimmedString(checkout.customerName),
          amountLabel: formatCurrency(Number(checkout.amount) || 0),
        })
      } catch (notificationError) {
        console.warn(
          'Social checkout team notification failed:',
          notificationError instanceof Error ? notificationError.message : String(notificationError),
        )
      }
    }

    const nowIso = new Date().toISOString()
    await updateCheckoutData(admin, checkoutRow, {
      ...checkout,
      [sentKey]: nowIso,
      ...(type === 'order_created' && resolvedOrderId ? { orderCreatedEmailOrderId: resolvedOrderId } : {}),
      updatedAt: nowIso,
    })

    return jsonResponse(200, { ok: true, teamNotification })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Social checkout email failed:', message)
    return jsonResponse(500, { error: message })
  }
})
