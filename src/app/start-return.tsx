import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeftRight, Banknote, Camera, Check, ChevronLeft, MapPin, RefreshCw, Star, X } from 'lucide-react-native';
import { useFonts, BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { TrackLanding, type TrackLandingCopy } from '@/app/track';
import {
  fetchPublicTrackingBusiness,
  lookupPublicOrderTracking,
  type PublicOrderTrackingLookupResult,
  type PublicTrackingBusinessMatch,
} from '@/lib/supabase/public-tracking';
import { submitPublicReturn, type PublicReturnError } from '@/lib/supabase/returns-public';
import { uploadSocialCheckoutProof } from '@/lib/storage-attachments';
import { pickImageSimple } from '@/hooks/useImagePicker';
import { buildCustomerTrackingHostUrl } from '@/lib/tracking-url';
import { formatCurrency, type ReturnReason, type ReturnResolution } from '@/lib/state/fyll-store';

// returns.fyll.app — a customer tells the store something is wrong with an order.
// Same family as track.fyll.app and confirm.fyll.app: the lookup screen is the shared tracking landing,
// then the steps sit on the Fyll Field with a frosted panel (a glass sheet on phones).

const fyllWordmarkPng = require('../../assets/fyllfyll wordmark.png');
const fyllFieldPhone = require('../../assets/fyll-field-phone.jpg');
const fyllFieldDesktop = require('../../assets/fyll-field-desktop.jpg');

const INK = '#1E1E1E';
const LIME = '#D5E057';
const TEXT = '#F4F4EF';
const TEXT_BODY = 'rgba(244,244,239,0.82)';
const TEXT_FAINT = 'rgba(244,244,239,0.62)';
const GLASS_BG = 'rgba(20,20,20,0.42)';
const GLASS_EDGE = 'rgba(255,255,255,0.18)';
const AMBER = '#F5C976';
const DANGER_TEXT = '#FFB4A8';
const DISPLAY_FONT = Platform.OS === 'web' ? "BricolageGrotesque_800ExtraBold, 'Arial Black', sans-serif" : 'BricolageGrotesque_800ExtraBold';
const DISPLAY_FONT_COMPACT = Platform.OS === 'web' ? "BricolageGrotesque_700Bold, 'Arial Black', sans-serif" : 'BricolageGrotesque_700Bold';
const BODY_FONT: string | undefined = Platform.OS === 'web' ? "system-ui, -apple-system, 'Segoe UI', sans-serif" : undefined;
const BLUR = Platform.OS === 'web' ? ({ backdropFilter: 'blur(22px) saturate(140%)', WebkitBackdropFilter: 'blur(22px) saturate(140%)' } as object) : null;
const GLASS_CARD = { borderRadius: 22, backgroundColor: 'rgba(20,20,20,0.45)', borderWidth: 1, borderColor: GLASS_EDGE } as const;

const RETURNS_LANDING_COPY: TrackLandingCopy = {
  tag: 'Returns',
  domain: 'returns.fyll.app',
  headline: 'Something not right?',
  headlineWide: 'Something\nnot right?',
  sub: (businessName) => `Damaged, wrong item or not what you expected? Tell ${businessName ?? 'the store'} in a minute and they'll sort it out.`,
  steps: ['Find your order', "Tell us what's wrong", 'The store replies'],
  formTitle: 'Find your order',
  formSub: (hasBusiness) => (hasBusiness ? "It's on your order email, receipt or delivery label." : 'Pick the store, then your order details.'),
  submit: 'Find my order',
  submitting: 'Finding your order…',
  hint: 'Your order number is in your confirmation email and in the DM from the store.',
  // No headlineFont: the headline and form title use the tracking page's bold Bricolage.
};

const STEPS = ['Find your order', "Tell us what's wrong", 'Choose a fix', 'The store replies'];

const REASONS: { value: ReturnReason; label: string }[] = [
  { value: 'damaged', label: 'Damaged or scratched' },
  { value: 'wrong_item', label: 'Wrong item' },
  { value: 'wrong_size', label: 'Wrong size or fit' },
  { value: 'missing_part', label: 'Missing part' },
  { value: 'changed_mind', label: 'Changed my mind' },
  { value: 'other', label: 'Something else' },
];
const PHOTO_REQUIRED: ReturnReason[] = ['damaged', 'wrong_item', 'missing_part'];

const FIXES: { value: ReturnResolution; label: string; sub: string; Icon: typeof RefreshCw }[] = [
  { value: 'replacement', label: 'Send a replacement', sub: 'Same item, sent again', Icon: RefreshCw },
  { value: 'exchange', label: 'Exchange it', sub: 'Swap for another colour, size or style', Icon: ArrowLeftRight },
  { value: 'refund', label: 'Refund me', sub: 'Money back once the store has checked it', Icon: Banknote },
];

const ERROR_COPY: Record<PublicReturnError | 'upload', string> = {
  not_found: "We couldn't find that order any more. Go back and check the order number and email.",
  no_items: 'Pick at least one item.',
  photo_required: 'Add a photo of the problem so the store can see it.',
  missing_reason: 'Tell us what went wrong.',
  invalid_reason: 'Pick what went wrong.',
  invalid_resolution: 'Pick how you would like it fixed.',
  rate_limited: 'Lots of requests right now. Please try again in a few minutes.',
  upload: "Your photos couldn't be uploaded. Check your connection and try again.",
  unknown: "Something went wrong and your request wasn't sent. Please try again.",
};

type Step = 'problem' | 'fix' | 'done';
type Photo = { uri: string };

const getParam = (value?: string | string[]) => (typeof value === 'string' ? value : Array.isArray(value) ? value[0] ?? '' : '');
const isPaymentLabel = (value?: string) => /checkout|paid|payment/i.test(value ?? '');
const asText = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : '');
const newUploadKey = () => `return-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export default function StartReturnScreen() {
  const params = useLocalSearchParams<{ code?: string | string[]; order_id?: string | string[]; email?: string | string[]; businessSlug?: string | string[] }>();
  const { width } = useWindowDimensions();
  const wide = width >= 1000;
  const [fontsLoaded] = useFonts({ BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold });
  void fontsLoaded;

  const initialCode = getParam(params.code) || getParam(params.order_id);
  const initialEmail = getParam(params.email);
  const routeBusinessSlug = getParam(params.businessSlug);
  const [pickedBusiness, setPickedBusiness] = useState<PublicTrackingBusinessMatch | null>(null);
  const businessSlug = routeBusinessSlug || pickedBusiness?.slug || '';

  const businessQuery = useQuery({
    queryKey: ['public-returns-business', businessSlug],
    queryFn: () => fetchPublicTrackingBusiness(businessSlug),
    enabled: businessSlug.trim().length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const [code, setCode] = useState<string>(initialCode);
  const [email, setEmail] = useState<string>(initialEmail);
  const [lookupFeedback, setLookupFeedback] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [step, setStep] = useState<Step>('problem');
  const [selected, setSelected] = useState<number[]>([]);
  const [reason, setReason] = useState<ReturnReason | null>(null);
  const [otherReason, setOtherReason] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [fix, setFix] = useState<ReturnResolution>('replacement');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const uploadKey = useRef<string>(newUploadKey());

  const lookup = useMutation<PublicOrderTrackingLookupResult | null, Error, { code: string; email: string }>({
    mutationFn: (input) => lookupPublicOrderTracking({ trackingCode: input.code, email: input.email, businessSlug: businessSlug || null }),
    onMutate: () => {
      setLookupFeedback(null);
      setHasSearched(true);
    },
    onSuccess: (result) => {
      const orderItems = result?.order?.items ?? [];
      const usable = orderItems.map((item, index) => ({ item, index })).filter(({ item }) => !isPaymentLabel(item.productName));
      setSelected(usable.length === 1 ? [usable[0].index] : []);
      setStep('problem');
      setError(null);
    },
    onError: () => setLookupFeedback('Returns are temporarily unavailable. Please try again shortly.'),
  });
  const runLookup = lookup.mutate;

  useEffect(() => {
    if (initialCode.trim() && initialEmail.trim()) runLookup({ code: initialCode, email: initialEmail });
  }, [initialCode, initialEmail, runLookup]);

  const result = lookup.data ?? null;
  const order = result?.order ?? null;
  const businessName = result?.businessName?.trim() || businessQuery.data?.businessName?.trim() || pickedBusiness?.name || 'the store';
  const businessLogo = result?.businessLogo ?? businessQuery.data?.businessLogo ?? pickedBusiness?.logo ?? null;
  const orderRef = order?.websiteOrderReference || order?.orderNumber || code.trim().toUpperCase();

  const items = useMemo(() => (order?.items ?? [])
    .map((item, index) => {
      const product = result?.products.find((entry) => entry.id === item.productId);
      const variant = product?.variants?.find((entry) => entry.id === item.variantId);
      const variantName = asText(item.variantName) || asText(variant?.name);
      const name = asText(item.productName) || asText(product?.name) || 'Item';
      // Some single-variant products store the product's URL handle as the variant name; don't show it.
      const squash = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');
      const isHandle = squash(variantName) === squash(name) || /^[a-z0-9]+(-[a-z0-9]+)+$/.test(variantName);
      return {
        index,
        name,
        variantName: isPaymentLabel(variantName) || isHandle ? '' : variantName,
        quantity: Number(item.quantity) || 1,
        price: Number(item.unitPrice) || 0,
        image: [variant?.imageUrl, product?.imageUrl].map(asText).find(Boolean) ?? '',
      };
    })
    .filter((item) => !isPaymentLabel(item.name)), [order, result]);

  const orderDate = order?.orderDate && !Number.isNaN(new Date(order.orderDate).getTime())
    ? new Date(order.orderDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : null;
  const reasonLabel = reason === 'other' ? otherReason.trim() || 'Something else' : REASONS.find((entry) => entry.value === reason)?.label ?? '';
  const pickedItems = items.filter((item) => selected.includes(item.index));
  const pickedTitle = pickedItems.length
    ? `${pickedItems[0].name}${pickedItems[0].variantName ? ` · ${pickedItems[0].variantName}` : ''}${pickedItems.length > 1 ? ` + ${pickedItems.length - 1} more` : ''}`
    : `Order ${orderRef}`;
  const photoRequired = reason ? PHOTO_REQUIRED.includes(reason) : false;

  const submit = useMutation({
    mutationFn: async () => {
      if (!reason) throw new Error('invalid_reason');
      let proofUrls: string[] = [];
      try {
        proofUrls = await Promise.all(photos.map((photo, index) => uploadSocialCheckoutProof({ code: uploadKey.current, uri: photo.uri, fileName: `return-photo-${index + 1}.jpg` }).then((upload) => upload.publicUrl)));
      } catch {
        throw new Error('upload');
      }
      const response = await submitPublicReturn({
        trackingCode: code,
        email,
        businessSlug: result?.businessSlug || businessSlug || null,
        itemIndexes: selected,
        reason,
        otherReason,
        resolution: fix,
        message,
        proofUrls,
      });
      if (!response.ok) throw new Error(response.error);
      return response;
    },
    onMutate: () => setError(null),
    onSuccess: async () => {
      setStep('done');
      try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    },
    onError: (failure: Error) => {
      const key = failure.message as PublicReturnError | 'upload';
      setError(ERROR_COPY[key] ?? ERROR_COPY.unknown);
      if (key === 'photo_required' || key === 'no_items' || key === 'missing_reason') setStep('problem');
    },
  });

  const resetToLookup = () => {
    lookup.reset();
    setHasSearched(false);
    setStep('problem');
    setSelected([]);
    setReason(null);
    setOtherReason('');
    setPhotos([]);
    setFix('replacement');
    setMessage('');
    setError(null);
    submit.reset();
    uploadKey.current = newUploadKey();
  };

  // ---------- Lookup: the shared tracking landing with returns copy ----------
  if (!order) {
    const landingBusiness = routeBusinessSlug
      ? { name: businessQuery.data?.businessName ?? businessName, logo: businessLogo }
      : pickedBusiness ? { name: pickedBusiness.name, logo: pickedBusiness.logo } : null;
    const handleSearch = () => {
      const nextCode = code.trim().toUpperCase();
      const nextEmail = email.trim().toLowerCase();
      if (!nextCode || !nextEmail) {
        setLookupFeedback('Enter your order number and email to continue.');
        setHasSearched(true);
        return;
      }
      runLookup({ code: nextCode, email: nextEmail });
    };
    return (
      <TrackLanding
        business={landingBusiness}
        onChangeBusiness={() => {
          if (!routeBusinessSlug) setPickedBusiness(null);
          else if (Platform.OS === 'web' && typeof window !== 'undefined') window.location.assign('/');
        }}
        onPickBusiness={setPickedBusiness}
        code={code}
        onChangeCode={setCode}
        email={email}
        onChangeEmail={setEmail}
        onSubmit={handleSearch}
        pending={lookup.isPending}
        openingDeepLink={Boolean(initialCode.trim() && initialEmail.trim()) && !hasSearched}
        feedback={lookupFeedback ?? (hasSearched && !lookup.isPending && !order ? 'No order matched that number and email. Check both and try again.' : null)}
        copy={RETURNS_LANDING_COPY}
        sheet
        split
        lockBusiness={Boolean(routeBusinessSlug)}
      />
    );
  }

  // ---------- Steps after the order is found ----------
  const stepIndex = step === 'problem' ? 1 : step === 'fix' ? 2 : 3;
  const firstName = (order.customerName ?? '').trim().split(/\s+/)[0] ?? '';
  const hero = step === 'problem'
    ? { eyebrow: firstName ? `Hi ${firstName}` : 'Order found', headline: 'Sorry about that.', sub: 'Pick the item and tell us what happened. A photo helps a lot.' }
    : step === 'fix'
      ? { eyebrow: pickedTitle, headline: 'Almost done.', sub: `Choose what you'd like. ${businessName} makes the final call.` }
      : { eyebrow: 'Request sent', headline: `We've told ${businessName}.`, sub: "You'll hear back soon. Nothing else to do for now." };

  const continueFromProblem = () => {
    if (!selected.length) return setError(ERROR_COPY.no_items);
    if (!reason) return setError('Pick what went wrong.');
    if (reason === 'other' && !otherReason.trim()) return setError(ERROR_COPY.missing_reason);
    if (photoRequired && photos.length === 0) return setError(ERROR_COPY.photo_required);
    setError(null);
    setStep('fix');
  };

  const addPhoto = async () => {
    const uri = await pickImageSimple();
    if (!uri) return;
    setPhotos((current) => [...current, { uri }].slice(0, 6));
    setError(null);
  };

  const trackUrl = buildCustomerTrackingHostUrl({ businessName, businessSlug: result?.businessSlug || businessSlug || null, trackingCode: code.trim(), email: email.trim() });
  const openUrl = (url: string) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.location.href = url;
    else void Linking.openURL(url).catch(() => undefined);
  };

  const errorNote = error ? (
    <View accessibilityRole="alert" style={{ borderRadius: 16, paddingVertical: 11, paddingHorizontal: 14, backgroundColor: 'rgba(255,122,107,0.16)', borderWidth: 1, borderColor: 'rgba(255,122,107,0.35)' }}>
      <Text style={{ fontFamily: BODY_FONT, fontSize: 13.5, lineHeight: 19, color: DANGER_TEXT }}>{error}</Text>
    </View>
  ) : null;

  const title = (heading: string, sub: string) => (
    <View style={{ gap: 4 }}>
      <Text accessibilityRole="header" style={{ fontWeight: '700', fontSize: wide ? 22 : 20, letterSpacing: -0.4, color: TEXT }}>{heading}</Text>
      <Text style={{ fontFamily: BODY_FONT, fontSize: 14, color: TEXT_FAINT }}>{sub}</Text>
    </View>
  );

  const backLink = (label: string, onPress: () => void) => (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 4 }}>
      <ChevronLeft size={18} color={TEXT_BODY} strokeWidth={2.2} />
      <Text style={{ fontFamily: BODY_FONT, fontWeight: '600', fontSize: 14, color: TEXT_BODY }}>{label}</Text>
    </Pressable>
  );

  const problemStep = (
    <>
      {backLink('Different order', resetToLookup)}
      {title("What's the problem?", `${orderRef}${orderDate ? ` · ordered ${orderDate}` : ''}`)}
      <View style={[GLASS_CARD, { paddingHorizontal: 14, paddingVertical: 4 }]}>
        {items.map((item, i) => {
          const on = selected.includes(item.index);
          return (
            <Pressable
              key={item.index}
              onPress={() => {
                setSelected((current) => (on ? current.filter((x) => x !== item.index) : [...current, item.index]));
                setError(null);
              }}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${item.name}${item.variantName ? `, ${item.variantName}` : ''}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderTopWidth: i ? 1 : 0, borderTopColor: 'rgba(255,255,255,0.1)' }}
            >
              <View style={{ width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: on ? LIME : 'rgba(255,255,255,0.45)', backgroundColor: on ? LIME : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                {on ? <Check size={14} color={INK} strokeWidth={3} /> : null}
              </View>
              <View style={{ width: 52, height: 52, borderRadius: 14, overflow: 'hidden', backgroundColor: '#F2F0EA', alignItems: 'center', justifyContent: 'center' }}>
                {item.image ? (
                  <Image source={{ uri: item.image }} resizeMode="contain" style={{ width: 46, height: 46 }} />
                ) : (
                  <Text style={{ fontWeight: '700', fontSize: 15, color: '#55564E' }}>{item.name.slice(0, 1).toUpperCase()}</Text>
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text numberOfLines={1} style={{ fontFamily: BODY_FONT, fontWeight: '600', fontSize: 15, color: TEXT }}>{item.name}</Text>
                <Text numberOfLines={1} style={{ fontFamily: BODY_FONT, fontSize: 13, color: TEXT_FAINT }}>
                  {[item.variantName, item.quantity > 1 ? `× ${item.quantity}` : '', item.price > 0 ? formatCurrency(item.price) : ''].filter(Boolean).join(' · ') || 'In this order'}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} accessibilityRole="radiogroup">
        {REASONS.map((entry) => {
          const on = reason === entry.value;
          return (
            <Pressable
              key={entry.value}
              onPress={() => {
                setReason(entry.value);
                setError(null);
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              style={({ pressed }) => ({ height: 40, paddingHorizontal: 15, borderRadius: 999, justifyContent: 'center', borderWidth: 1, borderColor: on ? LIME : 'rgba(255,255,255,0.24)', backgroundColor: on ? LIME : pressed ? 'rgba(20,20,20,0.6)' : 'rgba(20,20,20,0.35)' })}
            >
              <Text style={{ fontFamily: BODY_FONT, fontWeight: '600', fontSize: 14, color: on ? INK : TEXT }}>{entry.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {reason === 'other' ? (
        <GlassInput value={otherReason} onChangeText={(value) => { setOtherReason(value); setError(null); }} placeholder="What went wrong?" />
      ) : null}

      <View style={{ gap: 10 }}>
        <Pressable
          onPress={addPhoto}
          disabled={photos.length >= 6}
          accessibilityRole="button"
          style={({ pressed }) => [
            { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1.5, borderColor: photos.length ? 'rgba(213,224,87,0.6)' : 'rgba(255,255,255,0.3)', backgroundColor: pressed ? 'rgba(20,20,20,0.55)' : 'rgba(20,20,20,0.35)' },
            Platform.OS === 'web' && !photos.length ? ({ borderStyle: 'dashed' } as object) : null,
          ]}
        >
          <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: 'rgba(213,224,87,0.28)', alignItems: 'center', justifyContent: 'center' }}>
            <Camera size={20} color={LIME} strokeWidth={2.2} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={{ fontFamily: BODY_FONT, fontWeight: '600', fontSize: 15, color: TEXT }}>
              {photos.length ? `${photos.length} photo${photos.length === 1 ? '' : 's'} added · add more` : 'Add photos'}
            </Text>
            <Text style={{ fontFamily: BODY_FONT, fontSize: 13, color: TEXT_FAINT }}>
              {photoRequired ? 'Needed for this problem, so the store can see it' : 'Photos help the store sort it out faster'}
            </Text>
          </View>
        </Pressable>
        {photos.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {photos.map((photo, index) => (
              <View key={`${index}-${photo.uri.slice(-12)}`} style={{ width: 64, height: 64, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: GLASS_EDGE }}>
                <Image source={{ uri: photo.uri }} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
                <Pressable
                  onPress={() => setPhotos((current) => current.filter((_, i) => i !== index))}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove photo ${index + 1}`}
                  hitSlop={6}
                  style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(20,20,20,0.7)', alignItems: 'center', justifyContent: 'center' }}
                >
                  <X size={13} color="#FFFFFF" strokeWidth={2.6} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      {errorNote}
      <PrimaryButton label="Continue" onPress={continueFromProblem} />
    </>
  );

  const fixStep = (
    <>
      {backLink('Back', () => { setError(null); setStep('problem'); })}
      {title('How should we fix it?', `${pickedTitle} · ${reasonLabel.toLowerCase()}`)}
      <View style={{ gap: 10 }} accessibilityRole="radiogroup">
        {FIXES.map(({ value, label, sub, Icon }) => {
          const on = fix === value;
          return (
            <Pressable
              key={value}
              onPress={() => setFix(value)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1.5, borderColor: on ? LIME : 'rgba(255,255,255,0.18)', backgroundColor: on ? 'rgba(213,224,87,0.12)' : pressed ? 'rgba(20,20,20,0.6)' : 'rgba(20,20,20,0.4)' })}
            >
              <View style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? LIME : 'rgba(255,255,255,0.1)' }}>
                <Icon size={20} color={on ? INK : TEXT} strokeWidth={2.2} />
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={{ fontFamily: BODY_FONT, fontWeight: '700', fontSize: 16, color: TEXT }}>{label}</Text>
                <Text style={{ fontFamily: BODY_FONT, fontSize: 13, color: TEXT_FAINT }}>{sub}</Text>
              </View>
              <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: on ? LIME : 'rgba(255,255,255,0.4)', alignItems: 'center', justifyContent: 'center' }}>
                {on ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: LIME }} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={{ gap: 8 }}>
        <Text style={{ fontFamily: BODY_FONT, fontWeight: '600', fontSize: 13.5, color: TEXT }}>
          Anything else? <Text style={{ fontWeight: '400', color: TEXT_FAINT }}>Optional</Text>
        </Text>
        <GlassInput value={message} onChangeText={setMessage} placeholder="e.g. I noticed it when I opened the box" multiline />
      </View>
      {errorNote}
      <PrimaryButton label={submit.isPending ? 'Sending…' : 'Send request'} onPress={() => submit.mutate()} busy={submit.isPending} />
    </>
  );

  const fixLabel = FIXES.find((entry) => entry.value === fix)?.label ?? '';
  const doneStep = (
    <>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: LIME, alignItems: 'center', justifyContent: 'center', alignSelf: wide ? 'flex-start' : 'center', marginTop: 6, ...(Platform.OS === 'web' ? ({ boxShadow: '0 0 0 12px rgba(213,224,87,0.22)' } as object) : null) }}>
        <Check size={32} color={INK} strokeWidth={2.8} />
      </View>
      <Text style={{ fontFamily: DISPLAY_FONT, fontWeight: '800', fontSize: 32, letterSpacing: -1, color: '#FFFFFF', marginTop: 8, textAlign: wide ? 'left' : 'center' }}>Request sent</Text>
      <Text style={{ fontFamily: BODY_FONT, fontSize: 15, lineHeight: 22, color: TEXT_BODY, textAlign: wide ? 'left' : 'center' }}>
        {businessName} will look at it and reply{order.customerEmail ? ` by email to ${order.customerEmail}` : ''}. Keep the item and its packaging until they do.
      </Text>
      <View style={[GLASS_CARD, { paddingHorizontal: 16, paddingVertical: 2 }]}>
        {[
          { label: 'Request', value: submit.data?.ref ?? '' },
          { label: 'Items', value: pickedTitle },
          { label: 'You asked for', value: fixLabel },
          { label: 'Status', value: 'Waiting for the store', tone: AMBER },
        ].map((row, i) => (
          <View key={row.label} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: 'rgba(255,255,255,0.1)' }}>
            <Text style={{ fontFamily: BODY_FONT, fontSize: 14, color: TEXT_FAINT }}>{row.label}</Text>
            <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: BODY_FONT, fontWeight: '700', fontSize: 14, color: row.tone ?? TEXT, textAlign: 'right' }}>{row.value}</Text>
          </View>
        ))}
      </View>
      {trackUrl ? (
        <Pressable
          onPress={() => openUrl(trackUrl)}
          accessibilityRole="button"
          style={({ pressed }) => ({ height: 52, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', backgroundColor: pressed ? 'rgba(20,20,20,0.6)' : 'rgba(20,20,20,0.45)' })}
        >
          <MapPin size={17} color={TEXT} strokeWidth={2} />
          <Text style={{ fontFamily: BODY_FONT, fontWeight: '600', fontSize: 15, color: TEXT }}>Track my order</Text>
        </Pressable>
      ) : null}
      <Pressable
        onPress={() => openUrl('https://fyll.store')}
        accessibilityRole="link"
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 14, borderRadius: 18, backgroundColor: pressed ? 'rgba(213,224,87,0.26)' : 'rgba(213,224,87,0.16)', borderWidth: 1, borderColor: 'rgba(213,224,87,0.3)' })}
      >
        <Star size={17} color={LIME} strokeWidth={2.2} />
        <Text style={{ flex: 1, fontFamily: BODY_FONT, fontSize: 14, lineHeight: 19, color: TEXT }}>Save your orders and earn points with a free Fyll account.</Text>
        <Text style={{ fontFamily: BODY_FONT, fontWeight: '700', fontSize: 14, color: LIME }}>Join</Text>
      </Pressable>
      <Pressable onPress={resetToLookup} accessibilityRole="button" style={{ alignSelf: 'center', paddingVertical: 6 }}>
        <Text style={{ fontFamily: BODY_FONT, fontWeight: '600', fontSize: 14.5, color: LIME }}>Report another order</Text>
      </Pressable>
    </>
  );

  const body = (
    <View style={{ width: '100%', maxWidth: 480, alignSelf: 'center', gap: 16, flexGrow: wide ? 0 : 1 }}>
      {!wide ? <StepBar current={stepIndex} /> : null}
      {step === 'problem' ? problemStep : step === 'fix' ? fixStep : doneStep}
      {wide ? null : <PoweredBy />}
    </View>
  );

  const header = <BrandHeader wide={wide} businessName={businessName} businessLogo={businessLogo} subline={`Order ${orderRef}`} />;
  const heading = (
    <View style={{ gap: wide ? 12 : 8, maxWidth: wide ? 500 : undefined }}>
      <Text numberOfLines={1} style={{ fontFamily: BODY_FONT, fontWeight: '600', fontSize: wide ? 17 : 15, color: 'rgba(244,244,239,0.9)' }}>{hero.eyebrow}</Text>
      <Text style={{ fontFamily: wide ? DISPLAY_FONT : DISPLAY_FONT_COMPACT, fontWeight: wide ? '800' : '700', fontSize: wide ? 56 : 38, lineHeight: wide ? 58 : 40, letterSpacing: wide ? -1.8 : -1.2, color: '#FFFFFF' }}>{hero.headline}</Text>
      <Text style={{ fontFamily: BODY_FONT, fontSize: wide ? 16 : 14, lineHeight: wide ? 23 : 20, color: 'rgba(244,244,239,0.85)' }}>{hero.sub}</Text>
      {wide ? <StepList current={stepIndex} /> : null}
    </View>
  );

  if (wide) {
    return (
      <ImageBackground source={fyllFieldDesktop} resizeMode="cover" style={{ flex: 1, backgroundColor: '#3F4A08' }}>
        <LinearGradient pointerEvents="none" colors={['rgba(20,20,20,0.3)', 'rgba(20,20,20,0.05)', 'rgba(20,20,20,0.55)']} locations={[0, 0.45, 1]} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        <SafeAreaView edges={['top']} style={{ flex: 1, flexDirection: 'row' }}>
          <View style={{ flex: 1, paddingHorizontal: 56, paddingTop: 40, paddingBottom: 56 }}>
            {header}
            <View style={{ flex: 1, justifyContent: 'flex-end' }}>{heading}</View>
          </View>
          <View style={[{ flex: 1, borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.14)', backgroundColor: GLASS_BG }, BLUR]}>
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 72, paddingTop: 40, paddingBottom: 90 }}>
              {body}
            </ScrollView>
            <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 28 }}>
              <PoweredBy />
            </View>
          </View>
        </SafeAreaView>
      </ImageBackground>
    );
  }

  return (
    <ImageBackground source={fyllFieldPhone} resizeMode="cover" style={{ flex: 1, backgroundColor: '#3F4A08' }}>
      <LinearGradient pointerEvents="none" colors={['rgba(20,20,20,0.25)', 'rgba(20,20,20,0.08)', 'rgba(20,20,20,0.45)']} locations={[0, 0.5, 1]} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView bounces={false} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={{ flexGrow: 1 }}>
          <View style={{ minHeight: 340, paddingHorizontal: 20, paddingTop: 36, paddingBottom: 56, gap: 56, justifyContent: 'space-between' }}>
            {header}
            {heading}
          </View>
          <View style={[{ flexGrow: 1, borderTopLeftRadius: 30, borderTopRightRadius: 30, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.14)', backgroundColor: 'rgba(34,36,26,0.78)', paddingHorizontal: 20, paddingTop: 22, paddingBottom: 34 }, BLUR]}>
            {body}
          </View>
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

function BrandHeader({ wide, businessName, businessLogo, subline }: { wide: boolean; businessName: string; businessLogo: string | null; subline: string }) {
  const [logoFailed, setLogoFailed] = useState(false);
  useEffect(() => setLogoFailed(false), [businessLogo]);
  const size = wide ? 48 : 40;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: wide ? 12 : 10 }}>
        {businessLogo && !logoFailed ? (
          <Image source={{ uri: businessLogo }} onError={() => setLogoFailed(true)} resizeMode="cover" style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: LIME, backgroundColor: '#FFFFFF' }} />
        ) : (
          <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: LIME }}>
            <Text style={{ fontFamily: BODY_FONT, fontWeight: '600', fontSize: 16, color: INK }}>{(businessName.trim()[0] ?? 'F').toUpperCase()}</Text>
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontFamily: BODY_FONT, fontWeight: '600', fontSize: wide ? 17 : 15, color: '#FFFFFF' }}>{businessName}</Text>
          <Text numberOfLines={1} style={{ fontFamily: BODY_FONT, fontSize: wide ? 13 : 12, color: 'rgba(244,244,239,0.75)' }}>{subline}</Text>
        </View>
      </View>
      <View style={{ height: wide ? 34 : 30, paddingHorizontal: wide ? 14 : 12, borderRadius: 999, justifyContent: 'center', backgroundColor: 'rgba(20,20,20,0.35)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' }}>
        <Text style={{ fontFamily: BODY_FONT, fontWeight: '600', fontSize: wide ? 12.5 : 11.5, color: '#EEF2C4' }}>Returns & issues</Text>
      </View>
    </View>
  );
}

// Wide screens: the four steps under the headline, done ones ticked in lime.
function StepList({ current }: { current: number }) {
  return (
    <View style={{ gap: 10, marginTop: 14 }}>
      {STEPS.map((label, i) => {
        const done = i < current;
        const now = i === current;
        return (
          <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, opacity: done || now ? 1 : 0.6 }}>
            <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: done ? LIME : now ? '#FFFFFF' : 'rgba(255,255,255,0.5)', backgroundColor: done ? LIME : now ? '#FFFFFF' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              {done ? <Check size={14} color={INK} strokeWidth={3} /> : <Text style={{ fontWeight: '800', fontSize: 12.5, color: now ? INK : '#FFFFFF' }}>{i + 1}</Text>}
            </View>
            <Text style={{ fontFamily: BODY_FONT, fontSize: 14.5, color: '#FFFFFF' }}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

// Phones: a slim four-part progress bar at the top of the sheet.
function StepBar({ current }: { current: number }) {
  return (
    <View accessibilityLabel={`Step ${Math.min(current + 1, STEPS.length)} of ${STEPS.length}: ${STEPS[current] ?? ''}`} style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {STEPS.map((label, i) => (
          <View key={label} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= current ? LIME : 'rgba(255,255,255,0.18)' }} />
        ))}
      </View>
      <Text style={{ fontFamily: BODY_FONT, fontWeight: '600', fontSize: 12, color: TEXT_FAINT }}>{STEPS[current]}</Text>
    </View>
  );
}

function GlassInput({ value, onChangeText, placeholder, multiline }: { value: string; onChangeText: (value: string) => void; placeholder: string; multiline?: boolean }) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#8C8D84"
      multiline={multiline}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      maxLength={multiline ? 2000 : 300}
      style={[
        { minHeight: multiline ? 96 : 54, paddingHorizontal: 16, paddingVertical: multiline ? 14 : 0, borderRadius: 16, backgroundColor: '#FFFFFF', color: INK, fontFamily: BODY_FONT, fontSize: 16, textAlignVertical: multiline ? 'top' : 'center' },
        Platform.OS === 'web'
          ? ({ outlineStyle: 'none', boxShadow: focused ? '0 0 0 3px rgba(213,224,87,0.6)' : 'none' } as object)
          : { borderWidth: 2, borderColor: focused ? 'rgba(213,224,87,0.8)' : 'transparent' },
      ]}
    />
  );
}

function PrimaryButton({ label, onPress, busy }: { label: string; onPress: () => void; busy?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      style={({ pressed }) => ({ height: 54, borderRadius: 999, flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? '#E1EB6B' : LIME, opacity: busy ? 0.75 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] })}
    >
      {busy ? <ActivityIndicator color={INK} /> : null}
      <Text style={{ fontWeight: '700', fontSize: 16, color: INK }}>{label}</Text>
    </Pressable>
  );
}

function PoweredBy() {
  return (
    <View style={{ marginTop: 'auto', paddingTop: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <Text style={{ fontFamily: BODY_FONT, fontSize: 12.5, color: 'rgba(244,244,239,0.7)' }}>Powered by</Text>
      <Image source={fyllWordmarkPng} accessibilityLabel="Fyll" resizeMode="contain" style={{ width: 15 * (344 / 195), height: 15, tintColor: '#FFFFFF' }} />
    </View>
  );
}
