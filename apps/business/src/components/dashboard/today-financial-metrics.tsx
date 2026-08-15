import { formatMoneyCents } from '@cutsync/domain';
import { Activity, CalendarClock, ReceiptText } from 'lucide-react-native';
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
          <Metric testID="business-today-revenue" label="Receita fechada" value={formatMoneyCents(metrics.data.revenueCents, metrics.data.currency)} helper={`${metrics.data.closedOrders} comandas`} Icon={ReceiptText} emphasis />
          <Metric testID="business-today-average-ticket" label="Ticket médio" value={formatMoneyCents(metrics.data.averageTicketCents, metrics.data.currency)} helper="por comanda fechada" Icon={Activity} />
          <Metric testID="business-today-occupancy" label="Ocupação" value={`${metrics.data.occupancyRate.toLocaleString('pt-BR')}%`} helper={`${metrics.data.occupiedMinutes} de ${metrics.data.availableMinutes} min`} Icon={CalendarClock} />
        </View>
      )}
    </View>
  );
}

function Metric({ testID, label, value, helper, Icon, emphasis = false }: { testID: string; label: string; value: string; helper: string; Icon: typeof ReceiptText; emphasis?: boolean }) {
  return (
    <View testID={testID} style={[styles.metric, emphasis && styles.metricEmphasis]}>
      <Icon color={emphasis ? businessTheme.colors.accentStrong : businessTheme.colors.textMuted} size={19} />
      <Text style={styles.label}>{label}</Text>
      <Text adjustsFontSizeToFit numberOfLines={1} style={[styles.value, emphasis && styles.valueEmphasis]}>{value}</Text>
      <Text style={styles.helper}>{helper}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: businessTheme.spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: businessTheme.spacing.sm },
  metric: { flexGrow: 1, flexBasis: 142, minHeight: 132, gap: 5, borderWidth: 1, borderColor: businessTheme.colors.border, borderRadius: businessTheme.radii.md, padding: businessTheme.spacing.md, backgroundColor: businessTheme.colors.surface },
  metricEmphasis: { borderColor: businessTheme.colors.accent, backgroundColor: businessTheme.colors.accentSoft },
  label: { ...businessTheme.typography.caption, color: businessTheme.colors.textSoft },
  value: { color: businessTheme.colors.text, fontSize: 21, fontWeight: '900', fontVariant: ['tabular-nums'] },
  valueEmphasis: { color: businessTheme.colors.accentStrong },
  helper: { color: businessTheme.colors.textMuted, fontSize: 10 },
});