import React, { useState, useMemo } from 'react';
import { View, Text, Pressable, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Package, Plus, Minus, Check } from 'lucide-react-native';
import useFyllStore from '@/lib/state/fyll-store';
import useAuthStore from '@/lib/state/auth-store';
import { useThemeColors } from '@/lib/theme';
import * as Haptics from 'expo-haptics';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

export default function RestockScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { productId, variantId } = useLocalSearchParams<{ productId: string; variantId: string }>();

  const products = useFyllStore((s) => s.products);
  const restockVariant = useFyllStore((s) => s.restockVariant);
  const currentUser = useAuthStore((s) => s.currentUser);
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);

  const product = useMemo(() => products.find((p) => p.id === productId), [products, productId]);
  const variant = useMemo(() => product?.variants.find((v) => v.id === variantId), [product, variantId]);

  const [quantity, setQuantity] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const variantName = variant ? Object.values(variant.variableValues).join(' / ') : '';
  const quantityNum = parseInt(quantity, 10) || 0;

  const handleIncrement = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setQuantity(String(quantityNum + 1));
  };

  const handleDecrement = () => {
    if (quantityNum > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setQuantity(String(quantityNum - 1));
    }
  };

  const handleQuickAdd = (amount: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setQuantity(String(quantityNum + amount));
  };

  const handleRestock = async () => {
    if (!productId || !variantId || quantityNum <= 0) return;

    setIsSubmitting(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Perform restock
    await restockVariant(productId, variantId, quantityNum, currentUser?.name, businessId);

    // Small delay for visual feedback
    await new Promise((resolve) => setTimeout(resolve, 300));

    router.back();
  };

  if (!product || !variant) {
    return (
      <View className="flex-1" style={{ backgroundColor: colors.bg.primary }}>
        <SafeAreaView className="flex-1 items-center justify-center">
          <Text style={{ color: colors.text.tertiary }}>Product not found</Text>
          <Pressable onPress={() => router.back()} className="mt-4 active:opacity-50">
            <Text style={{ color: colors.text.primary }} className="font-semibold">Go Back</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg.primary }}>
      <SafeAreaView className="flex-1" edges={['top']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          {/* Header */}
          <View
            className="px-5 pt-4 pb-4 flex-row items-center justify-between"
            style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light }}
          >
            <View className="flex-row items-center">
              <Pressable
                onPress={() => router.back()}
                className="w-10 h-10 rounded-xl items-center justify-center mr-3 active:opacity-50"
                style={{ backgroundColor: colors.bg.secondary }}
              >
                <ArrowLeft size={20} color={colors.text.primary} strokeWidth={2} />
              </Pressable>
              <Text style={{ color: colors.text.primary }} className="text-xl font-bold">Restock</Text>
            </View>
          </View>

          <KeyboardAwareScrollView
            className="flex-1 px-5"
            showsVerticalScrollIndicator={false}
            bottomOffset={20}
          >
            {/* Product Info */}
            <View className="mt-6 mb-8">
              <View
                className="p-4 rounded-xl"
                style={{ backgroundColor: colors.bg.secondary }}
              >
                <View className="flex-row items-center">
                  <View
                    className="w-14 h-14 rounded-xl items-center justify-center mr-4"
                    style={{ backgroundColor: colors.bg.primary }}
                  >
                    <Package size={28} color={colors.text.tertiary} strokeWidth={1.5} />
                  </View>
                  <View className="flex-1">
                    <Text style={{ color: colors.text.primary }} className="text-lg font-semibold">
                      {product.name}
                    </Text>
                    <Text style={{ color: colors.text.tertiary }} className="text-sm mt-0.5">
                      {variantName}
                    </Text>
                    <Text style={{ color: colors.text.muted }} className="text-xs mt-1">
                      SKU: {variant.sku}
                    </Text>
                  </View>
                </View>

                <View
                  className="mt-4 pt-4 flex-row items-center justify-between"
                  style={{ borderTopWidth: 1, borderTopColor: colors.border.light }}
                >
                  <Text style={{ color: colors.text.tertiary }} className="text-sm">Current Stock</Text>
                  <Text style={{ color: colors.text.primary }} className="text-lg font-bold">
                    {variant.stock} units
                  </Text>
                </View>
              </View>
            </View>

            {/* Quantity Input */}
            <View className="mb-6">
              <Text style={{ color: colors.text.secondary }} className="text-sm font-medium mb-3">
                Units to Add
              </Text>

              <View className="flex-row items-center justify-center mb-4">
                <Pressable
                  onPress={handleDecrement}
                  disabled={quantityNum === 0}
                  className="w-14 h-14 rounded-xl items-center justify-center active:opacity-50"
                  style={{
                    backgroundColor: quantityNum === 0 ? colors.bg.secondary : colors.bg.secondary,
                    opacity: quantityNum === 0 ? 0.5 : 1,
                  }}
                >
                  <Minus size={24} color={colors.text.primary} strokeWidth={2} />
                </Pressable>

                <View
                  className="mx-4 rounded-xl items-center justify-center"
                  style={{
                    backgroundColor: colors.input.bg,
                    borderWidth: 1,
                    borderColor: colors.input.border,
                    width: 140,
                    height: 64,
                  }}
                >
                  <TextInput
                    value={quantity}
                    onChangeText={(text) => setQuantity(text.replace(/[^0-9]/g, ''))}
                    placeholder="0"
                    placeholderTextColor={colors.text.muted}
                    keyboardType="number-pad"
                    style={{
                      color: colors.text.primary,
                      fontSize: 32,
                      fontWeight: 'bold',
                      textAlign: 'center',
                      width: '100%',
                    }}
                    selectionColor={colors.text.primary}
                  />
                </View>

                <Pressable
                  onPress={handleIncrement}
                  className="w-14 h-14 rounded-xl items-center justify-center active:opacity-50"
                  style={{ backgroundColor: colors.bg.secondary }}
                >
                  <Plus size={24} color={colors.text.primary} strokeWidth={2} />
                </Pressable>
              </View>

              {/* Quick Add Buttons */}
              <View className="flex-row justify-center gap-3">
                {[5, 10, 25, 50].map((amount) => (
                  <Pressable
                    key={amount}
                    onPress={() => handleQuickAdd(amount)}
                    className="px-4 py-2 rounded-lg active:opacity-70"
                    style={{ backgroundColor: colors.bg.secondary }}
                  >
                    <Text style={{ color: colors.text.secondary }} className="font-medium">
                      +{amount}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Preview */}
            {quantityNum > 0 && (
              <View
                className="p-4 rounded-xl mb-6"
                style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)', borderWidth: 1, borderColor: 'rgba(34, 197, 94, 0.2)' }}
              >
                <Text style={{ color: '#22C55E' }} className="text-sm font-medium text-center">
                  New stock will be: {variant.stock + quantityNum} units
                </Text>
              </View>
            )}

            {/* Submit Button */}
            <Pressable
              onPress={handleRestock}
              disabled={quantityNum <= 0 || isSubmitting}
              className="rounded-xl items-center justify-center flex-row active:opacity-80 mb-8"
              style={{
                backgroundColor: quantityNum > 0 ? '#111111' : colors.bg.secondary,
                height: 56,
                opacity: isSubmitting ? 0.7 : 1,
              }}
            >
              <Check size={20} color={quantityNum > 0 ? '#FFFFFF' : colors.text.muted} strokeWidth={2} />
              <Text
                style={{ color: quantityNum > 0 ? '#FFFFFF' : colors.text.muted }}
                className="font-semibold text-base ml-2"
              >
                {isSubmitting ? 'Restocking...' : 'Confirm Restock'}
              </Text>
            </Pressable>
          </KeyboardAwareScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
