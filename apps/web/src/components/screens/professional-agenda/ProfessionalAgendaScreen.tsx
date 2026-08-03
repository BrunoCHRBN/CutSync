import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { getTodayInTimeZone, appointmentFeedbackMessages, translateAppointmentError } from '@cutsync/domain';
import { useAuth } from '../../../contexts/AuthContext';
import { useAppointments } from '../../../hooks/useAppointments';
import { useEstablishment } from '../../../hooks/useEstablishment';
import { useServices } from '../../../hooks/useServices';
import { useAvailableSlots } from '../../../hooks/useAvailableSlots';
import { useNextAppointment } from '../../../hooks/useNextAppointment';
import { useTeam } from '../../../hooks/useTeam';
import { useScheduleBlocks } from '../../../hooks/use-schedule-blocks';
import { supabase } from '../../../services/supabase';
import { readableForeground } from '../../../theme/color';
import { colors, layout } from '../../../theme/tokens';
import { DashboardAppointment } from '../../../types/dashboard';
import { ProfessionalShell } from '../../layout/ProfessionalShell';
import { ProfessionalQuickBook } from '../../professional/ProfessionalQuickBook';
import { ProfessionalReschedule } from '../../professional/ProfessionalReschedule';
import { ProfessionalOnboarding } from '../../professional/ProfessionalOnboarding';
import { CalendarAppointment, CalendarSlotSelection, OperationalCalendar } from '../../calendar/operational-calendar';
import { AppointmentDetailSheet } from '../../calendar/appointment-detail-sheet';
import { SlotActionSheet } from '../../calendar/slot-action-sheet';
import { ScheduleBlockDraft, ScheduleBlockModal } from '../../calendar/schedule-block-modal';
import { CancelAppointmentModal } from '../../calendar/cancel-appointment-modal';
import { TransferProfessionalModal } from '../../calendar/transfer-professional-modal';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { useToast } from '../../ui/toast-provider';
import { AppCommand, useCommandPalette, useCommandRegistration } from '../../command/command-palette-provider';
import { useAppointmentActions } from '../../../features/appointments/use-appointment-actions';
import { AgendaHeader, AgendaLayoutView } from './AgendaHeader';
import { NextAppointmentStrip } from './NextAppointmentStrip';
import { AbsenceModeWizard } from './AbsenceModeWizard';
import { useAgendaDay } from './hooks/useAgendaDay';

type Tab = 'mine' | 'team';
type QuickBookSource = 'header' | 'timeline';
type RichAppointment = DashboardAppointment & { barberName: string; serviceId?: string };

export const ProfessionalAgendaScreen = () => {
  const { open: openCommandPalette } = useCommandPalette();
  const { pushToast } = useToast();
  const { profile, refreshProfile, signOut } = useAuth();
  const { establishment: barbershop } = useEstablishment(profile?.establishment_id);
  const { services } = useServices(profile?.establishment_id, true);
  const { team } = useTeam(profile?.establishment_id, Boolean(profile?.establishment_id));

  const [tab, setTab] = useState<Tab>('mine');
  const [layoutView, setLayoutView] = useState<AgendaLayoutView>('day');
  const [showFinished, setShowFinished] = useState(false);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [slotSelection, setSlotSelection] = useState<CalendarSlotSelection | null>(null);
  const [blockSelection, setBlockSelection] = useState<CalendarSlotSelection | null>(null);
  const [blockLoading, setBlockLoading] = useState(false);
  const [blockError, setBlockError] = useState<string | null>(null);
  const [blockToDelete, setBlockToDelete] = useState<string | null>(null);
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [absenceOpen, setAbsenceOpen] = useState(false);

  const [quickOpen, setQuickOpen] = useState(false);
  const [quickBookSource, setQuickBookSource] = useState<QuickBookSource>('header');
  const [quickName, setQuickName] = useState('');
  const [quickService, setQuickService] = useState<string | null>(null);
  const [quickTime, setQuickTime] = useState<string | null>(null);
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickDate, setQuickDate] = useState<Date>(new Date());
  const quickSubmissionLocked = useRef(false);

  const [rescheduleItem, setRescheduleItem] = useState<RichAppointment | null>(null);
  const [newRescheduleDate, setNewRescheduleDate] = useState<Date>(new Date());
  const [newRescheduleTime, setNewRescheduleTime] = useState<string | null>(null);
  const [rescheduleProfessionalId, setRescheduleProfessionalId] = useState<string | null>(null);
  const [rescheduleLoading, setRescheduleLoading] = useState(false);

  const { selectedDate, setSelectedDate, selectedRange, weekRange, selectedWorkingDay } = useAgendaDay({
    timezone: barbershop?.timezone,
    professionalWorkHours: profile?.work_hours,
    establishmentOpeningHours: barbershop?.openingHours,
  });

  const queryRange = layoutView === 'week' ? weekRange : selectedRange;

  const {
    appointments: appointmentRecords,
    loading: isSyncing,
    error: appointmentError,
    refresh: refreshAppointments,
  } = useAppointments({
    establishmentId: profile?.establishment_id,
    dateFrom: queryRange.start.toISOString(),
    dateTo: queryRange.end.toISOString(),
    enabled: Boolean(profile?.establishment_id),
  });

  const {
    appointment: nextAppointment,
    loading: nextAppointmentLoading,
    error: nextAppointmentError,
    refresh: refreshNextAppointment,
  } = useNextAppointment({
    establishmentId: profile?.establishment_id,
    professionalId: profile?.id,
    enabled: Boolean(profile?.establishment_id && profile?.id),
  });

  const refresh = useCallback(async () => {
    await Promise.all([refreshAppointments(), refreshNextAppointment()]);
  }, [refreshAppointments, refreshNextAppointment]);

  const actions = useAppointmentActions({ onChanged: refresh });

  const {
    availableSlots: quickAvailableSlots,
    loading: quickAvailabilityLoading,
    error: quickAvailabilityError,
    emptyMessage: quickAvailabilityEmptyMessage,
    refresh: refreshQuickAvailability,
  } = useAvailableSlots({
    establishmentId: profile?.establishment_id,
    professionalId: profile?.id,
    serviceId: quickService,
    date: quickOpen ? quickDate : null,
  });

  const {
    blocks: scheduleBlocks,
    loading: scheduleBlocksLoading,
    error: scheduleBlocksError,
    supported: scheduleBlocksSupported,
    refresh: refreshScheduleBlocks,
  } = useScheduleBlocks({
    establishmentId: profile?.establishment_id,
    professionalId: tab === 'team' && barbershop?.shareAgendas ? null : profile?.id,
    rangeStart: queryRange.start,
    rangeEnd: queryRange.end,
    enabled: Boolean(profile?.establishment_id && profile?.id),
  });

  const rescheduleRecord = appointmentRecords.find((appointment) => appointment.id === rescheduleItem?.id);
  const {
    availableSlots: rescheduleAvailableSlots,
    loading: rescheduleAvailabilityLoading,
    error: rescheduleAvailabilityError,
    emptyMessage: rescheduleAvailabilityEmptyMessage,
  } = useAvailableSlots({
    establishmentId: profile?.establishment_id,
    professionalId: rescheduleProfessionalId || rescheduleItem?.professionalId,
    serviceId: rescheduleRecord?.serviceId,
    date: rescheduleItem ? newRescheduleDate : null,
    appointmentId: rescheduleItem?.id,
  });

  const appointments = useMemo<RichAppointment[]>(
    () => appointmentRecords.map((appointment) => ({
      id: appointment.id,
      professionalId: appointment.professionalId,
      barberName: appointment.professional?.name || 'Profissional',
      clientName: appointment.client?.name || appointment.clientName || 'Cliente sem cadastro',
      clientPhone: appointment.client?.phone || '',
      serviceName: appointment.service?.name || 'Serviço indisponível',
      serviceId: appointment.serviceId,
      price: appointment.priceCharged || appointment.service?.price || 0,
      dateTime: appointment.dateTime,
      status: appointment.status,
      cancellationReason: appointment.cancellationReason || '',
    })),
    [appointmentRecords],
  );

  const calendarAppointments = useMemo<CalendarAppointment[]>(
    () => appointmentRecords.map((item) => ({
      id: item.id,
      professionalId: item.professionalId,
      clientName: item.client?.name || item.clientName || 'Cliente sem cadastro',
      serviceName: item.service?.name || 'Serviço indisponível',
      startsAt: item.dateTime,
      endsAt: new Date(item.dateTime.getTime() + (item.durationMinutes || item.service?.durationMinutes || 30) * 60_000),
      status: item.status,
      price: item.priceCharged || item.service?.price,
      durationMinutes: item.durationMinutes || item.service?.durationMinutes,
      clientPhone: item.client?.phone || '',
      serviceId: item.serviceId,
      rescheduleCount: item.rescheduleCount,
      originalDateTime: item.originalDateTime,
      cancellationReason: item.cancellationReason,
      cancellationReasonCode: item.cancellationReasonCode,
    })),
    [appointmentRecords],
  );

  const selectedCalendarAppointment = calendarAppointments.find((item) => item.id === selectedAppointmentId) || null;
  const cancelTarget = appointments.find((item) => item.id === cancelTargetId) || null;

  const primaryColor = barbershop?.primaryColor || colors.brand;
  const primaryForeground = readableForeground(primaryColor);
  const currency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: barbershop?.currency || 'BRL' }).format(value);
  const time = (date: Date) => date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const calendarResources = useMemo(() => {
    const ownResource = profile?.id ? [{ id: profile.id, name: profile.name || 'Minha agenda', avatarUrl: profile.avatar_url }] : [];
    if (tab === 'mine' || !barbershop?.shareAgendas) return ownResource;
    const resources = team.map((member) => ({ id: member.id, name: member.name, avatarUrl: member.avatarUrl }));
    return [...ownResource, ...resources.filter((resource) => resource.id !== profile?.id)];
  }, [barbershop?.shareAgendas, profile?.avatar_url, profile?.id, profile?.name, tab, team]);

  const visibleMine = appointments.filter((item) => item.professionalId === profile?.id);
  const daySummary = `${visibleMine.length} atendimentos · ${currency(
    visibleMine.filter((item) => ['completed', 'confirmed', 'pending'].includes(item.status)).reduce((sum, item) => sum + item.price, 0),
  )} previstos`;

  const syncError = appointmentError || nextAppointmentError;
  const isDashboardSyncing = isSyncing || nextAppointmentLoading;
  const syncState = syncError ? 'offline' : isDashboardSyncing ? 'syncing' : 'live';

  const quickDateOptions = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date(quickDate);
    date.setDate(date.getDate() + index - 3);
    return date;
  }), [quickDate]);

  const openQuickBook = (source: QuickBookSource, at?: Date) => {
    const slot = at || (barbershop?.timezone ? getTodayInTimeZone(barbershop.timezone) : new Date());
    setQuickBookSource(source);
    setQuickDate(slot);
    setQuickName('');
    setQuickService(services[0]?.id || null);
    setQuickTime(source === 'timeline' && at
      ? `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
      : null);
    setQuickOpen(true);
  };

  const createQuickBooking = async () => {
    if (quickSubmissionLocked.current || quickLoading) return;
    if (!quickName.trim() || !quickService || !quickTime || !profile?.establishment_id || !profile?.id) {
      pushToast({ tone: 'danger', title: 'Informe cliente, serviço e horário' });
      return;
    }
    const service = services.find((item) => item.id === quickService);
    if (!service?.isActive) {
      pushToast({ tone: 'danger', title: 'Serviço indisponível para o seu perfil' });
      return;
    }
    quickSubmissionLocked.current = true;
    setQuickLoading(true);
    try {
      const latestSlots = await refreshQuickAvailability();
      if (!latestSlots) throw new Error('availability_check_failed');
      const confirmedSlot = latestSlots.find((slot) => slot.available && slot.localTime === quickTime);
      if (!confirmedSlot) throw new Error('appointment_conflict');
      const { error } = await supabase.rpc('create_appointment', {
        target_establishment_id: profile.establishment_id,
        target_professional_id: profile.id,
        target_service_id: quickService,
        target_date_time: confirmedSlot.startsAt,
        target_client_name: quickName.trim(),
      });
      if (error) throw error;
      setQuickOpen(false);
      setQuickName('');
      setQuickService(null);
      setQuickTime(null);
      pushToast({ tone: 'success', title: appointmentFeedbackMessages.quickBookingCreated });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refresh();
    } catch (err) {
      pushToast({ tone: 'danger', title: translateAppointmentError(err, 'Não foi possível criar o encaixe.') });
    } finally {
      quickSubmissionLocked.current = false;
      setQuickLoading(false);
    }
  };

  const createBlock = async (draft: ScheduleBlockDraft) => {
    if (!profile?.establishment_id || !profile.id) return;
    setBlockLoading(true);
    setBlockError(null);
    const { error } = await supabase.rpc('create_schedule_block', {
      target_establishment_id: profile.establishment_id,
      target_professional_id: profile.id,
      requested_start: draft.startsAt.toISOString(),
      requested_end: draft.endsAt.toISOString(),
      requested_kind: draft.kind,
      requested_reason: draft.reason || undefined,
    });
    setBlockLoading(false);
    if (error) {
      setBlockError(
        error.message.includes('schedule_block_conflict')
          ? 'Já existe um atendimento ativo neste período.'
          : error.message.includes('schedule_block_overlap')
            ? 'Este período já possui outro bloqueio.'
            : 'Não foi possível bloquear este horário.',
      );
      return;
    }
    await refreshScheduleBlocks();
    setBlockSelection(null);
    pushToast({ tone: 'success', title: 'Horário bloqueado' });
  };

  const confirmDeleteBlock = async () => {
    if (!blockToDelete) return;
    const { error } = await supabase.rpc('delete_schedule_block', { target_block_id: blockToDelete });
    setBlockToDelete(null);
    if (error) {
      pushToast({ tone: 'danger', title: 'Não foi possível remover este bloqueio.' });
      return;
    }
    await refreshScheduleBlocks();
    pushToast({ tone: 'success', title: 'Horário liberado' });
  };

  const executeReschedule = async () => {
    if (!rescheduleItem || !newRescheduleTime) return;
    setRescheduleLoading(true);
    const newDate = new Date(newRescheduleDate);
    const [hours, minutes] = newRescheduleTime.split(':');
    newDate.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
    const current = appointmentRecords.find((item) => item.id === rescheduleItem.id);
    if (!current) {
      setRescheduleLoading(false);
      return;
    }
    const ok = await actions.reschedule({
      appointmentId: rescheduleItem.id,
      dateTime: newDate,
      professionalId: rescheduleProfessionalId || current.professionalId,
      serviceId: current.serviceId,
    });
    setRescheduleLoading(false);
    if (ok) setRescheduleItem(null);
  };

  const dashboardCommands = useMemo<AppCommand[]>(() => {
    const professionalId = profile?.id;
    const commandSlot = new Date(selectedDate);
    if (commandSlot.toDateString() === new Date().toDateString()) {
      const now = new Date();
      commandSlot.setHours(now.getHours(), Math.ceil(now.getMinutes() / 30) * 30, 0, 0);
    } else {
      const [hour, minute] = (selectedWorkingDay?.isOpen ? selectedWorkingDay.open : '09:00').split(':').map(Number);
      commandSlot.setHours(hour, minute, 0, 0);
    }
    const moveDay = (delta: number) => {
      const next = new Date(selectedDate);
      next.setDate(next.getDate() + delta);
      setSelectedDate(next);
    };
    return [
      { id: 'new-appointment', label: 'Novo agendamento', keywords: ['horario', 'cliente'], shortcut: 'N', roles: ['professional'], disabled: !professionalId, run: () => openQuickBook('timeline', commandSlot) },
      { id: 'quick-booking', label: 'Novo encaixe', keywords: ['rapido'], shortcut: 'E', roles: ['professional'], disabled: !professionalId, run: () => openQuickBook('header') },
      { id: 'block-time', label: 'Bloquear horário', keywords: ['pausa', 'ausencia'], shortcut: 'B', roles: ['professional'], disabled: !professionalId || !scheduleBlocksSupported, run: () => professionalId && setBlockSelection({ professionalId, startsAt: commandSlot }) },
      { id: 'absence-mode', label: 'Modo ausência', keywords: ['emergencia', 'transferir'], roles: ['professional'], disabled: !professionalId, run: () => setAbsenceOpen(true) },
      { id: 'calendar-today', label: 'Ir para hoje', keywords: ['data'], shortcut: 'T', roles: ['professional'], run: () => setSelectedDate(new Date()) },
      { id: 'calendar-previous-day', label: 'Dia anterior', keywords: ['data'], shortcut: '[', roles: ['professional'], run: () => moveDay(-1) },
      { id: 'calendar-next-day', label: 'Próximo dia', keywords: ['data'], shortcut: ']', roles: ['professional'], run: () => moveDay(1) },
      { id: 'calendar-refresh', label: 'Atualizar agenda', keywords: ['sincronizar'], roles: ['professional'], run: () => { void refresh(); } },
      { id: 'search-appointment', label: 'Buscar atendimento pelo cliente', keywords: ['nome', 'busca'], shortcut: '/', roles: ['professional'], run: openCommandPalette },
    ];
  }, [openCommandPalette, profile?.id, refresh, scheduleBlocksSupported, selectedDate, selectedWorkingDay, services]);
  useCommandRegistration('professional-dashboard', dashboardCommands);

  const professionalPixAllowed = barbershop?.professionalPixAllowed !== false;
  const profileExtras = profile as typeof profile & {
    specialties?: string | null;
    pix_key?: string | null;
  };
  const needsOnboarding = profile?.role === 'professional' && (
    !profileExtras?.specialties
    || !profile?.titulo_profissional
    || (professionalPixAllowed && !profileExtras?.pix_key)
  );

  if (needsOnboarding) {
    return (
      <ProfessionalOnboarding
        profile={profile}
        professionalPixAllowed={professionalPixAllowed}
        onComplete={async () => { await refreshProfile(); }}
      />
    );
  }

  const canActOnSelected = Boolean(
    selectedCalendarAppointment
    && !actions.loadingId
    && selectedCalendarAppointment.professionalId === profile?.id
    && !['completed', 'cancelled', 'no_show'].includes(selectedCalendarAppointment.status),
  );

  return (
    <ProfessionalShell testID="barber-dashboard-screen" name={profile?.name} shopName={barbershop?.name} onSignOut={signOut} activeRoute="agenda">
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <AgendaHeader
          canBlock={Boolean(scheduleBlocksSupported && profile?.id)}
          daySummary={daySummary}
          foregroundColor={primaryForeground}
          layoutView={layoutView}
          onAbsenceMode={() => setAbsenceOpen(true)}
          onBlock={() => profile?.id && setBlockSelection({ professionalId: profile.id, startsAt: selectedDate })}
          onLayoutViewChange={setLayoutView}
          onQuickBook={() => openQuickBook('header')}
          primaryColor={primaryColor}
          syncState={syncState}
        />

        <NextAppointmentStrip
          appointment={nextAppointment}
          loading={nextAppointmentLoading}
          onConfirm={nextAppointment ? () => { void actions.updateStatus(nextAppointment.id, 'confirmed'); } : undefined}
          onDetails={nextAppointment ? () => setSelectedAppointmentId(nextAppointment.id) : undefined}
        />

        <OperationalCalendar
          allowTeamView={Boolean(barbershop?.shareAgendas)}
          appointments={calendarAppointments}
          blocks={scheduleBlocks}
          closed={selectedWorkingDay ? !selectedWorkingDay.isOpen : false}
          date={selectedDate}
          error={appointmentError || scheduleBlocksError}
          layoutView={layoutView}
          legacyTestIDs={{
            previousDay: 'barber-calendar-prev',
            nextDay: 'barber-calendar-next',
            today: 'barber-calendar-today',
            view: 'barber-agenda-tabs',
            loading: 'barber-agenda-loading',
          }}
          loading={isSyncing || scheduleBlocksLoading}
          onAppointmentPress={(appointment) => setSelectedAppointmentId(appointment.id)}
          onBlockPress={(block) => {
            if (block.professionalId === profile?.id) setBlockToDelete(block.id);
          }}
          onDateChange={setSelectedDate}
          onEmptyBlock={() => profile?.id && setBlockSelection({ professionalId: profile.id, startsAt: selectedDate })}
          onEmptyQuickBook={() => openQuickBook('header')}
          onRetry={() => { void refreshAppointments(); }}
          onSlotPress={(selection) => {
            if (selection.professionalId !== profile?.id) {
              pushToast({ tone: 'danger', title: 'Você só pode agir na sua própria agenda.' });
              return;
            }
            setSlotSelection(selection);
          }}
          onToggleFinished={() => setShowFinished((current) => !current)}
          onViewChange={(nextView) => setTab(nextView)}
          ownProfessionalId={profile?.id}
          resources={calendarResources}
          showFinished={showFinished}
          syncState={syncState}
          testID="barber-operational-calendar"
          timezone={barbershop?.timezone}
          view={tab}
          workingHours={selectedWorkingDay?.isOpen ? { start: selectedWorkingDay.open, end: selectedWorkingDay.close } : null}
        />
      </ScrollView>

      <SlotActionSheet
        canBlock={Boolean(scheduleBlocksSupported && slotSelection?.professionalId === profile?.id)}
        onBlock={(selection) => {
          setSlotSelection(null);
          setBlockError(null);
          setBlockSelection(selection);
        }}
        onBook={(selection) => {
          setSlotSelection(null);
          openQuickBook('timeline', selection.startsAt);
        }}
        onClose={() => setSlotSelection(null)}
        professionalName={profile?.name}
        selection={slotSelection}
      />

      <ScheduleBlockModal
        error={blockError}
        loading={blockLoading}
        onClose={() => { if (!blockLoading) setBlockSelection(null); }}
        onSubmit={(draft) => { void createBlock(draft); }}
        professionals={calendarResources.filter((resource) => resource.id === profile?.id)}
        selection={blockSelection}
      />

      <AppointmentDetailSheet
        appointment={selectedCalendarAppointment}
        canCancel={canActOnSelected}
        canComplete={canActOnSelected}
        canReschedule={canActOnSelected}
        canTransfer={canActOnSelected && team.filter((member) => member.id !== profile?.id).length > 0}
        completeLabel={selectedCalendarAppointment?.status === 'pending' ? 'Confirmar' : 'Concluir'}
        onCancel={(appointment) => {
          setSelectedAppointmentId(null);
          setCancelTargetId(appointment.id);
        }}
        onClose={() => setSelectedAppointmentId(null)}
        onComplete={(appointment) => {
          setSelectedAppointmentId(null);
          void actions.updateStatus(appointment.id, appointment.status === 'pending' ? 'confirmed' : 'completed');
        }}
        onReschedule={(appointment) => {
          const item = appointments.find((candidate) => candidate.id === appointment.id);
          if (!item) return;
          setSelectedAppointmentId(null);
          setRescheduleItem(item);
          setRescheduleProfessionalId(item.professionalId);
          setNewRescheduleDate(new Date(item.dateTime));
          setNewRescheduleTime(time(item.dateTime));
        }}
        onTransfer={() => setTransferOpen(true)}
        professionalName={appointments.find((item) => item.id === selectedCalendarAppointment?.id)?.barberName}
        visible={Boolean(selectedCalendarAppointment) && !transferOpen}
      />

      <TransferProfessionalModal
        appointment={selectedCalendarAppointment}
        candidates={team.map((member) => ({ id: member.id, name: member.name }))}
        establishmentId={profile?.establishment_id}
        loading={Boolean(actions.loadingId)}
        onClose={() => setTransferOpen(false)}
        onPickOtherSlot={(professionalId) => {
          const item = appointments.find((candidate) => candidate.id === selectedCalendarAppointment?.id);
          if (!item) return;
          setTransferOpen(false);
          setSelectedAppointmentId(null);
          setRescheduleItem(item);
          setRescheduleProfessionalId(professionalId);
          setNewRescheduleDate(new Date(item.dateTime));
          setNewRescheduleTime(null);
        }}
        onTransferSameSlot={async (professionalId) => {
          if (!selectedCalendarAppointment?.serviceId) return;
          const ok = await actions.transferProfessional({
            appointmentId: selectedCalendarAppointment.id,
            dateTime: selectedCalendarAppointment.startsAt,
            toProfessionalId: professionalId,
            serviceId: selectedCalendarAppointment.serviceId,
          });
          if (ok) {
            setTransferOpen(false);
            setSelectedAppointmentId(null);
          }
        }}
        serviceId={selectedCalendarAppointment?.serviceId}
        visible={transferOpen && Boolean(selectedCalendarAppointment)}
      />

      <CancelAppointmentModal
        clientName={cancelTarget?.clientName}
        loading={Boolean(actions.loadingId)}
        onCancel={() => setCancelTargetId(null)}
        onConfirm={async (reason) => {
          if (!cancelTargetId) return;
          const ok = await actions.updateStatus(cancelTargetId, 'cancelled', reason);
          if (ok) setCancelTargetId(null);
        }}
        visible={Boolean(cancelTargetId)}
      />

      <ConfirmDialog
        destructive
        message="Deseja liberar este horário na agenda?"
        onCancel={() => setBlockToDelete(null)}
        onConfirm={() => { void confirmDeleteBlock(); }}
        title="Remover bloqueio"
        visible={Boolean(blockToDelete)}
        testID="delete-block-confirm"
      />

      <AbsenceModeWizard
        appointments={calendarAppointments.map((item) => ({ ...item, serviceId: item.serviceId || '' }))}
        establishmentId={profile?.establishment_id || ''}
        loading={actions.batchLoading}
        onClose={() => setAbsenceOpen(false)}
        onConfirm={async (input) => {
          if (!profile?.id) return null;
          const report = await actions.runAbsenceMode({
            professionalId: profile.id,
            rangeStart: input.rangeStart,
            rangeEnd: input.rangeEnd,
            transfers: input.transfers,
          });
          await refreshScheduleBlocks();
          return report;
        }}
        professionalId={profile?.id || ''}
        team={team.map((member) => ({ id: member.id, name: member.name }))}
        visible={absenceOpen}
      />

      <ProfessionalQuickBook
        visible={quickOpen}
        onClose={() => setQuickOpen(false)}
        clientName={quickName}
        onClientNameChange={setQuickName}
        dates={quickDateOptions}
        selectedDate={quickDate}
        onDateChange={(value) => { setQuickDate(value); setQuickTime(null); }}
        services={services}
        selectedService={quickService}
        onServiceChange={(value) => { setQuickService(value); setQuickTime(null); }}
        times={quickAvailableSlots.map((slot) => slot.localTime)}
        availabilityLoading={quickAvailabilityLoading}
        availabilityError={quickAvailabilityError}
        availabilityEmptyMessage={quickAvailabilityEmptyMessage}
        selectedTime={quickTime}
        onTimeChange={setQuickTime}
        primaryColor={primaryColor}
        foregroundColor={primaryForeground}
        currency={currency}
        loading={quickLoading}
        submitDisabled={!quickName.trim() || !quickService || !quickTime || quickAvailabilityLoading || !quickAvailableSlots.some((slot) => slot.localTime === quickTime)}
        onSubmit={createQuickBooking}
      />

      <ProfessionalReschedule
        appointment={rescheduleItem}
        onClose={() => setRescheduleItem(null)}
        selectedDate={newRescheduleDate}
        onDateChange={(value) => { setNewRescheduleDate(value); setNewRescheduleTime(null); }}
        times={rescheduleAvailableSlots.map((slot) => slot.localTime)}
        availabilityLoading={rescheduleAvailabilityLoading}
        availabilityError={rescheduleAvailabilityError}
        availabilityEmptyMessage={rescheduleAvailabilityEmptyMessage}
        selectedTime={newRescheduleTime}
        onTimeChange={setNewRescheduleTime}
        professionals={calendarResources}
        selectedProfessionalId={rescheduleProfessionalId}
        onProfessionalChange={(value) => { setRescheduleProfessionalId(value); setNewRescheduleTime(null); }}
        primaryColor={primaryColor}
        foregroundColor={primaryForeground}
        loading={rescheduleLoading}
        onSubmit={executeReschedule}
      />
    </ProfessionalShell>
  );
};

const styles = StyleSheet.create({
  scroll: { width: '100%', maxWidth: layout.contentMax, alignSelf: 'center', padding: 20, paddingTop: 24, paddingBottom: 96 },
});

export default ProfessionalAgendaScreen;
