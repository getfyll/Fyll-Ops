import { Platform } from 'react-native';
import ConfirmDeliveryScreen from '../confirm-delivery';
import StartReturnScreen from '../start-return';
import TrackOrderScreen from '../track';
import FyllPayPublicScreen from '@/components/fyll-pay/FyllPayPublicScreen';
import { isDeliveryConfirmationHostname, isPaymentHostname, isReturnsHostname } from '@/lib/tracking-host';

export default function BusinessPublicRoute() {
  const hostname = Platform.OS === 'web' && typeof window !== 'undefined'
    ? window.location.hostname
    : '';

  // payment.fyll.app/<business> is the business's Fyll Pay page (what its Payment QR opens).
  if (isPaymentHostname(hostname)) {
    return <FyllPayPublicScreen />;
  }

  if (isReturnsHostname(hostname)) {
    return <StartReturnScreen />;
  }

  if (isDeliveryConfirmationHostname(hostname)) {
    return <ConfirmDeliveryScreen />;
  }

  return <TrackOrderScreen />;
}
