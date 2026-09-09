import React, { useMemo, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, ChevronLeft, ImagePlus, PackageCheck, RotateCcw, Trash2 } from 'lucide-react-native';
import useAuthStore from '@/lib/state/auth-store';
import { pickImageSimple } from '@/hooks/useImagePicker';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { queueReturnEmail } from '@/lib/supabase/return-emails';
import useFyllStore, {
  getReturnShippingPayer,
  RETURN_REASONS,
  RETURN_RESOLUTIONS,
  type Case,
  type Order,
  type ReturnReason,
  type ReturnResolution,
  type ReturnRequest,
} from '@/lib/state/fyll-store';
import { CustomerAccountPromptCard } from '@/components/public/CustomerAccountPromptCard';

type Step = 'lookup' | 'reason' | 'resolution' | 'review' | 'done';

const fyllCombinationPng = require('../../assets/Group 20fyll combination.png');
const RETURN_PAGE_BG = '#FFFFFF';
const RETURN_SURFACE = '#FFFFFF';
const RETURN_SOFT_BG = '#F8F8F6';
const RETURN_BORDER = '#E9E5DD';
const RETURN_TEXT = '#111111';
const RETURN_MUTED = '#737373';
const RETURN_FAINT = '#A3A3A3';
const makeId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const makeReturnRef = () => `RET-${Math.floor(100000 + Math.random() * 900000)}`;
const makeCaseNumber = () => `CASE-${Math.floor(100000 + Math.random() * 900000)}`;

const getOrderEmail = (order: Order) => (order.customerEmail ?? '').trim().toLowerCase();
const normalizeOrderLookupValue = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/^#/, '')
    .replace(/^wc[\s#-]*/i, '')
    .replace(/\s+/g, '');

const getOrderLookupCandidates = (order: Order) => {
  const rawValues = [order.id, order.orderNumber, order.customerTrackingCode, order.websiteOrderReference]
    .filter(Boolean)
    .map((value) => String(value));

  return new Set([
    ...rawValues.map((value) => value.trim().toLowerCase()),
    ...rawValues.map(normalizeOrderLookupValue),
  ]);
};

const getItemSummary = (order: Order) => {
  const itemCount = (order.items ?? []).reduce((sum, item) => sum + item.quantity, 0);
  const serviceCount = order.services?.length ?? 0;
  if (itemCount > 0 && serviceCount > 0) return `${itemCount} item${itemCount === 1 ? '' : 's'} + ${serviceCount} service${serviceCount === 1 ? '' : 's'}`;
  if (itemCount > 0) return `${itemCount} item${itemCount === 1 ? '' : 's'}`;
  if (serviceCount > 0) return `${serviceCount} service${serviceCount === 1 ? '' : 's'}`;
  return 'Order items';
};

export default function StartReturnScreen() {
  const { isMobile } = useBreakpoint();
  const { businessName, businessLogo } = useBusinessSettings();
  const orders = useFyllStore((s) => s.orders);
  const addReturn = useFyllStore((s) => s.addReturn);
  const addCase = useFyllStore((s) => s.addCase);
  const updateReturn = useFyllStore((s) => s.updateReturn);
  const updateCase = useFyllStore((s) => s.updateCase);
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const [step, setStep] = useState<Step>('lookup');
  const [orderInput, setOrderInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [reason, setReason] = useState<ReturnReason>('wrong_item');
  const [otherReason, setOtherReason] = useState('');
  const [resolution, setResolution] = useState<ReturnResolution>('refund');
  const [message, setMessage] = useState('');
  const [proofImages, setProofImages] = useState<string[]>([]);
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedRef, setSubmittedRef] = useState('');

  const shippingPayer = getReturnShippingPayer(reason);
  const canGoBack = step !== 'lookup' && step !== 'done';
  const showReturnIntro = step === 'lookup';
  const selectedReasonLabel = RETURN_REASONS.find((item) => item.value === reason)?.label ?? 'Return request';
  const resolvedReasonLabel = reason === 'other' && otherReason.trim() ? otherReason.trim() : selectedReasonLabel;

  const matchedOrder = useMemo(() => {
    const orderNeedle = normalizeOrderLookupValue(orderInput);
    const emailNeedle = emailInput.trim().toLowerCase();
    if (!orderNeedle || !emailNeedle) return null;
    return orders.find((order) => {
      return getOrderLookupCandidates(order).has(orderNeedle) && getOrderEmail(order) === emailNeedle;
    }) ?? null;
  }, [emailInput, orderInput, orders]);

  const handleLookup = () => {
    if (!matchedOrder) {
      setFeedback('We could not find that order and email combination.');
      return;
    }
    setSelectedOrder(matchedOrder);
    setFeedback('');
    setStep('reason');
  };

  const handleAddProofImage = async () => {
    const image = await pickImageSimple();
    if (!image) return;
    setProofImages((current) => [...current, image]);
    setFeedback('');
  };

  const resetReturnFlow = () => {
    setStep('lookup');
    setOrderInput('');
    setEmailInput('');
    setSelectedOrder(null);
    setReason('wrong_item');
    setOtherReason('');
    setResolution('refund');
    setMessage('');
    setProofImages([]);
    setFeedback('');
    setIsSubmitting(false);
    setSubmittedRef('');
  };

  const submitReturn = async () => {
    if (!selectedOrder || isSubmitting) return;
    if (reason === 'other' && !otherReason.trim()) {
      setFeedback('Please write the reason for this return.');
      setStep('reason');
      return;
    }
    if (proofImages.length === 0) {
      setFeedback('Please attach at least one image showing the issue.');
      setStep('resolution');
      return;
    }
    if (!businessId) {
      setFeedback('Return submission needs an active business session.');
      return;
    }
    setIsSubmitting(true);
    setFeedback('');
    const now = new Date().toISOString();
    const returnId = makeId('return');
    const caseId = makeId('case');
    const ref = makeReturnRef();
    const returnItem: ReturnRequest = {
      id: returnId,
      ref,
      caseId,
      orderId: selectedOrder.id,
      orderNumber: selectedOrder.orderNumber,
      customerId: selectedOrder.customerId,
      customerName: selectedOrder.customerName,
      customerEmail: selectedOrder.customerEmail,
      customerPhone: selectedOrder.customerPhone,
      itemSummary: getItemSummary(selectedOrder),
      reason,
      otherReason: reason === 'other' ? otherReason.trim() : undefined,
      resolution,
      shippingPayer,
      status: 'initiated',
      notes: '',
      returnNotes: [],
      activity: [
        { id: makeId('return-activity'), date: now, action: `Return request ${ref} submitted`, user: 'Customer portal' },
      ],
      customerMessage: message.trim(),
      proofImages,
      createdAt: now,
      updatedAt: now,
      createdBy: 'Customer portal',
      updatedBy: 'Customer portal',
    };
    const caseItem: Case = {
      id: caseId,
      caseNumber: makeCaseNumber(),
      returnId,
      orderId: selectedOrder.id,
      orderNumber: selectedOrder.orderNumber,
      customerId: selectedOrder.customerId,
      customerName: selectedOrder.customerName,
      type: 'Return',
      status: 'Open',
      priority: reason === 'damaged' || reason === 'wrong_item' ? 'High' : 'Medium',
      assignedTo: 'Support',
      source: 'Web',
      issueSummary: `${resolvedReasonLabel} · ${RETURN_RESOLUTIONS.find((item) => item.value === resolution)?.label ?? resolution}`,
      originalCustomerMessage: message.trim(),
      attachments: proofImages.map((image, index) => ({
        id: makeId('case-attachment'),
        label: `Return proof ${index + 1}`,
        uri: image,
        preview: image,
        description: 'Customer uploaded proof for return request.',
        uploadedAt: now,
      })),
      timeline: [
        { id: makeId('timeline'), date: now, action: `Return request ${ref} submitted`, user: 'Customer portal' },
      ],
      createdAt: now,
      updatedAt: now,
      createdBy: 'Customer portal',
      updatedBy: 'Customer portal',
    };

    try {
      await addReturn(returnItem, businessId);
      await addCase(caseItem, businessId);
      await updateReturn(returnId, { caseId }, businessId);
      await updateCase(caseId, { returnId }, businessId);
      queueReturnEmail({
        type: 'return_received',
        businessId,
        returnId,
      });
      setSubmittedRef(ref);
      setStep('done');
    } catch (error) {
      console.log('Return request failed:', error);
      setFeedback('Could not submit the return request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStep = () => {
    if (step === 'lookup') {
      return (
        <View style={{ gap: 14 }}>
          <Field
            label="Order ID, WooCommerce order, or tracking code"
            value={orderInput}
            onChangeText={setOrderInput}
            placeholder="WC-10234, ORD-123456, or TRK-6576"
          />
          <Field label="Email used for the order" value={emailInput} onChangeText={setEmailInput} placeholder="customer@email.com" keyboardType="email-address" />
          <PrimaryButton label="Find Order" onPress={handleLookup} />
        </View>
      );
    }

    if (step === 'reason') {
      const continueToResolution = () => {
        if (reason === 'other' && !otherReason.trim()) {
          setFeedback('Please write the reason for this return.');
          return;
        }
        setFeedback('');
        setStep('resolution');
      };
      return (
        <View style={{ gap: 12 }}>
          {RETURN_REASONS.map((item) => {
            const active = reason === item.value;
            return (
              <Choice key={item.value} active={active} title={item.label} subtitle={item.description} onPress={() => {
                setReason(item.value);
                setFeedback('');
              }} />
            );
          })}
          {reason === 'other' ? (
            <Field
              label="Return reason"
              value={otherReason}
              onChangeText={(value) => {
                setOtherReason(value);
                setFeedback('');
              }}
              placeholder="Tell us why you want to return this order"
              multiline
            />
          ) : null}
          <PrimaryButton label="Continue" onPress={continueToResolution} disabled={reason === 'other' && !otherReason.trim()} />
        </View>
      );
    }

    if (step === 'resolution') {
      return (
        <View style={{ gap: 12 }}>
          {RETURN_RESOLUTIONS.map((item) => (
            <Choice key={item.value} active={resolution === item.value} title={item.label} subtitle={item.value === 'refund' ? 'Refund after the returned item is received.' : 'Exchange after the returned item is checked.'} onPress={() => setResolution(item.value)} />
          ))}
          <Field label="Anything else we should know?" value={message} onChangeText={setMessage} placeholder="Add details about the return" multiline />
          <View style={{ gap: 8 }}>
            <Text style={{ color: RETURN_MUTED, fontSize: 14, fontWeight: '500' }}>Proof image required</Text>
            <Pressable
              onPress={handleAddProofImage}
              style={{
                minHeight: 56,
                borderRadius: 22,
                borderWidth: 1,
                borderColor: RETURN_BORDER,
                backgroundColor: RETURN_SOFT_BG,
                paddingHorizontal: 14,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <ImagePlus size={18} color={RETURN_TEXT} strokeWidth={2} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: RETURN_TEXT, fontSize: 15, fontWeight: '500' }}>Add issue photo</Text>
                  <Text style={{ color: RETURN_MUTED, fontSize: 13, lineHeight: 19, fontWeight: '400', marginTop: 2 }}>Attach at least one clear image.</Text>
                </View>
              </View>
              <Text style={{ color: RETURN_MUTED, fontSize: 13, fontWeight: '500' }}>{proofImages.length}</Text>
            </Pressable>
            {proofImages.length > 0 ? (
              <View style={{ gap: 8 }}>
                {proofImages.map((image, index) => (
                  <View key={`${image}-${index}`} style={{ minHeight: 42, borderRadius: 14, borderWidth: 1, borderColor: RETURN_BORDER, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <Text style={{ color: RETURN_TEXT, fontSize: 13, fontWeight: '400' }}>Proof image {index + 1}</Text>
                    <Pressable onPress={() => setProofImages((current) => current.filter((_, itemIndex) => itemIndex !== index))} style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }}>
                      <Trash2 size={14} color={RETURN_MUTED} strokeWidth={2} />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
          <PrimaryButton label="Review Return" onPress={() => setStep('review')} disabled={proofImages.length === 0} />
        </View>
      );
    }

    if (step === 'review' && selectedOrder) {
      return (
        <View style={{ gap: 14 }}>
          <SummaryRow label="Order" value={selectedOrder.orderNumber} />
          <SummaryRow label="Customer" value={selectedOrder.customerName} />
          <SummaryRow label="Reason" value={resolvedReasonLabel} />
          <SummaryRow label="Resolution" value={RETURN_RESOLUTIONS.find((item) => item.value === resolution)?.label ?? resolution} />
          <SummaryRow label="Return shipping" value={shippingPayer === 'seller' ? 'Seller pays' : 'Customer pays'} />
          <SummaryRow label="Proof images" value={`${proofImages.length} attached`} />
          <PrimaryButton label={isSubmitting ? 'Submitting...' : 'Submit Return Request'} onPress={submitReturn} disabled={isSubmitting} />
        </View>
      );
    }

    return (
      <View style={{ alignItems: 'center', gap: 14, paddingVertical: 20 }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(34,197,94,0.12)', alignItems: 'center', justifyContent: 'center' }}>
          <Check size={28} color="#16A34A" strokeWidth={2.4} />
        </View>
        <Text style={{ color: RETURN_TEXT, fontSize: 20, lineHeight: 26, fontWeight: '600', textAlign: 'center' }}>Return request received</Text>
        <Text style={{ color: RETURN_MUTED, fontSize: 12, lineHeight: 18, fontWeight: '400', textAlign: 'center', maxWidth: 340 }}>
          Your reference is {submittedRef}. The team will review the request and follow up with next steps.
        </Text>
        <PrimaryButton label="Start Another Return" onPress={resetReturnFlow} />
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: RETURN_PAGE_BG }}>
      <PublicReturnHeader
        compact={isMobile}
        brandLabel={businessName || 'Returns'}
        brandLogo={businessLogo}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 22, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
          <View style={{ width: '100%', maxWidth: 560, alignSelf: 'center' }}>
            {showReturnIntro ? (
              <View style={{ alignItems: 'center', marginBottom: 34 }}>
                <Text
                  style={{
                    color: RETURN_TEXT,
                    fontSize: isMobile ? 28 : 34,
                    lineHeight: isMobile ? 34 : 40,
                    fontWeight: '600',
                    textAlign: 'center',
                  }}
                >
                  Start a return
                </Text>
                <Text
                  style={{
                    color: RETURN_MUTED,
                    fontSize: isMobile ? 13 : 15,
                    lineHeight: isMobile ? 19 : 22,
                    fontWeight: '400',
                    marginTop: 8,
                    textAlign: 'center',
                    maxWidth: 380,
                  }}
                >
                  Enter your order details to start a return request.
                </Text>
              </View>
            ) : null}

            {canGoBack ? (
              <Pressable
                onPress={() => setStep(step === 'review' ? 'resolution' : step === 'resolution' ? 'reason' : 'lookup')}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 22 }}
              >
                <ChevronLeft size={20} color={RETURN_TEXT} strokeWidth={2} />
                <Text style={{ color: RETURN_TEXT, fontSize: 13, fontWeight: '500' }}>Back</Text>
              </Pressable>
            ) : null}

            <View style={{ borderRadius: 30, borderWidth: 1, borderColor: RETURN_BORDER, backgroundColor: RETURN_SURFACE, padding: 24 }}>
              {!showReturnIntro ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                  <View style={{ width: 48, height: 48, borderRadius: 18, backgroundColor: RETURN_SOFT_BG, alignItems: 'center', justifyContent: 'center' }}>
                    {step === 'done' ? <PackageCheck size={22} color={RETURN_TEXT} strokeWidth={2} /> : <RotateCcw size={22} color={RETURN_TEXT} strokeWidth={2} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: RETURN_TEXT, fontSize: 24, lineHeight: 31, fontWeight: '600' }}>Start a return</Text>
                    <Text style={{ color: RETURN_MUTED, fontSize: 13, lineHeight: 19, fontWeight: '400', marginTop: 5 }}>
                      Return shipping is assigned from the selected reason.
                    </Text>
                  </View>
                </View>
              ) : null}

              {feedback ? (
                <View style={{ borderRadius: 16, backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.16)', padding: 12, marginBottom: 14 }}>
                  <Text style={{ color: '#DC2626', fontSize: 12, fontWeight: '500' }}>{feedback}</Text>
                </View>
              ) : null}

              {renderStep()}
            </View>
            <View style={{ marginTop: 18 }}>
              <CustomerAccountPromptCard compact={isMobile} />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <PublicReturnFooter compact={isMobile} />
    </SafeAreaView>
  );
}

function PublicReturnHeader({
  compact,
  brandLabel,
  brandLogo,
}: {
  compact: boolean;
  brandLabel: string;
  brandLogo?: string | null;
}) {
  const [logoFailed, setLogoFailed] = useState(false);
  const showLogo = Boolean(brandLogo && !logoFailed);

  return (
    <View style={{ width: '100%', borderBottomWidth: 1, borderBottomColor: RETURN_BORDER, backgroundColor: RETURN_PAGE_BG }}>
      <View
        style={{
          width: '100%',
          maxWidth: 1280,
          alignSelf: 'center',
          paddingHorizontal: compact ? 18 : 28,
          paddingVertical: compact ? 16 : 20,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <View style={{ width: compact ? 170 : 240, minHeight: compact ? 30 : 36, justifyContent: 'center', alignItems: 'flex-start' }}>
          {showLogo ? (
            <Image
              source={{ uri: brandLogo! }}
              resizeMode="contain"
              onError={() => setLogoFailed(true)}
              style={[
                { width: compact ? 150 : 210, height: compact ? 30 : 36, backgroundColor: 'transparent' },
                Platform.OS === 'web' ? ({ objectFit: 'contain', objectPosition: 'left center' } as any) : null,
              ]}
            />
          ) : (
            <Text numberOfLines={1} style={{ color: RETURN_TEXT, fontSize: compact ? 16 : 20, fontWeight: '600' }}>
              {brandLabel}
            </Text>
          )}
        </View>
        <Text style={{ color: RETURN_MUTED, fontSize: compact ? 12 : 13, fontWeight: '500' }}>
          Returns
        </Text>
      </View>
    </View>
  );
}

function PublicReturnFooter({ compact }: { compact: boolean }) {
  return (
    <View style={{ width: '100%', borderTopWidth: 1, borderTopColor: RETURN_BORDER, backgroundColor: RETURN_PAGE_BG }}>
      <View
        style={{
          width: '100%',
          maxWidth: 1280,
          alignSelf: 'center',
          paddingHorizontal: compact ? 18 : 28,
          paddingTop: compact ? 14 : 18,
          paddingBottom: compact ? 12 : 10,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: compact ? 10 : 24,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: compact ? 8 : 10, flex: 1 }}>
          <Text style={{ color: RETURN_MUTED, fontSize: 12, fontWeight: '500' }}>Powered by</Text>
          <Image
            source={fyllCombinationPng}
            resizeMode="contain"
            style={{ width: compact ? 74 : 92, height: compact ? 20 : 24 }}
          />
        </View>
        <Text style={{ color: RETURN_MUTED, fontSize: compact ? 12 : 13, lineHeight: compact ? 18 : 19, textAlign: 'right' }}>
          © Fyll 2026
        </Text>
      </View>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'email-address';
  multiline?: boolean;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: RETURN_MUTED, fontSize: 14, fontWeight: '500' }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={RETURN_FAINT}
        keyboardType={keyboardType}
        autoCapitalize="none"
        multiline={multiline}
        style={{
          minHeight: multiline ? 112 : 56,
          borderRadius: multiline ? 20 : 999,
          borderWidth: 1,
          borderColor: RETURN_BORDER,
          backgroundColor: RETURN_SOFT_BG,
          color: RETURN_TEXT,
          fontSize: 16,
          fontWeight: '400',
          paddingHorizontal: 20,
          paddingVertical: multiline ? 14 : 0,
          textAlignVertical: multiline ? 'top' : 'center',
          outlineStyle: 'none' as any,
        }}
      />
    </View>
  );
}

function Choice({ active, title, subtitle, onPress }: { active: boolean; title: string; subtitle: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        minHeight: 72,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: active ? RETURN_TEXT : RETURN_BORDER,
        backgroundColor: RETURN_SURFACE,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: RETURN_TEXT, fontSize: 15, fontWeight: '500' }}>{title}</Text>
        <Text style={{ color: RETURN_MUTED, fontSize: 13, lineHeight: 19, fontWeight: '400', marginTop: 4 }}>{subtitle}</Text>
      </View>
      <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: active ? RETURN_TEXT : RETURN_BORDER, backgroundColor: active ? RETURN_TEXT : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        {active ? <Check size={14} color={RETURN_SURFACE} strokeWidth={2.5} /> : null}
      </View>
    </Pressable>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: RETURN_BORDER, paddingBottom: 12 }}>
      <Text style={{ color: RETURN_MUTED, fontSize: 12, fontWeight: '500' }}>{label}</Text>
      <Text style={{ color: RETURN_TEXT, fontSize: 16, fontWeight: '500', marginTop: 6 }}>{value}</Text>
    </View>
  );
}

function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={{
        minHeight: 58,
        minWidth: 190,
        borderRadius: 999,
        backgroundColor: RETURN_TEXT,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text style={{ color: RETURN_SURFACE, fontSize: 16, fontWeight: '500', textAlign: 'center' }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}
