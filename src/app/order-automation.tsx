import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, View, Text, Pressable, TextInput, Modal, ScrollView, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Zap, ChevronDown, X, Check, Plus, Trash2, Pencil, MoreVertical } from 'lucide-react-native';
import { useResolvedThemeMode, useThemeColors } from '@/lib/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import * as Haptics from 'expo-haptics';
import { getSettingsWebPanelStyles, isFromSettingsRoute } from '@/lib/settings-web-panel';
import { sortOrderStatusesForFulfillment } from '@/lib/order-status';
import { useSettingsBack } from '@/lib/useSettingsBack';
import useFyllStore, { type OrderAutomationRule } from '@/lib/state/fyll-store';
import useAuthStore from '@/lib/state/auth-store';
import { FYLL_LIME, FYLL_LIME_INK, MoneyText, usePaymentsPalette } from '@/components/payments/payments-ui';
import { LimeToggle } from '@/components/settings/LimeToggle';

type PickerTarget = {
  ruleId: string;
  field: 'fromStatus' | 'toStatus';
} | null;

const createRuleId = () => `automation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export default function OrderAutomationScreen() {
  const { from } = useLocalSearchParams<{ from?: string | string[] }>();
  const goBack = useSettingsBack();
  const colors = useThemeColors();
  const resolvedThemeMode = useResolvedThemeMode();
  const settingsPalette = usePaymentsPalette();
  const openedFromSettings = isFromSettingsRoute(from);
  const panelStyles = getSettingsWebPanelStyles(
    openedFromSettings,
    colors.bg.primary,
    colors.border.light
  );
  const { width } = useWindowDimensions();
  const isWideLayout = width >= 920;
  const isWebDesktop = Platform.OS === 'web' && isWideLayout;

  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const orderStatuses = useFyllStore((s) => s.orderStatuses);
  const autoCompleteOrders = useFyllStore((s) => s.autoCompleteOrders);
  const autoCompleteAfterDays = useFyllStore((s) => s.autoCompleteAfterDays);
  const autoCompleteFromStatus = useFyllStore((s) => s.autoCompleteFromStatus);
  const autoCompleteToStatus = useFyllStore((s) => s.autoCompleteToStatus);
  const orderAutomations = useFyllStore((s) => s.orderAutomations);
  const setAutoCompleteOrders = useFyllStore((s) => s.setAutoCompleteOrders);
  const addOrderAutomation = useFyllStore((s) => s.addOrderAutomation);
  const updateOrderAutomation = useFyllStore((s) => s.updateOrderAutomation);
  const deleteOrderAutomation = useFyllStore((s) => s.deleteOrderAutomation);
  const saveGlobalSettings = useFyllStore((s) => s.saveGlobalSettings);
  const orderedOrderStatuses = useMemo(() => (
    sortOrderStatusesForFulfillment(orderStatuses)
  ), [orderStatuses]);

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [statusPickerTarget, setStatusPickerTarget] = useState<PickerTarget>(null);
  const [dayInputs, setDayInputs] = useState<Record<string, string>>({});
  const [activeDayInputRuleId, setActiveDayInputRuleId] = useState<string | null>(null);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [actionRuleId, setActionRuleId] = useState<string | null>(null);
  const [actionMenuPosition, setActionMenuPosition] = useState<{ top: number; right: number } | null>(null);
  const actionButtonRefs = useRef<Record<string, View | null>>({});
  const hasInitializedAutoSaveRef = useRef(false);
  const lastSavedSignatureRef = useRef('');

  useEffect(() => {
    if (orderAutomations.length > 0) return;
    if (!autoCompleteFromStatus.trim() && !autoCompleteToStatus.trim()) return;
    addOrderAutomation({
      id: createRuleId(),
      enabled: true,
      fromStatus: autoCompleteFromStatus,
      toStatus: autoCompleteToStatus,
      afterDays: autoCompleteAfterDays,
    });
  }, [
    orderAutomations.length,
    autoCompleteFromStatus,
    autoCompleteToStatus,
    autoCompleteAfterDays,
    addOrderAutomation,
  ]);

  useEffect(() => {
    setDayInputs((previous) => {
      let changed = false;
      const next: Record<string, string> = {};

      orderAutomations.forEach((rule) => {
        const normalized = Number.isFinite(rule.afterDays) && rule.afterDays > 0
          ? String(rule.afterDays)
          : '10';
        if (activeDayInputRuleId === rule.id && previous[rule.id] !== undefined) {
          next[rule.id] = previous[rule.id];
          return;
        }
        next[rule.id] = normalized;
        if (previous[rule.id] !== normalized) changed = true;
      });

      if (Object.keys(previous).length !== Object.keys(next).length) {
        changed = true;
      }

      return changed ? next : previous;
    });
  }, [activeDayInputRuleId, orderAutomations]);

  const automationSignature = useMemo(() => JSON.stringify({
    autoCompleteOrders,
    autoCompleteAfterDays,
    autoCompleteFromStatus,
    autoCompleteToStatus,
    orderAutomations: orderAutomations.map((rule) => ({
      id: rule.id,
      enabled: rule.enabled,
      fromStatus: rule.fromStatus?.trim() ?? '',
      toStatus: rule.toStatus?.trim() ?? '',
      afterDays: Number.isFinite(rule.afterDays) && rule.afterDays > 0 ? Math.floor(rule.afterDays) : 10,
    })),
  }), [
    autoCompleteOrders,
    autoCompleteAfterDays,
    autoCompleteFromStatus,
    autoCompleteToStatus,
    orderAutomations,
  ]);

  useEffect(() => {
    if (!businessId) return;

    if (!hasInitializedAutoSaveRef.current) {
      hasInitializedAutoSaveRef.current = true;
      lastSavedSignatureRef.current = automationSignature;
      return;
    }

    if (automationSignature === lastSavedSignatureRef.current) return;

    let isActive = true;
    const timeoutRef = setTimeout(async () => {
      setSaveStatus('saving');
      const result = await saveGlobalSettings(businessId);
      if (!isActive) return;

      if (result.success) {
        lastSavedSignatureRef.current = automationSignature;
        setSaveStatus('saved');
      } else {
        setSaveStatus('error');
      }
      setTimeout(() => {
        if (isActive) setSaveStatus('idle');
      }, 2000);
    }, 650);

    return () => {
      isActive = false;
      clearTimeout(timeoutRef);
    };
  }, [automationSignature, businessId, saveGlobalSettings]);

  const commitAfterDays = (rule: OrderAutomationRule, rawValue: string) => {
    const numeric = rawValue.replace(/[^0-9]/g, '');
    if (!numeric) {
      const fallback = Number.isFinite(rule.afterDays) && rule.afterDays > 0 ? rule.afterDays : 10;
      setDayInputs((prev) => ({ ...prev, [rule.id]: String(fallback) }));
      return;
    }

    const parsed = parseInt(numeric, 10);
    const sanitized = Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
    updateOrderAutomation(rule.id, { afterDays: sanitized });
    setDayInputs((prev) => ({ ...prev, [rule.id]: String(sanitized) }));
  };

  const primaryPillButtonStyle = {
    backgroundColor: FYLL_LIME,
    borderRadius: 999,
  } as const;
  const primaryPillTextStyle = {
    color: FYLL_LIME_INK,
    fontFamily: 'BricolageGrotesque_700Bold',
  } as const;
  const fieldHeight = 56;
  const settingsContentWidthStyle = (
    isWebDesktop
      ? ({ width: '100%', maxWidth: 1440, alignSelf: 'flex-start' } as const)
      : ({ width: '100%', maxWidth: 620, alignSelf: 'center' } as const)
  );

  const getStatusColor = (statusName: string) => {
    return orderStatuses.find((status) => status.name === statusName)?.color ?? colors.text.tertiary;
  };

  const editingRule = orderAutomations.find((rule) => rule.id === editingRuleId) ?? null;
  const actionRule = orderAutomations.find((rule) => rule.id === actionRuleId) ?? null;

  const closeActionMenu = () => {
    setActionRuleId(null);
    setActionMenuPosition(null);
  };

  const openActionMenu = (ruleId: string) => {
    const button = actionButtonRefs.current[ruleId];
    if (!button) return;

    button.measureInWindow((x, y, measuredWidth, measuredHeight) => {
      setActionMenuPosition({
        top: y + measuredHeight + 5,
        right: Math.max(10, width - x - measuredWidth),
      });
      setActionRuleId(ruleId);
    });
  };

  const renderStatusChip = (statusName: string, maxWidth = 150) => (
    statusName ? (
      <View
        className="flex-row items-center rounded-full"
        style={{ backgroundColor: settingsPalette.inset, borderWidth: 1, borderColor: settingsPalette.border, maxWidth, minWidth: 0, minHeight: isWebDesktop ? 24 : 30, paddingHorizontal: isWebDesktop ? 10 : 12, paddingVertical: isWebDesktop ? 4 : 5 }}
      >
        <View className="w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: getStatusColor(statusName) }} />
        <Text style={{ color: colors.text.primary, fontSize: isWebDesktop ? 12 : 10, lineHeight: isWebDesktop ? 16 : 14, fontWeight: '500', flexShrink: 1 }} numberOfLines={1}>
          {statusName}
        </Text>
      </View>
    ) : (
      <Text style={{ color: colors.text.muted, fontSize: 12 }}>Not set</Text>
    )
  );

  const addNewRule = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    addOrderAutomation({
      id: createRuleId(),
      enabled: true,
      afterDays: autoCompleteAfterDays > 0 ? autoCompleteAfterDays : 10,
      fromStatus: '',
      toStatus: '',
    });
  };

  const handleAddRule = () => {
    const nextId = createRuleId();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    addOrderAutomation({
      id: nextId,
      enabled: true,
      afterDays: autoCompleteAfterDays > 0 ? autoCompleteAfterDays : 10,
      fromStatus: '',
      toStatus: '',
    });
    setEditingRuleId(nextId);
  };

  const handleSave = async () => {
    if (!businessId) {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2000);
      return;
    }
    setSaveStatus('saving');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await saveGlobalSettings(businessId);
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      lastSavedSignatureRef.current = automationSignature;
      setSaveStatus('saved');
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setSaveStatus('error');
    }
    setTimeout(() => setSaveStatus('idle'), 2000);
  };

  const pickerTitle = statusPickerTarget?.field === 'toStatus' ? 'Move to' : 'When status is';

  return (
    <View style={panelStyles.outer}>
      <View style={panelStyles.inner}>
        <SafeAreaView className="flex-1" edges={['top']} style={{ backgroundColor: isWebDesktop ? colors.bg.card : colors.bg.primary }}>
          {!isWebDesktop ? (
            <LinearGradient
              pointerEvents="none"
              colors={resolvedThemeMode === 'dark' ? ['rgba(111,125,18,0.55)', 'rgba(17,17,17,0)'] : ['rgba(213,224,87,0.42)', 'rgba(244,243,235,0)']}
              locations={[0, 1]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 360 }}
            />
          ) : null}
          <View
            style={{
              minHeight: isWebDesktop ? 60 : 66,
              paddingHorizontal: isWebDesktop ? 28 : 10,
              paddingVertical: isWebDesktop ? 14 : 4,
              paddingTop: isWebDesktop ? 14 : 12,
              borderBottomWidth: isWebDesktop ? 1 : 0,
              borderBottomColor: isWebDesktop ? colors.border.light : settingsPalette.border,
              backgroundColor: isWebDesktop ? colors.bg.card : 'transparent',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
            }}
          >
              <View className="flex-row items-center flex-1" style={{ minWidth: 0 }}>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    goBack();
                  }}
                  className="items-center justify-center active:opacity-50"
                  style={{ width: isWebDesktop ? 34 : 38, height: isWebDesktop ? 34 : 38, borderRadius: isWebDesktop ? 0 : 19, marginRight: 12, backgroundColor: isWebDesktop ? 'transparent' : settingsPalette.softFill }}
                >
                  <ArrowLeft size={20} color={colors.text.primary} strokeWidth={2.2} />
                </Pressable>
                <View className="flex-1">
                  {isWebDesktop ? (
                    <>
                      <MoneyText style={{ color: colors.text.primary, fontSize: 20, lineHeight: 26, letterSpacing: -0.5 }}>Order Automation</MoneyText>
                      <Text style={{ color: colors.text.tertiary, fontSize: 13, lineHeight: 18, marginTop: 4 }} numberOfLines={2}>Create rules that move orders automatically as fulfillment progresses.</Text>
                    </>
                  ) : (
                    <>
                      <Text style={{ color: settingsPalette.faint, fontSize: 9.5, lineHeight: 12, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' }}>Settings</Text>
                      <Text style={{ color: settingsPalette.text, fontSize: 17, lineHeight: 21, fontWeight: '600' }}>Order Automation</Text>
                    </>
                  )}
                </View>
              </View>

              <Pressable
                onPress={handleSave}
                disabled={saveStatus === 'saving'}
                className="px-4 h-10 rounded-full items-center justify-center active:opacity-80"
                style={[primaryPillButtonStyle, { opacity: saveStatus === 'saving' ? 0.7 : 1, width: 136, height: isWebDesktop ? 40 : 42 }]}
              >
                {saveStatus === 'saving' ? (
                  <Text style={[primaryPillTextStyle, { fontSize: 14 }]}>Saving…</Text>
                ) : (
                  <Text style={[primaryPillTextStyle, { fontSize: 14 }]}>Save</Text>
                )}
              </Pressable>
          </View>

          <KeyboardAwareScrollView
            className="flex-1"
            style={{ backgroundColor: isWebDesktop ? colors.bg.card : 'transparent' }}
            contentContainerStyle={isWebDesktop ? { paddingHorizontal: 18, paddingVertical: 18 } : { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
            enableOnAndroid
            extraScrollHeight={100}
          >
            <View
              style={settingsContentWidthStyle}
              className=""
            >
              <View
                className="rounded-3xl overflow-hidden mb-5"
                style={{ position: 'relative', minHeight: isWebDesktop ? 138 : 150, justifyContent: 'center', backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.border }}
              >
                <LinearGradient pointerEvents="none" colors={[settingsPalette.nudgeBg, 'transparent']} start={{ x: 1, y: 0 }} end={{ x: 0.2, y: 1 }} style={{ position: 'absolute', top: -44, right: -36, width: 210, height: 210, borderRadius: 105 }} />
                <View style={{ position: 'absolute', top: 0, left: 28, right: 28, height: 3, backgroundColor: FYLL_LIME }} />
                <View style={{ padding: isWebDesktop ? 24 : 20 }}>
                  <View className="flex-row items-center">
                    <View className="flex-1">
                      <Text style={{ color: settingsPalette.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' }}>Workflow automation</Text>
                      <MoneyText style={{ color: settingsPalette.text, fontSize: isWebDesktop ? 28 : 24, lineHeight: isWebDesktop ? 34 : 29, fontWeight: '700', marginTop: 2 }}>
                        {orderAutomations.length} {orderAutomations.length === 1 ? 'rule' : 'rules'}
                      </MoneyText>
                    </View>
                    <LimeToggle
                      compact
                      value={autoCompleteOrders}
                      onValueChange={(value) => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setAutoCompleteOrders(value);
                        if (value && orderAutomations.length === 0) {
                          addOrderAutomation({ id: createRuleId(), enabled: true, fromStatus: autoCompleteFromStatus, toStatus: autoCompleteToStatus, afterDays: autoCompleteAfterDays });
                        }
                      }}
                      accessibilityLabel="Order automation"
                      activeColor={FYLL_LIME}
                      inactiveColor={settingsPalette.softFill}
                      inactiveBorderColor={settingsPalette.outline}
                    />
                  </View>
                  <Text style={{ color: settingsPalette.faint, fontSize: 12.5, lineHeight: 18, marginTop: 4 }}>
                    Automatically move stale orders through your workflow after a set number of days.
                  </Text>
                </View>
              </View>

              {autoCompleteOrders && (
                <>
                {!isWebDesktop ? (
                  <Pressable
                    onPress={handleAddRule}
                    className="rounded-full flex-row items-center justify-center active:opacity-70 mb-5"
                    style={{ minHeight: 48, backgroundColor: FYLL_LIME }}
                  >
                    <Plus size={16} color={FYLL_LIME_INK} strokeWidth={2.4} />
                    <MoneyText style={{ color: FYLL_LIME_INK, fontSize: 14, fontWeight: '700', marginLeft: 7 }}>Add rule</MoneyText>
                  </Pressable>
                ) : null}
                <View className="flex-row items-center justify-between mb-3">
                  <View>
                    <Text style={{ color: settingsPalette.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' }}>Automation rules</Text>
                    <Text style={{ color: settingsPalette.text, fontSize: 12, marginTop: 2 }}>{orderAutomations.filter((rule) => rule.enabled).length} active</Text>
                  </View>
                  {isWebDesktop ? <Pressable
                    onPress={handleAddRule}
                    className="px-4 rounded-full flex-row items-center justify-center active:opacity-70"
                    style={{ minHeight: 40, backgroundColor: FYLL_LIME }}
                  >
                    <Plus size={14} color={FYLL_LIME_INK} strokeWidth={2.3} />
                    <MoneyText style={{ color: FYLL_LIME_INK, fontSize: 14, fontWeight: '700', marginLeft: 6 }}>Add rule</MoneyText>
                  </Pressable> : null}
                </View>

                {orderAutomations.length === 0 && (
                  <View
                    className="rounded-2xl p-4 mb-5"
                    style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
                  >
                    <Text style={{ color: colors.text.secondary }} className="text-sm font-semibold mb-1">
                      No automation rules yet
                    </Text>
                    <Text style={{ color: colors.text.muted }} className="text-xs">
                      Add at least one rule to move stale orders automatically.
                    </Text>
                  </View>
                )}

                {orderAutomations.length > 0 ? (
                  <View
                    className="rounded-3xl mb-5"
                    style={{ overflow: isWebDesktop ? 'visible' : 'hidden', backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.border }}
                  >
                    {isWebDesktop ? <View
                      className="flex-row items-center px-4 py-3"
                      style={{ borderBottomWidth: 1, borderBottomColor: settingsPalette.hairline }}
                    >
                      <Text style={{ color: colors.text.tertiary, flex: 0.85, fontSize: 10, fontWeight: '600', letterSpacing: 1.1, textTransform: 'uppercase' }}>
                        Name
                      </Text>
                      <Text style={{ color: colors.text.tertiary, flex: 1.95, fontSize: 10, fontWeight: '600', letterSpacing: 1.1, textTransform: 'uppercase' }}>
                        Status rule
                      </Text>
                      <Text style={{ color: colors.text.tertiary, width: 104, fontSize: 10, fontWeight: '600', letterSpacing: 1.1, textTransform: 'uppercase', textAlign: 'center' }}>
                        Toggle
                      </Text>
                    </View> : null}

                    {orderAutomations.map((rule, index) => {
                      const fromStatus = rule.fromStatus?.trim() ?? '';
                      const toStatus = rule.toStatus?.trim() ?? '';
                      const afterDays = Number.isFinite(rule.afterDays) && rule.afterDays > 0 ? rule.afterDays : 10;
                      return (
                        <View key={rule.id} style={{ position: 'relative' }}>
                          <View
                            className={isWebDesktop ? 'flex-row items-center px-4 py-3' : 'px-4 py-3'}
                            style={isWebDesktop
                              ? (index > 0 ? { borderTopWidth: 1, borderTopColor: settingsPalette.hairline } : undefined)
                              : { minHeight: 124, borderTopWidth: index > 0 ? 1 : 0, borderTopColor: settingsPalette.hairline }}
                          >
                            <View style={isWebDesktop ? { flex: 0.85, paddingRight: 10 } : { paddingRight: 106 }}>
                              <Text style={{ color: settingsPalette.text, fontSize: 14, fontWeight: '600' }}>
                                Rule {index + 1}
                              </Text>
                              <Text style={{ color: colors.text.muted, fontSize: 11, marginTop: 2 }}>
                                After {afterDays} day{afterDays === 1 ? '' : 's'}
                              </Text>
                            </View>

                            <View className="flex-row items-center" style={isWebDesktop ? { flex: 1.95, gap: 6, minWidth: 0, paddingRight: 12, overflow: 'hidden' } : { gap: 6, minWidth: 0, marginTop: 14, overflow: 'hidden' }}>
                              {renderStatusChip(fromStatus, isWebDesktop ? 160 : 125)}
                              <Text style={{ color: colors.text.muted, fontSize: 12 }}>→</Text>
                              {renderStatusChip(toStatus, isWebDesktop ? 160 : 125)}
                            </View>

                            <View style={isWebDesktop ? { width: 104, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 } : { position: 'absolute', top: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <LimeToggle
                                compact
                                value={rule.enabled}
                                onValueChange={(value) => {
                                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                  updateOrderAutomation(rule.id, { enabled: value });
                                }}
                                accessibilityLabel={`Rule ${index + 1}`}
                                activeColor={FYLL_LIME}
                                inactiveColor={settingsPalette.softFill}
                                inactiveBorderColor={settingsPalette.outline}
                              />
                              <Pressable
                                ref={(node) => {
                                  actionButtonRefs.current[rule.id] = node;
                                }}
                                onPress={() => {
                                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                  openActionMenu(rule.id);
                                }}
                                className="items-center justify-center active:opacity-60"
                                style={{ width: 40, height: 40 }}
                                accessibilityRole="button"
                                accessibilityLabel={`Open actions for automation rule ${index + 1}`}
                              >
                                <MoreVertical size={18} color={settingsPalette.textSoft} strokeWidth={2.2} />
                              </Pressable>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : null}
                </>
              )}

              <View className="h-24" />
            </View>
          </KeyboardAwareScrollView>

          {saveStatus === 'saved' || saveStatus === 'error' ? (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: 20,
                right: 20,
                bottom: 28,
                alignItems: 'center',
                zIndex: 50,
              }}
            >
              <View
                className="flex-row items-center"
                style={{
                  minHeight: 54,
                  maxWidth: 390,
                  width: '100%',
                  paddingHorizontal: 14,
                  borderRadius: 20,
                  backgroundColor: settingsPalette.card,
                  borderWidth: 1,
                  borderColor: saveStatus === 'saved' ? settingsPalette.nudgeBorder : settingsPalette.dangerBorder,
                  shadowColor: '#000000',
                  shadowOpacity: resolvedThemeMode === 'dark' ? 0.36 : 0.16,
                  shadowRadius: 20,
                  shadowOffset: { width: 0, height: 10 },
                  elevation: 12,
                }}
              >
                <View
                  className="items-center justify-center"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    marginRight: 11,
                    backgroundColor: saveStatus === 'saved' ? settingsPalette.nudgeBg : settingsPalette.dangerBg,
                  }}
                >
                  {saveStatus === 'saved'
                    ? <Check size={17} color={settingsPalette.limeOnSurface} strokeWidth={2.7} />
                    : <X size={17} color={settingsPalette.danger} strokeWidth={2.7} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: settingsPalette.text, fontSize: 14, fontWeight: '700' }}>
                    {saveStatus === 'saved' ? 'Automation saved' : 'Couldn’t save changes'}
                  </Text>
                  <Text style={{ color: settingsPalette.muted, fontSize: 12, marginTop: 2 }}>
                    {saveStatus === 'saved' ? 'Your order rules are up to date.' : 'Please check your connection and try again.'}
                  </Text>
                </View>
              </View>
            </View>
          ) : null}

          <Modal
            visible={Boolean(actionRule)}
            transparent
            animationType="fade"
            onRequestClose={closeActionMenu}
          >
            <Pressable
              className="flex-1"
              style={{ backgroundColor: 'rgba(0,0,0,0.12)' }}
              onPress={closeActionMenu}
            >
              {actionRule && actionMenuPosition ? (
                <Pressable
                  onPress={(event) => event.stopPropagation()}
                  className="rounded-2xl overflow-hidden"
                  style={{
                    position: 'absolute',
                    top: actionMenuPosition.top,
                    right: actionMenuPosition.right,
                    width: 196,
                    backgroundColor: settingsPalette.card,
                    borderWidth: 1,
                    borderColor: settingsPalette.border,
                    shadowColor: '#000000',
                    shadowOpacity: resolvedThemeMode === 'dark' ? 0.36 : 0.18,
                    shadowRadius: 18,
                    shadowOffset: { width: 0, height: 8 },
                    elevation: 14,
                  }}
                >
                  <View
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      borderBottomWidth: 1,
                      borderBottomColor: settingsPalette.hairline,
                    }}
                  >
                    <Text style={{ color: settingsPalette.muted, fontSize: 10, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase' }}>
                      Rule {orderAutomations.findIndex((rule) => rule.id === actionRule.id) + 1}
                    </Text>
                  </View>
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        closeActionMenu();
                        setEditingRuleId(actionRule.id);
                      }}
                      className="flex-row items-center px-3.5 active:opacity-70"
                      style={{ minHeight: 48, backgroundColor: settingsPalette.card }}
                      accessibilityRole="button"
                      accessibilityLabel="Edit automation rule"
                    >
                      <Pencil size={15} color={settingsPalette.textSoft} strokeWidth={2.2} />
                      <Text style={{ color: settingsPalette.text, fontSize: 13, fontWeight: '600', marginLeft: 10 }}>
                        Edit rule
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        deleteOrderAutomation(actionRule.id);
                        closeActionMenu();
                      }}
                      className="flex-row items-center px-3.5 active:opacity-70"
                      style={{ minHeight: 48, backgroundColor: settingsPalette.card, borderTopWidth: 1, borderTopColor: settingsPalette.hairline }}
                      accessibilityRole="button"
                      accessibilityLabel="Delete automation rule"
                    >
                      <Trash2 size={15} color={settingsPalette.danger} strokeWidth={2.2} />
                      <Text style={{ color: settingsPalette.danger, fontSize: 13, fontWeight: '600', marginLeft: 10 }}>
                        Delete rule
                      </Text>
                    </Pressable>
                </Pressable>
              ) : null}
            </Pressable>
          </Modal>

          <Modal
            visible={Boolean(editingRule)}
            transparent
            animationType="fade"
            onRequestClose={() => setEditingRuleId(null)}
          >
            <Pressable
              className="flex-1 items-center justify-center px-5"
              style={{ backgroundColor: 'rgba(0,0,0,0.72)' }}
              onPress={() => setEditingRuleId(null)}
            >
              {editingRule ? (
                <Pressable
                  onPress={(event) => event.stopPropagation()}
                  className="w-full rounded-3xl overflow-hidden"
                  style={{
                    maxWidth: 520,
                    backgroundColor: settingsPalette.card,
                    borderWidth: 1,
                    borderColor: settingsPalette.border,
                  }}
                >
                  <View
                    className="flex-row items-center justify-between px-5 py-4"
                    style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light }}
                  >
                    <View>
                      <MoneyText style={{ color: settingsPalette.text, fontSize: isWebDesktop ? 22 : 18, fontWeight: '700' }}>
                        Edit automation
                      </MoneyText>
                      <Text style={{ color: colors.text.muted, fontSize: 12, marginTop: 2 }}>
                        Update the status rule and delay.
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => setEditingRuleId(null)}
                      className="w-9 h-9 rounded-full items-center justify-center active:opacity-70"
                      style={{ backgroundColor: settingsPalette.softFill }}
                    >
                      <X size={17} color={colors.text.secondary} strokeWidth={2} />
                    </Pressable>
                  </View>

                  <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 520 }}>
                    <View className="px-5 py-5">
                      <View className="mb-4">
                        <Text style={{ color: colors.text.secondary }} className="text-xs font-semibold mb-2">
                          After how many days?
                        </Text>
                        <View className="flex-row items-center">
                          <View
                            className="rounded-xl px-4 flex-1"
                            style={{
                              backgroundColor: colors.input.bg,
                              borderWidth: 1,
                              borderColor: colors.border.light,
                              height: fieldHeight,
                              justifyContent: 'center',
                            }}
                          >
                            <TextInput
                              value={dayInputs[editingRule.id] ?? String(editingRule.afterDays)}
                              onChangeText={(value) => {
                                const numeric = value.replace(/[^0-9]/g, '');
                                setDayInputs((prev) => ({ ...prev, [editingRule.id]: numeric }));
                                if (numeric.length === 0) return;
                                const parsed = parseInt(numeric, 10);
                                if (!Number.isNaN(parsed) && parsed > 0) {
                                  updateOrderAutomation(editingRule.id, { afterDays: parsed });
                                }
                              }}
                              onFocus={() => setActiveDayInputRuleId(editingRule.id)}
                              onBlur={() => {
                                setActiveDayInputRuleId((current) => (current === editingRule.id ? null : current));
                                commitAfterDays(editingRule, dayInputs[editingRule.id] ?? String(editingRule.afterDays));
                              }}
                              keyboardType="number-pad"
                              placeholder="10"
                              placeholderTextColor={colors.input.placeholder}
                              style={{ color: colors.input.text, fontSize: 16, fontWeight: '500' }}
                              selectionColor={colors.text.primary}
                            />
                          </View>
                        </View>
                      </View>

                      <View className="mb-4">
                        <Text style={{ color: colors.text.secondary }} className="text-xs font-semibold mb-2">
                          When the order status is
                        </Text>
                        <Pressable
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setStatusPickerTarget({ ruleId: editingRule.id, field: 'fromStatus' });
                          }}
                          className="rounded-xl px-4 flex-row items-center justify-between active:opacity-70"
                          style={{
                            backgroundColor: colors.input.bg,
                            borderWidth: 1,
                            borderColor: colors.border.light,
                            height: fieldHeight,
                          }}
                        >
                          {editingRule.fromStatus ? (
                            <View className="flex-row items-center flex-1">
                              <View className="w-2.5 h-2.5 rounded-full mr-2" style={{ backgroundColor: getStatusColor(editingRule.fromStatus) }} />
                              <Text style={{ color: colors.input.text, fontSize: 14, fontWeight: '500' }}>{editingRule.fromStatus}</Text>
                            </View>
                          ) : (
                            <Text style={{ color: colors.input.placeholder, fontSize: 14 }}>Select a status…</Text>
                          )}
                          <ChevronDown size={16} color={colors.text.tertiary} strokeWidth={2} />
                        </Pressable>
                      </View>

                      <View>
                        <Text style={{ color: colors.text.secondary }} className="text-xs font-semibold mb-2">Move it to</Text>
                        <Pressable
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setStatusPickerTarget({ ruleId: editingRule.id, field: 'toStatus' });
                          }}
                          className="rounded-xl px-4 flex-row items-center justify-between active:opacity-70"
                          style={{
                            backgroundColor: colors.input.bg,
                            borderWidth: 1,
                            borderColor: colors.border.light,
                            height: fieldHeight,
                          }}
                        >
                          {editingRule.toStatus ? (
                            <View className="flex-row items-center flex-1">
                              <View className="w-2.5 h-2.5 rounded-full mr-2" style={{ backgroundColor: getStatusColor(editingRule.toStatus) }} />
                              <Text style={{ color: colors.input.text, fontSize: 14, fontWeight: '500' }}>{editingRule.toStatus}</Text>
                            </View>
                          ) : (
                            <Text style={{ color: colors.input.placeholder, fontSize: 14 }}>Select a status…</Text>
                          )}
                          <ChevronDown size={16} color={colors.text.tertiary} strokeWidth={2} />
                        </Pressable>
                      </View>

                      {editingRule.fromStatus && editingRule.toStatus ? (
                        <View
                          className="rounded-xl px-4 py-3 mt-4 flex-row items-start"
                          style={{ backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#F59E0B40' }}
                        >
                          <Zap size={14} color="#92400E" strokeWidth={2} style={{ marginTop: 1 }} />
                          <Text style={{ color: '#92400E' }} className="text-xs ml-2 flex-1 leading-5">
                            Orders in <Text className="font-bold">"{editingRule.fromStatus}"</Text> for more than <Text className="font-bold">{editingRule.afterDays} days</Text> will move to <Text className="font-bold">"{editingRule.toStatus}"</Text>.
                          </Text>
                        </View>
                      ) : null}

                      <View className="flex-row mt-5" style={{ gap: 10 }}>
                        <Pressable
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            deleteOrderAutomation(editingRule.id);
                            setEditingRuleId(null);
                          }}
                          className="h-12 items-center justify-center active:opacity-80"
                          style={{ width: 44 }}
                          accessibilityRole="button"
                          accessibilityLabel="Delete automation rule"
                        >
                          <Trash2 size={14} color={settingsPalette.danger} strokeWidth={2.2} />
                        </Pressable>
                        <Pressable
                          onPress={() => setEditingRuleId(null)}
                          className="rounded-full h-12 items-center justify-center active:opacity-80"
                          style={{ flex: 1, backgroundColor: FYLL_LIME }}
                        >
                          <MoneyText style={{ color: FYLL_LIME_INK, fontSize: 14, fontWeight: '700' }}>Save rule</MoneyText>
                        </Pressable>
                      </View>
                    </View>
                  </ScrollView>
                </Pressable>
              ) : null}
            </Pressable>
          </Modal>

          <Modal
            visible={Boolean(statusPickerTarget)}
            transparent
            animationType="slide"
            onRequestClose={() => setStatusPickerTarget(null)}
          >
            <Pressable
              className="flex-1"
              style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
              onPress={() => setStatusPickerTarget(null)}
            />
            <View className="rounded-t-3xl px-5 pt-5 pb-8" style={{ backgroundColor: colors.bg.primary }}>
              <View className="flex-row items-center justify-between mb-4">
                <Text style={{ color: colors.text.primary }} className="text-base font-bold">{pickerTitle}</Text>
                <Pressable
                  onPress={() => setStatusPickerTarget(null)}
                  className="w-8 h-8 rounded-full items-center justify-center active:opacity-60"
                  style={{ backgroundColor: colors.bg.secondary }}
                >
                  <X size={16} color={colors.text.secondary} strokeWidth={2} />
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 320 }}>
                {orderedOrderStatuses.map((status) => (
                  <Pressable
                    key={status.id}
                    onPress={() => {
                      if (!statusPickerTarget) return;
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      const updates: Partial<OrderAutomationRule> = statusPickerTarget.field === 'fromStatus'
                        ? { fromStatus: status.name }
                        : { toStatus: status.name };
                      updateOrderAutomation(statusPickerTarget.ruleId, updates);
                      setStatusPickerTarget(null);
                    }}
                    className="flex-row items-center py-3 active:opacity-60"
                    style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light }}
                  >
                    <View className="w-3 h-3 rounded-full mr-3" style={{ backgroundColor: status.color }} />
                    <Text style={{ color: colors.text.primary }} className="text-sm flex-1">{status.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </Modal>
        </SafeAreaView>
      </View>
    </View>
  );
}
