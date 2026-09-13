import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Plus, Trash2, Edit3, Check, X, Palette, Tag, ChevronDown, ChevronUp } from 'lucide-react-native';
import useFyllStore, { ProductOption } from '@/lib/state/fyll-store';
import useAuthStore from '@/lib/state/auth-store';
import * as Haptics from 'expo-haptics';
import { Button } from '@/components/Button';
import { TagPillInput } from '@/components/TagPillInput';
import { useThemeColors } from '@/lib/theme';
import { getSettingsWebPanelStyles, isFromSettingsRoute } from '@/lib/settings-web-panel';
import { useSettingsBack } from '@/lib/useSettingsBack';
import { cn } from '@/lib/cn';

export default function ProductOptionsScreen() {
  const colors = useThemeColors();
  const { from } = useLocalSearchParams<{ from?: string | string[] }>();
  const goBack = useSettingsBack();
  const openedFromSettings = isFromSettingsRoute(from);
  const panelStyles = getSettingsWebPanelStyles(openedFromSettings, colors.bg.primary, colors.border.light);
  const productOptions = useFyllStore((s) => s.productOptions);
  const addProductOption = useFyllStore((s) => s.addProductOption);
  const updateProductOption = useFyllStore((s) => s.updateProductOption);
  const deleteProductOption = useFyllStore((s) => s.deleteProductOption);
  const saveGlobalSettings = useFyllStore((s) => s.saveGlobalSettings);
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newOptionName, setNewOptionName] = useState('');
  const [newOptionValues, setNewOptionValues] = useState<string[]>([]);
  const [editingValueId, setEditingValueId] = useState<string | null>(null);
  const [editingValueText, setEditingValueText] = useState('');
  const [addingValueToId, setAddingValueToId] = useState<string | null>(null);
  const [newValueText, setNewValueText] = useState('');
  const [pendingDeleteOption, setPendingDeleteOption] = useState<ProductOption | null>(null);
  const [expandedOptionIds, setExpandedOptionIds] = useState<Set<string>>(new Set());

  const toggleOptionExpanded = (optionId: string) => {
    Haptics.selectionAsync();
    setExpandedOptionIds((prev) => {
      const next = new Set(prev);
      if (next.has(optionId)) next.delete(optionId);
      else next.add(optionId);
      return next;
    });
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setNewOptionName('');
    setNewOptionValues([]);
  };

  const handleAddOption = async () => {
    const name = newOptionName.trim();
    if (!name) return;

    if (productOptions.some((option) => option.name.trim().toLowerCase() === name.toLowerCase())) {
      Alert.alert('Already exists', 'This product option already exists. Open it below to add or edit values.');
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const newOption: ProductOption = {
      id: Math.random().toString(36).substring(2, 15),
      name,
      values: newOptionValues,
    };

    addProductOption(newOption);
    setExpandedOptionIds((prev) => new Set(prev).add(newOption.id));
    if (businessId) {
      const result = await saveGlobalSettings(businessId);
      if (!result.success) {
        Alert.alert('Save failed', result.error ?? 'Could not save this change.');
      }
    }
    closeAddModal();
  };

  const openDeleteOption = (option: ProductOption) => {
    if (Platform.OS === 'web') {
      const active = document.activeElement as HTMLElement | null;
      active?.blur();
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPendingDeleteOption(option);
  };

  const confirmDeleteOption = async () => {
    if (!pendingDeleteOption) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    deleteProductOption(pendingDeleteOption.id, businessId);
    setPendingDeleteOption(null);
    if (businessId) {
      const result = await saveGlobalSettings(businessId);
      if (!result.success) {
        Alert.alert('Delete failed', result.error ?? 'Could not delete this option.');
      }
    }
  };

  const handleAddValue = async (optionId: string) => {
    if (!newValueText.trim()) return;

    const option = productOptions.find((v) => v.id === optionId);
    if (!option) return;

    // Check for duplicates
    if (option.values.includes(newValueText.trim())) {
      Alert.alert('Duplicate Value', 'This value already exists.');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateProductOption(optionId, {
      values: [...option.values, newValueText.trim()],
    });
    if (businessId) {
      const result = await saveGlobalSettings(businessId);
      if (!result.success) {
        Alert.alert('Save failed', result.error ?? 'Could not save this change.');
      }
    }

    setNewValueText('');
    setAddingValueToId(null);
  };

  const handleEditValue = async (optionId: string, oldValue: string) => {
    if (!editingValueText.trim()) return;

    const option = productOptions.find((v) => v.id === optionId);
    if (!option) return;

    // Check for duplicates (excluding the current value)
    if (option.values.filter(v => v !== oldValue).includes(editingValueText.trim())) {
      Alert.alert('Duplicate Value', 'This value already exists.');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateProductOption(optionId, {
      values: option.values.map((v) => v === oldValue ? editingValueText.trim() : v),
    });
    if (businessId) {
      const result = await saveGlobalSettings(businessId);
      if (!result.success) {
        Alert.alert('Save failed', result.error ?? 'Could not save this change.');
      }
    }

    setEditingValueId(null);
    setEditingValueText('');
  };

  const handleDeleteValue = (optionId: string, value: string) => {
    const option = productOptions.find((v) => v.id === optionId);
    if (!option) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Delete Value',
      `Are you sure you want to delete "${value}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            updateProductOption(optionId, {
              values: option.values.filter((v) => v !== value),
            });
            if (businessId) {
              void saveGlobalSettings(businessId);
            }
          },
        },
      ]
    );
  };

  const startEditingValue = (optionId: string, value: string) => {
    setEditingValueId(`${optionId}-${value}`);
    setEditingValueText(value);
  };

  const getOptionIcon = (name: string) => {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('color') || lowerName.includes('colour')) {
      return <Palette size={20} color="#A855F7" strokeWidth={2} />;
    }
    return <Tag size={20} color="#3B82F6" strokeWidth={2} />;
  };

  return (
    <View style={panelStyles.outer}>
      <View style={panelStyles.inner}>
      <SafeAreaView className="flex-1" edges={['top']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          {/* Header */}
          <View className="flex-row items-center justify-between px-5 py-4 border-b" style={{ borderBottomColor: colors.border.light, backgroundColor: colors.bg.primary }}>
            <Pressable
              onPress={goBack}
              className="w-10 h-10 rounded-xl items-center justify-center active:opacity-50"
              style={{ backgroundColor: 'transparent' }}
            >
              <ArrowLeft size={20} color={colors.text.primary} strokeWidth={2} />
            </Pressable>
            <Text
              style={{
                color: colors.text.primary,
                fontSize: Platform.OS === 'web' ? 14 : 18,
                lineHeight: Platform.OS === 'web' ? 18 : 22,
                fontWeight: '600',
              }}
            >
              Product Options
            </Text>
            <View className="w-10" />
          </View>

          <ScrollView className="flex-1 px-5" style={{ backgroundColor: colors.bg.secondary }} showsVerticalScrollIndicator={false}>
            {/* Info Card */}
            <View>
              <View className="rounded-xl p-4 mt-4 border" style={{ backgroundColor: colors.bg.card, borderColor: colors.border.light }}>
                <Text style={{ color: colors.text.tertiary }} className="text-sm leading-5">
                  Create reusable options like Shoe Size, Width, Finish, Gift Message, or Packaging. Attach them to products when customers must choose something on each order item.
                </Text>
              </View>
            </View>

            {/* Add New Product Option Button */}
            <View>
              <Button
                onPress={() => {
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowAddModal(true);
                }}
                icon={<Plus size={20} color="#FFFFFF" strokeWidth={2.5} />}
                className="mt-4"
                fontSize={12}
              >
                Add Product Option
              </Button>
            </View>

            {/* Options List */}
            {productOptions.length === 0 ? (
              <View>
                <View className="rounded-xl p-6 mt-4 border items-center" style={{ backgroundColor: colors.bg.card, borderColor: colors.border.light }}>
                  <View
                    className="w-16 h-16 rounded-2xl items-center justify-center mb-4"
                    style={{ backgroundColor: 'rgba(168, 85, 247, 0.15)' }}
                  >
                    <Tag size={32} color="#A855F7" strokeWidth={1.5} />
                  </View>
                  <Text style={{ color: colors.text.tertiary }} className="text-base mb-1">No product options yet</Text>
                  <Text style={{ color: colors.text.muted }} className="text-sm text-center px-4">
                    Add reusable options like Shoe Size, Width, Finish, Gift Message, or Packaging. They are saved for this business and can be attached to any product.
                  </Text>
                </View>
              </View>
            ) : (
              productOptions.map((option, index) => {
                const isExpanded = expandedOptionIds.has(option.id);
                return (
                <View
                  key={option.id}                  className="mt-4"
                >
                  <View className="rounded-xl p-4 border" style={{ backgroundColor: colors.bg.card, borderColor: colors.border.light }}>
                    {/* Option Header */}
                    <Pressable
                      onPress={() => toggleOptionExpanded(option.id)}
                      className={cn('flex-row items-center justify-between', isExpanded ? 'mb-4' : '')}
                    >
                      <View className="flex-row items-center flex-1" style={{ minWidth: 0 }}>
                        <View
                          className="w-10 h-10 rounded-xl items-center justify-center mr-3"
                          style={{ backgroundColor: 'rgba(168, 85, 247, 0.15)' }}
                        >
                          {getOptionIcon(option.name)}
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={{ color: colors.text.primary }} className="font-bold text-base" numberOfLines={1}>{option.name}</Text>
                          <Text style={{ color: colors.text.muted }} className="text-xs">
                            {option.values.length} value{option.values.length !== 1 ? 's' : ''} · reusable
                          </Text>
                        </View>
                      </View>
                      <View className="flex-row items-center gap-1">
                        <Pressable
                          onPress={(e) => { e.stopPropagation(); openDeleteOption(option); }}
                          className="w-9 h-9 rounded-lg items-center justify-center active:opacity-50"
                          style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}
                        >
                          <Trash2 size={18} color="#EF4444" strokeWidth={2} />
                        </Pressable>
                        <View
                          className="w-9 h-9 rounded-lg items-center justify-center"
                          style={{ backgroundColor: colors.bg.secondary }}
                        >
                          {isExpanded ? (
                            <ChevronUp size={18} color={colors.text.muted} strokeWidth={2} />
                          ) : (
                            <ChevronDown size={18} color={colors.text.muted} strokeWidth={2} />
                          )}
                        </View>
                      </View>
                    </Pressable>

                    {!isExpanded ? null : (
                    <>
                    {/* Values List */}
                    <View className="mb-3">
                      {option.values.length === 0 ? (
                        <Text style={{ color: colors.text.muted }} className="text-sm italic">No values added yet</Text>
                      ) : (
                        option.values.map((value) => {
                          const isEditing = editingValueId === `${option.id}-${value}`;

                          return (
                            <View
                              key={`${option.id}-${value}`}                              className="mb-2"
                            >
                              {isEditing ? (
                                <View
                                  className="flex-row items-center rounded-xl px-3"
                                  style={{ backgroundColor: colors.bg.secondary, height: 48 }}
                                >
                                  <TextInput
                                    value={editingValueText}
                                    onChangeText={setEditingValueText}
                                    autoFocus
                                    style={{ flex: 1, color: colors.text.primary, fontSize: 14 }}
                                    selectionColor={colors.text.primary}
                                  />
                                  <Pressable
                                    onPress={() => {
                                      setEditingValueId(null);
                                      setEditingValueText('');
                                    }}
                                    className="w-8 h-8 rounded-lg items-center justify-center ml-2"
                                    style={{ backgroundColor: colors.border.light }}
                                  >
                                    <X size={16} color={colors.text.muted} strokeWidth={2} />
                                  </Pressable>
                                  <Pressable
                                    onPress={() => handleEditValue(option.id, value)}
                                    className="w-8 h-8 rounded-lg items-center justify-center ml-1"
                                    style={{ backgroundColor: 'rgba(34, 197, 94, 0.15)' }}
                                  >
                                    <Check size={16} color="#22C55E" strokeWidth={2} />
                                  </Pressable>
                                </View>
                              ) : (
                                <View
                                  className="flex-row items-center justify-between rounded-xl px-4"
                                  style={{ backgroundColor: colors.bg.secondary, height: 48 }}
                                >
                                  <Text style={{ color: colors.text.primary }} className="text-sm font-medium">{value}</Text>
                                  <View className="flex-row items-center gap-1">
                                    <Pressable
                                      onPress={() => startEditingValue(option.id, value)}
                                      className="w-8 h-8 rounded-lg items-center justify-center active:opacity-50"
                                      style={{ backgroundColor: colors.border.light }}
                                    >
                                      <Edit3 size={14} color={colors.text.muted} strokeWidth={2} />
                                    </Pressable>
                                    <Pressable
                                      onPress={() => handleDeleteValue(option.id, value)}
                                      className="w-8 h-8 rounded-lg items-center justify-center active:opacity-50"
                                      style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}
                                    >
                                      <Trash2 size={14} color="#EF4444" strokeWidth={2} />
                                    </Pressable>
                                  </View>
                                </View>
                              )}
                            </View>
                          );
                        })
                      )}
                    </View>

                    {/* Add Value */}
                    {addingValueToId === option.id ? (
                      <View
                        className="flex-row items-center rounded-xl px-3"
                        style={{ backgroundColor: colors.bg.secondary, height: 48 }}
                      >
                        <TextInput
                          placeholder="Enter new value..."
                          placeholderTextColor={colors.text.muted}
                          value={newValueText}
                          onChangeText={setNewValueText}
                          autoFocus
                          style={{ flex: 1, color: colors.text.primary, fontSize: 14 }}
                          selectionColor={colors.text.primary}
                          onSubmitEditing={() => handleAddValue(option.id)}
                        />
                        <Pressable
                          onPress={() => {
                            setAddingValueToId(null);
                            setNewValueText('');
                          }}
                          className="w-8 h-8 rounded-lg items-center justify-center ml-2"
                          style={{ backgroundColor: colors.border.light }}
                        >
                          <X size={16} color={colors.text.muted} strokeWidth={2} />
                        </Pressable>
                        <Pressable
                          onPress={() => handleAddValue(option.id)}
                          disabled={!newValueText.trim()}
                          className="w-8 h-8 rounded-lg items-center justify-center ml-1"
                          style={{
                            backgroundColor: 'rgba(34, 197, 94, 0.15)',
                            opacity: newValueText.trim() ? 1 : 0.5
                          }}
                        >
                          <Check size={16} color="#22C55E" strokeWidth={2} />
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => {
                          Haptics.selectionAsync();
                          setAddingValueToId(option.id);
                        }}
                        className="flex-row items-center justify-center py-2.5 rounded-xl active:opacity-70"
                        style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', borderWidth: 1, borderColor: 'rgba(59, 130, 246, 0.2)', borderStyle: 'dashed' }}
                      >
                        <Plus size={16} color="#3B82F6" strokeWidth={2.5} />
                        <Text className="text-blue-500 font-semibold ml-1.5" style={{ fontSize: 12 }}>Add Value</Text>
                      </Pressable>
                    )}
                    </>
                    )}
                  </View>
                </View>
                );
              })
            )}

            <View className="h-24" />
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Add Product Option Modal - Centered */}
        <Modal
          visible={showAddModal}
          animationType="fade"
          transparent
          onRequestClose={closeAddModal}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            className="flex-1"
          >
            <Pressable
              className="flex-1 items-center justify-center"
              style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
              onPress={closeAddModal}
            >
              <Pressable
                onPress={(e) => e.stopPropagation()}
                className="w-[90%] rounded-2xl overflow-hidden"
                style={{ backgroundColor: colors.bg.primary, maxWidth: 400 }}
              >
                {/* Header */}
                <View className="flex-row items-center justify-between px-5 py-4 border-b" style={{ borderBottomColor: colors.border.light }}>
                  <Text style={{ color: colors.text.primary, fontSize: 14, lineHeight: 18, fontWeight: '600' }}>New Product Option</Text>
                  <Pressable
                    onPress={closeAddModal}
                    className="w-8 h-8 rounded-full items-center justify-center active:opacity-50"
                    style={{ backgroundColor: colors.bg.secondary }}
                  >
                    <X size={18} color={colors.text.muted} strokeWidth={2} />
                  </Pressable>
                </View>

                <View className="px-5 py-4">
                  {/* Product Option Name Input */}
                  <View className="mb-4">
                    <Text style={{ color: colors.text.primary }} className="text-sm font-medium mb-2">Product Option Name</Text>
                    <View
                      className="rounded-xl px-4"
                      style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.input.border, height: 52, justifyContent: 'center' }}
                    >
                      <TextInput
                        placeholder="e.g. Shoe Size, Width, Finish"
                        placeholderTextColor={colors.text.muted}
                        value={newOptionName}
                        onChangeText={setNewOptionName}
                        autoFocus
                        style={{ color: colors.text.primary, fontSize: 14 }}
                        selectionColor={colors.text.primary}
                      />
                    </View>
                  </View>

                  <View className="mb-4">
                    <Text style={{ color: colors.text.primary }} className="text-sm font-medium mb-2">Values</Text>
                    <TagPillInput
                      values={newOptionValues}
                      onChange={setNewOptionValues}
                      placeholder="e.g. 36, 37, 38, 39 or Small, Medium, Large"
                    />
                    <Text style={{ color: colors.text.muted }} className="text-xs mt-2">Type a value then press comma or enter to turn it into a pill. You can edit them later.</Text>
                  </View>

                  {/* Buttons */}
                  <View className="flex-row gap-3">
                    <Button
                      onPress={closeAddModal}
                      variant="secondary"
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                    <Button
                      onPress={handleAddOption}
                      disabled={!newOptionName.trim()}
                      className="flex-1"
                    >
                      Create
                    </Button>
                  </View>
                </View>
              </Pressable>
            </Pressable>
          </KeyboardAvoidingView>
        </Modal>
      </SafeAreaView>
      </View>

      <Modal
        visible={!!pendingDeleteOption}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingDeleteOption(null)}
      >
        <Pressable
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.45)' }}
          onPress={() => setPendingDeleteOption(null)}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            className="w-[90%] rounded-2xl p-5"
            style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light, maxWidth: 420 }}
          >
            <Text style={{ color: colors.text.primary, fontSize: 14, lineHeight: 18, fontWeight: '600', marginBottom: 8 }}>Delete option?</Text>
            <Text style={{ color: colors.text.tertiary }} className="text-sm mb-4">
              This will remove "{pendingDeleteOption?.name}" and all of its values.
            </Text>
            <View className="flex-row gap-3">
              <Pressable
                onPress={() => setPendingDeleteOption(null)}
                className="flex-1 rounded-xl items-center justify-center"
                style={{ height: 48, backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
              >
                <Text style={{ color: colors.text.secondary }} className="font-semibold">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={confirmDeleteOption}
                className="flex-1 rounded-xl items-center justify-center"
                style={{ height: 48, backgroundColor: '#EF4444' }}
              >
                <Text className="text-white font-semibold">Delete</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
