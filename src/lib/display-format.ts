export const capitalizeDisplayLabel = (value: string) => value
  .trim()
  .replace(/\b([a-z])/g, (match) => match.toUpperCase());

// Capitalises the first letter of each word in a person's name for display ("ada obi-nwosu" ->
// "Ada Obi-Nwosu"). Only raises first letters, so names typed like "McDonald" are left alone.
export const formatPersonName = (value?: string | null) => (value ?? '')
  .trim()
  .replace(/(^|[\s\-'’])(\p{Ll})/gu, (_match, lead: string, letter: string) => `${lead}${letter.toUpperCase()}`);

// Raises only the first character for display ("small" -> "Small"). Display-only: stored values are never changed.
export const capitalizeFirstLetter = (value?: string | null) => {
  const text = (value ?? '').trim();
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : '';
};
