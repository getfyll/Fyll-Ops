import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { Check, X } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useThemeColors } from '@/lib/theme';
import { FYLL_LIME, FYLL_LIME_INK } from '@/components/payments/payments-ui';

export type ChangeRequestKind = 'business_name' | 'storefront_handle';

const COPY: Record<ChangeRequestKind, { title: string; field: string; placeholder: string; warning: string }> = {
  business_name: {
    title: 'Request a business name change',
    field: 'New business name',
    placeholder: 'e.g. Mint Eyewear',
    warning: 'Changing your business name also changes your tracking, payment and storefront links, so links you have already shared will stop working. We will make the change for you.',
  },
  storefront_handle: {
    title: 'Request a storefront handle change',
    field: 'New storefront handle',
    placeholder: 'e.g. mint-eyewear',
    warning: 'Changing your handle changes your storefront address, so links you have already shared will stop working. We will make the change for you.',
  },
};

// These details are locked in the app because changing them breaks links already sent to
// customers. The request goes to Fyll support by email (see the send-change-request function).
export function ChangeRequestModal({
  visible,
  kind,
  currentValue,
  onClose,
}: {
  visible: boolean;
  kind: ChangeRequestKind;
  currentValue: string;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const copy = COPY[kind];
  const [requestedValue, setRequestedValue] = useState('');
  const [note, setNote] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (visible) {
      setRequestedValue('');
      setNote('');
      setError('');
      setSent(false);
    }
  }, [visible]);

  const handleSend = async () => {
    if (!requestedValue.trim()) {
      setError('Tell us what you would like it changed to.');
      return;
    }
    setIsSending(true);
    setError('');
    try {
      const { error: invokeError } = await supabase.functions.invoke('send-change-request', {
        body: { kind, requestedValue: requestedValue.trim(), note: note.trim() },
      });
      if (invokeError) throw invokeError;
      setSent(true);
    } catch {
      setError('Could not send your request. Check your connection and try again, or email getfyll@gmail.com.');
    } finally {
      setIsSending(false);
    }
  };

  const inputStyle = {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border.light,
    backgroundColor: colors.input.bg,
    color: colors.input.text,
    paddingHorizontal: 14,
    fontSize: 14.5,
  } as const;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={{ width: '100%', maxWidth: 440, borderRadius: 22, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 20, gap: 14 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: colors.text.primary, fontSize: 17, fontWeight: '700', flex: 1, paddingRight: 12 }}>{sent ? 'Request sent' : copy.title}</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <X size={20} color={colors.text.tertiary} strokeWidth={2} />
            </Pressable>
          </View>

          {sent ? (
            <>
              <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(213,224,87,0.2)' }}>
                <Check size={22} color={colors.text.primary} strokeWidth={2.4} />
              </View>
              <Text style={{ color: colors.text.secondary, fontSize: 14, lineHeight: 20 }}>
                Thanks. We have your request and will email you once it is done.
              </Text>
              <Pressable onPress={onClose} style={{ height: 46, borderRadius: 999, backgroundColor: FYLL_LIME, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: FYLL_LIME_INK, fontSize: 15, fontWeight: '700' }}>Done</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={{ color: colors.text.tertiary, fontSize: 13 }}>Currently: <Text style={{ color: colors.text.primary, fontWeight: '600' }}>{currentValue || '—'}</Text></Text>
              <View style={{ gap: 6 }}>
                <Text style={{ color: colors.text.secondary, fontSize: 13, fontWeight: '600' }}>{copy.field}</Text>
                <TextInput
                  value={requestedValue}
                  onChangeText={(value) => { setRequestedValue(value); setError(''); }}
                  placeholder={copy.placeholder}
                  placeholderTextColor={colors.input.placeholder}
                  autoCapitalize={kind === 'storefront_handle' ? 'none' : 'words'}
                  maxLength={120}
                  style={{ ...inputStyle, height: 48 }}
                  selectionColor={colors.text.primary}
                />
              </View>
              <View style={{ gap: 6 }}>
                <Text style={{ color: colors.text.secondary, fontSize: 13, fontWeight: '600' }}>Anything we should know? <Text style={{ color: colors.text.muted, fontWeight: '400' }}>(optional)</Text></Text>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder="e.g. We rebranded last month"
                  placeholderTextColor={colors.input.placeholder}
                  multiline
                  maxLength={1000}
                  style={{ ...inputStyle, minHeight: 72, paddingTop: 12, paddingBottom: 12, textAlignVertical: 'top' }}
                  selectionColor={colors.text.primary}
                />
              </View>
              <Text style={{ color: colors.text.muted, fontSize: 12, lineHeight: 17 }}>{copy.warning}</Text>
              {error ? <Text style={{ color: '#DC2626', fontSize: 13, lineHeight: 18 }}>{error}</Text> : null}
              <Pressable
                onPress={handleSend}
                disabled={isSending}
                style={{ height: 48, borderRadius: 999, backgroundColor: FYLL_LIME, alignItems: 'center', justifyContent: 'center', opacity: isSending ? 0.7 : 1 }}
              >
                {isSending ? <ActivityIndicator color={FYLL_LIME_INK} /> : <Text style={{ color: FYLL_LIME_INK, fontSize: 15, fontWeight: '700' }}>Send request</Text>}
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
