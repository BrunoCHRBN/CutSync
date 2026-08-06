import type { BusinessAgendaItem } from '@cutsync/database';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  formatAgendaTime,
  getAgendaStatusLabel,
} from '@/features/agenda/business-agenda';
import { businessTheme } from '@/theme/business-theme';
import { BusinessCard, BusinessPill } from '@/components/ui/business-ui';

export function AppointmentCard({
  item,
  timeZone,
  testID,
  onPress,
  accessibilityLabel,
}: {
  item: BusinessAgendaItem;
  timeZone: string;
  testID?: string;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const tone = item.status === 'completed'
    ? 'success'
    : item.status === 'cancelled'
      ? 'danger'
      : item.status === 'pending'
        ? 'warning'
        : 'neutral';

  const content = (
    <>
      <View style={styles.timeColumn}>
        <Text selectable style={styles.time}>
          {formatAgendaTime(item.startsAt, timeZone)}
        </Text>
        <Text selectable style={styles.endTime}>
          {formatAgendaTime(item.endsAt, timeZone)}
        </Text>
      </View>
      <View style={styles.copy}>
        <Text selectable numberOfLines={1} style={styles.client}>{item.clientDisplayName}</Text>
        <Text selectable numberOfLines={1} style={styles.service}>{item.serviceName}</Text>
        <Text selectable numberOfLines={1} style={styles.professional}>{item.professionalName}</Text>
      </View>
      <BusinessPill label={getAgendaStatusLabel(item.status)} tone={tone} />
    </>
  );

  if (onPress) {
    return (
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? `Abrir atendimento de ${item.clientDisplayName}`}
        onPress={onPress}
        style={({ pressed }) => [
          styles.pressable,
          pressed && styles.pressed,
        ]}
      >
        <BusinessCard style={styles.card}>
          {content}
        </BusinessCard>
      </Pressable>
    );
  }

  return (
    <BusinessCard testID={testID} style={styles.card}>
      {content}
    </BusinessCard>
  );
}

const styles = StyleSheet.create({
  pressable: {
    minHeight: 44,
  },
  pressed: {
    opacity: 0.88,
  },
  card: { flexDirection: 'row', alignItems: 'center', gap: businessTheme.spacing.md },
  timeColumn: { width: 52, gap: 2 },
  time: {
    color: businessTheme.colors.accentStrong,
    fontSize: 17,
    lineHeight: 21,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  endTime: {
    color: businessTheme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  client: { color: businessTheme.colors.text, fontSize: 14, fontWeight: '800' },
  service: { color: businessTheme.colors.textSoft, fontSize: 12, fontWeight: '600' },
  professional: { color: businessTheme.colors.textMuted, fontSize: 11 },
});
