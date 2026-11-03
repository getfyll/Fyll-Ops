import React from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { getInlineCloseHandler } from '@/lib/inline-navigation';
import { Download } from 'lucide-react-native';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { usePageHeadingStyle } from '@/lib/page-heading';
import { BackButton, isHovered, usePaymentsPalette } from '@/components/payments/payments-ui';

interface DetailHeaderProps {
  title: string;
  subtitle?: string;
  showExport?: boolean;
  onExport?: () => void;
}

// The header of the pages inside Insights (and Finance): the same title font and spacing as the Insights page itself, a
// round outlined back button, and no line underneath. Phones show the title only; the subtitle is for wide screens.
export function DetailHeader({
  title,
  subtitle,
  showExport = true,
  onExport,
}: DetailHeaderProps) {
  const router = useRouter();
  const palette = usePaymentsPalette();
  const { isMobile } = useBreakpoint();
  const headingStyle = usePageHeadingStyle(isMobile);

  const handleExport = () => {
    if (onExport) {
      onExport();
    } else {
      // Placeholder for CSV export
      console.log('Export to CSV - coming soon');
    }
  };

  const handleBack = () => {
    const inline = getInlineCloseHandler();
    if (Platform.OS === 'web' && inline) {
      inline();
    } else {
      router.back();
    }
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        paddingHorizontal: 20,
        paddingTop: isMobile ? 14 : 20,
        paddingBottom: isMobile ? 6 : 16,
        backgroundColor: palette.page,
      }}
    >
      <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton palette={palette} onPress={handleBack} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: palette.text, ...headingStyle }} numberOfLines={1}>
            {title}
          </Text>
          {subtitle && !isMobile ? (
            <Text style={{ color: palette.faint, fontSize: 14, marginTop: 4 }} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>

      {showExport ? (
        <Pressable
          onPress={handleExport}
          accessibilityRole="button"
          style={(state) => ({
            height: 40,
            paddingHorizontal: 16,
            borderRadius: 999,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            borderWidth: 1,
            borderColor: palette.border,
            backgroundColor: isHovered(state) || state.pressed ? palette.softFill : palette.inset,
          })}
        >
          <Download size={16} color={palette.muted} strokeWidth={2} />
          <Text style={{ color: palette.text, fontSize: 13, fontWeight: '600' }}>Export</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
