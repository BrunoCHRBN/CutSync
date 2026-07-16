import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, Platform, Alert, Pressable, Linking, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { CalendarDays, MapPin, Scissors, UserRound, X, RefreshCw } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useAppointments } from '../../hooks/useAppointments';
import { supabase } from '../../services/supabase';
import { ClientShell } from '../layout/ClientShell';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';
import { EmptyState } from '../ui/EmptyState';
import { InlineNotice } from '../ui/InlineNotice';
import { SectionHeading } from '../ui/SectionHeading';
import { SegmentedControl } from '../ui/SegmentedControl';
import { StatusBadge } from '../ui/StatusBadge';
import { colors, radii, typography } from '../../theme/tokens';
import { tapLight } from '../../utils/haptics';

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
  const { profile, signOut } = useAuth();
  const { appointments: records, loading, error: syncError, refresh } = useAppointments({ clientId: profile?.id });
  const router = useRouter();
  const [appointments, setAppointments] = useState<AppointmentDetail[]>([]);
  const [tab, setTab] = useState<AppointmentTab>('upcoming');
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [actionLoading, setActionLoading] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null);
  const [reschedulePromptId, setReschedulePromptId] = useState<string | null>(null);
  const [targetDate, setTargetDate] = useState<string>('');
  const [targetTime, setTargetTime] = useState<string>('');

  useEffect(() => {
    setAppointments(records.map((item) => ({
      id: item.id,
      dateTime: item.dateTime,
      status: item.status,
      shopName: item.establishment?.name || 'Barbearia',
      shopAddress: item.establishment?.address || undefined,
      serviceName: item.service?.name || 'Serviço',
      barberName: item.professional?.name || 'Profissional',
      contactPhone: item.establishment?.phone || item.professional?.phone || '',
      shopSlug: item.establishment?.slug || '',
      rescheduleCount: item.rescheduleCount,
      cancellationReason: item.cancellationReason || '',
    })));
  }, [records]);

  const visible = useMemo(() => appointments.filter((item) => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const isUpcoming = (item.status === 'pending' || item.status === 'confirmed') && item.dateTime.getTime() >= startOfToday.getTime();
    return tab === 'upcoming' ? isUpcoming : !isUpcoming;
  }), [appointments, tab]);

  const cancelAppointment = async (reason: string, item: AppointmentDetail) => {
    const formattedDate = item.dateTime.toLocaleDateString('pt-BR');
    const formattedTime = item.dateTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const message = `Você tem certeza que deseja cancelar o seu agendamento para o dia ${formattedDate} às ${formattedTime}?`;

    const proceedCancel = async () => {
      setActionLoading(true);
      try {
        const { error } = await supabase.from('appointments').update({
          status: 'cancelled', cancellation_reason: reason, cancelled_by_role: 'client',
        }).eq('id', item.id);
        if (error) throw error;
        setCancelId(null);
        setSelectedReason('');
        setNotice({ tone: 'success', message: 'Agendamento cancelado.' });
        await refresh();
      } catch {
        setNotice({ tone: 'danger', message: 'Não foi possível cancelar este horário.' });
      } finally {
        setActionLoading(false);
      }
    };

    if (Platform.OS === 'web') {
      const confirm = window.confirm(`Confirmar Cancelamento?\n\n${message}`);
      if (confirm) {
        await proceedCancel();
      }
    } else {
      Alert.alert(
        'Confirmar Cancelamento?',
        message,
        [
          { text: 'Não, manter', style: 'cancel' },
          { 
            text: 'Sim, cancelar', 
            style: 'destructive',
            onPress: () => proceedCancel()
          }
        ]
      );
    }
  };

  const sendWhatsAppCancel = (item: AppointmentDetail) => {
    const formattedDate = item.dateTime.toLocaleDateString('pt-BR');
    const formattedTime = item.dateTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const text = `Olá! Gostaria de CANCELAR meu horário do dia ${formattedDate} às ${formattedTime} (Serviço: ${item.serviceName}) com o profissional ${item.barberName}. Meu nome é ${profile?.name || 'Cliente'}.`;
    const cleanPhone = item.contactPhone.replace(/\D/g, '');
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
    Linking.openURL(url).catch(() => {
      const msg = 'Não foi possível abrir o WhatsApp. Telefone: ' + item.contactPhone;
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Erro', msg);
    });
  };

  const sendWhatsAppReschedule = (item: AppointmentDetail) => {
    if (!targetDate || !targetTime) {
      const msg = 'Por favor, preencha a nova data e horário desejados.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Atenção', msg);
      return;
    }
    const formattedDate = item.dateTime.toLocaleDateString('pt-BR');
    const formattedTime = item.dateTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const text = `Olá! Gostaria de REAGENDAR meu horário do dia ${formattedDate} às ${formattedTime} (Serviço: ${item.serviceName}) com o profissional ${item.barberName} para o novo dia ${targetDate} às ${targetTime}. Meu nome é ${profile?.name || 'Cliente'}.`;
    const cleanPhone = item.contactPhone.replace(/\D/g, '');
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
    Linking.openURL(url).catch(() => {
      const msg = 'Não foi possível abrir o WhatsApp. Telefone: ' + item.contactPhone;
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Erro', msg);
    });
    setReschedulePromptId(null);
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
    <ClientShell testID="client-appointments-screen" activeRoute="appointments" userName={profile?.name} isSyncing={loading} syncError={syncError ? new Error(syncError) : null} onSync={() => { void refresh(); }} onSignOut={signOut}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <SectionHeading testID="client-appointments-heading" eyebrow="Sua agenda" title="Meus agendamentos" description="Acompanhe confirmações, próximos horários e seu histórico em um só lugar." />
        {!!notice && <InlineNotice testID="client-appointments-notice" tone={notice.tone} message={notice.message} />}
        <View style={styles.tabBox}>
          <SegmentedControl<AppointmentTab>
            testID="client-appointments-tabs"
            value={tab}
            onChange={(next) => { tapLight(); setTab(next); }}
            options={[{ value: 'upcoming', label: 'Próximos' }, { value: 'history', label: 'Histórico' }]}
          />
        </View>

        {loading ? <ActivityIndicator testID="client-appointments-loading" color={colors.accent} style={styles.loader} /> : visible.length === 0 ? (
          <EmptyState testID="client-appointments-empty" title={tab === 'upcoming' ? 'Nenhum horário marcado' : 'Histórico vazio'} description={tab === 'upcoming' ? 'Explore os estabelecimentos e reserve seu próximo atendimento.' : 'Seus atendimentos concluídos aparecerão aqui.'} icon={<CalendarDays color={colors.textSecondary} size={22} strokeWidth={1.6} />} />
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
                <AppCard key={item.id} testID={`client-appointment-${item.id}`} style={styles.card}>
                  <View style={styles.dateBlock}>
                    <Text style={styles.month}>{item.dateTime.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</Text>
                    <Text style={styles.day}>{item.dateTime.getDate()}</Text>
                    <Text style={styles.time}>{item.dateTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</Text>
                  </View>
                  <View style={styles.copy}>
                    <View style={styles.titleRow}><Text testID={`client-appointment-${item.id}-shop`} style={styles.shopName}>{item.shopName}</Text><StatusBadge testID={`client-appointment-${item.id}-status`} label={status.label} tone={status.tone} /></View>
                    <View style={styles.metaRow}><Scissors color={colors.textSecondary} size={13} strokeWidth={1.6} /><Text style={styles.meta}>{item.serviceName}</Text></View>
                    <View style={styles.metaRow}><UserRound color={colors.textSecondary} size={13} strokeWidth={1.6} /><Text style={styles.meta}>{item.barberName}</Text></View>
                    <View style={styles.metaRow}><MapPin color={colors.textSecondary} size={13} strokeWidth={1.6} /><Text style={styles.meta}>{item.shopAddress || 'Endereço não informado'}</Text></View>
                    
                    {item.rescheduleCount > 0 ? (
                      <View style={styles.rescheduleBadge}>
                        <Text style={styles.rescheduleBadgeText}>Reagendado {item.rescheduleCount}x</Text>
                      </View>
                    ) : null}

                    {item.status === 'cancelled' && !!item.cancellationReason ? (
                      <View style={styles.reasonDisplay}>
                        <Text style={styles.reasonDisplayText}>Motivo: {item.cancellationReason}</Text>
                      </View>
                    ) : null}

                    {cancelId === item.id ? (
                      <View style={styles.cancelReasonContainer}>
                        <Text style={styles.reasonTitle}>Qual o motivo do cancelamento?</Text>
                        <View style={styles.reasonsGrid}>
                          {['Imprevisto de trabalho', 'Questões de saúde', 'Problema de transporte', 'Vou reagendar', 'Outro'].map((reason) => (
                            <Pressable 
                              key={reason}
                              onPress={() => { tapLight(); setSelectedReason(reason); }}
                              style={({ pressed }) => [
                                styles.reasonChip,
                                selectedReason === reason && styles.reasonChipActive,
                                pressed && styles.pressedScale,
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
                            onPress={() => cancelAppointment(selectedReason || 'Não informado', item)} 
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
                            Cancelamentos e reagendamentos com menos de 2h de antecedência devem ser combinados via WhatsApp.
                          </Text>
                          {reschedulePromptId === item.id ? (
                            <View style={styles.promptContainer}>
                              <Text style={styles.promptTitle}>Escolha a nova data e horário desejados:</Text>
                              <View style={styles.promptInputsRow}>
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.inputMinLabel}>Nova data</Text>
                                  <TextInput 
                                    style={styles.minInput}
                                    placeholder="Ex: 15/07"
                                    placeholderTextColor={colors.textMuted}
                                    value={targetDate}
                                    onChangeText={setTargetDate}
                                  />
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.inputMinLabel}>Novo horário</Text>
                                  <TextInput 
                                    style={styles.minInput}
                                    placeholder="Ex: 16:30"
                                    placeholderTextColor={colors.textMuted}
                                    value={targetTime}
                                    onChangeText={setTargetTime}
                                  />
                                </View>
                              </View>
                              <View style={styles.promptActionsRow}>
                                <AppButton 
                                  label="Enviar" 
                                  testID={`client-appointment-${item.id}-resched-send`} 
                                  onPress={() => sendWhatsAppReschedule(item)} 
                                  variant="primary" 
                                  style={styles.actionBtn}
                                />
                                <AppButton 
                                  label="Voltar" 
                                  testID={`client-appointment-${item.id}-resched-back`} 
                                  onPress={() => setReschedulePromptId(null)} 
                                  variant="secondary" 
                                  style={styles.actionBtn} 
                                />
                              </View>
                            </View>
                          ) : (
                            <View style={styles.lateButtonsRow}>
                              <AppButton 
                                label="Cancelar" 
                                testID={`client-appointment-${item.id}-whatsapp-cancel`} 
                                onPress={() => sendWhatsAppCancel(item)} 
                                variant="danger" 
                                icon={<X color={colors.danger} size={14} strokeWidth={1.8} />}
                                style={styles.actionBtn}
                              />
                              <AppButton 
                                label="Reagendar" 
                                testID={`client-appointment-${item.id}-whatsapp-reschedule`} 
                                onPress={() => {
                                  tapLight();
                                  setReschedulePromptId(item.id);
                                  const tomorrow = new Date();
                                  tomorrow.setDate(tomorrow.getDate() + 1);
                                  setTargetDate(tomorrow.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }));
                                  setTargetTime(item.dateTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
                                }} 
                                variant="primary" 
                                icon={<RefreshCw color={colors.ink} size={13} strokeWidth={1.8} />}
                                style={styles.actionBtn}
                              />
                            </View>
                          )}
                        </View>
                      ) : (
                        <View style={styles.upcomingActionsRow}>
                          <AppButton 
                            label="Reagendar" 
                            testID={`client-appointment-${item.id}-reschedule-button`} 
                            onPress={() => handleReschedule(item)} 
                            variant="secondary" 
                            icon={<RefreshCw color={colors.textSecondary} size={13} strokeWidth={1.8} />}
                            style={styles.actionBtn}
                          />
                          <AppButton 
                            label="Cancelar" 
                            testID={`client-appointment-${item.id}-cancel-button`} 
                            onPress={() => setCancelId(item.id)} 
                            variant="ghost" 
                            icon={<X color={colors.danger} size={14} strokeWidth={1.8} />} 
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

const hairlineW = Platform.OS === 'web' ? (0.5 as number) : StyleSheet.hairlineWidth;

const styles = StyleSheet.create({
  scroll: { width: '100%', maxWidth: 980, alignSelf: 'center', padding: 20, paddingTop: 34, paddingBottom: 120 },
  tabBox: { width: '100%', maxWidth: 300, marginTop: 28, marginBottom: 18 },
  loader: { margin: 50 },
  list: { gap: 12 },
  card: { flexDirection: 'row', gap: 18 },
  dateBlock: { width: 58, alignItems: 'flex-start', paddingTop: 2 },
  month: { color: colors.labelSoft, fontFamily: typography.bodyStrong, fontSize: 9, textTransform: 'uppercase', letterSpacing: 2 },
  day: { color: colors.text, fontFamily: typography.serif, fontSize: 32, lineHeight: 38, marginTop: 2 },
  time: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 11, marginTop: 2 },
  copy: { flex: 1, minWidth: 0, borderLeftWidth: hairlineW, borderLeftColor: colors.hairline, paddingLeft: 18 },
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  shopName: { color: colors.text, fontFamily: typography.display, fontSize: 17, letterSpacing: -0.4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 9 },
  meta: { flex: 1, color: colors.textSecondary, fontFamily: typography.body, fontSize: 10 },
  cancelReasonContainer: {
    marginTop: 16,
    padding: 14,
    backgroundColor: colors.canvasSoft,
    borderWidth: hairlineW,
    borderColor: colors.hairline,
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
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    borderWidth: hairlineW,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  reasonChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
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
    marginTop: 16,
    width: '100%',
  },
  actionBtn: {
    flex: 1,
    minHeight: 36,
    paddingVertical: 7,
  },
  lateNoticeContainer: {
    marginTop: 16,
    padding: 14,
    backgroundColor: 'rgba(217,119,6,0.06)',
    borderRadius: radii.md,
    gap: 10,
  },
  lateNoticeText: {
    color: colors.warning,
    fontFamily: typography.bodyStrong,
    fontSize: 11,
    lineHeight: 16,
  },
  rescheduleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(37,99,235,0.06)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radii.pill,
    marginTop: 10,
  },
  rescheduleBadgeText: {
    color: colors.info,
    fontFamily: typography.bodyStrong,
    fontSize: 9,
    letterSpacing: 0.4,
  },
  reasonDisplay: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(220,38,38,0.05)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radii.pill,
    marginTop: 10,
  },
  reasonDisplayText: {
    color: colors.danger,
    fontFamily: typography.body,
    fontSize: 10,
  },
  lateButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    width: '100%',
  },
  promptContainer: {
    marginTop: 10,
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: hairlineW,
    borderColor: colors.hairline,
    gap: 8,
  },
  promptTitle: {
    color: colors.text,
    fontFamily: typography.bodyStrong,
    fontSize: 12,
  },
  promptInputsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  inputMinLabel: {
    color: colors.labelSoft,
    fontFamily: typography.bodyStrong,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 5,
  },
  minInput: {
    height: 40,
    borderWidth: 1,
    borderColor: 'rgba(228,228,231,0.8)',
    borderRadius: radii.md,
    paddingHorizontal: 12,
    fontSize: 12,
    fontFamily: typography.body,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  promptActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  pressedScale: { transform: [{ scale: 0.98 }] },
});
