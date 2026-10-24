import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { storage } from '@/lib/storage';
import useWhatsNewStore from '@/lib/state/whats-new-store';
import { CURRENT_RELEASE, compareVersions, type Release } from '@/lib/release-notes';

// v2: the first release is shown to everyone once, so earlier silent records are ignored.
const LAST_SEEN_KEY = 'fyll_last_seen_version_v2';
const CHECK_INTERVAL_MS = 10 * 60 * 1000;

export type WhatsNewState = {
  // 'update' = a newer version is live and this tab still runs the old one (button reloads).
  // 'seen' = this tab already runs the new version, show what changed once (button closes).
  mode: 'update' | 'seen';
  release: Release;
};

export function useWhatsNew(enabled: boolean) {
  const [state, setStateRaw] = useState<WhatsNewState | null>(null);
  const setAvailable = useWhatsNewStore((s) => s.setAvailable);
  const openToken = useWhatsNewStore((s) => s.openToken);
  const available = useWhatsNewStore((s) => s.available);

  // Showing a release also records it for the bell, so "Later" does not lose it.
  const setState = useCallback((next: WhatsNewState | null | ((current: WhatsNewState | null) => WhatsNewState | null)) => {
    setStateRaw((current) => {
      const resolved = typeof next === 'function' ? next(current) : next;
      if (resolved) setAvailable(resolved);
      return resolved;
    });
  }, [setAvailable]);

  // The bell asked to open the modal again.
  useEffect(() => {
    if (openToken > 0) setStateRaw(available ?? { mode: 'seen', release: CURRENT_RELEASE });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openToken]);

  // Preview helper: open the app with ?whatsnew=update or ?whatsnew=seen to see either modal without a release.
  useEffect(() => {
    if (!enabled || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const preview = new URLSearchParams(window.location.search).get('whatsnew');
    if (preview === 'update') {
      const next = CURRENT_RELEASE.version.split('.').map((part, i) => (i === 2 ? Number(part) + 1 : part)).join('.');
      setState({ mode: 'update', release: { ...CURRENT_RELEASE, version: next } });
    } else if (preview === 'seen') {
      setState({ mode: 'seen', release: CURRENT_RELEASE });
    }
  }, [enabled]);

  // On login or a new session, show the notes over the main screen until the person presses Continue.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const lastSeen = await storage.getItem(LAST_SEEN_KEY);
        if (cancelled) return;
        if (!lastSeen || compareVersions(CURRENT_RELEASE.version, lastSeen) > 0) {
          setState((current) => current ?? { mode: 'seen', release: CURRENT_RELEASE });
        }
      } catch {
        // Notes are a nicety; never block the app.
      }
    })();
    return () => { cancelled = true; };
  }, [enabled]);

  // Web only: ask the server which version is live and offer a refresh when this tab is behind.
  useEffect(() => {
    if (!enabled || Platform.OS !== 'web' || typeof document === 'undefined') return;
    let cancelled = false;
    const check = async () => {
      try {
        const response = await fetch(`/release-notes.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok || !(response.headers.get('content-type') ?? '').includes('json')) return;
        const data = (await response.json()) as { releases?: Release[] };
        const latest = data.releases?.[0];
        if (cancelled || !latest?.version) return;
        if (compareVersions(latest.version, CURRENT_RELEASE.version) > 0) {
          setState({ mode: 'update', release: latest });
        }
      } catch {
        // Offline or no file (local dev): skip quietly.
      }
    };
    const first = setTimeout(check, 4000);
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled]);

  const dismiss = useCallback(() => {
    const version = state?.release.version ?? CURRENT_RELEASE.version;
    // Only remember a version this tab is actually running; a skipped update shows its notes after the next refresh.
    if (state?.mode === 'seen') {
      storage.setItem(LAST_SEEN_KEY, version).catch(() => {});
      setAvailable(null);
    }
    setStateRaw(null);
  }, [state, setAvailable]);

  const applyUpdate = useCallback(() => {
    if (!state) return;
    // The reloaded tab will run this version, so mark it seen to avoid showing the notes twice.
    Promise.resolve(storage.setItem(LAST_SEEN_KEY, state.release.version))
      .catch(() => {})
      .finally(() => {
        if (typeof window !== 'undefined') window.location.reload();
      });
  }, [state]);

  return { state, dismiss, applyUpdate };
}
