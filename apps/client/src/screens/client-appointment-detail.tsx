import { sharedBrand } from '@cutsync/brand';
import {
  formatClientAppointmentDateTime,
  formatDisplayName,
  getClientAppointmentBlockMessage,
} from '@cutsync/domain';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';

import {
  AppointmentDetailRow,
  AppointmentStateCard,
  AppointmentStatusBadge,
  appointmentColors,
} from '@/components/appointments/client-appointment-ui';
import { ClientReassignmentPanel } from '@/components/appointments/client-reassignment-ui';
import { useSession } from '@/contexts/session-context';
import { useClientAppointment } from '@/features/appointments/use-client-appointments';
import { useClientReassignmentDetail } from '@/features/appointments/use-client-reassignment';
import { performClientHaptic } from '@/features/experience/client-haptics';
import { clientTheme } from '@/theme/client-theme';

export function ClientAppointmentDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const appointmentId = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const { user } = useSession();
  const query = useClientAppointment(appointmentId ?? null, user?.id ?? null);
  const reassignmentQuery = useClientReassignmentDetail(
    appointmentId ?? null,
    user?.id ?? null,
  );

  if (query.isLoading && !query.appointment) {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.centered} style={styles.page}>
        <StatusBar style="dark" />
        <ActivityIndicator color={sharedBrand.colors.forest} />
        <Text style={styles.loadingText}>Carregando atendimento…</Text>
      </ScrollView>
    );
  }

  if (query.error || !query.appointment) {
    return (
      <ScrollView testID="client-appointment-detail-error" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.centered} style={styles.page}>
        <StatusBar style="dark" />
        <AppointmentStateCard
          title="Atendimento indisponível"
          description={query.error || 'Este atendimento não foi encontrado na sua conta.'}
          action={(
            <Pressable accessibilityRole="button" onPress={() => router.replace('/appointments')} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Voltar para a agenda</Text>
            </Pressable>
          )}
        />
      </ScrollView>
    );
  }

  const appointment = query.appointment;
  const acceptedReplacement = reassignmentQuery.detail?.status === 'ready_to_apply'
    ? reassignmentQuery.detail.proposedProfessional
    : null;
  const formatted = formatClientAppointmentDateTime(appointment.startsAt, appointment.establishment.timezone);
  const original = appointment.originalStartsAt
    ? formatClientAppointmentDateTime(appointment.originalStartsAt, appointment.establishment.timezone)
    : null;
  const cancelBlockMessage = getClientAppointmentBlockMessage(
    appointment.cancelBlockReason,
    appointment.establishment.minCancellationHours,
  );
  const rescheduleBlockMessage = getClientAppointmentBlockMessage(
    appointment.rescheduleBlockReason,
    appointment.establishment.minCancellationHours,
  );
  const contactRequired = appointment.cancelBlockReason === 'cancellation_window_closed'
    || appointment.rescheduleBlockReason === 'cancellation_window_closed';
  const cleanPhone = appointment.establishment.phone?.replace(/\D/g, '') ?? '';
  const openContact = (channel: 'phone' | 'whatsapp') => {
    if (!cleanPhone) return;
    void performClientHaptic('selection');
    const target = channel === 'phone'
      ? `tel:${cleanPhone}`
      : `https://wa.me/${cleanPhone}?text=${encodeURIComponent(`Olá! Preciso de ajuda com o atendimento ${appointment.id}.`)}`;
    void Linking.openURL(target);
  };
  const acceptReplacement = () => {
    Alert.alert(
      'Aceitar substituto?',
      'Seu aceite será registrado. O estabelecimento ainda precisará aplicar a alteração.',
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: 'Aceitar',
          onPress: () => {
            void performClientHaptic('success');
            void reassignmentQuery.submitDecision('accept_replacement');
          },
        },
      ],
    );
  };
  const rescheduleWithOriginal = () => {
    Alert.alert(
      'Reagendar com o profissional original?',
      'O estabelecimento será avisado e você poderá escolher um novo horário com o profissional original.',
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: 'Continuar',
          onPress: () => {
            void (async () => {
              const receipt = await reassignmentQuery.submitDecision('reschedule_original');
              if (!receipt) return;
              router.push({
                pathname: '/booking/[slug]',
                params: { slug: appointment.establishment.slug, appointmentId: appointment.id },
              });
            })();
          },
        },
      ],
    );
  };
  const cancelDueToChange = () => {
    Alert.alert(
      'Cancelar sem penalidade?',
      'O atendimento será cancelado por causa da alteração iniciada pelo estabelecimento.',
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: 'Cancelar atendimento',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const receipt = await reassignmentQuery.submitDecision('cancel_due_to_change');
              if (receipt) await query.refresh();
            })();
          },
        },
      ],
    );
  };

  return (
    <ScrollView
      testID="client-appointment-detail-screen"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      style={styles.page}
    >
      <StatusBar style="dark" />
      <Animated.View
        entering={FadeInUp.duration(clientTheme.motion.standard)}
        style={styles.hero}
      >
        <AppointmentStatusBadge appointment={appointment} />
        <Text style={styles.eyebrow}>DETALHES DO ATENDIMENTO</Text>
        <Text testID="client-appointment-detail-establishment" style={styles.title}>{formatDisplayName(appointment.establishment.name)}</Text>
        <Text style={styles.description}>
          {appointment.service.name} com {formatDisplayName(appointment.professional.name)}
          {acceptedReplacement
            ? ` · troca para ${formatDisplayName(acceptedReplacement.name)} aguardando aplicação`
            : ''}
        </Text>
      </Animated.View>

      {reassignmentQuery.detail && (
        <ClientReassignmentPanel
          detail={reassignmentQuery.detail}
          candidates={reassignmentQuery.candidates}
          isLoadingCandidates={reassignmentQuery.isLoadingCandidates}
          syncStatus={reassignmentQuery.syncStatus}
          commandError={reassignmentQuery.commandError}
          onLoadCandidates={() => { void reassignmentQuery.loadCandidates(); }}
          onRetryPending={() => { void reassignmentQuery.replayPending(); }}
          onAccept={acceptReplacement}
          onChooseProfessional={(professionalId) => {
            void reassignmentQuery.submitDecision('choose_professional', professionalId);
          }}
          onRescheduleOriginal={rescheduleWithOriginal}
          onCancelDueToChange={cancelDueToChange}
        />
      )}

      {!!reassignmentQuery.error && (
        <View testID="client-reassignment-error" style={styles.policyCard}>
          <Text style={styles.policyTitle}>Alteração indisponível</Text>
          <Text style={styles.policyText}>{reassignmentQuery.error}</Text>
          <Pressable accessibilityRole="button" onPress={() => { void reassignmentQuery.refresh(); }}>
            <Text style={styles.retryText}>Tentar novamente</Text>
          </Pressable>
        </View>
      )}

      <Animated.View
        entering={FadeIn
          .delay(clientTheme.motion.stagger)
          .duration(clientTheme.motion.emphasized)}
        style={styles.timeCard}
      >
        <Text style={styles.time}>{formatted.timeLabel}</Text>
        <Text style={styles.date}>{formatted.dateLabel}</Text>
        <Text style={styles.duration}>{appointment.durationMinutes} minutos</Text>
      </Animated.View>

      <Animated.View
        entering={FadeInUp
          .delay(clientTheme.motion.stagger * 2)
          .duration(clientTheme.motion.emphasized)}
        style={styles.detailCard}
      >
        <AppointmentDetailRow label="Serviço" value={appointment.service.name} />
        <AppointmentDetailRow
          label={acceptedReplacement ? 'Profissional atual' : 'Profissional'}
          value={formatDisplayName(appointment.professional.name)}
        />
        {acceptedReplacement && (
          <AppointmentDetailRow
            label="Substituto aceito (aguardando aplicação)"
            value={formatDisplayName(acceptedReplacement.name)}
          />
        )}
        <AppointmentDetailRow label="Endereço" value={appointment.establishment.address || 'Endereço não informado'} />
        <AppointmentDetailRow label="Fuso do local" value={appointment.establishment.timezone} />
        <AppointmentDetailRow label="Protocolo" value={appointment.id} last />
      </Animated.View>

      {appointment.rescheduleCount > 0 && (
        <View testID="client-appointment-reschedule-history" style={styles.infoCard}>
          <Text style={styles.infoTitle}>Reagendado {appointment.rescheduleCount}x</Text>
          {original && <Text style={styles.infoText}>Horário original: {original.dateLabel}, {original.timeLabel}</Text>}
        </View>
      )}

      {appointment.status === 'cancelled' && appointment.cancellationReason && (
        <View testID="client-appointment-cancellation-reason" style={styles.cancelledCard}>
          <Text style={styles.cancelledTitle}>Motivo do cancelamento</Text>
          <Text selectable style={styles.cancelledText}>{appointment.cancellationReason}</Text>
        </View>
      )}

      {(appointment.status === 'completed' || appointment.status === 'cancelled') && (
        <View testID="client-appointment-rebook-actions" style={styles.actionsCard}>
          <Pressable
            testID="client-appointment-rebook"
            accessibilityRole="button"
            onPress={() => {
              void performClientHaptic('selection');
              router.push({
                pathname: '/booking/[slug]',
                params: { slug: appointment.establishment.slug, serviceId: appointment.service.id },
              });
            }}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.primaryButtonText}>Agendar novamente</Text>
          </Pressable>
        </View>
      )}

      {(appointment.canReschedule || appointment.canCancel) && (
        <View testID="client-appointment-actions" style={styles.actionsCard}>
          {appointment.canReschedule && (
            <Pressable
              testID="client-appointment-reschedule"
              accessibilityRole="button"
              onPress={() => {
                void performClientHaptic('selection');
                router.push({
                  pathname: '/booking/[slug]',
                  params: { slug: appointment.establishment.slug, appointmentId: appointment.id },
                });
              }}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            >
              <Text style={styles.primaryButtonText}>Reagendar atendimento</Text>
            </Pressable>
          )}
          {appointment.canCancel && (
            <Pressable
              testID="client-appointment-cancel"
              accessibilityRole="button"
              onPress={() => {
                void performClientHaptic('warning');
                router.push({
                  pathname: '/appointments/[id]/cancel',
                  params: { id: appointment.id },
                });
              }}
              style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
            >
              <Text style={styles.cancelButtonText}>Cancelar atendimento</Text>
            </Pressable>
          )}
        </View>
      )}

      {!appointment.canReschedule && rescheduleBlockMessage && (
        <View style={styles.policyCard}>
          <Text style={styles.policyTitle}>Reagendamento indisponível</Text>
          <Text style={styles.policyText}>{rescheduleBlockMessage}</Text>
        </View>
      )}
      {!appointment.canCancel && cancelBlockMessage && cancelBlockMessage !== rescheduleBlockMessage && (
        <View style={styles.policyCard}>
          <Text style={styles.policyTitle}>Cancelamento indisponível</Text>
          <Text style={styles.policyText}>{cancelBlockMessage}</Text>
        </View>
      )}

      {contactRequired && cleanPhone && (
        <View testID="client-appointment-contact" style={styles.contactCard}>
          <Text style={styles.contactTitle}>Precisa alterar mesmo assim?</Text>
          <Text style={styles.contactText}>Fale diretamente com o estabelecimento para verificar as opções.</Text>
          <View style={styles.contactActions}>
            <Pressable accessibilityRole="button" onPress={() => openContact('whatsapp')} style={styles.contactButton}>
              <Text style={styles.contactButtonText}>Abrir WhatsApp</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => openContact('phone')} style={styles.contactButton}>
              <Text style={styles.contactButtonText}>Ligar</Text>
            </Pressable>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: appointmentColors.background },
  content: { width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 24, paddingBottom: 52, gap: 18 },
  centered: { flexGrow: 1, width: '100%', maxWidth: 620, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20 },
  loadingText: { color: appointmentColors.secondary, fontSize: 13 },
  hero: { alignItems: 'flex-start', gap: 10, paddingTop: 8 },
  eyebrow: { color: sharedBrand.colors.forest, fontSize: 10, fontWeight: '900', letterSpacing: 1.5, paddingTop: 8 },
  title: { color: appointmentColors.text, fontSize: 34, lineHeight: 38, fontWeight: '800', letterSpacing: -1 },
  description: { color: appointmentColors.secondary, fontSize: 14, lineHeight: 21 },
  timeCard: { gap: 6, borderRadius: 28, borderCurve: 'continuous', backgroundColor: sharedBrand.colors.forest, padding: 24, boxShadow: clientTheme.shadows.elevated },
  time: { color: '#FFFFFF', fontSize: 46, lineHeight: 50, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
  date: { color: 'rgba(255, 255, 255, 0.9)', fontSize: 15, lineHeight: 21, textTransform: 'capitalize' },
  duration: { color: 'rgba(255, 255, 255, 0.75)', fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  detailCard: { borderRadius: 26, borderCurve: 'continuous', backgroundColor: appointmentColors.card, paddingHorizontal: 20, paddingVertical: 6, boxShadow: clientTheme.shadows.card },
  infoCard: { gap: 6, borderWidth: 1, borderColor: '#C9D6EA', borderRadius: 20, borderCurve: 'continuous', backgroundColor: appointmentColors.confirmedSoft, padding: 16 },
  infoTitle: { color: appointmentColors.confirmed, fontSize: 13, fontWeight: '800' },
  infoText: { color: '#526987', fontSize: 12, lineHeight: 18 },
  cancelledCard: { gap: 6, borderWidth: 1, borderColor: '#EDC8C3', borderRadius: 20, borderCurve: 'continuous', backgroundColor: appointmentColors.cancelledSoft, padding: 16 },
  cancelledTitle: { color: appointmentColors.cancelled, fontSize: 12, fontWeight: '800' },
  cancelledText: { color: '#744740', fontSize: 13, lineHeight: 19 },
  actionsCard: { gap: 10, borderRadius: 24, borderCurve: 'continuous', backgroundColor: appointmentColors.card, padding: 16 },
  primaryButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 999, borderCurve: 'continuous', backgroundColor: sharedBrand.colors.forest, paddingHorizontal: 24 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', letterSpacing: 0.3 },
  cancelButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#EDC8C3', borderRadius: 999, borderCurve: 'continuous', backgroundColor: appointmentColors.cancelledSoft, paddingHorizontal: 24 },
  cancelButtonText: { color: appointmentColors.cancelled, fontSize: 14, fontWeight: '800' },
  policyCard: { gap: 5, borderWidth: 1, borderColor: appointmentColors.border, borderRadius: 20, borderCurve: 'continuous', backgroundColor: appointmentColors.card, padding: 16 },
  policyTitle: { color: appointmentColors.text, fontSize: 13, fontWeight: '800' },
  policyText: { color: appointmentColors.secondary, fontSize: 12, lineHeight: 18 },
  contactCard: { gap: 10, borderWidth: 1, borderColor: '#E5D6A9', borderRadius: 20, borderCurve: 'continuous', backgroundColor: '#FBF3DE', padding: 16 },
  contactTitle: { color: appointmentColors.text, fontSize: 14, fontWeight: '800' },
  contactText: { color: appointmentColors.secondary, fontSize: 12, lineHeight: 18 },
  contactActions: { flexDirection: 'row', gap: 9, paddingTop: 4 },
  contactButton: { minHeight: 44, flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#D6C89F', borderRadius: 999, backgroundColor: '#FFFFFF', paddingHorizontal: 12 },
  contactButtonText: { color: sharedBrand.colors.forest, fontSize: 12, fontWeight: '800' },
  retryText: { color: sharedBrand.colors.forest, fontSize: 12, fontWeight: '800' },
  pressed: { opacity: clientTheme.opacity.pressed },
});
