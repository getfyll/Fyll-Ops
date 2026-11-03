import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Plus, Trash2, Edit3, Check, X, Palette, Tag, ChevronDown, ChevronUp } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import useFyllStore, { ProductVariable } from '@/lib/state/fyll-store';
import useAuthStore from '@/lib/state/auth-store';
import * as Haptics from 'expo-haptics';
import { TagPillInput } from '@/components/TagPillInput';
import { useResolvedThemeMode, useThemeColors } from '@/lib/theme';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { getSettingsWebPanelStyles, isFromSettingsRoute } from '@/lib/settings-web-panel';
import { useSettingsBack } from '@/lib/useSettingsBack';
import { cn } from '@/lib/cn';
import { EmptyState } from '@/components/EmptyState';
import { useTabBarHeight } from '@/lib/useTabBarHeight';
import { FYLL_LIME, FYLL_LIME_INK, MoneyText, usePaymentsPalette } from '@/components/payments/payments-ui';
import { InternalSettingsHeader } from '@/components/settings/InternalSettingsHeader';
import { InventorySettingsContent, InventorySettingsHero } from '@/components/settings/InventorySettingsScaffold';

export default function ProductVariablesScreen() {
  const colors = useThemeColors();
  const { isDesktop, isMobile } = useBreakpoint();
  const resolvedThemeMode = useResolvedThemeMode();
  const settingsPalette = usePaymentsPalette();
  const tabBarHeight = useTabBarHeight();
  const { from } = useLocalSearchParams<{ from?: string | string[] }>();
  const goBack = useSettingsBack();
  const openedFromSettings = isFromSettingsRoute(from);
  const panelStyles = getSettingsWebPanelStyles(openedFromSettings, colors.bg.primary, colors.border.light);
  const productVariables = useFyllStore((s) => s.productVariables);
  const addProductVariable = useFyllStore((s) => s.addProductVariable);
  const updateProductVariable = useFyllStore((s) => s.updateProductVariable);
  const deleteProductVariable = useFyllStore((s) => s.deleteProductVariable);
  const saveGlobalSettings = useFyllStore((s) => s.saveGlobalSettings);
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newVariableName, setNewVariableName] = useState('');
  const [newVariableValues, setNewVariableValues] = useState<string[]>([]);
  const [editingValueId, setEditingValueId] = useState<string | null>(null);
  const [editingValueText, setEditingValueText] = useState('');
  const [addingValueToId, setAddingValueToId] = useState<string | null>(null);
  const [newValueText, setNewValueText] = useState('');
  const [pendingDeleteVariable, setPendingDeleteVariable] = useState<ProductVariable | null>(null);
  const [expandedVariableIds, setExpandedVariableIds] = useState<Set<string>>(new Set());

  const toggleVariableExpanded = (variableId: string) => {
    Haptics.selectionAsync();
    setExpandedVariableIds((prev) => {
      const next = new Set(prev);
      if (next.has(variableId)) next.delete(variableId);
      else next.add(variableId);
      return next;
    });
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setNewVariableName('');
    setNewVariableValues([]);
  };

  const handleAddVariable = async () => {
    const name = newVariableName.trim();
    if (!name) return;

    if (productVariables.some((variable) => variable.name.trim().toLowerCase() === name.toLowerCase())) {
      Alert.alert('Already exists', 'This product variable already exists. Open it below to add or edit values.');
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const newVariable: ProductVariable = {
      id: Math.random().toString(36).substring(2, 15),
      name,
      values: newVariableValues,
    };

    addProductVariable(newVariable);
    setExpandedVariableIds((prev) => new Set(prev).add(newVariable.id));
    if (businessId) {
      const result = await saveGlobalSettings(businessId);
      if (!result.success) {
        Alert.alert('Save failed', result.error ?? 'Could not save this change.');
      }
    }
    closeAddModal();
  };

  const openDeleteVariable = (variable: ProductVariable) => {
    if (Platform.OS === 'web') {
      const active = document.activeElement as HTMLElement | null;
      active?.blur();
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPendingDeleteVariable(variable);
  };

  const confirmDeleteVariable = async () => {
    if (!pendingDeleteVariable) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    deleteProductVariable(pendingDeleteVariable.id, businessId);
    setPendingDeleteVariable(null);
    if (businessId) {
      const result = await saveGlobalSettings(businessId);
      if (!result.success) {
        Alert.alert('Delete failed', result.error ?? 'Could not delete this variable.');
      }
    }
  };

  const handleAddValue = async (variableId: string) => {
    if (!newValueText.trim()) return;

    const variable = productVariables.find((v) => v.id === variableId);
    if (!variable) return;

    // Check for duplicates
    if (variable.values.includes(newValueText.trim())) {
      Alert.alert('Duplicate Value', 'This value already exists.');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateProductVariable(variableId, {
      values: [...variable.values, newValueText.trim()],
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

  const handleEditValue = async (variableId: string, oldValue: string) => {
    if (!editingValueText.trim()) return;

    const variable = productVariables.find((v) => v.id === variableId);
    if (!variable) return;

    // Check for duplicates (excluding the current value)
    if (variable.values.filter(v => v !== oldValue).includes(editingValueText.trim())) {
      Alert.alert('Duplicate Value', 'This value already exists.');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateProductVariable(variableId, {
      values: variable.values.map((v) => v === oldValue ? editingValueText.trim() : v),
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

  const handleDeleteValue = (variableId: string, value: string) => {
    const variable = productVariables.find((v) => v.id === variableId);
    if (!variable) return;

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
            updateProductVariable(variableId, {
              values: variable.values.filter((v) => v !== value),
            });
            if (businessId) {
              void saveGlobalSettings(businessId);
            }
          },
        },
      ]
    );
  };

  const startEditingValue = (variableId: string, value: string) => {
    setEditingValueId(`${variableId}-${value}`);
    setEditingValueText(value);
  };

  const getVariableIcon = (name: string) => {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('color') || lowerName.includes('colour')) {
      return <Palette size={18} color={settingsPalette.limeOnSurface} strokeWidth={2.1} />;
    }
    return <Tag size={18} color={settingsPalette.limeOnSurface} strokeWidth={2.1} />;
  };

  return (
    <View style={panelStyles.outer}>
      <View style={panelStyles.inner}>
      <SafeAreaView className="flex-1" edges={['top']} style={{ backgroundColor: settingsPalette.page }}>
        {!isDesktop ? <LinearGradient pointerEvents="none" colors={resolvedThemeMode === 'dark' ? ['rgba(111,125,18,0.55)', 'rgba(20,20,20,0)'] : ['rgba(213,224,87,0.42)', 'rgba(244,243,235,0)']} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 360 }} /> : null}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          <InternalSettingsHeader title="Product Variables" description="Manage reusable attributes and values used across products." isDesktop={isDesktop} onBack={goBack} />

          <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: isDesktop ? 64 : tabBarHeight + 40 }} showsVerticalScrollIndicator={false}>
            <InventorySettingsContent isDesktop={isDesktop}>
            <InventorySettingsHero
              eyebrow="Variant structure"
              title={`${productVariables.length} ${productVariables.length === 1 ? 'variable' : 'variables'}`}
              description="Reusable stock and pricing options"
              isDesktop={isDesktop}
            />

            {/* Add New Product Variable Button */}
            <View>
              <Pressable
                onPress={() => {
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowAddModal(true);
                }}
                className="rounded-full flex-row items-center justify-center active:opacity-80 mb-5"
                style={{ minHeight: 48, gap: 8, backgroundColor: FYLL_LIME }}
              >
                <Plus size={16} color={FYLL_LIME_INK} strokeWidth={2.5} />
                <MoneyText style={{ color: FYLL_LIME_INK, fontSize: 14, fontWeight: '700' }}>New product variable</MoneyText>
              </Pressable>
            </View>

            <Text style={{ color: settingsPalette.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 10, marginLeft: 2 }}>Product variables</Text>

            {/* Variables List */}
            {productVariables.length === 0 ? (
              <EmptyState
                icon={Tag}
                title="No product variables yet"
                description="Add reusable variable sets like Colour, Material, Finish, or Size. Use these when each value creates stock variants."
                style={{ marginTop: 16 }}
              />
            ) : (
              productVariables.map((variable, index) => {
                const isExpanded = expandedVariableIds.has(variable.id);
                return (
                <View key={variable.id}>
                  <View className="p-4" style={{ backgroundColor: settingsPalette.card, borderWidth: 1, borderTopWidth: index === 0 ? 1 : 0, borderColor: settingsPalette.border, borderTopLeftRadius: index === 0 ? 26 : 0, borderTopRightRadius: index === 0 ? 26 : 0, borderBottomLeftRadius: index === productVariables.length - 1 ? 26 : 0, borderBottomRightRadius: index === productVariables.length - 1 ? 26 : 0, overflow: 'hidden' }}>
                    {/* Variable Header */}
                    <Pressable
                      onPress={() => toggleVariableExpanded(variable.id)}
                      className={cn('flex-row items-center justify-between', isExpanded ? 'mb-4' : '')}
                    >
                      <View className="flex-row items-center flex-1" style={{ minWidth: 0 }}>
                        <View
                          className="w-10 h-10 rounded-2xl items-center justify-center mr-3"
                          style={{ backgroundColor: settingsPalette.nudgeBg }}
                        >
                          {getVariableIcon(variable.name)}
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={{ color: settingsPalette.text, fontSize: 12, fontWeight: '500' }} numberOfLines={1}>{variable.name}</Text>
                          <Text style={{ color: colors.text.muted }} className="text-xs">
                            {variable.values.length} value{variable.values.length !== 1 ? 's' : ''} · reusable
                          </Text>
                        </View>
                      </View>
                      <View className="flex-row items-center gap-1">
                        <Pressable
                          onPress={(e) => { e.stopPropagation(); openDeleteVariable(variable); }}
                          className="w-8 h-8 items-center justify-center active:opacity-50"
                        >
                          <Trash2 size={15} color={settingsPalette.danger} strokeWidth={2.1} />
                        </Pressable>
                        <View
                          className="w-8 h-8 items-center justify-center"
                        >
                          {isExpanded ? (
                            <ChevronUp size={16} color={settingsPalette.faint} strokeWidth={2.2} />
                          ) : (
                            <ChevronDown size={16} color={settingsPalette.faint} strokeWidth={2.2} />
                          )}
                        </View>
                      </View>
                    </Pressable>

                    {!isExpanded ? null : (
                    <>
                    {/* Values List */}
                    <View className="mb-3">
                      {variable.values.length === 0 ? (
                        <Text style={{ color: colors.text.muted }} className="text-sm italic">No values added yet</Text>
                      ) : (
                        variable.values.map((value) => {
                          const isEditing = editingValueId === `${variable.id}-${value}`;

                          return (
                            <View
                              key={`${variable.id}-${value}`}                              className="mb-2"
                            >
                              {isEditing ? (
                                <View
                                  className="flex-row items-center rounded-xl px-3"
                                  style={{ backgroundColor: settingsPalette.inset, borderWidth: 1, borderColor: settingsPalette.border, height: 48 }}
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
                                    className="w-8 h-8 items-center justify-center ml-2"
                                  >
                                    <X size={16} color={colors.text.muted} strokeWidth={2} />
                                  </Pressable>
                                  <Pressable
                                    onPress={() => handleEditValue(variable.id, value)}
                                    className="w-8 h-8 items-center justify-center ml-1"
                                  >
                                    <Check size={15} color={settingsPalette.limeOnSurface} strokeWidth={2.3} />
                                  </Pressable>
                                </View>
                              ) : (
                                <View
                                  className="flex-row items-center justify-between rounded-xl px-4"
                                  style={{ backgroundColor: settingsPalette.inset, borderWidth: 1, borderColor: settingsPalette.border, height: 48 }}
                                >
                                  <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '500' }}>{value}</Text>
                                  <View className="flex-row items-center gap-1">
                                    <Pressable
                                      onPress={() => startEditingValue(variable.id, value)}
                                      className="w-8 h-8 items-center justify-center active:opacity-50"
                                    >
                                      <Edit3 size={14} color={settingsPalette.limeOnSurface} strokeWidth={2.1} />
                                    </Pressable>
                                    <Pressable
                                      onPress={() => handleDeleteValue(variable.id, value)}
                                      className="w-8 h-8 items-center justify-center active:opacity-50"
                                    >
                                      <Trash2 size={14} color={settingsPalette.danger} strokeWidth={2.1} />
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
                    {addingValueToId === variable.id ? (
                      <View
                        className="flex-row items-center px-4"
                        style={{
                          height: 56,
                          borderRadius: 16,
                          backgroundColor: settingsPalette.inset,
                          borderWidth: 2,
                          borderColor: FYLL_LIME,
                          shadowColor: FYLL_LIME,
                          shadowOpacity: 0.14,
                          shadowRadius: 10,
                          shadowOffset: { width: 0, height: 0 },
                        }}
                      >
                        <TextInput
                          placeholder="Enter new value..."
                          placeholderTextColor={colors.text.muted}
                          value={newValueText}
                          onChangeText={setNewValueText}
                          autoFocus
                          style={{ flex: 1, color: colors.text.primary, fontSize: 16, fontWeight: '500' }}
                          selectionColor={FYLL_LIME}
                          onSubmitEditing={() => handleAddValue(variable.id)}
                        />
                        <Pressable
                          onPress={() => {
                            setAddingValueToId(null);
                            setNewValueText('');
                          }}
                          className="w-9 h-9 items-center justify-center ml-2 active:opacity-60"
                        >
                          <X size={16} color={colors.text.muted} strokeWidth={2} />
                        </Pressable>
                        <Pressable
                          onPress={() => handleAddValue(variable.id)}
                          disabled={!newValueText.trim()}
                          className="w-9 h-9 rounded-full items-center justify-center ml-1 active:opacity-80"
                          style={{
                            backgroundColor: FYLL_LIME,
                            opacity: newValueText.trim() ? 1 : 0.4,
                          }}
                        >
                          <Check size={16} color={FYLL_LIME_INK} strokeWidth={2.4} />
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => {
                          Haptics.selectionAsync();
                          setAddingValueToId(variable.id);
                        }}
                        className="flex-row items-center justify-center rounded-full active:opacity-70"
                        style={{ minHeight: 42, backgroundColor: FYLL_LIME }}
                      >
                        <Plus size={15} color={FYLL_LIME_INK} strokeWidth={2.5} />
                        <MoneyText style={{ color: FYLL_LIME_INK, fontSize: 14, fontWeight: '700', marginLeft: 6 }}>Add value</MoneyText>
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
            </InventorySettingsContent>
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Add Product Variable Modal - Centered */}
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
              style={{ backgroundColor: 'rgba(0, 0, 0, 0.72)' }}
              onPress={closeAddModal}
            >
              <Pressable
                onPress={(e) => e.stopPropagation()}
                className="w-[90%] rounded-3xl overflow-hidden"
                style={{ backgroundColor: settingsPalette.card, borderWidth: 1, borderColor: settingsPalette.border, maxWidth: 440 }}
              >
                {/* Header */}
                <View className="flex-row items-center justify-between px-5 py-4 border-b" style={{ borderBottomColor: colors.border.light }}>
                  <MoneyText style={{ color: settingsPalette.text, fontSize: isMobile ? 18 : 22, fontWeight: '700' }}>New product variable</MoneyText>
                  <Pressable
                    onPress={closeAddModal}
                    className="w-8 h-8 rounded-full items-center justify-center active:opacity-50"
                    style={{ backgroundColor: settingsPalette.softFill }}
                  >
                    <X size={18} color={colors.text.muted} strokeWidth={2} />
                  </Pressable>
                </View>

                <View className="px-5 py-4">
                  {/* Product Variable Name Input */}
                  <View className="mb-4">
                    <Text style={{ color: colors.text.primary }} className="text-sm font-medium mb-2">Product Variable Name</Text>
                    <View
                      className="rounded-xl px-4"
                      style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.input.border, height: 52, justifyContent: 'center' }}
                    >
                      <TextInput
                        placeholder="e.g. Colour, Material, Finish"
                        placeholderTextColor={colors.text.muted}
                        value={newVariableName}
                        onChangeText={setNewVariableName}
                        autoFocus
                        style={{ color: colors.text.primary, fontSize: 14 }}
                        selectionColor={colors.text.primary}
                      />
                    </View>
                  </View>

                  <View className="mb-4">
                    <Text style={{ color: colors.text.primary }} className="text-sm font-medium mb-2">Values</Text>
                    <TagPillInput
                      values={newVariableValues}
                      onChange={setNewVariableValues}
                      placeholder="e.g. 36, 37, 38, 39 or Small, Medium, Large"
                    />
                    <Text style={{ color: colors.text.muted }} className="text-xs mt-2">Type a value then press comma or enter to turn it into a pill. You can edit them later.</Text>
                  </View>

                  {/* Buttons */}
                  <View className="flex-row gap-3">
                    <Pressable onPress={closeAddModal} className="flex-1 rounded-full items-center justify-center active:opacity-70" style={{ height: 48, backgroundColor: settingsPalette.softFill, borderWidth: 1, borderColor: settingsPalette.outline }}><Text style={{ color: settingsPalette.text, fontSize: 14, fontWeight: '600' }}>Cancel</Text></Pressable>
                    <Pressable onPress={handleAddVariable} disabled={!newVariableName.trim()} className="flex-1 rounded-full items-center justify-center active:opacity-80" style={{ height: 48, backgroundColor: FYLL_LIME, opacity: newVariableName.trim() ? 1 : 0.5 }}><MoneyText style={{ color: FYLL_LIME_INK, fontSize: 14, fontWeight: '700' }}>Create</MoneyText></Pressable>
                  </View>
                </View>
              </Pressable>
            </Pressable>
          </KeyboardAvoidingView>
        </Modal>
      </SafeAreaView>
      </View>

      <Modal
        visible={!!pendingDeleteVariable}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingDeleteVariable(null)}
      >
        <Pressable
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.45)' }}
          onPress={() => setPendingDeleteVariable(null)}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            className="w-[90%] rounded-2xl p-5"
            style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light, maxWidth: 420 }}
          >
            <Text style={{ color: colors.text.primary, fontSize: 14, lineHeight: 18, fontWeight: '600', marginBottom: 8 }}>Delete variable?</Text>
            <Text style={{ color: colors.text.tertiary }} className="text-sm mb-4">
              This will remove "{pendingDeleteVariable?.name}" and all of its values.
            </Text>
            <View className="flex-row gap-3">
              <Pressable
                onPress={() => setPendingDeleteVariable(null)}
                className="flex-1 rounded-xl items-center justify-center"
                style={{ height: 48, backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
              >
                <Text style={{ color: colors.text.secondary }} className="font-semibold">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={confirmDeleteVariable}
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
