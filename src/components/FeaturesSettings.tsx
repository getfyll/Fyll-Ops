import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, ClipboardList, FileText, Info, Megaphone, Printer, RotateCcw, Truck } from 'lucide-react-native';
import { FYLL_LIME, FYLL_LIME_INK, MoneyText, usePaymentsPalette } from '@/components/payments/payments-ui';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { supabase } from '@/lib/supabase';
import useAuthStore from '@/lib/state/auth-store';
import useFyllStore from '@/lib/state/fyll-store';
import { getFyllPrintQueue } from '@/lib/fyll-print-queue';
import { normalizeMerchantFeatureSwitches, type BusinessFeatureKey } from '@/lib/feature-access';

export type FeatureRowKey = 'delivery' | 'returns' | 'fyllPrint' | 'tasks' | 'cases' | 'finance' | 'announcements';

const FEATURES: { key: FeatureRowKey; name: string; what: string; Icon: typeof Truck }[] = [
  { key: 'delivery', name: 'Delivery', what: 'Dispatch, confirmations and fulfillment timelines', Icon: Truck },
  { key: 'returns', name: 'Returns', what: 'Return requests and pickups', Icon: RotateCcw },
  { key: 'fyllPrint', name: 'Fyll Print', what: 'Labels and packing slips', Icon: Printer },
  { key: 'tasks', name: 'Tasks', what: 'Assigned and recurring work', Icon: ClipboardList },
  { key: 'cases', name: 'Cases', what: 'Customer issues and follow-ups', Icon: FileText },
  { key: 'finance', name: 'Finance', what: 'Expenses and procurement', Icon: Banknote },
  { key: 'announcements', name: 'Announcements', what: 'Simple updates to customers', Icon: Megaphone },
];

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

// Turn tools on or off for the whole team. Off only hides the tool; nothing is deleted. Fyll can still switch a
// feature off for a business, in which case it shows as not available and the switch is locked.
export function FeaturesSettings({ onConfigure }: { onConfigure: (feature: FeatureRowKey) => void }) {
  const palette = usePaymentsPalette();
  const { width } = useWindowDimensions();
  const wide = width >= 860;
  const queryClient = useQueryClient();
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const isAdmin = useAuthStore((s) => s.currentUser?.role === 'admin');
  const { platformFeatureAccess, enabledFeatures } = useBusinessSettings();

  const cases = useFyllStore((s) => s.cases);
  const returns = useFyllStore((s) => s.returns);
  const expenseRequests = useFyllStore((s) => s.expenseRequests);
  const orderTypeCount = useFyllStore((s) => s.orderTimelineSettings.orderTypes.length);

  const printAvailable = platformFeatureAccess.fyllPrint && enabledFeatures.fyllPrint !== false;
  const printQueueQuery = useQuery({
    queryKey: ['fyll-print-queue-count', businessId],
    enabled: Boolean(businessId) && printAvailable,
    queryFn: async () => {
      const queue = await getFyllPrintQueue(businessId);
      return queue.inventory.length + queue.shipping.length;
    },
  });

  const [savingKey, setSavingKey] = useState<FeatureRowKey | null>(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<{ key: FeatureRowKey; name: string; message: string } | null>(null);

  // Real counts only. A feature without a cheap count shows its plain description instead.
  const openItems = useMemo((): Partial<Record<FeatureRowKey, { count: number; label: string; status: string }>> => {
    const openCases = cases.filter((item) => item.status !== 'Closed' && item.status !== 'Resolved').length;
    const openReturns = returns.filter((item) => item.status === 'initiated' || item.status === 'picked_up' || item.status === 'received').length;
    const pendingExpenses = expenseRequests.filter((request) => request.status === 'submitted').length;
    const queued = printQueueQuery.data;
    return {
      delivery: orderTypeCount > 0 ? { count: 0, label: '', status: plural(orderTypeCount, 'fulfillment timeline', 'fulfillment timelines') } : undefined,
      returns: { count: openReturns, label: 'open return requests', status: openReturns > 0 ? `${openReturns} open` : 'No open returns' },
      cases: { count: openCases, label: 'open cases', status: openCases > 0 ? `${openCases} open` : 'No open cases' },
      finance: { count: pendingExpenses, label: 'expense requests waiting', status: pendingExpenses > 0 ? `${plural(pendingExpenses, 'request', 'requests')} pending` : 'Nothing pending' },
      fyllPrint: queued === undefined ? undefined : { count: queued, label: 'items in the print queue', status: queued > 0 ? `${queued} in queue` : 'Queue empty' },
    };
  }, [cases, expenseRequests, orderTypeCount, printQueueQuery.data, returns]);

  const rows = FEATURES.map((feature) => {
    const platformOn = platformFeatureAccess[feature.key as BusinessFeatureKey] !== false;
    const on = platformOn && enabledFeatures[feature.key as BusinessFeatureKey] !== false;
    const info = openItems[feature.key];
    return {
      ...feature,
      platformOn,
      on,
      status: !platformOn ? 'Not available for your business' : !on ? 'Off' : info?.status ?? feature.what,
      hasStatusFigure: Boolean(on && info),
      openCount: info?.count ?? 0,
      openLabel: info?.label ?? '',
    };
  });
  const onCount = rows.filter((row) => row.on).length;

  const persist = async (key: FeatureRowKey, value: boolean) => {
    if (!businessId) return;
    setSavingKey(key);
    setError('');
    try {
      const { data: row, error: readError } = await supabase.from('businesses').select('data').eq('id', businessId).maybeSingle();
      if (readError) throw readError;
      const existing = (row?.data as Record<string, unknown> | null) ?? {};
      const switches = { ...normalizeMerchantFeatureSwitches(existing.enabledFeatures), [key]: value };
      const { error: writeError } = await supabase
        .from('businesses')
        .update({ data: { ...existing, enabledFeatures: switches } })
        .eq('id', businessId);
      if (writeError) throw writeError;
      await queryClient.invalidateQueries({ queryKey: ['businessSettings'] });
    } catch {
      setError('Could not save that change. Please try again.');
    } finally {
      setSavingKey(null);
    }
  };

  const flip = (row: (typeof rows)[number]) => {
    if (!isAdmin || !row.platformOn || savingKey) return;
    if (row.on && row.openCount > 0) {
      setConfirm({ key: row.key, name: row.name, message: `${row.name} has ${row.openCount} ${row.openLabel}. Turn it off anyway? Nothing is deleted, and turning it back on restores everything.` });
      return;
    }
    void persist(row.key, !row.on);
  };

  return (
    <View style={{ gap: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <MoneyText style={{ color: palette.text, fontSize: 26, letterSpacing: -0.8 }}>Features</MoneyText>
          <Text style={{ color: palette.faint, fontSize: 14, lineHeight: 20 }}>Turn tools on or off for your team, and see how each one is set up.</Text>
        </View>
        <View style={{ height: 28, paddingHorizontal: 12, borderRadius: 999, backgroundColor: palette.nudgeBg, justifyContent: 'center' }}>
          <Text style={{ color: palette.limeOnSurface, fontSize: 12, fontWeight: '600' }}>{onCount} of {rows.length} on</Text>
        </View>
      </View>

      {!isAdmin ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, backgroundColor: palette.softFill }}>
          <Info size={15} color={palette.muted} strokeWidth={2} />
          <Text style={{ color: palette.muted, fontSize: 13, flex: 1 }}>Only admins can turn features on or off.</Text>
        </View>
      ) : null}
      {error ? (
        <View style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, backgroundColor: palette.dangerBg, borderWidth: 1, borderColor: palette.dangerBorder }}>
          <Text style={{ color: palette.danger, fontSize: 13, fontWeight: '600' }}>{error}</Text>
        </View>
      ) : null}

      <View style={{ borderRadius: 22, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, paddingHorizontal: 22 }}>
        {rows.map((row, index) => {
          const Icon = row.Icon;
          const canFlip = isAdmin && row.platformOn;
          return (
            <View
              key={row.key}
              style={{ flexDirection: 'row', alignItems: 'center', flexWrap: wide ? 'nowrap' : 'wrap', gap: 16, paddingVertical: 16, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: palette.hairline, opacity: row.platformOn ? (row.on ? 1 : 0.75) : 0.55 }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: palette.softFill, alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={19} color={palette.textSoft} strokeWidth={1.9} />
              </View>
              <View style={{ flex: 1, minWidth: 160, gap: 3 }}>
                <Text style={{ color: palette.text, fontSize: 15, fontWeight: '600' }}>{row.name}</Text>
                <Text style={{ color: palette.faint, fontSize: 13 }}>{row.what}</Text>
              </View>
              <View style={{ width: wide ? 230 : undefined, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: row.on ? palette.tones.verified.dot : palette.outline }} />
                <Text style={{ color: row.on ? palette.textSoft : palette.faint, fontSize: 13, flexShrink: 1 }} numberOfLines={2}>{row.status}</Text>
              </View>
              <Pressable
                accessibilityRole="switch"
                accessibilityState={{ checked: row.on, disabled: !canFlip }}
                accessibilityLabel={`${row.name} ${row.on ? 'on' : 'off'}`}
                onPress={() => flip(row)}
                disabled={!canFlip || savingKey !== null}
                style={{ width: 44, height: 26, borderRadius: 13, padding: 3, justifyContent: 'center', alignItems: row.on ? 'flex-end' : 'flex-start', backgroundColor: row.on ? FYLL_LIME : palette.outline, opacity: canFlip ? 1 : 0.6 }}
              >
                {savingKey === row.key ? (
                  <ActivityIndicator size="small" color={row.on ? FYLL_LIME_INK : palette.text} style={{ alignSelf: 'center' }} />
                ) : (
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: row.on ? FYLL_LIME_INK : palette.textSoft }} />
                )}
              </Pressable>
              <Pressable
                onPress={() => onConfigure(row.key)}
                disabled={!row.on}
                style={{ height: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: palette.outline, alignItems: 'center', justifyContent: 'center', opacity: row.on ? 1 : 0.4 }}
              >
                <Text style={{ color: palette.text, fontSize: 13, fontWeight: '600' }}>Configure</Text>
              </Pressable>
            </View>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, paddingHorizontal: 20, borderRadius: 18, borderWidth: 1, borderStyle: 'dashed', borderColor: palette.outline }}>
        <Info size={18} color={palette.limeOnSurface} strokeWidth={2} />
        <Text style={{ flex: 1, color: palette.textSoft, fontSize: 13.5, lineHeight: 20 }}>
          Customers now has its own place in the main menu. Importing contacts lives in Data → Import & export.
        </Text>
      </View>

      <Modal transparent visible={Boolean(confirm)} animationType="fade" onRequestClose={() => setConfirm(null)}>
        <Pressable onPress={() => setConfirm(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Pressable onPress={(event) => event.stopPropagation?.()} style={{ width: '100%', maxWidth: 400, borderRadius: 24, padding: 22, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border }}>
            <MoneyText style={{ color: palette.text, fontSize: 20, letterSpacing: -0.5 }}>Turn off {confirm?.name}?</MoneyText>
            <Text style={{ color: palette.muted, fontSize: 14, lineHeight: 20, marginTop: 8 }}>{confirm?.message}</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <Pressable onPress={() => setConfirm(null)} style={{ flex: 1, height: 46, borderRadius: 999, borderWidth: 1, borderColor: palette.outline, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>Keep it on</Text>
              </Pressable>
              <Pressable
                onPress={() => { const target = confirm; setConfirm(null); if (target) void persist(target.key, false); }}
                style={{ flex: 1, height: 46, borderRadius: 999, backgroundColor: FYLL_LIME, alignItems: 'center', justifyContent: 'center' }}
              >
                <MoneyText style={{ color: FYLL_LIME_INK, fontSize: 15 }}>Turn off</MoneyText>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
