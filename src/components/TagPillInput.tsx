import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, NativeSyntheticEvent, TextInputKeyPressEventData } from 'react-native';
import { X } from 'lucide-react-native';
import { useThemeColors } from '@/lib/theme';

interface TagPillInputProps {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  minHeight?: number;
}

export function TagPillInput({ values, onChange, placeholder, minHeight = 52 }: TagPillInputProps) {
  const colors = useThemeColors();
  const [draft, setDraft] = useState('');

  const commitTokens = (raw: string) => {
    const tokens = raw.split(/[\n,]+/).map((entry) => entry.trim()).filter(Boolean);
    if (tokens.length === 0) return;
    const next = [...values];
    tokens.forEach((token) => {
      if (!next.some((v) => v.toLowerCase() === token.toLowerCase())) next.push(token);
    });
    onChange(next);
  };

  const handleChangeText = (text: string) => {
    if (/[\n,]/.test(text)) {
      const lastSplit = text.split(/[\n,]/);
      const remainder = lastSplit.pop() ?? '';
      commitTokens(lastSplit.join(','));
      setDraft(remainder);
      return;
    }
    setDraft(text);
  };

  const commitDraft = () => {
    if (!draft.trim()) return;
    commitTokens(draft);
    setDraft('');
  };

  const removeAt = (index: number) => {
    onChange(values.filter((_, i) => i !== index));
  };

  const handleKeyPress = (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (e.nativeEvent.key === 'Backspace' && draft === '' && values.length > 0) {
      removeAt(values.length - 1);
    }
  };

  return (
    <View
      className="rounded-xl px-3 py-2.5 flex-row flex-wrap items-center"
      style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.input.border, minHeight, gap: 6 }}
    >
      {values.map((value, index) => (
        <View
          key={`${value}-${index}`}
          className="flex-row items-center rounded-full pl-3 pr-1.5"
          style={{ backgroundColor: colors.bg.secondary, height: 30 }}
        >
          <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
            {value}
          </Text>
          <Pressable
            onPress={() => removeAt(index)}
            className="w-6 h-6 rounded-full items-center justify-center ml-1 active:opacity-50"
          >
            <X size={12} color={colors.text.muted} strokeWidth={2.4} />
          </Pressable>
        </View>
      ))}
      <TextInput
        value={draft}
        onChangeText={handleChangeText}
        onKeyPress={handleKeyPress}
        onSubmitEditing={commitDraft}
        onBlur={commitDraft}
        placeholder={values.length === 0 ? placeholder : ''}
        placeholderTextColor={colors.text.muted}
        style={{ flexGrow: 1, minWidth: 80, color: colors.text.primary, fontSize: 14, height: 28 }}
        selectionColor={colors.text.primary}
        blurOnSubmit={false}
      />
    </View>
  );
}

export default TagPillInput;
