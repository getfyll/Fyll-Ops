import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Platform, Image } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowRight, Check, Sparkles, AlertCircle, ImagePlus, Plus, X } from 'lucide-react-native';
import { parseOrderFromText, ParsedOrderData } from '@/lib/ai-order-parser';
import { BackButton, FYLL_LIME, FYLL_LIME_HOVER, FYLL_LIME_INK, MoneyText, usePaymentsPalette, type StatusTone } from '@/components/payments/payments-ui';
import { useBreakpoint } from '@/lib/useBreakpoint';
import * as Haptics from 'expo-haptics';
import { FyllAiButton } from '@/components/FyllAiButton';
import useFyllStore, { formatCurrency } from '@/lib/state/fyll-store';
import { normalizeProductType } from '@/lib/product-utils';
import { useImagePicker } from '@/hooks/useImagePicker';

const MAX_ORDER_SCREENSHOTS = 6;

const inferMimeTypeFromUri = (uri: string) => {
  const lowered = uri.toLowerCase();
  if (lowered.endsWith('.jpg') || lowered.endsWith('.jpeg')) return 'image/jpeg';
  if (lowered.endsWith('.png')) return 'image/png';
  if (lowered.endsWith('.webp')) return 'image/webp';
  if (lowered.endsWith('.heic')) return 'image/heic';
  return 'image/jpeg';
};

async function toDataUrlFromImageSource(imageSource: string): Promise<string> {
  if (imageSource.startsWith('data:')) return imageSource;

  if (Platform.OS === 'web') {
    const response = await fetch(imageSource);
    if (!response.ok) throw new Error('Could not read selected screenshot.');
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error('Could not convert screenshot to data URL.'));
      reader.readAsDataURL(blob);
    });
  }

  const base64 = await FileSystem.readAsStringAsync(imageSource, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const mimeType = inferMimeTypeFromUri(imageSource);
  return `data:${mimeType};base64,${base64}`;
}

export default function AIOrderScreen() {
  const router = useRouter();
  const palette = usePaymentsPalette();
  const imagePicker = useImagePicker();
  const { isDesktop } = useBreakpoint();
  const isWebDesktop = Platform.OS === 'web' && isDesktop;
  const products = useFyllStore((s) => s.products);
  const customServices = useFyllStore((s) => s.customServices);

  const [messageText, setMessageText] = useState('');
  const [imageDataUrls, setImageDataUrls] = useState<string[]>([]);
  const [textFocused, setTextFocused] = useState<boolean>(false);
  const [errorText, setErrorText] = useState<string>('');
  const [isParsing, setIsParsing] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedOrderData | null>(null);

  const productCatalogNames = useMemo(() => {
    return products
      .filter((product) => normalizeProductType(product.productType) !== 'service')
      .map((product) => product.name)
      .filter(Boolean);
  }, [products]);

  const serviceCatalogNames = useMemo(() => {
    const serviceProducts = products
      .filter((product) => normalizeProductType(product.productType) === 'service')
      .map((product) => product.name)
      .filter(Boolean);
    const orderServices = customServices
      .map((service) => service.name)
      .filter(Boolean);
    return Array.from(new Set([...serviceProducts, ...orderServices]));
  }, [products, customServices]);

  const handlePickImage = async () => {
    setErrorText('');
    const picked = await imagePicker.pickImage({
      allowsEditing: false,
      quality: 0.85,
    });
    if (!picked) return;

    try {
      const dataUrl = await toDataUrlFromImageSource(picked);
      let hitLimit = false;
      setImageDataUrls((previous) => {
        if (previous.includes(dataUrl)) return previous;
        if (previous.length >= MAX_ORDER_SCREENSHOTS) {
          hitLimit = true;
          return previous;
        }
        return [...previous, dataUrl];
      });

      if (hitLimit) {
        setErrorText(`You can attach up to ${MAX_ORDER_SCREENSHOTS} screenshots for one order.`);
      }
    } catch (error) {
      console.error('Image conversion failed:', error);
      setErrorText('Could not process this screenshot. Please try another one.');
    }
  };

  const handleRemoveImage = (indexToRemove: number) => {
    setImageDataUrls((previous) => previous.filter((_, index) => index !== indexToRemove));
  };

  const handleParse = async () => {
    if (!messageText.trim() && imageDataUrls.length === 0) {
      setErrorText('Paste a message or add a screenshot first.');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsParsing(true);
    setErrorText('');
    setParsedData(null);

    try {
      const result = await parseOrderFromText({
        messageText: messageText.trim() || undefined,
        imageDataUrls: imageDataUrls.length ? imageDataUrls : undefined,
        productCatalogNames,
        serviceCatalogNames,
      });

      if (!result) {
        setErrorText('We could not read an order from that. Add clearer details or another screenshot.');
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setParsedData(result);
      }
    } catch (error: any) {
      console.error('Parse error:', error);
      setErrorText(error?.message || 'An error occurred while parsing the message. Please try again.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleCreateDraft = () => {
    if (!parsedData) return;

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    router.push({
      pathname: '/new-order',
      params: {
        aiParsed: 'true',
        customerName: parsedData.customerName,
        customerPhone: parsedData.customerPhone,
        customerEmail: parsedData.customerEmail,
        deliveryAddress: parsedData.deliveryAddress,
        deliveryState: parsedData.deliveryState,
        deliveryFee: String(parsedData.deliveryFee || ''),
        websiteOrderReference: parsedData.websiteOrderReference || '',
        notes: parsedData.notes,
        items: JSON.stringify(parsedData.items),
        services: JSON.stringify(parsedData.services),
      },
    });
  };

  const confidenceTone: StatusTone = parsedData?.confidence === 'high'
    ? 'verified'
    : parsedData?.confidence === 'medium'
      ? 'awaiting'
      : 'rejected';
  const confidenceTint = palette.tones[confidenceTone];
  const hasInput = messageText.trim().length > 0 || imageDataUrls.length > 0;
  const accent = palette.isDark ? FYLL_LIME : '#B8C43A';
  const cardPad = isWebDesktop ? 20 : 16;

  const detailRows: { label: string; value: string }[] = parsedData ? [
    { label: 'Name', value: parsedData.customerName },
    { label: 'Phone', value: parsedData.customerPhone },
    { label: 'Email', value: parsedData.customerEmail },
    { label: 'State', value: parsedData.deliveryState },
    { label: 'Address', value: parsedData.deliveryAddress },
    { label: 'Order ref', value: parsedData.websiteOrderReference || '' },
  ] : [];

  const lineList = (
    lines: { key: string; qty: number; title: string; sub?: string; price?: number }[],
    empty: string,
  ) => (
    lines.length === 0 ? (
      <Text style={{ color: palette.faint, fontSize: 14 }}>{empty}</Text>
    ) : (
      <View style={{ gap: 8 }}>
        {lines.map((line) => (
          <View key={line.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, backgroundColor: palette.inset, borderWidth: 1, borderColor: palette.hairline }}>
            <View style={{ minWidth: 30, height: 30, paddingHorizontal: 8, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: FYLL_LIME }}>
              <Text style={{ color: FYLL_LIME_INK, fontSize: 12, fontWeight: '600' }}>{line.qty}×</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: palette.text, fontSize: 14, fontWeight: '500' }}>{line.title}</Text>
              {line.sub ? <Text style={{ color: palette.muted, fontSize: 12, marginTop: 2 }}>{line.sub}</Text> : null}
            </View>
            {line.price ? <MoneyText style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>{formatCurrency(line.price * line.qty)}</MoneyText> : null}
          </View>
        ))}
      </View>
    )
  );

  return (
    <View style={{ flex: 1, backgroundColor: palette.page }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: palette.hairline }}>
          <BackButton onPress={() => router.back()} palette={palette} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Sparkles size={16} color={palette.limeOnSurface} strokeWidth={2.2} />
              <Text style={{ color: palette.text, fontSize: 16, fontWeight: '500' }}>Create order with Fyll AI</Text>
            </View>
            <Text style={{ color: palette.muted, fontSize: 12, marginTop: 2 }}>Paste a chat or add screenshots. We'll draft the order.</Text>
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
            gap: 14,
          }}
        >
          <View style={{ borderRadius: 20, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, padding: cardPad, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: FYLL_LIME }}>
                <Text style={{ color: FYLL_LIME_INK, fontSize: 12, fontWeight: '600' }}>1</Text>
              </View>
              <Text style={{ flex: 1, color: palette.text, fontSize: isWebDesktop ? 16 : 14, fontWeight: '500' }}>Paste the order message</Text>
              {messageText ? (
                <Pressable onPress={() => setMessageText('')} hitSlop={8}>
                  <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '600' }}>Clear</Text>
                </Pressable>
              ) : null}
            </View>
            <View style={{ borderRadius: 14, backgroundColor: palette.inset, borderWidth: 1, borderColor: textFocused ? accent : palette.outline, paddingHorizontal: 16, paddingVertical: 12, minHeight: 180 }}>
              <TextInput
                placeholder={'Example:\n\nAdaeze Okonkwo\n+234 803 555 0101\n15 Admiralty Way, Lekki, Lagos\n\n2 Aviator Gold frames\n1 Anti-blue lens service'}
                placeholderTextColor={palette.faint}
                value={messageText}
                onChangeText={setMessageText}
                onFocus={() => setTextFocused(true)}
                onBlur={() => setTextFocused(false)}
                multiline
                textAlignVertical="top"
                selectionColor={palette.text}
                style={[
                  { color: palette.text, fontSize: 14, minHeight: 156 },
                  Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
                ]}
              />
            </View>
          </View>

          <View style={{ borderRadius: 20, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, padding: cardPad, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: FYLL_LIME }}>
                <Text style={{ color: FYLL_LIME_INK, fontSize: 12, fontWeight: '600' }}>2</Text>
              </View>
              <Text style={{ flex: 1, color: palette.text, fontSize: isWebDesktop ? 16 : 14, fontWeight: '500' }}>Add screenshots</Text>
              <Text style={{ color: palette.faint, fontSize: 12 }}>Optional · {imageDataUrls.length}/{MAX_ORDER_SCREENSHOTS}</Text>
            </View>
            {imageDataUrls.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {imageDataUrls.map((imageDataUrl, index) => (
                    <View
                      key={`${imageDataUrl.slice(0, 32)}-${index}`}
                      style={{ width: 120, height: 120, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: palette.border }}
                    >
                      <Image source={{ uri: imageDataUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      <Pressable
                        onPress={() => handleRemoveImage(index)}
                        style={{ position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.65)' }}
                      >
                        <X size={14} color="#FFFFFF" strokeWidth={2.4} />
                      </Pressable>
                    </View>
                  ))}
                  {imageDataUrls.length < MAX_ORDER_SCREENSHOTS ? (
                    <Pressable
                      onPress={handlePickImage}
                      style={{ width: 120, height: 120, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderStyle: 'dashed', borderColor: palette.outline, backgroundColor: palette.inset }}
                    >
                      <Plus size={20} color={palette.textSoft} strokeWidth={2} />
                      <Text style={{ color: palette.textSoft, fontSize: 12, fontWeight: '500' }}>Add</Text>
                    </Pressable>
                  ) : null}
                </View>
              </ScrollView>
            ) : (
              <Pressable
                onPress={handlePickImage}
                style={{ height: 76, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: palette.outline, backgroundColor: palette.inset }}
              >
                <ImagePlus size={18} color={palette.textSoft} strokeWidth={1.9} />
                <Text style={{ color: palette.textSoft, fontSize: 14, fontWeight: '500' }}>Upload screenshot</Text>
              </Pressable>
            )}
          </View>

          {errorText ? (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 14, backgroundColor: palette.dangerBg, borderWidth: 1, borderColor: palette.dangerBorder }}>
              <AlertCircle size={16} color={palette.danger} strokeWidth={2.2} style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, color: palette.danger, fontSize: 14 }}>{errorText}</Text>
            </View>
          ) : null}

          {isParsing ? (
            <View style={{ height: 52, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: palette.softFill }}>
              <ActivityIndicator color={palette.textSoft} />
              <Text style={{ color: palette.textSoft, fontSize: 14, fontWeight: '600' }}>Reading the order…</Text>
            </View>
          ) : (
            <FyllAiButton
              label={parsedData ? 'Parse again' : 'Parse order'}
              onPress={handleParse}
              disabled={!hasInput}
              height={52}
              borderRadius={999}
              iconSize={18}
              textSize={14}
              style={{ opacity: hasInput ? 1 : 0.45 }}
            />
          )}

          {parsedData && (
            <View style={{ borderRadius: 20, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, padding: cardPad, gap: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: FYLL_LIME }}>
                  <Check size={14} color={FYLL_LIME_INK} strokeWidth={2.6} />
                </View>
                <Text style={{ flex: 1, color: palette.text, fontSize: isWebDesktop ? 16 : 14, fontWeight: '500' }}>Here's what we found</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 26, borderRadius: 13, backgroundColor: confidenceTint.bg }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: confidenceTint.dot }} />
                  <Text style={{ color: confidenceTint.ink, fontSize: 12, fontWeight: '600' }}>{parsedData.confidence} confidence</Text>
                </View>
              </View>

              <View style={{ borderRadius: 14, backgroundColor: palette.inset, borderWidth: 1, borderColor: palette.hairline, paddingHorizontal: 14 }}>
                {detailRows.map((row, index) => (
                  <View
                    key={row.label}
                    style={{ flexDirection: 'row', gap: 12, paddingVertical: 11, borderBottomWidth: index < detailRows.length - 1 ? 1 : 0, borderBottomColor: palette.hairline }}
                  >
                    <Text style={{ width: 76, color: palette.muted, fontSize: 12, paddingTop: 1 }}>{row.label}</Text>
                    <Text style={{ flex: 1, color: row.value ? palette.text : palette.faint, fontSize: 14, fontStyle: row.value ? 'normal' : 'italic' }}>
                      {row.value || 'Not found'}
                    </Text>
                  </View>
                ))}
              </View>

              <View style={{ gap: 10 }}>
                <Text style={{ color: palette.faint, fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' }}>Products</Text>
                {lineList(
                  parsedData.items.map((item, idx) => ({
                    key: `item-${idx}`,
                    qty: item.quantity,
                    title: item.productName,
                    sub: item.variantInfo || undefined,
                    price: item.unitPrice || undefined,
                  })),
                  'No products found',
                )}
              </View>

              <View style={{ gap: 10 }}>
                <Text style={{ color: palette.faint, fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' }}>Services</Text>
                {lineList(
                  parsedData.services.map((service, idx) => ({
                    key: `service-${idx}`,
                    qty: service.quantity,
                    title: service.serviceName,
                    sub: service.notes || undefined,
                    price: service.unitPrice || undefined,
                  })),
                  'No services found',
                )}
              </View>

              {(parsedData.deliveryFee || parsedData.orderTotal) ? (
                <View style={{ gap: 8 }}>
                  {parsedData.deliveryFee ? (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ color: palette.muted, fontSize: 14 }}>Delivery fee</Text>
                      <MoneyText style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>{formatCurrency(parsedData.deliveryFee)}</MoneyText>
                    </View>
                  ) : null}
                  {parsedData.orderTotal ? (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ color: palette.text, fontSize: 14, fontWeight: '500' }}>Order total</Text>
                      <MoneyText style={{ color: palette.text, fontSize: 18, fontWeight: '600' }}>{formatCurrency(parsedData.orderTotal)}</MoneyText>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {parsedData.notes ? (
                <View style={{ padding: 14, borderRadius: 14, backgroundColor: palette.nudgeBg, borderWidth: 1, borderColor: palette.nudgeBorder, gap: 4 }}>
                  <Text style={{ color: palette.limeOnSurface, fontSize: 12, fontWeight: '600' }}>Special notes</Text>
                  <Text style={{ color: palette.textSoft, fontSize: 14, lineHeight: 20 }}>{parsedData.notes}</Text>
                </View>
              ) : null}

              <Pressable
                onPress={handleCreateDraft}
                style={({ pressed }) => ({ height: 52, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: pressed ? FYLL_LIME_HOVER : FYLL_LIME })}
              >
                <Text style={{ color: FYLL_LIME_INK, fontSize: 16, fontWeight: '600' }}>Review draft order</Text>
                <ArrowRight size={18} color={FYLL_LIME_INK} strokeWidth={2.4} />
              </Pressable>
              <Text style={{ color: palette.faint, fontSize: 12, textAlign: 'center', marginTop: -6 }}>
                You can still edit everything on the next screen.
              </Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
