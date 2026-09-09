import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Share, Text, useWindowDimensions, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, ChevronDown, ChevronLeft, Heart, MapPin, MoreHorizontal, Share2, Star, Truck, X } from 'lucide-react-native';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { StorefrontHeader } from '@/components/storefront-header';
import { useStorefrontStore } from '@/lib/storefront-store';
import { PRODUCT_DETAILS } from '@/lib/storefront-catalog';

export default function StorefrontProductScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isMobile } = useBreakpoint();
  const { width: windowWidth } = useWindowDimensions();
  const product = PRODUCT_DETAILS[id ?? '2'] ?? PRODUCT_DETAILS['2'];
  const [selectedImage, setSelectedImage] = useState(product.images[0]);
  const [selectedSize, setSelectedSize] = useState(product.sizes[0]);
  const [quantity, setQuantity] = useState(1);
  const [showPolicyModal, setShowPolicyModal] = useState<null | 'shipping' | 'returns'>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addToCart = useStorefrontStore((state) => state.addToCart);
  const toggleSavedProduct = useStorefrontStore((state) => state.toggleSavedProduct);
  const saved = useStorefrontStore((state) => state.savedProductIds.includes(product.id));

  const reviewAverage = useMemo(() => {
    const total = product.reviewBars.reduce((sum, value) => sum + value, 0);
    return total === 0 ? 0 : total / product.reviewBars.length;
  }, [product.reviewBars]);

  const relatedProducts = useMemo(
    () =>
      Object.values(PRODUCT_DETAILS)
        .filter((item) => item.id !== product.id)
        .slice(0, 6),
    [product.id]
  );

  const pageGutter = isMobile ? 14 : Math.max(48, Math.min(180, windowWidth * 0.1));
  const relatedCardWidth = isMobile ? windowWidth - pageGutter * 2 : (windowWidth - pageGutter * 2 - 80) / 6;
  const policyTitle = showPolicyModal === 'shipping' ? 'Shipping Policy' : 'Return Policy';
  const policyBody =
    showPolicyModal === 'shipping'
      ? 'Fyll ships across Nigeria and selected international destinations. Delivery timelines depend on the shipping option selected at checkout. Orders are processed before dispatch, and working days exclude weekends and public holidays. Shipping fees are calculated at checkout based on your address and order size.'
      : 'Returns are accepted on eligible items within the stated return window, provided the product is unused and in original condition. Prescription or custom items may not be returnable unless faulty. Once your return is approved, refunds are processed back to the original payment method.';

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
    }
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  };

  useEffect(() => {
    return () => {
      if (toastTimer.current) {
        clearTimeout(toastTimer.current);
      }
    };
  }, []);

  const handleAddToCart = () => {
    addToCart(product.id, quantity, selectedSize);
    showToast('success', `${quantity} item${quantity > 1 ? 's' : ''} added to cart.`);
  };

  const handleBuyNow = () => {
    addToCart(product.id, quantity, selectedSize);
    showToast('success', 'Added to cart. Ready for checkout.');
    router.push('/storefront-cart' as any);
  };

  const handleToggleSaved = () => {
    toggleSavedProduct(product.id);
    showToast('success', saved ? 'Removed from saved items.' : 'Saved for later.');
  };

  const handleShareProduct = async () => {
    try {
      await Share.share({
        message: `${product.brand} ${product.name} • ${product.price}`,
        title: `${product.brand} ${product.name}`,
      });
      showToast('success', 'Product details shared.');
    } catch {
      showToast('error', 'Could not open share right now.');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingBottom: 54,
          }}
          showsVerticalScrollIndicator={false}
        >
          <StorefrontHeader isMobile={isMobile} centerTitle={product.brand} />

          <View
            style={{
              paddingHorizontal: pageGutter,
              paddingTop: isMobile ? 26 : 42,
            paddingBottom: 54,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 26,
              }}
            >
              <Pressable
                onPress={() => router.back()}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  backgroundColor: '#FFFFFF',
                  borderWidth: 1,
                  borderColor: 'rgba(15, 23, 42, 0.08)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ChevronLeft size={18} color="#111111" strokeWidth={2.2} />
              </Pressable>

              <View />

              <Pressable
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  backgroundColor: '#FFFFFF',
                  borderWidth: 1,
                  borderColor: 'rgba(15, 23, 42, 0.08)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <MoreHorizontal size={18} color="#111111" strokeWidth={2.1} />
              </Pressable>
            </View>

            <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 22 : 36 }}>
              <View
                style={
                  isMobile
                    ? { flex: undefined, marginRight: 0 }
                    : ({
                        flex: 0.84,
                        marginRight: 28,
                        alignSelf: 'flex-start',
                        position: 'sticky',
                        top: 110,
                      } as any)
                }
              >
                <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 16 : 34 }}>
                  <View style={{ alignSelf: isMobile ? 'stretch' : 'center' }}>
                    <ScrollView
                      horizontal={isMobile}
                      showsHorizontalScrollIndicator={false}
                      showsVerticalScrollIndicator={false}
                      style={{ flexGrow: 0 }}
                      contentContainerStyle={{
                        gap: 10,
                        flexDirection: isMobile ? 'row' : 'column',
                      }}
                    >
                      {product.images.map((image) => {
                        const active = selectedImage === image;
                        return (
                          <Pressable
                            key={image}
                            onPress={() => setSelectedImage(image)}
                            style={{
                              width: 60,
                              height: 72,
                              borderRadius: 16,
                              overflow: 'hidden',
                              borderWidth: active ? 1.5 : 1,
                              borderColor: active ? '#111111' : 'rgba(15, 23, 42, 0.08)',
                              backgroundColor: '#F7F7F7',
                            }}
                          >
                            <Image source={{ uri: image }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>

                  <View
                    style={{
                      flex: 1,
                      borderRadius: 28,
                      backgroundColor: 'transparent',
                      overflow: 'hidden',
                      minHeight: isMobile ? 420 : 900,
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingVertical: 24,
                      paddingHorizontal: isMobile ? 18 : 30,
                    }}
                  >
                    <View
                      style={{
                        width: isMobile ? '82%' : 700,
                        height: isMobile ? '100%' : 900,
                        maxWidth: isMobile ? 460 : 700,
                        borderRadius: 22,
                        overflow: 'hidden',
                      }}
                    >
                      <Image
                        source={{ uri: selectedImage }}
                        style={{ width: '100%', height: '100%' }}
                        resizeMode="cover"
                      />
                    </View>
                  </View>
                </View>
              </View>

              <View style={{ flex: 0.8, maxWidth: isMobile ? undefined : 430 }}>
                <Text style={{ color: '#737373', fontSize: 14, fontWeight: '500' }}>{product.brand}</Text>
                <Text
                  style={{
                    color: '#111111',
                    fontSize: 18,
                    lineHeight: 24,
                    fontWeight: '500',
                    marginTop: 10,
                  }}
                >
                  {product.name}
                </Text>

                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
                  {[0, 1, 2, 3, 4].map((index) => (
                    <Star key={index} size={14} color="#D4A514" fill="#D4A514" strokeWidth={1.6} />
                  ))}
                  <Text style={{ color: '#737373', fontSize: 14, fontWeight: '500', marginLeft: 8 }}>
                    {product.rating} ({product.ratingCount})
                  </Text>
                </View>

                <View
                  style={{
                    alignSelf: 'flex-start',
                    marginTop: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 999,
                    backgroundColor: '#F5F5F5',
                  }}
                >
                  <Text style={{ color: '#111111', fontSize: 14, fontWeight: '500' }}>{product.badge}</Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 16 }}>
                  <Text style={{ color: '#111111', fontSize: 18, fontWeight: '500' }}>{product.price}</Text>
                  {product.compareAtPrice ? (
                    <Text
                      style={{
                        color: '#A3A3A3',
                        fontSize: 16,
                        fontWeight: '500',
                        textDecorationLine: 'line-through',
                        marginLeft: 10,
                      }}
                    >
                      {product.compareAtPrice}
                    </Text>
                  ) : null}
                  {product.discount ? (
                    <View
                      style={{
                        marginLeft: 10,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 999,
                        backgroundColor: '#111111',
                      }}
                    >
                      <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '500' }}>{product.discount}</Text>
                    </View>
                  ) : null}
                </View>

                <View style={{ marginTop: 26 }}>
                  <Text style={{ color: '#111111', fontSize: 14, fontWeight: '500' }}>
                    Size <Text style={{ color: '#737373', fontWeight: '500' }}>{selectedSize}</Text>
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
                    {product.sizes.map((size) => {
                      const active = selectedSize === size;
                      return (
                        <Pressable
                          key={size}
                          onPress={() => setSelectedSize(size)}
                          style={({ hovered }) => ({
                            height: 44,
                            borderRadius: 999,
                            paddingHorizontal: 18,
                            backgroundColor: active ? '#111111' : hovered ? '#F4F4F5' : '#FFFFFF',
                            borderWidth: 1,
                            borderColor: active ? '#111111' : 'rgba(15, 23, 42, 0.08)',
                            alignItems: 'center',
                            justifyContent: 'center',
                          })}
                        >
                          <Text style={{ color: active ? '#FFFFFF' : '#111111', fontSize: 14, fontWeight: '500' }}>{size}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View style={{ marginTop: 24 }}>
                  <Text style={{ color: '#111111', fontSize: 14, fontWeight: '500' }}>Quantity</Text>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      alignSelf: 'flex-start',
                      marginTop: 12,
                      height: 44,
                      borderRadius: 999,
                      backgroundColor: '#FFFFFF',
                      borderWidth: 1,
                      borderColor: 'rgba(15, 23, 42, 0.08)',
                      paddingHorizontal: 10,
                      gap: 8,
                    }}
                  >
                    <Pressable
                      onPress={() => setQuantity((current) => Math.max(1, current - 1))}
                      style={{ width: 34, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Text style={{ color: '#737373', fontSize: 18, fontWeight: '500' }}>-</Text>
                    </Pressable>
                    <Text style={{ color: '#111111', fontSize: 16, fontWeight: '500', minWidth: 18, textAlign: 'center' }}>
                      {quantity}
                    </Text>
                    <Pressable
                      onPress={() => setQuantity((current) => current + 1)}
                      style={{ width: 34, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Text style={{ color: '#111111', fontSize: 18, fontWeight: '500' }}>+</Text>
                    </Pressable>
                  </View>
                </View>

                <View
                  style={{
                    marginTop: 28,
                    borderRadius: 28,
                    borderWidth: 1,
                    borderColor: 'rgba(15, 23, 42, 0.08)',
                    backgroundColor: '#FFFFFF',
                    overflow: 'hidden',
                    shadowColor: '#111111',
                    shadowOpacity: 0.05,
                    shadowRadius: 18,
                    shadowOffset: { width: 0, height: 8 },
                    elevation: 2,
                  }}
                >
                  <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 18 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                      <View>
                        <Text style={{ color: '#111111', fontSize: 16, fontWeight: '500' }}>One time purchase</Text>
                        <Text style={{ color: '#111111', fontSize: 18, fontWeight: '500', marginTop: 8 }}>{product.price}</Text>
                      </View>
                      <View
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 12,
                          borderWidth: 1.5,
                          borderColor: '#111111',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#111111' }} />
                      </View>
                    </View>

                    <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 12, marginTop: 18 }}>
                      <Pressable
                        onPress={handleBuyNow}
                        style={({ hovered }) => ({
                          flex: 1,
                          height: 56,
                          borderRadius: 999,
                          backgroundColor: hovered ? '#DADDE2' : '#E8EBEF',
                          alignItems: 'center',
                          justifyContent: 'center',
                          shadowColor: '#111111',
                          shadowOpacity: 0.05,
                          shadowRadius: 10,
                          shadowOffset: { width: 0, height: 4 },
                          elevation: 1,
                        })}
                      >
                        <Text style={{ color: '#222222', fontSize: 16, fontWeight: '500' }}>Buy now</Text>
                      </Pressable>
                      <Pressable
                        onPress={handleAddToCart}
                        style={({ hovered }) => ({
                          flex: 1,
                          height: 56,
                          borderRadius: 999,
                          backgroundColor: hovered ? '#242424' : '#111111',
                          alignItems: 'center',
                          justifyContent: 'center',
                          shadowColor: '#111111',
                          shadowOpacity: 0.08,
                          shadowRadius: 14,
                          shadowOffset: { width: 0, height: 6 },
                          elevation: 2,
                        })}
                      >
                        <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '500' }}>Add to cart</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
                  <Pressable
                    onPress={handleToggleSaved}
                    style={({ hovered }) => ({
                      flex: 1,
                      height: 48,
                      borderRadius: 999,
                      backgroundColor: hovered ? '#F8F8F8' : '#FFFFFF',
                      borderWidth: 1,
                      borderColor: 'rgba(15, 23, 42, 0.08)',
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                    })}
                  >
                    <Heart size={16} color="#111111" fill={saved ? '#111111' : 'transparent'} strokeWidth={2.1} />
                    <Text style={{ color: '#111111', fontSize: 14, fontWeight: '500', marginLeft: 8 }}>
                      {saved ? 'Saved' : 'Save'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={handleShareProduct}
                    style={({ hovered }) => ({
                      flex: 1,
                      height: 48,
                      borderRadius: 999,
                      backgroundColor: hovered ? '#F8F8F8' : '#FFFFFF',
                      borderWidth: 1,
                      borderColor: 'rgba(15, 23, 42, 0.08)',
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                    })}
                  >
                    <Share2 size={16} color="#111111" strokeWidth={2.1} />
                    <Text style={{ color: '#111111', fontSize: 14, fontWeight: '500', marginLeft: 8 }}>Share</Text>
                  </Pressable>
                </View>

                <View style={{ marginTop: 30 }}>
                  <View
                    style={{
                      borderRadius: 26,
                      borderWidth: 1,
                      borderColor: 'rgba(15, 23, 42, 0.08)',
                      backgroundColor: '#FFFFFF',
                      padding: 20,
                      marginBottom: 28,
                    }}
                  >
                    <Text style={{ color: '#111111', fontSize: 18, fontWeight: '500' }}>Delivery & Returns</Text>

                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 18 }}>
                      <MapPin size={17} color="#111111" strokeWidth={2.1} />
                      <Text style={{ color: '#525252', fontSize: 14, fontWeight: '400', marginLeft: 12 }}>
                        Ships to <Text style={{ color: '#111111', fontWeight: '500' }}>Lagos, NG</Text>
                      </Text>
                      <ChevronDown size={14} color="#111111" strokeWidth={2.2} style={{ marginLeft: 6 }} />
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16 }}>
                      <Truck size={17} color="#111111" strokeWidth={2.1} />
                      <Text style={{ color: '#525252', fontSize: 14, fontWeight: '400', marginLeft: 12 }}>
                        Shipping calculated at checkout
                      </Text>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16 }}>
                      <Truck size={17} color="#111111" strokeWidth={2.1} />
                      <Text style={{ color: '#525252', fontSize: 14, fontWeight: '400', marginLeft: 12 }}>
                        Arrives in 2-4 business days
                      </Text>
                    </View>

                    <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 12, marginTop: 22 }}>
                      <Pressable
                        onPress={() => setShowPolicyModal('returns')}
                        style={({ hovered }) => ({
                          flex: 1,
                          height: 52,
                          borderRadius: 999,
                          backgroundColor: hovered ? '#EBEBED' : '#F3F4F6',
                          alignItems: 'center',
                          justifyContent: 'center',
                        })}
                      >
                        <Text style={{ color: '#111111', fontSize: 16, fontWeight: '500' }}>Return policy</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setShowPolicyModal('shipping')}
                        style={({ hovered }) => ({
                          flex: 1,
                          height: 52,
                          borderRadius: 999,
                          backgroundColor: hovered ? '#EBEBED' : '#F3F4F6',
                          alignItems: 'center',
                          justifyContent: 'center',
                        })}
                      >
                        <Text style={{ color: '#111111', fontSize: 16, fontWeight: '500' }}>Shipping policy</Text>
                      </Pressable>
                    </View>
                  </View>

                  <Text style={{ color: '#111111', fontSize: 16, fontWeight: '500' }}>Description</Text>
                  <Text
                    style={{
                      color: '#525252',
                      fontSize: 14,
                      lineHeight: 22,
                      fontWeight: '400',
                      marginTop: 12,
                    }}
                  >
                    {product.description}
                  </Text>
                </View>

                <View
                  style={{
                    marginTop: 28,
                    borderRadius: 24,
                    backgroundColor: '#FFFFFF',
                    borderWidth: 1,
                    borderColor: 'rgba(15, 23, 42, 0.08)',
                    padding: 18,
                  }}
                >
                  <Text style={{ color: '#111111', fontSize: 16, fontWeight: '500' }}>Reviews</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 16 }}>
                    <View style={{ width: 88 }}>
                      <Text style={{ color: '#111111', fontSize: 18, fontWeight: '500' }}>{product.rating}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                        {[0, 1, 2, 3, 4].map((index) => (
                          <Star key={index} size={14} color="#D4A514" fill="#D4A514" strokeWidth={1.6} />
                        ))}
                      </View>
                      <Text style={{ color: '#737373', fontSize: 14, fontWeight: '500', marginTop: 8 }}>
                        {product.ratingCount}
                      </Text>
                    </View>

                    <View style={{ flex: 1, gap: 10 }}>
                      {product.reviewBars.map((value, index) => (
                        <View key={index} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <Text style={{ color: '#737373', fontSize: 14, fontWeight: '500', width: 10 }}>
                            {5 - index}
                          </Text>
                          <View style={{ flex: 1, height: 8, borderRadius: 999, backgroundColor: '#EFEFEF', overflow: 'hidden' }}>
                            <View
                              style={{
                                width: `${value}%`,
                                height: '100%',
                                borderRadius: 999,
                                backgroundColor: '#111111',
                              }}
                            />
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>

                  <Text style={{ color: '#737373', fontSize: 14, fontWeight: '500', marginTop: 16 }}>
                    Review sentiment average: {reviewAverage.toFixed(1)} / 5
                  </Text>
                </View>
              </View>
            </View>

            <View style={{ marginTop: 34 }}>
              <View
                style={{
                  flexDirection: isMobile ? 'column' : 'row',
                  alignItems: isMobile ? 'flex-start' : 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <Text style={{ color: '#111111', fontSize: 16, fontWeight: '500' }}>Related products</Text>
                <Text style={{ color: '#737373', fontSize: 14, fontWeight: '500' }}>More from the Fyll edit</Text>
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: 16,
                  marginTop: 18,
                }}
              >
                {relatedProducts.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => router.push(`/storefront-product/${item.id}` as any)}
                    style={{
                      width: relatedCardWidth,
                    }}
                  >
                    <View
                      style={{
                        borderRadius: 22,
                        overflow: 'hidden',
                        backgroundColor: '#F5F5F5',
                        aspectRatio: 0.84,
                        position: 'relative',
                      }}
                    >
                      <Image source={{ uri: item.images[0] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      {item.discount ? (
                        <View
                          style={{
                            position: 'absolute',
                            top: 14,
                            left: 14,
                            backgroundColor: 'rgba(255,255,255,0.92)',
                            borderRadius: 999,
                            paddingHorizontal: 12,
                            paddingVertical: 7,
                          }}
                        >
                          <Text style={{ color: '#111111', fontSize: 12, fontWeight: '500' }}>{item.discount}</Text>
                        </View>
                      ) : null}
                      <Pressable
                        style={{
                          position: 'absolute',
                          right: 12,
                          bottom: 12,
                          width: 34,
                          height: 34,
                          borderRadius: 17,
                          backgroundColor: 'rgba(186,186,186,0.92)',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Heart size={17} color="#FFFFFF" strokeWidth={2.1} />
                      </Pressable>
                    </View>

                    <Text style={{ color: '#1A1A1A', fontSize: 12, fontWeight: '500', marginTop: 10 }}>{item.name}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                      {[0, 1, 2, 3, 4].map((index) => (
                        <Star key={index} size={13} color="#D4A514" fill="#D4A514" strokeWidth={1.6} />
                      ))}
                      <Text style={{ color: '#A3A3A3', fontSize: 13, marginLeft: 8 }}>({item.ratingCount})</Text>
                    </View>
                    <Text style={{ color: '#111111', fontSize: 12, fontWeight: '700', marginTop: 4 }}>{item.price}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        </ScrollView>

      {toast && (
        <View
          style={{
            position: 'absolute',
            top: 96,
            right: 24,
            zIndex: 20,
          }}
        >
          <View
            style={{
              backgroundColor: toast.type === 'success' ? '#111111' : '#EF4444',
              borderRadius: 999,
              paddingHorizontal: 16,
              paddingVertical: 12,
              flexDirection: 'row',
              alignItems: 'center',
              shadowColor: '#111111',
              shadowOpacity: 0.12,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 8 },
              elevation: 3,
            }}
          >
            {toast.type === 'success' ? (
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: '#FFFFFF',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 10,
                }}
              >
                <Check size={12} color="#111111" strokeWidth={3} />
              </View>
            ) : null}
            <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '500' }}>{toast.message}</Text>
          </View>
        </View>
      )}

      <Modal visible={showPolicyModal !== null} transparent animationType="fade" onRequestClose={() => setShowPolicyModal(null)}>
        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', backgroundColor: 'rgba(17,17,17,0.22)' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowPolicyModal(null)} />
          <View
            style={{
              width: isMobile ? '92%' : 520,
              maxWidth: '100%',
              backgroundColor: '#FFFFFF',
              borderTopLeftRadius: 34,
              borderBottomLeftRadius: 34,
              paddingHorizontal: 32,
              paddingTop: 34,
              paddingBottom: 40,
              shadowColor: '#111111',
              shadowOpacity: 0.08,
              shadowRadius: 24,
              shadowOffset: { width: -8, height: 0 },
              elevation: 5,
            }}
          >
            <Pressable
              onPress={() => setShowPolicyModal(null)}
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: 'rgba(15, 23, 42, 0.06)',
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: '#111111',
                shadowOpacity: 0.06,
                shadowRadius: 16,
                shadowOffset: { width: 0, height: 8 },
                elevation: 2,
              }}
            >
              <X size={24} color="#111111" strokeWidth={2.4} />
            </Pressable>

            <ScrollView style={{ marginTop: 28 }} showsVerticalScrollIndicator={false}>
              <Text style={{ color: '#111111', fontSize: 18, fontWeight: '500' }}>{policyTitle}</Text>

              <Text style={{ color: '#525252', fontSize: 16, fontWeight: '500', marginTop: 28 }}>DELIVERY</Text>
              <Text
                style={{
                  color: '#525252',
                  fontSize: 16,
                  lineHeight: 30,
                  fontWeight: '400',
                  marginTop: 18,
                }}
              >
                {policyBody}
              </Text>

              <Text
                style={{
                  color: '#525252',
                  fontSize: 16,
                  lineHeight: 30,
                  fontWeight: '400',
                  marginTop: 28,
                }}
              >
                For full details, customers can review the relevant policy before checkout. Final shipping and return eligibility may vary by product type and delivery destination.
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
