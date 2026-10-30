import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import { captureStoryImage } from '@/lib/milestone-capture';
import type { MilestoneStorySpec } from '@/components/milestones/MilestoneStoryCard';

const isMobileWeb = () =>
  Platform.OS === 'web' && typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// On the web the business logo is fetched into a data URI first, so the screenshot is not blocked by cross-origin images.
export const prepareLogoForCapture = async (logo: string | null): Promise<string | null> => {
  if (!logo || Platform.OS !== 'web' || logo.startsWith('data:')) return logo;
  try {
    const response = await fetch(logo);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Could not read logo.'));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

// Mobile: opens the native share sheet with the image. Desktop web: downloads it.
// Resolves true once the share sheet closed or the download started.
export const shareMilestoneStory = async (target: unknown, spec: MilestoneStorySpec): Promise<boolean> => {
  const milestone = spec.milestone;
  const fileName = `fyll-${milestone}-orders.png`;

  if (Platform.OS === 'web') {
    const dataUri = await captureStoryImage(target, spec);

    if (isMobileWeb() && typeof navigator !== 'undefined' && 'share' in navigator) {
      const blob = await (await fetch(dataUri)).blob();
      const file = new File([blob], fileName, { type: 'image/png' });
      const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
      if (nav.canShare?.({ files: [file] })) {
        try {
          await nav.share({ files: [file], title: `${milestone} orders on Fyll` });
          return true;
        } catch (error) {
          if ((error as Error)?.name === 'AbortError') return false;
        }
      }
    }

    const link = document.createElement('a');
    link.href = dataUri;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  }

  const uri = await captureStoryImage(target, spec);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share to Story', UTI: 'public.png' });
  return true;
};
