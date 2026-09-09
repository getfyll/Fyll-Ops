import React, { useMemo, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Line,
  Path,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

export type LineChartDatum = {
  key: string;
  label: string;
  value: number;
};

function getNiceMax(value: number) {
  const safe = Math.max(0, value);
  if (safe === 0) return 1;
  const exponent = Math.floor(Math.log10(safe));
  const magnitude = Math.pow(10, exponent);
  const fraction = safe / magnitude;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return niceFraction * magnitude;
}

export function InteractiveLineChart({
  data,
  height = 220,
  lineColor = '#111111',
  gridColor = '#E6E6E6',
  textColor = '#666666',
  selectedIndex,
  onSelectIndex,
  formatYLabel,
  maxXLabels = 8,
  paddingLeft = 52,
}: {
  data: LineChartDatum[];
  height?: number;
  lineColor?: string;
  gridColor?: string;
  textColor?: string;
  selectedIndex?: number | null;
  onSelectIndex?: (index: number | null) => void;
  formatYLabel?: (value: number) => string;
  maxXLabels?: number;
  paddingLeft?: number;
}) {
  const [width, setWidth] = useState<number>(0);

  const onLayout = (event: LayoutChangeEvent) => {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    if (nextWidth !== width) setWidth(nextWidth);
  };

  const chart = useMemo(() => {
    if (!width || data.length < 2) return null;

    const paddingRight = 12;
    const paddingTop = 18;
    const paddingBottom = 30;
    const chartWidth = Math.max(1, width - paddingLeft - paddingRight);
    const chartHeight = Math.max(1, height - paddingTop - paddingBottom);

    const maxValue = Math.max(...data.map((d) => d.value), 0);
    const niceMax = getNiceMax(maxValue);

    const yTicks = [0, niceMax * 0.5, niceMax];
    const yLabel = (value: number) => (formatYLabel ? formatYLabel(value) : String(Math.round(value)));

    const points = data.map((d, index) => {
      const ratio = data.length === 1 ? 0 : index / (data.length - 1);
      const x = paddingLeft + ratio * chartWidth;
      const y = paddingTop + chartHeight - (d.value / niceMax) * chartHeight;
      return { x, y };
    });

    const pathData = points.reduce((path, point, index) => {
      if (index === 0) return `M ${point.x} ${point.y}`;
      const prev = points[index - 1];
      const cpx1 = prev.x + (point.x - prev.x) / 3;
      const cpx2 = prev.x + (2 * (point.x - prev.x)) / 3;
      return `${path} C ${cpx1} ${prev.y} ${cpx2} ${point.y} ${point.x} ${point.y}`;
    }, '');

    const areaPath = `${pathData} L ${points[points.length - 1].x} ${paddingTop + chartHeight} L ${points[0].x} ${paddingTop + chartHeight} Z`;

    return {
      paddingLeft,
      paddingTop,
      paddingBottom,
      chartHeight,
      chartWidth,
      niceMax,
      yTicks,
      yLabel,
      points,
      pathData,
      areaPath,
    };
  }, [data, formatYLabel, height, width, paddingLeft]);

  if (data.length < 2) return null;

  return (
    <View style={{ width: '100%', height }} onLayout={onLayout}>
      {chart ? (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="lineArea" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={lineColor} stopOpacity="0.22" />
              <Stop offset="1" stopColor={lineColor} stopOpacity="0" />
            </LinearGradient>
          </Defs>

          {/* Gridlines + Y labels */}
          {chart.yTicks.map((tick, idx) => {
            const ratio = tick / chart.niceMax;
            const y = chart.paddingTop + chart.chartHeight - ratio * chart.chartHeight;
            const label = chart.yLabel(tick);
            return (
              <React.Fragment key={`tick-${idx}`}>
                <Line
                  x1={chart.paddingLeft}
                  y1={y}
                  x2={width - 12}
                  y2={y}
                  stroke={gridColor}
                  strokeWidth={1}
                  strokeDasharray="4,4"
                />
                <SvgText
                  x={chart.paddingLeft - 10}
                  y={y + 4}
                  fill={textColor}
                  fontSize={11}
                  fontWeight="500"
                  textAnchor="end"
                >
                  {label}
                </SvgText>
              </React.Fragment>
            );
          })}

          {/* Area + Line */}
          <Path d={chart.areaPath} fill="url(#lineArea)" />
          <Path
            d={chart.pathData}
            fill="none"
            stroke={lineColor}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Selected vertical line */}
          {typeof selectedIndex === 'number' && chart.points[selectedIndex] ? (
            <Line
              x1={chart.points[selectedIndex].x}
              y1={chart.paddingTop}
              x2={chart.points[selectedIndex].x}
              y2={chart.paddingTop + chart.chartHeight}
              stroke={gridColor}
              strokeWidth={1}
            />
          ) : null}

          {/* Points */}
          {chart.points.map((point, idx) => {
            const selected = selectedIndex === idx;
            return (
              <React.Fragment key={`pt-${data[idx].key}`}>
                <Circle
                  cx={point.x}
                  cy={point.y}
                  r={10}
                  fill="transparent"
                  onPress={() => onSelectIndex?.(selected ? null : idx)}
                />
                <Circle
                  cx={point.x}
                  cy={point.y}
                  r={selected ? 4.5 : 3}
                  fill={lineColor}
                  stroke="#FFFFFF"
                  strokeWidth={selected ? 2 : 1.5}
                />
              </React.Fragment>
            );
          })}

          {/* X labels */}
          {data.map((d, idx) => {
            const point = chart.points[idx];
            const safeMaxXLabels = Math.max(2, maxXLabels);
            const xLabelStep = Math.max(1, Math.ceil(data.length / safeMaxXLabels));
            const shouldShowLabel = idx % xLabelStep === 0 || idx === data.length - 1;
            if (!shouldShowLabel) return null;
            return (
              <SvgText
                key={`x-${d.key}`}
                x={point.x}
                y={height - 10}
                fill={textColor}
                fontSize={10}
                fontWeight="500"
                textAnchor="middle"
              >
                {d.label}
              </SvgText>
            );
          })}
        </Svg>
      ) : null}
    </View>
  );
}
