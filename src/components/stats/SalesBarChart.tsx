import React from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Rect, Line, Text as SvgText } from 'react-native-svg';

interface BarChartData {
  label: string;
  value: number;
}

interface SalesBarChartProps {
  data: BarChartData[];
  height?: number;
  barColor?: string;
  gridColor?: string;
  textColor?: string;
  showTopValue?: boolean;
  paddingLeft?: number;
}

export function SalesBarChart({
  data,
  height = 200,
  barColor = '#FFFFFF',
  gridColor = '#2A2A2A',
  textColor = '#666666',
  showTopValue = true,
  paddingLeft = 50,
}: SalesBarChartProps) {
  const [containerWidth, setContainerWidth] = React.useState(0);

  const onLayout = (event: LayoutChangeEvent) => {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    if (nextWidth !== containerWidth) {
      setContainerWidth(nextWidth);
    }
  };

  if (data.length === 0) return null;

  return (
    <View style={{ width: '100%', height: height + 10 }} onLayout={onLayout}>
      {containerWidth > 0 ? (
        <Svg width={containerWidth} height={height + 10}>
          {(() => {
            const chartWidth = containerWidth;
            const chartHeight = height - 40;
            const paddingRight = 20;
            const paddingTop = 25;
            const chartRight = chartWidth - paddingRight;

            const availableWidth = Math.max(1, chartRight - paddingLeft);
            const availableHeight = Math.max(1, chartHeight);
            const maxValue = Math.max(...data.map((d) => d.value), 1);
            const roundedMax = Math.max(1, Math.ceil(maxValue / 100) * 100);
            const maxIndex = data.findIndex((d) => d.value === maxValue);

            const minSpacing = 8;
            const maxBarWidth = 24;
            const computedBarWidth = (availableWidth - minSpacing * (data.length + 1)) / data.length;
            const barWidth = Math.max(6, Math.min(maxBarWidth, computedBarWidth));
            const totalBarsWidth = data.length * barWidth;
            const totalSpacing = Math.max(0, availableWidth - totalBarsWidth);
            const barSpacing = totalSpacing / (data.length + 1);

            const yLabels = [0, roundedMax * 0.5, roundedMax].map((v) =>
              v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toString()
            );
            const gridLines = [0, 0.5, 1];

            return (
              <>
                {gridLines.map((ratio, index) => {
                  const y = paddingTop + availableHeight * (1 - ratio);
                  return (
                    <Line
                      key={`grid-${index}`}
                      x1={paddingLeft}
                      y1={y}
                      x2={chartRight}
                      y2={y}
                      stroke={gridColor}
                      strokeWidth={1}
                      strokeDasharray="4,4"
                    />
                  );
                })}

                {yLabels.map((label, index) => {
                  const y = paddingTop + availableHeight * (1 - index * 0.5);
                  return (
                    <SvgText
                      key={`y-label-${index}`}
                      x={paddingLeft - 8}
                      y={y + 4}
                      fill={textColor}
                      fontSize={11}
                      fontWeight="500"
                      textAnchor="end"
                    >
                      {label}
                    </SvgText>
                  );
                })}

                {data.map((item, index) => {
                  const barHeight = (item.value / roundedMax) * availableHeight;
                  const x = paddingLeft + barSpacing + index * (barWidth + barSpacing);
                  const y = paddingTop + availableHeight - barHeight;
                  const isMax = index === maxIndex && showTopValue;

                  return (
                    <React.Fragment key={`bar-${index}`}>
                      <Rect
                        x={x}
                        y={y}
                        width={barWidth}
                        height={barHeight}
                        fill={barColor}
                        rx={6}
                        ry={6}
                      />
                      {isMax && item.value > 0 ? (
                        <SvgText
                          x={x + barWidth / 2}
                          y={y - 8}
                          fill={barColor}
                          fontSize={12}
                          fontWeight="700"
                          textAnchor="middle"
                        >
                          {item.value >= 1000
                            ? `${(item.value / 1000).toFixed(0)}k`
                            : item.value.toString()}
                        </SvgText>
                      ) : null}
                    </React.Fragment>
                  );
                })}

                {data.map((item, index) => {
                  const x = paddingLeft + barSpacing + index * (barWidth + barSpacing) + barWidth / 2;
                  return (
                    <SvgText
                      key={`x-label-${index}`}
                      x={x}
                      y={paddingTop + availableHeight + 18}
                      fill={textColor}
                      fontSize={10}
                      fontWeight="500"
                      textAnchor="middle"
                    >
                      {item.label}
                    </SvgText>
                  );
                })}
              </>
            );
          })()}
        </Svg>
      ) : null}
    </View>
  );
}
