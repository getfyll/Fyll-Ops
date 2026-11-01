import { describe, expect, test } from 'bun:test';
import { getQuickActionDefs } from '../src/lib/quick-actions';

const keys = (role: string | null, financeEnabled = true) => getQuickActionDefs({ role, financeEnabled }).map((action) => action.key);

describe('quick actions', () => {
  test('everyone gets order, payment and scan, with New order first and highlighted', () => {
    for (const role of ['staff', 'manager', 'admin', null]) {
      expect(keys(role).slice(0, 3)).toEqual(['order', 'payment', 'scan']);
    }
    const [first] = getQuickActionDefs({ role: 'staff', financeEnabled: true });
    expect(first.primary).toBe(true);
  });

  test('staff cannot add products or record expenses', () => {
    expect(keys('staff')).toEqual(['order', 'payment', 'scan']);
  });

  test('admins and managers also get Add product and New expense', () => {
    expect(keys('admin')).toEqual(['order', 'payment', 'scan', 'product', 'expense']);
    expect(keys('manager')).toEqual(['order', 'payment', 'scan', 'product', 'expense']);
  });

  test('New expense is hidden when finance is switched off', () => {
    expect(keys('admin', false)).toEqual(['order', 'payment', 'scan', 'product']);
  });

  test('New expense opens the Expenses section of Finance', () => {
    const expense = getQuickActionDefs({ role: 'admin', financeEnabled: true }).find((action) => action.key === 'expense');
    expect(expense?.route).toBe('/(tabs)/finance?section=expenses');
  });

  test('every action points at a page', () => {
    for (const action of getQuickActionDefs({ role: 'admin', financeEnabled: true })) {
      expect(action.route.startsWith('/')).toBe(true);
    }
  });
});
