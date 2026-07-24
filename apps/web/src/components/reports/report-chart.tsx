import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { AdminReportDay } from '../../types/admin-report';
import { colors, radii, typography } from '../../theme/tokens';

interface ReportChartProps {
  data: AdminReportDay[];
  mode: 'production' | 'occupancy';
  testID: string;
  onSelectDay?: (day: AdminReportDay) => void;
  selectedDate?: string | null;
}

const WIDTH = 720;
const HEIGHT = 220;
const LEFT = 34;
const TOP = 18;
const RIGHT = 16;
const BOTTOM = 34;

export const ReportChart = ({ data, mode, testID, onSelectDay, selectedDate }: ReportChartProps) => {
  const values = data.map((item) => mode === 'production' ? item.production_realized : item.occupancy_rate);
  const maximum = Math.max(mode === 'occupancy' ? 100 : 0, ...values, 1);
  const plotWidth = WIDTH - LEFT - RIGHT;
  const plotHeight = HEIGHT - TOP - BOTTOM;
  const xForIndex = (index: number) => LEFT + (data.length <= 1 ? plotWidth / 2 : index * plotWidth / (data.length - 1));
  const yForValue = (value: number) => TOP + plotHeight - (value / maximum) * plotHeight;
  const path = data.map((item, index) => `${index === 0 ? 'M' : 'L'} ${xForIndex(index)} ${yForValue(values[index])}`).join(' ');
  const accessibleSummary = data.length
    ? `${mode === 'production' ? 'Produção' : 'Ocupação'} de ${data.length} dias. Maior valor: ${Math.max(...values).toFixed(mode === 'production' ? 2 : 1)}.`
    : 'Sem dados para o gráfico.';
  const labelIndexes = new Set([0, Math.floor((data.length - 1) / 2), data.length - 1]);

  if (!data.length) {
    return <View testID={`${testID}-empty`} style={styles.empty}><Text style={styles.emptyText}>Sem dados neste período.</Text></View>;
  }

  return (
    <View testID={testID} accessible accessibilityLabel={accessibleSummary} style={styles.container}>
      <Svg width="100%" height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
        {[0, 0.5, 1].map((position) => (
          <Line
            key={position}
            x1={LEFT}
            x2={WIDTH - RIGHT}
            y1={TOP + plotHeight * position}
            y2={TOP + plotHeight * position}
            stroke={colors.borderSubtle}
            strokeWidth={1}
          />
        ))}
        {mode === 'occupancy' ? data.map((item, index) => {
          const itemWidth = Math.max(3, Math.min(16, plotWidth / Math.max(data.length, 1) - 3));
          const y = yForValue(item.occupancy_rate);
          return (
            <Rect
              key={item.date}
              x={xForIndex(index) - itemWidth / 2}
              y={y}
              width={itemWidth}
              height={TOP + plotHeight - y}
              rx={Math.min(4, itemWidth / 2)}
              fill={colors.info}
              opacity={0.82}
            />
          );
        }) : (
          <>
            <Path d={path} fill="none" stroke={colors.brandPrimary} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
            {data.length <= 31 ? data.map((item, index) => (
              <Circle key={item.date} cx={xForIndex(index)} cy={yForValue(item.production_realized)} r={3.5} fill={colors.surface} stroke={colors.brandPrimary} strokeWidth={2} />
            )) : null}
          </>
        )}
        {data.map((item, index) => labelIndexes.has(index) ? (
          <React.Fragment key={`label-${item.date}`}>
            <Line x1={xForIndex(index)} x2={xForIndex(index)} y1={HEIGHT - BOTTOM + 4} y2={HEIGHT - BOTTOM + 8} stroke={colors.textMuted} />
          </React.Fragment>
        ) : null)}
      </Svg>
      {onSelectDay ? (
        <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.hitArea]}>
          {data.map((item, index) => (
            <Pressable
              key={`hit-${item.date}`}
              testID={`${testID}-point-${item.date}`}
              accessibilityRole="button"
              accessibilityLabel={`${new Date(`${item.date}T12:00:00`).toLocaleDateString('pt-BR')}: ${mode === 'production' ? `${item.production_realized.toFixed(2)} de produção` : `${item.occupancy_rate.toFixed(1)}% de ocupação`}`}
              accessibilityState={{ selected: selectedDate === item.date }}
              onPress={() => onSelectDay(item)}
              style={[
                styles.pointHit,
                { left: `${data.length <= 1 ? 50 : index * 100 / (data.length - 1)}%` },
                selectedDate === item.date && styles.pointSelected,
              ]}
            />
          ))}
        </View>
      ) : null}
      <View pointerEvents="none" style={styles.labels}>
        {[data[0], data[Math.floor((data.length - 1) / 2)], data[data.length - 1]].map((item, index) => (
          <Text key={`${item.date}-${index}`} style={styles.label}>{new Date(`${item.date}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</Text>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { width: '100%', minHeight: HEIGHT, overflow: 'hidden' },
  labels: { position: 'absolute', left: LEFT, right: RIGHT, bottom: 5, flexDirection: 'row', justifyContent: 'space-between' },
  label: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11 },
  empty: { minHeight: HEIGHT, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, backgroundColor: colors.canvasSoft },
  emptyText: { color: colors.textMuted, fontFamily: typography.body, fontSize: 12 },
  hitArea: { left: LEFT, right: RIGHT, top: TOP, bottom: BOTTOM },
  pointHit: { position: 'absolute', top: 0, bottom: 0, width: 22, marginLeft: -11, borderRadius: radii.pill },
  pointSelected: { backgroundColor: 'rgba(49,92,155,0.10)', borderWidth: 1, borderColor: colors.brandPrimary },
});
