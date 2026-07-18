import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { RefreshCw, X } from 'lucide-react-native';
import { DashboardAppointment } from '../../types/dashboard';
import { colors, radii, typography } from '../../theme/tokens';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';

interface ProfessionalRescheduleProps {
  appointment: DashboardAppointment | null;
  onClose: () => void;
  dates: Date[];
  selectedDate: Date;
  onDateChange: (value: Date) => void;
  times: string[];
  occupiedTimes: string[];
  selectedTime: string | null;
  onTimeChange: (value: string) => void;
  primaryColor: string;
  foregroundColor: string;
  loading: boolean;
  onSubmit: () => void;
}

export const ProfessionalReschedule = ({ appointment, onClose, dates, selectedDate, onDateChange, times, occupiedTimes, selectedTime, onTimeChange, primaryColor, foregroundColor, loading, onSubmit }: ProfessionalRescheduleProps) => (
  <Modal visible={!!appointment} transparent animationType="fade" onRequestClose={onClose}>
    <View testID="barber-reschedule-modal" style={styles.overlay}>
      <AppCard testID="barber-reschedule-card" style={styles.card} elevated>
        <View style={styles.header}><View><Text testID="barber-reschedule-eyebrow" style={[styles.eyebrow, { color: primaryColor }]}>REAGENDAMENTO</Text><Text testID="barber-reschedule-title" style={styles.title}>Reagendar atendimento</Text></View><Pressable testID="barber-reschedule-close-button" onPress={onClose} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}><X color={colors.textSecondary} size={18} /></Pressable></View>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text testID="barber-reschedule-summary" style={styles.summary}>Reagendando <Text style={styles.strong}>{appointment?.clientName}</Text> para <Text style={styles.strong}>{appointment?.serviceName}</Text>.</Text>
          <Text testID="barber-reschedule-date-label" style={styles.label}>Selecione o novo dia</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateList}>{dates.map((date) => {
            const id = date.toISOString().split('T')[0]; const selected = selectedDate.toDateString() === date.toDateString();
            return <Pressable key={id} testID={`barber-reschedule-date-${id}`} onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onDateChange(date); }} style={({ pressed }) => [styles.dateCard, selected && { backgroundColor: primaryColor }, pressed && styles.pressed]}><Text testID={`barber-reschedule-date-${id}-weekday`} style={[styles.dateWeek, selected && { color: foregroundColor }]}>{date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</Text><Text testID={`barber-reschedule-date-${id}-day`} style={[styles.dateDay, selected && { color: foregroundColor }]}>{date.getDate()}</Text></Pressable>;
          })}</ScrollView>
          <Text testID="barber-reschedule-time-label" style={styles.label}>Selecione o novo horário</Text>
          <View style={styles.timeGrid}>{times.map((slot) => {
            const occupied = occupiedTimes.includes(slot); const selected = selectedTime === slot;
            return <Pressable key={slot} testID={`barber-reschedule-time-${slot.replace(':', '-')}`} disabled={occupied} onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onTimeChange(slot); }} style={({ pressed }) => [styles.timeSlot, selected && { backgroundColor: primaryColor, borderColor: primaryColor }, occupied && styles.occupied, pressed && styles.pressed]}><Text testID={`barber-reschedule-time-${slot.replace(':', '-')}-label`} style={[styles.timeText, selected && { color: foregroundColor }, occupied && styles.occupiedText]}>{slot}</Text></Pressable>;
          })}</View>
          <AppButton label="Confirmar reagendamento" testID="barber-reschedule-submit-button" onPress={onSubmit} loading={loading} disabled={!selectedTime} fullWidth icon={<RefreshCw color={foregroundColor} size={16} />} foregroundColor={foregroundColor} style={{ backgroundColor: primaryColor, borderColor: primaryColor }} />
        </ScrollView>
      </AppCard>
    </View>
  </Modal>
);

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000000C9', padding: 18 },
  card: { width: '100%', maxWidth: 640, maxHeight: '90%', padding: 0, overflow: 'hidden' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
  eyebrow: { fontFamily: typography.bodyStrong, fontSize: 8, letterSpacing: 1.6 },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 20, letterSpacing: -0.6, marginTop: 5 },
  closeButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfacePressed, borderRadius: radii.md },
  content: { padding: 20, gap: 15 },
  summary: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12 },
  strong: { fontFamily: typography.bodyStrong, color: colors.text },
  label: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8 },
  dateList: { gap: 8, paddingVertical: 14 },
  dateCard: { width: 62, alignItems: 'center', paddingVertical: 10, borderRadius: radii.md },
  dateWeek: { color: colors.textMuted, fontFamily: typography.bodyStrong, fontSize: 9, textTransform: 'uppercase' },
  dateDay: { color: colors.text, fontFamily: typography.display, fontSize: 18, marginTop: 4 },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeSlot: { width: '23%', height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md },
  timeText: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 10 },
  occupied: { opacity: 0.3, borderColor: 'transparent' },
  occupiedText: { color: colors.textMuted, textDecorationLine: 'line-through' },
  pressed: { transform: [{ scale: 0.97 }] },
});