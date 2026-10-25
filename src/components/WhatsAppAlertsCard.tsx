import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Switch, Text, TextInput, View } from 'react-native';
import { MessageCircle } from 'lucide-react-native';
import useAuthStore from '@/lib/state/auth-store';
import { supabase } from '@/lib/supabase';
import { useThemeColors } from '@/lib/theme';
import { FYLL_LIME, FYLL_LIME_INK } from '@/components/payments/payments-ui';

type WhatsAppAlerts = { enabled: boolean; phone: string; orders: boolean; payments: boolean };

const DEFAULTS: WhatsAppAlerts = { enabled: false, phone: '', orders: true, payments: true };
const noWebOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : undefined;

// Phone numbers must be international (+234...). A leading 0 is treated as a Nigerian number.
const normalizePhone = (value: string) => {
  const digits = value.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  if (digits.startsWith('0')) return `+234${digits.slice(1)}`;
  return digits ? `+${digits}` : '';
};

// Lives inside the Settings > Notifications container (web and mobile). Admin only.
export function WhatsAppAlertsCard({ bordered = false }: { bordered?: boolean }) {
  const colors = useThemeColors();
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const role = useAuthStore((s) => s.currentUser?.role ?? 'staff');

  const [form, setForm] = useState<WhatsAppAlerts>(DEFAULTS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    if (!businessId) return;
    supabase
      .from('businesses')
      .select('data')
      .eq('id', businessId)
      .maybeSingle()
      .then(({ data }) => {
        const saved = (data?.data as Record<string, any> | null)?.whatsappAlerts;
        if (saved) setForm({ ...DEFAULTS, ...saved });
      })
      .then(() => setIsLoading(false), () => setIsLoading(false));
  }, [businessId]);

  if (role !== 'admin') return null;

  const save = async () => {
    if (!businessId) return;
    const phone = normalizePhone(form.phone);
    if (form.enabled && phone.length < 9) {
      setMessage({ ok: false, text: 'Add a WhatsApp number with its country code, e.g. +2348012345678.' });
      return;
    }
    setIsSaving(true);
    setMessage(null);
    try {
      const { data: row } = await supabase.from('businesses').select('data').eq('id', businessId).maybeSingle();
      const existing = (row?.data as Record<string, unknown> | null) ?? {};
      const next = { ...form, phone };
      const { error } = await supabase
        .from('businesses')
        .update({ data: { ...existing, whatsappAlerts: next } })
        .eq('id', businessId);
      if (error) throw error;
      setForm(next);
      setMessage({ ok: true, text: form.enabled ? 'Saved. New orders will also arrive on WhatsApp.' : 'Saved. WhatsApp alerts are off.' });
    } catch {
      setMessage({ ok: false, text: 'Could not save. Please try again.' });
    } finally {
      setIsSaving(false);
    }
  };

  // Sends the approved order template with sample values to the saved number. No order is created.
  const sendTest = async () => {
    if (!businessId) return;
    setIsTesting(true);
    setMessage(null);
    try {
      const { data, error } = await supabase.functions.invoke('send-thread-notification', {
        body: { type: 'whatsapp_test', businessId },
      });
      if (error) throw error;
      const result = (data as { result?: { ok?: boolean; skipped?: string; error?: string } } | null)?.result;
      if (result?.ok) {
        setMessage({ ok: true, text: `Test sent to ${form.phone}. Check WhatsApp.` });
      } else if (result?.skipped === 'not_enabled') {
        setMessage({ ok: false, text: 'Turn alerts on, add the number and press Save first.' });
      } else if (result?.skipped === 'whatsapp_not_configured') {
        setMessage({ ok: false, text: 'WhatsApp sending is not set up on the server yet.' });
      } else {
        setMessage({ ok: false, text: result?.error ? `WhatsApp refused it: ${result.error}` : 'The test did not send. Please try again.' });
      }
    } catch {
      setMessage({ ok: false, text: 'Could not reach the server. Please try again.' });
    } finally {
      setIsTesting(false);
    }
  };

  const toggleRow = (label: string, hint: string, value: boolean, onChange: (next: boolean) => void) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '600' }}>{label}</Text>
        <Text style={{ color: colors.text.muted, fontSize: 12, marginTop: 1 }}>{hint}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: FYLL_LIME, false: colors.border.light }} thumbColor="#FFFFFF" />
    </View>
  );

  return (
    <View
      style={bordered ? {
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.border.light,
        backgroundColor: colors.bg.primary,
        paddingHorizontal: 18,
        paddingVertical: 16,
      } : { paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderTopColor: colors.border.light }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 42, height: 42, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: form.enabled ? '#25D36620' : colors.bg.secondary }}>
          <MessageCircle size={18} color={form.enabled ? '#25D366' : colors.text.tertiary} strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text.primary, fontSize: 14, lineHeight: 18, fontWeight: '600' }}>WhatsApp alerts</Text>
          <Text style={{ color: colors.text.tertiary, fontSize: 12, lineHeight: 16, marginTop: 2 }}>
            {form.enabled ? 'On. Orders and payments also arrive on WhatsApp' : 'Get orders and payments on WhatsApp, even if push does not work'}
          </Text>
        </View>
        {isLoading ? (
          <ActivityIndicator color={colors.text.muted} />
        ) : (
          <Switch value={form.enabled} onValueChange={(enabled) => setForm((f) => ({ ...f, enabled }))} trackColor={{ true: FYLL_LIME, false: colors.border.light }} thumbColor="#FFFFFF" />
        )}
      </View>

      {form.enabled ? (
        <View style={{ marginTop: 14, gap: 6 }}>
          <Text style={{ color: colors.text.muted, fontSize: 10, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' }}>WhatsApp number</Text>
          <TextInput
            value={form.phone}
            onChangeText={(phone) => setForm((f) => ({ ...f, phone }))}
            placeholder="+234 801 234 5678"
            placeholderTextColor={colors.input.placeholder}
            keyboardType="phone-pad"
            style={[{ height: 44, borderRadius: 999, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.input.bg, color: colors.input.text, paddingHorizontal: 16, fontSize: 14 }, noWebOutline]}
          />
          <Text style={{ color: colors.text.muted, fontSize: 12 }}>Include the country code. A number starting with 0 is treated as Nigerian (+234).</Text>
          {toggleRow('New orders', 'Storefront and in-app orders', form.orders, (orders) => setForm((f) => ({ ...f, orders })))}
          {toggleRow('Payments', 'Fyll Checkout and storefront payments', form.payments, (payments) => setForm((f) => ({ ...f, payments })))}
        </View>
      ) : null}

      {message ? <Text style={{ color: message.ok ? '#059669' : '#DC2626', fontSize: 13, marginTop: 10 }}>{message.text}</Text> : null}

      <Pressable
        onPress={save}
        disabled={isSaving || isLoading}
        style={({ pressed }) => ({ marginTop: 14, height: 42, borderRadius: 999, backgroundColor: FYLL_LIME, alignItems: 'center', justifyContent: 'center', opacity: pressed || isSaving ? 0.8 : 1 })}
      >
        {isSaving ? <ActivityIndicator color={FYLL_LIME_INK} /> : <Text style={{ color: FYLL_LIME_INK, fontSize: 14, fontWeight: '600' }}>Save WhatsApp settings</Text>}
      </Pressable>

      {form.enabled ? (
        <Pressable
          onPress={sendTest}
          disabled={isTesting || isSaving}
          style={({ pressed }) => ({ marginTop: 8, height: 40, borderRadius: 999, borderWidth: 1, borderColor: colors.border.light, alignItems: 'center', justifyContent: 'center', opacity: pressed || isTesting ? 0.7 : 1 })}
        >
          {isTesting ? <ActivityIndicator color={colors.text.primary} /> : <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600' }}>Send test message</Text>}
        </Pressable>
      ) : null}
    </View>
  );
}
