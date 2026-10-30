import React, { useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { Award } from 'lucide-react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import useAuthStore from '@/lib/state/auth-store';
import { supabase } from '@/lib/supabase';
import { useThemeColors } from '@/lib/theme';

// Settings toggle: "Show your order milestone on your store". Off by default. It is saved on the business record
// (businesses.data.showMilestoneOnStore) straight away; the storefront reads it through get_public_milestone_badge.
export function MilestoneBadgeSetting() {
  const colors = useThemeColors();
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
    <View className="rounded-xl p-4 mb-6" style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}>
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-4">
          <View className="flex-row items-center mb-2">
            <Award size={16} color={colors.text.tertiary} strokeWidth={2} />
            <Text style={{ color: colors.text.secondary }} className="text-sm font-medium ml-2">Show your order milestone on your store</Text>
          </View>
          <Text style={{ color: colors.text.muted }} className="text-xs leading-5">
            Shows a small badge near your store name with the highest milestone you have reached, like “1,000+ orders”. It stays hidden until you reach 100 orders.
          </Text>
          {!isAdmin ? <Text style={{ color: colors.text.muted }} className="text-xs mt-2">Only owners and admins can change this.</Text> : null}
        </View>
        <Switch
          value={on}
          onValueChange={toggle}
          disabled={!isAdmin || saving || settingQuery.isLoading}
          trackColor={{ false: colors.border.medium, true: colors.text.primary }}
          thumbColor={colors.bg.primary}
        />
      </View>
      {error ? <Text className="text-red-500 text-xs mt-3">{error}</Text> : null}
    </View>
  );
}
