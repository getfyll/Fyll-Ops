import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Image, Platform, Modal } from 'react-native';
import { AlertCircle, Check, ImagePlus, Plus, Sparkles, X, ArrowRight } from 'lucide-react-native';
import { FyllAiButton } from '@/components/FyllAiButton';
import { FYLL_LIME, FYLL_LIME_HOVER, FYLL_LIME_INK, usePaymentsPalette, type PaymentsPalette } from '@/components/payments/payments-ui';
import { CASE_PRIORITIES, CASE_SOURCES, CASE_TYPES, type CasePriority, type CaseSource, type CaseType } from '@/lib/state/fyll-store';
import type { CaseDraftData } from '@/lib/ai-case-parser';

export interface CaseAiFormProps {
  customerName: string;
  onCustomerName: (value: string) => void;
  orderNumber: string;
  onOrderNumber: (value: string) => void;
  messageText: string;
  onMessageText: (value: string) => void;
  imageDataUrls: string[];
  maxImages: number;
  onPickImage: () => void;
  onRemoveImage: (index: number) => void;
  error: string | null;
  isParsing: boolean;
  onGenerate: () => void;
  draft: CaseDraftData | null;
  issueSummary: string;
  onIssueSummary: (value: string) => void;
  context: string;
  onContext: (value: string) => void;
  caseType: CaseType;
  onCaseType: (value: CaseType) => void;
  priority: CasePriority;
  onPriority: (value: CasePriority) => void;
  source: CaseSource;
  onSource: (value: CaseSource) => void;
  onCreate: () => void;
  onReset: () => void;
  // The full-page screen shows each part as a numbered card; the popup keeps them flat.
  cards?: boolean;
}

const noOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null;

function Field({ label, palette, multiline, minHeight, ...props }: { label: string; palette: PaymentsPalette; multiline?: boolean; minHeight?: number; value: string; onChangeText: (value: string) => void; placeholder: string }) {
  const [focused, setFocused] = useState<boolean>(false);
  return (
    <View>
      <Text style={{ color: palette.textSoft, fontSize: 14, marginBottom: 8 }}>{label}</Text>
      <View
        style={{
          borderRadius: 14,
          backgroundColor: palette.inset,
          borderWidth: 1,
          borderColor: focused ? (palette.isDark ? FYLL_LIME : '#B8C43A') : palette.outline,
          paddingHorizontal: 16,
          paddingVertical: multiline ? 12 : 0,
          height: multiline ? undefined : 52,
          minHeight,
          justifyContent: 'center',
        }}
      >
        <TextInput
          {...props}
          placeholderTextColor={palette.faint}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : 'center'}
          selectionColor={palette.text}
          style={[{ color: palette.text, fontSize: 14, minHeight: multiline ? (minHeight ?? 100) - 24 : undefined }, noOutline]}
        />
      </View>
    </View>
  );
}

function Chips<T extends string>({ label, values, selected, onSelect, palette }: { label: string; values: readonly T[]; selected: T; onSelect: (value: T) => void; palette: PaymentsPalette }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: palette.textSoft, fontSize: 14 }}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {values.map((value) => {
            const active = selected === value;
            return (
              <Pressable
                key={value}
                onPress={() => onSelect(value)}
                style={{ height: 34, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? FYLL_LIME : 'transparent', borderWidth: active ? 0 : 1, borderColor: palette.outline }}
              >
                <Text style={{ color: active ? FYLL_LIME_INK : palette.textSoft, fontSize: 12, fontWeight: '600' }}>{value}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

function Section({ cards, n, title, right, palette, children }: { cards?: boolean; n: number; title: string; right?: React.ReactNode; palette: PaymentsPalette; children: React.ReactNode }) {
  if (!cards) {
    return (
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ color: palette.textSoft, fontSize: 14 }}>{title}</Text>
          {right}
        </View>
        {children}
      </View>
    );
  }
  return (
    <View style={{ borderRadius: 20, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, padding: 16, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: FYLL_LIME }}>
          <Text style={{ color: FYLL_LIME_INK, fontSize: 12, fontWeight: '600' }}>{n}</Text>
        </View>
        <Text style={{ flex: 1, color: palette.text, fontSize: 16, fontWeight: '500' }}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

// The shared body of Fyll AI for cases: used by the web popup and the mobile full-page screen.
export function CaseAiForm(props: CaseAiFormProps) {
  const palette = usePaymentsPalette();
  const { draft, imageDataUrls, maxImages } = props;
  const hasInput = props.messageText.trim().length > 0 || imageDataUrls.length > 0;
  const showDraft = Boolean(draft || props.issueSummary || props.context);
  const tint = palette.tones[draft?.confidence === 'high' ? 'verified' : draft?.confidence === 'medium' ? 'awaiting' : 'rejected'];

  return (
    <View style={{ gap: props.cards ? 14 : 16 }}>
      {!props.cards ? (
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 14, backgroundColor: palette.nudgeBg, borderWidth: 1, borderColor: palette.nudgeBorder }}>
        <AlertCircle size={16} color={palette.limeOnSurface} strokeWidth={2.2} style={{ marginTop: 1 }} />
        <Text style={{ flex: 1, color: palette.textSoft, fontSize: 12, lineHeight: 18 }}>
          Upload screenshots of the customer's issue. Fyll AI reads them and drafts the case. Add the customer name and order number if you have them.
        </Text>
      </View>
      ) : null}

      <Section cards={props.cards} n={1} title="Screenshots of the issue" palette={palette} right={<Text style={{ color: palette.faint, fontSize: 12 }}>{imageDataUrls.length}/{maxImages}</Text>}>
        {imageDataUrls.length === 0 ? (
          <Pressable
            onPress={props.onPickImage}
            style={{ height: 120, borderRadius: 14, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: palette.outline, backgroundColor: palette.inset }}
          >
            <ImagePlus size={18} color={palette.textSoft} strokeWidth={1.9} />
            <Text style={{ color: palette.textSoft, fontSize: 14, fontWeight: '500' }}>Upload screenshots</Text>
            <Text style={{ color: palette.faint, fontSize: 12 }}>Add several. Fyll AI reads them together.</Text>
          </Pressable>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {imageDataUrls.map((url, index) => (
                <View key={`${index}-${url.slice(0, 18)}`} style={{ width: 96, height: 96, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: palette.border }}>
                  <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  <Pressable
                    onPress={() => props.onRemoveImage(index)}
                    style={{ position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.65)' }}
                  >
                    <X size={13} color="#FFFFFF" strokeWidth={2.4} />
                  </Pressable>
                </View>
              ))}
              {imageDataUrls.length < maxImages ? (
                <Pressable
                  onPress={props.onPickImage}
                  style={{ width: 96, height: 96, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderStyle: 'dashed', borderColor: palette.outline, backgroundColor: palette.inset }}
                >
                  <Plus size={18} color={palette.textSoft} strokeWidth={2} />
                  <Text style={{ color: palette.textSoft, fontSize: 12, fontWeight: '500' }}>Add</Text>
                </Pressable>
              ) : null}
            </View>
          </ScrollView>
        )}
      </Section>

      <Section cards={props.cards} n={2} title="Customer details" palette={palette}>
      <View style={{ gap: 16 }}>
        <Field label="Customer name" palette={palette} value={props.customerName} onChangeText={props.onCustomerName} placeholder="Enter customer name" />
        <Field label="Order number (optional)" palette={palette} value={props.orderNumber} onChangeText={props.onOrderNumber} placeholder="ORD-001" />
        <Field label="Extra details (optional)" palette={palette} multiline minHeight={110} value={props.messageText} onChangeText={props.onMessageText} placeholder="Paste the customer's message or add anything the screenshots miss" />

      </View>
      </Section>

      {props.error ? (
        <View style={{ flexDirection: 'row', gap: 10, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: palette.dangerBorder, backgroundColor: palette.dangerBg }}>
          <AlertCircle size={16} color={palette.danger} strokeWidth={2.2} style={{ marginTop: 1 }} />
          <Text style={{ flex: 1, color: palette.danger, fontSize: 14 }}>{props.error}</Text>
        </View>
      ) : null}

      {props.isParsing ? (
        <View style={{ height: 48, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: palette.softFill }}>
          <ActivityIndicator size="small" color={palette.textSoft} />
          <Text style={{ color: palette.textSoft, fontSize: 14, fontWeight: '600' }}>Reading the case…</Text>
        </View>
      ) : (
        <FyllAiButton
          label={showDraft ? 'Generate again' : 'Generate case draft'}
          onPress={props.onGenerate}
          disabled={!hasInput}
          height={48}
          borderRadius={999}
          textSize={14}
          style={{ opacity: hasInput ? 1 : 0.45 }}
        />
      )}

      {showDraft ? (
        <View style={{ padding: 16, borderRadius: 20, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, gap: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: FYLL_LIME }}>
              <Check size={14} color={FYLL_LIME_INK} strokeWidth={2.6} />
            </View>
            <Text style={{ flex: 1, color: palette.text, fontSize: 14, fontWeight: '500' }}>Review the draft</Text>
            {draft ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 26, borderRadius: 13, backgroundColor: tint.bg }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tint.dot }} />
                <Text style={{ color: tint.ink, fontSize: 12, fontWeight: '600' }}>{draft.confidence} confidence</Text>
              </View>
            ) : null}
          </View>

          <Field label="Heading" palette={palette} value={props.issueSummary} onChangeText={props.onIssueSummary} placeholder="Case heading" />
          <Field label="Context" palette={palette} multiline minHeight={110} value={props.context} onChangeText={props.onContext} placeholder="Case context" />
          <Chips label="Type" values={CASE_TYPES} selected={props.caseType} onSelect={props.onCaseType} palette={palette} />
          <Chips label="Priority" values={CASE_PRIORITIES} selected={props.priority} onSelect={props.onPriority} palette={palette} />
          <Chips label="Source" values={CASE_SOURCES} selected={props.source} onSelect={props.onSource} palette={palette} />

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={props.onReset}
              style={{ flex: 1, height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.outline }}
            >
              <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>Reset</Text>
            </Pressable>
            <Pressable
              onPress={props.onCreate}
              style={({ pressed }) => ({ flex: 2, height: 48, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: pressed ? FYLL_LIME_HOVER : FYLL_LIME })}
            >
              <Text style={{ color: FYLL_LIME_INK, fontSize: 14, fontWeight: '600' }}>Create case</Text>
              <ArrowRight size={16} color={FYLL_LIME_INK} strokeWidth={2.4} />
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

export function CaseAiModal({ visible, onClose, ...form }: CaseAiFormProps & { visible: boolean; onClose: () => void }) {
  const palette = usePaymentsPalette();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0, 0, 0, 0.55)' }} onPress={onClose}>
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={{ width: '100%', maxWidth: 620, maxHeight: '92%', borderRadius: 26, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, overflow: 'hidden' }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 22, paddingTop: 20, paddingBottom: 4, gap: 12 }}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Sparkles size={16} color={palette.limeOnSurface} strokeWidth={2.2} />
                <Text style={{ color: palette.text, fontSize: 16, fontWeight: '500' }}>Fyll AI</Text>
              </View>
              <Text style={{ color: palette.muted, fontSize: 12, marginTop: 4, lineHeight: 18 }}>Draft and save a case without leaving this page.</Text>
            </View>
            <Pressable onPress={onClose} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.softFill }}>
              <X size={16} color={palette.textSoft} strokeWidth={2} />
            </Pressable>
          </View>
          <ScrollView style={{ paddingHorizontal: 22 }} contentContainerStyle={{ paddingTop: 14, paddingBottom: 22 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <CaseAiForm {...form} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
