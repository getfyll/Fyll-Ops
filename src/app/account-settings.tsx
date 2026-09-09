import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, Alert, ScrollView, Platform, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { ArrowLeft, User as UserIcon, Mail, Lock, Save } from 'lucide-react-native';
import { useThemeColors } from '@/lib/theme';
import useAuthStore from '@/lib/state/auth-store';
import * as Haptics from 'expo-haptics';
import { getSettingsWebPanelStyles, isFromSettingsRoute } from '@/lib/settings-web-panel';
import { useSettingsBack } from '@/lib/useSettingsBack';

type AccountSettingsScreenProps = {
  embeddedInSettings?: boolean;
};

export default function AccountSettingsScreen({ embeddedInSettings = false }: AccountSettingsScreenProps) {
  const { from } = useLocalSearchParams<{ from?: string | string[] }>();
  const goBack = useSettingsBack();
  const colors = useThemeColors();
  const isEmbeddedWeb = Platform.OS === 'web' && (isFromSettingsRoute(from) || embeddedInSettings);
  const panelBackgroundColor = colors.bg.primary;
  const panelStyles = getSettingsWebPanelStyles(
    isEmbeddedWeb,
    panelBackgroundColor,
    colors.border.light
  );
  const currentUser = useAuthStore((s) => s.currentUser);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const updatePassword = useAuthStore((s) => s.updatePassword);

  const [name, setName] = useState(currentUser?.name || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const primaryPillButtonStyle: ViewStyle = {
    backgroundColor: colors.text.primary,
    height: 56,
    borderRadius: 999,
    opacity: isLoading ? 0.7 : 1,
    ...(isEmbeddedWeb ? { width: '20%', minWidth: 220, alignSelf: 'flex-start' } : {}),
  };
  const primaryPillTextStyle = {
    color: colors.bg.primary,
  } as const;
  const fieldBorderColor = isEmbeddedWeb ? colors.border.light : colors.input.border;

  const handleUpdateProfile = async () => {
    if (!name.trim() || !email.trim()) {
      setError('Name and email are required');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (!email.includes('@')) {
      setError('Invalid email address');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await updateProfile(name.trim(), email.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Success', 'Profile updated successfully');
    } catch {
      setError('Failed to update profile');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('All password fields are required');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const result = await updatePassword(currentPassword, newPassword);
      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Success', 'Password updated successfully');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setError(result.error || 'Failed to update password');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch {
      setError('Failed to update password');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={panelStyles.outer}>
      <View style={panelStyles.inner}>
      <SafeAreaView className="flex-1" edges={['top']}>
        {/* Header */}
        <View
          className="px-5 pt-4 pb-3 flex-row items-center"
          style={{
            borderBottomWidth: 1,
            borderBottomColor: colors.border.light,
            ...(Platform.OS === 'web' ? { paddingHorizontal: 24, paddingTop: 10, paddingBottom: 10 } : {}),
          }}
        >
          <Pressable
            onPress={goBack}
            className="w-10 h-10 items-center justify-center mr-3 active:opacity-50"
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
            Account Settings
          </Text>
        </View>

        <ScrollView
          className="flex-1 px-5 pt-6"
          contentContainerStyle={isEmbeddedWeb ? { paddingHorizontal: 12, paddingBottom: 64 } : undefined}
          showsVerticalScrollIndicator={false}
        >
          {/* Profile Picture */}
          {currentUser && (
            <View className="items-center mb-8">
              <View
                className="w-24 h-24 rounded-full items-center justify-center mb-3"
                style={{ backgroundColor: currentUser.role === 'admin' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.15)' }}
              >
                <Text style={{ color: currentUser.role === 'admin' ? '#EF4444' : '#3B82F6' }} className="text-4xl font-bold">
                  {currentUser.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View
                className="px-3 py-1.5 rounded-full"
                style={{ backgroundColor: currentUser.role === 'admin' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.15)' }}
              >
                <Text style={{ color: currentUser.role === 'admin' ? '#EF4444' : '#3B82F6' }} className="text-sm font-medium capitalize">
                  {currentUser.role}
                </Text>
              </View>
            </View>
          )}

          {/* Profile Information */}
          <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase mb-3 tracking-wider">
            Profile Information
          </Text>

          <View className="mb-4">
            <Text style={{ color: colors.text.secondary }} className="text-sm font-medium mb-2">Name</Text>
            <View
              className="flex-row items-center rounded-xl px-4"
              style={{
                backgroundColor: colors.input.bg,
                borderWidth: 1,
                borderColor: fieldBorderColor,
                height: 56,
              }}
            >
              <UserIcon size={20} color={colors.text.tertiary} strokeWidth={1.5} />
              <TextInput
                value={name}
                onChangeText={(text) => {
                  setName(text);
                  setError('');
                }}
                placeholder="Your name"
                placeholderTextColor={colors.input.placeholder}
                style={{ flex: 1, color: colors.input.text, fontSize: 16, marginLeft: 12 }}
                selectionColor={colors.text.primary}
              />
            </View>
          </View>

          <View className="mb-4">
            <Text style={{ color: colors.text.secondary }} className="text-sm font-medium mb-2">Email</Text>
            <View
              className="flex-row items-center rounded-xl px-4"
              style={{
                backgroundColor: colors.input.bg,
                borderWidth: 1,
                borderColor: fieldBorderColor,
                height: 56,
              }}
            >
              <Mail size={20} color={colors.text.tertiary} strokeWidth={1.5} />
              <TextInput
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  setError('');
                }}
                placeholder="your@email.com"
                placeholderTextColor={colors.input.placeholder}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                style={{ flex: 1, color: colors.input.text, fontSize: 16, marginLeft: 12 }}
                selectionColor={colors.text.primary}
              />
            </View>
          </View>

          {error && (
            <View className="mb-4 p-3 rounded-xl" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}>
              <Text className="text-red-500 text-sm text-center">{error}</Text>
            </View>
          )}

          <Pressable
            onPress={handleUpdateProfile}
            disabled={isLoading}
            className="rounded-full items-center justify-center active:opacity-80 flex-row mb-8"
            style={primaryPillButtonStyle}
          >
            <Save size={20} color={colors.bg.primary} strokeWidth={2} />
            <Text style={primaryPillTextStyle} className="font-semibold text-base ml-2">Save Profile</Text>
          </Pressable>

          {/* Change Password */}
          <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase mb-3 tracking-wider">
            Change Password
          </Text>

          <View className="mb-4">
            <Text style={{ color: colors.text.secondary }} className="text-sm font-medium mb-2">Current Password</Text>
            <View
              className="flex-row items-center rounded-xl px-4"
              style={{
                backgroundColor: colors.input.bg,
                borderWidth: 1,
                borderColor: fieldBorderColor,
                height: 56,
              }}
            >
              <Lock size={20} color={colors.text.tertiary} strokeWidth={1.5} />
              <TextInput
                value={currentPassword}
                onChangeText={(text) => {
                  setCurrentPassword(text);
                  setError('');
                }}
                placeholder="Enter current password"
                placeholderTextColor={colors.input.placeholder}
                secureTextEntry
                style={{ flex: 1, color: colors.input.text, fontSize: 16, marginLeft: 12 }}
                selectionColor={colors.text.primary}
              />
            </View>
          </View>

          <View className="mb-4">
            <Text style={{ color: colors.text.secondary }} className="text-sm font-medium mb-2">New Password</Text>
            <View
              className="flex-row items-center rounded-xl px-4"
              style={{
                backgroundColor: colors.input.bg,
                borderWidth: 1,
                borderColor: fieldBorderColor,
                height: 56,
              }}
            >
              <Lock size={20} color={colors.text.tertiary} strokeWidth={1.5} />
              <TextInput
                value={newPassword}
                onChangeText={(text) => {
                  setNewPassword(text);
                  setError('');
                }}
                placeholder="Enter new password"
                placeholderTextColor={colors.input.placeholder}
                secureTextEntry
                style={{ flex: 1, color: colors.input.text, fontSize: 16, marginLeft: 12 }}
                selectionColor={colors.text.primary}
              />
            </View>
          </View>

          <View className="mb-4">
            <Text style={{ color: colors.text.secondary }} className="text-sm font-medium mb-2">Confirm New Password</Text>
            <View
              className="flex-row items-center rounded-xl px-4"
              style={{
                backgroundColor: colors.input.bg,
                borderWidth: 1,
                borderColor: fieldBorderColor,
                height: 56,
              }}
            >
              <Lock size={20} color={colors.text.tertiary} strokeWidth={1.5} />
              <TextInput
                value={confirmPassword}
                onChangeText={(text) => {
                  setConfirmPassword(text);
                  setError('');
                }}
                placeholder="Confirm new password"
                placeholderTextColor={colors.input.placeholder}
                secureTextEntry
                style={{ flex: 1, color: colors.input.text, fontSize: 16, marginLeft: 12 }}
                selectionColor={colors.text.primary}
              />
            </View>
          </View>

          <Pressable
            onPress={handleUpdatePassword}
            disabled={isLoading}
            className="rounded-full items-center justify-center active:opacity-80 flex-row"
            style={primaryPillButtonStyle}
          >
            <Lock size={20} color={colors.bg.primary} strokeWidth={2} />
            <Text style={primaryPillTextStyle} className="font-semibold text-base ml-2">Update Password</Text>
          </Pressable>

          <View className="h-24" />
        </ScrollView>
      </SafeAreaView>
      </View>
    </View>
  );
}
