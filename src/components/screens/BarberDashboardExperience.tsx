import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Check, ChevronLeft, ChevronRight, Clock3, Plus, RefreshCw, Scissors, UserRound, WalletCards, X } from 'lucide-react-native';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useEstablishment } from '../../hooks/useEstablishment';
import { useAppointments } from '../../hooks/useAppointments';
import { useServices } from '../../hooks/useServices';
import { ProfessionalShell } from '../layout/ProfessionalShell';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';
import { AppInput } from '../ui/AppInput';
import { ChoiceCard } from '../ui/ChoiceCard';
import { InlineNotice } from '../ui/InlineNotice';
import { SectionHeading } from '../ui/SectionHeading';
import { SegmentedControl } from '../ui/SegmentedControl';
import { StatusBadge } from '../ui/StatusBadge';
import { colors, layout, radii, typography } from '../../theme/tokens';

type Tab = 'mine' | 'team';

interface RichAppointment {
  id: string;
  professionalId: string;
  barberName: string;
  clientName: string;
  serviceName: string;
  price: number;
  dateTime: Date;
  status: string;
  cancellationReason?: string;
  rescheduleCount?: number;
}

const statusMap: Record<string, { label: string; tone: 'warning' | 'info' | 'success' | 'danger' }> = {
  pending: { label: 'Pendente', tone: 'warning' },
  confirmed: { label: 'Confirmado', tone: 'info' },
  completed: { label: 'Concluído', tone: 'success' },
  cancelled: { label: 'Cancelado', tone: 'danger' },
};

const quickTimes = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
  '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30',
  '20:00'
];
const hitSlop = { top: 12, bottom: 12, left: 12, right: 12 };
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
  const { width } = useWindowDimensions();
  const isWide = width >= layout.desktopBreakpoint;
  const { profile, signOut } = useAuth();
  const [isOffline, setIsOffline] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [tab, setTab] = useState<Tab>('mine');
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [cancelCandidateId, setCancelCandidateId] = useState<string | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickService, setQuickService] = useState<string | null>(null);
  const [quickTime, setQuickTime] = useState<string | null>(null);
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickDate, setQuickDate] = useState<Date>(new Date());
  const [quickOccupiedTimes, setQuickOccupiedTimes] = useState<string[]>([]);
  const [quickReferenceTime, setQuickReferenceTime] = useState(0);

  const [rescheduleItem, setRescheduleItem] = useState<any | null>(null);
  const [newRescheduleDate, setNewRescheduleDate] = useState<Date>(new Date());
  const [newRescheduleTime, setNewRescheduleTime] = useState<string | null>(null);
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [occupiedTimes, setOccupiedTimes] = useState<string[]>([]);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null);
  const [nextAppointment, setNextAppointment] = useState<RichAppointment | null>(null);

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

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(!state.isConnected || state.isInternetReachable === false);
    });
    return () => unsubscribe();
  }, []);

  const { establishment: barbershop, refresh: refreshBarbershop } = useEstablishment(profile?.establishment_id);
  const { services, refresh: refreshServices } = useServices(profile?.establishment_id, true);

  const startOfDay = useMemo(() => {
    const d = new Date(selectedDate);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, [selectedDate]);

  const endOfDay = useMemo(() => {
    const d = new Date(selectedDate);
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
  }, [selectedDate]);

  const { appointments: rawAppointments, refresh: refreshAppointments } = useAppointments({
    establishmentId: profile?.establishment_id,
    dateFrom: startOfDay,
    dateTo: endOfDay,
    enabled: !!profile?.establishment_id,
  });

  const appointments: RichAppointment[] = useMemo(() => {
    return rawAppointments.map((app: any) => ({
      id: app.id,
      professionalId: app.professionalId,
      barberName: app.professional?.name || 'Profissional',
      clientName: app.client?.name || app.clientName || 'Cliente sem cadastro',
      serviceName: app.service?.name || 'Serviço indisponível',
      price: app.service?.price || 0,
      dateTime: app.dateTime,
      status: app.status,
      cancellationReason: app.cancellationReason || '',
      rescheduleCount: app.rescheduleCount || 0
    })).sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());
  }, [rawAppointments]);

  const handleRefresh = async () => {
    setLoading(true);
    await Promise.all([
      refreshBarbershop(),
      refreshServices(),
      refreshAppointments(),
    ]);
    setLoading(false);
  };

  useEffect(() => {
    if (!profile?.id) return;

    const fetchNext = async () => {
      try {
        const { data, error } = await supabase
          .from('appointments')
          .select(`
            *,
            service:services(id,name,price,duration_minutes)
          `)
          .eq('professional_id', profile.id)
          .in('status', ['pending', 'confirmed'])
          .gte('date_time', new Date().toISOString())
          .order('date_time', { ascending: true })
          .limit(1);

        if (error) throw error;

        if (!data || data.length === 0) {
          setNextAppointment(null);
        } else {
          const app = data[0];
          setNextAppointment({
            id: app.id,
            professionalId: app.professional_id,
            barberName: app.professional?.name || 'Profissional',
            clientName: app.client?.name || app.client_name || 'Cliente sem cadastro',
            serviceName: app.service?.name || 'Serviço indisponível',
            price: app.service?.price || 0,
            dateTime: new Date(app.date_time),
            status: app.status,
            cancellationReason: app.cancellation_reason || '',
          });
        }
      } catch (err) {
        console.error('Erro ao buscar próximo agendamento:', err);
      }
    };

    fetchNext();

    const channel = supabase
      .channel(`next-appointment-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
          filter: `professional_id=eq.${profile.id}`,
        },
        () => fetchNext(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

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
    if (!quickOpen || !profile?.id || !quickDate) {
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
          .eq('professional_id', profile.id)
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
  }, [quickOpen, profile?.id, quickDate]);

  const visibleOccupiedTimes = rescheduleItem ? occupiedTimes : [];
  const visibleQuickOccupiedTimes = quickOpen && profile?.id ? quickOccupiedTimes : [];

  const visibleAppointments = tab === 'mine' ? appointments.filter((item) => item.professionalId === profile?.id) : appointments;
  const completed = visibleAppointments.filter((item) => item.status === 'completed');
  const revenue = completed.reduce((sum, item) => sum + item.price, 0);
  const commission = revenue * (profile?.commission_rate ?? 0.5);
  const currency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: barbershop?.currency || 'BRL' }).format(value);
  const primaryColor = barbershop?.primaryColor || colors.brand;
  const primaryForeground = readableForeground(primaryColor);
  const time = (date: Date) => date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const formatNextAppointmentValue = (date: Date) => {
    const today = new Date();
    const target = new Date(date);
    const todayZero = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const targetZero = new Date(target.getFullYear(), target.getMonth(), target.getDate());
    const diffTime = targetZero.getTime() - todayZero.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    const timeStr = target.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 0) {
      return `Hoje, ${timeStr}`;
    } else if (diffDays === 1) {
      return `Amanhã, ${timeStr}`;
    } else {
      const day = String(target.getDate()).padStart(2, '0');
      const month = String(target.getMonth() + 1).padStart(2, '0');
      return `${day}/${month}, ${timeStr}`;
    }
  };

  const workHours = profile?.work_hours;
  const timeSlots = useMemo(() => {
    const dayOfWeek = selectedDate.getDay();
    let schedule = defaultSchedule.find(s => s.day === dayOfWeek);
    if (workHours) {
      try {
        const parsed = JSON.parse(workHours);
        const found = parsed.find((s: any) => s.day === dayOfWeek);
        if (found) schedule = found;
      } catch {}
    }
    
    const startStr = schedule?.isOpen ? schedule.open : '09:00';
    const endStr = schedule?.isOpen ? schedule.close : '18:00';
    
    const [startHour, startMin] = startStr.split(':').map(Number);
    const [endHour, endMin] = endStr.split(':').map(Number);
    
    const slots: string[] = [];
    let current = new Date();
    current.setHours(startHour, startMin, 0, 0);
    
    const end = new Date();
    end.setHours(endHour, endMin, 0, 0);
    
    while (current <= end) {
      const timeString = current.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      slots.push(timeString);
      current.setMinutes(current.getMinutes() + 30);
    }
    return slots;
  }, [selectedDate, workHours]);

  const activeAppointments = useMemo(() => {
    return visibleAppointments.filter(app => app.status === 'pending' || app.status === 'confirmed');
  }, [visibleAppointments]);
  
  const inactiveAppointments = useMemo(() => {
    return visibleAppointments.filter(app => app.status === 'completed' || app.status === 'cancelled');
  }, [visibleAppointments]);

  const activeAppointmentsBySlot = useMemo(() => {
    const map: Record<string, RichAppointment[]> = {};
    activeAppointments.forEach(app => {
      const tStr = app.dateTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      if (!map[tStr]) map[tStr] = [];
      map[tStr].push(app);
    });
    return map;
  }, [activeAppointments]);

  const timelineSlots = useMemo(() => {
    const slotsSet = new Set(timeSlots);
    activeAppointments.forEach(app => {
      const tStr = app.dateTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      slotsSet.add(tStr);
    });
    return Array.from(slotsSet).sort((a, b) => {
      const [ha, ma] = a.split(':').map(Number);
      const [hb, mb] = b.split(':').map(Number);
      return (ha * 60 + ma) - (hb * 60 + mb);
    });
  }, [timeSlots, activeAppointments]);

  const filteredRescheduleTimes = useMemo(() => {
    const isToday = newRescheduleDate.toDateString() === new Date().toDateString();
    if (!isToday) return quickTimes;
    const now = new Date();
    const currentHour = now.getHours();
    const currentMin = now.getMinutes();
    return quickTimes.filter(slot => {
      const [h, m] = slot.split(':').map(Number);
      return h > currentHour || (h === currentHour && m >= currentMin);
    });
  }, [newRescheduleDate]);

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
      const appLocal = appointments.find(a => a.id === id);
      if (status === 'completed' && appLocal && appLocal.dateTime.getTime() > new Date().getTime()) {
        setNotice({ tone: 'danger', message: 'Não é possível concluir um agendamento no futuro.' });
        setActionLoadingId(null);
        return;
      }

      const { error } = await supabase
        .from('appointments')
        .update({
          status,
          cancellation_reason: status === 'cancelled' ? (reason || 'Cliente solicitou') : null,
          cancelled_by_role: status === 'cancelled' ? 'professional' : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;

      setCancelCandidateId(null);
      setNotice({ tone: 'success', message: 'Status do atendimento atualizado.' });
    } catch {
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

      const appLocal = appointments.find(a => a.id === rescheduleItem.id);
      const originalDateTime = appLocal ? appLocal.dateTime.toISOString() : newDate.toISOString();

      const { error } = await supabase
        .from('appointments')
        .update({
          original_date_time: originalDateTime,
          date_time: newDate.toISOString(),
          reschedule_count: (rescheduleItem.rescheduleCount || 0) + 1,
          status: 'confirmed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', rescheduleItem.id);

      if (error) throw error;

      setRescheduleItem(null);
      setNotice({ tone: 'success', message: 'Atendimento reagendado com sucesso!' });
    } catch {
      setNotice({ tone: 'danger', message: 'Não foi possível reagendar este atendimento.' });
    } finally {
      setRescheduleLoading(false);
    }
  };

  const createQuickBooking = async () => {
    if (!quickName.trim() || !quickService || !quickTime || !profile?.establishment_id || !profile?.id) {
      setNotice({ tone: 'danger', message: 'Informe cliente, serviço e horário para criar o encaixe.' });
      return;
    }
    const dateTime = new Date(quickDate);
    const [hours, minutes] = quickTime.split(':').map(Number);
    dateTime.setHours(hours, minutes, 0, 0);
    const service = services.find((item) => item.id === quickService);
    const end = dateTime.getTime() + (service?.durationMinutes || 30) * 60 * 1000;
    const conflict = appointments.some((item) => {
      if (item.professionalId !== profile.id || item.status === 'cancelled') return false;
      const itemEnd = item.dateTime.getTime() + (service?.durationMinutes || 30) * 60 * 1000;
      return dateTime.getTime() < itemEnd && end > item.dateTime.getTime();
    });
    if (conflict) {
      setNotice({ tone: 'danger', message: 'Esse horário conflita com outro atendimento.' });
      return;
    }

    setQuickLoading(true);
    try {
      const { error } = await supabase.rpc('create_appointment', {
        target_establishment_id: profile.establishment_id,
        target_professional_id: profile.id,
        target_service_id: quickService,
        target_date_time: dateTime.toISOString(),
        target_client_name: quickName.trim(),
        target_client_id: null,
      });

      if (error) throw error;

      setQuickOpen(false); setQuickName(''); setQuickService(null); setQuickTime(null);
      setNotice({ tone: 'success', message: 'Encaixe criado e reservado na sua agenda.' });
      if (Platform.OS !== 'web') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (bookingError: any) {
      const conflict = bookingError?.message?.includes('appointment_conflict') || bookingError?.code === '23P01';
      setNotice({ tone: 'danger', message: conflict ? 'Esse horário acabou de ser reservado.' : 'Não foi possível criar o encaixe.' });
    } finally {
      setQuickLoading(false);
    }
  };

  const saudacaoProfissional = profile?.titulo_profissional
    ? profile.titulo_profissional.toLowerCase()
    : 'especialista';

  return (
    <ProfessionalShell testID="barber-dashboard-screen" name={profile?.name} shopName={barbershop?.name} isOffline={isOffline} onSignOut={signOut}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.pageHeader}>
          <SectionHeading testID="barber-dashboard-heading" eyebrow="Minha operação" title={`Olá, ${saudacaoProfissional}.`} description="Seu dia organizado para você manter o ritmo entre um cliente e outro." />
          <View style={styles.headerActions}>
            <StatusBadge testID="barber-sync-status" label={isOffline ? 'Sem internet' : 'Tempo real'} tone={isOffline ? 'danger' : 'success'} />
            <AppButton 
              label="Encaixe rápido" 
              testID="barber-quick-booking-button" 
              onPress={() => {
                const today = new Date();
                const currentHour = today.getHours();
                const currentMin = today.getMinutes();
                const nearest = quickTimes.find((slot) => {
                  const [hour, minute] = slot.split(':').map(Number);
                  return hour > currentHour || (hour === currentHour && minute >= currentMin);
                }) || null;
                setQuickOpen(true);
                setQuickName('');
                setQuickService(null);
                setQuickDate(today);
                setQuickTime(nearest);
                setQuickOccupiedTimes([]);
                setQuickReferenceTime(today.getTime());
              }} 
              icon={<Plus color={primaryForeground} size={17} />}
              style={{ backgroundColor: primaryColor, borderColor: primaryColor }}
              foregroundColor={primaryForeground}
            />
          </View>
        </View>

        {!!notice && <InlineNotice testID="barber-action-notice" tone={notice.tone} message={notice.message} />}

        <View style={[styles.metrics, !isWide && styles.metricsStack]}>
          <Metric testID="barber-next-metric" icon={<Clock3 color={primaryColor} size={18} />} label="Próximo atendimento" value={nextAppointment ? formatNextAppointmentValue(nextAppointment.dateTime) : 'Agenda livre'} note={nextAppointment?.clientName || 'Nenhum cliente aguardando'} />
          <Metric testID="barber-completed-metric" icon={<Check color={colors.success} size={18} />} label="Concluídos" value={String(completed.length)} note={`${visibleAppointments.length} horários na agenda`} />
          <Metric testID="barber-commission-metric" icon={<WalletCards color={colors.info} size={18} />} label="Meu ganho no dia" value={currency(commission)} note={`${Math.round((profile?.commission_rate ?? 0.5) * 100)}% de comissão`} />
        </View>

        <View style={styles.agendaHeader}>
          <SectionHeading testID="barber-agenda-heading" eyebrow="Agenda" title="Ritmo do dia" description="Alterne entre seus horários e a visão de toda a equipe." />
          <AppButton label="Atualizar" testID="barber-sync-button" variant="secondary" onPress={handleRefresh} loading={loading} icon={<RefreshCw color={colors.text} size={15} />} style={styles.syncButton} />
        </View>

        <SegmentedControl<Tab> testID="barber-agenda-tabs" value={tab} activeColor={primaryColor} onChange={setTab} options={[{ value: 'mine', label: 'Minha agenda' }, { value: 'team', label: 'Agenda da equipe' }]} />

        <View style={styles.calendarNavContainer}>
          <Pressable 
            testID="barber-calendar-prev"
            hitSlop={hitSlop}
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
            <View style={styles.dateListWide}>
              {dateOptions.map((date) => {
                const id = date.toISOString().split('T')[0];
                const selected = selectedDate.toDateString() === date.toDateString();
                return (
                  <Pressable
                    key={id}
                    testID={`barber-date-${id}`}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedDate(date); }}
                    style={({ pressed }) => [
                      styles.dateCard,
                      styles.dateCardWide,
                      selected && [styles.dateCardSelected, { backgroundColor: primaryColor }],
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text testID={`barber-date-${id}-weekday`} style={[styles.dateWeek, selected && { color: primaryForeground }]}>
                      {date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
                    </Text>
                    <Text testID={`barber-date-${id}-day`} style={[styles.dateDay, selected && { color: primaryForeground }]}>
                      {date.getDate()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateList} style={{ flex: 1 }}>
              {dateOptions.map((date) => {
                const id = date.toISOString().split('T')[0];
                const selected = selectedDate.toDateString() === date.toDateString();
                return (
                  <Pressable
                    key={id}
                    testID={`barber-date-${id}`}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedDate(date); }}
                    style={({ pressed }) => [
                      styles.dateCard,
                      selected && [styles.dateCardSelected, { backgroundColor: primaryColor }],
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text testID={`barber-date-${id}-weekday`} style={[styles.dateWeek, selected && { color: primaryForeground }]}>
                      {date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
                    </Text>
                    <Text testID={`barber-date-${id}-day`} style={[styles.dateDay, selected && { color: primaryForeground }]}>
                      {date.getDate()}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          <Pressable 
            testID="barber-calendar-next"
            hitSlop={hitSlop}
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
              testID="barber-calendar-today"
              hitSlop={hitSlop}
              onPress={() => setSelectedDate(new Date())} 
              style={styles.todayBtn}
            >
              <Text style={styles.todayBtnText}>Hoje</Text>
            </Pressable>
          )}
        </View>

        {loading ? <ActivityIndicator testID="barber-agenda-loading" color={colors.brand} style={styles.loader} /> : (
          <View style={{ gap: 20 }}>
            {/* Timeline Real (Slots de Horários Ativos e Livres) */}
            <View style={styles.appointmentList}>
              {timelineSlots.map((slot) => {
                const slotApps = activeAppointmentsBySlot[slot] || [];
                
                if (slotApps.length > 0) {
                  return slotApps.map((item) => {
                    const status = statusMap[item.status] || { label: item.status, tone: 'warning' as const };
                    return (
                    <AppCard key={item.id} testID={`barber-appointment-${item.id}`} style={styles.appointmentCard}>
                        <View style={styles.timeBox}><Text testID={`barber-appointment-${item.id}-time`} style={[styles.appointmentTime, { color: primaryColor }]}>{time(item.dateTime)}</Text></View>
                        <View style={styles.appointmentCopy}>
                          <View style={styles.appointmentTitleRow}><Text testID={`barber-appointment-${item.id}-client`} style={styles.clientName}>{item.clientName}</Text><StatusBadge testID={`barber-appointment-${item.id}-status`} label={status.label} tone={status.tone} /></View>
                          <Text style={styles.serviceName}>{item.serviceName} · {currency(item.price)}</Text>
                          {item.status === 'cancelled' && !!item.cancellationReason ? (
                            <Text style={styles.cancellationReasonText}>Motivo: {item.cancellationReason}</Text>
                          ) : null}
                          {tab === 'team' && <Text style={styles.barberName}>{item.barberName}</Text>}
                          {cancelCandidateId === item.id ? (
                            <InlineNotice testID={`barber-appointment-${item.id}-cancel-confirmation`} tone="danger" message="Cancelar este atendimento?" action={<View style={styles.confirmActions}><AppButton label="Confirmar" testID={`barber-appointment-${item.id}-cancel-confirm-button`} onPress={() => updateStatus(item.id, 'cancelled')} loading={actionLoadingId === item.id} variant="danger" style={styles.smallButton} /><AppButton label="Voltar" testID={`barber-appointment-${item.id}-cancel-back-button`} onPress={() => setCancelCandidateId(null)} variant="secondary" style={styles.smallButton} /></View>} />
                          ) : (item.status === 'pending' || item.status === 'confirmed') && item.professionalId === profile?.id ? (
                            <View style={styles.appointmentActions}>
                              <AppButton 
                                label="Reagendar" 
                                testID={`barber-appointment-${item.id}-reschedule-button`} 
                                onPress={() => {
                                  setRescheduleItem(item);
                                  setOccupiedTimes([]);
                                  setNewRescheduleDate(new Date(item.dateTime));
                                  setNewRescheduleTime(time(item.dateTime));
                                }} 
                                variant="secondary" 
                                icon={<RefreshCw color={colors.textSecondary} size={13} />} 
                                style={styles.smallButton} 
                              />
                              <AppButton label="Cancelar" testID={`barber-appointment-${item.id}-cancel-button`} onPress={() => setCancelCandidateId(item.id)} variant="danger" icon={<X color={colors.danger} size={14} />} style={styles.smallButton} />
                              <AppButton label={item.status === 'pending' ? 'Confirmar' : 'Concluir'} testID={`barber-appointment-${item.id}-advance-button`} onPress={() => updateStatus(item.id, item.status === 'pending' ? 'confirmed' : 'completed')} loading={actionLoadingId === item.id} icon={<Check color={colors.ink} size={14} />} style={styles.smallButton} />
                            </View>
                          ) : null}
                        </View>
                      </AppCard>
                    );
                  });
                }
                
                // Mostrar slot livre
                return (
                <Pressable
                    key={`free-${slot}`}
                    testID={`barber-free-slot-${slot.replace(':', '-')}`}
                    onPress={() => {
                      setQuickTime(slot);
                      const newDate = new Date(selectedDate);
                      const [h, m] = slot.split(':').map(Number);
                      newDate.setHours(h, m, 0, 0);
                      setQuickDate(newDate);
                      setQuickOccupiedTimes([]);
                      setQuickReferenceTime(new Date().getTime());
                      setQuickOpen(true);
                    }}
                    style={({ pressed }) => [styles.freeSlotCard, pressed && styles.pressed]}
                  >
                    <View style={styles.timeBox}>
                      <Text testID={`barber-free-slot-${slot.replace(':', '-')}-time`} style={styles.freeSlotTime}>{slot}</Text>
                    </View>
                    <View style={styles.freeSlotLine} />
                    <View testID={`barber-free-slot-${slot.replace(':', '-')}-add`} style={styles.freeSlotAdd}><Plus size={14} color={colors.textMuted} /></View>
                  </Pressable>
                );
              })}
            </View>

            {/* Seção final com Concluídos / Cancelados */}
            {inactiveAppointments.length > 0 && (
              <View style={styles.inactiveSection}>
                <Text style={styles.inactiveSectionTitle}>Atendimentos Finalizados ou Cancelados</Text>
                <View style={styles.appointmentList}>
                  {inactiveAppointments.map((item) => {
                    const status = statusMap[item.status] || { label: item.status, tone: 'warning' as const };
                    return (
                      <View key={item.id} testID={`barber-history-${item.id}`} style={styles.historyRow}>
                        <View style={styles.timeBox}><Text testID={`barber-appointment-${item.id}-time`} style={[styles.appointmentTime, { color: primaryColor }]}>{time(item.dateTime)}</Text></View>
                        <View style={styles.appointmentCopy}>
                          <View style={styles.appointmentTitleRow}><Text testID={`barber-appointment-${item.id}-client`} style={styles.clientName}>{item.clientName}</Text><StatusBadge testID={`barber-appointment-${item.id}-status`} label={status.label} tone={status.tone} /></View>
                          <Text style={styles.serviceName}>{item.serviceName} · {currency(item.price)}</Text>
                          {item.status === 'cancelled' && !!item.cancellationReason ? (
                            <Text style={styles.cancellationReasonText}>Motivo: {item.cancellationReason}</Text>
                          ) : null}
                          {tab === 'team' && <Text style={styles.barberName}>{item.barberName}</Text>}
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <Modal visible={quickOpen} transparent animationType="fade" onRequestClose={() => setQuickOpen(false)}>
        <KeyboardAvoidingView testID="barber-quick-booking-modal" style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <AppCard testID="barber-quick-booking-card" style={styles.modalCard} elevated>
            <View style={styles.modalHeader}><View><Text testID="barber-quick-booking-eyebrow" style={[styles.modalEyebrow, { color: primaryColor }]}>ENCAIXE RÁPIDO</Text><Text testID="barber-quick-booking-title" style={styles.modalTitle}>Reservar um horário</Text></View><Pressable hitSlop={hitSlop} testID="barber-quick-booking-close-button" onPress={() => setQuickOpen(false)} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}><X color={colors.textSecondary} size={18} /></Pressable></View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
              <AppInput label="Nome do cliente" testID="barber-quick-client-input" icon={<UserRound color={colors.textMuted} size={17} />} value={quickName} onChangeText={setQuickName} placeholder="Cliente de balcão" />
              <Text testID="barber-quick-date-label" style={styles.fieldLabel}>Selecione o dia</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateList}>
                {dateOptions.map((date) => {
                  const id = date.toISOString().split('T')[0];
                  const selected = quickDate.toDateString() === date.toDateString();
                  return (
                    <Pressable 
                      key={id} 
                      testID={`barber-quick-date-${id}`}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setQuickDate(date); setQuickTime(null); setQuickOccupiedTimes([]); }}
                      style={({ pressed }) => [styles.dateCard, selected && styles.dateCardSelected, selected && { backgroundColor: primaryColor }, pressed && styles.pressed]}
                    >
                      <Text testID={`barber-quick-date-${id}-weekday`} style={[styles.dateWeek, selected && { color: primaryForeground }]}>
                        {date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
                      </Text>
                      <Text testID={`barber-quick-date-${id}-day`} style={[styles.dateDay, selected && { color: primaryForeground }]}>
                        {date.getDate()}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Text testID="barber-quick-service-label" style={styles.fieldLabel}>Serviço</Text>
              <View style={styles.choiceGrid}>{services.map((service) => <ChoiceCard key={service.id} testID={`barber-quick-service-${service.id}`} title={service.name} subtitle={`${service.durationMinutes} min`} meta={currency(service.price)} selected={quickService === service.id} activeColor={primaryColor} activeForegroundColor={primaryForeground} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setQuickService(service.id); setQuickTime(null); }} icon={<Scissors color={colors.textSecondary} size={15} />} style={styles.choiceCard} />)}</View>
              <Text testID="barber-quick-time-label" style={styles.fieldLabel}>Horário em {quickDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</Text>
              <View style={styles.timeGrid}>
                {quickTimes.map((slot) => {
                  const slotDate = new Date(quickDate);
                  const [slotHour, slotMinute] = slot.split(':').map(Number);
                  slotDate.setHours(slotHour, slotMinute, 0, 0);
                  const isOccupied = visibleQuickOccupiedTimes.includes(slot) || slotDate.getTime() < quickReferenceTime;
                  return (
                    <Pressable 
                      key={slot} 
                      testID={`barber-quick-time-${slot.replace(':', '-')}`} 
                      disabled={isOccupied}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setQuickTime(slot); }}
                      style={({ pressed }) => [
                        styles.timeSlot, 
                        quickTime === slot && styles.timeSlotSelected,
                        quickTime === slot && { backgroundColor: primaryColor, borderColor: primaryColor },
                        isOccupied && styles.timeSlotOccupied,
                        pressed && styles.pressed
                      ]}
                    >
                      <Text testID={`barber-quick-time-${slot.replace(':', '-')}-label`} style={[
                        styles.timeSlotText, 
                        quickTime === slot && { color: primaryForeground },
                        isOccupied && styles.timeSlotTextOccupied
                      ]}>
                        {slot}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <AppButton label="Criar encaixe" testID="barber-quick-submit-button" onPress={createQuickBooking} loading={quickLoading} fullWidth icon={<Plus color={primaryForeground} size={16} />} foregroundColor={primaryForeground} style={{ backgroundColor: primaryColor, borderColor: primaryColor }} />
            </ScrollView>
          </AppCard>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!rescheduleItem} transparent animationType="fade" onRequestClose={() => setRescheduleItem(null)}>
        <View testID="barber-reschedule-modal" style={styles.modalOverlay}>
          <AppCard testID="barber-reschedule-card" style={styles.modalCard} elevated>
            <View style={styles.modalHeader}>
              <View>
                <Text testID="barber-reschedule-eyebrow" style={styles.modalEyebrow}>REAGENDAMENTO</Text>
                <Text testID="barber-reschedule-title" style={styles.modalTitle}>Reagendar atendimento</Text>
              </View>
              <Pressable testID="barber-reschedule-close-button" hitSlop={hitSlop} onPress={() => setRescheduleItem(null)} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
                <X color={colors.textSecondary} size={18} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
              <Text testID="barber-reschedule-summary" style={{ color: colors.textSecondary, fontFamily: typography.body, fontSize: 12 }}>
                Reagendando o cliente <Text style={{ fontFamily: typography.bodyStrong, color: colors.text }}>{rescheduleItem?.clientName}</Text> para o serviço <Text style={{ fontFamily: typography.bodyStrong, color: colors.text }}>{rescheduleItem?.serviceName}</Text>.
              </Text>
              
              <Text testID="barber-reschedule-date-label" style={styles.fieldLabel}>Selecione o novo dia</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateList}>
                {dateOptions.map((date) => {
                  const id = date.toISOString().split('T')[0];
                  const selected = newRescheduleDate.toDateString() === date.toDateString();
                  return (
                    <Pressable 
                      key={id} 
                      testID={`barber-reschedule-date-${id}`}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setNewRescheduleDate(date); setNewRescheduleTime(null); setOccupiedTimes([]); }}
                      style={({ pressed }) => [styles.dateCard, selected && styles.dateCardSelected, selected && { backgroundColor: primaryColor }, pressed && styles.pressed]}
                    >
                      <Text testID={`barber-reschedule-date-${id}-weekday`} style={[styles.dateWeek, selected && { color: primaryForeground }]}>
                        {date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
                      </Text>
                      <Text testID={`barber-reschedule-date-${id}-day`} style={[styles.dateDay, selected && { color: primaryForeground }]}>
                        {date.getDate()}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Text testID="barber-reschedule-time-label" style={styles.fieldLabel}>Selecione o novo horário</Text>
              <View style={styles.timeGrid}>
                {filteredRescheduleTimes.map((slot) => {
                  const isOccupied = visibleOccupiedTimes.includes(slot);
                  return (
                    <Pressable 
                      key={slot} 
                      testID={`barber-reschedule-time-${slot.replace(':', '-')}`}
                      disabled={isOccupied}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setNewRescheduleTime(slot); }}
                      style={({ pressed }) => [
                        styles.timeSlot, 
                        newRescheduleTime === slot && styles.timeSlotSelected,
                        newRescheduleTime === slot && { backgroundColor: primaryColor, borderColor: primaryColor },
                        isOccupied && styles.timeSlotOccupied,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text testID={`barber-reschedule-time-${slot.replace(':', '-')}-label`} style={[
                        styles.timeSlotText, 
                        newRescheduleTime === slot && { color: primaryForeground },
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
                icon={<RefreshCw color={colors.ink} size={16} />} 
              />
            </ScrollView>
          </AppCard>
        </View>
      </Modal>
    </ProfessionalShell>
  );
};

const Metric = ({ icon, label, value, note, testID }: { icon: React.ReactNode; label: string; value: string; note: string; testID: string }) => <AppCard testID={testID} style={styles.metric}><View style={styles.metricTop}>{icon}<Text testID={`${testID}-label`} style={styles.metricLabel}>{label}</Text></View><Text testID={`${testID}-value`} style={styles.metricValue}>{value}</Text><Text testID={`${testID}-note`} style={styles.metricNote}>{note}</Text></AppCard>;

const styles = StyleSheet.create({
  scroll: { width: '100%', maxWidth: layout.contentMax, alignSelf: 'center', padding: 20, paddingTop: 30, paddingBottom: 70 },
  pageHeader: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 18 },
  headerActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 9 },
  metrics: { flexDirection: 'row', gap: 12, marginTop: 28 },
  metricsStack: { flexDirection: 'column' },
  metric: { flex: 1, minWidth: 190, borderWidth: 0.5, borderColor: '#E5E7EB66', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.025, shadowRadius: 22, elevation: 1 },
  metricTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metricLabel: { color: colors.textMuted, fontFamily: typography.bodyStrong, fontSize: 9, letterSpacing: 1.25, textTransform: 'uppercase' },
  metricValue: { color: '#171717', fontFamily: typography.display, fontSize: 24, letterSpacing: -1, marginTop: 17 },
  metricNote: { color: colors.textMuted, fontFamily: typography.body, fontSize: 9, marginTop: 4 },
  agendaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 14, marginTop: 42, marginBottom: 17 },
  syncButton: { minHeight: 40, paddingVertical: 8 },
  dateList: { gap: 8, paddingVertical: 14 },
  dateListWide: { flex: 1, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingVertical: 14, gap: 8 },
  dateCard: { width: 62, alignItems: 'center', paddingVertical: 10, backgroundColor: 'transparent', borderWidth: 0, borderRadius: radii.md },
  dateCardWide: { flex: 1, maxWidth: 120 },
  dateCardSelected: { backgroundColor: colors.brand, borderColor: colors.brand },
  dateWeek: { color: colors.textMuted, fontFamily: typography.bodyStrong, fontSize: 9, textTransform: 'uppercase' },
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
  serviceName: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 10, marginTop: 5 },
  barberName: { color: colors.info, fontFamily: typography.bodyStrong, fontSize: 9, marginTop: 5 },
  appointmentActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 },
  confirmActions: { gap: 6 },
  smallButton: { minHeight: 36, paddingVertical: 7, paddingHorizontal: 11 },
  pressed: { transform: [{ scale: 0.97 }] },
  modalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000000C9', padding: 18 },
  modalCard: { width: '100%', maxWidth: 640, maxHeight: '90%', padding: 0, overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalEyebrow: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 8, letterSpacing: 1.6 },
  modalTitle: { color: colors.text, fontFamily: typography.display, fontSize: 20, letterSpacing: -0.6, marginTop: 5 },
  closeButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfacePressed, borderRadius: radii.md },
  modalContent: { padding: 20, gap: 15 },
  fieldLabel: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8 },
  choiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choiceCard: { width: '47%', minWidth: 150, flexGrow: 1 },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-start' },
  timeSlot: { width: '23%', height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md },
  timeSlotSelected: { backgroundColor: colors.brand, borderColor: colors.brand },
  timeSlotText: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 10 },
  cancellationReasonText: { color: colors.danger, fontSize: 10, marginTop: 4, fontFamily: typography.bodyStrong },
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
    fontSize: 10,
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
});