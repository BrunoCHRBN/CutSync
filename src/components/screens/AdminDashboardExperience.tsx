import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Q } from '@nozbe/watermelondb';
import {
  ArrowUpRight,
  Banknote,
  CalendarDays,
  Check,
  Clock3,
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
import { AdminShell } from '../layout/AdminShell';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';
import { SectionHeading } from '../ui/SectionHeading';
import { StatusBadge } from '../ui/StatusBadge';
import { colors, layout, radii, typography } from '../../theme/tokens';

interface RichAppointment {
  id: string;
  dateTime: Date;
  status: string;
  clientName: string;
  serviceName: string;
  price: number;
  barberId: string;
}

const statusConfig: Record<string, { label: string; tone: 'warning' | 'info' | 'success' | 'danger' }> = {
  pending: { label: 'Pendente', tone: 'warning' },
  confirmed: { label: 'Confirmado', tone: 'info' },
  completed: { label: 'Concluído', tone: 'success' },
  cancelled: { label: 'Cancelado', tone: 'danger' },
};

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
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

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

    return () => {
      shopSub.unsubscribe();
      teamSub.unsubscribe();
    };
  }, [profile]);

  useEffect(() => {
    if (!profile?.barbershop_id) return;
    const start = new Date(selectedDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(selectedDate);
    end.setHours(23, 59, 59, 999);

    const sub = database.collections.get<Appointment>('appointments')
      .query(
        Q.where('barbershop_id', profile.barbershop_id),
        Q.where('date_time', Q.between(start.getTime(), end.getTime())),
      )
      .observe()
      .subscribe(async (items) => {
        const rich = await Promise.all(items.map(async (item) => {
          let clientName = item.clientName || 'Cliente sem cadastro';
          let serviceName = 'Serviço indisponível';
          let price = 0;
          if (item.clientId) {
            try { clientName = (await database.collections.get<Profile>('profiles').find(item.clientId)).name; } catch {}
          }
          try {
            const service = await database.collections.get<Service>('services').find(item.serviceId);
            serviceName = service.name;
            price = service.price;
          } catch {}
          return { id: item.id, dateTime: item.dateTime, status: item.status, clientName, serviceName, price, barberId: item.barberId };
        }));
        setAppointments(rich.sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime()));
        setLoading(false);
      });

    return () => sub.unsubscribe();
  }, [profile, selectedDate]);

  const updateStatus = async (id: string, status: 'confirmed' | 'cancelled' | 'completed') => {
    setActionLoadingId(id);
    try {
      await database.write(async () => {
        const appointment = await database.collections.get<Appointment>('appointments').find(id);
        await appointment.update((record) => { record.status = status; });
      });
      sync();
    } finally {
      setActionLoadingId(null);
    }
  };

  const active = appointments.filter((item) => item.status !== 'cancelled');
  const completed = appointments.filter((item) => item.status === 'completed');
  const revenue = completed.reduce((total, item) => total + item.price, 0);
  const occupancy = Math.min(100, Math.round((active.length / (Math.max(barbers.length, 1) * 12)) * 100));
  const currency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: barbershop?.currency || 'BRL' }).format(value);
  const time = (value: Date) => value.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const barberName = (id: string) => barbers.find((barber) => barber.id === id)?.name || 'Profissional';

  const metrics = [
    { key: 'revenue', label: 'Faturamento do dia', value: currency(revenue), note: `${completed.length} atendimentos concluídos`, Icon: Banknote, tone: colors.success },
    { key: 'occupancy', label: 'Ocupação estimada', value: `${occupancy}%`, note: `${active.length} horários em operação`, Icon: TrendingUp, tone: colors.brand },
    { key: 'team', label: 'Equipe em agenda', value: String(barbers.length), note: 'profissionais disponíveis', Icon: Users, tone: colors.info },
  ];

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
          description="Acompanhe o ritmo da loja e resolva pendências sem perder a visão do dia."
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
              <Text style={styles.panelSubtitle}>{active.length} horários ativos nesta data</Text>
            </View>
            <StatusBadge testID="admin-active-appointments-count" label={`${active.length} ativos`} tone="info" />
          </View>

          {loading ? (
            <ActivityIndicator testID="admin-appointments-loading" color={colors.brand} style={styles.loader} />
          ) : appointments.length === 0 ? (
            <View testID="admin-appointments-empty" style={styles.empty}>
              <Clock3 color={colors.textMuted} size={28} />
              <Text style={styles.emptyTitle}>Agenda livre por aqui</Text>
              <Text style={styles.emptyText}>Nenhum atendimento encontrado para esta data.</Text>
            </View>
          ) : appointments.map((item) => {
            const status = statusConfig[item.status] || { label: item.status, tone: 'warning' as const };
            return (
              <View key={item.id} testID={`admin-appointment-${item.id}`} style={styles.appointmentRow}>
                <View style={styles.timeColumn}>
                  <Text testID={`admin-appointment-${item.id}-time`} style={styles.appointmentTime}>{time(item.dateTime)}</Text>
                  <View style={styles.timelineDot} />
                </View>
                <View style={styles.appointmentCopy}>
                  <View style={styles.appointmentTitleRow}>
                    <Text testID={`admin-appointment-${item.id}-client`} style={styles.clientName}>{item.clientName}</Text>
                    <StatusBadge testID={`admin-appointment-${item.id}-status`} label={status.label} tone={status.tone} />
                  </View>
                  <Text style={styles.serviceName}>{item.serviceName} · {currency(item.price)}</Text>
                  <View style={styles.professionalRow}>
                    <UserRound color={colors.textMuted} size={13} />
                    <Text style={styles.professionalName}>{barberName(item.barberId)}</Text>
                  </View>
                  {(item.status === 'pending' || item.status === 'confirmed') && (
                    <View style={styles.rowActions}>
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
          })}
        </AppCard>

        <AppCard testID="admin-team-performance-panel" style={styles.performancePanel}>
          <Text style={styles.panelTitle}>Desempenho da equipe</Text>
          <Text style={styles.panelSubtitle}>Produção e repasse na data selecionada</Text>
          <View style={styles.teamList}>
            {barbers.map((barber) => {
              const barberAppointments = completed.filter((item) => item.barberId === barber.id);
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
  timeColumn: { width: 70, alignItems: 'flex-start' },
  appointmentTime: { color: colors.brand, fontFamily: typography.display, fontSize: 15 },
  timelineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.brand, marginTop: 10, marginLeft: 4 },
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
});