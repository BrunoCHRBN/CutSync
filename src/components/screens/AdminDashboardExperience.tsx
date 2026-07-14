import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Q } from '@nozbe/watermelondb';
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
} from 'lucide-react-native';
import { database } from '../../database';
import { Appointment, Barbershop, Profile, Service } from '../../database/models';
import { useAuth } from '../../contexts/AuthContext';
import { useSync } from '../../hooks/useSync';
import { sendWhatsAppMessage } from '../../services/whatsapp';
import { AdminShell } from '../layout/AdminShell';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';
import { SectionHeading } from '../ui/SectionHeading';
import { StatusBadge } from '../ui/StatusBadge';
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
  barberId: string;
  cancellationReason?: string;
}

const statusConfig: Record<string, { label: string; tone: 'warning' | 'info' | 'success' | 'danger' }> = {
  pending: { label: 'Pendente', tone: 'warning' },
  confirmed: { label: 'Confirmado', tone: 'info' },
  completed: { label: 'Concluído', tone: 'success' },
  cancelled: { label: 'Cancelado', tone: 'danger' },
};

const quickTimes = ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00'];

export const AdminDashboardExperience = () => {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = width >= layout.desktopBreakpoint;
  const isTablet = width >= layout.mobileBreakpoint;
  const { profile, signOut } = useAuth();
  const { isSyncing, syncError, sync } = useSync();
  
  const [barbershop, setBarbershop] = useState<Barbershop | null>(null);
  const [appointments, setAppointments] = useState<RichAppointment[]>([]);
  const [barbers, setBarbers] = useState<Profile[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
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

  const dateOptions = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const offset = index - 3;
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return {
      id: date.toISOString().split('T')[0],
      date,
      weekDay: offset === 0 ? 'Hoje' : date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
      day: date.getDate(),
    };
  }), []);

  useEffect(() => {
    if (!profile?.barbershop_id) {
      setLoading(false);
      return;
    }

    const shopSub = database.collections.get<Barbershop>('barbershops')
      .findAndObserve(profile.barbershop_id)
      .subscribe({ next: setBarbershop, error: () => setLoading(false) });

    const teamSub = database.collections.get<Profile>('profiles')
      .query(Q.where('barbershop_id', profile.barbershop_id), Q.where('role', Q.oneOf(['barber', 'admin'])))
      .observe()
      .subscribe(setBarbers);

    const servicesSub = database.collections.get<Service>('services')
      .query(Q.where('barbershop_id', profile.barbershop_id), Q.where('is_active', true))
      .observe()
      .subscribe(setServices);

    return () => {
      shopSub.unsubscribe();
      teamSub.unsubscribe();
      servicesSub.unsubscribe();
    };
  }, [profile]);

  useEffect(() => {
    if (!profile?.barbershop_id) return;

    // Calcular a janela de data baseado no período selecionado
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

    const sub = database.collections.get<Appointment>('appointments')
      .query(
        Q.where('barbershop_id', profile.barbershop_id),
        Q.where('date_time', Q.between(start.getTime(), end.getTime())),
      )
      .observe()
      .subscribe(async (items) => {
        const rich = await Promise.all(items.map(async (item) => {
          let clientName = item.clientName || 'Cliente sem cadastro';
          let clientPhone = '';
          let serviceName = 'Serviço indisponível';
          let price = 0;
          if (item.clientId) {
            try {
              const cl = await database.collections.get<Profile>('profiles').find(item.clientId);
              clientName = cl.name;
              clientPhone = cl.phone || '';
            } catch {}
          }
          try {
            const service = await database.collections.get<Service>('services').find(item.serviceId);
            serviceName = service.name;
            price = service.price;
          } catch {}
          return { id: item.id, dateTime: item.dateTime, status: item.status, clientName, clientPhone, serviceName, price, barberId: item.barberId, cancellationReason: item.cancellationReason || '' };
        }));
        setAppointments(rich.sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime()));
        setLoading(false);
      });

    return () => sub.unsubscribe();
  }, [profile, selectedDate, period]);

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
      const appointment = await database.collections.get<Appointment>('appointments').find(id);
      
      if (status === 'completed' && appointment.dateTime.getTime() > Date.now()) {
        const msg = 'Não é possível concluir um agendamento no futuro.';
        if (Platform.OS === 'web') {
          window.alert(msg);
        } else {
          Alert.alert('Atenção', msg);
        }
        setActionLoadingId(null);
        return;
      }

      await database.write(async () => {
        await appointment.update((record) => { 
          record.status = status; 
          if (status === 'cancelled') {
            record.cancellationReason = reason;
            record.cancelledByRole = 'admin';
          }
        });
      });
      sync();
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
    const dateTime = new Date(selectedDate);
    const [hours, minutes] = quickTime.split(':').map(Number);
    dateTime.setHours(hours, minutes, 0, 0);
    const service = services.find((item) => item.id === quickService);
    const end = dateTime.getTime() + (service?.durationMinutes || 30) * 60 * 1000;
    
    const conflict = appointments.some((item) => {
      if (item.barberId !== quickBarber || item.status === 'cancelled') return false;
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
      await database.write(async () => {
        await database.collections.get('appointments').create((record: any) => {
          record.barbershopId = barbershop.id;
          record.barberId = quickBarber;
          record.clientName = quickName.trim();
          record.serviceId = quickService;
          record.dateTime = dateTime;
          record.status = 'confirmed';
        });
      });
      setQuickOpen(false); 
      setQuickName(''); 
      setQuickService(null); 
      setQuickBarber(null); 
      setQuickTime(null);
      sync();
    } catch {
      const msg = 'Não foi possível criar o encaixe.';
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
    { key: 'revenue', label: period === 'today' ? 'Faturamento do dia' : period === 'week' ? 'Faturamento da semana' : 'Faturamento do mês', value: currency(revenue), note: `${periodCompleted.length} atendimentos concluídos`, Icon: Banknote, tone: colors.success },
    { key: 'occupancy', label: 'Ocupação estimada', value: `${occupancy}%`, note: `${periodActive.length} horários no período`, Icon: TrendingUp, tone: colors.brand },
    { key: 'team', label: 'Equipe em agenda', value: String(barbers.length), note: 'profissionais disponíveis', Icon: Users, tone: colors.info },
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
          {item.status === 'cancelled' && !!item.cancellationReason && (
            <Text style={styles.cancellationReasonText}>Motivo: {item.cancellationReason}</Text>
          )}
          <View style={styles.professionalRow}>
            <UserRound color={colors.textMuted} size={13} />
            <Text style={styles.professionalName}>{barberName(item.barberId)}</Text>
          </View>
          {!isFinished && (
            <View style={styles.rowActions}>
              {!!item.clientPhone && (
                <AppButton 
                  label="WhatsApp" 
                  onPress={() => {
                    const text = `Olá, ${item.clientName}! Confirmando o seu agendamento de ${item.serviceName} no CutSync para as ${time(item.dateTime)} com o profissional ${barberName(item.barberId)}.`;
                    sendWhatsAppMessage(item.clientPhone, text);
                  }}
                  variant="secondary"
                  icon={<MessageSquare color={colors.brand} size={14} />}
                  style={styles.compactButton}
                />
              )}
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
                icon={<Check color={colors.ink} size={15} />}
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
            onPress={() => setQuickOpen(true)}
            icon={<Plus color={colors.ink} size={17} />}
            style={{ backgroundColor: colors.brand, borderColor: colors.brand }}
          />
        </View>
      </View>

      <View testID="admin-metrics-grid" style={[styles.metrics, !isTablet && styles.metricsMobile]}>
        {metrics.map(({ key, label, value, note, Icon, tone }) => (
          <AppCard key={key} testID={`admin-metric-${key}`} style={styles.metricCard}>
            <View style={styles.metricTop}>
              <Text style={styles.metricLabel}>{label}</Text>
              <View style={[styles.metricIcon, { backgroundColor: `${tone}1A` }]}><Icon color={tone} size={18} /></View>
            </View>
            <Text testID={`admin-metric-${key}-value`} style={styles.metricValue}>{value}</Text>
            <Text style={styles.metricNote}>{note}</Text>
          </AppCard>
        ))}
      </View>

      <View testID="admin-quick-actions" style={styles.quickActions}>
        <Pressable testID="admin-open-services-button" onPress={() => router.push('/(admin)/services')} style={styles.quickAction}>
          <Scissors color={colors.brand} size={18} />
          <Text style={styles.quickActionText}>Gerenciar serviços</Text>
          <ArrowUpRight color={colors.textMuted} size={15} />
        </Pressable>
        <Pressable testID="admin-open-team-button" onPress={() => router.push('/(admin)/barbers')} style={styles.quickAction}>
          <Users color={colors.info} size={18} />
          <Text style={styles.quickActionText}>Ver equipe</Text>
          <ArrowUpRight color={colors.textMuted} size={15} />
        </Pressable>
      </View>

      <View style={styles.dateHeader}>
        <SectionHeading testID="admin-agenda-heading" eyebrow="Agenda" title="Ritmo do dia" description="Selecione uma data para acompanhar todos os profissionais." />
        <CalendarDays color={colors.textMuted} size={22} />
      </View>

      <View testID="admin-date-selector" style={styles.dateSelector}>
        {dateOptions.map((item) => {
          const selected = selectedDate.toDateString() === item.date.toDateString();
          return (
            <Pressable
              key={item.id}
              testID={`admin-date-${item.id}`}
              onPress={() => setSelectedDate(item.date)}
              style={({ pressed }) => [styles.dateItem, selected && styles.dateItemSelected, pressed && styles.pressed]}
            >
              <Text style={[styles.dateWeek, selected && styles.dateTextSelected]}>{item.weekDay}</Text>
              <Text style={[styles.dateDay, selected && styles.dateTextSelected]}>{item.day}</Text>
            </Pressable>
          );
        })}
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
            <ActivityIndicator testID="admin-appointments-loading" color={colors.brand} style={styles.loader} />
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
            <View style={styles.periodTabs}>
              <Pressable onPress={() => setPeriod('today')} style={[styles.periodTab, period === 'today' && styles.periodTabActive]}><Text style={[styles.periodTabText, period === 'today' && styles.periodTabActiveText]}>Hoje</Text></Pressable>
              <Pressable onPress={() => setPeriod('week')} style={[styles.periodTab, period === 'week' && styles.periodTabActive]}><Text style={[styles.periodTabText, period === 'week' && styles.periodTabActiveText]}>Semana</Text></Pressable>
              <Pressable onPress={() => setPeriod('month')} style={[styles.periodTab, period === 'month' && styles.periodTabActive]}><Text style={[styles.periodTabText, period === 'month' && styles.periodTabActiveText]}>Mês</Text></Pressable>
            </View>
          </View>

          <View style={styles.teamList}>
            {barbers.map((barber) => {
              const barberAppointments = periodCompleted.filter((item) => item.barberId === barber.id);
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
                    onPress={() => { setQuickBarber(barber.id); setQuickTime(null); }} 
                    icon={<UserRound color={colors.textSecondary} size={15} />} 
                    style={styles.choiceCard} 
                  />
                ))}
              </View>

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

              <Text style={styles.fieldLabel}>Horário em {selectedDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</Text>
              <View style={styles.timeGrid}>
                {quickTimes.map((slot) => (
                  <Pressable 
                    key={slot} 
                    testID={`admin-quick-time-${slot.replace(':', '-')}`} 
                    onPress={() => setQuickTime(slot)} 
                    style={({ pressed }) => [styles.timeSlot, quickTime === slot && styles.timeSlotSelected, pressed && styles.pressed]}
                  >
                    <Text style={[styles.timeSlotText, quickTime === slot && styles.selectedInk]}>{slot}</Text>
                  </Pressable>
                ))}
              </View>

              <AppButton 
                label="Criar agendamento" 
                testID="admin-quick-submit-button" 
                onPress={createQuickBooking} 
                loading={quickLoading} 
                fullWidth 
                icon={<Plus color={colors.ink} size={16} />} 
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
  metricIcon: { width: 36, height: 36, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  metricValue: { color: colors.text, fontFamily: typography.display, fontSize: 27, letterSpacing: -1, marginTop: 18 },
  metricNote: { color: colors.textMuted, fontFamily: typography.body, fontSize: 10, marginTop: 5 },
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  quickAction: { flex: 1, minWidth: 190, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: 13 },
  quickActionText: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 11, flex: 1 },
  dateHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 42 },
  dateSelector: { flexDirection: 'row', gap: 8, marginTop: 18, overflow: 'hidden' },
  dateItem: { flex: 1, minWidth: 48, maxWidth: 76, alignItems: 'center', justifyContent: 'center', paddingVertical: 11, backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border },
  dateItemSelected: { backgroundColor: colors.brand, borderColor: colors.brand },
  dateWeek: { color: colors.textMuted, fontFamily: typography.bodyStrong, fontSize: 9, textTransform: 'uppercase' },
  dateDay: { color: colors.text, fontFamily: typography.display, fontSize: 17, marginTop: 3 },
  dateTextSelected: { color: colors.ink },
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
  appointmentTime: { color: colors.brand, fontFamily: typography.display, fontSize: 15 },
  timeFinished: { color: colors.textMuted },
  timelineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.brand, marginTop: 10, marginLeft: 4 },
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
  avatar: { width: 35, height: 35, borderRadius: radii.md, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.brand, fontFamily: typography.display, fontSize: 13 },
  teamCopy: { flex: 1 },
  teamName: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 11 },
  teamMeta: { color: colors.textMuted, fontFamily: typography.body, fontSize: 9, marginTop: 3 },
  teamValue: { alignItems: 'flex-end' },
  teamGross: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 10 },
  teamCommission: { color: colors.brand, fontFamily: typography.body, fontSize: 9, marginTop: 3 },
  // Modal de Encaixe Estilos
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 15, 18, 0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 520, maxHeight: '90%', padding: 0 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalEyebrow: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 8, letterSpacing: 1.5, textTransform: 'uppercase' },
  modalTitle: { color: colors.text, fontFamily: typography.display, fontSize: 18, marginTop: 4 },
  closeButton: { padding: 4, borderRadius: radii.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  modalContent: { padding: 20, gap: 16 },
  fieldLabel: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 11, marginTop: 4 },
  choiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choiceCard: { flex: 1, minWidth: 140 },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  timeSlot: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  timeSlotSelected: { backgroundColor: colors.brand, borderColor: colors.brand },
  timeSlotText: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 11 },
  selectedInk: { color: colors.ink },
  // Filtro de Período Estilos
  performanceCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border, flexWrap: 'wrap', gap: 12 },
  periodTabs: { flexDirection: 'row', backgroundColor: colors.canvas, borderRadius: radii.md, padding: 3, gap: 2, borderWidth: 1, borderColor: colors.border },
  periodTab: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.sm },
  periodTabActive: { backgroundColor: colors.brand },
  periodTabText: { color: colors.textMuted, fontSize: 10, fontFamily: typography.bodyStrong },
  periodTabActiveText: { color: colors.ink },
  cancellationReasonText: { color: colors.danger, fontSize: 10, marginTop: 4, fontFamily: typography.bodyStrong },
});