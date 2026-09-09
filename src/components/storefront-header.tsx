import React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Menu, Search, ShoppingBag } from 'lucide-react-native';
import { useStorefrontStore } from '@/lib/storefront-store';

const NAV_ITEMS = ['New Arrivals', 'Best Sellers', 'On Sale', 'Categories', 'About'];

type StorefrontHeaderProps = {
  isMobile: boolean;
  centerTitle?: string;
};

export function StorefrontHeader({ isMobile, centerTitle }: StorefrontHeaderProps) {
  const router = useRouter();
  const centerInitial = centerTitle ? centerTitle.charAt(0).toUpperCase() : '';
  const cartCount = useStorefrontStore((state) => state.cartCount);

  return (
    <View
      style={{
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(15, 23, 42, 0.08)',
        paddingHorizontal: isMobile ? 16 : 28,
        paddingVertical: isMobile ? 14 : 18,
      }}
    >
      <View
        style={{
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'stretch' : 'center',
          justifyContent: 'space-between',
          gap: 14,
          position: 'relative',
        }}
      >
        {centerTitle && !isMobile ? (
          <View
            style={{
              position: 'absolute',
              left: '50%',
              top: 3,
              marginLeft: -90,
              width: 180,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                backgroundColor: '#111111',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 8,
              }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '500' }}>{centerInitial}</Text>
            </View>
            <Text
              style={{
                color: '#111111',
                fontSize: 14,
                fontWeight: '500',
              }}
              numberOfLines={1}
            >
              {centerTitle}
            </Text>
          </View>
        ) : null}

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: isMobile ? 14 : 18,
          }}
        >
          <Pressable
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Menu size={18} color="#111111" strokeWidth={2.2} />
          </Pressable>
          {NAV_ITEMS.map((item) => (
            <Text
              key={item}
              style={{
                color: '#737373',
                fontSize: 14,
                fontWeight: '500',
              }}
            >
              {item}
            </Text>
          ))}
        </View>

        {centerTitle && isMobile ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                backgroundColor: '#111111',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 8,
              }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '500' }}>{centerInitial}</Text>
            </View>
            <Text
              style={{
                color: '#111111',
                fontSize: 14,
                fontWeight: '500',
                textAlign: 'center',
              }}
            >
              {centerTitle}
            </Text>
          </View>
        ) : null}

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            justifyContent: isMobile ? 'space-between' : 'flex-end',
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: '#F7F7F7',
              borderRadius: 999,
              paddingHorizontal: 16,
              height: 42,
              minWidth: isMobile ? 0 : 220,
              flex: isMobile ? 1 : undefined,
            }}
          >
            <Search size={17} color="#A3A3A3" strokeWidth={2} />
            <TextInput
              placeholder="Search products..."
              placeholderTextColor="#A3A3A3"
              style={{
                flex: 1,
                marginLeft: 10,
                color: '#111111',
                fontSize: 14,
              }}
            />
          </View>

          <Pressable
            onPress={() => router.push('/storefront-cart' as any)}
            style={{
              height: 42,
              borderRadius: 999,
              backgroundColor: '#111111',
              paddingHorizontal: 16,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ShoppingBag size={15} color="#FFFFFF" strokeWidth={2.2} />
            <Text style={{ color: '#FFFFFF', marginLeft: 8, fontSize: 14, fontWeight: '500' }}>
              {cartCount > 0 ? `Cart ${cartCount}` : 'Cart'}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
