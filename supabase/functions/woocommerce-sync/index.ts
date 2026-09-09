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

type WooSyncAction = 'test_connection' | 'fetch_orders' | 'fetch_order' | 'fetch_products' | 'update_order_status' | 'sync_fyll_order_status'

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
  method: 'GET' | 'PUT',
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
    throw new Error(text.trim() || `WooCommerce request failed with status ${response.status}.`)
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

const normalizeWooStatusSlug = (value: string | undefined) => {
  const normalized = (value ?? '').trim().toLowerCase().replace(/[_\s]+/g, '-')
  if (!normalized) throw new Error('WooCommerce status is required.')
  return normalized
}

const toTrimmedString = (value: unknown) => (
  typeof value === 'string' ? value.trim() : ''
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

  return matched?.wooCommerceStatusSlug
    ? normalizeWooStatusSlug(String(matched.wooCommerceStatusSlug))
    : ''
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
      const reference = toTrimmedString(order.data?.websiteOrderReference)

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
      const requestedLimit = Math.min(100, Math.max(1, Math.floor(Number(payload.limit ?? 50))))
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
