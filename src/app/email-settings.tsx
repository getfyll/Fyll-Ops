import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, View, Text, Pressable, TextInput, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Check } from 'lucide-react-native';
import { useResolvedThemeMode, useThemeColors } from '@/lib/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import { getSettingsWebPanelStyles, isFromSettingsRoute } from '@/lib/settings-web-panel';
import { useSettingsBack } from '@/lib/useSettingsBack';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import useFyllStore from '@/lib/state/fyll-store';
import useAuthStore from '@/lib/state/auth-store';
import { FYLL_LIME, FYLL_LIME_INK, MoneyText, usePaymentsPalette } from '@/components/payments/payments-ui';
import { LimeToggle } from '@/components/settings/LimeToggle';

export default function EmailSettingsScreen() {
  const { from } = useLocalSearchParams<{ from?: string | string[] }>();
  const goBack = useSettingsBack();
  const colors = useThemeColors();
  const palette = usePaymentsPalette();
  const resolvedThemeMode = useResolvedThemeMode();
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
  const { businessName, businessSlug } = useBusinessSettings();
  const orderStatusEmailEnabled = useFyllStore((s) => s.orderStatusEmailEnabled);
  const setOrderStatusEmailEnabled = useFyllStore((s) => s.setOrderStatusEmailEnabled);
  const deliveryFollowUpEnabled = useFyllStore((s) => s.deliveryFollowUpEnabled);
  const deliveryFollowUpDelayDays = useFyllStore((s) => s.deliveryFollowUpDelayDays);
  const deliveryFollowUpResendDays = useFyllStore((s) => s.deliveryFollowUpResendDays);
  const setDeliveryFollowUpEnabled = useFyllStore((s) => s.setDeliveryFollowUpEnabled);
  const setDeliveryFollowUpDelayDays = useFyllStore((s) => s.setDeliveryFollowUpDelayDays);
  const setDeliveryFollowUpResendDays = useFyllStore((s) => s.setDeliveryFollowUpResendDays);
  const saveGlobalSettings = useFyllStore((s) => s.saveGlobalSettings);

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [deliveryFollowUpDayInput, setDeliveryFollowUpDayInput] = useState<string>(String(deliveryFollowUpDelayDays || 7));
  const [deliveryFollowUpResendDayInput, setDeliveryFollowUpResendDayInput] = useState<string>(String(deliveryFollowUpResendDays || 7));
  const [testEmail, setTestEmail] = useState<string>('');
  const [testSendState, setTestSendState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [testSendVariant, setTestSendVariant] = useState<'prompt' | 'delivered' | 'pending' | null>(null);
  const [testSendMessage, setTestSendMessage] = useState<string>('');
  const [testNotificationState, setTestNotificationState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [testNotificationVariant, setTestNotificationVariant] = useState<'delivered' | 'pending' | null>(null);
  const [testNotificationMessage, setTestNotificationMessage] = useState<string>('');
  const hasInitializedAutoSaveRef = useRef(false);
  const lastSavedSignatureRef = useRef('');

  useEffect(() => {
    const normalized = Number.isFinite(deliveryFollowUpDelayDays) && deliveryFollowUpDelayDays > 0
      ? String(deliveryFollowUpDelayDays)
      : '7';
    setDeliveryFollowUpDayInput((current) => (current === normalized ? current : normalized));
  }, [deliveryFollowUpDelayDays]);

  useEffect(() => {
    const normalized = Number.isFinite(deliveryFollowUpResendDays) && deliveryFollowUpResendDays > 0
      ? String(deliveryFollowUpResendDays)
      : '7';
    setDeliveryFollowUpResendDayInput((current) => (current === normalized ? current : normalized));
  }, [deliveryFollowUpResendDays]);

  const emailSettingsSignature = useMemo(() => JSON.stringify({
    orderStatusEmailEnabled,
    deliveryFollowUpEnabled,
    deliveryFollowUpDelayDays: Number.isFinite(deliveryFollowUpDelayDays) && deliveryFollowUpDelayDays > 0
      ? Math.floor(deliveryFollowUpDelayDays)
      : 7,
    deliveryFollowUpResendDays: Number.isFinite(deliveryFollowUpResendDays) && deliveryFollowUpResendDays > 0
      ? Math.floor(deliveryFollowUpResendDays)
      : 7,
  }), [
    orderStatusEmailEnabled,
    deliveryFollowUpDelayDays,
    deliveryFollowUpEnabled,
    deliveryFollowUpResendDays,
  ]);

  useEffect(() => {
    if (!businessId) return;

    if (!hasInitializedAutoSaveRef.current) {
      hasInitializedAutoSaveRef.current = true;
      lastSavedSignatureRef.current = emailSettingsSignature;
      return;
    }

    if (emailSettingsSignature === lastSavedSignatureRef.current) return;

    let isActive = true;
    const timeoutRef = setTimeout(async () => {
      setSaveStatus('saving');
      const result = await saveGlobalSettings(businessId);
      if (!isActive) return;

      if (result.success) {
        lastSavedSignatureRef.current = emailSettingsSignature;
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
  }, [emailSettingsSignature, businessId, saveGlobalSettings]);

  const primaryPillButtonStyle = {
    backgroundColor: FYLL_LIME,
    borderRadius: 999,
  } as const;
  const primaryPillTextStyle = {
    color: FYLL_LIME_INK,
  } as const;
  const fieldHeight = 56;
  const settingsContentWidthStyle = (
    isWebDesktop
      ? ({ width: '100%', maxWidth: 960, alignSelf: 'center' } as const)
      : ({ width: '100%' } as const)
  );

  const handleSendTestEmail = async (variant: 'prompt' | 'delivered' | 'pending') => {
    const normalizedEmail = testEmail.trim().toLowerCase();
    if (!businessId || !normalizedEmail) {
      setTestSendState('error');
      setTestSendVariant(variant);
      setTestSendMessage('Enter a test email first.');
      return;
    }

    setTestSendState('sending');
    setTestSendVariant(variant);
    setTestSendMessage('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const { error } = await supabase.functions.invoke('send-delivery-followup', {
      body: {
        type: 'delivery_followup_test',
        variant,
        businessId,
        businessSlug,
        email: normalizedEmail,
      },
    });

    if (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setTestSendState('error');
      setTestSendMessage('Test email failed to send.');
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTestSendState('sent');
    setTestSendMessage(`Sent ${variant} test email to ${normalizedEmail}.`);
  };

  const handleSendTestNotification = async (variant: 'delivered' | 'pending') => {
    if (!businessId) {
      setTestNotificationState('error');
      setTestNotificationVariant(variant);
      setTestNotificationMessage('Business not found for this test.');
      return;
    }

    setTestNotificationState('sending');
    setTestNotificationVariant(variant);
    setTestNotificationMessage('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const { error } = await supabase.functions.invoke('send-delivery-followup', {
      body: {
        type: 'delivery_confirmation_notification_test',
        businessId,
        received: variant === 'delivered',
      },
    });

    if (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setTestNotificationState('error');
      setTestNotificationMessage('Test notification failed to send.');
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTestNotificationState('sent');
    setTestNotificationMessage(
      variant === 'delivered'
        ? 'Sent delivered test notification to your business inbox.'
        : 'Sent pending delivery test notification to your business inbox.',
    );
  };

  return (
    <View style={panelStyles.outer}>
      <View style={panelStyles.inner}>
        <SafeAreaView className="flex-1" edges={['top']} style={{ backgroundColor: palette.page }}>
          <LinearGradient pointerEvents="none" colors={resolvedThemeMode === 'dark' ? ['rgba(111,125,18,0.55)', 'rgba(20,20,20,0)'] : ['rgba(213,224,87,0.42)', 'rgba(244,243,235,0)']} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: isWebDesktop ? 250 : 360 }} />
          <View
            style={{ minHeight: isWebDesktop ? 78 : 66, paddingHorizontal: isWebDesktop ? 20 : 10, paddingTop: isWebDesktop ? 20 : 12, paddingBottom: isWebDesktop ? 10 : 4, flexDirection: 'row', alignItems: 'center' }}
          >
            <View style={settingsContentWidthStyle} className="flex-row items-center justify-between">
              <View className="flex-row items-center flex-1">
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    goBack();
                  }}
                  className="w-10 h-10 rounded-full items-center justify-center mr-3 active:opacity-50"
                  style={{ backgroundColor: palette.softFill }}
                >
                  <ArrowLeft size={20} color={colors.text.primary} strokeWidth={2} />
                </Pressable>
                <View className="flex-1"><Text style={{ color: palette.faint, fontSize: 9.5, lineHeight: 12, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' }}>Settings</Text><Text style={{ color: palette.text, fontSize: 17, lineHeight: 21, fontWeight: '600' }}>Emails</Text></View>
              </View>

              {saveStatus === 'saving' ? (
                <Text style={{ color: colors.text.tertiary }} className="text-sm">Saving…</Text>
              ) : saveStatus === 'saved' ? (
                <View className="flex-row items-center" style={{ height: 28, paddingHorizontal: 10, borderRadius: 999, backgroundColor: palette.nudgeBg, gap: 5 }}>
                  <Check size={14} color="#10B981" strokeWidth={2.5} />
                  <Text style={{ color: palette.limeOnSurface, fontSize: 11, fontWeight: '700' }}>Saved</Text>
                </View>
              ) : saveStatus === 'error' ? (
                <Text style={{ color: palette.danger, fontSize: 11, fontWeight: '600' }}>Save failed</Text>
              ) : null}
            </View>
          </View>

          <KeyboardAwareScrollView
            className="flex-1"
            showsVerticalScrollIndicator={false}
            enableOnAndroid
            extraScrollHeight={100}
          >
            <View
              style={[settingsContentWidthStyle, { paddingHorizontal: isWebDesktop ? 24 : 16, paddingTop: 18 }]}
            >
              <View style={{ position: 'relative', overflow: 'hidden', minHeight: isWebDesktop ? 116 : 156, marginBottom: 20, padding: isWebDesktop ? 18 : 20, justifyContent: 'center', borderRadius: 28, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, shadowColor: '#000', shadowOpacity: resolvedThemeMode === 'dark' ? 0.24 : 0.07, shadowRadius: 24, shadowOffset: { width: 0, height: 10 } }}>
                <LinearGradient pointerEvents="none" colors={[palette.nudgeBg, 'transparent']} start={{ x: 1, y: 0 }} end={{ x: 0.2, y: 1 }} style={{ position: 'absolute', top: -44, right: -36, width: 210, height: 210, borderRadius: 105 }} />
                <View style={{ position: 'absolute', top: 0, left: 28, right: 28, height: 3, backgroundColor: FYLL_LIME }} />
                <View>
                  <Text style={{ color: palette.faint, fontSize: 10, fontWeight: '700', letterSpacing: 1.15, textTransform: 'uppercase' }}>Customer communication</Text>
                  <MoneyText style={{ color: palette.text, fontSize: 26, lineHeight: 31 }}>Email automation</MoneyText>
                  <Text style={{ color: palette.faint, fontSize: 12.5, marginTop: 3 }}>Keep customers updated automatically</Text>
                </View>
              </View>

              <Text style={{ color: palette.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 10, marginLeft: 2 }}>Email settings</Text>
              <View>
              <View>
              <View
                className="rounded-3xl p-5 mb-5"
                style={{ backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border }}
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 pr-4">
                    <Text style={{ color: colors.text.primary }} className="text-base font-semibold">
                      Order Status Update Emails
                    </Text>
                    <Text style={{ color: colors.text.muted }} className="text-xs mt-1 leading-5">
                      Email the customer whenever staff change an order's status from this app, the same way status updates from the storefront already do.
                    </Text>
                  </View>
                  <LimeToggle
                    value={orderStatusEmailEnabled}
                    onValueChange={(value) => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setOrderStatusEmailEnabled(value);
                    }}
                    inactiveColor={palette.softFill}
                    inactiveBorderColor={palette.outline}
                  />
                </View>
              </View>
              </View>

              <View>
              <View
                className="rounded-3xl p-5 mb-5"
                style={{ backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border }}
              >
                <View className="flex-row items-center justify-between mb-1">
                  <View className="flex-1 pr-4">
                    <Text style={{ color: colors.text.primary }} className="text-base font-semibold">
                      Delivery Confirmation Emails
                    </Text>
                    <Text style={{ color: colors.text.muted }} className="text-xs mt-1 leading-5">
                      Send a delivery confirmation email after dispatch, then resend it only if the customer has not replied or says the order is still pending delivery.
                    </Text>
                  </View>
                  <LimeToggle
                    value={deliveryFollowUpEnabled}
                    onValueChange={(value) => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setDeliveryFollowUpEnabled(value);
                    }}
                    inactiveColor={palette.softFill}
                    inactiveBorderColor={palette.outline}
                  />
                </View>

                {deliveryFollowUpEnabled ? (
                  <>
                    <View style={{ height: 1, backgroundColor: palette.hairline, marginTop: 14, marginBottom: 18 }} />

                    <View
                      className="rounded-2xl p-4"
                      style={{ backgroundColor: palette.inset, borderWidth: 1, borderColor: palette.border }}
                    >
                      <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">
                        Timing
                      </Text>
                      <Text style={{ color: colors.text.muted }} className="text-xs mt-1 leading-5">
                        Choose when the first email goes out and how long FYLL should wait before sending a follow-up reminder.
                      </Text>

                      <View
                        style={{
                          flexDirection: isWideLayout ? 'row' : 'column',
                          gap: 14,
                          marginTop: 16,
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.text.secondary }} className="text-xs font-semibold mb-2">
                            First send after
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <View
                              className="rounded-2xl px-4 flex-1"
                              style={{
                                backgroundColor: palette.card,
                                borderWidth: 1,
                                borderColor: palette.outline,
                                minHeight: fieldHeight,
                                justifyContent: 'center',
                              }}
                            >
                              <TextInput
                                value={deliveryFollowUpDayInput}
                                onChangeText={(value) => {
                                  const numeric = value.replace(/[^0-9]/g, '');
                                  setDeliveryFollowUpDayInput(numeric);
                                  if (!numeric) return;
                                  const parsed = parseInt(numeric, 10);
                                  if (!Number.isNaN(parsed) && parsed > 0) {
                                    setDeliveryFollowUpDelayDays(parsed);
                                  }
                                }}
                                onBlur={() => {
                                  const parsed = parseInt(deliveryFollowUpDayInput || '7', 10);
                                  const sanitized = Number.isFinite(parsed) && parsed > 0 ? parsed : 7;
                                  setDeliveryFollowUpDelayDays(sanitized);
                                  setDeliveryFollowUpDayInput(String(sanitized));
                                }}
                                keyboardType="number-pad"
                                placeholder="7"
                                placeholderTextColor={colors.input.placeholder}
                                style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}
                                selectionColor={FYLL_LIME}
                              />
                            </View>
                            <Text style={{ color: colors.text.secondary }} className="ml-3 text-sm font-medium">days</Text>
                          </View>
                        </View>

                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.text.secondary }} className="text-xs font-semibold mb-2">
                            Resend after
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <View
                              className="rounded-2xl px-4 flex-1"
                              style={{
                                backgroundColor: palette.card,
                                borderWidth: 1,
                                borderColor: palette.outline,
                                minHeight: fieldHeight,
                                justifyContent: 'center',
                              }}
                            >
                              <TextInput
                                value={deliveryFollowUpResendDayInput}
                                onChangeText={(value) => {
                                  const numeric = value.replace(/[^0-9]/g, '');
                                  setDeliveryFollowUpResendDayInput(numeric);
                                  if (!numeric) return;
                                  const parsed = parseInt(numeric, 10);
                                  if (!Number.isNaN(parsed) && parsed > 0) {
                                    setDeliveryFollowUpResendDays(parsed);
                                  }
                                }}
                                onBlur={() => {
                                  const parsed = parseInt(deliveryFollowUpResendDayInput || '7', 10);
                                  const sanitized = Number.isFinite(parsed) && parsed > 0 ? parsed : 7;
                                  setDeliveryFollowUpResendDays(sanitized);
                                  setDeliveryFollowUpResendDayInput(String(sanitized));
                                }}
                                keyboardType="number-pad"
                                placeholder="7"
                                placeholderTextColor={colors.input.placeholder}
                                style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}
                                selectionColor={FYLL_LIME}
                              />
                            </View>
                            <Text style={{ color: colors.text.secondary }} className="ml-3 text-sm font-medium">days</Text>
                          </View>
                        </View>
                      </View>
                    </View>

                    <View
                      className="rounded-2xl p-4 mt-4"
                      style={{ backgroundColor: palette.inset, borderWidth: 1, borderColor: palette.border }}
                    >
                      <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">
                        Email identity
                      </Text>
                      <Text style={{ color: colors.text.muted }} className="text-xs mt-1 leading-5">
                        Delivery emails send from the FYLL notifications domain as <Text style={{ color: colors.text.primary }}>{businessName?.trim() || 'Your business'} - Fyll</Text>.
                      </Text>
                    </View>

                    <View
                      className="rounded-2xl px-4 py-3 mt-4"
                      style={{ backgroundColor: palette.nudgeBg, borderWidth: 1, borderColor: palette.nudgeBorder }}
                    >
                      <Text style={{ color: palette.nudgeSub }} className="text-xs leading-5">
                        FYLL keeps the original order status until the customer replies. If the customer confirms delivery, the order moves to Delivered. If the customer says it has not arrived yet, the order moves to Pending Delivery and follow-up reminders continue on your schedule.
                      </Text>
                    </View>

                    <View
                      className="rounded-2xl p-4 mt-4"
                      style={{ backgroundColor: palette.inset, borderWidth: 1, borderColor: palette.border }}
                    >
                      <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">
                        Temporary test emails
                      </Text>
                      <Text style={{ color: colors.text.muted }} className="text-xs mt-1 leading-5">
                        Send the three delivery email variants to a test inbox before you switch this live.
                      </Text>

                      <View style={{ marginTop: 16 }}>
                        <Text style={{ color: colors.text.secondary }} className="text-xs font-semibold mb-2">
                          Test email
                        </Text>
                        <View
                          className="rounded-2xl px-4 justify-center"
                          style={{
                            backgroundColor: palette.card,
                            borderWidth: 1,
                            borderColor: palette.outline,
                            minHeight: fieldHeight,
                          }}
                        >
                          <TextInput
                            value={testEmail}
                            onChangeText={setTestEmail}
                            autoCapitalize="none"
                            keyboardType="email-address"
                            placeholder="test@yourdomain.com"
                            placeholderTextColor={colors.input.placeholder}
                            style={{ color: palette.text, fontSize: 14, fontWeight: '500' }}
                            selectionColor={FYLL_LIME}
                          />
                        </View>
                      </View>

                      <View
                        style={{
                          flexDirection: isWideLayout ? 'row' : 'column',
                          gap: 10,
                          marginTop: 16,
                        }}
                      >
                        {[
                          { key: 'prompt', label: 'Send prompt' },
                          { key: 'delivered', label: 'Send delivered' },
                          { key: 'pending', label: 'Send pending' },
                        ].map((item) => {
                          const isActive = testSendState === 'sending' && testSendVariant === item.key;
                          return (
                            <Pressable
                              key={item.key}
                              onPress={() => handleSendTestEmail(item.key as 'prompt' | 'delivered' | 'pending')}
                              disabled={testSendState === 'sending'}
                              className="rounded-full px-4 active:opacity-80 items-center justify-center"
                              style={[
                                primaryPillButtonStyle,
                                {
                                  flex: 1,
                                  minHeight: 46,
                                  opacity: testSendState === 'sending' && !isActive ? 0.55 : 1,
                                },
                              ]}
                            >
                              <Text style={primaryPillTextStyle} className="text-sm font-semibold">
                                {isActive ? 'Sending…' : item.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>

                      {testSendMessage ? (
                        <Text
                          style={{ color: testSendState === 'error' ? '#DC2626' : '#15803D' }}
                          className="text-xs mt-3"
                        >
                          {testSendMessage}
                        </Text>
                      ) : null}
                    </View>

                    <View
                      className="rounded-2xl p-4 mt-4"
                      style={{ backgroundColor: palette.inset, borderWidth: 1, borderColor: palette.border }}
                    >
                      <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">
                        Test business notifications
                      </Text>
                      <Text style={{ color: colors.text.muted }} className="text-xs mt-1 leading-5">
                        Simulate the customer delivery response notification in your staff notification drawer without using a real order.
                      </Text>

                      <View
                        style={{
                          flexDirection: isWideLayout ? 'row' : 'column',
                          gap: 10,
                          marginTop: 16,
                        }}
                      >
                        {[
                          { key: 'delivered', label: 'Test delivered' },
                          { key: 'pending', label: 'Test pending' },
                        ].map((item) => {
                          const isActive = testNotificationState === 'sending' && testNotificationVariant === item.key;
                          return (
                            <Pressable
                              key={item.key}
                              onPress={() => handleSendTestNotification(item.key as 'delivered' | 'pending')}
                              disabled={testNotificationState === 'sending'}
                              className="rounded-full px-4 active:opacity-80 items-center justify-center"
                              style={[
                                primaryPillButtonStyle,
                                {
                                  flex: 1,
                                  minHeight: 46,
                                  opacity: testNotificationState === 'sending' && !isActive ? 0.55 : 1,
                                },
                              ]}
                            >
                              <Text style={primaryPillTextStyle} className="text-sm font-semibold">
                                {isActive ? 'Sending…' : item.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>

                      {testNotificationMessage ? (
                        <Text
                          style={{ color: testNotificationState === 'error' ? '#DC2626' : '#15803D' }}
                          className="text-xs mt-3"
                        >
                          {testNotificationMessage}
                        </Text>
                      ) : null}
                    </View>
                  </>
                ) : null}
              </View>
              </View>
              </View>

              <View className="h-24" />
            </View>
          </KeyboardAwareScrollView>
        </SafeAreaView>
      </View>
    </View>
  );
}
