type AddressLike = {
  address?: unknown;
  address1?: unknown;
  address2?: unknown;
  address_1?: unknown;
  address_2?: unknown;
  line1?: unknown;
  line2?: unknown;
  street?: unknown;
  streetAddress?: unknown;
  formatted?: unknown;
  formattedAddress?: unknown;
  fullAddress?: unknown;
  city?: unknown;
  locality?: unknown;
  state?: unknown;
  region?: unknown;
  country?: unknown;
  countryCode?: unknown;
  postalCode?: unknown;
  postal_code?: unknown;
  postcode?: unknown;
  zip?: unknown;
};

const toTrimmedString = (value: unknown) => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  return '';
};

const NIGERIAN_STATE_NAMES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno',
  'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'Abuja', 'Gombe',
  'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara',
  'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau',
  'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
];

const decodeBasicHtmlEntities = (value: string) => (
  value
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#38;/g, '&')
    .replace(/&#x26;/gi, '&')
);

export const formatAddressValue = (value: unknown) => {
  const directValue = decodeBasicHtmlEntities(toTrimmedString(value)).replace(/\s+/g, ' ').trim();
  if (directValue && directValue.toLowerCase() !== '[object object]') return directValue;

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return '';
  }

  const address = value as AddressLike;
  const formattedAddress = [address.formatted, address.formattedAddress, address.fullAddress]
    .map(toTrimmedString)
    .find(Boolean);
  if (formattedAddress) return decodeBasicHtmlEntities(formattedAddress).replace(/\s+/g, ' ').trim();

  return [
    address.address,
    address.address1,
    address.address_1,
    address.line1,
    address.streetAddress,
    address.street,
    address.address2,
    address.address_2,
    address.line2,
    address.city,
    address.locality,
    address.state,
    address.region,
    address.country,
    address.countryCode,
    address.postalCode,
    address.postal_code,
    address.postcode,
    address.zip,
  ]
    .map(toTrimmedString)
    .filter(Boolean)
    .filter((part, index, parts) => parts.findIndex((candidate) => candidate.toLowerCase() === part.toLowerCase()) === index)
    .join(', ');
};

export const normalizeOrderAddressFields = <T>(order: T): T => {
  if (!order || typeof order !== 'object' || Array.isArray(order)) return order;

  const source = order as Record<string, unknown>;
  const next = { ...source };
  const shipping = source.shipping && typeof source.shipping === 'object'
    ? source.shipping as Record<string, unknown>
    : {};
  const customer = source.customer && typeof source.customer === 'object'
    ? source.customer as Record<string, unknown>
    : {};
  if ('deliveryAddress' in next || 'delivery_address' in source || 'shippingAddress' in source || 'shipping_address' in source) {
    next.deliveryAddress = formatAddressValue(source.deliveryAddress)
      || formatAddressValue(source.delivery_address)
      || formatAddressValue(source.shippingAddress)
      || formatAddressValue(source.shipping_address)
      || formatAddressValue(shipping)
      || formatAddressValue(customer.address);
  }
  if ('deliveryState' in next || 'delivery_state' in source || 'state' in shipping) {
    next.deliveryState = normalizeDeliveryStateValue(
      source.deliveryState ?? source.delivery_state ?? shipping.state,
      next.deliveryAddress
    );
  }
  return next as T;
};

const extractNigerianStateName = (value: string) => {
  if (!value) return '';
  if (/\bfct\b/i.test(value)) return 'Abuja';

  const exactPart = value
    .split(',')
    .map((part) => part.trim())
    .find((part) => NIGERIAN_STATE_NAMES.some((state) => state.toLowerCase() === part.toLowerCase()));
  if (exactPart) return exactPart;

  return NIGERIAN_STATE_NAMES.find((state) => (
    new RegExp(`\\b${state.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(value)
  )) ?? '';
};

export const normalizeDeliveryStateValue = (value: unknown, fallbackAddress?: unknown) => {
  const text = formatAddressValue(value);
  const fallbackText = formatAddressValue(fallbackAddress);
  if (!text) return extractNigerianStateName(fallbackText) || '';

  const matchedState = extractNigerianStateName(text);
  if (matchedState) return matchedState;

  return extractNigerianStateName(fallbackText) || text;
};

export const formatDeliveryLocation = (deliveryAddress: unknown, deliveryState?: unknown) => {
  const addressText = formatAddressValue(deliveryAddress);
  const stateText = normalizeDeliveryStateValue(deliveryState, deliveryAddress);

  if (addressText && stateText && !addressText.toLowerCase().includes(stateText.toLowerCase())) {
    return `${addressText}, ${stateText}`;
  }

  return addressText || stateText;
};
