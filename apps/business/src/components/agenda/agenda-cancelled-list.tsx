import type { BusinessAgendaItem } from '@cutsync/database';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppointmentCard } from '@/components/operations/appointment-card';
import { businessTheme } from '@/theme/business-theme';

export function AgendaCancelledList({ items, timeZone, onOpen }: { items: BusinessAgendaItem[]; timeZone: string; onOpen: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;
  return (
    <View testID="business-agenda-cancelled" style={styles.section}>
      <Pressable testID="business-agenda-cancelled-toggle" accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded((value) => !value)} style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}>
        <Text style={styles.label}>Cancelados e ausências · {items.length}</Text>
        {expanded ? <ChevronUp color={businessTheme.colors.textMuted} size={19} /> : <ChevronDown color={businessTheme.colors.textMuted} size={19} />}
      </Pressable>
      {expanded ? (
        <View style={styles.list}>
          {items.map((item) => <AppointmentCard key={item.id} testID={`business-agenda-cancelled-${item.id}`} item={item} timeZone={timeZone} onPress={() => onOpen(item.id)} />)}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: businessTheme.spacing.sm },
  toggle: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderBottomWidth: 1, borderColor: businessTheme.colors.border, paddingVertical: businessTheme.spacing.sm },
  pressed: { opacity: businessTheme.opacity.pressed },
  label: { ...businessTheme.typography.bodyStrong, color: businessTheme.colors.textSoft },
  list: { gap: businessTheme.spacing.sm },
});