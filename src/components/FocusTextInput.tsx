import React, { forwardRef, useState } from 'react';
import { Platform, TextInput, type TextInputProps } from 'react-native';
import { FYLL_LIME } from '@/components/payments/payments-ui';

// A TextInput that lights up with the Fyll lime outline while you are typing in it. Use it anywhere a form field should
// show which one is selected. It keeps whatever border, size and colours you give it and only changes the border colour
// (plus a soft lime glow) while focused, so it drops in for a plain TextInput.
export const FocusTextInput = forwardRef<TextInput, TextInputProps>(function FocusTextInput(
  { style, onFocus, onBlur, selectionColor, ...rest },
  ref
) {
  const [focused, setFocused] = useState<boolean>(false);

  const glow = Platform.OS === 'web'
    ? ({ outlineStyle: 'none', boxShadow: '0 0 0 3px rgba(213, 224, 87, 0.32)' } as object)
    : { shadowColor: FYLL_LIME, shadowOpacity: 0.35, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } };

  return (
    <TextInput
      ref={ref}
      {...rest}
      selectionColor={selectionColor ?? '#879400'}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      style={[style, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null, focused ? [{ borderColor: FYLL_LIME }, glow] : null]}
    />
  );
});
