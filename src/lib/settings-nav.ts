// The Settings menu: one list shared by the Settings sidebar, the breadcrumb, mobile and search.
// Keys are the page ids the Settings screen already renders (`?menu=<key>`), so existing routes keep working.

export type SettingsNavGroup = 'Account' | 'Business' | 'Features' | 'Data';

export type SettingsNavKey =
  | 'profile'
  | 'notifications'
  | 'appearance'
  | 'business-details'
  | 'team'
  | 'payments'
  | 'links'
  | 'all-features'
  | 'orders'
  | 'inventory'
  | 'cases'
  | 'import-export'
  | 'integrations'
  | 'system';

export type SettingsNavItem = {
  key: SettingsNavKey;
  label: string;
  group: SettingsNavGroup;
  description: string;
  keywords: string[];
};

export const SETTINGS_NAV_GROUPS: SettingsNavGroup[] = ['Account', 'Business', 'Features', 'Data'];

export const SETTINGS_NAV: SettingsNavItem[] = [
  { key: 'profile', label: 'Profile', group: 'Account', description: 'Your account, password and workspaces', keywords: ['account', 'password', 'name', 'email', 'switch business', 'workspace'] },
  { key: 'notifications', label: 'Notifications', group: 'Account', description: 'Push, WhatsApp and customer emails', keywords: ['push', 'whatsapp', 'email', 'alerts', 'emails', 'sms'] },
  { key: 'appearance', label: 'Appearance', group: 'Account', description: 'Light, dark or follow your device', keywords: ['theme', 'dark mode', 'light mode', 'dark'] },
  { key: 'business-details', label: 'Business details', group: 'Business', description: 'Name, logo and customer contact', keywords: ['logo', 'business name', 'phone', 'address', 'website', 'return address'] },
  { key: 'team', label: 'Team & roles', group: 'Business', description: 'Team members, roles and invitations', keywords: ['invite', 'invitation', 'staff', 'manager', 'admin', 'permissions', 'members', 'vip'] },
  { key: 'payments', label: 'Payments', group: 'Business', description: 'Bank accounts and payment methods', keywords: ['bank', 'bank account', 'payment link', 'pos', 'transfer', 'payment methods'] },
  { key: 'links', label: 'Links', group: 'Business', description: 'Tracking, returns and delivery confirmation links', keywords: ['tracking', 'tracking link', 'returns link', 'url', 'customer links'] },
  { key: 'all-features', label: 'All features', group: 'Features', description: 'Turn tools on or off and see how each is set up', keywords: ['delivery', 'returns', 'fyll print', 'print', 'tasks', 'cases', 'finance', 'announcements', 'switch', 'turn off', 'enable'] },
  { key: 'orders', label: 'Orders', group: 'Features', description: 'Statuses, quality control, timelines, sources and carriers', keywords: ['status', 'quality control', 'qc', 'fulfillment timeline', 'sale source', 'carrier', 'logistics', 'automation', 'auto complete'] },
  { key: 'inventory', label: 'Inventory', group: 'Features', description: 'Stock alerts, warehouse, categories and services', keywords: ['low stock', 'warehouse', 'category', 'variables', 'options', 'services', 'add-ons', 'addons', 'sku'] },
  { key: 'cases', label: 'Cases', group: 'Features', description: 'Case statuses and resolution types', keywords: ['case status', 'resolution', 'complaint', 'issues'] },
  { key: 'import-export', label: 'Import & export', group: 'Data', description: 'Bring in orders, products and customers', keywords: ['csv', 'import', 'upload', 'customers', 'products', 'orders', 'ai import', 'export'] },
  { key: 'integrations', label: 'Connections', group: 'Data', description: 'Storefront and WooCommerce', keywords: ['storefront', 'woocommerce', 'website', 'api', 'shop', 'store link'] },
  { key: 'system', label: 'System', group: 'Data', description: 'Sync, recycle bin and sign out', keywords: ['sync', 'refresh', 'recycle bin', 'restore', 'sign out', 'log out', 'delete'] },
];

export const getSettingsNavItem = (key: string | null | undefined) => SETTINGS_NAV.find((item) => item.key === key) ?? null;

// Old `?menu=` values (the "Operations" page and the old connection key) land on their new home.
const LEGACY_MENU_REDIRECTS: Record<string, SettingsNavKey> = {
  operations: 'all-features',
  integrations: 'integrations',
  connections: 'integrations',
};

export const normalizeSettingsNavKey = (value?: string | null): SettingsNavKey | null => {
  const normalized = value?.trim().replace(/\?+$/, '') ?? '';
  if (!normalized) return null;
  if (LEGACY_MENU_REDIRECTS[normalized]) return LEGACY_MENU_REDIRECTS[normalized];
  return SETTINGS_NAV.some((item) => item.key === normalized) ? (normalized as SettingsNavKey) : null;
};

export type SettingsSearchEntry = {
  id: string;
  title: string;
  description: string;
  group: string;
  keywords: string[];
  // Either a page of the Settings menu or a specific sub-page the Settings screen opens itself.
  navKey?: SettingsNavKey;
  onOpen?: () => void;
};

const scoreEntry = (entry: SettingsSearchEntry, terms: string[]) => {
  const title = entry.title.toLowerCase();
  const description = entry.description.toLowerCase();
  const keywords = entry.keywords.map((keyword) => keyword.toLowerCase());
  let score = 0;
  for (const term of terms) {
    if (title.startsWith(term)) score += 6;
    else if (title.includes(term)) score += 4;
    else if (keywords.some((keyword) => keyword.includes(term))) score += 3;
    else if (description.includes(term)) score += 1;
    else return 0; // every word must match something
  }
  return score;
};

export const searchSettings = (entries: SettingsSearchEntry[], query: string, limit = 8) => {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  return entries
    .map((entry) => ({ entry, score: scoreEntry(entry, terms) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.entry);
};
