import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Plus, Trash2, Edit3, Check, X, Palette, Tag } from 'lucide-react-native';
import useFyllStore, { ProductVariable } from '@/lib/state/fyll-store';
import useAuthStore from '@/lib/state/auth-store';
import * as Haptics from 'expo-haptics';
import { Button } from '@/components/Button';
import { useThemeColors } from '@/lib/theme';
import { getSettingsWebPanelStyles, isFromSettingsRoute } from '@/lib/settings-web-panel';
import { useSettingsBack } from '@/lib/useSettingsBack';

export default function ProductVariablesScreen() {
  const colors = useThemeColors();
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
  const [editingValueId, setEditingValueId] = useState<string | null>(null);
  const [editingValueText, setEditingValueText] = useState('');
  const [addingValueToId, setAddingValueToId] = useState<string | null>(null);
  const [newValueText, setNewValueText] = useState('');
  const [pendingDeleteVariable, setPendingDeleteVariable] = useState<ProductVariable | null>(null);

  const handleAddVariable = async () => {
    if (!newVariableName.trim()) return;

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const newVariable: ProductVariable = {
      id: Math.random().toString(36).substring(2, 15),
      name: newVariableName.trim(),
      values: [],
    };

    addProductVariable(newVariable);
    if (businessId) {
      const result = await saveGlobalSettings(businessId);
      if (!result.success) {
        Alert.alert('Save failed', result.error ?? 'Could not save this change.');
      }
    }
    setNewVariableName('');
    setShowAddModal(false);
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
              Product Variables
            </Text>
            <View className="w-10" />
          </View>

          <ScrollView className="flex-1 px-5" style={{ backgroundColor: colors.bg.secondary }} showsVerticalScrollIndicator={false}>
            {/* Info Card */}
            <View>
              <View className="rounded-xl p-4 mt-4 border" style={{ backgroundColor: colors.bg.card, borderColor: colors.border.light }}>
                <Text style={{ color: colors.text.tertiary }} className="text-sm leading-5">
                  Product variables define attributes like Color, Size, or Material. Each variable can have multiple values that you can assign to product variants.
                </Text>
              </View>
            </View>

            {/* Add New Variable Button */}
            <View>
              <Button
                onPress={() => {
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowAddModal(true);
                }}
                icon={<Plus size={20} color="#FFFFFF" strokeWidth={2.5} />}
                className="mt-4"
              >
                Add Variable
              </Button>
            </View>

            {/* Variables List */}
            {productVariables.length === 0 ? (
              <View>
                <View className="rounded-xl p-6 mt-4 border items-center" style={{ backgroundColor: colors.bg.card, borderColor: colors.border.light }}>
                  <View
                    className="w-16 h-16 rounded-2xl items-center justify-center mb-4"
                    style={{ backgroundColor: 'rgba(168, 85, 247, 0.15)' }}
                  >
                    <Tag size={32} color="#A855F7" strokeWidth={1.5} />
                  </View>
                  <Text style={{ color: colors.text.tertiary }} className="text-base mb-1">No variables yet</Text>
                  <Text style={{ color: colors.text.muted }} className="text-sm text-center px-4">
                    Add variables like Color or Size to create product variants
                  </Text>
                </View>
              </View>
            ) : (
              productVariables.map((variable, index) => (
                <View
                  key={variable.id}                  className="mt-4"
                >
                  <View className="rounded-xl p-4 border" style={{ backgroundColor: colors.bg.card, borderColor: colors.border.light }}>
                    {/* Variable Header */}
                    <View className="flex-row items-center justify-between mb-4">
                      <View className="flex-row items-center">
                        <View
                          className="w-10 h-10 rounded-xl items-center justify-center mr-3"
                          style={{ backgroundColor: 'rgba(168, 85, 247, 0.15)' }}
                        >
                          {getVariableIcon(variable.name)}
                        </View>
                        <View>
                          <Text style={{ color: colors.text.primary }} className="font-bold text-base">{variable.name}</Text>
                          <Text style={{ color: colors.text.muted }} className="text-xs">
                            {variable.values.length} value{variable.values.length !== 1 ? 's' : ''}
                          </Text>
                        </View>
                      </View>
                      <Pressable
                        onPress={() => openDeleteVariable(variable)}
                        className="w-9 h-9 rounded-lg items-center justify-center active:opacity-50"
                        style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}
                      >
                        <Trash2 size={18} color="#EF4444" strokeWidth={2} />
                      </Pressable>
                    </View>

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
                                    onPress={() => handleEditValue(variable.id, value)}
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
                                      onPress={() => startEditingValue(variable.id, value)}
                                      className="w-8 h-8 rounded-lg items-center justify-center active:opacity-50"
                                      style={{ backgroundColor: colors.border.light }}
                                    >
                                      <Edit3 size={14} color={colors.text.muted} strokeWidth={2} />
                                    </Pressable>
                                    <Pressable
                                      onPress={() => handleDeleteValue(variable.id, value)}
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
                    {addingValueToId === variable.id ? (
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
                          onSubmitEditing={() => handleAddValue(variable.id)}
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
                          onPress={() => handleAddValue(variable.id)}
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
                          setAddingValueToId(variable.id);
                        }}
                        className="flex-row items-center justify-center py-2.5 rounded-xl active:opacity-70"
                        style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', borderWidth: 1, borderColor: 'rgba(59, 130, 246, 0.2)', borderStyle: 'dashed' }}
                      >
                        <Plus size={16} color="#3B82F6" strokeWidth={2.5} />
                        <Text className="text-blue-500 font-medium text-sm ml-1.5">Add Value</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              ))
            )}

            <View className="h-24" />
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Add Variable Modal - Centered */}
        <Modal
          visible={showAddModal}
          animationType="fade"
          transparent
          onRequestClose={() => setShowAddModal(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            className="flex-1"
          >
            <Pressable
              className="flex-1 items-center justify-center"
              style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
              onPress={() => setShowAddModal(false)}
            >
              <Pressable
                onPress={(e) => e.stopPropagation()}
                className="w-[90%] rounded-2xl overflow-hidden"
                style={{ backgroundColor: colors.bg.primary, maxWidth: 400 }}
              >
                {/* Header */}
                <View className="flex-row items-center justify-between px-5 py-4 border-b" style={{ borderBottomColor: colors.border.light }}>
                  <Text style={{ color: colors.text.primary, fontSize: 14, lineHeight: 18, fontWeight: '600' }}>New Variable</Text>
                  <Pressable
                    onPress={() => setShowAddModal(false)}
                    className="w-8 h-8 rounded-full items-center justify-center active:opacity-50"
                    style={{ backgroundColor: colors.bg.secondary }}
                  >
                    <X size={18} color={colors.text.muted} strokeWidth={2} />
                  </Pressable>
                </View>

                <View className="px-5 py-4">
                  {/* Variable Name Input */}
                  <View className="mb-4">
                    <Text style={{ color: colors.text.primary }} className="text-sm font-medium mb-2">Variable Name</Text>
                    <View
                      className="rounded-xl px-4"
                      style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.input.border, height: 52, justifyContent: 'center' }}
                    >
                      <TextInput
                        placeholder="e.g. Size, Material, Color"
                        placeholderTextColor={colors.text.muted}
                        value={newVariableName}
                        onChangeText={setNewVariableName}
                        autoFocus
                        style={{ color: colors.text.primary, fontSize: 14 }}
                        selectionColor={colors.text.primary}
                      />
                    </View>
                  </View>

                  {/* Buttons */}
                  <View className="flex-row gap-3">
                    <Button
                      onPress={() => {
                        setShowAddModal(false);
                        setNewVariableName('');
                      }}
                      variant="secondary"
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                    <Button
                      onPress={handleAddVariable}
                      disabled={!newVariableName.trim()}
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
