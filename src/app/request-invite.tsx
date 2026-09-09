import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, User as UserIcon, Mail, Building2, MessageSquare, CheckCircle2, RotateCcw, Undo2, Truck, Instagram } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useResolvedThemeMode, useThemeColors, type ThemeColors } from '@/lib/theme';
import { FyllLogo } from '@/components/FyllLogo';
import { supabase } from '@/lib/supabase';

export default function RequestInviteScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const isWide = isWeb && width >= 1200;
  const isDark = useResolvedThemeMode() === 'dark';
  const primaryActionBg = isDark ? '#FFFFFF' : '#111111';
  const primaryActionText = isDark ? '#111111' : '#FFFFFF';

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [message, setMessage] = useState('');
  const [refundPolicy, setRefundPolicy] = useState<boolean | null>(null);
  const [returnPolicy, setReturnPolicy] = useState<boolean | null>(null);
  const [deliveryPolicy, setDeliveryPolicy] = useState<boolean | null>(null);
  const [instagramHandle, setInstagramHandle] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!fullName.trim() || !email.trim() || !businessName.trim() || !message.trim()) {
      setError('Please fill in your name, email, business name, and message');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (!email.includes('@')) {
      setError('Invalid email address');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (refundPolicy === null || returnPolicy === null || deliveryPolicy === null) {
      setError('Please answer the refund, return, and delivery policy questions');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const { error: rpcError } = await supabase.rpc('submit_invitation_request', {
        full_name_input: fullName.trim(),
        email_input: email.trim(),
        business_name_input: businessName.trim(),
        message_input: message.trim(),
        refund_policy_input: refundPolicy,
        return_policy_input: returnPolicy,
        delivery_policy_input: deliveryPolicy,
        instagram_handle_input: instagramHandle.trim() || null,
      });

      if (rpcError) {
        throw rpcError;
      }

      supabase.functions.invoke('send-invite-request-notification', {
        body: {
          fullName: fullName.trim(),
          email: email.trim(),
          businessName: businessName.trim(),
          message: message.trim(),
          refundPolicy,
          returnPolicy,
          deliveryPolicy,
          instagramHandle: instagramHandle.trim(),
        },
      }).catch((notifyError) => {
        console.warn('Invitation request notification failed (non-fatal):', notifyError);
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsSubmitted(true);
    } catch (err) {
      console.error('Invitation request failed:', err);
      const message = (err as { message?: string })?.message ?? 'Could not send your request. Please try again.';
      setError(message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg.primary }}>
      <SafeAreaView className="flex-1">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          <ScrollView
            className="flex-1"
            contentContainerStyle={isWide ? { flexGrow: 1 } : { paddingBottom: 32 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View className={isWide ? 'flex-1 items-center justify-center' : 'flex-1'}>
              <View className={isWide ? 'w-full max-w-[480px] px-10 py-12' : 'flex-1 px-6 pt-4'}>
                <Pressable
                  onPress={() => router.replace('/start')}
                  className="w-10 h-10 rounded-xl items-center justify-center mb-6 active:opacity-50"
                  style={{ backgroundColor: colors.bg.secondary }}
                >
                  <ChevronLeft size={20} color={colors.text.primary} strokeWidth={2} />
                </Pressable>

                {isSubmitted ? (
                  <View className="items-center mt-6">
                    <CheckCircle2 size={48} color="#22C55E" strokeWidth={1.5} />
                    <Text style={{ color: colors.text.primary }} className="text-2xl font-bold mt-4 text-center">
                      Request Sent
                    </Text>
                    <Text style={{ color: colors.text.tertiary }} className="text-base text-center mt-2">
                      Thanks{fullName.trim() ? `, ${fullName.trim().split(' ')[0]}` : ''}. Our team will review your
                      request and reach out to {email.trim()} soon.
                    </Text>
                    <Pressable
                      onPress={() => router.replace('/start')}
                      className="mt-8 rounded-xl items-center justify-center active:opacity-80 self-stretch"
                      style={{ backgroundColor: primaryActionBg, height: 56 }}
                    >
                      <Text style={{ color: primaryActionText }} className="font-semibold text-base">
                        Back to Start
                      </Text>
                    </Pressable>
                  </View>
                ) : (
                  <>
                    <View className="items-center mb-8">
                      <FyllLogo width={50} color={colors.text.primary} />
                      <Text style={{ color: colors.text.primary }} className="text-2xl font-bold mt-4 text-center">
                        Request an Invitation
                      </Text>
                      <Text style={{ color: colors.text.tertiary }} className="text-base text-center mt-2">
                        Tell us about your business and we'll be in touch about access
                      </Text>
                    </View>

                    <View className="mb-4">
                      <Text style={{ color: colors.text.secondary }} className="text-sm font-medium mb-2">
                        Full Name
                      </Text>
                      <View
                        className="flex-row items-center rounded-xl px-4"
                        style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: error ? '#EF4444' : colors.input.border, height: 56 }}
                      >
                        <UserIcon size={20} color={colors.text.tertiary} strokeWidth={1.5} />
                        <TextInput
                          value={fullName}
                          onChangeText={(text) => { setFullName(text); setError(''); }}
                          placeholder="Your name"
                          placeholderTextColor={colors.input.placeholder}
                          autoCapitalize="words"
                          style={{ flex: 1, color: colors.input.text, fontSize: 16, marginLeft: 12 }}
                          selectionColor={colors.text.primary}
                        />
                      </View>
                    </View>

                    <View className="mb-4">
                      <Text style={{ color: colors.text.secondary }} className="text-sm font-medium mb-2">
                        Email Address
                      </Text>
                      <View
                        className="flex-row items-center rounded-xl px-4"
                        style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: error ? '#EF4444' : colors.input.border, height: 56 }}
                      >
                        <Mail size={20} color={colors.text.tertiary} strokeWidth={1.5} />
                        <TextInput
                          value={email}
                          onChangeText={(text) => { setEmail(text); setError(''); }}
                          placeholder="you@business.com"
                          placeholderTextColor={colors.input.placeholder}
                          keyboardType="email-address"
                          autoCapitalize="none"
                          autoCorrect={false}
                          style={{ flex: 1, color: colors.input.text, fontSize: 16, marginLeft: 12 }}
                          selectionColor={colors.text.primary}
                        />
                      </View>
                    </View>

                    <View className="mb-4">
                      <Text style={{ color: colors.text.secondary }} className="text-sm font-medium mb-2">
                        Business Name
                      </Text>
                      <View
                        className="flex-row items-center rounded-xl px-4"
                        style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.input.border, height: 56 }}
                      >
                        <Building2 size={20} color={colors.text.tertiary} strokeWidth={1.5} />
                        <TextInput
                          value={businessName}
                          onChangeText={setBusinessName}
                          placeholder="Your business"
                          placeholderTextColor={colors.input.placeholder}
                          autoCapitalize="words"
                          style={{ flex: 1, color: colors.input.text, fontSize: 16, marginLeft: 12 }}
                          selectionColor={colors.text.primary}
                        />
                      </View>
                    </View>

                    <View className="mb-4">
                      <Text style={{ color: colors.text.secondary }} className="text-sm font-medium mb-2">
                        Instagram Profile (optional)
                      </Text>
                      <View
                        className="flex-row items-center rounded-xl px-4"
                        style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.input.border, height: 56 }}
                      >
                        <Instagram size={20} color={colors.text.tertiary} strokeWidth={1.5} />
                        <TextInput
                          value={instagramHandle}
                          onChangeText={setInstagramHandle}
                          placeholder="@yourbusiness"
                          placeholderTextColor={colors.input.placeholder}
                          autoCapitalize="none"
                          autoCorrect={false}
                          style={{ flex: 1, color: colors.input.text, fontSize: 16, marginLeft: 12 }}
                          selectionColor={colors.text.primary}
                        />
                      </View>
                    </View>

                    <PolicyToggleRow
                      icon={<RotateCcw size={18} color={colors.text.tertiary} strokeWidth={1.5} />}
                      label="Do you have a refund policy?"
                      value={refundPolicy}
                      onChange={setRefundPolicy}
                      colors={colors}
                    />

                    <PolicyToggleRow
                      icon={<Undo2 size={18} color={colors.text.tertiary} strokeWidth={1.5} />}
                      label="Do you have a return policy?"
                      value={returnPolicy}
                      onChange={setReturnPolicy}
                      colors={colors}
                    />

                    <PolicyToggleRow
                      icon={<Truck size={18} color={colors.text.tertiary} strokeWidth={1.5} />}
                      label="Do you have a delivery policy?"
                      value={deliveryPolicy}
                      onChange={setDeliveryPolicy}
                      colors={colors}
                    />

                    <View className="mb-4">
                      <Text style={{ color: colors.text.secondary }} className="text-sm font-medium mb-2">
                        Message
                      </Text>
                      <View
                        className="flex-row items-start rounded-xl px-4 py-3"
                        style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.input.border, minHeight: 88 }}
                      >
                        <MessageSquare size={20} color={colors.text.tertiary} strokeWidth={1.5} style={{ marginTop: 2 }} />
                        <TextInput
                          value={message}
                          onChangeText={setMessage}
                          placeholder="What are you looking to do with Fyll?"
                          placeholderTextColor={colors.input.placeholder}
                          multiline
                          textAlignVertical="top"
                          style={{ flex: 1, color: colors.input.text, fontSize: 16, marginLeft: 12, minHeight: 60 }}
                          selectionColor={colors.text.primary}
                        />
                      </View>
                    </View>

                    {error ? (
                      <View className="mb-4 p-3 rounded-xl" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}>
                        <Text className="text-red-500 text-sm text-center">{error}</Text>
                      </View>
                    ) : null}

                    <Pressable
                      onPress={handleSubmit}
                      disabled={isSubmitting}
                      className="rounded-xl items-center justify-center active:opacity-80 flex-row"
                      style={{ backgroundColor: primaryActionBg, height: 56, opacity: isSubmitting ? 0.7 : 1 }}
                    >
                      {isSubmitting && (
                        <ActivityIndicator size="small" color={primaryActionText} style={{ marginRight: 8 }} />
                      )}
                      <Text style={{ color: primaryActionText }} className="font-semibold text-base">
                        {isSubmitting ? 'Sending...' : 'Send Request'}
                      </Text>
                    </Pressable>
                  </>
                )}
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function PolicyToggleRow({
  icon,
  label,
  value,
  onChange,
  colors,
}: {
  icon: React.ReactNode;
  label: string;
  value: boolean | null;
  onChange: (value: boolean) => void;
  colors: ThemeColors;
}) {
  return (
    <View className="mb-4">
      <View className="flex-row items-center mb-2">
        {icon}
        <Text style={{ color: colors.text.secondary }} className="text-sm font-medium ml-2">
          {label}
        </Text>
      </View>
      <View className="flex-row" style={{ gap: 10 }}>
        <Pressable
          onPress={() => onChange(true)}
          className="flex-1 rounded-xl items-center justify-center active:opacity-80"
          style={{
            height: 48,
            borderWidth: 1,
            borderColor: value === true ? colors.text.primary : colors.input.border,
            backgroundColor: value === true ? colors.text.primary : colors.input.bg,
          }}
        >
          <Text
            style={{ color: value === true ? colors.bg.primary : colors.text.primary }}
            className="font-semibold text-base"
          >
            Yes
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onChange(false)}
          className="flex-1 rounded-xl items-center justify-center active:opacity-80"
          style={{
            height: 48,
            borderWidth: 1,
            borderColor: value === false ? colors.text.primary : colors.input.border,
            backgroundColor: value === false ? colors.text.primary : colors.input.bg,
          }}
        >
          <Text
            style={{ color: value === false ? colors.bg.primary : colors.text.primary }}
            className="font-semibold text-base"
          >
            No
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
