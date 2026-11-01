// Global search over what is already loaded in the app: orders, customers, products and the app's pages.
// Pure functions (no React), so the matching can be tested.

export type SearchOrder = {
  id: string;
  orderNumber?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  websiteOrderReference?: string;
  customerTrackingCode?: string;
  status?: string;
  totalAmount?: number;
  createdAt?: string;
};
export type SearchCustomer = { id: string; fullName?: string; phone?: string; email?: string };
export type SearchProduct = { id: string; name?: string; categories?: string[]; variants?: { sku?: string }[] };
export type SearchPage = { label: string; description: string; keywords: string };

export type GlobalSearchResults<O extends SearchOrder, C extends SearchCustomer, P extends SearchProduct, G extends SearchPage> = {
  orders: O[];
  customers: C[];
  products: P[];
  pages: G[];
  total: number;
};

export const SEARCH_LIMITS = { orders: 5, customers: 4, products: 4, pages: 4 } as const;
export const MIN_QUERY_LENGTH = 1;

const normalize = (value: unknown) => String(value ?? '').toLowerCase().trim();
const digitsOnly = (value: unknown) => String(value ?? '').replace(/\D/g, '');

// 3 = starts with the query, 2 = a word starts with it, 1 = contains it, 0 = no match.
const scoreText = (text: unknown, query: string) => {
  const haystack = normalize(text);
  if (!haystack || !query) return 0;
  if (haystack.startsWith(query)) return 3;
  if (haystack.split(/[\s\-_/·,.]+/).some((word) => word.startsWith(query))) return 2;
  return haystack.includes(query) ? 1 : 0;
};

const scoreAny = (values: unknown[], query: string) => values.reduce<number>((best, value) => Math.max(best, scoreText(value, query)), 0);

// A phone number matches when the typed digits are part of it, whatever the spacing or +234 prefix.
const phoneScore = (phone: unknown, queryDigits: string) => (queryDigits.length >= 3 && digitsOnly(phone).includes(queryDigits) ? 2 : 0);

const timeOf = (value?: string) => {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
};

export function searchEverything<O extends SearchOrder, C extends SearchCustomer, P extends SearchProduct, G extends SearchPage>(input: {
  query: string;
  orders: O[];
  customers: C[];
  products: P[];
  pages: G[];
}): GlobalSearchResults<O, C, P, G> {
  const query = normalize(input.query).replace(/^#/, '');
  const empty = { orders: [], customers: [], products: [], pages: [], total: 0 } as GlobalSearchResults<O, C, P, G>;
  if (query.length < MIN_QUERY_LENGTH) return empty;
  const queryDigits = digitsOnly(query);

  const orders = input.orders
    .map((order) => ({
      order,
      score: Math.max(
        scoreAny([order.orderNumber, order.websiteOrderReference, order.customerTrackingCode], query) + 1, // the order number is what people type
        scoreAny([order.customerName, order.customerEmail, order.status], query),
        phoneScore(order.customerPhone, queryDigits),
      ),
      matched: scoreAny([order.orderNumber, order.websiteOrderReference, order.customerTrackingCode, order.customerName, order.customerEmail, order.status], query) > 0
        || phoneScore(order.customerPhone, queryDigits) > 0,
    }))
    .filter((entry) => entry.matched)
    .sort((a, b) => b.score - a.score || timeOf(b.order.createdAt) - timeOf(a.order.createdAt))
    .slice(0, SEARCH_LIMITS.orders)
    .map((entry) => entry.order);

  const customers = input.customers
    .map((customer) => ({
      customer,
      score: Math.max(scoreAny([customer.fullName, customer.email], query), phoneScore(customer.phone, queryDigits)),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || normalize(a.customer.fullName).localeCompare(normalize(b.customer.fullName)))
    .slice(0, SEARCH_LIMITS.customers)
    .map((entry) => entry.customer);

  const products = input.products
    .map((product) => ({
      product,
      score: Math.max(scoreAny([product.name, ...(product.variants ?? []).map((variant) => variant.sku), ...(product.categories ?? [])], query)),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || normalize(a.product.name).localeCompare(normalize(b.product.name)))
    .slice(0, SEARCH_LIMITS.products)
    .map((entry) => entry.product);

  const pages = input.pages
    .map((page) => ({ page, score: Math.max(scoreText(page.label, query) + 1, scoreText(page.description, query), scoreText(page.keywords, query)) }))
    .filter((entry) => scoreAny([entry.page.label, entry.page.description, entry.page.keywords], query) > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, SEARCH_LIMITS.pages)
    .map((entry) => entry.page);

  return { orders, customers, products, pages, total: orders.length + customers.length + products.length + pages.length };
}
