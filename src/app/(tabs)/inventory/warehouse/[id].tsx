import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Modal, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Package, ClipboardCheck, Pencil, Trash2, Save, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import useAuthStore from '@/lib/state/auth-store';
import useFyllStore from '@/lib/state/fyll-store';
import { useThemeColors } from '@/lib/theme';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { useTabBarHeight } from '@/lib/useTabBarHeight';
import { DESKTOP_PAGE_HEADER_MIN_HEIGHT } from '@/lib/page-heading';
import { ResolvedAttachmentImage } from '@/components/ResolvedAttachmentImage';
import { capitalizeDisplayLabel } from '@/lib/display-format';

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

const formatDateTime = (isoDate?: string) => {
  if (!isoDate) return '—';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

export default function WarehouseItemDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useThemeColors();
  const { isDesktop } = useBreakpoint();
  const tabBarHeight = useTabBarHeight();
  const isWebDesktop = isDesktop && Platform.OS === 'web';
  const isDark = colors.bg.primary === '#111111';
  const separatorColor = isDark ? '#2F2F2F' : '#E5E7EB';

  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const currentUser = useAuthStore((s) => s.currentUser);
  const warehouseItems = useFyllStore((s) => s.warehouseItems);
  const updateWarehouseItem = useFyllStore((s) => s.updateWarehouseItem);
  const deleteWarehouseItem = useFyllStore((s) => s.deleteWarehouseItem);
  const recordWarehouseCount = useFyllStore((s) => s.recordWarehouseCount);

  const item = useMemo(() => warehouseItems.find((entry) => entry.id === id), [warehouseItems, id]);

  const [showCountModal, setShowCountModal] = useState(false);
  const [countQuantity, setCountQuantity] = useState(String(item?.currentStock ?? 0));
  const [countNotes, setCountNotes] = useState('');

  const [showEditModal, setShowEditModal] = useState(false);
  const [name, setName] = useState(item?.name ?? '');
  const [category, setCategory] = useState(item?.category ?? '');
  const [unit, setUnit] = useState(item?.unit ?? 'pcs');
  const [stock, setStock] = useState(String(item?.currentStock ?? 0));
  const [notes, setNotes] = useState(item?.notes ?? '');

  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const nextCountDate = useMemo(() => {
    if (!item) return null;
    const baseDate = item.lastCountedAt ?? item.createdAt;
    return addMonths(baseDate, item.countFrequency === 'Bi-Monthly' ? 2 : 1);
  }, [item]);

  const isOverdue = Boolean(nextCountDate && nextCountDate.getTime() < Date.now());

  const handleBack = () => {
    router.back();
  };

  const handleOpenCount = () => {
    if (!item) return;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setCountQuantity(String(item.currentStock));
    setCountNotes('');
    setShowCountModal(true);
  };

  const handleSubmitCount = () => {
    if (!item) return;
    const quantity = Math.max(0, Number(countQuantity || 0));
    recordWarehouseCount(
      item.id,
      {
        quantity,
        countedBy: currentUser?.name,
        notes: countNotes.trim(),
      },
      businessId
    );
    setShowCountModal(false);
  };

  const handleOpenEdit = () => {
    if (!item) return;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setName(item.name);
    setCategory(item.category);
    setUnit(item.unit);
    setStock(String(item.currentStock));
    setNotes(item.notes ?? '');
    setShowEditModal(true);
  };

  const handleSaveEdit = () => {
    if (!item) return;
    const normalizedName = name.trim();
    if (!normalizedName) return;
    updateWarehouseItem(
      item.id,
      {
        name: normalizedName,
        category: category.trim() || 'General',
        unit: unit.trim() || 'pcs',
        currentStock: Math.max(0, Number(stock || 0)),
        notes: notes.trim(),
      },
      businessId
    );
    setShowEditModal(false);
  };

  const handleDelete = () => {
    if (!item) return;
    deleteWarehouseItem(item.id, businessId);
    setShowDeleteModal(false);
    router.replace('/inventory/warehouse');
  };

  if (!item) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <Package size={40} color={colors.text.muted} strokeWidth={1.8} />
          <Text style={{ color: colors.text.primary, fontSize: 18, fontWeight: '600', marginTop: 12 }}>
            Warehouse item not found
          </Text>
          <Pressable
            onPress={handleBack}
            style={{
              marginTop: 16,
              height: 42,
              paddingHorizontal: 16,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.border.light,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: colors.text.primary, fontWeight: '600' }}>Back to Warehouse</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const latestCounts = [...(item.countHistory ?? [])]
    .sort((a, b) => new Date(b.countedAt).getTime() - new Date(a.countedAt).getTime())
    .slice(0, 8);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <View
        style={{
          borderBottomWidth: 1,
          borderBottomColor: colors.border.light,
          paddingHorizontal: isWebDesktop ? 0 : 20,
          paddingTop: isWebDesktop ? 0 : 16,
          paddingBottom: isWebDesktop ? 0 : 12,
        }}
      >
        <View
          style={isWebDesktop ? {
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
          } : { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 12 }}>
            <Pressable
              onPress={handleBack}
              className={isWebDesktop ? 'active:opacity-70' : 'mr-4 active:opacity-50'}
              style={{
                width: isWebDesktop ? 40 : undefined,
                height: isWebDesktop ? 40 : undefined,
                borderRadius: isWebDesktop ? 12 : undefined,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: isWebDesktop ? 14 : undefined,
              }}
            >
              <ArrowLeft size={isWebDesktop ? 20 : 24} color={colors.text.primary} strokeWidth={2} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: colors.text.primary,
                  fontSize: isWebDesktop ? 24 : 18,
                  lineHeight: isWebDesktop ? 30 : 24,
                  fontWeight: '700',
                }}
                numberOfLines={1}
              >
                {capitalizeDisplayLabel(item.name)}
              </Text>
              <Text style={{ color: colors.text.tertiary, fontSize: isWebDesktop ? 13 : 12, marginTop: 2 }}>
                Warehouse Item
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              onPress={handleOpenCount}
              style={{
                height: 42,
                paddingHorizontal: 14,
                borderRadius: 999,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                borderWidth: 1,
                borderColor: colors.border.light,
                backgroundColor: colors.bg.card,
              }}
            >
              <ClipboardCheck size={14} color={colors.text.primary} strokeWidth={2.2} />
              <Text style={{ color: colors.text.primary, marginLeft: 6, fontWeight: '600', fontSize: 12 }}>Count</Text>
            </Pressable>
            <Pressable
              onPress={handleOpenEdit}
              style={{
                height: 42,
                paddingHorizontal: 14,
                borderRadius: 999,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                backgroundColor: colors.accent.primary,
              }}
            >
              <Pencil size={14} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={2.2} />
              <Text style={{ color: isDark ? '#000000' : '#FFFFFF', marginLeft: 6, fontWeight: '600', fontSize: 12 }}>Edit</Text>
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
          paddingTop: isWebDesktop ? 20 : 0,
          paddingBottom: tabBarHeight + 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            borderWidth: 1,
            borderColor: colors.border.light,
            borderRadius: 16,
            padding: 14,
            backgroundColor: colors.bg.card,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          {item.imageUrl ? (
            <View style={{ width: 62, height: 62, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.border.light, marginRight: 12 }}>
              <ResolvedAttachmentImage imageUrl={item.imageUrl} style={{ width: 62, height: 62 }} resizeMode="cover" />
            </View>
          ) : (
            <View
              style={{
                width: 62,
                height: 62,
                borderRadius: 14,
                marginRight: 12,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.bg.secondary,
                borderWidth: 1,
                borderColor: colors.border.light,
              }}
            >
              <Package size={26} color={colors.text.muted} strokeWidth={1.8} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: '600' }}>
              {capitalizeDisplayLabel(item.name)}
            </Text>
            <Text style={{ color: colors.text.muted, fontSize: 13, marginTop: 2 }}>
              {item.category} · {item.unit}
            </Text>
          </View>
          <Pressable
            onPress={() => setShowDeleteModal(true)}
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              borderWidth: 1,
              borderColor: colors.border.light,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Trash2 size={15} color="#EF4444" strokeWidth={2} />
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <View
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: colors.border.light,
              borderRadius: 14,
              padding: 12,
              backgroundColor: colors.bg.card,
            }}
          >
            <Text style={{ color: colors.text.muted, fontSize: 10, fontWeight: '600', letterSpacing: 0.3 }}>STOCK</Text>
            <Text style={{ color: colors.text.primary, fontSize: 24, fontWeight: '700', marginTop: 2 }}>
              {item.currentStock}
            </Text>
            <Text style={{ color: colors.text.muted, fontSize: 12 }}>{item.unit}</Text>
          </View>
          <View
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: colors.border.light,
              borderRadius: 14,
              padding: 12,
              backgroundColor: colors.bg.card,
            }}
          >
            <Text style={{ color: colors.text.muted, fontSize: 10, fontWeight: '600', letterSpacing: 0.3 }}>
              NEXT COUNT
            </Text>
            <Text style={{ color: isOverdue ? '#EF4444' : colors.text.primary, fontSize: 16, fontWeight: '600', marginTop: 4 }}>
              {nextCountDate ? formatDate(nextCountDate.toISOString()) : 'Not set'}
            </Text>
            <Text style={{ color: isOverdue ? '#EF4444' : colors.text.muted, fontSize: 12 }}>
              {isOverdue ? 'Overdue' : item.countFrequency}
            </Text>
          </View>
        </View>

        <View
          style={{
            marginTop: 12,
            borderWidth: 1,
            borderColor: colors.border.light,
            borderRadius: 16,
            backgroundColor: colors.bg.card,
            overflow: 'hidden',
          }}
        >
          <View style={{ paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: separatorColor }}>
            <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: '600' }}>Recent Counts</Text>
          </View>

          {latestCounts.length === 0 ? (
            <View style={{ paddingHorizontal: 14, paddingVertical: 18 }}>
              <Text style={{ color: colors.text.muted, fontSize: 13 }}>No count records yet.</Text>
            </View>
          ) : (
            latestCounts.map((entry, index) => (
              <View
                key={entry.id}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  borderBottomWidth: index === latestCounts.length - 1 ? 0 : 1,
                  borderBottomColor: separatorColor,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.text.primary, fontWeight: '600', fontSize: 14 }}>
                    {entry.quantity} {item.unit}
                  </Text>
                  <Text style={{ color: colors.text.muted, fontSize: 12 }}>
                    {formatDateTime(entry.countedAt)}
                  </Text>
                </View>
                {entry.countedBy ? (
                  <Text style={{ color: colors.text.muted, fontSize: 12, marginTop: 3 }}>
                    by {entry.countedBy}
                  </Text>
                ) : null}
                {entry.notes ? (
                  <Text style={{ color: colors.text.secondary, fontSize: 12, marginTop: 3 }}>
                    {entry.notes}
                  </Text>
                ) : null}
              </View>
            ))
          )}
        </View>

        {item.notes ? (
          <View
            style={{
              marginTop: 12,
              borderWidth: 1,
              borderColor: colors.border.light,
              borderRadius: 16,
              padding: 14,
              backgroundColor: colors.bg.card,
            }}
          >
            <Text style={{ color: colors.text.muted, fontSize: 11, fontWeight: '600', letterSpacing: 0.4 }}>NOTES</Text>
            <Text style={{ color: colors.text.secondary, fontSize: 14, marginTop: 6, lineHeight: 20 }}>
              {item.notes}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <Modal
        visible={showCountModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCountModal(false)}
      >
        <Pressable
          onPress={() => setShowCountModal(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 420,
              borderRadius: 16,
              backgroundColor: colors.bg.primary,
              borderWidth: 1,
              borderColor: colors.border.light,
              padding: 16,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: '700' }}>Record Count</Text>
              <Pressable onPress={() => setShowCountModal(false)}>
                <X size={18} color={colors.text.tertiary} strokeWidth={2.2} />
              </Pressable>
            </View>

            <Text style={{ color: colors.text.muted, fontSize: 12, marginTop: 12 }}>Quantity</Text>
            <TextInput
              value={countQuantity}
              onChangeText={setCountQuantity}
              keyboardType="numeric"
              style={{
                marginTop: 6,
                height: 44,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.border.light,
                backgroundColor: colors.input.bg,
                paddingHorizontal: 12,
                color: colors.input.text,
              }}
            />

            <Text style={{ color: colors.text.muted, fontSize: 12, marginTop: 10 }}>Notes (optional)</Text>
            <TextInput
              value={countNotes}
              onChangeText={setCountNotes}
              placeholder="Add note"
              placeholderTextColor={colors.input.placeholder}
              multiline
              style={{
                marginTop: 6,
                minHeight: 72,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.border.light,
                backgroundColor: colors.input.bg,
                paddingHorizontal: 12,
                paddingVertical: 10,
                color: colors.input.text,
                textAlignVertical: 'top',
              }}
            />

            <Pressable
              onPress={handleSubmitCount}
              style={{
                marginTop: 14,
                height: 44,
                borderRadius: 999,
                backgroundColor: colors.accent.primary,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
              }}
            >
              <Save size={16} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={2.2} />
              <Text style={{ color: isDark ? '#000000' : '#FFFFFF', marginLeft: 8, fontWeight: '600' }}>Save Count</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showEditModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEditModal(false)}
      >
        <Pressable
          onPress={() => setShowEditModal(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 460,
              borderRadius: 16,
              backgroundColor: colors.bg.primary,
              borderWidth: 1,
              borderColor: colors.border.light,
              padding: 16,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: '700' }}>Edit Item</Text>
              <Pressable onPress={() => setShowEditModal(false)}>
                <X size={18} color={colors.text.tertiary} strokeWidth={2.2} />
              </Pressable>
            </View>

            <Text style={{ color: colors.text.muted, fontSize: 12, marginTop: 12 }}>Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Item name"
              placeholderTextColor={colors.input.placeholder}
              style={{
                marginTop: 6,
                height: 44,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.border.light,
                backgroundColor: colors.input.bg,
                paddingHorizontal: 12,
                color: colors.input.text,
              }}
            />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text.muted, fontSize: 12 }}>Category</Text>
                <TextInput
                  value={category}
                  onChangeText={setCategory}
                  placeholder="Category"
                  placeholderTextColor={colors.input.placeholder}
                  style={{
                    marginTop: 6,
                    height: 44,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: colors.border.light,
                    backgroundColor: colors.input.bg,
                    paddingHorizontal: 12,
                    color: colors.input.text,
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text.muted, fontSize: 12 }}>Unit</Text>
                <TextInput
                  value={unit}
                  onChangeText={setUnit}
                  placeholder="pcs"
                  placeholderTextColor={colors.input.placeholder}
                  style={{
                    marginTop: 6,
                    height: 44,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: colors.border.light,
                    backgroundColor: colors.input.bg,
                    paddingHorizontal: 12,
                    color: colors.input.text,
                  }}
                />
              </View>
            </View>

            <Text style={{ color: colors.text.muted, fontSize: 12, marginTop: 10 }}>Stock</Text>
            <TextInput
              value={stock}
              onChangeText={setStock}
              keyboardType="numeric"
              style={{
                marginTop: 6,
                height: 44,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.border.light,
                backgroundColor: colors.input.bg,
                paddingHorizontal: 12,
                color: colors.input.text,
              }}
            />

            <Text style={{ color: colors.text.muted, fontSize: 12, marginTop: 10 }}>Notes</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Notes"
              placeholderTextColor={colors.input.placeholder}
              multiline
              style={{
                marginTop: 6,
                minHeight: 72,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.border.light,
                backgroundColor: colors.input.bg,
                paddingHorizontal: 12,
                paddingVertical: 10,
                color: colors.input.text,
                textAlignVertical: 'top',
              }}
            />

            <Pressable
              onPress={handleSaveEdit}
              style={{
                marginTop: 14,
                height: 44,
                borderRadius: 999,
                backgroundColor: colors.accent.primary,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
              }}
            >
              <Save size={16} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={2.2} />
              <Text style={{ color: isDark ? '#000000' : '#FFFFFF', marginLeft: 8, fontWeight: '600' }}>Save Changes</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <Pressable
          onPress={() => setShowDeleteModal(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 360,
              borderRadius: 16,
              backgroundColor: colors.bg.primary,
              borderWidth: 1,
              borderColor: colors.border.light,
              padding: 16,
            }}
          >
            <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: '700' }}>Delete item?</Text>
            <Text style={{ color: colors.text.muted, marginTop: 6 }}>
              This will remove {capitalizeDisplayLabel(item.name)} and its count history.
            </Text>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <Pressable
                onPress={() => setShowDeleteModal(false)}
                style={{
                  flex: 1,
                  height: 42,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: colors.border.light,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: colors.text.primary, fontWeight: '600' }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleDelete}
                style={{
                  flex: 1,
                  height: 42,
                  borderRadius: 999,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#EF4444',
                }}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>Delete</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
