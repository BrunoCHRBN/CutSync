import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshCw, X } from 'lucide-react-native';
import { DashboardAppointment, DashboardDateOption } from '../../types/dashboard';
import { colors, radii, typography } from '../../theme/tokens';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';

interface AdminRescheduleProps {
  appointment: DashboardAppointment | null;
  onClose: () => void;
  dates: DashboardDateOption[];
  selectedDate: Date;
  onDateChange: (value: Date) => void;
  times: string[];
  occupiedTimes: string[];
  selectedTime: string | null;
  onTimeChange: (value: string) => void;
  loading: boolean;
  onSubmit: () => void;
}

export const AdminReschedule = ({ appointment, onClose, dates, selectedDate, onDateChange, times, occupiedTimes, selectedTime, onTimeChange, loading, onSubmit }: AdminRescheduleProps) => (
  <Modal visible={!!appointment} transparent animationType="fade" onRequestClose={onClose}>
    <View testID="admin-reschedule-modal" style={styles.overlay}>
      <AppCard testID="admin-reschedule-card" style={styles.card} elevated>
        <View style={styles.header}>
          <View><Text style={styles.eyebrow}>REAGENDAMENTO</Text><Text testID="admin-reschedule-title" style={styles.title}>Reagendar atendimento</Text></View>
          <Pressable testID="admin-reschedule-close-button" onPress={onClose} style={styles.closeButton}><X color={colors.textSecondary} size={18} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text testID="admin-reschedule-summary" style={styles.summary}>Reagendando <Text style={styles.strong}>{appointment?.clientName}</Text> para <Text style={styles.strong}>{appointment?.serviceName}</Text>.</Text>
          <Text style={styles.label}>Selecione o novo dia</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateList}>{dates.map((option) => {
            const selected = selectedDate.toDateString() === option.date.toDateString();
            return <Pressable key={option.id} testID={`admin-reschedule-date-${option.id}`} onPress={() => onDateChange(option.date)} style={[styles.dateItem, selected && styles.selected]}><Text style={[styles.dateWeek, selected && styles.selectedText]}>{option.weekDay}</Text><Text style={[styles.dateDay, selected && styles.selectedText]}>{option.day}</Text></Pressable>;
          })}</ScrollView>
          <Text style={styles.label}>Selecione o novo horário</Text>
          <View style={styles.timeGrid}>{times.map((slot) => {
            const occupied = occupiedTimes.includes(slot);
            const selected = selectedTime === slot;
            return <Pressable key={slot} testID={`admin-reschedule-time-${slot.replace(':', '-')}`} disabled={occupied} onPress={() => onTimeChange(slot)} style={[styles.timeSlot, selected && styles.selected, occupied && styles.occupied]}><Text style={[styles.timeText, selected && styles.selectedText, occupied && styles.occupiedText]}>{slot}</Text></Pressable>;
          })}</View>
          <AppButton label="Confirmar reagendamento" testID="admin-reschedule-submit-button" onPress={onSubmit} loading={loading} disabled={!selectedTime} fullWidth variant="admin" icon={<RefreshCw color={colors.white} size={16} />} />
        </ScrollView>
      </AppCard>
    </View>
  </Modal>
);

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15, 15, 18, 0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 520, maxHeight: '90%', padding: 0 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
  eyebrow: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 11, letterSpacing: 1.5 },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 18, marginTop: 4 },
  closeButton: { padding: 4, borderRadius: radii.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  content: { padding: 20, gap: 16 },
  summary: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12 },
  strong: { fontFamily: typography.bodyStrong, color: colors.text },
  label: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 11, marginTop: 4 },
  dateList: { flexDirection: 'row', gap: 8, marginTop: 2 },
  dateItem: { minWidth: 54, alignItems: 'center', paddingVertical: 11, backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border },
  dateWeek: { color: colors.textMuted, fontFamily: typography.bodyStrong, fontSize: 11 },
  dateDay: { color: colors.text, fontFamily: typography.display, fontSize: 17, marginTop: 3 },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  timeSlot: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  timeText: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 11 },
  selected: { backgroundColor: colors.accent, borderColor: colors.accent },
  selectedText: { color: colors.white },
  occupied: { backgroundColor: '#ff444408', borderColor: '#ff444422', opacity: 0.5 },
  occupiedText: { color: '#ff444470', textDecorationLine: 'line-through' },
});
