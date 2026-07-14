import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { CalendarDays, Check, Clock3, Plus, RefreshCw, Scissors, UserRound, WalletCards, X } from 'lucide-react-native';
import { database } from '../../database';
import { Appointment, Barbershop, Profile, Service } from '../../database/models';
import { useAuth } from '../../contexts/AuthContext';
import { useSync } from '../../hooks/useSync';
import { BarberShell } from '../layout/BarberShell';
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
  barberId: string;
  barberName: string;
  clientName: string;
  serviceName: string;
  price: number;
  dateTime: Date;
  status: string;
}

const statusMap: Record<string, { label: string; tone: 'warning' | 'info' | 'success' | 'danger' }> = {
  pending: { label: 'Pendente', tone: 'warning' },
  confirmed: { label: 'Confirmado', tone: 'info' },
  completed: { label: 'Concluído', tone: 'success' },
  cancelled: { label: 'Cancelado', tone: 'danger' },
};

const quickTimes = ['08:00', '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'];

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
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null);

  const dateOptions = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index - 2);
    return date;
  }), []);

  useEffect(() => {
    if (!profile?.barbershop_id) { setLoading(false); return; }
    const shopSub = database.collections.get<Barbershop>('barbershops').findAndObserve(profile.barbershop_id).subscribe(setBarbershop);
    const serviceSub = database.collections.get<Service>('services').query(Q.where('barbershop_id', profile.barbershop_id), Q.where('is_active', true)).observe().subscribe(setServices);
    return () => { shopSub.unsubscribe(); serviceSub.unsubscribe(); };
  }, [profile]);

  useEffect(() => {
    if (!profile?.barbershop_id) return;
    const start = new Date(selectedDate); start.setHours(0, 0, 0, 0);
    const end = new Date(selectedDate); end.setHours(23, 59, 59, 999);
    const sub = database.collections.get<Appointment>('appointments').query(
      Q.where('barbershop_id', profile.barbershop_id),
      Q.where('date_time', Q.between(start.getTime(), end.getTime())),
    ).observe().subscribe(async (items) => {
      const rich = await Promise.all(items.map(async (appointment) => {
        let clientName = appointment.clientName || 'Cliente sem cadastro';
        let serviceName = 'Serviço indisponível';
        let price = 0;
        let barberName = 'Profissional';
        if (appointment.clientId) {
          try { clientName = (await database.collections.get<Profile>('profiles').find(appointment.clientId)).name; } catch {}
        }
        try { const service = await database.collections.get<Service>('services').find(appointment.serviceId); serviceName = service.name; price = service.price; } catch {}
        try { barberName = (await database.collections.get<Profile>('profiles').find(appointment.barberId)).name; } catch {}
        return { id: appointment.id, barberId: appointment.barberId, barberName, clientName, serviceName, price, dateTime: appointment.dateTime, status: appointment.status };
      }));
      setAppointments(rich.sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime()));
      setLoading(false);
    });
    return () => sub.unsubscribe();
  }, [profile, selectedDate]);

  const visibleAppointments = tab === 'mine' ? appointments.filter((item) => item.barberId === profile?.id) : appointments;
  const completed = visibleAppointments.filter((item) => item.status === 'completed');
  const revenue = completed.reduce((sum, item) => sum + item.price, 0);
  const commission = revenue * (profile?.commission_rate ?? 0.5);
  const nextAppointment = visibleAppointments.find((item) => item.status !== 'completed' && item.status !== 'cancelled' && item.dateTime.getTime() >= Date.now());
  const currency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: barbershop?.currency || 'BRL' }).format(value);
  const time = (date: Date) => date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const updateStatus = async (id: string, status: 'confirmed' | 'completed' | 'cancelled') => {
    setActionLoadingId(id);
    try {
      await database.write(async () => {
        const appointment = await database.collections.get<Appointment>('appointments').find(id);
        await appointment.update((record) => { record.status = status; });
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

  const createQuickBooking = async () => {
    if (!quickName.trim() || !quickService || !quickTime || !profile?.barbershop_id || !profile?.id) {
      setNotice({ tone: 'danger', message: 'Informe cliente, serviço e horário para criar o encaixe.' });
      return;
    }
    const dateTime = new Date(selectedDate);
    const [hours, minutes] = quickTime.split(':').map(Number);
    dateTime.setHours(hours, minutes, 0, 0);
    const service = services.find((item) => item.id === quickService);
    const end = dateTime.getTime() + (service?.durationMinutes || 30) * 60 * 1000;
    const conflict = appointments.some((item) => {
      if (item.barberId !== profile.id || item.status === 'cancelled') return false;
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
          record.barbershopId = profile.barbershop_id;
          record.barberId = profile.id;
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

  return (
    <BarberShell testID="barber-dashboard-screen" name={profile?.name} shopName={barbershop?.name} isOffline={isOffline} onSignOut={signOut}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.pageHeader}>
          <SectionHeading testID="barber-dashboard-heading" eyebrow="Minha operação" title={`Olá, ${profile?.name?.split(' ')[0] || 'profissional'}.`} description="Seu dia organizado para você manter o ritmo entre um cliente e outro." />
          <View style={styles.headerActions}>
            <StatusBadge testID="barber-sync-status" label={syncError ? 'Falha ao sincronizar' : isSyncing ? 'Sincronizando' : 'Sincronizado'} tone={syncError ? 'danger' : isSyncing ? 'warning' : 'success'} />
            <AppButton label="Encaixe rápido" testID="barber-quick-booking-button" onPress={() => setQuickOpen(true)} icon={<Plus color={colors.ink} size={17} />} />
          </View>
        </View>

        {!!notice && <InlineNotice testID="barber-action-notice" tone={notice.tone} message={notice.message} />}

        <View style={[styles.metrics, !isWide && styles.metricsStack]}>
          <Metric testID="barber-next-metric" icon={<Clock3 color={colors.brand} size={18} />} label="Próximo atendimento" value={nextAppointment ? time(nextAppointment.dateTime) : 'Agenda livre'} note={nextAppointment?.clientName || 'Nenhum cliente aguardando'} />
          <Metric testID="barber-completed-metric" icon={<Check color={colors.success} size={18} />} label="Concluídos" value={String(completed.length)} note={`${visibleAppointments.length} horários na agenda`} />
          <Metric testID="barber-commission-metric" icon={<WalletCards color={colors.info} size={18} />} label="Meu ganho no dia" value={currency(commission)} note={`${Math.round((profile?.commission_rate ?? 0.5) * 100)}% de comissão`} />
        </View>

        <View style={styles.agendaHeader}>
          <SectionHeading testID="barber-agenda-heading" eyebrow="Agenda" title="Ritmo do dia" description="Alterne entre seus horários e a visão de toda a equipe." />
          <AppButton label="Sincronizar" testID="barber-sync-button" variant="secondary" onPress={sync} loading={isSyncing} icon={<RefreshCw color={colors.text} size={15} />} style={styles.syncButton} />
        </View>

        <SegmentedControl<Tab> testID="barber-agenda-tabs" value={tab} onChange={setTab} options={[{ value: 'mine', label: 'Minha agenda' }, { value: 'team', label: 'Agenda da equipe' }]} />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateList}>
          {dateOptions.map((date) => {
            const id = date.toISOString().split('T')[0];
            const selected = selectedDate.toDateString() === date.toDateString();
            return <Pressable key={id} testID={`barber-date-${id}`} onPress={() => setSelectedDate(date)} style={({ pressed }) => [styles.dateCard, selected && styles.dateCardSelected, pressed && styles.pressed]}><Text style={[styles.dateWeek, selected && styles.selectedInk]}>{date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</Text><Text style={[styles.dateDay, selected && styles.selectedInk]}>{date.getDate()}</Text></Pressable>;
          })}
        </ScrollView>

        {loading ? <ActivityIndicator testID="barber-agenda-loading" color={colors.brand} style={styles.loader} /> : visibleAppointments.length === 0 ? (
          <EmptyState testID="barber-agenda-empty" title="Agenda livre nesta data" description="Use o encaixe rápido para registrar um atendimento de balcão." icon={<CalendarDays color={colors.brand} size={22} />} />
        ) : (
          <View style={styles.appointmentList}>
            {visibleAppointments.map((item) => {
              const status = statusMap[item.status] || { label: item.status, tone: 'warning' as const };
              return (
                <AppCard key={item.id} testID={`barber-appointment-${item.id}`} style={styles.appointmentCard}>
                  <View style={styles.timeBox}><Text testID={`barber-appointment-${item.id}-time`} style={styles.appointmentTime}>{time(item.dateTime)}</Text></View>
                  <View style={styles.appointmentCopy}>
                    <View style={styles.appointmentTitleRow}><Text testID={`barber-appointment-${item.id}-client`} style={styles.clientName}>{item.clientName}</Text><StatusBadge testID={`barber-appointment-${item.id}-status`} label={status.label} tone={status.tone} /></View>
                    <Text style={styles.serviceName}>{item.serviceName} · {currency(item.price)}</Text>
                    {tab === 'team' && <Text style={styles.barberName}>{item.barberName}</Text>}
                    {cancelCandidateId === item.id ? (
                      <InlineNotice testID={`barber-appointment-${item.id}-cancel-confirmation`} tone="danger" message="Cancelar este atendimento?" action={<View style={styles.confirmActions}><AppButton label="Confirmar" testID={`barber-appointment-${item.id}-cancel-confirm-button`} onPress={() => updateStatus(item.id, 'cancelled')} loading={actionLoadingId === item.id} variant="danger" style={styles.smallButton} /><AppButton label="Voltar" testID={`barber-appointment-${item.id}-cancel-back-button`} onPress={() => setCancelCandidateId(null)} variant="secondary" style={styles.smallButton} /></View>} />
                    ) : (item.status === 'pending' || item.status === 'confirmed') && item.barberId === profile?.id ? (
                      <View style={styles.appointmentActions}><AppButton label="Cancelar" testID={`barber-appointment-${item.id}-cancel-button`} onPress={() => setCancelCandidateId(item.id)} variant="danger" icon={<X color={colors.danger} size={14} />} style={styles.smallButton} /><AppButton label={item.status === 'pending' ? 'Confirmar' : 'Concluir'} testID={`barber-appointment-${item.id}-advance-button`} onPress={() => updateStatus(item.id, item.status === 'pending' ? 'confirmed' : 'completed')} loading={actionLoadingId === item.id} icon={<Check color={colors.ink} size={14} />} style={styles.smallButton} /></View>
                    ) : null}
                  </View>
                </AppCard>
              );
            })}
          </View>
        )}
      </ScrollView>

      <Modal visible={quickOpen} transparent animationType="fade" onRequestClose={() => setQuickOpen(false)}>
        <View testID="barber-quick-booking-modal" style={styles.modalOverlay}>
          <AppCard testID="barber-quick-booking-card" style={styles.modalCard} elevated>
            <View style={styles.modalHeader}><View><Text style={styles.modalEyebrow}>ENCAIXE RÁPIDO</Text><Text testID="barber-quick-booking-title" style={styles.modalTitle}>Reservar um horário</Text></View><Pressable testID="barber-quick-booking-close-button" onPress={() => setQuickOpen(false)} style={styles.closeButton}><X color={colors.textSecondary} size={18} /></Pressable></View>
            <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
              <AppInput label="Nome do cliente" testID="barber-quick-client-input" icon={<UserRound color={colors.textMuted} size={17} />} value={quickName} onChangeText={setQuickName} placeholder="Cliente de balcão" />
              <Text style={styles.fieldLabel}>Serviço</Text>
              <View style={styles.choiceGrid}>{services.map((service) => <ChoiceCard key={service.id} testID={`barber-quick-service-${service.id}`} title={service.name} subtitle={`${service.durationMinutes} min`} meta={currency(service.price)} selected={quickService === service.id} onPress={() => { setQuickService(service.id); setQuickTime(null); }} icon={<Scissors color={colors.textSecondary} size={15} />} style={styles.choiceCard} />)}</View>
              <Text style={styles.fieldLabel}>Horário em {selectedDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</Text>
              <View style={styles.timeGrid}>{quickTimes.map((slot) => <Pressable key={slot} testID={`barber-quick-time-${slot.replace(':', '-')}`} onPress={() => setQuickTime(slot)} style={({ pressed }) => [styles.timeSlot, quickTime === slot && styles.timeSlotSelected, pressed && styles.pressed]}><Text style={[styles.timeSlotText, quickTime === slot && styles.selectedInk]}>{slot}</Text></Pressable>)}</View>
              <AppButton label="Criar encaixe" testID="barber-quick-submit-button" onPress={createQuickBooking} loading={quickLoading} fullWidth icon={<Plus color={colors.ink} size={16} />} />
            </ScrollView>
          </AppCard>
        </View>
      </Modal>
    </BarberShell>
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
  dateCard: { width: 62, alignItems: 'center', paddingVertical: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md },
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
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  timeSlot: { minWidth: 72, flexGrow: 1, alignItems: 'center', justifyContent: 'center', minHeight: 40, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md },
  timeSlotSelected: { backgroundColor: colors.brand, borderColor: colors.brand },
  timeSlotText: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 10 },
});