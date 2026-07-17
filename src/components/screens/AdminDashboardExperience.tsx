import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  ArrowUpRight,
  Banknote,
  CalendarDays,
  Check,
  Clock3,
  MessageSquare,
  Plus,
  RefreshCw,
  Scissors,
  TrendingUp,
  UserRound,
  Users,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react-native';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useEstablishment } from '../../hooks/useEstablishment';
import { useAppointments } from '../../hooks/useAppointments';
import { useServices } from '../../hooks/useServices';
import { useTeam } from '../../hooks/useTeam';
import { sendWhatsAppMessage } from '../../services/whatsapp';
import { AdminShell } from '../layout/AdminShell';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';
import { SectionHeading } from '../ui/SectionHeading';
import { StatusBadge } from '../ui/StatusBadge';
import { SegmentedControl } from '../ui/SegmentedControl';
import { ChoiceCard } from '../ui/ChoiceCard';
import { AppInput } from '../ui/AppInput';
import { colors, layout, radii, typography } from '../../theme/tokens';

interface RichAppointment {
  id: string;
  dateTime: Date;
  status: string;
  clientName: string;
  clientPhone: string;
  serviceName: string;
  price: number;
  professionalId: string;
  cancellationReason?: string;
  rescheduleCount?: number;
}

const statusConfig: Record<string, { label: string; tone: 'warning' | 'info' | 'success' | 'danger' }> = {
  pending: { label: 'Pendente', tone: 'warning' },
  confirmed: { label: 'Confirmado', tone: 'info' },
  completed: { label: 'Concluído', tone: 'success' },
  cancelled: { label: 'Cancelado', tone: 'danger' },
};

const quickTimes = ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00'];

const periodOptions = [
  { value: 'today' as const, label: 'Hoje' },
  { value: 'week' as const, label: 'Semana' },
  { value: 'month' as const, label: 'Mês' },
];

export const AdminDashboardExperience = () => {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = width >= layout.desktopBreakpoint;
  const isTablet = width >= layout.mobileBreakpoint;
  const { profile, signOut } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Estados locais para Encaixe Rápido
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickService, setQuickService] = useState<string | null>(null);
  const [quickBarber, setQuickBarber] = useState<string | null>(null);
  const [quickTime, setQuickTime] = useState<string | null>(null);
  const [quickLoading, setQuickLoading] = useState(false);

  // Filtro de Caixa do Painel de Desempenho e Faturamento
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today');

  // Estados locais para Reagendamento
  const [rescheduleItem, setRescheduleItem] = useState<any | null>(null);
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

  const { establishment: barbershop, refresh: refreshBarbershop } = useEstablishment(profile?.establishment_id);
  const { services, refresh: refreshServices } = useServices(profile?.establishment_id, true);
  const { team: barbers, refresh: refreshTeam } = useTeam(profile?.establishment_id, ['professional', 'admin']);

  const dateRange = useMemo(() => {
    const start = new Date(selectedDate);
    const end = new Date(selectedDate);

    if (period === 'today') {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (period === 'week') {
      const day = start.getDay();
      start.setDate(start.getDate() - day);
      start.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() + (6 - day));
      end.setHours(23, 59, 59, 999);
    } else if (period === 'month') {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(end.getMonth() + 1);
      end.setDate(0);
      end.setHours(23, 59, 59, 999);
    }
    return { start: start.toISOString(), end: end.toISOString() };
  }, [selectedDate, period]);

  const { appointments: rawAppointments, loading: appointmentsLoading, error: appointmentsError, refresh: refreshAppointments } = useAppointments({
    establishmentId: profile?.establishment_id,
    dateFrom: dateRange.start,
    dateTo: dateRange.end,
    enabled: !!profile?.establishment_id,
    includeClientContacts: true,
  });

  const appointments: RichAppointment[] = useMemo(() => {
    return rawAppointments.map((app: any) => ({
      id: app.id,
      dateTime: app.dateTime,
      status: app.status,
      clientName: app.client?.name || app.clientName || 'Cliente sem cadastro',
      clientPhone: app.client?.phone || '',
      serviceName: app.service?.name || 'Serviço indisponível',
      price: app.service?.price || 0,
      professionalId: app.professionalId,
      cancellationReason: app.cancellationReason || '',
      rescheduleCount: app.rescheduleCount || 0
    })).sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());
  }, [rawAppointments]);

  const handleRefresh = async () => {
    setLoading(true);
    await Promise.all([
      refreshBarbershop(),
      refreshServices(),
      refreshTeam(),
      refreshAppointments(),
    ]);
    setLoading(false);
  };

  const isSyncing = loading || appointmentsLoading;
  const syncError = appointmentsError;
  const sync = handleRefresh;

  useEffect(() => {
    if (!rescheduleItem || !newRescheduleDate) {
      return;
    }
    const start = new Date(newRescheduleDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(newRescheduleDate);
    end.setHours(23, 59, 59, 999);

    const fetchOccupied = async () => {
      try {
        const { data, error } = await supabase
          .from('appointments')
          .select('date_time')
          .eq('professional_id', rescheduleItem.professionalId)
          .neq('status', 'cancelled')
          .neq('id', rescheduleItem.id)
          .gte('date_time', start.toISOString())
          .lte('date_time', end.toISOString());
        
        if (error || !data) {
          setOccupiedTimes([]);
        } else {
          const times = data.map((item: any) => {
            return new Date(item.date_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
          });
          setOccupiedTimes(times);
        }
      } catch {
        setOccupiedTimes([]);
      }
    };
    fetchOccupied();
  }, [rescheduleItem, newRescheduleDate]);

  useEffect(() => {
    if (!quickOpen || !quickBarber || !quickDate) {
      return;
    }
    const start = new Date(quickDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(quickDate);
    end.setHours(23, 59, 59, 999);

    const fetchQuickOccupied = async () => {
      try {
        const { data, error } = await supabase
          .from('appointments')
          .select('date_time')
          .eq('professional_id', quickBarber)
          .neq('status', 'cancelled')
          .gte('date_time', start.toISOString())
          .lte('date_time', end.toISOString());

        if (error || !data) {
          setQuickOccupiedTimes([]);
        } else {
          const times = data.map((item: any) => {
            return new Date(item.date_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
          });
          setQuickOccupiedTimes(times);
        }
      } catch {
        setQuickOccupiedTimes([]);
      }
    };
    fetchQuickOccupied();
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
      const appLocal = appointments.find(a => a.id === id);
      
      if (status === 'completed' && appLocal && appLocal.dateTime.getTime() > new Date().getTime()) {
        const msg = 'Não é possível concluir um agendamento no futuro.';
        if (Platform.OS === 'web') {
          window.alert(msg);
        } else {
          Alert.alert('Atenção', msg);
        }
        setActionLoadingId(null);
        return;
      }

      const rpcName = status === 'cancelled'
        ? 'cancel_appointment'
        : status === 'confirmed'
          ? 'confirm_appointment'
          : 'complete_appointment';
      const params = status === 'cancelled'
        ? { target_appointment_id: id, reason: reason || 'Cliente solicitou' }
        : { target_appointment_id: id };
      const { error } = await supabase.rpc(rpcName, params);

      if (error) throw error;

    } catch {
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

      const { error } = await supabase.rpc('reschedule_appointment', {
        target_appointment_id: rescheduleItem.id,
        new_date_time: newDate.toISOString(),
        new_professional_id: rescheduleItem.professionalId,
        new_service_id: null,
      });

      if (error) throw error;

      setRescheduleItem(null);
      if (Platform.OS === 'web') window.alert('Atendimento reagendado com sucesso!');
      else Alert.alert('Sucesso', 'Atendimento reagendado com sucesso!');
    } catch {
      const msg = 'Não foi possível reagendar este atendimento.';
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
      const itemEnd = item.dateTime.getTime() + (service?.durationMinutes || 30) * 60 * 1000;
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
    } catch (bookingError: any) {
      const conflict = bookingError?.message?.includes('appointment_conflict') || bookingError?.code === '23P01';
      const msg = conflict ? 'Esse horário acabou de ser reservado.' : 'Não foi possível criar o encaixe.';
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Erro', msg);
      }
    } finally {
      setQuickLoading(false);
    }
  };

  const isSameDay = (d1: Date, d2: Date) => d1.toDateString() === d2.toDateString();

  // A fila da agenda do dia filtra apenas o dia específico selecionado
  const activeAppointments = appointments.filter((item) => 
    isSameDay(item.dateTime, selectedDate) && (item.status === 'pending' || item.status === 'confirmed')
  );
  const finishedAppointments = appointments.filter((item) => 
    isSameDay(item.dateTime, selectedDate) && (item.status === 'completed' || item.status === 'cancelled')
  );

  // Cálculos do período selecionado (Hoje, Semana ou Mês) para métricas e repasses
  const periodActive = appointments.filter((item) => item.status !== 'cancelled');
  const periodCompleted = appointments.filter((item) => item.status === 'completed');
  const revenue = periodCompleted.reduce((total, item) => total + item.price, 0);
  const occupancy = Math.min(100, Math.round((periodActive.length / (Math.max(barbers.length, 1) * 12 * (period === 'today' ? 1 : period === 'week' ? 6 : 26))) * 100));
  
  const currency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: barbershop?.currency || 'BRL' }).format(value);
  const time = (value: Date) => value.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const barberName = (id: string) => barbers.find((barber) => barber.id === id)?.name || 'Profissional';

  const metrics = [
    { key: 'revenue', label: period === 'today' ? 'Faturamento do dia' : period === 'week' ? 'Faturamento da semana' : 'Faturamento do mês', value: currency(revenue), note: `${periodCompleted.length} atendimentos concluídos`, Icon: Banknote, actionLabel: 'Gerenciar serviços', action: () => router.push('/(admin)/services') },
    { key: 'occupancy', label: 'Ocupação estimada', value: `${occupancy}%`, note: `${periodActive.length} horários no período`, Icon: TrendingUp, actionLabel: 'Ver vitrine', action: barbershop?.slug ? () => router.push(`/${barbershop.slug}` as never) : undefined },
    { key: 'team', label: 'Equipe em agenda', value: String(barbers.length), note: 'profissionais disponíveis', Icon: Users, actionLabel: 'Ver equipe', action: () => router.push('/(admin)/team') },
  ];

  const renderAppointmentRow = (item: RichAppointment, isFinished = false) => {
    const status = statusConfig[item.status] || { label: item.status, tone: 'warning' as const };
    return (
      <View key={item.id} testID={`admin-appointment-${item.id}`} style={[styles.appointmentRow, isFinished && styles.appointmentRowFinished]}>
        <View style={styles.timeColumn}>
          <Text testID={`admin-appointment-${item.id}-time`} style={[styles.appointmentTime, isFinished && styles.timeFinished]}>{time(item.dateTime)}</Text>
          <View style={[styles.timelineDot, isFinished && styles.dotFinished]} />
        </View>
        <View style={styles.appointmentCopy}>
          <View style={styles.appointmentTitleRow}>
            <Text testID={`admin-appointment-${item.id}-client`} style={styles.clientName}>{item.clientName}</Text>
            <StatusBadge testID={`admin-appointment-${item.id}-status`} label={status.label} tone={status.tone} />
          </View>
          <Text style={styles.serviceName}>{item.serviceName} · {currency(item.price)}</Text>
          {item.status === 'cancelled' && !!item.cancellationReason ? (
            <Text style={styles.cancellationReasonText}>Motivo: {item.cancellationReason}</Text>
          ) : null}
          <View style={styles.professionalRow}>
            <UserRound color={colors.textMuted} size={13} />
            <Text style={styles.professionalName}>{barberName(item.professionalId)}</Text>
          </View>
          {!isFinished && (
            <View style={styles.rowActions}>
              {!!item.clientPhone && (
                <AppButton 
                  label="WhatsApp" 
                  testID={`admin-appointment-${item.id}-whatsapp-button`} 
                  onPress={() => {
                    const text = `Olá, ${item.clientName}! Confirmando o seu agendamento de ${item.serviceName} no CutSync para as ${time(item.dateTime)} com o profissional ${barberName(item.professionalId)}.`;
                    sendWhatsAppMessage(item.clientPhone, text);
                  }}
                  variant="secondary"
                  icon={<MessageSquare color={colors.textSecondary} size={14} />}
                  style={styles.compactButton}
                />
              )}
              <AppButton
                label="Reagendar"
                testID={`admin-appointment-${item.id}-reschedule-button`}
                variant="secondary"
                disabled={!!actionLoadingId}
                onPress={() => {
                  setRescheduleItem(item);
                  setOccupiedTimes([]);
                  setNewRescheduleDate(new Date(item.dateTime));
                  setNewRescheduleTime(time(item.dateTime));
                }}
                icon={<RefreshCw color={colors.textSecondary} size={13} />}
                style={styles.compactButton}
              />
              <AppButton
                label={item.status === 'pending' ? 'Recusar' : 'Marcar falta'}
                testID={`admin-appointment-${item.id}-cancel-button`}
                variant="danger"
                disabled={!!actionLoadingId}
                onPress={() => updateStatus(item.id, 'cancelled')}
                icon={<X color={colors.danger} size={15} />}
                style={styles.compactButton}
              />
              <AppButton
                label={item.status === 'pending' ? 'Confirmar' : 'Concluir'}
                testID={`admin-appointment-${item.id}-advance-button`}
                loading={actionLoadingId === item.id}
                disabled={!!actionLoadingId && actionLoadingId !== item.id}
                onPress={() => updateStatus(item.id, item.status === 'pending' ? 'confirmed' : 'completed')}
                variant="admin"
                icon={<Check color={colors.white} size={15} />}
                style={styles.compactButton}
              />
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <AdminShell
      testID="admin-dashboard-screen"
      activeRoute="overview"
      shopName={barbershop?.name || 'Sua barbearia'}
      userName={profile?.name}
      onSignOut={signOut}
    >
      <View style={styles.pageHeader}>
        <SectionHeading
          testID="admin-dashboard-heading"
          eyebrow="Central de operação"
          title={`Bom dia, ${profile?.name?.split(' ')[0] || 'gestor'}.`}
          description="Acompanhe o ritmo da loja e filtre faturamento e repasses por período."
        />
        <View style={styles.headerActions}>
          <StatusBadge
            testID="admin-sync-status"
            label={syncError ? 'Falha na sincronização' : isSyncing ? 'Sincronizando' : 'Dados sincronizados'}
            tone={syncError ? 'danger' : isSyncing ? 'warning' : 'success'}
          />
          <AppButton
            label={isSyncing ? 'Sincronizando' : 'Sincronizar'}
            testID="admin-sync-button"
            variant="secondary"
            loading={isSyncing}
            onPress={sync}
            icon={!isSyncing ? <RefreshCw color={colors.text} size={16} /> : undefined}
          />
          <AppButton
            label="+ Novo Agendamento"
            testID="admin-new-booking-button"
            onPress={() => {
              setQuickOpen(true);
              setQuickOccupiedTimes([]);
              setQuickDate(selectedDate);
              setQuickTime(null);
              setQuickBarber(null);
              setQuickService(null);
            }}
            variant="admin"
            icon={<Plus color={colors.white} size={17} />}
          />
        </View>
      </View>

      <View testID="admin-metrics-grid" style={[styles.metrics, !isTablet && styles.metricsMobile]}>
        {metrics.map(({ key, label, value, note, Icon, actionLabel, action }) => (
          <AppCard key={key} testID={`admin-metric-${key}`} style={styles.metricCard}>
            <View style={styles.metricTop}>
              <Text style={styles.metricLabel}>{label}</Text>
              <Pressable
                testID={`admin-metric-${key}-action`}
                accessibilityRole="link"
                accessibilityLabel={actionLabel}
                disabled={!action}
                onPress={action}
                style={({ pressed }) => [styles.metricAction, !action && styles.metricActionDisabled, pressed && styles.pressed]}
              >
                <Icon color={colors.textSecondary} size={16} strokeWidth={1.8} />
                <ArrowUpRight color={colors.textMuted} size={14} />
              </Pressable>
            </View>
            <Text testID={`admin-metric-${key}-value`} style={styles.metricValue}>{value}</Text>
            <Text style={styles.metricNote}>{note}</Text>
          </AppCard>
        ))}
      </View>

      <View style={styles.dateHeader}>
        <SectionHeading testID="admin-agenda-heading" eyebrow="Agenda" title="Ritmo do dia" description="Selecione uma data para acompanhar todos os profissionais." />
        <CalendarDays color={colors.textMuted} size={22} />
      </View>

      <View style={styles.calendarNavContainer}>
        <Pressable 
          testID="admin-calendar-prev"
          onPress={() => {
            const d = new Date(selectedDate);
            d.setDate(d.getDate() - 7);
            setSelectedDate(d);
          }} 
          style={styles.navArrow}
        >
          <ChevronLeft color={colors.textSecondary} size={18} />
        </Pressable>

          {isWide ? (
            <View style={styles.dateSelectorWide}>
              {dateOptions.map((item) => {
                const selected = selectedDate.toDateString() === item.date.toDateString();
                return (
                  <Pressable
                    key={item.id}
                    testID={`admin-date-${item.id}`}
                    onPress={() => setSelectedDate(item.date)}
                    style={({ pressed }) => [
                      styles.dateItem,
                      styles.dateItemWide,
                      selected && styles.dateItemSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.dateWeek, selected && styles.dateTextSelected]}>{item.weekDay}</Text>
                    <Text style={[styles.dateDay, selected && styles.dateTextSelected]}>{item.day}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateSelector} style={{ flex: 1 }}>
              {dateOptions.map((item) => {
                const selected = selectedDate.toDateString() === item.date.toDateString();
                return (
                  <Pressable
                    key={item.id}
                    testID={`admin-date-${item.id}`}
                    onPress={() => setSelectedDate(item.date)}
                    style={({ pressed }) => [
                      styles.dateItem,
                      selected && styles.dateItemSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.dateWeek, selected && styles.dateTextSelected]}>{item.weekDay}</Text>
                    <Text style={[styles.dateDay, selected && styles.dateTextSelected]}>{item.day}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

        <Pressable 
          testID="admin-calendar-next"
          onPress={() => {
            const d = new Date(selectedDate);
            d.setDate(d.getDate() + 7);
            setSelectedDate(d);
          }} 
          style={styles.navArrow}
        >
          <ChevronRight color={colors.textSecondary} size={18} />
        </Pressable>

        {weekOffset !== 0 && (
          <Pressable 
            testID="admin-calendar-today"
            onPress={() => setSelectedDate(new Date())} 
            style={styles.todayBtn}
          >
            <Text style={styles.todayBtnText}>Hoje</Text>
          </Pressable>
        )}
      </View>

      <View style={[styles.workspace, isWide && styles.workspaceWide]}>
        <AppCard testID="admin-appointments-panel" style={styles.schedulePanel}>
          <View style={styles.panelHeader}>
            <View>
              <Text testID="admin-appointments-title" style={styles.panelTitle}>Próximos atendimentos</Text>
              <Text style={styles.panelSubtitle}>{activeAppointments.length} horários ativos nesta data</Text>
            </View>
            <StatusBadge testID="admin-active-appointments-count" label={`${activeAppointments.length} ativos`} tone="info" />
          </View>

          {loading ? (
            <ActivityIndicator testID="admin-appointments-loading" color={colors.accent} style={styles.loader} />
          ) : activeAppointments.length === 0 ? (
            <View testID="admin-appointments-empty" style={styles.empty}>
              <Clock3 color={colors.textMuted} size={28} />
              <Text style={styles.emptyTitle}>Agenda livre por aqui</Text>
              <Text style={styles.emptyText}>Nenhum atendimento pendente ou confirmado para esta data.</Text>
            </View>
          ) : (
            activeAppointments.map((item) => renderAppointmentRow(item))
          )}

          {finishedAppointments.length > 0 && (
            <>
              <View style={[styles.panelHeader, { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 16 }]}>
                <View>
                  <Text style={styles.panelTitle}>Histórico do Dia</Text>
                  <Text style={styles.panelSubtitle}>{finishedAppointments.length} atendimentos encerrados</Text>
                </View>
                <StatusBadge testID="admin-finished-appointments-badge" label="Concluídos/Cancelados" tone="neutral" />
              </View>
              {finishedAppointments.map((item) => renderAppointmentRow(item, true))}
            </>
          )}
        </AppCard>

        <AppCard testID="admin-team-performance-panel" style={styles.performancePanel}>
          <View style={styles.performanceCardHeader}>
            <View style={{ flex: 1, minWidth: 160 }}>
              <Text style={styles.panelTitle}>Desempenho da equipe</Text>
              <Text style={styles.panelSubtitle}>Produção e repasse por profissional</Text>
            </View>
            <SegmentedControl testID="admin-performance-period" value={period} options={periodOptions} onChange={setPeriod} />
          </View>

          <View style={styles.teamList}>
            {barbers.map((barber) => {
              const barberAppointments = periodCompleted.filter((item) => item.professionalId === barber.id);
              const gross = barberAppointments.reduce((total, item) => total + item.price, 0);
              const rate = barber.commissionRate ?? 0.5;
              return (
                <View key={barber.id} testID={`admin-team-performance-${barber.id}`} style={styles.teamRow}>
                  <View style={styles.avatar}><Text style={styles.avatarText}>{barber.name.charAt(0).toUpperCase()}</Text></View>
                  <View style={styles.teamCopy}>
                    <Text style={styles.teamName}>{barber.name}</Text>
                    <Text style={styles.teamMeta}>{barberAppointments.length} atend. · {Math.round(rate * 100)}% comissão</Text>
                  </View>
                  <View style={styles.teamValue}>
                    <Text style={styles.teamGross}>{currency(gross)}</Text>
                    <Text style={styles.teamCommission}>{currency(gross * rate)} repasse</Text>
                  </View>
                </View>
              );
            })}
          </View>
          {barbers.length === 0 && <Text testID="admin-team-performance-empty" style={styles.emptyText}>Nenhum profissional vinculado.</Text>}
        </AppCard>
      </View>

      {/* Modal de Encaixe Rápido para o Administrador */}
      <Modal visible={quickOpen} transparent animationType="fade" onRequestClose={() => setQuickOpen(false)}>
        <View testID="admin-quick-booking-modal" style={styles.modalOverlay}>
          <AppCard testID="admin-quick-booking-card" style={styles.modalCard} elevated>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalEyebrow}>ENCAIXE ADMINISTRATIVO</Text>
                <Text testID="admin-quick-booking-title" style={styles.modalTitle}>Reservar um horário</Text>
              </View>
              <Pressable testID="admin-quick-booking-close-button" onPress={() => setQuickOpen(false)} style={styles.closeButton}>
                <X color={colors.textSecondary} size={18} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
              <AppInput 
                label="Nome do cliente" 
                testID="admin-quick-client-input" 
                icon={<UserRound color={colors.textMuted} size={17} />} 
                value={quickName} 
                onChangeText={setQuickName} 
                placeholder="Cliente de balcão" 
              />
              
              <Text style={styles.fieldLabel}>Profissional</Text>
              <View style={styles.choiceGrid}>
                {barbers.map((barber) => (
                  <ChoiceCard 
                    key={barber.id} 
                    testID={`admin-quick-barber-${barber.id}`} 
                    title={barber.name} 
                    subtitle={barber.role === 'admin' ? 'Proprietário' : 'Barbeiro'} 
                    selected={quickBarber === barber.id} 
                    onPress={() => { setQuickBarber(barber.id); setQuickTime(null); setQuickOccupiedTimes([]); }} 
                    icon={<UserRound color={colors.textSecondary} size={15} />} 
                    style={styles.choiceCard} 
                  />
                ))}
              </View>

               <Text style={styles.fieldLabel}>Selecione o Dia</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateSelector}>
                {dateOptions.map((opt) => {
                  const selected = quickDate.toDateString() === opt.date.toDateString();
                  return (
                    <Pressable 
                      key={opt.id} 
                      onPress={() => { setQuickDate(opt.date); setQuickTime(null); setQuickOccupiedTimes([]); }} 
                      style={[styles.dateItem, selected && styles.dateItemSelected]}
                    >
                      <Text style={[styles.dateWeek, selected && styles.dateTextSelected]}>
                        {opt.weekDay}
                      </Text>
                      <Text style={[styles.dateDay, selected && styles.dateTextSelected]}>
                        {opt.day}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Text style={styles.fieldLabel}>Serviço</Text>
              <View style={styles.choiceGrid}>
                {services.map((service) => (
                  <ChoiceCard 
                    key={service.id} 
                    testID={`admin-quick-service-${service.id}`} 
                    title={service.name} 
                    subtitle={`${service.durationMinutes} min`} 
                    meta={currency(service.price)} 
                    selected={quickService === service.id} 
                    onPress={() => { setQuickService(service.id); setQuickTime(null); }} 
                    icon={<Scissors color={colors.textSecondary} size={15} />} 
                    style={styles.choiceCard} 
                  />
                ))}
              </View>

              <Text style={styles.fieldLabel}>Horário em {quickDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</Text>
              <View style={styles.timeGrid}>
                {quickTimes.map((slot) => {
                  const isOccupied = quickOccupiedTimes.includes(slot);
                  return (
                    <Pressable 
                      key={slot} 
                      testID={`admin-quick-time-${slot.replace(':', '-')}`} 
                      disabled={isOccupied}
                      onPress={() => setQuickTime(slot)} 
                      style={({ pressed }) => [
                        styles.timeSlot, 
                        quickTime === slot && styles.timeSlotSelected, 
                        isOccupied && styles.timeSlotOccupied,
                        pressed && styles.pressed
                      ]}
                    >
                      <Text style={[
                        styles.timeSlotText, 
                        quickTime === slot && styles.dateTextSelected,
                        isOccupied && styles.timeSlotTextOccupied
                      ]}>
                        {slot}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <AppButton 
                label="Criar agendamento" 
                testID="admin-quick-submit-button" 
                onPress={createQuickBooking} 
                loading={quickLoading} 
                fullWidth 
                variant="admin"
                icon={<Plus color={colors.white} size={16} />}
              />
            </ScrollView>
          </AppCard>
        </View>
      </Modal>

      <Modal visible={!!rescheduleItem} transparent animationType="fade" onRequestClose={() => setRescheduleItem(null)}>
        <View style={styles.modalOverlay}>
          <AppCard testID="admin-reschedule-card" style={styles.modalCard} elevated>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalEyebrow}>REAGENDAMENTO</Text>
                <Text style={styles.modalTitle}>Reagendar Atendimento</Text>
              </View>
              <Pressable onPress={() => setRescheduleItem(null)} style={styles.closeButton}>
                <X color={colors.textSecondary} size={18} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
              <Text style={{ color: colors.textSecondary, fontFamily: typography.body, fontSize: 12 }}>
                Reagendando o cliente <Text style={{ fontFamily: typography.bodyStrong, color: colors.text }}>{rescheduleItem?.clientName}</Text> para o serviço <Text style={{ fontFamily: typography.bodyStrong, color: colors.text }}>{rescheduleItem?.serviceName}</Text>.
              </Text>
              
              <Text style={styles.fieldLabel}>Selecione o novo dia</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateSelector}>
                {dateOptions.map((opt) => {
                  const selected = newRescheduleDate.toDateString() === opt.date.toDateString();
                  return (
                    <Pressable 
                      key={opt.id} 
                      onPress={() => { setNewRescheduleDate(opt.date); setNewRescheduleTime(null); setOccupiedTimes([]); }} 
                      style={[styles.dateItem, selected && styles.dateItemSelected]}
                    >
                      <Text style={[styles.dateWeek, selected && styles.dateTextSelected]}>
                        {opt.weekDay}
                      </Text>
                      <Text style={[styles.dateDay, selected && styles.dateTextSelected]}>
                        {opt.day}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Text style={styles.fieldLabel}>Selecione o novo horário</Text>
              <View style={styles.timeGrid}>
                {quickTimes.map((slot) => {
                  const isOccupied = occupiedTimes.includes(slot);
                  return (
                    <Pressable 
                      key={slot} 
                      disabled={isOccupied}
                      onPress={() => setNewRescheduleTime(slot)} 
                      style={[
                        styles.timeSlot, 
                        newRescheduleTime === slot && styles.timeSlotSelected,
                        isOccupied && styles.timeSlotOccupied
                      ]}
                    >
                      <Text style={[
                        styles.timeSlotText, 
                        newRescheduleTime === slot && styles.dateTextSelected,
                        isOccupied && styles.timeSlotTextOccupied
                      ]}>
                        {slot}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <AppButton 
                label="Confirmar Reagendamento" 
                testID="reschedule-submit-button" 
                onPress={executeReschedule} 
                loading={rescheduleLoading} 
                disabled={!newRescheduleTime}
                fullWidth 
                variant="admin"
                icon={<RefreshCw color={colors.white} size={16} />}
              />
            </ScrollView>
          </AppCard>
        </View>
      </Modal>
    </AdminShell>
  );
};

const styles = StyleSheet.create({
  pageHeader: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20 },
  headerActions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  metrics: { flexDirection: 'row', gap: 14, marginTop: 30 },
  metricsMobile: { flexDirection: 'column' },
  metricCard: { flex: 1, minWidth: 190 },
  metricTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metricLabel: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 11 },
  metricAction: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 34, paddingHorizontal: 9, borderRadius: radii.sm, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.hairline },
  metricActionDisabled: { opacity: 0.35 },
  metricValue: { color: colors.text, fontFamily: typography.display, fontSize: 27, letterSpacing: -1, marginTop: 18 },
  metricNote: { color: colors.textMuted, fontFamily: typography.body, fontSize: 10, marginTop: 5 },
  dateHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 42 },
  dateSelector: { flexDirection: 'row', gap: 8, marginTop: 18, overflow: 'hidden' },
  dateSelectorWide: { flex: 1, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', gap: 8, marginTop: 18 },
  dateItem: { flex: 1, minWidth: 48, maxWidth: 76, alignItems: 'center', justifyContent: 'center', paddingVertical: 11, backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border },
  dateItemWide: { flex: 1, maxWidth: 120 },
  dateItemSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  dateWeek: { color: colors.textMuted, fontFamily: typography.bodyStrong, fontSize: 9, textTransform: 'uppercase' },
  dateDay: { color: colors.text, fontFamily: typography.display, fontSize: 17, marginTop: 3 },
  dateTextSelected: { color: colors.white },
  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
  workspace: { gap: 16, marginTop: 18 },
  workspaceWide: { flexDirection: 'row', alignItems: 'flex-start' },
  schedulePanel: { flex: 1.7, padding: 0, overflow: 'hidden' },
  performancePanel: { flex: 1, minWidth: 300 },
  panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 12 },
  panelTitle: { color: colors.text, fontFamily: typography.display, fontSize: 17, letterSpacing: -0.4 },
  panelSubtitle: { color: colors.textMuted, fontFamily: typography.body, fontSize: 10, marginTop: 4 },
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
  professionalName: { color: colors.textMuted, fontFamily: typography.body, fontSize: 10 },
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  compactButton: { minHeight: 36, paddingVertical: 7, paddingHorizontal: 12 },
  teamList: { marginTop: 20 },
  teamRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 10 },
  avatar: { width: 35, height: 35, borderRadius: radii.md, backgroundColor: colors.surfacePressed, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.text, fontFamily: typography.display, fontSize: 13, letterSpacing: -0.3 },
  teamCopy: { flex: 1 },
  teamName: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 11 },
  teamMeta: { color: colors.textMuted, fontFamily: typography.body, fontSize: 9, marginTop: 3 },
  teamValue: { alignItems: 'flex-end' },
  teamGross: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 10 },
  teamCommission: { color: colors.success, fontFamily: typography.body, fontSize: 9, marginTop: 3 },
  // Modal de Encaixe Estilos
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 15, 18, 0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 520, maxHeight: '90%', padding: 0 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalEyebrow: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 8, letterSpacing: 1.5, textTransform: 'uppercase' },
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
  cancellationReasonText: { color: colors.danger, fontSize: 10, marginTop: 4, fontFamily: typography.bodyStrong },
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
    fontSize: 10,
    textTransform: 'uppercase',
  },
});