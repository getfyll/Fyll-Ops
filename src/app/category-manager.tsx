import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, Alert, Modal, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Pencil, Tag, Trash2 } from 'lucide-react-native';
import useFyllStore from '@/lib/state/fyll-store';
import useAuthStore from '@/lib/state/auth-store';
import { useThemeColors } from '@/lib/theme';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import * as Haptics from 'expo-haptics';
import { getSettingsWebPanelStyles, isFromSettingsRoute } from '@/lib/settings-web-panel';
import { useSettingsBack } from '@/lib/useSettingsBack';

// Hairline separator colors
const SEPARATOR_LIGHT = '#EEEEEE';
const SEPARATOR_DARK = '#333333';
export default function CategoryManagerScreen() {
  const { from } = useLocalSearchParams<{ from?: string | string[] }>();
  const goBack = useSettingsBack();
  const colors = useThemeColors();
  const panelStyles = getSettingsWebPanelStyles(
    isFromSettingsRoute(from),
    colors.bg.primary,
    colors.border.light
  );
  const isDark = colors.bg.primary === '#111111';
  const separatorColor = isDark ? SEPARATOR_DARK : SEPARATOR_LIGHT;

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
      <SafeAreaView className="flex-1" edges={['top']}>
        {/* Header */}
        <View className="flex-row items-center px-5 py-4" style={{ borderBottomWidth: 0.5, borderBottomColor: separatorColor }}>
          <Pressable
            onPress={goBack}
            className="w-10 h-10 items-center justify-center mr-3 active:opacity-50"
            style={{ backgroundColor: 'transparent' }}
          >
            <ArrowLeft size={20} color={colors.text.primary} strokeWidth={2} />
          </Pressable>
          <Text style={{ color: colors.text.primary, fontSize: 14, lineHeight: 18, fontWeight: '600' }}>Categories</Text>
        </View>

        <KeyboardAwareScrollView className="flex-1 px-5" showsVerticalScrollIndicator={false} enableOnAndroid extraScrollHeight={100}>
          {/* Add New Category */}
          <View className="rounded-xl p-4 mt-4" style={{ backgroundColor: colors.bg.card, borderWidth: 0.5, borderColor: separatorColor }}>
            <Text style={{ color: colors.text.primary }} className="font-bold text-sm mb-3">Add New Category</Text>
            <View className="rounded-xl px-4" style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light, height: 52, justifyContent: 'center' }}>
              <TextInput
                placeholder="Category name"
                placeholderTextColor={colors.input.placeholder}
                value={newCategoryName}
                onChangeText={setNewCategoryName}
                onSubmitEditing={handleAddCategory}
                style={{ color: colors.input.text, fontSize: 14 }}
                selectionColor={colors.text.primary}
              />
            </View>
            <Pressable
              onPress={handleAddCategory}
              disabled={!newCategoryName.trim()}
              className="mt-3 rounded-xl items-center justify-center active:opacity-80"
              style={{ backgroundColor: newCategoryName.trim() ? colors.text.primary : colors.border.light, height: 48 }}
            >
              <Text style={{ color: newCategoryName.trim() ? colors.bg.primary : colors.text.muted }} className="font-semibold text-sm">
                Add Category
              </Text>
            </Pressable>
          </View>

          {/* Info Card */}
          <View className="rounded-xl p-4 mt-4" style={{ backgroundColor: colors.bg.secondary, borderWidth: 0.5, borderColor: separatorColor }}>
            <Text style={{ color: colors.text.tertiary }} className="text-sm leading-5">
              Categories are shared across all products. Add categories here to use them when creating or editing products.
            </Text>
          </View>

          {/* Categories List */}
          <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase mt-6 mb-3 tracking-wider">
            All Categories ({categories.length})
          </Text>

          {categories.length === 0 ? (
            <View className="rounded-xl p-6 items-center" style={{ backgroundColor: colors.bg.card, borderWidth: 0.5, borderColor: separatorColor }}>
              <View
                className="w-16 h-16 rounded-2xl items-center justify-center mb-4"
                style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)' }}
              >
                <Tag size={32} color="#3B82F6" strokeWidth={1.5} />
              </View>
              <Text style={{ color: colors.text.tertiary }} className="text-base mb-1">No categories yet</Text>
              <Text style={{ color: colors.text.muted }} className="text-sm text-center px-4">
                Add your first category above to organize your products
              </Text>
            </View>
          ) : (
            categories.map((category) => (
              <View
                key={category}
                className="mb-2"
              >
                <View
                  className="rounded-xl px-4 flex-row items-center justify-between"
                  style={{ backgroundColor: colors.bg.card, borderWidth: 0.5, borderColor: separatorColor, height: 56 }}
                >
                  <View className="flex-row items-center flex-1">
                    <View
                      className="w-8 h-8 rounded-lg items-center justify-center mr-3"
                      style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)' }}
                    >
                      <Tag size={16} color="#3B82F6" strokeWidth={2} />
                    </View>
                    <Text style={{ color: colors.text.primary }} className="font-medium text-sm">{category}</Text>
                  </View>
                  <View className="flex-row items-center">
                    <Pressable
                      onPress={() => openEditCategory(category)}
                      className="w-10 h-10 rounded-lg items-center justify-center active:opacity-50 mr-2"
                      style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)' }}
                    >
                      <Pencil size={18} color="#3B82F6" strokeWidth={2} />
                    </Pressable>
                    <Pressable
                      onPress={() => openDeleteCategory(category)}
                      className="w-10 h-10 rounded-lg items-center justify-center active:opacity-50"
                      style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}
                    >
                      <Trash2 size={18} color="#EF4444" strokeWidth={2} />
                    </Pressable>
                  </View>
                </View>
              </View>
            ))
          )}

          <View className="h-24" />
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
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.45)' }}
          onPress={() => setPendingDeleteCategory(null)}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            className="w-[90%] rounded-2xl p-5"
            style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light, maxWidth: 420 }}
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
                <Text style={{ color: colors.text.secondary }} className="font-semibold">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={confirmDeleteCategory}
                className="flex-1 rounded-xl items-center justify-center"
                style={{ height: 48, backgroundColor: '#EF4444' }}
              >
                <Text className="text-white font-semibold">Delete</Text>
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
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.45)' }}
          onPress={() => setPendingEditCategory(null)}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            className="w-[90%] rounded-2xl p-5"
            style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light, maxWidth: 420 }}
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
                <Text style={{ color: colors.text.secondary }} className="font-semibold">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={confirmEditCategory}
                className="flex-1 rounded-xl items-center justify-center"
                style={{ height: 48, backgroundColor: colors.text.primary }}
              >
                <Text style={{ color: colors.bg.primary }} className="font-semibold">Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
