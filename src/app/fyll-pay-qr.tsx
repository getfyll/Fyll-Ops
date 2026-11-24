import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, ActivityIndicator, Platform, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { Check, Landmark } from 'lucide-react-native';
import { BricolageGrotesque_600SemiBold, useFonts } from '@expo-google-fonts/bricolage-grotesque';
import useAuthStore from '@/lib/state/auth-store';
import { supabaseSettings } from '@/lib/supabase/settings';
import { getSocialCheckoutEffectiveStatus, type BankAccount, type SocialCheckoutDraft } from '@/lib/state/fyll-store';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { useBusinessCurrency } from '@/hooks/useBusinessCurrency';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { DESKTOP_PAGE_HEADER_MIN_HEIGHT, usePageHeadingStyle } from '@/lib/page-heading';
import { getPaymentLinkOrigin } from '@/lib/tracking-url';
import { FYLL_PAYMENT_ORIGIN } from '@/lib/tracking-host';
import { buildFyllPayPath } from '@/lib/supabase/fyll-pay-public';
import { fetchSocialCheckoutDrafts, getSocialCheckoutQueryKey } from '@/lib/social-checkout-query';
import { buildQrMatrix, qrSvgString } from '@/lib/qr';
import { QrCodeView } from '@/components/fyll-pay/QrCodeView';
import { PrintCardModal } from '@/components/fyll-pay/PrintCardModal';
import { buildCounterCardHtml, loadAssetDataUrl, type PrintSize, type PrintStyle } from '@/lib/fyll-pay-print';
import { BackButton, FYLL_LIME, FYLL_LIME_INK, getInitials, isHovered, usePaymentsPalette } from '@/components/payments/payments-ui';

// Fyll Pay QR, inside Ops. The QR opens payment.fyll.app/<business>, which shows the account
// chosen here. The bank details are never in the QR itself, so nobody can make a Fyll Pay page
// show a different account by editing a link. Layout follows the "Fyll Pay QR (redesign)" mockup:
// settings on the left, the counter card preview and its actions on the right.

const wordmark = require('../../assets/fyll-wordmark-thick-light.png');
const fieldPrint = require('../../assets/fyll-field-phone.jpg');
const noOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null;

const isToday = (iso?: string) => {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
};
const timeOf = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '');

export default function FyllPayQrScreen() {
  const palette = usePaymentsPalette();
  const { isDesktop, isMobile } = useBreakpoint();
  const pageHeadingStyle = usePageHeadingStyle(isMobile);
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const isAdmin = useAuthStore((s) => (s.currentUser?.role ?? 'staff') === 'admin');
  const currentUserName = useAuthStore((s) => s.currentUser?.name ?? null);
  const { businessName, businessSlug, businessLogo } = useBusinessSettings();
  const { currencySymbol, formatMoney } = useBusinessCurrency();
  const [buttonFontLoaded] = useFonts({ BricolageGrotesque_600SemiBold });
  // App buttons use Bricolage SemiBold; plain semibold until the font is ready.
  const buttonFont = buttonFontLoaded ? { fontFamily: 'BricolageGrotesque_600SemiBold', fontWeight: '400' as const } : { fontWeight: '600' as const };

  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showChooser, setShowChooser] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'error' | 'success'; message: string } | null>(null);
  const [mode, setMode] = useState<'open' | 'fixed'>('open');
  const [fixedText, setFixedText] = useState('');
  const [copied, setCopied] = useState(false);
  const cardRef = useRef<View>(null);

  useEffect(() => {
    if (!businessId) { setIsLoading(false); return; }
    let active = true;
    supabaseSettings
      .fetchSettings<BankAccount>('payment_accounts', businessId)
      .then((rows) => { if (active) setAccounts(rows.map((row) => row.data)); })
      .catch(() => { if (active) setFeedback({ tone: 'error', message: 'Could not load bank accounts.' }); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [businessId]);

  // Shares Payments' cache, so approving a payment there updates this list too.
  const { data: drafts = [] } = useQuery({
    queryKey: getSocialCheckoutQueryKey(businessId),
    queryFn: () => fetchSocialCheckoutDrafts(businessId as string),
    enabled: !!businessId,
  });
  const paidToday = useMemo(() => drafts
    .filter((d: SocialCheckoutDraft) => d.source === 'fyll_pay_qr' && isToday(d.submittedAt ?? d.createdAt))
    .sort((a, b) => (b.submittedAt ?? b.createdAt).localeCompare(a.submittedAt ?? a.createdAt))
    .slice(0, 5), [drafts]);

  const selected = accounts.find((a) => a.fyllPayQr) ?? null;
  const isOn = !!selected;
  const fixedAmount = mode === 'fixed' ? Number(fixedText.replace(/[^0-9.]/g, '')) : 0;
  const url = useMemo(() => {
    if (!businessSlug) return '';
    const origin = getPaymentLinkOrigin();
    return `${origin}${buildFyllPayPath(businessSlug, fixedAmount > 0 ? fixedAmount : null, { onPaymentHost: origin === FYLL_PAYMENT_ORIGIN })}`;
  }, [businessSlug, fixedAmount]);
  const displayUrl = url.replace(/^https?:\/\//, '');
  const amountLabel = mode === 'fixed' && fixedAmount > 0 ? formatMoney(fixedAmount) : 'Any amount';
  const name = businessName || 'Your business';

  const saveAccounts = async (next: BankAccount[], message: string) => {
    if (!businessId || !isAdmin) return;
    setIsSaving(true);
    setFeedback(null);
    try {
      await supabaseSettings.upsertSettings('payment_accounts', businessId, next, currentUserName);
      setAccounts(next);
      setShowChooser(false);
      setFeedback({ tone: 'success', message });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    } catch {
      setFeedback({ tone: 'error', message: 'Could not save. Check your connection and try again.' });
    } finally {
      setIsSaving(false);
    }
  };
  const chooseAccount = (id: string) => saveAccounts(accounts.map((a) => ({ ...a, fyllPayQr: a.id === id })), 'Fyll Pay is on. Customers who scan will see this account.');
  const turnOff = () => saveAccounts(accounts.map((a) => ({ ...a, fyllPayQr: false })), 'Fyll Pay is off. Scanning the QR now shows that payments are not available.');
  const flip = () => {
    if (!isAdmin || isSaving) return;
    if (isOn) { turnOff(); return; }
    if (accounts.length === 0) { router.push('/payment-accounts' as never); return; }
    if (accounts.length === 1) { chooseAccount(accounts[0].id); return; }
    setShowChooser(true);
  };

  const copyLink = async () => {
    if (!url) return;
    await Clipboard.setStringAsync(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const saveImage = async () => {
    if (!url) return;
    try {
      if (Platform.OS === 'web') {
        // Same card as the preview: QR, "Scan to pay", business name, amount, tiny "Powered by Fyll".
        const matrix = buildQrMatrix(url, 'M');
        const modules = matrix.length + 8;
        const ppm = Math.max(16, Math.ceil(720 / modules));
        const qrPx = modules * ppm;
        const svg = qrSvgString(matrix, '#141414', ppm);
        const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
          const im = new window.Image();
          im.onload = () => resolve(im);
          im.onerror = () => reject(new Error('img'));
          im.src = src;
        });
        const blobUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
        const qrImg = await loadImage(blobUrl);
        URL.revokeObjectURL(blobUrl);
        const scale = qrPx / 196;
        const showAmount = mode === 'fixed' && fixedAmount > 0;
        const pad = Math.round(28 * scale);
        const lines = [
          { text: 'Scan to pay', font: `600 ${Math.round(13 * scale)}px "Public Sans", system-ui, sans-serif`, color: '#6B6E62', gap: Math.round(10 * scale) },
          { text: name, font: `800 ${Math.round(17 * scale)}px "Public Sans", system-ui, sans-serif`, color: '#141414', gap: Math.round(4 * scale) },
          ...(showAmount ? [{ text: amountLabel, font: `700 ${Math.round(15 * scale)}px "Public Sans", system-ui, sans-serif`, color: '#141414', gap: Math.round(4 * scale) }] : []),
          { text: 'Powered by Fyll', font: `500 ${Math.round(9.5 * scale)}px "Public Sans", system-ui, sans-serif`, color: '#8B8E82', gap: Math.round(10 * scale) },
        ];
        const lineHeights = lines.map((l) => Math.round(parseInt(l.font.split(' ')[1], 10) * 1.3));
        const textHeight = lines.reduce((sum, l, i) => sum + l.gap + lineHeights[i], 0);
        const canvas = document.createElement('canvas');
        canvas.width = qrPx + pad * 2;
        canvas.height = pad + qrPx + textHeight + pad;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('canvas');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(qrImg, pad, pad, qrPx, qrPx);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        let y = pad + qrPx;
        lines.forEach((l, i) => {
          y += l.gap;
          ctx.font = l.font;
          ctx.fillStyle = l.color;
          ctx.fillText(l.text, canvas.width / 2, y, canvas.width - pad * 2);
          y += lineHeights[i];
        });
        const a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = `${businessSlug || 'fyll'}-fyll-pay-qr.png`;
        a.click();
      } else {
        const uri = await captureRef(cardRef, { format: 'png', quality: 1 });
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Save your Fyll Pay QR' });
      }
    } catch {
      setFeedback({ tone: 'error', message: 'Could not save the image. Try again.' });
    }
  };

  const [printOpen, setPrintOpen] = useState(false);

  const printCard = async ({ size, style }: { size: PrintSize; style: PrintStyle }) => {
    if (!url) return;
    // On web the print tab has to open straight from the click, or the browser blocks it.
    const w = Platform.OS === 'web' ? window.open('', '_blank') : null;
    if (Platform.OS === 'web' && !w) { setFeedback({ tone: 'error', message: 'Allow pop-ups for Fyll to print the counter card.' }); return; }
    if (w) w.document.write('<p style="font-family:sans-serif;padding:24px;color:#555">Preparing your Fyll Pay card…</p>');
    try {
      const [fieldDataUrl, wordmarkDataUrl] = await Promise.all([
        style === 'colour' ? loadAssetDataUrl(fieldPrint, 'image/jpeg').catch(() => null) : Promise.resolve(null),
        loadAssetDataUrl(wordmark, 'image/png').catch(() => null),
      ]);
      const html = buildCounterCardHtml({
        size,
        style,
        businessName: name,
        initials: getInitials(name),
        logoUrl: businessLogo,
        amountLabel: mode === 'fixed' && fixedAmount > 0 ? amountLabel : null,
        bankName: selected?.bankName ?? '',
        accountNumber: selected?.accountNumber ?? '',
        accountName: selected?.accountName ?? '',
        displayUrl,
        qrSvg: qrSvgString(buildQrMatrix(url, 'M'), '#141414', 16),
        fieldDataUrl,
        wordmarkDataUrl,
        autoPrint: !!w,
      });
      if (w) {
        w.document.open();
        w.document.write(html);
        w.document.close();
      } else {
        await Print.printAsync({ html });
      }
      setPrintOpen(false);
    } catch {
      if (w) w.close();
      setFeedback({ tone: 'error', message: 'Could not open printing. Try again.' });
    }
  };

  const card = { borderRadius: 20, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border };
  const cap = { fontSize: 12, fontWeight: '600' as const, letterSpacing: 0.6, textTransform: 'uppercase' as const, color: palette.faint };
  const linkText = { fontSize: 13.5, fontWeight: '600' as const, color: palette.limeOnSurface };
  const statusInk = (d: SocialCheckoutDraft) => {
    const s = getSocialCheckoutEffectiveStatus(d);
    if (s === 'verified') return { label: 'Verified', ink: palette.isDark ? '#B9C46A' : '#0B7A55' };
    if (s === 'rejected') return { label: 'Rejected', ink: palette.danger };
    return { label: 'Needs review', ink: palette.limeOnSurface };
  };

  /* ---------- left column ---------- */
  const moneyCard = (
    <View style={[card, { padding: 20, gap: 14 }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={cap}>Money goes to</Text>
        {isAdmin && accounts.length > 1 ? (
          <Pressable onPress={() => setShowChooser((v) => !v)} accessibilityRole="button" hitSlop={6}>
            <Text style={linkText}>{showChooser ? 'Done' : 'Change account'}</Text>
          </Pressable>
        ) : null}
      </View>
      {selected && !showChooser ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: palette.avatarBg, alignItems: 'center', justifyContent: 'center' }}>
            <Landmark size={20} color={palette.avatarText} strokeWidth={2} />
          </View>
          <View style={{ flexShrink: 1, gap: 2 }}>
            <Text style={{ color: palette.text, fontSize: 20, fontWeight: '700', letterSpacing: 0.3 }}>{selected.bankName} · {selected.accountNumber}</Text>
            <Text style={{ color: palette.faint, fontSize: 13.5 }}>{selected.accountName}</Text>
          </View>
        </View>
      ) : null}
      {(showChooser || (!selected && accounts.length > 0)) ? (
        <View style={{ gap: 8 }}>
          {accounts.map((a) => {
            const active = a.id === selected?.id;
            return (
              <Pressable
                key={a.id}
                onPress={() => chooseAccount(a.id)}
                disabled={!isAdmin || isSaving || active}
                accessibilityRole="radio"
                accessibilityState={{ checked: active, disabled: !isAdmin }}
                style={(state) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: active ? FYLL_LIME : palette.border, backgroundColor: active ? palette.nudgeBg : isHovered(state) ? palette.cardHover : 'transparent' })}
              >
                <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: active ? palette.text : palette.outline, alignItems: 'center', justifyContent: 'center' }}>
                  {active ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: palette.text }} /> : null}
                </View>
                <View style={{ flexShrink: 1, gap: 1 }}>
                  <Text style={{ color: palette.text, fontSize: 15, fontWeight: '700' }}>{a.bankName} · {a.accountNumber}</Text>
                  <Text style={{ color: palette.faint, fontSize: 13 }}>{a.accountName}</Text>
                </View>
              </Pressable>
            );
          })}
          {!selected ? <Text style={{ color: palette.faint, fontSize: 13 }}>{isAdmin ? 'Choose the account customers pay into to turn on Fyll Pay.' : 'Ask an admin to turn on Fyll Pay.'}</Text> : null}
        </View>
      ) : null}
      {accounts.length === 0 && !isLoading ? (
        <View style={{ gap: 10 }}>
          <Text style={{ color: palette.textSoft, fontSize: 14 }}>Add a bank account first. Fyll Pay shows customers one of your saved accounts.</Text>
          {isAdmin ? (
            <Pressable onPress={() => router.push('/payment-accounts' as never)} accessibilityRole="button" style={{ alignSelf: 'flex-start', height: 44, paddingHorizontal: 18, borderRadius: 999, backgroundColor: palette.inverseBg, justifyContent: 'center' }}>
              <Text style={[{ color: palette.inverseText, fontSize: 14 }, buttonFont]}>Add bank account</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {selected ? <Text style={{ color: palette.faint, fontSize: 12.5 }}>Changing this updates every QR you've already printed.</Text> : null}
    </View>
  );

  const amountCard = (
    <View style={[card, { padding: 20, gap: 14 }]}>
      <Text style={cap}>Amount</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Amount" style={{ flexDirection: 'row', padding: 4, borderRadius: 999, backgroundColor: palette.inset, borderWidth: 1, borderColor: palette.hairline }}>
        {([['open', 'Customer enters it'], ['fixed', 'Fixed amount']] as const).map(([key, label]) => {
          const active = mode === key;
          return (
            <Pressable key={key} onPress={() => setMode(key)} accessibilityRole="radio" accessibilityState={{ checked: active }} style={{ flex: 1, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? FYLL_LIME : 'transparent' }}>
              <Text style={{ color: active ? FYLL_LIME_INK : palette.muted, fontSize: 13.5, fontWeight: '600' }}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      {mode === 'fixed' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', height: 48, borderRadius: 12, borderWidth: 1, borderColor: palette.outline, backgroundColor: palette.inset, paddingHorizontal: 14, gap: 6 }}>
          <Text style={{ color: palette.faint, fontSize: 16, fontWeight: '600' }}>{currencySymbol}</Text>
          <TextInput value={fixedText} onChangeText={setFixedText} placeholder="0" placeholderTextColor={palette.faint} keyboardType="decimal-pad" accessibilityLabel="Fixed amount" style={[{ flex: 1, color: palette.text, fontSize: 16, fontWeight: '600' }, noOutline]} />
        </View>
      ) : null}
      <Text style={{ color: palette.faint, fontSize: 13 }}>
        {mode === 'open' ? "Customers type what they're paying. Good for a counter or market stall." : 'Every scan asks for this amount. Good for one product or a set price.'}
      </Text>
    </View>
  );

  const recentCard = (
    <View style={[card, { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 10 }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 }}>
        <Text style={cap}>Paid by QR today</Text>
        <Pressable onPress={() => router.push('/payments' as never)} accessibilityRole="link" hitSlop={6}>
          <Text style={linkText}>See all in Payments</Text>
        </Pressable>
      </View>
      {paidToday.length === 0 ? (
        <Text style={{ color: palette.faint, fontSize: 13.5, paddingVertical: 12, borderTopWidth: 1, borderTopColor: palette.hairline }}>No QR payments yet today. They show up here as soon as a customer uploads a receipt.</Text>
      ) : paidToday.map((d) => {
        const st = statusInk(d);
        return (
          <Pressable key={d.id} onPress={() => router.push(`/social-checkout/${d.id}` as never)} accessibilityRole="button" style={(state) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderTopWidth: 1, borderTopColor: palette.hairline, opacity: state.pressed ? 0.8 : 1 })}>
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: palette.avatarBg, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: palette.avatarText, fontSize: 12, fontWeight: '700' }}>{getInitials(d.customerName || 'Customer')}</Text>
            </View>
            <View style={{ flex: 1, gap: 1 }}>
              <Text numberOfLines={1} style={{ color: palette.text, fontSize: 14.5, fontWeight: '500' }}>{d.customerName || 'Customer'}</Text>
              <Text style={{ color: palette.faint, fontSize: 12.5 }}>{timeOf(d.submittedAt ?? d.createdAt)} · receipt uploaded</Text>
            </View>
            <Text style={{ color: palette.text, fontSize: 14.5, fontWeight: '600' }}>{formatMoney(d.amount)}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, width: isDesktop ? 120 : 96, justifyContent: 'flex-end' }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: st.ink }} />
              <Text style={{ color: st.ink, fontSize: 12.5, fontWeight: '600' }}>{st.label}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );

  /* ---------- right column ---------- */
  const previewColumn = (
    <View style={{ gap: 14, opacity: isOn ? 1 : 0.45 }} pointerEvents={isOn ? 'auto' : 'none'}>
      {/* The original Fyll Pay QR card: grey surround, white card, "Scan to pay" stacked over the name. */}
      <View style={{ borderRadius: 24, backgroundColor: palette.isDark ? '#1C1C1C' : '#F3F4EE', padding: 18, alignItems: 'center', gap: 10 }}>
        <View ref={cardRef} collapsable={false} style={{ backgroundColor: '#FFFFFF', borderRadius: 18, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12, alignItems: 'center', gap: 6 }}>
          {url ? <QrCodeView value={url} size={196} accessibilityLabel={`QR code that opens the Fyll Pay page for ${name}`} /> : <View style={{ width: 196, height: 196 }} />}
          <Text style={{ color: '#6B6E62', fontSize: 13, fontWeight: '600' }}>Scan to pay</Text>
          <Text style={{ color: '#141414', fontSize: 17, fontWeight: '800' }}>{name}</Text>
          {mode === 'fixed' && fixedAmount > 0 ? <Text style={{ color: '#141414', fontSize: 15, fontWeight: '700' }}>{amountLabel}</Text> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <Text style={{ color: '#8B8E82', fontSize: 9.5 }}>Powered by</Text>
            <Image source={wordmark} resizeMode="contain" style={{ height: 8, width: 8 * (900 / 493), tintColor: '#8B8E82' }} accessibilityLabel="Fyll" />
          </View>
        </View>
        <Text selectable style={{ color: palette.muted, fontSize: 12 }}>{displayUrl}</Text>
      </View>
      <Pressable onPress={() => setPrintOpen(true)} disabled={!isOn} accessibilityRole="button" style={(state) => ({ height: 52, borderRadius: 999, backgroundColor: FYLL_LIME, alignItems: 'center', justifyContent: 'center', opacity: state.pressed ? 0.85 : 1 })}>
        <Text style={[{ color: FYLL_LIME_INK, fontSize: 15.5 }, buttonFont]}>Print counter card</Text>
      </Pressable>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {[
          { key: 'save', label: 'Save image', onPress: saveImage, icon: null },
          { key: 'copy', label: copied ? 'Copied' : 'Copy link', onPress: copyLink, icon: copied ? <Check size={15} color={palette.text} strokeWidth={2.6} /> : null },
        ].map((b) => (
          <Pressable key={b.key} onPress={b.onPress} disabled={!isOn} accessibilityRole="button" style={(state) => ({ flex: 1, height: 44, borderRadius: 999, borderWidth: 1, borderColor: palette.outline, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, backgroundColor: isHovered(state) ? palette.softFill : 'transparent' })}>
            {b.icon}
            <Text style={[{ color: palette.text, fontSize: 14 }, buttonFont]}>{b.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  // Same page frame as Payments: left-aligned on web desktop, standard heading, same gutters.
  const isWebDesktop = Platform.OS === 'web' && isDesktop;
  const horizontalPadding = isMobile ? 16 : isDesktop ? 28 : 20;
  const contentMaxWidth = isWebDesktop ? 1456 : isDesktop ? 980 : undefined;
  const frame = { paddingHorizontal: horizontalPadding, maxWidth: contentMaxWidth, width: isDesktop ? ('100%' as const) : undefined, alignSelf: isWebDesktop ? ('flex-start' as const) : isDesktop ? ('center' as const) : undefined };

  const toggle = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {!isMobile ? (
        <Text style={{ color: isOn ? palette.limeOnSurface : palette.faint, fontSize: 14, fontWeight: '600' }}>
          {isOn ? 'On · customers can pay' : 'Off · QR shows "not taking payments"'}
        </Text>
      ) : null}
      <Pressable
        onPress={flip}
        disabled={!isAdmin || isSaving || isLoading}
        accessibilityRole="switch"
        accessibilityLabel={isOn ? 'Fyll Pay is on' : 'Fyll Pay is off'}
        accessibilityState={{ checked: isOn, disabled: !isAdmin }}
        style={{ width: 44, height: 26, borderRadius: 999, padding: 3, flexDirection: 'row', justifyContent: isOn ? 'flex-end' : 'flex-start', backgroundColor: isOn ? FYLL_LIME : (palette.isDark ? '#3A3B36' : '#D6D7CF'), opacity: isAdmin ? 1 : 0.6 }}
      >
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: isOn ? '#141414' : '#FFFFFF' }} />
      </Pressable>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: palette.page }}>
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <View
        style={{
          ...frame,
          paddingTop: isWebDesktop ? 28 : 14,
          paddingBottom: 14,
          minHeight: isWebDesktop ? DESKTOP_PAGE_HEADER_MIN_HEIGHT : undefined,
          flexDirection: 'row',
          alignItems: isMobile ? 'center' : 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: isMobile ? 'center' : 'flex-start', gap: 12 }}>
          {!isWebDesktop ? <BackButton palette={palette} onPress={() => (router.canGoBack() ? router.back() : router.replace('/payments' as never))} /> : null}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text accessibilityRole="header" style={{ color: palette.text, ...pageHeadingStyle }} numberOfLines={1}>Fyll Pay QR</Text>
            {!isMobile ? (
              <Text style={{ color: palette.muted, fontSize: 14, lineHeight: 20, marginTop: 4 }}>
                A QR customers scan to pay you by transfer. Every payment lands in Payments for review.
              </Text>
            ) : null}
          </View>
        </View>
        {toggle}
      </View>

      <ScrollView contentContainerStyle={{ ...frame, paddingTop: 4, paddingBottom: 48, gap: 16 }}>
        {feedback ? (
          <Text accessibilityLiveRegion="polite" style={{ color: feedback.tone === 'error' ? palette.danger : palette.limeOnSurface, fontSize: 13, fontWeight: '600' }}>{feedback.message}</Text>
        ) : null}
        {!isAdmin ? <Text style={{ color: palette.faint, fontSize: 12.5 }}>Only admins can turn Fyll Pay on or off and change the account.</Text> : null}

        {isLoading ? <ActivityIndicator color={palette.text} style={{ marginTop: 40 }} /> : isDesktop ? (
          <View style={{ flexDirection: 'row', gap: 20, alignItems: 'flex-start' }}>
            <View style={{ flex: 1, minWidth: 0, gap: 16, opacity: isOn || showChooser || !selected ? 1 : 0.45 }}>
              {moneyCard}{amountCard}{recentCard}
            </View>
            <View style={{ width: 420 }}>{previewColumn}</View>
          </View>
        ) : (
          <View style={{ gap: 16 }}>
            {moneyCard}{previewColumn}{amountCard}{recentCard}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
    <PrintCardModal visible={printOpen} onClose={() => setPrintOpen(false)} onPrint={printCard} buttonFont={buttonFont} />
    </View>
  );
}
