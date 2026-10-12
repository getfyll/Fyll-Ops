import React, { useState } from 'react';
import { Platform, Pressable, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Check, ChevronLeft } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { AuthField, AuthHeader, AuthPrimaryButton, AuthShell } from '@/components/auth/AuthShell';
import { FYLL_LIME, FYLL_LIME_INK, usePaymentsPalette } from '@/components/payments/payments-ui';
import { supabase } from '@/lib/supabase';

const AUTH_HERO_LOCAL_URI = '/images/auth-hero.png';
const AUTH_HERO_FALLBACK_URI = 'https://images.unsplash.com/photo-1623177579166-7029cf1d4d7e?auto=format&fit=crop&w=2000&q=80';

const noWebOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0 } as object) : null;

// Ask for access to Fyll Ops. Same split layout as sign in: the form on one side, the photo on the other.
export default function RequestInviteScreen() {
  const router = useRouter();
  const palette = usePaymentsPalette();
  const { width } = useWindowDimensions();
  const isWide = Platform.OS === 'web' && width >= 1200;

  const [heroUri, setHeroUri] = useState<string>(AUTH_HERO_LOCAL_URI);
  const [fullName, setFullName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [businessName, setBusinessName] = useState<string>('');
  const [onInstagram, setOnInstagram] = useState<boolean>(false);
  const [onTikTok, setOnTikTok] = useState<boolean>(false);
  const [instagramHandle, setInstagramHandle] = useState<string>('');
  const [tiktokHandle, setTiktokHandle] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [refundPolicy, setRefundPolicy] = useState<boolean | null>(null);
  const [returnPolicy, setReturnPolicy] = useState<boolean | null>(null);
  const [deliveryPolicy, setDeliveryPolicy] = useState<boolean | null>(null);
  const [messageFocused, setMessageFocused] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);

  const fail = (text: string) => {
    setError(text);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  };

  // Store handles the same way every time: one leading @, no spaces.
  const cleanHandle = (value: string) => {
    const bare = value.trim().replace(/^@+/, '').replace(/\s+/g, '');
    return bare ? `@${bare}` : '';
  };

  const handleSubmit = async () => {
    if (!fullName.trim() || !email.trim() || !businessName.trim() || !message.trim()) {
      fail('Please fill in your name, email, business name, and message');
      return;
    }
    if (!email.includes('@')) {
      fail('Invalid email address');
      return;
    }
    if (onInstagram && !cleanHandle(instagramHandle)) {
      fail('Add your Instagram handle, or untick Instagram');
      return;
    }
    if (onTikTok && !cleanHandle(tiktokHandle)) {
      fail('Add your TikTok handle, or untick TikTok');
      return;
    }
    if (refundPolicy === null || returnPolicy === null || deliveryPolicy === null) {
      fail('Please answer the refund, return, and delivery policy questions');
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
        instagram_handle_input: onInstagram ? cleanHandle(instagramHandle) : null,
        tiktok_handle_input: onTikTok ? cleanHandle(tiktokHandle) : null,
      });
      if (rpcError) throw rpcError;

      supabase.functions.invoke('send-invite-request-notification', {
        body: {
          fullName: fullName.trim(),
          email: email.trim(),
          businessName: businessName.trim(),
          message: message.trim(),
          refundPolicy,
          returnPolicy,
          deliveryPolicy,
          instagramHandle: onInstagram ? cleanHandle(instagramHandle) : '',
          tiktokHandle: onTikTok ? cleanHandle(tiktokHandle) : '',
        },
      }).catch((notifyError) => {
        console.warn('Invitation request notification failed (non-fatal):', notifyError);
      });

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsSubmitted(true);
    } catch (err) {
      console.error('Invitation request failed:', err);
      fail((err as { message?: string })?.message ?? 'Could not send your request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const label = (text: string, optional = false) => (
    <Text style={{ color: palette.text, fontSize: 13, fontWeight: '600', marginBottom: 8 }}>
      {text}
      {optional ? <Text style={{ color: palette.faint, fontWeight: '400' }}>  optional</Text> : null}
    </Text>
  );
  const inputText = { flex: 1, color: palette.text, fontSize: 16 } as const;

  const hero = {
    uri: heroUri,
    onError: () => {
      if (heroUri !== AUTH_HERO_FALLBACK_URI) setHeroUri(AUTH_HERO_FALLBACK_URI);
    },
    title: 'Get early access.',
    body: 'Fyll Ops is invite-only while we grow. Tell us about your business and we will be in touch.',
    chips: ['Orders & stock', 'Payments', 'Team collaboration'],
  };

  const logInLink = (
    <Pressable onPress={() => router.replace('/login')} className="active:opacity-70">
      <Text style={{ color: palette.muted, fontSize: 14 }}>
        Have an invite code? <Text style={{ color: palette.limeOnSurface, fontWeight: '700' }}>Log in</Text>
      </Text>
    </Pressable>
  );

  const backButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      onPress={() => router.replace('/start')}
      className="w-10 h-10 rounded-full items-center justify-center mb-6 active:opacity-50"
      style={{ backgroundColor: palette.softFill }}
    >
      <ChevronLeft size={20} color={palette.text} strokeWidth={2} />
    </Pressable>
  );

  if (isSubmitted) {
    const first = fullName.trim().split(/\s+/)[0];
    return (
      <AuthShell isWide={isWide} hero={hero}>
        <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: FYLL_LIME, marginBottom: 22 }}>
          <Check size={28} color={FYLL_LIME_INK} strokeWidth={3} />
        </View>
        <AuthHeader
          title="Request sent."
          subtitle={`Thanks${first ? `, ${first}` : ''}. Our team will review your request and reach out to ${email.trim()} soon.`}
        />
        <AuthPrimaryButton label="Back to start" onPress={() => router.replace('/start')} />
      </AuthShell>
    );
  }

  const policyRows: { key: string; question: string; value: boolean | null; set: (value: boolean) => void }[] = [
    { key: 'refund', question: 'Do you have a refund policy?', value: refundPolicy, set: setRefundPolicy },
    { key: 'return', question: 'Do you have a return policy?', value: returnPolicy, set: setReturnPolicy },
    { key: 'delivery', question: 'Do you have a delivery policy?', value: deliveryPolicy, set: setDeliveryPolicy },
  ];

  return (
    <AuthShell isWide={isWide} hero={hero} topRight={logInLink}>
      {backButton}
      <AuthHeader title="Request an invitation." subtitle="Tell us about your business and we'll be in touch about access." />

      <View style={{ gap: 18 }}>
        <View>
          {label('Full name')}
          <AuthField error={Boolean(error) && !fullName.trim()}>
            <TextInput
              value={fullName}
              onChangeText={(text) => { setFullName(text); setError(''); }}
              placeholder="Your name"
              placeholderTextColor={palette.faint}
              autoCapitalize="words"
              style={inputText}
              selectionColor={palette.text}
            />
          </AuthField>
        </View>

        <View>
          {label('Email address')}
          <AuthField error={Boolean(error) && !email.trim()}>
            <TextInput
              value={email}
              onChangeText={(text) => { setEmail(text); setError(''); }}
              placeholder="you@business.com"
              placeholderTextColor={palette.faint}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              style={inputText}
              selectionColor={palette.text}
            />
          </AuthField>
        </View>

        <View>
          {label('Business name')}
          <AuthField error={Boolean(error) && !businessName.trim()}>
            <TextInput
              value={businessName}
              onChangeText={(text) => { setBusinessName(text); setError(''); }}
              placeholder="Your business"
              placeholderTextColor={palette.faint}
              autoCapitalize="words"
              style={inputText}
              selectionColor={palette.text}
            />
          </AuthField>
        </View>

        <View>
          {label('Are you on Instagram or TikTok?', true)}
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {([
              { key: 'instagram', name: 'Instagram', on: onInstagram, toggle: () => setOnInstagram((value) => !value) },
              { key: 'tiktok', name: 'TikTok', on: onTikTok, toggle: () => setOnTikTok((value) => !value) },
            ] as const).map((option) => (
              <Pressable
                key={option.key}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: option.on }}
                onPress={() => { option.toggle(); setError(''); }}
                style={{ flex: 1, height: 42, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: option.on ? FYLL_LIME : 'transparent', borderWidth: option.on ? 0 : 1, borderColor: palette.outline }}
              >
                {option.on ? <Check size={14} color={FYLL_LIME_INK} strokeWidth={3} /> : null}
                <Text style={{ color: option.on ? FYLL_LIME_INK : palette.textSoft, fontSize: 13.5, fontWeight: '700' }}>{option.name}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={{ color: palette.faint, fontSize: 12.5, marginTop: 8 }}>Pick both if you're on both.</Text>
        </View>

        {onInstagram ? (
          <View>
            {label('Instagram handle')}
            <AuthField error={Boolean(error) && !cleanHandle(instagramHandle)}>
              <TextInput
                value={instagramHandle}
                onChangeText={(text) => { setInstagramHandle(text); setError(''); }}
                placeholder="@yourbusiness"
                placeholderTextColor={palette.faint}
                autoCapitalize="none"
                autoCorrect={false}
                style={inputText}
                selectionColor={palette.text}
              />
            </AuthField>
          </View>
        ) : null}

        {onTikTok ? (
          <View>
            {label('TikTok handle')}
            <AuthField error={Boolean(error) && !cleanHandle(tiktokHandle)}>
              <TextInput
                value={tiktokHandle}
                onChangeText={(text) => { setTiktokHandle(text); setError(''); }}
                placeholder="@yourbusiness"
                placeholderTextColor={palette.faint}
                autoCapitalize="none"
                autoCorrect={false}
                style={inputText}
                selectionColor={palette.text}
              />
            </AuthField>
          </View>
        ) : null}

        <View>
          {label('Your policies')}
          <View style={{ borderRadius: 18, backgroundColor: palette.softFill, paddingHorizontal: 16 }}>
            {policyRows.map((row, index) => (
              <View
                key={row.key}
                style={{ minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: palette.hairline }}
              >
                <Text style={{ flex: 1, color: palette.textSoft, fontSize: 14 }}>{row.question}</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {([true, false] as const).map((answer) => {
                    const selected = row.value === answer;
                    return (
                      <Pressable
                        key={String(answer)}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        onPress={() => { row.set(answer); setError(''); }}
                        style={{ width: 56, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? FYLL_LIME : 'transparent', borderWidth: selected ? 0 : 1, borderColor: palette.outline }}
                      >
                        <Text style={{ color: selected ? FYLL_LIME_INK : palette.textSoft, fontSize: 13.5, fontWeight: '700' }}>{answer ? 'Yes' : 'No'}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        </View>

        <View>
          {label('Message')}
          <View
            style={{
              minHeight: 110,
              paddingHorizontal: 18,
              paddingVertical: 14,
              borderRadius: 18,
              borderWidth: 1,
              backgroundColor: palette.inset,
              borderColor: error && !message.trim() ? palette.danger : messageFocused ? FYLL_LIME : palette.outline,
            }}
          >
            <TextInput
              value={message}
              onChangeText={(text) => { setMessage(text); setError(''); }}
              onFocus={() => setMessageFocused(true)}
              onBlur={() => setMessageFocused(false)}
              placeholder="What are you looking to do with Fyll?"
              placeholderTextColor={palette.faint}
              multiline
              textAlignVertical="top"
              style={[{ color: palette.text, fontSize: 16, lineHeight: 23, minHeight: 80 }, noWebOutline]}
              selectionColor={palette.text}
            />
          </View>
        </View>

        {error ? (
          <View style={{ padding: 14, borderRadius: 14, backgroundColor: palette.dangerBg, borderWidth: 1, borderColor: palette.dangerBorder }}>
            <Text accessibilityRole="alert" style={{ color: palette.danger, fontSize: 13.5, lineHeight: 19 }}>{error}</Text>
          </View>
        ) : null}

        <AuthPrimaryButton label={isSubmitting ? 'Sending...' : 'Send request'} onPress={handleSubmit} loading={isSubmitting} />
      </View>
    </AuthShell>
  );
}
