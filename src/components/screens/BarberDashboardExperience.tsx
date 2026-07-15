import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, Platform, Alert } from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { CalendarDays, Check, Clock3, MessageSquare, Plus, RefreshCw, Scissors, UserRound, WalletCards, X, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { database } from '../../database';
import { Appointment, Barbershop, Profile, Service } from '../../database/models';
import { useAuth } from '../../contexts/AuthContext';
import { useSync } from '../../hooks/useSync';
import { sendWhatsAppMessage } from '../../services/whatsapp';
import { ProfessionalShell } from '../layout/ProfessionalShell';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';
import { AppInput } from '../ui/AppInput';
import { ChoiceCard } from '../ui/ChoiceCard';
import { EmptyState } from '../ui/EmptyState';
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
  clientPhone: string;
  serviceName: string;
  price: number;
  dateTime: Date;
  status: string;
  cancellationReason?: string;
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

export const BarberDashboardExperience = () => {
  const { width } = useWindowDimensions();
  const isWide = width >= layout.desktopBreakpoint;
  const { profile, signOut } = useAuth();
  const { isSyncing, syncError, isOffline, sync } = useSync();
  const [barbershop, setBarbershop] = useState<Barbershop | null>(null);
  const [appointments, setAppointments] = useState<RichAppointment[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [tab, setTab] = useState<Tab>('mine');
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [cancelCandidateId, setCancelCandidateId] = useState<string | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickService, setQuickService] = useState<string | null>(null);
  const [quickTime, setQuickTime] = useState<string | null>(null);
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickDate, setQuickDate] = useState<Date>(new Date());
  const [quickOccupiedTimes, setQuickOccupiedTimes] = useState<string[]>([]);

  // Estados locais para Reagendamento
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
    if (!profile?.establishment_id) { setLoading(false); return; }
    const shopSub = database.collections
      .get<Barbershop>('establishments')
      .findAndObserve(profile.establishment_id)
      .subscribe({
        next: (data) => setBarbershop(data),
        error: () => console.log('Barbershop not found locally yet in barber dashboard'),
      });
    const serviceSub = database.collections.get<Service>('services').query(Q.where('establishment_id', profile.establishment_id), Q.where('is_active', true)).observe().subscribe(setServices);
    return () => { shopSub.unsubscribe(); serviceSub.unsubscribe(); };
  }, [profile]);

  useEffect(() => {
    if (!profile?.establishment_id) return;
    const start = new Date(selectedDate); start.setHours(0, 0, 0, 0);
    const end = new Date(selectedDate); end.setHours(23, 59, 59, 999);
    const sub = database.collections.get<Appointment>('appointments').query(
      Q.where('establishment_id', profile.establishment_id),
      Q.where('date_time', Q.between(start.getTime(), end.getTime())),
    ).observe().subscribe(async (items) => {
      const rich = await Promise.all(items.map(async (appointment) => {
        let clientName = appointment.clientName || 'Cliente sem cadastro';
        let clientPhone = '';
        let serviceName = 'Serviço indisponível';
        let price = 0;
        let barberName = 'Profissional';
        if (appointment.clientId) {
          try {
            const cl = await database.collections.get<Profile>('profiles').find(appointment.clientId);
            clientName = cl.name;
            clientPhone = cl.phone || '';
          } catch {}
        }
        try { const service = await database.collections.get<Service>('services').find(appointment.serviceId); serviceName = service.name; price = service.price; } catch {}
        try { barberName = (await database.collections.get<Profile>('profiles').find(appointment.professionalId)).name; } catch {}
        return { id: appointment.id, professionalId: appointment.professionalId, barberName, clientName, clientPhone, serviceName, price, dateTime: appointment.dateTime, status: appointment.status, cancellationReason: appointment.cancellationReason || '' };
      }));
      setAppointments(rich.sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime()));
      setLoading(false);
    });
    return () => sub.unsubscribe();
  }, [profile, selectedDate]);

  useEffect(() => {
    if (!profile?.id) return;
    const now = Date.now();
    const query = database.collections.get<Appointment>('appointments').query(
      Q.where('professional_id', profile.id),
      Q.where('status', Q.oneOf(['pending', 'confirmed'])),
      Q.where('date_time', Q.gte(now)),
      Q.sortBy('date_time', Q.asc),
      Q.take(1)
    );
    const sub = query.observe().subscribe(async (items) => {
      if (items.length === 0) {
        setNextAppointment(null);
        return;
      }
      const appointment = items[0];
      let clientName = appointment.clientName || 'Cliente sem cadastro';
      let clientPhone = '';
      let serviceName = 'Serviço indisponível';
      let price = 0;
      let barberName = 'Profissional';
      if (appointment.clientId) {
        try {
          const cl = await database.collections.get<Profile>('profiles').find(appointment.clientId);
          clientName = cl.name;
          clientPhone = cl.phone || '';
        } catch {}
      }
      try {
        const service = await database.collections.get<Service>('services').find(appointment.serviceId);
        serviceName = service.name;
        price = service.price;
      } catch {}
      try {
        barberName = (await database.collections.get<Profile>('profiles').find(appointment.professionalId)).name;
      } catch {}
      setNextAppointment({
        id: appointment.id,
        professionalId: appointment.professionalId,
        barberName,
        clientName,
        clientPhone,
        serviceName,
        price,
        dateTime: appointment.dateTime,
        status: appointment.status,
        cancellationReason: appointment.cancellationReason || ''
      });
    });
    return () => sub.unsubscribe();
  }, [profile, appointments]);

  useEffect(() => {
    if (!rescheduleItem || !newRescheduleDate) {
      setOccupiedTimes([]);
      return;
    }
    const startOfDay = new Date(newRescheduleDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(newRescheduleDate);
    endOfDay.setHours(23, 59, 59, 999);

    database.collections.get<Appointment>('appointments')
      .query(
        Q.where('professional_id', rescheduleItem.professionalId),
        Q.where('status', Q.notEq('cancelled')),
        Q.where('date_time', Q.between(startOfDay.getTime(), endOfDay.getTime())),
        Q.where('id', Q.notEq(rescheduleItem.id))
      )
      .fetch()
      .then((items) => {
        const times = items.map(item => {
          return item.dateTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        });
        setOccupiedTimes(times);
      })
      .catch(() => setOccupiedTimes([]));
  }, [rescheduleItem, newRescheduleDate]);

  useEffect(() => {
    if (quickOpen) {
      const today = new Date();
      setQuickDate(today);
      
      const currentHour = today.getHours();
      const currentMin = today.getMinutes();
      const todaySlots = quickTimes.filter(slot => {
        const [h, m] = slot.split(':').map(Number);
        return h > currentHour || (h === currentHour && m >= currentMin);
      });
      
      const nearest = todaySlots.length > 0 ? todaySlots[0] : null;
      setQuickTime(nearest);
    }
  }, [quickOpen]);

  useEffect(() => {
    if (!quickOpen || !profile?.id || !quickDate) {
      setQuickOccupiedTimes([]);
      return;
    }
    const startOfDay = new Date(quickDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(quickDate);
    endOfDay.setHours(23, 59, 59, 999);

    database.collections.get<Appointment>('appointments')
      .query(
        Q.where('professional_id', profile.id),
        Q.where('status', Q.notEq('cancelled')),
        Q.where('date_time', Q.between(startOfDay.getTime(), endOfDay.getTime()))
      )
      .fetch()
      .then((items) => {
        const times = items.map(item => {
          return item.dateTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        });
        setQuickOccupiedTimes(times);
      })
      .catch(() => setQuickOccupiedTimes([]));
  }, [quickOpen, profile, quickDate]);

  const visibleAppointments = tab === 'mine' ? appointments.filter((item) => item.professionalId === profile?.id) : appointments;
  const completed = visibleAppointments.filter((item) => item.status === 'completed');
  const revenue = completed.reduce((sum, item) => sum + item.price, 0);
  const commission = revenue * (profile?.commission_rate ?? 0.5);
  const currency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: barbershop?.currency || 'BRL' }).format(value);
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


  // expediente padrão
  const defaultSchedule = [
    { day: 1, name: 'Segunda-feira', isOpen: true, open: '09:00', close: '20:00' },
    { day: 2, name: 'Terça-feira', isOpen: true, open: '09:00', close: '20:00' },
    { day: 3, name: 'Quarta-feira', isOpen: true, open: '09:00', close: '20:00' },
    { day: 4, name: 'Quinta-feira', isOpen: true, open: '09:00', close: '20:00' },
    { day: 5, name: 'Sexta-feira', isOpen: true, open: '09:00', close: '20:00' },
    { day: 6, name: 'Sábado', isOpen: true, open: '09:00', close: '20:00' },
    { day: 0, name: 'Domingo', isOpen: false, open: '09:00', close: '18:00' },
  ];

  const timeSlots = useMemo(() => {
    const dayOfWeek = selectedDate.getDay();
    let schedule = defaultSchedule.find(s => s.day === dayOfWeek);
    if (profile?.work_hours) {
      try {
        const parsed = JSON.parse(profile.work_hours);
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
  }, [selectedDate, profile?.work_hours]);

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

  const filteredQuickTimes = useMemo(() => {
    const isToday = quickDate.toDateString() === new Date().toDateString();
    if (!isToday) return quickTimes;
    const now = new Date();
    const currentHour = now.getHours();
    const currentMin = now.getMinutes();
    return quickTimes.filter(slot => {
      const [h, m] = slot.split(':').map(Number);
      return h > currentHour || (h === currentHour && m >= currentMin);
    });
  }, [quickDate]);

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
      const appointment = await database.collections.get<Appointment>('appointments').find(id);
      
      if (status === 'completed' && appointment.dateTime.getTime() > Date.now()) {
        setNotice({ tone: 'danger', message: 'Não é possível concluir um agendamento no futuro.' });
        setActionLoadingId(null);
        return;
      }

      await database.write(async () => {
        await appointment.update((record) => { 
          record.status = status; 
          if (status === 'cancelled') {
            record.cancellationReason = reason;
            record.cancelledByRole = 'professional';
          }
        });
      });
      setCancelCandidateId(null);
      setNotice({ tone: 'success', message: 'Status do atendimento atualizado.' });
      sync();
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

      await database.write(async () => {
        const appointment = await database.collections.get<Appointment>('appointments').find(rescheduleItem.id);
        await appointment.update((record) => {
          record.originalDateTime = record.originalDateTime || record.dateTime;
          record.dateTime = newDate;
          record.rescheduleCount = (record.rescheduleCount || 0) + 1;
          record.status = 'confirmed'; // Auto confirma ao reagendar pelo barbeiro
        });
      });
      setRescheduleItem(null);
      setNotice({ tone: 'success', message: 'Atendimento reagendado com sucesso!' });
      sync();
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
      const itemService = services.find((candidate) => candidate.name === item.serviceName);
      const itemEnd = item.dateTime.getTime() + (itemService?.durationMinutes || 30) * 60 * 1000;
      return dateTime.getTime() < itemEnd && end > item.dateTime.getTime();
    });
    if (conflict) {
      setNotice({ tone: 'danger', message: 'Esse horário conflita com outro atendimento.' });
      return;
    }

    setQuickLoading(true);
    try {
      await database.write(async () => {
        await database.collections.get('appointments').create((record: any) => {
          record.establishmentId = profile.establishment_id;
          record.professionalId = profile.id;
          record.clientName = quickName.trim();
          record.serviceId = quickService;
          record.dateTime = dateTime;
          record.status = 'confirmed';
        });
      });
      setQuickOpen(false); setQuickName(''); setQuickService(null); setQuickTime(null);
      setNotice({ tone: 'success', message: 'Encaixe criado e reservado na sua agenda.' });
      sync();
    } catch {
      setNotice({ tone: 'danger', message: 'Não foi possível criar o encaixe.' });
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
            <StatusBadge testID="barber-sync-status" label={syncError ? 'Falha ao sincronizar' : isSyncing ? 'Sincronizando' : 'Sincronizado'} tone={syncError ? 'danger' : isSyncing ? 'warning' : 'success'} />
            <AppButton 
              label="Encaixe rápido" 
              testID="barber-quick-booking-button" 
              onPress={() => {
                setQuickOpen(true);
                setQuickName('');
                setQuickService(null);
              }} 
              icon={<Plus color={colors.ink} size={17} />} 
            />
          </View>
        </View>

        {!!notice && <InlineNotice testID="barber-action-notice" tone={notice.tone} message={notice.message} />}

        <View style={[styles.metrics, !isWide && styles.metricsStack]}>
          <Metric testID="barber-next-metric" icon={<Clock3 color={colors.brand} size={18} />} label="Próximo atendimento" value={nextAppointment ? formatNextAppointmentValue(nextAppointment.dateTime) : 'Agenda livre'} note={nextAppointment?.clientName || 'Nenhum cliente aguardando'} />
          <Metric testID="barber-completed-metric" icon={<Check color={colors.success} size={18} />} label="Concluídos" value={String(completed.length)} note={`${visibleAppointments.length} horários na agenda`} />
          <Metric testID="barber-commission-metric" icon={<WalletCards color={colors.info} size={18} />} label="Meu ganho no dia" value={currency(commission)} note={`${Math.round((profile?.commission_rate ?? 0.5) * 100)}% de comissão`} />
        </View>

        <View style={styles.agendaHeader}>
          <SectionHeading testID="barber-agenda-heading" eyebrow="Agenda" title="Ritmo do dia" description="Alterne entre seus horários e a visão de toda a equipe." />
          <AppButton label="Sincronizar" testID="barber-sync-button" variant="secondary" onPress={sync} loading={isSyncing} icon={<RefreshCw color={colors.text} size={15} />} style={styles.syncButton} />
        </View>

        <SegmentedControl<Tab> testID="barber-agenda-tabs" value={tab} onChange={setTab} options={[{ value: 'mine', label: 'Minha agenda' }, { value: 'team', label: 'Agenda da equipe' }]} />

        <View style={styles.calendarNavContainer}>
          <Pressable 
            testID="barber-calendar-prev"
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
                    onPress={() => setSelectedDate(date)}
                    style={({ pressed }) => [
                      styles.dateCard,
                      styles.dateCardWide,
                      selected && styles.dateCardSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.dateWeek, selected && styles.selectedInk]}>
                      {date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
                    </Text>
                    <Text style={[styles.dateDay, selected && styles.selectedInk]}>
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
                    onPress={() => setSelectedDate(date)}
                    style={({ pressed }) => [
                      styles.dateCard,
                      selected && styles.dateCardSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.dateWeek, selected && styles.selectedInk]}>
                      {date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
                    </Text>
                    <Text style={[styles.dateDay, selected && styles.selectedInk]}>
                      {date.getDate()}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          <Pressable 
            testID="barber-calendar-next"
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
                        <View style={styles.timeBox}><Text testID={`barber-appointment-${item.id}-time`} style={styles.appointmentTime}>{time(item.dateTime)}</Text></View>
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
                              {!!item.clientPhone && (
                                <AppButton 
                                  label="WhatsApp" 
                                  testID={`barber-appointment-${item.id}-whatsapp-button`} 
                                  onPress={() => {
                                    const text = `Olá, ${item.clientName}! Confirmando o seu agendamento de ${item.serviceName} no CutSync para as ${time(item.dateTime)} com o profissional ${item.barberName}.`;
                                    sendWhatsAppMessage(item.clientPhone, text);
                                  }}
                                  variant="secondary"
                                  icon={<MessageSquare color={colors.brand} size={14} />}
                                  style={styles.smallButton}
                                />
                              )}
                              <AppButton 
                                label="Reagendar" 
                                testID={`barber-appointment-${item.id}-reschedule-button`} 
                                onPress={() => {
                                  setRescheduleItem(item);
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
                    onPress={() => {
                      setQuickTime(slot);
                      const newDate = new Date(selectedDate);
                      const [h, m] = slot.split(':').map(Number);
                      newDate.setHours(h, m, 0, 0);
                      setQuickDate(newDate);
                      setQuickOpen(true);
                    }}
                    style={({ pressed }) => [styles.freeSlotCard, pressed && styles.pressed]}
                  >
                    <View style={styles.timeBox}>
                      <Text style={styles.freeSlotTime}>{slot}</Text>
                    </View>
                    <View style={styles.freeSlotCopy}>
                      <Text style={styles.freeSlotLabel}>Horário Livre</Text>
                      <Text style={styles.freeSlotSubLabel}>Horário Livre - Adicionar Encaixe</Text>
                    </View>
                    <Plus size={16} color={colors.textSecondary} style={{ marginRight: 8 }} />
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
                      <AppCard key={item.id} testID={`barber-appointment-${item.id}`} style={[styles.appointmentCard, { opacity: 0.65 }]}>
                        <View style={styles.timeBox}><Text testID={`barber-appointment-${item.id}-time`} style={styles.appointmentTime}>{time(item.dateTime)}</Text></View>
                        <View style={styles.appointmentCopy}>
                          <View style={styles.appointmentTitleRow}><Text testID={`barber-appointment-${item.id}-client`} style={styles.clientName}>{item.clientName}</Text><StatusBadge testID={`barber-appointment-${item.id}-status`} label={status.label} tone={status.tone} /></View>
                          <Text style={styles.serviceName}>{item.serviceName} · {currency(item.price)}</Text>
                          {item.status === 'cancelled' && !!item.cancellationReason ? (
                            <Text style={styles.cancellationReasonText}>Motivo: {item.cancellationReason}</Text>
                          ) : null}
                          {tab === 'team' && <Text style={styles.barberName}>{item.barberName}</Text>}
                        </View>
                      </AppCard>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <Modal visible={quickOpen} transparent animationType="fade" onRequestClose={() => setQuickOpen(false)}>
        <View testID="barber-quick-booking-modal" style={styles.modalOverlay}>
          <AppCard testID="barber-quick-booking-card" style={styles.modalCard} elevated>
            <View style={styles.modalHeader}><View><Text style={styles.modalEyebrow}>ENCAIXE RÁPIDO</Text><Text testID="barber-quick-booking-title" style={styles.modalTitle}>Reservar um horário</Text></View><Pressable testID="barber-quick-booking-close-button" onPress={() => setQuickOpen(false)} style={styles.closeButton}><X color={colors.textSecondary} size={18} /></Pressable></View>
            <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
              <AppInput label="Nome do cliente" testID="barber-quick-client-input" icon={<UserRound color={colors.textMuted} size={17} />} value={quickName} onChangeText={setQuickName} placeholder="Cliente de balcão" />
              <Text style={styles.fieldLabel}>Selecione o Dia</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateList}>
                {dateOptions.map((date) => {
                  const id = date.toISOString().split('T')[0];
                  const selected = quickDate.toDateString() === date.toDateString();
                  return (
                    <Pressable 
                      key={id} 
                      onPress={() => { setQuickDate(date); setQuickTime(null); }} 
                      style={[styles.dateCard, selected && styles.dateCardSelected]}
                    >
                      <Text style={[styles.dateWeek, selected && styles.selectedInk]}>
                        {date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
                      </Text>
                      <Text style={[styles.dateDay, selected && styles.selectedInk]}>
                        {date.getDate()}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Text style={styles.fieldLabel}>Serviço</Text>
              <View style={styles.choiceGrid}>{services.map((service) => <ChoiceCard key={service.id} testID={`barber-quick-service-${service.id}`} title={service.name} subtitle={`${service.durationMinutes} min`} meta={currency(service.price)} selected={quickService === service.id} onPress={() => { setQuickService(service.id); setQuickTime(null); }} icon={<Scissors color={colors.textSecondary} size={15} />} style={styles.choiceCard} />)}</View>
              <Text style={styles.fieldLabel}>Horário em {quickDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</Text>
              <View style={styles.timeGrid}>
                {filteredQuickTimes.map((slot) => {
                  const isOccupied = quickOccupiedTimes.includes(slot);
                  return (
                    <Pressable 
                      key={slot} 
                      testID={`barber-quick-time-${slot.replace(':', '-')}`} 
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
                        quickTime === slot && styles.selectedInk,
                        isOccupied && styles.timeSlotTextOccupied
                      ]}>
                        {slot}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <AppButton label="Criar encaixe" testID="barber-quick-submit-button" onPress={createQuickBooking} loading={quickLoading} fullWidth icon={<Plus color={colors.ink} size={16} />} />
            </ScrollView>
          </AppCard>
        </View>
      </Modal>

      <Modal visible={!!rescheduleItem} transparent animationType="fade" onRequestClose={() => setRescheduleItem(null)}>
        <View style={styles.modalOverlay}>
          <AppCard testID="barber-reschedule-card" style={styles.modalCard} elevated>
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
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateList}>
                {dateOptions.map((date) => {
                  const id = date.toISOString().split('T')[0];
                  const selected = newRescheduleDate.toDateString() === date.toDateString();
                  return (
                    <Pressable 
                      key={id} 
                      onPress={() => { setNewRescheduleDate(date); setNewRescheduleTime(null); }} 
                      style={[styles.dateCard, selected && styles.dateCardSelected]}
                    >
                      <Text style={[styles.dateWeek, selected && styles.selectedInk]}>
                        {date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
                      </Text>
                      <Text style={[styles.dateDay, selected && styles.selectedInk]}>
                        {date.getDate()}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Text style={styles.fieldLabel}>Selecione o novo horário</Text>
              <View style={styles.timeGrid}>
                {filteredRescheduleTimes.map((slot) => {
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
                        newRescheduleTime === slot && styles.selectedInk,
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

const Metric = ({ icon, label, value, note, testID }: { icon: React.ReactNode; label: string; value: string; note: string; testID: string }) => <AppCard testID={testID} style={styles.metric}><View style={styles.metricTop}>{icon}<Text style={styles.metricLabel}>{label}</Text></View><Text testID={`${testID}-value`} style={styles.metricValue}>{value}</Text><Text style={styles.metricNote}>{note}</Text></AppCard>;

const styles = StyleSheet.create({
  scroll: { width: '100%', maxWidth: layout.contentMax, alignSelf: 'center', padding: 20, paddingTop: 30, paddingBottom: 70 },
  pageHeader: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 18 },
  headerActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 9 },
  metrics: { flexDirection: 'row', gap: 12, marginTop: 28 },
  metricsStack: { flexDirection: 'column' },
  metric: { flex: 1, minWidth: 190 },
  metricTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metricLabel: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 10 },
  metricValue: { color: colors.text, fontFamily: typography.display, fontSize: 24, letterSpacing: -0.8, marginTop: 17 },
  metricNote: { color: colors.textMuted, fontFamily: typography.body, fontSize: 9, marginTop: 4 },
  agendaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 14, marginTop: 42, marginBottom: 17 },
  syncButton: { minHeight: 40, paddingVertical: 8 },
  dateList: { gap: 8, paddingVertical: 14 },
  dateListWide: { flex: 1, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingVertical: 14, gap: 8 },
  dateCard: { width: 62, alignItems: 'center', paddingVertical: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md },
  dateCardWide: { flex: 1, maxWidth: 120 },
  dateCardSelected: { backgroundColor: colors.brand, borderColor: colors.brand },
  dateWeek: { color: colors.textMuted, fontFamily: typography.bodyStrong, fontSize: 9, textTransform: 'uppercase' },
  dateDay: { color: colors.text, fontFamily: typography.display, fontSize: 18, marginTop: 4 },
  selectedInk: { color: colors.ink },
  loader: { margin: 50 },
  appointmentList: { gap: 9 },
  appointmentCard: { flexDirection: 'row', gap: 14, padding: 16 },
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
  pressed: { opacity: 0.65, transform: [{ scale: 0.98 }] },
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
    padding: 16,
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: radii.md,
    marginBottom: 9,
    minHeight: 68,
  },
  freeSlotTime: {
    color: colors.textSecondary,
    fontFamily: typography.display,
    fontSize: 15,
  },
  freeSlotCopy: {
    flex: 1,
    paddingLeft: 14,
  },
  freeSlotLabel: {
    color: colors.textSecondary,
    fontFamily: typography.bodyStrong,
    fontSize: 13,
  },
  freeSlotSubLabel: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 10,
    marginTop: 2,
  },
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
});