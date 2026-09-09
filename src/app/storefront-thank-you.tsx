import React, { useMemo } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, Mail, PackageCheck, ShieldCheck } from 'lucide-react-native';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { PRODUCT_DETAILS } from '@/lib/storefront-catalog';
import { useStorefrontStore } from '@/lib/storefront-store';

function formatCurrency(value: number) {
  return `₦${value.toLocaleString()}`;
}

export default function StorefrontThankYouScreen() {
  const router = useRouter();
  const { isMobile, isDesktop } = useBreakpoint();
  const { total, reference, orderId } = useLocalSearchParams<{
    total?: string;
    reference?: string;
    orderId?: string;
  }>();
  const cartItems = useStorefrontStore((state) => state.cartItems);
  const pendingOrders = useStorefrontStore((state) => state.pendingOrders);

  const pendingOrder = useMemo(
    () =>
      pendingOrders.find((order) =>
        orderId ? order.id === orderId : order.reference === reference
      ),
    [orderId, pendingOrders, reference]
  );

  const cartProducts = useMemo(
    () =>
      Object.values(cartItems)
        .map((item) => {
          const product = PRODUCT_DETAILS[item.productId];
          if (!product) {
            return null;
          }

          return {
            item,
            product,
            lineTotal: product.priceValue * item.quantity,
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null),
    [cartItems]
  );

  const pendingOrderProducts = useMemo(
    () =>
      pendingOrder?.items.map((item) => ({
        item: {
          quantity: item.quantity,
          selectedSize: item.selectedSize,
        },
        product: {
          id: item.productId,
          name: item.productName,
          images: [item.image],
        },
        lineTotal: item.lineTotal,
      })) ?? [],
    [pendingOrder]
  );

  const fallbackTotal = useMemo(
    () => cartProducts.reduce((sum, entry) => sum + entry.lineTotal, 0),
    [cartProducts]
  );
  const parsedTotal = total ? Number(total) : pendingOrder?.total ?? fallbackTotal;
  const amountDue = Number.isFinite(parsedTotal) && parsedTotal > 0 ? parsedTotal : fallbackTotal;
  const orderReference = pendingOrder?.reference ?? reference ?? 'FYL-772513';
  const contentWidth = isDesktop ? 1160 : '100%';
  const summaryProducts = pendingOrderProducts.length > 0 ? pendingOrderProducts : cartProducts;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView
        style={{ flex: 1, backgroundColor: '#FFFFFF' }}
        contentContainerStyle={{
          paddingHorizontal: isMobile ? 16 : 32,
          paddingTop: isMobile ? 24 : 34,
          paddingBottom: 52,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: contentWidth, maxWidth: '100%', alignSelf: 'center' }}>
          <View style={{ alignItems: 'center', marginBottom: 28 }}>
            <View
              style={{
                width: 60,
                height: 60,
                borderRadius: 30,
                backgroundColor: '#EAF8EF',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Check size={28} color="#26A269" strokeWidth={2.8} />
            </View>
            <Text style={{ color: '#111111', fontSize: isMobile ? 28 : 36, fontWeight: '500', marginTop: 18, letterSpacing: -0.8 }}>
              Thank you
            </Text>
            <Text
              style={{
                color: '#525252',
                fontSize: 16,
                fontWeight: '400',
                lineHeight: 26,
                textAlign: 'center',
                marginTop: 10,
                maxWidth: 620,
              }}
            >
              Your payment receipt has been submitted. We’ll review the transfer, verify the amount, and confirm the order once payment is matched.
            </Text>
          </View>

          <View
            style={{
              flexDirection: isDesktop ? 'row' : 'column',
              alignItems: 'flex-start',
              gap: 24,
            }}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <View
                style={{
                  borderRadius: 28,
                  borderWidth: 1,
                  borderColor: 'rgba(15, 23, 42, 0.08)',
                  backgroundColor: '#FFFFFF',
                  padding: isMobile ? 20 : 28,
                }}
              >
                <Text style={{ color: '#111111', fontSize: 20, fontWeight: '500', marginBottom: 18 }}>Payment submitted</Text>

                <View
                  style={{
                    borderRadius: 22,
                    backgroundColor: '#FAFAFA',
                    padding: 18,
                    gap: 14,
                  }}
                >
                  <View>
                    <Text style={{ color: '#A3A3A3', fontSize: 12, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                      Order reference
                    </Text>
                    <Text style={{ color: '#111111', fontSize: 16, fontWeight: '500', marginTop: 8 }}>{orderReference}</Text>
                  </View>

                  <View>
                    <Text style={{ color: '#A3A3A3', fontSize: 12, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                      Submitted amount
                    </Text>
                    <Text style={{ color: '#111111', fontSize: 16, fontWeight: '500', marginTop: 8 }}>{formatCurrency(amountDue)}</Text>
                  </View>

                  {pendingOrder?.receipt?.name ? (
                    <View>
                      <Text style={{ color: '#A3A3A3', fontSize: 12, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                        Receipt file
                      </Text>
                      <Text style={{ color: '#111111', fontSize: 16, fontWeight: '500', marginTop: 8 }}>
                        {pendingOrder.receipt.name}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <View style={{ marginTop: 18, gap: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                    <ShieldCheck size={16} color="#26A269" strokeWidth={2.2} style={{ marginTop: 2 }} />
                    <Text style={{ color: '#525252', fontSize: 16, fontWeight: '400', lineHeight: 24, marginLeft: 10, flex: 1 }}>
                      Your order is still pending confirmation until our team verifies the transfer and receipt.
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                    <Mail size={16} color="#111111" strokeWidth={2.2} style={{ marginTop: 2 }} />
                    <Text style={{ color: '#525252', fontSize: 16, fontWeight: '400', lineHeight: 24, marginLeft: 10, flex: 1 }}>
                      We’ll send an email once payment is approved and the order moves into fulfilment.
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                    <PackageCheck size={16} color="#111111" strokeWidth={2.2} style={{ marginTop: 2 }} />
                    <Text style={{ color: '#525252', fontSize: 16, fontWeight: '400', lineHeight: 24, marginLeft: 10, flex: 1 }}>
                      Fulfilment only starts after payment is verified.
                    </Text>
                  </View>
                </View>
              </View>

              <View
                style={{
                  borderRadius: 28,
                  borderWidth: 1,
                  borderColor: 'rgba(15, 23, 42, 0.08)',
                  backgroundColor: '#FFFFFF',
                  padding: isMobile ? 20 : 24,
                  marginTop: 18,
                }}
              >
                <Text style={{ color: '#111111', fontSize: 18, fontWeight: '500' }}>What happens next</Text>
                <View style={{ marginTop: 16, gap: 14 }}>
                  {[
                    'Our team reviews the transfer amount and receipt.',
                    `We match the payment to ${orderReference}.`,
                    'Once verified, we confirm the order and send your next update.',
                  ].map((item, index) => (
                    <View key={item} style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                      <View
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 12,
                          backgroundColor: '#111111',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginRight: 10,
                        }}
                      >
                        <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '500' }}>{index + 1}</Text>
                      </View>
                      <Text style={{ color: '#525252', fontSize: 15, fontWeight: '400', lineHeight: 24, flex: 1 }}>{item}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>

            <View style={{ width: isDesktop ? 360 : '100%' }}>
              <View
                style={{
                  borderRadius: 28,
                  borderWidth: 1,
                  borderColor: 'rgba(15, 23, 42, 0.08)',
                  backgroundColor: '#FFFFFF',
                  padding: 22,
                }}
              >
                <Text style={{ color: '#111111', fontSize: 20, fontWeight: '500' }}>Order summary</Text>

                <View style={{ gap: 14, marginTop: 18 }}>
                  {summaryProducts.map(({ item, product, lineTotal }) => (
                    <View key={product.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <Image
                        source={{ uri: product.images[0] }}
                        style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: '#F4F4F5' }}
                        resizeMode="cover"
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: '#111111', fontSize: 14, fontWeight: '500' }}>{product.name}</Text>
                        <Text style={{ color: '#A3A3A3', fontSize: 13, fontWeight: '400', marginTop: 4 }}>
                          ×{item.quantity}
                          {item.selectedSize ? ` · ${item.selectedSize}` : ''}
                        </Text>
                      </View>
                      <Text style={{ color: '#111111', fontSize: 14, fontWeight: '600' }}>{formatCurrency(lineTotal)}</Text>
                    </View>
                  ))}
                </View>

                <View style={{ marginTop: 20, gap: 12 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: '#737373', fontSize: 14 }}>Total to pay</Text>
                    <Text style={{ color: '#111111', fontSize: 16, fontWeight: '600' }}>{formatCurrency(amountDue)}</Text>
                  </View>
                </View>
              </View>

              <Pressable
                onPress={() => router.push('/storefront-prototype' as any)}
                style={({ hovered }) => ({
                  marginTop: 18,
                  height: 50,
                  borderRadius: 999,
                  backgroundColor: hovered ? '#242424' : '#111111',
                  alignItems: 'center',
                  justifyContent: 'center',
                })}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '500' }}>Continue shopping</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
