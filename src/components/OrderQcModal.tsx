import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Camera, Check, Package, X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ResolvedAttachmentImage } from '@/components/ResolvedAttachmentImage';
import { FYLL_LIME, FYLL_LIME_INK, usePaymentsPalette } from '@/components/payments/payments-ui';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { openAttachmentPath } from '@/lib/storage-attachments';

type QcModalMode = 'check' | 'problem' | 'done' | 'sentback';

export const QC_PROBLEM_REASONS = ['Scratch or defect', 'Broken part', 'Wrong colour', 'Wrong item', 'Missing case or cloth', 'Other'];

export type OrderQcModalProps = {
  visible: boolean;
  onClose: () => void;
  orderNumber: string;
  customerName: string;
  checkedBy?: string;
  item: { name: string; meta: string; imageUrl: string } | null;
  requirements: { key: string; label: string }[];
  checklist: string[];
  onToggleCheck: (key: string) => void;
  photos: string[];
  maxPhotos: number;
  onAddPhoto: () => void;
  onRemovePhoto: (index: number) => void;
  uploading: boolean;
  uploadError: string;
  note: string;
  onChangeNote: (value: string) => void;
  onFinishLater: () => Promise<void> | void;
  onPass: () => Promise<void>;
  onReportProblem: (payload: { reason: string; details: string }) => Promise<void>;
};

export function OrderQcModal({
  visible,
  onClose,
  orderNumber,
  customerName,
  checkedBy,
  item,
  requirements,
  checklist,
  onToggleCheck,
  photos,
  maxPhotos,
  onAddPhoto,
  onRemovePhoto,
  uploading,
  uploadError,
  note,
  onChangeNote,
  onFinishLater,
  onPass,
  onReportProblem,
}: OrderQcModalProps) {
  const palette = usePaymentsPalette();
  const { isDesktop } = useBreakpoint();
  const isSheet = !(Platform.OS === 'web' && isDesktop);

  const [mode, setMode] = useState<QcModalMode>('check');
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string>('');
  const [passedSummary, setPassedSummary] = useState<{ checks: number; photos: number }>({ checks: 0, photos: 0 });

  useEffect(() => {
    if (visible) {
      setMode('check');
      setReason(null);
      setDetails('');
      setSubmitError('');
    }
  }, [visible]);

  const checkedCount = useMemo(
    () => requirements.filter((requirement) => checklist.includes(requirement.key)).length,
    [requirements, checklist]
  );
  const totalChecks = requirements.length;
  const allChecked = totalChecks > 0 ? checkedCount === totalChecks : true;
  const hasPhoto = photos.length >= 1;
  const ready = allChecked && hasPhoto;
  const progress = (checkedCount + Math.min(photos.length, 1)) / (totalChecks + 1);

  const missing: string[] = [];
  if (!allChecked) {
    const left = totalChecks - checkedCount;
    missing.push(`${left} ${left === 1 ? 'check' : 'checks'}`);
  }
  if (!hasPhoto) missing.push('1 photo');

  const finished = mode === 'done' || mode === 'sentback';
  const title = mode === 'problem' ? 'Report a problem' : mode === 'done' ? 'QC passed' : mode === 'sentback' ? 'Sent back' : 'Quality control';
  const subtitle = [orderNumber, customerName, checkedBy ? `checked by ${checkedBy}` : null].filter(Boolean).join(' · ');

  const primaryDisabled = submitting
    || (mode === 'check' && !ready)
    || (mode === 'problem' && !reason);
  const primaryLabel = mode === 'check' ? 'Pass QC' : mode === 'problem' ? 'Send back to Processing' : 'Back to order';

  const handlePrimary = async () => {
    if (primaryDisabled) return;
    setSubmitError('');
    if (finished) {
      onClose();
      return;
    }
    setSubmitting(true);
    try {
      if (mode === 'check') {
        setPassedSummary({ checks: checkedCount, photos: photos.length });
        await onPass();
        setMode('done');
      } else if (reason) {
        await onReportProblem({ reason, details: details.trim() });
        setMode('sentback');
      }
    } catch (error) {
      console.warn('QC action failed:', error);
      setSubmitError('Could not save. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFinishLater = async () => {
    setSubmitting(true);
    try {
      await onFinishLater();
    } finally {
      setSubmitting(false);
    }
  };

  const label = { color: palette.muted, fontSize: 12, fontWeight: '600' as const, letterSpacing: 0.6, textTransform: 'uppercase' as const };
  const photoTiles = Array.from({ length: Math.max(3, Math.min(maxPhotos, photos.length + 1)) });
  const sheetBg = palette.isDark ? '#1A1A1A' : '#FFFFFF';

  const checkRow = (requirement: { key: string; label: string }) => {
    const on = checklist.includes(requirement.key);
    return (
      <Pressable
        key={requirement.key}
        onPress={() => onToggleCheck(requirement.key)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: on }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          paddingHorizontal: 14,
          paddingVertical: 14,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: on ? 'rgba(185,196,106,0.35)' : palette.border,
          backgroundColor: on ? 'rgba(185,196,106,0.07)' : palette.inset,
          ...(isSheet ? null : { width: '49%' as const }),
        }}
      >
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 7,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: on ? '#B9C46A' : 'transparent',
            borderWidth: on ? 0 : 1.5,
            borderColor: palette.outline,
          }}
        >
          {on ? <Check size={13} color="#141414" strokeWidth={3.2} /> : null}
        </View>
        <Text style={{ color: palette.text, fontSize: isSheet ? 13 : 14.5, fontWeight: '600', flex: 1 }}>{requirement.label}</Text>
      </Pressable>
    );
  };

  return (
    <Modal visible={visible} animationType={isSheet ? 'slide' : 'fade'} transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable
          onPress={onClose}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.66)',
            alignItems: 'center',
            justifyContent: isSheet ? 'flex-end' : 'center',
            paddingHorizontal: isSheet ? 0 : 24,
            paddingTop: isSheet ? 60 : 24,
          }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            accessibilityViewIsModal
            style={{
              width: '100%',
              maxWidth: isSheet ? undefined : 820,
              maxHeight: '100%',
              backgroundColor: sheetBg,
              borderWidth: 1,
              borderColor: palette.border,
              borderRadius: 26,
              ...(isSheet ? { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, flexShrink: 1 } : { overflow: 'hidden' as const }),
              ...(isSheet ? { height: '100%' } : null),
            }}
          >
            {isSheet ? (
              <View style={{ alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: palette.outline, marginTop: 8 }} />
            ) : null}

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: isSheet ? 12 : 20, paddingBottom: isSheet ? 14 : 18, paddingLeft: isSheet ? 18 : 28, paddingRight: isSheet ? 14 : 20, borderBottomWidth: 1, borderBottomColor: palette.hairline }}>
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <Text style={{ color: palette.text, fontSize: isSheet ? 17 : 19, fontWeight: '700' }} numberOfLines={1}>{title}</Text>
                <Text style={{ color: palette.faint, fontSize: isSheet ? 12.5 : 13.5 }} numberOfLines={1}>{subtitle}</Text>
              </View>
              {mode === 'check' && !isSheet ? (
                <View style={{ width: 120, height: 6, borderRadius: 999, backgroundColor: palette.softFill, overflow: 'hidden' }}>
                  <LinearGradient
                    colors={['#4A5410', '#8F9A26', FYLL_LIME]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={{ height: '100%', width: `${Math.round(progress * 100)}%`, borderRadius: 999 }}
                  />
                </View>
              ) : null}
              <Pressable
                onPress={onClose}
                accessibilityLabel="Close"
                className="active:opacity-70"
                style={{ width: isSheet ? 36 : 40, height: isSheet ? 36 : 40, borderRadius: 20, backgroundColor: palette.softFill, alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={16} color={palette.text} strokeWidth={2.4} />
              </Pressable>
            </View>

            <ScrollView
              style={isSheet ? { flex: 1 } : { flexGrow: 0 }}
              contentContainerStyle={{ paddingHorizontal: isSheet ? 16 : 28, paddingTop: isSheet ? 16 : 22, paddingBottom: isSheet ? 20 : 24 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {mode === 'check' ? (
                <View style={{ gap: 22 }}>
                  {item ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12, borderRadius: 16, backgroundColor: palette.inset, borderWidth: 1, borderColor: palette.hairline }}>
                      <View style={{ width: isSheet ? 56 : 64, height: isSheet ? 56 : 64, borderRadius: 12, overflow: 'hidden', backgroundColor: palette.softFill, alignItems: 'center', justifyContent: 'center' }}>
                        <ResolvedAttachmentImage
                          imageUrl={item.imageUrl}
                          style={{ width: '100%', height: '100%' }}
                          resizeMode="cover"
                          fallback={<Package size={22} color={palette.muted} strokeWidth={1.6} />}
                        />
                      </View>
                      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                        <Text style={{ color: palette.text, fontSize: isSheet ? 14 : 16, fontWeight: '600' }} numberOfLines={1}>{item.name}</Text>
                        {item.meta ? <Text style={{ color: palette.faint, fontSize: isSheet ? 12 : 13 }} numberOfLines={1}>{item.meta}</Text> : null}
                        <Text style={{ color: palette.textSoft, fontSize: 12.5 }}>Compare the item against this photo</Text>
                      </View>
                    </View>
                  ) : null}

                  <View style={{ gap: 10 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <Text style={label}>Checklist</Text>
                      <Text style={{ color: allChecked && totalChecks > 0 ? palette.limeOnSurface : palette.textSoft, fontSize: 13, fontWeight: '600' }}>
                        {checkedCount} of {totalChecks} checked
                      </Text>
                    </View>
                    {requirements.length === 0 ? (
                      <Text style={{ color: palette.faint, fontSize: 13 }}>No quality control checks configured.</Text>
                    ) : (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {requirements.map((requirement) => (
                          isSheet ? <View key={requirement.key} style={{ width: '100%' }}>{checkRow(requirement)}</View> : checkRow(requirement)
                        ))}
                      </View>
                    )}
                  </View>

                  <View style={{ gap: 10 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                      <Text style={label}>Proof photos</Text>
                      <Text style={{ color: palette.faint, fontSize: 13, flexShrink: 1 }} numberOfLines={1}>At least 1 · up to {maxPhotos}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                      {photoTiles.map((_, index) => {
                        const photo = photos[index];
                        const isAddTile = !photo && index === photos.length && photos.length < maxPhotos;
                        const tileStyle = {
                          width: '31.5%' as const,
                          height: isSheet ? 104 : 118,
                          borderRadius: 14,
                          overflow: 'hidden' as const,
                          alignItems: 'center' as const,
                          justifyContent: 'center' as const,
                          backgroundColor: palette.inset,
                        };
                        if (photo) {
                          return (
                            <Pressable
                              key={`${photo}-${index}`}
                              onPress={() => {
                                void openAttachmentPath(photo);
                              }}
                              style={tileStyle}
                            >
                              <ResolvedAttachmentImage imageUrl={photo} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                              <View style={{ position: 'absolute', left: 8, bottom: 8, height: 24, paddingHorizontal: 9, borderRadius: 999, backgroundColor: 'rgba(20,20,20,0.75)', flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                <Check size={13} color="#F4F4EF" strokeWidth={3.2} />
                                <Text style={{ color: '#F4F4EF', fontSize: 11.5, fontWeight: '600' }}>Photo {index + 1}</Text>
                              </View>
                              <Pressable
                                onPress={() => onRemovePhoto(index)}
                                accessibilityLabel="Remove photo"
                                style={{ position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}
                              >
                                <X size={13} color="#FFFFFF" strokeWidth={2.5} />
                              </Pressable>
                            </Pressable>
                          );
                        }
                        return (
                          <Pressable
                            key={`slot-${index}`}
                            onPress={isAddTile ? onAddPhoto : undefined}
                            disabled={!isAddTile || uploading}
                            style={[tileStyle, { borderWidth: 1.5, borderStyle: 'dashed', borderColor: palette.outline, gap: 6, opacity: isAddTile ? 1 : 0.45 }]}
                          >
                            {isAddTile && uploading ? (
                              <ActivityIndicator size="small" color={palette.muted} />
                            ) : (
                              <>
                                <Camera size={20} color={palette.muted} strokeWidth={1.9} />
                                <Text style={{ color: palette.textSoft, fontSize: 13, fontWeight: '600' }}>{isAddTile ? 'Add photo' : `Photo ${index + 1}`}</Text>
                              </>
                            )}
                          </Pressable>
                        );
                      })}
                    </View>
                    {uploadError ? <Text style={{ color: palette.danger, fontSize: 12.5 }}>{uploadError}</Text> : null}
                  </View>

                  <View style={{ gap: 8 }}>
                    <Text style={label}>Note <Text style={{ textTransform: 'none', letterSpacing: 0, fontWeight: '400', color: palette.faint }}>optional, only your team sees it</Text></Text>
                    <TextInput
                      value={note}
                      onChangeText={onChangeNote}
                      placeholder="e.g. Tightened the left hinge before packing"
                      placeholderTextColor={palette.faint}
                      multiline
                      style={{ minHeight: 72, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.inset, color: palette.text, fontSize: 14.5, lineHeight: 21, textAlignVertical: 'top' }}
                    />
                  </View>
                </View>
              ) : null}

              {mode === 'problem' ? (
                <View style={{ gap: 18 }}>
                  <View style={{ gap: 4 }}>
                    <Text style={{ color: palette.text, fontSize: 17, fontWeight: '600' }}>What's wrong?</Text>
                    <Text style={{ color: palette.faint, fontSize: 13.5 }}>The order goes back to Processing and the problem is logged in Activity.</Text>
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {QC_PROBLEM_REASONS.map((item) => {
                      const selected = reason === item;
                      return (
                        <Pressable
                          key={item}
                          onPress={() => setReason(item)}
                          style={{ height: 40, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: selected ? palette.danger : palette.outline, backgroundColor: selected ? palette.danger : 'transparent', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Text style={{ color: selected ? '#1E1E1E' : palette.textSoft, fontSize: 14, fontWeight: '600' }}>{item}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={{ gap: 8 }}>
                    <Text style={label}>Details</Text>
                    <TextInput
                      value={details}
                      onChangeText={setDetails}
                      placeholder="What did you find, and what needs to happen next?"
                      placeholderTextColor={palette.faint}
                      multiline
                      style={{ minHeight: 72, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.inset, color: palette.text, fontSize: 14.5, lineHeight: 21, textAlignVertical: 'top' }}
                    />
                  </View>
                </View>
              ) : null}

              {finished ? (
                <View style={{ alignItems: 'center', gap: 14, paddingTop: 30, paddingBottom: 10 }}>
                  <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: palette.tones.verified.bg, alignItems: 'center', justifyContent: 'center' }}>
                    <Check size={30} color={palette.tones.verified.ink} strokeWidth={2.6} />
                  </View>
                  <Text style={{ color: palette.text, fontSize: 22, fontWeight: '700' }}>{mode === 'done' ? 'Ready for delivery' : 'Back in Processing'}</Text>
                  <Text style={{ color: palette.faint, fontSize: 14.5, lineHeight: 22, textAlign: 'center', maxWidth: 420 }}>
                    {mode === 'done'
                      ? `All ${passedSummary.checks} ${passedSummary.checks === 1 ? 'check' : 'checks'} passed with ${passedSummary.photos} ${passedSummary.photos === 1 ? 'photo' : 'photos'}. QC is verified, so this order can now be dispatched.`
                      : `${reason ?? 'Problem'} logged in Activity. The order moved back to Processing so it can be fixed and checked again.`}
                  </Text>
                </View>
              ) : null}
            </ScrollView>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 16, paddingBottom: isSheet ? 28 : 16, paddingLeft: isSheet ? 16 : 28, paddingRight: isSheet ? 16 : 20, borderTopWidth: 1, borderTopColor: palette.hairline }}>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                {mode === 'check' ? (
                  <Pressable onPress={() => setMode('problem')} style={{ alignSelf: 'flex-start' }}>
                    <Text style={{ color: palette.danger, fontSize: 14, fontWeight: '600' }}>Found a problem</Text>
                  </Pressable>
                ) : null}
                {mode === 'problem' ? (
                  <Pressable onPress={() => setMode('check')} style={{ alignSelf: 'flex-start' }}>
                    <Text style={{ color: palette.textSoft, fontSize: 14, fontWeight: '600' }}>Back to checklist</Text>
                  </Pressable>
                ) : null}
                {!finished ? (
                  <Text style={{ color: submitError ? palette.danger : palette.faint, fontSize: 12.5 }} numberOfLines={2}>
                    {submitError
                      || (mode === 'check'
                        ? (ready ? 'Everything checked' : `Still needed: ${missing.join(', ')}`)
                        : (reason ? '' : 'Pick what’s wrong'))}
                  </Text>
                ) : null}
              </View>
              {mode === 'check' && !isSheet ? (
                <Pressable
                  onPress={() => {
                    void handleFinishLater();
                  }}
                  disabled={submitting || uploading}
                  className="active:opacity-80"
                  style={{ height: 44, paddingHorizontal: 18, borderRadius: 999, borderWidth: 1, borderColor: palette.outline, alignItems: 'center', justifyContent: 'center', opacity: submitting || uploading ? 0.6 : 1 }}
                >
                  <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>Finish later</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => {
                  void handlePrimary();
                }}
                disabled={primaryDisabled}
                accessibilityState={{ disabled: primaryDisabled }}
                className="active:opacity-85"
                style={{
                  height: 48,
                  paddingHorizontal: 22,
                  borderRadius: 999,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 8,
                  backgroundColor: primaryDisabled ? palette.softFill : mode === 'problem' ? palette.inverseBg : FYLL_LIME,
                }}
              >
                {submitting ? <ActivityIndicator size="small" color={FYLL_LIME_INK} /> : null}
                <Text style={{ color: primaryDisabled ? palette.faint : mode === 'problem' ? palette.inverseText : FYLL_LIME_INK, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
                  {primaryLabel}
                </Text>
              </Pressable>
            </View>

          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
