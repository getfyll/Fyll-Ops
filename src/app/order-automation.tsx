import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, View, Text, Pressable, TextInput, Switch, Modal, ScrollView, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Zap, ChevronDown, X, Check, Plus, Trash2, MoreVertical, Pencil } from 'lucide-react-native';
import { useThemeColors } from '@/lib/theme';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import * as Haptics from 'expo-haptics';
import { getSettingsWebPanelStyles, isFromSettingsRoute } from '@/lib/settings-web-panel';
import { sortOrderStatusesForFulfillment } from '@/lib/order-status';
import { useSettingsBack } from '@/lib/useSettingsBack';
import useFyllStore, { type OrderAutomationRule } from '@/lib/state/fyll-store';
import useAuthStore from '@/lib/state/auth-store';

type PickerTarget = {
  ruleId: string;
  field: 'fromStatus' | 'toStatus';
} | null;

const createRuleId = () => `automation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export default function OrderAutomationScreen() {
  const { from } = useLocalSearchParams<{ from?: string | string[] }>();
  const goBack = useSettingsBack();
  const colors = useThemeColors();
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
  const [actionMenuRuleId, setActionMenuRuleId] = useState<string | null>(null);
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
    backgroundColor: colors.text.primary,
    borderRadius: 999,
  } as const;
  const primaryPillTextStyle = {
    color: colors.bg.primary,
  } as const;
  const fieldHeight = 56;
  const settingsContentWidthStyle = (
    isWebDesktop
      ? ({ width: '100%', maxWidth: 1440, alignSelf: 'flex-start' } as const)
      : ({ width: '100%' } as const)
  );

  const getStatusColor = (statusName: string) => {
    return orderStatuses.find((status) => status.name === statusName)?.color ?? colors.text.tertiary;
  };

  const editingRule = orderAutomations.find((rule) => rule.id === editingRuleId) ?? null;

  const renderStatusChip = (statusName: string, maxWidth = 150) => (
    statusName ? (
      <View
        className="flex-row items-center rounded-full px-2.5 py-1"
        style={{ backgroundColor: colors.bg.secondary, maxWidth, minWidth: 0 }}
      >
        <View className="w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: getStatusColor(statusName) }} />
        <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '500', flexShrink: 1 }} numberOfLines={1}>
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
    setActionMenuRuleId(null);
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
        <SafeAreaView className="flex-1" edges={['top']}>
          <View
            className={isWebDesktop ? 'pl-5 pr-7 pt-5 pb-4 flex-row items-center justify-between' : 'px-5 pt-4 pb-3 flex-row items-center justify-between'}
            style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light }}
          >
            <View style={settingsContentWidthStyle} className="flex-row items-center justify-between">
              <View className="flex-row items-center flex-1">
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    goBack();
                  }}
                  className="w-10 h-10 rounded-xl items-center justify-center mr-3 active:opacity-50"
                  style={{ backgroundColor: 'transparent' }}
                >
                  <ArrowLeft size={20} color={colors.text.primary} strokeWidth={2} />
                </Pressable>
                <View className="flex-1">
                  <Text
                    style={{
                      color: colors.text.primary,
                      fontSize: Platform.OS === 'web' ? 14 : 20,
                      lineHeight: Platform.OS === 'web' ? 18 : 24,
                      fontWeight: '600',
                    }}
                  >
                    Order Automation
                  </Text>
                  {saveStatus === 'saved' && (
                    <Text style={{ color: '#10B981' }} className="text-xs mt-0.5">Saved</Text>
                  )}
                  {saveStatus === 'error' && (
                    <Text style={{ color: '#EF4444' }} className="text-xs mt-0.5">Save failed</Text>
                  )}
                </View>
              </View>

              <Pressable
                onPress={handleSave}
                disabled={saveStatus === 'saving'}
                className="px-4 h-10 rounded-full items-center justify-center active:opacity-80"
                style={[primaryPillButtonStyle, { opacity: saveStatus === 'saving' ? 0.7 : 1, minWidth: 80 }]}
              >
                {saveStatus === 'saving' ? (
                  <Text style={primaryPillTextStyle} className="font-semibold text-sm">Saving…</Text>
                ) : saveStatus === 'saved' ? (
                  <View className="flex-row items-center">
                    <Check size={14} color={colors.bg.primary} strokeWidth={2.5} />
                    <Text style={primaryPillTextStyle} className="font-semibold text-sm ml-1">Saved</Text>
                  </View>
                ) : (
                  <Text style={primaryPillTextStyle} className="font-semibold text-sm">Save</Text>
                )}
              </Pressable>
            </View>
          </View>

          <KeyboardAwareScrollView
            className="flex-1"
            showsVerticalScrollIndicator={false}
            enableOnAndroid
            extraScrollHeight={100}
          >
            <View
              style={settingsContentWidthStyle}
              className={isWebDesktop ? 'pl-5 pr-7 pt-4' : 'px-5 pt-5'}
            >
              <View
                className="rounded-2xl p-4 mb-5"
                style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
              >
                <View className="flex-row items-center mb-1">
                  <View
                    className="w-9 h-9 rounded-xl items-center justify-center mr-3"
                    style={{ backgroundColor: autoCompleteOrders ? '#FEF3C7' : colors.bg.secondary }}
                  >
                    <Zap size={18} color={autoCompleteOrders ? '#F59E0B' : colors.text.tertiary} strokeWidth={2} />
                  </View>
                  <View className="flex-1 mr-3">
                    <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">Auto-complete orders</Text>
                    <Text style={{ color: colors.text.muted }} className="text-xs mt-0.5">
                      Automatically move stale orders to a new status
                    </Text>
                  </View>
                  <Switch
                    value={autoCompleteOrders}
                    onValueChange={(value) => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setAutoCompleteOrders(value);
                      if (value && orderAutomations.length === 0) {
                        addOrderAutomation({
                          id: createRuleId(),
                          enabled: true,
                          fromStatus: autoCompleteFromStatus,
                          toStatus: autoCompleteToStatus,
                          afterDays: autoCompleteAfterDays,
                        });
                      }
                    }}
                    trackColor={{ false: colors.bg.secondary, true: colors.text.primary }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              </View>

              {autoCompleteOrders && (
                <>
                <View className="flex-row items-center justify-between mb-3">
                  <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase tracking-wider">
                    Rules
                  </Text>
                  <Pressable
                    onPress={handleAddRule}
                    className="px-3 h-8 rounded-full flex-row items-center active:opacity-70"
                    style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
                  >
                    <Plus size={14} color={colors.text.primary} strokeWidth={2} />
                    <Text style={{ color: colors.text.primary }} className="text-xs font-semibold ml-1.5">Add rule</Text>
                  </Pressable>
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
                    className="rounded-2xl overflow-visible mb-5"
                    style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
                  >
                    <View
                      className="flex-row items-center px-4 py-3"
                      style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light }}
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
                      <View style={{ width: 42 }} />
                    </View>

                    {orderAutomations.map((rule, index) => {
                      const fromStatus = rule.fromStatus?.trim() ?? '';
                      const toStatus = rule.toStatus?.trim() ?? '';
                      const afterDays = Number.isFinite(rule.afterDays) && rule.afterDays > 0 ? rule.afterDays : 10;
                      const actionMenuOpen = actionMenuRuleId === rule.id;

                      return (
                        <View key={rule.id} style={{ position: 'relative', zIndex: actionMenuOpen ? 10 : 1 }}>
                          <View
                            className="flex-row items-center px-4 py-3"
                            style={index > 0 ? { borderTopWidth: 1, borderTopColor: colors.border.light } : undefined}
                          >
                            <View style={{ flex: 0.85, paddingRight: 10 }}>
                              <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '500' }}>
                                Rule {index + 1}
                              </Text>
                              <Text style={{ color: colors.text.muted, fontSize: 11, marginTop: 2 }}>
                                After {afterDays} day{afterDays === 1 ? '' : 's'}
                              </Text>
                            </View>

                            <View className="flex-row items-center" style={{ flex: 1.95, gap: 6, minWidth: 0, paddingRight: 12, overflow: 'hidden' }}>
                              {renderStatusChip(fromStatus, 160)}
                              <Text style={{ color: colors.text.muted, fontSize: 12 }}>→</Text>
                              {renderStatusChip(toStatus, 160)}
                            </View>

                            <View style={{ width: 104, alignItems: 'center' }}>
                              <Switch
                                value={rule.enabled}
                                onValueChange={(value) => {
                                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                  updateOrderAutomation(rule.id, { enabled: value });
                                }}
                                trackColor={{ false: colors.bg.secondary, true: colors.text.primary }}
                                thumbColor="#FFFFFF"
                              />
                            </View>

                            <Pressable
                              onPress={() => setActionMenuRuleId((current) => (current === rule.id ? null : rule.id))}
                              className="w-10 h-10 rounded-full items-center justify-center active:opacity-70"
                            >
                              <MoreVertical size={17} color={colors.text.secondary} strokeWidth={2.3} />
                            </Pressable>
                          </View>

                          {actionMenuOpen ? (
                            <View
                              style={{
                                position: 'absolute',
                                right: 12,
                                top: 48,
                                width: 156,
                                borderRadius: 16,
                                overflow: 'hidden',
                                backgroundColor: colors.bg.card,
                                borderWidth: 1,
                                borderColor: colors.border.light,
                                shadowColor: '#000000',
                                shadowOpacity: 0.12,
                                shadowRadius: 16,
                                shadowOffset: { width: 0, height: 8 },
                                elevation: 8,
                                zIndex: 20,
                              }}
                            >
                              <Pressable
                                onPress={() => {
                                  setEditingRuleId(rule.id);
                                  setActionMenuRuleId(null);
                                }}
                                className="flex-row items-center px-3 py-3 active:opacity-70"
                              >
                                <Pencil size={14} color={colors.text.primary} strokeWidth={2} />
                                <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '500', marginLeft: 8 }}>Edit</Text>
                              </Pressable>
                              <Pressable
                                onPress={() => {
                                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                  deleteOrderAutomation(rule.id);
                                  setActionMenuRuleId(null);
                                  setEditingRuleId((current) => (current === rule.id ? null : current));
                                }}
                                className="flex-row items-center px-3 py-3 active:opacity-70"
                                style={{ borderTopWidth: 1, borderTopColor: colors.border.light }}
                              >
                                <Trash2 size={14} color="#B91C1C" strokeWidth={2} />
                                <Text style={{ color: '#B91C1C', fontSize: 13, fontWeight: '500', marginLeft: 8 }}>Delete</Text>
                              </Pressable>
                            </View>
                          ) : null}
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

          <Modal
            visible={Boolean(editingRule)}
            transparent
            animationType="fade"
            onRequestClose={() => setEditingRuleId(null)}
          >
            <Pressable
              className="flex-1 items-center justify-center px-5"
              style={{ backgroundColor: 'rgba(0,0,0,0.42)' }}
              onPress={() => setEditingRuleId(null)}
            >
              {editingRule ? (
                <Pressable
                  onPress={(event) => event.stopPropagation()}
                  className="w-full rounded-3xl overflow-hidden"
                  style={{
                    maxWidth: 520,
                    backgroundColor: colors.bg.card,
                    borderWidth: 1,
                    borderColor: colors.border.light,
                  }}
                >
                  <View
                    className="flex-row items-center justify-between px-5 py-4"
                    style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light }}
                  >
                    <View>
                      <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: '600' }}>
                        Edit automation
                      </Text>
                      <Text style={{ color: colors.text.muted, fontSize: 12, marginTop: 2 }}>
                        Update the status rule and delay.
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => setEditingRuleId(null)}
                      className="w-9 h-9 rounded-full items-center justify-center active:opacity-70"
                      style={{ backgroundColor: colors.bg.secondary }}
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
                          <Text style={{ color: colors.text.secondary }} className="ml-3 text-sm font-medium">days</Text>
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

                      <Pressable
                        onPress={() => setEditingRuleId(null)}
                        className="rounded-full h-12 items-center justify-center mt-5 active:opacity-80"
                        style={{ backgroundColor: colors.text.primary }}
                      >
                        <Text style={{ color: colors.bg.primary, fontSize: 14, fontWeight: '600' }}>Save</Text>
                      </Pressable>
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
