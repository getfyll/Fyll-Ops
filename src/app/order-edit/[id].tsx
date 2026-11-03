import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import NewOrderScreen from '@/app/new-order';

// Edit order uses the same screen as New order, loaded with the saved order.
export default function OrderEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = typeof id === 'string' ? id : '';
  return <NewOrderScreen editOrderId={orderId} />;
}
