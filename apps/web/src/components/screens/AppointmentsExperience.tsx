import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, Platform, Alert, Pressable, Linking, TextInput, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
import { colors, radii, typography, atmosphericShadow } from '../../theme/tokens';
import { tapLight } from '../../utils/haptics';
import {
  appointmentFeedbackMessages,
  clientCancellationReasons,
  translateAppointmentError,
  type ClientCancellationReason,
} from '@cutsync/domain';

type AppointmentTab = 'upcoming' | 'history';

interface AppointmentDetail {
  id: string;
  dateTime: Date;
  status: string;
  shopId: string;
  shopName: string;
  shopAddress?: string;
  serviceName: string;
  barberName: string;
  contactPhone: string;
  shopSlug: string;
  rescheduleCount: number;
  cancellationReason?: string;
  minCancellationHours: number;
}

const statusMap: Record<string, { label: string; tone: 'warning' | 'info' | 'success' | 'danger' }> = {
  pending: { label: 'Aguardando confirmação', tone: 'warning' },
  confirmed: { label: 'Confirmado', tone: 'info' },
  completed: { label: 'Concluído', tone: 'success' },
  cancelled: { label: 'Cancelado', tone: 'danger' },
};

export const AppointmentsExperience = () => {
  const { feedback } = useLocalSearchParams<{ feedback?: string }>();
  const { profile, signOut } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<AppointmentTab>('upcoming');
  const upcomingQuery = useAppointments({ clientId: profile?.id, statuses: ['pending', 'confirmed'] });
  const historyQuery = useAppointments({ clientId: profile?.id, statuses: ['completed', 'cancelled'], enabled: tab === 'history' });
  const activeQuery = tab === 'history' ? historyQuery : upcomingQuery;
  const records = activeQuery.appointments;
  const loading = activeQuery.loading;
  const syncError = activeQuery.error;
  const refresh = activeQuery.refresh;
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [selectedReason, setSelectedReason] = useState<ClientCancellationReason | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null);
  const [reviewsMap, setReviewsMap] = useState<Map<string, { rating: number; comment?: string }>>(new Map());
  const [reviewingAppointment, setReviewingAppointment] = useState<AppointmentDetail | null>(null);
  const [selectedRating, setSelectedRating] = useState<number>(5);
  const [commentText, setCommentText] = useState<string>('');
  const [submittingReview, setSubmittingReview] = useState<boolean>(false);

  const loadReviews = useCallback(async () => {
    if (!profile?.id) return;
    const { data } = await supabase
      .from('establishment_reviews')
      .select('appointment_id, rating, comment')
      .eq('client_id', profile.id);
    if (data) {
      setReviewsMap(new Map(data.map(r => [r.appointment_id, { rating: r.rating, comment: r.comment || undefined }])));
    }
  }, [profile?.id]);

  useEffect(() => {
    void loadReviews();
  }, [loadReviews, records]);

  const submitReview = async () => {
    if (!reviewingAppointment || !profile?.id) return;
    setSubmittingReview(true);
    try {
      const { error } = await supabase.from('establishment_reviews').insert({
        establishment_id: reviewingAppointment.shopId,
        client_id: profile.id,
        appointment_id: reviewingAppointment.id,
        rating: selectedRating,
        comment: commentText.trim() || null
      });

      if (error) throw error;

      await loadReviews();
      setReviewingAppointment(null);
      setSelectedRating(5);
      setCommentText('');
      setNotice({ tone: 'success', message: 'Sua avaliação foi enviada com sucesso! Obrigado pelo feedback.' });
    } catch (err) {
      setNotice({ tone: 'danger', message: 'Não foi possível enviar sua avaliação no momento.' });
    } finally {
      setSubmittingReview(false);
    }
  };

  useEffect(() => {
    if (feedback === 'appointment_created') {
      setNotice({ tone: 'success', message: appointmentFeedbackMessages.appointmentCreated });
    } else if (feedback === 'appointment_rescheduled') {
      setNotice({ tone: 'success', message: appointmentFeedbackMessages.appointmentRescheduled });
    }
  }, [feedback]);

  const appointments = useMemo<AppointmentDetail[]>(() => records.map((item) => ({
      id: item.id,
      dateTime: item.dateTime,
      status: item.status,
      shopId: item.establishment?.id || '',
      shopName: item.establishment?.name || 'Barbearia',
      shopAddress: item.establishment?.address || undefined,
      serviceName: item.service?.name || 'Serviço',
      barberName: item.professional?.name || 'Profissional',
      contactPhone: item.establishment?.phone || '',
      shopSlug: item.establishment?.slug || '',
      rescheduleCount: item.rescheduleCount,
      cancellationReason: item.cancellationReason || '',
      minCancellationHours: item.establishment?.minCancellationHours ?? 24,
    })), [records]);

  const [referenceTime] = useState(() => new Date().getTime());

  const visible = useMemo(() => appointments.filter((item) => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const isUpcoming = (item.status === 'pending' || item.status === 'confirmed') && item.dateTime.getTime() >= startOfToday.getTime();
    return tab === 'upcoming' ? isUpcoming : !isUpcoming;
  }), [appointments, tab]);

  const cancelAppointment = async (reason: ClientCancellationReason, item: AppointmentDetail) => {
    const formattedDate = item.dateTime.toLocaleDateString('pt-BR');
    const formattedTime = item.dateTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const message = `Você tem certeza que deseja cancelar o seu agendamento para o dia ${formattedDate} às ${formattedTime}?`;

    const proceedCancel = async () => {
      setActionLoading(true);
      try {
        const { error } = await supabase.rpc('update_appointment_status', {
          target_appointment_id: item.id,
          new_status: 'cancelled',
          new_cancellation_reason: reason,
        });
        if (error) throw error;
        setCancelId(null);
        setSelectedReason(null);
        setNotice({ tone: 'success', message: 'Agendamento cancelado.' });
        await refresh();
      } catch (error) {
        setNotice({ tone: 'danger', message: translateAppointmentError(error, 'Não foi possível cancelar este horário.') });
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
    const formattedDate = item.dateTime.toLocaleDateString('pt-BR');
    const formattedTime = item.dateTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const text = `Olá! Preciso de ajuda para reagendar meu horário do dia ${formattedDate} às ${formattedTime} (Serviço: ${item.serviceName}) com o profissional ${item.barberName}. Meu nome é ${profile?.name || 'Cliente'}.`;
    const cleanPhone = item.contactPhone.replace(/\D/g, '');
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
    Linking.openURL(url).catch(() => {
      const msg = 'Não foi possível abrir o WhatsApp. Telefone: ' + item.contactPhone;
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Erro', msg);
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
    router.push({
      pathname: '/[slug]/booking',
      params: { slug: item.shopSlug, reschedule_id: item.id },
    });
  };

  return (
    <ClientShell testID="client-appointments-screen" activeRoute="appointments" userName={profile?.name} onSignOut={signOut}>
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
            {visible.map((item, index) => {
              const status = statusMap[item.status] || { label: item.status, tone: 'warning' as const };
              const isUpcoming = item.dateTime.getTime() > referenceTime;
              const cancellable = isUpcoming && (item.status === 'pending' || item.status === 'confirmed');
              
              const timeDiff = item.dateTime.getTime() - referenceTime;
              const hoursDiff = timeDiff / (1000 * 60 * 60);
              const isLateCancellation = hoursDiff >= 0 && hoursDiff < item.minCancellationHours;

              return (
                <AppCard key={item.id} testID={`client-appointment-${item.id}`} style={[styles.card, tab === 'upcoming' && index === 0 && styles.nextCard]}>
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
                          {clientCancellationReasons.map((reason) => (
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
                            onPress={() => selectedReason && cancelAppointment(selectedReason, item)}
                            disabled={!selectedReason}
                            loading={actionLoading} 
                            variant="danger" 
                            style={styles.actionBtn}
                          />
                          <AppButton 
                            label="Voltar" 
                            testID={`client-appointment-${item.id}-cancel-back-button`} 
                            onPress={() => { setCancelId(null); setSelectedReason(null); }}
                            variant="secondary" 
                            style={styles.actionBtn} 
                          />
                        </View>
                      </View>
                    ) : cancellable ? (
                      isLateCancellation ? (
                        <View style={styles.lateNoticeContainer}>
                          <Text style={styles.lateNoticeText}>
                            Cancelamentos e reagendamentos com menos de {item.minCancellationHours}h de antecedência devem ser combinados diretamente com o estabelecimento.
                          </Text>
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
                              onPress={() => sendWhatsAppReschedule(item)}
                              variant="primary"
                              icon={<RefreshCw color={colors.ink} size={13} strokeWidth={1.8} />}
                              style={styles.actionBtn}
                            />
                          </View>
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

                    {tab === 'history' && item.status !== 'cancelled' ? (
                      reviewsMap.has(item.id) ? (
                        <View style={styles.reviewedBadge}>
                          <Text style={styles.reviewedBadgeText}>★ {reviewsMap.get(item.id)?.rating} · Avaliado</Text>
                        </View>
                      ) : (
                        <View style={styles.historyActionsRow}>
                          <AppButton
                            label="Avaliar Atendimento"
                            testID={`client-appointment-${item.id}-review-button`}
                            onPress={() => {
                              tapLight();
                              setReviewingAppointment(item);
                            }}
                            variant="secondary"
                            style={styles.reviewBtn}
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

      <Modal visible={!!reviewingAppointment} transparent animationType="slide" onRequestClose={() => setReviewingAppointment(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setReviewingAppointment(null)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Avalie seu atendimento</Text>
              <Pressable onPress={() => setReviewingAppointment(null)} style={styles.closeBtn}>
                <X color={colors.textSecondary} size={18} />
              </Pressable>
            </View>

            <Text style={styles.modalSubtitle}>Como foi sua experiência na {reviewingAppointment?.shopName}?</Text>

            <View style={styles.starsContainer}>
               {[1, 2, 3, 4, 5].map((star) => (
                 <Pressable
                   key={star}
                   onPress={() => { tapLight(); setSelectedRating(star); }}
                   style={styles.starPressable}
                 >
                   <Text style={[styles.starIcon, selectedRating >= star ? styles.starIconActive : styles.starIconInactive]}>★</Text>
                 </Pressable>
               ))}
            </View>

            <Text style={styles.commentLabel}>Comentário opcional</Text>
            <TextInput
              style={styles.commentInput}
              multiline
              numberOfLines={4}
              placeholder="Conte como foi o serviço, o atendimento ou o ambiente..."
              placeholderTextColor={colors.textMuted}
              value={commentText}
              onChangeText={setCommentText}
              maxLength={200}
            />

            <View style={styles.modalActions}>
              <AppButton
                label="Enviar Avaliação"
                onPress={submitReview}
                loading={submittingReview}
                variant="primary"
                fullWidth
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
  nextCard: { borderColor: colors.brandSecondary, borderWidth: 1.5, backgroundColor: colors.surface },
  dateBlock: { width: 58, alignItems: 'flex-start', paddingTop: 2 },
  month: { color: colors.labelSoft, fontFamily: typography.bodyStrong, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.2 },
  day: { color: colors.text, fontFamily: typography.serif, fontSize: 32, lineHeight: 38, marginTop: 2 },
  time: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 11, marginTop: 2 },
  copy: { flex: 1, minWidth: 0, borderLeftWidth: hairlineW, borderLeftColor: colors.hairline, paddingLeft: 18 },
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  shopName: { color: colors.text, fontFamily: typography.display, fontSize: 17, letterSpacing: -0.4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 9 },
  meta: { flex: 1, color: colors.textSecondary, fontFamily: typography.body, fontSize: 12 },
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
    fontSize: 11,
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
    fontSize: 11,
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
    fontSize: 11,
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
    fontSize: 11,
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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: 20, width: '100%', maxWidth: 320, ...atmosphericShadow },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { color: colors.text, fontFamily: typography.display, fontSize: 16 },
  closeBtn: { padding: 4 },
  modalSubtitle: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 13, marginBottom: 16 },
  starsContainer: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginBottom: 20 },
  starPressable: { padding: 4 },
  starIcon: { fontSize: 32 },
  starIconActive: { color: '#EAB308' },
  starIconInactive: { color: colors.borderStrong },
  commentLabel: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 12, marginBottom: 6 },
  commentInput: {
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radii.md,
    padding: 12,
    color: colors.text,
    fontFamily: typography.body,
    fontSize: 13,
    backgroundColor: colors.canvasSoft,
    textAlignVertical: 'top',
    height: 90,
    marginBottom: 20,
  },
  modalActions: { width: '100%' },
  reviewedBadge: { alignSelf: 'flex-start', marginTop: 12, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: colors.brandSecondarySoft, borderWidth: 1, borderColor: colors.brandSecondary },
  reviewedBadgeText: { color: colors.brandPrimary, fontFamily: typography.bodyStrong, fontSize: 11 },
  historyActionsRow: { marginTop: 12, width: '100%' },
  reviewBtn: { alignSelf: 'flex-start', minWidth: 140 },
});
