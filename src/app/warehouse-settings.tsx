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
import { getSettingsWebPanelStyles, isFromSettingsRoute } from '@/lib/settings-web-panel';
import { FYLL_LIME, FYLL_LIME_INK, MoneyText, usePaymentsPalette } from '@/components/payments/payments-ui';
import { InternalSettingsHeader } from '@/components/settings/InternalSettingsHeader';
import { InventorySettingsContent, InventorySettingsHero } from '@/components/settings/InventorySettingsScaffold';

export default function WarehouseSettingsScreen() {
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string | string[] }>();
  const goBack = useSettingsBack();
  const colors = useThemeColors();
  const resolvedThemeMode = useResolvedThemeMode();
  const settingsPalette = usePaymentsPalette();
  const { isDesktop, isMobile } = useBreakpoint();
  const tabBarHeight = useTabBarHeight();
  const panelStyles = getSettingsWebPanelStyles(
    isFromSettingsRoute(from),
    settingsPalette.page,
    settingsPalette.border
  );

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
    <View style={panelStyles.outer}>
      <View style={panelStyles.inner}>
    <SafeAreaView style={{ flex: 1, backgroundColor: settingsPalette.page }}>
      {!isDesktop ? <LinearGradient pointerEvents="none" colors={resolvedThemeMode === 'dark' ? ['rgba(111,125,18,0.55)', 'rgba(20,20,20,0)'] : ['rgba(213,224,87,0.42)', 'rgba(244,243,235,0)']} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 360 }} /> : null}
      <InternalSettingsHeader
        title="Warehouse Settings"
        description="Configure the categories and units used to structure inventory."
        isDesktop={isDesktop}
        onBack={() => {
          if ((Array.isArray(from) ? from[0] : from) === 'settings') {
            if (Platform.OS === 'web') router.replace({ pathname: '/settings', params: { menu: 'inventory' } } as never);
            else goBack();
            return;
          }
          router.back();
        }}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: isDesktop ? 64 : tabBarHeight + 32 }}
        showsVerticalScrollIndicator={false}
      >
        <InventorySettingsContent isDesktop={isDesktop}>
        <InventorySettingsHero
          eyebrow="Inventory structure"
          title="Warehouse setup"
          description={`${warehouseCategories.length} categories · ${warehouseUnits.length} units`}
          isDesktop={isDesktop}
        />

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
            <View style={{ borderWidth: 1, borderColor: settingsPalette.outline, borderRadius: 16, paddingHorizontal: 16, height: 56, justifyContent: 'center', backgroundColor: settingsPalette.inset }}>
              <TextInput
                value={categoryInput}
                onChangeText={setCategoryInput}
                placeholder="Add category"
                placeholderTextColor={colors.input.placeholder}
                style={{ color: settingsPalette.text, fontSize: 16 }}
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

          {categoriesExpanded ? <View style={{ overflow: 'hidden', borderRadius: 20, borderWidth: 1, borderColor: settingsPalette.border, backgroundColor: settingsPalette.inset }}>
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
                  borderBottomWidth: index < warehouseCategories.length - 1 ? 1 : 0,
                  borderBottomColor: settingsPalette.hairline,
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
                    <Text style={{ color: settingsPalette.text, fontSize: 12, flex: 1, fontWeight: '500' }}>{option.name}</Text>
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
            <View style={{ borderWidth: 1, borderColor: settingsPalette.outline, borderRadius: 16, paddingHorizontal: 16, height: 56, justifyContent: 'center', backgroundColor: settingsPalette.inset }}>
              <TextInput
                value={unitInput}
                onChangeText={setUnitInput}
                placeholder="Add unit"
                placeholderTextColor={colors.input.placeholder}
                style={{ color: settingsPalette.text, fontSize: 16 }}
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

          {unitsExpanded ? <View style={{ overflow: 'hidden', borderRadius: 20, borderWidth: 1, borderColor: settingsPalette.border, backgroundColor: settingsPalette.inset }}>
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
                  borderBottomWidth: index < warehouseUnits.length - 1 ? 1 : 0,
                  borderBottomColor: settingsPalette.hairline,
                  backgroundColor: settingsPalette.inset,
                }}
              >
                <Text style={{ color: settingsPalette.text, fontSize: 12, fontWeight: '500' }}>{option.name}</Text>
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
        </InventorySettingsContent>
      </ScrollView>
    </SafeAreaView>
      </View>
    </View>
  );
}
