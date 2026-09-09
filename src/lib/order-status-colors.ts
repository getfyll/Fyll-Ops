import type { OrderStatus } from '@/lib/state/fyll-store';

const DEFAULT_STATUS_COLOR = '#6B7280';
const CANCELLED_STATUS_COLOR = '#6B7280';

const isValidHexColor = (value: string) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);

const normalizeHexColor = (value?: string | null): string | null => {
  const trimmed = value?.trim() ?? '';
  if (!trimmed || !isValidHexColor(trimmed)) return null;
  return trimmed;
};

const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return null;
  let source = normalized.slice(1);
  if (source.length === 3) {
    source = source.split('').map((part) => `${part}${part}`).join('');
  }
  const value = Number.parseInt(source, 16);
  if (!Number.isFinite(value)) return null;
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
};

const withAlpha = (hex: string, alpha: number, fallback: string): string => {
  const rgb = hexToRgb(hex);
  if (!rgb) return fallback;
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
};

export const createOrderStatusColorMap = (statuses: OrderStatus[]): Record<string, string> => (
  statuses.reduce((acc, status) => {
    const key = status.name?.trim();
    if (!key) return acc;
    const color = normalizeHexColor(status.color) ?? DEFAULT_STATUS_COLOR;
    acc[key] = color;
    return acc;
  }, {} as Record<string, string>)
);

export const getOrderStatusColor = (
  status: string,
  statusColorMap: Record<string, string>,
  fallbackColor = DEFAULT_STATUS_COLOR
): string => {
  const normalizedStatus = status.trim().toLowerCase();
  if (normalizedStatus.includes('cancel')) {
    return CANCELLED_STATUS_COLOR;
  }
  const normalizedFallback = normalizeHexColor(fallbackColor) ?? DEFAULT_STATUS_COLOR;
  return statusColorMap[status] ?? normalizedFallback;
};

export const getOrderStatusChipColors = (
  status: string,
  statusColorMap: Record<string, string>,
  isDark: boolean
): { bg: string; text: string; border: string } => {
  const color = getOrderStatusColor(status, statusColorMap);
  return {
    bg: withAlpha(color, isDark ? 0.22 : 0.14, isDark ? 'rgba(107,114,128,0.22)' : 'rgba(107,114,128,0.14)'),
    text: color,
    border: withAlpha(color, isDark ? 0.35 : 0.25, isDark ? 'rgba(107,114,128,0.35)' : 'rgba(107,114,128,0.25)'),
  };
};
