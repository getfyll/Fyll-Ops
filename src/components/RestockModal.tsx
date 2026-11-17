import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Check, Minus, Plus, X } from 'lucide-react-native';
import { useMutation } from '@tanstack/react-query';
import useFyllStore, { type ProductVariant } from '@/lib/state/fyll-store';
import useAuthStore from '@/lib/state/auth-store';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { FYLL_LIME, FYLL_LIME_HOVER, FYLL_LIME_INK, MoneyText, isHovered, usePaymentsPalette } from '@/components/payments/payments-ui';

const variantLabelOf = (variant: ProductVariant) => Object.values(variant.variableValues ?? {}).filter(Boolean).join(' / ');

// Restock a variant without leaving the page. With no variant given, the first step is choosing one.
export function RestockModal({
  visible,
  productId,
  variantId,
  onClose,
  onDone,
}: {
  visible: boolean;
  productId: string;
  variantId?: string | null;
  onClose: () => void;
  onDone?: (message: string) => void;
}) {
  const palette = usePaymentsPalette();
  const { isMobile } = useBreakpoint();
  const product = useFyllStore((s) => s.products.find((p) => p.id === productId));
  const restockVariant = useFyllStore((s) => s.restockVariant);
  const userName = useAuthStore((s) => s.currentUser?.name);
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);

  const [chosenId, setChosenId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<number>(0);

  useEffect(() => {
    if (!visible) return;
    setQuantity(0);
    const variants = product?.variants ?? [];
    setChosenId(variantId ?? (variants.length === 1 ? variants[0].id : null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, variantId]);

  const variant = useMemo(() => product?.variants.find((v) => v.id === chosenId), [product, chosenId]);
  const label = variant ? variantLabelOf(variant) : '';

  const restock = useMutation({
    mutationFn: async () => {
      if (!product || !variant || quantity <= 0) return;
      await restockVariant(product.id, variant.id, quantity, userName, businessId);
    },
    onSuccess: () => {
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onDone?.(`Added ${quantity} to ${label || product?.name || 'stock'}.`);
      onClose();
    },
  });

  const step = (delta: number) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setQuantity((q) => Math.max(0, q + delta));
  };

  if (!product) return null;
  const canSave = Boolean(variant) && quantity > 0 && !restock.isPending;
  const sectionLabel = { color: palette.faint, fontSize: 12, fontWeight: '600' as const, letterSpacing: 0.6, textTransform: 'uppercase' as const, marginBottom: 8 };

  return (
    <Modal visible={visible} transparent animationType={isMobile ? 'slide' : 'fade'} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: isMobile ? 'flex-end' : 'center', alignItems: 'center' }}>
          <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: isMobile ? undefined : 460, maxHeight: '88%', backgroundColor: palette.card, borderRadius: 24, borderBottomLeftRadius: isMobile ? 0 : 24, borderBottomRightRadius: isMobile ? 0 : 24, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 12 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <MoneyText style={{ color: palette.text, fontSize: 20 }}>Restock</MoneyText>
                <Text style={{ color: palette.faint, fontSize: 13, marginTop: 2 }} numberOfLines={1}>{product.name}</Text>
              </View>
              <Pressable accessibilityLabel="Close" onPress={onClose} style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.softFill }}>
                <X size={16} color={palette.text} strokeWidth={2.2} />
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}>
              {!variantId && product.variants.length > 1 ? (
                <View style={{ marginBottom: 18 }}>
                  <Text style={sectionLabel}>Variant</Text>
                  <View style={{ borderRadius: 14, borderWidth: 1, borderColor: palette.border, overflow: 'hidden' }}>
                    {product.variants.map((item, index) => {
                      const on = item.id === chosenId;
                      return (
                        <Pressable key={item.id} onPress={() => setChosenId(item.id)} style={(state) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: palette.hairline, backgroundColor: on ? palette.nudgeBg : isHovered(state) ? palette.softFill : 'transparent' })}>
                          <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: on ? 0 : 1.5, borderColor: palette.outline, backgroundColor: on ? FYLL_LIME : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                            {on ? <Check size={11} color={FYLL_LIME_INK} strokeWidth={3} /> : null}
                          </View>
                          <Text style={{ flex: 1, color: palette.text, fontSize: 14, fontWeight: on ? '600' : '400' }} numberOfLines={1}>{variantLabelOf(item) || item.sku || 'Variant'}</Text>
                          <Text style={{ color: item.stock <= 0 ? palette.danger : palette.muted, fontSize: 12.5 }}>{item.stock <= 0 ? 'Out' : `${item.stock} in stock`}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : variant ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 14, backgroundColor: palette.inset, marginBottom: 18 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: palette.text, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>{label || product.name}</Text>
                    {variant.sku ? <Text style={{ color: palette.faint, fontSize: 12.5, marginTop: 2 }}>SKU {variant.sku}</Text> : null}
                  </View>
                  <Text style={{ color: variant.stock <= 0 ? palette.danger : palette.muted, fontSize: 13 }}>{`${variant.stock} in stock`}</Text>
                </View>
              ) : null}

              <Text style={sectionLabel}>Units to add</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <Pressable accessibilityLabel="Less" onPress={() => step(-1)} style={{ width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: palette.outline, alignItems: 'center', justifyContent: 'center', opacity: quantity <= 0 ? 0.4 : 1 }}>
                  <Minus size={18} color={palette.text} strokeWidth={2.2} />
                </Pressable>
                <TextInput
                  value={quantity > 0 ? String(quantity) : ''}
                  onChangeText={(text) => setQuantity(parseInt(text.replace(/[^0-9]/g, ''), 10) || 0)}
                  placeholder="0"
                  placeholderTextColor={palette.faint}
                  keyboardType="number-pad"
                  autoFocus={!isMobile && Boolean(variantId)}
                  style={{ flex: 1, height: 48, borderRadius: 14, borderWidth: 1, borderColor: palette.outline, backgroundColor: palette.inputBg, color: palette.text, fontSize: 20, fontWeight: '700', textAlign: 'center' }}
                  selectionColor={FYLL_LIME}
                />
                <Pressable accessibilityLabel="More" onPress={() => step(1)} style={{ width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: palette.outline, alignItems: 'center', justifyContent: 'center' }}>
                  <Plus size={18} color={palette.text} strokeWidth={2.2} />
                </Pressable>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                {[5, 10, 25, 50].map((amount) => (
                  <Pressable key={amount} onPress={() => step(amount)} style={(state) => ({ flex: 1, height: 34, borderRadius: 999, borderWidth: 1, borderColor: palette.outline, alignItems: 'center', justifyContent: 'center', backgroundColor: isHovered(state) ? palette.softFill : 'transparent' })}>
                    <Text style={{ color: palette.textSoft, fontSize: 13, fontWeight: '600' }}>+{amount}</Text>
                  </Pressable>
                ))}
              </View>

              {variant && quantity > 0 ? (
                <Text style={{ color: palette.limeOnSurface, fontSize: 13, fontWeight: '600', textAlign: 'center', marginBottom: 14 }}>
                  {`New stock: ${variant.stock + quantity}`}
                </Text>
              ) : null}
              {restock.isError ? (
                <Text style={{ color: palette.danger, fontSize: 13, textAlign: 'center', marginBottom: 12 }}>Could not restock. Try again.</Text>
              ) : null}

              <Pressable
                disabled={!canSave}
                onPress={() => restock.mutate()}
                style={(state) => ({ height: 52, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: canSave ? (isHovered(state) ? FYLL_LIME_HOVER : FYLL_LIME) : palette.softFill })}
              >
                {restock.isPending ? <ActivityIndicator color={FYLL_LIME_INK} /> : <Check size={17} color={canSave ? FYLL_LIME_INK : palette.faint} strokeWidth={2.4} />}
                <Text style={{ color: canSave ? FYLL_LIME_INK : palette.faint, fontSize: 14, fontWeight: '600' }}>Confirm restock</Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
