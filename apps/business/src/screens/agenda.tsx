import { CalendarDays } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AgendaCancelledList } from '@/components/agenda/agenda-cancelled-list';
import { AgendaTimeline } from '@/components/agenda/agenda-timeline';
import { AgendaViewToggle, type AgendaViewMode } from '@/components/agenda/agenda-view-toggle';
import { AgendaWeekStrip } from '@/components/agenda/agenda-week-strip';
import { BusinessFloatingAction } from '@/components/appointments/business-floating-action';
import { AppointmentCard } from '@/components/operations/appointment-card';
import { BusinessEmptyState } from '@/components/ui/business-empty-state';
import { BusinessButton, BusinessHeader, BusinessNotice, BusinessPage, BusinessSectionTitle } from '@/components/ui/business-ui';
import { useBusinessOperational } from '@/contexts/business-operational-context';
import { useBusinessSession } from '@/contexts/business-session';
import { formatAgendaDate, getLocalDateInTimeZone, getLocalWeekStart, localDateTimeToIso, shiftLocalDate } from '@/features/agenda/business-agenda';
import { useBusinessAgenda } from '@/features/agenda/use-business-agenda';
import { useBusinessWeekOccupancy } from '@/features/agenda/use-business-week-occupancy';
import { useBusinessScheduleBlocks } from '@/features/schedules/use-business-schedule-blocks';
import { useBusinessTeam } from '@/features/team/use-business-team';
import { businessTheme } from '@/theme/business-theme';

export function BusinessAgendaScreen() {
  const router = useRouter();
  const { user } = useBusinessSession();
  const { activeContext, hasCapability } = useBusinessOperational();
  const agenda = useBusinessAgenda();
  const team = useBusinessTeam();
  const [viewMode, setViewMode] = useState<AgendaViewMode>('timeline');
  const timeZone = activeContext?.timezone ?? 'America/Sao_Paulo';
  const today = getLocalDateInTimeZone(timeZone);
  const weekStart = getLocalWeekStart(agenda.localDate);
  const week = useBusinessWeekOccupancy(weekStart, agenda.scope);
  const rangeStart = localDateTimeToIso(agenda.localDate, '00:00', timeZone) ?? '';
  const rangeEnd = localDateTimeToIso(shiftLocalDate(agenda.localDate, 1), '00:00', timeZone) ?? '';
  const blocks = useBusinessScheduleBlocks(rangeStart, rangeEnd, agenda.scope);
  const canCreate = activeContext?.accessMode === 'full'
    && (hasCapability('create_self_walk_in') || hasCapability('create_team_walk_in'));
  const activeItems = agenda.items.filter((item) => item.status !== 'cancelled' && item.status !== 'no_show');
  const cancelledItems = agenda.items.filter((item) => item.status === 'cancelled' || item.status === 'no_show');

  const professionals = useMemo(() => {
    const byId = new Map<string, string>();
    if (agenda.scope === 'own' && user?.id) byId.set(user.id, 'Minha agenda');
    if (agenda.scope === 'team') {
      team.data?.members.filter((member) => member.status === 'active').forEach((member) => byId.set(member.profileId, member.name));
    }
    agenda.items.forEach((item) => byId.set(item.professionalId, item.professionalName));
    blocks.data?.forEach((block) => {
      if (!byId.has(block.professionalId)) byId.set(block.professionalId, block.professionalName ?? 'Profissional');
    });
    return [...byId.entries()].map(([id, name]) => ({ id, name }));
  }, [agenda.items, agenda.scope, blocks.data, team.data?.members, user?.id]);

  const canCreateSlot = (professionalId: string) => Boolean(
    activeContext?.accessMode === 'full'
    && (hasCapability('create_team_walk_in')
      || (professionalId === user?.id && hasCapability('create_self_walk_in'))),
  );
  const openAppointment = (appointmentId: string) => router.push(`/(app)/appointments/${appointmentId}`);
  const openEmptySlot = (time: string, professionalId: string) => {
    router.push({ pathname: '/(app)/walk-in', params: { date: agenda.localDate, time, professionalId } } as never);
  };

  return (
    <View style={styles.screen}>
      <BusinessPage testID="business-agenda-screen" contentStyle={styles.pageContent}>
        <BusinessHeader testID="business-agenda-header" eyebrow="SUA ROTINA" title="Agenda" description={activeContext?.establishmentName} />

        <AgendaWeekStrip
          dates={week.dates}
          selectedDate={agenda.localDate}
          today={today}
          counts={week.counts}
          isFetching={week.isFetching}
          onSelectDate={agenda.setLocalDate}
          onPreviousWeek={() => agenda.setLocalDate(shiftLocalDate(agenda.localDate, -7))}
          onNextWeek={() => agenda.setLocalDate(shiftLocalDate(agenda.localDate, 7))}
          onToday={() => agenda.setLocalDate(today)}
        />

        <View style={styles.dayHeading}>
          <View style={styles.dayCopy}>
            <BusinessSectionTitle testID="business-agenda-selected-day">{formatAgendaDate(agenda.localDate, timeZone)}</BusinessSectionTitle>
            <Text testID="business-agenda-day-summary" style={styles.daySummary}>{activeItems.length} ativos · {blocks.data?.length ?? 0} bloqueios</Text>
          </View>
          {activeContext?.accessMode === 'full' && (hasCapability('manage_own_blocks') || hasCapability('manage_team_blocks')) ? (
            <BusinessButton testID="business-agenda-manage-blocks" label="Bloqueios" variant="ghost" onPress={() => router.push('/(app)/schedule-blocks' as never)} />
          ) : null}
        </View>

        {activeContext?.accessMode === 'read_only' ? <BusinessNotice testID="business-agenda-read-only" tone="warning" message="Você pode consultar esta agenda, mas não fazer alterações." /> : null}

        {agenda.canViewTeam ? (
          <View accessibilityRole="tablist" style={styles.scopeControl}>
            {(['own', 'team'] as const).map((scope) => {
              const selected = agenda.scope === scope;
              return (
                <Pressable key={scope} testID={`business-agenda-scope-${scope}`} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => agenda.setScope(scope)} style={({ pressed }) => [styles.scopeButton, selected && styles.scopeButtonSelected, pressed && styles.pressed]}>
                  <Text style={[styles.scopeText, selected && styles.scopeTextSelected]}>{scope === 'own' ? 'Minha agenda' : 'Equipe'}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <AgendaViewToggle value={viewMode} onChange={setViewMode} />
        {blocks.error ? <BusinessNotice testID="business-agenda-blocks-error" tone="danger" message="Não foi possível carregar os bloqueios deste dia." /> : null}

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
        ) : viewMode === 'timeline' && professionals.length > 0 ? (
          <AgendaTimeline
            localDate={agenda.localDate}
            timeZone={timeZone}
            professionals={professionals}
            items={activeItems}
            blocks={blocks.data ?? []}
            teamMode={agenda.scope === 'team'}
            canCreateSlot={canCreateSlot}
            onOpenAppointment={openAppointment}
            onOpenBlock={() => router.push('/(app)/schedule-blocks' as never)}
            onEmptySlot={openEmptySlot}
          />
        ) : activeItems.length === 0 ? (
          <BusinessEmptyState testID="business-agenda-empty" icon={<CalendarDays color={businessTheme.colors.accentStrong} size={24} />} title={agenda.localDate === today ? 'Agenda livre hoje' : 'Nenhum atendimento neste dia'} description={agenda.scope === 'team' ? 'A equipe ainda não tem atendimentos marcados para esta data.' : 'Você ainda não tem atendimentos marcados para esta data.'} />
        ) : (
          <View testID="business-agenda-list" style={styles.list}>
            {activeItems.map((item) => <AppointmentCard key={item.id} testID={`business-agenda-appointment-${item.id}`} item={item} timeZone={timeZone} onPress={() => openAppointment(item.id)} />)}
          </View>
        )}
        <AgendaCancelledList items={cancelledItems} timeZone={timeZone} onOpen={openAppointment} />
      </BusinessPage>
      {canCreate ? <BusinessFloatingAction testID="business-agenda-fab-schedule" label="Agendar" onPress={() => router.push('/(app)/walk-in' as never)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: businessTheme.colors.canvas },
  pageContent: { paddingBottom: 112 },
  dayHeading: { flexDirection: 'row', alignItems: 'center', gap: businessTheme.spacing.sm },
  dayCopy: { flex: 1, gap: 3 },
  daySummary: { ...businessTheme.typography.caption, color: businessTheme.colors.textMuted },
  scopeControl: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: businessTheme.radii.md, backgroundColor: businessTheme.colors.surface },
  scopeButton: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: businessTheme.radii.sm },
  scopeButtonSelected: { backgroundColor: businessTheme.colors.surfaceMuted },
  pressed: { opacity: businessTheme.opacity.pressed },
  scopeText: { color: businessTheme.colors.textMuted, fontSize: 12, fontWeight: '800' },
  scopeTextSelected: { color: businessTheme.colors.accentStrong },
  centerState: { gap: businessTheme.spacing.md, paddingVertical: businessTheme.spacing.xl },
  stateText: { ...businessTheme.typography.body, color: businessTheme.colors.textMuted, textAlign: 'center' },
  list: { gap: businessTheme.spacing.sm },
});