const COMPACT_UUID_REGEX = /^[a-fA-F0-9]{32}$/;

export const trimBusinessId = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export const getBusinessIdCompact = (value: string | null | undefined) => {
  const trimmed = trimBusinessId(value);
  if (!trimmed) return null;

  const withoutPrefix = trimmed.toLowerCase().startsWith('biz-') ? trimmed.slice(4) : trimmed;
  const compact = withoutPrefix.replace(/-/g, '');
  return COMPACT_UUID_REGEX.test(compact) ? compact.toLowerCase() : null;
};

export const formatCompactBusinessUuid = (compact: string) => [
  compact.slice(0, 8),
  compact.slice(8, 12),
  compact.slice(12, 16),
  compact.slice(16, 20),
  compact.slice(20),
].join('-').toLowerCase();

export const getCanonicalBusinessId = (value: string | null | undefined) => {
  const trimmed = trimBusinessId(value);
  if (!trimmed) return '';

  const compact = getBusinessIdCompact(trimmed);
  if (compact) {
    return `biz-${compact}`;
  }

  return trimmed;
};

export const getBusinessIdAliases = (value: string | null | undefined) => {
  const trimmed = trimBusinessId(value);
  if (!trimmed) return [];

  const aliases = new Set<string>([trimmed, getCanonicalBusinessId(trimmed)]);
  const compact = getBusinessIdCompact(trimmed);
  if (compact) {
    aliases.add(formatCompactBusinessUuid(compact));
  }

  return Array.from(aliases).filter(Boolean);
};

export const areBusinessIdsEquivalent = (
  left: string | null | undefined,
  right: string | null | undefined,
) => {
  const leftTrimmed = trimBusinessId(left);
  const rightTrimmed = trimBusinessId(right);
  if (!leftTrimmed || !rightTrimmed) return false;
  if (leftTrimmed === rightTrimmed) return true;

  const leftCompact = getBusinessIdCompact(leftTrimmed);
  const rightCompact = getBusinessIdCompact(rightTrimmed);
  return Boolean(leftCompact && rightCompact && leftCompact === rightCompact);
};
