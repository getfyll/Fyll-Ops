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
const ALLOWED_ORIGIN = sanitizeEnvValue(Deno.env.get('ALLOWED_ORIGIN')) || '*'

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type WooSyncAction = 'test_connection' | 'fetch_orders' | 'fetch_order' | 'fetch_products' | 'update_order_status' | 'sync_fyll_order_status' | 'create_fyll_order'

type WooSyncPayload = {
  action?: WooSyncAction
  storeUrl?: string
  consumerKey?: string
  consumerSecret?: string
  limit?: number
  reference?: string
  status?: string
  businessId?: string
  orderId?: string
  silentImport?: boolean
}

type BusinessRow = {
  id: string
  name?: string | null
  data?: Record<string, unknown> | null
}

type OrderRow = {
  id: string
  business_id: string
  data?: Record<string, unknown> | null
}

type ProductRow = {
  id: string
  business_id: string
  data?: Record<string, unknown> | null
}

type SettingsRow = {
  data?: Record<string, unknown> | null
}

type WooOrderLine = {
  id?: number
  product_id?: number
  variation_id?: number
  name?: string
  quantity?: number
  total?: string
  price?: number
  sku?: string
}

type WooOrder = {
  id?: number
  number?: string
  status?: string
  date_created?: string
  total?: string
  subtotal?: string
  discount_total?: string
  shipping_total?: string
  payment_method_title?: string
  customer_note?: string
  meta_data?: Array<{
    key?: string
    value?: unknown
  }>
  billing?: {
    first_name?: string
    last_name?: string
    email?: string
    phone?: string
    address_1?: string
    address_2?: string
    city?: string
    state?: string
  }
  shipping?: {
    first_name?: string
    last_name?: string
    address_1?: string
    address_2?: string
    city?: string
    state?: string
  }
  line_items?: WooOrderLine[]
}

type WooProductAttribute = {
  name?: string
  option?: string
  options?: string[]
  variation?: boolean
}

type WooProductImage = {
  src?: string
}

type WooProductCategory = {
  name?: string
}

type WooProduct = {
  id?: number
  name?: string
  type?: string
  status?: string
  sku?: string
  price?: string
  regular_price?: string
  sale_price?: string
  stock_quantity?: number | null
  manage_stock?: boolean
  categories?: WooProductCategory[]
  images?: WooProductImage[]
  attributes?: WooProductAttribute[]
  variations?: number[]
}

type WooProductVariation = {
  id?: number
  sku?: string
  price?: string
  regular_price?: string
  sale_price?: string
  stock_quantity?: number | null
  manage_stock?: boolean
  image?: WooProductImage | null
  attributes?: WooProductAttribute[]
}

type NormalizedWooLineItem = {
  id: string
  productId: string
  variationId: string
  sku: string
  name: string
  quantity: number
  unitPrice: number
  total: number
}

type NormalizedWooProduct = {
  productId: string
  variationId: string
  name: string
  sku: string
  price: number
  stock: number
  imageUrl: string
  categories: string[]
  attributes: Record<string, string>
}

type NormalizedWooOrder = {
  externalId: string
  orderNumber: string
  websiteOrderReference: string
  status: string
  createdAt: string
  totalAmount: number
  subtotalAmount: number
  discountAmount: number
  shippingAmount: number
  paymentMethod: string
  customerNote: string
  customerName: string
  customerEmail: string
  customerPhone: string
  metadataValues: string[]
  deliveryAddress: string
  deliveryState: string
  lineItems: NormalizedWooLineItem[]
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

const getBusinessIdAliases = (businessId: string) => {
  const trimmed = businessId.trim()
  if (!trimmed) return [businessId]

  const aliases = new Set<string>([trimmed])
  const withoutPrefix = trimmed.toLowerCase().startsWith('biz-') ? trimmed.slice(4) : trimmed
  const compact = withoutPrefix.replace(/-/g, '')

  if (/^[a-fA-F0-9]{32}$/.test(compact)) {
    aliases.add(`biz-${compact.toLowerCase()}`)
    aliases.add(formatCompactUuid(compact))
  }

  return Array.from(aliases)
}

const formatCompactUuid = (compact: string) => [
  compact.slice(0, 8),
  compact.slice(8, 12),
  compact.slice(12, 16),
  compact.slice(16, 20),
  compact.slice(20),
].join('-').toLowerCase()

const getBearerToken = (req: Request) => {
  const authHeader = req.headers.get('Authorization') ?? ''
  const [scheme, token] = authHeader.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null
  return token
}

const toNumber = (value: unknown) => {
  const parsed = Number.parseFloat(String(value ?? '').trim())
  return Number.isFinite(parsed) ? parsed : 0
}

const titleCase = (value: string) => value
  .split(/\s+/)
  .filter(Boolean)
  .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
  .join(' ')

const normalizeWooStatus = (value: string | undefined) => {
  const normalized = (value ?? '').trim().toLowerCase().replace(/[-_]+/g, ' ')
  if (!normalized) return 'Processing'
  if (normalized === 'on hold') return 'On Hold'
  return titleCase(normalized)
}

const normalizeStoreUrl = (value: string | undefined) => {
  const trimmed = (value ?? '').trim()
  if (!trimmed) throw new Error('Store URL is required.')
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  const url = new URL(withProtocol)
  url.pathname = ''
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/+$/, '')
}

const normalizeCredential = (value: string | undefined, label: string) => {
  const trimmed = (value ?? '').trim()
  if (!trimmed) throw new Error(`${label} is required.`)
  return trimmed
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

const requestWoo = async (
  storeUrl: string,
  consumerKey: string,
  consumerSecret: string,
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  params: Record<string, string | number>,
  body?: Record<string, unknown>,
) => {
  const response = await fetch(buildWooApiUrl(storeUrl, path, params, consumerKey, consumerSecret), {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    let detail = text.trim()
    try {
      const parsed = JSON.parse(text) as { message?: unknown; code?: unknown }
      const message = typeof parsed.message === 'string' ? parsed.message.trim() : ''
      const code = typeof parsed.code === 'string' ? parsed.code.trim() : ''
      detail = [message, code ? `(${code})` : ''].filter(Boolean).join(' ')
    } catch {
      // Keep Woo's plain-text response when it is not JSON.
    }
    throw new Error(detail || `WooCommerce request failed with status ${response.status}.`)
  }

  return response.json()
}

const fetchWoo = async (
  storeUrl: string,
  consumerKey: string,
  consumerSecret: string,
  path: string,
  params: Record<string, string | number>,
) => requestWoo(storeUrl, consumerKey, consumerSecret, 'GET', path, params)

const updateWoo = async (
  storeUrl: string,
  consumerKey: string,
  consumerSecret: string,
  path: string,
  params: Record<string, string | number>,
  body: Record<string, unknown>,
) => requestWoo(storeUrl, consumerKey, consumerSecret, 'PUT', path, params, body)

const createWoo = async (
  storeUrl: string,
  consumerKey: string,
  consumerSecret: string,
  path: string,
  body: Record<string, unknown>,
) => requestWoo(storeUrl, consumerKey, consumerSecret, 'POST', path, {}, body)

const normalizeWooStatusSlug = (value: string | undefined) => {
  const normalized = (value ?? '').trim().toLowerCase().replace(/[_\s]+/g, '-')
  if (!normalized) throw new Error('WooCommerce status is required.')
  return normalized
}

const toTrimmedString = (value: unknown) => (
  typeof value === 'string' ? value.trim() : ''
)

const toWooId = (...values: unknown[]) => {
  for (const value of values) {
    const normalized = toTrimmedString(value).replace(/^woo-(?:product|variant)-/i, '')
    const parsed = Number(normalized)
    if (Number.isInteger(parsed) && parsed > 0) return parsed
  }
  return 0
}

const splitCustomerName = (value: unknown) => {
  const parts = toTrimmedString(value).split(/\s+/).filter(Boolean)
  return {
    firstName: parts.shift() ?? '',
    lastName: parts.join(' '),
  }
}

const normalizeCatalogIdentity = (value: unknown) => (
  toTrimmedString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
)

const findConfiguredWooStatusSlug = async ({
  admin,
  businessId,
  fyllStatusName,
}: {
  admin: ReturnType<typeof getAdminClient>
  businessId: string
  fyllStatusName: string
}) => {
  if (!businessId || !fyllStatusName.trim()) return ''

  const businessIds = getBusinessIdAliases(businessId)

  let query = admin
    .from('order_statuses')
    .select('data,business_id')

  query = businessIds.length === 1
    ? query.eq('business_id', businessIds[0])
    : query.in('business_id', businessIds)

  const { data, error } = await query

  if (error) throw error

  const normalizedStatusName = fyllStatusName.trim().toLowerCase()
  const matched = ((data ?? []) as SettingsRow[])
    .map((row) => row.data ?? {})
    .find((entry) => toTrimmedString(entry.name).toLowerCase() === normalizedStatusName)

  if (matched?.wooCommerceStatusSlug) {
    return normalizeWooStatusSlug(String(matched.wooCommerceStatusSlug))
  }

  const normalizedTrackingStage = toTrimmedString(matched?.trackingStage).toLowerCase()
  const fallbackKey = `${normalizedStatusName} ${normalizedTrackingStage}`
  if (/refund/.test(fallbackKey)) return 'refunded'
  if (/reject|fail/.test(fallbackKey)) return 'failed'
  if (/cancel/.test(fallbackKey)) return 'cancelled'
  if (/deliver|complete/.test(fallbackKey)) return 'completed'
  if (/hold/.test(fallbackKey)) return 'on-hold'
  if (/processing|prepar|verified|payment confirmed|paid/.test(fallbackKey)) return 'processing'
  if (/pending|awaiting/.test(fallbackKey)) return 'pending'
  return ''
}

const findWooOrderByReference = async (
  storeUrl: string,
  consumerKey: string,
  consumerSecret: string,
  rawReference: string,
) => {
  const reference = normalizeWooLookupValue(rawReference)
  if (!reference) {
    throw new Error('WooCommerce order reference is required.')
  }

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

      if (directOrder && (directOrder.id || directOrder.number)) {
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

    if (!Array.isArray(batch) || batch.length === 0) {
      break
    }

    const matchedOrder = batch.find((order) => {
      const candidates = [
        normalizeWooLookupValue(String(order.number ?? '')),
        normalizeWooLookupValue(String(order.id ?? '')),
      ]
      return candidates.includes(reference)
    })

    if (matchedOrder) {
      return matchedOrder
    }

    if (batch.length < perPage) {
      break
    }
  }

  return null
}

const getCustomerName = (order: WooOrder) => {
  const first = order.billing?.first_name?.trim() || order.shipping?.first_name?.trim() || ''
  const last = order.billing?.last_name?.trim() || order.shipping?.last_name?.trim() || ''
  const combined = `${first} ${last}`.trim()
  return combined || 'WooCommerce Customer'
}

const getDeliveryAddress = (order: WooOrder) => {
  const rawParts = [
    order.shipping?.address_1,
    order.shipping?.address_2,
    order.shipping?.city,
  ]
  const parts = rawParts.map((value) => value?.trim()).filter(Boolean)
  if (parts.length > 0) return parts.join(', ')

  const billingParts = [
    order.billing?.address_1,
    order.billing?.address_2,
    order.billing?.city,
  ].map((value) => value?.trim()).filter(Boolean)

  return billingParts.join(', ')
}

const normalizeLineItems = (lineItems: WooOrderLine[] | undefined): NormalizedWooLineItem[] => (
  (lineItems ?? [])
    .map((item, index) => {
      const quantity = Math.max(1, Number(item.quantity ?? 1))
      const total = toNumber(item.total)
      const unitPriceFromTotal = quantity > 0 ? total / quantity : total
      const unitPrice = item.price && Number.isFinite(item.price) ? Number(item.price) : unitPriceFromTotal
      const productKey = item.product_id ? `woo-product-${item.product_id}` : `woo-product-${String(item.name ?? index).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || index}`
      const variationKey = item.variation_id ? `woo-variant-${item.variation_id}` : `${productKey}-default`

      return {
        id: String(item.id ?? `${productKey}-${index}`),
        productId: productKey,
        variationId: variationKey,
        sku: String(item.sku ?? '').trim(),
        name: String(item.name ?? 'WooCommerce Item').trim() || 'WooCommerce Item',
        quantity,
        unitPrice,
        total,
      }
    })
    .filter((item) => item.quantity > 0)
)

const normalizeWooProductAttributes = (attributes: WooProductAttribute[] | undefined) => {
  const normalized: Record<string, string> = {}

  ;(attributes ?? []).forEach((attribute) => {
    const name = String(attribute.name ?? '').trim()
    const directOption = String(attribute.option ?? '').trim()
    const firstOption = (attribute.options ?? []).map((option) => String(option).trim()).find(Boolean) ?? ''
    const value = directOption || firstOption
    if (name && value) normalized[name] = value
  })

  return normalized
}

const getWooProductPrice = (item: Pick<WooProduct | WooProductVariation, 'price' | 'sale_price' | 'regular_price'>) => (
  toNumber(item.price) || toNumber(item.sale_price) || toNumber(item.regular_price)
)

const normalizeWooProduct = (product: WooProduct): NormalizedWooProduct | null => {
  if (!product.id) return null
  const productId = `woo-product-${product.id}`
  const name = String(product.name ?? '').trim() || `WooCommerce Product ${product.id}`
  const imageUrl = product.images?.map((image) => String(image.src ?? '').trim()).find(Boolean) ?? ''
  const categories = (product.categories ?? [])
    .map((category) => String(category.name ?? '').trim())
    .filter(Boolean)

  return {
    productId,
    variationId: `${productId}-default`,
    name,
    sku: String(product.sku ?? '').trim(),
    price: getWooProductPrice(product),
    stock: Math.max(0, Number(product.stock_quantity ?? 0) || 0),
    imageUrl,
    categories: categories.length > 0 ? categories : ['WooCommerce'],
    attributes: normalizeWooProductAttributes(product.attributes),
  }
}

const normalizeWooVariation = (product: WooProduct, variation: WooProductVariation): NormalizedWooProduct | null => {
  if (!product.id || !variation.id) return null
  const productId = `woo-product-${product.id}`
  const productImageUrl = product.images?.map((image) => String(image.src ?? '').trim()).find(Boolean) ?? ''
  const imageUrl = String(variation.image?.src ?? '').trim() || productImageUrl
  const categories = (product.categories ?? [])
    .map((category) => String(category.name ?? '').trim())
    .filter(Boolean)

  return {
    productId,
    variationId: `woo-variant-${variation.id}`,
    name: String(product.name ?? '').trim() || `WooCommerce Product ${product.id}`,
    sku: String(variation.sku ?? product.sku ?? '').trim(),
    price: getWooProductPrice(variation) || getWooProductPrice(product),
    stock: Math.max(0, Number(variation.stock_quantity ?? 0) || 0),
    imageUrl,
    categories: categories.length > 0 ? categories : ['WooCommerce'],
    attributes: normalizeWooProductAttributes(variation.attributes),
  }
}

const fetchWooProductsCatalog = async (
  storeUrl: string,
  consumerKey: string,
  consumerSecret: string,
  requestedLimit: number,
) => {
  const perPage = Math.min(50, requestedLimit)
  const products: WooProduct[] = []
  let page = 1

  while (products.length < requestedLimit) {
    const batch = await fetchWoo(
      storeUrl,
      consumerKey,
      consumerSecret,
      '/wp-json/wc/v3/products',
      {
        per_page: perPage,
        page,
        status: 'publish',
        orderby: 'date',
        order: 'desc',
      },
    ) as WooProduct[]

    if (!Array.isArray(batch) || batch.length === 0) break

    products.push(...batch)

    if (batch.length < perPage) break
    page += 1
  }

  const normalized: NormalizedWooProduct[] = []

  for (const product of products.slice(0, requestedLimit)) {
    const variationIds = product.type === 'variable' ? product.variations ?? [] : []

    if (variationIds.length === 0) {
      const normalizedProduct = normalizeWooProduct(product)
      if (normalizedProduct) normalized.push(normalizedProduct)
      continue
    }

    const variations = await fetchWoo(
      storeUrl,
      consumerKey,
      consumerSecret,
      `/wp-json/wc/v3/products/${product.id}/variations`,
      {
        per_page: Math.min(100, Math.max(1, variationIds.length)),
        page: 1,
      },
    ) as WooProductVariation[]

    const normalizedVariations = (Array.isArray(variations) ? variations : [])
      .map((variation) => normalizeWooVariation(product, variation))
      .filter((item): item is NormalizedWooProduct => Boolean(item))

    if (normalizedVariations.length > 0) {
      normalized.push(...normalizedVariations)
    } else {
      const normalizedProduct = normalizeWooProduct(product)
      if (normalizedProduct) normalized.push(normalizedProduct)
    }
  }

  return normalized
}

const normalizeWooOrder = (order: WooOrder): NormalizedWooOrder => {
  const lineItems = normalizeLineItems(order.line_items)
  const fallbackSubtotal = lineItems.reduce((sum, item) => sum + item.total, 0)
  const subtotalAmount = toNumber(order.subtotal) || fallbackSubtotal
  const totalAmount = toNumber(order.total) || subtotalAmount

  return {
    externalId: String(order.id ?? ''),
    orderNumber: String(order.number ?? order.id ?? '').trim(),
    websiteOrderReference: String(order.number ?? order.id ?? '').trim(),
    status: normalizeWooStatus(order.status),
    createdAt: order.date_created ? new Date(order.date_created).toISOString() : new Date().toISOString(),
    totalAmount,
    subtotalAmount,
    discountAmount: toNumber(order.discount_total),
    shippingAmount: toNumber(order.shipping_total),
    paymentMethod: String(order.payment_method_title ?? '').trim(),
    customerNote: String(order.customer_note ?? '').trim(),
    customerName: getCustomerName(order),
    customerEmail: String(order.billing?.email ?? '').trim(),
    customerPhone: String(order.billing?.phone ?? '').trim(),
    metadataValues: (order.meta_data ?? [])
      .flatMap((entry) => {
        const value = entry?.value
        if (typeof value === 'string' || typeof value === 'number') return [String(value).trim()]
        if (Array.isArray(value)) {
          return value
            .filter((item) => typeof item === 'string' || typeof item === 'number')
            .map((item) => String(item).trim())
        }
        return []
      })
      .filter(Boolean),
    deliveryAddress: getDeliveryAddress(order),
    deliveryState: String(order.shipping?.state ?? order.billing?.state ?? '').trim(),
    lineItems,
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' })
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(500, { error: 'Supabase function secrets are missing.' })
  }

  try {
    const bearer = getBearerToken(req)
    if (!bearer) {
      return jsonResponse(401, { error: 'Missing bearer token.' })
    }

    const admin = getAdminClient()
    const { data: authData, error: authError } = await admin.auth.getUser(bearer)
    if (authError || !authData.user?.id) {
      return jsonResponse(401, { error: 'Unauthorized.' })
    }

    const payload = await req.json() as WooSyncPayload
    const action = payload.action

    if (action === 'create_fyll_order') {
      const businessId = String(payload.businessId ?? '').trim()
      const orderId = String(payload.orderId ?? '').trim()
      const silentImport = payload.silentImport === true
      if (!businessId || !orderId) {
        return jsonResponse(400, { error: 'Business ID and order ID are required.' })
      }

      const businessIds = getBusinessIdAliases(businessId)
      let businessQuery = admin.from('businesses').select('id,name,data')
      let orderQuery = admin.from('orders').select('id,business_id,data').eq('id', orderId)
      businessQuery = businessIds.length === 1 ? businessQuery.eq('id', businessIds[0]) : businessQuery.in('id', businessIds)
      orderQuery = businessIds.length === 1 ? orderQuery.eq('business_id', businessIds[0]) : orderQuery.in('business_id', businessIds)

      const [{ data: businessRows, error: businessError }, { data: orderRows, error: orderError }] = await Promise.all([
        businessQuery,
        orderQuery,
      ])
      if (businessError) throw businessError
      if (orderError) throw orderError

      const business = ((businessRows ?? []) as BusinessRow[])[0] ?? null
      const order = ((orderRows ?? []) as OrderRow[])[0] ?? null
      if (!business) return jsonResponse(404, { error: 'Business was not found.' })
      if (!order) return jsonResponse(404, { error: 'Order was not found.' })

      const businessData = (business.data ?? {}) as Record<string, unknown>
      if (businessData.woocommerceEnabled !== true) {
        return jsonResponse(200, { success: true, skipped: true, reason: 'woocommerce-disabled' })
      }

      const orderData = (order.data ?? {}) as Record<string, unknown>
      const existingReference = toTrimmedString(orderData.websiteOrderReference)
      if (existingReference) {
        return jsonResponse(200, {
          success: true,
          skipped: true,
          reason: 'already-linked',
          websiteOrderReference: existingReference,
        })
      }

      const storeUrl = normalizeStoreUrl(String(businessData.woocommerceStoreUrl ?? ''))
      const consumerKey = normalizeCredential(String(businessData.woocommerceConsumerKey ?? ''), 'Consumer key')
      const consumerSecret = normalizeCredential(String(businessData.woocommerceConsumerSecret ?? ''), 'Consumer secret')

      // Idempotency check: recover a previously-created Woo order if Fyll did
      // not get to save its reference after the remote request succeeded.
      const recentWooOrders = await fetchWoo(storeUrl, consumerKey, consumerSecret, '/wp-json/wc/v3/orders', {
        per_page: 100,
        page: 1,
        orderby: 'date',
        order: 'desc',
      }) as WooOrder[]
      const duplicate = (Array.isArray(recentWooOrders) ? recentWooOrders : []).find((wooOrder) => (
        (wooOrder.meta_data ?? []).some((meta) => meta.key === '_fyll_order_id' && String(meta.value ?? '') === order.id)
      ))

      if (duplicate?.id) {
        const customerEmail = toTrimmedString(orderData.customerEmail)
        let recoveredOrder = duplicate
        let emailAttachWarning = ''
        if (customerEmail && toTrimmedString(duplicate.billing?.email).toLowerCase() !== customerEmail.toLowerCase()) {
          try {
            recoveredOrder = await updateWoo(
              storeUrl,
              consumerKey,
              consumerSecret,
              `/wp-json/wc/v3/orders/${duplicate.id}`,
              {},
              {
                billing: { email: customerEmail },
              },
            ) as WooOrder
          } catch (emailError) {
            emailAttachWarning = emailError instanceof Error ? emailError.message : 'Could not attach the customer email.'
            console.error('WooCommerce order recovered, but customer email attachment failed:', emailAttachWarning)
          }
        }
        const recoveredReference = String(recoveredOrder.number ?? recoveredOrder.id)
        const recoveredData = {
          ...orderData,
          websiteOrderReference: recoveredReference,
          updatedAt: new Date().toISOString(),
        }
        const { error: recoverError } = await admin.from('orders').update({ data: recoveredData }).eq('id', order.id)
        if (recoverError) throw recoverError
        return jsonResponse(200, {
          success: true,
          skipped: true,
          reason: 'recovered-existing-order',
          websiteOrderReference: recoveredReference,
          order: normalizeWooOrder(recoveredOrder),
          warning: emailAttachWarning || undefined,
        })
      }

      const rawItems = Array.isArray(orderData.items) ? orderData.items as Record<string, unknown>[] : []
      const productIds = Array.from(new Set(rawItems.map((item) => toTrimmedString(item.productId)).filter(Boolean)))
      let productRows: ProductRow[] = []
      if (productIds.length > 0) {
        let productQuery = admin.from('products').select('id,business_id,data').in('id', productIds)
        productQuery = businessIds.length === 1 ? productQuery.eq('business_id', businessIds[0]) : productQuery.in('business_id', businessIds)
        const { data, error } = await productQuery
        if (error) throw error
        productRows = (data ?? []) as ProductRow[]
      }
      const productsById = new Map(productRows.map((row) => [row.id, row.data ?? {}]))

      const needsCatalogRecovery = rawItems.some((item) => {
        const product = productsById.get(toTrimmedString(item.productId))
        if (!product) return false
        const variants = Array.isArray(product.variants) ? product.variants as Record<string, unknown>[] : []
        const variant = variants.find((candidate) => toTrimmedString(candidate.id) === toTrimmedString(item.variantId)) ?? variants[0]
        return !toWooId(
          variant?.wooCommerceProductId,
          product.wooCommerceProductId,
          product.sourceProductId,
          product.websiteProductId,
        )
      })
      const recoveryCatalog = needsCatalogRecovery
        ? await fetchWooProductsCatalog(storeUrl, consumerKey, consumerSecret, 300)
        : []
      const recoveredLinks = new Map<string, { productId: number; variationId: number }>()

      let lineItems = rawItems.map((item) => {
        const productId = toTrimmedString(item.productId)
        const variantId = toTrimmedString(item.variantId)
        const product = productsById.get(productId)
        if (!product) throw new Error(`Product ${productId || 'unknown'} is not available for WooCommerce sync.`)
        const variants = Array.isArray(product.variants) ? product.variants as Record<string, unknown>[] : []
        const variant = variants.find((candidate) => toTrimmedString(candidate.id) === variantId) ?? variants[0]
        let wooProductId = toWooId(
          variant?.wooCommerceProductId,
          product.wooCommerceProductId,
          product.sourceProductId,
          product.websiteProductId,
        )
        let wooVariationId = toWooId(variant?.wooCommerceVariationId, variant?.sourceVariantId)
        if (!wooProductId) {
          const skuIdentity = normalizeCatalogIdentity(variant?.sku)
          const variantValues = variant?.variableValues && typeof variant.variableValues === 'object'
            ? Object.values(variant.variableValues as Record<string, unknown>).map(toTrimmedString).filter(Boolean).join(' ')
            : ''
          const expectedName = normalizeCatalogIdentity(`${toTrimmedString(product.name)} ${variantValues}`)
          const skuMatches = skuIdentity
            ? recoveryCatalog.filter((candidate) => normalizeCatalogIdentity(candidate.sku) === skuIdentity)
            : []
          const nameMatches = expectedName
            ? recoveryCatalog.filter((candidate) => {
              const candidateAttributes = Object.values(candidate.attributes ?? {}).join(' ')
              return normalizeCatalogIdentity(`${candidate.name} ${candidateAttributes}`) === expectedName
                || normalizeCatalogIdentity(candidate.name) === expectedName
            })
            : []
          const uniqueMatches = skuMatches.length === 1 ? skuMatches : nameMatches
          if (uniqueMatches.length === 1) {
            const recovered = uniqueMatches[0]
            wooProductId = toWooId(recovered.productId)
            wooVariationId = /^woo-variant-/i.test(recovered.variationId) ? toWooId(recovered.variationId) : 0
            if (wooProductId) recoveredLinks.set(`${productId}:${variantId}`, { productId: wooProductId, variationId: wooVariationId })
          }
        }
        if (!wooProductId) {
          const variantValues = variant?.variableValues && typeof variant.variableValues === 'object'
            ? Object.values(variant.variableValues as Record<string, unknown>).map(toTrimmedString).filter(Boolean).join(' ')
            : ''
          const itemLabel = [toTrimmedString(product.name), variantValues].filter(Boolean).join(' ')
          throw new Error(`${itemLabel || 'An ordered product'} is not linked to WooCommerce and no exact SKU or product-name match was found.`)
        }
        const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1))
        const unitPrice = Math.max(0, Number(item.unitPrice) || Number(variant?.sellingPrice) || 0)
        const availableStock = Math.max(0, Math.floor(Number(variant?.stock) || 0))
        const backorderedQuantity = Math.max(0, quantity - availableStock)
        return {
          product_id: wooProductId,
          ...(wooVariationId ? { variation_id: wooVariationId } : {}),
          quantity,
          subtotal: (unitPrice * quantity).toFixed(2),
          total: (unitPrice * quantity).toFixed(2),
          ...(backorderedQuantity > 0 ? {
            meta_data: [{ key: 'Backordered via Fyll', value: String(backorderedQuantity) }],
          } : {}),
        }
      })

      if (lineItems.length === 0) {
        return jsonResponse(400, { error: 'The Fyll order has no linked product items to send to WooCommerce.' })
      }

      if (recoveredLinks.size > 0) {
        await Promise.all(productRows.map(async (row) => {
          const productData = (row.data ?? {}) as Record<string, unknown>
          const variants = Array.isArray(productData.variants) ? productData.variants as Record<string, unknown>[] : []
          let productWooId = toTrimmedString(productData.wooCommerceProductId)
          let changed = false
          const nextVariants = variants.map((variant) => {
            const recovered = recoveredLinks.get(`${row.id}:${toTrimmedString(variant.id)}`)
            if (!recovered) return variant
            changed = true
            productWooId = String(recovered.productId)
            return {
              ...variant,
              wooCommerceProductId: String(recovered.productId),
              sourceProductId: String(recovered.productId),
              ...(recovered.variationId ? {
                wooCommerceVariationId: String(recovered.variationId),
                sourceVariantId: String(recovered.variationId),
              } : {}),
            }
          })
          if (!changed) return
          const { error } = await admin.from('products').update({
            data: {
              ...productData,
              wooCommerceProductId: productWooId,
              sourceProductId: productWooId,
              websiteProductId: productWooId,
              variants: nextVariants,
            },
          }).eq('id', row.id)
          if (error) throw error
        }))
      }

      // Standalone simple Woo products do not need a verification request.
      // Only inspect products whose Fyll link contains a real numeric
      // variation ID; this keeps linked simple-product orders fast while
      // retaining safe support for any variable products added later.
      const uniqueWooProductIds = Array.from(new Set(
        lineItems
          .filter((lineItem) => Boolean(lineItem.variation_id))
          .map((lineItem) => lineItem.product_id),
      ))
      const wooProductTypes = new Map<number, string>()
      await Promise.all(uniqueWooProductIds.map(async (wooProductId) => {
        const wooProduct = await fetchWoo(
          storeUrl,
          consumerKey,
          consumerSecret,
          `/wp-json/wc/v3/products/${wooProductId}`,
          {},
        ) as WooProduct
        wooProductTypes.set(wooProductId, toTrimmedString(wooProduct.type).toLowerCase())
      }))
      lineItems = lineItems.map((lineItem) => {
        if (wooProductTypes.get(lineItem.product_id) === 'variable') return lineItem
        const { variation_id: _ignoredVariationId, ...simpleProductLine } = lineItem
        return simpleProductLine
      })

      const customer = splitCustomerName(orderData.customerName)
      const customerEmail = toTrimmedString(orderData.customerEmail)
      const deliveryAddress = toTrimmedString(orderData.deliveryAddress)
      const deliveryState = toTrimmedString(orderData.deliveryState)
      const services = Array.isArray(orderData.services) ? orderData.services as Record<string, unknown>[] : []
      const hasBackorderedItems = lineItems.some((lineItem) => Array.isArray(lineItem.meta_data) && lineItem.meta_data.length > 0)
      const feeLines = services.map((service) => ({
        name: toTrimmedString(service.name) || 'Service',
        total: Math.max(0, Number(service.price) || 0).toFixed(2),
        tax_status: 'none',
      }))
      const additionalCharges = Math.max(0, Number(orderData.additionalCharges) || 0)
      if (additionalCharges > 0) {
        feeLines.push({
          name: toTrimmedString(orderData.additionalChargesNote) || 'Additional charge',
          total: additionalCharges.toFixed(2),
          tax_status: 'none',
        })
      }

      const wooOrderPayload: Record<string, unknown> = {
        status: 'processing',
        set_paid: true,
        payment_method: 'bacs',
        payment_method_title: toTrimmedString(orderData.paymentMethod) || 'Fyll payment',
        customer_note: toTrimmedString(orderData.customerNote),
        date_created: toTrimmedString(orderData.orderDate) || toTrimmedString(orderData.createdAt) || undefined,
        billing: {
          first_name: customer.firstName,
          last_name: customer.lastName,
          // Woo rejects an empty email as an invalid billing object. Omit the
          // field completely for silent backlog imports, then attach it after
          // creation without changing the order status.
          ...(!silentImport && customerEmail ? { email: customerEmail } : {}),
          phone: toTrimmedString(orderData.customerPhone),
          address_1: deliveryAddress,
          state: deliveryState,
          country: 'NG',
        },
        shipping: {
          first_name: customer.firstName,
          last_name: customer.lastName,
          address_1: deliveryAddress,
          state: deliveryState,
          country: 'NG',
        },
        line_items: lineItems,
        shipping_lines: Number(orderData.deliveryFee) > 0 ? [{
          method_title: 'Delivery',
          method_id: 'fyll_delivery',
          total: Math.max(0, Number(orderData.deliveryFee) || 0).toFixed(2),
        }] : [],
        fee_lines: feeLines,
        meta_data: [
          { key: '_fyll_order_id', value: order.id },
          { key: '_fyll_order_number', value: toTrimmedString(orderData.orderNumber) },
          { key: '_fyll_order_source', value: toTrimmedString(orderData.source) || 'Fyll Ops' },
          { key: '_fyll_original_order_date', value: toTrimmedString(orderData.orderDate) || toTrimmedString(orderData.createdAt) },
          { key: '_fyll_backorder_required', value: hasBackorderedItems ? 'yes' : 'no' },
          ...(silentImport ? [{ key: '_fyll_silent_import', value: 'yes' }] : []),
        ],
      }

      let createdAsBackorder = false
      let wooOrder: WooOrder
      try {
        wooOrder = await createWoo(storeUrl, consumerKey, consumerSecret, '/wp-json/wc/v3/orders', wooOrderPayload) as WooOrder
      } catch (createError) {
        const createMessage = createError instanceof Error ? createError.message : ''
        const isStockRejection = /stock|backorder|purchasable|purchaseable|out[ -]?of[ -]?stock/i.test(createMessage)
        if (!isStockRejection) throw createError

        createdAsBackorder = true
        wooOrder = await createWoo(storeUrl, consumerKey, consumerSecret, '/wp-json/wc/v3/orders', {
          ...wooOrderPayload,
          status: 'on-hold',
          set_paid: false,
          meta_data: [
            ...((wooOrderPayload.meta_data as Record<string, unknown>[]) ?? []),
            { key: '_fyll_backorder_reason', value: createMessage || 'Insufficient WooCommerce stock' },
          ],
        }) as WooOrder
      }

      if (!wooOrder.id) throw new Error('WooCommerce did not return the created order ID.')
      let emailAttachWarning = ''
      if (silentImport && customerEmail) {
        try {
          wooOrder = await updateWoo(
            storeUrl,
            consumerKey,
            consumerSecret,
            `/wp-json/wc/v3/orders/${wooOrder.id}`,
            {},
            {
              billing: { email: customerEmail },
            },
          ) as WooOrder
        } catch (emailError) {
          emailAttachWarning = emailError instanceof Error ? emailError.message : 'Could not attach the customer email.'
          console.error('WooCommerce order created, but customer email attachment failed:', emailAttachWarning)
        }
      }
      const websiteOrderReference = String(wooOrder.number ?? wooOrder.id)
      const updatedOrderData = {
        ...orderData,
        websiteOrderReference,
        updatedAt: new Date().toISOString(),
        activityLog: [
          ...(Array.isArray(orderData.activityLog) ? orderData.activityLog : []),
          {
            staffName: 'System',
            action: `Added WooCommerce order ${websiteOrderReference}${silentImport ? ' without sending a customer email' : ''}${createdAsBackorder ? ' as backorder' : ''}`,
            date: new Date().toISOString(),
          },
        ],
      }
      const { error: updateError } = await admin.from('orders').update({ data: updatedOrderData }).eq('id', order.id)
      if (updateError) throw updateError

      return jsonResponse(200, {
        success: true,
        order: normalizeWooOrder(wooOrder),
        websiteOrderReference,
        backordered: createdAsBackorder || hasBackorderedItems,
        warning: emailAttachWarning || undefined,
      })
    }

    if (action === 'sync_fyll_order_status') {
      const businessId = String(payload.businessId ?? '').trim()
      const orderId = String(payload.orderId ?? '').trim()
      const fyllStatus = String(payload.status ?? '').trim()

      if (!businessId) {
        return jsonResponse(400, { error: 'Business ID is required.' })
      }

      if (!orderId) {
        return jsonResponse(400, { error: 'Order ID is required.' })
      }

      if (!fyllStatus) {
        return jsonResponse(400, { error: 'FYLL status is required.' })
      }

      const businessIds = getBusinessIdAliases(businessId)
      let businessQuery = admin
        .from('businesses')
        .select('id,name,data')

      businessQuery = businessIds.length === 1
        ? businessQuery.eq('id', businessIds[0])
        : businessQuery.in('id', businessIds)

      let orderQuery = admin
        .from('orders')
        .select('id,business_id,data')
        .eq('id', orderId)

      orderQuery = businessIds.length === 1
        ? orderQuery.eq('business_id', businessIds[0])
        : orderQuery.in('business_id', businessIds)

      const [{ data: businessRows, error: businessError }, { data: orderRows, error: orderError }] = await Promise.all([
        businessQuery,
        orderQuery,
      ])

      if (businessError) throw businessError
      if (orderError) throw orderError

      const business = ((businessRows ?? []) as BusinessRow[])[0] ?? null
      const order = ((orderRows ?? []) as OrderRow[])[0] ?? null

      if (!business) {
        return jsonResponse(404, { error: 'Business was not found.' })
      }

      if (!order) {
        return jsonResponse(404, { error: 'Order was not found.' })
      }

      const businessData = (business.data ?? {}) as Record<string, unknown>
      const enabled = businessData.woocommerceEnabled === true
      const rawReference = toTrimmedString(order.data?.websiteOrderReference)
      const checkoutData = order.data?.fyllCheckout && typeof order.data.fyllCheckout === 'object'
        ? order.data.fyllCheckout as Record<string, unknown>
        : {}
      const checkoutReference = toTrimmedString(checkoutData.reference)
      const orderSource = toTrimmedString(order.data?.source).toLowerCase().replace(/[_-]+/g, ' ')
      const isInternalCheckoutReference = Boolean(
        rawReference
        && (
          rawReference.toLowerCase() === checkoutReference.toLowerCase()
          || (orderSource === 'fyll checkout' && /^FYL-/i.test(rawReference))
        )
      )
      const reference = isInternalCheckoutReference ? '' : rawReference

      if (!enabled) {
        return jsonResponse(200, {
          success: true,
          skipped: true,
          reason: 'woocommerce-disabled',
          debug: {
            businessId,
            matchedBusinessId: business.id,
            matchedOrderBusinessId: order.business_id,
            fyllStatus,
            reference,
          },
        })
      }

      if (!reference) {
        return jsonResponse(200, {
          success: true,
          skipped: true,
          reason: 'missing-website-order-reference',
          debug: {
            businessId,
            matchedBusinessId: business.id,
            matchedOrderBusinessId: order.business_id,
            fyllStatus,
          },
        })
      }

      const mappedStatus = await findConfiguredWooStatusSlug({
        admin,
        businessId,
        fyllStatusName: fyllStatus,
      })

      if (!mappedStatus) {
        return jsonResponse(200, {
          success: true,
          skipped: true,
          reason: 'status-not-mapped',
          debug: {
            businessId,
            matchedBusinessId: business.id,
            matchedOrderBusinessId: order.business_id,
            fyllStatus,
            reference,
          },
        })
      }

      const storeUrl = normalizeStoreUrl(String(businessData.woocommerceStoreUrl ?? ''))
      const consumerKey = normalizeCredential(String(businessData.woocommerceConsumerKey ?? ''), 'Consumer key')
      const consumerSecret = normalizeCredential(String(businessData.woocommerceConsumerSecret ?? ''), 'Consumer secret')

      const matchedOrder = await findWooOrderByReference(
        storeUrl,
        consumerKey,
        consumerSecret,
        reference,
      )

      if (!matchedOrder?.id) {
        return jsonResponse(404, { error: `WooCommerce order ${reference} was not found.` })
      }

      const updatedOrder = await updateWoo(
        storeUrl,
        consumerKey,
        consumerSecret,
        `/wp-json/wc/v3/orders/${matchedOrder.id}`,
        {},
        { status: mappedStatus },
      ) as WooOrder

      return jsonResponse(200, {
        success: true,
        order: normalizeWooOrder(updatedOrder),
        updatedStatus: mappedStatus,
        debug: {
          businessId,
          matchedBusinessId: business.id,
          matchedOrderBusinessId: order.business_id,
          fyllStatus,
          reference,
        },
      })
    }

    const storeUrl = normalizeStoreUrl(payload.storeUrl)
    const consumerKey = normalizeCredential(payload.consumerKey, 'Consumer key')
    const consumerSecret = normalizeCredential(payload.consumerSecret, 'Consumer secret')

    if (action === 'test_connection') {
      const data = await fetchWoo(
        storeUrl,
        consumerKey,
        consumerSecret,
        '/wp-json/wc/v3/orders',
        {
          per_page: 1,
          page: 1,
          orderby: 'date',
          order: 'desc',
        },
      )

      return jsonResponse(200, {
        success: true,
        connected: true,
        sampleCount: Array.isArray(data) ? data.length : 0,
      })
    }

    if (action === 'fetch_orders') {
      const requestedLimit = Math.min(300, Math.max(1, Math.floor(Number(payload.limit ?? 50))))
      const perPage = Math.min(50, requestedLimit)
      const orders: NormalizedWooOrder[] = []
      let page = 1

      while (orders.length < requestedLimit) {
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

        if (!Array.isArray(batch) || batch.length === 0) {
          break
        }

        orders.push(...batch.map(normalizeWooOrder))

        if (batch.length < perPage) {
          break
        }

        page += 1
      }

      return jsonResponse(200, {
        success: true,
        orders: orders.slice(0, requestedLimit),
        fetchedCount: Math.min(orders.length, requestedLimit),
      })
    }

    if (action === 'fetch_products') {
      const requestedLimit = Math.min(100, Math.max(1, Math.floor(Number(payload.limit ?? 100))))
      const products = await fetchWooProductsCatalog(
        storeUrl,
        consumerKey,
        consumerSecret,
        requestedLimit,
      )

      return jsonResponse(200, {
        success: true,
        products,
        fetchedCount: products.length,
      })
    }

    if (action === 'fetch_order') {
      const rawReference = String(payload.reference ?? '').trim()
      const matchedOrder = await findWooOrderByReference(
        storeUrl,
        consumerKey,
        consumerSecret,
        rawReference,
      )

      if (!matchedOrder) {
        return jsonResponse(404, { error: `WooCommerce order ${rawReference} was not found.` })
      }

      return jsonResponse(200, {
        success: true,
        order: normalizeWooOrder(matchedOrder),
      })
    }

    if (action === 'update_order_status') {
      const rawReference = String(payload.reference ?? '').trim()
      const nextStatus = normalizeWooStatusSlug(payload.status)
      const matchedOrder = await findWooOrderByReference(
        storeUrl,
        consumerKey,
        consumerSecret,
        rawReference,
      )

      if (!matchedOrder?.id) {
        return jsonResponse(404, { error: `WooCommerce order ${rawReference} was not found.` })
      }

      const updatedOrder = await updateWoo(
        storeUrl,
        consumerKey,
        consumerSecret,
        `/wp-json/wc/v3/orders/${matchedOrder.id}`,
        {},
        { status: nextStatus },
      ) as WooOrder

      return jsonResponse(200, {
        success: true,
        order: normalizeWooOrder(updatedOrder),
        updatedStatus: nextStatus,
      })
    }

    return jsonResponse(400, { error: 'Unsupported action.' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'WooCommerce sync failed.'
    return jsonResponse(500, { error: message })
  }
})
