import React from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Clock, Plus, Scissors, UserRound, X, Zap } from 'lucide-react-native';
import { DashboardDateOption } from '../../types/dashboard';
import { ProfileRecord, ServiceRecord } from '@cutsync/database';
import { colors, glassBadge, glassSurface, radii, typography } from '../../theme/tokens';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';
import { AppInput } from '../ui/AppInput';
import { ChoiceCard } from '../ui/ChoiceCard';

interface AdminQuickBookProps {
  visible: boolean;
  onClose: () => void;
  clientName: string;
  onClientNameChange: (value: string) => void;
  barbers: ProfileRecord[];
  selectedBarber: string | null;
  onBarberChange: (value: string) => void;
  dates: DashboardDateOption[];
  selectedDate: Date;
  onDateChange: (value: Date) => void;
  services: ServiceRecord[];
  selectedService: string | null;
  onServiceChange: (value: string) => void;
  times: string[];
  occupiedTimes: string[];
  selectedTime: string | null;
  onTimeChange: (value: string) => void;
  currency: (value: number) => string;
  loading: boolean;
  onSubmit: () => void;
}

export const AdminQuickBook = ({
  visible,
  onClose,
  clientName,
  onClientNameChange,
  barbers,
  selectedBarber,
  onBarberChange,
  dates,
  selectedDate,
  onDateChange,
  services,
  selectedService,
  onServiceChange,
  times,
  occupiedTimes,
  selectedTime,
  onTimeChange,
  currency,
  loading,
  onSubmit,
}: AdminQuickBookProps) => {
  const selectedServiceObj = services.find((s) => s.id === selectedService);
  const duration = selectedServiceObj?.durationMinutes || 0;

  const calculateEndTime = (startTimeStr: string, durationMinutes: number) => {
    const [h, m] = startTimeStr.split(':').map(Number);
    const total = h * 60 + m + durationMinutes;
    const endH = String(Math.floor(total / 60) % 24).padStart(2, '0');
    const endM = String(total % 60).padStart(2, '0');
    return `${endH}:${endM}`;
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View testID="admin-quick-booking-modal" style={styles.overlay}>
        <AppCard testID="admin-quick-booking-card" style={styles.card} elevated>
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>ENCAIXE ADMINISTRATIVO</Text>
              <Text testID="admin-quick-booking-title" style={styles.title}>Reservar um horário</Text>
            </View>
            <Pressable testID="admin-quick-booking-close-button" onPress={onClose} style={styles.closeButton}>
              <X color={colors.textSecondary} size={18} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.clientSection}>
              <AppInput label="Nome do cliente" testID="admin-quick-client-input" icon={<UserRound color={colors.textMuted} size={17} />} value={clientName} onChangeText={onClientNameChange} placeholder="Ex: Cliente de balcão" />
              <Pressable onPress={() => onClientNameChange('Cliente de Balcão')} style={styles.quickClientChip}>
                <Zap size={13} color={colors.brandPrimary} />
                <Text style={styles.quickClientText}>⚡ Cliente de Balcão (Avulso)</Text>
              </Pressable>
            </View>

            <Text style={styles.label}>Profissional</Text>
            <View style={styles.choiceGrid}>
              {barbers.map((barber) => (
                <ChoiceCard key={barber.id} testID={`admin-quick-barber-${barber.id}`} title={barber.name} subtitle={barber.role === 'admin' ? 'Proprietário' : 'Barbeiro'} selected={selectedBarber === barber.id} onPress={() => onBarberChange(barber.id)} icon={<UserRound color={colors.textSecondary} size={15} />} style={styles.choiceCard} />
              ))}
            </View>

            <Text style={styles.label}>Selecione o dia</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateList}>
              {dates.map((option) => {
                const selected = selectedDate.toDateString() === option.date.toDateString();
                return (
                  <Pressable key={option.id} testID={`admin-quick-date-${option.id}`} onPress={() => onDateChange(option.date)} style={[styles.dateItem, selected && styles.selected]}>
                    <Text style={[styles.dateWeek, selected && styles.selectedText]}>{option.weekDay}</Text>
                    <Text style={[styles.dateDay, selected && styles.selectedText]}>{option.day}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={styles.label}>Serviço</Text>
            <View style={styles.choiceGrid}>
              {services.map((service) => (
                <ChoiceCard key={service.id} testID={`admin-quick-service-${service.id}`} title={service.name} subtitle={`${service.durationMinutes} min`} meta={currency(service.price)} selected={selectedService === service.id} onPress={() => onServiceChange(service.id)} icon={<Scissors color={colors.textSecondary} size={15} />} style={styles.choiceCard} />
              ))}
            </View>

            <Text style={styles.label}>Horário em {selectedDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</Text>
            <View style={styles.timeGrid}>
              {times.map((slot) => {
                const occupied = occupiedTimes.includes(slot);
                const selected = selectedTime === slot;
                return (
                  <Pressable key={slot} testID={`admin-quick-time-${slot.replace(':', '-')}`} disabled={occupied} onPress={() => onTimeChange(slot)} style={({ pressed }) => [styles.timeSlot, selected && styles.selected, occupied && styles.occupied, pressed && styles.pressed]}>
                    <Text style={[styles.timeText, selected && styles.selectedText, occupied && styles.occupiedText]}>{slot}</Text>
                  </Pressable>
                );
              })}
            </View>

            {selectedTime && duration > 0 ? (
              <View style={styles.endTimeBanner}>
                <Clock size={15} color={colors.brandPrimary} />
                <Text style={styles.endTimeText}>
                  Atendimento previsto: <Text style={{ fontFamily: typography.bodyStrong, color: colors.textPrimary }}>{selectedTime} → {calculateEndTime(selectedTime, duration)}</Text> ({duration} min)
                </Text>
              </View>
            ) : null}

            <AppButton label="Criar agendamento" testID="admin-quick-submit-button" onPress={onSubmit} loading={loading} fullWidth variant="admin" icon={<Plus color={colors.white} size={16} />} style={{ marginTop: 4 }} />
          </ScrollView>
        </AppCard>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 15, 18, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    ...Platform.select({
      web: { backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' } as any,
      default: {},
    }),
  },
  card: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '90%',
    padding: 0,
    ...glassSurface,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
  eyebrow: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 11, letterSpacing: 1.5 },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 18, marginTop: 4 },
  closeButton: { padding: 4, borderRadius: radii.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  content: { padding: 20, gap: 16 },
  clientSection: { gap: 6 },
  quickClientChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: colors.brandSecondarySoft,
    borderWidth: 1,
    borderColor: colors.brandSecondary,
    marginTop: 2,
  },
  quickClientText: { color: colors.brandPrimary, fontFamily: typography.bodyStrong, fontSize: 11 },
  label: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 11, marginTop: 4 },
  choiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choiceCard: { flex: 1, minWidth: 140 },
  dateList: { flexDirection: 'row', gap: 8, marginTop: 2 },
  dateItem: { minWidth: 54, alignItems: 'center', paddingVertical: 11, backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, ...glassBadge },
  dateWeek: { color: colors.textMuted, fontFamily: typography.bodyStrong, fontSize: 11 },
  dateDay: { color: colors.text, fontFamily: typography.display, fontSize: 17, marginTop: 3 },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  timeSlot: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, ...glassBadge },
  timeText: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 11 },
  endTimeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: radii.md,
    backgroundColor: colors.brandSecondarySoft,
    borderWidth: 1,
    borderColor: colors.brandSecondary,
  },
  endTimeText: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12 },
  selected: { backgroundColor: colors.accent, borderColor: colors.accent },
  selectedText: { color: colors.white },
  occupied: { backgroundColor: '#ff444408', borderColor: '#ff444422', opacity: 0.5 },
  occupiedText: { color: '#ff444470', textDecorationLine: 'line-through' },
  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
});
