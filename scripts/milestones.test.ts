import { describe, expect, test } from 'bun:test';
import { formatMilestoneNumber, milestoneProgress, milestonesUpTo, nextMilestone, previousMilestone } from '../src/lib/milestones';

describe('order milestones', () => {
  test('sequence is 100, 500, 1000, 1500, then every 500', () => {
    expect(milestonesUpTo(99)).toEqual([]);
    expect(milestonesUpTo(100)).toEqual([100]);
    expect(milestonesUpTo(499)).toEqual([100]);
    expect(milestonesUpTo(2500)).toEqual([100, 500, 1000, 1500, 2000, 2500]);
    expect(milestonesUpTo(10000).length).toBe(21);
  });

  test('an import from 80 to 620 crosses 100 and 500', () => {
    expect(milestonesUpTo(620)).toEqual([100, 500]);
  });

  test('next milestone is the first value above the count', () => {
    expect(nextMilestone(0)).toBe(100);
    expect(nextMilestone(99)).toBe(100);
    expect(nextMilestone(100)).toBe(500);
    expect(nextMilestone(499)).toBe(500);
    expect(nextMilestone(500)).toBe(1000);
    expect(nextMilestone(1000)).toBe(1500);
    expect(nextMilestone(1499)).toBe(1500);
    expect(nextMilestone(2500)).toBe(3000);
  });

  test('progress runs from the milestone below to the next one', () => {
    expect(previousMilestone(100)).toBe(0);
    expect(previousMilestone(500)).toBe(100);
    expect(previousMilestone(1500)).toBe(1000);
    expect(milestoneProgress(108, 500)).toBeCloseTo(8 / 400);
    expect(milestoneProgress(1012, 1500)).toBeCloseTo(12 / 500);
    expect(milestoneProgress(9999, 500)).toBe(1);
  });

  test('numbers use thousands separators', () => {
    expect(formatMilestoneNumber(1000)).toBe('1,000');
    expect(formatMilestoneNumber(10000)).toBe('10,000');
    expect(formatMilestoneNumber(100)).toBe('100');
  });
});
