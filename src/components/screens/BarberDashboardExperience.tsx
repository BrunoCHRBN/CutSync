import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Check, Plus, WalletCards } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useAppointments } from '../../hooks/useAppointments';
import { useEstablishment } from '../../hooks/useEstablishment';
import { useServices } from '../../hooks/useServices';
import { useAvailableSlots } from '../../hooks/useAvailableSlots';
import { useNextAppointment } from '../../hooks/useNextAppointment';
import { supabase } from '../../services/supabase';
import { ProfessionalShell } from '../layout/ProfessionalShell';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';
import { InlineNotice } from '../ui/InlineNotice';
import { SectionHeading } from '../ui/SectionHeading';
import { colors, layout, radii, typography } from '../../theme/tokens';
import { parseSchedule } from '../../utils/schedule';
import { DashboardAppointment } from '../../types/dashboard';
import { ProfessionalQuickBook } from '../professional/ProfessionalQuickBook';
import { ProfessionalReschedule } from '../professional/ProfessionalReschedule';
import { ProfessionalOnboarding } from '../professional/ProfessionalOnboarding';
import { getTodayInTimeZone } from '../../utils/dateTime';
import { appointmentFeedbackMessages, translateAppointmentError } from '../../utils/appointmentErrors';
import { NextAppointmentCard } from '../booking/NextAppointmentCard';
import { useTeam } from '../../hooks/useTeam';
import { CalendarAppointment, CalendarSlotSelection, OperationalCalendar } from '../calendar/operational-calendar';
import { AppointmentDetailSheet } from '../calendar/appointment-detail-sheet';
import { PageHeader } from '../ui/page-header';
import { MetricStrip } from '../ui/metric-strip';
import { useScheduleBlocks } from '../../hooks/use-schedule-blocks';
import { SlotActionSheet } from '../calendar/slot-action-sheet';
import { ScheduleBlockDraft, ScheduleBlockModal } from '../calendar/schedule-block-modal';
import { AppCommand, useCommandPalette, useCommandRegistration } from '../command/command-palette-provider';

type Tab = 'mine' | 'team';
type QuickBookSource = 'header' | 'timeline';

type RichAppointment = DashboardAppointment & { barberName: string };

const defaultSchedule = [
  { day: 1, name: 'Segunda-feira', isOpen: true, open: '09:00', close: '20:00' },
  { day: 2, name: 'Terça-feira', isOpen: true, open: '09:00', close: '20:00' },
  { day: 3, name: 'Quarta-feira', isOpen: true, open: '09:00', close: '20:00' },
  { day: 4, name: 'Quinta-feira', isOpen: true, open: '09:00', close: '20:00' },
  { day: 5, name: 'Sexta-feira', isOpen: true, open: '09:00', close: '20:00' },
  { day: 6, name: 'Sábado', isOpen: true, open: '09:00', close: '20:00' },
  { day: 0, name: 'Domingo', isOpen: false, open: '09:00', close: '18:00' },
];

const readableForeground = (hex: string) => {
  const normalized = hex.replace('#', '');
  if (!/^[0-9A-Fa-f]{6}$/.test(normalized)) return '#FFFFFF';
  const [r, g, b] = [0, 2, 4].map((index) => parseInt(normalized.slice(index, index + 2), 16));
  return ((r * 299 + g * 587 + b * 114) / 1000) > 160 ? '#171717' : '#FFFFFF';
};

export const BarberDashboardExperience = () => {
  const { open: openCommandPalette } = useCommandPalette();
  const { profile, refreshProfile, signOut } = useAuth();
  const { establishment: barbershop } = useEstablishment(profile?.establishment_id);
  const [appointments, setAppointments] = useState<RichAppointment[]>([]);
  const { services } = useServices(profile?.establishment_id, true);
  const { team } = useTeam(profile?.establishment_id, Boolean(profile?.establishment_id));
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [tab, setTab] = useState<Tab>('mine');
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [showFinished, setShowFinished] = useState(false);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [slotSelection, setSlotSelection] = useState<CalendarSlotSelection | null>(null);
  const [blockSelection, setBlockSelection] = useState<CalendarSlotSelection | null>(null);
  const [blockLoading, setBlockLoading] = useState(false);
  const [blockError, setBlockError] = useState<string | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickBookSource, setQuickBookSource] = useState<QuickBookSource>('header');
  const [quickName, setQuickName] = useState('');
  const [quickService, setQuickService] = useState<string | null>(null);
  const [quickTime, setQuickTime] = useState<string | null>(null);
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickDate, setQuickDate] = useState<Date>(new Date());
  const quickSubmissionLocked = useRef(false);

  // Estados locais para Reagendamento
  const [rescheduleItem, setRescheduleItem] = useState<RichAppointment | null>(null);
  const [newRescheduleDate, setNewRescheduleDate] = useState<Date>(new Date());
  const [newRescheduleTime, setNewRescheduleTime] = useState<string | null>(null);
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null);
  const selectedRange = useMemo(() => {
    const start = new Date(selectedDate); start.setHours(0, 0, 0, 0);
    const end = new Date(selectedDate); end.setHours(23, 59, 59, 999);
    return { start, end };
  }, [selectedDate]);
  const { appointments: appointmentRecords, loading: isSyncing, error: appointmentError, refresh: refreshAppointments } = useAppointments({
    establishmentId: profile?.establishment_id,
    dateFrom: selectedRange.start.toISOString(),
    dateTo: selectedRange.end.toISOString(),
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
  const syncError = appointmentError || nextAppointmentError
    ? new Error(appointmentError || nextAppointmentError || '')
    : null;
  const isDashboardSyncing = isSyncing || nextAppointmentLoading;
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
    rangeStart: selectedRange.start,
    rangeEnd: selectedRange.end,
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
    professionalId: rescheduleItem?.professionalId,
    serviceId: rescheduleRecord?.serviceId,
    date: rescheduleItem ? newRescheduleDate : null,
    appointmentId: rescheduleItem?.id,
  });

  const weekOffset = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selected = new Date(selectedDate);
    selected.setHours(0, 0, 0, 0);
    const diffTime = selected.getTime() - today.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    return Math.floor((diffDays + 3) / 7);
  }, [selectedDate]);

  const dateOptions = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const offset = (index - 3) + (weekOffset * 7);
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return date;
  }), [weekOffset]);

  const quickDateOptions = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date(quickDate);
    date.setDate(date.getDate() + index - 3);
    return date;
  }), [quickDate]);

  useEffect(() => {
    setAppointments(appointmentRecords.map((appointment) => ({
      id: appointment.id, professionalId: appointment.professionalId,
      barberName: appointment.professional?.name || 'Profissional',
      clientName: appointment.client?.name || appointment.clientName || 'Cliente sem cadastro',
      clientPhone: appointment.client?.phone || '',
      serviceName: appointment.service?.name || 'Serviço indisponível',
      price: appointment.service?.price || 0, dateTime: appointment.dateTime,
      status: appointment.status, cancellationReason: appointment.cancellationReason || '',
    })));
    setLoading(isSyncing);
  }, [appointmentRecords, isSyncing]);

  useEffect(() => {
    if (!quickOpen || quickBookSource !== 'header' || quickTime || quickAvailabilityLoading) return;
    setQuickTime(quickAvailableSlots[0]?.localTime || null);
  }, [quickAvailabilityLoading, quickAvailableSlots, quickBookSource, quickOpen, quickTime]);

  const visibleAppointments = tab === 'mine' ? appointments.filter((item) => item.professionalId === profile?.id) : appointments;
  const completed = visibleAppointments.filter((item) => item.status === 'completed');
  const revenue = completed.reduce((sum, item) => sum + item.price, 0);
  const commission = revenue * (profile?.commission_rate ?? 0.5);
  const projectedRevenue = visibleAppointments
    .filter((item) => ['completed', 'confirmed'].includes(item.status))
    .reduce((sum, item) => sum + item.price, 0);
  const projectedCommission = projectedRevenue * (profile?.commission_rate ?? 0.5);
  const currency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: barbershop?.currency || 'BRL' }).format(value);
  const primaryColor = barbershop?.primaryColor || colors.brand;
  const primaryForeground = readableForeground(primaryColor);
  const time = (date: Date) => date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const calendarResources = useMemo(() => {
    const ownResource = profile?.id ? [{ id: profile.id, name: profile.name || 'Minha agenda', avatarUrl: profile.avatar_url }] : [];
    if (tab === 'mine' || !barbershop?.shareAgendas) return ownResource;
    const resources = team.map((member) => ({ id: member.id, name: member.name, avatarUrl: member.avatarUrl }));
    return [
      ...ownResource,
      ...resources.filter((resource) => resource.id !== profile?.id),
    ];
  }, [barbershop?.shareAgendas, profile?.avatar_url, profile?.id, profile?.name, tab, team]);

  const calendarAppointments = useMemo<CalendarAppointment[]>(
    () => appointmentRecords.map((item) => ({
      id: item.id,
      professionalId: item.professionalId,
      clientName: item.client?.name || item.clientName || 'Cliente sem cadastro',
      serviceName: item.service?.name || 'Serviço indisponível',
      startsAt: item.dateTime,
      endsAt: new Date(item.dateTime.getTime() + (item.service?.durationMinutes || 30) * 60_000),
      status: item.status,
      price: item.service?.price,
      clientPhone: item.client?.phone || '',
    })),
    [appointmentRecords],
  );

  const selectedCalendarAppointment = calendarAppointments.find((item) => item.id === selectedAppointmentId) || null;
  const professionalSchedule = useMemo(() => profile?.work_hours ? parseSchedule(profile.work_hours) : [], [profile?.work_hours]);
  const establishmentSchedule = useMemo(() => parseSchedule(barbershop?.openingHours), [barbershop?.openingHours]);
  const selectedWorkingDay = useMemo(
    () => professionalSchedule.find((day) => day.day === selectedDate.getDay())
      || establishmentSchedule.find((day) => day.day === selectedDate.getDay())
      || defaultSchedule.find((day) => day.day === selectedDate.getDay()),
    [establishmentSchedule, professionalSchedule, selectedDate],
  );

  const updateStatus = async (id: string, status: 'confirmed' | 'completed' | 'cancelled', reason?: string) => {
    if (status === 'cancelled' && !reason) {
      if (Platform.OS === 'web') {
        const val = window.prompt('Motivo do Cancelamento:', 'Cliente solicitou');
        if (val === null) return;
        updateStatus(id, 'cancelled', val || 'Cliente solicitou');
      } else {
        Alert.alert(
          'Motivo do Cancelamento',
          'Selecione a justificativa:',
          [
            { text: 'Cliente solicitou', onPress: () => updateStatus(id, 'cancelled', 'Cliente solicitou') },
            { text: 'Falta do profissional', onPress: () => updateStatus(id, 'cancelled', 'Profissional indisponível') },
            { text: 'Erro de agenda', onPress: () => updateStatus(id, 'cancelled', 'Erro de agenda') },
            { text: 'Voltar', style: 'cancel' }
          ]
        );
      }
      return;
    }
    setActionLoadingId(id);
    try {
      const appointment = appointmentRecords.find((item) => item.id === id);
      if (status === 'completed' && appointment && appointment.dateTime.getTime() > Date.now()) {
        setNotice({ tone: 'danger', message: 'Não é possível concluir um agendamento no futuro.' });
        setActionLoadingId(null);
        return;
      }

      const rpcParams: { target_appointment_id: string; new_status: string; new_cancellation_reason?: string } = {
        target_appointment_id: id,
        new_status: status,
      };
      if (status === 'cancelled') {
        rpcParams.new_cancellation_reason = reason;
      }
      const { error } = await supabase.rpc('update_appointment_status', rpcParams);
      if (error) throw error;
      setNotice({ tone: 'success', message: 'Status do atendimento atualizado.' });
      await refresh();
    } catch (err) {
      console.error('[BarberDashboard] update_appointment_status falhou:', err);
      setNotice({ tone: 'danger', message: 'Não foi possível atualizar este atendimento.' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const executeReschedule = async () => {
    if (!rescheduleItem || !newRescheduleTime) return;
    setRescheduleLoading(true);
    try {
      const newDate = new Date(newRescheduleDate);
      const [hours, minutes] = newRescheduleTime.split(':');
      newDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      const current = appointmentRecords.find((item) => item.id === rescheduleItem.id);
      if (!current) throw new Error('appointment_not_found');
      const { error } = await supabase.rpc('reschedule_appointment', {
        target_appointment_id: rescheduleItem.id,
        requested_date_time: newDate.toISOString(),
        requested_professional_id: current.professionalId,
        requested_service_id: current.serviceId,
      });
      if (error) throw error;
      setRescheduleItem(null);
      setNotice({ tone: 'success', message: 'Atendimento reagendado com sucesso!' });
      await refresh();
    } catch (err) {
      console.error('[BarberDashboard] reschedule_appointment falhou:', err);
      const message = err instanceof Error ? err.message : String(err);
      const msg = message.includes('appointment_conflict')
        ? 'Esse horário conflita com outro atendimento. Escolha outro horário.'
        : 'Não foi possível reagendar este atendimento.';
      setNotice({ tone: 'danger', message: msg });
    } finally {
      setRescheduleLoading(false);
    }
  };

  const createQuickBooking = async () => {
    if (quickSubmissionLocked.current || quickLoading) return;
    if (!quickName.trim() || !quickService || !quickTime || !profile?.establishment_id || !profile?.id) {
      setNotice({ tone: 'danger', message: 'Informe cliente, serviço e horário para criar o encaixe.' });
      return;
    }
    const service = services.find((item) => item.id === quickService);
    if (!service?.isActive) {
      setNotice({ tone: 'danger', message: 'Este serviço não está habilitado para o seu perfil profissional.' });
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
        target_client_id: null,
      });
      if (error) throw error;
      setQuickOpen(false); setQuickName(''); setQuickService(null); setQuickTime(null);
      setNotice({ tone: 'success', message: appointmentFeedbackMessages.quickBookingCreated });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refresh();
    } catch (err) {
      console.error('[BarberDashboard] create_appointment falhou:', err);
      setNotice({ tone: 'danger', message: translateAppointmentError(err, 'Não foi possível criar o encaixe.') });
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
      requested_reason: draft.reason,
    });
    setBlockLoading(false);
    if (error) {
      const message = error.message.includes('schedule_block_conflict')
        ? 'Já existe um atendimento ativo neste período.'
        : error.message.includes('schedule_block_overlap')
          ? 'Este período já possui outro bloqueio.'
          : 'Não foi possível bloquear este horário.';
      setBlockError(message);
      return;
    }
    await refreshScheduleBlocks();
    setBlockSelection(null);
    setNotice({ tone: 'success', message: 'Horário bloqueado na agenda.' });
  };

  const deleteBlock = async (blockId: string) => {
    const confirmed = Platform.OS === 'web'
      ? window.confirm('Remover este bloqueio da agenda?')
      : await new Promise<boolean>((resolve) => Alert.alert('Remover bloqueio', 'Deseja liberar este horário?', [
        { text: 'Voltar', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Remover', style: 'destructive', onPress: () => resolve(true) },
      ], { cancelable: true, onDismiss: () => resolve(false) }));
    if (!confirmed) return;
    const { error } = await supabase.rpc('delete_schedule_block', { target_block_id: blockId });
    if (error) {
      setNotice({ tone: 'danger', message: 'Não foi possível remover este bloqueio.' });
      return;
    }
    await refreshScheduleBlocks();
    setNotice({ tone: 'success', message: 'Horário liberado.' });
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
    const openQuickBook = () => {
      setQuickBookSource('timeline');
      setQuickTime(commandSlot.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
      setQuickDate(commandSlot);
      setQuickName('');
      setQuickService(services[0]?.id || null);
      setQuickOpen(true);
    };
    const moveDay = (delta: number) => {
      const next = new Date(selectedDate);
      next.setDate(next.getDate() + delta);
      setSelectedDate(next);
    };
    return [
      { id: 'new-appointment', label: 'Novo agendamento', keywords: ['horario', 'cliente'], shortcut: 'N', roles: ['professional'], disabled: !professionalId, run: openQuickBook },
      { id: 'quick-booking', label: 'Novo encaixe', keywords: ['rapido'], shortcut: 'E', roles: ['professional'], disabled: !professionalId, run: openQuickBook },
      { id: 'block-time', label: 'Bloquear horário', keywords: ['pausa', 'ausencia'], shortcut: 'B', roles: ['professional'], disabled: !professionalId || !scheduleBlocksSupported, run: () => professionalId && setBlockSelection({ professionalId, startsAt: commandSlot }) },
      { id: 'calendar-today', label: 'Ir para hoje', keywords: ['data'], shortcut: 'T', roles: ['professional'], run: () => setSelectedDate(new Date()) },
      { id: 'calendar-previous-day', label: 'Dia anterior', keywords: ['data'], shortcut: '[', roles: ['professional'], run: () => moveDay(-1) },
      { id: 'calendar-next-day', label: 'Próximo dia', keywords: ['data'], shortcut: ']', roles: ['professional'], run: () => moveDay(1) },
      { id: 'calendar-refresh', label: 'Atualizar agenda', keywords: ['sincronizar'], roles: ['professional'], run: () => { void refresh(); } },
      { id: 'search-appointment', label: 'Buscar atendimento pelo cliente', keywords: ['nome', 'busca'], shortcut: '/', roles: ['professional'], run: openCommandPalette },
    ];
  }, [openCommandPalette, profile?.id, refresh, scheduleBlocksSupported, selectedDate, selectedWorkingDay, services]);
  useCommandRegistration('professional-dashboard', dashboardCommands);

  const saudacaoProfissional = profile?.titulo_profissional
    ? profile.titulo_profissional.toLowerCase()
    : 'especialista';

  const professionalPixAllowed = barbershop?.professionalPixAllowed !== false;
  const needsOnboarding = profile?.role === 'professional' && (
    !profile?.specialties || 
    !profile?.titulo_profissional || 
    (professionalPixAllowed && !profile?.pix_key)
  );

  if (needsOnboarding) {
    return (
      <ProfessionalOnboarding
        profile={profile}
        professionalPixAllowed={professionalPixAllowed}
        onComplete={async () => {
          await refreshProfile();
        }}
      />
    );
  }

  return (
    <ProfessionalShell testID="barber-dashboard-screen" name={profile?.name} shopName={barbershop?.name} onSignOut={signOut}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <PageHeader
          testID="barber-dashboard-heading"
          eyebrow="Minha operação"
          title={`Olá, ${saudacaoProfissional}.`}
          description="Seu dia organizado para manter o ritmo entre um cliente e outro."
          actions={<View style={styles.headerActions}>
            <AppButton 
              label="Encaixe rápido" 
              testID="barber-quick-booking-button" 
              onPress={() => {
                const today = barbershop?.timezone ? getTodayInTimeZone(barbershop.timezone) : new Date();
                setQuickBookSource('header');
                setQuickOpen(true);
                setQuickName('');
                setQuickDate(today);
                setQuickService(services[0]?.id || null);
                setQuickTime(null);
              }} 
              icon={<Plus color={primaryForeground} size={17} />}
              style={{ backgroundColor: primaryColor, borderColor: primaryColor }}
              foregroundColor={primaryForeground}
            />
          </View>}
        />

        <AppCard style={styles.statusInfoCard} testID="barber-status-updated-card">
          <View style={styles.statusInfoRow}>
            <Check color={colors.success} size={18} />
            <Text style={styles.statusInfoText}>
              Tudo atualizado por aqui, você está visualizando os dados mais recentes!
            </Text>
          </View>
        </AppCard>

        {!!notice && <InlineNotice testID="barber-action-notice" tone={notice.tone} message={notice.message} />}

        <NextAppointmentCard
          appointment={nextAppointment}
          loading={nextAppointmentLoading}
          error={nextAppointmentError}
          accentColor={primaryColor}
          style={styles.nextAppointmentCard}
        />

        <MetricStrip
          testID="barber-metrics"
          items={[
            { key: 'completed', testID: 'barber-completed-metric', label: 'Concluídos', value: String(completed.length), note: `${visibleAppointments.length} horários na agenda`, icon: <Check color={colors.success} size={18} /> },
            { key: 'commission', testID: 'barber-commission-metric', label: 'Meu ganho no dia', value: currency(commission), note: `${currency(projectedCommission)} projetado (${Math.round((profile?.commission_rate ?? 0.5) * 100)}% comissão)`, icon: <WalletCards color={colors.info} size={18} /> },
          ]}
        />

        <SectionHeading
          testID="barber-agenda-heading"
          eyebrow="Agenda"
          title="Ritmo do dia"
          description="Clique em um horário livre para iniciar um encaixe."
          variant="section"
        />
        <OperationalCalendar
          allowTeamView={Boolean(barbershop?.shareAgendas)}
          appointments={calendarAppointments}
          blocks={scheduleBlocks}
          closed={selectedWorkingDay ? !selectedWorkingDay.isOpen : false}
          date={selectedDate}
          error={appointmentError || scheduleBlocksError}
          loading={loading || scheduleBlocksLoading}
          legacyTestIDs={{
            previousDay: 'barber-calendar-prev',
            nextDay: 'barber-calendar-next',
            today: 'barber-calendar-today',
            view: 'barber-agenda-tabs',
            loading: 'barber-agenda-loading',
          }}
          onBlockPress={(block) => {
            if (block.professionalId === profile?.id) void deleteBlock(block.id);
          }}
          onAppointmentPress={(appointment) => setSelectedAppointmentId(appointment.id)}
          onDateChange={setSelectedDate}
          onRetry={() => { void refreshAppointments(); }}
          onSlotPress={(selection) => {
            const { professionalId } = selection;
            if (professionalId !== profile?.id) {
              setNotice({ tone: 'danger', message: 'Você pode criar encaixes somente na sua própria agenda.' });
              return;
            }
            setSlotSelection(selection);
          }}
          onToggleFinished={() => setShowFinished((current) => !current)}
          onViewChange={(nextView) => setTab(nextView)}
          ownProfessionalId={profile?.id}
          resources={calendarResources}
          showFinished={showFinished}
          syncState={syncError ? 'offline' : isDashboardSyncing ? 'syncing' : 'live'}
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
          setQuickBookSource('timeline');
          setQuickTime(time(selection.startsAt));
          setQuickDate(selection.startsAt);
          setQuickName('');
          setQuickService(services[0]?.id || null);
          setQuickOpen(true);
        }}
        onClose={() => setSlotSelection(null)}
        professionalName={profile?.name}
        selection={slotSelection}
      />

      <ScheduleBlockModal
        error={blockError}
        loading={blockLoading}
        onClose={() => {
          if (!blockLoading) setBlockSelection(null);
        }}
        onSubmit={(draft) => { void createBlock(draft); }}
        professionals={calendarResources.filter((resource) => resource.id === profile?.id)}
        selection={blockSelection}
      />

      <AppointmentDetailSheet
        appointment={selectedCalendarAppointment}
        canCancel={Boolean(selectedCalendarAppointment && !actionLoadingId && selectedCalendarAppointment.professionalId === profile?.id && !['completed', 'cancelled'].includes(selectedCalendarAppointment.status))}
        canComplete={Boolean(selectedCalendarAppointment && !actionLoadingId && selectedCalendarAppointment.professionalId === profile?.id && !['completed', 'cancelled'].includes(selectedCalendarAppointment.status))}
        canReschedule={Boolean(selectedCalendarAppointment && !actionLoadingId && selectedCalendarAppointment.professionalId === profile?.id && !['completed', 'cancelled'].includes(selectedCalendarAppointment.status))}
        completeLabel={selectedCalendarAppointment?.status === 'pending' ? 'Confirmar' : 'Concluir'}
        onCancel={(appointment) => {
          setSelectedAppointmentId(null);
          void updateStatus(appointment.id, 'cancelled');
        }}
        onClose={() => setSelectedAppointmentId(null)}
        onComplete={(appointment) => {
          setSelectedAppointmentId(null);
          void updateStatus(appointment.id, appointment.status === 'pending' ? 'confirmed' : 'completed');
        }}
        onReschedule={(appointment) => {
          const item = appointments.find((candidate) => candidate.id === appointment.id);
          if (!item) return;
          setSelectedAppointmentId(null);
          setRescheduleItem(item);
          setNewRescheduleDate(new Date(item.dateTime));
          setNewRescheduleTime(time(item.dateTime));
        }}
        professionalName={appointments.find((item) => item.id === selectedCalendarAppointment?.id)?.barberName}
        visible={Boolean(selectedCalendarAppointment)}
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
        dates={dateOptions}
        selectedDate={newRescheduleDate}
        onDateChange={(value) => { setNewRescheduleDate(value); setNewRescheduleTime(null); }}
        times={rescheduleAvailableSlots.map((slot) => slot.localTime)}
        availabilityLoading={rescheduleAvailabilityLoading}
        availabilityError={rescheduleAvailabilityError}
        availabilityEmptyMessage={rescheduleAvailabilityEmptyMessage}
        selectedTime={newRescheduleTime}
        onTimeChange={setNewRescheduleTime}
        primaryColor={primaryColor}
        foregroundColor={primaryForeground}
        loading={rescheduleLoading}
        onSubmit={executeReschedule}
      />
    </ProfessionalShell>
  );
};

const styles = StyleSheet.create({
  scroll: { width: '100%', maxWidth: layout.contentMax, alignSelf: 'center', padding: 20, paddingTop: 30, paddingBottom: 70 },
  pageHeader: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 18 },
  headerActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 9 },
  nextAppointmentCard: { marginTop: 28 },
  metrics: { flexDirection: 'row', gap: 12, marginTop: 12 },
  metricsStack: { flexDirection: 'column' },
  metric: { flex: 1, minWidth: 190, borderWidth: 0.5, borderColor: '#E5E7EB66', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.025, shadowRadius: 22, elevation: 1 },
  metricTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metricLabel: { color: colors.textMuted, fontFamily: typography.bodyStrong, fontSize: 11, letterSpacing: 1.25, textTransform: 'uppercase' },
  metricValue: { color: '#171717', fontFamily: typography.display, fontSize: 24, letterSpacing: -1, marginTop: 17 },
  metricNote: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11, marginTop: 4 },
  agendaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 14, marginTop: 42, marginBottom: 17 },
  syncButton: { minHeight: 40, paddingVertical: 8 },
  dateList: { gap: 8, paddingVertical: 14 },
  dateListWide: { flex: 1, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingVertical: 14, gap: 8 },
  dateCard: { width: 62, alignItems: 'center', paddingVertical: 10, backgroundColor: 'transparent', borderWidth: 0, borderRadius: radii.md },
  dateCardWide: { flex: 1, maxWidth: 120 },
  dateCardSelected: { backgroundColor: colors.brand, borderColor: colors.brand },
  dateWeek: { color: colors.textMuted, fontFamily: typography.bodyStrong, fontSize: 11, textTransform: 'uppercase' },
  dateDay: { color: colors.text, fontFamily: typography.display, fontSize: 18, marginTop: 4 },
  selectedInk: { color: colors.ink },
  loader: { margin: 50 },
  appointmentList: { gap: 0 },
  appointmentCard: { flexDirection: 'row', gap: 14, padding: 16, marginBottom: 9 },
  timeBox: { width: 58, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 2 },
  appointmentTime: { color: colors.brand, fontFamily: typography.display, fontSize: 15 },
  appointmentCopy: { flex: 1, minWidth: 0 },
  appointmentTitleRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 7 },
  clientName: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 13 },
  serviceName: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 11, marginTop: 5 },
  barberName: { color: colors.info, fontFamily: typography.bodyStrong, fontSize: 11, marginTop: 5 },
  appointmentActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 },
  confirmActions: { gap: 6 },
  smallButton: { minHeight: 36, paddingVertical: 7, paddingHorizontal: 11 },
  pressed: { transform: [{ scale: 0.97 }] },
  modalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000000C9', padding: 18 },
  modalCard: { width: '100%', maxWidth: 640, maxHeight: '90%', padding: 0, overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalEyebrow: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 11, letterSpacing: 1.6 },
  modalTitle: { color: colors.text, fontFamily: typography.display, fontSize: 20, letterSpacing: -0.6, marginTop: 5 },
  closeButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfacePressed, borderRadius: radii.md },
  modalContent: { padding: 20, gap: 15 },
  fieldLabel: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 },
  choiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choiceCard: { width: '47%', minWidth: 150, flexGrow: 1 },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-start' },
  timeSlot: { width: '23%', height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md },
  timeSlotSelected: { backgroundColor: colors.brand, borderColor: colors.brand },
  timeSlotText: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 11 },
  cancellationReasonText: { color: colors.danger, fontSize: 11, marginTop: 4, fontFamily: typography.bodyStrong },
  timeSlotOccupied: {
    backgroundColor: colors.surfaceRaised,
    borderColor: 'transparent',
    opacity: 0.3,
  },
  timeSlotTextOccupied: {
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  calendarNavContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 18,
    width: '100%',
  },
  navArrow: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.md,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 38,
  },
  todayBtnText: {
    color: colors.ink,
    fontFamily: typography.bodyStrong,
    fontSize: 11,
    textTransform: 'uppercase',
  },
  freeSlotCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 8,
    backgroundColor: 'transparent',
    minHeight: 52,
  },
  freeSlotTime: {
    color: colors.textSecondary,
    fontFamily: typography.display,
    fontSize: 15,
  },
  freeSlotLine: { flex: 1, marginHorizontal: 12, borderTopWidth: 1, borderStyle: 'dashed', borderColor: '#E5E7EB' },
  freeSlotAdd: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4F4F5' },
  inactiveSection: {
    marginTop: 24,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 20,
  },
  inactiveSectionTitle: {
    color: colors.textSecondary,
    fontFamily: typography.display,
    fontSize: 15,
    marginBottom: 12,
    letterSpacing: -0.4,
  },
  historyRow: { flexDirection: 'row', gap: 14, paddingVertical: 17, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#F1F1F2' },
  statusInfoCard: {
    padding: 12,
    backgroundColor: colors.successSoft,
    borderLeftWidth: 4,
    borderLeftColor: colors.success,
    borderRadius: radii.md,
    marginBottom: 12,
  },
  statusInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  statusInfoText: {
    color: colors.textSecondary,
    fontFamily: typography.bodyStrong,
    fontSize: 13,
    flexShrink: 1,
  },
});
