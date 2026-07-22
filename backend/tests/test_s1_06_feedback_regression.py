"""Source regressions for S1-06 minimum flow feedback."""

from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
ERRORS = PROJECT_ROOT / "packages/domain/src/appointment-errors.ts"
AVAILABILITY_HOOK = PROJECT_ROOT / "apps/web/src/hooks/useAvailableSlots.ts"
NEXT_APPOINTMENT_HOOK = PROJECT_ROOT / "apps/web/src/hooks/useNextAppointment.ts"
CLIENT_BOOKING = PROJECT_ROOT / "apps/web/src/components/screens/BookingExperience.tsx"
PUBLIC_BOOKING = PROJECT_ROOT / "apps/web/src/app/[slug]/booking.tsx"
CLIENT_APPOINTMENTS = PROJECT_ROOT / "apps/web/src/components/screens/AppointmentsExperience.tsx"
PRO_DASHBOARD = PROJECT_ROOT / "apps/web/src/components/screens/BarberDashboardExperience.tsx"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def test_sprint_feedback_messages_have_one_shared_source() -> None:
    content = _read(ERRORS)

    for message_key in (
        "appointmentCreated",
        "quickBookingCreated",
        "appointmentConflict",
        "availabilityLoadFailed",
        "nextAppointmentLoadFailed",
    ):
        assert message_key in content


def test_client_creation_redirects_to_visible_success_notice() -> None:
    booking = _read(CLIENT_BOOKING)
    public_booking = _read(PUBLIC_BOOKING)
    appointments = _read(CLIENT_APPOINTMENTS)

    assert "pathname: '/(client)/appointments'" in booking
    assert "feedback: 'appointment_created'" in booking
    assert "pathname: '/(client)/appointments'" in public_booking
    assert "appointment_created" in appointments
    assert "appointmentFeedbackMessages.appointmentCreated" in appointments
    assert 'testID="client-appointments-notice"' in appointments


def test_conflicts_are_translated_and_clear_stale_time_selection() -> None:
    for path in (CLIENT_BOOKING, PUBLIC_BOOKING):
        content = _read(path)
        assert "getAppointmentErrorText" in content
        assert "translateAppointmentError" in content
        assert "message.includes('appointment_conflict')" in content
        assert "setSelectedTime(null);" in content


def test_availability_failure_uses_danger_inline_notice() -> None:
    assert "appointmentFeedbackMessages.availabilityLoadFailed" in _read(AVAILABILITY_HOOK)

    for path in (CLIENT_BOOKING, PUBLIC_BOOKING):
        content = _read(path)
        assert 'testID="booking-availability-error" tone="danger"' in content
        assert 'testID="booking-availability-empty" tone="info"' in content


def test_next_appointment_failure_uses_shared_explicit_message() -> None:
    content = _read(NEXT_APPOINTMENT_HOOK)

    assert "appointmentFeedbackMessages.nextAppointmentLoadFailed" in content
    assert "setError(" in content


def test_professional_quick_booking_uses_shared_success_notice() -> None:
    content = _read(PRO_DASHBOARD)

    assert "appointmentFeedbackMessages.quickBookingCreated" in content
    assert 'testID="barber-action-notice"' in content
