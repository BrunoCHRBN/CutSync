import { useRouter } from 'expo-router';
import { CalendarCheck2 } from 'lucide-react-native';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AppointmentCard } from '@/components/operations/appointment-card';
import { BusinessFloatingAction } from '@/components/appointments/business-floating-action';
import { NextAppointmentActions } from '@/components/dashboard/next-appointment-actions';
import { TodayFinancialMetrics } from '@/components/dashboard/today-financial-metrics';
import { BusinessEmptyState } from '@/components/ui/business-empty-state';
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
import { useBusinessSession } from '@/contexts/business-session';
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
  const { user } = useBusinessSession();
  const { activeContext, hasCapability } = useBusinessOperational();
  const agenda = useBusinessAgenda();
  const summary = summarizeBusinessAgenda(agenda.items);
  const timeZone = activeContext?.timezone ?? 'America/Sao_Paulo';
  const canCreate = activeContext?.accessMode === 'full'
    && (hasCapability('create_self_walk_in') || hasCapability('create_team_walk_in'));
  const displayName = typeof user?.user_metadata?.name === 'string'
    ? user.user_metadata.name
    : typeof user?.user_metadata?.full_name === 'string'
      ? user.user_metadata.full_name
      : null;
  const hour = Number(new Intl.DateTimeFormat('pt-BR', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const openAppointment = (appointmentId: string) => {
    router.push(`/(app)/appointments/${appointmentId}`);
  };

  return (
    <View style={styles.screen}>
    <BusinessPage testID="business-today-screen" contentStyle={styles.pageContent}>
      <BusinessHeader
        testID="business-today-header"
        eyebrow={(activeContext?.establishmentName ?? 'CUTSYNC BUSINESS').toUpperCase()}
        title={`${greeting}${displayName ? `, ${displayName.split(' ')[0]}` : ''}`}
        description={formatAgendaDate(agenda.localDate, timeZone)}
        trailing={activeContext ? (
          <BusinessPill
            testID="business-today-role"
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

      <TodayFinancialMetrics localDate={agenda.localDate} />

      <BusinessSectionTitle testID="business-today-operation-title">Operação</BusinessSectionTitle>
      <View style={styles.metrics}>
        <BusinessMetric testID="business-today-total" label="Atendimentos" value={String(agenda.items.length)} />
        <BusinessMetric testID="business-today-remaining" label="Restantes" value={String(summary.remaining)} emphasis="accent" />
        <BusinessMetric testID="business-today-delayed" label="Atrasos" value={String(summary.delayed)} emphasis={summary.delayed ? 'warning' : undefined} />
      </View>

      <View style={styles.section}>
        <BusinessSectionTitle testID="business-today-next-title">Próximo atendimento</BusinessSectionTitle>
        {agenda.isLoading ? (
          <ActivityIndicator color={businessTheme.colors.accent} />
        ) : agenda.error ? (
          <>
            <BusinessNotice testID="business-today-agenda-error" tone="danger" message={agenda.error} />
            <BusinessButton testID="business-today-retry" label="Tentar novamente" variant="secondary" onPress={() => void agenda.refresh()} />
          </>
        ) : summary.next ? (
          <>
            <AppointmentCard
              testID="business-next-appointment"
              item={summary.next}
              timeZone={timeZone}
              onPress={() => openAppointment(summary.next!.id)}
            />
            <NextAppointmentActions item={summary.next} />
          </>
        ) : (
          <BusinessEmptyState
            testID="business-today-empty"
            icon={<CalendarCheck2 color={businessTheme.colors.accentStrong} size={24} />}
            title="Seu dia está livre"
            description="Quando um atendimento for marcado para hoje, ele aparecerá aqui."
          />
        )}
      </View>

      {!agenda.isLoading && !agenda.error && agenda.items.length > 0 ? (
        <View style={styles.section}>
          <BusinessSectionTitle testID="business-today-sequence-title">Agenda de hoje</BusinessSectionTitle>
          <View style={styles.list}>
            {agenda.items.slice(0, 6).map((item) => (
              <AppointmentCard
                key={item.id}
                testID={`business-today-appointment-${item.id}`}
                item={item}
                timeZone={timeZone}
                onPress={() => openAppointment(item.id)}
              />
            ))}
          </View>
          <Text testID="business-today-list-hint" selectable style={styles.foundationNote}>
            Toque em um atendimento para ver detalhes e próximas ações.
          </Text>
        </View>
      ) : null}
    </BusinessPage>
    {canCreate ? <BusinessFloatingAction testID="business-today-fab-schedule" label="Agendar" onPress={() => router.push('/(app)/walk-in' as never)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: businessTheme.colors.canvas },
  pageContent: { paddingBottom: 112 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: businessTheme.spacing.sm },
  section: { gap: businessTheme.spacing.sm },
  list: { gap: businessTheme.spacing.sm },
  foundationNote: { ...businessTheme.typography.caption, color: businessTheme.colors.textMuted },
});
