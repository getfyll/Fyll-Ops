import { supabase } from '@/lib/supabase';

export type WooConnectionInput = {
  storeUrl: string;
  consumerKey: string;
  consumerSecret: string;
};

export type WooNormalizedLineItem = {
  id: string;
  productId: string;
  variationId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

export type WooNormalizedOrder = {
  externalId: string;
  orderNumber: string;
  websiteOrderReference: string;
  status: string;
  createdAt: string;
  totalAmount: number;
  subtotalAmount: number;
  discountAmount: number;
  shippingAmount: number;
  paymentMethod: string;
  customerNote: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  deliveryAddress: string;
  deliveryState: string;
  lineItems: WooNormalizedLineItem[];
};

export type WooNormalizedProduct = {
  productId: string;
  variationId: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
  imageUrl: string;
  categories: string[];
  attributes: Record<string, string>;
};

type WooSyncFunctionResponse = {
  success?: boolean;
  connected?: boolean;
  sampleCount?: number;
  fetchedCount?: number;
  orders?: WooNormalizedOrder[];
  products?: WooNormalizedProduct[];
  order?: WooNormalizedOrder | null;
  updatedStatus?: string;
  skipped?: boolean;
  reason?: string;
  debug?: {
    businessId?: string;
    matchedBusinessId?: string;
    matchedOrderBusinessId?: string;
    fyllStatus?: string;
    reference?: string;
  };
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
      // Fall through.
    }
  }

  if (context?.text) {
    try {
      const text = await context.text();
      if (text.trim()) return text.trim();
    } catch {
      // Fall through.
    }
  }

  return functionError?.message || 'WooCommerce request failed.';
};

export const testWooCommerceConnection = async (input: WooConnectionInput) => {
  const { data, error } = await supabase.functions.invoke<WooSyncFunctionResponse>('woocommerce-sync', {
    body: {
      action: 'test_connection',
      storeUrl: input.storeUrl.trim(),
      consumerKey: input.consumerKey.trim(),
      consumerSecret: input.consumerSecret.trim(),
    },
  });

  if (error) {
    throw new Error(await getFunctionErrorMessage(error));
  }

  if (!data?.success || !data.connected) {
    throw new Error(data?.error || 'WooCommerce connection failed.');
  }

  return data;
};

export const fetchWooCommerceOrders = async (
  input: WooConnectionInput & { limit?: number },
) => {
  const { data, error } = await supabase.functions.invoke<WooSyncFunctionResponse>('woocommerce-sync', {
    body: {
      action: 'fetch_orders',
      storeUrl: input.storeUrl.trim(),
      consumerKey: input.consumerKey.trim(),
      consumerSecret: input.consumerSecret.trim(),
      limit: input.limit ?? 50,
    },
  });

  if (error) {
    throw new Error(await getFunctionErrorMessage(error));
  }

  if (!data?.success) {
    throw new Error(data?.error || 'WooCommerce order fetch failed.');
  }

  return {
    fetchedCount: data.fetchedCount ?? data.orders?.length ?? 0,
    orders: data.orders ?? [],
  };
};

export const fetchWooCommerceOrder = async (
  input: WooConnectionInput & { reference: string },
) => {
  const { data, error } = await supabase.functions.invoke<WooSyncFunctionResponse>('woocommerce-sync', {
    body: {
      action: 'fetch_order',
      storeUrl: input.storeUrl.trim(),
      consumerKey: input.consumerKey.trim(),
      consumerSecret: input.consumerSecret.trim(),
      reference: input.reference.trim(),
    },
  });

  if (error) {
    throw new Error(await getFunctionErrorMessage(error));
  }

  if (!data?.success || !data.order) {
    throw new Error(data?.error || 'WooCommerce order not found.');
  }

  return data.order;
};

export const fetchWooCommerceProducts = async (
  input: WooConnectionInput & { limit?: number },
) => {
  const { data, error } = await supabase.functions.invoke<WooSyncFunctionResponse>('woocommerce-sync', {
    body: {
      action: 'fetch_products',
      storeUrl: input.storeUrl.trim(),
      consumerKey: input.consumerKey.trim(),
      consumerSecret: input.consumerSecret.trim(),
      limit: input.limit ?? 100,
    },
  });

  if (error) {
    throw new Error(await getFunctionErrorMessage(error));
  }

  if (!data?.success) {
    throw new Error(data?.error || 'WooCommerce product fetch failed.');
  }

  return {
    fetchedCount: data.fetchedCount ?? data.products?.length ?? 0,
    products: data.products ?? [],
  };
};

export const updateWooCommerceOrderStatus = async (
  input: WooConnectionInput & { reference: string; status: string },
) => {
  const { data, error } = await supabase.functions.invoke<WooSyncFunctionResponse>('woocommerce-sync', {
    body: {
      action: 'update_order_status',
      storeUrl: input.storeUrl.trim(),
      consumerKey: input.consumerKey.trim(),
      consumerSecret: input.consumerSecret.trim(),
      reference: input.reference.trim(),
      status: input.status.trim(),
    },
  });

  if (error) {
    throw new Error(await getFunctionErrorMessage(error));
  }

  if (!data?.success || !data.order) {
    throw new Error(data?.error || 'WooCommerce order status update failed.');
  }

  return {
    order: data.order,
    updatedStatus: data.updatedStatus ?? input.status.trim(),
  };
};

export const syncFyllOrderStatusToWooCommerce = async (
  input: { businessId: string; orderId: string; status: string },
) => {
  const { data, error } = await supabase.functions.invoke<WooSyncFunctionResponse>('woocommerce-sync', {
    body: {
      action: 'sync_fyll_order_status',
      businessId: input.businessId.trim(),
      orderId: input.orderId.trim(),
      status: input.status.trim(),
    },
  });

  if (error) {
    throw new Error(await getFunctionErrorMessage(error));
  }

  if (!data?.success) {
    throw new Error(data?.error || 'WooCommerce order status sync failed.');
  }

  return {
    skipped: data.skipped === true,
    reason: data.reason ?? null,
    order: data.order ?? null,
    updatedStatus: data.updatedStatus ?? input.status.trim(),
    debug: data.debug ?? null,
  };
};
