// Day headings for lists ("Today", "Yesterday · 3 Nov", "Mon, 3 Nov"), shared by the Finance and Procurement lists.
export const getDayGroup = (timestamp: number | null | undefined): { key: string; label: string } => {
  if (!timestamp || !Number.isFinite(timestamp)) return { key: 'unknown', label: 'Earlier' };
  const date = new Date(timestamp);
  const now = new Date();
  const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const difference = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  if (difference === 0) return { key, label: 'Today' };
  const sameYear = date.getFullYear() === now.getFullYear();
  const shortDate = date.toLocaleDateString('en-GB', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
  if (difference === 1) return { key, label: `Yesterday · ${shortDate}` };
  return {
    key,
    label: date.toLocaleDateString('en-GB', sameYear ? { weekday: 'short', day: 'numeric', month: 'short' } : { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
  };
};

// Up to two letters from a supplier or customer name, for round avatars.
export const getNameInitials = (name?: string | null): string => {
  const words = (name ?? '').trim().split(/[\s\-_/&]+/).filter((word) => /[a-z0-9]/i.test(word));
  if (words.length === 0) return '•';
  const clean = (word: string) => word.replace(/[^a-z0-9]/gi, '');
  const letters = words.length === 1 ? clean(words[0]).slice(0, 2) : `${clean(words[0])[0] ?? ''}${clean(words[1])[0] ?? ''}`;
  return letters.toUpperCase() || '•';
};
