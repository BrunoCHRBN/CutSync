import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Banknote,
  CalendarClock,
  Check,
  ChevronRight,
  CircleAlert,
  Plus,
  TrendingUp,
} from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useOperationalContext } from '../../contexts/operational-context';
import { useFinancialOps } from '../../contexts/financial-ops-context';
import { useAppointments } from '../../hooks/useAppointments';
import { useEstablishment } from '../../hooks/useEstablishment';
import { useServices } from '../../hooks/useServices';
import { useTeam } from '../../hooks/useTeam';
import { useNextAppointment } from '../../hooks/useNextAppointment';
import { useAdminReport } from '../../hooks/use-admin-report';
import { useAvailableSlots } from '../../hooks/useAvailableSlots';
import { supabase } from '../../services/supabase';
import { AdminShell } from '../layout/AdminShell';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { InlineNotice } from '../ui/InlineNotice';
import { PromptDialog } from '../ui/PromptDialog';
import { SectionHeading } from '../ui/SectionHeading';
import { StatusBadge } from '../ui/StatusBadge';
import { colors, layout, radii, typography } from '../../theme/tokens';
import { AdminQuickBook } from '../admin/AdminQuickBook';
import { AdminReschedule } from '../admin/AdminReschedule';
import { DashboardSidePanel } from '../admin/dashboard/dashboard-side-panel';
import { DashboardSyncIndicator } from '../admin/dashboard/dashboard-sync-indicator';
import { DashboardTeamPreview } from '../admin/dashboard/dashboard-team-preview';
import { DashboardAppointment } from '../../types/dashboard';
import { AppointmentRecord } from '@cutsync/database';
import { OperationalCalendar, CalendarAppointment, CalendarSlotSelection } from '../calendar/operational-calendar';
import { AppointmentDetailSheet } from '../calendar/appointment-detail-sheet';
import { TransferProfessionalModal } from '../calendar/transfer-professional-modal';
import { PageHeader } from '../ui/page-header';
import { MetricStrip } from '../ui/metric-strip';
import {
  appointmentIsLockedByServiceOrder,
  getAppointmentOrderActionLabel,
  getAppointmentOrderUnavailableMessage,
  parseSchedule,
  resolveAppointmentOrderPrimaryAction,
} from '@cutsync/domain';
import { useScheduleBlocks } from '../../hooks/use-schedule-blocks';
import { SlotActionSheet } from '../calendar/slot-action-sheet';
import { ScheduleBlockDraft, ScheduleBlockModal } from '../calendar/schedule-block-modal';
import { AppCommand, useCommandPalette, useCommandRegistration } from '../command/command-palette-provider';
import { useAppointmentServiceOrder } from '../../features/service-orders/use-appointment-service-order';
import {
  clockToMinutes,
  getAvailableSlots,
  ScheduleWindow,
} from '../../features/availability/get-available-slots';
import { minutesOfDay } from '../calendar/calendar-math';
import {
  useAppointmentActions,
  type WebReassignmentPreparation,
} from '../../features/appointments/use-appointment-actions';
import { useBusinessAttentionQueue } from '../../features/appointments/use-business-attention-queue';
import { recordWebProductEvent } from '../../services/product-events';
import { useBusinessCommandCenter } from '../../features/attention/use-business-command-center';
import { useFinancialOperationsOverview } from '../../features/financial-operations/use-financial-operations-overview';
import { webExperienceFlags } from '../../config/experience-flags';
import type { AttentionItem } from '@cutsync/domain';

const greetingForNow = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
};

type RichAppointment = DashboardAppointment;

const toRichAppointment = (item: AppointmentRecord): RichAppointment => ({
  id: item.id,
  dateTime: item.dateTime,
  status: item.status,
  clientName: item.client?.name || item.clientName || 'Cliente sem cadastro',
  clientPhone: item.client?.phone || '',
  serviceName: item.service?.name || 'Serviço indisponível',
  price: item.priceCharged ?? item.service?.price ?? 0,
  professionalId: item.professionalId,
  cancellationReason: item.cancellationReason || '',
});

const toDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const dayWindow = (scheduleJson: string | null | undefined, day: number): ScheduleWindow | null => {
  const schedule = parseSchedule(scheduleJson);
  if (!schedule.length) return null;
  const configured = schedule.find((item) => item.day === day);
  if (!configured?.isOpen) return null;
  const openMinutes = clockToMinutes(configured.open);
  const closeMinutes = clockToMinutes(configured.close);
  if (openMinutes == null || closeMinutes == null || openMinutes >= closeMinutes) return null;
  return { openMinutes, closeMinutes };
};

const comparisonNote = (current: number, previous: number) => {
  if (previous === 0) return current === 0 ? 'sem variação contra ontem' : 'sem base no dia anterior';
  const change = (current - previous) * 100 / Math.abs(previous);
  if (Math.abs(change) < 0.1) return 'igual ao dia anterior';
  return `${Math.abs(change).toFixed(1).replace('.', ',')}% ${change > 0 ? 'acima' : 'abaixo'} de ontem`;
};

const cashStatusLabel = {
  unavailable: 'Indisponível',
  not_open: 'Não aberto',
  open: 'Aberto',
  closed: 'Fechado',
} as const;

const paymentMethodLabel = {
  cash: 'Dinheiro',
  external_pix: 'PIX',
  external_card: 'Maquininha',
} as const;

export const AdminDashboardExperience = () => {
  const router = useRouter();
  const { professionalId, date } = useLocalSearchParams<{ professionalId?: string; date?: string }>();
  const { width } = useWindowDimensions();
  const { open: openCommandPalette } = useCommandPalette();
  const isWide = width >= layout.desktopBreakpoint;
  const { profile, signOut } = useAuth();
  const { activeAuthorizedContext, activeEstablishmentId } = useOperationalContext();
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
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'danger' | 'warning'; message: string } | null>(null);
  const [cancelPromptId, setCancelPromptId] = useState<string | null>(null);
  const [blockToDelete, setBlockToDelete] = useState<string | null>(null);
  const [reassignmentTargetId, setReassignmentTargetId] = useState<string | null>(null);
  const [reassignmentPreparation, setReassignmentPreparation] = useState<WebReassignmentPreparation | null>(null);

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
  const reassignmentActions = useAppointmentActions({ onChanged: refresh });
  const canViewDecisionQueue = Boolean(
    activeAuthorizedContext?.capabilities.includes('request_appointment_reassignment')
    || activeAuthorizedContext?.capabilities.includes('apply_appointment_reassignment'),
  );
  const attentionQueue = useBusinessAttentionQueue(activeEstablishmentId, canViewDecisionQueue);
  const canViewAttention = Boolean(activeAuthorizedContext?.capabilities.includes('view_team_agenda'));
  const commandCenter = useBusinessCommandCenter({
    establishmentId: activeEstablishmentId,
    localDate: toDateKey(selectedDate),
    enabled: canViewAttention && webExperienceFlags.business_command_center_v2,
  });
  const attentionItems = useMemo<AttentionItem[]>(() => [
    ...commandCenter.items,
    ...attentionQueue.items.map((item) => ({
      id: item.appointmentId,
      type: 'appointment_reassignment',
      priority: item.urgency === 'overdue' ? 'critical' as const : item.urgency === 'urgent' ? 'high' as const : 'normal' as const,
      title: 'Mudança de profissional',
      description: `${item.clientDisplayName} · ${item.serviceName}`,
      dueAt: item.dueAt,
      destination: `/(admin)?appointmentId=${item.appointmentId}`,
      allowedActions: item.allowedActions,
    })),
  ].sort((a, b) => {
    const order = { critical: 0, high: 1, normal: 2, low: 3 };
    return order[a.priority] - order[b.priority];
  }), [attentionQueue.items, commandCenter.items]);
  const attentionViewRecorded = React.useRef(false);
  useEffect(() => {
    if (!attentionItems.length || attentionViewRecorded.current) return;
    attentionViewRecorded.current = true;
    recordWebProductEvent({ name: 'attention_viewed', surface: 'web_business', role: 'admin', route: '/admin' });
  }, [attentionItems.length]);
  const financialOps = useFinancialOps();
  const financialOverview = useFinancialOperationsOverview({
    establishmentId: activeEstablishmentId,
    localDate: toDateKey(selectedDate),
    enabled: financialOps.hasCapability('view_payments') || financialOps.hasCapability('view_cash'),
  });
  const refreshFinancialOverview = financialOverview.refresh;
  const refreshOperationalData = useCallback(async () => {
    await Promise.all([refresh(), refreshFinancialOverview()]);
  }, [refresh, refreshFinancialOverview]);
  const appointmentOrder = useAppointmentServiceOrder({
    establishmentId: activeEstablishmentId,
    appointmentId: selectedAppointmentId,
    enabled: Boolean(selectedAppointmentId && financialOps.financialOpsEnabled),
    onChanged: refreshOperationalData,
  });

  // Estados locais para Reagendamento
  const [rescheduleItem, setRescheduleItem] = useState<RichAppointment | null>(null);
  const [newRescheduleDate, setNewRescheduleDate] = useState<Date>(new Date());
  const [newRescheduleTime, setNewRescheduleTime] = useState<string | null>(null);
  const [rescheduleLoading, setRescheduleLoading] = useState(false);

  // Estados locais para Encaixe Rápido
  const [quickDate, setQuickDate] = useState<Date>(new Date());

  const rescheduleSource = rescheduleItem
    ? appointmentRecords.find((item) => item.id === rescheduleItem.id) || null
    : null;

  const {
    slots: quickAvailabilitySlots,
    loading: quickSlotsLoading,
    emptyMessage: quickSlotsEmptyMessage,
    error: quickSlotsError,
  } = useAvailableSlots({
    establishmentId: activeEstablishmentId,
    professionalId: quickBarber,
    serviceId: quickService,
    date: quickOpen ? quickDate : null,
  });

  const {
    slots: rescheduleAvailabilitySlots,
    loading: rescheduleSlotsLoading,
    emptyMessage: rescheduleSlotsEmptyMessage,
    error: rescheduleSlotsError,
  } = useAvailableSlots({
    establishmentId: activeEstablishmentId,
    professionalId: rescheduleSource?.professionalId,
    serviceId: rescheduleSource?.serviceId,
    date: rescheduleItem ? newRescheduleDate : null,
    appointmentId: rescheduleItem?.id,
  });

  const quickTimes = quickAvailabilitySlots.map((slot) => slot.localTime);
  const quickOccupiedTimes = quickAvailabilitySlots.filter((slot) => !slot.available).map((slot) => slot.localTime);
  const rescheduleTimes = rescheduleAvailabilitySlots.map((slot) => slot.localTime);
  const occupiedTimes = rescheduleAvailabilitySlots.filter((slot) => !slot.available).map((slot) => slot.localTime);
  const quickTimesHint = !quickService || !quickBarber
    ? 'Selecione profissional e serviço para ver horários reais.'
    : quickSlotsError || (!quickSlotsLoading && !quickTimes.length ? quickSlotsEmptyMessage : null);
  const rescheduleTimesHint = rescheduleSlotsError
    || (!rescheduleSlotsLoading && !rescheduleTimes.length ? rescheduleSlotsEmptyMessage : null);

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

  const updateStatus = async (id: string, status: 'confirmed' | 'cancelled' | 'completed', reason?: string) => {
    if (status === 'cancelled' && !reason) {
      setCancelPromptId(id);
      return;
    }
    if (status === 'completed') {
      if (financialOps.state === 'unknown') {
        setFeedback({
          tone: 'warning',
          message: 'Sincronizando operações financeiras. Aguarde antes de concluir este atendimento.',
        });
        return;
      }
      if (financialOps.financialOpsEnabled) {
        setFeedback({
          tone: 'warning',
          message: 'Com operações financeiras ativas, finalize o atendimento pela comanda.',
        });
        return;
      }
    }
    setActionLoadingId(id);
    try {
      const appointment = appointmentRecords.find((item) => item.id === id);
      if (status === 'completed' && appointment && appointment.dateTime.getTime() > Date.now()) {
        setFeedback({ tone: 'warning', message: 'Não é possível concluir um agendamento no futuro.' });
        setActionLoadingId(null);
        return;
      }

      const rpcParams: {
        target_appointment_id: string;
        new_status: string;
        new_cancellation_note_internal?: string;
      } = {
        target_appointment_id: id,
        new_status: status,
      };
      if (status === 'cancelled') {
        rpcParams.new_cancellation_note_internal = reason;
      }
      const { error } = await supabase.rpc('update_appointment_status_v2', rpcParams);
      if (error) throw error;
      setFeedback({ tone: 'success', message: status === 'cancelled' ? 'Atendimento cancelado.' : status === 'completed' ? 'Atendimento concluído.' : 'Atendimento confirmado.' });
      await refresh();
    } catch (err) {
      console.error('[AdminDashboard] update_appointment_status falhou:', err);
      setFeedback({ tone: 'danger', message: 'Não foi possível atualizar este atendimento.' });
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
      setFeedback({ tone: 'success', message: 'Atendimento reagendado com sucesso.' });
      await refresh();
    } catch (err) {
      console.error('[AdminDashboard] reschedule_appointment falhou:', err);
      const message = err instanceof Error ? err.message : String(err);
      setFeedback({
        tone: 'danger',
        message: message.includes('appointment_conflict')
          ? 'Esse horário conflita com outro atendimento. Escolha outro horário.'
          : 'Não foi possível reagendar este atendimento.',
      });
    } finally {
      setRescheduleLoading(false);
    }
  };

  const createQuickBooking = async () => {
    if (!quickName.trim() || !quickService || !quickBarber || !quickTime || !barbershop?.id) {
      setFeedback({ tone: 'warning', message: 'Informe cliente, serviço, profissional e horário para criar o encaixe.' });
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
      setFeedback({ tone: 'warning', message: 'Esse horário conflita com outro atendimento do profissional selecionado.' });
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
        target_client_id: undefined,
      });
      if (error) throw error;
      setQuickOpen(false);
      setQuickName('');
      setQuickService(null);
      setQuickBarber(null);
      setQuickTime(null);
      setFeedback({ tone: 'success', message: 'Encaixe criado com sucesso.' });
      await refresh();
    } catch (err) {
      console.error('[AdminDashboard] create_appointment falhou:', err);
      const message = err instanceof Error ? err.message : String(err);
      setFeedback({
        tone: 'danger',
        message: message.includes('appointment_conflict')
          ? 'Esse horário acabou de ser reservado. Escolha outro horário.'
          : 'Não foi possível criar o encaixe.',
      });
    } finally {
      setQuickLoading(false);
    }
  };

  const currency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: barbershop?.currency || 'BRL' }).format(value);
  const time = (value: Date) => value.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const barberName = (id: string) => barbers.find((barber) => barber.id === id)?.name || 'Profissional';

  const reportSummary = dayReport?.summary;
  const previousSummary = dayReport?.previous_summary;
  const openReports = (params?: Record<string, string>) => {
    router.push({ pathname: '/(admin)/reports', params: { period: '7d', ...params } } as never);
  };
  const metrics = [
    {
      key: 'production',
      label: 'Produção realizada hoje',
      value: currency(reportSummary?.production_realized || 0),
      note: previousSummary ? comparisonNote(reportSummary?.production_realized || 0, previousSummary.production_realized) : `${reportSummary?.completed_count || 0} concluídos`,
      Icon: Banknote,
      onPress: () => openReports({ status: 'completed' }),
    },
    {
      key: 'scheduled',
      label: 'Valor ainda agendado',
      value: currency(reportSummary?.scheduled_value || 0),
      note: `${reportSummary?.active_count || 0} atendimentos ativos`,
      Icon: CalendarClock,
      onPress: () => openReports(),
    },
    {
      key: 'occupancy',
      label: 'Ocupação real',
      value: `${(reportSummary?.occupancy_rate || 0).toFixed(1).replace('.', ',')}%`,
      note: reportSummary?.available_minutes ? `${Math.round(reportSummary.occupied_minutes / 60)}h ocupadas` : 'configure jornadas e horários',
      Icon: TrendingUp,
      onPress: () => openReports(),
    },
    {
      key: 'pending',
      label: 'Aguardando confirmação',
      value: String(reportSummary?.pending_count || 0),
      note: 'atendimentos pendentes hoje',
      Icon: CircleAlert,
      onPress: () => openReports({ status: 'pending' }),
    },
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
      updatedAt: item.updatedAt,
      endsAt: new Date(item.dateTime.getTime() + (item.durationMinutes || item.service?.durationMinutes || 30) * 60_000),
      status: item.status,
      price: item.priceCharged ?? item.service?.price,
    })),
    [appointmentRecords],
  );

  const selectedCalendarAppointment = calendarAppointments.find((item) => item.id === selectedAppointmentId) || null;
  const reassignmentTarget = calendarAppointments.find((item) => item.id === reassignmentTargetId) || null;
  const selectedServiceOrder = appointmentOrder.serviceOrder;
  const financialOpsVisible = financialOps.financialOpsEnabled || financialOps.state === 'unknown';
  const financialOpsSyncMessage = financialOps.state === 'unknown'
    ? 'Sincronizando operações financeiras. Aguarde para concluir este atendimento com segurança.'
    : null;
  const canManageSelectedOrder = Boolean(
    selectedCalendarAppointment
    && financialOps.financialOpsEnabled
    && financialOps.hasCapability('manage_team_orders')
  );
  const selectedOrderAction = resolveAppointmentOrderPrimaryAction({
    financialOpsEnabled: financialOps.financialOpsEnabled,
    accessMode: financialOps.accessMode ?? 'blocked',
    canManageOrder: canManageSelectedOrder,
    appointmentStatus: selectedCalendarAppointment?.status,
    serviceOrderStatus: selectedServiceOrder?.status,
    appointmentStartsAt: selectedCalendarAppointment?.startsAt,
    timeZone: barbershop?.timezone,
  });
  const selectedOrderActionLabel = appointmentOrder.loading || appointmentOrder.error
    ? null
    : getAppointmentOrderActionLabel(selectedOrderAction);
  const selectedOrderUnavailableMessage = appointmentOrder.loading || appointmentOrder.error
    ? null
    : getAppointmentOrderUnavailableMessage({
      financialOpsEnabled: financialOps.financialOpsEnabled,
      accessMode: financialOps.accessMode ?? 'blocked',
      canManageOrder: canManageSelectedOrder,
      appointmentStatus: selectedCalendarAppointment?.status,
      serviceOrderStatus: selectedServiceOrder?.status,
      appointmentStartsAt: selectedCalendarAppointment?.startsAt,
      timeZone: barbershop?.timezone,
    });
  const selectedAppointmentLockedByOrder = appointmentIsLockedByServiceOrder({
    financialOpsEnabled: financialOps.financialOpsEnabled,
    serviceOrderStatus: selectedServiceOrder?.status,
  });
  const selectedAppointmentActionable = Boolean(
    selectedCalendarAppointment
    && !actionLoadingId
    && !appointmentOrder.mutation
    && !['completed', 'cancelled', 'no_show'].includes(selectedCalendarAppointment.status),
  );
  const canRequestSelectedReassignment = Boolean(
    selectedAppointmentActionable
    && activeAuthorizedContext?.capabilities.includes('request_appointment_reassignment')
  );
  const canUseLegacyComplete = Boolean(
    selectedCalendarAppointment
    && selectedAppointmentActionable
    && (
      selectedCalendarAppointment.status === 'pending'
      || (
        selectedCalendarAppointment.status === 'confirmed'
        && !financialOps.financialOpsEnabled
        && financialOps.state === 'disabled'
      )
    ),
  );
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
    const establishmentWindow = dayWindow(barbershop?.openingHours, selectedDate.getDay());
    if (!establishmentWindow || !calendarResources.length) return [];

    const activeDurations = services.filter((service) => service.isActive).map((service) => service.durationMinutes);
    const serviceDurationMinutes = activeDurations.length ? Math.min(...activeDurations) : 30;
    const isToday = selectedDate.toDateString() === new Date().toDateString();
    const nowMinutes = isToday ? minutesOfDay(new Date(), barbershop?.timezone) : null;
    const timezone = barbershop?.timezone;

    const slots: { id: string; professionalName: string; startsAt: Date }[] = [];
    for (const professional of calendarResources) {
      const barber = barbers.find((item) => item.id === professional.id);
      const professionalSchedule = parseSchedule(barber?.workHours);
      const professionalWindow = professionalSchedule.length
        ? dayWindow(barber?.workHours, selectedDate.getDay())
        : undefined;

      const busyIntervals = calendarAppointments
        .filter((appointment) => appointment.professionalId === professional.id && appointment.status !== 'cancelled')
        .map((appointment) => ({
          startMinutes: minutesOfDay(appointment.startsAt, timezone),
          endMinutes: minutesOfDay(appointment.endsAt, timezone),
        }));
      const blockIntervals = scheduleBlocks
        .filter((block) => block.professionalId === professional.id)
        .map((block) => ({
          startMinutes: minutesOfDay(block.startsAt, timezone),
          endMinutes: minutesOfDay(block.endsAt, timezone),
        }));

      const available = getAvailableSlots({
        serviceDurationMinutes,
        establishmentWindow,
        professionalWindow,
        busyIntervals,
        blockIntervals,
        nowMinutes,
      }).filter((slot) => slot.available);

      for (const slot of available) {
        const startsAt = new Date(selectedDate);
        startsAt.setHours(Math.floor(slot.startMinutes / 60), slot.startMinutes % 60, 0, 0);
        slots.push({
          id: `${professional.id}-${slot.localTime}`,
          professionalName: professional.name,
          startsAt,
        });
      }
    }

    return slots
      .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime())
      .slice(0, 3);
  }, [barbers, barbershop?.openingHours, barbershop?.timezone, calendarAppointments, calendarResources, scheduleBlocks, selectedDate, services]);

  const setupItems = [
    { label: 'Cadastrar serviços', complete: services.some((service) => service.isActive), route: '/(admin)/services', required: true },
    { label: 'Vincular profissionais', complete: barbers.length > 0, route: '/(admin)/team', required: false },
    { label: 'Configurar a agenda', complete: Boolean(parseSchedule(barbershop?.openingHours).length), route: '/(admin)/settings', required: false },
    { label: 'Revisar identidade e marca', complete: Boolean(barbershop?.description || barbershop?.logoUrl), route: '/(admin)/settings', required: false },
    { label: 'Publicar a vitrine', complete: barbershop?.discoveryStatus === 'published', route: '/(admin)/settings', required: true },
  ];
  const showSetupGuide = barbershop?.discoveryStatus !== 'published';

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
        requested_reason: draft.reason ?? undefined,
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
    setBlockToDelete(blockId);
  };

  const confirmDeleteBlock = async () => {
    if (!blockToDelete) return;
    const { error } = await supabase.rpc('delete_schedule_block', { target_block_id: blockToDelete });
    setBlockToDelete(null);
    if (error) {
      setBlockError('Não foi possível remover o bloqueio.');
      setFeedback({ tone: 'danger', message: 'Não foi possível remover o bloqueio.' });
      return;
    }
    setFeedback({ tone: 'success', message: 'Bloqueio removido.' });
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
        eyebrow={selectedDate.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
        title={`${greetingForNow()}, ${profile?.name?.split(' ')[0] || 'gestor'}.`}
        description="Agenda no centro. Métricas e pendências ao lado."
        actions={<View style={styles.headerActions}>
          <DashboardSyncIndicator state={syncError ? 'offline' : isSyncing ? 'syncing' : 'live'} />
          <AppButton
            label="Novo agendamento"
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

      {feedback ? <InlineNotice testID="admin-feedback-notice" tone={feedback.tone} message={feedback.message} /> : null}

      <MetricStrip
        testID="admin-metrics-grid"
        items={metrics.map(({ key, label, value, note, Icon, onPress }) => ({
          key,
          label,
          value,
          note,
          onPress,
          icon: <Icon color={colors.textMuted} size={16} strokeWidth={1.8} />,
        }))}
      />

      {(financialOverview.loading || financialOverview.error || financialOverview.data) ? (
        <AppCard testID="admin-financial-overview" style={styles.financialOverview}>
          <View style={styles.financialHeader}>
            <View style={styles.financialHeadingCopy}>
              <Text style={styles.panelTitle}>
                {!financialOverview.data
                  ? 'Operação financeira do dia'
                  : financialOverview.data.payments.canView
                    ? 'Recebimentos e caixa'
                    : 'Caixa do dia'}
              </Text>
              <Text style={styles.panelSubtitle}>
                {financialOverview.loading
                  ? 'Carregando a situação financeira do dia.'
                  : financialOverview.error
                    ? 'Não foi possível carregar a situação financeira do dia.'
                    : !financialOverview.data
                      ? 'A situação financeira do dia está indisponível.'
                      : !financialOverview.data.payments.canView
                        ? 'Situação do caixa vinculada à data selecionada.'
                        : financialOverview.data.scope === 'own'
                          ? 'Seus recebimentos declarados no POS manual.'
                          : 'Visão operacional da unidade, separada da assinatura CutSync.'}
              </Text>
            </View>
            <StatusBadge
              label={financialOverview.loading
                ? 'Atualizando'
                : financialOverview.error || !financialOverview.data
                  ? 'Indisponível'
                  : financialOverview.data.payments.canView
                    ? financialOverview.data.readiness.ready ? 'Pronto para receber' : 'Configuração pendente'
                    : financialOverview.data.cash.status === 'open' ? 'Caixa aberto' : 'Caixa não aberto'}
              tone={financialOverview.loading
                ? 'neutral'
                : financialOverview.error
                  ? 'danger'
                  : !financialOverview.data
                    ? 'neutral'
                  : financialOverview.data.payments.canView
                    ? financialOverview.data.readiness.ready ? 'success' : 'warning'
                    : financialOverview.data.cash.status === 'open' ? 'success' : 'warning'}
            />
          </View>
          {financialOverview.error ? (
            <InlineNotice
              testID="admin-financial-overview-error"
              tone="danger"
              message={financialOverview.error}
              action={<AppButton label="Tentar novamente" size="sm" variant="ghost" onPress={() => void financialOverview.refresh()} />}
            />
          ) : financialOverview.data ? (
            <>
              <View style={styles.financialMetrics}>
                {financialOverview.data.payments.canView ? (
                  <>
                    <View style={styles.financialMetric}>
                      <Text style={styles.financialMetricLabel}>RECEBIDO NO DIA</Text>
                      <Text testID="admin-financial-received" style={styles.financialMetricValue}>
                        {currency(financialOverview.data.payments.netReceivedCents / 100)}
                      </Text>
                    </View>
                    <View style={styles.financialMetric}>
                      <Text style={styles.financialMetricLabel}>A RECEBER NO DIA</Text>
                      <Text testID="admin-financial-outstanding" style={styles.financialMetricValue}>
                        {currency(financialOverview.data.payments.outstandingCents / 100)}
                      </Text>
                      <Text style={styles.financialMetricNote}>
                        {financialOverview.data.payments.awaitingOrderCount} comanda(s) pendente(s)
                      </Text>
                    </View>
                  </>
                ) : null}
                {financialOverview.data.cash.canView ? (
                  <View style={styles.financialMetric}>
                    <Text style={styles.financialMetricLabel}>CAIXA DO DIA</Text>
                    <Text testID="admin-financial-cash-status" style={styles.financialMetricValue}>
                      {cashStatusLabel[financialOverview.data.cash.status]}
                    </Text>
                    <Text style={styles.financialMetricNote}>
                      {financialOverview.data.readiness.cashMethodActive ? 'Dinheiro habilitado' : 'Dinheiro não configurado'}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.financialFooter}>
                {financialOverview.data.payments.canView ? (
                  <View style={styles.financialMethods}>
                    {financialOverview.data.readiness.activePaymentMethodTypes.map((method) => (
                      <StatusBadge key={method} label={paymentMethodLabel[method]} tone="info" />
                    ))}
                  </View>
                ) : null}
                <View style={styles.headerActions}>
                  {financialOverview.data.payments.canView ? (
                    <AppButton label="Meios de pagamento" size="sm" variant="ghost" onPress={() => router.push('/(admin)/settings?section=payments')} />
                  ) : null}
                  {financialOverview.data.cash.canView ? (
                    <AppButton
                      label={financialOverview.data.cash.status === 'open' ? 'Ver caixa' : 'Abrir caixa'}
                      size="sm"
                      variant="secondary"
                      onPress={() => router.push('/(admin)/settings?section=cash')}
                    />
                  ) : null}
                </View>
              </View>
              {financialOverview.data.alerts.slice(0, 2).map((alert) => (
                <InlineNotice
                  key={alert.code}
                  testID={`admin-financial-alert-${alert.code}`}
                  title={alert.title}
                  message={alert.message}
                  tone={alert.severity === 'warning' ? 'warning' : 'info'}
                />
              ))}
            </>
          ) : null}
        </AppCard>
      ) : null}

      {showSetupGuide ? (
        <AppCard testID="admin-setup-guide" style={styles.setupGuide}>
          <View style={styles.setupHeader}>
            <View style={styles.setupCopy}><Text style={styles.panelTitle}>Prepare sua operação</Text><Text style={styles.panelSubtitle}>Itens essenciais liberam a publicação; recomendações melhoram a experiência sem bloquear pequenos estabelecimentos.</Text></View>
            <StatusBadge testID="admin-setup-progress" label={`${setupItems.filter((item) => item.complete).length}/${setupItems.length} concluídos`} tone="warning" />
          </View>
          <View style={styles.setupList}>{setupItems.map((item) => (
            <View key={item.label} style={styles.setupItem}>
              <View style={[styles.setupIcon, item.complete && styles.setupIconComplete]}>{item.complete ? <Check color={colors.white} size={14} /> : <ChevronRight color={colors.textMuted} size={14} />}</View>
              <Text style={[styles.setupLabel, item.complete && styles.setupLabelComplete]}>{item.label}</Text>
              {!item.complete ? <StatusBadge label={item.required ? 'Essencial' : 'Recomendado'} tone={item.required ? 'warning' : 'info'} /> : null}
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
              setSlotSelection(selection);
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
        <View style={[styles.dayInsights, !isWide && styles.dayInsightsMobile]}>
          <DashboardSidePanel
            nextAppointmentLabel={
              nextAppointment
                ? `${time(nextAppointment.dateTime)} · ${nextAppointment.client?.name || nextAppointment.clientName || 'Cliente'} · ${nextAppointment.service?.name || 'Serviço'}`
                : nextAppointmentLoading
                  ? 'Carregando…'
                  : undefined
            }
            pending={pendingAppointments.slice(0, 3).map((appointment) => ({
              id: appointment.id,
              label: `${time(appointment.startsAt)} · ${appointment.clientName}`,
            }))}
            freeSlots={nextFreeSlots.map((slot) => ({
              id: slot.id,
              label: `${time(slot.startsAt)} · ${slot.professionalName}`,
            }))}
            cancelled={cancelledAppointments.map((appointment) => ({
              id: appointment.id,
              label: `${time(appointment.startsAt)} · ${appointment.clientName}`,
            }))}
          />
        </View>
      </View>

      <DashboardTeamPreview
        members={(dayReport?.professionals || []).slice(0, 6).map((barber) => ({
          id: barber.id,
          name: barber.name,
          completedCount: barber.completed_count,
          occupancyRate: barber.occupancy_rate,
          production: currency(barber.production_realized),
        }))}
        currencyLabel={(id) => {
          const barber = (dayReport?.professionals || []).find((item) => item.id === id);
          return barber ? currency(barber.production_realized) : '—';
        }}
        onOpenReports={() => router.push('/(admin)/reports')}
      />
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
        appointmentLockedByOrder={selectedAppointmentLockedByOrder}
        canCancel={selectedAppointmentActionable}
        canComplete={canUseLegacyComplete}
        canReschedule={selectedAppointmentActionable}
        canTransfer={canRequestSelectedReassignment}
        completeLabel={selectedCalendarAppointment?.status === 'pending' ? 'Confirmar' : 'Concluir'}
        financialOpsEnabled={financialOpsVisible}
        establishmentId={activeEstablishmentId}
        canViewPayments={financialOps.hasCapability('view_payments')}
        canTakePayments={financialOps.hasCapability('take_payments') && financialOps.accessMode === 'full'}
        canVoidPayments={financialOps.hasCapability('void_payments') && financialOps.accessMode === 'full'}
        onPaymentChanged={async () => {
          await Promise.all([
            appointmentOrder.refresh(),
            refreshOperationalData(),
          ]);
        }}
        onClosePaidOrder={canManageSelectedOrder ? async () => appointmentOrder.close() : undefined}
        onCancel={(appointment) => {
          setSelectedAppointmentId(null);
          void updateStatus(appointment.id, 'cancelled');
        }}
        onClose={() => setSelectedAppointmentId(null)}
        onComplete={(appointment) => {
          setSelectedAppointmentId(null);
          if (appointment.status === 'pending') {
            void updateStatus(appointment.id, 'confirmed');
            return;
          }
          if (!financialOps.financialOpsEnabled && financialOps.state === 'disabled') {
            void updateStatus(appointment.id, 'completed');
            return;
          }
          setFeedback({
            tone: 'warning',
            message: 'Sincronizando operações financeiras. Aguarde a confirmação antes de concluir este atendimento.',
          });
        }}
        onOrderAction={() => {
          if (selectedOrderAction === 'open_order') void appointmentOrder.open();
          if (selectedOrderAction === 'start_order') void appointmentOrder.start();
          if (selectedOrderAction === 'finish_order') void appointmentOrder.finish();
        }}
        onReschedule={(appointment) => {
          const item = appointments.find((candidate) => candidate.id === appointment.id);
          if (!item) return;
          setSelectedAppointmentId(null);
          setRescheduleItem(item);
          setNewRescheduleDate(new Date(item.dateTime));
          setNewRescheduleTime(time(item.dateTime));
        }}
        onTransfer={(appointment) => {
          setSelectedAppointmentId(null);
          setReassignmentPreparation(null);
          setReassignmentTargetId(appointment.id);
        }}
        onServiceOrderRetry={() => {
          if (financialOps.state === 'unknown') {
            void financialOps.refresh();
            return;
          }
          if (appointmentOrder.retryableCommand) {
            void appointmentOrder.retry();
            return;
          }
          void appointmentOrder.refresh();
        }}
        orderActionLabel={selectedOrderActionLabel}
        orderActionUnavailableMessage={selectedOrderUnavailableMessage}
        orderActionLoading={Boolean(appointmentOrder.mutation)}
        professionalName={selectedCalendarAppointment ? barberName(selectedCalendarAppointment.professionalId) : undefined}
        serviceOrder={selectedServiceOrder}
        serviceOrderError={financialOpsSyncMessage ?? appointmentOrder.error}
        serviceOrderLoading={appointmentOrder.loading || (financialOps.loading && financialOps.state === 'unknown')}
        visible={Boolean(selectedCalendarAppointment)}
      />

      {canViewAttention ? (
        <AppCard testID="admin-attention-center" style={styles.attentionCenter}>
          <View style={styles.attentionHeader}>
            <View style={styles.attentionHeadingCopy}>
              <Text style={styles.panelTitle}>Precisa da sua atenção</Text>
              <Text style={styles.panelSubtitle}>Exceções ordenadas por prazo e com ações confirmadas pelo servidor.</Text>
            </View>
            <StatusBadge
              testID="admin-attention-total"
              label={commandCenter.loading || attentionQueue.loading ? 'Atualizando' : `${attentionItems.length} pendência${attentionItems.length === 1 ? '' : 's'}`}
              tone={attentionItems.length ? 'warning' : 'success'}
            />
          </View>
          {commandCenter.error && !attentionItems.length ? (
            <InlineNotice
              testID="admin-attention-error"
              tone="warning"
              message="Não foi possível atualizar as pendências. A agenda continua disponível."
            />
          ) : null}
          {!commandCenter.loading && !attentionQueue.loading && !commandCenter.error && !attentionItems.length ? (
            <Text style={styles.attentionEmpty}>Nenhuma decisão operacional aguarda ação.</Text>
          ) : null}
          {attentionItems.slice(0, 5).map((item) => (
            <Pressable
              accessibilityRole="button"
              key={`${item.type}:${item.id}`}
              onPress={() => {
                recordWebProductEvent({ name: 'attention_action_started', surface: 'web_business', role: 'admin', route: '/admin' });
                setSelectedAppointmentId(item.id);
              }}
              style={({ hovered, pressed }) => [
                styles.attentionItem,
                (hovered || pressed) && styles.attentionItemActive,
              ]}
              testID={`admin-attention-${item.id}`}
            >
              <View style={styles.attentionItemCopy}>
                <Text style={styles.attentionItemTitle}>{item.title}</Text>
                <Text style={styles.attentionItemMeta}>
                  {item.dueAt ? new Date(item.dueAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Sem prazo'}
                  {' · '}{item.description}
                </Text>
              </View>
              <StatusBadge
                label={item.priority === 'critical' ? 'Atrasada' : item.priority === 'high' ? 'Urgente' : item.priority === 'normal' ? 'Atenção' : 'No prazo'}
                tone={item.priority === 'low' ? 'info' : 'warning'}
              />
              <Text style={styles.attentionAction}>{item.allowedActions.length ? 'Resolver' : 'Acompanhar'} →</Text>
            </Pressable>
          ))}
        </AppCard>
      ) : null}

      <TransferProfessionalModal
        appointment={reassignmentTarget}
        loading={reassignmentActions.reassignmentLoadingId === reassignmentTargetId}
        onClose={() => {
          if (!reassignmentActions.reassignmentLoadingId) {
            setReassignmentTargetId(null);
            setReassignmentPreparation(null);
          }
        }}
        onPrepare={() => {
          if (!activeEstablishmentId || !reassignmentTarget?.updatedAt) return;
          void reassignmentActions.prepareReassignment({
            establishmentId: activeEstablishmentId,
            appointmentId: reassignmentTarget.id,
            expectedUpdatedAt: reassignmentTarget.updatedAt,
            startsAt: reassignmentTarget.startsAt,
            responsibility: 'manager',
            canPropose: Boolean(
              activeAuthorizedContext?.capabilities.includes('apply_appointment_reassignment'),
            ),
          }).then((prepared) => {
            if (prepared) setReassignmentPreparation(prepared);
          });
        }}
        onPropose={(professionalId) => {
          if (!reassignmentPreparation) return;
          void reassignmentActions.proposeReassignment({
            preparation: reassignmentPreparation,
            professionalId,
          }).then((receipt) => {
            if (receipt) setReassignmentPreparation((current) => current ? ({
              ...current,
              status: receipt.status,
              version: receipt.version,
              candidates: [],
              proposalAllowed: current.proposalAllowed,
            }) : null);
          });
        }}
        preparation={reassignmentPreparation}
        visible={Boolean(reassignmentTarget)}
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
        timesLoading={quickSlotsLoading}
        timesHint={quickTimesHint}
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
        times={rescheduleTimes}
        occupiedTimes={occupiedTimes}
        timesLoading={rescheduleSlotsLoading}
        timesHint={rescheduleTimesHint}
        selectedTime={newRescheduleTime}
        onTimeChange={setNewRescheduleTime}
        loading={rescheduleLoading}
        onSubmit={executeReschedule}
      />

      <PromptDialog
        visible={Boolean(cancelPromptId)}
        title="Cancelar atendimento"
        message="Informe o motivo do cancelamento (visível só para a equipe)."
        defaultValue="Cliente solicitou"
        placeholder="Motivo do cancelamento"
        confirmLabel="Confirmar cancelamento"
        testID="admin-cancel-prompt"
        onConfirm={(value) => {
          const id = cancelPromptId;
          setCancelPromptId(null);
          if (id) void updateStatus(id, 'cancelled', value.trim() || 'Cliente solicitou');
        }}
        onCancel={() => setCancelPromptId(null)}
      />

      <ConfirmDialog
        visible={Boolean(blockToDelete)}
        title="Remover bloqueio"
        message="Remover este bloqueio da agenda?"
        confirmLabel="Remover"
        destructive
        testID="admin-delete-block-confirm"
        onConfirm={() => { void confirmDeleteBlock(); }}
        onCancel={() => setBlockToDelete(null)}
      />
    </AdminShell>
  );
};

const styles = StyleSheet.create({
  scroll: { width: '100%', maxWidth: layout.operationalMax, alignSelf: 'center', padding: 24, paddingTop: 30, paddingBottom: 110, gap: 20 },
  pageHeader: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20 },
  headerActions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  nextAppointmentCard: { marginTop: 16 },
  financialOverview: { gap: 14, padding: 18 },
  financialHeader: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
  financialHeadingCopy: { flex: 1, minWidth: 240 },
  financialMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  financialMetric: { backgroundColor: colors.canvasSoft, borderColor: colors.borderSubtle, borderRadius: radii.md, borderWidth: 1, flex: 1, gap: 4, minWidth: 180, padding: 14 },
  financialMetricLabel: { color: colors.textMuted, fontFamily: typography.bodyStrong, fontSize: 10, letterSpacing: 0.7 },
  financialMetricValue: { color: colors.text, fontFamily: typography.display, fontSize: 22, letterSpacing: -0.6 },
  financialMetricNote: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 11 },
  financialFooter: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
  financialMethods: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
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
  metricLabel: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 12 },
  metricAction: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 34, paddingHorizontal: 9, borderRadius: radii.sm, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.hairline },
  metricActionDisabled: { opacity: 0.35 },
  metricValue: { color: colors.text, fontFamily: typography.display, fontSize: 27, letterSpacing: -1, marginTop: 18 },
  metricNote: { color: colors.textMuted, fontFamily: typography.body, fontSize: 12, marginTop: 5 },
  dateHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 42 },
  dateSelector: { flexDirection: 'row', gap: 8, marginTop: 18, overflow: 'hidden' },
  dateSelectorWide: { flex: 1, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', gap: 8, marginTop: 18 },
  dateItem: { flex: 1, minWidth: 48, maxWidth: 76, alignItems: 'center', justifyContent: 'center', paddingVertical: 11, backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border },
  dateItemWide: { flex: 1, maxWidth: 120 },
  dateItemSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  dateWeek: { color: colors.textMuted, fontFamily: typography.bodyStrong, fontSize: 12, textTransform: 'uppercase' },
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
  insightLine: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12, lineHeight: 16 },
  insightEmpty: { color: colors.textMuted, fontFamily: typography.body, fontSize: 12, lineHeight: 16 },
  schedulePanel: { flex: 1.7, padding: 0, overflow: 'hidden' },
  performancePanel: { flex: 1, minWidth: 300 },
  panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 12 },
  panelTitle: { color: colors.text, fontFamily: typography.display, fontSize: 17, letterSpacing: -0.4 },
  panelSubtitle: { color: colors.textMuted, fontFamily: typography.body, fontSize: 12, marginTop: 4 },
  attentionCenter: { gap: 12, padding: 18 },
  attentionHeader: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
  attentionHeadingCopy: { flex: 1, minWidth: 240 },
  attentionItem: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 12, minHeight: 58, padding: 12 },
  attentionItemActive: { backgroundColor: colors.surfacePressed, borderColor: colors.border },
  attentionItemCopy: { flex: 1, minWidth: 220 },
  attentionItemTitle: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 13 },
  attentionItemMeta: { color: colors.textMuted, fontFamily: typography.body, fontSize: 12, marginTop: 3 },
  attentionAction: { color: colors.brandPrimary, fontFamily: typography.bodyStrong, fontSize: 12 },
  attentionEmpty: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12 },
  loader: { margin: 40 },
  empty: { alignItems: 'center', padding: 42 },
  emptyTitle: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 13, marginTop: 12 },
  emptyText: { color: colors.textMuted, fontFamily: typography.body, fontSize: 12, marginTop: 5, textAlign: 'center' },
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
  serviceName: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12, marginTop: 5 },
  professionalRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  professionalName: { color: colors.textMuted, fontFamily: typography.body, fontSize: 12 },
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  compactButton: { minHeight: 36, paddingVertical: 7, paddingHorizontal: 12 },
  teamList: { marginTop: 20 },
  teamRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 10 },
  avatar: { width: 35, height: 35, borderRadius: radii.md, backgroundColor: colors.surfacePressed, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.text, fontFamily: typography.display, fontSize: 13, letterSpacing: -0.3 },
  teamCopy: { flex: 1 },
  teamName: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 12 },
  teamMeta: { color: colors.textMuted, fontFamily: typography.body, fontSize: 12, marginTop: 3 },
  teamValue: { alignItems: 'flex-end' },
  teamGross: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 12 },
  teamCommission: { color: colors.success, fontFamily: typography.body, fontSize: 12, marginTop: 3 },
  // Modal de Encaixe Estilos
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 15, 18, 0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 520, maxHeight: '90%', padding: 0 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalEyebrow: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase' },
  modalTitle: { color: colors.text, fontFamily: typography.display, fontSize: 18, marginTop: 4 },
  closeButton: { padding: 4, borderRadius: radii.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  modalContent: { padding: 20, gap: 16 },
  fieldLabel: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 12, marginTop: 4 },
  choiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choiceCard: { flex: 1, minWidth: 140 },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  timeSlot: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  timeSlotSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  timeSlotText: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 12 },
  selectedInk: { color: colors.ink },
  performanceCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border, flexWrap: 'wrap', gap: 12 },
  cancellationReasonText: { color: colors.danger, fontSize: 12, marginTop: 4, fontFamily: typography.bodyStrong },
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
    fontSize: 12,
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
