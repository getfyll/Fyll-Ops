import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Check, CreditCard, Landmark, MoreVertical, Plus, ShieldCheck, Star, Trash2, X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts, BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import * as Haptics from 'expo-haptics';
import useAuthStore from '@/lib/state/auth-store';
import { useResolvedThemeMode } from '@/lib/theme';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { useTabBarHeight } from '@/lib/useTabBarHeight';
import { supabaseSettings } from '@/lib/supabase/settings';
import { getSettingsWebPanelStyles, isFromSettingsRoute } from '@/lib/settings-web-panel';
import { useSettingsBack } from '@/lib/useSettingsBack';
import type { BankAccount } from '@/lib/state/fyll-store';

type PaymentAccountsScreenProps = {
  embeddedInSettings?: boolean;
};

type PaymentPalette = {
  ground: string;
  surface: string;
  ink: string;
  muted: string;
  faint: string;
  lime: string;
  limeInk: string;
  limeDeep: string;
  danger: string;
  edge: string;
  edgeStrong: string;
  input: string;
  topGlow: string;
  topGlowEnd: string;
  navButton: string;
  limeWash: string;
  limeWashStrong: string;
  limeBorder: string;
  dangerWash: string;
  dangerBorder: string;
  overlay: string;
};

const DARK_PALETTE: PaymentPalette = {
  ground: '#141414', surface: '#1E1E1E', ink: '#F4F4EF', muted: '#B9BAB0', faint: '#8C8D84',
  lime: '#D5E057', limeInk: '#D5E057', limeDeep: '#7D8A00', danger: '#E5776D',
  edge: 'rgba(255,255,255,0.09)', edgeStrong: 'rgba(255,255,255,0.14)', input: 'rgba(255,255,255,0.055)',
  topGlow: 'rgba(111,125,18,0.55)', topGlowEnd: 'rgba(20,20,20,0)', navButton: 'rgba(255,255,255,0.08)',
  limeWash: 'rgba(213,224,87,0.12)', limeWashStrong: 'rgba(213,224,87,0.14)', limeBorder: 'rgba(213,224,87,0.25)',
  dangerWash: 'rgba(229,119,109,0.14)', dangerBorder: 'rgba(229,119,109,0.28)', overlay: 'rgba(0,0,0,0.72)',
};

const LIGHT_PALETTE: PaymentPalette = {
  ground: '#F4F3EB', surface: '#FFFFFF', ink: '#202117', muted: '#5E6056', faint: '#85877C',
  lime: '#D5E057', limeInk: '#667000', limeDeep: '#879400', danger: '#C9574D',
  edge: 'rgba(35,38,25,0.09)', edgeStrong: 'rgba(35,38,25,0.15)', input: '#F7F7F1',
  topGlow: 'rgba(213,224,87,0.42)', topGlowEnd: 'rgba(244,243,235,0)', navButton: 'rgba(32,33,23,0.07)',
  limeWash: 'rgba(135,148,0,0.10)', limeWashStrong: 'rgba(135,148,0,0.13)', limeBorder: 'rgba(102,112,0,0.22)',
  dangerWash: 'rgba(201,87,77,0.10)', dangerBorder: 'rgba(201,87,77,0.22)', overlay: 'rgba(24,25,18,0.46)',
};

const emptyForm = { bankName: '', accountName: '', accountNumber: '' };
const webOutlineStyle = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as unknown as TextStyle) : null;
const innerSettingsFont = (size: number, compact: boolean) => {
  if (!compact) return size;
  if (size >= 15 && size < 16) return 14;
  if (size === 13.5) return 12;
  if (size === 13) return 10;
  return size;
};

function SectionLabel({ children, palette }: { children: React.ReactNode; palette: PaymentPalette }) {
  return <Text style={{ color: palette.faint, fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase', marginLeft: 6, marginBottom: 10 }}>{children}</Text>;
}

function BankField({ label, value, onChangeText, placeholder, palette, compact, keyboardType = 'default' }: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  palette: PaymentPalette;
  compact: boolean;
  keyboardType?: 'default' | 'number-pad';
}) {
  return (
    <View style={{ gap: 7 }}>
      <Text style={{ color: palette.muted, fontSize: innerSettingsFont(13, compact), fontWeight: '500' }}>{label}</Text>
      <View style={{ height: 52, paddingHorizontal: 15, borderRadius: 16, borderWidth: 1, borderColor: palette.edgeStrong, backgroundColor: palette.input, justifyContent: 'center' }}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={palette.faint}
          keyboardType={keyboardType}
          autoCapitalize={keyboardType === 'number-pad' ? 'none' : 'words'}
          selectionColor={palette.limeDeep}
          style={[{ color: palette.ink, fontSize: innerSettingsFont(15, compact), paddingVertical: 0 }, webOutlineStyle]}
        />
      </View>
    </View>
  );
}

export default function PaymentAccountsScreen({ embeddedInSettings = false }: PaymentAccountsScreenProps) {
  const { from } = useLocalSearchParams<{ from?: string | string[] }>();
  const goBack = useSettingsBack();
  const resolvedThemeMode = useResolvedThemeMode();
  const isDark = resolvedThemeMode === 'dark';
  const palette = isDark ? DARK_PALETTE : LIGHT_PALETTE;
  const { isDesktop, isMobile } = useBreakpoint();
  const compactTypography = !isDesktop;
  const tabBarHeight = useTabBarHeight();
  const openedFromSettings = isFromSettingsRoute(from) || embeddedInSettings;
  const panelStyles = getSettingsWebPanelStyles(openedFromSettings, palette.ground, palette.edge);
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const currentUserRole = useAuthStore((s) => s.currentUser?.role ?? 'staff');
  const currentUserName = useAuthStore((s) => s.currentUser?.name ?? null);

  useFonts({ BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold });

  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState<boolean>(false);
  const [form, setForm] = useState<typeof emptyForm>(emptyForm);
  const [openMenuAccountId, setOpenMenuAccountId] = useState<string | null>(null);
  const [deleteAccount, setDeleteAccount] = useState<BankAccount | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'error' | 'success'; message: string } | null>(null);

  useEffect(() => {
    if (!businessId) {
      setIsLoading(false);
      return;
    }
    let active = true;
    supabaseSettings
      .fetchSettings<BankAccount>('payment_accounts', businessId)
      .then((rows) => { if (active) setAccounts(rows.map((row) => row.data)); })
      .catch(() => { if (active) setFeedback({ tone: 'error', message: 'Could not load bank accounts.' }); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [businessId]);

  const persist = async (next: BankAccount[]) => {
    if (!businessId) return false;
    setIsSaving(true);
    setFeedback(null);
    try {
      await supabaseSettings.upsertSettings('payment_accounts', businessId, next, currentUserName);
      setAccounts(next);
      setFeedback({ tone: 'success', message: 'Bank accounts saved.' });
      return true;
    } catch {
      setFeedback({ tone: 'error', message: 'Could not save. Check your connection and try again.' });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const openAddForm = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingId(null);
    setForm(emptyForm);
    setFeedback(null);
    setShowForm(true);
  };

  const openEditForm = (account: BankAccount) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setOpenMenuAccountId(null);
    setEditingId(account.id);
    setForm({ bankName: account.bankName, accountName: account.accountName, accountNumber: account.accountNumber });
    setFeedback(null);
    setShowForm(true);
  };

  const closeForm = () => {
    if (isSaving) return;
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(false);
  };

  const handleSubmit = async () => {
    const bankName = form.bankName.trim();
    const accountName = form.accountName.trim();
    const accountNumber = form.accountNumber.trim();
    if (!bankName || !accountName || !accountNumber) return;

    const next = editingId
      ? accounts.map((account) => account.id === editingId ? { ...account, bankName, accountName, accountNumber } : account)
      : [{ id: `bank-${Date.now()}`, bankName, accountName, accountNumber, isDefault: accounts.length === 0 }, ...accounts];
    const saved = await persist(next);
    if (saved) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      closeForm();
    }
  };

  const handleDelete = (account: BankAccount) => {
    setOpenMenuAccountId(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setDeleteAccount(account);
  };

  const confirmDelete = async () => {
    if (!deleteAccount) return;
    let next = accounts.filter((account) => account.id !== deleteAccount.id);
    if (deleteAccount.isDefault && next.length > 0) next = next.map((account, index) => ({ ...account, isDefault: index === 0 }));
    const saved = await persist(next);
    if (saved) setDeleteAccount(null);
  };

  const handleSetDefault = async (account: BankAccount) => {
    if (account.isDefault) return;
    setOpenMenuAccountId(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await persist(accounts.map((entry) => ({ ...entry, isDefault: entry.id === account.id })));
  };

  const contentMaxWidth = isDesktop || openedFromSettings ? 720 : 520;
  const formComplete = Boolean(form.bankName.trim() && form.accountName.trim() && form.accountNumber.trim());
  const defaultAccount = accounts.find((account) => account.isDefault) ?? accounts[0] ?? null;
  const cardStyle: ViewStyle = { borderRadius: 26, borderWidth: 1, borderColor: palette.edge, backgroundColor: palette.surface };

  if (currentUserRole !== 'admin') {
    return (
      <View style={panelStyles.outer}>
        <SafeAreaView style={[panelStyles.inner, { flex: 1, backgroundColor: palette.ground }]} edges={['top']}>
          <LinearGradient pointerEvents="none" colors={[palette.topGlow, palette.topGlowEnd]} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 320 }} />
          <View style={{ flex: 1, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.limeWashStrong, borderWidth: 1, borderColor: palette.limeBorder, marginBottom: 18 }}><Landmark size={27} color={palette.limeInk} strokeWidth={2} /></View>
            <Text style={{ color: palette.ink, fontFamily: 'BricolageGrotesque_700Bold', fontWeight: '400', fontSize: 22, textAlign: 'center' }}>Admin access required</Text>
            <Text style={{ color: palette.muted, fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 310, marginTop: 7 }}>Bank account settings are only available to business admins.</Text>
            <Pressable onPress={goBack} style={({ pressed }) => ({ height: 46, marginTop: 22, paddingHorizontal: 24, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.lime, opacity: pressed ? 0.78 : 1 })}><Text style={{ color: '#202117', fontFamily: 'BricolageGrotesque_700Bold', fontWeight: '400', fontSize: innerSettingsFont(15, compactTypography) }}>Back to settings</Text></Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={panelStyles.outer}>
      <SafeAreaView style={[panelStyles.inner, { flex: 1, backgroundColor: palette.ground }]} edges={['top']}>
        <LinearGradient pointerEvents="none" colors={[palette.topGlow, palette.topGlowEnd]} locations={[0, 1]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: openedFromSettings ? 390 : 300 }} />

        <View style={{ minHeight: isMobile ? 66 : openedFromSettings ? 58 : 56, paddingHorizontal: openedFromSettings ? 20 : 10, paddingTop: isMobile ? 12 : 4, paddingBottom: 4, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); goBack(); }} accessibilityRole="button" accessibilityLabel="Back" hitSlop={4} style={({ pressed }) => ({ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.navButton, opacity: pressed ? 0.62 : 1 })}>
            <ArrowLeft size={18} color={palette.ink} strokeWidth={2.2} />
          </Pressable>
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={{ color: palette.faint, fontSize: 9.5, lineHeight: 12, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' }}>Settings</Text>
            <Text style={{ color: palette.ink, fontSize: 17, lineHeight: 21, fontWeight: '600' }}>Bank Accounts</Text>
          </View>
          <View style={{ height: 28, paddingHorizontal: 10, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: palette.limeWashStrong, borderWidth: 1, borderColor: palette.limeBorder }}>
            <ShieldCheck size={13} color={palette.limeInk} strokeWidth={2.2} />
            <Text style={{ color: palette.limeInk, fontSize: 11, fontWeight: '700' }}>Admin</Text>
          </View>
        </View>

        <KeyboardAwareScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ width: '100%', maxWidth: contentMaxWidth, alignSelf: 'center', paddingHorizontal: 16, paddingTop: openedFromSettings ? 22 : 12, paddingBottom: isDesktop ? 64 : tabBarHeight + 48 }}
          showsVerticalScrollIndicator={false}
          enableOnAndroid
          extraScrollHeight={110}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ position: 'relative', overflow: 'hidden', minHeight: 160, marginBottom: 24, padding: 20, borderRadius: 28, borderWidth: 1, borderColor: palette.edge, backgroundColor: palette.surface, shadowColor: '#000000', shadowOpacity: isDark ? 0.24 : 0.07, shadowRadius: 24, shadowOffset: { width: 0, height: 10 } }}>
            <LinearGradient pointerEvents="none" colors={[palette.limeWashStrong, 'transparent']} start={{ x: 1, y: 0 }} end={{ x: 0.2, y: 1 }} style={{ position: 'absolute', top: -40, right: -34, width: 190, height: 190, borderRadius: 95 }} />
            <View style={{ position: 'absolute', top: 0, left: 28, right: 28, height: 3, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, backgroundColor: palette.lime }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15 }}>
              <LinearGradient colors={[palette.lime, palette.limeDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 66, height: 66, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}><Landmark size={28} color="#202117" strokeWidth={2.1} /></LinearGradient>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: palette.faint, fontSize: 10, fontWeight: '700', letterSpacing: 1.15, textTransform: 'uppercase' }}>Payment destinations</Text>
                <Text style={{ color: palette.ink, fontFamily: 'BricolageGrotesque_800ExtraBold', fontSize: 29, lineHeight: 34, letterSpacing: -0.8, marginTop: 2 }}>{accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}</Text>
                <Text numberOfLines={1} style={{ color: palette.faint, fontSize: 12.5, marginTop: 2 }}>{defaultAccount ? `Default · ${defaultAccount.bankName}` : 'Add an account for checkout links'}</Text>
              </View>
            </View>
            {!showForm ? (
              <Pressable onPress={openAddForm} style={({ pressed }) => ({ height: 44, marginTop: 18, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: palette.lime, opacity: pressed ? 0.78 : 1 })}>
                <Plus size={16} color="#202117" strokeWidth={2.5} />
                <Text style={{ color: '#202117', fontFamily: 'BricolageGrotesque_700Bold', fontWeight: '400', fontSize: innerSettingsFont(15, compactTypography) }}>Add bank account</Text>
              </Pressable>
            ) : null}
          </View>

          {feedback ? (
            <View accessibilityRole="alert" style={{ borderRadius: 16, marginBottom: 18, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: feedback.tone === 'error' ? palette.dangerWash : palette.limeWashStrong, borderWidth: 1, borderColor: feedback.tone === 'error' ? palette.dangerBorder : palette.limeBorder }}>
              {feedback.tone === 'error' ? <X size={17} color={palette.danger} /> : <Check size={17} color={palette.limeInk} />}
              <Text style={{ flex: 1, color: feedback.tone === 'error' ? palette.danger : palette.limeInk, fontSize: innerSettingsFont(13, compactTypography), lineHeight: 18, fontWeight: '500' }}>{feedback.message}</Text>
            </View>
          ) : null}

          {!isLoading && (showForm || accounts.length === 0) ? (
            <>
              <SectionLabel palette={palette}>{editingId ? 'Edit account' : 'New account'}</SectionLabel>
              <View style={[cardStyle, { padding: 18, gap: 15, marginBottom: 26 }]}>
                <BankField palette={palette} compact={compactTypography} label="Bank name" value={form.bankName} onChangeText={(value) => setForm((current) => ({ ...current, bankName: value }))} placeholder="e.g. GTBank" />
                <BankField palette={palette} compact={compactTypography} label="Account name" value={form.accountName} onChangeText={(value) => setForm((current) => ({ ...current, accountName: value }))} placeholder="Name on the account" />
                <BankField palette={palette} compact={compactTypography} label="Account number" value={form.accountNumber} onChangeText={(value) => setForm((current) => ({ ...current, accountNumber: value }))} placeholder="Enter account number" keyboardType="number-pad" />
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 3 }}>
                  <Pressable onPress={closeForm} disabled={isSaving || accounts.length === 0} style={({ pressed }) => ({ flex: 1, height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.edgeStrong, opacity: accounts.length === 0 ? 0.4 : pressed ? 0.7 : 1 })}><Text style={{ color: palette.ink, fontFamily: 'BricolageGrotesque_700Bold', fontWeight: '400', fontSize: 14 }}>Cancel</Text></Pressable>
                  <Pressable onPress={handleSubmit} disabled={isSaving || !formComplete} style={({ pressed }) => ({ flex: 1.4, height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.lime, opacity: isSaving || !formComplete ? 0.45 : pressed ? 0.78 : 1 })}>
                    {isSaving ? <ActivityIndicator color="#202117" size="small" /> : <Text style={{ color: '#202117', fontFamily: 'BricolageGrotesque_700Bold', fontWeight: '400', fontSize: 14 }}>{editingId ? 'Save account' : 'Add account'}</Text>}
                  </Pressable>
                </View>
              </View>
            </>
          ) : null}

          <SectionLabel palette={palette}>Saved accounts</SectionLabel>
          {isLoading ? (
            <View style={[cardStyle, { height: 130, alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator color={palette.limeInk} /></View>
          ) : accounts.length === 0 ? (
            <View style={[cardStyle, { padding: 24, alignItems: 'center' }]}>
              <CreditCard size={25} color={palette.faint} strokeWidth={1.8} />
              <Text style={{ color: palette.ink, fontSize: innerSettingsFont(15, compactTypography), fontWeight: '600', marginTop: 10 }}>No saved accounts yet</Text>
              <Text style={{ color: palette.faint, fontSize: innerSettingsFont(13, compactTypography), marginTop: 4, textAlign: 'center' }}>Complete the form above to add your first payment destination.</Text>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {accounts.map((account) => (
                <Pressable key={account.id} onPress={() => openEditForm(account)} style={({ pressed }) => ({ minHeight: 112, padding: 18, borderRadius: 24, borderWidth: 1, borderColor: account.isDefault ? palette.limeBorder : palette.edge, backgroundColor: palette.surface, flexDirection: 'row', alignItems: 'center', gap: 14, position: 'relative', overflow: 'visible', opacity: pressed ? 0.75 : 1, zIndex: openMenuAccountId === account.id ? 20 : 1 })}>
                  <View style={{ width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: account.isDefault ? palette.limeWashStrong : palette.input }}><Landmark size={21} color={account.isDefault ? palette.limeInk : palette.ink} strokeWidth={2} /></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text numberOfLines={1} style={{ flexShrink: 1, color: palette.ink, fontSize: innerSettingsFont(15.5, compactTypography), fontWeight: '600' }}>{account.bankName}</Text>
                      {account.isDefault ? <View style={{ height: 23, paddingHorizontal: 8, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: palette.limeWashStrong }}><Check size={11} color={palette.limeInk} strokeWidth={3} /><Text style={{ color: palette.limeInk, fontSize: 9.5, fontWeight: '700', letterSpacing: 0.55, textTransform: 'uppercase' }}>Default</Text></View> : null}
                    </View>
                    <Text numberOfLines={1} style={{ color: palette.muted, fontSize: innerSettingsFont(13.5, compactTypography), marginTop: 5 }}>{account.accountName}</Text>
                    <Text style={{ color: palette.faint, fontSize: innerSettingsFont(13, compactTypography), fontWeight: '500', letterSpacing: 0.8, marginTop: 4 }}>{account.accountNumber}</Text>
                  </View>
                  <Pressable onPress={(event) => { event.stopPropagation(); setOpenMenuAccountId((current) => current === account.id ? null : account.id); }} accessibilityRole="button" accessibilityLabel={`Actions for ${account.bankName}`} hitSlop={5} style={({ pressed }) => ({ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.input, opacity: pressed ? 0.6 : 1 })}><MoreVertical size={18} color={palette.faint} strokeWidth={2.2} /></Pressable>
                  {openMenuAccountId === account.id ? (
                    <View style={{ position: 'absolute', right: 16, top: 66, width: 182, borderRadius: 18, overflow: 'hidden', backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.edgeStrong, shadowColor: '#000000', shadowOpacity: isDark ? 0.4 : 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 9 }, elevation: 10, zIndex: 30 }}>
                      {!account.isDefault ? <Pressable onPress={(event) => { event.stopPropagation(); void handleSetDefault(account); }} style={({ pressed }) => ({ minHeight: 48, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: pressed ? palette.input : palette.surface })}><Star size={16} color={palette.limeInk} strokeWidth={2.2} /><Text style={{ color: palette.ink, fontSize: 14, fontWeight: '500' }}>Set as default</Text></Pressable> : null}
                      <Pressable onPress={(event) => { event.stopPropagation(); handleDelete(account); }} style={({ pressed }) => ({ minHeight: 48, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: account.isDefault ? 0 : 1, borderTopColor: palette.edge, backgroundColor: pressed ? palette.dangerWash : palette.surface })}><Trash2 size={16} color={palette.danger} strokeWidth={2.2} /><Text style={{ color: palette.danger, fontSize: 14, fontWeight: '500' }}>Delete account</Text></Pressable>
                    </View>
                  ) : null}
                </Pressable>
              ))}
            </View>
          )}
        </KeyboardAwareScrollView>

        <Modal visible={Boolean(deleteAccount)} transparent animationType="fade" onRequestClose={() => { if (!isSaving) setDeleteAccount(null); }}>
          <Pressable onPress={() => { if (!isSaving) setDeleteAccount(null); }} style={{ flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.overlay }}>
            <Pressable onPress={(event) => event.stopPropagation()} style={{ width: '100%', maxWidth: 390, borderRadius: 26, padding: 22, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.edge, gap: 18 }}>
              <View style={{ width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.dangerWash }}><Trash2 size={20} color={palette.danger} strokeWidth={2.2} /></View>
              <View style={{ gap: 6 }}>
                <Text style={{ color: palette.ink, fontFamily: 'BricolageGrotesque_800ExtraBold', fontSize: 23, letterSpacing: -0.45 }}>Remove bank account?</Text>
                <Text style={{ color: palette.muted, fontSize: 14, lineHeight: 20 }}>{deleteAccount ? `${deleteAccount.bankName} · ${deleteAccount.accountNumber} will no longer appear on checkout links.` : ''}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable onPress={() => setDeleteAccount(null)} disabled={isSaving} style={({ pressed }) => ({ flex: 1, height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.edgeStrong, opacity: pressed ? 0.7 : 1 })}><Text style={{ color: palette.ink, fontFamily: 'BricolageGrotesque_700Bold', fontWeight: '400', fontSize: 14 }}>Cancel</Text></Pressable>
                <Pressable onPress={confirmDelete} disabled={isSaving} style={({ pressed }) => ({ flex: 1, height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.danger, opacity: isSaving ? 0.6 : pressed ? 0.75 : 1 })}>{isSaving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ color: '#FFFFFF', fontFamily: 'BricolageGrotesque_700Bold', fontWeight: '400', fontSize: 14 }}>Remove</Text>}</Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </SafeAreaView>
    </View>
  );
}
