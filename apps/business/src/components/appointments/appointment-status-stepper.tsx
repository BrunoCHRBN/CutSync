import type { BusinessAgendaStatus, ServiceOrderStatus } from '@cutsync/database';
import { Check } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { BusinessNotice } from '@/components/ui/business-ui';
import { businessTheme } from '@/theme/business-theme';

const labels = ['Agendado', 'Confirmado', 'Em atendimento', 'Finalizado'];

export function AppointmentStatusStepper({ appointmentStatus, orderStatus }: { appointmentStatus: BusinessAgendaStatus; orderStatus?: ServiceOrderStatus | null }) {
  if (appointmentStatus === 'cancelled' || appointmentStatus === 'no_show') {
    return <BusinessNotice testID="business-appointment-terminal-status" tone="warning" message={appointmentStatus === 'cancelled' ? 'Este atendimento foi cancelado.' : 'O cliente não compareceu.'} />;
  }
  const activeIndex = appointmentStatus === 'completed' || orderStatus === 'awaiting_payment' || orderStatus === 'closed'
    ? 3
    : orderStatus === 'in_service'
      ? 2
      : appointmentStatus === 'confirmed'
        ? 1
        : 0;
  return (
    <View testID="business-appointment-status-stepper" style={styles.row}>
      {labels.map((label, index) => {
        const complete = index < activeIndex;
        const active = index === activeIndex;
        return (
          <View key={label} style={styles.step}>
            <View style={[styles.dot, (complete || active) && styles.dotActive]}>
              {complete ? <Check color={businessTheme.colors.canvas} size={13} strokeWidth={3} /> : <Text style={[styles.number, active && styles.numberActive]}>{index + 1}</Text>}
            </View>
            <Text numberOfLines={2} style={[styles.label, active && styles.labelActive]}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  step: { flex: 1, minWidth: 0, alignItems: 'center', gap: 5 },
  dot: { width: 27, height: 27, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: businessTheme.colors.borderStrong, borderRadius: 14, backgroundColor: businessTheme.colors.surface },
  dotActive: { borderColor: businessTheme.colors.accentStrong, backgroundColor: businessTheme.colors.accentStrong },
  number: { color: businessTheme.colors.textMuted, fontSize: 10, fontWeight: '900' },
  numberActive: { color: businessTheme.colors.canvas },
  label: { color: businessTheme.colors.textMuted, fontSize: 9, fontWeight: '700', textAlign: 'center' },
  labelActive: { color: businessTheme.colors.accentStrong },
});