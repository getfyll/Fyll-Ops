import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { isBusinessFeatureEnabled } from '@/lib/feature-access';

// WooCommerce fields (order reference, "send to WooCommerce", the link section on an order) only
// make sense once WooCommerce is allowed for the business, switched on in Settings and connected.
export function useWooCommerceAvailable() {
  const { woocommerceEnabled, hasWooCommerceConnection, featureAccess } = useBusinessSettings();
  return Boolean(
    woocommerceEnabled
    && hasWooCommerceConnection
    && isBusinessFeatureEnabled(featureAccess, 'woocommerce')
    && isBusinessFeatureEnabled(featureAccess, 'additionalIntegrations')
  );
}
