import React, { useMemo, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { Gift, Store } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

const FYLL_STORE_URL = 'https://fyll.store';

export function CustomerAccountPromptCard({
  compact = false,
  maxWidth,
}: {
  compact?: boolean;
  maxWidth?: number;
}) {
  const [isHoveringButton, setIsHoveringButton] = useState(false);
  const href = useMemo(() => FYLL_STORE_URL, []);

  const handlePress = async () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.href = href;
      return;
    }
    await Linking.openURL(href);
  };

  return (
    <LinearGradient
      colors={['#FFFFFF', '#FFFFFF', 'rgba(238, 255, 63, 0.22)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        width: '100%',
        maxWidth,
        alignSelf: 'center',
        borderRadius: 22,
        borderWidth: 1,
        borderColor: 'rgba(15, 23, 42, 0.08)',
        padding: compact ? 16 : 18,
        shadowColor: '#111111',
        shadowOpacity: 0.05,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
        elevation: 2,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 999,
            backgroundColor: 'rgba(213, 224, 87, 0.24)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Gift size={20} color="#6F7A10" strokeWidth={2} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: '#1E1E1E', fontSize: compact ? 16 : 18, fontWeight: '600', lineHeight: compact ? 21 : 24 }}>
            Earn points on this order with Fyll
          </Text>
          <Text style={{ color: '#737373', fontSize: compact ? 12 : 13, fontWeight: '400', lineHeight: compact ? 18 : 20, marginTop: 6 }}>
            Create a free Fyll account to save this order, track every update in one place, and collect points when you shop with Fyll-powered stores.
          </Text>
        </View>
      </View>

      <Pressable
        onPress={handlePress}
        onHoverIn={() => setIsHoveringButton(true)}
        onHoverOut={() => setIsHoveringButton(false)}
        style={{
          marginTop: 16,
          minHeight: 48,
          borderRadius: 999,
          overflow: 'hidden',
          shadowColor: '#B4C828',
          shadowOpacity: isHoveringButton ? 0.35 : 0.25,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 4 },
          elevation: 3,
        }}
      >
        <LinearGradient
          colors={isHoveringButton ? ['#CBDA45', '#CBDA45'] : ['#F2FF77', '#D5E057', '#BFD43F']}
          locations={isHoveringButton ? [0, 1] : [0, 0.52, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            minHeight: 48,
            backgroundColor: '#D5E057',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 8,
            paddingHorizontal: 18,
          }}
        >
          <Store size={17} color="#111111" strokeWidth={2} />
          <Text style={{ color: '#111111', fontSize: 14, fontWeight: '600' }}>
            Sign in to Fyll
          </Text>
        </LinearGradient>
      </Pressable>
    </LinearGradient>
  );
}
