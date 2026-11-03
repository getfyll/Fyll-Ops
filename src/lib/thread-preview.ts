// Shared products go into a thread as "🛍️ [product:<id>] <name>". The id is only for opening the product, so anywhere
// the message is shown as plain text (thread list previews, quoted replies) the code is hidden and the name is kept.
export const formatThreadPreview = (body?: string | null): string => {
  const text = (body ?? '').trim();
  if (!text) return '';
  return text.replace(/\[product:[^\]]+\]\s*/gi, '').replace(/^🛍️\s*$/u, '🛍️ Product').trim();
};
