import React from 'react';
import { Image, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { formatMilestoneNumber } from '@/lib/milestones';

const fieldBackground = require('../../../assets/fyll-field-phone.jpg');
const wordmark = require('../../../assets/fyll-wordmark-thick-light.png');

export type MilestoneStorySpec = {
  businessName: string;
  businessLogo: string | null;
  milestone: number;
  dateLabel: string;
  storefrontUrl?: string | null;
};

export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;

const LIME = '#d5e057';

// The shareable 1080x1920 card (MilestoneStory). It only ever shows the business and the number: no customer names
// or order details. Rendered off-screen and captured as an image by shareMilestoneStory.
export function MilestoneStoryCard({
  businessName,
  businessLogo,
  milestone,
  dateLabel,
  storefrontUrl,
  fontsReady,
}: {
  businessName: string;
  businessLogo: string | null;
  milestone: number;
  dateLabel: string;
  storefrontUrl?: string | null;
  fontsReady: boolean;
}) {
  const number = formatMilestoneNumber(milestone);
  const display = (weight: '700' | '800') => (
    fontsReady
      ? ({ fontFamily: weight === '800' ? 'BricolageGrotesque_800ExtraBold' : 'BricolageGrotesque_700Bold', fontWeight: '400' } as const)
      : ({ fontWeight: weight } as const)
  );
  const initial = businessName.trim().charAt(0).toUpperCase() || 'F';

  return (
    <View style={{ width: STORY_WIDTH, height: STORY_HEIGHT, backgroundColor: '#3f4a08', overflow: 'hidden' }}>
      <Image source={fieldBackground} resizeMode="cover" style={{ position: 'absolute', left: 0, top: 0, width: STORY_WIDTH, height: STORY_HEIGHT }} />
      <LinearGradient
        colors={['rgba(20,20,20,0.35)', 'rgba(20,20,20,0.15)', 'rgba(20,20,20,0.75)']}
        locations={[0, 0.35, 1]}
        style={{ position: 'absolute', left: 0, top: 0, width: STORY_WIDTH, height: STORY_HEIGHT }}
      />

      <View style={{ paddingTop: 112, paddingHorizontal: 88, flexDirection: 'row', alignItems: 'center', gap: 28 }}>
        <View style={{ width: 120, height: 120, borderRadius: 60, borderWidth: 6, borderColor: LIME, overflow: 'hidden', backgroundColor: '#1e1e1e', alignItems: 'center', justifyContent: 'center' }}>
          {businessLogo ? (
            <Image source={{ uri: businessLogo }} resizeMode="cover" style={{ width: 120, height: 120 }} />
          ) : (
            <Text style={[{ color: LIME, fontSize: 56 }, display('800')]}>{initial}</Text>
          )}
        </View>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text numberOfLines={1} style={[{ color: '#f4f4ef', fontSize: 44, lineHeight: 64, paddingVertical: 4 }, display('700')]}>{businessName}</Text>
          <Text style={{ color: 'rgba(244,244,239,0.8)', fontSize: 30, lineHeight: 42 }}>{dateLabel}</Text>
        </View>
      </View>

      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 88 }}>
        <Text style={[{ color: '#eef2c4', fontSize: 36, lineHeight: 52, letterSpacing: 7 }, display('700')]}>WE JUST HIT</Text>
        <Text
          style={[{ color: LIME, fontSize: number.length > 4 ? 300 : 440, lineHeight: number.length > 4 ? 380 : 540, letterSpacing: number.length > 4 ? -10 : -16 }, display('800')]}
        >
          {number}
        </Text>
        <Text style={[{ color: '#ffffff', fontSize: 128, lineHeight: 140, letterSpacing: -4 }, display('800')]}>orders</Text>
        <Text style={{ marginTop: 44, color: 'rgba(244,244,239,0.92)', fontSize: 42, lineHeight: 62, fontWeight: '400', maxWidth: 800 }}>
          Thank you to every one of you who ordered. This is yours too.
        </Text>
        {storefrontUrl ? (
          <View style={{ marginTop: 36, alignSelf: 'flex-start', height: 84, paddingHorizontal: 36, borderRadius: 42, justifyContent: 'center', backgroundColor: 'rgba(20,20,20,0.45)', borderWidth: 2, borderColor: 'rgba(213,224,87,0.6)' }}>
            <Text style={{ color: '#f4f4ef', fontSize: 36, lineHeight: 50, fontWeight: '500' }}>{storefrontUrl}</Text>
          </View>
        ) : null}
      </View>

      <View style={{ paddingHorizontal: 88, paddingBottom: 112, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20, height: 88, paddingHorizontal: 36, borderRadius: 44, backgroundColor: 'rgba(20,20,20,0.45)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.18)' }}>
          <Text style={{ color: 'rgba(244,244,239,0.85)', fontSize: 28 }}>Powered by</Text>
          <Image source={wordmark} resizeMode="contain" style={{ width: 88, height: 48 }} />
        </View>
        <Text style={{ color: 'rgba(244,244,239,0.75)', fontSize: 30 }}>fyll.app</Text>
      </View>
    </View>
  );
}
