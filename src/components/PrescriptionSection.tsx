import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, Image, Modal, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { FileText, Upload, X, Eye, Trash2, FileIcon, Plus } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useThemeColors } from '@/lib/theme';
import { FYLL_LIME, FYLL_LIME_INK, usePaymentsPalette } from '@/components/payments/payments-ui';
import { PrescriptionInfo } from '@/lib/state/fyll-store';
import { cn } from '@/lib/cn';
import { useBreakpoint } from '@/lib/useBreakpoint';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { compressImage } from '@/lib/image-compression';

interface PrescriptionSectionProps {
  prescription?: PrescriptionInfo;
  onUpdate: (prescription: PrescriptionInfo | undefined) => void;
  editable?: boolean;
  staffName?: string;
  containerClassName?: string;
  // When set, the title starts with a numbered circle like the other cards on the New Order screen.
  stepNumber?: number;
}

export function PrescriptionSection({ prescription, onUpdate, editable = true, staffName, containerClassName, stepNumber }: PrescriptionSectionProps) {
  const colors = useThemeColors();
  const palette = usePaymentsPalette();
  const [noteFocused, setNoteFocused] = useState<boolean>(false);
  const { isMobile } = useBreakpoint();
  const router = useRouter();
  const isDark = colors.bg.primary === '#111111';
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [editText, setEditText] = useState('');
  const [editFileUrl, setEditFileUrl] = useState('');
  const [, setEditMode] = useState<'file' | 'text' | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const MAX_PDF_SIZE_MB = 1;

  const hasPrescription = !!prescription?.fileUrl || !!prescription?.text;
  const isPdf = prescription?.fileUrl?.toLowerCase().endsWith('.pdf');

  const handleViewFile = () => {
    if (!prescription?.fileUrl) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (isPdf) {
      // Navigate to PDF viewer screen
      const encodedUri = encodeURIComponent(prescription.fileUrl);
      const fileName = prescription.fileUrl.split('/').pop()?.split('?')[0] || 'Prescription.pdf';
      const encodedFileName = encodeURIComponent(fileName);
      router.push(`/pdf-viewer?uri=${encodedUri}&fileName=${encodedFileName}`);
    } else {
      // Show image preview modal
      setShowPreviewModal(true);
    }
  };

  const handleOpenEdit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditText(prescription?.text || '');
    setEditFileUrl(prescription?.fileUrl || '');
    setUploadError(null);

    // Determine initial edit mode based on existing data
    if (prescription?.fileUrl) {
      setEditMode('file');
    } else if (prescription?.text) {
      setEditMode('text');
    } else {
      setEditMode(null);
    }
    setShowEditModal(true);
  };

  const handlePickImage = async () => {
    setUploadError(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const compressedUri = await compressImage(result.assets[0].uri);
      setEditFileUrl(compressedUri);
      setEditMode('file');
    }
  };

  const handlePickDocument = async () => {
    try {
      setUploadError(null);
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const asset = result.assets[0];
        const isPdf =
          asset.mimeType === 'application/pdf' ||
          asset.name?.toLowerCase().endsWith('.pdf');
        const isImage = asset.mimeType?.startsWith('image/');

        if (isPdf && asset.size && asset.size > MAX_PDF_SIZE_MB * 1024 * 1024) {
          setUploadError(`PDF is too large. Please keep it under ${MAX_PDF_SIZE_MB}MB.`);
          return;
        }

        if (isImage) {
          const compressedUri = await compressImage(asset.uri);
          setEditFileUrl(compressedUri);
        } else {
          setEditFileUrl(asset.uri);
        }

        setEditMode('file');
      }
    } catch (error) {
      console.log('Document picker error:', error);
    }
  };

  const handleSave = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setUploadError(null);

    if (!editFileUrl && !editText.trim()) {
      // Clear prescription if both are empty
      onUpdate(undefined);
    } else {
      onUpdate({
        fileUrl: editFileUrl || undefined,
        text: editText.trim() || undefined,
        uploadedAt: new Date().toISOString(),
        uploadedBy: staffName || 'Staff',
      });
    }
    setShowEditModal(false);
  };

  const handleClearFile = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditFileUrl('');
    setUploadError(null);
    if (!editText.trim()) {
      setEditMode(null);
    }
  };

  const handleRemovePrescription = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    onUpdate(undefined);
    setShowEditModal(false);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const actionPillBaseStyle = {
    minHeight: 32,
    minWidth: 90,
    paddingHorizontal: 10,
    borderRadius: 999,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };

  const primaryActionPillStyle = {
    ...actionPillBaseStyle,
    backgroundColor: colors.text.primary,
  };

  const primaryActionTextStyle = {
    color: colors.bg.primary,
    fontSize: 13,
    fontWeight: '600' as const,
  };

  const addActionPillStyle = {
    ...actionPillBaseStyle,
    borderWidth: 1,
    borderColor: colors.border.light,
  };

  const addActionTextStyle = {
    color: colors.text.secondary,
    fontSize: 13,
    fontWeight: '600' as const,
  };

  return (
    <>
      <View
        className={cn(containerClassName ?? 'mx-4 mt-3.5', 'px-4 py-4')}
        style={{ backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, borderRadius: 20 }}
      >
        <View className="flex-row items-center justify-between mb-3">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 }}>
            {stepNumber ? (
              <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.nudgeBg }}>
                <Text style={{ color: palette.limeOnSurface, fontSize: 13, fontWeight: '700' }}>{stepNumber}</Text>
              </View>
            ) : null}
            <Text style={{ color: palette.text, fontSize: isMobile ? 14 : 16, fontWeight: '500' }}>Customer notes</Text>
          </View>
          {editable && (
            <Pressable
              onPress={handleOpenEdit}
              className="active:opacity-70 flex-row items-center justify-center"
              style={hasPrescription ? primaryActionPillStyle : addActionPillStyle}
            >
              {!hasPrescription ? <Plus size={13} color={colors.text.secondary} strokeWidth={2.5} /> : null}
              <Text style={[hasPrescription ? primaryActionTextStyle : addActionTextStyle, !hasPrescription ? { marginLeft: 5 } : null]}>
                {hasPrescription ? 'Edit' : 'Add'}
              </Text>
            </Pressable>
          )}
        </View>

        {hasPrescription ? (
          <View>
            {/* File Preview */}
            {prescription?.fileUrl && (
              <Pressable
                onPress={handleViewFile}
                className="rounded-xl overflow-hidden mb-3 active:opacity-80"
                style={{ borderWidth: 1, borderColor: colors.border.light }}
              >
                {isPdf ? (
                  <View
                    className="h-24 items-center justify-center"
                    style={{ backgroundColor: colors.bg.secondary }}
                  >
                    <FileIcon size={32} color={colors.text.tertiary} strokeWidth={1.5} />
                    <Text style={{ color: colors.text.tertiary }} className="text-xs mt-2">PDF Document</Text>
                    <Text style={{ color: colors.text.muted }} className="text-xs mt-1">Tap to view</Text>
                  </View>
                ) : (
                  <View>
                    <Image
                      source={{ uri: prescription.fileUrl }}
                      style={{ width: '100%', height: 120 }}
                      resizeMode="cover"
                    />
                    <View
                      className="absolute bottom-0 left-0 right-0 px-3 py-2"
                      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
                    >
                      <View className="flex-row items-center">
                        <Eye size={12} color="#FFFFFF" strokeWidth={2} />
                        <Text className="text-white text-xs ml-1">Tap to view full image</Text>
                      </View>
                    </View>
                  </View>
                )}
              </Pressable>
            )}

            {/* Text Display */}
            {prescription?.text && (
              <View
                className="rounded-xl px-3 py-3 mb-3"
                style={{ backgroundColor: colors.bg.secondary }}
              >
                <Text style={{ color: colors.text.muted }} className="text-xs mb-1">Customer Note</Text>
                <Text style={{ color: colors.text.primary, fontSize: 12, lineHeight: 18 }}>
                  {prescription.text}
                </Text>
              </View>
            )}

            {/* Metadata */}
            {prescription?.uploadedAt && (
              <Text style={{ color: colors.text.muted }} className="text-xs">
                Added {formatDate(prescription.uploadedAt)}
                {prescription.uploadedBy ? ` by ${prescription.uploadedBy}` : ''}
              </Text>
            )}
          </View>
        ) : (
          <View className="py-6 items-center">
            <FileText size={24} color={colors.text.muted} strokeWidth={1.5} />
            <Text style={{ color: colors.text.muted, fontSize: 12, marginTop: 8 }}>No customer notes added</Text>
          </View>
        )}
      </View>

      {/* Edit Modal */}
      <Modal
        visible={showEditModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowEditModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <Pressable
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0, 0, 0, 0.55)' }}
            onPress={() => setShowEditModal(false)}
          >
            <Pressable
              onPress={(e) => e.stopPropagation()}
              style={{ width: '100%', maxWidth: 440, maxHeight: '88%', borderRadius: 26, overflow: 'hidden', backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingTop: 20, paddingBottom: 8 }}>
                <Text style={{ color: palette.text, fontSize: 16, fontWeight: '500' }}>
                  {hasPrescription ? 'Edit customer note' : 'Add customer note'}
                </Text>
                <Pressable
                  onPress={() => setShowEditModal(false)}
                  style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.softFill }}
                >
                  <X size={16} color={palette.textSoft} strokeWidth={2} />
                </Pressable>
              </View>

              <ScrollView
                style={{ paddingHorizontal: 22 }}
                contentContainerStyle={{ paddingTop: 8, paddingBottom: 22 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={{ color: palette.textSoft, fontSize: 14, marginBottom: 8 }}>Upload a note (image or PDF)</Text>

                {editFileUrl ? (
                  <View style={{ borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: palette.border }}>
                    {editFileUrl.toLowerCase().endsWith('.pdf') ? (
                      <View style={{ height: 96, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.inset }}>
                        <FileIcon size={30} color={palette.muted} strokeWidth={1.5} />
                        <Text style={{ color: palette.muted, fontSize: 12, marginTop: 8 }}>PDF document</Text>
                      </View>
                    ) : (
                      <Image source={{ uri: editFileUrl }} style={{ width: '100%', height: 150 }} resizeMode="cover" />
                    )}
                    <Pressable
                      onPress={handleClearFile}
                      style={{ position: 'absolute', top: 8, right: 8, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)' }}
                    >
                      <X size={16} color="#FFFFFF" strokeWidth={2} />
                    </Pressable>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    {([
                      { label: 'Image', Icon: Upload, onPress: handlePickImage },
                      { label: 'PDF', Icon: FileIcon, onPress: handlePickDocument },
                    ] as const).map(({ label, Icon, onPress }) => (
                      <Pressable
                        key={label}
                        onPress={onPress}
                        style={{ flex: 1, height: 76, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: palette.inset, borderWidth: 1, borderColor: palette.outline, borderStyle: 'dashed' }}
                      >
                        <Icon size={18} color={palette.textSoft} strokeWidth={1.75} />
                        <Text style={{ color: palette.textSoft, fontSize: 12, fontWeight: '500' }}>{label}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
                {uploadError ? (
                  <Text style={{ color: palette.danger, fontSize: 12, marginTop: 8 }}>{uploadError}</Text>
                ) : null}

                <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 18 }}>
                  <View style={{ flex: 1, height: 1, backgroundColor: palette.hairline }} />
                  <Text style={{ color: palette.faint, fontSize: 12, marginHorizontal: 12 }}>or</Text>
                  <View style={{ flex: 1, height: 1, backgroundColor: palette.hairline }} />
                </View>

                <Text style={{ color: palette.textSoft, fontSize: 14, marginBottom: 8 }}>Type the note</Text>
                <View
                  style={{
                    borderRadius: 14,
                    backgroundColor: palette.inset,
                    borderWidth: 1,
                    borderColor: noteFocused ? (palette.isDark ? FYLL_LIME : '#B8C43A') : palette.outline,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    minHeight: 120,
                  }}
                >
                  <TextInput
                    placeholder="Type customer note here..."
                    placeholderTextColor={palette.faint}
                    value={editText}
                    onFocus={() => setNoteFocused(true)}
                    onBlur={() => setNoteFocused(false)}
                    onChangeText={(text) => {
                      setEditText(text);
                      if (text.trim() && !editFileUrl) {
                        setEditMode('text');
                      }
                    }}
                    multiline
                    numberOfLines={5}
                    style={[
                      { color: palette.text, fontSize: 14, textAlignVertical: 'top', minHeight: 96 },
                      Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
                    ]}
                    selectionColor={palette.text}
                  />
                </View>

                <Text style={{ color: palette.muted, fontSize: 12, marginTop: 10, marginBottom: 20 }}>
                  Only one is required. Upload a file, type a note, or both.
                </Text>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Pressable
                    onPress={() => setShowEditModal(false)}
                    style={{ flex: 1, height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.outline }}
                  >
                    <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleSave}
                    style={{ flex: 1.4, height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: FYLL_LIME }}
                  >
                    <Text style={{ color: FYLL_LIME_INK, fontSize: 14, fontWeight: '600' }}>Save note</Text>
                  </Pressable>
                </View>

                {hasPrescription && (
                  <Pressable
                    onPress={handleRemovePrescription}
                    style={{ marginTop: 10, height: 44, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                  >
                    <Trash2 size={15} color={palette.danger} strokeWidth={2} />
                    <Text style={{ color: palette.danger, fontSize: 14, fontWeight: '600' }}>Remove customer note</Text>
                  </Pressable>
                )}
              </ScrollView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Preview Modal for Images Only */}
      <Modal
        visible={showPreviewModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowPreviewModal(false)}
      >
        <Pressable
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.9)' }}
          onPress={() => setShowPreviewModal(false)}
        >
          <Pressable
            onPress={() => setShowPreviewModal(false)}
            className="absolute top-12 right-5 w-10 h-10 rounded-full items-center justify-center z-10"
            style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
          >
            <X size={24} color="#FFFFFF" strokeWidth={2} />
          </Pressable>

          {prescription?.fileUrl && !isPdf && (
            <Image
              source={{ uri: prescription.fileUrl }}
              style={{ width: '95%', height: '80%' }}
              resizeMode="contain"
            />
          )}
        </Pressable>
      </Modal>
    </>
  );
}
