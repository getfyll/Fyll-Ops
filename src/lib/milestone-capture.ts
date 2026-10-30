import { captureRef } from 'react-native-view-shot';
import { STORY_HEIGHT, STORY_WIDTH, type MilestoneStorySpec } from '@/components/milestones/MilestoneStoryCard';

// Phones: the card (a native view) becomes a 1080x1920 PNG file. The spec is only used by the web version.
export const captureStoryImage = (target: unknown, _spec: MilestoneStorySpec): Promise<string> =>
  captureRef(target as never, { format: 'png', quality: 1, result: 'tmpfile', width: STORY_WIDTH, height: STORY_HEIGHT });
