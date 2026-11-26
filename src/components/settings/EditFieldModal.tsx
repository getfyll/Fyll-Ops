import React, { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  type TextStyle,
} from 'react-native';
import { X } from 'lucide-react-native';

// Small centered "edit this one value" window shared by the settings pages.
// The row on the page only shows the value; the pen opens this to change it.
// The field is 16px so phones don't zoom in when it's focused.

export type EditFieldPalette = {
  surface: string;
  ink: string;
  muted: string;
  faint: string;
  lime: string;
  limeDeep: string;
  edge: string;
  edgeStrong: string;
  navButton: string;
};

type EditFieldModalProps = {
  visible: boolean;
  title: string;
  value: string;
  placeholder?: string;
  help?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'url' | 'phone-pad' | 'email-address';
  autoComplete?: 'tel' | 'email';
  palette: EditFieldPalette;
  onSave: (value: string) => void;
  onClose: () => void;
};

const webOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as unknown as TextStyle) : null;

export function EditFieldModal({
  visible,
  title,
  value,
  placeholder,
  help,
  multiline = false,
  keyboardType = 'default',
  autoComplete,
  palette,
  onSave,
  onClose,
}: EditFieldModalProps) {
  const [draft, setDraft] = useState<string>(value);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) setDraft(value);
  }, [visible, value]);

  const isEmail = keyboardType === 'email-address';
  const isUrl = keyboardType === 'url';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: 440, backgroundColor: palette.surface, borderRadius: 28, padding: 22 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <Text style={{ color: palette.ink, fontFamily: 'PublicSans_700Bold', fontSize: 18 }}>{title}</Text>
              <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close" style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.navButton }}>
                <X size={16} color={palette.ink} />
              </Pressable>
            </View>

            <View style={{ minHeight: multiline ? 120 : 52, paddingHorizontal: 15, paddingVertical: multiline ? 12 : 0, borderRadius: 16, borderWidth: 1, borderColor: palette.edgeStrong, backgroundColor: palette.surface, justifyContent: multiline ? 'flex-start' : 'center' }}>
              <TextInput
                ref={inputRef}
                autoFocus
                value={draft}
                onChangeText={setDraft}
                placeholder={placeholder}
                placeholderTextColor={palette.faint}
                keyboardType={keyboardType}
                autoComplete={autoComplete}
                autoCapitalize={isEmail || isUrl ? 'none' : 'sentences'}
                autoCorrect={!(isEmail || isUrl)}
                multiline={multiline}
                numberOfLines={multiline ? 4 : 1}
                selectionColor={palette.limeDeep}
                onSubmitEditing={multiline ? undefined : () => onSave(draft)}
                returnKeyType={multiline ? 'default' : 'done'}
                style={[
                  {
                    color: palette.ink,
                    fontSize: 16,
                    lineHeight: multiline ? 22 : 20,
                    minHeight: multiline ? 96 : 30,
                    paddingHorizontal: 0,
                    paddingVertical: multiline ? 0 : 2,
                    textAlignVertical: multiline ? 'top' : 'center',
                  },
                  webOutline,
                ]}
              />
            </View>

            {help ? <Text style={{ color: palette.faint, fontSize: 12, lineHeight: 17, marginTop: 10 }}>{help}</Text> : null}

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
              <Pressable onPress={onClose} style={({ pressed }) => ({ flex: 1, height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.edgeStrong, opacity: pressed ? 0.7 : 1 })}>
                <Text style={{ color: palette.ink, fontFamily: 'PublicSans_700Bold', fontSize: 14 }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={() => onSave(draft)} style={({ pressed }) => ({ flex: 1, height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.lime, opacity: pressed ? 0.78 : 1 })}>
                <Text style={{ color: '#202117', fontFamily: 'PublicSans_700Bold', fontSize: 14 }}>Done</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
