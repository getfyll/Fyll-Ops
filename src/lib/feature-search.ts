import { BarChart3, ClipboardList, DollarSign, FileText, Megaphone, MessageCircle, Package, Plus, Printer, RotateCcw, Settings, ShoppingCart, Truck, Users } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { isBusinessFeatureEnabled, type BusinessFeatureAccess } from '@/lib/feature-access';

// The pages people can jump to from search (web menu search and the mobile global search).
export type FeatureSearchItem = {
  label: string;
  description: string;
  route: string;
  Icon: LucideIcon;
  keywords: string;
};

export const FEATURE_SEARCH_ITEMS: FeatureSearchItem[] = [
  { label: 'Dashboard', description: 'Home overview and quick actions', route: '/(tabs)', Icon: BarChart3, keywords: 'home overview dashboard' },
  { label: 'New Order', description: 'Create a customer order', route: '/new-order', Icon: Plus, keywords: 'create order sales checkout' },
  { label: 'Orders', description: 'Search, filter, and manage orders', route: '/(tabs)/orders', Icon: ShoppingCart, keywords: 'orders status customer sales' },
  { label: 'Inventory', description: 'Products, services, stock, barcode labels', route: '/(tabs)/inventory', Icon: Package, keywords: 'products stock inventory barcode labels' },
  { label: 'Warehouse', description: 'Warehouse items and stock counts', route: '/(tabs)/inventory/warehouse', Icon: Package, keywords: 'warehouse bins supplies stock' },
  { label: 'Delivery', description: 'Dispatch tracking and shipping labels', route: '/(tabs)/deliveries', Icon: Truck, keywords: 'delivery dispatch shipping courier label' },
  { label: 'Fyll Print', description: 'Shipping and inventory print queues', route: '/fyll-print', Icon: Printer, keywords: 'print label queue barcode shipping' },
  { label: 'Returns', description: 'Return requests and workflows', route: '/returns', Icon: RotateCcw, keywords: 'returns refund exchange customer proof' },
  { label: 'Cases', description: 'Support cases and customer issues', route: '/(tabs)/cases', Icon: FileText, keywords: 'cases support issues complaints' },
  { label: 'Customers', description: 'Customer profiles and history', route: '/(tabs)/customers', Icon: Users, keywords: 'customers contacts profiles' },
  { label: 'Announcements', description: 'Compose customer announcements', route: '/(tabs)/announcements', Icon: Megaphone, keywords: 'announcements email customers broadcast' },
  { label: 'Announcement Setup', description: 'Email template, sender, and reply-to settings', route: '/(tabs)/announcements?announcementSection=setup', Icon: Settings, keywords: 'announcement setup email template sender reply to' },
  { label: 'Threads', description: 'Team conversations', route: '/(tabs)/threads', Icon: MessageCircle, keywords: 'threads comments messages collaboration' },
  { label: 'Tasks', description: 'Assigned work and reminders', route: '/(tabs)/tasks', Icon: ClipboardList, keywords: 'tasks reminders assignments' },
  { label: 'Finance', description: 'Revenue, expenses, refunds, procurement', route: '/(tabs)/finance', Icon: DollarSign, keywords: 'finance revenue expenses refunds procurement salary' },
  { label: 'Insights', description: 'Performance analytics', route: '/(tabs)/insights', Icon: BarChart3, keywords: 'insights analytics reports stats' },
  { label: 'Business Settings', description: 'Business profile, links, and operations settings', route: '/business-settings', Icon: Settings, keywords: 'settings business links return tracking delivery confirmation' },
  { label: 'WooCommerce Settings', description: 'Website store integration settings', route: '/woocommerce-settings', Icon: Settings, keywords: 'woocommerce website integration sync' },
  { label: 'Import Products', description: 'Upload product CSV data', route: '/import-products', Icon: Package, keywords: 'import csv products upload' },
];

const featureForRoute = (route: string) => {
  if (route.includes('/deliveries')) return 'delivery' as const;
  if (route.includes('/fyll-print')) return 'fyllPrint' as const;
  if (route.includes('/returns')) return 'returns' as const;
  if (route.includes('/cases')) return 'cases' as const;
  if (route.includes('/announcements')) return 'announcements' as const;
  if (route.includes('/threads')) return 'threads' as const;
  if (route.includes('/tasks')) return 'tasks' as const;
  if (route.includes('/finance')) return 'finance' as const;
  if (route.includes('/insights')) return 'insights' as const;
  if (route.includes('/woocommerce-settings')) return 'woocommerce' as const;
  return null;
  };

// Pages that only some roles should see in search.
const STAFF_HIDDEN_ROUTES = ['/(tabs)/finance', '/(tabs)/insights', '/business-settings', '/woocommerce-settings', '/import-products'];
const MANAGER_HIDDEN_ROUTES = ['/(tabs)/insights'];

// The pages switched on for this business. Pass the person's role to also hide pages their role cannot open.
export const getEnabledFeatureSearchItems = (featureAccess: BusinessFeatureAccess, role?: string | null): FeatureSearchItem[] =>
  FEATURE_SEARCH_ITEMS.filter((item) => {
    if (role === 'staff' && STAFF_HIDDEN_ROUTES.includes(item.route)) return false;
    if (role === 'manager' && MANAGER_HIDDEN_ROUTES.includes(item.route)) return false;
    const feature = featureForRoute(item.route);
    if (!feature) return true;
    if (feature === 'woocommerce' && !isBusinessFeatureEnabled(featureAccess, 'additionalIntegrations')) return false;
    return isBusinessFeatureEnabled(featureAccess, feature);
  });
