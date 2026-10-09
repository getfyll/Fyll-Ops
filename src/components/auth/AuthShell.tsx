import React, { useState } from 'react';
import { ActivityIndicator, Image, ImageBackground, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts, BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque';
import { FYLL_LIME, FYLL_LIME_HOVER, FYLL_LIME_INK, usePaymentsPalette } from '@/components/payments/payments-ui';

const fieldPhone = require('../../../assets/fyll-field-phone.jpg');
const wordmark = require('../../../assets/fyll-wordmark-thick-light.png');

export type AuthHero = {
  uri: string;
  onError?: () => void;
  title: string;
  body: string;
  chips: string[];
};

const useDisplayFont = () => {
  const [loaded] = useFonts({ BricolageGrotesque_700Bold });
  return loaded
    ? ({ fontFamily: 'BricolageGrotesque_700Bold', fontWeight: '400' } as const)
    : ({ fontWeight: '700' } as const);
};

// The wordmark with a small product tag, like "fyll | OPS".
function Brand({ onField = false }: { onField?: boolean }) {
  const palette = usePaymentsPalette();
  const light = onField || palette.isDark;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Image source={wordmark} style={{ width: 52, height: 28, tintColor: light ? '#F4F4EF' : '#1E1E1E' }} resizeMode="contain" />
      <View style={{ width: 1, height: 20, backgroundColor: light ? 'rgba(255,255,255,0.3)' : 'rgba(17,17,17,0.25)' }} />
      <Text style={{ color: light ? '#EEF2C4' : '#3A3B35', fontSize: 12, fontWeight: '700', letterSpacing: 2 }}>OPS</Text>
    </View>
  );
}

// Shared layout for sign in, invite code and founder sign-up. Wide screens: a flat form panel on
// the left and the photo panel on the right. Phones: the Fyll field as a header, then the form.
export function AuthShell({
  isWide,
  hero,
  topRight,
  children,
}: {
  isWide: boolean;
  hero: AuthHero;
  topRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  const palette = usePaymentsPalette();
  const display = useDisplayFont();

  if (!isWide) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.page }}>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <ImageBackground source={fieldPhone} resizeMode="cover" style={{ height: 190 }}>
                <LinearGradient
                  pointerEvents="none"
                  colors={['rgba(20,20,20,0.25)', 'rgba(20,20,20,0)']}
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                />
                <View style={{ paddingHorizontal: 24, paddingTop: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Brand onField />
                </View>
              </ImageBackground>
              <View
                style={{
                  flex: 1,
                  marginTop: -30,
                  borderTopLeftRadius: 30,
                  borderTopRightRadius: 30,
                  backgroundColor: palette.page,
                  paddingHorizontal: 24,
                  paddingTop: 30,
                  paddingBottom: 36,
                }}
              >
                {children}
                {topRight ? <View style={{ marginTop: 22, alignItems: 'center' }}>{topRight}</View> : null}
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: palette.page }}>
      <SafeAreaView style={{ width: '48%', minWidth: 520 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 72, paddingVertical: 40 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <Brand />
              {topRight}
            </View>
            <View style={{ flex: 1, justifyContent: 'center', paddingVertical: 32 }}>
              <View style={{ width: '100%', maxWidth: 440, alignSelf: 'center' }}>{children}</View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <View style={{ flex: 1, overflow: 'hidden', backgroundColor: palette.card }}>
        <Image source={{ uri: hero.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" onError={hero.onError} />
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(0,0,0,0.12)', 'rgba(0,0,0,0.2)', 'rgba(0,0,0,0.82)']}
          locations={[0, 0.45, 1]}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <View style={{ position: 'absolute', left: 56, right: 56, bottom: 52 }}>
          <Text style={[{ color: '#FFFFFF', fontSize: 52, lineHeight: 54, letterSpacing: -1.8, maxWidth: 560 }, display]}>{hero.title}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.84)', fontSize: 16, lineHeight: 24, marginTop: 14, maxWidth: 520 }}>{hero.body}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 22 }}>
            {hero.chips.map((chip) => (
              <View
                key={chip}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 7, height: 36, paddingHorizontal: 15, borderRadius: 999, backgroundColor: 'rgba(20,20,20,0.42)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' }}
              >
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: FYLL_LIME }} />
                <Text style={{ color: '#EEF2C4', fontSize: 13, fontWeight: '600' }}>{chip}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

// Left-aligned headline and one line of context above the form.
export function AuthHeader({ title, subtitle }: { title: string; subtitle: string }) {
  const palette = usePaymentsPalette();
  const display = useDisplayFont();
  return (
    <View style={{ marginBottom: 30 }}>
      <Text style={[{ color: palette.text, fontSize: 40, lineHeight: 44, letterSpacing: -1.4 }, display]}>{title}</Text>
      <Text style={{ color: palette.muted, fontSize: 16, lineHeight: 23, marginTop: 10 }}>{subtitle}</Text>
    </View>
  );
}

// A form field whose border turns lime while it has focus. Pass the TextInput (and an optional eye
// button) as children.
export function AuthField({ error, children }: { error?: boolean; children: React.ReactNode }) {
  const palette = usePaymentsPalette();
  const [focused, setFocused] = useState<boolean>(false);

  const kids = React.Children.map(children, (child) => {
    if (!React.isValidElement(child) || child.type !== TextInput) return child;
    const input = child as React.ReactElement<React.ComponentProps<typeof TextInput>>;
    return React.cloneElement(input, {
      onFocus: (event) => {
        setFocused(true);
        input.props.onFocus?.(event);
      },
      onBlur: (event) => {
        setFocused(false);
        input.props.onBlur?.(event);
      },
      style: [input.props.style, Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0 } as object) : null],
    });
  });

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        height: 56,
        paddingHorizontal: 18,
        borderRadius: 18,
        borderWidth: 1,
        backgroundColor: palette.inset,
        borderColor: error ? palette.danger : focused ? FYLL_LIME : palette.outline,
      }}
    >
      {kids}
    </View>
  );
}

// The lime pill with a soft glow.
export function AuthPrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      className="active:opacity-85"
      style={[
        {
          height: 58,
          borderRadius: 999,
          backgroundColor: loading ? FYLL_LIME_HOVER : FYLL_LIME,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: loading ? 0.8 : 1,
          shadowColor: FYLL_LIME,
          shadowOpacity: 0.28,
          shadowRadius: 22,
          shadowOffset: { width: 0, height: 8 },
        },
        Platform.OS === 'web' ? ({ boxShadow: '0 10px 30px rgba(213,224,87,0.25)' } as object) : null,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={FYLL_LIME_INK} style={{ marginRight: 8 }} /> : null}
      <Text style={{ color: FYLL_LIME_INK, fontSize: 17, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

// A quiet card of links under the form (like "Writing a review?" on Fyll Reviews).
export function AuthNote({ rows, compact = false }: { rows: { label: string; action: string; onPress: () => void }[]; compact?: boolean }) {
  const palette = usePaymentsPalette();
  return (
    <View style={{ marginTop: 26, borderRadius: 18, backgroundColor: palette.softFill, paddingHorizontal: 18 }}>
      {rows.map((row, index) => (
        <Pressable
          key={row.action}
          onPress={row.onPress}
          className="active:opacity-70"
          style={{ minHeight: compact ? 46 : 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: palette.hairline }}
        >
          <Text style={{ color: palette.muted, fontSize: compact ? 12 : 14.5, flexShrink: 1 }}>{row.label}</Text>
          <Text style={{ color: palette.limeOnSurface, fontSize: compact ? 12 : 14.5, fontWeight: '700' }}>{row.action}</Text>
        </Pressable>
      ))}
    </View>
  );
}
