import type { BusinessAgendaItem, BusinessScheduleBlock } from '@cutsync/database';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { getAgendaStatusLabel, getLocalDateInTimeZone } from '@/features/agenda/business-agenda';
import { businessTheme } from '@/theme/business-theme';

const START_MINUTE = 7 * 60;
const END_MINUTE = 21 * 60;
const SLOT_MINUTES = 30;
const SLOT_HEIGHT = 36;
const HEADER_HEIGHT = 48;
const TIMELINE_HEIGHT = ((END_MINUTE - START_MINUTE) / SLOT_MINUTES) * SLOT_HEIGHT;

export interface AgendaTimelineProfessional { id: string; name: string }

const localTimeParts = (value: string | Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(typeof value === 'string' ? new Date(value) : value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    minutes: Number(values.hour) * 60 + Number(values.minute),
  };
};

const localMinutes = (value: string | Date, timeZone: string) => localTimeParts(value, timeZone).minutes;

const positionFor = (startsAt: string, endsAt: string, timeZone: string, localDate: string) => {
  const startParts = localTimeParts(startsAt, timeZone);
  const endParts = localTimeParts(endsAt, timeZone);
  const start = startParts.date < localDate ? START_MINUTE : Math.max(START_MINUTE, startParts.minutes);
  const end = endParts.date > localDate ? END_MINUTE : Math.min(END_MINUTE, endParts.minutes);
  const top = ((start - START_MINUTE) / SLOT_MINUTES) * SLOT_HEIGHT;
  const height = Math.max(34, ((Math.max(end, start + SLOT_MINUTES) - start) / SLOT_MINUTES) * SLOT_HEIGHT - 4);
  return { top, height };
};

const timeLabel = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const blockLabel = (kind: BusinessScheduleBlock['kind']) => ({ break: 'Intervalo', time_off: 'Folga', blocked: 'Bloqueado' })[kind];

interface AgendaTimelineProps {
  localDate: string;
  timeZone: string;
  professionals: AgendaTimelineProfessional[];
  items: BusinessAgendaItem[];
  blocks: BusinessScheduleBlock[];
  teamMode: boolean;
  canCreateSlot: (professionalId: string) => boolean;
  onOpenAppointment: (id: string) => void;
  onOpenBlock: () => void;
  onEmptySlot: (time: string, professionalId: string) => void;
}

export function AgendaTimeline(props: AgendaTimelineProps) {
  const { width } = useWindowDimensions();
  const columnWidth = props.teamMode ? 220 : Math.max(260, Math.min(width - 92, 620));
  const slots = Array.from({ length: (END_MINUTE - START_MINUTE) / SLOT_MINUTES }, (_, index) => START_MINUTE + index * SLOT_MINUTES);
  const showNow = props.localDate === getLocalDateInTimeZone(props.timeZone);
  const nowMinutes = localMinutes(new Date(), props.timeZone);
  const nowTop = ((nowMinutes - START_MINUTE) / SLOT_MINUTES) * SLOT_HEIGHT;

  return (
    <View testID="business-agenda-timeline" style={styles.shell}>
      <View style={styles.axis}>
        <View style={styles.axisHeader} />
        <View style={styles.axisBody}>
          {slots.filter((minutes) => minutes % 60 === 0).map((minutes) => (
            <Text key={minutes} style={[styles.axisLabel, { top: ((minutes - START_MINUTE) / SLOT_MINUTES) * SLOT_HEIGHT - 7 }]}>{timeLabel(minutes)}</Text>
          ))}
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={props.teamMode} contentContainerStyle={styles.columns}>
        {props.professionals.map((professional) => (
          <View key={professional.id} testID={`business-agenda-column-${professional.id}`} style={[styles.column, { width: columnWidth }]}>
            <View style={styles.columnHeader}>
              <Text numberOfLines={1} style={styles.professionalName}>{professional.name}</Text>
              <Text style={styles.appointmentCount}>{props.items.filter((item) => item.professionalId === professional.id).length}</Text>
            </View>
            <View style={styles.timelineBody}>
              {slots.map((minutes) => (
                <Pressable
                  key={minutes}
                  testID={`business-agenda-slot-${professional.id}-${timeLabel(minutes).replace(':', '-')}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Agendar às ${timeLabel(minutes)} com ${professional.name}`}
                  disabled={!props.canCreateSlot(professional.id)}
                  onPress={() => props.onEmptySlot(timeLabel(minutes), professional.id)}
                  style={({ pressed }) => [styles.slot, { top: ((minutes - START_MINUTE) / SLOT_MINUTES) * SLOT_HEIGHT }, minutes % 60 === 0 && styles.hourSlot, pressed && props.canCreateSlot(professional.id) && styles.slotPressed]}
                />
              ))}
              {props.blocks.filter((block) => block.professionalId === professional.id).map((block) => {
                const position = positionFor(block.startsAt, block.endsAt, props.timeZone, props.localDate);
                return (
                  <Pressable key={block.id} testID={`business-agenda-block-${block.id}`} accessibilityRole="button" onPress={props.onOpenBlock} style={[styles.block, position]}>
                    <Text numberOfLines={1} style={styles.blockTitle}>{blockLabel(block.kind)}</Text>
                    <Text numberOfLines={2} style={styles.blockReason}>{block.reason ?? (block.allDay ? 'Dia inteiro' : 'Indisponível')}</Text>
                  </Pressable>
                );
              })}
              {props.items.filter((item) => item.professionalId === professional.id).map((item) => {
                const position = positionFor(item.startsAt, item.endsAt, props.timeZone, props.localDate);
                return (
                  <Pressable key={item.id} testID={`business-agenda-timeline-appointment-${item.id}`} accessibilityRole="button" accessibilityLabel={`Abrir atendimento de ${item.clientDisplayName}`} onPress={() => props.onOpenAppointment(item.id)} style={({ pressed }) => [styles.appointment, styles[`appointment_${item.status}`], position, pressed && styles.appointmentPressed]}>
                    <Text numberOfLines={1} style={styles.appointmentTime}>{timeLabel(localMinutes(item.startsAt, props.timeZone))} · {getAgendaStatusLabel(item.status)}</Text>
                    <Text numberOfLines={1} style={styles.clientName}>{item.clientDisplayName}</Text>
                    {position.height >= 58 ? <Text numberOfLines={1} style={styles.serviceName}>{item.serviceName}</Text> : null}
                  </Pressable>
                );
              })}
              {showNow && nowMinutes >= START_MINUTE && nowMinutes <= END_MINUTE ? (
                <View testID={`business-agenda-now-${professional.id}`} pointerEvents="none" style={[styles.nowLine, { top: nowTop }]}><View style={styles.nowDot} /></View>
              ) : null}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { minHeight: HEADER_HEIGHT + TIMELINE_HEIGHT, flexDirection: 'row', overflow: 'hidden', borderWidth: 1, borderColor: businessTheme.colors.border, borderRadius: businessTheme.radii.md, backgroundColor: businessTheme.colors.canvasRaised },
  axis: { width: 50, borderRightWidth: 1, borderColor: businessTheme.colors.border },
  axisHeader: { height: HEADER_HEIGHT, borderBottomWidth: 1, borderColor: businessTheme.colors.border },
  axisBody: { height: TIMELINE_HEIGHT, position: 'relative' },
  axisLabel: { position: 'absolute', right: 7, color: businessTheme.colors.textMuted, fontSize: 10, fontWeight: '700', fontVariant: ['tabular-nums'] },
  columns: { minWidth: '100%' },
  column: { borderRightWidth: 1, borderColor: businessTheme.colors.border },
  columnHeader: { height: HEADER_HEIGHT, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: businessTheme.spacing.xs, borderBottomWidth: 1, borderColor: businessTheme.colors.border, paddingHorizontal: businessTheme.spacing.sm, backgroundColor: businessTheme.colors.surface },
  professionalName: { ...businessTheme.typography.bodyStrong, color: businessTheme.colors.text, flex: 1 },
  appointmentCount: { ...businessTheme.typography.caption, color: businessTheme.colors.textMuted },
  timelineBody: { height: TIMELINE_HEIGHT, position: 'relative' },
  slot: { position: 'absolute', left: 0, right: 0, height: SLOT_HEIGHT, borderTopWidth: 1, borderColor: '#263229' },
  hourSlot: { borderColor: businessTheme.colors.borderStrong },
  slotPressed: { backgroundColor: businessTheme.colors.accentSoft },
  block: { position: 'absolute', left: 4, right: 4, zIndex: 2, overflow: 'hidden', borderLeftWidth: 3, borderLeftColor: businessTheme.colors.warning, borderRadius: businessTheme.radii.sm, padding: 6, backgroundColor: businessTheme.colors.warningSoft },
  blockTitle: { color: businessTheme.colors.warning, fontSize: 11, fontWeight: '900' },
  blockReason: { color: businessTheme.colors.textSoft, fontSize: 10, lineHeight: 13 },
  appointment: { position: 'absolute', left: 4, right: 4, zIndex: 3, overflow: 'hidden', borderLeftWidth: 3, borderRadius: businessTheme.radii.sm, padding: 6 },
  appointment_pending: { borderLeftColor: businessTheme.colors.warning, backgroundColor: '#362E1C' },
  appointment_confirmed: { borderLeftColor: businessTheme.colors.info, backgroundColor: businessTheme.colors.infoSoft },
  appointment_completed: { borderLeftColor: businessTheme.colors.success, backgroundColor: businessTheme.colors.successSoft },
  appointment_cancelled: { borderLeftColor: businessTheme.colors.danger, backgroundColor: businessTheme.colors.dangerSoft },
  appointment_no_show: { borderLeftColor: businessTheme.colors.danger, backgroundColor: businessTheme.colors.dangerSoft },
  appointmentPressed: { opacity: businessTheme.opacity.pressed, transform: [{ scale: 0.99 }] },
  appointmentTime: { color: businessTheme.colors.textSoft, fontSize: 9, fontWeight: '800' },
  clientName: { color: businessTheme.colors.text, fontSize: 12, fontWeight: '900' },
  serviceName: { color: businessTheme.colors.textSoft, fontSize: 10 },
  nowLine: { position: 'absolute', left: 0, right: 0, zIndex: 4, height: 2, backgroundColor: businessTheme.colors.danger },
  nowDot: { position: 'absolute', left: -4, top: -3, width: 8, height: 8, borderRadius: 4, backgroundColor: businessTheme.colors.danger },
});