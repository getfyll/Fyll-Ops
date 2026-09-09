import React, { useMemo, useRef, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, ChevronDown, Heart, SlidersHorizontal, Star, X } from 'lucide-react-native';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { StorefrontHeader } from '@/components/storefront-header';

type StoreCategory = 'All' | 'Optical' | 'Sunglasses' | 'Accessories' | 'New Drops';

type StoreProduct = {
  id: string;
  name: string;
  price: string;
  priceValue: number;
  reviews: number;
  category: Exclude<StoreCategory, 'All'>;
  imageUrl: string;
  tag?: string;
  isOnSale?: boolean;
  inStock?: boolean;
  sortRank: number;
  createdOrder: number;
};

type SortOption = 'best-selling' | 'newest' | 'price-low-high' | 'price-high-low';

const CATEGORY_ITEMS: StoreCategory[] = ['All', 'Optical', 'Sunglasses', 'Accessories', 'New Drops'];

const STORE_PRODUCTS: StoreProduct[] = [
  {
    id: '1',
    name: 'Muna Crystal',
    price: '₦74,500',
    priceValue: 74500,
    reviews: 184,
    category: 'Optical',
    imageUrl: 'https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=1200&q=80',
    inStock: true,
    sortRank: 2,
    createdOrder: 4,
  },
  {
    id: '2',
    name: 'Regina Tortoise',
    price: '₦81,000',
    priceValue: 81000,
    reviews: 129,
    category: 'Sunglasses',
    imageUrl: 'https://images.unsplash.com/photo-1577803645773-f96470509666?auto=format&fit=crop&w=1200&q=80',
    tag: 'Best Seller',
    isOnSale: true,
    inStock: true,
    sortRank: 1,
    createdOrder: 2,
  },
  {
    id: '3',
    name: 'Lagos Clip Case',
    price: '₦18,500',
    priceValue: 18500,
    reviews: 92,
    category: 'Accessories',
    imageUrl: 'https://images.unsplash.com/photo-1516574187841-cb9cc2ca948b?auto=format&fit=crop&w=1200&q=80',
    isOnSale: true,
    inStock: true,
    sortRank: 5,
    createdOrder: 5,
  },
  {
    id: '4',
    name: 'Bold Noir',
    price: '₦69,000',
    priceValue: 69000,
    reviews: 140,
    category: 'Optical',
    imageUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=1200&q=80',
    tag: 'New',
    inStock: false,
    sortRank: 4,
    createdOrder: 1,
  },
  {
    id: '5',
    name: 'Sam Grey',
    price: '₦77,500',
    priceValue: 77500,
    reviews: 166,
    category: 'New Drops',
    imageUrl: 'https://images.unsplash.com/photo-1511920170033-f8396924c348?auto=format&fit=crop&w=1200&q=80',
    inStock: true,
    sortRank: 3,
    createdOrder: 3,
  },
  {
    id: '6',
    name: 'Abdul Silver',
    price: '₦72,000',
    priceValue: 72000,
    reviews: 118,
    category: 'Sunglasses',
    imageUrl: 'https://images.unsplash.com/photo-1508296695146-257a814070b4?auto=format&fit=crop&w=1200&q=80',
    isOnSale: true,
    inStock: true,
    sortRank: 6,
    createdOrder: 6,
  },
];

const SORT_OPTION_LABELS: Record<SortOption, string> = {
  'best-selling': 'Best selling',
  newest: 'Newest',
  'price-low-high': 'Price: Low - High',
  'price-high-low': 'Price: High - Low',
};

export default function StorefrontPrototypeScreen() {
  const router = useRouter();
  const { isMobile, isDesktop } = useBreakpoint();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const sortTriggerRef = useRef<View | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<StoreCategory>('All');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>('best-selling');
  const [onSaleOnly, setOnSaleOnly] = useState(false);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [priceLimit, setPriceLimit] = useState<'all' | 'under-20000' | 'under-50000' | 'under-80000'>('all');
  const [isFollowing, setIsFollowing] = useState(false);
  const [sortMenuAnchor, setSortMenuAnchor] = useState({ x: 0, y: 0, width: 0, height: 0 });

  const filteredProducts = useMemo(() => {
      let products = selectedCategory === 'All'
        ? [...STORE_PRODUCTS]
        : STORE_PRODUCTS.filter((product) => product.category === selectedCategory);

      if (onSaleOnly) {
        products = products.filter((product) => product.isOnSale);
      }

      if (inStockOnly) {
        products = products.filter((product) => product.inStock);
      }

      if (priceLimit === 'under-20000') {
        products = products.filter((product) => product.priceValue <= 20000);
      } else if (priceLimit === 'under-50000') {
        products = products.filter((product) => product.priceValue <= 50000);
      } else if (priceLimit === 'under-80000') {
        products = products.filter((product) => product.priceValue <= 80000);
      }

      products.sort((a, b) => {
        switch (sortOption) {
          case 'newest':
            return a.createdOrder - b.createdOrder;
          case 'price-low-high':
            return a.priceValue - b.priceValue;
          case 'price-high-low':
            return b.priceValue - a.priceValue;
          case 'best-selling':
          default:
            return a.sortRank - b.sortRank;
        }
      });

      return products;
  }, [inStockOnly, onSaleOnly, priceLimit, selectedCategory, sortOption]);

  const cardWidth = isMobile ? '100%' : isDesktop ? '15.3%' : '31.5%';

  const resetFilters = () => {
    setSortOption('best-selling');
    setOnSaleOnly(false);
    setInStockOnly(false);
    setPriceLimit('all');
  };

  const openSortMenu = () => {
    requestAnimationFrame(() => {
      sortTriggerRef.current?.measureInWindow((x, y, width, height) => {
        setSortMenuAnchor({ x, y, width, height });
        setShowSortMenu(true);
      });
    });
  };

  const sortMenuWidth = isMobile ? 268 : 332;
  const sortMenuLeft = Math.min(
    Math.max(16, sortMenuAnchor.x + (sortMenuAnchor.width - sortMenuWidth) / 2),
    Math.max(16, windowWidth - sortMenuWidth - 16)
  );
  const sortMenuTop = Math.min(
    sortMenuAnchor.y + sortMenuAnchor.height + 8,
    Math.max(16, windowHeight - 360)
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#EEF5FB' }}>
      <Stack.Screen options={{ headerShown: false }} />

      <LinearGradient
        colors={['#EEF5FB', '#F8FBFD', '#FFFFFF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: isMobile ? 14 : 22,
            paddingTop: isMobile ? 14 : 22,
            paddingBottom: 42,
          }}
          showsVerticalScrollIndicator={false}
        >
          <View
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 28,
              borderWidth: 1,
              borderColor: 'rgba(15, 23, 42, 0.08)',
              overflow: 'hidden',
              shadowColor: '#0F172A',
              shadowOpacity: 0.04,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 8 },
              elevation: 3,
            }}
          >
            <StorefrontHeader isMobile={isMobile} />

            <View
              style={{
                paddingHorizontal: isMobile ? 16 : 36,
                paddingTop: isMobile ? 34 : '8%',
                paddingBottom: isMobile ? 42 : '8%',
              }}
            >
              <View style={{ alignItems: 'center' }}>
                <Text
                  style={{
                    color: '#111111',
                    fontSize: isMobile ? 38 : 50,
                    lineHeight: isMobile ? 42 : 54,
                    fontWeight: '700',
                    letterSpacing: -1.6,
                  }}
                >
                  Fyll Store
                </Text>
                <Text style={{ color: '#A3A3A3', fontSize: 15, marginTop: 8, textAlign: 'center' }}>
                  Discover brands, products, and curated drops across Fyll.
                </Text>

                <Pressable
                  onPress={() => setIsFollowing((current) => !current)}
                  style={{
                    marginTop: 22,
                    height: 52,
                    paddingHorizontal: 28,
                    borderRadius: 999,
                    backgroundColor: isFollowing ? '#111111' : '#FFFFFF',
                    borderWidth: 1,
                    borderColor: isFollowing ? '#111111' : 'rgba(17,17,17,0.06)',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    shadowColor: '#111111',
                    shadowOpacity: 0.08,
                    shadowRadius: 14,
                    shadowOffset: { width: 0, height: 6 },
                    elevation: 3,
                  }}
                >
                  {isFollowing ? (
                    <View
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 13,
                        backgroundColor: '#E9E9EA',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 6,
                      }}
                    >
                      <View
                        style={{
                          position: 'absolute',
                          width: 13,
                          height: 13,
                          borderRadius: 3,
                          backgroundColor: '#111111',
                          transform: [{ rotate: '45deg' }],
                        }}
                      />
                      <View
                        style={{
                          position: 'absolute',
                          width: 13,
                          height: 13,
                          borderRadius: 3,
                          backgroundColor: '#111111',
                        }}
                      />
                      <View
                        style={{
                          position: 'absolute',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Check size={9} color="#E9E9EA" strokeWidth={3.4} />
                      </View>
                    </View>
                  ) : (
                    <Text style={{ color: '#111111', fontSize: 14, fontWeight: '500', marginRight: 6 }}>+</Text>
                  )}
                  <Text
                    style={{
                      color: isFollowing ? '#FFFFFF' : '#111111',
                      fontSize: 12,
                      fontWeight: '500',
                      marginLeft: isFollowing ? 6 : 0,
                    }}
                  >
                    {isFollowing ? 'Following' : 'Follow'}
                  </Text>
                </Pressable>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginTop: 24, flexGrow: 0 }}
                  contentContainerStyle={{ gap: 10, paddingHorizontal: 6 }}
                >
                  {CATEGORY_ITEMS.map((item) => {
                    const active = selectedCategory === item;
                    return (
                      <Pressable
                        key={item}
                        onPress={() => setSelectedCategory(item)}
                        style={{
                          height: 38,
                          borderRadius: 999,
                          paddingHorizontal: 18,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: active ? '#111111' : '#FFFFFF',
                          borderWidth: 1,
                          borderColor: active ? '#111111' : 'rgba(15, 23, 42, 0.08)',
                        }}
                      >
                        <Text
                          style={{
                            color: active ? '#FFFFFF' : '#737373',
                            fontSize: 12,
                            fontWeight: '500',
                          }}
                        >
                          {item}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              <View
                style={{
                  marginTop: isMobile ? 72 : '8%',
                  marginLeft: isMobile ? -16 : -36,
                  marginRight: isMobile ? -16 : -36,
                  backgroundColor: '#FAFAFA',
                  borderRadius: isMobile ? 26 : 34,
                  paddingHorizontal: isMobile ? 16 : 36,
                  paddingTop: isMobile ? 38 : 54,
                  paddingBottom: isMobile ? 34 : 46,
                  shadowColor: '#111111',
                  shadowOpacity: 0.02,
                  shadowRadius: 14,
                  shadowOffset: { width: 0, height: 6 },
                  elevation: 1,
                }}
              >
                <Text style={{ color: '#111111', fontSize: 18, fontWeight: '500' }}>Products</Text>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginTop: 18, flexGrow: 0 }}
                  contentContainerStyle={{ gap: 10 }}
                >
                  <Pressable
                    onPress={() => setShowFilterPanel(true)}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      borderWidth: 1,
                      borderColor: 'rgba(15, 23, 42, 0.08)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <SlidersHorizontal size={16} color="#8A8A8A" strokeWidth={2} />
                  </Pressable>
                  <View ref={sortTriggerRef} collapsable={false}>
                    <Pressable
                      onPress={openSortMenu}
                      style={{
                        height: 40,
                        borderRadius: 999,
                        paddingHorizontal: 16,
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'row',
                        backgroundColor: '#111111',
                        borderWidth: 1,
                        borderColor: '#111111',
                      }}
                    >
                      <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '500' }}>
                        Sort by
                      </Text>
                      <ChevronDown size={15} color="#FFFFFF" strokeWidth={2} style={{ marginLeft: 8 }} />
                    </Pressable>
                  </View>
                  <Pressable
                    onPress={() => setOnSaleOnly((current) => !current)}
                    style={{
                      height: 40,
                      borderRadius: 999,
                      paddingHorizontal: 16,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: onSaleOnly ? '#111111' : '#FFFFFF',
                      borderWidth: 1,
                      borderColor: onSaleOnly ? '#111111' : 'rgba(15, 23, 42, 0.08)',
                    }}
                  >
                    <Text style={{ color: onSaleOnly ? '#FFFFFF' : '#111111', fontSize: 12, fontWeight: '500' }}>
                      On sale
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setShowFilterPanel(true)}
                    style={{
                      height: 40,
                      borderRadius: 999,
                      paddingHorizontal: 16,
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'row',
                      backgroundColor: priceLimit === 'all' ? '#FFFFFF' : '#111111',
                      borderWidth: 1,
                      borderColor: priceLimit === 'all' ? 'rgba(15, 23, 42, 0.08)' : '#111111',
                    }}
                  >
                    <Text style={{ color: priceLimit === 'all' ? '#525252' : '#FFFFFF', fontSize: 12, fontWeight: '500' }}>
                      Price
                    </Text>
                    <ChevronDown
                      size={15}
                      color={priceLimit === 'all' ? '#525252' : '#FFFFFF'}
                      strokeWidth={2}
                      style={{ marginLeft: 8 }}
                    />
                  </Pressable>
                  <Pressable
                    onPress={() => setInStockOnly((current) => !current)}
                    style={{
                      height: 40,
                      borderRadius: 999,
                      paddingHorizontal: 16,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: inStockOnly ? '#111111' : '#FFFFFF',
                      borderWidth: 1,
                      borderColor: inStockOnly ? '#111111' : 'rgba(15, 23, 42, 0.08)',
                    }}
                  >
                    <Text style={{ color: inStockOnly ? '#FFFFFF' : '#111111', fontSize: 12, fontWeight: '500' }}>
                      In-stock
                    </Text>
                  </Pressable>
                </ScrollView>

                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: isMobile ? 16 : 18,
                    marginTop: 28,
                  }}
                >
                  {filteredProducts.map((product) => (
                    <Pressable
                      key={product.id}
                      onPress={() => router.push(`/storefront-product/${product.id}` as any)}
                      style={{
                        width: cardWidth,
                        minWidth: isMobile ? undefined : 210,
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
                        <Image
                          source={{ uri: product.imageUrl }}
                          style={{ width: '100%', height: '100%' }}
                          resizeMode="cover"
                        />
                        {product.tag ? (
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
                            <Text style={{ color: '#111111', fontSize: 12, fontWeight: '500' }}>{product.tag}</Text>
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

                      <Text style={{ color: '#1A1A1A', fontSize: 12, fontWeight: '500', marginTop: 10 }}>
                        {product.name}
                      </Text>

                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                        {[0, 1, 2, 3, 4].map((index) => (
                          <Star key={index} size={13} color="#111111" fill="#111111" strokeWidth={1.6} />
                        ))}
                        <Text style={{ color: '#A3A3A3', fontSize: 13, marginLeft: 8 }}>
                          ({product.reviews})
                        </Text>
                      </View>

                      <Text style={{ color: '#111111', fontSize: 12, fontWeight: '700', marginTop: 4 }}>
                        {product.price}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
          </View>
        </ScrollView>

        <Modal
          visible={showSortMenu}
          transparent
          animationType="fade"
          onRequestClose={() => setShowSortMenu(false)}
        >
          <Pressable
            style={{ flex: 1, backgroundColor: 'rgba(17,17,17,0.12)' }}
            onPress={() => setShowSortMenu(false)}
          >
            <View
              style={{
                position: 'absolute',
                top: sortMenuTop,
                left: sortMenuLeft,
                width: sortMenuWidth,
                maxWidth: windowWidth - 32,
                backgroundColor: '#FFFFFF',
                borderRadius: 30,
                paddingHorizontal: 20,
                paddingTop: 20,
                paddingBottom: 18,
                shadowColor: '#111111',
                shadowOpacity: 0.08,
                shadowRadius: 20,
                shadowOffset: { width: 0, height: 10 },
                elevation: 6,
              }}
            >
              {(['best-selling', 'newest', 'price-low-high', 'price-high-low'] as SortOption[]).map((option) => {
                const active = sortOption === option;
                return (
                  <Pressable
                    key={option}
                    onPress={() => setSortOption(option)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingVertical: 14,
                    }}
                  >
                    <Text style={{ color: '#111111', fontSize: 14, fontWeight: '500' }}>
                      {SORT_OPTION_LABELS[option]}
                    </Text>
                    <View
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        borderWidth: 1.5,
                        borderColor: active ? '#111111' : '#D4D4D4',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {active ? (
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#111111' }} />
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}

              <View style={{ flexDirection: 'row', gap: 12, marginTop: 14 }}>
                <Pressable
                  onPress={resetFilters}
                  style={{
                    flex: 1,
                    height: 48,
                    borderRadius: 24,
                    backgroundColor: '#F3F4F6',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: '#111111', fontSize: 14, fontWeight: '500' }}>Reset</Text>
                </Pressable>
                <Pressable
                  onPress={() => setShowSortMenu(false)}
                  style={{
                    flex: 1,
                    height: 48,
                    borderRadius: 24,
                    backgroundColor: '#111111',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '500' }}>Done</Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </Modal>

        <Modal
          visible={showFilterPanel}
          transparent
          animationType="fade"
          onRequestClose={() => setShowFilterPanel(false)}
        >
          <View style={{ flex: 1, flexDirection: 'row' }}>
            <View
              style={{
                width: isMobile ? '68%' : 340,
                maxWidth: '84%',
                backgroundColor: '#FFFFFF',
                borderTopRightRadius: 34,
                borderBottomRightRadius: 34,
                paddingHorizontal: 28,
                paddingTop: 24,
                paddingBottom: 28,
                shadowColor: '#111111',
                shadowOpacity: 0.08,
                shadowRadius: 20,
                shadowOffset: { width: 0, height: 10 },
                elevation: 8,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: '#111111', fontSize: 14, fontWeight: '500' }}>Filters</Text>
                <Pressable
                  onPress={() => setShowFilterPanel(false)}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    backgroundColor: '#8F8F8F',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <X size={18} color="#FFFFFF" strokeWidth={2.5} />
                </Pressable>
              </View>

              <ScrollView style={{ marginTop: 34 }} showsVerticalScrollIndicator={false}>
                <Text style={{ color: '#111111', fontSize: 14, fontWeight: '500', marginBottom: 22 }}>Sort by</Text>
                {(['best-selling', 'newest', 'price-low-high', 'price-high-low'] as SortOption[]).map((option) => {
                  const active = sortOption === option;
                  return (
                    <Pressable
                      key={option}
                      onPress={() => setSortOption(option)}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 }}
                    >
                      <Text style={{ color: '#111111', fontSize: 14, fontWeight: '500' }}>
                        {SORT_OPTION_LABELS[option]}
                      </Text>
                      <View
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 11,
                          borderWidth: 1.5,
                          borderColor: active ? '#111111' : '#D4D4D4',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {active ? <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#111111' }} /> : null}
                      </View>
                    </Pressable>
                  );
                })}

                <View style={{ height: 1, backgroundColor: '#ECECEC', marginVertical: 18 }} />

                {[
                  { label: 'On sale', value: onSaleOnly, action: () => setOnSaleOnly((current) => !current) },
                  { label: 'In-stock', value: inStockOnly, action: () => setInStockOnly((current) => !current) },
                ].map((item) => (
                  <Pressable
                    key={item.label}
                    onPress={item.action}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16 }}
                  >
                    <Text style={{ color: '#111111', fontSize: 14, fontWeight: '500' }}>{item.label}</Text>
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 10,
                        backgroundColor: item.value ? '#111111' : '#FFFFFF',
                        borderWidth: 1.5,
                        borderColor: item.value ? '#111111' : '#D4D4D4',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {item.value ? <Check size={18} color="#FFFFFF" strokeWidth={2.5} /> : null}
                    </View>
                  </Pressable>
                ))}

                <View style={{ height: 1, backgroundColor: '#ECECEC', marginVertical: 18 }} />

                <Text style={{ color: '#111111', fontSize: 14, fontWeight: '500', marginBottom: 18 }}>Price</Text>
                <View style={{ paddingHorizontal: 8 }}>
                  <View style={{ height: 4, borderRadius: 999, backgroundColor: '#5B34F2' }} />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: -12 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#5B34F2' }} />
                    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#5B34F2' }} />
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 14, marginTop: 18 }}>
                  {[
                    { key: 'under-20000', label: '0 - 20k' },
                    { key: 'under-50000', label: '0 - 50k' },
                    { key: 'under-80000', label: '0 - 80k' },
                    { key: 'all', label: '2000+' },
                  ].map((option) => {
                    const active = priceLimit === option.key;
                    return (
                      <Pressable
                        key={option.key}
                        onPress={() => setPriceLimit(option.key as typeof priceLimit)}
                        style={{
                          minWidth: 104,
                          height: 54,
                          borderRadius: 14,
                          paddingHorizontal: 16,
                          backgroundColor: active ? '#111111' : '#FFFFFF',
                          borderWidth: 1,
                          borderColor: '#E5E7EB',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text style={{ color: active ? '#FFFFFF' : '#111111', fontSize: 14, fontWeight: '500' }}>
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>

              <View style={{ flexDirection: 'row', gap: 14, marginTop: 24 }}>
                <Pressable
                  onPress={resetFilters}
                  style={{
                    flex: 1,
                    height: 56,
                    borderRadius: 28,
                    backgroundColor: '#F3F4F6',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: '#111111', fontSize: 14, fontWeight: '500' }}>Reset</Text>
                </Pressable>
                <Pressable
                  onPress={() => setShowFilterPanel(false)}
                  style={{
                    flex: 1,
                    height: 56,
                    borderRadius: 28,
                    backgroundColor: '#111111',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '500' }}>Done</Text>
                </Pressable>
              </View>
            </View>

            <Pressable
              style={{ flex: 1, backgroundColor: 'rgba(17,17,17,0.34)' }}
              onPress={() => setShowFilterPanel(false)}
            />
          </View>
        </Modal>
      </LinearGradient>
    </SafeAreaView>
  );
}
