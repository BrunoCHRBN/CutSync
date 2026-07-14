import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { CalendarDays, Clock3, MapPin, Scissors, UserRound, X } from 'lucide-react-native';
import { database } from '../../database';
import { Appointment, Barbershop, Profile, Service } from '../../database/models';
import { useAuth } from '../../contexts/AuthContext';
import { useSync } from '../../hooks/useSync';
import { ClientShell } from '../layout/ClientShell';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';
import { EmptyState } from '../ui/EmptyState';
import { InlineNotice } from '../ui/InlineNotice';
import { SectionHeading } from '../ui/SectionHeading';
import { SegmentedControl } from '../ui/SegmentedControl';
import { StatusBadge } from '../ui/StatusBadge';
import { colors, layout, radii, typography } from '../../theme/tokens';

type AppointmentTab = 'upcoming' | 'history';

interface AppointmentDetail {
  id: string;
  dateTime: Date;
  status: string;
  shopName: string;
  shopAddress?: string;
  serviceName: string;
  barberName: string;
}

const statusMap: Record<string, { label: string; tone: 'warning' | 'info' | 'success' | 'danger' }> = {
  pending: { label: 'Aguardando confirmação', tone: 'warning' },
  confirmed: { label: 'Confirmado', tone: 'info' },
  completed: { label: 'Concluído', tone: 'success' },
  cancelled: { label: 'Cancelado', tone: 'danger' },
};

export const AppointmentsExperience = () => {
  const { width } = useWindowDimensions();
  const isWide = width >= layout.mobileBreakpoint;
  const { profile, signOut } = useAuth();
  const { isSyncing, syncError, sync } = useSync();
  const [appointments, setAppointments] = useState<AppointmentDetail[]>([]);
  const [tab, setTab] = useState<AppointmentTab>('upcoming');
  const [loading, setLoading] = useState(true);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null);

  useEffect(() => {
    if (!profile?.id) { setLoading(false); return; }
    const sub = database.collections.get<Appointment>('appointments').query(Q.where('client_id', profile.id)).observe().subscribe(async (items) => {
      const rich = await Promise.all(items.map(async (item) => {
        let shopName = 'Barbearia'; let shopAddress: string | undefined; let serviceName = 'Serviço'; let barberName = 'Profissional';
        try { const shop = await database.collections.get<Barbershop>('barbershops').find(item.barbershopId); shopName = shop.name; shopAddress = shop.address; } catch {}
        try { serviceName = (await database.collections.get<Service>('services').find(item.serviceId)).name; } catch {}
        try { barberName = (await database.collections.get<Profile>('profiles').find(item.barberId)).name; } catch {}
        return { id: item.id, dateTime: item.dateTime, status: item.status, shopName, shopAddress, serviceName, barberName };
      }));
      setAppointments(rich.sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime()));
      setLoading(false);
    });
    return () => sub.unsubscribe();
  }, [profile]);

  const visible = useMemo(() => appointments.filter((item) => {
    const historical = item.dateTime.getTime() < Date.now() || item.status === 'completed' || item.status === 'cancelled';
    return tab === 'history' ? historical : !historical;
  }), [appointments, tab]);

  const cancelAppointment = async () => {
    if (!cancelId) return;
    setActionLoading(true);
    try {
      await database.write(async () => {
        const appointment = await database.collections.get<Appointment>('appointments').find(cancelId);
        await appointment.update((record) => { record.status = 'cancelled'; });
      });
      setCancelId(null);
      setNotice({ tone: 'success', message: 'Agendamento cancelado.' });
      sync();
    } catch {
      setNotice({ tone: 'danger', message: 'Não foi possível cancelar este horário.' });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <ClientShell testID="client-appointments-screen" activeRoute="appointments" userName={profile?.name} isSyncing={isSyncing} syncError={syncError} onSync={sync} onSignOut={signOut}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <SectionHeading testID="client-appointments-heading" eyebrow="Sua agenda" title="Meus agendamentos" description="Acompanhe confirmações, próximos horários e seu histórico em um só lugar." />
        {!!notice && <InlineNotice testID="client-appointments-notice" tone={notice.tone} message={notice.message} />}
        <View style={styles.tabBox}><SegmentedControl<AppointmentTab> testID="client-appointments-tabs" value={tab} onChange={setTab} options={[{ value: 'upcoming', label: 'Próximos' }, { value: 'history', label: 'Histórico' }]} /></View>

        {loading ? <ActivityIndicator testID="client-appointments-loading" color={colors.brand} style={styles.loader} /> : visible.length === 0 ? (
          <EmptyState testID="client-appointments-empty" title={tab === 'upcoming' ? 'Nenhum horário marcado' : 'Histórico vazio'} description={tab === 'upcoming' ? 'Explore barbearias e reserve seu próximo atendimento.' : 'Seus atendimentos concluídos aparecerão aqui.'} icon={<CalendarDays color={colors.brand} size={22} />} />
        ) : (
          <View testID="client-appointments-list" style={styles.list}>
            {visible.map((item) => {
              const status = statusMap[item.status] || { label: item.status, tone: 'warning' as const };
              const cancellable = item.status === 'pending' || item.status === 'confirmed';
              return (
                <AppCard key={item.id} testID={`client-appointment-${item.id}`} style={[styles.card, isWide && styles.cardWide]}>
                  <View style={styles.dateBlock}>
                    <Text style={styles.month}>{item.dateTime.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</Text>
                    <Text style={styles.day}>{item.dateTime.getDate()}</Text>
                    <Text style={styles.time}>{item.dateTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</Text>
                  </View>
                  <View style={styles.copy}>
                    <View style={styles.titleRow}><Text testID={`client-appointment-${item.id}-shop`} style={styles.shopName}>{item.shopName}</Text><StatusBadge testID={`client-appointment-${item.id}-status`} label={status.label} tone={status.tone} /></View>
                    <View style={styles.metaRow}><Scissors color={colors.textMuted} size={13} /><Text style={styles.meta}>{item.serviceName}</Text></View>
                    <View style={styles.metaRow}><UserRound color={colors.textMuted} size={13} /><Text style={styles.meta}>{item.barberName}</Text></View>
                    <View style={styles.metaRow}><MapPin color={colors.textMuted} size={13} /><Text style={styles.meta}>{item.shopAddress || 'Endereço não informado'}</Text></View>
                    {cancelId === item.id ? (
                      <InlineNotice testID={`client-appointment-${item.id}-cancel-confirmation`} tone="danger" message="Deseja realmente cancelar este horário?" action={<View style={styles.confirmActions}><AppButton label="Cancelar horário" testID={`client-appointment-${item.id}-cancel-confirm-button`} onPress={cancelAppointment} loading={actionLoading} variant="danger" style={styles.compactButton} /><AppButton label="Voltar" testID={`client-appointment-${item.id}-cancel-back-button`} onPress={() => setCancelId(null)} variant="secondary" style={styles.compactButton} /></View>} />
                    ) : cancellable ? <AppButton label="Cancelar agendamento" testID={`client-appointment-${item.id}-cancel-button`} onPress={() => setCancelId(item.id)} variant="ghost" icon={<X color={colors.danger} size={14} />} style={styles.cancelButton} /> : null}
                  </View>
                </AppCard>
              );
            })}
          </View>
        )}
      </ScrollView>
    </ClientShell>
  );
};

const styles = StyleSheet.create({
  scroll: { width: '100%', maxWidth: 980, alignSelf: 'center', padding: 20, paddingTop: 34, paddingBottom: 110 },
  tabBox: { width: '100%', maxWidth: 420, marginTop: 26, marginBottom: 16 },
  loader: { margin: 50 },
  list: { gap: 10 },
  card: { gap: 15 },
  cardWide: { flexDirection: 'row' },
  dateBlock: { width: 82, minHeight: 92, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandSoft, borderRadius: radii.md },
  month: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 9, textTransform: 'uppercase' },
  day: { color: colors.text, fontFamily: typography.display, fontSize: 25, marginTop: 2 },
  time: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 10, marginTop: 3 },
  copy: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  shopName: { color: colors.text, fontFamily: typography.display, fontSize: 17, letterSpacing: -0.4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 8 },
  meta: { flex: 1, color: colors.textMuted, fontFamily: typography.body, fontSize: 10 },
  cancelButton: { alignSelf: 'flex-start', minHeight: 35, paddingVertical: 6, marginTop: 10 },
  confirmActions: { gap: 6 },
  compactButton: { minHeight: 36, paddingVertical: 7, paddingHorizontal: 10 },
});