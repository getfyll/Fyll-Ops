import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, Lock, Plus, Search, X } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import useAuthStore from '@/lib/state/auth-store';
import useFyllStore, { formatCurrency, type BankAccount } from '@/lib/state/fyll-store';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { supabaseSettings } from '@/lib/supabase/settings';
import { generateCheckoutCode } from '@/lib/generateCheckoutCode';
import { normalizeProductType } from '@/lib/product-utils';
import { ResolvedAttachmentImage } from '@/components/ResolvedAttachmentImage';
import { QuoteScreenFrame } from '@/components/quotes/QuoteScreenFrame';
import { FYLL_LIME, FYLL_LIME_HOVER, FYLL_LIME_INK, MoneyText, SectionLabel, isHovered, useMobileFont, usePaymentsPalette } from '@/components/payments/payments-ui';
import { SearchClearButton } from '@/components/SearchClearButton';
import {
  DEFAULT_QUOTE_VALID_DAYS,
  QUOTE_DEPOSIT_OPTIONS,
  buildQuoteMessage,
  buildQuoteUrl,
  buildWhatsAppUrl,
  computeQuoteTotals,
  formatQuoteDate,
  newQuoteActivity,
  nextQuoteNumber,
  quoteLinkLabel,
  type Quote,
  type QuoteItem,
} from '@/lib/quotes';
import { quotesQueryKey, saveQuote, useQuotes } from '@/lib/quotes-api';

// New quote (and "edit quote" while the customer has not accepted yet): who it is for, what is in
// it, how much they pay to start, and a private cost worksheet. Creating it gives a link to send.

const noWebOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null;
const VALID_DAY_OPTIONS = [7, 14, 30];

const newId = () => Math.random().toString(36).slice(2, 12);
const digits = (value: string) => value.replace(/[^0-9]/g, '');
const numberOr = (value: string, fallback = 0) => Number(digits(value)) || fallback;

const endOfDayIso = (daysFromNow: number) => {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(23, 59, 59, 0);
  return date.toISOString();
};

const sameDay = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString();

type PickerRow = { key: string; productId: string; variantId: string; name: string; price: number; stock: number; imageUrl?: string };

export default function NewQuoteScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const palette = usePaymentsPalette();
  const fs = useMobileFont();
  const { height: windowHeight } = useWindowDimensions();
  const { id: editId } = useLocalSearchParams<{ id?: string }>();
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const currentUser = useAuthStore((s) => s.currentUser);
  const products = useFyllStore((s) => s.products);
  const { businessName, businessSlug } = useBusinessSettings();
  const linkBusiness = { businessName, businessSlug };
  const quotesQuery = useQuotes();
  const existing = editId ? (quotesQuery.data ?? []).find((quote) => quote.id === editId) ?? null : null;

  const [code, setCode] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [depositPercent, setDepositPercent] = useState<number>(50);
  const [validUntil, setValidUntil] = useState<string>(() => endOfDayIso(DEFAULT_QUOTE_VALID_DAYS));
  const [readyIn, setReadyIn] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [costOpen, setCostOpen] = useState<boolean>(false);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [showAdd, setShowAdd] = useState<boolean>(false);
  const [addTab, setAddTab] = useState<'inventory' | 'custom'>('inventory');
  const [search, setSearch] = useState<string>('');
  const [draftName, setDraftName] = useState<string>('');
  const [draftPrice, setDraftPrice] = useState<string>('');
  const [draftCost, setDraftCost] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [created, setCreated] = useState<Quote | null>(null);
  const [linkCopied, setLinkCopied] = useState<boolean>(false);
  const hydrated = useRef<boolean>(false);

  // A fresh link code for a new quote.
  useEffect(() => {
    if (editId) return;
    let cancelled = false;
    void generateCheckoutCode().then((next) => { if (!cancelled) setCode(next); });
    return () => { cancelled = true; };
  }, [editId]);

  // Editing: load the saved quote once.
  useEffect(() => {
    if (!existing || hydrated.current) return;
    hydrated.current = true;
    setCode(existing.id);
    setCustomerName(existing.customerName);
    setCustomerPhone(existing.customerPhone);
    setItems(existing.items);
    setDepositPercent(existing.depositPercent);
    setValidUntil(existing.validUntil);
    setReadyIn(existing.readyIn ?? '');
    setNote(existing.note ?? '');
  }, [existing]);

  useEffect(() => {
    if (!businessId) return;
    void supabaseSettings.fetchSettings<BankAccount>('payment_accounts', businessId).then((rows) => setAccounts(rows.map((row) => row.data)));
  }, [businessId]);

  const bankAccount = accounts.find((account) => account.isDefault) ?? accounts[0] ?? null;
  const totals = useMemo(() => computeQuoteTotals(items, depositPercent), [items, depositPercent]);
  const storeName = businessName?.trim() || 'us';
  const first = customerName.trim().split(/\s+/)[0] || 'there';
  const locked = Boolean(existing && !['sent', 'changes_requested'].includes(existing.status));
  const canCreate = customerName.trim().length > 1 && items.length > 0 && totals.total > 0 && Boolean(bankAccount) && Boolean(code) && !isSaving && !locked;

  const pickerRows = useMemo<PickerRow[]>(() => {
    const query = search.trim().toLowerCase();
    const rows: PickerRow[] = [];
    products.forEach((product) => {
      if (normalizeProductType(product.productType) === 'service' || product.isDiscontinued) return;
      product.variants.forEach((variant) => {
        const label = Object.values(variant.variableValues ?? {}).join(' / ');
        const name = product.variants.length > 1 && label ? `${product.name} · ${label}` : product.name;
        if (query && !name.toLowerCase().includes(query)) return;
        rows.push({ key: `${product.id}:${variant.id}`, productId: product.id, variantId: variant.id, name, price: variant.sellingPrice || 0, stock: variant.stock || 0, imageUrl: variant.imageUrl || product.imageUrl });
      });
    });
    return rows.slice(0, 60);
  }, [products, search]);

  const closeAdd = () => { setShowAdd(false); setSearch(''); setDraftName(''); setDraftPrice(''); setDraftCost(''); };
  const changeQty = (id: string, delta: number) => setItems((prev) => prev.map((item) => (item.id === id ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item)));
  const removeItem = (id: string) => setItems((prev) => prev.filter((item) => item.id !== id));
  const setCost = (id: string, value: string) => setItems((prev) => prev.map((item) => (item.id === id ? { ...item, unitCost: numberOr(value) } : item)));

  const addFromInventory = (row: PickerRow) => {
    setItems((prev) => {
      const same = prev.find((item) => item.productId === row.productId && item.variantId === row.variantId && item.unitPrice === row.price);
      if (same) return prev.map((item) => (item.id === same.id ? { ...item, quantity: item.quantity + 1 } : item));
      return [...prev, { id: newId(), name: row.name, quantity: 1, unitPrice: row.price, unitCost: 0, productId: row.productId, variantId: row.variantId, custom: false }];
    });
    closeAdd();
  };

  const addCustom = () => {
    const price = numberOr(draftPrice);
    if (!draftName.trim() || price <= 0) return;
    setItems((prev) => [...prev, { id: newId(), name: draftName.trim(), quantity: 1, unitPrice: price, unitCost: numberOr(draftCost), custom: true }]);
    closeAdd();
  };

  const handleSave = async () => {
    if (!canCreate || !businessId || !bankAccount) return;
    setIsSaving(true);
    setError('');
    try {
      const now = new Date().toISOString();
      // Tapping "Edit quote" after creating keeps the same quote (and number) rather than making another.
      const current = existing ?? created;
      const base: Quote = current ?? {
        id: code,
        businessId,
        quoteNumber: nextQuoteNumber(quotesQuery.data ?? []),
        status: 'sent',
        customerName: '',
        customerPhone: '',
        items: [],
        total: 0,
        depositPercent: 50,
        depositAmount: 0,
        balance: 0,
        validUntil,
        bankAccount: { bankName: '', accountName: '', accountNumber: '' },
        createdBy: currentUser?.name ?? 'Staff',
        createdByUserId: currentUser?.id ?? '',
        createdAt: now,
        updatedAt: now,
        activity: [newQuoteActivity('Quote created'), newQuoteActivity('Link ready to send')],
      };
      const next: Quote = {
        ...base,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        items,
        total: totals.total,
        depositPercent,
        depositAmount: totals.depositAmount,
        balance: totals.balance,
        validUntil,
        readyIn: readyIn.trim() || undefined,
        note: note.trim() || undefined,
        bankAccount: { bankName: bankAccount.bankName, accountName: bankAccount.accountName, accountNumber: bankAccount.accountNumber },
        // Editing a quote the customer asked changes on puts it back to "sent".
        status: 'sent',
        changesRequest: undefined,
        activity: current ? [...(current.activity ?? []), newQuoteActivity('Quote updated and ready to re-send')] : base.activity,
        updatedAt: now,
      };
      await saveQuote(businessId, next);
      await queryClient.invalidateQueries({ queryKey: quotesQueryKey(businessId) });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCreated(next);
    } catch (saveError) {
      console.warn('Quote save failed:', saveError);
      setError('Could not save this quote. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/payments' as never));
  const cardStyle = { borderRadius: 18, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border } as const;
  const labelStyle = { color: palette.textSoft, fontSize: fs(13), fontWeight: '600' as const };
  const hintStyle = { color: palette.faint, fontSize: fs(12.5) };
  const inputStyle = [{ height: 46, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: palette.outline, backgroundColor: palette.inputBg, color: palette.text, fontSize: fs(15) }, noWebOutline];
  const stepper = { width: 30, height: 30, borderRadius: 15, alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 1, borderColor: palette.outline };
  const limeButton = (state: { pressed: boolean; hovered?: boolean }, height = 50) => ({ height, borderRadius: 999, alignItems: 'center' as const, justifyContent: 'center' as const, flexDirection: 'row' as const, gap: 8, paddingHorizontal: 22, backgroundColor: state.hovered ? FYLL_LIME_HOVER : FYLL_LIME, opacity: state.pressed ? 0.85 : 1 });
  const ghostButton = (state: { pressed: boolean }, height = 46) => ({ height, borderRadius: 999, alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 1, borderColor: palette.outline, paddingHorizontal: 14, opacity: state.pressed ? 0.7 : 1 });

  // ── Created: the shareable result ─────────────────────────────────────────
  if (created) {
    const link = buildQuoteUrl(created.id, linkBusiness);
    const message = buildQuoteMessage(created, storeName, businessSlug);
    return (
      <QuoteScreenFrame title="Quote created" subtitle={`${created.quoteNumber} · ${created.customerName}`} onBack={() => router.replace('/(tabs)/payments' as never)}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: FYLL_LIME }}>
            <Check size={20} color={FYLL_LIME_INK} strokeWidth={3} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: palette.text, fontSize: 20, fontWeight: '700' }}>{existing ? 'Quote updated' : 'Quote ready to send'}</Text>
            <Text style={hintStyle}>Nothing is charged until {first} accepts</Text>
          </View>
        </View>

        <View style={{ borderRadius: 22, backgroundColor: '#F8F8F4', padding: 18, gap: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: '#1E1E1E', fontSize: 14, fontWeight: '700' }}>{storeName}</Text>
            <Text style={{ color: '#5F6A00', fontSize: 12, fontWeight: '700', letterSpacing: 0.6 }}>QUOTE {created.quoteNumber}</Text>
          </View>
          <View style={{ gap: 3 }}>
            <Text style={{ color: '#6B6C63', fontSize: 12.5 }}>For {created.customerName}</Text>
            <MoneyText style={{ color: '#1E1E1E', fontSize: 36, letterSpacing: -1.2 }}>{formatCurrency(created.total)}</MoneyText>
          </View>
          <View style={{ borderTopWidth: 1, borderStyle: 'dashed', borderTopColor: 'rgba(30,30,30,0.22)' }} />
          <View style={{ gap: 8 }}>
            {created.items.map((item) => (
              <View key={item.id} style={{ flexDirection: 'row', gap: 10 }}>
                <Text style={{ minWidth: 26, color: '#6B6C63', fontSize: 13.5 }}>{item.quantity}×</Text>
                <Text style={{ flex: 1, color: '#1E1E1E', fontSize: 13.5 }}>{item.name}</Text>
                <Text style={{ color: '#1E1E1E', fontSize: 13.5, fontWeight: '600' }}>{formatCurrency(item.unitPrice * item.quantity)}</Text>
              </View>
            ))}
          </View>
          <View style={{ borderTopWidth: 1, borderStyle: 'dashed', borderTopColor: 'rgba(30,30,30,0.22)' }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 14, backgroundColor: 'rgba(213,224,87,0.35)' }}>
            <View style={{ gap: 1 }}>
              <Text style={{ color: '#1E1E1E', fontSize: 13.5, fontWeight: '700' }}>{created.depositPercent >= 100 ? 'Pay in full to start' : `Deposit to start · ${created.depositPercent}%`}</Text>
              <Text style={{ color: '#55564E', fontSize: 12 }}>{created.balance > 0 ? `${formatCurrency(created.balance)} balance due before delivery` : 'The order starts once this is verified'}</Text>
            </View>
            <Text style={{ color: '#1E1E1E', fontSize: 19, fontWeight: '800' }}>{formatCurrency(created.depositAmount)}</Text>
          </View>
          <Text style={{ color: '#6B6C63', fontSize: 12 }}>Valid until {formatQuoteDate(created.validUntil)}</Text>
        </View>

        <View style={{ ...cardStyle, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, paddingLeft: 14, paddingRight: 6 }}>
          <Text style={{ flex: 1, color: palette.text, fontSize: fs(14.5) }} numberOfLines={1}>{quoteLinkLabel(created.id, linkBusiness)}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={async () => { await Clipboard.setStringAsync(link); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 1600); }}
            style={{ height: 36, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: linkCopied ? FYLL_LIME : palette.softFill }}
          >
            <Text style={{ color: linkCopied ? FYLL_LIME_INK : palette.text, fontSize: fs(13), fontWeight: '600' }}>{linkCopied ? 'Copied' : 'Copy'}</Text>
          </Pressable>
        </View>

        <View style={{ gap: 6 }}>
          <SectionLabel palette={palette}>What happens next</SectionLabel>
          <Text style={{ color: palette.muted, fontSize: fs(13.5), lineHeight: 22 }}>
            {first} opens the link, accepts or asks for changes, then pays the deposit and uploads a screenshot. You verify it and the order is created.
          </Text>
        </View>

        <View style={{ gap: 8 }}>
          <Pressable accessibilityRole="button" onPress={() => { void Linking.openURL(buildWhatsAppUrl(created.customerPhone, message)); }} style={(state) => limeButton({ pressed: state.pressed, hovered: isHovered(state) })}>
            <Text style={{ color: FYLL_LIME_INK, fontSize: 15, fontWeight: '700' }}>Send on WhatsApp</Text>
          </Pressable>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable accessibilityRole="button" onPress={() => { void Linking.openURL(link); }} style={(state) => ({ ...ghostButton(state), flex: 1 })}>
              <Text style={{ color: palette.text, fontSize: fs(14), fontWeight: '600' }}>Preview as customer</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => router.replace(`/quote/${created.id}` as never)} style={(state) => ({ ...ghostButton(state), flex: 1 })}>
              <Text style={{ color: palette.text, fontSize: fs(14), fontWeight: '600' }}>View quote</Text>
            </Pressable>
          </View>
          <Pressable accessibilityRole="button" onPress={() => setCreated(null)} style={{ height: 36, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: palette.faint, fontSize: fs(13.5), fontWeight: '600' }}>Edit quote</Text>
          </Pressable>
        </View>
      </QuoteScreenFrame>
    );
  }

  if (editId && quotesQuery.isLoading) {
    return (
      <QuoteScreenFrame title="Edit quote" onBack={goBack}>
        <ActivityIndicator color={palette.text} />
      </QuoteScreenFrame>
    );
  }

  if (editId && !existing) {
    return (
      <QuoteScreenFrame title="Quote not found" onBack={goBack}>
        <Text style={{ color: palette.muted, fontSize: fs(14) }}>This quote no longer exists.</Text>
      </QuoteScreenFrame>
    );
  }

  // ── The form ──────────────────────────────────────────────────────────────
  return (
    <QuoteScreenFrame
      title={existing ? 'Edit quote' : 'New quote'}
      subtitle={existing ? `${existing.quoteNumber} · ${existing.customerName}` : 'A price for approval, before any order'}
      onBack={goBack}
      footer={(
        <>
          {error ? <Text style={{ color: palette.danger, fontSize: fs(13), textAlign: 'center' }}>{error}</Text> : null}
          <Pressable
            accessibilityRole="button"
            onPress={handleSave}
            disabled={!canCreate}
            style={(state) => ({ ...limeButton({ pressed: state.pressed, hovered: isHovered(state) }), opacity: canCreate ? (state.pressed ? 0.85 : 1) : 0.45 })}
          >
            {isSaving ? <ActivityIndicator color={FYLL_LIME_INK} /> : null}
            <Text style={{ color: FYLL_LIME_INK, fontSize: 15, fontWeight: '700' }}>
              {existing ? 'Save and re-send' : 'Create quote'}{totals.total > 0 ? ` · ${formatCurrency(totals.total)}` : ''}
            </Text>
          </Pressable>
          <Text style={{ ...hintStyle, textAlign: 'center' }}>You can edit it until the customer accepts</Text>
        </>
      )}
    >
      {locked ? (
        <View style={{ padding: 14, borderRadius: 14, backgroundColor: palette.warnBg, borderWidth: 1, borderColor: palette.warnBorder }}>
          <Text style={{ color: palette.warn, fontSize: fs(13.5), lineHeight: 20 }}>The customer has already accepted this quote, so it can no longer be edited.</Text>
        </View>
      ) : null}

      {existing?.changesRequest ? (
        <View style={{ padding: 14, borderRadius: 14, gap: 4, backgroundColor: palette.warnBg, borderWidth: 1, borderColor: palette.warnBorder }}>
          <Text style={{ color: palette.warn, fontSize: fs(13.5), fontWeight: '700' }}>{first} asked for changes</Text>
          {existing.changesRequest.message ? <Text style={{ color: palette.textSoft, fontSize: fs(13.5), lineHeight: 20 }}>“{existing.changesRequest.message}”</Text> : null}
        </View>
      ) : null}

      <View style={{ gap: 8 }}>
        <Text style={labelStyle}>Customer</Text>
        <TextInput value={customerName} onChangeText={setCustomerName} placeholder="Customer name" placeholderTextColor={palette.faint} style={inputStyle} accessibilityLabel="Customer name" />
        <TextInput value={customerPhone} onChangeText={setCustomerPhone} placeholder="Phone (for WhatsApp)" placeholderTextColor={palette.faint} keyboardType="phone-pad" style={inputStyle} accessibilityLabel="Customer phone" />
      </View>

      <View style={{ gap: 8 }}>
        <Text style={labelStyle}>What you're quoting</Text>
        <View style={{ ...cardStyle, paddingHorizontal: 14 }}>
          {items.map((item, index) => (
            <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, borderTopWidth: index ? 1 : 0, borderTopColor: palette.hairline }}>
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ color: palette.text, fontSize: fs(14.5), fontWeight: '500', flexShrink: 1 }} numberOfLines={1}>{item.name}</Text>
                  {item.custom ? (
                    <View style={{ height: 18, paddingHorizontal: 7, borderRadius: 999, justifyContent: 'center', backgroundColor: palette.nudgeBg }}>
                      <Text style={{ color: palette.limeOnSurface, fontSize: 10.5, fontWeight: '700' }}>Custom</Text>
                    </View>
                  ) : null}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={hintStyle}>{formatCurrency(item.unitPrice)} each ·</Text>
                  <Pressable accessibilityRole="button" onPress={() => removeItem(item.id)}>
                    <Text style={{ ...hintStyle, textDecorationLine: 'underline' }}>Remove</Text>
                  </Pressable>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Pressable accessibilityRole="button" accessibilityLabel="Fewer" onPress={() => changeQty(item.id, -1)} style={stepper}><Text style={{ color: palette.text, fontSize: 16 }}>−</Text></Pressable>
                <Text style={{ minWidth: 22, textAlign: 'center', color: palette.text, fontSize: fs(15), fontWeight: '600' }}>{item.quantity}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="More" onPress={() => changeQty(item.id, 1)} style={stepper}><Text style={{ color: palette.text, fontSize: 16 }}>+</Text></Pressable>
              </View>
              <Text style={{ minWidth: 74, textAlign: 'right', color: palette.text, fontSize: fs(14.5), fontWeight: '600' }}>{formatCurrency(item.unitPrice * item.quantity)}</Text>
            </View>
          ))}
          {items.length === 0 ? <Text style={{ ...hintStyle, paddingVertical: 16 }}>Nothing added yet. Add items from your inventory, or a custom piece.</Text> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderTopWidth: 1, borderTopColor: palette.hairline }}>
            <Text style={{ color: palette.text, fontSize: fs(14), fontWeight: '600' }}>Quote total</Text>
            <MoneyText style={{ color: palette.text, fontSize: 22, letterSpacing: -0.4 }}>{formatCurrency(totals.total)}</MoneyText>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => setShowAdd(true)}
          style={(state) => ({ height: 44, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: palette.outline, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: isHovered(state) ? palette.softFill : 'transparent' })}
        >
          <Plus size={16} color={palette.textSoft} strokeWidth={2.4} />
          <Text style={{ color: palette.textSoft, fontSize: fs(14), fontWeight: '600' }}>Add item</Text>
          <Text style={hintStyle}>From inventory or custom</Text>
        </Pressable>
      </View>

      <View style={{ gap: 10 }}>
        <Text style={labelStyle}>Customer pays to start</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {QUOTE_DEPOSIT_OPTIONS.map((percent) => {
            const on = depositPercent === percent;
            return (
              <Pressable
                key={percent}
                accessibilityRole="button"
                onPress={() => setDepositPercent(percent)}
                style={{ flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: on ? palette.inverseBg : palette.outline, backgroundColor: on ? palette.inverseBg : 'transparent' }}
              >
                <Text style={{ color: on ? palette.inverseText : palette.textSoft, fontSize: fs(14.5), fontWeight: '600' }}>{percent === 100 ? 'Full' : `${percent}%`}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={{ padding: 14, borderRadius: 14, gap: 3, backgroundColor: palette.nudgeBg, borderWidth: 1, borderColor: palette.nudgeBorder }}>
          <Text style={{ color: palette.nudgeSub, fontSize: fs(12.5) }}>{depositPercent >= 100 ? 'Customer pays in full' : 'Customer pays as deposit'}</Text>
          <MoneyText style={{ color: palette.limeOnSurface, fontSize: 22 }}>{formatCurrency(totals.depositAmount)}</MoneyText>
          <Text style={hintStyle}>{depositPercent >= 100 ? 'The order starts once this is verified' : `${formatCurrency(totals.balance)} balance due before delivery`}</Text>
        </View>
        {!bankAccount ? (
          <Pressable accessibilityRole="button" onPress={() => router.push('/payment-accounts' as never)} style={{ padding: 14, borderRadius: 14, backgroundColor: palette.warnBg, borderWidth: 1, borderColor: palette.warnBorder }}>
            <Text style={{ color: palette.warn, fontSize: fs(13.5), lineHeight: 20 }}>Add a bank account in Payment accounts first, so the customer knows where to pay. Tap to add one.</Text>
          </Pressable>
        ) : (
          <Text style={hintStyle}>Paid into {bankAccount.bankName} · {bankAccount.accountNumber}</Text>
        )}
      </View>

      <View style={{ gap: 8 }}>
        <Text style={labelStyle}>Valid until</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {VALID_DAY_OPTIONS.map((days) => {
            const on = sameDay(validUntil, endOfDayIso(days));
            return (
              <Pressable
                key={days}
                accessibilityRole="button"
                onPress={() => setValidUntil(endOfDayIso(days))}
                style={{ flex: 1, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: on ? palette.inverseBg : palette.outline, backgroundColor: on ? palette.inverseBg : 'transparent' }}
              >
                <Text style={{ color: on ? palette.inverseText : palette.textSoft, fontSize: fs(13.5), fontWeight: '600' }}>{days} days</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={hintStyle}>Valid until {formatQuoteDate(validUntil)}</Text>
        <Text style={{ ...labelStyle, marginTop: 8 }}>Ready in (optional)</Text>
        <TextInput value={readyIn} onChangeText={setReadyIn} placeholder="e.g. 10 working days" placeholderTextColor={palette.faint} style={inputStyle} accessibilityLabel="Ready in" />
        <Text style={{ ...labelStyle, marginTop: 8 }}>Note to customer</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          multiline
          numberOfLines={3}
          placeholder="e.g. Initials engraved on the temple."
          placeholderTextColor={palette.faint}
          style={[inputStyle, { height: undefined, minHeight: 84, paddingTop: 12, textAlignVertical: 'top', lineHeight: 22 }]}
          accessibilityLabel="Note to customer"
        />
      </View>

      <View style={{ gap: 8 }}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setCostOpen((open) => !open)}
          style={(state) => ({ ...cardStyle, height: 52, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: isHovered(state) ? palette.cardHover : palette.card })}
        >
          <Lock size={16} color={palette.faint} strokeWidth={2} />
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={{ color: palette.text, fontSize: fs(14), fontWeight: '600' }}>Cost worksheet</Text>
            <Text style={hintStyle}>Only you see this · margin {formatCurrency(totals.margin)} ({totals.marginPercent}%)</Text>
          </View>
          <ChevronDown size={16} color={palette.faint} strokeWidth={2.2} style={{ transform: [{ rotate: costOpen ? '180deg' : '0deg' }] }} />
        </Pressable>
        {costOpen ? (
          <View style={cardStyle}>
            {items.map((item, index) => (
              <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: index ? 1 : 0, borderTopColor: palette.hairline }}>
                <Text style={{ flex: 1, color: palette.textSoft, fontSize: fs(14) }} numberOfLines={1}>{item.name} ×{item.quantity}</Text>
                <TextInput
                  value={item.unitCost ? String(item.unitCost) : ''}
                  onChangeText={(value) => setCost(item.id, value)}
                  placeholder="Cost each"
                  placeholderTextColor={palette.faint}
                  keyboardType="numeric"
                  style={[{ width: 110, height: 38, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: palette.outline, backgroundColor: palette.inputBg, color: palette.text, fontSize: fs(14), textAlign: 'right' }, noWebOutline]}
                />
              </View>
            ))}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: palette.hairline }}>
              <Text style={{ color: palette.text, fontSize: fs(14), fontWeight: '700' }}>Your cost</Text>
              <Text style={{ color: palette.text, fontSize: fs(14), fontWeight: '700' }}>{formatCurrency(totals.cost)}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: palette.hairline }}>
              <Text style={{ color: palette.limeOnSurface, fontSize: fs(14), fontWeight: '700' }}>Margin</Text>
              <Text style={{ color: palette.limeOnSurface, fontSize: fs(14), fontWeight: '700' }}>{formatCurrency(totals.margin)}</Text>
            </View>
          </View>
        ) : null}
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ ...labelStyle, color: palette.faint }}>Message preview</Text>
        <View style={{ padding: 14, borderRadius: 14, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border }}>
          <Text style={{ color: palette.textSoft, fontSize: fs(13.5), lineHeight: 22 }}>
            Hi {first}, here's your quote from {storeName}: <Text style={{ color: palette.text, fontWeight: '700' }}>{formatCurrency(totals.total)}</Text>. Review it, accept or ask for changes:{' '}
            <Text style={{ color: palette.limeOnSurface }}>{code ? quoteLinkLabel(code, linkBusiness) : '…'}</Text>
          </Text>
        </View>
      </View>

      <Modal visible={showAdd} transparent animationType="fade" onRequestClose={closeAdd}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 16 }} onPress={closeAdd}>
          <Pressable
            onPress={() => undefined}
            style={{ width: '100%', maxWidth: 520, height: Math.min(600, Math.round(windowHeight * 0.8)), borderRadius: 26, backgroundColor: palette.page, borderWidth: 1, borderColor: palette.border, paddingBottom: 20, overflow: 'hidden' }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 20, paddingRight: 14, paddingTop: 14, paddingBottom: 12 }}>
              <Text style={{ color: palette.text, fontSize: 17, fontWeight: '600' }}>Add item</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={closeAdd} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.softFill }}>
                <X size={16} color={palette.text} strokeWidth={2.4} />
              </Pressable>
            </View>
            <View style={{ marginHorizontal: 20, marginBottom: 14, flexDirection: 'row', padding: 3, borderRadius: 12, backgroundColor: palette.segmentBg, borderWidth: 1, borderColor: palette.border }}>
              {(['inventory', 'custom'] as const).map((tab) => (
                <Pressable
                  key={tab}
                  accessibilityRole="button"
                  onPress={() => setAddTab(tab)}
                  style={{ flex: 1, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: addTab === tab ? palette.inverseBg : 'transparent' }}
                >
                  <Text style={{ color: addTab === tab ? palette.inverseText : palette.muted, fontSize: fs(13.5), fontWeight: '600' }}>{tab === 'inventory' ? 'From inventory' : 'Custom item'}</Text>
                </Pressable>
              ))}
            </View>

            {addTab === 'inventory' ? (
              <View style={{ paddingHorizontal: 20, gap: 10, flex: 1, minHeight: 0 }}>
                <View style={{ height: 44, borderRadius: 12, borderWidth: 1, borderColor: palette.outline, backgroundColor: palette.inputBg, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 }}>
                  <Search size={16} color={palette.faint} strokeWidth={2} />
                  <TextInput value={search} onChangeText={setSearch} placeholder="Search your inventory" placeholderTextColor={palette.faint} style={[{ flex: 1, color: palette.text, fontSize: fs(14.5) }, noWebOutline]} />
                  <SearchClearButton visible={Boolean(search)} onPress={() => setSearch('')} />
                </View>
                <ScrollView style={{ ...cardStyle, flex: 1, paddingHorizontal: 14 }} keyboardShouldPersistTaps="handled">
                  {pickerRows.length === 0 ? <Text style={{ ...hintStyle, paddingVertical: 18 }}>No matching products.</Text> : null}
                  {pickerRows.map((row, index) => (
                    <Pressable
                      key={row.key}
                      accessibilityRole="button"
                      onPress={() => addFromInventory(row)}
                      style={(state) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderTopWidth: index ? 1 : 0, borderTopColor: palette.hairline, opacity: state.pressed ? 0.7 : 1 })}
                    >
                      <View style={{ width: 44, height: 44, borderRadius: 12, overflow: 'hidden', backgroundColor: palette.avatarBg }}>
                        <ResolvedAttachmentImage imageUrl={row.imageUrl} style={{ width: 44, height: 44 }} resizeMode="cover" />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ color: palette.text, fontSize: fs(14.5), fontWeight: '500' }} numberOfLines={1}>{row.name}</Text>
                        <Text style={hintStyle}>{row.stock} in stock</Text>
                      </View>
                      <Text style={{ color: palette.text, fontSize: fs(14.5), fontWeight: '600' }}>{formatCurrency(row.price)}</Text>
                      <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.nudgeBg }}>
                        <Plus size={15} color={palette.limeOnSurface} strokeWidth={2.6} />
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : (
              <View style={{ paddingHorizontal: 20, gap: 14 }}>
                <Text style={{ ...hintStyle, lineHeight: 19 }}>For anything not in your inventory: a made-to-order piece, a service, delivery or a one-off. It won't touch your stock.</Text>
                <View style={{ gap: 7 }}>
                  <Text style={labelStyle}>Item name</Text>
                  <TextInput value={draftName} onChangeText={setDraftName} placeholder="e.g. Custom tinted lenses" placeholderTextColor={palette.faint} style={inputStyle} />
                </View>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1, gap: 7 }}>
                    <Text style={labelStyle}>Price each (₦)</Text>
                    <TextInput value={draftPrice} onChangeText={setDraftPrice} placeholder="0" placeholderTextColor={palette.faint} keyboardType="numeric" style={inputStyle} />
                  </View>
                  <View style={{ flex: 1, gap: 7 }}>
                    <Text style={labelStyle}>Your cost (₦)</Text>
                    <TextInput value={draftCost} onChangeText={setDraftCost} placeholder="Optional" placeholderTextColor={palette.faint} keyboardType="numeric" style={inputStyle} />
                  </View>
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={addCustom}
                  disabled={!draftName.trim() || numberOr(draftPrice) <= 0}
                  style={(state) => ({ ...limeButton({ pressed: state.pressed, hovered: isHovered(state) }), opacity: !draftName.trim() || numberOr(draftPrice) <= 0 ? 0.45 : 1 })}
                >
                  <Text style={{ color: FYLL_LIME_INK, fontSize: 15, fontWeight: '700' }}>Add to quote</Text>
                </Pressable>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </QuoteScreenFrame>
  );
}
