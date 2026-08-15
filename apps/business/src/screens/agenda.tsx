import { useRouter } from 'expo-router';
import { CalendarDays } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppointmentCard } from '@/components/operations/appointment-card';
import { BusinessEmptyState } from '@/components/ui/business-empty-state';
import {
  BusinessButton,
  BusinessHeader,
  BusinessNotice,
  BusinessPage,
} from '@/components/ui/business-ui';
import { useBusinessOperational } from '@/contexts/business-operational-context';
import {
  formatAgendaDate,
  getLocalDateInTimeZone,
  shiftLocalDate,
} from '@/features/agenda/business-agenda';
import { useBusinessAgenda } from '@/features/agenda/use-business-agenda';
import { businessTheme } from '@/theme/business-theme';

export function BusinessAgendaScreen() {
  const router = useRouter();
  const { activeContext, hasCapability } = useBusinessOperational();
  const agenda = useBusinessAgenda();
  const timeZone = activeContext?.timezone ?? 'America/Sao_Paulo';
  const today = getLocalDateInTimeZone(timeZone);
  const openAppointment = (appointmentId: string) => {
    router.push(`/(app)/appointments/${appointmentId}`);
  };

  return (
    <BusinessPage testID="business-agenda-screen">
      <BusinessHeader
        testID="business-agenda-header"
        eyebrow="SUA ROTINA"
        title="Agenda"
        description={activeContext?.establishmentName}
      />

      {activeContext?.accessMode === 'full' ? (
        <View style={styles.quickActions}>
          {(hasCapability('create_self_walk_in') || hasCapability('create_team_walk_in')) ? (
            <BusinessButton testID="business-agenda-create-appointment" label="Novo atendimento" onPress={() => router.push('/(app)/walk-in' as never)} />
          ) : null}
          {(hasCapability('manage_own_blocks') || hasCapability('manage_team_blocks')) ? (
            <BusinessButton testID="business-agenda-manage-blocks" label="Horários bloqueados" variant="secondary" onPress={() => router.push('/(app)/schedule-blocks' as never)} />
          ) : null}
        </View>
      ) : null}

      {activeContext?.accessMode === 'read_only' ? (
        <BusinessNotice
          testID="business-agenda-read-only"
          tone="warning"
          message="Você pode consultar esta agenda, mas não fazer alterações."
        />
      ) : null}

      <View style={styles.dateControl}>
        <Pressable
          testID="business-agenda-previous-day"
          accessibilityRole="button"
          accessibilityLabel="Dia anterior"
          onPress={() => agenda.setLocalDate(shiftLocalDate(agenda.localDate, -1))}
          style={styles.dateArrow}
        >
          <Text style={styles.dateArrowText}>‹</Text>
        </Pressable>
        <Pressable
          testID="business-agenda-today"
          accessibilityRole="button"
          accessibilityLabel="Voltar para hoje"
          onPress={() => agenda.setLocalDate(today)}
          style={styles.dateCopy}
        >
          <Text selectable style={styles.dateLabel}>{formatAgendaDate(agenda.localDate, timeZone)}</Text>
          <Text style={styles.dateHint}>{agenda.localDate === today ? 'HOJE' : 'TOCAR PARA HOJE'}</Text>
        </Pressable>
        <Pressable
          testID="business-agenda-next-day"
          accessibilityRole="button"
          accessibilityLabel="Próximo dia"
          onPress={() => agenda.setLocalDate(shiftLocalDate(agenda.localDate, 1))}
          style={styles.dateArrow}
        >
          <Text style={styles.dateArrowText}>›</Text>
        </Pressable>
      </View>

      {agenda.canViewTeam ? (
        <View accessibilityRole="tablist" style={styles.scopeControl}>
          {(['own', 'team'] as const).map((scope) => {
            const selected = agenda.scope === scope;
            return (
              <Pressable
                key={scope}
                testID={`business-agenda-scope-${scope}`}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => agenda.setScope(scope)}
                style={[styles.scopeButton, selected && styles.scopeButtonSelected]}
              >
                <Text style={[styles.scopeText, selected && styles.scopeTextSelected]}>
                  {scope === 'own' ? 'Minha agenda' : 'Equipe'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {agenda.isLoading ? (
        <View testID="business-agenda-loading" style={styles.centerState}>
          <ActivityIndicator color={businessTheme.colors.accent} />
          <Text testID="business-agenda-loading-label" style={styles.stateText}>Carregando agenda…</Text>
        </View>
      ) : agenda.error ? (
        <View style={styles.centerState}>
          <BusinessNotice testID="business-agenda-error" tone="danger" message={agenda.error} />
          <BusinessButton testID="business-agenda-retry" label="Tentar novamente" variant="secondary" onPress={() => void agenda.refresh()} />
        </View>
      ) : agenda.items.length === 0 ? (
        <BusinessEmptyState
          testID="business-agenda-empty"
          icon={<CalendarDays color={businessTheme.colors.accentStrong} size={24} />}
          title={agenda.localDate === today ? 'Agenda livre hoje' : 'Nenhum atendimento neste dia'}
          description={agenda.scope === 'team'
            ? 'A equipe ainda não tem atendimentos marcados para esta data.'
            : 'Você ainda não tem atendimentos marcados para esta data.'}
          actionLabel={activeContext?.accessMode === 'full'
            && (hasCapability('create_self_walk_in') || hasCapability('create_team_walk_in'))
            ? 'Agendar atendimento'
            : undefined}
          onAction={() => router.push('/(app)/walk-in' as never)}
        />
      ) : (
        <View testID="business-agenda-list" style={styles.list}>
          {agenda.items.map((item) => (
            <AppointmentCard
              key={item.id}
              testID={`business-agenda-appointment-${item.id}`}
              item={item}
              timeZone={timeZone}
              onPress={() => openAppointment(item.id)}
            />
          ))}
        </View>
      )}
    </BusinessPage>
  );
}

const styles = StyleSheet.create({
  dateControl: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: businessTheme.colors.border,
    borderRadius: businessTheme.radii.lg,
    borderCurve: 'continuous',
    backgroundColor: businessTheme.colors.surface,
  },
  dateArrow: {
    width: 54,
    minHeight: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateArrowText: { color: businessTheme.colors.accentStrong, fontSize: 32, fontWeight: '500' },
  dateCopy: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 12 },
  dateLabel: {
    color: businessTheme.colors.text,
    fontSize: 15,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  dateHint: { ...businessTheme.typography.eyebrow, color: businessTheme.colors.textMuted, letterSpacing: 0.8 },
  scopeControl: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: businessTheme.radii.md,
    backgroundColor: businessTheme.colors.surface,
  },
  scopeButton: {
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: businessTheme.radii.sm,
  },
  scopeButtonSelected: { backgroundColor: businessTheme.colors.surfaceMuted },
  scopeText: { color: businessTheme.colors.textMuted, fontSize: 12, fontWeight: '800' },
  scopeTextSelected: { color: businessTheme.colors.accentStrong },
  centerState: { gap: businessTheme.spacing.md, paddingVertical: businessTheme.spacing.xl },
  stateText: { ...businessTheme.typography.body, color: businessTheme.colors.textMuted, textAlign: 'center' },
  list: { gap: businessTheme.spacing.sm },
  quickActions: { gap: businessTheme.spacing.sm },
});
