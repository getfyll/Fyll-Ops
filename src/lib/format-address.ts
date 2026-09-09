type AddressLike = {
  address1?: unknown;
  address2?: unknown;
  city?: unknown;
  state?: unknown;
  country?: unknown;
  postalCode?: unknown;
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
  if (directValue) return directValue;

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return '';
  }

  const address = value as AddressLike;
  return [
    address.address1,
    address.address2,
    address.city,
    address.state,
    address.country,
    address.postalCode,
  ]
    .map(toTrimmedString)
    .filter(Boolean)
    .join(', ');
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
