import React, { useMemo } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronRight, Plus, Trash2 } from 'lucide-react-native';
import { PRODUCT_DETAILS, STORE_BRAND } from '@/lib/storefront-catalog';
import { useStorefrontStore } from '@/lib/storefront-store';
import { useBreakpoint } from '@/lib/useBreakpoint';

export default function StorefrontCartScreen() {
  const router = useRouter();
  const { isMobile } = useBreakpoint();
  const cartItems = useStorefrontStore((state) => state.cartItems);
  const moveCartItemToSaved = useStorefrontStore((state) => state.moveCartItemToSaved);
  const removeCartItem = useStorefrontStore((state) => state.removeCartItem);
  const updateCartQuantity = useStorefrontStore((state) => state.updateCartQuantity);
  const savedProductIds = useStorefrontStore((state) => state.savedProductIds);

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

  const subtotal = useMemo(
    () => cartProducts.reduce((sum, entry) => sum + entry.lineTotal, 0),
    [cartProducts]
  );

  const subtotalLabel = useMemo(() => `₦${subtotal.toLocaleString()}`, [subtotal]);
  const contentWidth = isMobile ? '100%' : 600;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView
        style={{ flex: 1, backgroundColor: '#FFFFFF' }}
        contentContainerStyle={{
          paddingHorizontal: isMobile ? 16 : 24,
          paddingTop: isMobile ? 26 : 40,
          paddingBottom: 48,
          alignItems: 'center',
        }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            width: contentWidth,
            maxWidth: '100%',
          }}
        >
          <View
            style={{
              marginBottom: 24,
            }}
          >
            <Text style={{ color: '#111111', fontSize: 16, fontWeight: '500', letterSpacing: -0.2 }}>
              Your cart
            </Text>
            <Text style={{ color: '#737373', fontSize: 16, fontWeight: '400', marginTop: 8 }}>
              Items you added from stores will appear here.
            </Text>
          </View>

          {cartProducts.length === 0 ? (
            <View
              style={{
                width: contentWidth,
                maxWidth: '100%',
                paddingVertical: isMobile ? 40 : 64,
                paddingHorizontal: isMobile ? 22 : 28,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 28,
                backgroundColor: '#FAFAFA',
                borderWidth: 1,
                borderColor: 'rgba(15, 23, 42, 0.06)',
              }}
            >
              <Text style={{ color: '#111111', fontSize: 16, fontWeight: '500' }}>Your cart is empty</Text>
              <Text
                style={{
                  color: '#737373',
                  fontSize: 16,
                  fontWeight: '400',
                  marginTop: 10,
                  textAlign: 'center',
                  maxWidth: 320,
                }}
              >
                Add a few pieces from the storefront and they will show up here for checkout.
              </Text>
              <Pressable
                onPress={() => router.push('/storefront-prototype' as any)}
                style={({ hovered }) => ({
                  marginTop: 22,
                  height: 50,
                  borderRadius: 999,
                    backgroundColor: hovered ? '#242424' : '#111111',
                    paddingHorizontal: 24,
                    alignItems: 'center',
                    justifyContent: 'center',
                  })}
                >
                <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '500' }}>Continue shopping</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View
                style={{
                  width: contentWidth,
                  maxWidth: '100%',
                  backgroundColor: '#FFFFFF',
                  borderRadius: 28,
                  borderWidth: 1,
                  borderColor: 'rgba(15, 23, 42, 0.08)',
                  paddingHorizontal: isMobile ? 18 : 24,
                  paddingTop: isMobile ? 18 : 22,
                  paddingBottom: isMobile ? 20 : 24,
                  shadowColor: '#111111',
                  shadowOpacity: 0.04,
                  shadowRadius: 16,
                  shadowOffset: { width: 0, height: 8 },
                  elevation: 2,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginBottom: 22,
                  }}
                >
                  <View
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 24,
                      backgroundColor: '#F1F1F1',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 12,
                    }}
                  >
                    <Text style={{ color: '#111111', fontSize: 16, fontWeight: '500' }}>{STORE_BRAND.avatarText}</Text>
                  </View>
                  <View>
                    <Text style={{ color: '#111111', fontSize: 16, fontWeight: '500' }}>{STORE_BRAND.name}</Text>
                    <Text style={{ color: '#111111', fontSize: 12, fontWeight: '400', marginTop: 4 }}>
                      {STORE_BRAND.rating} ★ ({STORE_BRAND.reviewCount})
                    </Text>
                  </View>
                </View>

                <View style={{ gap: isMobile ? 22 : 26 }}>
                  {cartProducts.map(({ item, product, lineTotal }) => (
                    <View
                      key={product.id}
                      style={{
                        flexDirection: isMobile ? 'column' : 'row',
                        alignItems: isMobile ? 'flex-start' : 'stretch',
                        gap: isMobile ? 16 : 20,
                      }}
                    >
                      <Pressable onPress={() => router.push(`/storefront-product/${product.id}` as any)}>
                        <Image
                          source={{ uri: product.images[0] }}
                          style={{
                            width: isMobile ? '100%' : 76,
                            height: isMobile ? 168 : 112,
                            borderRadius: 20,
                            backgroundColor: '#F3F3F7',
                          }}
                          resizeMode="cover"
                        />
                      </Pressable>

                      <View style={{ flex: 1, justifyContent: 'space-between', minHeight: isMobile ? undefined : 112 }}>
                        <View
                          style={{
                            flexDirection: isMobile ? 'column' : 'row',
                            alignItems: isMobile ? 'flex-start' : 'flex-start',
                            justifyContent: 'space-between',
                            gap: 14,
                          }}
                        >
                          <View style={{ flex: 1, paddingRight: isMobile ? 0 : 18 }}>
                            <Text style={{ color: '#111111', fontSize: 16, fontWeight: '500', lineHeight: 22 }}>
                              {product.name}
                            </Text>
                            <Text style={{ color: '#737373', fontSize: 16, fontWeight: '400', marginTop: 8 }}>
                              {product.category}
                              {item.selectedSize ? ` · ${item.selectedSize}` : ''}
                            </Text>
                          </View>

                          <View style={{ alignItems: isMobile ? 'flex-start' : 'flex-end' }}>
                            <Text style={{ color: '#111111', fontSize: 16, fontWeight: '600' }}>
                              ₦{lineTotal.toLocaleString()}
                            </Text>
                            {product.compareAtPrice ? (
                              <Text
                                style={{
                                  color: '#8C8C8C',
                                  fontSize: 16,
                                  fontWeight: '400',
                                  textDecorationLine: 'line-through',
                                  marginTop: 6,
                                }}
                              >
                                {product.compareAtPrice}
                              </Text>
                            ) : null}
                          </View>
                        </View>

                        <View
                          style={{
                            flexDirection: isMobile ? 'column' : 'row',
                            alignItems: isMobile ? 'stretch' : 'center',
                            gap: 12,
                            marginTop: 20,
                          }}
                        >
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              alignSelf: 'flex-start',
                              height: 44,
                              borderRadius: 999,
                              borderWidth: 1,
                              borderColor: 'rgba(15, 23, 42, 0.10)',
                              paddingHorizontal: 8,
                              gap: 10,
                              backgroundColor: '#FFFFFF',
                            }}
                          >
                            <Pressable
                              onPress={() => removeCartItem(product.id)}
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 14,
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <Trash2 size={18} color="#111111" strokeWidth={2.1} />
                            </Pressable>
                            <Text style={{ color: '#111111', fontSize: 16, fontWeight: '500', minWidth: 20, textAlign: 'center' }}>
                              {item.quantity}
                            </Text>
                            <Pressable
                              onPress={() => updateCartQuantity(product.id, item.quantity + 1)}
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 14,
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <Plus size={22} color="#111111" strokeWidth={2.2} />
                            </Pressable>
                          </View>

                          <Pressable
                            onPress={() => moveCartItemToSaved(product.id)}
                            style={({ hovered }) => ({
                              height: 44,
                              borderRadius: 999,
                              borderWidth: 1,
                              borderColor: 'rgba(15, 23, 42, 0.10)',
                              paddingHorizontal: 18,
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor: hovered ? '#F7F7F8' : '#FFFFFF',
                            })}
                          >
                            <Text style={{ color: '#111111', fontSize: 14, fontWeight: '500' }}>Save for later</Text>
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>

                <View
                  style={{
                    height: 1,
                    backgroundColor: 'rgba(15, 23, 42, 0.08)',
                    marginTop: 28,
                    marginBottom: 28,
                  }}
                />

                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Text style={{ color: '#111111', fontSize: 16, fontWeight: '400' }}>Subtotal</Text>
                  <Text style={{ color: '#111111', fontSize: 16, fontWeight: '600' }}>{subtotalLabel}</Text>
                </View>

                <Pressable
                  onPress={() => router.push('/storefront-checkout' as any)}
                  style={({ hovered }) => ({
                    marginTop: 24,
                    height: 50,
                    borderRadius: 999,
                    backgroundColor: hovered ? '#242424' : '#111111',
                    alignItems: 'center',
                    justifyContent: 'center',
                    shadowColor: '#111111',
                    shadowOpacity: 0.08,
                    shadowRadius: 18,
                    shadowOffset: { width: 0, height: 8 },
                    elevation: 2,
                  })}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '500' }}>Continue to checkout</Text>
                </Pressable>

                <View
                  style={{
                    flexDirection: isMobile ? 'column' : 'row',
                    alignItems: isMobile ? 'flex-start' : 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    marginTop: 18,
                  }}
                >
                  <Text style={{ color: '#737373', fontSize: 16, fontWeight: '400' }}>
                    Shipping and taxes are calculated at checkout.
                  </Text>
                  <Text style={{ color: '#737373', fontSize: 16, fontWeight: '400' }}>
                    Saved items: {savedProductIds.length}
                  </Text>
                </View>
              </View>

              <Pressable
                onPress={() => router.push('/storefront-prototype' as any)}
                style={{
                  marginTop: 18,
                  alignSelf: 'center',
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#111111', fontSize: 16, fontWeight: '500' }}>Keep shopping</Text>
                <ChevronRight size={15} color="#111111" strokeWidth={2.2} style={{ marginLeft: 6 }} />
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
