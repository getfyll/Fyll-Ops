import { useCallback } from 'react';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { CURRENCIES, formatCurrency, type CurrencyCode } from '@/lib/state/fyll-store';

export const useBusinessCurrency = () => {
  const { currency } = useBusinessSettings();
  const currencySettings = CURRENCIES[currency];
  const formatMoney = useCallback(
    (amount: number | null | undefined) => formatCurrency(amount, currency),
    [currency]
  );

  return {
    currency: currency as CurrencyCode,
    currencyName: currencySettings.name,
    currencySymbol: currencySettings.symbol.trim(),
    formatMoney,
  };
};
