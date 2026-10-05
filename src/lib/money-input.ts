export const parseCurrencyInput = (value: string): number => {
  const normalized = value.replace(/,/g, '').replace(/[^0-9.]/g, '');
  const [whole = '', ...decimalParts] = normalized.split('.');
  const canonical = decimalParts.length > 0 ? `${whole}.${decimalParts.join('')}` : whole;
  const parsed = Number(canonical);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

export const formatCurrencyInput = (value: string): string => {
  const digits = value.replace(/[^0-9]/g, '');
  return digits ? Number(digits).toLocaleString('en-NG') : '';
};
