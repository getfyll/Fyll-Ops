import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  LinearTransition,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowUpRight, ChevronRight, Clock3, Package, Search, ShoppingCart, User as UserIcon, X } from 'lucide-react-native';
import { MoneyText, isHovered, usePaymentsPalette } from '@/components/payments/payments-ui';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { getEnabledFeatureSearchItems } from '@/lib/feature-search';
import { searchEverything } from '@/lib/global-search';
import { storage } from '@/lib/storage';
import useAuthStore from '@/lib/state/auth-store';
import { formatCurrency } from '@/lib/state/fyll-store';
import useFyllStore from '@/lib/state/fyll-store';
import { useBreakpoint } from '@/lib/useBreakpoint';

const RECENT_KEY = 'global-search-recent';
const MAX_RECENT = 5;
const SPRING_IN = { duration: 300, easing: Easing.out(Easing.cubic) } as const;
const FADE_OUT = { duration: 200, easing: Easing.in(Easing.quad) } as const;

const shortDate = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// Search across orders, customers, products and pages from one place. The screen fades and settles in from the top
// of the page, results glide in one after another, and everything is skipped for people who prefer reduced motion.
export function GlobalSearch({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const palette = usePaymentsPalette();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { isDesktop } = useBreakpoint();
  const { featureAccess } = useBusinessSettings();
  const role = useAuthStore((s) => s.currentUser?.role ?? null);
  const orders = useFyllStore((s) => s.orders);
  const customers = useFyllStore((s) => s.customers);
  const products = useFyllStore((s) => s.products);

  const inputRef = useRef<TextInput>(null);
  const progress = useSharedValue(0);
  const [mounted, setMounted] = useState<boolean>(visible);
  const [query, setQuery] = useState<string>('');
  const [focused, setFocused] = useState<boolean>(false);
  const [recent, setRecent] = useState<string[]>([]);

  const finishClose = useCallback(() => {
    setMounted(false);
    setQuery('');
  }, []);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      progress.value = reduced ? 1 : withTiming(1, SPRING_IN);
      void Promise.resolve(storage.getItem(RECENT_KEY))
        .then((value) => {
          try {
            const parsed = value ? JSON.parse(value) : [];
            if (Array.isArray(parsed)) setRecent(parsed.filter((entry): entry is string => typeof entry === 'string').slice(0, MAX_RECENT));
          } catch {
            setRecent([]);
          }
        })
        .catch(() => undefined);
      const focusTimer = setTimeout(() => inputRef.current?.focus(), reduced ? 0 : 160);
      return () => clearTimeout(focusTimer);
    }
    if (!mounted) return undefined;
    if (reduced) {
      progress.value = 0;
      finishClose();
      return undefined;
    }
    progress.value = withTiming(0, FADE_OUT, (finished) => {
      if (finished) runOnJS(finishClose)();
    });
    return undefined;
    // `mounted` is deliberately not a dependency: this only reacts to the parent opening or closing the search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const panelStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * -18 }, { scale: 0.975 + 0.025 * progress.value }],
  }));

  const pages = useMemo(() => getEnabledFeatureSearchItems(featureAccess, role), [featureAccess, role]);
  const results = useMemo(
    () => searchEverything({ query, orders, customers, products, pages }),
    [query, orders, customers, products, pages]
  );
  const hasQuery = query.trim().length > 0;

  const rememberQuery = useCallback((value: string) => {
    const trimmed = value.trim();
    if (trimmed.length < 2) return;
    setRecent((current) => {
      const next = [trimmed, ...current.filter((entry) => entry.toLowerCase() !== trimmed.toLowerCase())].slice(0, MAX_RECENT);
      void Promise.resolve(storage.setItem(RECENT_KEY, JSON.stringify(next))).catch(() => undefined);
      return next;
    });
  }, []);

  const open = useCallback(
    (route: string) => {
      rememberQuery(query);
      onClose();
      router.push(route as never);
    },
    [onClose, query, rememberQuery, router]
  );

  const orderRoute = (id: string) => (Platform.OS === 'web' && isDesktop ? `/orders/${id}` : `/order/${id}`);

  // Rows, in the order they appear, so the first one can be opened with Enter and each can glide in with a small delay.
  type Row = { key: string; group: string; title: string; subtitle: string; right?: string; icon: 'order' | 'customer' | 'product' | 'page'; route: string; PageIcon?: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }> };
  const rows = useMemo<Row[]>(() => {
    const list: Row[] = [];
    results.orders.forEach((order) => {
      const parts = [order.customerName?.trim(), Number(order.totalAmount) > 0 ? formatCurrency(Number(order.totalAmount)) : '', shortDate(order.createdAt)].filter(Boolean);
      list.push({ key: `order-${order.id}`, group: 'Orders', title: order.orderNumber ? `#${order.orderNumber.replace(/^#/, '')}` : 'Order', subtitle: parts.join(' · '), right: order.status, icon: 'order', route: orderRoute(order.id) });
    });
    results.customers.forEach((customer) => {
      list.push({ key: `customer-${customer.id}`, group: 'Customers', title: customer.fullName?.trim() || 'Customer', subtitle: [customer.phone, customer.email].filter(Boolean).join(' · '), icon: 'customer', route: `/customer/${customer.id}` });
    });
    results.products.forEach((product) => {
      const variantCount = product.variants?.length ?? 0;
      list.push({ key: `product-${product.id}`, group: 'Products', title: product.name?.trim() || 'Product', subtitle: `${variantCount} ${variantCount === 1 ? 'variant' : 'variants'}${product.categories?.length ? ` · ${product.categories.join(', ')}` : ''}`, icon: 'product', route: `/product/${product.id}` });
    });
    results.pages.forEach((page) => {
      list.push({ key: `page-${page.route}`, group: 'Pages', title: page.label, subtitle: page.description, icon: 'page', route: page.route, PageIcon: page.Icon });
    });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, isDesktop]);

  const suggestedPages = useMemo(() => pages.slice(0, 6), [pages]);

  if (!mounted) return null;

  const groupedRows = ['Orders', 'Customers', 'Products', 'Pages']
    .map((group) => ({ group, items: rows.filter((row) => row.group === group) }))
    .filter((entry) => entry.items.length > 0);
  let runningIndex = 0;

  const iconFor = (row: Pick<Row, 'icon' | 'PageIcon'>) => {
    const props = { size: 18, color: palette.limeOnSurface, strokeWidth: 2 };
    if (row.icon === 'order') return <ShoppingCart {...props} />;
    if (row.icon === 'customer') return <UserIcon {...props} />;
    if (row.icon === 'product') return <Package {...props} />;
    const Icon = row.PageIcon ?? ArrowUpRight;
    return <Icon {...props} />;
  };

  const enter = (index: number) => (reduced ? undefined : FadeInDown.delay(Math.min(index, 9) * 32).duration(240).easing(Easing.out(Easing.cubic)));

  const renderRow = (row: Row, index: number) => (
    <Animated.View key={row.key} entering={enter(index)} layout={reduced ? undefined : LinearTransition.duration(200)}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${row.group.replace(/s$/, '')}: ${row.title}`}
        onPress={() => open(row.route)}
        style={(state) => ({
          minHeight: 62,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: 16,
          backgroundColor: state.pressed ? palette.softFill : isHovered(state) ? palette.softFill : 'transparent',
        })}
      >
        <View style={{ width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.nudgeBg }}>{iconFor(row)}</View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={{ color: palette.text, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>{row.title}</Text>
          {row.subtitle ? <Text style={{ color: palette.faint, fontSize: 12.5 }} numberOfLines={1}>{row.subtitle}</Text> : null}
        </View>
        {row.right ? <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '600', maxWidth: 110 }} numberOfLines={1}>{row.right}</Text> : null}
        <ChevronRight size={16} color={palette.faint} strokeWidth={2.2} />
      </Pressable>
    </Animated.View>
  );

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: palette.isDark ? 'rgba(14,14,14,0.96)' : 'rgba(250,250,247,0.97)' },
          Platform.OS === 'web' ? ({ backdropFilter: 'blur(18px)' } as object) : null,
          backdropStyle,
        ]}
      />
      <Animated.View style={[{ flex: 1, paddingTop: Math.max(insets.top, 12) + 8, paddingHorizontal: 16, width: '100%', maxWidth: 640, alignSelf: 'center' }, panelStyle]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View
            style={{
              flex: 1,
              height: 52,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingLeft: 16,
              paddingRight: 8,
              borderRadius: 999,
              backgroundColor: palette.inset,
              borderWidth: 1.5,
              borderColor: focused ? (palette.isDark ? '#D5E057' : '#B8C43A') : palette.border,
            }}
          >
            <Search size={19} color={palette.muted} strokeWidth={2.2} />
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={setQuery}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onSubmitEditing={() => { if (rows[0]) open(rows[0].route); }}
              onKeyPress={(event) => { if (Platform.OS === 'web' && (event.nativeEvent as { key?: string }).key === 'Escape') onClose(); }}
              placeholder="Search orders, customers, products"
              placeholderTextColor={palette.faint}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Search"
              style={[{ flex: 1, minWidth: 0, height: 50, color: palette.text, fontSize: 16 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null]}
            />
            {hasQuery ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                onPress={() => { setQuery(''); inputRef.current?.focus(); }}
                style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.softFill }}
              >
                <X size={15} color={palette.muted} strokeWidth={2.4} />
              </Pressable>
            ) : null}
          </View>
          <Pressable accessibilityRole="button" onPress={onClose} hitSlop={8} style={{ height: 44, justifyContent: 'center' }}>
            <MoneyText style={{ color: palette.text, fontSize: 15 }}>Cancel</MoneyText>
          </Pressable>
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          style={{ marginTop: 18 }}
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 24, gap: 18 }}
        >
          {!hasQuery ? (
            <>
              {recent.length > 0 ? (
                <Animated.View entering={enter(0)} style={{ gap: 10 }}>
                  <Text style={{ color: palette.faint, fontSize: 11, fontWeight: '600', letterSpacing: 1.3, textTransform: 'uppercase', paddingHorizontal: 4 }}>Recent</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {recent.map((entry) => (
                      <Pressable
                        key={entry}
                        accessibilityRole="button"
                        onPress={() => setQuery(entry)}
                        style={(state) => ({ height: 36, paddingHorizontal: 14, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: palette.outline, backgroundColor: isHovered(state) || state.pressed ? palette.softFill : 'transparent' })}
                      >
                        <Clock3 size={13} color={palette.faint} strokeWidth={2.2} />
                        <Text style={{ color: palette.text, fontSize: 13.5, fontWeight: '500' }} numberOfLines={1}>{entry}</Text>
                      </Pressable>
                    ))}
                  </View>
                </Animated.View>
              ) : null}
              <Animated.View entering={enter(1)} style={{ gap: 4 }}>
                <Text style={{ color: palette.faint, fontSize: 11, fontWeight: '600', letterSpacing: 1.3, textTransform: 'uppercase', paddingHorizontal: 4, marginBottom: 6 }}>Jump to</Text>
                {suggestedPages.map((page, index) => (
                  <Animated.View key={page.route} entering={enter(index + 2)}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => open(page.route)}
                      style={(state) => ({ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: isHovered(state) || state.pressed ? palette.softFill : 'transparent' })}
                    >
                      <View style={{ width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.nudgeBg }}>
                        <page.Icon size={18} color={palette.limeOnSurface} strokeWidth={2} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                        <Text style={{ color: palette.text, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>{page.label}</Text>
                        <Text style={{ color: palette.faint, fontSize: 12.5 }} numberOfLines={1}>{page.description}</Text>
                      </View>
                      <ChevronRight size={16} color={palette.faint} strokeWidth={2.2} />
                    </Pressable>
                  </Animated.View>
                ))}
              </Animated.View>
            </>
          ) : results.total === 0 ? (
            <Animated.View entering={enter(0)} style={{ alignItems: 'center', gap: 8, paddingTop: 48 }}>
              <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.softFill }}>
                <Search size={24} color={palette.faint} strokeWidth={1.9} />
              </View>
              <MoneyText style={{ color: palette.text, fontSize: 18 }}>No results</MoneyText>
              <Text style={{ color: palette.faint, fontSize: 13.5, textAlign: 'center', maxWidth: 280, lineHeight: 19 }}>
                Nothing matches “{query.trim()}”. Try an order number, a customer's name or phone number, or a product SKU.
              </Text>
            </Animated.View>
          ) : (
            groupedRows.map(({ group, items }) => (
              <View key={group} style={{ gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4, marginBottom: 6 }}>
                  <Text style={{ color: palette.faint, fontSize: 11, fontWeight: '600', letterSpacing: 1.3, textTransform: 'uppercase' }}>{group}</Text>
                  <Text style={{ color: palette.faint, fontSize: 11, fontWeight: '600' }}>{items.length}</Text>
                </View>
                {items.map((row) => renderRow(row, runningIndex++))}
              </View>
            ))
          )}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}
