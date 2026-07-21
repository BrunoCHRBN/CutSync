import React from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View, Linking } from 'react-native';
import { CalendarClock, Scissors, UserRound, X, MessageCircle } from 'lucide-react-native';
import { colors, elevations, layout, radii, spacing, typeScale } from '../../theme/tokens';
import { CalendarAppointment } from './operational-calendar';
import { AppButton } from '../ui/AppButton';
import { StatusBadge } from '../ui/StatusBadge';

interface AppointmentDetailSheetProps {
  appointment: CalendarAppointment | null;
  professionalName?: string;
  visible: boolean;
  canReschedule?: boolean;
  canCancel?: boolean;
  canComplete?: boolean;
  completeLabel?: string;
  onClose: () => void;
  onReschedule?: (appointment: CalendarAppointment) => void;
  onCancel?: (appointment: CalendarAppointment) => void;
  onComplete?: (appointment: CalendarAppointment) => void;
}

const toneByStatus = {
  pending: 'warning',
  confirmed: 'info',
  completed: 'success',
  cancelled: 'danger',
} as const;

const labelByStatus = {
  pending: 'Pendente',
  confirmed: 'Confirmado',
  completed: 'Concluído',
  cancelled: 'Cancelado',
};

export const AppointmentDetailSheet = ({
  appointment,
  professionalName,
  visible,
  canReschedule = false,
  canCancel = false,
  canComplete = false,
  completeLabel = 'Concluir',
  onClose,
  onReschedule,
  onCancel,
  onComplete,
}: AppointmentDetailSheetProps) => {
  const { width } = useWindowDimensions();
  const desktop = width >= layout.desktopBreakpoint;
  if (!appointment) return null;

  const time = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(appointment.startsAt);

  const handleWhatsApp = () => {
    if (!appointment.clientPhone) return;
    const cleanPhone = appointment.clientPhone.replace(/\D/g, '');
    const message = encodeURIComponent(
      `Olá ${appointment.clientName}, aqui é o profissional ${professionalName || ''}. Confirmamos seu agendamento de ${appointment.serviceName} para ${time}. Tudo certo para o atendimento?`
    );
    const phoneWithDdi = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
    const url = `whatsapp://send?phone=${phoneWithDdi}&text=${message}`;
    const webUrl = `https://wa.me/${phoneWithDdi}?text=${message}`;

    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          return Linking.openURL(url);
        } else {
          return Linking.openURL(webUrl);
        }
      })
      .catch((err) => console.warn('Erro ao abrir WhatsApp:', err));
  };

  return (
    <Modal animationType={Platform.OS === 'web' ? 'fade' : 'slide'} onRequestClose={onClose} transparent visible={visible}>
      <Pressable accessibilityLabel="Fechar detalhes" onPress={onClose} style={styles.backdrop}>
        <Pressable
          accessibilityViewIsModal
          onPress={(event) => event.stopPropagation()}
          style={[styles.sheet, desktop ? styles.desktopSheet : styles.mobileSheet]}
          testID="appointment-detail-sheet"
        >
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>ATENDIMENTO</Text>
              <Text style={styles.title}>{appointment.clientName}</Text>
            </View>
            <Pressable accessibilityLabel="Fechar" onPress={onClose} style={styles.closeButton}>
              <X color={colors.textPrimary} size={20} />
            </Pressable>
          </View>
          <StatusBadge label={labelByStatus[appointment.status]} showDot testID="appointment-detail-status" tone={toneByStatus[appointment.status]} />
          <View style={styles.details}>
            <View style={styles.detailRow}><CalendarClock color={colors.textMuted} size={18} /><Text style={styles.detailText}>{time}</Text></View>
            <View style={styles.detailRow}><Scissors color={colors.textMuted} size={18} /><Text style={styles.detailText}>{appointment.serviceName}</Text></View>
            {professionalName ? <View style={styles.detailRow}><UserRound color={colors.textMuted} size={18} /><Text style={styles.detailText}>{professionalName}</Text></View> : null}
            {appointment.clientPhone ? (
              <Pressable accessibilityLabel="Enviar WhatsApp para cliente" onPress={handleWhatsApp} style={styles.whatsappRow}>
                <MessageCircle color="#2E7D32" size={18} />
                <Text style={styles.whatsappText}>WhatsApp ({appointment.clientPhone})</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.actions}>
            {canReschedule && onReschedule ? <AppButton label="Reagendar" onPress={() => onReschedule(appointment)} testID="appointment-detail-reschedule" variant="secondary" /> : null}
            {canComplete && onComplete ? <AppButton label={completeLabel} onPress={() => onComplete(appointment)} testID="appointment-detail-complete" /> : null}
            {canCancel && onCancel ? <AppButton label="Cancelar atendimento" onPress={() => onCancel(appointment)} testID="appointment-detail-cancel" variant="danger" /> : null}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(24,32,27,0.34)', flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, gap: spacing.xl, padding: spacing.xl, ...elevations.overlay },
  desktopSheet: { alignSelf: 'flex-end', borderBottomLeftRadius: radii.lg, borderTopLeftRadius: radii.lg, height: '100%', maxWidth: 440, width: '100%' },
  mobileSheet: { borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, maxHeight: '86%', paddingBottom: spacing.huge },
  header: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  headerCopy: { flex: 1, gap: spacing.xs },
  eyebrow: { ...typeScale.label, color: colors.brandPrimary, letterSpacing: 1.2 },
  title: { ...typeScale.sectionTitle, color: colors.textPrimary },
  closeButton: { alignItems: 'center', borderColor: colors.borderSubtle, borderRadius: radii.md, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 },
  details: { borderBottomColor: colors.borderSubtle, borderBottomWidth: 1, borderTopColor: colors.borderSubtle, borderTopWidth: 1, gap: spacing.md, paddingVertical: spacing.lg },
  detailRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  detailText: { ...typeScale.body, color: colors.textSecondary, flex: 1 },
  actions: { gap: spacing.sm, marginTop: 'auto' },
  whatsappRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: '#E8F5E9', padding: spacing.md, borderRadius: radii.md, marginTop: spacing.sm, borderWidth: 1, borderColor: '#C8E6C9' },
  whatsappText: { ...typeScale.bodyStrong, color: '#2E7D32', flex: 1 },
});
