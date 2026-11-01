import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, Alert, Modal, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Pencil, Tag, Trash2, Plus, X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import useFyllStore from '@/lib/state/fyll-store';
import useAuthStore from '@/lib/state/auth-store';
import { useResolvedThemeMode, useThemeColors } from '@/lib/theme';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import * as Haptics from 'expo-haptics';
import { getSettingsWebPanelStyles, isFromSettingsRoute } from '@/lib/settings-web-panel';
import { useSettingsBack } from '@/lib/useSettingsBack';
import { EmptyState } from '@/components/EmptyState';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { useTabBarHeight } from '@/lib/useTabBarHeight';
import { FYLL_LIME, FYLL_LIME_INK, MoneyText, usePaymentsPalette } from '@/components/payments/payments-ui';

export default function CategoryManagerScreen() {
  const { from } = useLocalSearchParams<{ from?: string | string[] }>();
  const goBack = useSettingsBack();
  const colors = useThemeColors();
  const resolvedThemeMode = useResolvedThemeMode();
  const settingsPalette = usePaymentsPalette();
  const { isDesktop, isMobile } = useBreakpoint();
  const tabBarHeight = useTabBarHeight();
  const panelStyles = getSettingsWebPanelStyles(
    isFromSettingsRoute(from),
    colors.bg.primary,
    colors.border.light
  );

  const categories = useFyllStore((s) => s.categories);
  const addCategory = useFyllStore((s) => s.addCategory);
  const updateCategory = useFyllStore((s) => s.updateCategory);
  const deleteCategory = useFyllStore((s) => s.deleteCategory);
  const saveGlobalSettings = useFyllStore((s) => s.saveGlobalSettings);
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);

  const [newCategoryName, setNewCategoryName] = useState('');
  const [pendingDeleteCategory, setPendingDeleteCategory] = useState<string | null>(null);
  const [pendingEditCategory, setPendingEditCategory] = useState<string | null>(null);
  const [editedCategoryName, setEditedCategoryName] = useState('');
  const [showAddCategoryForm, setShowAddCategoryForm] = useState(false);

  const handleAddCategory = async () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;

    if (categories.some((category) => category.trim().toLowerCase() === trimmed.toLowerCase())) {
      Alert.alert('Duplicate', 'This category already exists.');
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addCategory(trimmed);
    if (businessId) {
      const result = await saveGlobalSettings(businessId);
      if (!result.success) {
        Alert.alert('Save failed', result.error ?? 'Could not save this change.');
      }
    }
    setNewCategoryName('');
    setShowAddCategoryForm(false);
  };

  const openDeleteCategory = (category: string) => {
    if (Platform.OS === 'web') {
      const active = document.activeElement as HTMLElement | null;
      active?.blur();
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPendingDeleteCategory(category);
  };

  const confirmDeleteCategory = async () => {
    if (!pendingDeleteCategory) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    deleteCategory(pendingDeleteCategory, businessId);
    setPendingDeleteCategory(null);
    if (businessId) {
      const result = await saveGlobalSettings(businessId);
      if (!result.success) {
        Alert.alert('Delete failed', result.error ?? 'Could not delete this category.');
      }
    }
  };

  const openEditCategory = (category: string) => {
    if (Platform.OS === 'web') {
      const active = document.activeElement as HTMLElement | null;
      active?.blur();
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPendingEditCategory(category);
    setEditedCategoryName(category);
  };

  const confirmEditCategory = async () => {
    if (!pendingEditCategory) return;
    const trimmed = editedCategoryName.trim();
    if (!trimmed) {
      Alert.alert('Invalid name', 'Category name cannot be empty.');
      return;
    }
    const duplicate = categories.some((category) =>
      category.trim().toLowerCase() === trimmed.toLowerCase() &&
      category !== pendingEditCategory
    );
    if (duplicate) {
      Alert.alert('Duplicate', 'This category already exists.');
      return;
    }
    updateCategory(pendingEditCategory, trimmed);
    setPendingEditCategory(null);
    if (businessId) {
      const result = await saveGlobalSettings(businessId);
      if (!result.success) {
        Alert.alert('Save failed', result.error ?? 'Could not save this change.');
      }
    }
  };

  return (
    <View style={panelStyles.outer}>
      <View style={panelStyles.inner}>
      <SafeAreaView className="flex-1" edges={['top']} style={{ backgroundColor: settingsPalette.page }}>
        <LinearGradient pointerEvents="none" colors={resolvedThemeMode === 'dark' ? ['rgba(111,125,18,0.55)', 'rgba(20,20,20,0)'] : ['rgba(213,224,87,0.42)', 'rgba(244,243,235,0)']} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 360 }} />
        <View className="flex-row items-center" style={{ minHeight: isMobile ? 66 : 58, paddingHorizontal: 10, paddingTop: isMobile ? 12 : 4, paddingBottom: 4 }}>
          <Pressable
            onPress={goBack}
            className="w-10 h-10 items-center justify-center mr-3 active:opacity-50"
            style={{ borderRadius: 20, backgroundColor: settingsPalette.softFill }}
          >
            <ArrowLeft size={18} color={settingsPalette.text} strokeWidth={2.2} />
          </Pressable>
          <View><Text style={{ color: settingsPalette.faint, fontSize: 9.5, lineHeight: 12, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' }}>Settings</Text><Text style={{ color: settingsPalette.text, fontSize: 17, lineHeight: 21, fontWeight: '600' }}>Categories</Text></View>
        </View>

        <KeyboardAwareScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: isDesktop ? 64 : tabBarHeight + 40 }} showsVerticalScrollIndicator={false} enableOnAndroid extraScrollHeight={100}>
          <View style={{ width: '100%', maxWidth: 720, alignSelf: 'center' }}>
          <View style={{ position: 'relative', overflow: 'hidden', minHeight: 156, marginBottom: 20, padding: 20, borderRadius: 28, borderWidth: 1, borderColor: settingsPalette.border, backgroundColor: settingsPalette.card, shadowColor: '#000', shadowOpacity: resolvedThemeMode === 'dark' ? 0.24 : 0.07, shadowRadius: 24, shadowOffset: { width: 0, height: 10 } }}>
            <LinearGradient pointerEvents="none" colors={[settingsPalette.nudgeBg, 'transparent']} start={{ x: 1, y: 0 }} end={{ x: 0.2, y: 1 }} style={{ position: 'absolute', top: -44, right: -36, width: 210, height: 210, borderRadius: 105 }} />
            <View style={{ position: 'absolute', top: 0, left: 28, right: 28, height: 3, backgroundColor: FYLL_LIME }} />
            <View className="flex-row items-center" style={{ gap: 15 }}><LinearGradient colors={[FYLL_LIME, '#879400']} style={{ width: 66, height: 66, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}><Tag size={28} color={FYLL_LIME_INK} strokeWidth={2.1} /></LinearGradient><View style={{ flex: 1 }}><Text style={{ color: settingsPalette.faint, fontSize: 10, fontWeight: '700', letterSpacing: 1.15, textTransform: 'uppercase' }}>Product organisation</Text><MoneyText style={{ color: settingsPalette.text, fontSize: 26, lineHeight: 31 }}>{categories.length} {categories.length === 1 ? 'category' : 'categories'}</MoneyText><Text style={{ color: settingsPalette.faint, fontSize: 12.5, marginTop: 3 }}>Shared across your product catalogue</Text></View></View>
          </View>

          <Pressable onPress={() => setShowAddCategoryForm((value) => !value)} className="rounded-full flex-row items-center justify-center active:opacity-80 mb-4" style={{ minHeight: 48, gap: 8, backgroundColor: FYLL_LIME }}>
            {showAddCategoryForm ? <X size={16} color={FYLL_LIME_INK} strokeWidth={2.4} /> : <Plus size={16} color={FYLL_LIME_INK} strokeWidth={2.4} />}
            <MoneyText style={{ color: FYLL_LIME_INK, fontSize: 14, fontWeight: '700' }}>{showAddCategoryForm ? 'Close' : 'New category'}</MoneyText>
          </Pressable>

          {showAddCategoryForm ? <View className="rounded-3xl p-4 mb-5" style={{ backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.border }}>
            <Text style={{ color: settingsPalette.text, fontSize: 14, fontWeight: '700', marginBottom: 12 }}>Add category</Text>
            <View className="rounded-2xl px-4" style={{ backgroundColor: settingsPalette.inset, borderWidth: 1, borderColor: settingsPalette.outline, height: 52, justifyContent: 'center' }}>
              <TextInput
                autoFocus
                placeholder="Category name"
                placeholderTextColor={colors.input.placeholder}
                value={newCategoryName}
                onChangeText={setNewCategoryName}
                onSubmitEditing={handleAddCategory}
                style={{ color: settingsPalette.text, fontSize: 14 }}
                selectionColor={FYLL_LIME}
              />
            </View>
            <Pressable
              onPress={handleAddCategory}
              disabled={!newCategoryName.trim()}
              className="mt-3 rounded-full items-center justify-center active:opacity-80"
              style={{ backgroundColor: FYLL_LIME, opacity: newCategoryName.trim() ? 1 : 0.5, height: 48 }}
            >
              <MoneyText style={{ color: FYLL_LIME_INK, fontSize: 14, fontWeight: '700' }}>Save category</MoneyText>
            </Pressable>
          </View> : null}

          <Text style={{ color: settingsPalette.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 10, marginLeft: 2 }}>All categories</Text>

          {categories.length === 0 ? (
            <EmptyState
              icon={Tag}
              title="No categories yet"
              description="Add your first category above to organize your products."
            />
          ) : (
            categories.map((category) => (
              <View
                key={category}
                className="mb-2"
              >
                <View
                  className="rounded-3xl px-4 flex-row items-center justify-between"
                  style={{ backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.border, minHeight: 68 }}
                >
                  <View className="flex-row items-center flex-1">
                    <View
                      className="w-10 h-10 rounded-2xl items-center justify-center mr-3"
                      style={{ backgroundColor: settingsPalette.nudgeBg }}
                    >
                      <Tag size={17} color={settingsPalette.limeOnSurface} strokeWidth={2} />
                    </View>
                    <Text style={{ color: settingsPalette.text, fontSize: 14, fontWeight: '600' }}>{category}</Text>
                  </View>
                  <View className="flex-row items-center">
                    <Pressable
                      onPress={() => openEditCategory(category)}
                      className="items-center justify-center active:opacity-50"
                      style={{ width: 30, height: 30, marginRight: 2 }}
                    >
                      <Pencil size={13} color={settingsPalette.limeOnSurface} strokeWidth={2.2} />
                    </Pressable>
                    <Pressable
                      onPress={() => openDeleteCategory(category)}
                      className="items-center justify-center active:opacity-50"
                      style={{ width: 30, height: 30 }}
                    >
                      <Trash2 size={13} color={settingsPalette.danger} strokeWidth={2.2} />
                    </Pressable>
                  </View>
                </View>
              </View>
            ))
          )}

          <View className="h-24" />
          </View>
        </KeyboardAwareScrollView>
      </SafeAreaView>
      </View>

      <Modal
        visible={!!pendingDeleteCategory}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingDeleteCategory(null)}
      >
        <Pressable
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.72)' }}
          onPress={() => setPendingDeleteCategory(null)}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            className="w-[90%] rounded-3xl p-5"
            style={{ backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.border, maxWidth: 420 }}
          >
            <Text style={{ color: colors.text.primary, fontSize: 14, lineHeight: 18, fontWeight: '600', marginBottom: 8 }}>Delete category?</Text>
            <Text style={{ color: colors.text.tertiary }} className="text-sm mb-4">
              This will remove "{pendingDeleteCategory}" from all products.
            </Text>
            <View className="flex-row gap-3">
              <Pressable
                onPress={() => setPendingDeleteCategory(null)}
                className="flex-1 rounded-xl items-center justify-center"
                style={{ height: 48, backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
              >
                <Text style={{ color: settingsPalette.text, fontSize: 14, fontWeight: '600' }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={confirmDeleteCategory}
                className="flex-1 rounded-xl items-center justify-center"
                style={{ height: 48, backgroundColor: '#EF4444' }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '600' }}>Delete</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={!!pendingEditCategory}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingEditCategory(null)}
      >
        <Pressable
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.72)' }}
          onPress={() => setPendingEditCategory(null)}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            className="w-[90%] rounded-3xl p-5"
            style={{ backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.border, maxWidth: 420 }}
          >
            <Text style={{ color: colors.text.primary, fontSize: 14, lineHeight: 18, fontWeight: '600', marginBottom: 8 }}>Edit category</Text>
            <TextInput
              placeholder="Category name"
              placeholderTextColor={colors.input.placeholder}
              value={editedCategoryName}
              onChangeText={setEditedCategoryName}
              className="rounded-xl px-4 py-3 text-base mb-4"
              style={{ backgroundColor: colors.input.bg, color: colors.input.text, borderWidth: 1, borderColor: colors.border.light }}
            />
            <View className="flex-row gap-3">
              <Pressable
                onPress={() => setPendingEditCategory(null)}
                className="flex-1 rounded-xl items-center justify-center"
                style={{ height: 48, backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
              >
                <Text style={{ color: settingsPalette.text, fontSize: 14, fontWeight: '600' }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={confirmEditCategory}
                className="flex-1 rounded-xl items-center justify-center"
                style={{ height: 48, backgroundColor: FYLL_LIME }}
              >
                <MoneyText style={{ color: FYLL_LIME_INK, fontSize: 14, fontWeight: '700' }}>Save</MoneyText>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
