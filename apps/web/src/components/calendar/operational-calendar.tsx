import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
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
  appointmentCardDensity,
  buildCalendarRange,
  calculateEventGeometry,
  CalendarDensity,
  isSameCalendarDay,
  layoutConcurrentEvents,
  minutesOfDay,
  shortDisplayName,
  SLOT_HEIGHT_BY_DENSITY,
  SLOT_MINUTES,
  zonedDateAtMinute,
} from './calendar-math';

const DENSITY_STORAGE_KEY = 'cutsync.calendar.density';

const readStoredDensity = (): CalendarDensity => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return 'comfortable';
  try {
    const value = window.localStorage.getItem(DENSITY_STORAGE_KEY);
    return value === 'compact' ? 'compact' : 'comfortable';
  } catch {
    return 'comfortable';
  }
};

const persistDensity = (density: CalendarDensity) => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DENSITY_STORAGE_KEY, density);
  } catch {
    // ignore storage failures
  }
};

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
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  price?: number;
  durationMinutes?: number;
  clientPhone?: string;
  serviceId?: string;
  rescheduleCount?: number;
  originalDateTime?: Date | null;
  cancellationReason?: string | null;
  cancellationReasonCode?: string | null;
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

export type CalendarLayoutView = 'day' | 'week' | 'list';

interface OperationalCalendarProps {
  date: Date;
  timezone?: string;
  resources: CalendarResource[];
  appointments: CalendarAppointment[];
  blocks?: CalendarBlock[];
  view?: CalendarView;
  layoutView?: CalendarLayoutView;
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
  onEmptyQuickBook?: () => void;
  onEmptyBlock?: () => void;
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
  no_show: { label: 'Não compareceu', background: colors.warningSoft, border: '#B98A4A', text: colors.warning },
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
  layoutView = 'day',
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
  onEmptyQuickBook,
  onEmptyBlock,
  legacyTestIDs,
}: OperationalCalendarProps) => {
  const { width } = useWindowDimensions();
  const desktop = width >= layout.desktopBreakpoint;
  const verticalScrollRef = useRef<ScrollView>(null);

  const [selectedProfessionalFilter, setSelectedProfessionalFilter] = useState<string>('all');
  const [density, setDensity] = useState<CalendarDensity>(readStoredDensity);
  const slotHeight = SLOT_HEIGHT_BY_DENSITY[density];

  useEffect(() => {
    if (view === 'mine') {
      setSelectedProfessionalFilter('all');
    }
  }, [view]);

  const changeDensity = (next: CalendarDensity) => {
    setDensity(next);
    persistDensity(next);
  };

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
        .filter((appointment) => showFinished || !['completed', 'cancelled', 'no_show'].includes(appointment.status))
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
    if (loading || closed || layoutView !== 'day') return;
    const firstAppointmentMinute = visibleAppointments[0] ? minutesOfDay(visibleAppointments[0].startsAt, timezone) : null;
    const nowMinute = isSameCalendarDay(date, new Date(), timezone) ? minutesOfDay(new Date(), timezone) - 60 : null;
    const targetMinute = Math.max(startMinute, nowMinute ?? firstAppointmentMinute ?? startMinute);
    const y = Math.max(0, ((targetMinute - startMinute) / SLOT_MINUTES) * slotHeight);
    const timer = setTimeout(() => verticalScrollRef.current?.scrollTo({ y, animated: false }), 0);
    return () => clearTimeout(timer);
  }, [closed, date, layoutView, loading, slotHeight, startMinute, timezone, visibleAppointments]);

  const weekDays = useMemo(() => {
    const monday = new Date(date);
    const day = monday.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    monday.setDate(monday.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
  }, [date]);

  const gridHeight = slots.length * slotHeight;
  const now = new Date();
  const showNowLine = isSameCalendarDay(date, now, timezone) && minutesOfDay(now, timezone) >= startMinute && minutesOfDay(now, timezone) <= endMinute;
  const nowTop = ((minutesOfDay(now, timezone) - startMinute) / SLOT_MINUTES) * slotHeight;

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
        <View style={styles.densityWrap}>
          <SegmentedControl
            onChange={(next) => changeDensity(next as CalendarDensity)}
            options={[
              { label: 'Compacto', value: 'compact' },
              { label: 'Confortável', value: 'comfortable' },
            ]}
            testID={`${testID}-density`}
            value={density}
          />
        </View>
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
          <Text style={styles.freeStateText}>Dia livre — criar encaixe ou bloquear período.</Text>
          <View style={styles.freeStateActions}>
            {onEmptyQuickBook ? <AppButton label="Criar encaixe" onPress={onEmptyQuickBook} size="sm" testID={`${testID}-empty-quickbook`} /> : null}
            {onEmptyBlock ? <AppButton label="Bloquear período" onPress={onEmptyBlock} size="sm" testID={`${testID}-empty-block`} variant="secondary" /> : null}
          </View>
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
      ) : layoutView === 'week' ? (
        <WeekCalendar
          appointments={visibleAppointments}
          days={weekDays}
          onAppointmentPress={onAppointmentPress}
          onDateChange={onDateChange}
          testID={testID}
          timezone={timezone}
        />
      ) : layoutView === 'list' ? (
        <ListCalendar
          appointments={visibleAppointments}
          onAppointmentPress={onAppointmentPress}
          onSlotPress={ownProfessionalId ? () => onSlotPress?.({ professionalId: ownProfessionalId, startsAt: date }) : undefined}
          testID={testID}
          timezone={timezone}
        />
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
          slotHeight={slotHeight}
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
          slotHeight={slotHeight}
          slots={slots}
          testID={testID}
          timezone={timezone}
          view={view}
        />
      )}
    </View>
  );
};

const WeekCalendar = ({
  days,
  appointments,
  timezone,
  testID,
  onAppointmentPress,
  onDateChange,
}: {
  days: Date[];
  appointments: CalendarAppointment[];
  timezone?: string;
  testID: string;
  onAppointmentPress?: (appointment: CalendarAppointment) => void;
  onDateChange?: (date: Date) => void;
}) => (
  <View style={styles.weekGrid} testID={`${testID}-week`}>
    {days.map((day) => {
      const dayItems = appointments.filter((item) => isSameCalendarDay(item.startsAt, day, timezone));
      return (
        <Pressable
          key={day.toISOString()}
          onPress={() => onDateChange?.(day)}
          style={styles.weekColumn}
          testID={`${testID}-week-day-${day.toISOString().slice(0, 10)}`}
        >
          <Text style={styles.weekDayLabel}>
            {day.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' })}
          </Text>
          <Text style={styles.weekCount}>{dayItems.length} atend.</Text>
          {dayItems.slice(0, 4).map((item) => (
            <Pressable
              key={item.id}
              onPress={() => onAppointmentPress?.(item)}
              style={styles.weekItem}
            >
              <Text numberOfLines={1} style={styles.weekItemText}>
                {formatTime(item.startsAt, timezone)} {item.clientName}
              </Text>
            </Pressable>
          ))}
          {dayItems.length > 4 ? <Text style={styles.weekMore}>+{dayItems.length - 4}</Text> : null}
        </Pressable>
      );
    })}
  </View>
);

const ListCalendar = ({
  appointments,
  timezone,
  testID,
  onAppointmentPress,
  onSlotPress,
}: {
  appointments: CalendarAppointment[];
  timezone?: string;
  testID: string;
  onAppointmentPress?: (appointment: CalendarAppointment) => void;
  onSlotPress?: () => void;
}) => {
  const grouped = appointments.reduce<Record<string, CalendarAppointment[]>>((acc, item) => {
    const key = formatTime(item.startsAt, timezone);
    acc[key] = acc[key] || [];
    acc[key].push(item);
    return acc;
  }, {});
  const hours = Object.keys(grouped).sort();

  if (hours.length === 0) {
    return (
      <View style={styles.emptyState} testID={`${testID}-list-empty`}>
        <Text style={styles.emptyText}>Nenhum atendimento nesta lista.</Text>
        {onSlotPress ? <AppButton label="Criar encaixe" onPress={onSlotPress} size="sm" testID={`${testID}-list-quickbook`} /> : null}
      </View>
    );
  }

  return (
    <View style={styles.listView} testID={`${testID}-list`}>
      {hours.map((hour) => (
        <View key={hour} style={styles.listGroup}>
          <Text style={styles.listHour}>{hour}</Text>
          {grouped[hour].map((item) => (
            <Pressable
              key={item.id}
              onPress={() => onAppointmentPress?.(item)}
              style={styles.listItem}
              testID={`${testID}-list-item-${item.id}`}
            >
              <Text style={styles.listItemTitle}>{item.clientName}</Text>
              <Text style={styles.listItemMeta}>{item.serviceName}</Text>
            </Pressable>
          ))}
        </View>
      ))}
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
  slotHeight: number;
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
  slotHeight,
  showNowLine,
  nowTop,
  testID,
  scrollRef,
  onSlotPress,
  onAppointmentPress,
  onBlockPress,
}: DesktopCalendarProps) => (
  <View style={styles.desktopFrame}>
    <ScrollView horizontal showsHorizontalScrollIndicator style={{ width: '100%' }} contentContainerStyle={{ flexGrow: 1, minWidth: TIME_GUTTER_WIDTH + resources.length * RESOURCE_MIN_WIDTH }}>
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
                <View key={minute} style={[styles.timeSlot, { height: slotHeight }]}>
                  <Text style={styles.timeText}>{formatTime(zonedDateAtMinute(date, minute, timezone), timezone)}</Text>
                </View>
              ))}
            </View>
            {resources.map((resource) => {
              const resourceAppointments = appointments.filter((item) => item.professionalId === resource.id);
              const resourceBlocks = blocks.filter((item) => item.professionalId === resource.id);
              const concurrentLayout = layoutConcurrentEvents(resourceAppointments);
              return (
                <View key={resource.id} style={styles.resourceColumn}>
                  {slots.map((minute) => (
                    <Pressable
                      accessibilityLabel={`Novo atendimento com ${resource.name} às ${formatTime(zonedDateAtMinute(date, minute, timezone), timezone)}`}
                      key={minute}
                      onPress={() => onSlotPress?.({ professionalId: resource.id, startsAt: zonedDateAtMinute(date, minute, timezone) })}
                      style={({ hovered, pressed }: any) => [styles.gridSlot, { height: slotHeight }, (hovered || pressed) && styles.gridSlotActive]}
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
                      slotHeight={slotHeight}
                      startMinute={startMinute}
                      timezone={timezone}
                    />
                  ))}
                  {resourceAppointments.map((appointment) => (
                    <AppointmentCard
                      appointment={appointment}
                      columnLayout={concurrentLayout.get(appointment.id)}
                      key={appointment.id}
                      onPress={onAppointmentPress}
                      slotHeight={slotHeight}
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
  slotHeight: number;
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
  slotHeight,
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
        <View key={minute} style={[styles.mobileSlot, { minHeight: Math.max(60, slotHeight) }]}>
          <Text style={styles.mobileTime}>{formatTime(slotStart, timezone)}</Text>
          <View style={[styles.mobileSlotContent, { minHeight: Math.max(60, slotHeight) }]}>
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
  slotHeight: number;
  timezone?: string;
  testID: string;
  columnLayout?: { column: number; columnCount: number };
  onPress?: (appointment: CalendarAppointment) => void;
}

const AppointmentCard = ({
  appointment,
  startMinute,
  slotHeight,
  timezone,
  testID,
  columnLayout,
  onPress,
}: AppointmentCardProps) => {
  const config = statusConfig[appointment.status];
  const { top, height } = calculateEventGeometry(appointment.startsAt, appointment.endsAt, startMinute, timezone, slotHeight);
  const density = appointmentCardDensity(height);
  const columnCount = Math.max(1, columnLayout?.columnCount ?? 1);
  const column = columnLayout?.column ?? 0;
  const inset = 3;
  const leftStyle = {
    left: `${(column * 100) / columnCount}%`,
    right: `${((columnCount - column - 1) * 100) / columnCount}%`,
    marginLeft: column === 0 ? inset : 1,
    marginRight: column === columnCount - 1 ? inset : 1,
  };
  const timeLabel = formatTime(appointment.startsAt, timezone);
  const singleLine = `${timeLabel} · ${shortDisplayName(appointment.clientName)} · ${appointment.serviceName}`;

  return (
    <Pressable
      accessibilityLabel={`${appointment.clientName}, ${appointment.serviceName}, ${timeLabel}`}
      accessibilityRole="button"
      onPress={() => onPress?.(appointment)}
      style={({ pressed }) => [
        styles.appointmentCard,
        {
          top,
          height,
          backgroundColor: config.background,
          borderColor: config.border,
          ...leftStyle,
        },
        pressed && styles.pressed,
      ]}
      testID={testID}
    >
      {density === 'single' ? (
        <Text numberOfLines={1} style={[styles.appointmentClient, { color: config.text }]}>{singleLine}</Text>
      ) : null}
      {density === 'double' ? (
        <>
          <Text numberOfLines={1} style={[styles.appointmentTime, { color: config.text }]}>
            {timeLabel} · {shortDisplayName(appointment.clientName)}
          </Text>
          <Text numberOfLines={1} style={styles.appointmentService}>{appointment.serviceName}</Text>
        </>
      ) : null}
      {density === 'full' ? (
        <>
          <Text numberOfLines={1} style={[styles.appointmentTime, { color: config.text }]}>{timeLabel}</Text>
          <Text numberOfLines={1} style={styles.appointmentClient}>{appointment.clientName}</Text>
          <Text numberOfLines={1} style={styles.appointmentService}>{appointment.serviceName}</Text>
          {appointment.price != null ? <Text style={styles.appointmentMeta}>{currency.format(appointment.price)}</Text> : null}
        </>
      ) : null}
    </Pressable>
  );
};

interface BlockCardProps {
  block: CalendarBlock;
  startMinute: number;
  slotHeight: number;
  timezone?: string;
  onPress?: (block: CalendarBlock) => void;
}

const BlockCard = ({ block, startMinute, slotHeight, timezone, onPress }: BlockCardProps) => {
  const { top, height } = calculateEventGeometry(block.startsAt, block.endsAt, startMinute, timezone, slotHeight);
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
  densityWrap: { minWidth: 220 },
  singleViewLabel: { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle, borderRadius: radii.md, borderWidth: 1, minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md },
  singleViewText: { ...typeScale.bodyStrong, color: colors.textSecondary },
  freeState: { backgroundColor: colors.brandSecondarySoft, borderRadius: radii.md, gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  freeStateText: { ...typeScale.small, color: colors.textSecondary },
  freeStateActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  weekGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  weekColumn: { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle, borderRadius: radii.md, borderWidth: 1, flexGrow: 1, gap: spacing.xs, minWidth: 120, padding: spacing.sm },
  weekDayLabel: { ...typeScale.bodyStrong, color: colors.textPrimary, textTransform: 'capitalize' },
  weekCount: { ...typeScale.small, color: colors.textMuted },
  weekItem: { backgroundColor: colors.surface, borderRadius: radii.sm, paddingHorizontal: spacing.xs, paddingVertical: 4 },
  weekItemText: { ...typeScale.small, color: colors.textSecondary },
  weekMore: { ...typeScale.label, color: colors.textMuted },
  listView: { gap: spacing.md },
  listGroup: { gap: spacing.xs },
  listHour: { ...typeScale.label, color: colors.brandPrimary, letterSpacing: 1 },
  listItem: { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle, borderRadius: radii.md, borderWidth: 1, gap: 2, padding: spacing.md },
  listItemTitle: { ...typeScale.bodyStrong, color: colors.textPrimary },
  listItemMeta: { ...typeScale.small, color: colors.textSecondary },
  desktopFrame: { borderColor: colors.borderSubtle, borderRadius: radii.md, borderWidth: 1, overflow: 'hidden' },
  desktopCanvas: { flex: 1 },
  resourceHeaderRow: { backgroundColor: colors.surfaceMuted, borderBottomColor: colors.borderSubtle, borderBottomWidth: 1, flexDirection: 'row', height: 54 },
  timeHeader: { borderRightColor: colors.borderSubtle, borderRightWidth: 1, width: TIME_GUTTER_WIDTH },
  resourceHeader: { flex: 1, alignItems: 'center', borderRightColor: colors.borderSubtle, borderRightWidth: 1, flexDirection: 'row', gap: spacing.sm, minWidth: RESOURCE_MIN_WIDTH, paddingHorizontal: spacing.md },
  avatarFallback: { alignItems: 'center', backgroundColor: colors.brandSecondarySoft, borderRadius: radii.pill, height: 30, justifyContent: 'center', width: 30 },
  avatarText: { ...typeScale.label, color: colors.brandPrimary },
  resourceName: { ...typeScale.bodyStrong, color: colors.textPrimary, flex: 1 },
  gridViewport: { maxHeight: 540 },
  gridRow: { flexDirection: 'row' },
  timeColumn: { backgroundColor: colors.surfaceMuted, borderRightColor: colors.borderSubtle, borderRightWidth: 1, width: TIME_GUTTER_WIDTH },
  timeSlot: { alignItems: 'flex-end', borderBottomColor: colors.borderSubtle, borderBottomWidth: StyleSheet.hairlineWidth, paddingRight: spacing.sm, paddingTop: 5 },
  timeText: { ...typeScale.label, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  resourceColumn: { flex: 1, borderRightColor: colors.borderSubtle, borderRightWidth: 1, minWidth: RESOURCE_MIN_WIDTH, position: 'relative' },
  gridSlot: { alignItems: 'flex-end', borderBottomColor: colors.borderSubtle, borderBottomWidth: StyleSheet.hairlineWidth, justifyContent: 'center', paddingRight: spacing.xs },
  gridSlotActive: { backgroundColor: colors.brandSecondarySoft },
  slotPlus: { opacity: 0 },
  appointmentCard: { borderLeftWidth: 3, borderRadius: radii.sm, overflow: 'hidden', paddingHorizontal: spacing.sm, paddingVertical: 4, position: 'absolute', zIndex: 3 },
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
