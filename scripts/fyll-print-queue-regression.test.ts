import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/lib/fyll-print-queue.ts', import.meta.url), 'utf8');

describe('Fyll Print queue isolation', () => {
  test('stores queues under a business-specific key', () => {
    expect(source).toContain('export const getFyllPrintQueueStorageKey');
    expect(source).toContain('businessId ? `${FYLL_PRINT_QUEUE_STORAGE_KEY}:${businessId}` : FYLL_PRINT_QUEUE_STORAGE_KEY');
    expect(source).toContain('storage.getItem(getFyllPrintQueueStorageKey(businessId))');
    expect(source).toContain('storage.setItem(getFyllPrintQueueStorageKey(businessId), JSON.stringify(queue))');
  });

  test('queue mutations pass the business id through to reads and writes', () => {
    expect(source).toContain('const queue = await getFyllPrintQueue(businessId);');
    expect(source).toContain('await saveFyllPrintQueue(nextQueue, businessId);');
  });
});
