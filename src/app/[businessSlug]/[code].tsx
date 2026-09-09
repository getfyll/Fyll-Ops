import { Platform } from 'react-native';
import ConfirmDeliveryScreen from '../confirm-delivery';
import TrackOrderScreen from '../track';
import { isDeliveryConfirmationHostname } from '@/lib/tracking-host';

export default function BusinessCodePublicRoute() {
  const isConfirmHost = Platform.OS === 'web'
    && typeof window !== 'undefined'
    && isDeliveryConfirmationHostname(window.location.hostname);

  return isConfirmHost ? <ConfirmDeliveryScreen /> : <TrackOrderScreen />;
}
