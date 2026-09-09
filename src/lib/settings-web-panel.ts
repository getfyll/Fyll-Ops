import { Platform, type ViewStyle } from 'react-native';

export const isFromSettingsRoute = (from?: string | string[]) =>
  (Array.isArray(from) ? from[0] : from) === 'settings';

export const getSettingsWebPanelStyles = (
  enabled: boolean,
  backgroundColor: string,
  borderColor: string
): { outer: ViewStyle; inner: ViewStyle } => {
  const active = Platform.OS === 'web' && enabled;

  return {
    outer: {
      flex: 1,
      backgroundColor,
      paddingHorizontal: 0,
      paddingVertical: 0,
    },
    inner: {
      flex: 1,
      backgroundColor,
      ...(active
        ? {
            width: '100%' as const,
            overflow: 'hidden' as const,
          }
        : {}),
    },
  };
};
