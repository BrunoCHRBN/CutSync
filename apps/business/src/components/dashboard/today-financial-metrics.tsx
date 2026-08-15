import { formatMoneyCents } from '@cutsync/domain';
import { Activity, CalendarClock, Minus, ReceiptText, TrendingDown, TrendingUp } from 'lucide-react-native';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { BusinessNotice, BusinessSectionTitle } from '@/components/ui/business-ui';
import { useBusinessDailyMetrics } from '@/features/dashboard/use-business-daily-metrics';
import { businessTheme } from '@/theme/business-theme';

export function TodayFinancialMetrics({ localDate }: { localDate: string }) {
  const metrics = useBusinessDailyMetrics(localDate);
  if (!metrics.visible) return null;
  return (
    <View testID="business-today-financial" style={styles.section}>
      <BusinessSectionTitle testID="business-today-financial-title">Visão financeira</BusinessSectionTitle>
      {metrics.isLoading ? <ActivityIndicator testID="business-today-financial-loading" color={businessTheme.colors.accentStrong} /> : metrics.error || !metrics.data ? (
        <BusinessNotice testID="business-today-financial-error" tone="danger" message="Não foi possível carregar o resumo financeiro agora." />
      ) : (
        <View style={styles.grid}>
          <Metric testID="business-today-revenue" label="Receita fechada" value={formatMoneyCents(metrics.data.revenueCents, metrics.data.currency)} helper={`${metrics.data.closedOrders} comandas`} comparison={comparePercent(metrics.data.revenueCents, metrics.data.previousRevenueCents)} Icon={ReceiptText} emphasis />
          <Metric testID="business-today-average-ticket" label="Ticket médio" value={formatMoneyCents(metrics.data.averageTicketCents, metrics.data.currency)} helper="por comanda fechada" comparison={comparePercent(metrics.data.averageTicketCents, metrics.data.previousAverageTicketCents)} Icon={Activity} />
          <Metric testID="business-today-occupancy" label="Ocupação" value={`${metrics.data.occupancyRate.toLocaleString('pt-BR')}%`} helper={`${metrics.data.occupiedMinutes} de ${metrics.data.availableMinutes} min`} comparison={comparePoints(metrics.data.occupancyRate, metrics.data.previousOccupancyRate)} Icon={CalendarClock} />
        </View>
      )}
    </View>
  );
}

const comparePercent = (current: number, previous: number) => previous === 0
  ? { label: current > 0 ? 'Nova receita vs. semana passada' : 'Sem movimento na semana passada', direction: current > 0 ? 'up' as const : 'flat' as const }
  : { label: `${Math.abs(Math.round(((current - previous) / previous) * 100))}% vs. semana passada`, direction: current === previous ? 'flat' as const : current > previous ? 'up' as const : 'down' as const };

const comparePoints = (current: number, previous: number) => ({
  label: `${Math.abs(Number((current - previous).toFixed(1))).toLocaleString('pt-BR')} p.p. vs. semana passada`,
  direction: current === previous ? 'flat' as const : current > previous ? 'up' as const : 'down' as const,
});

function Metric({ testID, label, value, helper, comparison, Icon, emphasis = false }: { testID: string; label: string; value: string; helper: string; comparison: { label: string; direction: 'up' | 'down' | 'flat' }; Icon: typeof ReceiptText; emphasis?: boolean }) {
  const TrendIcon = comparison.direction === 'up' ? TrendingUp : comparison.direction === 'down' ? TrendingDown : Minus;
  const trendColor = comparison.direction === 'up' ? businessTheme.colors.success : comparison.direction === 'down' ? businessTheme.colors.danger : businessTheme.colors.textMuted;
  return (
    <View testID={testID} style={[styles.metric, emphasis && styles.metricEmphasis]}>
      <Icon color={emphasis ? businessTheme.colors.accentStrong : businessTheme.colors.textMuted} size={19} />
      <Text style={styles.label}>{label}</Text>
      <Text adjustsFontSizeToFit numberOfLines={1} style={[styles.value, emphasis && styles.valueEmphasis]}>{value}</Text>
      <Text style={styles.helper}>{helper}</Text>
      <View testID={`${testID}-comparison`} style={styles.comparison}>
        <TrendIcon color={trendColor} size={14} />
        <Text style={[styles.comparisonText, { color: trendColor }]}>{comparison.label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: businessTheme.spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: businessTheme.spacing.sm },
  metric: { flexGrow: 1, flexBasis: 142, minHeight: 154, gap: 5, borderWidth: 1, borderColor: businessTheme.colors.border, borderRadius: businessTheme.radii.md, padding: businessTheme.spacing.md, backgroundColor: businessTheme.colors.surface },
  metricEmphasis: { borderColor: businessTheme.colors.accent, backgroundColor: businessTheme.colors.accentSoft },
  label: { ...businessTheme.typography.caption, color: businessTheme.colors.textSoft },
  value: { color: businessTheme.colors.text, fontSize: 21, fontWeight: '900', fontVariant: ['tabular-nums'] },
  valueEmphasis: { color: businessTheme.colors.accentStrong },
  helper: { color: businessTheme.colors.textMuted, fontSize: 10 },
  comparison: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 2 },
  comparisonText: { flex: 1, fontSize: 9, fontWeight: '800' },
});