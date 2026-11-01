import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Award } from 'lucide-react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import useAuthStore from '@/lib/state/auth-store';
import { supabase } from '@/lib/supabase';
import { useResolvedThemeMode } from '@/lib/theme';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { LimeToggle } from '@/components/settings/LimeToggle';

// Settings toggle: "Show your order milestone on your store". Off by default. It is saved on the business record
// (businesses.data.showMilestoneOnStore) straight away; the storefront reads it through get_public_milestone_badge.
export function MilestoneBadgeSetting() {
  const isDark = useResolvedThemeMode() === 'dark';
  const { isDesktop } = useBreakpoint();
  const titleSize = isDesktop ? 15 : 14;
  const palette = isDark
    ? {
        surface: '#1E1E1E', ink: '#F4F4EF', muted: '#B9BAB0', faint: '#8C8D84', lime: '#D5E057', limeInk: '#D5E057',
        edge: 'rgba(255,255,255,0.09)', edgeStrong: 'rgba(255,255,255,0.14)', wash: 'rgba(213,224,87,0.14)', danger: '#E5776D',
      }
    : {
        surface: '#FFFFFF', ink: '#202117', muted: '#5E6056', faint: '#85877C', lime: '#D5E057', limeInk: '#667000',
        edge: 'rgba(35,38,25,0.09)', edgeStrong: 'rgba(35,38,25,0.15)', wash: 'rgba(135,148,0,0.13)', danger: '#C9574D',
      };
  const queryClient = useQueryClient();
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const isAdmin = useAuthStore((s) => s.currentUser?.role === 'admin');

  const settingQuery = useQuery({
    queryKey: ['milestone-badge-setting', businessId],
    queryFn: async () => {
      const { data, error } = await supabase.from('businesses').select('data').eq('id', businessId!).maybeSingle();
      if (error) throw error;
      return String((data?.data as Record<string, unknown> | null)?.showMilestoneOnStore ?? 'false').toLowerCase() === 'true';
    },
    enabled: Boolean(businessId),
  });

  const [on, setOn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (settingQuery.data !== undefined) setOn(settingQuery.data);
  }, [settingQuery.data]);

  const toggle = async (value: boolean) => {
    if (!businessId || !isAdmin || saving) return;
    setOn(value);
    setSaving(true);
    setError('');
    try {
      const { data: row, error: readError } = await supabase.from('businesses').select('data').eq('id', businessId).maybeSingle();
      if (readError) throw readError;
      const existing = (row?.data as Record<string, unknown> | null) ?? {};
      const { error: writeError } = await supabase
        .from('businesses')
        .update({ data: { ...existing, showMilestoneOnStore: value } })
        .eq('id', businessId);
      if (writeError) throw writeError;
      await queryClient.invalidateQueries({ queryKey: ['milestone-badge-setting', businessId] });
    } catch {
      setOn(!value);
      setError('Could not save that change. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ borderRadius: 26, padding: 18, marginBottom: 26, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.edge }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
        <View style={{ width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.wash }}>
          <Award size={20} color={palette.limeInk} strokeWidth={2} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: palette.ink, fontSize: titleSize, fontWeight: '600' }}>Order milestone badge</Text>
          <Text style={{ color: palette.faint, fontSize: 12, lineHeight: 17, marginTop: 2 }}>{on ? 'Visible on your storefront' : 'Hidden from your storefront'}</Text>
        </View>
        <LimeToggle
          value={on}
          onValueChange={toggle}
          disabled={!isAdmin || saving || settingQuery.isLoading}
          accessibilityLabel="Order milestone badge"
          activeColor={palette.lime}
          inactiveColor={isDark ? 'rgba(255,255,255,0.04)' : 'rgba(35,38,25,0.04)'}
          inactiveBorderColor={palette.edgeStrong}
        />
      </View>
      <View style={{ height: 1, backgroundColor: palette.edge, marginVertical: 16 }} />
      <Text style={{ color: palette.muted, fontSize: 12.5, lineHeight: 19 }}>
        Shows your highest order milestone beside the store name, such as “1,000+ orders”. It appears after the business reaches 100 orders.
      </Text>
      {!isAdmin ? <Text style={{ color: palette.faint, fontSize: 12, marginTop: 10 }}>Only owners and admins can change this.</Text> : null}
      {error ? <Text style={{ color: palette.danger, fontSize: 12, marginTop: 10 }}>{error}</Text> : null}
    </View>
  );
}
