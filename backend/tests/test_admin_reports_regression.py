"""Static regression coverage for establishment admin reports and catalog improvements."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
REPORT_SQL = ROOT / "supabase/migrations/20260720004000_admin_reports.sql"
CATALOG_SQL = ROOT / "supabase/migrations/20260720004100_service_catalog_management.sql"
REPORT_COMPAT_SQL = ROOT / "supabase/migrations/20260720004200_admin_reports_optional_schedule_blocks.sql"
INTERACTIVE_REPORT_SQL = ROOT / "supabase/migrations/20260725000000_interactive_admin_reports.sql"
REPORT_SCREEN = ROOT / "apps/web/src/components/screens/AdminReportsExperience.tsx"
REPORT_HOOK = ROOT / "apps/web/src/hooks/use-admin-report.ts"
SERVICES_SCREEN = ROOT / "apps/web/src/components/screens/ServicesExperience.tsx"
TEAM_SCREEN = ROOT / "apps/web/src/components/screens/TeamExperience.tsx"


def test_report_rpc_is_tenant_scoped_and_admin_only() -> None:
    sql = REPORT_SQL.read_text(encoding="utf-8")

    assert "CREATE OR REPLACE FUNCTION public.get_admin_report" in sql
    assert "public.has_active_membership(target_establishment_id, ARRAY['admin'])" in sql
    assert "appointment.establishment_id = target_establishment_id" in sql
    assert "GRANT EXECUTE ON FUNCTION public.get_admin_report" in sql
    assert "REVOKE ALL ON FUNCTION public.get_admin_report" in sql


def test_occupancy_uses_minutes_journeys_and_blocks() -> None:
    sql = REPORT_SQL.read_text(encoding="utf-8")

    assert "admin_report_available_minutes" in sql
    assert "professional_record.work_hours::jsonb" in sql
    assert "establishment_hours_text::jsonb" in sql
    assert "public.schedule_blocks" in sql
    assert "appointment.duration_minutes" in sql
    assert "12 *" not in sql


def test_reports_tolerate_database_without_schedule_blocks_feature() -> None:
    sql = REPORT_COMPAT_SQL.read_text(encoding="utf-8")

    assert "to_regclass('public.schedule_blocks') IS NOT NULL" in sql
    assert "IF schedule_blocks_available THEN" in sql
    assert "EXECUTE $query$" in sql
    assert "FROM public.schedule_blocks" in sql


def test_report_contract_covers_growth_fronts() -> None:
    sql = REPORT_SQL.read_text(encoding="utf-8")

    for key in (
        "production_realized",
        "scheduled_value",
        "average_ticket",
        "occupancy_rate",
        "daily_series",
        "hourly_demand",
        "services",
        "professionals",
        "cancellations",
        "returning_clients",
        "walk_in_appointments",
    ):
        assert f"'{key}'" in sql


def test_report_screen_has_periods_accessible_table_and_csv() -> None:
    screen = REPORT_SCREEN.read_text(encoding="utf-8")

    for preset in ("7d", "30d", "90d", "month", "custom"):
        assert f"'{preset}'" in screen
    assert "buildCsv" in screen
    assert "reports-daily-table" in screen
    assert "Produção não é caixa" in screen
    assert "ReportChart" in screen


def test_report_hook_refreshes_relevant_realtime_sources() -> None:
    hook = REPORT_HOOK.read_text(encoding="utf-8")

    for table in ("appointments", "schedule_blocks", "services", "memberships"):
        assert f"table: '{table}'" in hook
    assert "target_establishment_id: establishmentId" in hook


def test_interactive_report_preserves_legacy_contract_and_hardens_details() -> None:
    sql = INTERACTIVE_REPORT_SQL.read_text(encoding="utf-8")

    assert "CREATE OR REPLACE FUNCTION public.get_admin_report_v2" in sql
    assert "CREATE OR REPLACE FUNCTION public.get_admin_report_details" in sql
    assert "CREATE OR REPLACE FUNCTION public.get_admin_report(" not in sql
    assert "public.has_active_membership(target_establishment_id, ARRAY['admin'])" in sql
    assert "target_dimension NOT IN ('appointments', 'clients')" in sql
    assert "LEAST(GREATEST(COALESCE(target_limit, 25), 1), 25)" in sql
    assert "report.clients_identified.viewed" in sql
    assert "'display_name'" in sql
    assert "'phone'" not in sql
    assert "'email'" not in sql
    assert "REVOKE ALL ON FUNCTION public.get_admin_report_v2" in sql
    assert "REVOKE ALL ON FUNCTION public.get_admin_report_details" in sql


def test_interactive_report_screen_has_tabs_filters_drilldown_and_agenda_link() -> None:
    screen = REPORT_SCREEN.read_text(encoding="utf-8")
    detail = (ROOT / "apps/web/src/components/reports/report-detail-panel.tsx").read_text(encoding="utf-8")
    hook = (ROOT / "apps/web/src/hooks/use-admin-report-details.ts").read_text(encoding="utf-8")

    for tab in ("overview", "operations", "team", "services", "clients"):
        assert f"'{tab}'" in screen
    assert "ReportFilterBar" in screen
    assert "ReportDetailPanel" in screen
    assert "router.setParams" in screen
    assert "filters: urlState.filters" in screen
    assert "Abrir na agenda" in detail
    assert "target_limit: 25" in hook
    assert "requestId.current" in hook


def test_service_management_supports_edit_duplicate_order_and_impact() -> None:
    screen = SERVICES_SCREEN.read_text(encoding="utf-8")
    sql = CATALOG_SQL.read_text(encoding="utf-8")

    assert "startEditing" in screen
    assert "duplicateService" in screen
    assert "reorderService" in screen
    assert "count: 'exact'" in screen
    assert "agendamento" in screen and "futuro" in screen
    assert "CREATE OR REPLACE FUNCTION public.reorder_service" in sql


def test_team_prioritizes_pending_invites_and_contextual_shortcuts() -> None:
    screen = TEAM_SCREEN.read_text(encoding="utf-8")

    assert "pendingInvitations" in screen
    assert "showInvitationHistory" in screen
    assert "Desempenho" in screen
    assert "Ver agenda" in screen
