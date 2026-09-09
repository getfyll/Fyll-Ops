import React, { useState } from 'react';
import { ActivityIndicator, Image, Linking, Modal, Pressable, Text, View } from 'react-native';
import { FileText, Paperclip, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResolvedAttachmentUrl } from '@/hooks/useResolvedAttachmentUrl';

const isImageAttachment = (mimeType?: string | null, url?: string | null) => {
  if (mimeType) return mimeType.startsWith('image/');
  if (!url) return false;
  return /\.(png|jpe?g|gif|webp|heic|heif)(\?|$)/i.test(url);
};

export const AttachmentLink = ({
  url,
  name,
  mimeType,
  color,
  fontSize = 12,
  iconSize = 12,
  numberOfLines = 1,
  variant = 'inline',
  cardBackground,
  cardBorderColor,
  cardMutedColor,
}: {
  url: string;
  name?: string | null;
  mimeType?: string | null;
  color: string;
  fontSize?: number;
  iconSize?: number;
  numberOfLines?: number;
  variant?: 'inline' | 'card';
  cardBackground?: string;
  cardBorderColor?: string;
  cardMutedColor?: string;
}) => {
  const resolvedUrl = useResolvedAttachmentUrl(url);
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const isImage = isImageAttachment(mimeType, resolvedUrl ?? url);

  const trigger = variant === 'card' ? (
    <Pressable
      onPress={(e) => {
        e.stopPropagation();
        if (resolvedUrl) setOpen(true);
      }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: cardBorderColor ?? 'rgba(255,255,255,0.1)',
        backgroundColor: cardBackground ?? 'rgba(255,255,255,0.04)',
        padding: 8,
      }}
    >
      <View style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: cardBackground ?? 'rgba(255,255,255,0.06)', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
        {isImage && resolvedUrl ? (
          <Image source={{ uri: resolvedUrl }} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
        ) : (
          <FileText size={18} color={color} strokeWidth={1.8} />
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color, fontSize: 12, fontWeight: '600' }}>
          {name || 'Attachment'}
        </Text>
        <Text style={{ color: cardMutedColor ?? color, fontSize: 10, marginTop: 2, opacity: 0.7 }}>
          Tap to view full {isImage ? 'image' : 'file'}
        </Text>
      </View>
    </Pressable>
  ) : (
    <Pressable
      onPress={(e) => {
        e.stopPropagation();
        if (resolvedUrl) setOpen(true);
      }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start' }}
    >
      <Paperclip size={iconSize} color={color} strokeWidth={2} />
      <Text numberOfLines={numberOfLines} style={{ color, fontSize, fontWeight: '600', flexShrink: 1 }}>
        {name || 'Attachment'}
      </Text>
    </Pressable>
  );

  return (
    <>
      {trigger}

      <Modal visible={open} transparent animationType="none" onRequestClose={() => setOpen(false)}>
        <Pressable
          onPress={() => setOpen(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center' }}
        >
          <Pressable
            onPress={() => setOpen(false)}
            style={{ position: 'absolute', top: insets.top + 14, right: 18, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}
          >
            <X size={18} color="#FFFFFF" strokeWidth={2.2} />
          </Pressable>

          {!resolvedUrl ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : isImage ? (
            <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '90%', height: '75%' }}>
              <Image source={{ uri: resolvedUrl }} resizeMode="contain" style={{ width: '100%', height: '100%' }} />
            </Pressable>
          ) : (
            <Pressable
              onPress={(e) => e.stopPropagation()}
              style={{ width: 260, borderRadius: 18, backgroundColor: '#1C1C1E', padding: 24, alignItems: 'center' }}
            >
              <FileText size={32} color="#FFFFFF" strokeWidth={1.6} />
              <Text numberOfLines={2} style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '600', marginTop: 12, textAlign: 'center' }}>
                {name || 'Attachment'}
              </Text>
              <Pressable
                onPress={() => Linking.openURL(resolvedUrl)}
                style={{ marginTop: 16, height: 38, borderRadius: 999, paddingHorizontal: 18, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: '#000000', fontSize: 12, fontWeight: '600' }}>Open file</Text>
              </Pressable>
            </Pressable>
          )}
        </Pressable>
      </Modal>
    </>
  );
};
