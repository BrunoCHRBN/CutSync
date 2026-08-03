import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CalendarClock, CircleAlert, Clock3 } from 'lucide-react-native';
import { AppCard } from '../../ui/AppCard';
import { StatusBadge } from '../../ui/StatusBadge';
import { colors, typography } from '../../../theme/tokens';

export interface DashboardSidePanelItem {
  id: string;
  label: string;
}

export interface DashboardSidePanelProps {
  nextAppointmentLabel?: string | null;
  pending: DashboardSidePanelItem[];
  freeSlots: DashboardSidePanelItem[];
  cancelled: DashboardSidePanelItem[];
  testID?: string;
}

export const DashboardSidePanel = ({
  nextAppointmentLabel,
  pending,
  freeSlots,
  cancelled,
  testID = 'admin-day-insights',
}: DashboardSidePanelProps) => (
  <AppCard testID={testID} style={styles.card}>
    <View style={styles.section}>
      <View style={styles.titleRow}>
        <CalendarClock color={colors.brandPrimary} size={17} />
        <Text style={styles.title}>Próximo atendimento</Text>
      </View>
      <Text style={nextAppointmentLabel ? styles.line : styles.empty}>
        {nextAppointmentLabel || 'Nenhum atendimento em seguida.'}
      </Text>
    </View>
    <View style={styles.section}>
      <View style={styles.titleRow}>
        <CircleAlert color={colors.warning} size={17} />
        <Text style={styles.title}>Pendências</Text>
        <StatusBadge testID="admin-pending-total" label={String(pending.length)} tone={pending.length ? 'warning' : 'success'} />
      </View>
      {pending.slice(0, 3).map((item) => <Text key={item.id} style={styles.line}>{item.label}</Text>)}
      {!pending.length ? <Text style={styles.empty}>Nenhuma confirmação pendente.</Text> : null}
    </View>
    <View style={styles.section}>
      <View style={styles.titleRow}>
        <Clock3 color={colors.info} size={17} />
        <Text style={styles.title}>Próximas janelas livres</Text>
      </View>
      {freeSlots.map((item) => <Text key={item.id} style={styles.line}>{item.label}</Text>)}
      {!freeSlots.length ? <Text style={styles.empty}>Sem janelas livres neste dia.</Text> : null}
    </View>
    <View style={styles.section}>
      <View style={styles.titleRow}>
        <CircleAlert color={colors.danger} size={17} />
        <Text style={styles.title}>Cancelamentos</Text>
      </View>
      {cancelled.map((item) => <Text key={item.id} style={styles.line}>{item.label}</Text>)}
      {!cancelled.length ? <Text style={styles.empty}>Nenhum cancelamento no dia.</Text> : null}
    </View>
  </AppCard>
);

const styles = StyleSheet.create({
  card: { gap: 16, padding: 16 },
  section: { gap: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, color: colors.text, fontFamily: typography.bodyStrong, fontSize: 12 },
  line: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12 },
  empty: { color: colors.textMuted, fontFamily: typography.body, fontSize: 12 },
});
