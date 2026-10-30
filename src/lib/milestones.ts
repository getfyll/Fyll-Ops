// Order milestones: 100, 500, 1,000, 1,500, then every 500 (2,000, 2,500, 3,000 ...).
// The same rule lives in the database (public.milestones_up_to / public.next_milestone); keep them in step.

const FIRST_MILESTONE = 100;
const STEP = 500;

export const milestonesUpTo = (count: number): number[] => {
  const total = Math.floor(count);
  const reached: number[] = [];
  if (!Number.isFinite(total) || total < FIRST_MILESTONE) return reached;
  reached.push(FIRST_MILESTONE);
  for (let value = STEP; value <= total; value += STEP) reached.push(value);
  return reached;
};

// The first milestone greater than `count`.
export const nextMilestone = (count: number): number => {
  const total = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
  if (total < FIRST_MILESTONE) return FIRST_MILESTONE;
  if (total < STEP) return STEP;
  return (Math.floor(total / STEP) + 1) * STEP;
};

// The milestone just below `value`, where the progress bar starts (0 before the first one).
export const previousMilestone = (value: number): number => {
  if (value <= FIRST_MILESTONE) return 0;
  if (value <= STEP) return FIRST_MILESTONE;
  return value - STEP;
};

export const formatMilestoneNumber = (value: number): string => Math.round(value).toLocaleString('en-US');

// 0..1: how far `count` is from the milestone before `next` to `next`.
export const milestoneProgress = (count: number, next: number): number => {
  const start = previousMilestone(next);
  const span = next - start;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (count - start) / span));
};
