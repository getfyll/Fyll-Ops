import React, { useMemo, useState } from 'react';
import { Pressable, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';

export type BarChartDatum = {
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

export function InteractiveBarChart({
  data,
  height = 220,
  barColor = '#111111',
  gridColor = '#E6E6E6',
  textColor = '#666666',
  selectedIndex,
  onSelectIndex,
  formatYLabel,
  formatValueLabel,
  tooltipBackgroundColor = '#111111',
  tooltipTextColor = '#FFFFFF',
}: {
  data: BarChartDatum[];
  height?: number;
  barColor?: string;
  gridColor?: string;
  textColor?: string;
  selectedIndex?: number | null;
  onSelectIndex?: (index: number | null) => void;
  formatYLabel?: (value: number) => string;
  formatValueLabel?: (value: number) => string;
  tooltipBackgroundColor?: string;
  tooltipTextColor?: string;
}) {
  const [width, setWidth] = useState<number>(0);

  const onLayout = (event: LayoutChangeEvent) => {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    if (nextWidth !== width) setWidth(nextWidth);
  };

  const chart = useMemo(() => {
    if (!width || data.length === 0) return null;

    const paddingLeft = 52;
    const paddingRight = 12;
    const paddingTop = 18;
    const paddingBottom = 30;
    const chartWidth = Math.max(1, width - paddingLeft - paddingRight);
    const chartHeight = Math.max(1, height - paddingTop - paddingBottom);

    const maxValue = Math.max(...data.map((d) => d.value), 0);
    const niceMax = getNiceMax(maxValue);

    const yTicks = [0, niceMax * 0.5, niceMax];
    const yLabel = (value: number) => (formatYLabel ? formatYLabel(value) : String(Math.round(value)));

    const barWidth = Math.min(34, Math.max(16, chartWidth / (data.length * 2.2)));
    const spacing = Math.max(6, (chartWidth - barWidth * data.length) / (data.length + 1));

    return {
      paddingLeft,
      paddingRight,
      paddingTop,
      paddingBottom,
      chartWidth,
      chartHeight,
      niceMax,
      yTicks,
      yLabel,
      barWidth,
      spacing,
    };
  }, [data, formatYLabel, height, width]);

  if (data.length === 0) return null;

  return (
    <View style={{ width: '100%', height, position: 'relative' }} onLayout={onLayout}>
      {chart ? (
        <Svg width={width} height={height}>
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
                  x2={width - chart.paddingRight}
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

          {/* Bars */}
          {data.map((d, idx) => {
            const x =
              chart.paddingLeft + chart.spacing + idx * (chart.barWidth + chart.spacing);
            const barHeight = (d.value / chart.niceMax) * chart.chartHeight;
            const y = chart.paddingTop + chart.chartHeight - barHeight;
            const selected = selectedIndex === idx;
            const opacity =
              typeof selectedIndex === 'number' ? (selected ? 1 : 0.35) : 1;

            return (
              <React.Fragment key={`bar-${d.key}`}>
                <Rect
                  x={x}
                  y={y}
                  width={chart.barWidth}
                  height={Math.max(2, barHeight)}
                  fill={barColor}
                  opacity={opacity}
                  rx={8}
                  ry={8}
                />
                <SvgText
                  x={x + chart.barWidth / 2}
                  y={height - 10}
                  fill={textColor}
                  fontSize={10}
                  fontWeight="500"
                  textAnchor="middle"
                >
                  {d.label}
                </SvgText>
              </React.Fragment>
            );
          })}

          {/* Exact value tooltip for hover and touch selection */}
          {typeof selectedIndex === 'number' && data[selectedIndex] ? (() => {
            const datum = data[selectedIndex];
            const x = chart.paddingLeft + chart.spacing + selectedIndex * (chart.barWidth + chart.spacing);
            const barHeight = (datum.value / chart.niceMax) * chart.chartHeight;
            const y = chart.paddingTop + chart.chartHeight - barHeight;
            const valueLabel = formatValueLabel ? formatValueLabel(datum.value) : String(datum.value);
            const tooltipWidth = Math.min(116, Math.max(48, valueLabel.length * 7 + 18));
            const tooltipX = Math.max(4, Math.min(width - tooltipWidth - 4, x + chart.barWidth / 2 - tooltipWidth / 2));
            const tooltipY = Math.max(2, y - 34);
            return (
              <React.Fragment>
                <Rect x={tooltipX} y={tooltipY} width={tooltipWidth} height={26} rx={8} ry={8} fill={tooltipBackgroundColor} />
                <SvgText x={tooltipX + tooltipWidth / 2} y={tooltipY + 17} fill={tooltipTextColor} fontSize={11} fontWeight="600" textAnchor="middle">{valueLabel}</SvgText>
              </React.Fragment>
            );
          })() : null}
        </Svg>
      ) : null}
      {chart ? data.map((datum, idx) => {
        const x = chart.paddingLeft + idx * (chart.barWidth + chart.spacing);
        const hitWidth = chart.barWidth + chart.spacing;
        return (
          <Pressable
            key={`hit-${datum.key}`}
            accessibilityRole="button"
            accessibilityLabel={`${datum.label}: ${formatValueLabel ? formatValueLabel(datum.value) : datum.value}`}
            onHoverIn={() => onSelectIndex?.(idx)}
            onHoverOut={() => onSelectIndex?.(null)}
            onPress={() => onSelectIndex?.(selectedIndex === idx ? null : idx)}
            style={{ position: 'absolute', left: x, top: chart.paddingTop, width: hitWidth, height: chart.chartHeight }}
          />
        );
      }) : null}
    </View>
  );
}
