import { createContext, createElement, useCallback, useContext, type ReactNode } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

const SettingsBackOverrideContext = createContext<(() => void) | null>(null);

export function SettingsBackOverrideProvider({
  children,
  onBack,
}: {
  children: ReactNode;
  onBack: () => void;
}) {
  return createElement(SettingsBackOverrideContext.Provider, { value: onBack }, children);
}

export function useSettingsBack() {
  const router = useRouter();
  const overrideBack = useContext(SettingsBackOverrideContext);
  const { from, panel, menu } = useLocalSearchParams<{ from?: string | string[]; panel?: string | string[]; menu?: string | string[] }>();

  const fromValue = Array.isArray(from) ? from[0] : from;
  const panelValue = Array.isArray(panel) ? panel[0] : panel;
  const menuValue = Array.isArray(menu) ? menu[0] : menu;

  return useCallback(() => {
    if (overrideBack) {
      overrideBack();
      return;
    }

    if (fromValue === 'settings' || Boolean(panelValue)) {
      if (menuValue) {
        router.replace({ pathname: '/settings', params: { menu: menuValue } } as never);
        return;
      }
      router.replace('/settings');
      return;
    }
    router.back();
  }, [fromValue, menuValue, overrideBack, panelValue, router]);
}
