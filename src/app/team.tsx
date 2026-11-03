import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Modal, Share, Alert, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Trash2, Edit2, User as UserIcon, Shield, X, Mail, Clock, Copy, Send, UserCog } from 'lucide-react-native';
import { useResolvedThemeMode, useThemeColors } from '@/lib/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts, BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import useAuthStore, { TeamMember, TeamRole, PendingInvite } from '@/lib/state/auth-store';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useSettingsBack } from '@/lib/useSettingsBack';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { buildTeamInviteLink } from '@/lib/fyll-app-url';
import { useQuery } from '@tanstack/react-query';
import { fetchBusinessPrimaryLink } from '@/lib/primary-account';
import { PasswordEyeToggle } from '@/components/PasswordEyeToggle';
import { InternalSettingsHeader } from '@/components/settings/InternalSettingsHeader';

const roleLabels: Record<TeamRole, string> = {
  admin: 'Admin',
  manager: 'Manager',
  staff: 'Staff',
};

const roleDescriptions: Record<TeamRole, string> = {
  admin: 'Full access to Revenue, Insights, Team, and Settings',
  manager: 'Manage Inventory, Restocks, and Order History. No Insights.',
  staff: 'Scan QR, Inventory Checks, and Add Orders only',
};

const roleColors: Record<TeamRole, string> = {
  admin: '#EF4444',
  manager: '#F59E0B',
  staff: '#3B82F6',
};

const roleIcons: Record<TeamRole, React.ReactNode> = {
  admin: <Shield size={16} color="#EF4444" strokeWidth={2} />,
  manager: <UserCog size={16} color="#F59E0B" strokeWidth={2} />,
  staff: <UserIcon size={16} color="#3B82F6" strokeWidth={2} />,
};

type TeamManagementScreenProps = { embeddedInSettings?: boolean };

export default function TeamManagementScreen({ embeddedInSettings = false }: TeamManagementScreenProps) {
  const { from } = useLocalSearchParams<{ from?: string | string[] }>();
  const goBack = useSettingsBack();
  const colors = useThemeColors();
  const resolvedThemeMode = useResolvedThemeMode();
  const isDark = resolvedThemeMode === 'dark';
  const palette = isDark
    ? {
        ground: '#141414', surface: '#1E1E1E', ink: '#F4F4EF', muted: '#B9BAB0', faint: '#8C8D84', lime: '#D5E057', limeInk: '#D5E057', limeDeep: '#7D8A00',
        edge: 'rgba(255,255,255,0.09)', edgeStrong: 'rgba(255,255,255,0.14)', input: 'rgba(255,255,255,0.055)', topGlow: 'rgba(111,125,18,0.55)', topGlowEnd: 'rgba(20,20,20,0)', navButton: 'rgba(255,255,255,0.08)', limeWash: 'rgba(213,224,87,0.14)', limeBorder: 'rgba(213,224,87,0.25)', dangerWash: 'rgba(239,68,68,0.12)',
      }
    : {
        ground: '#F4F3EB', surface: '#FFFFFF', ink: '#202117', muted: '#5E6056', faint: '#85877C', lime: '#D5E057', limeInk: '#667000', limeDeep: '#879400',
        edge: 'rgba(35,38,25,0.09)', edgeStrong: 'rgba(35,38,25,0.15)', input: '#F7F7F1', topGlow: 'rgba(213,224,87,0.42)', topGlowEnd: 'rgba(244,243,235,0)', navButton: 'rgba(32,33,23,0.07)', limeWash: 'rgba(135,148,0,0.13)', limeBorder: 'rgba(102,112,0,0.22)', dangerWash: 'rgba(239,68,68,0.08)',
      };
  const { isDesktop, isMobile } = useBreakpoint();
  useFonts({ BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold });
  const primaryPillButtonStyle = {
    backgroundColor: palette.lime,
    borderRadius: 999,
  } as const;
  const primaryPillTextStyle = {
    color: '#202117',
    fontFamily: 'BricolageGrotesque_700Bold',
    fontWeight: '400' as const,
  } as const;

  const currentUser = useAuthStore((s) => s.currentUser);
  const teamMembers = useAuthStore((s) => s.teamMembers);
  const pendingInvites = useAuthStore((s) => s.pendingInvites);
  const updateTeamMember = useAuthStore((s) => s.updateTeamMember);
  const removeTeamMember = useAuthStore((s) => s.removeTeamMember);
  const setUserPassword = useAuthStore((s) => s.setUserPassword);
  const createInvite = useAuthStore((s) => s.createInvite);
  const cancelInvite = useAuthStore((s) => s.cancelInvite);
  const refreshTeamData = useAuthStore((s) => s.refreshTeamData);
  const businessId = useAuthStore((s) => s.businessId);
  // The owner's primary email shows up here as an admin; it must not be removed from this list.
  const primaryLinkQuery = useQuery({
    queryKey: ['primary-link', businessId],
    enabled: Boolean(businessId) && currentUser?.role === 'admin',
    queryFn: () => fetchBusinessPrimaryLink(businessId!),
  });
  const primaryEmail = primaryLinkQuery.data?.primaryEmail.trim().toLowerCase() ?? '';

  const [showEditModal, setShowEditModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [lastCreatedInvite, setLastCreatedInvite] = useState<PendingInvite | null>(null);

  // Edit form state
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formRole, setFormRole] = useState<TeamRole>('staff');
  const [formPassword, setFormPassword] = useState('');
  const [showFormPassword, setShowFormPassword] = useState(false);
  const [formError, setFormError] = useState('');

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<TeamRole>('staff');
  const [inviteError, setInviteError] = useState('');
  const [isInviteSubmitting, setIsInviteSubmitting] = useState(false);

  const isAdmin = currentUser?.role === 'admin';
  const openedFromSettings = Array.isArray(from) ? from[0] === 'settings' : from === 'settings';
  const showWebSettingsPanel = Platform.OS === 'web' && !isMobile && (openedFromSettings || embeddedInSettings);
  const isWebDesktop = Platform.OS === 'web' && isDesktop;
  const desktopContentWrapStyle = (
    isWebDesktop
      ? ({ width: '100%', maxWidth: showWebSettingsPanel ? 1120 : 720, alignSelf: 'center' } as const)
      : undefined
  );
  const screenOuterStyle = {
    backgroundColor: palette.ground,
    paddingHorizontal: 0,
    paddingVertical: 0,
  } as const;
  const screenInnerStyle = {
    flex: 1,
    backgroundColor: palette.ground,
    ...(showWebSettingsPanel
      ? {
          width: '100%' as const,
          overflow: 'hidden' as const,
        }
      : {}),
  } as const;
  const pendingInvitesFiltered = pendingInvites.filter(
    (invite) => !teamMembers.some(
      (member) => member.email.toLowerCase() === invite.email.toLowerCase()
    )
  );

  useEffect(() => {
    refreshTeamData().catch(() => {});
  }, [refreshTeamData]);

  const resetEditForm = () => {
    setFormName('');
    setFormEmail('');
    setFormRole('staff');
    setFormPassword('');
    setFormError('');
  };

  const resetInviteForm = () => {
    setInviteEmail('');
    setInviteRole('staff');
    setInviteError('');
    setLastCreatedInvite(null);
  };

  const openEditModal = (member: TeamMember) => {
    setFormName(member.name);
    setFormEmail(member.email);
    setFormRole(member.role);
    setFormPassword('');
    setFormError('');
    setEditingMember(member);
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!formName.trim() || !formEmail.trim()) {
      setFormError('Name and email are required');
      return;
    }

    if (!formEmail.includes('@')) {
      setFormError('Invalid email address');
      return;
    }

    const existingMember = teamMembers.find(
      (m) => m.email.toLowerCase() === formEmail.toLowerCase() && m.id !== editingMember?.id
    );
    if (existingMember) {
      setFormError('Email already exists');
      return;
    }

    if (editingMember) {
      await updateTeamMember(editingMember.id, {
        name: formName.trim(),
        email: formEmail.trim(),
        role: formRole,
      });

      if (formPassword.trim()) {
        setUserPassword(formEmail.trim(), formPassword.trim());
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    setShowEditModal(false);
    resetEditForm();
  };

  const handleCreateInvite = async () => {
    if (!inviteEmail.trim()) {
      setInviteError('Email is required');
      return;
    }

    if (!inviteEmail.includes('@')) {
      setInviteError('Invalid email address');
      return;
    }

    const existingMember = teamMembers.find(
      (m) => m.email.toLowerCase() === inviteEmail.toLowerCase()
    );
    if (existingMember) {
      setInviteError('User already exists');
      return;
    }

    // Check for existing pending invite
    const existingInvite = pendingInvitesFiltered.find(
      (i) => i.email.toLowerCase() === inviteEmail.toLowerCase()
    );
    if (existingInvite) {
      setInviteError('An invite already exists for this email');
      return;
    }

    try {
      setIsInviteSubmitting(true);
      const invite = await createInvite(inviteEmail.trim(), inviteRole, currentUser?.name || 'Admin');
      setLastCreatedInvite(invite);
      setInviteEmail(''); // Clear the email field
      refreshTeamData().catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : 'Failed to create invite. Please try again.');
    } finally {
      setIsInviteSubmitting(false);
    }
  };

  const handleCopyInviteCode = async (code: string) => {
    await Clipboard.setStringAsync(code);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Copied', 'Invite code copied to clipboard');
  };

  const handleShareInvite = async (invite: PendingInvite) => {
    try {
      const joinLink = Platform.OS === 'web'
        ? buildTeamInviteLink(invite.inviteCode)
        : Linking.createURL(`/login?invite=${invite.inviteCode}`);

      await Share.share({
        message: `You've been invited to join Fyll ERP as ${roleLabels[invite.role]}!\n\nJoin here: ${joinLink}\n\nInvite code: ${invite.inviteCode}\n\nThis code expires in 7 days.`,
      });
    } catch {
      // User cancelled share
    }
  };

  const handleDelete = (member: TeamMember) => {
    if (member.id === currentUser?.id) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (primaryEmail && member.email.trim().toLowerCase() === primaryEmail) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Primary email', "This is the owner's primary email, so it can't be removed from the team.");
      return;
    }

    const admins = teamMembers.filter((m) => m.role === 'admin');
    if (member.role === 'admin' && admins.length <= 1) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Cannot Remove', 'You cannot remove the last admin.');
      return;
    }

    Alert.alert(
      'Remove Member',
      `Are you sure you want to remove ${member.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            removeTeamMember(member.id);
          },
        },
      ]
    );
  };

  const handleCancelInvite = (invite: PendingInvite) => {
    const executeCancel = () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      cancelInvite(invite.id)
        .then(() => refreshTeamData())
        .catch(() => {
          Alert.alert('Delete failed', 'Could not delete this invite. Please try again.');
        });
    };

    if (Platform.OS === 'web') {
      executeCancel();
      return;
    }

    Alert.alert(
      'Cancel Invite',
      `Cancel invitation for ${invite.email}?`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Cancel Invite',
          style: 'destructive',
          onPress: executeCancel,
        },
      ]
    );
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getTimeRemaining = (expiresAt: string) => {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diff = expires.getTime() - now.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} left`;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} left`;
    return 'Expiring soon';
  };

  if (!isAdmin) {
    return (
      <View className="flex-1" style={screenOuterStyle}>
        <View style={screenInnerStyle}>
        <SafeAreaView className="flex-1" edges={['top']} style={{ backgroundColor: palette.ground }}>
          <LinearGradient pointerEvents="none" colors={[palette.topGlow, palette.topGlowEnd]} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 300 }} />
          <View style={desktopContentWrapStyle}>
            <View
              className="flex-row items-center"
              style={{ minHeight: isMobile ? 66 : 58, paddingHorizontal: showWebSettingsPanel ? 20 : 10, paddingTop: isMobile ? 12 : 4, paddingBottom: 4 }}
            >
              <Pressable
                onPress={goBack}
                className="w-10 h-10 items-center justify-center mr-3 active:opacity-50"
                style={{ borderRadius: 20, backgroundColor: palette.navButton }}
              >
                <ArrowLeft size={18} color={palette.ink} strokeWidth={2.2} />
              </Pressable>
              <Text
                style={{
                  color: palette.ink,
                  fontSize: 17,
                  lineHeight: 21,
                  fontWeight: '600',
                }}
              >
                Team
              </Text>
            </View>
          </View>
          <View className="flex-1 items-center justify-center px-6">
            <View style={{ width: 68, height: 68, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.limeWash, borderWidth: 1, borderColor: palette.limeBorder }}><Shield size={29} color={palette.limeInk} strokeWidth={1.8} /></View>
            <Text style={{ color: palette.ink, fontFamily: 'BricolageGrotesque_700Bold', fontSize: 22, fontWeight: '400' }} className="mt-4">
              Admin Access Required
            </Text>
            <Text style={{ color: palette.muted }} className="text-center mt-2">
              Only administrators can manage team members.
            </Text>
          </View>
        </SafeAreaView>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1" style={screenOuterStyle}>
      <View style={screenInnerStyle}>
      <SafeAreaView className="flex-1" edges={['top']} style={{ backgroundColor: palette.ground }}>
        {!showWebSettingsPanel ? <LinearGradient pointerEvents="none" colors={[palette.topGlow, palette.topGlowEnd]} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 300 }} /> : null}
        {/* Header */}
        <InternalSettingsHeader
          title="Team Members"
          description="Manage workspace access, member roles, and invitations."
          isDesktop={isDesktop}
          onBack={goBack}
          rightElement={isDesktop ? (
            <View style={{ height: 30, paddingHorizontal: 11, borderRadius: 15, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: palette.limeWash, borderWidth: 1, borderColor: palette.limeBorder }}>
              <UserCog size={13} color={palette.limeInk} strokeWidth={2.2} />
              <Text style={{ color: palette.limeInk, fontSize: 11, fontWeight: '700' }}>{teamMembers.length} members</Text>
            </View>
          ) : undefined}
        />

        <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
          <View style={desktopContentWrapStyle}>
            <View className={isWebDesktop ? 'pl-5 pr-7 pt-5' : 'px-5 pt-4'}>
              <View style={{ position: 'relative', overflow: 'hidden', minHeight: isDesktop ? 138 : 156, marginBottom: 14, padding: isDesktop ? 24 : 20, borderRadius: 28, borderWidth: 1, borderColor: palette.edge, backgroundColor: palette.surface, justifyContent: 'center' }}>
                {!isDesktop ? <LinearGradient pointerEvents="none" colors={[palette.limeWash, 'transparent']} start={{ x: 1, y: 0 }} end={{ x: 0.2, y: 1 }} style={{ position: 'absolute', top: -44, right: -36, width: 210, height: 210, borderRadius: 105 }} /> : null}
                <View style={{ position: 'absolute', top: 0, left: 28, right: 28, height: 3, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, backgroundColor: palette.lime }} />
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: palette.faint, fontSize: 10, fontWeight: '700', letterSpacing: 1.15, textTransform: 'uppercase' }}>Workspace access</Text>
                    <Text style={{ color: palette.ink, fontFamily: 'BricolageGrotesque_800ExtraBold', fontSize: 29, lineHeight: 34, letterSpacing: -0.8, marginTop: 2 }}>{teamMembers.length} {teamMembers.length === 1 ? 'member' : 'members'}</Text>
                    <Text style={{ color: palette.faint, fontSize: 12.5, marginTop: 2 }}>{pendingInvitesFiltered.length > 0 ? `${pendingInvitesFiltered.length} invitation${pendingInvitesFiltered.length === 1 ? '' : 's'} pending` : 'Roles and access are up to date'}</Text>
                  </View>
                </View>
              </View>

              <Pressable onPress={() => { resetInviteForm(); setShowInviteModal(true); }} style={({ pressed }) => ({ height: 48, marginBottom: 26, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: palette.lime, opacity: pressed ? 0.78 : 1 })}>
                <Mail size={16} color="#202117" strokeWidth={2.5} />
                <Text style={{ color: '#202117', fontFamily: 'BricolageGrotesque_700Bold', fontWeight: '400', fontSize: 14 }}>Invite team member</Text>
              </Pressable>

              {/* Pending Invites Section */}
              {pendingInvitesFiltered.length > 0 && (
                <View className="mb-6">
                  <Text style={{ color: palette.faint, marginLeft: 6, fontSize: 11, fontWeight: '700', letterSpacing: 1.4 }} className="uppercase mb-3">
                    Pending Invites ({pendingInvitesFiltered.length})
                  </Text>
                  <View style={{ overflow: 'hidden', borderRadius: 26, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.edge }}>
                    {pendingInvitesFiltered.map((invite, index) => (
                      <View
                        key={invite.id}
                        style={{ minHeight: 86, paddingHorizontal: 18, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', borderBottomWidth: index < pendingInvitesFiltered.length - 1 ? 1 : 0, borderBottomColor: palette.edge }}
                      >
                        <View style={{ width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12, backgroundColor: palette.limeWash }}>
                          <Mail size={18} color={palette.limeInk} strokeWidth={2} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text numberOfLines={1} style={{ color: palette.ink, fontSize: 12, fontWeight: '600' }}>{invite.email}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                            <View style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, backgroundColor: `${roleColors[invite.role]}15` }}>
                              <Text style={{ color: roleColors[invite.role], fontSize: 10, fontWeight: '600' }}>{roleLabels[invite.role]}</Text>
                            </View>
                            <View style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, backgroundColor: palette.limeWash }}>
                              <Text style={{ color: palette.limeInk, fontSize: 10, fontWeight: '600' }}>Pending</Text>
                            </View>
                            <Clock size={11} color={palette.faint} strokeWidth={2} />
                            <Text style={{ color: palette.faint, fontSize: 10 }}>{getTimeRemaining(invite.expiresAt)}</Text>
                          </View>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 10 }}>
                          <Pressable onPress={() => handleCopyInviteCode(invite.inviteCode)} className="active:opacity-50" style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}>
                            <Copy size={14} color={palette.faint} strokeWidth={2} />
                          </Pressable>
                          <Pressable onPress={() => handleShareInvite(invite)} className="active:opacity-50" style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}>
                            <Send size={14} color={palette.faint} strokeWidth={2} />
                          </Pressable>
                          <Pressable onPress={() => handleCancelInvite(invite)} className="active:opacity-50" style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}>
                            <Trash2 size={14} color="#EF4444" strokeWidth={2} />
                          </Pressable>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Team Members Section */}
              <Text style={{ color: palette.faint, marginLeft: 6, fontSize: 11, fontWeight: '700', letterSpacing: 1.4 }} className="uppercase mb-3">
                Team Members ({teamMembers.length})
              </Text>
              <View style={{ overflow: 'hidden', borderRadius: 26, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.edge }}>
                {teamMembers.map((member, index) => (
                  <View
                    key={member.id}
                    style={{ minHeight: 86, paddingHorizontal: 18, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', borderBottomWidth: index < teamMembers.length - 1 ? 1 : 0, borderBottomColor: palette.edge }}
                  >
                    <View style={{ width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12, backgroundColor: `${roleColors[member.role]}15` }}>
                      <Text style={{ color: roleColors[member.role], fontSize: 15, fontWeight: '700' }}>{member.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                        <Text numberOfLines={1} style={{ color: palette.ink, fontSize: 12, fontWeight: '600' }}>{member.name}</Text>
                        {member.id === currentUser?.id ? (
                          <View style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, backgroundColor: palette.limeWash }}>
                            <Text style={{ color: palette.limeInk, fontSize: 10, fontWeight: '600' }}>You</Text>
                          </View>
                        ) : null}
                        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, backgroundColor: `${roleColors[member.role]}15` }}>
                          {React.cloneElement(roleIcons[member.role] as React.ReactElement<{ size?: number }>, { size: 11 })}
                          <Text style={{ color: roleColors[member.role], fontSize: 10, fontWeight: '600', marginLeft: 4 }}>{roleLabels[member.role]}</Text>
                        </View>
                      </View>
                      <Text numberOfLines={1} style={{ color: palette.faint, fontSize: 11, marginTop: 5 }}>{member.email} · Last login {formatDate(member.lastLogin)}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 10 }}>
                      <Pressable onPress={() => openEditModal(member)} className="active:opacity-50" style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}>
                        <Edit2 size={14} color={palette.limeInk} strokeWidth={2} />
                      </Pressable>
                      {member.id !== currentUser?.id ? (
                        <Pressable onPress={() => handleDelete(member)} className="active:opacity-50" style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}>
                          <Trash2 size={14} color="#EF4444" strokeWidth={2} />
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
              <View className="h-24" />
            </View>
          </View>
        </ScrollView>

        {/* Invite Modal */}
        <Modal
          visible={showInviteModal}
          transparent
          animationType="fade"
          onRequestClose={() => { setShowInviteModal(false); resetInviteForm(); }}
        >
          <Pressable
            className="flex-1 items-center justify-center px-5"
            style={{ backgroundColor: 'rgba(0,0,0,0.72)' }}
            onPress={() => { setShowInviteModal(false); resetInviteForm(); }}
          >
            <Pressable onPress={() => {}}>
            <View
              className="rounded-3xl px-5 pt-6 pb-6"
              style={{
                backgroundColor: palette.surface,
                width: '100%',
                maxWidth: 520,
                borderWidth: 1,
                borderColor: palette.edge,
              }}
            >
              <View className="flex-row items-center justify-between mb-6">
                <Text style={{ color: palette.ink, fontFamily: 'BricolageGrotesque_700Bold', fontSize: 22, lineHeight: 27, fontWeight: '400' }}>
                  {lastCreatedInvite ? 'Invite Created' : 'Invite Member'}
                </Text>
                <Pressable
                  onPress={() => {
                    setShowInviteModal(false);
                    resetInviteForm();
                  }}
                  className="w-8 h-8 rounded-full items-center justify-center active:opacity-50"
                  style={{ backgroundColor: palette.input }}
                >
                  <X size={18} color={colors.text.tertiary} strokeWidth={2} />
                </Pressable>
              </View>

              {lastCreatedInvite ? (
                // Show invite code after creation
                <View>
                  <View className="items-center mb-6">
                    <View
                      className="w-16 h-16 rounded-full items-center justify-center mb-4"
                      style={{ backgroundColor: 'rgba(34, 197, 94, 0.15)' }}
                    >
                      <Mail size={32} color="#22C55E" strokeWidth={1.5} />
                    </View>
                    <Text style={{ color: colors.text.primary }} className="text-lg font-semibold text-center">
                      Invitation Sent!
                    </Text>
                    <Text style={{ color: colors.text.tertiary }} className="text-sm text-center mt-1">
                      Share this code with {lastCreatedInvite.email}
                    </Text>
                  </View>

                  <View className="rounded-xl p-4 mb-4" style={{ backgroundColor: colors.bg.secondary }}>
                    <Text style={{ color: colors.text.tertiary }} className="text-xs text-center mb-2">Invite Code</Text>
                    <Text style={{ color: colors.text.primary }} className="text-2xl font-bold text-center font-mono tracking-widest">
                      {lastCreatedInvite.inviteCode}
                    </Text>
                  </View>

                  <View className="flex-row gap-3">
                    <Pressable
                      onPress={() => handleCopyInviteCode(lastCreatedInvite.inviteCode)}
                      className="flex-1 flex-row items-center justify-center rounded-full active:opacity-80"
                      style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light, height: 50 }}
                    >
                      <Copy size={18} color={colors.text.primary} strokeWidth={2} />
                      <Text style={{ color: colors.text.primary }} className="font-semibold ml-2">Copy</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleShareInvite(lastCreatedInvite)}
                      className="flex-1 flex-row items-center justify-center rounded-full active:opacity-80"
                      style={[primaryPillButtonStyle, { height: 50 }]}
                    >
                      <Send size={18} color="#202117" strokeWidth={2} />
                      <Text style={primaryPillTextStyle} className="font-semibold ml-2">Share</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                // Invite form
                <View>
                  {/* Email */}
                  <View className="mb-4">
                    <Text style={{ color: colors.text.secondary }} className="text-sm font-medium mb-2">Email Address</Text>
                    <View
                      className="rounded-xl px-4 flex-row items-center"
                      style={{ backgroundColor: palette.input, borderWidth: 1, borderColor: palette.edgeStrong, height: 50 }}
                    >
                      <Mail size={18} color={colors.text.tertiary} strokeWidth={1.5} />
                      <TextInput
                        value={inviteEmail}
                        onChangeText={(text) => {
                          setInviteEmail(text);
                          setInviteError('');
                        }}
                        placeholder="Enter team member's email"
                        placeholderTextColor={colors.input.placeholder}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        style={{ flex: 1, color: colors.input.text, fontSize: 14, marginLeft: 12 }}
                        selectionColor={colors.text.primary}
                      />
                    </View>
                  </View>

                  {/* Role Selection */}
                  <View className="mb-4">
                    <Text style={{ color: colors.text.secondary }} className="text-sm font-medium mb-2">Role</Text>
                    {(['admin', 'manager', 'staff'] as TeamRole[]).map((role) => (
                      <Pressable
                        key={role}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setInviteRole(role);
                        }}
                        className="flex-row items-center p-4 rounded-xl mb-2"
                        style={{
                          backgroundColor: inviteRole === role ? `${roleColors[role]}10` : colors.bg.secondary,
                          borderWidth: inviteRole === role ? 1 : 0,
                          borderColor: roleColors[role],
                        }}
                      >
                        <View
                          className="w-10 h-10 rounded-full items-center justify-center mr-3"
                          style={{ backgroundColor: `${roleColors[role]}15` }}
                        >
                          {role === 'admin' && <Shield size={20} color={roleColors[role]} strokeWidth={2} />}
                          {role === 'manager' && <UserCog size={20} color={roleColors[role]} strokeWidth={2} />}
                          {role === 'staff' && <UserIcon size={20} color={roleColors[role]} strokeWidth={2} />}
                        </View>
                        <View className="flex-1">
                          <Text style={{ color: inviteRole === role ? roleColors[role] : colors.text.primary }} className="font-semibold">
                            {roleLabels[role]}
                          </Text>
                          <Text style={{ color: colors.text.tertiary }} className="text-xs mt-0.5">
                            {roleDescriptions[role]}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>

                  {/* Error */}
                  {inviteError ? (
                    <View className="mb-4 p-3 rounded-xl" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}>
                      <Text className="text-red-500 text-sm text-center">{inviteError}</Text>
                    </View>
                  ) : null}

                  {/* Send Invite Button */}
                  <Pressable
                    onPress={handleCreateInvite}
                    disabled={isInviteSubmitting}
                    className="rounded-full items-center justify-center active:opacity-80"
                    style={[primaryPillButtonStyle, { height: 50, opacity: isInviteSubmitting ? 0.7 : 1 }]}
                  >
                    {isInviteSubmitting ? (
                      <View className="flex-row items-center">
                        <ActivityIndicator color="#202117" />
                        <Text style={primaryPillTextStyle} className="font-semibold ml-2">Creating...</Text>
                      </View>
                    ) : (
                      <Text style={primaryPillTextStyle} className="font-semibold">Send Invite</Text>
                    )}
                  </Pressable>
                </View>
              )}
            </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Edit Modal */}
        <Modal
          visible={showEditModal}
          transparent
          animationType="none"
          onRequestClose={() => { setShowEditModal(false); resetEditForm(); }}
        >
          <Pressable
            className="flex-1 justify-end"
            style={{ backgroundColor: 'rgba(0,0,0,0.72)' }}
            onPress={() => { setShowEditModal(false); resetEditForm(); }}
          >
            <Pressable onPress={() => {}}>
            <View className="rounded-t-3xl px-5 pt-6 pb-10" style={{ backgroundColor: palette.surface, borderTopWidth: 1, borderColor: palette.edge }}>
              <View className="flex-row items-center justify-between mb-6">
                <Text style={{ color: palette.ink, fontFamily: 'BricolageGrotesque_700Bold', fontSize: 22, lineHeight: 27, fontWeight: '400' }}>Edit Member</Text>
                <Pressable
                  onPress={() => {
                    setShowEditModal(false);
                    resetEditForm();
                  }}
                  className="w-8 h-8 rounded-full items-center justify-center active:opacity-50"
                  style={{ backgroundColor: palette.input }}
                >
                  <X size={18} color={colors.text.tertiary} strokeWidth={2} />
                </Pressable>
              </View>

              {/* Name */}
              <View className="mb-4">
                <Text style={{ color: colors.text.secondary }} className="text-sm font-medium mb-2">Name</Text>
                <View
                  className="rounded-xl px-4"
                  style={{ backgroundColor: palette.input, borderWidth: 1, borderColor: palette.edgeStrong, height: 50, justifyContent: 'center' }}
                >
                  <TextInput
                    value={formName}
                    onChangeText={setFormName}
                    placeholder="Enter name"
                    placeholderTextColor={colors.input.placeholder}
                    style={{ color: colors.input.text, fontSize: 14 }}
                    selectionColor={colors.text.primary}
                  />
                </View>
              </View>

              {/* Email */}
              <View className="mb-4">
                <Text style={{ color: colors.text.secondary }} className="text-sm font-medium mb-2">Email</Text>
                <View
                  className="rounded-xl px-4"
                  style={{ backgroundColor: palette.input, borderWidth: 1, borderColor: palette.edgeStrong, height: 50, justifyContent: 'center' }}
                >
                  <TextInput
                    value={formEmail}
                    onChangeText={setFormEmail}
                    placeholder="Enter email"
                    placeholderTextColor={colors.input.placeholder}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    style={{ color: colors.input.text, fontSize: 14 }}
                    selectionColor={colors.text.primary}
                  />
                </View>
              </View>

              {/* Password */}
              <View className="mb-4">
                <Text style={{ color: colors.text.secondary }} className="text-sm font-medium mb-2">New Password (optional)</Text>
                <View
                  className="rounded-xl px-4"
                  style={{ backgroundColor: palette.input, borderWidth: 1, borderColor: palette.edgeStrong, height: 50, flexDirection: 'row', alignItems: 'center' }}
                >
                  <TextInput
                    value={formPassword}
                    onChangeText={setFormPassword}
                    placeholder="Leave blank to keep current"
                    placeholderTextColor={colors.input.placeholder}
                    secureTextEntry={!showFormPassword}
                    style={{ flex: 1, color: colors.input.text, fontSize: 14 }}
                    selectionColor={colors.text.primary}
                  />
                  <PasswordEyeToggle visible={showFormPassword} onToggle={() => setShowFormPassword((v) => !v)} />
                </View>
              </View>

              {/* Role Selection */}
              <View className="mb-4">
                <Text style={{ color: colors.text.secondary }} className="text-sm font-medium mb-2">Role</Text>
                <View className="flex-row gap-2">
                  {(['admin', 'manager', 'staff'] as TeamRole[]).map((role) => (
                    <Pressable
                      key={role}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setFormRole(role);
                      }}
                      className="flex-1 flex-row items-center justify-center py-3 rounded-xl"
                      style={{
                        backgroundColor: formRole === role ? `${roleColors[role]}15` : colors.bg.secondary,
                        borderWidth: formRole === role ? 1 : 0,
                        borderColor: roleColors[role],
                      }}
                    >
                      {roleIcons[role]}
                      <Text
                        style={{ color: formRole === role ? roleColors[role] : colors.text.tertiary }}
                        className="text-sm font-medium ml-1"
                      >
                        {roleLabels[role]}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Error */}
              {formError ? (
                <View className="mb-4 p-3 rounded-xl" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}>
                  <Text className="text-red-500 text-sm text-center">{formError}</Text>
                </View>
              ) : null}

              {/* Save Button */}
              <Pressable
                onPress={handleSaveEdit}
                className="rounded-full items-center justify-center active:opacity-80"
                style={[primaryPillButtonStyle, { height: 50 }]}
              >
                <Text style={primaryPillTextStyle} className="font-semibold">Save Changes</Text>
              </Pressable>
            </View>
            </Pressable>
          </Pressable>
        </Modal>
      </SafeAreaView>
      </View>
    </View>
  );
}
