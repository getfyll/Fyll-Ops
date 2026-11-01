// The actions behind Home's plus button, and who gets which. Kept free of React so the rules can be tested.

export type QuickActionKey = 'order' | 'payment' | 'scan' | 'product' | 'expense';

export type QuickActionDef = {
  key: QuickActionKey;
  title: string;
  subtitle: string;
  route: string;
  // The first action is the highlighted one.
  primary?: boolean;
};

export const getQuickActionDefs = ({ role, financeEnabled }: { role?: string | null; financeEnabled: boolean }): QuickActionDef[] => {
  const canManage = role === 'admin' || role === 'manager';
  const actions: QuickActionDef[] = [
    { key: 'order', title: 'New order', subtitle: 'Create a customer order', route: '/new-order', primary: true },
    { key: 'payment', title: 'New payment', subtitle: 'Send a payment link', route: '/social-checkout/new' },
    { key: 'scan', title: 'Scan item', subtitle: 'Sell or restock with the camera', route: '/scan' },
  ];
  if (canManage) actions.push({ key: 'product', title: 'Add product', subtitle: 'Add something to your inventory', route: '/new-product' });
  if (canManage && financeEnabled) actions.push({ key: 'expense', title: 'New expense', subtitle: 'Record money you spent', route: '/(tabs)/finance?section=expenses' });
  return actions;
};
