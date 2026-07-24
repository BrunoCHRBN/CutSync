from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase" / "migrations" / "20260726000000_multi_unit_organizations_and_billing.sql"


def migration_sql() -> str:
    return MIGRATION.read_text(encoding="utf-8").lower()


def test_multi_unit_tables_and_partial_unique_index_exist():
    sql = migration_sql()
    for table in (
        "organizations",
        "organization_members",
        "organization_establishments",
        "organization_billing_accounts",
        "organization_billing_plans",
        "plan_unit_tiers",
        "organization_subscriptions",
        "subscription_units",
        "organization_billing_invoices",
        "organization_billing_events",
    ):
        assert f"create table public.{table}" in sql
        assert f"alter table public.{table} enable row level security" in sql
    assert "organization_establishments_one_active_group_idx" in sql
    assert "where status = 'active' and effective_until is null" in sql


def test_rpc_contracts_are_authenticated_and_security_definer():
    sql = migration_sql()
    for function in (
        "create_organization",
        "add_organization_establishment",
        "remove_organization_establishment",
        "invite_organization_member",
        "update_organization_member_role",
        "get_my_organizations",
        "get_organization_context",
        "get_organization_report",
    ):
        assert f"function public.{function}" in sql
        assert f"grant execute on function public.{function}" in sql
    assert sql.count("security definer") >= 10
    assert "from public, anon" in sql


def test_billing_snapshot_and_network_guard_are_explicit():
    sql = migration_sql()
    assert "unit_snapshot jsonb not null" in sql
    assert "plan_snapshot jsonb not null" in sql
    assert "network_plan_required" in sql
    assert "percentage_basis_points" in sql
    assert "now() + interval '7 days'" in sql


def test_legacy_profile_context_is_not_mutated():
    sql = migration_sql()
    assert "update public.profiles" not in sql
    assert "switch_active_establishment" not in sql
