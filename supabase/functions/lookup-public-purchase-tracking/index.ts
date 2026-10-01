import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') ?? '').trim()
const SUPABASE_SERVICE_ROLE_KEY = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim()

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const jsonResponse = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

const toString = (value: unknown) => typeof value === 'string' ? value.trim() : ''
const normalizeCode = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '')
const normalizeEmail = (value: string) => value.toLowerCase().replace(/\s+/g, '')
const normalizeSlug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '')
const compactBusinessId = (value: string) => value.toLowerCase().replace(/^biz-/, '').replace(/-/g, '')
const storefrontReference = (id: string, data: Record<string, unknown>) => {
  const linkedOrderNumber = toString(data.linkedOrderNumber)
  const orderSuffix = linkedOrderNumber.replace(/^ORD[-_]?/i, '')
  if (orderSuffix) return `SF-${orderSuffix}`
  const rawReference = toString(data.sourceOrderId) || id
  if (/^ORD[-_]?/i.test(rawReference)) return `SF-${rawReference.replace(/^ORD[-_]?/i, '')}`
  if (/^SF[-_]?/i.test(rawReference)) return rawReference.toUpperCase()
  return `SF-${rawReference.replace(/[^a-z0-9]/gi, '').slice(0, 8).toUpperCase()}`
}

type CheckoutRow = {
  id: string
  business_id: string
  data: Record<string, unknown>
  created_at: string
  updated_at: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' })
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return jsonResponse(500, { error: 'Tracking service is not configured.' })

  try {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null
    const trackingCode = toString(body?.trackingCode).toUpperCase()
    const customerEmail = normalizeEmail(toString(body?.email))
    const businessSlug = toString(body?.businessSlug)
    if (!trackingCode || !customerEmail) return jsonResponse(400, { error: 'Tracking code and email are required.' })

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    })

    const orderLookup = async (code: string, slug: string | null) => {
      const { data, error } = await admin.rpc('lookup_public_order_tracking', {
        tracking_code_input: code,
        email_input: customerEmail,
        business_slug_input: slug,
      })
      if (error) throw error
      return data && typeof data === 'object' ? data as Record<string, unknown> : null
    }

    let orderResult = await orderLookup(trackingCode, businessSlug || null)
    if (!orderResult && normalizeCode(trackingCode).startsWith('sf')) {
      const { data: paymentRows, error: paymentError } = await admin
        .from('payments')
        .select('id,business_id,data,created_at,updated_at')
        .ilike('data->>customerEmail', customerEmail)
      if (paymentError) throw paymentError

      const storefrontPayment = (paymentRows ?? [])
        .filter((row: { id?: string; data?: Record<string, unknown> | null }) => {
          const paymentData = row.data ?? {}
          return toString(paymentData.source).toLowerCase() === 'storefront'
            && normalizeCode(storefrontReference(toString(row.id), paymentData)) === normalizeCode(trackingCode)
        })
        .sort((a: { updated_at?: string; created_at?: string }, b: { updated_at?: string; created_at?: string }) => (
          toString(b.updated_at || b.created_at).localeCompare(toString(a.updated_at || a.created_at))
        ))[0] as { id: string; business_id: string; data: Record<string, unknown> } | undefined

      if (storefrontPayment) {
        const { data: storefrontBusinesses, error: storefrontBusinessError } = await admin
          .from('businesses')
          .select('id,name,data,created_at')
        if (storefrontBusinessError) throw storefrontBusinessError
        const storefrontBusiness = (storefrontBusinesses ?? [])
          .filter((row: { id?: string }) => compactBusinessId(toString(row.id)) === compactBusinessId(storefrontPayment.business_id))
          .sort((a: { created_at?: string }, b: { created_at?: string }) => toString(b.created_at).localeCompare(toString(a.created_at)))[0]
        const storefrontBusinessData = storefrontBusiness?.data && typeof storefrontBusiness.data === 'object'
          ? storefrontBusiness.data as Record<string, unknown>
          : {}
        const storefrontBusinessName = toString(storefrontBusinessData.businessName) || toString(storefrontBusiness?.name)
        const storefrontSlug = toString(storefrontBusinessData.businessSlug) || storefrontBusinessName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
        const slugMatches = !businessSlug
          || normalizeSlug(businessSlug) === normalizeSlug(storefrontSlug)
          || normalizeSlug(businessSlug) === normalizeSlug(storefrontBusinessName)

        if (slugMatches) {
          const paymentData = storefrontPayment.data
          const linkedOrderId = toString(paymentData.linkedOrderId)
          const linkedOrderNumber = toString(paymentData.linkedOrderNumber)
          const sourceOrderId = toString(paymentData.sourceOrderId)
          let linkedOrder: { id: string; data: Record<string, unknown> } | null = null

          if (linkedOrderId) {
            const { data, error } = await admin.from('orders').select('id,data').eq('id', linkedOrderId).maybeSingle()
            if (error) throw error
            linkedOrder = data as { id: string; data: Record<string, unknown> } | null
          }

          if (!linkedOrder) {
            const { data: customerOrders, error: customerOrdersError } = await admin
              .from('orders')
              .select('id,business_id,data')
              .ilike('data->>customerEmail', customerEmail)
            if (customerOrdersError) throw customerOrdersError
            linkedOrder = (customerOrders ?? []).find((row: { id?: string; business_id?: string; data?: Record<string, unknown> | null }) => {
              if (compactBusinessId(toString(row.business_id)) !== compactBusinessId(storefrontPayment.business_id)) return false
              const orderData = row.data ?? {}
              return [
                toString(row.id),
                toString(orderData.orderNumber),
                toString(orderData.websiteOrderReference),
                toString((orderData.fyllCheckout as Record<string, unknown> | undefined)?.reference),
              ].filter(Boolean).some((value) => [linkedOrderId, linkedOrderNumber, sourceOrderId].includes(value))
            }) as { id: string; data: Record<string, unknown> } | undefined ?? null
          }

          if (linkedOrder?.data && normalizeEmail(toString(linkedOrder.data.customerEmail)) === customerEmail) {
            const lookupCode = toString(linkedOrder.data.customerTrackingCode)
              || toString(linkedOrder.data.orderNumber)
              || toString(linkedOrder.data.websiteOrderReference)
              || linkedOrder.id
            orderResult = await orderLookup(lookupCode, storefrontSlug || null)
          }
        }
      }
    }
    const normalizedTrackingCode = normalizeCode(trackingCode).replace(/^sc/, '')
    const checkoutCodeCandidates = Array.from(new Set([
      trackingCode.replace(/^SC[-_]?/i, ''),
      normalizedTrackingCode.toUpperCase(),
    ].filter(Boolean)))

    let checkoutRow: CheckoutRow | null = null
    for (const candidate of checkoutCodeCandidates) {
      const { data, error } = await admin
        .from('social_checkouts')
        .select('id,business_id,data,created_at,updated_at')
        .eq('id', candidate)
        .maybeSingle()
      if (error) throw error
      if (data) {
        checkoutRow = data as CheckoutRow
        break
      }
    }

    if (!checkoutRow && orderResult) {
      const resultOrder = orderResult.order && typeof orderResult.order === 'object'
        ? orderResult.order as Record<string, unknown>
        : null
      const orderId = toString(resultOrder?.id)
      if (orderId) {
        const { data, error } = await admin
          .from('social_checkouts')
          .select('id,business_id,data,created_at,updated_at')
          .eq('data->>convertedOrderId', orderId)
          .limit(1)
          .maybeSingle()
        if (error) throw error
        checkoutRow = data as CheckoutRow | null
      }
    }

    if (!checkoutRow) {
      if (!orderResult) return jsonResponse(200, null)
      const resultBusinessId = toString(orderResult.businessId)
      if (!resultBusinessId) return jsonResponse(200, orderResult)
      const { data: orderBusinesses, error: orderBusinessError } = await admin
        .from('businesses')
        .select('id,data,created_at')
      if (orderBusinessError) throw orderBusinessError
      const orderBusiness = (orderBusinesses ?? [])
        .filter((row: { id?: string }) => compactBusinessId(toString(row.id)) === compactBusinessId(resultBusinessId))
        .sort((a: { created_at?: string }, b: { created_at?: string }) => toString(b.created_at).localeCompare(toString(a.created_at)))[0]
      const orderBusinessData = orderBusiness?.data && typeof orderBusiness.data === 'object'
        ? orderBusiness.data as Record<string, unknown>
        : {}
      return jsonResponse(200, {
        ...orderResult,
        businessPhone: toString(orderBusinessData.businessPhone) || null,
      })
    }
    const checkout = checkoutRow.data ?? {}
    if (normalizeEmail(toString(checkout.customerEmail)) !== customerEmail) return jsonResponse(200, orderResult)

    const { data: businesses, error: businessError } = await admin
      .from('businesses')
      .select('id,name,data,created_at')
    if (businessError) throw businessError
    const business = (businesses ?? [])
      .filter((row: { id?: string }) => compactBusinessId(toString(row.id)) === compactBusinessId(checkoutRow?.business_id ?? ''))
      .sort((a: { created_at?: string }, b: { created_at?: string }) => toString(b.created_at).localeCompare(toString(a.created_at)))[0]
    const businessData = business?.data && typeof business.data === 'object' ? business.data as Record<string, unknown> : {}
    const businessName = toString(businessData.businessName) || toString(business?.name) || 'Fyll'
    const resolvedSlug = toString(businessData.businessSlug) || businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    if (businessSlug && normalizeSlug(businessSlug) !== normalizeSlug(resolvedSlug) && normalizeSlug(businessSlug) !== normalizeSlug(businessName)) {
      return jsonResponse(200, orderResult)
    }

    const convertedOrderId = toString(checkout.convertedOrderId)
    if (!orderResult && convertedOrderId) {
      const { data: linkedOrder, error: orderError } = await admin
        .from('orders')
        .select('id,data')
        .eq('id', convertedOrderId)
        .maybeSingle()
      if (orderError) throw orderError
      const linkedOrderData = linkedOrder?.data && typeof linkedOrder.data === 'object'
        ? linkedOrder.data as Record<string, unknown>
        : null
      if (linkedOrderData && normalizeEmail(toString(linkedOrderData.customerEmail)) === customerEmail) {
        const linkedCode = toString(linkedOrderData.customerTrackingCode)
          || toString(linkedOrderData.orderNumber)
          || toString(linkedOrderData.websiteOrderReference)
          || convertedOrderId
        orderResult = await orderLookup(linkedCode, resolvedSlug)
      }
    }

    const expiresAt = toString(checkout.expiresAt)
    const storedStatus = toString(checkout.status) || 'awaiting_payment'
    const status = storedStatus === 'awaiting_payment' && expiresAt && new Date(expiresAt).getTime() < Date.now()
      ? 'expired'
      : storedStatus
    const socialCheckout = {
      code: checkoutRow.id,
      status,
      amount: Number(checkout.amount) || 0,
      billNote: toString(checkout.billNote),
      customerName: toString(checkout.customerName),
      customerEmail: toString(checkout.customerEmail),
      deliveryAddress: toString(checkout.deliveryAddress),
      deliveryState: toString(checkout.deliveryState),
      submittedAt: toString(checkout.submittedAt) || null,
      reviewedAt: toString(checkout.reviewedAt) || null,
      convertedOrderId: convertedOrderId || null,
      createdAt: toString(checkout.createdAt) || checkoutRow.created_at,
      updatedAt: toString(checkout.updatedAt) || checkoutRow.updated_at,
      activityLog: Array.isArray(checkout.activityLog) ? checkout.activityLog : [],
    }

    if (orderResult) return jsonResponse(200, {
      ...orderResult,
      businessPhone: toString(businessData.businessPhone) || null,
      socialCheckout,
    })
    return jsonResponse(200, {
      businessId: checkoutRow.business_id,
      businessSlug: resolvedSlug,
      businessName,
      businessLogo: toString(businessData.businessLogo) || null,
      businessPhone: toString(businessData.businessPhone) || null,
      businessWebsite: toString(businessData.businessWebsite) || null,
      order: null,
      socialCheckout,
      products: [],
      orderStatuses: [],
      orderTimelineSettings: null,
    })
  } catch (error) {
    console.error('Public purchase tracking lookup failed:', error)
    return jsonResponse(500, { error: 'Tracking is temporarily unavailable.' })
  }
})
