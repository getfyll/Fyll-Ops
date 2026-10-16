import React, { useState } from 'react';
import { View, Text, ScrollView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Sparkles } from 'lucide-react-native';
import { BackButton, usePaymentsPalette } from '@/components/payments/payments-ui';
import { CaseAiForm } from '@/components/cases/CaseAiForm';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { parseCaseDraft, CaseDraftData } from '@/lib/ai-case-parser';
import useFyllStore, {
  CASE_PRIORITIES,
  CASE_SOURCES,
  CASE_TYPES,
  Case,
  CasePriority,
  CaseSource,
  CaseType,
  generateCaseId,
  generateCaseNumber,
} from '@/lib/state/fyll-store';
import { pickMultipleImagesSimple } from '@/hooks/useImagePicker';
import useAuthStore from '@/lib/state/auth-store';
import * as Haptics from 'expo-haptics';

export default function AICaseScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ orderId?: string; orderNumber?: string; customerName?: string }>();
  const palette = usePaymentsPalette();
  const { isDesktop } = useBreakpoint();
  const isWebDesktop = Platform.OS === 'web' && isDesktop;

  const prefilledOrderId = typeof params.orderId === 'string' ? params.orderId : '';
  const prefilledOrderNumber = typeof params.orderNumber === 'string' ? params.orderNumber : '';
  const prefilledCustomerName = typeof params.customerName === 'string' ? params.customerName : '';

  const addCase = useFyllStore((s) => s.addCase);
  const caseStatuses = useFyllStore((s) => s.caseStatuses);
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const currentUser = useAuthStore((s) => s.currentUser);
  const MAX_CASE_SCREENSHOTS = 6;

  const [customerName, setCustomerName] = useState(prefilledCustomerName);
  const [orderNumber, setOrderNumber] = useState(prefilledOrderNumber);
  const [messageText, setMessageText] = useState('');
  const [imageDataUrls, setImageDataUrls] = useState<string[]>([]);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [draft, setDraft] = useState<CaseDraftData | null>(null);
  const [issueSummary, setIssueSummary] = useState('');
  const [context, setContext] = useState('');
  const [caseType, setCaseType] = useState<CaseType>('Other');
  const [priority, setPriority] = useState<CasePriority>('Medium');
  const [source, setSource] = useState<CaseSource>('Email');

  const handlePickImage = async () => {
    setErrorText(null);
    const picked = await pickMultipleImagesSimple();
    if (picked.length === 0) return;
    setImageDataUrls((previous) => {
      const merged = Array.from(new Set([...previous, ...picked]));
      if (merged.length > MAX_CASE_SCREENSHOTS) {
        setErrorText(`You can attach up to ${MAX_CASE_SCREENSHOTS} screenshots for one Fyll AI draft.`);
      }
      return merged.slice(0, MAX_CASE_SCREENSHOTS);
    });
  };

  const handleRemoveImage = (indexToRemove: number) => {
    setImageDataUrls((previous) => previous.filter((_, index) => index !== indexToRemove));
  };

  const handleGenerateDraft = async () => {
    if (!messageText.trim() && imageDataUrls.length === 0) {
      setErrorText('Paste the customer message or upload a screenshot to generate a draft.');
      return;
    }

    setIsParsing(true);
    setErrorText(null);
    setDraft(null);

    try {
      const result = await parseCaseDraft({
        messageText: messageText.trim() || undefined,
        imageDataUrls: imageDataUrls.length ? imageDataUrls : undefined,
      });

      if (!result) {
        setErrorText('Fyll AI could not summarize this case. Please try again with more detail.');
        return;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDraft(result);
      setIssueSummary(result.issueSummary);
      setContext(result.context);
      setCaseType(result.caseType);
      setPriority(result.priority);
      setSource(result.source);
    } catch (error: any) {
      setErrorText(error?.message || 'Fyll AI failed. Please try again.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleCreateCase = async () => {
    if (!customerName.trim()) {
      setErrorText('Add a customer name before creating a case.');
      return;
    }
    if (!issueSummary.trim()) {
      setErrorText('Generate a draft or add a heading first.');
      return;
    }

    const now = new Date().toISOString();
    const status = caseStatuses[0]?.name ?? 'Open';

    const newCase: Case = {
      id: generateCaseId(),
      caseNumber: generateCaseNumber(),
      orderId: prefilledOrderId || undefined,
      customerName: customerName.trim(),
      orderNumber: orderNumber.trim() || undefined,
      type: caseType,
      status,
      priority,
      source,
      issueSummary: issueSummary.trim(),
      originalCustomerMessage: context.trim() || messageText.trim() || undefined,
      attachments: imageDataUrls.length
        ? imageDataUrls.map((imageDataUrl, index) => ({
          id: Math.random().toString(36).slice(2),
          label: `AI Upload ${index + 1}`,
          uri: imageDataUrl,
          preview: imageDataUrl,
          uploadedAt: now,
        }))
        : undefined,
      createdAt: now,
      updatedAt: now,
      createdBy: currentUser?.name,
      updatedBy: currentUser?.name,
    };

    await addCase(newCase, businessId);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  };

  const resetForm = () => {
    setMessageText('');
    setImageDataUrls([]);
    setDraft(null);
    setIssueSummary('');
    setContext('');
    setCaseType('Other');
    setPriority('Medium');
    setSource('Email');
    setErrorText(null);
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.page }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: palette.hairline }}>
          <BackButton onPress={() => router.back()} palette={palette} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Sparkles size={16} color={palette.limeOnSurface} strokeWidth={2.2} />
              <Text style={{ color: palette.text, fontSize: 16, fontWeight: '500' }}>Create case with Fyll AI</Text>
            </View>
            <Text style={{ color: palette.muted, fontSize: 12, marginTop: 2 }}>Upload screenshots. We'll draft the case.</Text>
          </View>
        </View>
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: isWebDesktop ? 0 : 16,
            paddingTop: 16,
            paddingBottom: 40,
            maxWidth: isWebDesktop ? 720 : undefined,
            alignSelf: isWebDesktop ? 'center' : undefined,
            width: isWebDesktop ? '100%' : undefined,
          }}
        >
          <CaseAiForm
            cards
            customerName={customerName}
            onCustomerName={setCustomerName}
            orderNumber={orderNumber}
            onOrderNumber={setOrderNumber}
            messageText={messageText}
            onMessageText={setMessageText}
            imageDataUrls={imageDataUrls}
            maxImages={MAX_CASE_SCREENSHOTS}
            onPickImage={handlePickImage}
            onRemoveImage={handleRemoveImage}
            error={errorText}
            isParsing={isParsing}
            onGenerate={handleGenerateDraft}
            draft={draft}
            issueSummary={issueSummary}
            onIssueSummary={setIssueSummary}
            context={context}
            onContext={setContext}
            caseType={caseType}
            onCaseType={setCaseType}
            priority={priority}
            onPriority={setPriority}
            source={source}
            onSource={setSource}
            onCreate={handleCreateCase}
            onReset={resetForm}
          />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
