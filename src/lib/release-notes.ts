import releaseNotes from '@/data/release-notes.json';

export type ReleaseIcon = 'zap' | 'package' | 'home' | 'sparkles' | 'truck' | 'share';

export type ReleaseFeature = { icon: ReleaseIcon; title: string; body: string };

export type Release = {
  version: string;
  // When it shipped (ISO). Shown as "2h ago" in the bell.
  date?: string;
  features: ReleaseFeature[];
  fixes: string[];
};

// Newest first. Add a new entry at the top of src/data/release-notes.json for every release;
// the build also publishes that file as /release-notes.json so open tabs can detect a new version.
export const RELEASES: Release[] = (releaseNotes as { releases: Release[] }).releases;

export const CURRENT_RELEASE: Release = RELEASES[0];

export const compareVersions = (a: string, b: string): number => {
  const pa = a.split('.').map((part) => parseInt(part, 10) || 0);
  const pb = b.split('.').map((part) => parseInt(part, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
};
