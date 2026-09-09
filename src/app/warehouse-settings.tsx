import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Plus, Trash2, Boxes, Ruler, Pencil, Check, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import useAuthStore from '@/lib/state/auth-store';
import useFyllStore from '@/lib/state/fyll-store';
import { useThemeColors } from '@/lib/theme';
import { useTabBarHeight } from '@/lib/useTabBarHeight';
import { useSettingsBack } from '@/lib/useSettingsBack';

export default function WarehouseSettingsScreen() {
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string | string[] }>();
  const goBack = useSettingsBack();
  const colors = useThemeColors();
  const tabBarHeight = useTabBarHeight();

  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const warehouseCategories = useFyllStore((s) => s.warehouseCategories);
  const warehouseUnits = useFyllStore((s) => s.warehouseUnits);
  const addWarehouseCategory = useFyllStore((s) => s.addWarehouseCategory);
  const updateWarehouseCategory = useFyllStore((s) => s.updateWarehouseCategory);
  const deleteWarehouseCategory = useFyllStore((s) => s.deleteWarehouseCategory);
  const addWarehouseUnit = useFyllStore((s) => s.addWarehouseUnit);
  const deleteWarehouseUnit = useFyllStore((s) => s.deleteWarehouseUnit);

  const [categoryInput, setCategoryInput] = useState('');
  const [unitInput, setUnitInput] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');

  const triggerLightHaptic = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <View
        style={{
          borderBottomWidth: 1,
          borderBottomColor: colors.border.light,
          paddingHorizontal: 20,
          paddingTop: 10,
          paddingBottom: 12,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <Pressable
          onPress={() => {
            if ((Array.isArray(from) ? from[0] : from) === 'settings') {
              if (Platform.OS === 'web') {
                router.replace({ pathname: '/settings', params: { menu: 'inventory' } } as never);
              } else {
                goBack();
              }
              return;
            }
            router.back();
          }}
          style={{
            width: 38,
            height: 38,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 12,
            backgroundColor: 'transparent',
          }}
        >
          <ArrowLeft size={18} color={colors.text.primary} strokeWidth={2.4} />
        </Pressable>
        <View>
          <Text style={{ color: colors.text.primary, fontSize: Platform.OS === 'web' ? 14 : 22, lineHeight: Platform.OS === 'web' ? 18 : 26, fontWeight: '600' }}>Warehouse Settings</Text>
          <Text style={{ color: colors.text.muted, fontSize: 13, marginTop: 2 }}>More / Settings</Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1, paddingHorizontal: 20, paddingTop: 14 }}
        contentContainerStyle={{ paddingBottom: tabBarHeight + 20 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ borderWidth: 1, borderColor: colors.border.light, borderRadius: 16, backgroundColor: colors.bg.card, padding: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <Boxes size={18} color="#6366F1" strokeWidth={2.2} />
            <Text style={{ color: colors.text.primary, fontSize: 14, lineHeight: 18, fontWeight: '600', marginLeft: 8 }}>Categories</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1, borderWidth: 1, borderColor: colors.border.light, borderRadius: 12, paddingHorizontal: 12, height: 44, justifyContent: 'center', backgroundColor: colors.input.bg }}>
              <TextInput
                value={categoryInput}
                onChangeText={setCategoryInput}
                placeholder="Add category"
                placeholderTextColor={colors.input.placeholder}
                style={{ color: colors.input.text, fontSize: 14 }}
              />
            </View>
            <Pressable
              onPress={() => {
                const value = categoryInput.trim();
                if (!value) return;
                triggerLightHaptic();
                addWarehouseCategory(value, businessId);
                setCategoryInput('');
              }}
              style={{
                height: 44,
                borderRadius: 999,
                paddingHorizontal: 14,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.accent.primary,
                flexDirection: 'row',
              }}
            >
              <Plus size={14} color={colors.bg.primary} strokeWidth={2.4} />
              <Text style={{ color: colors.bg.primary, marginLeft: 6, fontWeight: '700' }}>Add</Text>
            </Pressable>
          </View>

          <View style={{ marginTop: 12 }}>
            {warehouseCategories.map((option, index) => (
              <View
                key={option.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 11,
                  borderBottomWidth: index === warehouseCategories.length - 1 ? 0 : 1,
                  borderBottomColor: colors.border.light,
                }}
              >
                {editingCategoryId === option.id ? (
                  <>
                    <View style={{ flex: 1, borderWidth: 1, borderColor: colors.border.light, borderRadius: 10, paddingHorizontal: 10, height: 40, justifyContent: 'center', backgroundColor: colors.input.bg, marginRight: 8 }}>
                      <TextInput
                        value={editingCategoryName}
                        onChangeText={setEditingCategoryName}
                        placeholder="Category name"
                        placeholderTextColor={colors.input.placeholder}
                        style={{ color: colors.input.text, fontSize: 14 }}
                        autoFocus
                      />
                    </View>
                    <Pressable
                      onPress={() => {
                        const value = editingCategoryName.trim();
                        if (!value) return;
                        triggerLightHaptic();
                        updateWarehouseCategory(option.id, value, businessId);
                        setEditingCategoryId(null);
                        setEditingCategoryName('');
                      }}
                      style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginRight: 4 }}
                    >
                      <Check size={14} color="#10B981" strokeWidth={2.4} />
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        setEditingCategoryId(null);
                        setEditingCategoryName('');
                      }}
                      style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <X size={14} color={colors.text.tertiary} strokeWidth={2.4} />
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Text style={{ color: colors.text.primary, fontSize: 14, flex: 1 }}>{option.name}</Text>
                    <Pressable
                      onPress={() => {
                        triggerLightHaptic();
                        setEditingCategoryId(option.id);
                        setEditingCategoryName(option.name);
                      }}
                      style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginRight: 4 }}
                    >
                      <Pencil size={14} color={colors.text.tertiary} strokeWidth={2.2} />
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        triggerLightHaptic();
                        deleteWarehouseCategory(option.id, businessId);
                      }}
                      style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Trash2 size={14} color="#EF4444" strokeWidth={2.2} />
                    </Pressable>
                  </>
                )}
              </View>
            ))}
          </View>
        </View>

        <View style={{ borderWidth: 1, borderColor: colors.border.light, borderRadius: 16, backgroundColor: colors.bg.card, padding: 14, marginTop: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <Ruler size={18} color="#0EA5E9" strokeWidth={2.2} />
            <Text style={{ color: colors.text.primary, fontSize: 14, lineHeight: 18, fontWeight: '600', marginLeft: 8 }}>Units</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1, borderWidth: 1, borderColor: colors.border.light, borderRadius: 12, paddingHorizontal: 12, height: 44, justifyContent: 'center', backgroundColor: colors.input.bg }}>
              <TextInput
                value={unitInput}
                onChangeText={setUnitInput}
                placeholder="Add unit"
                placeholderTextColor={colors.input.placeholder}
                style={{ color: colors.input.text, fontSize: 14 }}
              />
            </View>
            <Pressable
              onPress={() => {
                const value = unitInput.trim();
                if (!value) return;
                triggerLightHaptic();
                addWarehouseUnit(value, businessId);
                setUnitInput('');
              }}
              style={{
                height: 44,
                borderRadius: 999,
                paddingHorizontal: 14,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.accent.primary,
                flexDirection: 'row',
              }}
            >
              <Plus size={14} color={colors.bg.primary} strokeWidth={2.4} />
              <Text style={{ color: colors.bg.primary, marginLeft: 6, fontWeight: '700' }}>Add</Text>
            </Pressable>
          </View>

          <View style={{ marginTop: 12 }}>
            {warehouseUnits.map((option, index) => (
              <View
                key={option.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 11,
                  borderBottomWidth: index === warehouseUnits.length - 1 ? 0 : 1,
                  borderBottomColor: colors.border.light,
                }}
              >
                <Text style={{ color: colors.text.primary, fontSize: 14 }}>{option.name}</Text>
                <Pressable
                  onPress={() => {
                    triggerLightHaptic();
                    deleteWarehouseUnit(option.id, businessId);
                  }}
                  style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Trash2 size={14} color="#EF4444" strokeWidth={2.2} />
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
