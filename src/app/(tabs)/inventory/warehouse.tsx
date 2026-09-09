import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Modal, Platform, Image, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Boxes, Plus, Search, ClipboardCheck, ClipboardList, AlertTriangle, Pencil, Trash2, X, Check, Filter, ArrowDownAZ, ArrowUpAZ, Clock, TrendingDown, TrendingUp, ChevronDown, MoreVertical, Camera, ImageIcon, Package } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import useAuthStore from '@/lib/state/auth-store';
import useFyllStore, { type WarehouseItem } from '@/lib/state/fyll-store';
import { useThemeColors } from '@/lib/theme';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { useTabBarHeight } from '@/lib/useTabBarHeight';
import { DESKTOP_PAGE_HEADER_MIN_HEIGHT, getStandardPageHeadingStyle } from '@/lib/page-heading';
import { useImagePicker } from '@/hooks/useImagePicker';
import { uploadWarehouseMediaIfNeeded } from '@/lib/warehouse-media';
import { ResolvedAttachmentImage } from '@/components/ResolvedAttachmentImage';
import { InventoryMobileFab } from '@/components/InventoryMobileFab';
import { capitalizeDisplayLabel } from '@/lib/display-format';

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

export default function WarehouseScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { isDesktop, isMobile } = useBreakpoint();
  const isWebDesktop = isDesktop && Platform.OS === 'web';
  const tabBarHeight = useTabBarHeight();
  const isDark = colors.bg.primary === '#111111';
  const mobileWarehouseHeadingStyle = isMobile
    ? { ...getStandardPageHeadingStyle(isMobile), fontWeight: '600' as const }
    : getStandardPageHeadingStyle(isMobile);

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
  const [stockFilter, setStockFilter] = useState<'all' | 'low-stock' | 'in-stock' | 'out-of-stock' | 'overdue'>('all');
  const [frequencyFilter, setFrequencyFilter] = useState<'all' | 'monthly' | 'bi-monthly'>('all');
  const [sortBy, setSortBy] = useState<'name-asc' | 'name-desc' | 'stock-low' | 'stock-high' | 'count-newest' | 'count-oldest'>('name-asc');
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

  const activeFilterCount = (stockFilter !== 'all' ? 1 : 0) + (frequencyFilter !== 'all' ? 1 : 0) + (sortBy !== 'name-asc' ? 1 : 0);
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

    if (stockFilter !== 'all') {
      result = result.filter((item) => {
        const nextDue = addMonths(item.lastCountedAt ?? item.createdAt, item.countFrequency === 'Bi-Monthly' ? 2 : 1);
        const overdue = nextDue.getTime() < Date.now();
        const lowStock = typeof item.reorderLevel === 'number' && item.currentStock <= item.reorderLevel;
        if (stockFilter === 'low-stock') return lowStock;
        if (stockFilter === 'in-stock') return item.currentStock > 0;
        if (stockFilter === 'out-of-stock') return item.currentStock === 0;
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
  }, [searchQuery, warehouseItems, stockFilter, frequencyFilter, sortBy]);

  const itemStatus = useMemo(() => {
    const now = new Date();
    let lowStock = 0;
    let overdue = 0;

    warehouseItems.forEach((item) => {
      if (typeof item.reorderLevel === 'number' && item.currentStock <= item.reorderLevel) {
        lowStock += 1;
      }
      const baseDate = item.lastCountedAt ?? item.createdAt;
      const nextDue = addMonths(baseDate, item.countFrequency === 'Bi-Monthly' ? 2 : 1);
      if (nextDue.getTime() < now.getTime()) {
        overdue += 1;
      }
    });

    return {
      total: warehouseItems.length,
      lowStock,
      overdue,
    };
  }, [warehouseItems]);

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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <View
        style={{
          borderBottomWidth: 1,
          borderBottomColor: colors.border.light,
          paddingHorizontal: isWebDesktop ? 0 : 20,
          paddingTop: isWebDesktop ? 0 : 16,
          paddingBottom: isWebDesktop ? 0 : 8,
        }}
      >
        <View style={isWebDesktop ? {
          width: '100%',
          maxWidth: 1400,
          alignSelf: 'flex-start',
          minHeight: DESKTOP_PAGE_HEADER_MIN_HEIGHT,
          paddingLeft: 20,
          paddingRight: 20,
          paddingTop: 20,
          paddingBottom: 16,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        } : { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={{ color: colors.text.primary, ...mobileWarehouseHeadingStyle }}>Warehouse</Text>
            <Text style={{ color: colors.text.muted, fontSize: 13, marginTop: 2 }}>Inventory</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              onPress={() => {
                if (Platform.OS !== 'web') {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                }
                router.replace('/inventory-audit');
              }}
              style={{
                paddingHorizontal: 14,
                height: 44,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(168, 85, 247, 0.08)',
                borderRadius: 999,
              }}
            >
              <ClipboardList size={16} color="#A856F6" strokeWidth={2} />
              <Text style={{ color: '#A856F6', marginLeft: 6, fontWeight: '600', fontSize: 12 }}>Audit</Text>
            </Pressable>
            <Pressable
              onPress={openCreateModal}
              style={{
                backgroundColor: colors.accent.primary,
                borderRadius: 999,
                paddingHorizontal: 16,
                height: 44,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
              }}
            >
              <Plus size={16} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={2.4} />
              <Text style={{ color: isDark ? '#000000' : '#FFFFFF', marginLeft: 8, fontWeight: '600', fontSize: 12 }}>Add Item</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1, paddingHorizontal: isWebDesktop ? 0 : 20, paddingTop: isWebDesktop ? 0 : 16 }}
        contentContainerStyle={{
          maxWidth: isWebDesktop ? 1400 : undefined,
          alignSelf: isWebDesktop ? 'flex-start' : undefined,
          width: '100%',
          paddingLeft: isWebDesktop ? 20 : 0,
          paddingRight: isWebDesktop ? 20 : 0,
          paddingTop: isWebDesktop ? 24 : 0,
          paddingBottom: tabBarHeight + 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: isDesktop ? 'row' : 'row', gap: 10 }}>
          <View
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: colors.border.light,
              borderRadius: 16,
              paddingHorizontal: isDesktop ? 14 : 12,
              paddingVertical: isDesktop ? 14 : 13,
              backgroundColor: colors.bg.card,
            }}
          >
            <Text style={{ color: colors.text.muted, fontSize: 10, fontWeight: '600', letterSpacing: 0.3 }}>ITEMS</Text>
            <Text style={{ color: colors.text.primary, fontSize: isDesktop ? 28 : 22, fontWeight: isDesktop ? '700' : '600', marginTop: isDesktop ? 2 : 4 }}>
              {itemStatus.total}
            </Text>
          </View>
          <View
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: colors.border.light,
              borderRadius: 16,
              paddingHorizontal: isDesktop ? 14 : 12,
              paddingVertical: isDesktop ? 14 : 13,
              backgroundColor: colors.bg.card,
            }}
          >
            <Text style={{ color: colors.text.muted, fontSize: 10, fontWeight: '600', letterSpacing: 0.3 }}>LOW STOCK</Text>
            <Text style={{ color: '#F59E0B', fontSize: isDesktop ? 28 : 22, fontWeight: isDesktop ? '700' : '600', marginTop: isDesktop ? 2 : 4 }}>
              {itemStatus.lowStock}
            </Text>
          </View>
          {isDesktop ? (
            <View
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: colors.border.light,
                borderRadius: 16,
                padding: 14,
                backgroundColor: colors.bg.card,
              }}
            >
              <Text style={{ color: colors.text.muted, fontSize: 10, fontWeight: '600', letterSpacing: 0.3 }}>COUNT OVERDUE</Text>
              <Text style={{ color: '#EF4444', fontSize: 28, fontWeight: '700', marginTop: 2 }}>{itemStatus.overdue}</Text>
            </View>
          ) : null}
        </View>

        {isWebDesktop ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 }}>
            <View
              className="flex-row items-center rounded-full px-4"
              style={{
                height: 44,
                width: '30%',
                maxWidth: 420,
                minWidth: 320,
                backgroundColor: colors.input.bg,
                borderWidth: 1,
                borderColor: colors.border.light,
              }}
            >
              <Search size={18} color={colors.text.muted} strokeWidth={2} />
              <TextInput
                placeholder="Search warehouse items..."
                placeholderTextColor={colors.input.placeholder}
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={{ flex: 1, marginLeft: 8, color: colors.input.text, fontSize: 14 }}
                selectionColor={colors.text.primary}
              />
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ flex: 1 }}
              contentContainerStyle={{ flexGrow: 0, gap: 8, paddingRight: 4 }}
            >
              {[
                { key: 'all', label: 'All' },
                { key: 'low-stock', label: 'Low Stock' },
                { key: 'in-stock', label: 'In Stock' },
                { key: 'out-of-stock', label: 'Out of Stock' },
              ].map((option) => (
                <Pressable
                  key={option.key}
                  onPress={() => setStockFilter(option.key as typeof stockFilter)}
                  className="rounded-full active:opacity-70"
                  style={{
                    height: 44,
                    paddingHorizontal: 16,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: stockFilter === option.key ? colors.accent.primary : colors.bg.card,
                    borderWidth: stockFilter === option.key ? 0 : 1,
                    borderColor: separatorColor,
                  }}
                >
                  <Text
                    className="text-sm font-semibold"
                    style={{
                      color: stockFilter === option.key ? (isDark ? '#000000' : '#FFFFFF') : colors.text.primary,
                    }}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Pressable
              onPress={() => {
                if (Platform.OS !== 'web') {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                setShowFilterMenu(true);
              }}
              className="rounded-full items-center justify-center active:opacity-70 flex-row px-4"
              style={{
                height: 44,
                backgroundColor: activeFilterCount > 0 ? colors.accent.primary : colors.bg.card,
                borderWidth: activeFilterCount > 0 ? 0 : 1,
                borderColor: separatorColor,
              }}
            >
              <Filter
                size={18}
                color={activeFilterCount > 0 ? (isDark ? '#000000' : '#FFFFFF') : colors.text.tertiary}
                strokeWidth={2}
              />
              {activeFilterCount > 0 && (
                <Text style={{ color: isDark ? '#000000' : '#FFFFFF' }} className="font-semibold text-sm ml-1.5">
                  {activeFilterCount}
                </Text>
              )}
            </Pressable>
          </View>
        ) : (
          <View className="flex-row gap-2" style={{ marginTop: 14 }}>
            <View
              className="flex-1 flex-row items-center rounded-full px-4"
              style={{ height: 52, backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light }}
            >
              <Search size={18} color={colors.text.muted} strokeWidth={2} />
              <TextInput
                placeholder="Search warehouse items..."
                placeholderTextColor={colors.input.placeholder}
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={{ flex: 1, marginLeft: 8, color: colors.input.text, fontSize: 14 }}
                selectionColor={colors.text.primary}
              />
            </View>
            <Pressable
              onPress={() => {
                if (Platform.OS !== 'web') {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                setShowFilterMenu(true);
              }}
              className="rounded-full items-center justify-center active:opacity-70 flex-row px-4"
              style={{
                height: 52,
                backgroundColor: activeFilterCount > 0 ? colors.accent.primary : colors.bg.secondary,
                borderWidth: activeFilterCount > 0 ? 0 : 0.5,
                borderColor: separatorColor,
              }}
            >
              <Filter
                size={18}
                color={activeFilterCount > 0 ? (isDark ? '#000000' : '#FFFFFF') : colors.text.tertiary}
                strokeWidth={2}
              />
              {activeFilterCount > 0 && (
                <Text style={{ color: isDark ? '#000000' : '#FFFFFF' }} className="font-semibold text-sm ml-1.5">
                  {activeFilterCount}
                </Text>
              )}
            </Pressable>
          </View>
        )}

        <View style={{ marginTop: 14 }}>
          {filteredItems.length === 0 ? (
            <View
              style={{
                borderWidth: 1,
                borderColor: colors.border.light,
                borderRadius: 18,
                paddingVertical: 46,
                paddingHorizontal: 16,
                alignItems: 'center',
                backgroundColor: colors.bg.card,
              }}
            >
              <Boxes size={34} color={colors.text.muted} strokeWidth={1.8} />
              <Text style={{ color: colors.text.primary, fontWeight: '700', fontSize: 17, marginTop: 12 }}>No warehouse items yet</Text>
              <Text style={{ color: colors.text.muted, marginTop: 4 }}>Add your first item to start monthly stock counting.</Text>
            </View>
          ) : (
            <View
              style={{
                position: 'relative',
                borderWidth: isWebDesktop ? 1 : 0,
                borderColor: colors.border.light,
                borderRadius: isWebDesktop ? 18 : 0,
                overflow: 'visible',
                backgroundColor: isWebDesktop ? colors.bg.card : 'transparent',
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
                  <View style={{ paddingHorizontal: 8, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: separatorColor }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ color: colors.text.muted, flex: 2.7 }} className="text-xs font-semibold">PRODUCT</Text>
                      <Text style={{ color: colors.text.muted, width: 70, textAlign: 'center' }} className="text-xs font-semibold">STOCK</Text>
                      <Text style={{ color: colors.text.muted, width: 64, textAlign: 'center' }} className="text-xs font-semibold">UNIT</Text>
                      <Text style={{ color: colors.text.muted, flex: 1.4 }} className="text-xs font-semibold">CATEGORY</Text>
                      <Text style={{ color: colors.text.muted, width: 88, textAlign: 'right' }} className="text-xs font-semibold">ACTIONS</Text>
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
                          paddingHorizontal: 8,
                          paddingVertical: 12,
                          zIndex: rowActionsItemId === item.id ? 30 : 1,
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Pressable
                            onPress={() => openWarehouseItem(item.id)}
                            className="active:opacity-70"
                            style={{ flex: 2.7, paddingRight: 10, flexDirection: 'row', alignItems: 'center' }}
                          >
                            {item.imageUrl ? (
                              <View style={{ width: 34, height: 34, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: colors.border.light, marginRight: 10 }}>
                                <ResolvedAttachmentImage imageUrl={item.imageUrl} style={{ width: 34, height: 34 }} resizeMode="cover" />
                              </View>
                            ) : (
                              <View
                                style={{
                                  width: 34,
                                  height: 34,
                                  borderRadius: 10,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  backgroundColor: colors.bg.secondary,
                                  borderWidth: 1,
                                  borderColor: colors.border.light,
                                  marginRight: 10,
                                }}
                              >
                                <Package size={16} color={colors.text.muted} strokeWidth={1.8} />
                              </View>
                            )}
                            <Text style={{ color: colors.text.primary }} className="text-sm font-semibold" numberOfLines={1}>{capitalizeDisplayLabel(item.name)}</Text>
                          </Pressable>

                          <Text style={{ color: colors.text.primary, width: 70, textAlign: 'center' }} className="text-sm font-semibold">{item.currentStock}</Text>
                          <Text style={{ color: colors.text.secondary, width: 64, textAlign: 'center' }} className="text-sm">{item.unit}</Text>
                          <Text style={{ color: colors.text.secondary, flex: 1.4 }} className="text-sm" numberOfLines={1}>{item.category}</Text>
                          <View style={{ width: 88, flexDirection: 'row', justifyContent: 'flex-end' }}>
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
                                borderColor: colors.border.light,
                                backgroundColor: colors.bg.secondary,
                              }}
                            >
                              <MoreVertical size={14} color={colors.text.primary} strokeWidth={2.2} />
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
                              backgroundColor: colors.bg.primary,
                              borderWidth: 1,
                              borderColor: colors.border.light,
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
                              <Text style={{ color: colors.text.primary, fontWeight: '500', fontSize: 12 }}>Record Count</Text>
                            </Pressable>

                            <Pressable
                              onPress={() => {
                                setRowActionsItemId(null);
                                openEditModal(item);
                              }}
                              style={{ height: 36, borderRadius: 8, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, marginBottom: 6 }}
                            >
                              <Text style={{ color: colors.text.primary, fontWeight: '500', fontSize: 12 }}>Edit Item</Text>
                            </Pressable>

                            <Pressable
                              onPress={() => {
                                setRowActionsItemId(null);
                                setDeleteItemId(item.id);
                              }}
                              style={{ height: 36, borderRadius: 8, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 }}
                            >
                              <Text style={{ color: '#EF4444', fontWeight: '500', fontSize: 12 }}>Delete Item</Text>
                            </Pressable>
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                </>
              ) : (
                filteredItems.map((item, index) => {
                  const lowStock = typeof item.reorderLevel === 'number' && item.currentStock <= item.reorderLevel;
                  const stockLabel = lowStock ? 'Low stock' : item.currentStock === 0 ? 'Out of stock' : 'In stock';
                  const stockColor = item.currentStock === 0 ? '#EF4444' : lowStock ? '#F59E0B' : '#10B981';
                  return (
                    <View
                      key={item.id}
                      style={{
                        position: 'relative',
                        backgroundColor: colors.bg.card,
                        borderRadius: 16,
                        marginBottom: index === filteredItems.length - 1 ? 0 : 12,
                        borderWidth: 0.5,
                        borderColor: separatorColor,
                        borderLeftWidth: 0.5,
                        borderLeftColor: separatorColor,
                        zIndex: rowActionsItemId === item.id ? 50 : 1,
                      }}
                    >
                      <View className="p-3 flex-row items-center">
                        <Pressable
                          onPress={() => openWarehouseItem(item.id)}
                          className="flex-row items-center flex-1 active:opacity-70"
                        >
                          {item.imageUrl ? (
                            <View className="w-12 h-12 rounded-lg overflow-hidden" style={{ borderWidth: 0.5, borderColor: separatorColor }}>
                              <ResolvedAttachmentImage
                                imageUrl={item.imageUrl}
                                style={{ width: 48, height: 48 }}
                                resizeMode="cover"
                              />
                            </View>
                          ) : (
                            <View
                              className="w-12 h-12 rounded-xl items-center justify-center"
                              style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)' }}
                            >
                              <Package size={22} color="#10B981" strokeWidth={1.6} />
                            </View>
                          )}
                          <View className="ml-3 flex-1">
                            <Text style={{ color: colors.text.primary, fontWeight: '500' }} className="text-base">
                              {capitalizeDisplayLabel(item.name)}
                            </Text>
                            <Text style={{ color: colors.text.muted }} className="text-xs mt-0.5">
                              {item.category} · {item.currentStock} {item.unit}
                            </Text>
                          </View>
                        </Pressable>
                        <View className="flex-row items-center">
                          <View
                            className="rounded-full px-3 py-1 flex-row items-center mr-2"
                            style={{ backgroundColor: `${stockColor}20` }}
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
                            <MoreVertical size={18} color={colors.text.tertiary} strokeWidth={2} />
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
                            backgroundColor: colors.bg.primary,
                            borderWidth: 1,
                            borderColor: colors.border.light,
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
                            <Text style={{ color: colors.text.primary, fontWeight: '500', fontSize: 12 }}>Record Count</Text>
                          </Pressable>

                          <Pressable
                            onPress={() => {
                              setRowActionsItemId(null);
                              openEditModal(item);
                            }}
                            style={{ height: 34, borderRadius: 8, justifyContent: 'center', paddingHorizontal: 10, marginBottom: 6 }}
                          >
                            <Text style={{ color: colors.text.primary, fontWeight: '500', fontSize: 12 }}>Edit Item</Text>
                          </Pressable>

                          <Pressable
                            onPress={() => {
                              setRowActionsItemId(null);
                              setDeleteItemId(item.id);
                            }}
                            style={{ height: 34, borderRadius: 8, justifyContent: 'center', paddingHorizontal: 10 }}
                          >
                            <Text style={{ color: '#EF4444', fontWeight: '500', fontSize: 12 }}>Delete Item</Text>
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
        animationType="fade"
        transparent
        onRequestClose={() => setShowFilterMenu(false)}
      >
        <Pressable
          className="flex-1 justify-end"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
          onPress={() => setShowFilterMenu(false)}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            className="rounded-t-3xl"
            style={{ backgroundColor: colors.bg.primary, maxHeight: '72%' }}
          >
            <View className="items-center py-3">
              <View className="w-10 h-1 rounded-full" style={{ backgroundColor: colors.border.light }} />
            </View>

            <View className="flex-row items-center justify-between px-5 pb-4" style={{ borderBottomWidth: 0.5, borderBottomColor: separatorColor }}>
              <Text style={{ color: colors.text.primary }} className="font-bold text-lg">Filter & Sort</Text>
              <Pressable
                onPress={() => setShowFilterMenu(false)}
                className="w-8 h-8 rounded-full items-center justify-center active:opacity-50"
                style={{ backgroundColor: colors.bg.secondary }}
              >
                <X size={18} color={colors.text.tertiary} strokeWidth={2} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View className="px-5 pt-4">
                <Text style={{ color: colors.text.muted }} className="text-xs font-semibold uppercase tracking-wider mb-3">Stock Status</Text>

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
                      <Icon size={18} color={stockFilter === option.key ? option.helperColor : colors.text.muted} strokeWidth={2} />
                      <View className="flex-1 ml-3">
                        <Text style={{ color: colors.text.primary }} className="font-medium text-sm">{option.label}</Text>
                        <Text style={{ color: colors.text.muted }} className="text-xs mt-0.5">{option.description}</Text>
                      </View>
                      {stockFilter === option.key && (
                        <View className="w-5 h-5 rounded-full items-center justify-center" style={{ backgroundColor: colors.accent.primary }}>
                          <Check size={12} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={3} />
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>

              <View className="px-5 pt-4" style={{ borderTopWidth: 0.5, borderTopColor: separatorColor, marginTop: 8 }}>
                <Text style={{ color: colors.text.muted }} className="text-xs font-semibold uppercase tracking-wider mb-3">Count Frequency</Text>
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
                      <Icon size={18} color={frequencyFilter === option.key ? colors.accent.primary : colors.text.muted} strokeWidth={2} />
                      <View className="flex-1 ml-3">
                        <Text style={{ color: colors.text.primary }} className="font-medium text-sm">{option.label}</Text>
                        <Text style={{ color: colors.text.muted }} className="text-xs mt-0.5">{option.description}</Text>
                      </View>
                      {frequencyFilter === option.key && (
                        <View className="w-5 h-5 rounded-full items-center justify-center" style={{ backgroundColor: colors.accent.primary }}>
                          <Check size={12} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={3} />
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>

              <View className="px-5 pt-4 pb-2" style={{ borderTopWidth: 0.5, borderTopColor: separatorColor, marginTop: 8 }}>
                <Text style={{ color: colors.text.muted }} className="text-xs font-semibold uppercase tracking-wider mb-3">Sort By</Text>

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
                      <Icon size={18} color={sortBy === option.key ? colors.accent.primary : colors.text.muted} strokeWidth={2} />
                      <View className="flex-1 ml-3">
                        <Text style={{ color: colors.text.primary }} className="font-medium text-sm">{option.label}</Text>
                        <Text style={{ color: colors.text.muted }} className="text-xs mt-0.5">{option.description}</Text>
                      </View>
                      {sortBy === option.key && (
                        <View className="w-5 h-5 rounded-full items-center justify-center" style={{ backgroundColor: colors.accent.primary }}>
                          <Check size={12} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={3} />
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
                  style={{ height: 42, backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
                >
                  <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">Clear filters</Text>
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
        <InventoryMobileFab currentSection="warehouse" />
      ) : null}
    </SafeAreaView>
  );
}
