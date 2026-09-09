import { useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const getProjectId = () => (
  Constants.expoConfig?.extra?.eas?.projectId
  ?? (Constants as any).easConfig?.projectId
  ?? null
);

let registeredTokenForUser: string | null = null;

export function useExpoPushNotifications() {
  const registerForUser = useCallback(async (userId: string, businessId: string) => {
    if (Platform.OS === 'web') return;
    if (!Device.isDevice) return;
    if (!userId || !businessId) return;
    if (registeredTokenForUser === userId) return;

    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') return;

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
        });
      }

      const projectId = getProjectId();
      const tokenResponse = projectId
        ? await Notifications.getExpoPushTokenAsync({ projectId })
        : await Notifications.getExpoPushTokenAsync();
      const expoPushToken = tokenResponse.data;
      if (!expoPushToken) return;

      const { error } = await supabase
        .from('expo_push_tokens')
        .upsert(
          {
            business_id: businessId,
            user_id: userId,
            expo_push_token: expoPushToken,
            platform: Platform.OS,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,expo_push_token' }
        );

      if (error) {
        console.warn('[ExpoPush] Failed to save push token:', error.message);
        return;
      }

      registeredTokenForUser = userId;
    } catch (err) {
      console.warn('[ExpoPush] registration error:', err);
    }
  }, []);

  const clearRegistration = useCallback(() => {
    registeredTokenForUser = null;
  }, []);

  return { registerForUser, clearRegistration };
}

export function useExpoPushRegistration(userId: string | null, businessId: string | null) {
  const { registerForUser } = useExpoPushNotifications();

  useEffect(() => {
    if (!userId || !businessId) return;
    void registerForUser(userId, businessId);
  }, [userId, businessId, registerForUser]);
}
