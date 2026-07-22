"""Static regression checks for the GSP Framework, Governance Central, and Automated Onboarding."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]

MIGRATION_GSP = ROOT / "supabase/migrations/20260720000000_gsp_governance_and_circuit_breaker.sql"
MIGRATION_INVITES = ROOT / "supabase/migrations/20260720001000_secure_invites_matching.sql"
MIGRATION_CNPJ_RPC = ROOT / "supabase/migrations/20260720002000_cnpj_auto_promotion_rpc.sql"
MIGRATION_TRIGGERS = ROOT / "supabase/migrations/20260720003000_governance_audit_triggers.sql"

SUPABASE_GOVERNANCE_SERVICE = ROOT / "apps/web/src/services/supabaseGovernance.ts"
GOVERNANCE_SCREEN = ROOT / "apps/web/src/app/governance/index.tsx"
REQUEST_SCREEN = ROOT / "apps/web/src/components/screens/RequestEstablishmentExperience.tsx"
AUTH_CONTEXT = ROOT / "apps/web/src/contexts/AuthContext.tsx"
APP_LAYOUT = ROOT / "apps/web/src/app/_layout.tsx"


def _read(path: Path) -> str:
    assert path.exists(), f"Missing GSP file: {path}"
    return path.read_text(encoding="utf-8", errors="ignore")


def test_database_migrations_gsp_circuit_breaker() -> None:
    gsp_sql = _read(MIGRATION_GSP)
    assert "governance_role_enum" in gsp_sql
    assert "governance_users" in gsp_sql
    assert "is_governance_user" in gsp_sql
    assert "security_audit_logs" in gsp_sql
    assert "prevent_security_audit_mutation" in gsp_sql
    assert "is_establishment_active" in gsp_sql
    assert "anonymize_user_profile" in gsp_sql
    assert "account_status IN ('pending_verification', 'active', 'delinquent', 'blocked')" in gsp_sql


def test_database_migrations_secure_invites_matching() -> None:
    inv_sql = _read(MIGRATION_INVITES)
    assert "establishment_invites" in inv_sql
    assert "active_establishment_invites" in inv_sql
    assert "accept_invitation_v2" in inv_sql
    assert "inspect_invitation_v2" in inv_sql
    assert "create_establishment_invite_v2" in inv_sql
    assert "invitation_contact_mismatch" in inv_sql


def test_database_migrations_cnpj_and_cpf_rpc() -> None:
    cnpj_sql = _read(MIGRATION_CNPJ_RPC)
    assert "create_establishment_and_promote_owner" in cnpj_sql
    assert "create_establishment_cpf" in cnpj_sql
    assert "REVOKE ALL ON FUNCTION public.create_establishment_and_promote_owner" in cnpj_sql
    assert "REVOKE ALL ON FUNCTION public.create_establishment_cpf" in cnpj_sql


def test_database_migrations_governance_audit_triggers() -> None:
    trg_sql = _read(MIGRATION_TRIGGERS)
    assert "audit_governance_actions" in trg_sql
    assert "audit_establishments_status" in trg_sql
    assert "audit_governance_users" in trg_sql


def test_supabase_governance_client_zero_persistence() -> None:
    client_content = _read(SUPABASE_GOVERNANCE_SERVICE)
    assert "persistSession: false" in client_content
    assert "supabaseGovernance" in client_content


def test_governance_dashboard_uses_volatile_auth_and_control() -> None:
    screen_content = _read(GOVERNANCE_SCREEN)
    assert "supabaseGovernance" in screen_content
    assert "updateAccountStatus" in screen_content
    assert "auditLogs" in screen_content
    assert "account_status" in screen_content


def test_request_onboarding_experience_supports_dual_track_and_lgpd() -> None:
    screen_content = _read(REQUEST_SCREEN)
    assert "verify-cnpj-and-promote" in screen_content
    assert "create_establishment_cpf" in screen_content
    assert "lgpdTermsAccepted" in screen_content
    assert "whatsappVerified" in screen_content


def test_auth_context_includes_governance_roles() -> None:
    auth_content = _read(AUTH_CONTEXT)
    assert "governanceRole" in auth_content
    assert "governance_users" in auth_content
    assert "setGovernanceRole" in auth_content


def test_app_routing_blocks_governance_on_production_build() -> None:
    layout_content = _read(APP_LAYOUT)
    assert "EXPO_PUBLIC_BUILD_TARGET" in layout_content
    assert "buildTarget === 'production'" in layout_content
    assert "governanceRole" in layout_content
