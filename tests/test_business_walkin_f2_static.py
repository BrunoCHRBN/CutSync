from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_fab_visibility_contract_today_and_agenda_only():
    today = read("apps/business/src/screens/today.tsx")
    agenda = read("apps/business/src/screens/agenda.tsx")
    floating = read("apps/business/src/components/appointments/business-floating-action.tsx")

    assert "activeContext?.accessMode === 'full'" in today
    assert "hasCapability('create_self_walk_in') || hasCapability('create_team_walk_in')" in today
    assert 'testID="business-today-fab-schedule"' in today
    assert "router.push('/(app)/walk-in' as never)" in today

    assert "activeContext?.accessMode === 'full'" in agenda
    assert "hasCapability('create_self_walk_in') || hasCapability('create_team_walk_in')" in agenda
    assert 'testID="business-agenda-fab-schedule"' in agenda
    assert "router.push('/(app)/walk-in' as never)" in agenda

    assert "Haptics.impactAsync" in floating
    assert "onPress();" in floating


def test_walk_in_has_five_steps_and_forward_guardrails():
    walk_in = read("apps/business/src/screens/walk-in.tsx")
    progress = read("apps/business/src/components/appointments/walk-in-progress.tsx")

    assert "const steps = ['Cliente', 'Serviço', 'Profissional', 'Horário', 'Revisão'] as const;" in walk_in
    assert "disabled={index > currentStep}" in progress
    assert "onPress={() => onStepPress(index)}" in progress
    assert "accessibilityState={{ selected, disabled: index > currentStep }}" in progress


def test_client_service_professional_requirements_are_encoded():
    walk_in = read("apps/business/src/screens/walk-in.tsx")
    client_step = read("apps/business/src/components/appointments/walk-in-client-step.tsx")

    assert 'testID="business-walk-in-client-search"' in client_step
    assert "business-walk-in-client-" in client_step
    assert "OU CADASTRO RÁPIDO" in client_step
    assert "Digite ao menos 2 caracteres." in client_step
    assert "const clientValid = Boolean(selectedClientId || clientName.trim().length >= 2);" in walk_in

    assert "currency.format(service.price)" in walk_in
    assert "service.durationMinutes" in walk_in
    assert "activeContext?.operationalRole === 'professional'" in walk_in
    assert "name: 'Minha agenda'" in walk_in
    assert "member.status === 'active'" in walk_in


def test_schedule_slot_fetch_and_resets_follow_contract():
    walk_in = read("apps/business/src/screens/walk-in.tsx")
    schedule = read("apps/business/src/components/appointments/walk-in-schedule-step.tsx")
    api = read("apps/business/src/features/appointments/business-appointments-api.ts")

    assert "Array.from({ length: 7 }" in schedule
    assert "disabled={props.localDate <= today}" in schedule
    assert "Haptics.selectionAsync()" in schedule

    assert "enabled: Boolean(activeContext && professionalId && serviceId && localDatePattern.test(localDate))" in walk_in
    assert "queryFn: () => businessAppointmentsApi.getAvailableSlots" in walk_in
    assert "callBusinessRpc('get_available_slots'" in api

    assert "const setDate = (date: string) => { setLocalDate(date); setStartsAt(''); resetCommand(); };" in walk_in
    assert "const setService = (id: string) => { setServiceId(id); setStartsAt(''); resetCommand(); };" in walk_in
    assert "const setProfessional = (id: string) => { setProfessionalId(id); setStartsAt(''); resetCommand(); };" in walk_in


def test_review_confirmation_idempotency_and_cache_invalidation_exist():
    walk_in = read("apps/business/src/screens/walk-in.tsx")
    api = read("apps/business/src/features/appointments/business-appointments-api.ts")

    assert "business-walk-in-review-client" in walk_in
    assert "business-walk-in-review-service" in walk_in
    assert "business-walk-in-review-professional" in walk_in
    assert "business-walk-in-review-time" in walk_in
    assert "Observações (opcional)" in walk_in

    assert "requestId.current ??= createMobileRequestId();" in walk_in
    assert "callBusinessRpc('create_business_appointment'" in api
    assert "target_request_id: assertUuid(input.requestId)" in api
    assert "invalidateQueries({ queryKey: createBusinessQueryKey(user.id, activeContext.establishmentId, 'agenda') })" in walk_in
    assert "invalidateQueries({ queryKey: createBusinessQueryKey(user.id, activeContext.establishmentId, 'clients') })" in walk_in
    assert "Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)" in walk_in
    assert "business-walk-in-success-toast" in walk_in
    assert "router.replace(`/(app)/appointments/${result.appointmentId}` as never);" in walk_in


def test_walk_in_testids_are_ascii_safe_in_reviewed_f2_scope():
    paths = [
        "apps/business/src/screens/walk-in.tsx",
        "apps/business/src/screens/today.tsx",
        "apps/business/src/screens/agenda.tsx",
        "apps/business/src/components/appointments/business-floating-action.tsx",
        "apps/business/src/components/appointments/walk-in-choice.tsx",
        "apps/business/src/components/appointments/walk-in-progress.tsx",
        "apps/business/src/components/appointments/walk-in-client-step.tsx",
        "apps/business/src/components/appointments/walk-in-selection-step.tsx",
        "apps/business/src/components/appointments/walk-in-schedule-step.tsx",
        "apps/business/src/components/ui/business-toast.tsx",
    ]

    pattern = re.compile(r'testID\s*=\s*"([^"]+)"')
    collected: list[str] = []

    for rel in paths:
        text = read(rel)
        collected.extend(pattern.findall(text))

    assert collected
    assert all(all(ord(ch) < 128 for ch in test_id) for test_id in collected)
