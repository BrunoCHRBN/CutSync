import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, useWindowDimensions, View, Platform, Alert, Pressable, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { Q } from '@nozbe/watermelondb';
import { CalendarDays, Clock3, MapPin, Scissors, UserRound, X, RefreshCw, MessageSquare } from 'lucide-react-native';
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
  contactPhone: string;
  shopSlug: string;
  rescheduleCount: number;
  cancellationReason?: string;
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
  const router = useRouter();
  const [appointments, setAppointments] = useState<AppointmentDetail[]>([]);
  const [tab, setTab] = useState<AppointmentTab>('upcoming');
  const [loading, setLoading] = useState(true);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [actionLoading, setActionLoading] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null);

  useEffect(() => {
    if (!profile?.id) { setLoading(false); return; }
    const sub = database.collections.get<Appointment>('appointments').query(Q.where('client_id', profile.id)).observe().subscribe(async (items) => {
      const rich = await Promise.all(items.map(async (item) => {
        let shopName = 'Barbearia'; let shopAddress: string | undefined; let serviceName = 'Serviço'; let barberName = 'Profissional';
        let contactPhone = ''; let shopSlug = '';
        try { 
          const shop = await database.collections.get<Barbershop>('barbershops').find(item.barbershopId); 
          shopName = shop.name; 
          shopAddress = shop.address; 
          contactPhone = shop.phone || '';
          shopSlug = shop.slug;
        } catch {}
        try { serviceName = (await database.collections.get<Service>('services').find(item.serviceId)).name; } catch {}
        try { 
          const barber = await database.collections.get<Profile>('profiles').find(item.barberId); 
          barberName = barber.name; 
          if (!contactPhone) contactPhone = barber.phone || '';
        } catch {}
        return { 
          id: item.id, 
          dateTime: item.dateTime, 
          status: item.status, 
          shopName, 
          shopAddress, 
          serviceName, 
          barberName,
          contactPhone,
          shopSlug,
          rescheduleCount: item.rescheduleCount || 0,
          cancellationReason: item.cancellationReason || '',
        };
      }));
      setAppointments(rich.sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime()));
      setLoading(false);
    });
    return () => sub.unsubscribe();
  }, [profile]);

  const visible = useMemo(() => appointments.filter((item) => {
    const isFuture = item.dateTime.getTime() >= Date.now();
    return tab === 'upcoming' ? isFuture : !isFuture;
  }), [appointments, tab]);

  const cancelAppointment = async (reason: string) => {
    if (!cancelId) return;
    setActionLoading(true);
    try {
      await database.write(async () => {
        const appointment = await database.collections.get<Appointment>('appointments').find(cancelId);
        await appointment.update((record) => { 
          record.status = 'cancelled'; 
          record.cancellationReason = reason;
          record.cancelledByRole = 'client';
        });
      });
      setCancelId(null);
      setSelectedReason('');
      setNotice({ tone: 'success', message: 'Agendamento cancelado.' });
      sync();
    } catch {
      setNotice({ tone: 'danger', message: 'Não foi possível cancelar este horário.' });
    } finally {
      setActionLoading(false);
    }
  };

  const requestWhatsAppCancellation = (item: AppointmentDetail) => {
    const formattedDate = item.dateTime.toLocaleDateString('pt-BR');
    const formattedTime = item.dateTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const text = `Olá! Preciso reagendar/cancelar meu horário do dia ${formattedDate} às ${formattedTime} (Serviço: ${item.serviceName}) com o profissional ${item.barberName}. Meu nome é ${profile?.name || 'Cliente'}.`;
    const cleanPhone = item.contactPhone.replace(/\D/g, '');
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
    Linking.openURL(url).catch(() => {
      const msg = 'Não foi possível abrir o WhatsApp. Por favor, entre em contato pelo telefone: ' + item.contactPhone;
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Erro', msg);
      }
    });
  };

  const handleReschedule = (item: AppointmentDetail) => {
    if (item.rescheduleCount >= 2) {
      const msg = 'Este horário já foi reagendado o limite de 2 vezes permitidas pelo aplicativo. Por favor, entre em contato para reagendar: ' + item.contactPhone;
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Limite Excedido', msg);
      }
      return;
    }
    router.push(`/${item.shopSlug}/booking?reschedule_id=${item.id}` as any);
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
              const isUpcoming = item.dateTime.getTime() > Date.now();
              const cancellable = isUpcoming && (item.status === 'pending' || item.status === 'confirmed');
              
              // Diferença de horas para limite de cancelamento/reagendamento tardio (2 horas)
              const timeDiff = item.dateTime.getTime() - Date.now();
              const hoursDiff = timeDiff / (1000 * 60 * 60);
              const isLateCancellation = hoursDiff > 0 && hoursDiff < 2;

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
                    
                    {item.rescheduleCount > 0 && (
                      <View style={styles.rescheduleBadge}>
                        <Text style={styles.rescheduleBadgeText}>Reagendado {item.rescheduleCount}x</Text>
                      </View>
                    )}

                    {item.status === 'cancelled' && item.cancellationReason && (
                      <View style={styles.reasonDisplay}>
                        <Text style={styles.reasonDisplayText}>Motivo: {item.cancellationReason}</Text>
                      </View>
                    )}

                    {cancelId === item.id ? (
                      <View style={styles.cancelReasonContainer}>
                        <Text style={styles.reasonTitle}>Qual o motivo do cancelamento?</Text>
                        <View style={styles.reasonsGrid}>
                          {['Imprevisto de trabalho', 'Questões de saúde', 'Problema de transporte', 'Vou reagendar', 'Outro'].map((reason) => (
                            <Pressable 
                              key={reason}
                              onPress={() => setSelectedReason(reason)}
                              style={[
                                styles.reasonChip,
                                selectedReason === reason && styles.reasonChipActive
                              ]}
                            >
                              <Text style={[
                                styles.reasonChipText,
                                selectedReason === reason && styles.reasonChipActiveText
                              ]}>{reason}</Text>
                            </Pressable>
                          ))}
                        </View>
                        <View style={styles.confirmActionsRow}>
                          <AppButton 
                            label="Confirmar Cancelamento" 
                            testID={`client-appointment-${item.id}-cancel-confirm-button`} 
                            onPress={() => cancelAppointment(selectedReason || 'Não informado')} 
                            loading={actionLoading} 
                            variant="danger" 
                            style={styles.actionBtn}
                          />
                          <AppButton 
                            label="Voltar" 
                            testID={`client-appointment-${item.id}-cancel-back-button`} 
                            onPress={() => { setCancelId(null); setSelectedReason(''); }} 
                            variant="secondary" 
                            style={styles.actionBtn} 
                          />
                        </View>
                      </View>
                    ) : cancellable ? (
                      isLateCancellation ? (
                        <View style={styles.lateNoticeContainer}>
                          <Text style={styles.lateNoticeText}>
                            Cancelamentos/Reagendamentos com menos de 2h de antecedência devem ser feitos por WhatsApp.
                          </Text>
                          <AppButton 
                            label="Falar no WhatsApp" 
                            testID={`client-appointment-${item.id}-whatsapp-button`} 
                            onPress={() => requestWhatsAppCancellation(item)} 
                            variant="primary" 
                            icon={<MessageSquare color="#fff" size={14} />}
                            style={styles.whatsappBtn}
                          />
                        </View>
                      ) : (
                        <View style={styles.upcomingActionsRow}>
                          <AppButton 
                            label="Reagendar" 
                            testID={`client-appointment-${item.id}-reschedule-button`} 
                            onPress={() => handleReschedule(item)} 
                            variant="secondary" 
                            icon={<RefreshCw color={colors.textSecondary} size={13} />}
                            style={styles.actionBtn}
                          />
                          <AppButton 
                            label="Cancelar" 
                            testID={`client-appointment-${item.id}-cancel-button`} 
                            onPress={() => setCancelId(item.id)} 
                            variant="ghost" 
                            icon={<X color={colors.danger} size={14} />} 
                            style={styles.actionBtn}
                          />
                        </View>
                      )
                    ) : null}
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
  cancelReasonContainer: {
    marginTop: 14,
    padding: 12,
    backgroundColor: colors.canvasSoft,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    gap: 8,
  },
  reasonTitle: {
    color: colors.text,
    fontFamily: typography.bodyStrong,
    fontSize: 12,
  },
  reasonsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginVertical: 4,
  },
  reasonChip: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  reasonChipActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  reasonChipText: {
    color: colors.textSecondary,
    fontFamily: typography.body,
    fontSize: 10,
  },
  reasonChipActiveText: {
    color: colors.ink,
    fontFamily: typography.bodyStrong,
  },
  confirmActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  upcomingActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    width: '100%',
  },
  actionBtn: {
    flex: 1,
    minHeight: 36,
    paddingVertical: 7,
  },
  lateNoticeContainer: {
    marginTop: 14,
    padding: 12,
    backgroundColor: '#ff444415',
    borderWidth: 1,
    borderColor: '#ff444433',
    borderRadius: radii.md,
    gap: 10,
  },
  lateNoticeText: {
    color: '#ffaaaa',
    fontFamily: typography.bodyStrong,
    fontSize: 11,
    lineHeight: 15,
  },
  whatsappBtn: {
    minHeight: 38,
    paddingVertical: 8,
    alignSelf: 'stretch',
  },
  rescheduleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.sm,
    marginTop: 8,
  },
  rescheduleBadgeText: {
    color: colors.brand,
    fontFamily: typography.bodyStrong,
    fontSize: 9,
  },
  reasonDisplay: {
    alignSelf: 'flex-start',
    backgroundColor: '#ff444410',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.sm,
    marginTop: 8,
  },
  reasonDisplayText: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 10,
  },
});