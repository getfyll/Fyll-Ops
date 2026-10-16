import React, { useState } from 'react';
import { pickMultipleImagesSimple } from '@/hooks/useImagePicker';
import { CaseAiModal } from '@/components/cases/CaseAiForm';
import { parseCaseDraft, type CaseDraftData } from '@/lib/ai-case-parser';
import useFyllStore, {
  generateCaseId,
  generateCaseNumber,
  type Case,
  type CasePriority,
  type CaseSource,
  type CaseType,
} from '@/lib/state/fyll-store';
import useAuthStore from '@/lib/state/auth-store';

const MAX_SCREENSHOTS = 6;

// Fyll AI for cases as one self-contained popup: screenshots in, a case draft out. The Cases screens
// and the New Case form all open this same component.
export function CaseAiSheet({
  visible,
  onClose,
  onCreated,
  prefill,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated?: () => void;
  prefill?: { customerName?: string; orderNumber?: string; orderId?: string };
}) {
  const addCase = useFyllStore((s) => s.addCase);
  const caseStatuses = useFyllStore((s) => s.caseStatuses);
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const currentUser = useAuthStore((s) => s.currentUser);

  const [customerName, setCustomerName] = useState<string>(prefill?.customerName ?? '');
  const [orderNumber, setOrderNumber] = useState<string>(prefill?.orderNumber ?? '');
  const [messageText, setMessageText] = useState<string>('');
  const [imageDataUrls, setImageDataUrls] = useState<string[]>([]);
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [draft, setDraft] = useState<CaseDraftData | null>(null);
  const [issueSummary, setIssueSummary] = useState<string>('');
  const [context, setContext] = useState<string>('');
  const [caseType, setCaseType] = useState<CaseType>('Other');
  const [priority, setPriority] = useState<CasePriority>('Medium');
  const [source, setSource] = useState<CaseSource>('Email');
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setCustomerName(prefill?.customerName ?? '');
    setOrderNumber(prefill?.orderNumber ?? '');
    setMessageText('');
    setImageDataUrls([]);
    setIsParsing(false);
    setDraft(null);
    setIssueSummary('');
    setContext('');
    setCaseType('Other');
    setPriority('Medium');
    setSource('Email');
    setError(null);
  };

  const close = () => {
    onClose();
    reset();
  };

  const handlePickImage = async () => {
    setError(null);
    const picked = await pickMultipleImagesSimple();
    if (picked.length === 0) return;
    const merged = Array.from(new Set([...imageDataUrls, ...picked]));
    if (merged.length > MAX_SCREENSHOTS) {
      setError(`You can attach up to ${MAX_SCREENSHOTS} screenshots for one Fyll AI draft.`);
    }
    setImageDataUrls(merged.slice(0, MAX_SCREENSHOTS));
  };

  const handleGenerate = async () => {
    if (!messageText.trim() && imageDataUrls.length === 0) {
      setError('Upload a screenshot or add some details before generating a draft.');
      return;
    }
    setIsParsing(true);
    setError(null);
    setDraft(null);
    try {
      const result = await parseCaseDraft({
        messageText: messageText.trim() || undefined,
        imageDataUrls: imageDataUrls.length ? imageDataUrls : undefined,
      });
      if (!result) {
        setError('Fyll AI could not generate a draft from this. Try clearer screenshots.');
        return;
      }
      setDraft(result);
      setIssueSummary(result.issueSummary);
      setContext(result.context);
      setCaseType(result.caseType);
      setPriority(result.priority);
      setSource(result.source);
    } catch (e: any) {
      setError(e?.message || 'Fyll AI failed. Please try again.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleCreate = async () => {
    if (!customerName.trim()) {
      setError('Add the customer name before creating the case.');
      return;
    }
    if (!issueSummary.trim()) {
      setError('Generate a draft first, or type a heading.');
      return;
    }
    const now = new Date().toISOString();
    const newCase: Case = {
      id: generateCaseId(),
      caseNumber: generateCaseNumber(),
      orderId: prefill?.orderId || undefined,
      customerName: customerName.trim(),
      orderNumber: orderNumber.trim() || undefined,
      type: caseType,
      status: caseStatuses[0]?.name ?? 'Open',
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
    close();
    onCreated?.();
  };

  return (
    <CaseAiModal
      visible={visible}
      onClose={close}
      customerName={customerName}
      onCustomerName={setCustomerName}
      orderNumber={orderNumber}
      onOrderNumber={setOrderNumber}
      messageText={messageText}
      onMessageText={setMessageText}
      imageDataUrls={imageDataUrls}
      maxImages={MAX_SCREENSHOTS}
      onPickImage={handlePickImage}
      onRemoveImage={(index) => setImageDataUrls((previous) => previous.filter((_, i) => i !== index))}
      error={error}
      isParsing={isParsing}
      onGenerate={handleGenerate}
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
      onCreate={handleCreate}
      onReset={reset}
    />
  );
}
