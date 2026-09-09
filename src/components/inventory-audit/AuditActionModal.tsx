import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import type { ThemeColors } from '@/lib/theme';

interface AuditActionModalProps {
  visible: boolean;
  colors: ThemeColors;
  title: string;
  description: string;
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  confirmBackgroundColor: string;
  confirmTextColor: string;
}

export function AuditActionModal({
  visible,
  colors,
  title,
  description,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
  confirmBackgroundColor,
  confirmTextColor,
}: AuditActionModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.45)' }}
        onPress={onCancel}
      >
        <Pressable
          onPress={(event) => event.stopPropagation()}
          className="w-[90%] rounded-2xl p-5"
          style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light, maxWidth: 420 }}
        >
          <Text style={{ color: colors.text.primary }} className="text-lg font-bold mb-2">{title}</Text>
          <Text style={{ color: colors.text.tertiary }} className="text-sm mb-4">{description}</Text>
          <View className="flex-row gap-3">
            <Pressable
              onPress={onCancel}
              className="flex-1 rounded-full items-center justify-center"
              style={{ height: 48, backgroundColor: colors.bg.secondary }}
            >
              <Text style={{ color: colors.text.secondary, fontSize: 14, fontWeight: '700' }}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              className="flex-1 rounded-full items-center justify-center"
              style={{ height: 48, backgroundColor: confirmBackgroundColor }}
            >
              <Text style={{ color: confirmTextColor, fontSize: 14, fontWeight: '700' }}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
