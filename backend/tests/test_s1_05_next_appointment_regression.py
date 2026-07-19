"""Source regressions for S1-05 shared next appointment."""

from pathlib import Path


HOOK = Path("/app/src/hooks/useNextAppointment.ts")
CARD = Path("/app/src/components/booking/NextAppointmentCard.tsx")
ADMIN_CARD = Path("/app/src/components/admin/GlobalNextAppointmentCard.tsx")
PRO_DASHBOARD = Path("/app/src/components/screens/BarberDashboardExperience.tsx")
ADMIN_DASHBOARD = Path("/app/src/components/screens/AdminDashboardExperience.tsx")


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def test_hook_queries_only_future_active_appointments_in_order() -> None:
    content = _read(HOOK)

    assert ".eq('establishment_id', establishmentId)" in content
    assert ".in('status', ['pending', 'confirmed'])" in content
    assert ".gte('date_time', new Date().toISOString())" in content
    assert ".order('date_time', { ascending: true })" in content
    assert ".limit(1)" in content
    assert ".maybeSingle()" in content


def test_professional_filter_is_optional_and_explicit() -> None:
    content = _read(HOOK)

    assert "if (professionalId) query = query.eq('professional_id', professionalId);" in content
    assert "establishmentId: profile?.establishment_id" in _read(PRO_DASHBOARD)
    assert "professionalId: profile?.id" in _read(PRO_DASHBOARD)
    assert "establishmentId: profile?.establishment_id" in _read(ADMIN_DASHBOARD)


def test_hook_reuses_secure_participant_names_rpc() -> None:
    content = _read(HOOK)

    assert "get_appointment_participant_names" in content
    assert "target_appointment_ids: [data.id]" in content
    assert "names?.client_name" in content
    assert "names?.professional_name" in content


def test_hook_has_realtime_refresh_and_request_race_protection() -> None:
    content = _read(HOOK)

    assert "const requestId = useRef(0);" in content
    assert "if (currentRequest === requestId.current)" in content
    assert "event: '*'" in content
    assert "table: 'appointments'" in content
    assert "() => { void refresh(); }" in content
    assert "void supabase.removeChannel(channel);" in content


def test_switching_establishment_never_reuses_previous_result() -> None:
    content = _read(HOOK)

    assert "const queryKey = establishmentId" in content
    assert "resolvedQueryKey === queryKey" in content
    assert "appointment: hasCurrentResult ? appointment : null" in content
    assert "Boolean(queryKey && !hasCurrentResult)" in content
    assert "error: hasCurrentResult ? error : null" in content


def test_shared_card_has_loading_error_free_and_active_states() -> None:
    content = _read(CARD)

    assert "`${testIDPrefix}-loading`" in content
    assert "`${testIDPrefix}-error`" in content
    assert "`${testIDPrefix}-free`" in content
    assert "`${testIDPrefix}-time`" in content
    assert "Agenda indisponível" in content
    assert "Agenda livre" in content
    assert "Nenhum atendimento futuro pendente ou confirmado." in content


def test_professional_replaces_fragile_direct_query_with_shared_card() -> None:
    content = _read(PRO_DASHBOARD)

    assert "useNextAppointment" in content
    assert "<NextAppointmentCard" in content
    assert "setNextAppointment" not in content
    assert "appointments_barber_id_fkey" not in content
    assert 'testID="barber-next-metric"' not in content


def test_admin_has_global_card_independent_from_daily_panel() -> None:
    content = _read(ADMIN_DASHBOARD)
    card = _read(ADMIN_CARD)

    assert "useNextAppointment" in content
    assert "<GlobalNextAppointmentCard" in content
    assert 'testID="global-next-appointment-card"' in card
    assert "showProfessional" in card
    assert 'testID="admin-appointments-panel"' in content
    assert "dateFrom: dailyRange.start.toISOString()" in content


def test_mutations_and_manual_refresh_reload_next_appointment() -> None:
    for path in (PRO_DASHBOARD, ADMIN_DASHBOARD):
        content = _read(path)
        assert "refresh: refreshNextAppointment" in content
        assert "refreshNextAppointment()" in content
        assert "await refresh();" in content


def test_dashboard_sync_status_includes_next_appointment_errors() -> None:
    professional = _read(PRO_DASHBOARD)
    admin = _read(ADMIN_DASHBOARD)

    assert "appointmentError || nextAppointmentError" in professional
    assert "isSyncing || nextAppointmentLoading" in professional
    assert "dailyError || periodError || nextAppointmentError" in admin
    assert "dailyLoading || periodLoading || nextAppointmentLoading" in admin