import { useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppointmentCard } from '@/components/operations/appointment-card';
import {
  BusinessButton,
  BusinessHeader,
  BusinessMetric,
  BusinessNotice,
  BusinessPage,
  BusinessPill,
  BusinessSectionTitle,
} from '@/components/ui/business-ui';
import { useBusinessOperational } from '@/contexts/business-operational-context';
import {
  formatAgendaDate,
  summarizeBusinessAgenda,
} from '@/features/agenda/business-agenda';
import { useBusinessAgenda } from '@/features/agenda/use-business-agenda';
import { businessTheme } from '@/theme/business-theme';

const roleLabel = {
  owner: 'Proprietário',
  admin: 'Administrador',
  professional: 'Profissional',
} as const;

export function BusinessTodayScreen() {
  const router = useRouter();
  const { activeContext } = useBusinessOperational();
  const agenda = useBusinessAgenda();
  const summary = summarizeBusinessAgenda(agenda.items);
  const timeZone = activeContext?.timezone ?? 'America/Sao_Paulo';
  const openAppointment = (appointmentId: string) => {
    router.push(`/(app)/appointments/${appointmentId}`);
  };

  return (
    <BusinessPage testID="business-today-screen">
      <BusinessHeader
        eyebrow="HOJE NA OPERAÇÃO"
        title={activeContext?.establishmentName ?? 'Meu dia'}
        description={formatAgendaDate(agenda.localDate, timeZone)}
        trailing={activeContext ? (
          <BusinessPill
            label={roleLabel[activeContext.operationalRole]}
            tone={activeContext.accessMode === 'read_only' ? 'warning' : 'success'}
          />
        ) : null}
      />

      {activeContext?.accessMode === 'read_only' ? (
        <BusinessNotice
          testID="business-read-only-notice"
          tone="warning"
          message="Modo somente leitura. Você pode consultar a operação, mas nenhuma alteração será enviada."
        />
      ) : null}

      <View style={styles.metrics}>
        <BusinessMetric testID="business-today-total" label="Atendimentos" value={String(agenda.items.length)} />
        <BusinessMetric testID="business-today-remaining" label="Restantes" value={String(summary.remaining)} emphasis="accent" />
        <BusinessMetric testID="business-today-delayed" label="Atrasos" value={String(summary.delayed)} emphasis={summary.delayed ? 'warning' : undefined} />
      </View>

      <View style={styles.section}>
        <BusinessSectionTitle>Próximo atendimento</BusinessSectionTitle>
        {agenda.isLoading ? (
          <ActivityIndicator color={businessTheme.colors.accent} />
        ) : agenda.error ? (
          <>
            <BusinessNotice tone="danger" message={agenda.error} />
            <BusinessButton label="Tentar novamente" variant="secondary" onPress={() => void agenda.refresh()} />
          </>
        ) : summary.next ? (
          <AppointmentCard
            testID="business-next-appointment"
            item={summary.next}
            timeZone={timeZone}
            onPress={() => openAppointment(summary.next!.id)}
          />
        ) : (
          <BusinessNotice
            testID="business-today-empty"
            message="Nenhum próximo atendimento ativo para hoje."
          />
        )}
      </View>

      {!agenda.isLoading && !agenda.error && agenda.items.length > 0 ? (
        <View style={styles.section}>
          <BusinessSectionTitle>Sequência do dia</BusinessSectionTitle>
          <View style={styles.list}>
            {agenda.items.slice(0, 6).map((item) => (
              <AppointmentCard
                key={item.id}
                item={item}
                timeZone={timeZone}
                onPress={() => openAppointment(item.id)}
              />
            ))}
          </View>
        </View>
      ) : null}
    </BusinessPage>
  );
}

const styles = StyleSheet.create({
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: businessTheme.spacing.sm },
  section: { gap: businessTheme.spacing.sm },
  list: { gap: businessTheme.spacing.sm },
});
