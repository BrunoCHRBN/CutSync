from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


# F3 date math contracts: monday week start + local-safe date shifts
def test_f3_date_math_contracts_exist():
    agenda_math = read("apps/business/src/features/agenda/business-agenda.ts")

    assert "const daysSinceMonday = (date.getUTCDay() + 6) % 7;" in agenda_math
    assert "return shiftLocalDate(localDate, -daysSinceMonday);" in agenda_math
    assert "new Date(Date.UTC(year, month - 1, day + days, 12));" in agenda_math


# F3 week strip: seven days, navigation, today action, occupancy signal
def test_f3_week_strip_contract_exists():
    agenda_screen = read("apps/business/src/screens/agenda.tsx")
    week_strip = read("apps/business/src/components/agenda/agenda-week-strip.tsx")
    occupancy_hook = read("apps/business/src/features/agenda/use-business-week-occupancy.ts")

    assert "Array.from({ length: 7 }" in occupancy_hook
    assert "queryFn: () => businessApi.getAgendaDay(establishmentId, date, scope)" in occupancy_hook
    assert "item.status !== 'cancelled' && item.status !== 'no_show'" in occupancy_hook

    assert 'testID="business-agenda-week-strip"' in week_strip
    assert 'testID="business-agenda-previous-week"' in week_strip
    assert 'testID="business-agenda-next-week"' in week_strip
    assert 'testID="business-agenda-go-today"' in week_strip
    assert 'testID={`business-agenda-date-${date}`}' in week_strip

    assert "onPreviousWeek={() => agenda.setLocalDate(shiftLocalDate(agenda.localDate, -7))}" in agenda_screen
    assert "onNextWeek={() => agenda.setLocalDate(shiftLocalDate(agenda.localDate, 7))}" in agenda_screen
    assert "onToday={() => agenda.setLocalDate(today)}" in agenda_screen


# F3 view toggle + list/timeline fallback
def test_f3_toggle_and_list_timeline_contract_exists():
    agenda_screen = read("apps/business/src/screens/agenda.tsx")
    toggle = read("apps/business/src/components/agenda/agenda-view-toggle.tsx")

    assert "type AgendaViewMode = 'timeline' | 'list'" in toggle
    assert 'testID="business-agenda-view-toggle"' in toggle
    assert 'testID={`business-agenda-view-${option}`}' in toggle
    assert "accessibilityRole=\"tab\"" in toggle
    assert "accessibilityState={{ selected }}" in toggle

    assert "viewMode === 'timeline'" in agenda_screen
    assert 'testID="business-agenda-list"' in agenda_screen


# F3 timeline window: 07:00-21:00, 30-min slots, proportional positioning, now line only for today
def test_f3_timeline_contract_exists():
    timeline = read("apps/business/src/components/agenda/agenda-timeline.tsx")

    assert "const START_MINUTE = 7 * 60;" in timeline
    assert "const END_MINUTE = 21 * 60;" in timeline
    assert "const SLOT_MINUTES = 30;" in timeline
    assert "((END_MINUTE - START_MINUTE) / SLOT_MINUTES)" in timeline
    assert "const top = ((start - START_MINUTE) / SLOT_MINUTES) * SLOT_HEIGHT;" in timeline
    assert "const showNow = props.localDate === getLocalDateInTimeZone(props.timeZone);" in timeline
    assert "nowMinutes >= START_MINUTE && nowMinutes <= END_MINUTE" in timeline


# F3 scope and slot access: own/team + capability gates + empty slot -> walk-in params
def test_f3_scope_access_and_slot_navigation_contract_exists():
    agenda_screen = read("apps/business/src/screens/agenda.tsx")
    timeline = read("apps/business/src/components/agenda/agenda-timeline.tsx")

    assert "(['own', 'team'] as const).map((scope) => {" in agenda_screen
    assert 'testID={`business-agenda-scope-${scope}`}' in agenda_screen
    assert "agenda.scope === 'team'" in agenda_screen

    assert "activeContext?.accessMode === 'full'" in agenda_screen
    assert "hasCapability('create_team_walk_in')" in agenda_screen
    assert "professionalId === user?.id && hasCapability('create_self_walk_in')" in agenda_screen

    assert "disabled={!props.canCreateSlot(professional.id)}" in timeline
    assert "onPress={() => props.onEmptySlot(timeLabel(minutes), professional.id)}" in timeline
    assert "router.push({ pathname: '/(app)/walk-in', params: { date: agenda.localDate, time, professionalId } } as never);" in agenda_screen


# F3 blocks integration and overlap-ready range contracts
def test_f3_schedule_blocks_rpc_and_overlap_contract_exists():
    agenda_screen = read("apps/business/src/screens/agenda.tsx")
    blocks_hook = read("apps/business/src/features/schedules/use-business-schedule-blocks.ts")
    schedules_api = read("apps/business/src/features/schedules/business-schedules-api.ts")
    timeline = read("apps/business/src/components/agenda/agenda-timeline.tsx")
    migration = read("supabase/migrations/20260806000000_android_business_operational_cycle.sql")

    assert "localDateTimeToIso(agenda.localDate, '00:00', timeZone)" in agenda_screen
    assert "localDateTimeToIso(shiftLocalDate(agenda.localDate, 1), '00:00', timeZone)" in agenda_screen
    assert "useBusinessScheduleBlocks(rangeStart, rangeEnd, agenda.scope)" in agenda_screen

    assert "const professionalId = scope === 'own' ? user?.id : null;" in blocks_hook
    assert "queryFn: () => businessSchedulesApi.list({" in blocks_hook
    assert "callBusinessRpc('get_business_schedule_blocks'" in schedules_api
    assert "target_professional_id: input.professionalId ? assertUuid(input.professionalId) : null" in schedules_api

    assert "const start = startParts.date < localDate ? START_MINUTE : Math.max(START_MINUTE, startParts.minutes);" in timeline
    assert "const end = endParts.date > localDate ? END_MINUTE : Math.min(END_MINUTE, endParts.minutes);" in timeline

    assert "AND block.starts_at < target_range_end" in migration
    assert "AND block.ends_at > target_range_start" in migration


# F3 interactions: appointment press, block press, cancelled collapsed list, walk-in param hydration
def test_f3_interactions_and_cancelled_contract_exists():
    agenda_screen = read("apps/business/src/screens/agenda.tsx")
    timeline = read("apps/business/src/components/agenda/agenda-timeline.tsx")
    cancelled = read("apps/business/src/components/agenda/agenda-cancelled-list.tsx")
    walk_in = read("apps/business/src/screens/walk-in.tsx")

    assert "const activeItems = agenda.items.filter((item) => item.status !== 'cancelled' && item.status !== 'no_show');" in agenda_screen
    assert "const cancelledItems = agenda.items.filter((item) => item.status === 'cancelled' || item.status === 'no_show');" in agenda_screen

    assert "onPress={() => props.onOpenAppointment(item.id)}" in timeline
    assert "onPress={props.onOpenBlock}" in timeline
    assert 'testID="business-agenda-cancelled"' in cancelled
    assert 'testID="business-agenda-cancelled-toggle"' in cancelled
    assert "const [expanded, setExpanded] = useState(false);" in cancelled

    assert "const [professionalId, setProfessionalId] = useState(activeContext?.operationalRole === 'professional' ? user?.id ?? '' : params.professionalId ?? '');" in walk_in
    assert "const preferred = slots.data?.slots.find((slot) => slot.localTime === params.time);" in walk_in
    assert "if (preferred) setStartsAt(preferred.startsAt);" in walk_in


# F3 testIDs: critical scope should be ASCII-safe and unique
def test_f3_testid_ascii_and_uniqueness_in_reviewed_scope():
    paths = [
        "apps/business/src/screens/agenda.tsx",
        "apps/business/src/screens/walk-in.tsx",
        "apps/business/src/components/agenda/agenda-week-strip.tsx",
        "apps/business/src/components/agenda/agenda-view-toggle.tsx",
        "apps/business/src/components/agenda/agenda-timeline.tsx",
        "apps/business/src/components/agenda/agenda-cancelled-list.tsx",
    ]

    pattern = re.compile(r'testID\s*=\s*"([^"]+)"')
    ids: list[str] = []
    for rel in paths:
        ids.extend(pattern.findall(read(rel)))

    assert ids
    assert all(all(ord(ch) < 128 for ch in test_id) for test_id in ids)
    assert len(ids) == len(set(ids))
