import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Check, ChevronRight, Clock, Flag, Globe, MapPin, Pencil, Phone, Store, User as UserIcon, X } from 'lucide-react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import * as Haptics from 'expo-haptics';
import { FYLL_LIME, FYLL_LIME_INK, MoneyText, usePaymentsPalette } from '@/components/payments/payments-ui';
import { EditFieldModal } from '@/components/settings/EditFieldModal';
import { InternalSettingsHeader } from '@/components/settings/InternalSettingsHeader';
import { InventorySettingsHero } from '@/components/settings/InventorySettingsScaffold';
import { LimeToggle } from '@/components/settings/LimeToggle';
import { OptionSheet } from '@/components/settings/OptionSheet';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import {
  EMPTY_PICKUP_SETTINGS,
  PICKUP_DAYS,
  PICKUP_TIME_OPTIONS,
  formatPickupHours,
  formatPickupTime,
  getMissingPickupFields,
  type PickupSettings,
} from '@/lib/pickup';
import { PICKUP_COUNTRIES, getPickupStatesForCountry } from '@/lib/pickup-locations';
import { getSettingsWebPanelStyles, isFromSettingsRoute } from '@/lib/settings-web-panel';
import { useSettingsBack } from '@/lib/useSettingsBack';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { useTabBarHeight } from '@/lib/useTabBarHeight';

// Pickup (customer collection). This reads and writes businesses.data.pickupSettings, the same settings the Fyll Store
// edits under Settings → Delivery, so changing it here changes it there and the other way round.

type TextFieldKey = 'locationName' | 'areaName' | 'fullAddress' | 'contactName' | 'contactPhone' | 'instructions';

const TEXT_FIELDS: {
  key: TextFieldKey;
  label: string;
  placeholder: string;
  help: string;
  icon: typeof Store;
  multiline?: boolean;
  keyboardType?: 'default' | 'phone-pad';
}[] = [
  { key: 'locationName', label: 'Location name', placeholder: 'e.g. Fyll Eyewear Lekki store', help: 'The name customers see for the pickup point.', icon: Store },
  { key: 'areaName', label: 'Area shown at checkout', placeholder: 'e.g. Lekki Phase 1, Lagos', help: 'Shown to customers before they pay. The full address stays private until payment is confirmed.', icon: MapPin },
  { key: 'fullAddress', label: 'Full address', placeholder: 'Street, building and landmark', help: 'Customers get this once their payment is confirmed.', icon: MapPin, multiline: true },
  { key: 'contactName', label: 'Contact person', placeholder: 'Who customers should ask for', help: 'Shown to customers once their payment is confirmed.', icon: UserIcon },
  { key: 'contactPhone', label: 'Contact number', placeholder: 'e.g. +234 800 123 4567', help: 'Shown to customers once their payment is confirmed.', icon: Phone, keyboardType: 'phone-pad' },
  { key: 'instructions', label: 'Pickup instructions', placeholder: 'e.g. Bring your order number and a valid ID', help: 'Optional. Included in the pickup email.', icon: Pencil, multiline: true },
];

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((value) => b.includes(value));

type PickupSettingsScreenProps = { embeddedInSettings?: boolean };

export default function PickupSettingsScreen({ embeddedInSettings = false }: PickupSettingsScreenProps) {
  const { from } = useLocalSearchParams<{ from?: string | string[] }>();
  const goBack = useSettingsBack();
  const palette = usePaymentsPalette();
  const { isDesktop, isMobile } = useBreakpoint();
  const tabBarHeight = useTabBarHeight();
  const openedFromSettings = isFromSettingsRoute(from);
  const panelStyles = getSettingsWebPanelStyles(openedFromSettings || embeddedInSettings, palette.page, palette.border);
  const { pickupSettings, isLoading, savePickupSettings } = useBusinessSettings();

  const [draft, setDraft] = useState<PickupSettings>(EMPTY_PICKUP_SETTINGS);
  const [editingField, setEditingField] = useState<TextFieldKey | null>(null);
  const [openPicker, setOpenPicker] = useState<'country' | 'start' | 'end' | null>(null);
  const [stateQuery, setStateQuery] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load the saved settings once they arrive, and again whenever they change elsewhere (for example in the Store).
  const savedKey = JSON.stringify(pickupSettings);
  useEffect(() => {
    if (!isLoading) setDraft(pickupSettings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, savedKey]);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  };

  const hasChanges = useMemo(() => (
    draft.enabled !== pickupSettings.enabled
    || draft.country !== pickupSettings.country
    || draft.locationName.trim() !== pickupSettings.locationName.trim()
    || draft.areaName.trim() !== pickupSettings.areaName.trim()
    || draft.fullAddress.trim() !== pickupSettings.fullAddress.trim()
    || draft.contactName.trim() !== pickupSettings.contactName.trim()
    || draft.contactPhone.trim() !== pickupSettings.contactPhone.trim()
    || (draft.instructions ?? '').trim() !== (pickupSettings.instructions ?? '').trim()
    || draft.startTime !== pickupSettings.startTime
    || draft.endTime !== pickupSettings.endTime
    || !sameList(draft.days, pickupSettings.days)
    || !sameList(draft.states, pickupSettings.states)
  ), [draft, pickupSettings]);

  const missing = useMemo(() => getMissingPickupFields(draft), [draft]);
  const stateOptions = useMemo(() => getPickupStatesForCountry(draft.country), [draft.country]);
  const visibleStates = useMemo(() => {
    const query = stateQuery.trim().toLowerCase();
    return query ? stateOptions.filter((state) => state.toLowerCase().includes(query)) : stateOptions;
  }, [stateOptions, stateQuery]);

  const update = (patch: Partial<PickupSettings>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setError(null);
  };

  const toggleDay = (day: string) => {
    void Haptics.selectionAsync();
    // Keep days in week order, whatever order they were tapped in.
    const next = draft.days.includes(day) ? draft.days.filter((entry) => entry !== day) : [...draft.days, day];
    update({ days: PICKUP_DAYS.filter((entry) => next.includes(entry)) });
  };

  const toggleState = (state: string) => {
    void Haptics.selectionAsync();
    update({ states: draft.states.includes(state) ? draft.states.filter((entry) => entry !== state) : [...draft.states, state] });
  };

  const handleSave = async () => {
    setError(null);
    setIsSaving(true);
    try {
      const result = await savePickupSettings(draft);
      if (!result.success) {
        const message = result.error ?? 'Could not save pickup settings.';
        setError(message);
        showToast('error', message);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }
      showToast('success', 'Pickup settings saved.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } finally {
      setIsSaving(false);
    }
  };

  const editorPalette = {
    surface: palette.card,
    ink: palette.text,
    muted: palette.muted,
    faint: palette.faint,
    lime: FYLL_LIME,
    limeDeep: palette.limeOnSurface,
    edge: palette.border,
    edgeStrong: palette.outline,
    navButton: palette.softFill,
  };
  const sheetPalette = {
    surface: palette.card,
    ink: palette.text,
    faint: palette.faint,
    input: palette.softFill,
    navButton: palette.softFill,
    limeWash: palette.nudgeBg,
    limeInk: palette.limeOnSurface,
  };

  const cardStyle = { borderRadius: 26, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, overflow: 'hidden' as const };
  const caps = { color: palette.faint, fontSize: 10, lineHeight: 14, fontWeight: '700' as const, letterSpacing: 1.1, textTransform: 'uppercase' as const, marginLeft: 6, marginBottom: 10 };
  const contentMaxWidth = isDesktop ? 1440 : 520;
  const editing = TEXT_FIELDS.find((field) => field.key === editingField) ?? null;

  const iconChip = (Icon: typeof Store) => (
    <View style={{ width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.nudgeBg }}>
      <Icon size={18} color={palette.limeOnSurface} strokeWidth={2} />
    </View>
  );

  const pen = (label: string, onPress: () => void) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${label}`}
      hitSlop={8}
      style={({ pressed }) => ({ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.softFill, opacity: pressed ? 0.6 : 1 })}
    >
      <Pencil size={14} color={palette.muted} strokeWidth={2.2} />
    </Pressable>
  );

  const chip = (label: string, selected: boolean, onPress: () => void) => (
    <Pressable
      key={label}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => ({
        height: 36,
        paddingHorizontal: 14,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: selected ? FYLL_LIME : palette.card,
        borderWidth: selected ? 0 : 1,
        borderColor: palette.outline,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Text style={{ color: selected ? FYLL_LIME_INK : palette.text, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );

  const pickerRow = (label: string, valueLabel: string, Icon: typeof Store, onPress: () => void, showDivider = true) => (
    <Pressable onPress={onPress} style={({ pressed }) => ({ minHeight: 76, paddingHorizontal: 18, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 14, borderBottomWidth: showDivider ? 1 : 0, borderBottomColor: palette.hairline, opacity: pressed ? 0.7 : 1 })}>
      {iconChip(Icon)}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: palette.text, fontSize: 14, lineHeight: 20, fontWeight: '600' }}>{label}</Text>
        <Text style={{ color: palette.text, fontSize: 12, lineHeight: 18, marginTop: 2 }} numberOfLines={1}>{valueLabel}</Text>
      </View>
      <ChevronRight size={18} color={palette.faint} />
    </Pressable>
  );

  if (isLoading) {
    return (
      <View style={panelStyles.outer}>
        <View style={[panelStyles.inner, { alignItems: 'center', justifyContent: 'center' }]}>
          <ActivityIndicator size="large" color={palette.limeOnSurface} />
        </View>
      </View>
    );
  }

  return (
    <View style={panelStyles.outer}>
      <View style={panelStyles.inner}>
        <SafeAreaView style={{ flex: 1, backgroundColor: palette.page }} edges={['top']}>
          {toast ? (
            <View pointerEvents="none" style={{ position: 'absolute', top: 14, left: 16, right: 16, alignItems: 'center', zIndex: 9999, elevation: 9999 }}>
              <View style={{ maxWidth: 420, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: toast.type === 'success' ? FYLL_LIME : palette.danger }}>
                {toast.type === 'success' ? <Check size={15} color="#202117" strokeWidth={2.4} /> : <X size={15} color="#FFFFFF" strokeWidth={2.4} />}
                <Text style={{ color: toast.type === 'success' ? '#202117' : '#FFFFFF', fontWeight: '600', fontSize: 12 }}>{toast.message}</Text>
              </View>
            </View>
          ) : null}

          <InternalSettingsHeader
            title="Pickup"
            description="Let customers collect their orders from you instead of having them delivered."
            isDesktop={isDesktop}
            onBack={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); goBack(); }}
          />

          <KeyboardAwareScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ width: '100%', maxWidth: contentMaxWidth, alignSelf: isDesktop ? 'flex-start' : 'center', paddingHorizontal: isDesktop ? 24 : 16, paddingTop: openedFromSettings || embeddedInSettings ? 22 : 12, paddingBottom: hasChanges ? 140 : (isDesktop ? 64 : tabBarHeight + 48) }}
            showsVerticalScrollIndicator={false}
            enableOnAndroid
            extraScrollHeight={110}
            keyboardShouldPersistTaps="handled"
          >
            <InventorySettingsHero
              eyebrow="Customer collection"
              title={draft.enabled ? 'Pickup is on' : 'Pickup is off'}
              description="Shared with your Fyll Store: change it here or there and both stay the same."
              isDesktop={isDesktop}
            />

            {error ? (
              <View accessibilityRole="alert" style={{ borderRadius: 16, marginBottom: 18, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: palette.dangerBg, borderWidth: 1, borderColor: palette.dangerBorder }}>
                <X size={17} color={palette.danger} />
                <Text style={{ flex: 1, color: palette.danger, fontSize: 12, lineHeight: 18, fontWeight: '500' }}>{error}</Text>
              </View>
            ) : null}

            <Text style={caps}>Availability</Text>
            <View style={[cardStyle, { padding: 18, marginBottom: 26 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                {iconChip(Store)}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: palette.text, fontSize: 14, lineHeight: 20, fontWeight: '600' }}>Offer pickup</Text>
                  <Text style={{ color: palette.faint, fontSize: 12, lineHeight: 17, marginTop: 2 }}>
                    {draft.enabled ? 'Customers can choose pickup at checkout on your storefront.' : 'Customers only see delivery on your storefront. You can still create pickup orders here.'}
                  </Text>
                </View>
                <LimeToggle
                  value={draft.enabled}
                  onValueChange={(value) => { void Haptics.selectionAsync(); update({ enabled: value }); }}
                  accessibilityLabel="Offer pickup"
                  activeColor={FYLL_LIME}
                  inactiveColor={palette.softFill}
                  inactiveBorderColor={palette.outline}
                />
              </View>
              {draft.enabled && missing.length > 0 ? (
                <Text style={{ color: palette.warn, fontSize: 12, lineHeight: 17, marginTop: 14 }}>
                  Still to add before you can save: {missing.join(', ')}.
                </Text>
              ) : null}
            </View>

            <Text style={caps}>Pickup point</Text>
            <View style={[cardStyle, { marginBottom: 26 }]}>
              {TEXT_FIELDS.map((field, index) => {
                const value = (draft[field.key] ?? '') as string;
                return (
                  <View key={field.key} style={{ minHeight: field.multiline ? 104 : 88, paddingHorizontal: 18, paddingVertical: 14, flexDirection: 'row', alignItems: field.multiline ? 'flex-start' : 'center', gap: 14, borderBottomWidth: index < TEXT_FIELDS.length - 1 ? 1 : 0, borderBottomColor: palette.hairline }}>
                    {iconChip(field.icon)}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: palette.text, fontSize: 14, lineHeight: 20, fontWeight: '600' }}>{field.label}</Text>
                      <Text numberOfLines={field.multiline ? 3 : 1} selectable style={{ color: value ? palette.text : palette.faint, fontSize: 12, lineHeight: 18, marginTop: 2 }}>{value || field.placeholder}</Text>
                      <Text style={{ color: palette.faint, fontSize: 10, lineHeight: 15, marginTop: 2 }}>{field.help}</Text>
                    </View>
                    {pen(field.label, () => setEditingField(field.key))}
                  </View>
                );
              })}
            </View>

            <Text style={caps}>Where it serves</Text>
            <View style={[cardStyle, { marginBottom: 26 }]}>
              {pickerRow('Country', draft.country, Flag, () => setOpenPicker('country'))}
              <View style={{ paddingHorizontal: 18, paddingVertical: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 }}>
                  {iconChip(Globe)}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: palette.text, fontSize: 14, lineHeight: 20, fontWeight: '600' }}>States</Text>
                    <Text style={{ color: palette.faint, fontSize: 10, lineHeight: 15, marginTop: 2 }}>
                      {draft.states.length === 0 ? 'Pick every state whose customers can choose this pickup point.' : `${draft.states.length} selected`}
                    </Text>
                  </View>
                </View>
                {stateOptions.length > 12 ? (
                  <View style={{ height: 44, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, borderColor: palette.outline, backgroundColor: palette.card, justifyContent: 'center', marginBottom: 12 }}>
                    <TextInput
                      value={stateQuery}
                      onChangeText={setStateQuery}
                      placeholder="Search states"
                      placeholderTextColor={palette.faint}
                      style={[{ color: palette.text, fontSize: 16, paddingVertical: 0 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null]}
                    />
                  </View>
                ) : null}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {visibleStates.map((state) => chip(state, draft.states.includes(state), () => toggleState(state)))}
                </View>
                {visibleStates.length === 0 ? <Text style={{ color: palette.faint, fontSize: 12 }}>No states match "{stateQuery}".</Text> : null}
              </View>
            </View>

            <Text style={caps}>When</Text>
            <View style={[cardStyle, { marginBottom: 26 }]}>
              <View style={{ paddingHorizontal: 18, paddingTop: 14, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: palette.hairline }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 }}>
                  {iconChip(Clock)}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: palette.text, fontSize: 14, lineHeight: 20, fontWeight: '600' }}>Pickup days</Text>
                    <Text style={{ color: palette.faint, fontSize: 10, lineHeight: 15, marginTop: 2 }}>{draft.days.length === 0 ? 'Pick the days customers can collect.' : formatPickupHours(draft)}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {PICKUP_DAYS.map((day) => chip(day.slice(0, 3), draft.days.includes(day), () => toggleDay(day)))}
                </View>
              </View>
              {pickerRow('Opens', formatPickupTime(draft.startTime), Clock, () => setOpenPicker('start'))}
              {pickerRow('Closes', formatPickupTime(draft.endTime), Clock, () => setOpenPicker('end'), false)}
            </View>
          </KeyboardAwareScrollView>

          {hasChanges ? (
            <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 20, paddingHorizontal: 16, paddingBottom: isDesktop ? 24 : 28, backgroundColor: palette.page }}>
              <Pressable
                onPress={handleSave}
                disabled={isSaving}
                style={({ pressed }) => ({ width: '100%', maxWidth: contentMaxWidth - 32, alignSelf: isDesktop ? 'flex-start' : 'center', height: 56, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: FYLL_LIME, opacity: isSaving ? 0.62 : pressed ? 0.78 : 1 })}
              >
                {isSaving ? <ActivityIndicator color={FYLL_LIME_INK} /> : <MoneyText style={{ color: FYLL_LIME_INK, fontSize: 14 }}>Save pickup settings</MoneyText>}
              </Pressable>
            </View>
          ) : null}

          {editing ? (
            <EditFieldModal
              visible
              title={editing.label}
              value={((draft[editing.key] ?? '') as string)}
              placeholder={editing.placeholder}
              help={editing.help}
              multiline={editing.multiline}
              keyboardType={editing.keyboardType}
              palette={editorPalette}
              onClose={() => setEditingField(null)}
              onSave={(next) => { update({ [editing.key]: next } as Partial<PickupSettings>); setEditingField(null); }}
            />
          ) : null}

          <OptionSheet
            visible={openPicker === 'country'}
            title="Select country"
            palette={sheetPalette}
            selected={draft.country}
            options={PICKUP_COUNTRIES.map((country) => ({ value: country, label: country }))}
            onClose={() => setOpenPicker(null)}
            onSelect={(value) => {
              void Haptics.selectionAsync();
              // States belong to a country, so switching country starts the list again.
              if (value !== draft.country) update({ country: value, states: [] });
              setStateQuery('');
              setOpenPicker(null);
            }}
          />
          <OptionSheet
            visible={openPicker === 'start' || openPicker === 'end'}
            title={openPicker === 'end' ? 'Closes at' : 'Opens at'}
            palette={sheetPalette}
            selected={openPicker === 'end' ? draft.endTime : draft.startTime}
            options={PICKUP_TIME_OPTIONS.map((time) => ({ value: time, label: formatPickupTime(time) }))}
            onClose={() => setOpenPicker(null)}
            onSelect={(value) => {
              void Haptics.selectionAsync();
              update(openPicker === 'end' ? { endTime: value } : { startTime: value });
              setOpenPicker(null);
            }}
          />
        </SafeAreaView>
      </View>
    </View>
  );
}
