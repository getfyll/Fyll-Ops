import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Modal, Platform, Image, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Boxes, Plus, Search, ClipboardCheck, AlertTriangle, Trash2, X, Check, ArrowDownAZ, ArrowUpAZ, Clock, TrendingDown, TrendingUp, ChevronDown, MoreVertical, Camera, ImageIcon, Package } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import useAuthStore from '@/lib/state/auth-store';
import useFyllStore, { type WarehouseItem } from '@/lib/state/fyll-store';
import { useThemeColors } from '@/lib/theme';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { useTabBarHeight } from '@/lib/useTabBarHeight';
import { useImagePicker } from '@/hooks/useImagePicker';
import { uploadWarehouseMediaIfNeeded } from '@/lib/warehouse-media';
import { ResolvedAttachmentImage } from '@/components/ResolvedAttachmentImage';
import { InventoryMobileFab } from '@/components/InventoryMobileFab';
import { capitalizeDisplayLabel } from '@/lib/display-format';
import { SearchClearButton } from '@/components/SearchClearButton';
import { FYLL_LIME, FYLL_LIME_HOVER, FYLL_LIME_INK, isHovered, usePaymentsPalette } from '@/components/payments/payments-ui';
import { FilterPill, MenuPill } from '@/components/inventory/inventory-ui';

type WarehouseFormState = {
  name: string;
  category: string;
  unit: string;
  imageUrl: string | null;
  currentStock: string;
  notes: string;
};

const createId = () => Math.random().toString(36).slice(2, 14);

const defaultFormState: WarehouseFormState = {
  name: '',
  category: '',
  unit: 'pcs',
  imageUrl: null,
  currentStock: '',
  notes: '',
};

const addMonths = (isoDate: string, months: number) => {
  const base = new Date(isoDate);
  const next = new Date(base);
  next.setMonth(next.getMonth() + months);
  return next;
};

const formatDate = (isoDate?: string) => {
  if (!isoDate) return 'Not counted yet';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return 'Not counted yet';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

type WarehouseStockFilter = 'all' | 'low-stock' | 'in-stock' | 'out-of-stock' | 'overdue';
type WarehouseFrequencyFilter = 'all' | 'monthly' | 'bi-monthly';
type WarehouseSort = 'name-asc' | 'name-desc' | 'stock-low' | 'stock-high' | 'count-newest' | 'count-oldest';

const getWarehouseStockState = (item: WarehouseItem) => {
  if (item.currentStock === 0) return 'out-of-stock' as const;
  if (typeof item.reorderLevel === 'number' && item.currentStock <= item.reorderLevel) return 'low-stock' as const;
  return 'in-stock' as const;
};

export default function WarehouseScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { isDesktop, isMobile } = useBreakpoint();
  const isWeb = Platform.OS === 'web';
  const isWebDesktop = isDesktop && isWeb;
  const tabBarHeight = useTabBarHeight();
  const isDark = colors.bg.primary === '#111111';
  const palette = usePaymentsPalette();

  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const currentUser = useAuthStore((s) => s.currentUser);
  const warehouseItems = useFyllStore((s) => s.warehouseItems);
  const addWarehouseItem = useFyllStore((s) => s.addWarehouseItem);
  const updateWarehouseItem = useFyllStore((s) => s.updateWarehouseItem);
  const deleteWarehouseItem = useFyllStore((s) => s.deleteWarehouseItem);
  const recordWarehouseCount = useFyllStore((s) => s.recordWarehouseCount);
  const warehouseCategories = useFyllStore((s) => s.warehouseCategories);
  const warehouseUnits = useFyllStore((s) => s.warehouseUnits);
  const addWarehouseCategory = useFyllStore((s) => s.addWarehouseCategory);
  const addWarehouseUnit = useFyllStore((s) => s.addWarehouseUnit);
  const imagePicker = useImagePicker();

  const [searchQuery, setSearchQuery] = useState('');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [stockFilter, setStockFilter] = useState<WarehouseStockFilter>('all');
  const [frequencyFilter, setFrequencyFilter] = useState<WarehouseFrequencyFilter>('all');
  const [sortBy, setSortBy] = useState<WarehouseSort>('name-asc');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [form, setForm] = useState<WarehouseFormState>(defaultFormState);
  const [countModalItemId, setCountModalItemId] = useState<string | null>(null);
  const [countQuantity, setCountQuantity] = useState('');
  const [countNotes, setCountNotes] = useState('');
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showUnitDropdown, setShowUnitDropdown] = useState(false);
  const [rowActionsItemId, setRowActionsItemId] = useState<string | null>(null);

  const separatorColor = isDark ? '#2F2F2F' : '#E5E7EB';

  const activeFilterCount = (stockFilter !== 'all' ? 1 : 0) + (frequencyFilter !== 'all' ? 1 : 0) + (sortBy !== 'name-asc' ? 1 : 0) + (categoryFilter !== 'all' ? 1 : 0);
  const filteredWarehouseCategories = useMemo(() => {
    const query = form.category.trim().toLowerCase();
    if (!query) return warehouseCategories;
    return warehouseCategories.filter((option) => option.name.toLowerCase().includes(query));
  }, [form.category, warehouseCategories]);
  const filteredWarehouseUnits = useMemo(() => {
    const query = form.unit.trim().toLowerCase();
    if (!query) return warehouseUnits;
    return warehouseUnits.filter((option) => option.name.toLowerCase().includes(query));
  }, [form.unit, warehouseUnits]);

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    let result = warehouseItems.filter((item) => (
      item.name.toLowerCase().includes(query)
      || item.category.toLowerCase().includes(query)
      || item.unit.toLowerCase().includes(query)
    ));

    if (categoryFilter !== 'all') {
      result = result.filter((item) => item.category === categoryFilter);
    }

    if (stockFilter !== 'all') {
      result = result.filter((item) => {
        const nextDue = addMonths(item.lastCountedAt ?? item.createdAt, item.countFrequency === 'Bi-Monthly' ? 2 : 1);
        const overdue = nextDue.getTime() < Date.now();
        const stockState = getWarehouseStockState(item);
        if (stockFilter === 'low-stock') return stockState === 'low-stock';
        if (stockFilter === 'in-stock') return stockState === 'in-stock';
        if (stockFilter === 'out-of-stock') return stockState === 'out-of-stock';
        if (stockFilter === 'overdue') return overdue;
        return true;
      });
    }

    if (frequencyFilter !== 'all') {
      result = result.filter((item) => (
        frequencyFilter === 'monthly'
          ? item.countFrequency === 'Monthly'
          : item.countFrequency === 'Bi-Monthly'
      ));
    }

    result = [...result].sort((a, b) => {
      if (sortBy === 'name-desc') return b.name.localeCompare(a.name);
      if (sortBy === 'stock-low') return a.currentStock - b.currentStock;
      if (sortBy === 'stock-high') return b.currentStock - a.currentStock;
      if (sortBy === 'count-newest') return new Date(b.lastCountedAt ?? b.createdAt).getTime() - new Date(a.lastCountedAt ?? a.createdAt).getTime();
      if (sortBy === 'count-oldest') return new Date(a.lastCountedAt ?? a.createdAt).getTime() - new Date(b.lastCountedAt ?? b.createdAt).getTime();
      return a.name.localeCompare(b.name);
    });

    return result;
  }, [searchQuery, warehouseItems, stockFilter, frequencyFilter, sortBy, categoryFilter]);

  const itemStatus = useMemo(() => {
    const now = new Date();
    let lowStock = 0;
    let outOfStock = 0;
    let overdue = 0;
    let units = 0;

    warehouseItems.forEach((item) => {
      units += item.currentStock;
      const stockState = getWarehouseStockState(item);
      if (stockState === 'low-stock') {
        lowStock += 1;
      }
      if (stockState === 'out-of-stock') outOfStock += 1;
      const baseDate = item.lastCountedAt ?? item.createdAt;
      const nextDue = addMonths(baseDate, item.countFrequency === 'Bi-Monthly' ? 2 : 1);
      if (nextDue.getTime() < now.getTime()) {
        overdue += 1;
      }
    });

    return {
      total: warehouseItems.length,
      units,
      lowStock,
      outOfStock,
      overdue,
    };
  }, [warehouseItems]);

  const stockFilterCounts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const counts: Record<WarehouseStockFilter, number> = { all: 0, 'low-stock': 0, 'in-stock': 0, 'out-of-stock': 0, overdue: 0 };
    warehouseItems.forEach((item) => {
      if (query && !item.name.toLowerCase().includes(query) && !item.category.toLowerCase().includes(query) && !item.unit.toLowerCase().includes(query)) return;
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return;
      counts.all += 1;
      counts[getWarehouseStockState(item)] += 1;
      const nextDue = addMonths(item.lastCountedAt ?? item.createdAt, item.countFrequency === 'Bi-Monthly' ? 2 : 1);
      if (nextDue.getTime() < Date.now()) counts.overdue += 1;
    });
    return counts;
  }, [categoryFilter, searchQuery, warehouseItems]);

  const categoryOptions = useMemo(() => [
    { key: 'all', label: 'All' },
    ...Array.from(new Set(warehouseItems.map((item) => item.category).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b))
      .map((category) => ({ key: category, label: category })),
  ], [warehouseItems]);

  const frequencyOptions = [
    { key: 'all', label: 'All cycles' },
    { key: 'monthly', label: 'Monthly' },
    { key: 'bi-monthly', label: 'Bi-monthly' },
  ];

  const sortOptions = [
    { key: 'name-asc', label: 'Name A–Z' },
    { key: 'name-desc', label: 'Name Z–A' },
    { key: 'stock-low', label: 'Lowest stock' },
    { key: 'stock-high', label: 'Highest stock' },
    { key: 'count-newest', label: 'Recently counted' },
    { key: 'count-oldest', label: 'Oldest count' },
  ];

  const openCreateModal = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setEditingItemId(null);
    setForm(defaultFormState);
    setShowCategoryDropdown(false);
    setShowUnitDropdown(false);
    setItemModalOpen(true);
  };

  const openEditModal = (item: WarehouseItem) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setEditingItemId(item.id);
    setForm({
      name: item.name,
      category: item.category,
      unit: item.unit,
      imageUrl: item.imageUrl ?? null,
      currentStock: String(item.currentStock),
      notes: item.notes ?? '',
    });
    setShowCategoryDropdown(false);
    setShowUnitDropdown(false);
    setItemModalOpen(true);
  };

  const openCountModal = (item: WarehouseItem) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setCountModalItemId(item.id);
    setCountQuantity(String(item.currentStock));
    setCountNotes('');
  };

  const submitItem = async () => {
    const normalizedName = form.name.trim();
    if (!normalizedName) return;
    const now = new Date().toISOString();
    const currentStock = Math.max(0, Number(form.currentStock || 0));
    const normalizedCategory = form.category.trim() || 'General';
    const normalizedUnit = form.unit.trim() || 'pcs';
    const itemId = editingItemId ?? createId();
    const nextImageUrl = await uploadWarehouseMediaIfNeeded({
      businessId,
      itemId,
      uri: form.imageUrl,
      fileName: 'main.jpg',
    });

    if (editingItemId) {
      updateWarehouseItem(editingItemId, {
        name: normalizedName,
        category: normalizedCategory,
        unit: normalizedUnit,
        imageUrl: nextImageUrl,
        currentStock,
        notes: form.notes.trim(),
      }, businessId);
    } else {
      const newItem: WarehouseItem = {
        id: itemId,
        name: normalizedName,
        category: normalizedCategory,
        unit: normalizedUnit,
        imageUrl: nextImageUrl,
        currentStock,
        countFrequency: 'Monthly',
        notes: form.notes.trim(),
        createdAt: now,
        updatedAt: now,
        countHistory: [],
      };
      addWarehouseItem(newItem, businessId);
    }

    addWarehouseCategory(normalizedCategory, businessId);
    addWarehouseUnit(normalizedUnit, businessId);

    setItemModalOpen(false);
    setEditingItemId(null);
    setForm(defaultFormState);
    setShowCategoryDropdown(false);
    setShowUnitDropdown(false);
  };

  const handleSelectWarehouseCategory = (value: string) => {
    setForm((previous) => ({ ...previous, category: value }));
    setShowCategoryDropdown(false);
  };

  const handleAddWarehouseCategoryOption = () => {
    const value = form.category.trim();
    if (!value) return;
    addWarehouseCategory(value, businessId);
    setShowCategoryDropdown(false);
  };

  const handleSelectWarehouseUnit = (value: string) => {
    setForm((previous) => ({ ...previous, unit: value }));
    setShowUnitDropdown(false);
  };

  const handleAddWarehouseUnitOption = () => {
    const value = form.unit.trim();
    if (!value) return;
    addWarehouseUnit(value, businessId);
    setShowUnitDropdown(false);
  };

  const handlePickWarehouseImage = async () => {
    const uri = await imagePicker.pickImage();
    if (uri) {
      setForm((previous) => ({ ...previous, imageUrl: uri }));
    }
  };

  const handleRemoveWarehouseImage = () => {
    setForm((previous) => ({ ...previous, imageUrl: null }));
  };

  const submitCount = () => {
    if (!countModalItemId) return;
    const quantity = Math.max(0, Number(countQuantity || 0));
    recordWarehouseCount(
      countModalItemId,
      {
        quantity,
        countedBy: currentUser?.name,
        notes: countNotes.trim(),
      },
      businessId
    );
    setCountModalItemId(null);
    setCountQuantity('');
    setCountNotes('');
  };

  const openWarehouseItem = (itemId: string) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setRowActionsItemId(null);
    router.push(`/inventory/warehouse/${itemId}`);
  };

  const confirmDelete = () => {
    if (!deleteItemId) return;
    deleteWarehouseItem(deleteItemId, businessId);
    setDeleteItemId(null);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.page }} edges={isWebDesktop ? [] : ['top']}>
      <ScrollView
        style={{ flex: 1, backgroundColor: palette.page }}
        stickyHeaderIndices={!isWebDesktop ? [2] : undefined}
        contentContainerStyle={{
          width: '100%',
          maxWidth: isWebDesktop ? 1456 : 760,
          alignSelf: isWebDesktop ? 'flex-start' : 'center',
          paddingHorizontal: isWebDesktop ? 28 : 16,
          paddingBottom: tabBarHeight + 32,
          gap: isWebDesktop ? 18 : 14,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ paddingTop: isWebDesktop ? 36 : 14, paddingBottom: isWebDesktop ? 6 : 0, flexDirection: 'row', alignItems: isWebDesktop ? 'flex-end' : 'center', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <Text style={{ color: palette.text, fontSize: 30, fontWeight: '700', letterSpacing: -0.6 }} numberOfLines={1}>Warehouse</Text>
            {isWebDesktop ? <Text style={{ color: palette.faint, fontSize: 14 }}>Supplies, materials and physical stock counts.</Text> : null}
          </View>
          <View style={{ flexDirection: 'row', gap: isWebDesktop ? 10 : 8, alignItems: 'center' }}>
            <Pressable
              onPress={() => {
                if (Platform.OS !== 'web') {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                }
                router.replace('/inventory-audit');
              }}
              style={(state) => ({
                paddingHorizontal: isWebDesktop ? 16 : 0,
                width: isWebDesktop ? undefined : 40,
                height: 40,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
                backgroundColor: isHovered(state) ? palette.softFill : 'transparent',
                borderWidth: 1,
                borderColor: palette.outline,
                borderRadius: 999,
              })}
            >
              <ClipboardCheck size={15} color={palette.text} strokeWidth={2} />
              {isWebDesktop ? <Text style={{ color: palette.text, fontWeight: '600', fontSize: 14 }}>Stock audit</Text> : null}
            </Pressable>
            <Pressable
              onPress={openCreateModal}
              style={(state) => ({
                backgroundColor: isHovered(state) ? FYLL_LIME_HOVER : FYLL_LIME,
                borderRadius: 999,
                paddingHorizontal: 16,
                height: 40,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 6,
                opacity: state.pressed ? 0.85 : 1,
              })}
            >
              <Plus size={15} color={FYLL_LIME_INK} strokeWidth={2.6} />
              <Text style={{ color: FYLL_LIME_INK, fontWeight: '600', fontSize: 14 }}>{isWebDesktop ? 'Add item' : 'Add'}</Text>
            </Pressable>
          </View>
        </View>
        {isWebDesktop ? (
          <View style={{ flexDirection: 'row', borderRadius: 20, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, overflow: 'hidden' }}>
            {[
              { label: 'Warehouse items', value: itemStatus.total, sub: `${itemStatus.units.toLocaleString()} units recorded` },
              { label: 'Low stock', value: itemStatus.lowStock, sub: 'At or below reorder level', dot: palette.tones.awaiting.dot, filter: 'low-stock' as WarehouseStockFilter },
              { label: 'Out of stock', value: itemStatus.outOfStock, sub: 'Needs replenishing', dot: palette.danger, filter: 'out-of-stock' as WarehouseStockFilter },
              { label: 'Count overdue', value: itemStatus.overdue, sub: 'Physical count due', dot: palette.faint, filter: 'overdue' as WarehouseStockFilter },
            ].map((tile, index) => (
              <Pressable
                key={tile.label}
                disabled={!tile.filter}
                onPress={() => tile.filter && setStockFilter(tile.filter)}
                style={(state) => ({ flex: index === 0 ? 1.3 : 1, minWidth: 0, gap: 4, paddingVertical: 18, paddingHorizontal: 22, borderLeftWidth: index === 0 ? 0 : 1, borderLeftColor: palette.hairline, justifyContent: 'center', backgroundColor: tile.filter && isHovered(state) ? palette.cardHover : 'transparent' })}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {tile.dot ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: tile.dot }} /> : null}
                  <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' }}>{tile.label}</Text>
                </View>
                <Text style={{ color: palette.text, fontSize: index === 0 ? 28 : 22, fontWeight: '600', letterSpacing: -0.5, fontVariant: ['tabular-nums'] }}>{tile.value}</Text>
                <Text style={{ color: palette.faint, fontSize: 13 }} numberOfLines={1}>{tile.sub}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={{ borderRadius: 20, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 16, gap: 14 }}>
            <View style={{ gap: 4 }}>
              <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' }}>Warehouse stock</Text>
              <Text style={{ color: palette.text, fontSize: 32, fontWeight: '600', letterSpacing: -0.8, fontVariant: ['tabular-nums'] }}>{itemStatus.units.toLocaleString()}</Text>
              <Text style={{ color: palette.faint, fontSize: 13 }}>Units across {itemStatus.total} items</Text>
            </View>
            <View style={{ height: 1, backgroundColor: palette.hairline }} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {[
                { label: 'Low stock', value: itemStatus.lowStock, dot: palette.tones.awaiting.dot, filter: 'low-stock' as WarehouseStockFilter },
                { label: 'Out', value: itemStatus.outOfStock, dot: palette.danger, filter: 'out-of-stock' as WarehouseStockFilter },
                { label: 'Overdue', value: itemStatus.overdue, dot: palette.faint, filter: 'overdue' as WarehouseStockFilter },
              ].map((tile) => (
                <Pressable key={tile.label} onPress={() => setStockFilter(tile.filter)} style={{ flex: 1, gap: 3 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: tile.dot }} />
                    <Text style={{ color: palette.muted, fontSize: 12 }}>{tile.label}</Text>
                  </View>
                  <Text style={{ color: palette.text, fontSize: 18, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{tile.value}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {isWebDesktop ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, zIndex: 30 }}>
            <View
              style={{
                height: 44,
                width: 340,
                flexShrink: 0,
                paddingLeft: 16,
                paddingRight: 8,
                borderRadius: 999,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                backgroundColor: palette.inputBg,
                borderWidth: 1,
                borderColor: palette.border,
              }}
            >
              <Search size={17} color={palette.faint} strokeWidth={2} />
              <TextInput
                placeholder="Search warehouse items..."
                placeholderTextColor={colors.input.placeholder}
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={[{ flex: 1, height: '100%', paddingVertical: 0, color: palette.text, fontSize: 14.5 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null]}
                selectionColor={palette.text}
              />
              <SearchClearButton visible={Boolean(searchQuery.trim())} onPress={() => setSearchQuery('')} />
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ flex: 1, flexGrow: 0 }}
              contentContainerStyle={{ gap: 8, alignItems: 'center' }}
            >
              {[
                { key: 'all', label: 'All' },
                { key: 'low-stock', label: 'Low stock' },
                { key: 'out-of-stock', label: 'Out of stock' },
                { key: 'in-stock', label: 'In stock' },
              ].map((option) => (
                <FilterPill
                  key={option.key}
                  label={option.label}
                  count={stockFilterCounts[option.key as WarehouseStockFilter]}
                  active={stockFilter === option.key}
                  onPress={() => setStockFilter(option.key as typeof stockFilter)}
                  palette={palette}
                />
              ))}
            </ScrollView>
            <MenuPill prefix="Category" value={categoryFilter} options={categoryOptions} onSelect={setCategoryFilter} palette={palette} />
            <MenuPill prefix="Cycle" value={frequencyFilter} options={frequencyOptions} onSelect={(value) => setFrequencyFilter(value as WarehouseFrequencyFilter)} palette={palette} />
            <MenuPill prefix="Sort" value={sortBy} options={sortOptions} onSelect={(value) => setSortBy(value as WarehouseSort)} palette={palette} />
          </View>
        ) : (
          <View style={{ gap: 10, backgroundColor: palette.page, paddingTop: 12, paddingBottom: 14, zIndex: 30 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1, height: 48, paddingLeft: 16, paddingRight: 8, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: palette.inputBg, borderWidth: 1, borderColor: palette.border }}>
                <Search size={17} color={palette.faint} strokeWidth={2} />
                <TextInput
                  placeholder="Search items or categories"
                  placeholderTextColor={palette.faint}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  style={{ flex: 1, height: '100%', paddingVertical: 0, color: palette.text, fontSize: 14.5 }}
                  selectionColor={palette.text}
                />
                <SearchClearButton visible={Boolean(searchQuery.trim())} onPress={() => setSearchQuery('')} />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sort and count cycle"
                onPress={() => {
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowFilterMenu(true);
                }}
                style={(state) => ({ height: 48, paddingHorizontal: 14, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: activeFilterCount > 0 ? palette.inverseBg : palette.outline, opacity: state.pressed ? 0.7 : 1 })}
              >
                <ArrowDownAZ size={14} color={palette.textSoft} strokeWidth={2.2} />
                <Text style={{ color: palette.textSoft, fontSize: 13, fontWeight: '600' }}>Sort</Text>
              </Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginRight: -16 }} contentContainerStyle={{ gap: 8, paddingRight: 16, alignItems: 'center' }}>
              {[
                { key: 'all', label: 'All' },
                { key: 'low-stock', label: 'Low stock' },
                { key: 'out-of-stock', label: 'Out of stock' },
                { key: 'in-stock', label: 'In stock' },
                { key: 'overdue', label: 'Count overdue' },
              ].map((option) => (
                <FilterPill key={option.key} label={option.label} count={stockFilterCounts[option.key as WarehouseStockFilter]} active={stockFilter === option.key} onPress={() => setStockFilter(option.key as WarehouseStockFilter)} palette={palette} textSize={12} />
              ))}
            </ScrollView>
          </View>
        )}

        <View>
          {filteredItems.length === 0 ? (
            <View
              style={{
                borderWidth: 1,
                borderColor: palette.border,
                borderRadius: 18,
                paddingVertical: 46,
                paddingHorizontal: 16,
                alignItems: 'center',
                backgroundColor: palette.card,
              }}
            >
              <View style={{ width: 64, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.softFill }}>
                <Boxes size={28} color={palette.faint} strokeWidth={1.6} />
              </View>
              <Text style={{ color: palette.text, fontWeight: '600', fontSize: 16, marginTop: 14 }}>{warehouseItems.length === 0 ? 'No warehouse items yet' : 'No items match'}</Text>
              <Text style={{ color: palette.muted, fontSize: 14, marginTop: 4, textAlign: 'center' }}>{warehouseItems.length === 0 ? 'Add your first item to start physical stock counting.' : 'Try another search or filter.'}</Text>
              {warehouseItems.length === 0 ? (
                <Pressable onPress={openCreateModal} style={(state) => ({ height: 40, paddingHorizontal: 18, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, backgroundColor: isHovered(state) ? FYLL_LIME_HOVER : FYLL_LIME })}>
                  <Plus size={15} color={FYLL_LIME_INK} strokeWidth={2.6} />
                  <Text style={{ color: FYLL_LIME_INK, fontSize: 14, fontWeight: '600' }}>Add item</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <View
              style={{
                position: 'relative',
                borderWidth: 1,
                borderColor: palette.border,
                borderRadius: 18,
                overflow: 'visible',
                backgroundColor: palette.card,
                zIndex: rowActionsItemId ? 40 : 1,
              }}
            >
              {!isWebDesktop && rowActionsItemId ? (
                <Pressable
                  onPress={() => setRowActionsItemId(null)}
                  style={[StyleSheet.absoluteFillObject, { zIndex: 40 }]}
                />
              ) : null}

              {isWebDesktop ? (
                <>
                  <View style={{ paddingHorizontal: 22, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: palette.hairline }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                      <Text style={{ color: palette.faint, flex: 2.4, fontSize: 11.5, fontWeight: '600', letterSpacing: 0.6 }}>ITEM</Text>
                      <Text style={{ color: palette.faint, flex: 1.1, fontSize: 11.5, fontWeight: '600', letterSpacing: 0.6 }}>CATEGORY</Text>
                      <Text style={{ color: palette.faint, width: 110, textAlign: 'right', fontSize: 11.5, fontWeight: '600', letterSpacing: 0.6 }}>STOCK</Text>
                      <Text style={{ color: palette.faint, width: 110, fontSize: 11.5, fontWeight: '600', letterSpacing: 0.6 }}>COUNT CYCLE</Text>
                      <Text style={{ color: palette.faint, width: 120, fontSize: 11.5, fontWeight: '600', letterSpacing: 0.6 }}>LAST COUNTED</Text>
                      <View style={{ width: 36 }} />
                    </View>
                  </View>

                  {filteredItems.map((item, index) => {
                    return (
                      <View
                        key={item.id}
                        style={{
                          position: 'relative',
                          borderBottomWidth: index === filteredItems.length - 1 ? 0 : 1,
                          borderBottomColor: separatorColor,
                          paddingHorizontal: 22,
                          paddingVertical: 13,
                          zIndex: rowActionsItemId === item.id ? 30 : 1,
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                          <Pressable
                            onPress={() => openWarehouseItem(item.id)}
                            className="active:opacity-70"
                            style={{ flex: 2.4, minWidth: 0, flexDirection: 'row', alignItems: 'center' }}
                          >
                            {item.imageUrl ? (
                              <View style={{ width: 40, height: 40, borderRadius: 11, overflow: 'hidden', borderWidth: 1, borderColor: palette.border, marginRight: 11 }}>
                                <ResolvedAttachmentImage imageUrl={item.imageUrl} style={{ width: 40, height: 40 }} resizeMode="cover" />
                              </View>
                            ) : (
                              <View
                                style={{
                                  width: 40,
                                  height: 40,
                                  borderRadius: 11,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  backgroundColor: palette.softFill,
                                  borderWidth: 1,
                                  borderColor: palette.border,
                                  marginRight: 11,
                                }}
                              >
                                <Package size={18} color={palette.faint} strokeWidth={1.8} />
                              </View>
                            )}
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{capitalizeDisplayLabel(item.name)}</Text>
                              <Text style={{ color: palette.faint, fontSize: 12, marginTop: 2 }} numberOfLines={1}>{item.notes || `${item.currentStock} ${item.unit} on hand`}</Text>
                            </View>
                          </Pressable>

                          <Text style={{ color: palette.textSoft, flex: 1.1, fontSize: 13 }} numberOfLines={1}>{item.category}</Text>
                          <Text style={{ color: palette.text, width: 110, textAlign: 'right', fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{item.currentStock} <Text style={{ color: palette.faint, fontSize: 12, fontWeight: '400' }}>{item.unit}</Text></Text>
                          <Text style={{ color: palette.textSoft, width: 110, fontSize: 13 }}>{item.countFrequency}</Text>
                          <Text style={{ color: palette.textSoft, width: 120, fontSize: 13 }}>{formatDate(item.lastCountedAt)}</Text>
                          <View style={{ width: 36, flexDirection: 'row', justifyContent: 'flex-end' }}>
                            <Pressable
                              onPress={() => {
                                if (Platform.OS !== 'web') {
                                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                }
                                setRowActionsItemId((current) => (current === item.id ? null : item.id));
                              }}
                              className="active:opacity-70"
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: 16,
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderWidth: 1,
                                borderColor: palette.outline,
                                backgroundColor: palette.softFill,
                              }}
                            >
                              <MoreVertical size={14} color={palette.text} strokeWidth={2.2} />
                            </Pressable>
                          </View>
                        </View>

                        {rowActionsItemId === item.id ? (
                          <View
                            style={{
                              position: 'absolute',
                              top: 44,
                              right: -6,
                              width: 188,
                              borderRadius: 12,
                              backgroundColor: palette.card,
                              borderWidth: 1,
                              borderColor: palette.border,
                              padding: 8,
                              shadowColor: '#000000',
                              shadowOpacity: 0.16,
                              shadowRadius: 10,
                              shadowOffset: { width: 0, height: 6 },
                              elevation: 8,
                            }}
                          >
                            <Pressable
                              onPress={() => {
                                setRowActionsItemId(null);
                                openCountModal(item);
                              }}
                              style={{ height: 36, borderRadius: 8, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, marginBottom: 6 }}
                            >
                              <Text style={{ color: palette.text, fontWeight: '500', fontSize: 12 }}>Record count</Text>
                            </Pressable>

                            <Pressable
                              onPress={() => {
                                setRowActionsItemId(null);
                                openEditModal(item);
                              }}
                              style={{ height: 36, borderRadius: 8, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, marginBottom: 6 }}
                            >
                              <Text style={{ color: palette.text, fontWeight: '500', fontSize: 12 }}>Edit item</Text>
                            </Pressable>

                            <Pressable
                              onPress={() => {
                                setRowActionsItemId(null);
                                setDeleteItemId(item.id);
                              }}
                              style={{ height: 36, borderRadius: 8, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 }}
                            >
                              <Text style={{ color: palette.danger, fontWeight: '500', fontSize: 12 }}>Delete item</Text>
                            </Pressable>
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                </>
              ) : (
                filteredItems.map((item, index) => {
                  const stockState = getWarehouseStockState(item);
                  const stockLabel = stockState === 'out-of-stock' ? 'Out of stock' : stockState === 'low-stock' ? 'Low stock' : 'In stock';
                  const stockColor = stockState === 'out-of-stock' ? palette.danger : stockState === 'low-stock' ? palette.tones.awaiting.dot : palette.tones.verified.dot;
                  return (
                    <View
                      key={item.id}
                      style={{
                        position: 'relative',
                        backgroundColor: palette.card,
                        borderBottomWidth: index === filteredItems.length - 1 ? 0 : 1,
                        borderBottomColor: palette.hairline,
                        zIndex: rowActionsItemId === item.id ? 50 : 1,
                      }}
                    >
                      <View className="p-3 flex-row items-center">
                        <Pressable
                          onPress={() => openWarehouseItem(item.id)}
                          className="flex-row items-center flex-1 active:opacity-70"
                        >
                          {item.imageUrl ? (
                            <View className="w-12 h-12 rounded-xl overflow-hidden" style={{ borderWidth: 1, borderColor: palette.border }}>
                              <ResolvedAttachmentImage
                                imageUrl={item.imageUrl}
                                style={{ width: 48, height: 48 }}
                                resizeMode="cover"
                              />
                            </View>
                          ) : (
                            <View
                              className="w-12 h-12 rounded-xl items-center justify-center"
                              style={{ backgroundColor: palette.softFill, borderWidth: 1, borderColor: palette.border }}
                            >
                              <Package size={22} color={palette.faint} strokeWidth={1.6} />
                            </View>
                          )}
                          <View className="ml-3 flex-1">
                            <Text style={{ color: palette.text, fontWeight: '600' }} className="text-base">
                              {capitalizeDisplayLabel(item.name)}
                            </Text>
                            <Text style={{ color: palette.faint }} className="text-xs mt-0.5">
                              {item.category} · {item.currentStock} {item.unit}
                            </Text>
                          </View>
                        </Pressable>
                        <View className="flex-row items-center">
                          <View
                            className="rounded-full px-3 py-1 flex-row items-center mr-2"
                            style={{ backgroundColor: `${stockColor}18` }}
                          >
                            <Text style={{ color: stockColor }} className="text-xs font-semibold">
                              {stockLabel}
                            </Text>
                          </View>
                          <Pressable
                            onPress={() => {
                              setRowActionsItemId((current) => (current === item.id ? null : item.id));
                            }}
                            className="active:opacity-70"
                            style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}
                          >
                            <MoreVertical size={18} color={palette.faint} strokeWidth={2} />
                          </Pressable>
                        </View>
                      </View>

                      {rowActionsItemId === item.id ? (
                        <View
                          style={{
                            position: 'absolute',
                            top: 52,
                            right: 10,
                            width: 168,
                            borderRadius: 12,
                            backgroundColor: palette.card,
                            borderWidth: 1,
                            borderColor: palette.border,
                            padding: 8,
                            shadowColor: '#000000',
                            shadowOpacity: 0.18,
                            shadowRadius: 10,
                            shadowOffset: { width: 0, height: 6 },
                            elevation: 10,
                          }}
                        >
                          <Pressable
                            onPress={() => {
                              setRowActionsItemId(null);
                              openCountModal(item);
                            }}
                            style={{ height: 34, borderRadius: 8, justifyContent: 'center', paddingHorizontal: 10, marginBottom: 6 }}
                          >
                            <Text style={{ color: palette.text, fontWeight: '500', fontSize: 12 }}>Record count</Text>
                          </Pressable>

                          <Pressable
                            onPress={() => {
                              setRowActionsItemId(null);
                              openEditModal(item);
                            }}
                            style={{ height: 34, borderRadius: 8, justifyContent: 'center', paddingHorizontal: 10, marginBottom: 6 }}
                          >
                            <Text style={{ color: palette.text, fontWeight: '500', fontSize: 12 }}>Edit item</Text>
                          </Pressable>

                          <Pressable
                            onPress={() => {
                              setRowActionsItemId(null);
                              setDeleteItemId(item.id);
                            }}
                            style={{ height: 34, borderRadius: 8, justifyContent: 'center', paddingHorizontal: 10 }}
                          >
                            <Text style={{ color: palette.danger, fontWeight: '500', fontSize: 12 }}>Delete item</Text>
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                  );
                })
              )}
            </View>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={showFilterMenu}
        animationType={isMobile ? 'slide' : 'none'}
        transparent
        onRequestClose={() => setShowFilterMenu(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            flexDirection: isWebDesktop ? 'row' : 'column',
            justifyContent: 'flex-end',
          }}
          onPress={() => setShowFilterMenu(false)}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            className={isWebDesktop ? undefined : 'rounded-t-3xl'}
            style={
              isWebDesktop
                ? {
                    backgroundColor: palette.card,
                    width: 400,
                    maxWidth: '100%',
                    borderTopLeftRadius: 24,
                    borderBottomLeftRadius: 24,
                    overflow: 'hidden',
                    borderWidth: 1,
                    borderColor: palette.border,
                  }
                : { backgroundColor: palette.card, maxHeight: '76%', borderWidth: 1, borderColor: palette.border }
            }
          >
            {!isWebDesktop && (
              <View className="items-center py-3">
                <View className="w-10 h-1 rounded-full" style={{ backgroundColor: palette.outline }} />
              </View>
            )}

            <View className="flex-row items-center justify-between px-5 pb-4" style={{ borderBottomWidth: 0.5, borderBottomColor: separatorColor, paddingTop: isWebDesktop ? 20 : 0 }}>
              <Text style={{ color: palette.text }} className="font-semibold text-lg">Filter & sort</Text>
              <Pressable
                onPress={() => setShowFilterMenu(false)}
                className="w-8 h-8 rounded-full items-center justify-center active:opacity-50"
                style={{ backgroundColor: palette.softFill }}
              >
                <X size={18} color={palette.muted} strokeWidth={2} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={isWebDesktop ? { flex: 1 } : undefined}>
              <View className="px-5 pt-4">
                <Text style={{ color: palette.faint }} className="text-xs font-semibold uppercase tracking-wider mb-3">Stock status</Text>

                {[
                  { key: 'all', label: 'All items', description: 'Every warehouse item', icon: Boxes, helperColor: '#10B981' },
                  { key: 'low-stock', label: 'Low stock', description: 'At or below reorder level', icon: AlertTriangle, helperColor: '#F59E0B' },
                  { key: 'in-stock', label: 'In stock', description: 'Items with stock above zero', icon: Check, helperColor: '#10B981' },
                  { key: 'out-of-stock', label: 'Out of stock', description: 'Items currently at zero', icon: TrendingDown, helperColor: '#EF4444' },
                  { key: 'overdue', label: 'Count overdue', description: 'Due date for count has passed', icon: Clock, helperColor: '#EF4444' },
                ].map((option) => {
                  const Icon = option.icon;
                  return (
                    <Pressable
                      key={option.key}
                      onPress={() => {
                        if (Platform.OS !== 'web') Haptics.selectionAsync();
                        setStockFilter(option.key as typeof stockFilter);
                      }}
                      className="flex-row items-center py-3 active:opacity-70"
                    >
                      <Icon size={18} color={stockFilter === option.key ? option.helperColor : palette.faint} strokeWidth={2} />
                      <View className="flex-1 ml-3">
                        <Text style={{ color: palette.text }} className="font-medium text-sm">{option.label}</Text>
                        <Text style={{ color: palette.faint }} className="text-xs mt-0.5">{option.description}</Text>
                      </View>
                      {stockFilter === option.key && (
                        <View className="w-5 h-5 rounded-full items-center justify-center" style={{ backgroundColor: FYLL_LIME }}>
                          <Check size={12} color={FYLL_LIME_INK} strokeWidth={3} />
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>

              <View className="px-5 pt-4" style={{ borderTopWidth: 0.5, borderTopColor: separatorColor, marginTop: 8 }}>
                <Text style={{ color: palette.faint }} className="text-xs font-semibold uppercase tracking-wider mb-3">Count frequency</Text>
                {[
                  { key: 'all', label: 'All frequencies', description: 'Monthly and bi-monthly', icon: Boxes },
                  { key: 'monthly', label: 'Monthly', description: 'Count due every month', icon: Clock },
                  { key: 'bi-monthly', label: 'Bi-Monthly', description: 'Count due every 2 months', icon: Clock },
                ].map((option) => {
                  const Icon = option.icon;
                  return (
                    <Pressable
                      key={option.key}
                      onPress={() => {
                        if (Platform.OS !== 'web') Haptics.selectionAsync();
                        setFrequencyFilter(option.key as typeof frequencyFilter);
                      }}
                      className="flex-row items-center py-3 active:opacity-70"
                    >
                      <Icon size={18} color={frequencyFilter === option.key ? palette.limeOnSurface : palette.faint} strokeWidth={2} />
                      <View className="flex-1 ml-3">
                        <Text style={{ color: palette.text }} className="font-medium text-sm">{option.label}</Text>
                        <Text style={{ color: palette.faint }} className="text-xs mt-0.5">{option.description}</Text>
                      </View>
                      {frequencyFilter === option.key && (
                        <View className="w-5 h-5 rounded-full items-center justify-center" style={{ backgroundColor: FYLL_LIME }}>
                          <Check size={12} color={FYLL_LIME_INK} strokeWidth={3} />
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>

              <View className="px-5 pt-4 pb-2" style={{ borderTopWidth: 0.5, borderTopColor: separatorColor, marginTop: 8 }}>
                <Text style={{ color: palette.faint }} className="text-xs font-semibold uppercase tracking-wider mb-3">Sort by</Text>

                {[
                  { key: 'name-asc', label: 'Name (A-Z)', description: 'Alphabetical ascending', icon: ArrowDownAZ },
                  { key: 'name-desc', label: 'Name (Z-A)', description: 'Alphabetical descending', icon: ArrowUpAZ },
                  { key: 'count-newest', label: 'Newest counts', description: 'Latest counted first', icon: Clock },
                  { key: 'count-oldest', label: 'Oldest counts', description: 'Oldest counted first', icon: Clock },
                  { key: 'stock-low', label: 'Stock low to high', description: 'Lowest stock first', icon: TrendingDown },
                  { key: 'stock-high', label: 'Stock high to low', description: 'Highest stock first', icon: TrendingUp },
                ].map((option) => {
                  const Icon = option.icon;
                  return (
                    <Pressable
                      key={option.key}
                      onPress={() => {
                        if (Platform.OS !== 'web') Haptics.selectionAsync();
                        setSortBy(option.key as typeof sortBy);
                      }}
                      className="flex-row items-center py-3 active:opacity-70"
                    >
                      <Icon size={18} color={sortBy === option.key ? palette.limeOnSurface : palette.faint} strokeWidth={2} />
                      <View className="flex-1 ml-3">
                        <Text style={{ color: palette.text }} className="font-medium text-sm">{option.label}</Text>
                        <Text style={{ color: palette.faint }} className="text-xs mt-0.5">{option.description}</Text>
                      </View>
                      {sortBy === option.key && (
                        <View className="w-5 h-5 rounded-full items-center justify-center" style={{ backgroundColor: FYLL_LIME }}>
                          <Check size={12} color={FYLL_LIME_INK} strokeWidth={3} />
                        </View>
                      )}
                    </Pressable>
                  );
                })}

                <Pressable
                  onPress={() => {
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    setStockFilter('all');
                    setFrequencyFilter('all');
                    setSortBy('name-asc');
                  }}
                  className="mt-3 mb-4 rounded-xl items-center justify-center"
                  style={{ height: 42, backgroundColor: palette.softFill, borderWidth: 1, borderColor: palette.outline }}
                >
                  <Text style={{ color: palette.text }} className="text-sm font-semibold">Clear filters</Text>
                </Pressable>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={itemModalOpen} transparent animationType="fade" onRequestClose={() => setItemModalOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <View style={{ width: '100%', maxWidth: 520, borderRadius: 18, backgroundColor: colors.bg.primary, borderWidth: 1, borderColor: colors.border.light, padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <Text style={{ color: colors.text.primary, fontSize: 20, fontWeight: '700' }}>{editingItemId ? 'Edit Item' : 'Add Item'}</Text>
              <Pressable onPress={() => setItemModalOpen(false)} style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border.light }}>
                <X size={16} color={colors.text.primary} strokeWidth={2.4} />
              </Pressable>
            </View>

            {[
              { key: 'name', label: 'Item name', value: form.name, placeholder: 'Carton Box', keyboardType: 'default' as const },
              { key: 'currentStock', label: 'Current stock', value: form.currentStock, placeholder: '0', keyboardType: 'numeric' as const },
            ].map((field) => (
              <View key={field.key} style={{ marginTop: 8 }}>
                <Text style={{ color: colors.text.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.6 }}>{field.label.toUpperCase()}</Text>
                <View style={{ marginTop: 6, borderWidth: 1, borderColor: colors.border.light, borderRadius: 12, paddingHorizontal: 12, height: 44, justifyContent: 'center', backgroundColor: colors.input.bg }}>
                  <TextInput
                    value={field.value}
                    onChangeText={(value) => setForm((previous) => ({ ...previous, [field.key]: value }))}
                    placeholder={field.placeholder}
                    placeholderTextColor={colors.input.placeholder}
                    keyboardType={field.keyboardType}
                    style={{ color: colors.input.text, fontSize: 14 }}
                  />
                </View>
              </View>
            ))}

            <View style={{ marginTop: 8 }}>
              <Text style={{ color: colors.text.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.6 }}>ITEM IMAGE</Text>
              {form.imageUrl ? (
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 8 }}>
                  <View style={{ width: 72, height: 72, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border.light }}>
                    {/^data:|^blob:|^file:|^https?:/i.test(form.imageUrl) ? (
                      <Image source={{ uri: form.imageUrl }} style={{ width: 72, height: 72 }} resizeMode="cover" />
                    ) : (
                      <ResolvedAttachmentImage imageUrl={form.imageUrl} style={{ width: 72, height: 72 }} resizeMode="cover" />
                    )}
                  </View>
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Pressable
                      onPress={handlePickWarehouseImage}
                      disabled={imagePicker.isLoading}
                      style={{
                        height: 38,
                        borderRadius: 10,
                        paddingHorizontal: 12,
                        alignItems: 'center',
                        flexDirection: 'row',
                        backgroundColor: colors.bg.secondary,
                        opacity: imagePicker.isLoading ? 0.5 : 1,
                      }}
                    >
                      <Camera size={14} color={colors.text.primary} strokeWidth={2} />
                      <Text style={{ color: colors.text.primary, marginLeft: 8, fontSize: 12, fontWeight: '500' }}>
                        Change
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={handleRemoveWarehouseImage}
                      style={{
                        height: 38,
                        borderRadius: 10,
                        paddingHorizontal: 12,
                        alignItems: 'center',
                        flexDirection: 'row',
                        backgroundColor: 'rgba(239, 68, 68, 0.08)',
                        marginTop: 8,
                      }}
                    >
                      <Trash2 size={14} color="#EF4444" strokeWidth={2} />
                      <Text style={{ color: '#EF4444', marginLeft: 8, fontSize: 12, fontWeight: '500' }}>
                        Remove
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                  onPress={handlePickWarehouseImage}
                  disabled={imagePicker.isLoading}
                  style={{
                    marginTop: 8,
                    borderRadius: 12,
                    paddingVertical: 16,
                    paddingHorizontal: 14,
                    alignItems: 'center',
                    backgroundColor: colors.bg.secondary,
                    borderWidth: 1,
                    borderColor: colors.border.light,
                    borderStyle: 'dashed',
                    opacity: imagePicker.isLoading ? 0.5 : 1,
                  }}
                >
                  <View style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg.card }}>
                    <ImageIcon size={20} color={colors.text.muted} strokeWidth={1.8} />
                  </View>
                  <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '500', marginTop: 8 }}>
                    {imagePicker.isLoading ? 'Opening...' : 'Upload Item Image'}
                  </Text>
                  <Text style={{ color: colors.text.muted, fontSize: 12, marginTop: 2 }}>
                    Optional. Image will be compressed before save.
                  </Text>
                </Pressable>
              )}
              {imagePicker.error ? (
                <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 6 }}>{imagePicker.error}</Text>
              ) : null}
            </View>

            <View style={{ marginTop: 10, zIndex: 20 }}>
              <Text style={{ color: colors.text.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.6 }}>CATEGORY</Text>
              <View style={{ marginTop: 6, zIndex: 10 }}>
                <Pressable
                  onPress={() => {
                    setShowCategoryDropdown((previous) => !previous);
                    setShowUnitDropdown(false);
                  }}
                  style={{
                    borderWidth: 1,
                    borderColor: colors.border.light,
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    height: 44,
                    alignItems: 'center',
                    flexDirection: 'row',
                    backgroundColor: colors.input.bg,
                  }}
                >
                  <TextInput
                    placeholder="Search or add category"
                    placeholderTextColor={colors.input.placeholder}
                    value={form.category}
                    onChangeText={(value) => {
                      setForm((previous) => ({ ...previous, category: value }));
                      setShowCategoryDropdown(true);
                    }}
                    onFocus={() => {
                      setShowCategoryDropdown(true);
                      setShowUnitDropdown(false);
                    }}
                    onSubmitEditing={handleAddWarehouseCategoryOption}
                    style={{ color: colors.input.text, fontSize: 14, flex: 1 }}
                    selectionColor={colors.text.primary}
                  />
                  <SearchClearButton
                    visible={Boolean(form.category.trim())}
                    onPress={() => {
                      setForm((previous) => ({ ...previous, category: '' }));
                      setShowCategoryDropdown(true);
                      setShowUnitDropdown(false);
                    }}
                  />
                  <ChevronDown size={16} color={colors.text.muted} strokeWidth={2} />
                </Pressable>
                {showCategoryDropdown ? (
                  <View
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: 50,
                      borderRadius: 12,
                      overflow: 'hidden',
                      backgroundColor: colors.bg.card,
                      borderWidth: 1,
                      borderColor: colors.border.light,
                      maxHeight: 200,
                      zIndex: 30,
                    }}
                  >
                    <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                      {filteredWarehouseCategories.map((option) => (
                        <Pressable
                          key={option.id}
                          onPress={() => handleSelectWarehouseCategory(option.name)}
                          style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border.light }}
                        >
                          <Text style={{ color: colors.text.secondary, fontSize: 14 }}>{option.name}</Text>
                        </Pressable>
                      ))}
                      {form.category.trim() && !warehouseCategories.some((option) => option.name.toLowerCase() === form.category.trim().toLowerCase()) ? (
                        <Pressable
                          onPress={handleAddWarehouseCategoryOption}
                          style={{ paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.bg.secondary }}
                        >
                          <Text style={{ color: '#10B981', fontSize: 14 }}>Add "{form.category.trim()}"</Text>
                        </Pressable>
                      ) : null}
                      {filteredWarehouseCategories.length === 0 && !form.category.trim() ? (
                        <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                          <Text style={{ color: colors.text.muted, fontSize: 14 }}>No categories. Type to add new.</Text>
                        </View>
                      ) : null}
                    </ScrollView>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={{ marginTop: 10, zIndex: 10 }}>
              <Text style={{ color: colors.text.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.6 }}>UNIT</Text>
              <View style={{ marginTop: 6, zIndex: 10 }}>
                <Pressable
                  onPress={() => {
                    setShowUnitDropdown((previous) => !previous);
                    setShowCategoryDropdown(false);
                  }}
                  style={{
                    borderWidth: 1,
                    borderColor: colors.border.light,
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    height: 44,
                    alignItems: 'center',
                    flexDirection: 'row',
                    backgroundColor: colors.input.bg,
                  }}
                >
                  <TextInput
                    placeholder="Search or add unit"
                    placeholderTextColor={colors.input.placeholder}
                    value={form.unit}
                    onChangeText={(value) => {
                      setForm((previous) => ({ ...previous, unit: value }));
                      setShowUnitDropdown(true);
                    }}
                    onFocus={() => {
                      setShowUnitDropdown(true);
                      setShowCategoryDropdown(false);
                    }}
                    onSubmitEditing={handleAddWarehouseUnitOption}
                    style={{ color: colors.input.text, fontSize: 14, flex: 1 }}
                    selectionColor={colors.text.primary}
                  />
                  <SearchClearButton
                    visible={Boolean(form.unit.trim())}
                    onPress={() => {
                      setForm((previous) => ({ ...previous, unit: '' }));
                      setShowUnitDropdown(true);
                      setShowCategoryDropdown(false);
                    }}
                  />
                  <ChevronDown size={16} color={colors.text.muted} strokeWidth={2} />
                </Pressable>
                {showUnitDropdown ? (
                  <View
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: 50,
                      borderRadius: 12,
                      overflow: 'hidden',
                      backgroundColor: colors.bg.card,
                      borderWidth: 1,
                      borderColor: colors.border.light,
                      maxHeight: 200,
                      zIndex: 30,
                    }}
                  >
                    <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                      {filteredWarehouseUnits.map((option) => (
                        <Pressable
                          key={option.id}
                          onPress={() => handleSelectWarehouseUnit(option.name)}
                          style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border.light }}
                        >
                          <Text style={{ color: colors.text.secondary, fontSize: 14 }}>{option.name}</Text>
                        </Pressable>
                      ))}
                      {form.unit.trim() && !warehouseUnits.some((option) => option.name.toLowerCase() === form.unit.trim().toLowerCase()) ? (
                        <Pressable
                          onPress={handleAddWarehouseUnitOption}
                          style={{ paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.bg.secondary }}
                        >
                          <Text style={{ color: '#10B981', fontSize: 14 }}>Add "{form.unit.trim()}"</Text>
                        </Pressable>
                      ) : null}
                      {filteredWarehouseUnits.length === 0 && !form.unit.trim() ? (
                        <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                          <Text style={{ color: colors.text.muted, fontSize: 14 }}>No units. Type to add new.</Text>
                        </View>
                      ) : null}
                    </ScrollView>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={{ marginTop: 8 }}>
              <Text style={{ color: colors.text.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.6 }}>NOTES</Text>
              <View style={{ marginTop: 6, borderWidth: 1, borderColor: colors.border.light, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.input.bg, minHeight: 74 }}>
                <TextInput
                  value={form.notes}
                  onChangeText={(value) => setForm((previous) => ({ ...previous, notes: value }))}
                  placeholder="Optional notes"
                  placeholderTextColor={colors.input.placeholder}
                  multiline
                  style={{ color: colors.input.text, fontSize: 14 }}
                />
              </View>
            </View>

            <Pressable
              onPress={submitItem}
              style={{
                marginTop: 14,
                height: 46,
                borderRadius: 999,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.accent.primary,
                flexDirection: 'row',
              }}
            >
              <Check size={16} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={2.4} />
              <Text style={{ color: isDark ? '#000000' : '#FFFFFF', marginLeft: 8, fontWeight: '700' }}>
                {editingItemId ? 'Save Changes' : 'Create Item'}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(countModalItemId)} transparent animationType="fade" onRequestClose={() => setCountModalItemId(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <View style={{ width: '100%', maxWidth: 420, borderRadius: 18, backgroundColor: colors.bg.primary, borderWidth: 1, borderColor: colors.border.light, padding: 16 }}>
            <Text style={{ color: colors.text.primary, fontSize: 20, fontWeight: '700' }}>Record Count</Text>
            <Text style={{ color: colors.text.muted, marginTop: 4 }}>Update this item with your latest physical count.</Text>

            <View style={{ marginTop: 12 }}>
              <Text style={{ color: colors.text.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.6 }}>COUNTED QUANTITY</Text>
              <View style={{ marginTop: 6, borderWidth: 1, borderColor: colors.border.light, borderRadius: 12, paddingHorizontal: 12, height: 44, justifyContent: 'center', backgroundColor: colors.input.bg }}>
                <TextInput
                  value={countQuantity}
                  onChangeText={setCountQuantity}
                  placeholder="0"
                  placeholderTextColor={colors.input.placeholder}
                  keyboardType="numeric"
                  style={{ color: colors.input.text, fontSize: 14 }}
                />
              </View>
            </View>

            <View style={{ marginTop: 8 }}>
              <Text style={{ color: colors.text.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.6 }}>NOTES</Text>
              <View style={{ marginTop: 6, borderWidth: 1, borderColor: colors.border.light, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.input.bg, minHeight: 66 }}>
                <TextInput
                  value={countNotes}
                  onChangeText={setCountNotes}
                  placeholder="Optional note"
                  placeholderTextColor={colors.input.placeholder}
                  multiline
                  style={{ color: colors.input.text, fontSize: 14 }}
                />
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <Pressable
                onPress={() => setCountModalItemId(null)}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 999,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: colors.border.light,
                }}
              >
                <Text style={{ color: colors.text.primary, fontWeight: '700' }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={submitCount}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 999,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.accent.primary,
                }}
              >
                <Text style={{ color: isDark ? '#000000' : '#FFFFFF', fontWeight: '700' }}>Save Count</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(deleteItemId)} transparent animationType="fade" onRequestClose={() => setDeleteItemId(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <View style={{ width: '100%', maxWidth: 400, borderRadius: 18, backgroundColor: colors.bg.primary, borderWidth: 1, borderColor: colors.border.light, padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <AlertTriangle size={18} color="#EF4444" strokeWidth={2.2} />
              <Text style={{ color: colors.text.primary, fontSize: 19, fontWeight: '700', marginLeft: 8 }}>Delete item?</Text>
            </View>
            <Text style={{ color: colors.text.muted, marginTop: 8 }}>This removes the item from warehouse records.</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <Pressable
                onPress={() => setDeleteItemId(null)}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 999,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: colors.border.light,
                }}
              >
                <Text style={{ color: colors.text.primary, fontWeight: '700' }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={confirmDelete}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 999,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#EF4444',
                }}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Delete</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      {!isWebDesktop ? (
        <InventoryMobileFab currentSection="warehouse" lowerBy={44} />
      ) : null}
    </SafeAreaView>
  );
}
