import type { BusinessAvailableSlot } from '@/features/appointments/business-appointments-api';
import * as Haptics from 'expo-haptics';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BusinessNotice } from '@/components/ui/business-ui';
import { getLocalDateInTimeZone, shiftLocalDate } from '@/features/agenda/business-agenda';
import { businessTheme } from '@/theme/business-theme';

const formatDay = (localDate: string) => {
  const [year, month, day] = localDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return {
    weekday: new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' }).format(date).replace('.', ''),
    day: String(day).padStart(2, '0'),
  };
};

interface WalkInScheduleStepProps {
  localDate: string;
  timeZone: string;
  slots: BusinessAvailableSlot[];
  selectedStartsAt: string;
  isFetching: boolean;
  errorMessage: string | null;
  unavailableReason: string | null;
  onDateChange: (date: string) => void;
  onSlotSelect: (startsAt: string) => void;
}

export function WalkInScheduleStep(props: WalkInScheduleStepProps) {
  const today = getLocalDateInTimeZone(props.timeZone);
  const stripStart = props.localDate > shiftLocalDate(today, 2) ? shiftLocalDate(props.localDate, -2) : today;
  const dates = Array.from({ length: 7 }, (_, index) => shiftLocalDate(stripStart, index));
  const chooseSlot = (startsAt: string) => {
    void Haptics.selectionAsync().catch(() => undefined);
    props.onSlotSelect(startsAt);
  };

  return (
    <View testID="business-walk-in-schedule-step" style={styles.section}>
      <View style={styles.dateHeader}>
        <Pressable testID="business-walk-in-date-previous" accessibilityRole="button" accessibilityLabel="Dia anterior" disabled={props.localDate <= today} onPress={() => props.onDateChange(shiftLocalDate(props.localDate, -1))} style={({ pressed }) => [styles.arrow, props.localDate <= today && styles.disabled, pressed && styles.pressed]}>
          <ChevronLeft color={businessTheme.colors.text} size={22} />
        </Pressable>
        <Text testID="business-walk-in-selected-date" selectable style={styles.selectedDate}>
          {new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', timeZone: props.timeZone }).format(new Date(`${props.localDate}T12:00:00Z`))}
        </Text>
        <Pressable testID="business-walk-in-date-next" accessibilityRole="button" accessibilityLabel="Próximo dia" onPress={() => props.onDateChange(shiftLocalDate(props.localDate, 1))} style={({ pressed }) => [styles.arrow, pressed && styles.pressed]}>
          <ChevronRight color={businessTheme.colors.text} size={22} />
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateStrip}>
        {dates.map((date) => {
          const formatted = formatDay(date);
          const selected = date === props.localDate;
          return (
            <Pressable key={date} testID={`business-walk-in-date-${date}`} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => props.onDateChange(date)} style={({ pressed }) => [styles.date, selected && styles.dateSelected, pressed && styles.pressed]}>
              <Text style={[styles.weekday, selected && styles.dateTextSelected]}>{date === today ? 'Hoje' : formatted.weekday}</Text>
              <Text style={[styles.day, selected && styles.dateTextSelected]}>{formatted.day}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {props.isFetching ? <BusinessNotice testID="business-walk-in-slots-loading" message="Buscando horários livres…" /> : null}
      {props.errorMessage ? <BusinessNotice testID="business-walk-in-slots-error" tone="danger" message={props.errorMessage} /> : null}
      {!props.isFetching && !props.errorMessage && props.slots.length === 0 ? (
        <BusinessNotice testID="business-walk-in-slots-empty" message={props.unavailableReason ? 'Não há horários disponíveis para esta combinação.' : 'A agenda está cheia nesta data.'} />
      ) : null}
      <View testID="business-walk-in-slots" style={styles.slots}>
        {props.slots.map((slot) => {
          const selected = slot.startsAt === props.selectedStartsAt;
          return (
            <Pressable key={slot.startsAt} testID={`business-walk-in-slot-${slot.localTime.replace(':', '-')}`} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => chooseSlot(slot.startsAt)} style={({ pressed }) => [styles.slot, selected && styles.slotSelected, pressed && styles.pressed]}>
              <Text style={[styles.slotText, selected && styles.slotTextSelected]}>{slot.localTime}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: businessTheme.spacing.md },
  dateHeader: { flexDirection: 'row', alignItems: 'center', gap: businessTheme.spacing.sm },
  arrow: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: businessTheme.colors.border, borderRadius: businessTheme.radii.md, backgroundColor: businessTheme.colors.surface },
  selectedDate: { flex: 1, color: businessTheme.colors.text, fontSize: 15, fontWeight: '800', textAlign: 'center', textTransform: 'capitalize' },
  disabled: { opacity: businessTheme.opacity.disabled },
  pressed: { opacity: businessTheme.opacity.pressed, transform: [{ scale: 0.97 }] },
  dateStrip: { gap: businessTheme.spacing.xs },
  date: { width: 62, minHeight: 68, alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderColor: businessTheme.colors.border, borderRadius: businessTheme.radii.md, backgroundColor: businessTheme.colors.surface },
  dateSelected: { borderColor: businessTheme.colors.accentStrong, backgroundColor: businessTheme.colors.accentSoft },
  weekday: { ...businessTheme.typography.caption, color: businessTheme.colors.textMuted, textTransform: 'capitalize' },
  day: { color: businessTheme.colors.text, fontSize: 18, fontWeight: '900' },
  dateTextSelected: { color: businessTheme.colors.accentStrong },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: businessTheme.spacing.xs },
  slot: { minWidth: 78, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: businessTheme.colors.borderStrong, borderRadius: businessTheme.radii.sm, paddingHorizontal: businessTheme.spacing.md, backgroundColor: businessTheme.colors.surface },
  slotSelected: { borderColor: businessTheme.colors.accentStrong, backgroundColor: businessTheme.colors.accentStrong },
  slotText: { ...businessTheme.typography.bodyStrong, color: businessTheme.colors.text },
  slotTextSelected: { color: businessTheme.colors.canvas },
});