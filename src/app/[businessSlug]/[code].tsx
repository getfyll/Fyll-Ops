import { Platform } from 'react-native';
import ConfirmDeliveryScreen from '../confirm-delivery';
import TrackOrderScreen from '../track';
import CheckoutScreen from '../checkout';
import { isDeliveryConfirmationHostname, isPaymentHostname } from '@/lib/tracking-host';

export default function BusinessCodePublicRoute() {
  const hostname = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.hostname : '';

  // payment.fyll.app/<business>/<code> is the public payment page.
  if (isPaymentHostname(hostname)) return <CheckoutScreen />;
  return isDeliveryConfirmationHostname(hostname) ? <ConfirmDeliveryScreen /> : <TrackOrderScreen />;
}
