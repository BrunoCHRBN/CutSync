"""Source regressions for S1-04 professional quick booking."""

from pathlib import Path


DASHBOARD = Path("/app/src/components/screens/BarberDashboardExperience.tsx")
MODAL = Path("/app/src/components/professional/ProfessionalQuickBook.tsx")
AVAILABILITY_HOOK = Path("/app/src/hooks/useAvailableSlots.ts")
ERRORS = Path("/app/src/utils/appointmentErrors.ts")


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def test_header_and_timeline_openings_have_explicit_sources() -> None:
    content = _read(DASHBOARD)

    assert "type QuickBookSource = 'header' | 'timeline';" in content
    assert "setQuickBookSource('header')" in content
    assert "setQuickBookSource('timeline')" in content
    assert "quickBookSource !== 'header'" in content


def test_timeline_preserves_clicked_date_and_time() -> None:
    content = _read(DASHBOARD)

    assert "setQuickTime(slot);" in content
    assert "const newDate = new Date(selectedDate);" in content
    assert "setQuickDate(newDate);" in content
    assert "if (quickOpen)" not in content


def test_quick_booking_uses_centralized_availability_and_server_timestamp() -> None:
    content = _read(DASHBOARD)

    assert "useAvailableSlots" in content
    assert "await refreshQuickAvailability()" in content
    assert "slot.available && slot.localTime === quickTime" in content
    assert "target_date_time: confirmedSlot.startsAt" in content
    assert "times={quickAvailableSlots.map((slot) => slot.localTime)}" in content
    assert "quickOccupiedTimes" not in content


def test_double_submission_is_locked_before_async_work() -> None:
    content = _read(DASHBOARD)

    assert "const quickSubmissionLocked = useRef(false);" in content
    assert "if (quickSubmissionLocked.current || quickLoading) return;" in content
    assert content.index("quickSubmissionLocked.current = true;") < content.index(
        "await refreshQuickAvailability()"
    )
    assert "quickSubmissionLocked.current = false;" in content


def test_known_rpc_errors_have_specific_messages() -> None:
    content = _read(ERRORS)

    for code in (
        "appointment_must_be_in_future",
        "appointment_conflict",
        "professional_unavailable",
        "service_unavailable",
        "service_unavailable_for_professional",
        "client_name_required",
        "forbidden",
    ):
        assert code in content

    assert "translateAppointmentError(err" in _read(DASHBOARD)


def test_modal_exposes_availability_states_and_disables_invalid_submit() -> None:
    content = _read(MODAL)

    assert 'testID="barber-quick-availability-loading"' in content
    assert 'testID="barber-quick-availability-error"' in content
    assert 'testID="barber-quick-availability-empty"' in content
    assert 'testID="barber-quick-selected-time-unavailable"' in content
    assert "disabled={submitDisabled}" in content


def test_availability_results_cannot_leak_between_service_or_date_changes() -> None:
    content = _read(AVAILABILITY_HOOK)

    assert "resolvedQueryKey === queryKey" in content
    assert "const currentSlots = hasCurrentResult ? slots : [];" in content
    assert "Boolean(queryKey && !hasCurrentResult)" in content