import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { CalendarClock, ChevronLeft, ChevronRight, Eye, EyeOff, LockKeyhole, Plus } from 'lucide-react-native';
import { colors, layout, radii, spacing, typeScale } from '../../theme/tokens';
import { AppButton } from '../ui/AppButton';
import { InlineNotice } from '../ui/InlineNotice';
import { SegmentedControl } from '../ui/SegmentedControl';
import { StatusBadge } from '../ui/StatusBadge';
import {
  buildCalendarRange,
  calculateEventGeometry,
  isSameCalendarDay,
  minutesOfDay,
  SLOT_HEIGHT,
  SLOT_MINUTES,
  zonedDateAtMinute,
} from './calendar-math';

export type CalendarView = 'mine' | 'team';

export interface CalendarResource {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

export interface CalendarAppointment {
  id: string;
  professionalId: string;
  clientName: string;
  serviceName: string;
  startsAt: Date;
  endsAt: Date;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  price?: number;
  clientPhone?: string;
}

export interface CalendarBlock {
  id: string;
  professionalId: string;
  startsAt: Date;
  endsAt: Date;
  kind: 'break' | 'time_off' | 'blocked';
  reason?: string | null;
}

export interface CalendarSlotSelection {
  professionalId: string;
  startsAt: Date;
}

interface OperationalCalendarProps {
  date: Date;
  timezone?: string;
  resources: CalendarResource[];
  appointments: CalendarAppointment[];
  blocks?: CalendarBlock[];
  view?: CalendarView;
  ownProfessionalId?: string;
  loading?: boolean;
  error?: string | null;
  closed?: boolean;
  showFinished?: boolean;
  allowTeamView?: boolean;
  canManageTeam?: boolean;
  workingHours?: { start: string; end: string } | null;
  syncState?: 'live' | 'syncing' | 'offline';
  testID?: string;
  onViewChange?: (view: CalendarView) => void;
  onDateChange?: (date: Date) => void;
  onToggleFinished?: () => void;
  onRetry?: () => void;
  onSlotPress?: (selection: CalendarSlotSelection) => void;
  onAppointmentPress?: (appointment: CalendarAppointment) => void;
  onBlockPress?: (block: CalendarBlock) => void;
  onManageTeam?: () => void;
  legacyTestIDs?: {
    panel?: string;
    previousDay?: string;
    nextDay?: string;
    today?: string;
    view?: string;
    loading?: string;
    empty?: string;
  };
}

const TIME_GUTTER_WIDTH = 64;
const RESOURCE_MIN_WIDTH = 220;

const statusConfig: Record<CalendarAppointment['status'], { label: string; background: string; border: string; text: string }> = {
  pending: { label: 'Pendente', background: colors.warningSoft, border: '#DCA45E', text: colors.warning },
  confirmed: { label: 'Confirmado', background: colors.infoSoft, border: '#88A5CE', text: colors.info },
  completed: { label: 'Concluído', background: colors.successSoft, border: '#8DB496', text: colors.success },
  cancelled: { label: 'Cancelado', background: colors.dangerSoft, border: '#D69999', text: colors.danger },
};

const blockLabels: Record<CalendarBlock['kind'], string> = {
  break: 'Pausa',
  time_off: 'Ausência',
  blocked: 'Bloqueado',
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const formatTime = (date: Date, timezone?: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...(timezone ? { timeZone: timezone } : {}),
  }).format(date);

const formatDate = (date: Date, timezone?: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    ...(timezone ? { timeZone: timezone } : {}),
  }).format(date);

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export const OperationalCalendar = ({
  date,
  timezone,
  resources,
  appointments,
  blocks = [],
  view = 'team',
  ownProfessionalId,
  loading = false,
  error,
  closed = false,
  showFinished = false,
  allowTeamView = true,
  canManageTeam = false,
  workingHours,
  syncState = 'live',
  testID = 'operational-calendar',
  onViewChange,
  onDateChange,
  onToggleFinished,
  onRetry,
  onSlotPress,
  onAppointmentPress,
  onBlockPress,
  onManageTeam,
  legacyTestIDs,
}: OperationalCalendarProps) => {
  const { width } = useWindowDimensions();
  const desktop = width >= layout.desktopBreakpoint;
  const verticalScrollRef = useRef<ScrollView>(null);

  const [selectedProfessionalFilter, setSelectedProfessionalFilter] = useState<string>('all');

  useEffect(() => {
    if (view === 'mine') {
      setSelectedProfessionalFilter('all');
    }
  }, [view]);

  const visibleResources = useMemo(() => {
    if (view === 'team') {
      if (selectedProfessionalFilter === 'all') return resources;
      return resources.filter((resource) => resource.id === selectedProfessionalFilter);
    }
    if (!ownProfessionalId) return resources;
    return resources.filter((resource) => resource.id === ownProfessionalId);
  }, [ownProfessionalId, resources, view, selectedProfessionalFilter]);

  const visibleAppointments = useMemo(
    () =>
      appointments
        .filter((appointment) => visibleResources.some((resource) => resource.id === appointment.professionalId))
        .filter((appointment) => showFinished || !['completed', 'cancelled'].includes(appointment.status))
        .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime()),
    [appointments, showFinished, visibleResources],
  );

  const visibleBlocks = useMemo(
    () => blocks.filter((block) => visibleResources.some((resource) => resource.id === block.professionalId)),
    [blocks, visibleResources],
  );

  const { startMinute, endMinute, slots } = useMemo(() => {
    return buildCalendarRange({
      eventStarts: [...visibleAppointments.map((item) => item.startsAt), ...visibleBlocks.map((item) => item.startsAt)],
      eventEnds: [...visibleAppointments.map((item) => item.endsAt), ...visibleBlocks.map((item) => item.endsAt)],
      workingStart: workingHours?.start,
      workingEnd: workingHours?.end,
      timezone,
    });
  }, [timezone, visibleAppointments, visibleBlocks, workingHours]);

  useEffect(() => {
    if (!desktop || loading || closed) return;
    const firstAppointmentMinute = visibleAppointments[0] ? minutesOfDay(visibleAppointments[0].startsAt, timezone) : null;
    const nowMinute = isSameCalendarDay(date, new Date(), timezone) ? minutesOfDay(new Date(), timezone) - 60 : null;
    const targetMinute = Math.max(startMinute, nowMinute ?? firstAppointmentMinute ?? startMinute);
    const y = Math.max(0, ((targetMinute - startMinute) / SLOT_MINUTES) * SLOT_HEIGHT);
    const timer = setTimeout(() => verticalScrollRef.current?.scrollTo({ y, animated: false }), 0);
    return () => clearTimeout(timer);
  }, [closed, date, desktop, loading, startMinute, timezone, visibleAppointments]);

  const gridHeight = slots.length * SLOT_HEIGHT;
  const now = new Date();
  const showNowLine = isSameCalendarDay(date, now, timezone) && minutesOfDay(now, timezone) >= startMinute && minutesOfDay(now, timezone) <= endMinute;
  const nowTop = ((minutesOfDay(now, timezone) - startMinute) / SLOT_MINUTES) * SLOT_HEIGHT;

  const toolbar = (
    <View style={styles.toolbar}>
      <View style={styles.dateNavigation}>
        <Pressable
          accessibilityLabel="Dia anterior"
          hitSlop={6}
          onPress={() => onDateChange?.(addDays(date, -1))}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          testID={legacyTestIDs?.previousDay || `${testID}-previous-day`}
        >
          <ChevronLeft color={colors.textPrimary} size={19} />
        </Pressable>
        <View style={styles.dateCopy}>
          <Text style={styles.dateLabel}>{formatDate(date, timezone)}</Text>
        </View>
        <Pressable
          accessibilityLabel="Próximo dia"
          hitSlop={6}
          onPress={() => onDateChange?.(addDays(date, 1))}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          testID={legacyTestIDs?.nextDay || `${testID}-next-day`}
        >
          <ChevronRight color={colors.textPrimary} size={19} />
        </Pressable>
      </View>
      <View style={styles.toolbarActions}>
        {allowTeamView && onViewChange ? (
          <View style={styles.segmentedWrap}>
            <SegmentedControl
              onChange={(next) => onViewChange(next as CalendarView)}
              options={[
                { label: 'Minha agenda', value: 'mine' },
                { label: 'Equipe', value: 'team' },
              ]}
              testID={legacyTestIDs?.view || `${testID}-view`}
              value={view}
            />
          </View>
        ) : legacyTestIDs?.view ? (
          <View testID={legacyTestIDs.view} style={styles.singleViewLabel}>
            <Text style={styles.singleViewText}>Minha agenda</Text>
          </View>
        ) : null}
        {onDateChange ? (
          <AppButton
            label="Hoje"
            onPress={() => onDateChange(new Date())}
            size="sm"
            testID={legacyTestIDs?.today || `${testID}-today`}
            variant="secondary"
          />
        ) : null}
        {onToggleFinished ? (
          <AppButton
            label={showFinished ? 'Ocultar finalizados' : 'Mostrar finalizados'}
            leadingIcon={showFinished ? <EyeOff color={colors.textPrimary} size={17} /> : <Eye color={colors.textPrimary} size={17} />}
            onPress={onToggleFinished}
            size="sm"
            testID={`${testID}-toggle-finished`}
            variant="secondary"
          />
        ) : null}
      </View>
    </View>
  );

  const filterChips = view === 'team' && resources.length > 1 ? (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.filterScroll}
    >
      <Pressable
        onPress={() => setSelectedProfessionalFilter('all')}
        style={[
          styles.filterChip,
          selectedProfessionalFilter === 'all' && styles.filterChipActive
        ]}
      >
        <Text
          style={[
            styles.filterChipText,
            selectedProfessionalFilter === 'all' && styles.filterChipTextActive
          ]}
        >
          Todos
        </Text>
      </Pressable>
      {resources.map((resource) => (
        <Pressable
          key={resource.id}
          onPress={() => setSelectedProfessionalFilter(resource.id)}
          style={[
            styles.filterChip,
            selectedProfessionalFilter === resource.id && styles.filterChipActive
          ]}
        >
          <Text
            style={[
              styles.filterChipText,
              selectedProfessionalFilter === resource.id && styles.filterChipTextActive
            ]}
          >
            {resource.name}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  ) : null;

  if (error) {
    return (
      <View style={styles.container} testID={legacyTestIDs?.panel || testID}>
        {toolbar}
        {filterChips}
        <InlineNotice
          action={onRetry ? <AppButton label="Tentar novamente" onPress={onRetry} size="sm" testID={`${testID}-retry`} variant="secondary" /> : null}
          message={error}
          testID={`${testID}-error`}
          title="Não foi possível carregar a agenda"
          tone="danger"
        />
      </View>
    );
  }

  if (!resources.length) {
    return (
      <View style={styles.container} testID={legacyTestIDs?.panel || testID}>
        {toolbar}
        <View style={styles.emptyState} testID={legacyTestIDs?.empty}>
          <CalendarClock color={colors.textMuted} size={28} />
          <Text style={styles.emptyTitle}>Nenhum profissional disponível</Text>
          <Text style={styles.emptyText}>Adicione profissionais para abrir a agenda desta unidade.</Text>
          {canManageTeam && onManageTeam ? (
            <AppButton label="Abrir Equipe" onPress={onManageTeam} size="sm" testID={`${testID}-manage-team`} variant="secondary" />
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container} testID={legacyTestIDs?.panel || testID}>
      {toolbar}
      {filterChips}
      {!loading && !closed && visibleAppointments.length === 0 && visibleBlocks.length === 0 ? (
        <View style={styles.freeState} testID={legacyTestIDs?.empty || `${testID}-empty`}>
          <Text style={styles.freeStateText}>Agenda livre — selecione um horário para começar.</Text>
        </View>
      ) : null}
      {closed ? (
        <View style={styles.closedState}>
          <LockKeyhole color={colors.textMuted} size={26} />
          <Text style={styles.emptyTitle}>Jornada fechada</Text>
          <Text style={styles.emptyText}>Não há expediente configurado para esta data.</Text>
        </View>
      ) : loading ? (
        <View style={styles.loadingState} testID={legacyTestIDs?.loading || `${testID}-loading`}>
          <ActivityIndicator color={colors.brandPrimary} size="small" />
          <Text style={styles.emptyText}>Organizando horários e atendimentos…</Text>
          <View style={styles.skeletonGrid} />
        </View>
      ) : desktop ? (
        <DesktopCalendar
          appointments={visibleAppointments}
          blocks={visibleBlocks}
          date={date}
          gridHeight={gridHeight}
          nowTop={nowTop}
          onAppointmentPress={onAppointmentPress}
          onBlockPress={onBlockPress}
          onSlotPress={onSlotPress}
          resources={visibleResources}
          scrollRef={verticalScrollRef}
          showNowLine={showNowLine}
          slots={slots}
          startMinute={startMinute}
          testID={testID}
          timezone={timezone}
        />
      ) : (
        <MobileCalendar
          appointments={visibleAppointments}
          blocks={visibleBlocks}
          date={date}
          onAppointmentPress={onAppointmentPress}
          onBlockPress={onBlockPress}
          onSlotPress={onSlotPress}
          resources={visibleResources}
          slots={slots}
          testID={testID}
          timezone={timezone}
          view={view}
        />
      )}
    </View>
  );
};

interface DesktopCalendarProps {
  date: Date;
  timezone?: string;
  resources: CalendarResource[];
  appointments: CalendarAppointment[];
  blocks: CalendarBlock[];
  slots: number[];
  startMinute: number;
  gridHeight: number;
  showNowLine: boolean;
  nowTop: number;
  testID: string;
  scrollRef: React.RefObject<ScrollView | null>;
  onSlotPress?: (selection: CalendarSlotSelection) => void;
  onAppointmentPress?: (appointment: CalendarAppointment) => void;
  onBlockPress?: (block: CalendarBlock) => void;
}

const DesktopCalendar = ({
  date,
  timezone,
  resources,
  appointments,
  blocks,
  slots,
  startMinute,
  gridHeight,
  showNowLine,
  nowTop,
  testID,
  scrollRef,
  onSlotPress,
  onAppointmentPress,
  onBlockPress,
}: DesktopCalendarProps) => (
  <View style={styles.desktopFrame}>
    <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ minWidth: TIME_GUTTER_WIDTH + resources.length * RESOURCE_MIN_WIDTH }}>
      <View style={styles.desktopCanvas}>
        <View style={styles.resourceHeaderRow}>
          <View style={styles.timeHeader} />
          {resources.map((resource) => (
            <View key={resource.id} style={styles.resourceHeader}>
              <View style={styles.avatarFallback}><Text style={styles.avatarText}>{resource.name.trim().charAt(0).toUpperCase()}</Text></View>
              <Text numberOfLines={1} style={styles.resourceName}>{resource.name}</Text>
            </View>
          ))}
        </View>
        <ScrollView ref={scrollRef} nestedScrollEnabled style={styles.gridViewport} contentContainerStyle={{ height: gridHeight }}>
          <View style={[styles.gridRow, { height: gridHeight }]}>
            <View style={styles.timeColumn}>
              {slots.map((minute) => (
                <View key={minute} style={styles.timeSlot}>
                  <Text style={styles.timeText}>{formatTime(zonedDateAtMinute(date, minute, timezone), timezone)}</Text>
                </View>
              ))}
            </View>
            {resources.map((resource) => {
              const resourceAppointments = appointments.filter((item) => item.professionalId === resource.id);
              const resourceBlocks = blocks.filter((item) => item.professionalId === resource.id);
              return (
                <View key={resource.id} style={styles.resourceColumn}>
                  {slots.map((minute) => (
                    <Pressable
                      accessibilityLabel={`Novo atendimento com ${resource.name} às ${formatTime(zonedDateAtMinute(date, minute, timezone), timezone)}`}
                      key={minute}
                      onPress={() => onSlotPress?.({ professionalId: resource.id, startsAt: zonedDateAtMinute(date, minute, timezone) })}
                      style={({ hovered, pressed }: any) => [styles.gridSlot, (hovered || pressed) && styles.gridSlotActive]}
                      testID={`${testID}-slot-${resource.id}-${minute}`}
                    >
                      <Plus color={colors.brandPrimary} size={14} style={styles.slotPlus} />
                    </Pressable>
                  ))}
                  {resourceBlocks.map((block) => (
                    <BlockCard
                      block={block}
                      key={block.id}
                      onPress={onBlockPress}
                      startMinute={startMinute}
                      timezone={timezone}
                    />
                  ))}
                  {resourceAppointments.map((appointment) => (
                    <AppointmentCard
                      appointment={appointment}
                      key={appointment.id}
                      onPress={onAppointmentPress}
                      startMinute={startMinute}
                      testID={`${testID}-appointment-${appointment.id}`}
                      timezone={timezone}
                    />
                  ))}
                  {showNowLine ? <View pointerEvents="none" style={[styles.nowLine, { top: nowTop }]}><View style={styles.nowDot} /></View> : null}
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>
    </ScrollView>
  </View>
);

interface MobileCalendarProps {
  date: Date;
  timezone?: string;
  resources: CalendarResource[];
  appointments: CalendarAppointment[];
  blocks: CalendarBlock[];
  slots: number[];
  view: CalendarView;
  testID: string;
  onSlotPress?: (selection: CalendarSlotSelection) => void;
  onAppointmentPress?: (appointment: CalendarAppointment) => void;
  onBlockPress?: (block: CalendarBlock) => void;
}

const MobileCalendar = ({
  date,
  timezone,
  resources,
  appointments,
  blocks,
  slots,
  view,
  testID,
  onSlotPress,
  onAppointmentPress,
  onBlockPress,
}: MobileCalendarProps) => (
  <View style={styles.mobileTimeline}>
    {slots.map((minute) => {
      const slotStart = zonedDateAtMinute(date, minute, timezone);
      const slotEnd = zonedDateAtMinute(date, minute + SLOT_MINUTES, timezone);
      const slotAppointments = appointments.filter((item) => item.startsAt < slotEnd && item.endsAt > slotStart);
      const slotBlocks = blocks.filter((item) => item.startsAt < slotEnd && item.endsAt > slotStart);
      return (
        <View key={minute} style={styles.mobileSlot}>
          <Text style={styles.mobileTime}>{formatTime(slotStart, timezone)}</Text>
          <View style={styles.mobileSlotContent}>
            {slotAppointments.map((appointment) => {
              const resource = resources.find((item) => item.id === appointment.professionalId);
              return (
                <Pressable
                  accessibilityRole="button"
                  key={appointment.id}
                  onPress={() => onAppointmentPress?.(appointment)}
                  style={({ pressed }) => [styles.mobileAppointment, { borderLeftColor: statusConfig[appointment.status].border }, pressed && styles.pressed]}
                  testID={`${testID}-appointment-${appointment.id}`}
                >
                  <View style={styles.mobileAppointmentTop}>
                    <Text numberOfLines={1} style={styles.appointmentClient}>{appointment.clientName}</Text>
                    <StatusBadge label={statusConfig[appointment.status].label} testID={`${testID}-appointment-${appointment.id}-status`} tone={appointment.status === 'pending' ? 'warning' : appointment.status === 'confirmed' ? 'info' : appointment.status === 'completed' ? 'success' : 'danger'} />
                  </View>
                  <Text numberOfLines={1} style={styles.appointmentService}>{appointment.serviceName}</Text>
                  {view === 'team' && resource ? <Text numberOfLines={1} style={styles.appointmentMeta}>{resource.name}</Text> : null}
                </Pressable>
              );
            })}
            {slotBlocks.map((block) => (
              <Pressable key={block.id} onPress={() => onBlockPress?.(block)} style={({ pressed }) => [styles.mobileBlock, pressed && styles.pressed]}>
                <LockKeyhole color={colors.textSecondary} size={15} />
                <Text numberOfLines={1} style={styles.mobileBlockText}>{block.reason || blockLabels[block.kind]}</Text>
              </Pressable>
            ))}
            {!slotAppointments.length && !slotBlocks.length ? (
              <Pressable
                accessibilityLabel={`Novo atendimento às ${formatTime(slotStart, timezone)}`}
                onPress={() => onSlotPress?.({ professionalId: resources[0].id, startsAt: slotStart })}
                style={({ pressed }) => [styles.mobileEmptySlot, pressed && styles.pressed]}
                testID={`${testID}-slot-${resources[0].id}-${minute}`}
              >
                <Plus color={colors.textMuted} size={16} />
                <Text style={styles.mobileEmptyText}>Horário livre</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      );
    })}
  </View>
);

interface AppointmentCardProps {
  appointment: CalendarAppointment;
  startMinute: number;
  timezone?: string;
  testID: string;
  onPress?: (appointment: CalendarAppointment) => void;
}

const AppointmentCard = ({ appointment, startMinute, timezone, testID, onPress }: AppointmentCardProps) => {
  const config = statusConfig[appointment.status];
  const { top, height } = calculateEventGeometry(appointment.startsAt, appointment.endsAt, startMinute, timezone);
  return (
    <Pressable
      accessibilityLabel={`${appointment.clientName}, ${appointment.serviceName}, ${formatTime(appointment.startsAt, timezone)}`}
      accessibilityRole="button"
      onPress={() => onPress?.(appointment)}
      style={({ pressed }) => [styles.appointmentCard, { top, height, backgroundColor: config.background, borderColor: config.border }, pressed && styles.pressed]}
      testID={testID}
    >
      <Text numberOfLines={1} style={[styles.appointmentTime, { color: config.text }]}>{formatTime(appointment.startsAt, timezone)}</Text>
      <Text numberOfLines={1} style={styles.appointmentClient}>{appointment.clientName}</Text>
      <Text numberOfLines={1} style={styles.appointmentService}>{appointment.serviceName}</Text>
      {appointment.price != null && height >= 70 ? <Text style={styles.appointmentMeta}>{currency.format(appointment.price)}</Text> : null}
    </Pressable>
  );
};

interface BlockCardProps {
  block: CalendarBlock;
  startMinute: number;
  timezone?: string;
  onPress?: (block: CalendarBlock) => void;
}

const BlockCard = ({ block, startMinute, timezone, onPress }: BlockCardProps) => {
  const { top, height } = calculateEventGeometry(block.startsAt, block.endsAt, startMinute, timezone);
  return (
    <Pressable onPress={() => onPress?.(block)} style={({ pressed }) => [styles.blockCard, { top, height }, pressed && styles.pressed]}>
      <LockKeyhole color={colors.textSecondary} size={14} />
      <View style={styles.blockCopy}>
        <Text numberOfLines={1} style={styles.blockTitle}>{blockLabels[block.kind]}</Text>
        {block.reason ? <Text numberOfLines={1} style={styles.blockReason}>{block.reason}</Text> : null}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: { backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderRadius: radii.lg, borderWidth: 1, gap: spacing.md, overflow: 'hidden', padding: spacing.md },
  toolbar: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'space-between' },
  dateNavigation: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  iconButton: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderRadius: radii.md, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 },
  pressed: { opacity: 0.72 },
  dateCopy: { minWidth: 180 },
  dateLabel: { ...typeScale.bodyStrong, color: colors.textPrimary, textTransform: 'capitalize' },
  toolbarActions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  segmentedWrap: { minWidth: 240 },
  singleViewLabel: { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle, borderRadius: radii.md, borderWidth: 1, minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md },
  singleViewText: { ...typeScale.bodyStrong, color: colors.textSecondary },
  freeState: { backgroundColor: colors.brandSecondarySoft, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  freeStateText: { ...typeScale.small, color: colors.textSecondary },
  desktopFrame: { borderColor: colors.borderSubtle, borderRadius: radii.md, borderWidth: 1, overflow: 'hidden' },
  desktopCanvas: { flex: 1 },
  resourceHeaderRow: { backgroundColor: colors.surfaceMuted, borderBottomColor: colors.borderSubtle, borderBottomWidth: 1, flexDirection: 'row', height: 54 },
  timeHeader: { borderRightColor: colors.borderSubtle, borderRightWidth: 1, width: TIME_GUTTER_WIDTH },
  resourceHeader: { alignItems: 'center', borderRightColor: colors.borderSubtle, borderRightWidth: 1, flexDirection: 'row', gap: spacing.sm, minWidth: RESOURCE_MIN_WIDTH, paddingHorizontal: spacing.md },
  avatarFallback: { alignItems: 'center', backgroundColor: colors.brandSecondarySoft, borderRadius: radii.pill, height: 30, justifyContent: 'center', width: 30 },
  avatarText: { ...typeScale.label, color: colors.brandPrimary },
  resourceName: { ...typeScale.bodyStrong, color: colors.textPrimary, flex: 1 },
  gridViewport: { maxHeight: 540 },
  gridRow: { flexDirection: 'row' },
  timeColumn: { backgroundColor: colors.surfaceMuted, borderRightColor: colors.borderSubtle, borderRightWidth: 1, width: TIME_GUTTER_WIDTH },
  timeSlot: { alignItems: 'flex-end', borderBottomColor: colors.borderSubtle, borderBottomWidth: StyleSheet.hairlineWidth, height: SLOT_HEIGHT, paddingRight: spacing.sm, paddingTop: 5 },
  timeText: { ...typeScale.label, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  resourceColumn: { borderRightColor: colors.borderSubtle, borderRightWidth: 1, minWidth: RESOURCE_MIN_WIDTH, position: 'relative' },
  gridSlot: { alignItems: 'flex-end', borderBottomColor: colors.borderSubtle, borderBottomWidth: StyleSheet.hairlineWidth, height: SLOT_HEIGHT, justifyContent: 'center', paddingRight: spacing.xs },
  gridSlotActive: { backgroundColor: colors.brandSecondarySoft },
  slotPlus: { opacity: 0 },
  appointmentCard: { borderLeftWidth: 3, borderRadius: radii.sm, left: 3, overflow: 'hidden', paddingHorizontal: spacing.sm, paddingVertical: 5, position: 'absolute', right: 3, zIndex: 3 },
  appointmentTime: { ...typeScale.label, fontVariant: ['tabular-nums'] },
  appointmentClient: { ...typeScale.bodyStrong, color: colors.textPrimary },
  appointmentService: { ...typeScale.small, color: colors.textSecondary },
  appointmentMeta: { ...typeScale.label, color: colors.textMuted, marginTop: 2 },
  blockCard: { alignItems: 'flex-start', backgroundColor: colors.canvasSubtle, borderColor: colors.borderStrong, borderLeftWidth: 3, borderRadius: radii.sm, borderWidth: 1, flexDirection: 'row', gap: spacing.xs, left: 3, padding: spacing.sm, position: 'absolute', right: 3, zIndex: 2 },
  blockCopy: { flex: 1 },
  blockTitle: { ...typeScale.label, color: colors.textPrimary },
  blockReason: { ...typeScale.small, color: colors.textSecondary },
  nowLine: { backgroundColor: colors.danger, height: 1, left: 0, position: 'absolute', right: 0, zIndex: 6 },
  nowDot: { backgroundColor: colors.danger, borderRadius: radii.pill, height: 7, left: -3, position: 'absolute', top: -3, width: 7 },
  mobileTimeline: { gap: 0 },
  mobileSlot: { alignItems: 'flex-start', flexDirection: 'row', minHeight: 60 },
  mobileTime: { ...typeScale.label, color: colors.textMuted, fontVariant: ['tabular-nums'], paddingTop: spacing.md, width: 54 },
  mobileSlotContent: { borderLeftColor: colors.borderSubtle, borderLeftWidth: 1, flex: 1, gap: spacing.xs, minHeight: 60, paddingBottom: spacing.xs, paddingLeft: spacing.md, paddingTop: spacing.xs },
  mobileAppointment: { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle, borderLeftWidth: 3, borderRadius: radii.sm, borderWidth: 1, gap: 2, minHeight: 54, padding: spacing.sm },
  mobileAppointmentTop: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
  mobileBlock: { alignItems: 'center', backgroundColor: colors.canvasSubtle, borderColor: colors.borderStrong, borderRadius: radii.sm, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 48, padding: spacing.sm },
  mobileBlockText: { ...typeScale.small, color: colors.textSecondary, flex: 1 },
  mobileEmptySlot: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, minHeight: 52, paddingHorizontal: spacing.sm },
  mobileEmptyText: { ...typeScale.small, color: colors.textMuted },
  emptyState: { alignItems: 'center', gap: spacing.sm, justifyContent: 'center', minHeight: 260, padding: spacing.xl },
  closedState: { alignItems: 'center', backgroundColor: colors.surfaceMuted, gap: spacing.sm, justifyContent: 'center', minHeight: 280, padding: spacing.xl },
  loadingState: { alignItems: 'center', gap: spacing.sm, minHeight: 320, padding: spacing.xl },
  skeletonGrid: { backgroundColor: colors.canvasSubtle, borderRadius: radii.md, flex: 1, marginTop: spacing.md, minHeight: 220, opacity: 0.8, width: '100%' },
  emptyTitle: { ...typeScale.cardTitle, color: colors.textPrimary, textAlign: 'center' },
  emptyText: { ...typeScale.small, color: colors.textSecondary, textAlign: 'center' },
  filterScroll: { flexDirection: 'row', gap: spacing.xs, paddingVertical: spacing.xs },
  filterChip: { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle, borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: 6 },
  filterChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  filterChipText: { ...typeScale.small, color: colors.textSecondary },
  filterChipTextActive: { ...typeScale.smallStrong, color: colors.surface },
});
