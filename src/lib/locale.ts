// Business country + currency. Stored per business in businesses.data
// (country, currency) and applied app-wide through setActiveCurrency, so
// formatCurrency() shows the right symbol without every screen needing a prop.

export type CurrencyCode =
  | 'NGN' | 'USD' | 'CAD' | 'GBP' | 'EUR' | 'GHS' | 'KES' | 'ZAR' | 'AUD' | 'PHP' | 'INR' | 'AED';

export interface CurrencySettings {
  code: CurrencyCode;
  symbol: string;
  name: string;
}

export const CURRENCIES: Record<CurrencyCode, CurrencySettings> = {
  NGN: { code: 'NGN', symbol: '₦', name: 'Nigerian Naira' },
  USD: { code: 'USD', symbol: '$', name: 'US Dollar' },
  CAD: { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar' },
  GBP: { code: 'GBP', symbol: '£', name: 'British Pound' },
  EUR: { code: 'EUR', symbol: '€', name: 'Euro' },
  GHS: { code: 'GHS', symbol: 'GH₵', name: 'Ghanaian Cedi' },
  KES: { code: 'KES', symbol: 'KSh ', name: 'Kenyan Shilling' },
  ZAR: { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
  AUD: { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  PHP: { code: 'PHP', symbol: '₱', name: 'Philippine Peso' },
  INR: { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  AED: { code: 'AED', symbol: 'AED ', name: 'UAE Dirham' },
};

export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];

export interface CountryOption {
  code: string; // ISO 3166-1 alpha-2
  name: string;
  currency: CurrencyCode; // sensible default when the country is picked
}

export const COUNTRIES: CountryOption[] = [
  { code: 'NG', name: 'Nigeria', currency: 'NGN' },
  { code: 'US', name: 'United States', currency: 'USD' },
  { code: 'CA', name: 'Canada', currency: 'CAD' },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP' },
  { code: 'IE', name: 'Ireland', currency: 'EUR' },
  { code: 'DE', name: 'Germany', currency: 'EUR' },
  { code: 'FR', name: 'France', currency: 'EUR' },
  { code: 'GH', name: 'Ghana', currency: 'GHS' },
  { code: 'KE', name: 'Kenya', currency: 'KES' },
  { code: 'ZA', name: 'South Africa', currency: 'ZAR' },
  { code: 'AU', name: 'Australia', currency: 'AUD' },
  { code: 'PH', name: 'Philippines', currency: 'PHP' },
  { code: 'IN', name: 'India', currency: 'INR' },
  { code: 'AE', name: 'United Arab Emirates', currency: 'AED' },
];

export const DEFAULT_COUNTRY = 'NG';
export const DEFAULT_CURRENCY: CurrencyCode = 'NGN';

export const normalizeCurrency = (value: unknown): CurrencyCode => {
  const upper = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return (CURRENCY_CODES as string[]).includes(upper) ? (upper as CurrencyCode) : DEFAULT_CURRENCY;
};

export const normalizeCountry = (value: unknown): string => {
  const upper = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return COUNTRIES.some((c) => c.code === upper) ? upper : DEFAULT_COUNTRY;
};

export const getCountry = (code: string): CountryOption =>
  COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0];

let activeCurrency: CurrencyCode = DEFAULT_CURRENCY;

export const setActiveCurrency = (code: CurrencyCode) => {
  activeCurrency = code;
};

export const getActiveCurrency = (): CurrencyCode => activeCurrency;
