import { formatCurrency } from '@/lib/state/fyll-store';
import type { TimeRange } from '@/lib/analytics-utils';

export type InsightSentenceParts = { bold: string; rest: string } | null;

const WEEKDAY_LONG: Record<string, string> = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' };

// One plain sentence for the top card of an Insights page. Each returns null when there is nothing worth saying.

export const salesSentence = (
  salesByPeriod: { label: string; value: number }[],
  range: TimeRange,
  refundsAmount: number
): InsightSentenceParts => {
  const best = salesByPeriod.reduce<{ label: string; value: number } | null>(
    (top, point) => (point.value > (top?.value ?? 0) ? { label: point.label, value: point.value } : top),
    null
  );
  if (!best) return null;
  const unit = range === '7d' ? 'day' : range === 'year' ? 'month' : 'week';
  const name = range === '7d' ? (WEEKDAY_LONG[best.label] ?? best.label) : best.label;
  const refundText = refundsAmount > 0 ? ` ${formatCurrency(refundsAmount)} went back in refunds.` : ' No refunds in this period, so all of it is net.';
  return { bold: `${name} was your best ${unit}`, rest: ` at ${formatCurrency(best.value)}.${refundText}` };
};

export const ordersSentence = (total: number, completed: number, processing: number, refunded: number): InsightSentenceParts => {
  if (total <= 0) return null;
  return {
    bold: `${completed} of ${total} orders are completed`,
    rest: `. ${processing} still processing${refunded > 0 ? ` and ${refunded} refunded` : ''}.`,
  };
};

export const customersSentence = (newCustomers: number, returning: number, repeatRate: number): InsightSentenceParts => {
  if (newCustomers + returning <= 0) return null;
  return { bold: `${newCustomers} new customers`, rest: ` and ${returning} returning, a ${repeatRate}% repeat rate.` };
};

export const refundsSentence = (refundsAmount: number, refundsCount: number, totalSales: number): InsightSentenceParts => {
  if (refundsCount <= 0) return { bold: 'No refunds', rest: ' in this period.' };
  const rate = totalSales > 0 ? ` That is ${((refundsAmount / totalSales) * 100).toFixed(1)}% of revenue.` : '';
  return { bold: `${refundsCount} refund${refundsCount === 1 ? '' : 's'} totalling ${formatCurrency(refundsAmount)}`, rest: `.${rate}` };
};

export const topItemSentence = (
  items: { name: string; revenue: number }[],
  noun: string
): InsightSentenceParts => {
  const total = items.reduce((sum, item) => sum + item.revenue, 0);
  const top = items.reduce<{ name: string; revenue: number } | null>((best, item) => (item.revenue > (best?.revenue ?? 0) ? item : best), null);
  if (!top || total <= 0) return null;
  return { bold: `${top.name} is your top ${noun}`, rest: ` at ${formatCurrency(top.revenue)}, ${Math.round((top.revenue / total) * 100)}% of the total.` };
};

export const todaySentence = (orders: number, customers: number, units: number, refunds: number): InsightSentenceParts => {
  if (orders <= 0) return { bold: 'No orders yet today', rest: '. This will update as they come in.' };
  return {
    bold: `${orders} order${orders === 1 ? '' : 's'} so far today`,
    rest: ` from ${customers} customer${customers === 1 ? '' : 's'}, ${units} item${units === 1 ? '' : 's'} sold${refunds > 0 ? ` and ${refunds} returned` : ''}.`,
  };
};

export const sourceSentence = (items: { label: string; value: number; percentage: number }[]): InsightSentenceParts => {
  const top = items.reduce<{ label: string; value: number; percentage: number } | null>((best, item) => (item.value > (best?.value ?? 0) ? item : best), null);
  if (!top) return null;
  return { bold: `${top.label} brings in the most revenue`, rest: ` at ${formatCurrency(top.value)}, ${top.percentage}% of the total.` };
};
