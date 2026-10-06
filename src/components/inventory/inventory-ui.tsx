import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Check, ChevronDown, ChevronRight, Minus, Package, PackagePlus, Plus, Printer } from 'lucide-react-native';
import type { Product, ProductVariant } from '@/lib/state/fyll-store';
import { ResolvedAttachmentImage } from '@/components/ResolvedAttachmentImage';
import { isHovered, type PaymentsPalette } from '@/components/payments/payments-ui';
import { useBreakpoint } from '@/lib/useBreakpoint';

export type StockStatus = 'in' | 'low' | 'out' | 'inactive';

export const STOCK_STATUS_LABEL: Record<StockStatus, string> = {
  in: 'In stock',
  low: 'Low stock',
  out: 'Out of stock',
  inactive: 'Inactive',
};

const STATUS_TONE = { in: 'verified', low: 'awaiting', out: 'rejected', inactive: 'closed' } as const;

export const getStockStatus = (product: Product, threshold: number): StockStatus => {
  if (product.isDiscontinued) return 'inactive';
  if (product.variants.length === 0 || product.variants.every((variant) => variant.stock <= 0)) return 'out';
  if (product.variants.some((variant) => variant.stock <= threshold)) return 'low';
  return 'in';
};

export const getVariantStatus = (variant: ProductVariant, threshold: number): StockStatus => {
  if (variant.stock <= 0) return 'out';
  if (variant.stock <= threshold) return 'low';
  return 'in';
};

export const formatCompactNaira = (value: number) => {
  if (value >= 1_000_000_000) return `₦${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}b`;
  if (value >= 1_000_000) return `₦${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
  if (value >= 10_000) return `₦${Math.round(value / 1000)}k`;
  return `₦${Math.round(value).toLocaleString('en-NG')}`;
};

export const formatNaira = (value: number) => `₦${Math.round(value).toLocaleString('en-NG')}`;

// Variant swatches: colour names map to a chip; anything else falls back to a
// neutral tile so the row still lines up.
const SWATCHES: Record<string, string> = {
  black: '#111111', white: '#F4F4EF', clear: '#E9ECEF', transparent: '#E9ECEF', gold: '#C9A45C', silver: '#B8BCC2',
  tea: '#6B4A2E', brown: '#6B4A2E', tortoise: '#5A3B22', blue: '#3B5B92', navy: '#1F2E4D', red: '#B23A3A', wine: '#6E2236',
  green: '#3F6B45', purple: '#6A4C93', pink: '#E2A3B5', grey: '#8C8D84', gray: '#8C8D84', yellow: '#E3C15A', orange: '#D9823B',
  cream: '#EDE3CC', nude: '#D8B9A0', rose: '#C98A8A',
};

export const getVariantSwatch = (variant: ProductVariant) => {
  const words = Object.values(variant.variableValues).join(' ').toLowerCase().split(/[^a-z]+/);
  const match = words.find((word) => SWATCHES[word]);
  return match ? SWATCHES[match] : null;
};

export const swatchForName = (value: string) => {
  const match = value.toLowerCase().split(/[^a-z]+/).find((word) => SWATCHES[word]);
  return match ? SWATCHES[match] : null;
};

export const getVariantName = (variant: ProductVariant) => Object.values(variant.variableValues).join(' / ') || 'Default';

export function StockStatusLabel({ status, palette, size = 13 }: { status: StockStatus; palette: PaymentsPalette; size?: number }) {
  const tone = palette.tones[STATUS_TONE[status]];
  const isInactive = status === 'inactive';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 0 }}>
      <View
        style={{
          width: 7,
          height: 7,
          borderRadius: 4,
          backgroundColor: isInactive ? 'transparent' : tone.dot,
          borderWidth: isInactive ? 1.5 : 0,
          borderColor: palette.faint,
        }}
      />
      <Text style={{ color: tone.ink, fontSize: size, fontWeight: '600' }} numberOfLines={1}>{STOCK_STATUS_LABEL[status]}</Text>
    </View>
  );
}

export function InventoryCheckbox({ checked, onPress, palette, label }: { checked: boolean; onPress: () => void; palette: PaymentsPalette; label: string }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={(event) => {
        event.stopPropagation();
        onPress();
      }}
      hitSlop={8}
      style={{
        width: 20,
        height: 20,
        borderRadius: 6,
        borderWidth: 1.5,
        borderColor: checked ? palette.inverseBg : palette.outline,
        backgroundColor: checked ? palette.inverseBg : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {checked ? <Check size={12} color={palette.inverseText} strokeWidth={3.4} /> : null}
    </Pressable>
  );
}

export function ProductThumb({ product, size, radius, palette }: { product: Product; size: number; radius: number; palette: PaymentsPalette }) {
  const imageUrl = product.imageUrl || product.variants.find((variant) => variant.imageUrl)?.imageUrl;
  const fallback = (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Package size={size * 0.42} color={palette.faint} strokeWidth={1.6} />
    </View>
  );
  return (
    <View style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden', backgroundColor: palette.isDark ? '#F4F4EF' : '#F2F2EE', flexShrink: 0 }}>
      {imageUrl ? (
        <ResolvedAttachmentImage imageUrl={imageUrl} style={{ width: size, height: size }} resizeMode="cover" fallback={fallback} />
      ) : (
        <View style={{ flex: 1, backgroundColor: palette.softFill }}>{fallback}</View>
      )}
    </View>
  );
}

export function FilterPill({ label, count, active, onPress, palette, textSize = 13 }: { label: string; count?: number; active: boolean; onPress: () => void; palette: PaymentsPalette; textSize?: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={(state) => ({
        flexShrink: 0,
        height: 36,
        paddingHorizontal: 14,
        borderRadius: 999,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderWidth: 1,
        borderColor: active ? palette.inverseBg : palette.outline,
        backgroundColor: active ? palette.inverseBg : isHovered(state) ? palette.softFill : 'transparent',
        opacity: state.pressed ? 0.8 : 1,
      })}
    >
      <Text style={{ color: active ? palette.inverseText : palette.textSoft, fontSize: textSize, fontWeight: '600' }}>{label}</Text>
      {count !== undefined ? (
        <Text style={{ color: active ? palette.inverseText : palette.textSoft, opacity: 0.55, fontSize: textSize, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{count}</Text>
      ) : null}
    </Pressable>
  );
}

// Desktop dropdown (Category / Sort). The invisible backdrop closes it when
// you click anywhere else.
export function MenuPill<K extends string>({ prefix, value, options, onSelect, palette }: {
  prefix: string;
  value: K;
  options: { key: K; label: string }[];
  onSelect: (key: K) => void;
  palette: PaymentsPalette;
}) {
  const [open, setOpen] = useState<boolean>(false);
  const current = options.find((option) => option.key === value)?.label ?? '';
  return (
    <View style={{ position: 'relative', zIndex: open ? 60 : 1 }}>
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen((previous) => !previous)}
        style={(state) => ({
          height: 40,
          paddingHorizontal: 14,
          borderRadius: 999,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          borderWidth: 1,
          borderColor: palette.outline,
          backgroundColor: isHovered(state) || open ? palette.softFill : 'transparent',
        })}
      >
        <Text style={{ color: palette.textSoft, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{prefix}: {current}</Text>
        <ChevronDown size={14} color={palette.textSoft} strokeWidth={2.2} />
      </Pressable>
      {open ? (
        <>
          <Pressable onPress={() => setOpen(false)} style={{ position: 'absolute', top: -3000, left: -3000, width: 8000, height: 8000 }} />
          <View
            style={{
              position: 'absolute',
              top: 46,
              right: 0,
              minWidth: 210,
              maxHeight: 320,
              paddingVertical: 6,
              borderRadius: 14,
              backgroundColor: palette.card,
              borderWidth: 1,
              borderColor: palette.border,
              shadowColor: '#000',
              shadowOpacity: 0.3,
              shadowRadius: 24,
              shadowOffset: { width: 0, height: 12 },
              overflow: 'hidden',
            }}
          >
            {options.map((option) => (
              <Pressable
                key={option.key}
                onPress={() => {
                  onSelect(option.key);
                  setOpen(false);
                }}
                style={(state) => ({
                  height: 38,
                  paddingHorizontal: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  backgroundColor: isHovered(state) ? palette.softFill : 'transparent',
                })}
              >
                <Text style={{ color: palette.text, fontSize: 13.5, fontWeight: option.key === value ? '600' : '400' }} numberOfLines={1}>{option.label}</Text>
                {option.key === value ? <Check size={14} color={palette.text} strokeWidth={2.6} /> : null}
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

// Column widths shared by the desktop header, product rows and variant rows.
export const TABLE_COLUMNS = { check: 20, stock: 120, price: 110, status: 140, trail: 52, gap: 16 } as const;

type ProductTableRowProps = {
  product: Product;
  status: StockStatus;
  threshold: number;
  totalStock: number;
  displayPrice: number;
  isOwner: boolean;
  selected: boolean;
  expanded: boolean;
  isLast: boolean;
  palette: PaymentsPalette;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
  onOpen: () => void;
  onAdjustStock: (variantId: string, delta: number) => void;
  onRestock: (variantId: string) => void;
  onPrintLabel: (variantId: string) => void;
};

export function ProductTableRow({
  product, status, threshold, totalStock, displayPrice, isOwner, selected, expanded, isLast, palette,
  onToggleSelect, onToggleExpand, onOpen, onAdjustStock, onRestock, onPrintLabel,
}: ProductTableRowProps) {
  const C = TABLE_COLUMNS;
  const category = product.categories?.[0]?.trim();
  const sku = product.variants[0]?.sku?.toUpperCase() || '—';
  const variantCount = product.variants.length;
  const stockInk = status === 'inactive' ? palette.faint : totalStock === 0 ? palette.danger : palette.text;
  const rowSelectedBg = palette.isDark ? 'rgba(244,244,239,0.04)' : 'rgba(17,17,17,0.03)';
  const rowHoverBg = palette.isDark ? 'rgba(255,255,255,0.025)' : '#FAFAF7';

  return (
    <View style={{ borderBottomWidth: isLast && !expanded ? 0 : 1, borderBottomColor: palette.hairline }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${product.name}`}
        onPress={onOpen}
        style={(state) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: C.gap,
          paddingHorizontal: 22,
          height: 66,
          backgroundColor: selected ? rowSelectedBg : isHovered(state) ? rowHoverBg : 'transparent',
        })}
      >
        <InventoryCheckbox checked={selected} onPress={onToggleSelect} palette={palette} label={`Select ${product.name}`} />
        <View style={{ flex: 2.4, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={expanded ? 'Hide variants' : 'Show variants'}
            onPress={(event) => {
              event.stopPropagation();
              onToggleExpand();
            }}
            hitSlop={6}
            style={(state) => ({ width: 22, height: 22, marginLeft: -4, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: isHovered(state) ? palette.softFill : 'transparent' })}
          >
            <View style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}>
              <ChevronRight size={15} color={palette.faint} strokeWidth={2.2} />
            </View>
          </Pressable>
          <ProductThumb product={product} size={44} radius={10} palette={palette} />
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <Text style={{ color: palette.text, fontSize: 15, fontWeight: '500' }} numberOfLines={1}>{product.name}</Text>
            <Text style={{ color: palette.faint, fontSize: 12.5 }} numberOfLines={1}>
              {variantCount} {variantCount === 1 ? 'variant' : 'variants'} · {sku}
            </Text>
          </View>
        </View>
        <Text
          style={{ flex: 1, minWidth: 0, color: category ? palette.textSoft : palette.faint, fontSize: 14, fontStyle: category ? 'normal' : 'italic' }}
          numberOfLines={1}
        >
          {category || 'Add category'}
        </Text>
        <Text style={{ width: C.stock, textAlign: 'right', color: stockInk, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{totalStock}</Text>
        {isOwner ? (
          <Text style={{ width: C.price, textAlign: 'right', color: displayPrice ? palette.text : palette.warn, fontSize: 14.5, fontWeight: '600', fontVariant: ['tabular-nums'] }} numberOfLines={1}>
            {displayPrice ? formatNaira(displayPrice) : 'Set price'}
          </Text>
        ) : null}
        <View style={{ width: C.status }}>
          <StockStatusLabel status={status} palette={palette} />
        </View>
        <View style={{ width: C.trail, alignItems: 'flex-end' }}>
          <ChevronRight size={16} color={palette.isDark ? '#5D5E56' : '#BDBDBD'} strokeWidth={2.2} />
        </View>
      </Pressable>

      {expanded ? (
        <View style={{ backgroundColor: palette.isDark ? '#191919' : '#FAFAF8', paddingTop: 6, paddingBottom: 10, borderTopWidth: 1, borderTopColor: palette.hairline }}>
          {product.variants.map((variant) => {
            const variantStatus = getVariantStatus(variant, threshold);
            const swatch = getVariantSwatch(variant);
            return (
              <View key={variant.id} style={{ flexDirection: 'row', alignItems: 'center', gap: C.gap, paddingHorizontal: 22, height: 48 }}>
                <View style={{ width: C.check }} />
                <View style={{ flex: 2.4, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 30 }}>
                  {variant.imageUrl ? (
                    <View style={{ width: 30, height: 30, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: palette.border }}>
                      <ResolvedAttachmentImage imageUrl={variant.imageUrl} style={{ width: 30, height: 30 }} resizeMode="cover" />
                    </View>
                  ) : (
                    <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: swatch ?? palette.softFill, borderWidth: 1, borderColor: palette.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)' }} />
                  )}
                  <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                    <Text style={{ color: palette.textSoft, fontSize: 14 }} numberOfLines={1}>{getVariantName(variant)}</Text>
                    <Text style={{ color: palette.faint, fontSize: 12 }} numberOfLines={1}>{variant.sku?.toUpperCase() || '—'}</Text>
                  </View>
                </View>
                <View style={{ flex: 1 }} />
                <View style={{ width: C.stock, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                  <StepButton label="Remove one" disabled={variant.stock <= 0} onPress={() => onAdjustStock(variant.id, -1)} palette={palette}>
                    <Minus size={12} color={palette.textSoft} strokeWidth={2.4} />
                  </StepButton>
                  <Text style={{ minWidth: 22, textAlign: 'center', color: variant.stock <= 0 ? palette.danger : palette.text, fontSize: 14.5, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{variant.stock}</Text>
                  <StepButton label="Add one" onPress={() => onAdjustStock(variant.id, 1)} palette={palette}>
                    <Plus size={12} color={palette.textSoft} strokeWidth={2.4} />
                  </StepButton>
                </View>
                {isOwner ? (
                  <Text style={{ width: C.price, textAlign: 'right', color: variant.sellingPrice ? palette.muted : palette.warn, fontSize: 14, fontVariant: ['tabular-nums'] }} numberOfLines={1}>
                    {variant.sellingPrice ? formatNaira(variant.sellingPrice) : 'Set price'}
                  </Text>
                ) : null}
                <View style={{ width: C.status }}>
                  <StockStatusLabel status={variantStatus} palette={palette} />
                </View>
                <View style={{ width: C.trail, flexDirection: 'row', justifyContent: 'flex-end', gap: 4 }}>
                  <IconAction label="Restock" onPress={() => onRestock(variant.id)} palette={palette}>
                    <PackagePlus size={15} color={palette.faint} strokeWidth={2} />
                  </IconAction>
                  <IconAction label="Print label" onPress={() => onPrintLabel(variant.id)} palette={palette}>
                    <Printer size={15} color={palette.faint} strokeWidth={2} />
                  </IconAction>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function StepButton({ label, onPress, disabled = false, palette, children }: { label: string; onPress: () => void; disabled?: boolean; palette: PaymentsPalette; children: React.ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={(state) => ({
        width: 24,
        height: 24,
        borderRadius: 7,
        borderWidth: 1,
        borderColor: palette.outline,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: isHovered(state) ? palette.softFill : 'transparent',
        opacity: disabled ? 0.35 : state.pressed ? 0.6 : 1,
      })}
    >
      {children}
    </Pressable>
  );
}

function IconAction({ label, onPress, palette, children }: { label: string; onPress: () => void; palette: PaymentsPalette; children: React.ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={(state) => ({ width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: isHovered(state) ? palette.softFill : 'transparent' })}
    >
      {children}
    </Pressable>
  );
}

type ProductListRowProps = {
  product: Product;
  status: StockStatus;
  totalStock: number;
  displayPrice: number;
  isOwner: boolean;
  isFirst: boolean;
  active: boolean;
  palette: PaymentsPalette;
  onPress: () => void;
};

export function ProductListRow({ product, status, totalStock, displayPrice, isOwner, isFirst, active, palette, onPress }: ProductListRowProps) {
  // Phones use smaller list text (name and qty 12px, status 10px).
  const { isMobile: compact } = useBreakpoint();
  const variantCount = product.variants.length;
  const stockInk = status === 'inactive' ? palette.faint : totalStock === 0 ? palette.danger : palette.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${product.name}`}
      onPress={onPress}
      style={(state) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderTopWidth: isFirst ? 0 : 1,
        borderTopColor: palette.hairline,
        backgroundColor: active ? palette.softFill : 'transparent',
        opacity: state.pressed ? 0.7 : 1,
      })}
    >
      <ProductThumb product={product} size={48} radius={12} palette={palette} />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          <Text style={{ flex: 1, color: palette.text, fontSize: compact ? 12 : 15, fontWeight: '500' }} numberOfLines={1}>{product.name}</Text>
          <Text style={{ color: stockInk, fontSize: compact ? 12 : 15, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{totalStock} left</Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <Text style={{ flex: 1, color: palette.faint, fontSize: 12.5 }} numberOfLines={1}>
            {variantCount} {variantCount === 1 ? 'variant' : 'variants'} · {isOwner ? (
              <Text style={{ color: displayPrice ? palette.text : palette.warn }}>{displayPrice ? formatNaira(displayPrice) : 'Set price'}</Text>
            ) : (product.variants[0]?.sku?.toUpperCase() || '—')}
          </Text>
          <StockStatusLabel status={status} palette={palette} size={compact ? 10 : 12.5} />
        </View>
      </View>
    </Pressable>
  );
}
