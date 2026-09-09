import React, { useEffect, useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Check, ChevronDown, Plus, X } from 'lucide-react-native';
import { pickImageSimple } from '@/hooks/useImagePicker';
import type { ProductVariable } from '@/lib/state/fyll-store';
import type { StatsColors } from '@/lib/theme';

export type ProcurementCreateInventoryProductDraft = {
  name: string;
  variantType: string;
  variants: { id: string; name: string; price: string; imageUri?: string | null }[];
  imageUri: string | null;
  isNewProduct: boolean;
};

type ProcurementCreateInventoryProductModalProps<T extends ProcurementCreateInventoryProductDraft> = {
  visible: boolean;
  draft: T | null;
  setDraft: React.Dispatch<React.SetStateAction<T | null>>;
  colors: StatsColors;
  productVariables: ProductVariable[];
  availableVariantValuesByType: Map<string, Set<string>>;
  onPersistVariantValue: (variantType: string, value: string) => void;
  onClose: () => void;
  onSave: () => Promise<void>;
  saveDisabled: boolean;
  saveLabel: string;
  isMobile?: boolean;
};

export function ProcurementCreateInventoryProductModal<T extends ProcurementCreateInventoryProductDraft>({
  visible,
  draft,
  setDraft,
  colors,
  productVariables,
  availableVariantValuesByType,
  onPersistVariantValue,
  onClose,
  onSave,
  saveDisabled,
  saveLabel,
  isMobile = false,
}: ProcurementCreateInventoryProductModalProps<T>) {
  const [showVariantTypeDropdown, setShowVariantTypeDropdown] = useState(false);
  const [activeVariantValueId, setActiveVariantValueId] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setShowVariantTypeDropdown(false);
      setActiveVariantValueId(null);
    }
  }, [visible]);

  const variantTypeOptions = useMemo(
    () => productVariables.filter((variable) => variable.name.trim()),
    [productVariables]
  );

  const persistVariantValueForRow = (variantId: string) => {
    const selectedVariantType = draft?.variantType?.trim();
    const rawVariantValue = draft?.variants.find((variant) => variant.id === variantId)?.name?.trim();
    if (!selectedVariantType || !rawVariantValue) return;
    onPersistVariantValue(selectedVariantType, rawVariantValue);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        onPress={onClose}
      >
        <Pressable
          style={{ width: '100%', maxWidth: isMobile ? '100%' : 620, backgroundColor: colors.bg.card, borderRadius: 16, padding: 20 }}
          onPress={(event) => event.stopPropagation()}
        >
          <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: '700', marginBottom: 4 }}>Add to Inventory</Text>
          <Text style={{ color: colors.text.muted, fontSize: 13, marginBottom: 18 }}>Create this product in your inventory. You can then select the specific variant to order.</Text>

          <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 }}>Product name</Text>
          <TextInput
            value={draft?.name ?? ''}
            onChangeText={(text) => setDraft((prev) => prev ? ({ ...prev, name: text } as T) : prev)}
            placeholder="e.g. Ankara Fabric"
            placeholderTextColor={colors.text.muted}
            style={{ height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.bg.input, color: colors.text.primary, paddingHorizontal: 12, fontSize: 14, marginBottom: 14 }}
          />

          <Pressable
            onPress={() => setDraft((prev) => prev ? ({ ...prev, isNewProduct: !prev.isNewProduct } as T) : prev)}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.bg.input, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 14 }}
          >
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600' }}>New product</Text>
              <Text style={{ color: colors.text.muted, fontSize: 11, marginTop: 1 }}>Show inventory + new product badge after creating</Text>
            </View>
            <View style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: draft?.isNewProduct ? colors.bar : colors.bg.input, borderWidth: 1, borderColor: draft?.isNewProduct ? colors.bar : colors.divider, justifyContent: 'center', paddingHorizontal: 2 }}>
              <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: draft?.isNewProduct ? colors.bg.screen : colors.text.muted, alignSelf: draft?.isNewProduct ? 'flex-end' : 'flex-start' }} />
            </View>
          </Pressable>

          <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 }}>
            Product image <Text style={{ color: colors.text.muted, fontWeight: '400', textTransform: 'none' }}>(optional)</Text>
          </Text>
          <Pressable
            onPress={async () => {
              const uri = await pickImageSimple();
              if (uri) setDraft((prev) => prev ? ({ ...prev, imageUri: uri } as T) : prev);
            }}
            style={{ height: 82, borderRadius: 10, borderWidth: 1, borderColor: colors.divider, borderStyle: draft?.imageUri ? 'solid' : 'dashed', backgroundColor: colors.bg.input, alignItems: 'center', justifyContent: 'center', marginBottom: 14, overflow: 'hidden' }}
          >
            {draft?.imageUri ? (
              <View style={{ width: '100%', height: '100%', position: 'relative' }}>
                <Image source={{ uri: draft.imageUri }} style={{ width: '100%', height: '100%', borderRadius: 9 }} resizeMode="cover" />
                <Pressable
                  onPress={() => setDraft((prev) => prev ? ({ ...prev, imageUri: null } as T) : prev)}
                  style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}
                >
                  <X size={11} color="#fff" strokeWidth={2.5} />
                </Pressable>
              </View>
            ) : (
              <View style={{ alignItems: 'center', gap: 4 }}>
                <Plus size={18} color={colors.text.muted} strokeWidth={2} />
                <Text style={{ color: colors.text.muted, fontSize: 12 }}>Upload image</Text>
              </View>
            )}
          </Pressable>

          <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 }}>
            Variant type <Text style={{ color: colors.text.muted, fontWeight: '400', textTransform: 'none' }}>(optional)</Text>
          </Text>
          <View style={{ position: 'relative', zIndex: 1000, elevation: 1000, marginBottom: 14, overflow: 'visible' }}>
            <Pressable
              onPress={() => {
                setShowVariantTypeDropdown((prev) => !prev);
                setActiveVariantValueId(null);
              }}
              style={{ height: 44, borderTopLeftRadius: 10, borderTopRightRadius: 10, borderBottomLeftRadius: showVariantTypeDropdown ? 0 : 10, borderBottomRightRadius: showVariantTypeDropdown ? 0 : 10, borderWidth: 1, borderColor: showVariantTypeDropdown ? colors.bar : colors.divider, backgroundColor: colors.bg.input, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <Text style={{ color: draft?.variantType ? colors.text.primary : colors.text.muted, fontSize: 14 }}>
                {draft?.variantType || 'Select variant type…'}
              </Text>
              <ChevronDown size={15} color={colors.text.muted} strokeWidth={2} />
            </Pressable>
            {showVariantTypeDropdown ? (
              <View style={{ borderWidth: 1, borderTopWidth: 0, borderColor: colors.bar, borderBottomLeftRadius: 10, borderBottomRightRadius: 10, backgroundColor: colors.bg.card, overflow: 'hidden', zIndex: 1001, elevation: 1001, maxHeight: 220 }}>
                <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                  <Pressable
                    onPress={() => {
                      setDraft((prev) => prev ? ({ ...prev, variantType: '' } as T) : prev);
                      setShowVariantTypeDropdown(false);
                      setActiveVariantValueId(null);
                    }}
                    style={{ height: 40, paddingHorizontal: 12, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: colors.divider }}
                  >
                    <Text style={{ color: colors.text.muted, fontSize: 13 }}>None</Text>
                  </Pressable>
                  {variantTypeOptions.map((variable) => (
                    <Pressable
                      key={variable.id}
                      onPress={() => {
                        setDraft((prev) => prev ? ({ ...prev, variantType: variable.name } as T) : prev);
                        setShowVariantTypeDropdown(false);
                        setActiveVariantValueId(null);
                      }}
                      style={{ height: 40, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.divider, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                    >
                      <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '500' }}>{variable.name}</Text>
                      {draft?.variantType === variable.name ? <Check size={13} color={colors.bar} strokeWidth={2.5} /> : null}
                    </Pressable>
                  ))}
                  {variantTypeOptions.length === 0 ? (
                    <View style={{ height: 40, paddingHorizontal: 12, justifyContent: 'center' }}>
                      <Text style={{ color: colors.text.muted, fontSize: 13 }}>No variant types in settings yet</Text>
                    </View>
                  ) : null}
                </ScrollView>
              </View>
            ) : null}
          </View>

          <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 }}>Variants &amp; prices</Text>
          {(draft?.variants ?? []).map((variant, index) => (
            <View key={variant.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8, position: 'relative', zIndex: activeVariantValueId === variant.id ? 1200 : 1, overflow: 'visible' }}>
              <Pressable
                onPress={async () => {
                  const uri = await pickImageSimple();
                  if (!uri) return;
                  setDraft((prev) => prev ? ({
                    ...prev,
                    variants: prev.variants.map((item) => item.id === variant.id ? { ...item, imageUri: uri } : item),
                  } as T) : prev);
                }}
                style={{ width: 40, height: 40, borderRadius: 8, borderWidth: 1, borderColor: colors.divider, borderStyle: variant.imageUri ? 'solid' : 'dashed', backgroundColor: colors.bg.input, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
              >
                {variant.imageUri ? (
                  <Image source={{ uri: variant.imageUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                ) : (
                  <Plus size={14} color={colors.text.muted} strokeWidth={2.2} />
                )}
              </Pressable>
              <View style={{ flex: 1.4, minWidth: 0, position: 'relative', overflow: 'visible' }}>
                <TextInput
                  value={variant.name}
                  onFocus={() => {
                    setActiveVariantValueId(variant.id);
                    setShowVariantTypeDropdown(false);
                  }}
                  onBlur={() => {
                    persistVariantValueForRow(variant.id);
                    setActiveVariantValueId((current) => current === variant.id ? null : current);
                  }}
                  onChangeText={(text) => {
                    setActiveVariantValueId(variant.id);
                    setShowVariantTypeDropdown(false);
                    setDraft((prev) => prev ? ({
                      ...prev,
                      variants: prev.variants.map((item) => item.id === variant.id ? { ...item, name: text } : item),
                    } as T) : prev);
                  }}
                  placeholder={draft?.variantType || 'Variant name'}
                  placeholderTextColor={colors.text.muted}
                  style={{ height: 40, borderRadius: 8, borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.bg.input, color: colors.text.primary, paddingHorizontal: 10, fontSize: 13 }}
                />
                {(() => {
                  const selectedVariantTypeKey = (draft?.variantType ?? '').trim().toLowerCase();
                  const savedVariantValues = Array.from(availableVariantValuesByType.get(selectedVariantTypeKey) ?? [])
                    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
                  const variantValueQuery = variant.name.trim().toLowerCase();
                  const variantValueMatches = (variantValueQuery
                    ? savedVariantValues.filter((value) => value.toLowerCase().includes(variantValueQuery))
                    : savedVariantValues
                  ).slice(0, 8);
                  if (!selectedVariantTypeKey || activeVariantValueId !== variant.id) return null;

                  return (
                    <View
                      style={{
                        position: 'absolute',
                        top: 46,
                        left: 0,
                        right: 0,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: colors.bar,
                        backgroundColor: colors.bg.card,
                        overflow: 'hidden',
                        shadowColor: '#000000',
                        shadowOpacity: 0.12,
                        shadowRadius: 14,
                        shadowOffset: { width: 0, height: 8 },
                        elevation: 10,
                      }}
                    >
                      <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled style={{ maxHeight: 190 }}>
                        {variantValueMatches.map((value) => (
                          <Pressable
                            key={value}
                            onPress={() => {
                              setDraft((prev) => prev ? ({
                                ...prev,
                                variants: prev.variants.map((item) => item.id === variant.id ? { ...item, name: value } : item),
                              } as T) : prev);
                              setActiveVariantValueId(null);
                            }}
                            style={{ minHeight: 36, paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.divider, justifyContent: 'center' }}
                          >
                            <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '500' }}>{value}</Text>
                          </Pressable>
                        ))}
                        {variantValueMatches.length === 0 ? (
                          <View style={{ minHeight: 36, paddingHorizontal: 10, justifyContent: 'center' }}>
                            <Text style={{ color: colors.text.muted, fontSize: 12 }}>No saved values found</Text>
                          </View>
                        ) : null}
                      </ScrollView>
                    </View>
                  );
                })()}
              </View>
              <TextInput
                value={variant.price}
                onChangeText={(text) => setDraft((prev) => prev ? ({
                  ...prev,
                  variants: prev.variants.map((item) => item.id === variant.id ? { ...item, price: text } : item),
                } as T) : prev)}
                placeholder="Selling price"
                keyboardType="decimal-pad"
                placeholderTextColor={colors.text.muted}
                style={{ flex: 1, minWidth: 0, height: 40, borderRadius: 8, borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.bg.input, color: colors.text.primary, paddingHorizontal: 10, fontSize: 13 }}
              />
              {index > 0 ? (
                <Pressable
                  onPress={() => {
                    setDraft((prev) => prev ? ({
                      ...prev,
                      variants: prev.variants.filter((item) => item.id !== variant.id),
                    } as T) : prev);
                    setActiveVariantValueId((current) => current === variant.id ? null : current);
                  }}
                  style={{ width: 36, height: 36, borderRadius: 8, borderWidth: 1, borderColor: colors.divider, alignItems: 'center', justifyContent: 'center' }}
                >
                  <X size={13} color={colors.text.muted} strokeWidth={2} />
                </Pressable>
              ) : <View style={{ width: 36 }} />}
            </View>
          ))}
          <Pressable
            onPress={() => setDraft((prev) => prev ? ({
              ...prev,
              variants: [...prev.variants, { id: Math.random().toString(36).slice(2), name: '', price: '', imageUri: null }],
            } as T) : prev)}
            style={{ height: 36, borderRadius: 8, borderWidth: 1, borderColor: colors.divider, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, marginTop: 2, marginBottom: 20 }}
          >
            <Plus size={13} color={colors.text.muted} strokeWidth={2.5} />
            <Text style={{ color: colors.text.muted, fontSize: 13 }}>Add variant</Text>
          </Pressable>

          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
            <Pressable
              onPress={onClose}
              style={{ height: 40, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: colors.divider, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: colors.text.secondary, fontSize: 14, fontWeight: '600' }}>Cancel</Text>
            </Pressable>
            <Pressable
              disabled={saveDisabled}
              onPress={onSave}
              style={{ height: 40, paddingHorizontal: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: saveDisabled ? colors.bg.input : colors.bar }}
            >
              <Text style={{ color: saveDisabled ? colors.text.muted : colors.bg.screen, fontSize: 14, fontWeight: '700' }}>
                {saveLabel}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
