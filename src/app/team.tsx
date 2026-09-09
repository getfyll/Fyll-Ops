import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Modal, Share, Alert, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Trash2, Edit2, User as UserIcon, Shield, X, Mail, Clock, Copy, Send, UserCog } from 'lucide-react-native';
import { useThemeColors } from '@/lib/theme';
import useAuthStore, { TeamMember, TeamRole, PendingInvite } from '@/lib/state/auth-store';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useSettingsBack } from '@/lib/useSettingsBack';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { buildTeamInviteLink } from '@/lib/fyll-app-url';

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

export default function TeamManagementScreen() {
  const { from } = useLocalSearchParams<{ from?: string | string[] }>();
  const goBack = useSettingsBack();
  const colors = useThemeColors();
  const { isDesktop } = useBreakpoint();
  const primaryPillButtonStyle = {
    backgroundColor: colors.text.primary,
    borderRadius: 999,
  } as const;
  const primaryPillTextStyle = {
    color: colors.bg.primary,
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

  const [showEditModal, setShowEditModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [lastCreatedInvite, setLastCreatedInvite] = useState<PendingInvite | null>(null);

  // Edit form state
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formRole, setFormRole] = useState<TeamRole>('staff');
  const [formPassword, setFormPassword] = useState('');
  const [formError, setFormError] = useState('');

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<TeamRole>('staff');
  const [inviteError, setInviteError] = useState('');
  const [isInviteSubmitting, setIsInviteSubmitting] = useState(false);

  const isAdmin = currentUser?.role === 'admin';
  const openedFromSettings = Array.isArray(from) ? from[0] === 'settings' : from === 'settings';
  const showWebSettingsPanel = Platform.OS === 'web' && openedFromSettings;
  const isWebDesktop = Platform.OS === 'web' && isDesktop;
  const desktopContentWrapStyle = (
    isWebDesktop
      ? ({ width: '100%', maxWidth: 1440, alignSelf: 'flex-start' } as const)
      : undefined
  );
  const screenOuterStyle = {
    backgroundColor: colors.bg.primary,
    paddingHorizontal: 0,
    paddingVertical: 0,
  } as const;
  const screenInnerStyle = {
    flex: 1,
    backgroundColor: colors.bg.primary,
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
        <SafeAreaView className="flex-1" edges={['top']}>
          <View style={desktopContentWrapStyle}>
            <View
              className={isWebDesktop ? 'pl-5 pr-7 pt-4 pb-3 flex-row items-center' : 'px-5 pt-4 pb-3 flex-row items-center'}
              style={isWebDesktop ? { paddingTop: 10, paddingBottom: 10 } : undefined}
            >
              <Pressable
                onPress={goBack}
                className="w-10 h-10 rounded-xl items-center justify-center mr-3 active:opacity-50"
                style={{ backgroundColor: 'transparent' }}
              >
                <ArrowLeft size={20} color={colors.text.primary} strokeWidth={2} />
              </Pressable>
              <Text
                style={{
                  color: colors.text.primary,
                  fontSize: Platform.OS === 'web' ? 14 : 20,
                  lineHeight: Platform.OS === 'web' ? 18 : 24,
                  fontWeight: '600',
                }}
              >
                Team
              </Text>
            </View>
          </View>
          <View className="flex-1 items-center justify-center px-6">
            <Shield size={48} color={colors.text.tertiary} strokeWidth={1.5} />
            <Text style={{ color: colors.text.primary }} className="text-lg font-semibold mt-4">
              Admin Access Required
            </Text>
            <Text style={{ color: colors.text.tertiary }} className="text-center mt-2">
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
      <SafeAreaView className="flex-1" edges={['top']}>
        {/* Header */}
        <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
          <View style={desktopContentWrapStyle}>
            <View
              className={isWebDesktop ? 'pl-5 pr-7 pt-4 pb-3 flex-row items-center justify-between' : 'px-5 pt-4 pb-3 flex-row items-center justify-between'}
              style={isWebDesktop ? { paddingTop: 10, paddingBottom: 10 } : undefined}
            >
              <View className="flex-row items-center">
                <Pressable
                  onPress={goBack}
                  className="w-10 h-10 rounded-xl items-center justify-center mr-3 active:opacity-50"
                  style={{ backgroundColor: 'transparent' }}
                >
                  <ArrowLeft size={20} color={colors.text.primary} strokeWidth={2} />
                </Pressable>
                <View>
                  <Text
                    style={{
                      color: colors.text.primary,
                      fontSize: Platform.OS === 'web' ? 14 : 20,
                      lineHeight: Platform.OS === 'web' ? 18 : 24,
                      fontWeight: '600',
                    }}
                  >
                    Team
                  </Text>
                  <Text style={{ color: colors.text.tertiary }} className="text-xs">{teamMembers.length} members</Text>
                </View>
              </View>
              <Pressable
                onPress={() => {
                  resetInviteForm();
                  setShowInviteModal(true);
                }}
                className="flex-row items-center px-4 rounded-full active:opacity-80"
                style={[primaryPillButtonStyle, { height: 42 }]}
              >
                <Mail size={16} color={colors.bg.primary} strokeWidth={2} />
                <Text style={primaryPillTextStyle} className="font-semibold ml-2 text-sm">Invite</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
          <View style={desktopContentWrapStyle}>
            <View className={isWebDesktop ? 'pl-5 pr-7 pt-4' : 'px-5 pt-4'}>
              {/* Pending Invites Section */}
              {pendingInvitesFiltered.length > 0 && (
                <View className="mb-6">
                  <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase mb-3 tracking-wider">
                    Pending Invites ({pendingInvitesFiltered.length})
                  </Text>
                  {pendingInvitesFiltered.map((invite) => (
                    <View
                      key={invite.id}
                      className="rounded-xl p-4 mb-3"
                      style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
                    >
                      <View className="flex-row items-center">
                        <View
                          className="w-10 h-10 rounded-full items-center justify-center mr-3"
                          style={{ backgroundColor: colors.bg.secondary }}
                        >
                          <Mail size={18} color={colors.text.tertiary} strokeWidth={2} />
                        </View>
                        <View className="flex-1">
                      <Text style={{ color: colors.text.primary }} className="font-medium text-sm">
                        {invite.email}
                      </Text>
                      <View className="flex-row items-center mt-1">
                        <View
                          className="flex-row items-center px-2 py-0.5 rounded-full mr-2"
                          style={{ backgroundColor: `${roleColors[invite.role]}15` }}
                        >
                          <Text style={{ color: roleColors[invite.role] }} className="text-xs font-medium">
                            {roleLabels[invite.role]}
                          </Text>
                        </View>
                        <View
                          className="flex-row items-center px-2 py-0.5 rounded-full mr-2"
                          style={{ backgroundColor: '#FEF3C7' }}
                        >
                          <Text style={{ color: '#92400E' }} className="text-xs font-medium">
                            Pending
                          </Text>
                        </View>
                        <Clock size={12} color={colors.text.muted} strokeWidth={2} />
                        <Text style={{ color: colors.text.muted }} className="text-xs ml-1">
                          {getTimeRemaining(invite.expiresAt)}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View className="flex-row items-center mt-3 pt-3" style={{ borderTopWidth: 1, borderTopColor: colors.border.light }}>
                    <View className="flex-1 flex-row items-center mr-2 px-3 py-2 rounded-lg" style={{ backgroundColor: colors.bg.secondary }}>
                      <Text style={{ color: colors.text.secondary }} className="text-xs font-mono flex-1">
                        {invite.inviteCode}
                      </Text>
                      <Pressable onPress={() => handleCopyInviteCode(invite.inviteCode)} className="active:opacity-50">
                        <Copy size={14} color={colors.text.tertiary} strokeWidth={2} />
                      </Pressable>
                    </View>
                    <Pressable
                      onPress={() => handleShareInvite(invite)}
                      className="p-2 rounded-lg mr-1 active:opacity-50"
                      style={{ backgroundColor: colors.bg.secondary }}
                    >
                      <Send size={16} color={colors.text.tertiary} strokeWidth={2} />
                    </Pressable>
                    <Pressable
                      onPress={() => handleCancelInvite(invite)}
                      className="p-2 rounded-lg active:opacity-50"
                      style={{ backgroundColor: colors.bg.secondary }}
                    >
                      <Trash2 size={16} color="#EF4444" strokeWidth={2} />
                    </Pressable>
                    <Text style={{ color: colors.text.muted }} className="text-xs ml-2">
                      Delete
                    </Text>
                  </View>
                    </View>
                  ))}
                </View>
              )}

              {/* Team Members Section */}
              <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase mb-3 tracking-wider">
                Team Members ({teamMembers.length})
              </Text>
              {teamMembers.map((member) => (
                <View
                  key={member.id}
                  className="rounded-xl p-4 mb-3"
                  style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
                >
                  <View className="flex-row items-center">
                    <View
                      className="w-12 h-12 rounded-full items-center justify-center mr-3"
                      style={{ backgroundColor: `${roleColors[member.role]}15` }}
                    >
                      <Text style={{ color: roleColors[member.role] }} className="text-lg font-bold">
                        {member.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <View className="flex-row items-center">
                        <Text style={{ color: colors.text.primary }} className="font-semibold text-base mr-2">
                          {member.name}
                        </Text>
                        {member.id === currentUser?.id && (
                          <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: colors.bg.secondary }}>
                            <Text style={{ color: colors.text.tertiary }} className="text-xs">You</Text>
                          </View>
                        )}
                      </View>
                      <Text style={{ color: colors.text.tertiary }} className="text-sm">{member.email}</Text>
                    </View>
                    <View
                      className="flex-row items-center px-2 py-1 rounded-full"
                      style={{ backgroundColor: `${roleColors[member.role]}15` }}
                    >
                      {roleIcons[member.role]}
                      <Text style={{ color: roleColors[member.role] }} className="text-xs font-medium ml-1">
                        {roleLabels[member.role]}
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row items-center justify-between mt-3 pt-3" style={{ borderTopWidth: 1, borderTopColor: colors.border.light }}>
                    <Text style={{ color: colors.text.muted }} className="text-xs">
                      Last login: {formatDate(member.lastLogin)}
                    </Text>
                    <View className="flex-row">
                      <Pressable
                        onPress={() => openEditModal(member)}
                        className="p-2 rounded-lg mr-1 active:opacity-50"
                        style={{ backgroundColor: colors.bg.secondary }}
                      >
                        <Edit2 size={16} color={colors.text.tertiary} strokeWidth={2} />
                      </Pressable>
                      {member.id !== currentUser?.id && (
                        <Pressable
                          onPress={() => handleDelete(member)}
                          className="p-2 rounded-lg active:opacity-50"
                          style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}
                        >
                          <Trash2 size={16} color="#EF4444" strokeWidth={2} />
                        </Pressable>
                      )}
                    </View>
                  </View>
                </View>
              ))}
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
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
            onPress={() => { setShowInviteModal(false); resetInviteForm(); }}
          >
            <Pressable onPress={() => {}}>
            <View
              className="rounded-3xl px-5 pt-6 pb-6"
              style={{
                backgroundColor: colors.bg.primary,
                width: '100%',
                maxWidth: 520,
                borderWidth: 1,
                borderColor: colors.border.light,
              }}
            >
              <View className="flex-row items-center justify-between mb-6">
                <Text style={{ color: colors.text.primary, fontSize: 14, lineHeight: 18, fontWeight: '600' }}>
                  {lastCreatedInvite ? 'Invite Created' : 'Invite Member'}
                </Text>
                <Pressable
                  onPress={() => {
                    setShowInviteModal(false);
                    resetInviteForm();
                  }}
                  className="w-8 h-8 rounded-full items-center justify-center active:opacity-50"
                  style={{ backgroundColor: colors.bg.secondary }}
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
                      <Send size={18} color={colors.bg.primary} strokeWidth={2} />
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
                      style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light, height: 50 }}
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
                        <ActivityIndicator color={colors.bg.primary} />
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
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
            onPress={() => { setShowEditModal(false); resetEditForm(); }}
          >
            <Pressable onPress={() => {}}>
            <View className="rounded-t-3xl px-5 pt-6 pb-10" style={{ backgroundColor: colors.bg.primary }}>
              <View className="flex-row items-center justify-between mb-6">
                <Text style={{ color: colors.text.primary, fontSize: 14, lineHeight: 18, fontWeight: '600' }}>Edit Member</Text>
                <Pressable
                  onPress={() => {
                    setShowEditModal(false);
                    resetEditForm();
                  }}
                  className="w-8 h-8 rounded-full items-center justify-center active:opacity-50"
                  style={{ backgroundColor: colors.bg.secondary }}
                >
                  <X size={18} color={colors.text.tertiary} strokeWidth={2} />
                </Pressable>
              </View>

              {/* Name */}
              <View className="mb-4">
                <Text style={{ color: colors.text.secondary }} className="text-sm font-medium mb-2">Name</Text>
                <View
                  className="rounded-xl px-4"
                  style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light, height: 50, justifyContent: 'center' }}
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
                  style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light, height: 50, justifyContent: 'center' }}
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
                  style={{ backgroundColor: colors.input.bg, borderWidth: 1, borderColor: colors.border.light, height: 50, justifyContent: 'center' }}
                >
                  <TextInput
                    value={formPassword}
                    onChangeText={setFormPassword}
                    placeholder="Leave blank to keep current"
                    placeholderTextColor={colors.input.placeholder}
                    secureTextEntry
                    style={{ color: colors.input.text, fontSize: 14 }}
                    selectionColor={colors.text.primary}
                  />
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
