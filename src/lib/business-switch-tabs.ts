import { Platform } from 'react-native';

export const BUSINESS_SWITCH_EVENT = 'fyll-business-switch-event';

export function publishBusinessSwitch(phase: 'starting' | 'finished') {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  // Contains no credentials. Other tabs pause until the replacement session exists.
  try {
    window.localStorage.setItem(BUSINESS_SWITCH_EVENT, JSON.stringify({ phase, at: Date.now() }));
  } catch {
    // Switching can still complete in the active tab if browser storage events are unavailable.
  }
}

export function isAnotherTabSwitching() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  try {
    const event = JSON.parse(window.localStorage.getItem(BUSINESS_SWITCH_EVENT) ?? 'null');
    return event?.phase === 'starting' && Date.now() - event.at < 30000;
  } catch { return false; }
}
