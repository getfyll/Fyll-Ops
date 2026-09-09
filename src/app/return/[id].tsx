import React, { useEffect, useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, CheckCircle2, ChevronDown, ExternalLink, FileText, Image as ImageIcon, PackageCheck, Truck, X } from 'lucide-react-native';
import { DesktopSidebar } from '@/components/DesktopSidebar';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { useTabBarHeight } from '@/lib/useTabBarHeight';
import { useResolvedThemeMode, useThemeColors } from '@/lib/theme';
import useAuthStore from '@/lib/state/auth-store';
import useFyllStore, {
  RETURN_REASONS,
  RETURN_RESOLUTIONS,
  RETURN_STATUSES,
  type ReturnRequest,
  type ReturnStatus,
} from '@/lib/state/fyll-store';

const statusLabel = (status: ReturnStatus) => RETURN_STATUSES.find((item) => item.value === status)?.label ?? status;
const reasonLabel = (reason: ReturnRequest['reason']) => RETURN_REASONS.find((item) => item.value === reason)?.label ?? reason;
const resolutionLabel = (resolution: ReturnRequest['resolution']) => RETURN_RESOLUTIONS.find((item) => item.value === resolution)?.label ?? resolution;
const returnStatusOrder = RETURN_STATUSES.map((item) => item.value);
const returnStatusColors: Record<ReturnStatus, { bg: string; border: string; text: string; dot: string }> = {
  initiated: { bg: '#EFF6FF', border: '#BFDBFE', text: '#2563EB', dot: '#3B82F6' },
  picked_up: { bg: '#FFF7ED', border: '#FED7AA', text: '#F59E0B', dot: '#F59E0B' },
  received: { bg: '#ECFDF5', border: '#A7F3D0', text: '#047857', dot: '#10B981' },
  processed: { bg: '#F0FDF4', border: '#BBF7D0', text: '#15803D', dot: '#22C55E' },
};

const formatReturnDate = (value?: string) => {
  if (!value) return 'Pending';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Pending';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatReturnDateTime = (value?: string) => {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}, ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
};

const makeReturnDetailId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export default function ReturnDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useThemeColors();
  const isDark = useResolvedThemeMode() === 'dark';
  const { isDesktop, isMobile, width: viewportWidth } = useBreakpoint();
  const tabBarHeight = useTabBarHeight();
  const returns = useFyllStore((s) => s.returns);
  const updateReturn = useFyllStore((s) => s.updateReturn);
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const currentUserName = useAuthStore((s) => s.currentUser?.name || s.currentUser?.email || 'Staff');

  const returnItem = useMemo(() => returns.find((item) => item.id === id) ?? null, [id, returns]);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteTouched, setNoteTouched] = useState(false);
  const [noteSaveState, setNoteSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [selectedProofImage, setSelectedProofImage] = useState<string | null>(null);
  const [showReturnStatusOptions, setShowReturnStatusOptions] = useState(false);
  const detailCardBg = isDark ? colors.bg.secondary : '#FFFFFF';
  const detailInsetBg = isDark ? colors.bg.primary : '#FFFFFF';
  const webMaxWidth = 1456;
  const isIpadWidth = isDesktop && viewportWidth >= 1024 && viewportWidth <= 1366;
  const rightRailWidth = isDesktop
    ? Math.max(
      isIpadWidth ? 280 : 320,
      Math.round(Math.min(webMaxWidth, viewportWidth - 40) * 0.3)
    )
    : undefined;
  const currentStatusColors = returnItem ? returnStatusColors[returnItem.status] : null;
  const displayReason = returnItem?.reason === 'other' && returnItem.otherReason?.trim()
    ? returnItem.otherReason.trim()
    : returnItem
      ? reasonLabel(returnItem.reason)
      : '';
  const timelineItems = useMemo(() => {
    if (!returnItem) return [];
    const currentIndex = returnStatusOrder.indexOf(returnItem.status);
    return RETURN_STATUSES.map((item, index) => ({
      ...item,
      active: item.value === returnItem.status,
      complete: currentIndex >= 0 && index <= currentIndex,
      colors: returnStatusColors[item.value],
    }));
  }, [returnItem]);
  const noteEntries = useMemo(() => {
    if (!returnItem) return [];
    const threadedNotes = returnItem.returnNotes ?? [];
    if (threadedNotes.length > 0) {
      return [...threadedNotes].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    if (returnItem.notes?.trim()) {
      return [{
        id: 'legacy-return-note',
        text: returnItem.notes.trim(),
        createdAt: returnItem.updatedAt || returnItem.createdAt,
        createdBy: returnItem.updatedBy || 'Team',
      }];
    }
    return [];
  }, [returnItem]);
  const activityEntries = useMemo(() => {
    if (!returnItem) return [];
    const baseActivity = returnItem.activity ?? [
      { id: 'legacy-return-created', date: returnItem.createdAt, action: `Return request ${returnItem.ref} submitted`, user: returnItem.createdBy || 'Customer portal' },
    ];
    return [...baseActivity].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [returnItem]);

  useEffect(() => {
    if (!noteTouched) {
      setNoteDraft('');
    }
  }, [noteTouched, returnItem?.id]);

  const updateStatus = async (status: ReturnStatus) => {
    if (!returnItem) return;
    const now = new Date().toISOString();
    await updateReturn(returnItem.id, {
      status,
      updatedBy: currentUserName,
      activity: [
        ...(returnItem.activity ?? []),
        {
          id: makeReturnDetailId('return-activity'),
          date: now,
          action: `Status changed to ${statusLabel(status)}`,
          user: currentUserName,
        },
      ],
    }, businessId);
    setShowReturnStatusOptions(false);
  };

  const saveNotes = async () => {
    if (!returnItem) return;
    const text = noteDraft.trim();
    if (!text) return;
    const now = new Date().toISOString();
    const nextNote = {
      id: makeReturnDetailId('return-note'),
      text,
      createdAt: now,
      createdBy: currentUserName,
    };
    try {
      setNoteSaveState('saving');
      await updateReturn(returnItem.id, {
        notes: text,
        returnNotes: [...(returnItem.returnNotes ?? []), nextNote],
        activity: [
          ...(returnItem.activity ?? []),
          {
            id: makeReturnDetailId('return-activity'),
            date: now,
            action: 'Internal note added',
            user: currentUserName,
          },
        ],
        updatedBy: currentUserName,
      }, businessId);
      setNoteDraft('');
      setNoteTouched(false);
      setNoteSaveState('saved');
    } catch (error) {
      console.warn('Return notes save failed:', error);
      setNoteSaveState('error');
    }
  };

  const renderNotesSection = () => (
    <View style={{ borderRadius: 24, borderWidth: 1, borderColor: colors.border.light, backgroundColor: detailCardBg, padding: 18, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <Text style={{ color: colors.text.secondary, fontSize: 10, fontWeight: '400', letterSpacing: 1, textTransform: 'uppercase' }}>Internal notes</Text>
        <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '400' }}>{noteEntries.length} note{noteEntries.length === 1 ? '' : 's'}</Text>
      </View>
      {noteEntries.length > 0 ? (
        <View style={{ gap: 10 }}>
          {noteEntries.map((note) => (
            <View key={note.id} style={{ borderRadius: 16, backgroundColor: detailInsetBg, borderWidth: 1, borderColor: colors.border.light, padding: 12, gap: 6 }}>
              <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '400', lineHeight: 19 }}>{note.text}</Text>
              <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '400' }}>
                {note.createdBy} · {formatReturnDateTime(note.createdAt)}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '400' }}>No internal notes yet.</Text>
      )}
      <TextInput
        value={noteDraft}
        onChangeText={(value) => {
          setNoteDraft(value);
          setNoteTouched(true);
          setNoteSaveState('idle');
        }}
        multiline
        placeholder="Add return handling note"
        placeholderTextColor={colors.text.tertiary}
        style={{
          minHeight: 96,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: colors.border.light,
          backgroundColor: detailInsetBg,
          padding: 14,
          color: colors.text.primary,
          fontSize: 13,
          fontWeight: '400',
          textAlignVertical: 'top',
          outlineStyle: 'none' as any,
        }}
      />
      {noteSaveState === 'saved' ? (
        <Text style={{ color: '#16A34A', fontSize: 11, fontWeight: '400' }}>Note added.</Text>
      ) : noteSaveState === 'error' ? (
        <Text style={{ color: '#DC2626', fontSize: 11, fontWeight: '400' }}>Could not save note. Please try again.</Text>
      ) : null}
      <Pressable
        onPress={saveNotes}
        disabled={noteSaveState === 'saving' || !noteDraft.trim()}
        style={{
          height: 42,
          borderRadius: 999,
          backgroundColor: noteSaveState === 'saving' || !noteDraft.trim() ? colors.bg.tertiary : colors.text.primary,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: noteSaveState === 'saving' || !noteDraft.trim() ? colors.text.secondary : colors.bg.primary, fontSize: 12, fontWeight: '500' }}>
          {noteSaveState === 'saving' ? 'Saving...' : 'Add note'}
        </Text>
      </Pressable>
    </View>
  );

  const renderReturnStatusCard = () => (
    <View style={{ borderRadius: 24, borderWidth: 1, borderColor: colors.border.light, backgroundColor: detailCardBg, padding: 18, gap: 10 }}>
      <Text style={{ color: colors.text.secondary, fontSize: 10, fontWeight: '400', letterSpacing: 1, textTransform: 'uppercase' }}>Return workflow status</Text>
      {currentStatusColors && returnItem ? (
        <>
          <Pressable
            onPress={() => setShowReturnStatusOptions((value) => !value)}
            style={{
              minHeight: 48,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: currentStatusColors.border,
              backgroundColor: currentStatusColors.bg,
              paddingHorizontal: 14,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
              <View
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 999,
                  backgroundColor: currentStatusColors.dot,
                }}
              />
              <Text style={{ color: currentStatusColors.text, fontSize: 13, fontWeight: '500', flex: 1 }}>{statusLabel(returnItem.status)}</Text>
            </View>
            <ChevronDown size={17} color={currentStatusColors.text} strokeWidth={2} />
          </Pressable>
          {showReturnStatusOptions ? (
            <View style={{ gap: 8 }}>
              {RETURN_STATUSES.map((item) => {
                const active = returnItem.status === item.value;
                const statusColors = returnStatusColors[item.value];
                return (
                  <Pressable
                    key={item.value}
                    onPress={() => updateStatus(item.value)}
                    style={{
                      minHeight: 48,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: active ? statusColors.border : colors.border.light,
                      backgroundColor: active ? statusColors.bg : detailInsetBg,
                      paddingHorizontal: 14,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                      <View
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: 999,
                          backgroundColor: statusColors.dot,
                          opacity: active ? 1 : 0.5,
                        }}
                      />
                      <Text style={{ color: active ? statusColors.text : colors.text.primary, fontSize: 13, fontWeight: '500', flex: 1 }}>{item.label}</Text>
                    </View>
                    {active ? <CheckCircle2 size={17} color={statusColors.text} strokeWidth={2} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );

  const content = (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }} edges={isDesktop ? [] : ['top']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: isDesktop ? 20 : 18,
          paddingTop: isDesktop ? 20 : 18,
          paddingBottom: isDesktop ? 60 : tabBarHeight + 34,
          maxWidth: isDesktop ? webMaxWidth : undefined,
          width: '100%',
          alignSelf: isDesktop ? 'flex-start' : 'stretch',
        }}
        showsVerticalScrollIndicator={false}
      >
        {!returnItem ? (
          <View style={{ borderRadius: 26, borderWidth: 1, borderColor: colors.border.light, padding: 28, alignItems: 'center' }}>
            <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: '600' }}>Return not found</Text>
            <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '400', marginTop: 6 }}>This return may have been removed or is still syncing.</Text>
          </View>
        ) : (
          <>
            <View style={{ flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'flex-start', justifyContent: 'space-between', gap: 18, marginBottom: 20 }}>
              <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
                <Pressable
                  onPress={() => router.push('/returns' as any)}
                  style={{ width: 32, height: 40, alignItems: 'flex-start', justifyContent: 'center', marginTop: isMobile ? 0 : 3 }}
                >
                  <ArrowLeft size={24} color={colors.text.primary} strokeWidth={2} />
                </Pressable>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <Text style={{ color: colors.text.primary, fontSize: isMobile ? 18 : 24, fontWeight: '600', lineHeight: isMobile ? 24 : 30, flex: 1 }} numberOfLines={1}>{returnItem.ref}</Text>
                    {currentStatusColors ? (
                      <View
                        style={{
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: currentStatusColors.border,
                          backgroundColor: currentStatusColors.bg,
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          flexShrink: 0,
                        }}
                      >
                        <Text style={{ color: currentStatusColors.text, fontSize: 10, fontWeight: '500' }}>{statusLabel(returnItem.status)}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={{ color: colors.text.secondary, fontSize: 13, fontWeight: '400', marginTop: 5 }}>{returnItem.orderNumber} · {returnItem.customerName}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 10, width: isMobile ? '100%' : undefined }}>
                {returnItem.caseId ? (
                  <Pressable
                    onPress={() => router.push(`/case/${returnItem.caseId}` as any)}
                    style={{ height: 42, borderRadius: 999, borderWidth: 1, borderColor: colors.border.light, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, flex: isMobile ? 1 : undefined }}
                  >
                    <FileText size={14} color={colors.text.primary} strokeWidth={2} />
                    <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '500' }}>Open case</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => router.push(`/order/${returnItem.orderId}` as any)}
                  style={{ height: 42, borderRadius: 999, backgroundColor: colors.text.primary, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, flex: isMobile ? 1 : undefined }}
                >
                  <ExternalLink size={14} color={colors.bg.primary} strokeWidth={2} />
                  <Text style={{ color: colors.bg.primary, fontSize: 12, fontWeight: '500' }}>Open order</Text>
                </Pressable>
              </View>
            </View>

            <View style={{ height: 1, backgroundColor: colors.border.light, marginHorizontal: isDesktop ? -20 : -18, marginBottom: 20 }} />

            {!isDesktop ? (
              <View style={{ marginBottom: 16 }}>
                {renderReturnStatusCard()}
              </View>
            ) : null}

            <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: isDesktop ? 24 : 16, alignItems: 'flex-start' }}>
              <View style={{ flex: isDesktop ? 1 : undefined, minWidth: 0, width: isDesktop ? undefined : '100%', gap: 16 }}>
                <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 10 }}>
                  <InfoPill icon={<FileText size={15} color={colors.text.secondary} strokeWidth={2} />} label="Reason" value={displayReason} />
                  <InfoPill icon={<PackageCheck size={15} color={colors.text.secondary} strokeWidth={2} />} label="Resolution" value={resolutionLabel(returnItem.resolution)} />
                  <InfoPill icon={<Truck size={15} color={colors.text.secondary} strokeWidth={2} />} label="Shipping" value={returnItem.shippingPayer === 'seller' ? 'Seller pays' : 'Customer pays'} />
                </View>

                <View style={{ borderRadius: 24, borderWidth: 1, borderColor: colors.border.light, backgroundColor: detailCardBg, padding: 18, gap: 12 }}>
                  <Text style={{ color: colors.text.secondary, fontSize: 10, fontWeight: '400', letterSpacing: 1, textTransform: 'uppercase' }}>Customer message</Text>
                  <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '400', lineHeight: 19 }}>
                    {returnItem.customerMessage?.trim() || 'No message added.'}
                  </Text>
                </View>

                <View style={{ borderRadius: 24, borderWidth: 1, borderColor: colors.border.light, backgroundColor: detailCardBg, padding: 18, gap: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <Text style={{ color: colors.text.secondary, fontSize: 10, fontWeight: '400', letterSpacing: 1, textTransform: 'uppercase' }}>Proof images</Text>
                    <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '400' }}>{returnItem.proofImages?.length ?? 0} attached</Text>
                  </View>
                  {(returnItem.proofImages?.length ?? 0) > 0 ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                      {returnItem.proofImages?.map((image, index) => (
                        <Pressable
                          key={`${image}-${index}`}
                          onPress={() => setSelectedProofImage(image)}
                          style={{
                            width: 132,
                            borderRadius: 18,
                            borderWidth: 1,
                            borderColor: colors.border.light,
                            backgroundColor: detailInsetBg,
                            overflow: 'hidden',
                          }}
                        >
                          <Image source={{ uri: image }} style={{ width: '100%', height: 92, backgroundColor: colors.bg.tertiary }} resizeMode="cover" />
                          <View style={{ paddingHorizontal: 10, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                            <ImageIcon size={14} color={colors.text.secondary} strokeWidth={2} />
                            <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '500' }}>Proof {index + 1}</Text>
                          </View>
                        </Pressable>
                      ))}
                    </View>
                  ) : (
                    <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '400' }}>No proof image was attached.</Text>
                  )}
                </View>

              </View>

              <View style={{ width: isDesktop ? rightRailWidth : '100%', maxWidth: isDesktop ? rightRailWidth : undefined, flexShrink: 0, gap: 16 }}>
                {isDesktop ? renderReturnStatusCard() : null}

                <View style={{ borderRadius: 24, borderWidth: 1, borderColor: colors.border.light, backgroundColor: detailCardBg, padding: 18, gap: 14 }}>
                  <Text style={{ color: colors.text.secondary, fontSize: 10, fontWeight: '400', letterSpacing: 1, textTransform: 'uppercase' }}>Timeline</Text>
                  {timelineItems.map((item, index) => (
                    <View key={item.value} style={{ flexDirection: 'row', gap: 12 }}>
                      <View style={{ width: 18, alignItems: 'center' }}>
                        <View
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: item.complete ? item.colors.border : colors.border.light,
                            backgroundColor: item.complete ? item.colors.bg : detailInsetBg,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {item.complete ? <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: item.colors.dot }} /> : null}
                        </View>
                        {index < timelineItems.length - 1 ? (
                          <View
                            style={{
                              width: 1,
                              minHeight: 30,
                              flex: 1,
                              marginTop: 4,
                              backgroundColor: item.complete ? item.colors.border : colors.border.light,
                            }}
                          />
                        ) : null}
                      </View>
                      <View style={{ flex: 1, paddingBottom: index < timelineItems.length - 1 ? 12 : 0 }}>
                        <Text style={{ color: item.complete ? colors.text.primary : colors.text.secondary, fontSize: 12, fontWeight: item.active ? '600' : '500' }}>{item.label}</Text>
                        <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '400', marginTop: 3 }}>
                          {item.active
                            ? `Current step · ${formatReturnDate(returnItem.updatedAt)}`
                            : item.complete
                              ? index === 0
                                ? `Started · ${formatReturnDate(returnItem.createdAt)}`
                                : 'Completed'
                              : 'Pending'}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>

                {renderNotesSection()}

                <View style={{ borderRadius: 24, borderWidth: 1, borderColor: colors.border.light, backgroundColor: detailCardBg, padding: 18, gap: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <Text style={{ color: colors.text.secondary, fontSize: 10, fontWeight: '400', letterSpacing: 1, textTransform: 'uppercase' }}>Activity</Text>
                    <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '400' }}>{activityEntries.length} event{activityEntries.length === 1 ? '' : 's'}</Text>
                  </View>
                  {activityEntries.map((entry, index) => (
                    <View key={entry.id} style={{ flexDirection: 'row', gap: 10 }}>
                      <View style={{ width: 10, alignItems: 'center' }}>
                        <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: index === 0 ? colors.text.primary : colors.text.tertiary, marginTop: 5 }} />
                        {index < activityEntries.length - 1 ? (
                          <View style={{ width: 1, flex: 1, minHeight: 26, backgroundColor: colors.border.light, marginTop: 5 }} />
                        ) : null}
                      </View>
                      <View style={{ flex: 1, paddingBottom: index < activityEntries.length - 1 ? 12 : 0 }}>
                        <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '500' }}>{entry.action}</Text>
                        <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '400', marginTop: 3 }}>
                          {entry.user} · {formatReturnDateTime(entry.date)}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          </>
        )}
      </ScrollView>
      <Modal
        visible={Boolean(selectedProofImage)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedProofImage(null)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.86)', padding: 22, justifyContent: 'center' }}>
          <Pressable onPress={() => setSelectedProofImage(null)} style={{ position: 'absolute', top: 28, right: 22, width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
            <X size={20} color="#FFFFFF" strokeWidth={2} />
          </Pressable>
          {selectedProofImage ? (
            <Image
              source={{ uri: selectedProofImage }}
              style={{ width: '100%', height: '78%', borderRadius: 18, backgroundColor: '#111111' }}
              resizeMode="contain"
            />
          ) : null}
        </View>
      </Modal>
    </SafeAreaView>
    </View>
  );

  if (isDesktop) {
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.bg.primary }}>
        <DesktopSidebar />
        <View style={{ flex: 1 }}>{content}</View>
      </View>
    );
  }

  return content;
}

function InfoPill({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  const colors = useThemeColors();
  return (
    <View style={{ flex: 1, minWidth: 150, borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, padding: 14, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {icon}
        <Text style={{ color: colors.text.secondary, fontSize: 10, fontWeight: '400', letterSpacing: 1, textTransform: 'uppercase' }}>{label}</Text>
      </View>
      <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '500' }}>{value}</Text>
    </View>
  );
}
