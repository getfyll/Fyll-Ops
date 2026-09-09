import { Platform } from 'react-native';
import ConfirmDeliveryScreen from '../confirm-delivery';
import StartReturnScreen from '../start-return';
import TrackOrderScreen from '../track';
import { isDeliveryConfirmationHostname, isReturnsHostname } from '@/lib/tracking-host';

export default function BusinessPublicRoute() {
  const hostname = Platform.OS === 'web' && typeof window !== 'undefined'
    ? window.location.hostname
    : '';

  if (isReturnsHostname(hostname)) {
    return <StartReturnScreen />;
  }

  if (isDeliveryConfirmationHostname(hostname)) {
    return <ConfirmDeliveryScreen />;
  }

  return <TrackOrderScreen />;
}
