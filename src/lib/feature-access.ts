export const BUSINESS_FEATURES = [
  { key: 'storefront', label: 'Storefront', description: 'Public shop, storefront settings, cart, and checkout.', defaultEnabled: true },
  { key: 'socialCheckout', label: 'Social Checkout', description: 'Payment links, payment proof review, and bank-account checkout links.', defaultEnabled: true },
  { key: 'threads', label: 'Threads', description: 'Team conversations, order comments, case comments, and collaboration inbox.', defaultEnabled: true },
  { key: 'cases', label: 'Cases', description: 'Case workspace, case detail pages, statuses, and resolution types.', defaultEnabled: true },
  { key: 'teamMembers', label: 'Team Members', description: 'Team member management, invitations, roles, and founder invite controls.', defaultEnabled: true },
  { key: 'tasks', label: 'Tasks', description: 'Task workspace, assignments, reminders, and task tabs.', defaultEnabled: true },
  { key: 'finance', label: 'Finance', description: 'Finance dashboard, expenses, procurement finance, and revenue views.', defaultEnabled: true },
  { key: 'insights', label: 'Insights', description: 'Analytics dashboards, trend reports, and performance views.', defaultEnabled: true },
  { key: 'delivery', label: 'Delivery', description: 'Delivery operations, dispatch views, and follow-up tools.', defaultEnabled: true },
  { key: 'returns', label: 'Returns', description: 'Returns workspace and customer return request tools.', defaultEnabled: true },
  { key: 'announcements', label: 'Announcements', description: 'Customer announcements and broadcast update tools.', defaultEnabled: true },
  { key: 'orderAutomation', label: 'Order Automation', description: 'Auto-complete stale orders and related workflow automation.', defaultEnabled: true },
  { key: 'additionalIntegrations', label: 'Additional Connections', description: 'Extra connection settings beyond the default storefront tools.', defaultEnabled: false },
  { key: 'woocommerce', label: 'WooCommerce', description: 'WooCommerce connection, sync settings, and order linking.', defaultEnabled: false },
  { key: 'fyllPrint', label: 'Fyll Print', description: 'Print queue, label printing, and print history.', defaultEnabled: true },
  { key: 'aiImport', label: 'AI Import', description: 'AI import assistant for orders, customers, products, and expenses.', defaultEnabled: true },
] as const;

export type BusinessFeatureKey = typeof BUSINESS_FEATURES[number]['key'];
export type BusinessFeatureAccess = Record<BusinessFeatureKey, boolean>;

export const DEFAULT_BUSINESS_FEATURE_ACCESS: BusinessFeatureAccess = BUSINESS_FEATURES.reduce(
  (acc, feature) => ({ ...acc, [feature.key]: feature.defaultEnabled ?? true }),
  {} as BusinessFeatureAccess
);

export const normalizeBusinessFeatureAccess = (value: unknown): BusinessFeatureAccess => {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

  return BUSINESS_FEATURES.reduce(
    (acc, feature) => ({
      ...acc,
      [feature.key]: typeof raw[feature.key] === 'boolean' ? raw[feature.key] as boolean : feature.defaultEnabled ?? true,
    }),
    {} as BusinessFeatureAccess
  );
};

export const isBusinessFeatureEnabled = (
  access: Partial<Record<BusinessFeatureKey, boolean>> | null | undefined,
  feature: BusinessFeatureKey
) => access?.[feature] !== false;
