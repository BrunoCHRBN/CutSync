"""Source regressions for S1-03 centralized availability."""

from pathlib import Path


MIGRATION = Path("/app/supabase/migrations/20260719000000_centralized_availability.sql")
HOOK = Path("/app/src/hooks/useAvailableSlots.ts")
CLIENT_BOOKING = Path("/app/src/components/screens/BookingExperience.tsx")
PUBLIC_BOOKING = Path("/app/src/app/[slug]/booking.tsx")
GENERATED_TYPES = Path("/app/src/types/supabase.generated.ts")
LEGACY_FALLBACK = Path("/app/src/services/legacyAvailability.ts")
PROFESSIONAL_DASHBOARD = Path("/app/src/components/screens/BarberDashboardExperience.tsx")
PROFESSIONAL_RESCHEDULE = Path("/app/src/components/professional/ProfessionalReschedule.tsx")


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def test_migration_generates_timezone_aware_thirty_minute_slots() -> None:
    content = _read(MIGRATION)

    assert "CREATE OR REPLACE FUNCTION public.get_available_slots" in content
    assert "target_local_date date" in content
    assert "now() AT TIME ZONE target_timezone" in content
    assert "local_slot AT TIME ZONE target_timezone" in content
    assert "interval '30 minutes'" in content


def test_migration_intersects_schedules_and_resolves_custom_duration() -> None:
    content = _read(MIGRATION)

    assert "GREATEST(establishment_open, professional_open)" in content
    assert "LEAST(establishment_close, professional_close)" in content
    assert "COALESCE(professional_service.duration_minutes, service.duration_minutes)" in content
    assert "service_unavailable_for_professional" in content
    assert "schedule_not_configured" in content
    assert "service_exceeds_workday" in content


def test_create_and_reschedule_enforce_same_availability_contract() -> None:
    content = _read(MIGRATION)

    assert content.count("FROM public.compute_available_slots(") >= 3
    drop_reschedule = "DROP FUNCTION IF EXISTS public.reschedule_appointment(text, timestamptz, uuid, text);"
    create_reschedule = "CREATE FUNCTION public.reschedule_appointment("
    assert drop_reschedule in content
    assert content.index(drop_reschedule) < content.index(create_reschedule)
    assert "appointment_outside_availability" in content
    assert "IF selected_slot.unavailable_reason = 'busy' THEN RAISE EXCEPTION 'appointment_conflict'" in content
    assert "ignored_appointment_id IS NULL OR appointment.id <> ignored_appointment_id" in content
    assert "EXCEPTION WHEN exclusion_violation" in content


def test_public_reschedule_ignore_is_authorized() -> None:
    content = _read(MIGRATION)

    assert "appointment.client_id = (SELECT auth.uid())" in content
    assert "appointment.establishment_id = target_establishment_id" in content
    assert "appointment.professional_id = (SELECT auth.uid())" in content
    assert "current_appointment.professional_id = actor_id" in content
    assert "THEN RAISE EXCEPTION 'forbidden'" in content


def test_shared_hook_calls_new_rpc_and_exposes_distinct_states() -> None:
    content = _read(HOOK)

    assert "rpc('get_available_slots'" in content
    assert "Sem expediente nesta data." in content
    assert "Jornada não configurada para esta data." in content
    assert "Agenda lotada nesta data." in content
    assert "O expediente desta data já encerrou." in content
    assert "Nenhum horário disponível nesta data." in content
    assert "setInterval(() => { void refresh(); }, 15_000)" in content
    assert "if (currentRequest === requestId.current)" in content
    assert "appointmentIdOverride ?? appointmentId ?? null" in content


def test_missing_rpc_uses_scoped_legacy_availability_fallback() -> None:
    hook = _read(HOOK)
    fallback = _read(LEGACY_FALLBACK)

    assert "isAvailabilityRpcMissing(availabilityResult.error)" in hook
    assert "error?.code === MISSING_AVAILABILITY_RPC_CODE" in fallback
    assert "error.message?.includes('get_available_slots')" in fallback
    assert "rpc('get_public_busy_slots'" in fallback
    assert "rpc('get_public_team'" in fallback
    assert "professional_services" in fallback
    assert "appointmentId" in fallback


def test_professional_reschedule_uses_shared_availability_contract() -> None:
    dashboard = _read(PROFESSIONAL_DASHBOARD)
    modal = _read(PROFESSIONAL_RESCHEDULE)

    assert "availableSlots: rescheduleAvailableSlots" in dashboard
    assert "appointmentId: rescheduleItem?.id" in dashboard
    assert "rescheduleAvailableSlots.map((slot) => slot.localTime)" in dashboard
    assert "barber-reschedule-availability-loading" in modal
    assert "barber-reschedule-availability-error" in modal
    assert "barber-reschedule-availability-empty" in modal
    assert "occupiedTimes" not in dashboard


def test_both_booking_flows_use_shared_available_slots() -> None:
    for path in (CLIENT_BOOKING, PUBLIC_BOOKING):
        content = _read(path)
        assert "useAvailableSlots" in content
        assert "refreshAvailability" in content
        assert "booking-availability-loading" in content
        assert "booking-availability-error" in content
        assert "booking-availability-empty" in content
        assert "get_public_busy_slots" not in content

    assert "refreshAvailability(reschedule_id || null)" in _read(PUBLIC_BOOKING)


def test_fixed_time_lists_and_direct_appointment_reads_are_removed() -> None:
    client = _read(CLIENT_BOOKING)
    public = _read(PUBLIC_BOOKING)

    assert "const availableTimes" not in client
    assert "const availableTimes" not in public
    assert "bookedSegments" not in client
    assert "bookedSegments" not in public
    assert ".from('appointments')\n        .select('date_time" not in client


def test_generated_types_include_new_availability_rpc() -> None:
    content = _read(GENERATED_TYPES)

    assert "get_available_slots" in content
    assert "target_appointment_id?: string | null" in content
    assert "unavailable_reason: string | null" in content
