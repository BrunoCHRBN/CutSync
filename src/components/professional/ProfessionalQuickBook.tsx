import React from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Plus, Scissors, UserRound, X } from 'lucide-react-native';
import { ServiceRecord } from '../../types/database';
import { colors, radii, typography } from '../../theme/tokens';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';
import { AppInput } from '../ui/AppInput';
import { ChoiceCard } from '../ui/ChoiceCard';
import { InlineNotice } from '../ui/InlineNotice';
import { formatCalendarDate } from '../../utils/dateTime';

interface ProfessionalQuickBookProps {
  visible: boolean;
  onClose: () => void;
  clientName: string;
  onClientNameChange: (value: string) => void;
  dates: Date[];
  selectedDate: Date;
  onDateChange: (value: Date) => void;
  services: ServiceRecord[];
  selectedService: string | null;
  onServiceChange: (value: string) => void;
  times: string[];
  availabilityLoading: boolean;
  availabilityError: string | null;
  availabilityEmptyMessage: string;
  selectedTime: string | null;
  onTimeChange: (value: string) => void;
  primaryColor: string;
  foregroundColor: string;
  currency: (value: number) => string;
  loading: boolean;
  submitDisabled: boolean;
  onSubmit: () => void;
}

export const ProfessionalQuickBook = ({ visible, onClose, clientName, onClientNameChange, dates, selectedDate, onDateChange, services, selectedService, onServiceChange, times, availabilityLoading, availabilityError, availabilityEmptyMessage, selectedTime, onTimeChange, primaryColor, foregroundColor, currency, loading, submitDisabled, onSubmit }: ProfessionalQuickBookProps) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <KeyboardAvoidingView testID="barber-quick-booking-modal" style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <AppCard testID="barber-quick-booking-card" style={styles.card} elevated>
        <View style={styles.header}>
          <View><Text testID="barber-quick-booking-eyebrow" style={[styles.eyebrow, { color: primaryColor }]}>ENCAIXE RÁPIDO</Text><Text testID="barber-quick-booking-title" style={styles.title}>Reservar um horário</Text></View>
          <Pressable testID="barber-quick-booking-close-button" onPress={onClose} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}><X color={colors.textSecondary} size={18} /></Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <AppInput label="Nome do cliente" testID="barber-quick-client-input" icon={<UserRound color={colors.textMuted} size={17} />} value={clientName} onChangeText={onClientNameChange} placeholder="Cliente de balcão" />
          <Text testID="barber-quick-date-label" style={styles.label}>Selecione o dia</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateList}>{dates.map((date) => {
            const id = formatCalendarDate(date);
            const selected = selectedDate.toDateString() === date.toDateString();
            return <Pressable key={id} testID={`barber-quick-date-${id}`} onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onDateChange(date); }} style={({ pressed }) => [styles.dateCard, selected && { backgroundColor: primaryColor }, pressed && styles.pressed]}><Text testID={`barber-quick-date-${id}-weekday`} style={[styles.dateWeek, selected && { color: foregroundColor }]}>{date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</Text><Text testID={`barber-quick-date-${id}-day`} style={[styles.dateDay, selected && { color: foregroundColor }]}>{date.getDate()}</Text></Pressable>;
          })}</ScrollView>
          <Text testID="barber-quick-service-label" style={styles.label}>Serviço</Text>
          <View style={styles.choiceGrid}>{services.map((service) => <ChoiceCard key={service.id} testID={`barber-quick-service-${service.id}`} title={service.name} subtitle={`${service.durationMinutes} min`} meta={currency(service.price)} selected={selectedService === service.id} activeColor={primaryColor} activeForegroundColor={foregroundColor} onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onServiceChange(service.id); }} icon={<Scissors color={colors.textSecondary} size={15} />} style={styles.choiceCard} />)}</View>
          <Text testID="barber-quick-time-label" style={styles.label}>Horário em {selectedDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</Text>
          {!selectedService ? <InlineNotice testID="barber-quick-availability-empty" tone="info" message="Selecione um serviço para consultar os horários." /> : availabilityLoading ? <View testID="barber-quick-availability-loading" style={styles.loadingState}><ActivityIndicator color={primaryColor} /><Text testID="barber-quick-availability-loading-label" style={styles.loadingText}>Consultando horários disponíveis...</Text></View> : availabilityError ? <InlineNotice testID="barber-quick-availability-error" tone="danger" message={availabilityError} /> : times.length === 0 ? <InlineNotice testID="barber-quick-availability-empty" tone="info" message={availabilityEmptyMessage || 'Nenhum horário disponível nesta data.'} /> : <><>{selectedTime && !times.includes(selectedTime) ? <InlineNotice testID="barber-quick-selected-time-unavailable" tone="danger" message={`O horário ${selectedTime} não está disponível para este serviço.`} /> : null}</><View testID="barber-quick-time-grid" style={styles.timeGrid}>{times.map((slot) => {
            const selected = selectedTime === slot;
            return <Pressable key={slot} testID={`barber-quick-time-${slot.replace(':', '-')}`} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onTimeChange(slot); }} style={({ pressed }) => [styles.timeSlot, selected && { backgroundColor: primaryColor, borderColor: primaryColor }, pressed && styles.pressed]}><Text testID={`barber-quick-time-${slot.replace(':', '-')}-label`} style={[styles.timeText, selected && { color: foregroundColor }]}>{slot}</Text></Pressable>;
          })}</View></>}
          <AppButton label="Criar encaixe" testID="barber-quick-submit-button" onPress={onSubmit} loading={loading} disabled={submitDisabled} fullWidth icon={<Plus color={foregroundColor} size={16} />} foregroundColor={foregroundColor} style={{ backgroundColor: primaryColor, borderColor: primaryColor }} />
        </ScrollView>
      </AppCard>
    </KeyboardAvoidingView>
  </Modal>
);

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000000C9', padding: 18 },
  card: { width: '100%', maxWidth: 640, maxHeight: '90%', padding: 0, overflow: 'hidden' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
  eyebrow: { fontFamily: typography.bodyStrong, fontSize: 11, letterSpacing: 1.6 },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 20, letterSpacing: -0.6, marginTop: 5 },
  closeButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfacePressed, borderRadius: radii.md },
  content: { padding: 20, gap: 15 },
  label: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 },
  dateList: { gap: 8, paddingVertical: 14 },
  dateCard: { width: 62, alignItems: 'center', paddingVertical: 10, borderRadius: radii.md },
  dateWeek: { color: colors.textMuted, fontFamily: typography.bodyStrong, fontSize: 11, textTransform: 'uppercase' },
  dateDay: { color: colors.text, fontFamily: typography.display, fontSize: 18, marginTop: 4 },
  choiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choiceCard: { width: '47%', minWidth: 150, flexGrow: 1 },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeSlot: { width: '23%', height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md },
  timeText: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 11 },
  loadingState: { minHeight: 70, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 11 },
  pressed: { transform: [{ scale: 0.97 }] },
});
