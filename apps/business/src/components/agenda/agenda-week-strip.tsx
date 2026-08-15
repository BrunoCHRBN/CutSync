import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { businessTheme } from '@/theme/business-theme';

const dateParts = (localDate: string) => {
  const [year, month, day] = localDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return {
    day: String(day).padStart(2, '0'),
    weekday: new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' }).format(date).replace('.', ''),
  };
};

interface AgendaWeekStripProps {
  dates: string[];
  selectedDate: string;
  today: string;
  counts: Record<string, number>;
  isFetching: boolean;
  onSelectDate: (date: string) => void;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
}

export function AgendaWeekStrip(props: AgendaWeekStripProps) {
  const maxCount = Math.max(1, ...Object.values(props.counts));
  return (
    <View testID="business-agenda-week-strip" style={styles.section}>
      <View style={styles.toolbar}>
        <Pressable testID="business-agenda-previous-week" accessibilityRole="button" accessibilityLabel="Semana anterior" onPress={props.onPreviousWeek} style={({ pressed }) => [styles.arrow, pressed && styles.pressed]}>
          <ChevronLeft color={businessTheme.colors.text} size={21} />
        </Pressable>
        <Pressable testID="business-agenda-go-today" accessibilityRole="button" onPress={props.onToday} style={({ pressed }) => [styles.todayButton, pressed && styles.pressed]}>
          <Text style={styles.todayLabel}>Hoje</Text>
        </Pressable>
        <Pressable testID="business-agenda-next-week" accessibilityRole="button" accessibilityLabel="Próxima semana" onPress={props.onNextWeek} style={({ pressed }) => [styles.arrow, pressed && styles.pressed]}>
          <ChevronRight color={businessTheme.colors.text} size={21} />
        </Pressable>
      </View>
      <View accessibilityRole="radiogroup" style={styles.days}>
        {props.dates.map((date) => {
          const selected = date === props.selectedDate;
          const parts = dateParts(date);
          const count = props.counts[date] ?? 0;
          return (
            <Pressable key={date} testID={`business-agenda-date-${date}`} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => props.onSelectDate(date)} style={({ pressed }) => [styles.day, selected && styles.daySelected, pressed && styles.pressed]}>
              <Text style={[styles.weekday, selected && styles.textSelected]}>{date === props.today ? 'Hoje' : parts.weekday}</Text>
              <Text style={[styles.dayNumber, selected && styles.textSelected]}>{parts.day}</Text>
              <View style={styles.occupancyTrack}>
                <View style={[styles.occupancyFill, { width: props.isFetching ? '20%' : `${Math.max(count ? 24 : 0, (count / maxCount) * 100)}%` }]} />
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: businessTheme.spacing.sm },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  arrow: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: businessTheme.colors.border, borderRadius: businessTheme.radii.md, backgroundColor: businessTheme.colors.surface },
  todayButton: { minHeight: 48, justifyContent: 'center', borderWidth: 1, borderColor: businessTheme.colors.borderStrong, borderRadius: businessTheme.radii.pill, paddingHorizontal: businessTheme.spacing.lg, backgroundColor: businessTheme.colors.surfaceRaised },
  todayLabel: { ...businessTheme.typography.bodyStrong, color: businessTheme.colors.text },
  days: { flexDirection: 'row', gap: 5 },
  day: { flex: 1, minWidth: 0, minHeight: 78, alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderColor: businessTheme.colors.border, borderRadius: businessTheme.radii.sm, backgroundColor: businessTheme.colors.surface },
  daySelected: { borderColor: businessTheme.colors.accentStrong, backgroundColor: businessTheme.colors.accentSoft },
  pressed: { opacity: businessTheme.opacity.pressed, transform: [{ scale: 0.97 }] },
  weekday: { color: businessTheme.colors.textMuted, fontSize: 9, fontWeight: '800', textTransform: 'capitalize' },
  dayNumber: { color: businessTheme.colors.text, fontSize: 17, fontWeight: '900' },
  textSelected: { color: businessTheme.colors.accentStrong },
  occupancyTrack: { width: '58%', height: 3, overflow: 'hidden', borderRadius: 2, backgroundColor: businessTheme.colors.border },
  occupancyFill: { height: 3, borderRadius: 2, backgroundColor: businessTheme.colors.success },
});