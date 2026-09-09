import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft, ChevronDown, Hash, Info, MoreVertical, Pencil, Search, Trash2 } from 'lucide-react-native';
import useAuthStore from '@/lib/state/auth-store';
import { useResolvedThemeMode, useThemeColors } from '@/lib/theme';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { CollaborationThreadPanel } from '@/components/CollaborationThreadPanel';
import { getTeamThreadChannelById, TEAM_THREAD_CHANNELS } from '@/lib/team-threads';
import { getTabBarStyle } from '@/lib/tab-bar-style';

export default function TeamThreadScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const colors = useThemeColors();
  const { isMobile, isDesktop } = useBreakpoint();
  const isDark = useResolvedThemeMode() === 'dark';
  const businessId = useAuthStore((state) => state.businessId ?? state.currentUser?.businessId ?? null);
  const isOfflineMode = useAuthStore((state) => state.isOfflineMode);
  const params = useLocalSearchParams<{ channel?: string | string[] }>();
  const [showInfo, setShowInfo] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const channelId = Array.isArray(params.channel) ? params.channel[0] : params.channel;
  const activeChannel = useMemo(
    () => getTeamThreadChannelById(channelId) ?? TEAM_THREAD_CHANNELS[0],
    [channelId]
  );

  // This screen always shows an open conversation — hide the floating
  // bottom tab bar so it doesn't sit over the message composer. Restoring
  // must use the app's actual tab bar style, not `undefined` — React
  // Navigation's options merge treats an explicit `undefined` as an
  // override, which falls back to its plain default bar instead of the
  // screenOptions-level floating pill style.
  useEffect(() => {
    const parent = navigation.getParent();
    if (!parent) return;
    const restoredStyle = getTabBarStyle(colors, isDesktop, isMobile);
    parent.setOptions({ tabBarStyle: { display: 'none' } });
    return () => {
      parent.setOptions({ tabBarStyle: restoredStyle });
    };
  }, [navigation, colors, isDesktop, isMobile]);

  return (
    <SafeAreaView className="flex-1" edges={['top']} style={{ backgroundColor: colors.bg.primary }}>
      {/* Header */}
      <View
        style={{
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: colors.border.light,
          backgroundColor: colors.bg.card,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        {/* Back */}
        <Pressable
          onPress={() => router.back()}
          className="active:opacity-70 items-center justify-center"
          style={{ width: 32, height: 32, borderRadius: 16, marginRight: 6 }}
        >
          <ArrowLeft size={22} color={colors.text.primary} strokeWidth={2.2} />
        </Pressable>

        {/* Channel icon */}
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.bg.secondary,
            marginRight: 8,
          }}
        >
          <Hash size={17} color={colors.text.primary} strokeWidth={2.1} />
        </View>

        {/* Channel name — tappable for info */}
        <Pressable onPress={() => setShowInfo(true)} style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text
              style={{ color: colors.text.primary, fontSize: 16, fontWeight: '700' }}
              numberOfLines={1}
            >
              {activeChannel.name}
            </Text>
            <ChevronDown size={14} color={colors.text.muted} strokeWidth={2.5} />
          </View>
          <Text style={{ color: colors.text.muted, fontSize: 12, marginTop: 1 }} numberOfLines={1}>
            Team thread · tap for info
          </Text>
        </Pressable>

        {/* Search */}
        <Pressable
          onPress={() => setShowSearch(true)}
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 2,
          }}
        >
          <Search size={19} color={colors.text.secondary} strokeWidth={2.1} />
        </Pressable>

        {/* Kebab */}
        <Pressable
          onPress={() => setShowMenu(true)}
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MoreVertical size={20} color={colors.text.secondary} strokeWidth={2} />
        </Pressable>
      </View>

      <CollaborationThreadPanel
        businessId={businessId}
        entityType="case"
        entityId={activeChannel.entityId}
        displayEntityId={activeChannel.name}
        isOfflineMode={isOfflineMode}
        variant="pane"
        showHeader={false}
        forceShowInfo={showInfo}
        onInfoModalDismiss={() => setShowInfo(false)}
        forceShowSearch={showSearch}
        onSearchDismiss={() => setShowSearch(false)}
      />

      {/* Kebab context menu modal */}
      <Modal
        visible={showMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMenu(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }}
          onPress={() => setShowMenu(false)}
        >
          <Pressable
            onPress={() => {}}
            style={{
              position: 'absolute',
              top: 60,
              right: 16,
              width: 220,
              backgroundColor: isDark ? '#2C2C2E' : '#FFFFFF',
              borderRadius: 14,
              overflow: 'hidden',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: isDark ? 0.5 : 0.18,
              shadowRadius: 16,
              elevation: 12,
            }}
          >
            <Pressable
              onPress={() => { setShowMenu(false); setShowInfo(true); }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 16,
                paddingVertical: 13,
                gap: 12,
                borderBottomWidth: 0.5,
                borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)',
              }}
            >
              <Info size={18} color={colors.text.primary} strokeWidth={2} />
              <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: '500' }}>
                Thread Info
              </Text>
            </Pressable>
            <Pressable
              onPress={() => { setShowMenu(false); }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 16,
                paddingVertical: 13,
                gap: 12,
                borderBottomWidth: 0.5,
                borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)',
              }}
            >
              <Pencil size={18} color={colors.text.primary} strokeWidth={2} />
              <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: '500' }}>
                Edit Thread
              </Text>
            </Pressable>
            <Pressable
              onPress={() => { setShowMenu(false); }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 16,
                paddingVertical: 13,
                gap: 12,
              }}
            >
              <Trash2 size={18} color="#EF4444" strokeWidth={2} />
              <Text style={{ color: '#EF4444', fontSize: 15, fontWeight: '500' }}>
                Delete Thread
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
