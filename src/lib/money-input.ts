import { getActiveCurrency, type CurrencyCode } from '@/lib/locale';

export const parseCurrencyInput = (value: string): number => {
  const normalized = value.replace(/,/g, '').replace(/[^0-9.]/g, '');
  const [whole = '', ...decimalParts] = normalized.split('.');
  const canonical = decimalParts.length > 0 ? `${whole}.${decimalParts.join('')}` : whole;
  const parsed = Number(canonical);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

export const formatCurrencyInput = (value: string, currencyCode: CurrencyCode = getActiveCurrency()): string => {
  if (currencyCode === 'NGN') {
    const digits = value.replace(/[^0-9]/g, '');
    return digits ? Number(digits).toLocaleString('en-NG') : '';
  }

  const normalized = value.replace(/,/g, '').replace(/[^0-9.]/g, '');
  const [whole = '', ...decimalParts] = normalized.split('.');
  const formattedWhole = whole ? Number(whole).toLocaleString('en-US') : '';
  if (decimalParts.length === 0) return formattedWhole;
  return `${formattedWhole || '0'}.${decimalParts.join('').slice(0, 2)}`;
};
