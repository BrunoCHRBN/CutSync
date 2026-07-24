import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Banknote,
  CalendarClock,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  Plus,
  TrendingUp,
} from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useOperationalContext } from '../../contexts/operational-context';
import { useAppointments } from '../../hooks/useAppointments';
import { useEstablishment } from '../../hooks/useEstablishment';
import { useServices } from '../../hooks/useServices';
import { useTeam } from '../../hooks/useTeam';
import { useNextAppointment } from '../../hooks/useNextAppointment';
import { useAdminReport } from '../../hooks/use-admin-report';
import { supabase } from '../../services/supabase';
import { AdminShell } from '../layout/AdminShell';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';
import { SectionHeading } from '../ui/SectionHeading';
import { StatusBadge } from '../ui/StatusBadge';
import { colors, layout, radii, typography } from '../../theme/tokens';
import { AdminQuickBook } from '../admin/AdminQuickBook';
import { AdminReschedule } from '../admin/AdminReschedule';
import { DashboardAppointment } from '../../types/dashboard';
import { AppointmentRecord } from '@cutsync/database';
import { GlobalNextAppointmentCard } from '../admin/GlobalNextAppointmentCard';
import { OperationalCalendar, CalendarAppointment, CalendarSlotSelection } from '../calendar/operational-calendar';
import { AppointmentDetailSheet } from '../calendar/appointment-detail-sheet';
import { PageHeader } from '../ui/page-header';
import { MetricStrip } from '../ui/metric-strip';
import { parseSchedule } from '@cutsync/domain';
import { useScheduleBlocks } from '../../hooks/use-schedule-blocks';
import { SlotActionSheet } from '../calendar/slot-action-sheet';
import { ScheduleBlockDraft, ScheduleBlockModal } from '../calendar/schedule-block-modal';
import { AppCommand, useCommandPalette, useCommandRegistration } from '../command/command-palette-provider';

type RichAppointment = DashboardAppointment;

const toRichAppointment = (item: AppointmentRecord): RichAppointment => ({
  id: item.id,
  dateTime: item.dateTime,
  status: item.status,
  clientName: item.client?.name || item.clientName || 'Cliente sem cadastro',
  clientPhone: item.client?.phone || '',
  serviceName: item.service?.name || 'Serviço indisponível',
  price: item.service?.price || 0,
  professionalId: item.professionalId,
  cancellationReason: item.cancellationReason || '',
});

const quickTimes = ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00'];

const toDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const comparisonNote = (current: number, previous: number) => {
  if (previous === 0) return current === 0 ? 'sem variação contra ontem' : 'sem base no dia anterior';
  const change = (current - previous) * 100 / Math.abs(previous);
  if (Math.abs(change) < 0.1) return 'igual ao dia anterior';
  return `${Math.abs(change).toFixed(1).replace('.', ',')}% ${change > 0 ? 'acima' : 'abaixo'} de ontem`;
};

export const AdminDashboardExperience = () => {
  const router = useRouter();
  const { professionalId, date } = useLocalSearchParams<{ professionalId?: string; date?: string }>();
  const { width } = useWindowDimensions();
  const { open: openCommandPalette } = useCommandPalette();
  const isWide = width >= layout.desktopBreakpoint;
  const { profile, signOut } = useAuth();
  const { activeEstablishmentId } = useOperationalContext();
  const { establishment: barbershop } = useEstablishment(activeEstablishmentId);
  const [appointments, setAppointments] = useState<RichAppointment[]>([]);
  const { team: barbers } = useTeam(activeEstablishmentId, true);
  const { services } = useServices(activeEstablishmentId, true);
  const [selectedDate, setSelectedDate] = useState(() => /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? new Date(`${date}T12:00:00`) : new Date());
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [showFinished, setShowFinished] = useState(false);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [slotSelection, setSlotSelection] = useState<CalendarSlotSelection | null>(null);
  const [blockSelection, setBlockSelection] = useState<CalendarSlotSelection | null>(null);
  const [blockLoading, setBlockLoading] = useState(false);
  const [blockError, setBlockError] = useState<string | null>(null);

  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return;
    const nextDate = new Date(`${date}T12:00:00`);
    if (!Number.isNaN(nextDate.getTime())) setSelectedDate(nextDate);
  }, [date]);

  // Estados locais para Encaixe Rápido
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickService, setQuickService] = useState<string | null>(null);
  const [quickBarber, setQuickBarber] = useState<string | null>(null);
  const [quickTime, setQuickTime] = useState<string | null>(null);
  const [quickLoading, setQuickLoading] = useState(false);

  const dailyRange = useMemo(() => {
    const start = new Date(selectedDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(selectedDate);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }, [selectedDate]);

  const { appointments: appointmentRecords, loading: dailyLoading, error: dailyError, refresh: refreshDaily } = useAppointments({
    establishmentId: activeEstablishmentId,
    dateFrom: dailyRange.start.toISOString(),
    dateTo: dailyRange.end.toISOString(),
    enabled: Boolean(activeEstablishmentId),
  });
  const {
    blocks: scheduleBlocks,
    loading: scheduleBlocksLoading,
    error: scheduleBlocksError,
    supported: scheduleBlocksSupported,
    refresh: refreshScheduleBlocks,
  } = useScheduleBlocks({
    establishmentId: activeEstablishmentId,
    rangeStart: dailyRange.start,
    rangeEnd: dailyRange.end,
    enabled: Boolean(activeEstablishmentId),
  });
  const todayKey = toDateKey(new Date());
  const { report: dayReport, loading: reportLoading, error: reportError, refresh: refreshReport } = useAdminReport({
    establishmentId: activeEstablishmentId,
    rangeStart: todayKey,
    rangeEnd: todayKey,
    enabled: Boolean(activeEstablishmentId),
  });
  const {
    appointment: nextAppointment,
    loading: nextAppointmentLoading,
    error: nextAppointmentError,
    refresh: refreshNextAppointment,
  } = useNextAppointment({
    establishmentId: activeEstablishmentId,
    enabled: Boolean(activeEstablishmentId),
  });
  const isSyncing = dailyLoading || reportLoading || nextAppointmentLoading;
  const appointmentError = dailyError || reportError || nextAppointmentError;
  const syncError = appointmentError ? new Error(appointmentError) : null;
  const refreshAgenda = useCallback(async () => {
    await Promise.all([refreshDaily(), refreshReport()]);
  }, [refreshDaily, refreshReport]);
  const refresh = useCallback(async () => {
    await Promise.all([refreshAgenda(), refreshNextAppointment()]);
  }, [refreshAgenda, refreshNextAppointment]);

  // Estados locais para Reagendamento
  const [rescheduleItem, setRescheduleItem] = useState<RichAppointment | null>(null);
  const [newRescheduleDate, setNewRescheduleDate] = useState<Date>(new Date());
  const [newRescheduleTime, setNewRescheduleTime] = useState<string | null>(null);
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [occupiedTimes, setOccupiedTimes] = useState<string[]>([]);

  // Estados locais para Encaixe Rápido
  const [quickDate, setQuickDate] = useState<Date>(new Date());
  const [quickOccupiedTimes, setQuickOccupiedTimes] = useState<string[]>([]);

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
    return {
      id: date.toISOString().split('T')[0],
      date,
      weekDay: date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').toUpperCase(),
      day: date.getDate(),
    };
  }), [weekOffset]);

  useEffect(() => {
    setAppointments(appointmentRecords.map(toRichAppointment));
    setLoading(dailyLoading);
  }, [appointmentRecords, dailyLoading]);

  useEffect(() => {
    if (!rescheduleItem || !newRescheduleDate) {
      setOccupiedTimes([]);
      return;
    }
    const startOfDay = new Date(newRescheduleDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(newRescheduleDate);
    endOfDay.setHours(23, 59, 59, 999);

    void (async () => {
      const { data } = await supabase.from('appointments').select('date_time').eq('professional_id', rescheduleItem.professionalId)
        .neq('status', 'cancelled').neq('id', rescheduleItem.id)
        .gte('date_time', startOfDay.toISOString()).lte('date_time', endOfDay.toISOString());
      setOccupiedTimes((data || []).map(item => new Date(item.date_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })));
    })();
  }, [rescheduleItem, newRescheduleDate]);

  useEffect(() => {
    if (!quickOpen || !quickBarber || !quickDate) {
      setQuickOccupiedTimes([]);
      return;
    }
    const startOfDay = new Date(quickDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(quickDate);
    endOfDay.setHours(23, 59, 59, 999);

    void (async () => {
      const { data } = await supabase.from('appointments').select('date_time').eq('professional_id', quickBarber)
        .neq('status', 'cancelled').gte('date_time', startOfDay.toISOString()).lte('date_time', endOfDay.toISOString());
      setQuickOccupiedTimes((data || []).map(item => new Date(item.date_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })));
    })();
  }, [quickOpen, quickBarber, quickDate]);

  const updateStatus = async (id: string, status: 'confirmed' | 'cancelled' | 'completed', reason?: string) => {
    if (status === 'cancelled' && !reason) {
      if (Platform.OS === 'web') {
        const val = window.prompt('Motivo do Cancelamento:', 'Cliente solicitou');
        if (val === null) {
          setActionLoadingId(null);
          return;
        }
        updateStatus(id, 'cancelled', val || 'Cliente solicitou');
      } else {
        Alert.alert(
          'Motivo do Cancelamento',
          'Selecione a justificativa:',
          [
            { text: 'Cliente solicitou', onPress: () => updateStatus(id, 'cancelled', 'Cliente solicitou') },
            { text: 'Falta do profissional', onPress: () => updateStatus(id, 'cancelled', 'Profissional indisponível') },
            { text: 'Erro de agenda', onPress: () => updateStatus(id, 'cancelled', 'Erro de agenda') },
            { text: 'Voltar', style: 'cancel', onPress: () => setActionLoadingId(null) }
          ]
        );
      }
      return;
    }
    setActionLoadingId(id);
    try {
      const appointment = appointmentRecords.find((item) => item.id === id);
      if (status === 'completed' && appointment && appointment.dateTime.getTime() > Date.now()) {
        const msg = 'Não é possível concluir um agendamento no futuro.';
        if (Platform.OS === 'web') {
          window.alert(msg);
        } else {
          Alert.alert('Atenção', msg);
        }
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
      await refresh();
    } catch (err) {
      console.error('[AdminDashboard] update_appointment_status falhou:', err);
      const msg = 'Não foi possível atualizar este atendimento.';
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Erro', msg);
      }
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
      if (Platform.OS === 'web') window.alert('Atendimento reagendado com sucesso!');
      else Alert.alert('Sucesso', 'Atendimento reagendado com sucesso!');
      await refresh();
    } catch (err) {
      console.error('[AdminDashboard] reschedule_appointment falhou:', err);
      const message = err instanceof Error ? err.message : String(err);
      const msg = message.includes('appointment_conflict')
        ? 'Esse horário conflita com outro atendimento. Escolha outro horário.'
        : 'Não foi possível reagendar este atendimento.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Erro', msg);
    } finally {
      setRescheduleLoading(false);
    }
  };

  const createQuickBooking = async () => {
    if (!quickName.trim() || !quickService || !quickBarber || !quickTime || !barbershop?.id) {
      const msg = 'Informe cliente, serviço, profissional e horário para criar o encaixe.';
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Atenção', msg);
      }
      return;
    }
    const dateTime = new Date(quickDate);
    const [hours, minutes] = quickTime.split(':').map(Number);
    dateTime.setHours(hours, minutes, 0, 0);
    const service = services.find((item) => item.id === quickService);
    const end = dateTime.getTime() + (service?.durationMinutes || 30) * 60 * 1000;
    
    const conflict = appointments.some((item) => {
      if (item.professionalId !== quickBarber || item.status === 'cancelled') return false;
      const itemService = services.find((candidate) => candidate.name === item.serviceName);
      const itemEnd = item.dateTime.getTime() + (itemService?.durationMinutes || 30) * 60 * 1000;
      return dateTime.getTime() < itemEnd && end > item.dateTime.getTime();
    });
    
    if (conflict) {
      const msg = 'Esse horário conflita com outro atendimento do profissional selecionado.';
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Atenção', msg);
      }
      return;
    }

    setQuickLoading(true);
    try {
      const { error } = await supabase.rpc('create_appointment', {
        target_establishment_id: barbershop.id,
        target_professional_id: quickBarber,
        target_service_id: quickService,
        target_date_time: dateTime.toISOString(),
        target_client_name: quickName.trim(),
        target_client_id: null,
      });
      if (error) throw error;
      setQuickOpen(false); 
      setQuickName(''); 
      setQuickService(null); 
      setQuickBarber(null); 
      setQuickTime(null);
      await refresh();
    } catch (err) {
      console.error('[AdminDashboard] create_appointment falhou:', err);
      const message = err instanceof Error ? err.message : String(err);
      const msg = message.includes('appointment_conflict')
        ? 'Esse horário acabou de ser reservado. Escolha outro horário.'
        : 'Não foi possível criar o encaixe.';
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Erro', msg);
      }
    } finally {
      setQuickLoading(false);
    }
  };

  const currency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: barbershop?.currency || 'BRL' }).format(value);
  const time = (value: Date) => value.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const barberName = (id: string) => barbers.find((barber) => barber.id === id)?.name || 'Profissional';

  const reportSummary = dayReport?.summary;
  const previousSummary = dayReport?.previous_summary;
  const metrics = [
    { key: 'production', label: 'Produção realizada hoje', value: currency(reportSummary?.production_realized || 0), note: previousSummary ? comparisonNote(reportSummary?.production_realized || 0, previousSummary.production_realized) : `${reportSummary?.completed_count || 0} concluídos`, Icon: Banknote },
    { key: 'scheduled', label: 'Valor ainda agendado', value: currency(reportSummary?.scheduled_value || 0), note: `${reportSummary?.active_count || 0} atendimentos ativos`, Icon: CalendarClock },
    { key: 'occupancy', label: 'Ocupação real', value: `${(reportSummary?.occupancy_rate || 0).toFixed(1).replace('.', ',')}%`, note: reportSummary?.available_minutes ? `${Math.round(reportSummary.occupied_minutes / 60)}h ocupadas` : 'configure jornadas e horários', Icon: TrendingUp },
    { key: 'pending', label: 'Aguardando confirmação', value: String(reportSummary?.pending_count || 0), note: 'atendimentos pendentes hoje', Icon: CircleAlert },
  ];

  const calendarResources = useMemo(
    () => barbers
      .filter((barber) => !professionalId || barber.id === professionalId)
      .map((barber) => ({ id: barber.id, name: barber.name, avatarUrl: barber.avatarUrl })),
    [barbers, professionalId],
  );

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
    })),
    [appointmentRecords],
  );

  const selectedCalendarAppointment = calendarAppointments.find((item) => item.id === selectedAppointmentId) || null;
  const visibleCalendarAppointments = professionalId
    ? calendarAppointments.filter((item) => item.professionalId === professionalId)
    : calendarAppointments;
  const focusedProfessional = professionalId ? barbers.find((barber) => barber.id === professionalId) : null;
  const selectedWorkingDay = useMemo(
    () => parseSchedule(barbershop?.openingHours).find((day) => day.day === selectedDate.getDay()),
    [barbershop?.openingHours, selectedDate],
  );
  const pendingAppointments = visibleCalendarAppointments.filter((item) => item.status === 'pending');
  const cancelledAppointments = visibleCalendarAppointments.filter((item) => item.status === 'cancelled').slice(0, 3);
  const nextFreeSlots = useMemo(() => {
    if (!selectedWorkingDay?.isOpen || !calendarResources.length) return [];
    const [openHour, openMinute] = selectedWorkingDay.open.split(':').map(Number);
    const [closeHour, closeMinute] = selectedWorkingDay.close.split(':').map(Number);
    const cursor = new Date(selectedDate);
    cursor.setHours(openHour, openMinute, 0, 0);
    const close = new Date(selectedDate);
    close.setHours(closeHour, closeMinute, 0, 0);
    if (cursor.toDateString() === new Date().toDateString() && cursor.getTime() < Date.now()) {
      const now = new Date();
      now.setSeconds(0, 0);
      now.setMinutes(Math.ceil(now.getMinutes() / 30) * 30);
      cursor.setTime(now.getTime());
    }
    const slots: { id: string; professionalName: string; startsAt: Date }[] = [];
    while (cursor.getTime() + 30 * 60_000 <= close.getTime() && slots.length < 3) {
      for (const professional of calendarResources) {
        const startsAt = new Date(cursor);
        const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
        const professionalSchedule = parseSchedule(barbers.find((barber) => barber.id === professional.id)?.workHours);
        const professionalDay = professionalSchedule.find((day) => day.day === selectedDate.getDay());
        if (professionalSchedule.length) {
          if (!professionalDay?.isOpen) continue;
          const professionalOpen = new Date(selectedDate);
          const [professionalOpenHour, professionalOpenMinute] = professionalDay.open.split(':').map(Number);
          professionalOpen.setHours(professionalOpenHour, professionalOpenMinute, 0, 0);
          const professionalClose = new Date(selectedDate);
          const [professionalCloseHour, professionalCloseMinute] = professionalDay.close.split(':').map(Number);
          professionalClose.setHours(professionalCloseHour, professionalCloseMinute, 0, 0);
          if (startsAt < professionalOpen || endsAt > professionalClose) continue;
        }
        const conflictsAppointment = calendarAppointments.some((appointment) => appointment.professionalId === professional.id
          && appointment.status !== 'cancelled'
          && startsAt < appointment.endsAt
          && endsAt > appointment.startsAt);
        const conflictsBlock = scheduleBlocks.some((block) => block.professionalId === professional.id
          && startsAt < block.endsAt
          && endsAt > block.startsAt);
        if (!conflictsAppointment && !conflictsBlock) {
          slots.push({ id: `${professional.id}-${startsAt.toISOString()}`, professionalName: professional.name, startsAt });
          if (slots.length === 3) break;
        }
      }
      cursor.setMinutes(cursor.getMinutes() + 30);
    }
    return slots;
  }, [barbers, calendarAppointments, calendarResources, scheduleBlocks, selectedDate, selectedWorkingDay]);

  const setupItems = [
    { label: 'Configurar horários da unidade', complete: Boolean(parseSchedule(barbershop?.openingHours).length), route: '/(admin)/settings' },
    { label: 'Cadastrar serviços', complete: services.length > 0, route: '/(admin)/services' },
    { label: 'Vincular profissionais', complete: barbers.length > 0, route: '/(admin)/team' },
    { label: 'Publicar a vitrine', complete: Boolean(barbershop?.slug && services.some((service) => service.isActive) && barbers.length > 0), route: barbershop?.slug ? `/salon/${barbershop.slug}` : '/(admin)/settings' },
  ];
  const showSetupGuide = setupItems.some((item) => !item.complete);

  const openQuickBookFromSlot = useCallback((professionalId: string, startsAt: Date) => {
    setQuickOpen(true);
    setQuickDate(startsAt);
    setQuickTime(startsAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    setQuickBarber(professionalId);
    setQuickService(null);
  }, []);

  const createBlocks = async (draft: ScheduleBlockDraft) => {
    if (!barbershop?.id) return;
    setBlockLoading(true);
    setBlockError(null);
    const results = await Promise.allSettled(draft.professionalIds.map(async (professionalId) => {
      const { error } = await supabase.rpc('create_schedule_block', {
        target_establishment_id: barbershop.id,
        target_professional_id: professionalId,
        requested_start: draft.startsAt.toISOString(),
        requested_end: draft.endsAt.toISOString(),
        requested_kind: draft.kind,
        requested_reason: draft.reason,
      });
      if (error) throw error;
    }));
    const failures = results.filter((result) => result.status === 'rejected');
    await refreshScheduleBlocks();
    setBlockLoading(false);
    if (failures.length) {
      setBlockError(`${draft.professionalIds.length - failures.length} bloqueio(s) criado(s); ${failures.length} falharam por conflito ou permissão.`);
      return;
    }
    setBlockSelection(null);
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
      setBlockError('Não foi possível remover o bloqueio.');
      return;
    }
    await refreshScheduleBlocks();
  };

  const dashboardCommands = useMemo<AppCommand[]>(() => {
    const primaryProfessionalId = calendarResources[0]?.id;
    const commandSlot = new Date(selectedDate);
    if (commandSlot.toDateString() === new Date().toDateString()) {
      const now = new Date();
      commandSlot.setHours(now.getHours(), Math.ceil(now.getMinutes() / 30) * 30, 0, 0);
    } else {
      commandSlot.setHours(selectedWorkingDay?.isOpen ? Number(selectedWorkingDay.open.split(':')[0]) : 9, 0, 0, 0);
    }
    const moveDay = (delta: number) => {
      const next = new Date(selectedDate);
      next.setDate(next.getDate() + delta);
      setSelectedDate(next);
    };
    return [
      { id: 'new-appointment', label: 'Novo agendamento', keywords: ['horario', 'cliente'], shortcut: 'N', roles: ['admin'], disabled: !primaryProfessionalId, run: () => primaryProfessionalId && openQuickBookFromSlot(primaryProfessionalId, commandSlot) },
      { id: 'quick-booking', label: 'Novo encaixe', keywords: ['rapido'], shortcut: 'E', roles: ['admin'], disabled: !primaryProfessionalId, run: () => primaryProfessionalId && openQuickBookFromSlot(primaryProfessionalId, commandSlot) },
      { id: 'block-time', label: 'Bloquear horário', keywords: ['pausa', 'ausencia'], shortcut: 'B', roles: ['admin'], disabled: !primaryProfessionalId || !scheduleBlocksSupported, run: () => primaryProfessionalId && setBlockSelection({ professionalId: primaryProfessionalId, startsAt: commandSlot }) },
      { id: 'calendar-today', label: 'Ir para hoje', keywords: ['data'], shortcut: 'T', roles: ['admin'], run: () => setSelectedDate(new Date()) },
      { id: 'calendar-previous-day', label: 'Dia anterior', keywords: ['data'], shortcut: '[', roles: ['admin'], run: () => moveDay(-1) },
      { id: 'calendar-next-day', label: 'Próximo dia', keywords: ['data'], shortcut: ']', roles: ['admin'], run: () => moveDay(1) },
      { id: 'calendar-refresh', label: 'Atualizar agenda', keywords: ['sincronizar'], roles: ['admin'], run: () => { void refresh(); } },
      { id: 'search-appointment', label: 'Buscar atendimento pelo cliente', keywords: ['nome', 'busca'], shortcut: '/', roles: ['admin'], run: openCommandPalette },
    ];
  }, [calendarResources, openCommandPalette, openQuickBookFromSlot, refresh, scheduleBlocksSupported, selectedDate, selectedWorkingDay]);
  useCommandRegistration('admin-dashboard', dashboardCommands);

  return (
    <AdminShell
      testID="admin-dashboard-screen"
      activeRoute="overview"
      shopName={barbershop?.name || 'Sua barbearia'}
      userName={profile?.name}
      onSignOut={signOut}
    >
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <PageHeader
        testID="admin-dashboard-heading"
        eyebrow="Central de operação"
        title={`Bom dia, ${profile?.name?.split(' ')[0] || 'gestor'}.`}
        description="Acompanhe o ritmo da unidade e mantenha a agenda no centro da operação."
        actions={<View style={styles.headerActions}>
          <AppButton
            label="+ Novo Agendamento"
            testID="admin-new-booking-button"
            onPress={() => {
              setQuickOpen(true);
              setQuickDate(selectedDate);
              setQuickTime(null);
              setQuickBarber(null);
              setQuickService(null);
            }}
            variant="admin"
            icon={<Plus color={colors.white} size={17} />}
          />
        </View>}
      />

      <AppCard style={styles.statusInfoCard} testID="admin-status-updated-card">
        <View style={styles.statusInfoRow}>
          <Check color={colors.success} size={18} />
          <Text style={styles.statusInfoText}>
            Tudo atualizado por aqui, você está visualizando os dados mais recentes!
          </Text>
        </View>
      </AppCard>

      <GlobalNextAppointmentCard
        appointment={nextAppointment}
        loading={nextAppointmentLoading}
        error={nextAppointmentError}
        style={styles.nextAppointmentCard}
      />

      <MetricStrip
        testID="admin-metrics-grid"
        items={metrics.map(({ key, label, value, note, Icon }) => ({
          key,
          label,
          value,
          note,
          icon: <Icon color={colors.textMuted} size={16} strokeWidth={1.8} />,
        }))}
      />

      {showSetupGuide ? (
        <AppCard testID="admin-setup-guide" style={styles.setupGuide}>
          <View style={styles.setupHeader}>
            <View style={styles.setupCopy}><Text style={styles.panelTitle}>Prepare sua operação</Text><Text style={styles.panelSubtitle}>Complete os itens essenciais para receber agendamentos.</Text></View>
            <StatusBadge testID="admin-setup-progress" label={`${setupItems.filter((item) => item.complete).length}/${setupItems.length} concluídos`} tone="warning" />
          </View>
          <View style={styles.setupList}>{setupItems.map((item) => (
            <View key={item.label} style={styles.setupItem}>
              <View style={[styles.setupIcon, item.complete && styles.setupIconComplete]}>{item.complete ? <Check color={colors.white} size={14} /> : <ChevronRight color={colors.textMuted} size={14} />}</View>
              <Text style={[styles.setupLabel, item.complete && styles.setupLabelComplete]}>{item.label}</Text>
              {!item.complete ? <AppButton label="Configurar" testID={`admin-setup-${item.label.toLowerCase().replace(/[^a-z]+/g, '-')}`} variant="ghost" size="sm" onPress={() => router.push(item.route as never)} /> : null}
            </View>
          ))}</View>
        </AppCard>
      ) : null}

      <View testID="admin-agenda-heading">
        <SectionHeading
          testID="admin-appointments-title"
          eyebrow="Agenda"
          title="Ritmo do dia"
          description="Clique em um horário livre para iniciar um novo agendamento."
          variant="section"
          action={<View style={styles.headerActions}>
            {focusedProfessional ? <StatusBadge testID="admin-focused-professional" label={`Agenda: ${focusedProfessional.name}`} tone="warning" /> : null}
            {focusedProfessional ? <AppButton label="Ver equipe toda" testID="admin-clear-professional-filter" variant="ghost" size="sm" onPress={() => router.replace('/(admin)')} /> : null}
            <StatusBadge testID="admin-active-appointments-count" label={`${visibleCalendarAppointments.filter((item) => item.status === 'pending' || item.status === 'confirmed').length} ativos`} tone="info" />
            <StatusBadge testID="admin-finished-appointments-badge" label={`${visibleCalendarAppointments.filter((item) => item.status === 'completed').length} concluídos`} tone="success" />
          </View>}
        />
      </View>
      <View style={[styles.calendarWorkspace, isWide && styles.calendarWorkspaceWide]}>
        <View style={styles.calendarMain}>
          <OperationalCalendar
            appointments={visibleCalendarAppointments}
            blocks={scheduleBlocks}
            canManageTeam
            closed={selectedWorkingDay ? !selectedWorkingDay.isOpen : false}
            date={selectedDate}
            error={dailyError || scheduleBlocksError}
            loading={loading || scheduleBlocksLoading}
            legacyTestIDs={{
              panel: 'admin-appointments-panel',
              previousDay: 'admin-calendar-prev',
              nextDay: 'admin-calendar-next',
              today: 'admin-calendar-today',
              loading: 'admin-appointments-loading',
              empty: 'admin-appointments-empty',
            }}
            onBlockPress={(block) => { void deleteBlock(block.id); }}
            onAppointmentPress={(appointment) => setSelectedAppointmentId(appointment.id)}
            onDateChange={setSelectedDate}
            onManageTeam={() => router.push('/(admin)/team')}
            onRetry={() => { void refreshDaily(); }}
            onSlotPress={(selection) => {
              const { professionalId, startsAt } = selection;
              setQuickBarber(professionalId);
              setQuickDate(startsAt);
              const slotHour = String(startsAt.getHours()).padStart(2, '0');
              const slotMin = String(startsAt.getMinutes()).padStart(2, '0');
              setQuickTime(`${slotHour}:${slotMin}`);
              setQuickOpen(true);
            }}
            onToggleFinished={() => setShowFinished((current) => !current)}
            resources={calendarResources}
            showFinished={showFinished}
            syncState={syncError ? 'offline' : isSyncing ? 'syncing' : 'live'}
            testID="admin-operational-calendar"
            timezone={barbershop?.timezone}
            workingHours={selectedWorkingDay?.isOpen ? { start: selectedWorkingDay.open, end: selectedWorkingDay.close } : null}
          />
        </View>
        <AppCard testID="admin-day-insights" style={[styles.dayInsights, !isWide && styles.dayInsightsMobile]}>
          <View style={styles.insightSection}>
            <View style={styles.insightTitleRow}><CircleAlert color={colors.warning} size={17} /><Text style={styles.insightTitle}>Pendências</Text><StatusBadge testID="admin-pending-total" label={String(pendingAppointments.length)} tone={pendingAppointments.length ? 'warning' : 'success'} /></View>
            {pendingAppointments.slice(0, 3).map((appointment) => <Text key={appointment.id} style={styles.insightLine}>{time(appointment.startsAt)} · {appointment.clientName}</Text>)}
            {!pendingAppointments.length ? <Text style={styles.insightEmpty}>Nenhuma confirmação pendente.</Text> : null}
          </View>
          <View style={styles.insightSection}>
            <View style={styles.insightTitleRow}><Clock3 color={colors.info} size={17} /><Text style={styles.insightTitle}>Próximas janelas livres</Text></View>
            {nextFreeSlots.map((slot) => <Text key={slot.id} style={styles.insightLine}>{time(slot.startsAt)} · {slot.professionalName}</Text>)}
            {!nextFreeSlots.length ? <Text style={styles.insightEmpty}>Sem janelas de 30 min neste dia.</Text> : null}
          </View>
          <View style={styles.insightSection}>
            <View style={styles.insightTitleRow}><CircleAlert color={colors.danger} size={17} /><Text style={styles.insightTitle}>Cancelamentos</Text></View>
            {cancelledAppointments.map((appointment) => <Text key={appointment.id} style={styles.insightLine}>{time(appointment.startsAt)} · {appointment.clientName}</Text>)}
            {!cancelledAppointments.length ? <Text style={styles.insightEmpty}>Nenhum cancelamento no dia.</Text> : null}
          </View>
        </AppCard>
      </View>

      <View style={[styles.workspace, isWide && styles.workspaceWide]}>
        <AppCard testID="admin-team-performance-panel" style={styles.performancePanel}>
          <View style={styles.performanceCardHeader}>
            <View style={{ flex: 1, minWidth: 160 }}>
              <Text style={styles.panelTitle}>Prévia da equipe hoje</Text>
              <Text style={styles.panelSubtitle}>Produção concluída e ocupação dos profissionais</Text>
            </View>
            <AppButton label="Ver relatórios" testID="admin-open-reports-button" variant="secondary" size="sm" onPress={() => router.push('/(admin)/reports')} trailingIcon={<ChevronRight color={colors.text} size={15} />} />
          </View>

          <View style={styles.teamList}>
            {(dayReport?.professionals || []).slice(0, 3).map((barber) => {
              return (
                <View key={barber.id} testID={`admin-team-performance-${barber.id}`} style={styles.teamRow}>
                  <View style={styles.avatar}><Text style={styles.avatarText}>{barber.name.charAt(0).toUpperCase()}</Text></View>
                  <View style={styles.teamCopy}>
                    <Text style={styles.teamName}>{barber.name}</Text>
                    <Text testID={`admin-team-performance-${barber.id}-summary`} style={styles.teamMeta}>{barber.completed_count} concluídos · {barber.occupancy_rate.toFixed(1).replace('.', ',')}% ocupação</Text>
                  </View>
                  <View style={styles.teamValue}>
                    <Text testID={`admin-team-performance-${barber.id}-gross`} style={styles.teamGross}>{currency(barber.production_realized)}</Text>
                    <Text testID={`admin-team-performance-${barber.id}-commission`} style={styles.teamCommission}>{currency(barber.commission_amount)} repasse</Text>
                  </View>
                </View>
              );
            })}
          </View>
          {!dayReport?.professionals.length && <Text testID="admin-team-performance-empty" style={styles.emptyText}>Nenhum profissional vinculado.</Text>}
        </AppCard>
      </View>
      </ScrollView>

      <SlotActionSheet
        canBlock={scheduleBlocksSupported}
        onBlock={(selection) => {
          setSlotSelection(null);
          setBlockError(null);
          setBlockSelection(selection);
        }}
        onBook={(selection) => {
          setSlotSelection(null);
          openQuickBookFromSlot(selection.professionalId, selection.startsAt);
        }}
        onClose={() => setSlotSelection(null)}
        professionalName={slotSelection ? barberName(slotSelection.professionalId) : undefined}
        selection={slotSelection}
      />

      <ScheduleBlockModal
        allowMultiple
        error={blockError}
        loading={blockLoading}
        onClose={() => {
          if (!blockLoading) setBlockSelection(null);
        }}
        onSubmit={(draft) => { void createBlocks(draft); }}
        professionals={calendarResources}
        selection={blockSelection}
      />

      <AppointmentDetailSheet
        appointment={selectedCalendarAppointment}
        canCancel={Boolean(selectedCalendarAppointment && !actionLoadingId && !['completed', 'cancelled'].includes(selectedCalendarAppointment.status))}
        canComplete={Boolean(selectedCalendarAppointment && !actionLoadingId && !['completed', 'cancelled'].includes(selectedCalendarAppointment.status))}
        canReschedule={Boolean(selectedCalendarAppointment && !actionLoadingId && !['completed', 'cancelled'].includes(selectedCalendarAppointment.status))}
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
        professionalName={selectedCalendarAppointment ? barberName(selectedCalendarAppointment.professionalId) : undefined}
        visible={Boolean(selectedCalendarAppointment)}
      />

      <AdminQuickBook
        visible={quickOpen}
        onClose={() => setQuickOpen(false)}
        clientName={quickName}
        onClientNameChange={setQuickName}
        barbers={barbers}
        selectedBarber={quickBarber}
        onBarberChange={(value) => { setQuickBarber(value); setQuickTime(null); }}
        dates={dateOptions}
        selectedDate={quickDate}
        onDateChange={(value) => { setQuickDate(value); setQuickTime(null); }}
        services={services}
        selectedService={quickService}
        onServiceChange={(value) => { setQuickService(value); setQuickTime(null); }}
        times={quickTimes}
        occupiedTimes={quickOccupiedTimes}
        selectedTime={quickTime}
        onTimeChange={setQuickTime}
        currency={currency}
        loading={quickLoading}
        onSubmit={createQuickBooking}
      />
      <AdminReschedule
        appointment={rescheduleItem}
        onClose={() => setRescheduleItem(null)}
        dates={dateOptions}
        selectedDate={newRescheduleDate}
        onDateChange={(value) => { setNewRescheduleDate(value); setNewRescheduleTime(null); }}
        times={quickTimes}
        occupiedTimes={occupiedTimes}
        selectedTime={newRescheduleTime}
        onTimeChange={setNewRescheduleTime}
        loading={rescheduleLoading}
        onSubmit={executeReschedule}
      />
    </AdminShell>
  );
};

const styles = StyleSheet.create({
  scroll: { width: '100%', maxWidth: layout.operationalMax, alignSelf: 'center', padding: 24, paddingTop: 30, paddingBottom: 110, gap: 20 },
  pageHeader: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20 },
  headerActions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  nextAppointmentCard: { marginTop: 16 },
  setupGuide: { padding: 0, overflow: 'hidden' },
  setupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 18, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  setupCopy: { flex: 1, minWidth: 0 },
  setupList: { paddingHorizontal: 18 },
  setupItem: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  setupIcon: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvasSubtle },
  setupIconComplete: { backgroundColor: colors.success },
  setupLabel: { flex: 1, color: colors.text, fontFamily: typography.bodyStrong, fontSize: 12 },
  setupLabelComplete: { color: colors.textMuted, textDecorationLine: 'line-through' },
  metrics: { flexDirection: 'row', gap: 14, marginTop: 14 },
  metricsMobile: { flexDirection: 'column' },
  metricCard: { flex: 1, minWidth: 190 },
  metricTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metricLabel: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 11 },
  metricAction: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 34, paddingHorizontal: 9, borderRadius: radii.sm, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.hairline },
  metricActionDisabled: { opacity: 0.35 },
  metricValue: { color: colors.text, fontFamily: typography.display, fontSize: 27, letterSpacing: -1, marginTop: 18 },
  metricNote: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11, marginTop: 5 },
  dateHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 42 },
  dateSelector: { flexDirection: 'row', gap: 8, marginTop: 18, overflow: 'hidden' },
  dateSelectorWide: { flex: 1, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', gap: 8, marginTop: 18 },
  dateItem: { flex: 1, minWidth: 48, maxWidth: 76, alignItems: 'center', justifyContent: 'center', paddingVertical: 11, backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border },
  dateItemWide: { flex: 1, maxWidth: 120 },
  dateItemSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  dateWeek: { color: colors.textMuted, fontFamily: typography.bodyStrong, fontSize: 11, textTransform: 'uppercase' },
  dateDay: { color: colors.text, fontFamily: typography.display, fontSize: 17, marginTop: 3 },
  dateTextSelected: { color: colors.white },
  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
  workspace: { gap: 16, marginTop: 18 },
  workspaceWide: { flexDirection: 'row', alignItems: 'flex-start' },
  calendarWorkspace: { gap: 16 },
  calendarWorkspaceWide: { flexDirection: 'row', alignItems: 'flex-start' },
  calendarMain: { flex: 1, minWidth: 0 },
  dayInsights: { width: 300, padding: 0, overflow: 'hidden' },
  dayInsightsMobile: { width: '100%' },
  insightSection: { gap: 8, padding: 16, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  insightTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  insightTitle: { flex: 1, color: colors.text, fontFamily: typography.bodyStrong, fontSize: 12 },
  insightLine: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 11, lineHeight: 16 },
  insightEmpty: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11, lineHeight: 16 },
  schedulePanel: { flex: 1.7, padding: 0, overflow: 'hidden' },
  performancePanel: { flex: 1, minWidth: 300 },
  panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 12 },
  panelTitle: { color: colors.text, fontFamily: typography.display, fontSize: 17, letterSpacing: -0.4 },
  panelSubtitle: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11, marginTop: 4 },
  loader: { margin: 40 },
  empty: { alignItems: 'center', padding: 42 },
  emptyTitle: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 13, marginTop: 12 },
  emptyText: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11, marginTop: 5, textAlign: 'center' },
  appointmentRow: { flexDirection: 'row', padding: 18, borderBottomWidth: 1, borderBottomColor: colors.border },
  appointmentRowFinished: { opacity: 0.65 },
  timeColumn: { width: 70, alignItems: 'flex-start' },
  appointmentTime: { color: colors.text, fontFamily: typography.display, fontSize: 15 },
  timeFinished: { color: colors.textMuted },
  timelineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent, marginTop: 10, marginLeft: 4 },
  dotFinished: { backgroundColor: colors.border },
  appointmentCopy: { flex: 1 },
  appointmentTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  clientName: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 14 },
  serviceName: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 11, marginTop: 5 },
  professionalRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  professionalName: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11 },
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  compactButton: { minHeight: 36, paddingVertical: 7, paddingHorizontal: 12 },
  teamList: { marginTop: 20 },
  teamRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 10 },
  avatar: { width: 35, height: 35, borderRadius: radii.md, backgroundColor: colors.surfacePressed, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.text, fontFamily: typography.display, fontSize: 13, letterSpacing: -0.3 },
  teamCopy: { flex: 1 },
  teamName: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 11 },
  teamMeta: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11, marginTop: 3 },
  teamValue: { alignItems: 'flex-end' },
  teamGross: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 11 },
  teamCommission: { color: colors.success, fontFamily: typography.body, fontSize: 11, marginTop: 3 },
  // Modal de Encaixe Estilos
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 15, 18, 0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 520, maxHeight: '90%', padding: 0 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalEyebrow: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' },
  modalTitle: { color: colors.text, fontFamily: typography.display, fontSize: 18, marginTop: 4 },
  closeButton: { padding: 4, borderRadius: radii.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  modalContent: { padding: 20, gap: 16 },
  fieldLabel: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 11, marginTop: 4 },
  choiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choiceCard: { flex: 1, minWidth: 140 },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  timeSlot: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  timeSlotSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  timeSlotText: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 11 },
  selectedInk: { color: colors.ink },
  performanceCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border, flexWrap: 'wrap', gap: 12 },
  cancellationReasonText: { color: colors.danger, fontSize: 11, marginTop: 4, fontFamily: typography.bodyStrong },
  timeSlotOccupied: {
    backgroundColor: '#ff444408',
    borderColor: '#ff444422',
    opacity: 0.5,
  },
  timeSlotTextOccupied: {
    color: '#ff444470',
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
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 38,
  },
  todayBtnText: {
    color: colors.white,
    fontFamily: typography.bodyStrong,
    fontSize: 11,
    textTransform: 'uppercase',
  },
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
