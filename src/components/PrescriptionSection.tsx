import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, Image, Modal, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { FileText, Upload, X, Eye, Trash2, FileIcon, Plus } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useThemeColors } from '@/lib/theme';
import { PrescriptionInfo } from '@/lib/state/fyll-store';
import { cn } from '@/lib/cn';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { compressImage } from '@/lib/image-compression';

interface PrescriptionSectionProps {
  prescription?: PrescriptionInfo;
  onUpdate: (prescription: PrescriptionInfo | undefined) => void;
  editable?: boolean;
  staffName?: string;
  containerClassName?: string;
}

export function PrescriptionSection({ prescription, onUpdate, editable = true, staffName, containerClassName }: PrescriptionSectionProps) {
  const colors = useThemeColors();
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
        className={cn(containerClassName ?? 'mx-5 mt-4', 'rounded-2xl p-4')}
        style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
      >
        <View className="flex-row items-center justify-between mb-3">
          <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '500', letterSpacing: 1.2, textTransform: 'uppercase' }}>Customer notes</Text>
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
          className="flex-1"
        >
          <Pressable
            className="flex-1 items-center justify-center"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
            onPress={() => setShowEditModal(false)}
          >
            <Pressable
              onPress={(e) => e.stopPropagation()}
              className="w-[90%] rounded-2xl overflow-hidden"
              style={{ backgroundColor: colors.bg.primary, maxHeight: '85%', maxWidth: 400 }}
            >
              {/* Header */}
              <View
                className="flex-row items-center justify-between px-5 py-4"
                style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light }}
              >
                <Text style={{ color: colors.text.primary }} className="font-bold text-lg">
                  {hasPrescription ? 'Edit Customer Note' : 'Add Customer Note'}
                </Text>
                <Pressable
                  onPress={() => setShowEditModal(false)}
                  className="w-8 h-8 rounded-full items-center justify-center active:opacity-50"
                  style={{ backgroundColor: colors.bg.secondary }}
                >
                  <X size={18} color={colors.text.tertiary} strokeWidth={2} />
                </Pressable>
              </View>

              <ScrollView
                className="px-5 py-4"
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {/* Upload File Section */}
                <View className="mb-5">
                  <Text style={{ color: colors.text.primary }} className="text-sm font-medium mb-2">
                    Upload Customer Note (image or PDF)
                  </Text>

                  {editFileUrl ? (
                    <View
                      className="rounded-xl overflow-hidden"
                      style={{ borderWidth: 1, borderColor: colors.border.light }}
                    >
                      {editFileUrl.toLowerCase().endsWith('.pdf') ? (
                        <View
                          className="h-24 items-center justify-center"
                          style={{ backgroundColor: colors.bg.secondary }}
                        >
                          <FileIcon size={32} color={colors.text.tertiary} strokeWidth={1.5} />
                          <Text style={{ color: colors.text.tertiary }} className="text-xs mt-2">PDF Document</Text>
                        </View>
                      ) : (
                        <Image
                          source={{ uri: editFileUrl }}
                          style={{ width: '100%', height: 150 }}
                          resizeMode="cover"
                        />
                      )}
                      <Pressable
                        onPress={handleClearFile}
                        className="absolute top-2 right-2 w-8 h-8 rounded-full items-center justify-center"
                        style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
                      >
                        <X size={16} color="#FFFFFF" strokeWidth={2} />
                      </Pressable>
                    </View>
                  ) : (
                    <View className="flex-row gap-3">
                      <Pressable
                        onPress={handlePickImage}
                        className="flex-1 rounded-xl items-center justify-center py-5 active:opacity-70"
                        style={{
                          backgroundColor: colors.bg.secondary,
                          borderWidth: 1,
                          borderColor: colors.border.light,
                          borderStyle: 'dashed'
                        }}
                      >
                        <Upload size={20} color={colors.text.tertiary} strokeWidth={1.5} />
                        <Text style={{ color: colors.text.tertiary }} className="text-xs mt-2">Image</Text>
                      </Pressable>
                      <Pressable
                        onPress={handlePickDocument}
                        className="flex-1 rounded-xl items-center justify-center py-5 active:opacity-70"
                        style={{
                          backgroundColor: colors.bg.secondary,
                          borderWidth: 1,
                          borderColor: colors.border.light,
                          borderStyle: 'dashed'
                        }}
                      >
                        <FileIcon size={20} color={colors.text.tertiary} strokeWidth={1.5} />
                        <Text style={{ color: colors.text.tertiary }} className="text-xs mt-2">PDF</Text>
                      </Pressable>
                    </View>
                  )}
                  {uploadError ? (
                    <Text className="text-red-500 text-xs mt-2">{uploadError}</Text>
                  ) : null}
                </View>

                {/* Divider with OR */}
                <View className="flex-row items-center mb-5">
                  <View className="flex-1 h-px" style={{ backgroundColor: colors.border.light }} />
                  <Text style={{ color: colors.text.muted }} className="mx-3 text-xs">OR</Text>
                  <View className="flex-1 h-px" style={{ backgroundColor: colors.border.light }} />
                </View>

                {/* Text Entry Section */}
                <View className="mb-5">
                  <Text style={{ color: colors.text.primary }} className="text-sm font-medium mb-2">
                    Enter Customer Note Details
                  </Text>
                  <View
                    className="rounded-xl px-4 py-3"
                    style={{
                      backgroundColor: colors.input.bg,
                      borderWidth: 1,
                      borderColor: colors.input.border,
                      minHeight: 120
                    }}
                  >
                    <TextInput
                      placeholder="Type customer note here..."
                      placeholderTextColor={colors.input.placeholder}
                      value={editText}
                      onChangeText={(text) => {
                        setEditText(text);
                        if (text.trim() && !editFileUrl) {
                          setEditMode('text');
                        }
                      }}
                      multiline
                      numberOfLines={5}
                      style={{
                        color: colors.input.text,
                        fontSize: 14,
                        textAlignVertical: 'top',
                        minHeight: 100
                      }}
                      selectionColor={colors.text.primary}
                    />
                  </View>
                </View>

                {/* Info Note */}
                <View
                  className="rounded-xl px-3 py-2 mb-5"
                  style={{ backgroundColor: `${colors.text.primary}08` }}
                >
                  <Text style={{ color: colors.text.muted }} className="text-xs">
                    Only one option is required. You can upload a file OR enter text, or both.
                  </Text>
                </View>

                {/* Action Buttons */}
                <View className="gap-3 mb-4">
                  <Pressable
                    onPress={handleSave}
                    className="rounded-full items-center active:opacity-80 w-full"
                    style={{
                      backgroundColor: isDark ? '#FFFFFF' : '#111111',
                      height: 52,
                      justifyContent: 'center',
                    }}
                  >
                    <Text
                      className="font-semibold text-base"
                      style={{ color: isDark ? '#111111' : '#FFFFFF' }}
                    >
                      Save
                    </Text>
                  </Pressable>

                  {hasPrescription && (
                    <Pressable
                      onPress={handleRemovePrescription}
                      className="rounded-xl items-center flex-row justify-center active:opacity-70"
                      style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', height: 48 }}
                    >
                      <Trash2 size={16} color="#EF4444" strokeWidth={2} />
                      <Text className="text-red-500 font-medium text-sm ml-2">Remove Customer Note</Text>
                    </Pressable>
                  )}
                </View>
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
