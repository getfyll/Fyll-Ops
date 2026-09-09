export const capitalizeDisplayLabel = (value: string) => value
  .trim()
  .replace(/\b([a-z])/g, (match) => match.toUpperCase());
