import React, { useState } from 'react';
import { ActivityIndicator, Image, Linking, Modal, Platform, Pressable, ScrollView, Text, View, type PressableStateCallbackType } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronRight, Clock, Copy, ExternalLink, FileText, Landmark, Mail, MessageCircle, MoreHorizontal, Package, Pencil, Phone, X, XCircle } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import useAuthStore from '@/lib/state/auth-store';
import { formatCurrency } from '@/lib/state/fyll-store';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { DesktopSidebar } from '@/components/DesktopSidebar';
import { BackButton, FYLL_LIME, FYLL_LIME_HOVER, FYLL_LIME_INK, InitialsAvatar, MoneyText, SectionLabel, isHovered, useMobileFont, usePaymentsPalette } from '@/components/payments/payments-ui';
import {
  QUOTE_STATUS_LABEL,
  QUOTE_STATUS_TONE,
  buildQuoteMessage,
  buildQuoteReminder,
  buildQuoteUrl,
  buildWhatsAppUrl,
  formatQuoteDate,
  formatQuoteTime,
  getQuoteEffectiveStatus,
  quoteLinkLabel,
  type Quote,
  type QuoteActivity,
  type QuoteStatus,
} from '@/lib/quotes';
import { quotesQueryKey, updateQuote, useQuotes } from '@/lib/quotes-api';

// Quote detail, laid out like the payment link detail: amount and status up top, what to do next,
// the bill, the link to send, and the activity trail. Ops stays black and white; lime marks the
// next action.

const STATUS_ICON: Record<QuoteStatus, typeof Check> = {
  sent: Clock,
  changes_requested: MessageCircle,
  accepted: Clock,
  proof_submitted: FileText,
  proof_rejected: X,
  order_created: Check,
  declined: X,
  expired: Clock,
  cancelled: XCircle,
};

export default function QuoteDetailScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const palette = usePaymentsPalette();
  const fs = useMobileFont();
  const insets = useSafeAreaInsets();
  const { isDesktop } = useBreakpoint();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const currentUser = useAuthStore((s) => s.currentUser);
  const { businessName, businessSlug } = useBusinessSettings();
  const quotesQuery = useQuotes();
  const stored = (quotesQuery.data ?? []).find((quote) => quote.id === id) ?? null;

  const [busy, setBusy] = useState<string>('');
  const [refCopied, setRefCopied] = useState<boolean>(false);
  const [linkCopied, setLinkCopied] = useState<boolean>(false);
  const [messageCopied, setMessageCopied] = useState<boolean>(false);
  const [showProof, setShowProof] = useState<boolean>(false);
  const [showMore, setShowMore] = useState<boolean>(false);
  const [confirm, setConfirm] = useState<'reject' | 'cancel' | null>(null);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/payments' as never));

  const cardStyle = { borderRadius: 18, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border } as const;
  const outlineButton = (state: PressableStateCallbackType, height = 44) => ({
    height,
    borderRadius: 999,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: isHovered(state) ? (palette.isDark ? 'rgba(255,255,255,0.3)' : '#BDBDBD') : palette.outline,
    backgroundColor: state.pressed ? palette.softFill : isHovered(state) ? (palette.isDark ? 'rgba(255,255,255,0.04)' : '#FAFAFA') : 'transparent',
  });
  const limeButton = (state: PressableStateCallbackType, height = 46) => ({
    height,
    borderRadius: 999,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
    paddingHorizontal: 16,
    backgroundColor: isHovered(state) ? FYLL_LIME_HOVER : FYLL_LIME,
    opacity: state.pressed ? 0.85 : 1,
  });

  const shell = (children: React.ReactNode) => (
    <View className="flex-1 flex-row" style={{ backgroundColor: palette.page }}>
      {isDesktop ? <DesktopSidebar /> : null}
      <SafeAreaView className="flex-1" edges={['top']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: isDesktop ? 20 : 16, paddingTop: isDesktop ? 18 : 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: palette.hairline }}>
          <BackButton onPress={goBack} palette={palette} label="Back to payments" />
          <Text style={{ color: palette.text, fontSize: 18, fontWeight: '600' }}>Quote</Text>
        </View>
        <View style={{ padding: 20 }}>{children}</View>
      </SafeAreaView>
    </View>
  );

  if (quotesQuery.isLoading) return shell(<ActivityIndicator color={palette.text} />);
  if (!stored) return shell(<Text style={{ color: palette.muted, fontSize: fs(14) }}>This quote no longer exists.</Text>);

  const quote: Quote = stored;
  const status = getQuoteEffectiveStatus(quote);
  const first = quote.customerName.trim().split(/\s+/)[0] || 'the customer';
  const storeName = businessName?.trim() || 'us';
  const linkBusiness = { businessName, businessSlug };
  const publicLink = buildQuoteUrl(quote.id, linkBusiness);
  const customerMessage = buildQuoteMessage(quote, storeName, businessSlug);
  const tone = QUOTE_STATUS_TONE[status];
  const toneStyle = tone === 'neutral' ? { ink: palette.textSoft, dot: palette.faint, bg: palette.softFill } : palette.tones[tone];
  const StatusIcon = STATUS_ICON[status];
  const hasProof = Boolean(quote.proofImageUrl);
  const canEdit = status === 'sent' || status === 'changes_requested' || status === 'declined' || status === 'expired';
  const canCancel = status === 'sent' || status === 'changes_requested' || status === 'accepted' || status === 'proof_rejected';
  const canMessage = status === 'sent' || status === 'changes_requested' || status === 'accepted' || status === 'proof_rejected';

  const save = async (key: string, patch: Partial<Quote>, activity: { text: string; tone?: QuoteActivity['tone'] }) => {
    if (!businessId) return;
    setBusy(key);
    try {
      await updateQuote(businessId, quote, patch, activity);
      await queryClient.invalidateQueries({ queryKey: quotesQueryKey(businessId) });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.warn('Quote update failed:', error);
    } finally {
      setBusy('');
    }
  };

  const copyLink = async () => {
    await Clipboard.setStringAsync(publicLink);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 1600);
  };
  const copyMessage = async () => {
    await Clipboard.setStringAsync(customerMessage);
    setMessageCopied(true);
    setTimeout(() => setMessageCopied(false), 1600);
  };
  const sendReminder = async () => {
    void Linking.openURL(buildWhatsAppUrl(quote.customerPhone, buildQuoteReminder(quote, storeName, businessSlug)));
    await save('reminder', {}, { text: 'Reminder sent on WhatsApp' });
  };
  const sendOnWhatsApp = () => {
    void Linking.openURL(buildWhatsAppUrl(quote.customerPhone, customerMessage));
  };
  const replyOnWhatsApp = () => {
    void Linking.openURL(buildWhatsAppUrl(quote.customerPhone, `Hi ${first}, thanks for your message about quote ${quote.quoteNumber}.`));
  };
  const openOrder = () => {
    if (!quote.convertedOrderId) return;
    router.push((Platform.OS === 'web' && isDesktop ? `/orders/${quote.convertedOrderId}` : `/order/${quote.convertedOrderId}`) as never);
  };

  const verifyAndCreateOrder = async () => {
    const inventoryItems = quote.items.filter((item) => item.productId && item.variantId);
    const custom = quote.items.filter((item) => !item.productId || !item.variantId);
    const params = new URLSearchParams();
    const bill = quote.items.map((item) => `${item.quantity}x ${item.name} ${formatCurrency(item.unitPrice * item.quantity)}`).join('\n');
    const entries: Record<string, string> = {
      customerName: quote.customerName,
      customerPhone: quote.customerPhone,
      customerEmail: quote.customerEmail ?? '',
      quoteId: quote.id,
      socialCheckoutReference: quote.quoteNumber,
      socialCheckoutBill: `${bill}\n\nTotal ${formatCurrency(quote.total)}${quote.balance > 0 ? ` · ${formatCurrency(quote.balance)} balance due before delivery` : ''}`,
      socialCheckoutAmount: String(quote.depositAmount),
      source: 'Quote',
      paymentMethod: 'Bank Transfer',
      quoteItems: JSON.stringify(inventoryItems.map((item) => ({ productId: item.productId, variantId: item.variantId, quantity: item.quantity, unitPrice: item.unitPrice }))),
      quoteAdditionalCharges: custom.length ? String(custom.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)) : '',
      quoteAdditionalNote: custom.map((item) => `${item.name} ×${item.quantity}`).join(', '),
    };
    Object.entries(entries).forEach(([key, value]) => { if (value.trim()) params.set(key, value); });
    if (businessId && !quote.reviewedAt) {
      try {
        await updateQuote(businessId, quote, { reviewedBy: currentUser?.name, reviewedAt: new Date().toISOString() }, { text: 'Deposit proof checked, creating the order', tone: 'good' });
        await queryClient.invalidateQueries({ queryKey: quotesQueryKey(businessId) });
      } catch (error) {
        console.warn('Quote review note failed:', error);
      }
    }
    router.push(`/new-order?${params.toString()}` as never);
  };

  const heroSection = (
    <View style={{ gap: 10, paddingBottom: 6 }}>
      <MoneyText style={{ color: palette.text, fontSize: 34, lineHeight: 40, letterSpacing: -1 }} numberOfLines={1} adjustsFontSizeToFit>
        {formatCurrency(quote.total)}
      </MoneyText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <View style={{ height: 26, paddingHorizontal: 10, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: toneStyle.bg }}>
          <StatusIcon size={12} color={toneStyle.ink} strokeWidth={2.8} />
          <Text style={{ color: toneStyle.ink, fontSize: fs(12.5), fontWeight: '600' }}>{QUOTE_STATUS_LABEL[status]}</Text>
        </View>
        <View style={{ height: 26, paddingHorizontal: 10, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: palette.softFill }}>
          <FileText size={12} color={palette.textSoft} strokeWidth={2.2} />
          <Text style={{ color: palette.textSoft, fontSize: fs(12.5), fontWeight: '600' }}>Quote</Text>
        </View>
        <Text style={{ color: palette.faint, fontSize: fs(12.5) }}>{formatQuoteTime(quote.createdAt)}</Text>
      </View>
    </View>
  );

  const waitingCard = (title: string, caption: string, extra?: React.ReactNode) => (
    <View style={{ ...cardStyle, padding: 16, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: palette.softFill, alignItems: 'center', justifyContent: 'center' }}>
          <Clock size={17} color={palette.muted} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: palette.text, fontSize: fs(15), fontWeight: '600' }}>{title}</Text>
          <Text style={{ color: palette.muted, fontSize: fs(13) }}>{caption}</Text>
        </View>
      </View>
      {extra}
    </View>
  );

  const reviewSection = status === 'proof_submitted' ? (
    <View style={{ ...cardStyle, padding: 16, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: palette.softFill, alignItems: 'center', justifyContent: 'center' }}>
          <FileText size={17} color={palette.text} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: palette.text, fontSize: fs(15), fontWeight: '600' }}>Deposit receipt uploaded · needs review</Text>
          <Text style={{ color: palette.muted, fontSize: fs(13) }}>Expecting {formatCurrency(quote.depositAmount)} in {quote.bankAccount.bankName || 'your account'}. Check it landed, then verify.</Text>
        </View>
      </View>
      {hasProof ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View deposit receipt"
          onPress={() => setShowProof(true)}
          style={(state) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 14, backgroundColor: palette.inset, borderWidth: 1, borderColor: palette.hairline, opacity: state.pressed ? 0.8 : 1 })}
        >
          <Image source={{ uri: quote.proofImageUrl }} style={{ width: 56, height: 56, borderRadius: 10 }} resizeMode="cover" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: palette.text, fontSize: fs(14), fontWeight: '600' }}>Deposit receipt</Text>
            <Text style={{ color: palette.faint, fontSize: fs(12.5), marginTop: 2 }}>Tap to view full size</Text>
          </View>
          <ChevronRight size={16} color={palette.faint} strokeWidth={2.2} />
        </Pressable>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable accessibilityRole="button" onPress={verifyAndCreateOrder} style={(state) => ({ ...limeButton(state), flex: 1.3 })}>
          <Check size={15} color={FYLL_LIME_INK} strokeWidth={2.6} />
          <Text style={{ color: FYLL_LIME_INK, fontSize: fs(14.5), fontWeight: '600' }}>Verify and create order</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => setConfirm('reject')} style={(state) => ({ ...outlineButton(state, 46), flex: 1, borderColor: palette.dangerBorder })}>
          <X size={15} color={palette.danger} strokeWidth={2.4} />
          <Text style={{ color: palette.danger, fontSize: fs(14.5), fontWeight: '600' }}>Reject</Text>
        </Pressable>
      </View>
    </View>
  ) : null;

  const orderSection = status === 'order_created' ? (
    <View style={{ ...cardStyle, overflow: 'hidden' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open order ${quote.convertedOrderNumber ?? ''}`}
        onPress={openOrder}
        style={(state) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: isHovered(state) ? palette.cardHover : 'transparent' })}
      >
        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: FYLL_LIME, alignItems: 'center', justifyContent: 'center' }}>
          <Check size={17} color={FYLL_LIME_INK} strokeWidth={2.8} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: palette.text, fontSize: fs(15), fontWeight: '600' }}>Order {quote.convertedOrderNumber ?? ''} created</Text>
          <Text style={{ color: palette.muted, fontSize: fs(13) }}>
            Deposit verified.{quote.balance > 0 ? ` ${formatCurrency(quote.balance)} balance is still due before delivery.` : ''}
          </Text>
        </View>
        <ChevronRight size={16} color={palette.faint} strokeWidth={2.2} />
      </Pressable>
    </View>
  ) : null;

  const nextSection = (() => {
    if (status === 'sent') {
      return waitingCard(
        `Waiting for ${first}`,
        quote.viewCount ? `Viewed ${quote.viewCount} ${quote.viewCount === 1 ? 'time' : 'times'} · last ${formatQuoteTime(quote.lastViewedAt)}` : 'Not opened yet. Send them the link.',
        <Pressable accessibilityRole="button" onPress={quote.viewCount ? sendReminder : sendOnWhatsApp} disabled={busy === 'reminder'} style={(state) => limeButton(state)}>
          <MessageCircle size={15} color={FYLL_LIME_INK} strokeWidth={2.4} />
          <Text style={{ color: FYLL_LIME_INK, fontSize: fs(14.5), fontWeight: '600' }}>{quote.viewCount ? 'Send reminder' : 'Send on WhatsApp'}</Text>
        </Pressable>,
      );
    }
    if (status === 'changes_requested') {
      return (
        <View style={{ ...cardStyle, borderColor: palette.warnBorder, padding: 16, gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: palette.warnBg, alignItems: 'center', justifyContent: 'center' }}>
              <MessageCircle size={17} color={palette.warn} strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: palette.text, fontSize: fs(15), fontWeight: '600' }}>{first} asked for changes</Text>
              {quote.changesRequest?.topics?.length ? <Text style={{ color: palette.muted, fontSize: fs(13) }}>{quote.changesRequest.topics.join(' · ')}</Text> : null}
            </View>
          </View>
          {quote.changesRequest?.message ? (
            <View style={{ padding: 12, borderRadius: 14, backgroundColor: palette.inset, borderWidth: 1, borderColor: palette.hairline }}>
              <Text style={{ color: palette.textSoft, fontSize: fs(14), lineHeight: 21 }} selectable>“{quote.changesRequest.message}”</Text>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable accessibilityRole="button" onPress={() => router.push(`/quote/new?id=${quote.id}` as never)} style={(state) => ({ ...limeButton(state), flex: 1.3 })}>
              <Text style={{ color: FYLL_LIME_INK, fontSize: fs(14.5), fontWeight: '600' }}>Edit quote</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={replyOnWhatsApp} style={(state) => ({ ...outlineButton(state, 46), flex: 1 })}>
              <Text style={{ color: palette.text, fontSize: fs(14.5), fontWeight: '600' }}>Reply</Text>
            </Pressable>
          </View>
        </View>
      );
    }
    if (status === 'accepted' || status === 'proof_rejected') {
      return waitingCard(
        status === 'proof_rejected' ? 'Receipt rejected · waiting for a new one' : `${first} accepted · waiting for the deposit`,
        `Expecting ${formatCurrency(quote.depositAmount)}${quote.bankAccount.bankName ? ` in ${quote.bankAccount.bankName}` : ''}.`,
        <Pressable accessibilityRole="button" onPress={sendReminder} style={(state) => limeButton(state)}>
          <MessageCircle size={15} color={FYLL_LIME_INK} strokeWidth={2.4} />
          <Text style={{ color: FYLL_LIME_INK, fontSize: fs(14.5), fontWeight: '600' }}>Remind about deposit</Text>
        </Pressable>,
      );
    }
    if (status === 'declined' || status === 'expired' || status === 'cancelled') {
      const title = status === 'declined' ? `${first} declined this quote` : status === 'expired' ? 'This quote has expired' : 'Quote cancelled';
      const caption = status === 'declined'
        ? (quote.declineReason ? `Reason: ${quote.declineReason}` : 'Edit it and send a new price to win them back.')
        : status === 'expired'
          ? `It expired on ${formatQuoteDate(quote.validUntil)}. Edit it to pick a new date.`
          : 'The customer can no longer accept it.';
      return (
        <View style={{ ...cardStyle, borderColor: palette.dangerBorder, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: palette.dangerBg, alignItems: 'center', justifyContent: 'center' }}>
            <X size={17} color={palette.danger} strokeWidth={2.4} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: palette.text, fontSize: fs(15), fontWeight: '600' }}>{title}</Text>
            <Text style={{ color: palette.muted, fontSize: fs(13) }}>{caption}</Text>
          </View>
        </View>
      );
    }
    return null;
  })();

  const customerSection = (
    <View style={{ ...cardStyle, paddingHorizontal: 16, paddingVertical: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
        <InitialsAvatar name={quote.customerName} palette={palette} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: palette.faint, fontSize: fs(12) }}>Customer</Text>
          <Text style={{ color: palette.text, fontSize: fs(15), fontWeight: '500' }} numberOfLines={1}>{quote.customerName}</Text>
        </View>
        {quote.customerPhone ? (
          <Pressable accessibilityRole="link" accessibilityLabel={`Call ${quote.customerName}`} onPress={() => { void Linking.openURL(`tel:${quote.customerPhone}`); }} hitSlop={8}>
            <Text style={{ color: palette.limeOnSurface, fontSize: fs(13.5), fontWeight: '600' }}>Call</Text>
          </Pressable>
        ) : null}
      </View>
      {[
        quote.customerPhone ? { key: 'phone', icon: Phone, value: quote.customerPhone } : null,
        quote.customerEmail ? { key: 'email', icon: Mail, value: quote.customerEmail } : null,
      ].filter((row): row is { key: string; icon: typeof Phone; value: string } => Boolean(row)).map((row) => {
        const Icon = row.icon;
        return (
          <View key={row.key} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: palette.hairline }}>
            <Icon size={15} color={palette.faint} strokeWidth={2} style={{ marginTop: 2 }} />
            <Text style={{ flex: 1, color: palette.textSoft, fontSize: fs(14), lineHeight: 20 }} selectable>{row.value}</Text>
          </View>
        );
      })}
    </View>
  );

  const billSection = (
    <View style={{ ...cardStyle, padding: 16, gap: 12 }}>
      <SectionLabel palette={palette}>Bill</SectionLabel>
      {quote.items.map((item) => (
        <View key={item.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: palette.text, fontSize: fs(15) }}>{item.quantity > 1 ? `${item.quantity}× ` : ''}{item.name}</Text>
            {item.quantity > 1 ? <Text style={{ color: palette.faint, fontSize: fs(12.5), marginTop: 2 }}>{formatCurrency(item.unitPrice)} each</Text> : null}
          </View>
          <Text style={{ color: palette.text, fontSize: fs(15), fontWeight: '600', fontVariant: ['tabular-nums'] }}>{formatCurrency(item.unitPrice * item.quantity)}</Text>
        </View>
      ))}
      <View style={{ height: 1, backgroundColor: palette.hairline }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: palette.text, fontSize: fs(16), fontWeight: '600' }}>Total</Text>
        <Text style={{ color: palette.text, fontSize: fs(16), fontWeight: '600', fontVariant: ['tabular-nums'] }}>{formatCurrency(quote.total)}</Text>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: palette.muted, fontSize: fs(15) }}>{quote.depositPercent >= 100 ? 'Pay in full to start' : `Deposit to start · ${quote.depositPercent}%`}</Text>
        <Text style={{ color: palette.limeOnSurface, fontSize: fs(15), fontWeight: '600', fontVariant: ['tabular-nums'] }}>{formatCurrency(quote.depositAmount)}</Text>
      </View>
      {quote.balance > 0 ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: palette.muted, fontSize: fs(15) }}>Balance, before delivery</Text>
          <Text style={{ color: palette.muted, fontSize: fs(15), fontVariant: ['tabular-nums'] }}>{formatCurrency(quote.balance)}</Text>
        </View>
      ) : null}
      <Text style={{ color: palette.faint, fontSize: fs(12.5) }}>Valid until {formatQuoteDate(quote.validUntil)}{quote.readyIn ? ` · Ready in ${quote.readyIn}` : ''}</Text>
      {quote.note ? <Text style={{ color: palette.muted, fontSize: fs(13.5), lineHeight: 20 }}>Note to customer: {quote.note}</Text> : null}
    </View>
  );

  const linkSection = (
    <View style={{ ...cardStyle, padding: 16, gap: 12 }}>
      <SectionLabel palette={palette}>Quote link</SectionLabel>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingLeft: 14, paddingRight: 8, borderRadius: 12, backgroundColor: palette.inset, borderWidth: 1, borderColor: palette.hairline }}>
        <Text style={{ flex: 1, color: palette.textSoft, fontSize: fs(13.5) }} numberOfLines={1} selectable>{quoteLinkLabel(quote.id, linkBusiness)}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Copy link"
          onPress={copyLink}
          style={(state) => ({ height: 32, paddingHorizontal: 10, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: isHovered(state) ? (palette.isDark ? 'rgba(255,255,255,0.14)' : '#E8E8E8') : palette.softFill })}
        >
          {linkCopied ? <Check size={13} color={palette.text} strokeWidth={2.6} /> : <Copy size={13} color={palette.text} strokeWidth={2.2} />}
          <Text style={{ color: palette.text, fontSize: fs(12.5), fontWeight: '600' }}>{linkCopied ? 'Copied' : 'Copy'}</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable accessibilityRole="button" onPress={copyMessage} style={(state) => ({ ...outlineButton(state), flex: 1 })}>
          {messageCopied ? <Check size={15} color={palette.text} strokeWidth={2.6} /> : <MessageCircle size={15} color={palette.text} strokeWidth={2} />}
          <Text style={{ color: palette.text, fontSize: fs(14), fontWeight: '600' }}>{messageCopied ? 'Message copied' : 'Copy message'}</Text>
        </Pressable>
        {canEdit ? (
          <Pressable accessibilityRole="button" onPress={() => router.push(`/quote/new?id=${quote.id}` as never)} style={(state) => ({ ...outlineButton(state), flex: 1 })}>
            <Pencil size={15} color={palette.text} strokeWidth={2} />
            <Text style={{ color: palette.text, fontSize: fs(14), fontWeight: '600' }}>Edit quote</Text>
          </Pressable>
        ) : null}
      </View>
      <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL(publicLink); }} style={{ alignSelf: 'flex-start' }}>
        <Text style={{ color: palette.limeOnSurface, fontSize: fs(13), fontWeight: '600' }}>Preview as customer</Text>
      </Pressable>
    </View>
  );

  const messageSection = (
    <View style={{ ...cardStyle, padding: 16, gap: 10 }}>
      <SectionLabel palette={palette}>Message preview</SectionLabel>
      <Text style={{ color: palette.textSoft, fontSize: fs(14), lineHeight: 21.5 }} selectable>{customerMessage}</Text>
    </View>
  );

  const proofSection = hasProof && status !== 'proof_submitted' ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="View deposit receipt"
      onPress={() => setShowProof(true)}
      style={(state) => ({ ...cardStyle, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: isHovered(state) ? palette.cardHover : palette.card })}
    >
      <Image source={{ uri: quote.proofImageUrl }} style={{ width: 52, height: 52, borderRadius: 10 }} resizeMode="cover" />
      <View style={{ flex: 1 }}>
        <Text style={{ color: palette.text, fontSize: fs(14.5), fontWeight: '600' }}>Deposit receipt</Text>
        <Text style={{ color: palette.faint, fontSize: fs(12.5), marginTop: 2 }}>{quote.submittedAt ? `Uploaded ${formatQuoteTime(quote.submittedAt)}` : 'Tap to view full size'}</Text>
      </View>
      <ChevronRight size={16} color={palette.faint} strokeWidth={2.2} />
    </Pressable>
  ) : null;

  const bankSection = (
    <View style={{ ...cardStyle, padding: 16, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Landmark size={14} color={palette.faint} strokeWidth={2} />
        <SectionLabel palette={palette}>Paid into</SectionLabel>
      </View>
      <View style={{ gap: 2 }}>
        <Text style={{ color: palette.text, fontSize: fs(15), fontWeight: '600' }} numberOfLines={1}>{quote.bankAccount.bankName || 'No bank account'}</Text>
        <Text style={{ color: palette.muted, fontSize: fs(13.5) }} numberOfLines={1} selectable>{quote.bankAccount.accountName} · {quote.bankAccount.accountNumber}</Text>
      </View>
    </View>
  );

  const activityEntries = [...(quote.activity ?? [])].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  const activitySection = (
    <View style={{ ...cardStyle, padding: 16 }}>
      <View style={{ paddingBottom: 12 }}>
        <SectionLabel palette={palette}>Activity</SectionLabel>
      </View>
      {activityEntries.length === 0 ? <Text style={{ color: palette.faint, fontSize: fs(13) }}>No activity yet.</Text> : null}
      {activityEntries.map((entry, index) => {
        const isLatest = index === activityEntries.length - 1;
        return (
          <View key={entry.id} style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ width: 12, alignItems: 'center' }}>
              <View style={{ width: 9, height: 9, borderRadius: 4.5, marginTop: 5, backgroundColor: isLatest ? palette.text : palette.isDark ? '#5D5E56' : '#CFCFCF' }} />
              {!isLatest ? <View style={{ width: 1.5, flex: 1, marginVertical: 4, backgroundColor: palette.hairline }} /> : null}
            </View>
            <View style={{ flex: 1, gap: 2, paddingBottom: isLatest ? 0 : 14 }}>
              <Text style={{ color: palette.text, fontSize: fs(14), fontWeight: '500' }}>{entry.text}</Text>
              <Text style={{ color: palette.faint, fontSize: fs(12.5) }}>{formatQuoteTime(entry.at)}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );

  const moreActions = [
    { key: 'copy-link', label: 'Copy link', icon: Copy, onPress: () => { void copyLink(); } },
    { key: 'copy-message', label: 'Copy message', icon: MessageCircle, onPress: () => { void copyMessage(); } },
    canMessage ? { key: 'whatsapp', label: 'Send on WhatsApp', icon: MessageCircle, onPress: sendOnWhatsApp } : null,
    { key: 'preview', label: 'Preview as customer', icon: ExternalLink, onPress: () => { void Linking.openURL(publicLink); } },
    canEdit ? { key: 'edit', label: 'Edit quote', icon: Pencil, onPress: () => router.push(`/quote/new?id=${quote.id}` as never) } : null,
    quote.convertedOrderId ? { key: 'open-order', label: 'Open order', icon: Package, onPress: openOrder } : null,
    canCancel ? { key: 'cancel', label: 'Cancel quote', icon: XCircle, onPress: () => setConfirm('cancel'), tone: 'danger' as const } : null,
  ].filter((action): action is { key: string; label: string; icon: typeof Copy; onPress: () => void; tone?: 'danger' } => Boolean(action));

  const contentGap = 14;

  return (
    <View className="flex-1 flex-row" style={{ backgroundColor: palette.page }}>
      {isDesktop ? <DesktopSidebar /> : null}
      <SafeAreaView className="flex-1" edges={['top']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: isDesktop ? 20 : 16, paddingTop: isDesktop ? 18 : 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: palette.hairline }}>
          <BackButton onPress={goBack} palette={palette} label="Back to payments" />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: palette.text, fontSize: 18, fontWeight: '600' }}>Quote</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Copy quote reference"
              onPress={() => { void Clipboard.setStringAsync(quote.quoteNumber); setRefCopied(true); setTimeout(() => setRefCopied(false), 1600); }}
              style={(state) => ({ flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', maxWidth: '100%', opacity: state.pressed ? 0.6 : 1 })}
            >
              <Text style={{ color: palette.faint, fontSize: 16, letterSpacing: 0.3, flexShrink: 1 }} numberOfLines={1}>{quote.quoteNumber}</Text>
              {refCopied ? <Check size={14} color={palette.text} strokeWidth={2.6} /> : <Copy size={14} color={palette.faint} strokeWidth={2.2} />}
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="More actions"
            onPress={() => setShowMore(true)}
            style={(state) => ({ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: state.pressed || isHovered(state) ? palette.softFill : 'transparent' })}
          >
            <MoreHorizontal size={21} color={palette.text} strokeWidth={2.2} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: isDesktop ? 28 : 20,
            paddingTop: isDesktop ? 26 : 22,
            paddingBottom: 40,
            maxWidth: isDesktop ? 1456 : undefined,
            width: isDesktop ? '100%' : undefined,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {isDesktop ? (
            <View style={{ flexDirection: 'row', gap: 20, alignItems: 'flex-start' }}>
              <View style={{ flex: 1.45, minWidth: 0, gap: contentGap }}>
                {heroSection}
                {reviewSection}
                {orderSection}
                {nextSection}
                {billSection}
                {linkSection}
                {messageSection}
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: contentGap, paddingTop: 4 }}>
                {customerSection}
                {proofSection}
                {bankSection}
                {activitySection}
              </View>
            </View>
          ) : (
            <View style={{ gap: contentGap }}>
              {heroSection}
              {reviewSection}
              {orderSection}
              {nextSection}
              {customerSection}
              {proofSection}
              {billSection}
              {linkSection}
              {messageSection}
              {bankSection}
              {activitySection}
            </View>
          )}
        </ScrollView>

        <Modal visible={showMore} transparent animationType="fade" onRequestClose={() => setShowMore(false)}>
          <Pressable onPress={() => setShowMore(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: isDesktop ? 'center' : 'flex-end', alignItems: 'center' }}>
            <Pressable
              onPress={(event) => event.stopPropagation?.()}
              style={{
                width: '100%',
                maxWidth: isDesktop ? 360 : undefined,
                backgroundColor: palette.card,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                borderBottomLeftRadius: isDesktop ? 24 : 0,
                borderBottomRightRadius: isDesktop ? 24 : 0,
                paddingTop: 10,
                paddingHorizontal: 12,
                paddingBottom: Math.max(insets.bottom, 12) + 8,
                borderWidth: 1,
                borderColor: palette.border,
              }}
            >
              <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: palette.isDark ? 'rgba(255,255,255,0.18)' : '#DDDDDD', marginBottom: 12 }} />
              {moreActions.map((action) => {
                const Icon = action.icon;
                const danger = action.tone === 'danger';
                return (
                  <Pressable
                    key={action.key}
                    accessibilityRole="button"
                    onPress={() => { setShowMore(false); action.onPress(); }}
                    style={(state) => ({ height: 52, borderRadius: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: state.pressed || isHovered(state) ? palette.softFill : 'transparent' })}
                  >
                    <Icon size={18} color={danger ? palette.danger : palette.muted} strokeWidth={2.2} />
                    <Text style={{ color: danger ? palette.danger : palette.text, fontSize: fs(15), fontWeight: '500' }}>{action.label}</Text>
                  </Pressable>
                );
              })}
            </Pressable>
          </Pressable>
        </Modal>

        <Modal visible={showProof} transparent animationType="fade" onRequestClose={() => setShowProof(false)}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 20 }} onPress={() => setShowProof(false)}>
            {hasProof ? <Image source={{ uri: quote.proofImageUrl }} style={{ width: '100%', height: '85%' }} resizeMode="contain" /> : null}
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setShowProof(false)} style={{ position: 'absolute', top: 40, right: 20, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)' }}>
              <X size={18} color="#FFFFFF" strokeWidth={2.4} />
            </Pressable>
          </Pressable>
        </Modal>

        <Modal visible={confirm !== null} transparent animationType="fade" onRequestClose={() => setConfirm(null)}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 }} onPress={() => setConfirm(null)}>
            <Pressable onPress={() => undefined} style={{ width: '100%', maxWidth: 380, borderRadius: 22, padding: 20, gap: 14, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border }}>
              <Text style={{ color: palette.text, fontSize: 17, fontWeight: '700' }}>{confirm === 'reject' ? 'Reject this receipt?' : 'Cancel this quote?'}</Text>
              <Text style={{ color: palette.muted, fontSize: fs(14), lineHeight: 21 }}>
                {confirm === 'reject'
                  ? `${first} will be asked to upload a new screenshot.`
                  : `${first} will no longer be able to accept it. You can still edit and re-send it later.`}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable accessibilityRole="button" onPress={() => setConfirm(null)} style={(state) => ({ ...outlineButton(state, 46), flex: 1 })}>
                  <Text style={{ color: palette.text, fontSize: fs(14.5), fontWeight: '600' }}>Keep</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={async () => {
                    const action = confirm;
                    setConfirm(null);
                    if (action === 'reject') await save('reject', { status: 'proof_rejected', proofImageUrl: undefined }, { text: 'Deposit receipt rejected', tone: 'bad' });
                    if (action === 'cancel') await save('cancel', { status: 'cancelled' }, { text: 'Quote cancelled', tone: 'bad' });
                  }}
                  style={(state) => ({ flex: 1, height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.danger, opacity: state.pressed ? 0.85 : 1 })}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: fs(14.5), fontWeight: '700' }}>{confirm === 'reject' ? 'Reject receipt' : 'Cancel quote'}</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </SafeAreaView>
    </View>
  );
}
