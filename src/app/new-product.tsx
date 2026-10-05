import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { Camera, Check, Plus, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import useFyllStore, { generateProductId, generateVariantBarcode, type ProductVariant } from '@/lib/state/fyll-store';
import useAuthStore from '@/lib/state/auth-store';
import { useImagePicker } from '@/hooks/useImagePicker';
import { prepareProductMediaForPersistence } from '@/lib/product-media';
import { storage } from '@/lib/storage';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { ResolvedAttachmentImage } from '@/components/ResolvedAttachmentImage';
import { BackButton, FYLL_LIME, FYLL_LIME_HOVER, FYLL_LIME_INK, isHovered, usePaymentsPalette } from '@/components/payments/payments-ui';
import { formatCompactNaira, formatNaira, swatchForName } from '@/components/inventory/inventory-ui';
import { formatCurrencyInput, parseCurrencyInput } from '@/lib/money-input';

const DRAFT_KEY = 'new-product-draft-v1';

type ProductOption = { id: string; name: string; values: string[]; input: string };
type VariantOverride = { sku?: string; stock?: string; price?: string; imageUrl?: string };
type DraftState = {
  name: string;
  price: string;
  categories: string[];
  description: string;
  lowStock: string;
  isNewDesign: boolean;
  hasOptions: boolean;
  options: ProductOption[];
  overrides: Record<string, VariantOverride>;
  singleStock: string;
  singleSku: string;
};

const COLOUR_CODES: Record<string, string> = {
  black: 'BLK', white: 'WHT', gold: 'GLD', silver: 'SLV', clear: 'CLR', tea: 'TEA', brown: 'BRN', blue: 'BLU', grey: 'GRY', gray: 'GRY',
  red: 'RED', green: 'GRN', pink: 'PNK', purple: 'PRP', yellow: 'YLW', orange: 'ORG', navy: 'NVY', tortoise: 'TRT', cream: 'CRM',
};
const newId = () => Math.random().toString(36).slice(2, 10);
const digitsOnly = (value: string) => value.replace(/[^0-9]/g, '');
const skuBase = (name: string) => (name.trim().split(/\s+/)[0] ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
const valueCode = (value: string) => {
  const key = value.trim().toLowerCase();
  if (COLOUR_CODES[key]) return COLOUR_CODES[key];
  const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/^\d+$/.test(clean)) return clean.slice(0, 4);
  const consonants = clean[0] + clean.slice(1).replace(/[AEIOU]/g, '');
  return (consonants.length >= 3 ? consonants : clean).slice(0, 3);
};
const comboKey = (values: string[]) => values.join('|');

// Every combination of the option values (Colour × Size …).
const buildCombos = (options: ProductOption[]) => {
  const active = options.filter((option) => option.name.trim() && option.values.length > 0);
  if (active.length === 0) return [] as { key: string; values: Record<string, string>; label: string }[];
  let combos: string[][] = [[]];
  active.forEach((option) => {
    combos = combos.flatMap((combo) => option.values.map((value) => [...combo, value]));
  });
  return combos.map((combo) => ({
    key: comboKey(combo),
    values: Object.fromEntries(active.map((option, index) => [option.name.trim(), combo[index]])),
    label: combo.join(' / '),
  }));
};

export default function NewProductScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const palette = usePaymentsPalette();
  const { isMobile, width } = useBreakpoint();
  const isWide = Platform.OS === 'web' && width >= 1100;
  const imagePicker = useImagePicker();

  const productVariables = useFyllStore((s) => s.productVariables);
  const globalCategories = useFyllStore((s) => s.categories);
  const addCategory = useFyllStore((s) => s.addCategory);
  const addProductVariable = useFyllStore((s) => s.addProductVariable);
  const updateProductVariable = useFyllStore((s) => s.updateProductVariable);
  const addProduct = useFyllStore((s) => s.addProduct);
  const currentUser = useAuthStore((s) => s.currentUser);
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);

  const [name, setName] = useState<string>('');
  const [price, setPrice] = useState<string>('');
  const [categories, setCategories] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState<string>('');
  const [isAddingCategory, setIsAddingCategory] = useState<boolean>(false);
  const [showMore, setShowMore] = useState<boolean>(false);
  const [description, setDescription] = useState<string>('');
  const [lowStock, setLowStock] = useState<string>('5');
  const [isNewDesign, setIsNewDesign] = useState<boolean>(false);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [hasOptions, setHasOptions] = useState<boolean>(false);
  const [options, setOptions] = useState<ProductOption[]>([{ id: newId(), name: 'Colour', values: [], input: '' }]);
  const [overrides, setOverrides] = useState<Record<string, VariantOverride>>({});
  const [bulkStock, setBulkStock] = useState<string>('');
  const [bulkPrice, setBulkPrice] = useState<string>('');
  const [singleStock, setSingleStock] = useState<string>('');
  const [singleSku, setSingleSku] = useState<string>('');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [draftRestored, setDraftRestored] = useState<boolean>(false);
  const draftLoaded = useRef<boolean>(false);

  // ── Draft: restore once, then save as you go ────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    void storage.getItem(DRAFT_KEY).then((raw) => {
      if (cancelled) return;
      draftLoaded.current = true;
      if (!raw) return;
      try {
        const draft = JSON.parse(raw) as DraftState;
        if (!draft?.name && !draft?.options?.some((option) => option.values.length)) return;
        setName(draft.name ?? '');
        setPrice(draft.price ?? '');
        setCategories(draft.categories ?? []);
        setDescription(draft.description ?? '');
        setLowStock(draft.lowStock ?? '5');
        setIsNewDesign(Boolean(draft.isNewDesign));
        setHasOptions(Boolean(draft.hasOptions));
        if (draft.options?.length) setOptions(draft.options);
        setOverrides(draft.overrides ?? {});
        setSingleStock(draft.singleStock ?? '');
        setSingleSku(draft.singleSku ?? '');
        setDraftRestored(true);
      } catch {
        // Ignore a corrupt draft.
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const draft: DraftState = useMemo(() => ({
    name, price, categories, description, lowStock, isNewDesign, hasOptions, options,
    // Picked photos are local files: they don't survive a reload, so keep them out of the draft.
    overrides: Object.fromEntries(Object.entries(overrides).map(([key, value]) => [key, { ...value, imageUrl: undefined }])),
    singleStock, singleSku,
  }), [name, price, categories, description, lowStock, isNewDesign, hasOptions, options, overrides, singleStock, singleSku]);

  useEffect(() => {
    if (!draftLoaded.current || isSubmitting) return;
    const timer = setTimeout(() => {
      void storage.setItem(DRAFT_KEY, JSON.stringify(draft));
    }, 600);
    return () => clearTimeout(timer);
  }, [draft, isSubmitting]);

  const clearDraft = () => storage.removeItem(DRAFT_KEY);
  const startOver = () => {
    void clearDraft();
    setName('');
    setPrice('');
    setCategories([]);
    setDescription('');
    setLowStock('5');
    setIsNewDesign(false);
    setCoverUrl(null);
    setHasOptions(false);
    setOptions([{ id: newId(), name: 'Colour', values: [], input: '' }]);
    setOverrides({});
    setSingleStock('');
    setSingleSku('');
    setDraftRestored(false);
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const basePrice = parseCurrencyInput(price);
  const base = skuBase(name) || 'SKU';
  const combos = useMemo(() => (hasOptions ? buildCombos(options) : []), [hasOptions, options]);
  const rows = useMemo(() => {
    const used = new Map<string, number>();
    return combos.map((combo) => {
      const override = overrides[combo.key] ?? {};
      let auto = [base, ...combo.key.split('|').map(valueCode)].join('-');
      const seen = used.get(auto) ?? 0;
      used.set(auto, seen + 1);
      if (seen > 0) auto = `${auto}${seen + 1}`;
      const sku = override.sku ?? auto;
      const stock = override.stock ?? '';
      const ownPrice = override.price ?? '';
      return { ...combo, sku, stock, ownPrice, effectivePrice: parseCurrencyInput(ownPrice) || basePrice, imageUrl: override.imageUrl };
    });
  }, [combos, overrides, base, basePrice]);

  const variantCount = hasOptions ? rows.length : 1;
  const units = hasOptions ? rows.reduce((sum, row) => sum + (Number(row.stock) || 0), 0) : Number(singleStock) || 0;
  const stockValue = hasOptions ? rows.reduce((sum, row) => sum + (Number(row.stock) || 0) * row.effectivePrice, 0) : units * basePrice;
  const skus = hasOptions ? rows.map((row) => row.sku.trim().toUpperCase()) : [(singleSku.trim() || base).toUpperCase()];
  const uniqueSkus = skus.every((sku) => sku) && new Set(skus).size === skus.length;
  const zeroStock = hasOptions ? rows.filter((row) => !(Number(row.stock) > 0)).map((row) => row.label) : (Number(singleStock) > 0 ? [] : ['This product']);
  const everyPriced = hasOptions ? rows.length > 0 && rows.every((row) => row.effectivePrice > 0) : basePrice > 0;
  const canCreate = Boolean(name.trim()) && everyPriced && variantCount > 0 && uniqueSkus && !isSubmitting;
  const optionNames = options.filter((option) => option.name.trim() && option.values.length).map((option) => option.name.trim());

  const checks = [
    { key: 'basics', label: categories.length ? 'Name, price and category' : 'Name and price (category optional)', ok: Boolean(name.trim()) && everyPriced, warn: false },
    { key: 'photo', label: coverUrl ? 'Cover photo added' : 'No cover photo yet', ok: Boolean(coverUrl), warn: false },
    { key: 'skus', label: hasOptions ? (rows.length ? `${rows.length} variants with ${uniqueSkus ? 'unique SKUs' : 'duplicate SKUs'}` : 'Add option values to build variants') : 'Stock and SKU set', ok: hasOptions ? rows.length > 0 && uniqueSkus : uniqueSkus, warn: hasOptions && rows.length > 0 && !uniqueSkus },
    {
      key: 'stock',
      label: zeroStock.length === 0 ? 'Every variant has stock' : zeroStock.length > 3 ? `${zeroStock.length} variants have 0 stock (fine for pre-orders)` : `${zeroStock.join(', ')} ${zeroStock.length === 1 ? 'has' : 'have'} 0 stock (fine for pre-orders)`,
      ok: zeroStock.length === 0,
      warn: zeroStock.length > 0 && variantCount > 0,
    },
  ];

  // ── Options ────────────────────────────────────────────────────────────────
  const updateOption = (id: string, patch: Partial<ProductOption>) => setOptions((prev) => prev.map((option) => (option.id === id ? { ...option, ...patch } : option)));
  const addValues = (id: string, raw: string) => {
    const incoming = raw.split(',').map((value) => value.trim()).filter(Boolean);
    if (!incoming.length) return;
    setOptions((prev) => prev.map((option) => {
      if (option.id !== id) return option;
      const lower = new Set(option.values.map((value) => value.toLowerCase()));
      const next = [...option.values];
      incoming.forEach((value) => {
        const nice = value.charAt(0).toUpperCase() + value.slice(1);
        if (!lower.has(nice.toLowerCase())) {
          lower.add(nice.toLowerCase());
          next.push(nice);
        }
      });
      return { ...option, values: next, input: '' };
    }));
  };
  const removeValue = (id: string, value: string) => setOptions((prev) => prev.map((option) => (option.id === id ? { ...option, values: option.values.filter((v) => v !== value) } : option)));
  const suggestionsFor = (option: ProductOption) => {
    const match = productVariables.find((variable) => variable.name.trim().toLowerCase() === option.name.trim().toLowerCase());
    return (match?.values ?? []).filter((value) => !option.values.some((v) => v.toLowerCase() === value.toLowerCase())).slice(0, 8);
  };
  const otherOptionNames = productVariables.map((variable) => variable.name).filter((n) => !options.some((option) => option.name.trim().toLowerCase() === n.trim().toLowerCase()));

  const setOverride = (key: string, patch: VariantOverride) => setOverrides((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  const applyBulk = (field: 'stock' | 'price', value: string) => {
    if (field === 'stock') setBulkStock(value);
    else setBulkPrice(value);
    setOverrides((prev) => {
      const next = { ...prev };
      rows.forEach((row) => {
        next[row.key] = { ...next[row.key], [field]: field === 'stock' ? digitsOnly(value) : formatCurrencyInput(value) };
      });
      return next;
    });
  };

  // ── Photos ─────────────────────────────────────────────────────────────────
  const pickCover = async () => {
    const uri = await imagePicker.pickImage();
    if (uri) setCoverUrl(uri);
  };
  const pickVariantPhoto = async (key: string) => {
    const uri = await imagePicker.pickImage();
    if (uri) setOverride(key, { imageUrl: uri });
  };
  const variantPhotos = rows.filter((row) => row.imageUrl).map((row) => ({ key: row.key, uri: row.imageUrl as string }));

  // ── Category ───────────────────────────────────────────────────────────────
  const categorySuggestions = globalCategories.filter((category) => !categories.includes(category)).slice(0, isMobile ? 4 : 6);
  const commitNewCategory = () => {
    const trimmed = newCategory.trim();
    if (trimmed) {
      const existing = globalCategories.find((category) => category.toLowerCase() === trimmed.toLowerCase());
      if (!existing) addCategory(trimmed);
      const final = existing ?? trimmed;
      setCategories((prev) => (prev.includes(final) ? prev : [...prev, final]));
    }
    setNewCategory('');
    setIsAddingCategory(false);
  };

  // ── Save ───────────────────────────────────────────────────────────────────
  const rememberOptions = () => {
    options.forEach((option) => {
      const optionName = option.name.trim();
      if (!optionName || option.values.length === 0) return;
      const existing = productVariables.find((variable) => variable.name.trim().toLowerCase() === optionName.toLowerCase());
      if (existing) {
        const merged = Array.from(new Set([...existing.values, ...option.values]));
        if (merged.length !== existing.values.length) updateProductVariable(existing.id, { values: merged });
      } else {
        addProductVariable({ id: newId(), name: optionName, values: option.values });
      }
    });
  };

  const handleCreate = async () => {
    if (!canCreate) return;
    if (!businessId) {
      setNotice({ type: 'error', message: 'Your workspace is still loading. Please wait a moment and try again.' });
      return;
    }
    setIsSubmitting(true);
    try {
      const productId = generateProductId();
      const drafted: ProductVariant[] = hasOptions
        ? rows.map((row, index) => ({
          id: `${productId}-${index + 1}`,
          sku: row.sku.trim().toUpperCase(),
          barcode: generateVariantBarcode(),
          variableValues: row.values,
          stock: Number(row.stock) || 0,
          sellingPrice: row.effectivePrice,
          imageUrl: row.imageUrl ?? coverUrl ?? undefined,
        }))
        : [{
          id: `${productId}-1`,
          sku: (singleSku.trim() || base).toUpperCase(),
          barcode: generateVariantBarcode(),
          variableValues: {},
          stock: Number(singleStock) || 0,
          sellingPrice: basePrice,
          imageUrl: coverUrl ?? undefined,
        }];
      const media = await prepareProductMediaForPersistence({ businessId, productId, imageUrl: coverUrl, variants: drafted });
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Product creation timed out')), 15000));
      await Promise.race([
        addProduct({
          id: productId,
          name: name.trim(),
          description: description.trim(),
          categories,
          variants: media.variants,
          lowStockThreshold: Number(lowStock) || 0,
          createdAt: new Date().toISOString(),
          productType: 'product',
          imageUrl: media.imageUrl,
          createdBy: currentUser?.name,
          useGlobalStock: false,
          isNewDesign,
          designYear: isNewDesign ? new Date().getFullYear() : undefined,
          designLaunchedAt: isNewDesign ? new Date().toISOString() : undefined,
        }, businessId),
        timeout,
      ]);
      if (hasOptions) rememberOptions();
      await clearDraft();
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setNotice({ type: 'success', message: 'Product created' });
      setTimeout(() => router.replace(`/product/${productId}` as never), 500);
    } catch (error) {
      console.error('Failed to create product:', error);
      setIsSubmitting(false);
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setNotice({ type: 'error', message: 'Could not create the product. Check your connection and try again.' });
      setTimeout(() => setNotice(null), 3500);
    }
  };

  const saveDraftAndLeave = async () => {
    await storage.setItem(DRAFT_KEY, JSON.stringify(draft));
    router.back();
  };

  // ── Styles ─────────────────────────────────────────────────────────────────
  const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null;
  const card = { borderRadius: 18, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border } as const;
  const h2 = { color: palette.text, fontSize: 16, fontWeight: '600' as const };
  const sub = { color: palette.faint, fontSize: isMobile ? 12 : 13 };
  const lab = { color: palette.textSoft, fontSize: isMobile ? 12 : 13, fontWeight: '600' as const };
  const th = { color: palette.faint, fontSize: 11.5, fontWeight: '600' as const, letterSpacing: 0.6, textTransform: 'uppercase' as const };
  const fieldBg = palette.isDark ? '#141414' : '#FAFAF8';
  const field = { height: 46, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: palette.border, backgroundColor: fieldBg, color: palette.text, fontSize: isMobile ? 14 : 15 };
  const cell = { height: 38, paddingHorizontal: 10, borderRadius: 9, borderWidth: 1, borderColor: palette.border, backgroundColor: fieldBg, color: palette.text, fontSize: isMobile ? 12 : 14 };
  const dashedPill = (state: { pressed: boolean }, height = 30) => ({ height, paddingHorizontal: 11, borderRadius: 999, borderWidth: 1, borderStyle: 'dashed' as const, borderColor: palette.outline, justifyContent: 'center' as const, opacity: state.pressed ? 0.7 : 1 });

  const renderToggle = (on: boolean, onPress: () => void, label: string) => (
    <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: on }} onPress={onPress} style={{ width: 44, height: 26, borderRadius: 999, backgroundColor: on ? palette.tones.verified.dot : palette.outline, flexShrink: 0 }}>
      <View style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: 10, backgroundColor: palette.page }} />
    </Pressable>
  );

  const photoBlock = (
    <View style={{ width: isWide ? 220 : '100%', gap: 8 }}>
      <Pressable onPress={() => { void pickCover(); }} style={{ width: '100%', height: isWide ? 190 : 220, borderRadius: 14, overflow: 'hidden', backgroundColor: coverUrl ? '#F4F4EF' : palette.softFill, alignItems: 'center', justifyContent: 'center', borderWidth: coverUrl ? 0 : 1, borderStyle: 'dashed', borderColor: palette.outline }}>
        {coverUrl ? (
          <>
            <ResolvedAttachmentImage imageUrl={coverUrl} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            <View style={{ position: 'absolute', left: 8, top: 8, height: 22, paddingHorizontal: 8, borderRadius: 999, backgroundColor: 'rgba(20,20,20,0.7)', justifyContent: 'center' }}>
              <Text style={{ color: '#F4F4EF', fontSize: 11, fontWeight: '600' }}>Cover</Text>
            </View>
          </>
        ) : (
          <View style={{ alignItems: 'center', gap: 6 }}>
            <Camera size={22} color={palette.faint} strokeWidth={1.8} />
            <Text style={{ color: palette.faint, fontSize: 12.5 }}>Add a cover photo</Text>
          </View>
        )}
      </Pressable>
      {coverUrl || variantPhotos.length ? (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {variantPhotos.slice(0, 3).map((photo) => (
            <Pressable key={photo.key} onPress={() => setCoverUrl(photo.uri)} style={{ flex: 1, aspectRatio: 1, borderRadius: 8, overflow: 'hidden', backgroundColor: '#F4F4EF' }}>
              <ResolvedAttachmentImage imageUrl={photo.uri} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            </Pressable>
          ))}
          <Pressable accessibilityLabel="Change cover photo" onPress={() => { void pickCover(); }} style={(state) => ({ flex: 1, aspectRatio: 1, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: palette.outline, alignItems: 'center', justifyContent: 'center', backgroundColor: isHovered(state) ? palette.softFill : 'transparent' })}>
            <Plus size={16} color={palette.faint} strokeWidth={2} />
          </Pressable>
          {Array.from({ length: Math.max(0, 3 - variantPhotos.length) }).map((_, index) => <View key={index} style={{ flex: 1 }} />)}
        </View>
      ) : null}
      <Text style={[sub, { fontSize: isMobile ? 10 : 12, lineHeight: 17 }]}>{variantPhotos.length ? 'Tap a variant photo to make it the cover.' : 'Variant photos are optional. Missing ones use the cover.'}</Text>
    </View>
  );

  const basicsCard = (
    <View style={{ ...card, padding: isMobile ? 16 : 20, paddingHorizontal: isMobile ? 16 : 22, flexDirection: isWide ? 'row' : 'column', gap: 22 }}>
      {photoBlock}
      <View style={{ flex: isWide ? 1 : undefined, minWidth: 0, gap: 18 }}>
        <Text style={h2}>Basics</Text>
        <View style={{ gap: 8 }}>
          <Text style={lab}>Name</Text>
          <TextInput value={name} onChangeText={setName} placeholder="e.g. Abdul" placeholderTextColor={palette.faint} style={[field, webNoOutline]} />
        </View>
        <View style={{ gap: 8 }}>
          <Text style={lab}>Price</Text>
          <View style={{ maxWidth: isMobile ? undefined : 260, justifyContent: 'center' }}>
            <Text style={{ position: 'absolute', left: 14, color: palette.faint, fontSize: isMobile ? 14 : 15, zIndex: 1 }}>₦</Text>
            <TextInput value={price} onChangeText={(value) => setPrice(formatCurrencyInput(value))} keyboardType="number-pad" placeholder="0" placeholderTextColor={palette.faint} style={[field, { paddingLeft: 32 }, webNoOutline]} />
          </View>
        </View>
        <View style={{ gap: 8 }}>
          <Text style={lab}>Category</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {categories.map((category) => (
              <Pressable key={category} onPress={() => setCategories((prev) => prev.filter((c) => c !== category))} style={{ flexDirection: 'row', alignItems: 'center', gap: 7, height: 32, paddingLeft: 13, paddingRight: 10, borderRadius: 999, backgroundColor: palette.inverseBg }}>
                <Text style={{ color: palette.inverseText, fontSize: isMobile ? 12 : 13, fontWeight: '600' }}>{category}</Text>
                <X size={11} color={palette.inverseText} strokeWidth={2.8} />
              </Pressable>
            ))}
            {categorySuggestions.map((category) => (
              <Pressable key={category} onPress={() => setCategories((prev) => [...prev, category])} style={(state) => dashedPill(state)}>
                <Text style={{ color: palette.muted, fontSize: isMobile ? 12 : 13 }}>{category}</Text>
              </Pressable>
            ))}
            {isAddingCategory ? (
              <TextInput autoFocus value={newCategory} onChangeText={setNewCategory} onSubmitEditing={commitNewCategory} onBlur={commitNewCategory} placeholder="New category" placeholderTextColor={palette.faint} style={[{ height: 30, minWidth: 140, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: palette.outline, color: palette.text, fontSize: 13 }, webNoOutline]} />
            ) : (
              <Pressable onPress={() => setIsAddingCategory(true)} style={(state) => dashedPill(state)}>
                <Text style={{ color: palette.muted, fontSize: isMobile ? 12 : 13 }}>+ New</Text>
              </Pressable>
            )}
          </View>
        </View>
        <View style={{ borderTopWidth: 1, borderTopColor: palette.hairline, paddingTop: 14, gap: 14 }}>
          <Pressable onPress={() => setShowMore((prev) => !prev)}>
            <Text style={{ color: palette.textSoft, fontSize: isMobile ? 12 : 14, fontWeight: '600' }}>{showMore ? '− Hide extra details' : '+ Description, low stock alert, new design tag'}</Text>
          </Pressable>
          {showMore ? (
            <>
              <View style={{ gap: 8 }}>
                <Text style={lab}>Description</Text>
                <TextInput value={description} onChangeText={setDescription} multiline placeholder="Optional" placeholderTextColor={palette.faint} style={[field, { height: 96, paddingTop: 12, textAlignVertical: 'top' }, webNoOutline]} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={lab}>Low stock alert</Text>
                  <Text style={[sub, { marginTop: 2 }]}>Warn when a variant has this many or fewer</Text>
                </View>
                <TextInput value={lowStock} onChangeText={(value) => setLowStock(digitsOnly(value))} keyboardType="number-pad" style={[cell, { width: 70, textAlign: 'center' }, webNoOutline]} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={lab}>New design</Text>
                  <Text style={[sub, { marginTop: 2 }]}>Tag as a {new Date().getFullYear()} new design</Text>
                </View>
                {renderToggle(isNewDesign, () => setIsNewDesign((prev) => !prev), 'New design')}
              </View>
            </>
          ) : null}
        </View>
      </View>
    </View>
  );

  const optionsCard = (
    <View style={{ ...card, padding: isMobile ? 16 : 20, paddingHorizontal: isMobile ? 16 : 22, gap: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={h2}>Does it come in different colours or sizes?</Text>
          <Text style={sub}>Add the options and Fyll builds every variant for you.</Text>
        </View>
        {renderToggle(hasOptions, () => setHasOptions((prev) => !prev), 'Has options')}
      </View>
      {hasOptions ? (
        <>
          {options.map((option, index) => {
            const suggestions = suggestionsFor(option);
            return (
              <View key={option.id} style={{ borderRadius: 14, borderWidth: 1, borderColor: palette.border, padding: 14, gap: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                    <TextInput value={option.name} onChangeText={(value) => updateOption(option.id, { name: value })} placeholder="Option name" placeholderTextColor={palette.faint} style={[{ color: palette.text, fontSize: isMobile ? 14 : 14, fontWeight: '600', paddingVertical: 2, minWidth: 80, flexShrink: 1 }, webNoOutline]} />
                    <Text style={{ color: palette.faint, fontSize: isMobile ? 10 : 12 }}>option {index + 1}</Text>
                  </View>
                  {options.length > 1 || option.values.length ? (
                    <Pressable onPress={() => setOptions((prev) => (prev.length > 1 ? prev.filter((o) => o.id !== option.id) : [{ ...option, values: [], input: '' }]))}>
                      <Text style={{ color: palette.faint, fontSize: isMobile ? 12 : 12.5 }}>Remove</Text>
                    </Pressable>
                  ) : null}
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  {option.values.map((value) => {
                    const swatch = swatchForName(value);
                    return (
                      <View key={value} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 34, paddingLeft: swatch ? 6 : 12, paddingRight: 8, borderRadius: 999, backgroundColor: palette.softFill }}>
                        {swatch ? <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: swatch, borderWidth: 1, borderColor: palette.outline }} /> : null}
                        <Text style={{ color: palette.text, fontSize: isMobile ? 12 : 13.5, fontWeight: '600' }}>{value}</Text>
                        <Pressable accessibilityLabel={`Remove ${value}`} hitSlop={6} onPress={() => removeValue(option.id, value)}>
                          <X size={11} color={palette.faint} strokeWidth={2.8} />
                        </Pressable>
                      </View>
                    );
                  })}
                  <TextInput
                    value={option.input}
                    onChangeText={(value) => (value.endsWith(',') ? addValues(option.id, value) : updateOption(option.id, { input: value }))}
                    onSubmitEditing={() => addValues(option.id, option.input)}
                    blurOnSubmit={false}
                    placeholder={`Type a ${option.name.trim().toLowerCase() || 'value'}, press Enter`}
                    placeholderTextColor={palette.faint}
                    style={[cell, { height: 34, borderRadius: 999, paddingHorizontal: 14, width: isMobile ? '100%' : 230 }, webNoOutline]}
                  />
                </View>
                {suggestions.length ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                    <Text style={[sub, { fontSize: isMobile ? 10 : 12.5, paddingRight: 4 }]}>Used before:</Text>
                    {suggestions.map((value) => (
                      <Pressable key={value} onPress={() => addValues(option.id, value)} style={(state) => dashedPill(state)}>
                        <Text style={{ color: palette.muted, fontSize: isMobile ? 12 : 13 }}>+ {value}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}
          {options.length < 3 ? (
            <Pressable onPress={() => setOptions((prev) => [...prev, { id: newId(), name: otherOptionNames[0] ?? 'Size', values: [], input: '' }])} style={(state) => ({ ...dashedPill(state, 36), alignSelf: 'flex-start', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 6 })}>
              <Text style={{ color: palette.textSoft, fontSize: isMobile ? 12 : 13.5, fontWeight: '600' }}>+ Add another option</Text>
              {!isMobile ? <Text style={{ color: palette.faint, fontSize: 13.5 }}>e.g. Size, Lens type</Text> : null}
            </Pressable>
          ) : null}
        </>
      ) : null}
    </View>
  );

  const variantsCard = (
    <View style={{ ...card, paddingTop: isMobile ? 16 : 20, paddingBottom: isMobile ? 16 : 14, paddingHorizontal: isMobile ? 16 : 22, gap: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <Text style={h2}>{hasOptions ? `${rows.length} ${rows.length === 1 ? 'variant' : 'variants'}` : 'Stock'}</Text>
        <Text style={sub} numberOfLines={1}>{hasOptions ? (optionNames.length ? `Built from ${optionNames.join(' × ')}` : 'Add option values above') : 'One version, no options'}</Text>
      </View>
      {!hasOptions ? (
        <View style={{ flexDirection: 'row', gap: 14 }}>
          <View style={{ flex: 1, gap: 8 }}>
            <Text style={lab}>Stock</Text>
            <TextInput value={singleStock} onChangeText={(value) => setSingleStock(digitsOnly(value))} keyboardType="number-pad" placeholder="0" placeholderTextColor={palette.faint} style={[field, webNoOutline]} />
          </View>
          <View style={{ flex: 1, gap: 8 }}>
            <Text style={lab}>SKU</Text>
            <TextInput value={singleSku} onChangeText={setSingleSku} autoCapitalize="characters" placeholder={base} placeholderTextColor={palette.faint} style={[field, { color: palette.muted }, webNoOutline]} />
          </View>
        </View>
      ) : rows.length === 0 ? (
        <Text style={[sub, { paddingVertical: 8 }]}>Type values like Black, Gold or Clear above and the variants appear here.</Text>
      ) : isMobile ? (
        <View>
          {rows.map((row) => (
            <View key={row.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: palette.hairline }}>
              <Pressable accessibilityLabel={`Photo for ${row.label}`} onPress={() => { void pickVariantPhoto(row.key); }} style={{ width: 44, height: 44, borderRadius: 10, overflow: 'hidden', borderWidth: row.imageUrl ? 0 : 1, borderStyle: 'dashed', borderColor: palette.outline, alignItems: 'center', justifyContent: 'center' }}>
                {row.imageUrl ? <ResolvedAttachmentImage imageUrl={row.imageUrl} style={{ width: 44, height: 44 }} resizeMode="cover" /> : <Plus size={16} color={palette.faint} strokeWidth={2} />}
              </Pressable>
              <Pressable onPress={() => setEditingKey(row.key)} style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                  {swatchForName(row.label) ? <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: swatchForName(row.label) ?? undefined, borderWidth: 1, borderColor: palette.outline }} /> : null}
                  <Text style={{ color: palette.text, fontSize: 12, fontWeight: '500', flexShrink: 1 }} numberOfLines={1}>{row.label}</Text>
                </View>
                <Text style={{ color: palette.faint, fontSize: 10 }} numberOfLines={1}>{row.sku} · {row.effectivePrice ? formatNaira(row.effectivePrice) : 'Set price'}</Text>
              </Pressable>
              <TextInput value={row.stock} onChangeText={(value) => setOverride(row.key, { stock: digitsOnly(value) })} keyboardType="number-pad" placeholder="0" placeholderTextColor={palette.faint} accessibilityLabel={`Stock for ${row.label}`} style={[cell, { width: 76, textAlign: 'center', fontWeight: '600' }, webNoOutline]} />
            </View>
          ))}
          <Text style={[sub, { fontSize: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: palette.hairline }]}>Tap a row to change its price or SKU.</Text>
        </View>
      ) : (
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 4, paddingBottom: 10 }}>
            <Text style={[th, { width: 52 }]}>Photo</Text>
            <Text style={[th, { flex: 1 }]}>Variant</Text>
            <Text style={[th, { width: 170 }]}>SKU</Text>
            <Text style={[th, { width: 120 }]}>Stock</Text>
            <Text style={[th, { width: 150 }]}>Price</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, marginHorizontal: -12, marginBottom: 4, borderRadius: 12, backgroundColor: palette.softFill }}>
            <View style={{ width: 52 }} />
            <Text style={{ flex: 1, color: palette.muted, fontSize: 13 }}>Set all at once</Text>
            <View style={{ width: 170 }} />
            <TextInput value={bulkStock} onChangeText={(value) => applyBulk('stock', value)} keyboardType="number-pad" placeholder="Stock" placeholderTextColor={palette.faint} style={[cell, { width: 120 }, webNoOutline]} />
            <TextInput value={bulkPrice} onChangeText={(value) => applyBulk('price', value)} keyboardType="number-pad" placeholder={basePrice ? formatNaira(basePrice) : '₦ Price'} placeholderTextColor={palette.faint} style={[cell, { width: 150 }, webNoOutline]} />
          </View>
          {rows.map((row) => {
            const swatch = swatchForName(row.label);
            const duplicate = skus.filter((sku) => sku === row.sku.trim().toUpperCase()).length > 1;
            return (
              <View key={row.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, height: 60, borderTopWidth: 1, borderTopColor: palette.hairline }}>
                <Pressable accessibilityLabel={`Photo for ${row.label}`} onPress={() => { void pickVariantPhoto(row.key); }} style={(state) => ({ width: 44, height: 44, marginRight: 8, borderRadius: 10, overflow: 'hidden', borderWidth: row.imageUrl ? 0 : 1, borderStyle: 'dashed', borderColor: palette.outline, alignItems: 'center', justifyContent: 'center', backgroundColor: isHovered(state) ? palette.softFill : 'transparent' })}>
                  {row.imageUrl ? <ResolvedAttachmentImage imageUrl={row.imageUrl} style={{ width: 44, height: 44 }} resizeMode="cover" /> : <Plus size={16} color={palette.faint} strokeWidth={2} />}
                </Pressable>
                <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  {swatch ? <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: swatch, borderWidth: 1, borderColor: palette.outline }} /> : null}
                  <Text style={{ color: palette.text, fontSize: 15, fontWeight: '500', flexShrink: 1 }} numberOfLines={1}>{row.label}</Text>
                </View>
                <TextInput value={row.sku} onChangeText={(value) => setOverride(row.key, { sku: value.toUpperCase() })} autoCapitalize="characters" style={[cell, { width: 170, color: duplicate ? palette.warn : palette.muted, fontSize: 13, letterSpacing: 0.3, borderColor: duplicate ? palette.warnBorder : palette.border }, webNoOutline]} />
                <TextInput value={row.stock} onChangeText={(value) => setOverride(row.key, { stock: digitsOnly(value) })} keyboardType="number-pad" placeholder="0" placeholderTextColor={palette.faint} style={[cell, { width: 120, fontWeight: '600' }, webNoOutline]} />
                <TextInput value={row.ownPrice} onChangeText={(value) => setOverride(row.key, { price: formatCurrencyInput(value) })} keyboardType="number-pad" placeholder={basePrice ? formatNaira(basePrice) : '₦ Price'} placeholderTextColor={palette.faint} style={[cell, { width: 150 }, webNoOutline]} />
              </View>
            );
          })}
          <Text style={[sub, { fontSize: 12.5, paddingTop: 10, borderTopWidth: 1, borderTopColor: palette.hairline }]}>
            SKUs follow one pattern: {rows[0]?.sku ?? `${base}-BLK`}.{basePrice ? ` Leave price blank to use ${formatNaira(basePrice)}.` : ' Set a price above to fill blanks.'}
          </Text>
        </View>
      )}
    </View>
  );

  const summaryCard = (
    <View style={{ ...card, paddingVertical: 18, paddingHorizontal: isMobile ? 16 : 20, gap: 14 }}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <View style={{ width: 56, height: 56, borderRadius: 12, overflow: 'hidden', backgroundColor: coverUrl ? '#F4F4EF' : palette.softFill, alignItems: 'center', justifyContent: 'center' }}>
          {coverUrl ? <ResolvedAttachmentImage imageUrl={coverUrl} style={{ width: 56, height: 56 }} resizeMode="cover" /> : <Camera size={18} color={palette.faint} strokeWidth={1.8} />}
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Text style={{ color: palette.text, fontSize: 17, fontWeight: '700' }} numberOfLines={1}>{name.trim() || 'New product'}</Text>
          <Text style={sub} numberOfLines={1}>{[categories[0], basePrice ? formatNaira(basePrice) : null].filter(Boolean).join(' · ') || 'No category or price yet'}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: palette.hairline }}>
        {[
          { key: 'v', value: String(variantCount), label: variantCount === 1 ? 'variant' : 'variants' },
          { key: 'u', value: String(units), label: 'units' },
          { key: 's', value: formatCompactNaira(stockValue), label: 'stock value' },
        ].map((stat) => (
          <View key={stat.key} style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: palette.text, fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{stat.value}</Text>
            <Text style={[sub, { fontSize: isMobile ? 10 : 12 }]}>{stat.label}</Text>
          </View>
        ))}
      </View>
      <View style={{ gap: 9 }}>
        {checks.map((check) => (
          <View key={check.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
            <View style={{ width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: check.ok ? palette.tones.verified.dot : 'transparent', borderWidth: check.ok ? 0 : 1.5, borderColor: check.warn ? palette.warn : palette.outline }}>
              {check.ok ? <Check size={12} color={palette.page} strokeWidth={3} /> : null}
            </View>
            <Text style={{ flex: 1, color: check.warn ? palette.warn : palette.textSoft, fontSize: isMobile ? 12 : 13.5 }}>{check.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  const createLabel = isSubmitting ? 'Creating…' : hasOptions && rows.length > 1 ? `Create product · ${rows.length} variants` : 'Create product';
  const createButton = (height: number) => (
    <Pressable onPress={() => { void handleCreate(); }} disabled={!canCreate} style={(state) => ({ height, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: isHovered(state) && canCreate ? FYLL_LIME_HOVER : FYLL_LIME, opacity: canCreate ? (state.pressed ? 0.85 : 1) : 0.45 })}>
      <Text style={{ color: FYLL_LIME_INK, fontSize: 15, fontWeight: '600' }}>{createLabel}</Text>
    </Pressable>
  );

  const editingRow = rows.find((row) => row.key === editingKey) ?? null;

  return (
    <View style={{ flex: 1, backgroundColor: palette.page }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: isMobile ? 12 : 14, paddingHorizontal: isMobile ? 16 : 28, paddingVertical: isMobile ? 10 : 22, borderBottomWidth: 1, borderBottomColor: palette.hairline }}>
          <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/inventory' as never))} palette={palette} label="Back to inventory" />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={{ color: palette.text, fontSize: isMobile ? 16 : 22, fontWeight: isMobile ? '600' : '700' }}>New product</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ color: palette.faint, fontSize: isMobile ? 12 : 13 }}>{draftRestored ? 'Draft restored' : 'Saved as a draft as you go'}</Text>
              {draftRestored ? (
                <Pressable onPress={startOver}><Text style={{ color: palette.textSoft, fontSize: isMobile ? 12 : 13, fontWeight: '600' }}>Start over</Text></Pressable>
              ) : null}
            </View>
          </View>
        </View>

        <KeyboardAwareScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          enableOnAndroid
          extraScrollHeight={24}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ width: '100%', maxWidth: isWide ? 1456 : 760, alignSelf: isWide ? 'flex-start' : 'center', paddingHorizontal: isMobile ? 16 : 28, paddingTop: isMobile ? 16 : 24, paddingBottom: isMobile ? 120 + insets.bottom : 60 }}
        >
          {isWide ? (
            <View style={{ flexDirection: 'row', gap: 24, alignItems: 'flex-start' }}>
              <View style={{ flex: 1, minWidth: 0, gap: 18 }}>
                {basicsCard}
                {optionsCard}
                {variantsCard}
              </View>
              <View style={{ width: 360, gap: 12 }}>
                {summaryCard}
                {createButton(48)}
                <Pressable onPress={() => { void saveDraftAndLeave(); }} style={(state) => ({ height: 44, borderRadius: 999, borderWidth: 1, borderColor: palette.outline, alignItems: 'center', justifyContent: 'center', backgroundColor: isHovered(state) ? palette.softFill : 'transparent' })}>
                  <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>Save draft</Text>
                </Pressable>
                <Text style={[sub, { fontSize: 12.5, textAlign: 'center', lineHeight: 19 }]}>Variant photos are optional. Missing ones use the cover photo.</Text>
              </View>
            </View>
          ) : (
            <View style={{ gap: 14 }}>
              {basicsCard}
              {optionsCard}
              {variantsCard}
              {summaryCard}
              {!isMobile ? (
                <>
                  {createButton(48)}
                  <Pressable onPress={() => { void saveDraftAndLeave(); }} style={{ height: 44, borderRadius: 999, borderWidth: 1, borderColor: palette.outline, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>Save draft</Text>
                  </Pressable>
                </>
              ) : null}
            </View>
          )}
        </KeyboardAwareScrollView>

        {isMobile ? (
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, paddingBottom: Math.max(16, insets.bottom + 8), backgroundColor: palette.page, borderTopWidth: 1, borderTopColor: palette.hairline }}>
            {createButton(52)}
          </View>
        ) : null}

        {notice ? (
          <View pointerEvents="none" style={{ position: 'absolute', left: 20, right: 20, bottom: isMobile ? 100 : 28, alignItems: 'center' }}>
            <View style={{ backgroundColor: notice.type === 'success' ? '#111111' : '#7F1D1D', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 12 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600' }}>{notice.message}</Text>
            </View>
          </View>
        ) : null}

        <Modal visible={editingRow !== null} transparent animationType="fade" onRequestClose={() => setEditingKey(null)}>
          <Pressable onPress={() => setEditingKey(null)} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)', padding: 12 }}>
            <Pressable onPress={(event) => event.stopPropagation()} style={{ borderRadius: 22, backgroundColor: palette.card, padding: 18, gap: 14, marginBottom: insets.bottom }}>
              {editingRow ? (
                <>
                  <Text style={h2}>{editingRow.label}</Text>
                  <View style={{ gap: 8 }}>
                    <Text style={lab}>SKU</Text>
                    <TextInput value={editingRow.sku} onChangeText={(value) => setOverride(editingRow.key, { sku: value.toUpperCase() })} autoCapitalize="characters" style={[field, webNoOutline]} />
                  </View>
                  <View style={{ gap: 8 }}>
                    <Text style={lab}>Price</Text>
                    <TextInput value={editingRow.ownPrice} onChangeText={(value) => setOverride(editingRow.key, { price: formatCurrencyInput(value) })} keyboardType="number-pad" placeholder={basePrice ? `${formatNaira(basePrice)} (same as product)` : '₦ Price'} placeholderTextColor={palette.faint} style={[field, webNoOutline]} />
                  </View>
                  <Pressable onPress={() => setEditingKey(null)} style={{ height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.inverseBg }}>
                    <Text style={{ color: palette.inverseText, fontSize: 15, fontWeight: '600' }}>Done</Text>
                  </Pressable>
                </>
              ) : null}
            </Pressable>
          </Pressable>
        </Modal>
      </SafeAreaView>
    </View>
  );
}
