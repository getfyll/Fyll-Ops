export const BUSINESS_FEATURES = [
  { key: 'storefront', label: 'Storefront', description: 'Public shop, storefront settings, cart, and checkout.', defaultEnabled: true },
  { key: 'socialCheckout', label: 'Social Checkout', description: 'Payment links, payment proof review, and bank-account checkout links.', defaultEnabled: true },
  { key: 'threads', label: 'Threads', description: 'Team conversations, order comments, case comments, and collaboration inbox.', defaultEnabled: true },
  { key: 'cases', label: 'Cases', description: 'Case workspace, case detail pages, statuses, and resolution types.', defaultEnabled: true },
  { key: 'teamMembers', label: 'Team Members', description: 'Team member management, invitations, roles, and founder invite controls.', defaultEnabled: true },
  { key: 'tasks', label: 'Tasks', description: 'Task workspace, assignments, reminders, and task tabs.', defaultEnabled: true },
  { key: 'finance', label: 'Finance', description: 'Finance dashboard, expenses, procurement finance, and revenue views.', defaultEnabled: true },
  { key: 'insights', label: 'Insights', description: 'Analytics dashboards, trend reports, and performance views.', defaultEnabled: true, core: true },
  { key: 'delivery', label: 'Delivery', description: 'Delivery operations, dispatch views, and follow-up tools.', defaultEnabled: true },
  { key: 'returns', label: 'Returns', description: 'Returns workspace and customer return request tools.', defaultEnabled: true },
  { key: 'announcements', label: 'Announcements', description: 'Customer announcements and broadcast update tools.', defaultEnabled: true },
  { key: 'orderAutomation', label: 'Order Automation', description: 'Auto-complete stale orders and related workflow automation.', defaultEnabled: true },
  { key: 'additionalIntegrations', label: 'Additional Connections', description: 'Extra connection settings beyond the default storefront tools.', defaultEnabled: false },
  { key: 'woocommerce', label: 'WooCommerce', description: 'WooCommerce connection, sync settings, and order linking.', defaultEnabled: false },
  { key: 'fyllPrint', label: 'Fyll Print', description: 'Print queue, label printing, and print history.', defaultEnabled: true },
  { key: 'aiImport', label: 'AI Import', description: 'AI import assistant for orders, customers, products, and expenses.', defaultEnabled: true },
] as const;

// Core parts of Fyll — Home, Orders, Inventory, Insights and Payments — are always on for every
// business. Home, Orders, Inventory and Payments are not features at all; Insights is listed here
// but marked core, so it cannot be switched off and is left out of the console's feature toggles.
export const SWITCHABLE_BUSINESS_FEATURES = BUSINESS_FEATURES.filter((feature) => !('core' in feature && feature.core));

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
      [feature.key]: 'core' in feature && feature.core
        ? true
        : typeof raw[feature.key] === 'boolean' ? raw[feature.key] as boolean : feature.defaultEnabled ?? true,
    }),
    {} as BusinessFeatureAccess
  );
};

const CORE_FEATURE_KEYS = new Set<BusinessFeatureKey>(
  BUSINESS_FEATURES.filter((feature) => 'core' in feature && feature.core).map((feature) => feature.key)
);

export const isBusinessFeatureEnabled = (
  access: Partial<Record<BusinessFeatureKey, boolean>> | null | undefined,
  feature: BusinessFeatureKey
) => CORE_FEATURE_KEYS.has(feature) || access?.[feature] !== false;

// Merchant layer: owners/admins can switch some features off for their own team (businesses.data.enabledFeatures).
// A feature is on only when Fyll's own switch (featureAccess) allows it AND the merchant has not turned it off.
// The merchant layer can only turn things off; it can never enable something Fyll has switched off.
export type MerchantFeatureSwitches = Partial<Record<BusinessFeatureKey, boolean>>;

export const normalizeMerchantFeatureSwitches = (value: unknown): MerchantFeatureSwitches => {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return BUSINESS_FEATURES.reduce<MerchantFeatureSwitches>((acc, feature) => (
    typeof raw[feature.key] === 'boolean' && !('core' in feature && feature.core)
      ? { ...acc, [feature.key]: raw[feature.key] as boolean }
      : acc
  ), {});
};

export const applyMerchantFeatureSwitches = (
  access: BusinessFeatureAccess,
  merchant: MerchantFeatureSwitches | null | undefined,
): BusinessFeatureAccess => (
  BUSINESS_FEATURES.reduce(
    (acc, feature) => ({ ...acc, [feature.key]: access[feature.key] && merchant?.[feature.key] !== false }),
    {} as BusinessFeatureAccess
  )
);
