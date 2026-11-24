import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { G, Path, Rect } from 'react-native-svg';
import { buildQrMatrix, qrModulesPath, QR_QUIET_ZONE } from '@/lib/qr';

type Props = {
  value: string;
  size: number;
  color?: string;
  accessibilityLabel?: string;
};

// Draws a Fyll-style QR code (rounded finder squares) with a white quiet zone.
// Each module is a whole number of screen pixels and all modules are one crisp path,
// so the code stays sharp instead of blurring at the edges.
export function QrCodeView({ value, size, color = '#141414', accessibilityLabel }: Props) {
  const matrix = useMemo(() => {
    try {
      return value ? buildQrMatrix(value, 'M') : null;
    } catch {
      return null;
    }
  }, [value]);
  const modulesPath = useMemo(() => (matrix ? qrModulesPath(matrix) : ''), [matrix]);

  if (!matrix) return null;
  const n = matrix.length;
  const z = QR_QUIET_ZONE;
  const total = n + z * 2;
  const unit = Math.max(1, Math.floor(size / total));
  const drawn = unit * total;

  const finders = [[0, 0], [0, n - 7], [n - 7, 0]].map(([r, c]) => {
    const x = c + z;
    const y = r + z;
    return (
      <G key={`f-${r}-${c}`}>
        <Rect x={x} y={y} width={7} height={7} rx={1.6} fill={color} />
        <Rect x={x + 1} y={y + 1} width={5} height={5} rx={1.1} fill="#FFFFFF" />
        <Rect x={x + 2} y={y + 2} width={3} height={3} rx={0.8} fill={color} />
      </G>
    );
  });

  return (
    <View style={{ width: size, height: size, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
      <Svg
        width={drawn}
        height={drawn}
        viewBox={`0 0 ${total} ${total}`}
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel ?? 'QR code'}
        {...({ shapeRendering: 'crispEdges' } as object)}
      >
        <Rect x={0} y={0} width={total} height={total} fill="#FFFFFF" />
        <Path d={modulesPath} fill={color} />
        {finders}
      </Svg>
    </View>
  );
}

