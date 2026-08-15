"""Static regression coverage for F4 Business Today dashboard contracts."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase/migrations/20260817000000_business_daily_metrics.sql"
BUSINESS_TYPES = ROOT / "packages/database/src/business.ts"
RPC_TYPES = ROOT / "packages/database/src/business-rpc.generated.ts"
DASHBOARD_API = ROOT / "apps/business/src/features/dashboard/business-dashboard-api.ts"
METRICS_HOOK = ROOT / "apps/business/src/features/dashboard/use-business-daily-metrics.ts"
WHATSAPP = ROOT / "apps/business/src/features/contact/whatsapp.ts"
METRICS_COMPONENT = ROOT / "apps/business/src/components/dashboard/today-financial-metrics.tsx"
NEXT_ACTIONS_COMPONENT = ROOT / "apps/business/src/components/dashboard/next-appointment-actions.tsx"
TODAY_SCREEN = ROOT / "apps/business/src/screens/today.tsx"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


# Migration security + grants
def test_rpc_is_security_definer_with_fixed_search_path_and_auth_guards() -> None:
    sql = _read(MIGRATION)

    assert "SECURITY DEFINER" in sql
    assert "SET search_path = pg_catalog, public" in sql
    assert "auth.uid()" in sql
    assert "authentication_required" in sql
    assert "assert_financial_ops_enabled" in sql
    assert "has_business_capability(target_establishment_id, 'view_unit_reports')" in sql


def test_rpc_permissions_revoke_public_anon_and_grant_only_auth_roles() -> None:
    sql = _read(MIGRATION)

    assert "REVOKE ALL ON FUNCTION public.get_business_daily_metrics(uuid, date) FROM PUBLIC, anon;" in sql
    assert "GRANT EXECUTE ON FUNCTION public.get_business_daily_metrics(uuid, date) TO authenticated, service_role;" in sql


# Business metrics SQL contract
def test_rpc_uses_unit_timezone_and_local_day_boundaries() -> None:
    sql = _read(MIGRATION)

    assert "SELECT establishment.timezone, establishment.currency" in sql
    assert "day_start := target_local_date::timestamp AT TIME ZONE target_timezone;" in sql
    assert "day_end := (target_local_date + 1)::timestamp AT TIME ZONE target_timezone;" in sql
    assert "unsupported_currency" in sql


def test_rpc_revenue_ticket_and_occupancy_match_f4_rules() -> None:
    sql = _read(MIGRATION)

    assert "FROM public.service_orders AS service_order" in sql
    assert "service_order.status = 'closed'" in sql
    assert "service_order.closed_at >= day_start" in sql
    assert "service_order.closed_at < day_end" in sql
    assert "appointment.status IN ('pending', 'confirmed', 'completed')" in sql
    assert "LEAST(round(occupied_minutes * 100.0 / available_minutes, 1), 100)" in sql


def test_rpc_returns_safe_zero_when_no_available_minutes() -> None:
    sql = _read(MIGRATION)

    # F4 contract: availableMinutes must be safe-zero when availability cannot be computed.
    # This should be COALESCE(public.admin_report_available_minutes(...), 0).
    assert "COALESCE(public.admin_report_available_minutes(" in sql


# Mapper + API fail-closed behavior
def test_business_daily_metrics_mapper_is_fail_closed_and_validates_ranges() -> None:
    content = _read(BUSINESS_TYPES)

    assert "export const mapBusinessDailyMetrics" in content
    assert "/^\\d{4}-\\d{2}-\\d{2}$/" in content
    assert "value.currency === 'BRL'" in content
    assert "asMoneyCentsField(value.revenueCents)" in content
    assert "asSafeInteger(value.closedOrders)" in content
    assert "value.occupancyRate >= 0" in content
    assert "value.occupancyRate <= 100" in content


def test_dashboard_api_rejects_invalid_request_and_invalid_response() -> None:
    content = _read(DASHBOARD_API)

    assert "localDatePattern" in content
    assert "throw new BusinessFeatureError('invalid_request')" in content
    assert "callBusinessRpc('get_business_daily_metrics'" in content
    assert "if (!metrics) throw new BusinessFeatureError('invalid_response')" in content


# Hook behavior
def test_metrics_hook_gates_query_by_financial_ops_and_capability() -> None:
    hook = _read(METRICS_HOOK)

    assert "activeContext?.financialOpsEnabled" in hook
    assert "hasCapability('view_unit_reports')" in hook
    assert "enabled: Boolean(user && activeContext && visible)" in hook


def test_metrics_hook_uses_service_orders_query_key_stale_time_and_realtime_tables() -> None:
    hook = _read(METRICS_HOOK)

    assert "'service-orders'" in hook
    assert "staleTime: 30_000" in hook
    assert "table: 'service_orders'" in hook
    assert "table: 'appointments'" in hook
    assert "void supabase?.removeChannel(channel);" in hook


# UI contract checks
def test_today_financial_metrics_has_expected_labels_states_and_unique_testids() -> None:
    component = _read(METRICS_COMPONENT)

    for testid in (
        "business-today-financial",
        "business-today-financial-title",
        "business-today-financial-loading",
        "business-today-financial-error",
        "business-today-revenue",
        "business-today-average-ticket",
        "business-today-occupancy",
    ):
        assert f'testID="{testid}"' in component

    assert "Receita fechada" in component
    assert "Ticket médio" in component
    assert "Ocupação" in component


def test_next_appointment_actions_obey_capabilities_real_command_and_whatsapp_rules() -> None:
    component = _read(NEXT_ACTIONS_COMPONENT)

    assert "useBusinessAppointment(item.id)" in component
    assert "activeContext?.accessMode === 'full'" in component
    assert "allowedActions.includes('confirm')" in component
    assert "await appointment.runCommand('confirm')" in component
    assert "Haptics.notificationAsync" in component
    assert "activeContext?.financialOpsEnabled && hasCapability('view_orders')" in component
    assert "testID=\"business-next-whatsapp\"" in component


def test_today_screen_uses_timezone_greeting_first_name_and_ascii_safe_testids() -> None:
    screen = _read(TODAY_SCREEN)

    assert "new Intl.DateTimeFormat('pt-BR', { timeZone, hour: '2-digit', hourCycle: 'h23' })" in screen
    assert "displayName.split(' ')[0]" in screen
    assert 'testID="business-today-screen"' in screen
    assert 'testID="business-today-header"' in screen
    assert 'testID="business-today-fab-schedule"' in screen


def test_whatsapp_contact_uses_click_to_chat_without_business_api_or_tokens() -> None:
    file = _read(WHATSAPP)

    assert "sanitizeWhatsAppPhone" in file
    assert "!/^\\d{8,15}$/.test(normalized)" in file
    assert "normalized.startsWith('00')" in file
    assert "https://wa.me/" in file
    assert "encodeURIComponent(text)" in file
    assert "Linking.canOpenURL(url)" in file
    assert "Linking.openURL(url)" in file
    assert "Business API" not in file
    assert "token" not in file.lower()


def test_generated_rpc_surface_contains_daily_metrics_function() -> None:
    rpc = _read(RPC_TYPES)

    assert "get_business_daily_metrics" in rpc
    assert "target_establishment_id" in rpc
    assert "target_local_date" in rpc
