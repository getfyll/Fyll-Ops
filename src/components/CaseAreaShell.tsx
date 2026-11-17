import React from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SearchClearButton } from '@/components/SearchClearButton';
import { ChevronRight, Search } from 'lucide-react-native';
import { FYLL_LIME, FYLL_LIME_INK, isHovered, usePaymentsPalette } from '@/components/payments/payments-ui';
import { BricolageGrotesque_700Bold, useFonts } from '@expo-google-fonts/bricolage-grotesque';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { DesktopSidebar } from '@/components/DesktopSidebar';
import { FocusBottomNav } from '@/components/FocusBottomNav';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { useThemeColors } from '@/lib/theme';
import { DESKTOP_PAGE_HEADER_MIN_HEIGHT, usePageHeadingStyle } from '@/lib/page-heading';
import { useCaseNavItems, type CaseNavKey } from '@/lib/useCaseNavItems';

// Page frame for the Cases area lists (Replacements, Refunds): sidebar on web, Cases nav on phones.
export function CaseAreaShell({ title, subtitle, navKey, children }: { title: string; subtitle?: string; navKey: CaseNavKey; children: React.ReactNode }) {
  const colors = useThemeColors();
  const router = useRouter();
  const { isDesktop, isMobile } = useBreakpoint();
  const headingStyle = usePageHeadingStyle(isMobile);
  const navItems = useCaseNavItems(navKey);
  const padX = isMobile ? 16 : isDesktop ? 28 : 20;

  const body = (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <SafeAreaView style={{ flex: 1 }} edges={isDesktop ? [] : ['top']}>
        <ScrollView contentContainerStyle={{ width: '100%', maxWidth: isDesktop ? 1456 : undefined, alignSelf: 'flex-start', paddingHorizontal: padX, paddingBottom: isMobile ? 200 : 40 }}>
          <View style={{ minHeight: isDesktop ? DESKTOP_PAGE_HEADER_MIN_HEIGHT : undefined, paddingTop: isDesktop ? 28 : 14, paddingBottom: 14 }}>
            <Text style={[headingStyle, { color: colors.text.primary }]}>{title}</Text>
            {subtitle && !isMobile ? (
              <Text style={{ color: colors.text.muted, fontSize: 14, fontWeight: '400', marginTop: 4, lineHeight: 20 }} numberOfLines={1}>{subtitle}</Text>
            ) : null}
          </View>
          {children}
        </ScrollView>
        {isMobile ? <FocusBottomNav items={navItems} onHome={() => router.navigate('/(tabs)' as never)} /> : null}
      </SafeAreaView>
    </View>
  );

  if (isDesktop) {
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.bg.primary }}>
        <DesktopSidebar />
        <View style={{ flex: 1 }}>{body}</View>
      </View>
    );
  }
  return body;
}

export type CaseAreaFilter<K extends string> = { key: K; label: string; count: number };

// Small filter pills, same size as the Payments and Restock filters.
// Search box on the left with the status pills beside it (search sits above the pills on phones).
export function CaseAreaPills<K extends string>({ filters, value, onChange, search, onSearch, searchPlaceholder = 'Search' }: { filters: CaseAreaFilter<K>[]; value: K; onChange: (key: K) => void; search?: string; onSearch?: (text: string) => void; searchPlaceholder?: string }) {
  const palette = usePaymentsPalette();
  const colors = useThemeColors();
  const { isMobile } = useBreakpoint();
  const pills = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6, alignItems: 'center' }}>
      {filters.map((filter) => {
        const on = filter.key === value;
        return (
          <Pressable
            key={filter.key}
            onPress={() => onChange(filter.key)}
            style={(state) => ({ height: 32, paddingHorizontal: 12, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: on ? palette.inverseBg : isHovered(state) ? palette.softFill : 'transparent', borderWidth: on ? 0 : 1, borderColor: palette.border })}
          >
            <Text style={{ color: on ? palette.inverseText : palette.textSoft, fontSize: 12, fontWeight: '600' }}>{filter.label}</Text>
            <Text style={{ color: on ? palette.inverseText : palette.faint, fontSize: 11, fontWeight: '500', opacity: on ? 0.7 : 1 }}>{filter.count}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
  const searchBox = onSearch ? (
    <View style={{ height: 40, width: isMobile ? '100%' : 320, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: palette.border, backgroundColor: colors.bg.card }}>
      <Search size={15} color={colors.text.muted} strokeWidth={2} />
      <TextInput
        value={search ?? ''}
        onChangeText={onSearch}
        placeholder={searchPlaceholder}
        placeholderTextColor={colors.text.muted}
        style={{ flex: 1, color: colors.text.primary, fontSize: 13, outlineStyle: 'none' } as object}
      />
      <SearchClearButton visible={Boolean(search?.trim())} onPress={() => onSearch('')} />
    </View>
  ) : null;
  return (
    <View style={{ flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: 10, marginBottom: 12 }}>
      {searchBox}
      {pills}
    </View>
  );
}

export type CaseAreaDateRange = '7d' | 'month' | '30d' | 'year';
const DATE_TABS: { key: CaseAreaDateRange; label: string }[] = [
  { key: '7d', label: 'Last 7 days' },
  { key: 'month', label: 'This Month' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'year', label: 'This Year' },
];

// Same windows as the Returns page.
export const inDateRange = (iso: string | undefined, range: CaseAreaDateRange) => {
  const time = iso ? new Date(iso).getTime() : NaN;
  if (!Number.isFinite(time)) return false;
  const now = new Date();
  const start = new Date(now);
  if (range === '7d') start.setDate(now.getDate() - 7);
  else if (range === '30d') start.setDate(now.getDate() - 30);
  else if (range === 'month') { start.setDate(1); start.setHours(0, 0, 0, 0); }
  else { start.setMonth(0, 1); start.setHours(0, 0, 0, 0); }
  return time >= start.getTime();
};

// The date switcher used on Returns: a rounded track with the chosen range in lime.
export function CaseAreaDateTabs({ value, onChange }: { value: CaseAreaDateRange; onChange: (range: CaseAreaDateRange) => void }) {
  const colors = useThemeColors();
  const { isMobile } = useBreakpoint();
  const isDark = colors.text.primary === '#FFFFFF';
  return (
    <View style={{ flexDirection: 'row', padding: 4, borderRadius: 999, backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB', width: isMobile ? '100%' : 460, marginBottom: 14 }}>
      {DATE_TABS.map((tab) => {
        const on = tab.key === value;
        return (
          <Pressable key={tab.key} onPress={() => onChange(tab.key)} style={{ flex: 1, height: 34, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? FYLL_LIME : 'transparent' }}>
            <Text style={{ color: on ? FYLL_LIME_INK : colors.text.muted, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export type CaseAreaStat = { label: string; value: string; hint?: string; dot?: string };

// Summary card, built exactly like the one on Cases (white card, grey dividers).
export function CaseAreaStats({ hero, stats }: { hero: CaseAreaStat; stats: CaseAreaStat[] }) {
  const colors = useThemeColors();
  const { isMobile } = useBreakpoint();
  const [bricolageLoaded] = useFonts({ BricolageGrotesque_700Bold });
  const isDark = colors.text.primary === '#FFFFFF';
  const separatorColor = isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB';
  const label = { color: colors.text.tertiary, fontSize: 10, fontWeight: '600' as const, letterSpacing: 0.6, textTransform: 'uppercase' as const };
  const heroFont = { fontWeight: (bricolageLoaded ? '400' : '700') as '400' | '700', fontFamily: bricolageLoaded ? 'BricolageGrotesque_700Bold' : undefined };

  if (isMobile) {
    return (
      <View style={{ borderRadius: 20, borderWidth: 1, borderColor: separatorColor, backgroundColor: colors.bg.card, padding: 18, gap: 14, marginBottom: 14 }}>
        <View style={{ gap: 4 }}>
          <Text style={label}>{hero.label}</Text>
          <Text style={[{ color: colors.text.primary, fontSize: 32, lineHeight: 36, letterSpacing: -1 }, heroFont]} numberOfLines={1}>{hero.value}</Text>
          {hero.hint ? <Text style={{ color: colors.text.muted, fontSize: 13 }}>{hero.hint}</Text> : null}
        </View>
        <View style={{ height: 1, backgroundColor: separatorColor }} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {stats.map((stat) => (
            <View key={stat.label} style={{ flex: 1, gap: 3 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: stat.dot ?? colors.text.muted }} />
                <Text style={{ color: colors.text.tertiary, fontSize: 12 }} numberOfLines={1}>{stat.label}</Text>
              </View>
              <Text style={{ color: colors.text.primary, fontSize: 18, fontWeight: '600' }} numberOfLines={1}>{stat.value}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={{ flexDirection: 'row', borderRadius: 20, borderWidth: 1, borderColor: separatorColor, backgroundColor: colors.bg.card, overflow: 'hidden', marginBottom: 18 }}>
      {[hero, ...stats].map((stat, index) => (
        <View key={stat.label} style={{ flex: index ? 1 : 1.3, paddingHorizontal: 22, paddingVertical: 18, gap: 4, borderLeftWidth: index ? 1 : 0, borderLeftColor: separatorColor }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {index && stat.dot ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: stat.dot }} /> : null}
            <Text style={label}>{stat.label}</Text>
          </View>
          <Text style={[{ color: colors.text.primary, fontSize: index ? 22 : 28, letterSpacing: index ? -0.5 : -0.9 }, index ? { fontWeight: '600' } : heroFont]} numberOfLines={1}>{stat.value}</Text>
          {stat.hint ? <Text style={{ color: colors.text.muted, fontSize: 13 }} numberOfLines={1}>{stat.hint}</Text> : null}
        </View>
      ))}
    </View>
  );
}

const dayKey = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? 'unknown' : `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

// Same day headings as the Cases list.
const dayLabel = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const difference = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86_400_000);
  if (difference === 0) return 'Today';
  if (difference === 1) return `Yesterday · ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

export type CaseAreaColumn = { label: string; flex: number; align?: 'left' | 'right' };

export type CaseAreaRowData = { cells?: string[]; id: string; at: string; title: string; ref?: string; meta: string; date: string; status: string; statusColor: string; amount?: string; onPress: () => void };

// List card in the Cases style. On phones each row is two short lines: name + amount/status, then reference and date.
export function CaseAreaList({ rows, columns }: { rows: CaseAreaRowData[]; columns?: CaseAreaColumn[] }) {
  const colors = useThemeColors();
  const { isMobile } = useBreakpoint();
  const isDark = colors.text.primary === '#FFFFFF';
  const separatorColor = isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB';

  const renderRow = (row: CaseAreaRowData, withTopBorder: boolean) => {
    const chip = (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: row.statusColor }} />
        <Text style={{ color: colors.text.secondary, fontSize: isMobile ? 10 : 12, fontWeight: '500' }} numberOfLines={1}>{row.status}</Text>
      </View>
    );
    return (
      <Pressable
        key={row.id}
        onPress={row.onPress}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: isMobile ? 14 : 22, paddingVertical: isMobile ? 10 : 14, borderTopWidth: withTopBorder ? 1 : 0, borderTopColor: separatorColor, backgroundColor: pressed ? colors.bg.secondary : colors.bg.card })}
      >
        {isMobile ? (
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ flex: 1, color: colors.text.primary, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>{row.title}</Text>
              {row.amount ? <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }}>{row.amount}</Text> : chip}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ flex: 1, color: colors.text.muted, fontSize: 10 }} numberOfLines={1}>{row.ref}</Text>
              {row.amount ? chip : null}
            </View>
          </View>
        ) : (
          columns && row.cells ? (
            <>
              {columns.map((column, cellIndex) => (
                <View key={column.label} style={{ flex: column.flex, minWidth: 0 }}>
                  {column.label === 'Status' ? chip : (
                    <Text style={{ color: cellIndex === 0 || column.align === 'right' ? colors.text.primary : colors.text.secondary, fontSize: column.align === 'right' ? 13 : 12, fontWeight: cellIndex === 0 || column.align === 'right' ? '600' : '400', textAlign: column.align ?? 'left' }} numberOfLines={1}>{row.cells?.[cellIndex] || '—'}</Text>
                  )}
                </View>
              ))}
              <ChevronRight size={15} color={colors.text.muted} />
            </>
          ) : (
          <>
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>
                {row.title}{row.ref ? <Text style={{ color: colors.text.muted, fontWeight: '500' }}>{`  ${row.ref}`}</Text> : null}
              </Text>
              <Text style={{ color: colors.text.muted, fontSize: 12 }} numberOfLines={1}>{row.meta}</Text>
            </View>
            <View style={{ width: 170 }}>{chip}</View>
            {row.amount ? <Text style={{ minWidth: 90, textAlign: 'right', color: colors.text.primary, fontSize: 14, fontWeight: '600' }}>{row.amount}</Text> : null}
            <ChevronRight size={15} color={colors.text.muted} />
          </>
          )
        )}
      </Pressable>
    );
  };

  // Rows arrive newest first; split them into days.
  const groups: { key: string; label: string; rows: CaseAreaRowData[] }[] = [];
  rows.forEach((row) => {
    const key = dayKey(row.at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.rows.push(row);
    else groups.push({ key, label: dayLabel(row.at), rows: [row] });
  });

  if (isMobile) {
    return (
      <View style={{ gap: 18 }}>
        {groups.map((group) => (
          <View key={group.key}>
            <Text style={{ color: colors.text.muted, fontSize: 10, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', paddingHorizontal: 4, marginBottom: 8 }}>{group.label}</Text>
            <View style={{ borderRadius: 18, borderWidth: 1, borderColor: separatorColor, overflow: 'hidden', backgroundColor: colors.bg.card }}>
              {group.rows.map((row, index) => renderRow(row, index > 0))}
            </View>
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: separatorColor, borderRadius: 20, overflow: 'hidden' }}>
      {columns ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 22, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: separatorColor }}>
          {columns.map((column) => (
            <Text key={column.label} style={{ flex: column.flex, textAlign: column.align ?? 'left', color: colors.text.muted, fontSize: 10, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' }} numberOfLines={1}>{column.label}</Text>
          ))}
          <View style={{ width: 15 }} />
        </View>
      ) : null}
      {groups.map((group, groupIndex) => (
        <React.Fragment key={group.key}>
          <View style={{ paddingHorizontal: 22, paddingTop: 10, paddingBottom: 8, backgroundColor: isDark ? '#101010' : '#F7F7F7', borderTopWidth: groupIndex ? 1 : 0, borderTopColor: separatorColor, borderBottomWidth: 1, borderBottomColor: separatorColor }}>
            <Text style={{ color: colors.text.secondary, fontSize: 10, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' }}>{group.label}</Text>
          </View>
          {group.rows.map((row, index) => renderRow(row, index > 0))}
        </React.Fragment>
      ))}
    </View>
  );
}
