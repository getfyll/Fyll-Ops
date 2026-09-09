import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';

import useAuthStore from '@/lib/state/auth-store';
import { supabaseData } from '@/lib/supabase/data';
import { useThemeColors } from '@/lib/theme';

const DEMO_PROOF_URL = 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=1200&q=80';

export default function DebugSeedFyllCheckoutScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const [status, setStatus] = useState<'seeding' | 'success' | 'error'>('seeding');
  const [message, setMessage] = useState('Creating dummy Fyll Checkout payment...');
  const [reference, setReference] = useState('');

  useEffect(() => {
    const seed = async () => {
      if (!businessId) {
        setStatus('error');
        setMessage('No business is selected. Log in first, then open this page again.');
        return;
      }

      const now = new Date().toISOString();
      const ref = `FYL-DEMO-${Date.now().toString().slice(-6)}`;
      const payment = {
        id: `fyll_checkout_${ref}`,
        businessId,
        source: 'fyll_checkout',
        sourceOrderId: ref,
        customerName: 'Ada Example',
        customerEmail: 'ada@example.com',
        customerPhone: '08012345678',
        amount: 44100,
        currency: 'NGN',
        paymentMethod: 'bank_transfer',
        status: 'proof_submitted',
        paymentProofUrl: DEMO_PROOF_URL,
        checkoutUrl: `https://checkout.fyll.store/?ref=${ref}`,
        idempotencyKey: `fyll_checkout:${ref}`,
        merchantId: 'MER-EC8AD9A5',
        storeUrl: 'https://minteyewear.co',
        bankAccount: {
          bank: 'GTBank',
          accountName: 'Mint Eyewear',
          accountNumber: '0123456789',
        },
        createdAt: now,
        updatedAt: now,
      };
      const order = {
        id: ref,
        orderNumber: ref,
        websiteOrderReference: ref,
        customerName: 'Ada Example',
        customerEmail: 'ada@example.com',
        customerPhone: '08012345678',
        deliveryState: 'Lagos Mainland',
        deliveryAddress: '12 Admiralty Way, Lekki, Lagos',
        items: [{
          productId: 'fyll-checkout-demo-item',
          variantId: 'fyll-checkout-demo-item',
          quantity: 1,
          unitPrice: 39100,
          productName: 'Atlas Aviator',
          variantName: 'Fyll Checkout',
        }],
        services: [],
        additionalCharges: 0,
        additionalChargesNote: '',
        deliveryFee: 5000,
        paymentMethod: 'bank_transfer',
        status: 'Pending payment',
        orderStatus: 'Pending payment',
        source: 'Fyll Checkout',
        subtotal: 39100,
        totalAmount: 44100,
        orderDate: now,
        createdAt: now,
        updatedAt: now,
        activityLog: [{
          staffName: 'Fyll Checkout',
          action: `Synced demo checkout ${ref} with status pending_manual_verification`,
          date: now,
        }],
        fyllCheckout: {
          merchantId: 'MER-EC8AD9A5',
          storeUrl: 'https://minteyewear.co',
          reference: ref,
          checkoutUrl: `https://checkout.fyll.store/?ref=${ref}`,
          proofUrl: DEMO_PROOF_URL,
        },
      };

      try {
        await Promise.all([
          supabaseData.upsertCollection('orders', businessId, [order]),
          supabaseData.upsertCollection('payments', businessId, [payment]),
        ]);
        setReference(ref);
        setStatus('success');
        setMessage('Dummy Fyll Checkout payment created.');
      } catch (error) {
        console.error('Failed to seed dummy Fyll Checkout payment:', error);
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'Failed to create dummy payment.');
      }
    };

    void seed();
  }, [businessId]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1 items-center justify-center px-6" style={{ backgroundColor: colors.bg.primary }}>
        <View style={{ width: '100%', maxWidth: 420, gap: 16 }}>
          <Text style={{ color: colors.text.primary, fontSize: 24, fontWeight: '600' }}>Seed Fyll Checkout payment</Text>
          <Text style={{ color: colors.text.secondary, fontSize: 14, lineHeight: 22 }}>{message}</Text>
          {status === 'seeding' ? <ActivityIndicator color={colors.text.primary} /> : null}
          {reference ? <Text style={{ color: colors.text.tertiary, fontSize: 13 }}>Reference: {reference}</Text> : null}
          <Pressable
            onPress={() => router.replace('/(tabs)/payments' as never)}
            style={{ height: 48, borderRadius: 999, backgroundColor: colors.text.primary, alignItems: 'center', justifyContent: 'center', opacity: status === 'seeding' ? 0.5 : 1 }}
            disabled={status === 'seeding'}
          >
            <Text style={{ color: colors.bg.primary, fontSize: 14, fontWeight: '600' }}>Open Payments</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </>
  );
}
