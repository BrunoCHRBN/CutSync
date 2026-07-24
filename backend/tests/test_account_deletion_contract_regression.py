from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase" / "migrations" / "20260724020000_client_account_deletion.sql"
EDGE_FUNCTION = ROOT / "supabase" / "functions" / "execute-client-account-deletion" / "index.ts"
GOVERNANCE_SERVICE = ROOT / "apps" / "web" / "src" / "services" / "governance-compliance.ts"


def test_client_rpcs_are_identity_scoped_and_have_no_identity_arguments():
    sql = MIGRATION.read_text(encoding="utf-8")

    assert "submit_client_account_deletion_request()" in sql
    assert "get_client_account_deletion_request()" in sql
    assert "caller_id uuid := (SELECT auth.uid())" in sql
    assert "WHERE request.target_profile_id = caller_id" in sql
    assert "governance_privacy_requests_active_profile_idx" in sql


def test_execution_requires_governance_aal2_and_server_only_admin_operations():
    sql = MIGRATION.read_text(encoding="utf-8")
    edge = EDGE_FUNCTION.read_text(encoding="utf-8")

    assert "auth.jwt() ->> 'aal'" in sql
    assert "SaaS_Editor" in sql and "SaaS_Owner" in sql
    assert "TO service_role" in sql
    assert "FROM PUBLIC, anon, authenticated" in sql
    assert 'claims?.aal !== "aal2"' in edge
    assert ".auth.admin.deleteUser(" in edge
    assert "SUPABASE_SERVICE_ROLE_KEY" in edge
    assert "console.log" not in edge
    assert "console.error" not in edge


def test_partial_failure_is_recoverable_and_governance_uses_edge_function():
    sql = MIGRATION.read_text(encoding="utf-8")
    edge = EDGE_FUNCTION.read_text(encoding="utf-8")
    governance = GOVERNANCE_SERVICE.read_text(encoding="utf-8")

    assert "'failed'" in sql
    assert "attempt_count = attempt_count + 1" in sql
    assert "profile_anonymized_at IS NOT NULL" in sql
    assert "fail_client_account_deletion" in edge
    assert "execute-client-account-deletion" in governance
    assert "execute_governance_privacy_request" not in governance
