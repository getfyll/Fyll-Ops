import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Plus, Trash2, Boxes, Ruler, Pencil, Check, X, ChevronDown, ChevronUp } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import useAuthStore from '@/lib/state/auth-store';
import useFyllStore from '@/lib/state/fyll-store';
import { useResolvedThemeMode, useThemeColors } from '@/lib/theme';
import { useTabBarHeight } from '@/lib/useTabBarHeight';
import { useSettingsBack } from '@/lib/useSettingsBack';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { FYLL_LIME, FYLL_LIME_INK, MoneyText, usePaymentsPalette } from '@/components/payments/payments-ui';

export default function WarehouseSettingsScreen() {
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string | string[] }>();
  const goBack = useSettingsBack();
  const colors = useThemeColors();
  const resolvedThemeMode = useResolvedThemeMode();
  const settingsPalette = usePaymentsPalette();
  const { isDesktop, isMobile } = useBreakpoint();
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
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [showUnitForm, setShowUnitForm] = useState(false);
  const [categoriesExpanded, setCategoriesExpanded] = useState(false);
  const [unitsExpanded, setUnitsExpanded] = useState(false);

  const triggerLightHaptic = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handleAddCategory = () => {
    const value = categoryInput.trim();
    if (!value) return;
    triggerLightHaptic();
    addWarehouseCategory(value, businessId);
    setCategoryInput('');
    setShowCategoryForm(false);
    setCategoriesExpanded(true);
  };

  const handleAddUnit = () => {
    const value = unitInput.trim();
    if (!value) return;
    triggerLightHaptic();
    addWarehouseUnit(value, businessId);
    setUnitInput('');
    setShowUnitForm(false);
    setUnitsExpanded(true);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: settingsPalette.page }}>
      <LinearGradient pointerEvents="none" colors={resolvedThemeMode === 'dark' ? ['rgba(111,125,18,0.55)', 'rgba(20,20,20,0)'] : ['rgba(213,224,87,0.42)', 'rgba(244,243,235,0)']} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 360 }} />
      <View
        style={{
          paddingHorizontal: 10,
          paddingTop: isMobile ? 12 : 4,
          paddingBottom: 4,
          minHeight: isMobile ? 66 : 58,
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
            borderRadius: 19,
            backgroundColor: settingsPalette.softFill,
          }}
        >
          <ArrowLeft size={18} color={colors.text.primary} strokeWidth={2.4} />
        </Pressable>
        <View>
          <Text style={{ color: settingsPalette.faint, fontSize: 9.5, lineHeight: 12, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' }}>Settings</Text>
          <Text style={{ color: settingsPalette.text, fontSize: 17, lineHeight: 21, fontWeight: '600' }}>Warehouse Settings</Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: isDesktop ? 64 : tabBarHeight + 32 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: '100%', maxWidth: 720, alignSelf: 'center' }}>
        <View style={{ position: 'relative', overflow: 'hidden', minHeight: 156, marginBottom: 22, padding: 20, borderRadius: 28, borderWidth: 1, borderColor: settingsPalette.border, backgroundColor: settingsPalette.card, shadowColor: '#000000', shadowOpacity: resolvedThemeMode === 'dark' ? 0.24 : 0.07, shadowRadius: 24, shadowOffset: { width: 0, height: 10 } }}>
          <LinearGradient pointerEvents="none" colors={[settingsPalette.nudgeBg, 'transparent']} start={{ x: 1, y: 0 }} end={{ x: 0.2, y: 1 }} style={{ position: 'absolute', top: -44, right: -36, width: 210, height: 210, borderRadius: 105 }} />
          <View style={{ position: 'absolute', top: 0, left: 28, right: 28, height: 3, backgroundColor: FYLL_LIME }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15 }}>
            <LinearGradient colors={[FYLL_LIME, '#879400']} style={{ width: 66, height: 66, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}><Boxes size={28} color={FYLL_LIME_INK} strokeWidth={2.1} /></LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={{ color: settingsPalette.faint, fontSize: 10, fontWeight: '700', letterSpacing: 1.15, textTransform: 'uppercase' }}>Inventory structure</Text>
              <MoneyText style={{ color: settingsPalette.text, fontSize: 26, lineHeight: 31, letterSpacing: -0.7 }}>Warehouse setup</MoneyText>
              <Text style={{ color: settingsPalette.faint, fontSize: 12.5, marginTop: 3 }}>{warehouseCategories.length} categories · {warehouseUnits.length} units</Text>
            </View>
          </View>
        </View>

        <View style={{ borderWidth: 1, borderColor: settingsPalette.border, borderRadius: 26, backgroundColor: settingsPalette.card, padding: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: showCategoryForm ? 14 : 10 }}>
            <Pressable onPress={() => setCategoriesExpanded((value) => !value)} className="flex-row items-center active:opacity-70" style={{ flex: 1 }}>
              <View style={{ width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: settingsPalette.nudgeBg }}><Boxes size={18} color={settingsPalette.limeOnSurface} strokeWidth={2.2} /></View>
              <View style={{ flex: 1, marginLeft: 10 }}><Text style={{ color: settingsPalette.text, fontSize: 14, lineHeight: 18, fontWeight: '700' }}>Categories</Text><Text style={{ color: settingsPalette.faint, fontSize: 12, marginTop: 2 }}>{warehouseCategories.length} configured</Text></View>
              {categoriesExpanded ? <ChevronUp size={16} color={settingsPalette.faint} strokeWidth={2.2} /> : <ChevronDown size={16} color={settingsPalette.faint} strokeWidth={2.2} />}
            </Pressable>
            <Pressable onPress={() => { setCategoryInput(''); setShowCategoryForm((value) => !value); }} className="rounded-full flex-row items-center justify-center active:opacity-70" style={{ minHeight: 38, marginLeft: 10, paddingHorizontal: 13, gap: 6, backgroundColor: showCategoryForm ? settingsPalette.softFill : FYLL_LIME }}>
              {showCategoryForm ? <X size={14} color={settingsPalette.text} strokeWidth={2.3} /> : <Plus size={14} color={FYLL_LIME_INK} strokeWidth={2.3} />}
              <MoneyText style={{ color: showCategoryForm ? settingsPalette.text : FYLL_LIME_INK, fontSize: 14, fontWeight: '700' }}>{showCategoryForm ? 'Close' : 'Add'}</MoneyText>
            </Pressable>
          </View>
          {showCategoryForm ? <View style={{ gap: 10, marginBottom: 14 }}>
            <View style={{ flex: 1, borderWidth: 1, borderColor: settingsPalette.outline, borderRadius: 16, paddingHorizontal: 14, height: 48, justifyContent: 'center', backgroundColor: settingsPalette.inset }}>
              <TextInput
                value={categoryInput}
                onChangeText={setCategoryInput}
                placeholder="Add category"
                placeholderTextColor={colors.input.placeholder}
                style={{ color: settingsPalette.text, fontSize: 14 }}
                autoFocus
                onSubmitEditing={handleAddCategory}
              />
            </View>
            <Pressable
              onPress={handleAddCategory}
              style={{
                height: 48,
                borderRadius: 999,
                paddingHorizontal: 14,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: FYLL_LIME,
                flexDirection: 'row',
              }}
            >
              <Plus size={14} color={FYLL_LIME_INK} strokeWidth={2.4} />
              <MoneyText style={{ color: FYLL_LIME_INK, marginLeft: 6, fontSize: 14, fontWeight: '700' }}>Save category</MoneyText>
            </Pressable>
          </View> : null}

          {categoriesExpanded ? <View style={{ gap: 8 }}>
            {warehouseCategories.length === 0 ? <View style={{ paddingVertical: 18, alignItems: 'center' }}><Text style={{ color: settingsPalette.faint, fontSize: 12 }}>No warehouse categories yet.</Text></View> : null}
            {warehouseCategories.map((option, index) => (
              <View
                key={option.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  minHeight: 58,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderWidth: 1,
                  borderColor: settingsPalette.border,
                  borderRadius: 18,
                  backgroundColor: settingsPalette.inset,
                }}
              >
                {editingCategoryId === option.id ? (
                  <>
                    <View style={{ flex: 1, borderWidth: 1, borderColor: settingsPalette.outline, borderRadius: 14, paddingHorizontal: 12, height: 42, justifyContent: 'center', backgroundColor: settingsPalette.card, marginRight: 8 }}>
                      <TextInput
                        value={editingCategoryName}
                        onChangeText={setEditingCategoryName}
                        placeholder="Category name"
                        placeholderTextColor={colors.input.placeholder}
                        style={{ color: settingsPalette.text, fontSize: 14 }}
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
                    <Text style={{ color: settingsPalette.text, fontSize: 14, flex: 1, fontWeight: '600' }}>{option.name}</Text>
                    <Pressable
                      onPress={() => {
                        triggerLightHaptic();
                        setEditingCategoryId(option.id);
                        setEditingCategoryName(option.name);
                      }}
                      style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center', marginRight: 2 }}
                    >
                      <Pencil size={13} color={settingsPalette.limeOnSurface} strokeWidth={2.2} />
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        triggerLightHaptic();
                        deleteWarehouseCategory(option.id, businessId);
                      }}
                      style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Trash2 size={13} color={settingsPalette.danger} strokeWidth={2.2} />
                    </Pressable>
                  </>
                )}
              </View>
            ))}
          </View> : null}
        </View>

        <View style={{ borderWidth: 1, borderColor: settingsPalette.border, borderRadius: 26, backgroundColor: settingsPalette.card, padding: 16, marginTop: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: showUnitForm ? 14 : 10 }}>
            <Pressable onPress={() => setUnitsExpanded((value) => !value)} className="flex-row items-center active:opacity-70" style={{ flex: 1 }}>
              <View style={{ width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: settingsPalette.nudgeBg }}><Ruler size={18} color={settingsPalette.limeOnSurface} strokeWidth={2.2} /></View>
              <View style={{ flex: 1, marginLeft: 10 }}><Text style={{ color: settingsPalette.text, fontSize: 14, lineHeight: 18, fontWeight: '700' }}>Units</Text><Text style={{ color: settingsPalette.faint, fontSize: 12, marginTop: 2 }}>{warehouseUnits.length} configured</Text></View>
              {unitsExpanded ? <ChevronUp size={16} color={settingsPalette.faint} strokeWidth={2.2} /> : <ChevronDown size={16} color={settingsPalette.faint} strokeWidth={2.2} />}
            </Pressable>
            <Pressable onPress={() => { setUnitInput(''); setShowUnitForm((value) => !value); }} className="rounded-full flex-row items-center justify-center active:opacity-70" style={{ minHeight: 38, marginLeft: 10, paddingHorizontal: 13, gap: 6, backgroundColor: showUnitForm ? settingsPalette.softFill : FYLL_LIME }}>
              {showUnitForm ? <X size={14} color={settingsPalette.text} strokeWidth={2.3} /> : <Plus size={14} color={FYLL_LIME_INK} strokeWidth={2.3} />}
              <MoneyText style={{ color: showUnitForm ? settingsPalette.text : FYLL_LIME_INK, fontSize: 14, fontWeight: '700' }}>{showUnitForm ? 'Close' : 'Add'}</MoneyText>
            </Pressable>
          </View>
          {showUnitForm ? <View style={{ gap: 10, marginBottom: 14 }}>
            <View style={{ flex: 1, borderWidth: 1, borderColor: settingsPalette.outline, borderRadius: 16, paddingHorizontal: 14, height: 48, justifyContent: 'center', backgroundColor: settingsPalette.inset }}>
              <TextInput
                value={unitInput}
                onChangeText={setUnitInput}
                placeholder="Add unit"
                placeholderTextColor={colors.input.placeholder}
                style={{ color: settingsPalette.text, fontSize: 14 }}
                autoFocus
                onSubmitEditing={handleAddUnit}
              />
            </View>
            <Pressable
              onPress={handleAddUnit}
              style={{
                height: 48,
                borderRadius: 999,
                paddingHorizontal: 14,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: FYLL_LIME,
                flexDirection: 'row',
              }}
            >
              <Plus size={14} color={FYLL_LIME_INK} strokeWidth={2.4} />
              <MoneyText style={{ color: FYLL_LIME_INK, marginLeft: 6, fontSize: 14, fontWeight: '700' }}>Save unit</MoneyText>
            </Pressable>
          </View> : null}

          {unitsExpanded ? <View style={{ gap: 8 }}>
            {warehouseUnits.length === 0 ? <View style={{ paddingVertical: 18, alignItems: 'center' }}><Text style={{ color: settingsPalette.faint, fontSize: 12 }}>No warehouse units yet.</Text></View> : null}
            {warehouseUnits.map((option, index) => (
              <View
                key={option.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  minHeight: 58,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderWidth: 1,
                  borderColor: settingsPalette.border,
                  borderRadius: 18,
                  backgroundColor: settingsPalette.inset,
                }}
              >
                <Text style={{ color: settingsPalette.text, fontSize: 14, fontWeight: '600' }}>{option.name}</Text>
                <Pressable
                  onPress={() => {
                    triggerLightHaptic();
                    deleteWarehouseUnit(option.id, businessId);
                  }}
                  style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Trash2 size={13} color={settingsPalette.danger} strokeWidth={2.2} />
                </Pressable>
              </View>
            ))}
          </View> : null}
        </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
