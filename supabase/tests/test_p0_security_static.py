"""Static regression tests for P0 authorization hardening (no remote DB writes)."""

from pathlib import Path


ROOT = Path("/app")
MIGRATION_MAIN = ROOT / "supabase/migrations/20260716050000_secure_memberships_and_invites.sql"
MIGRATION_FINAL = ROOT / "supabase/migrations/20260716051000_finalize_p0_authorization.sql"
RLS_MATRIX = ROOT / "supabase/tests/authorization_p0.sql"
REGISTER_SCREEN = ROOT / "src/components/screens/RegisterExperience.tsx"
REGISTER_ROUTE = ROOT / "src/app/(auth)/register.tsx"
TEAM_HOOK = ROOT / "src/hooks/useTeam.ts"
APPOINTMENTS_HOOK = ROOT / "src/hooks/useAppointments.ts"


def _read(path: Path) -> str:
    assert path.exists(), f"Missing required file: {path}"
    return path.read_text(encoding="utf-8")


# module: public signup hardening
def test_public_signup_trigger_forces_client_without_tenant():
    sql = _read(MIGRATION_MAIN)
    assert "CREATE OR REPLACE FUNCTION public.handle_new_user()" in sql
    assert "'client'" in sql
    assert "NULL" in sql
    assert "NEW.raw_user_meta_data->>'name'" in sql
    assert "NEW.raw_user_meta_data->>'avatar_url'" in sql
    assert "NEW.raw_user_meta_data->>'phone'" in sql


# module: protected profile authorization fields
def test_profile_authorization_fields_are_blocked_for_direct_update():
    sql = _read(MIGRATION_MAIN)
    assert "CREATE OR REPLACE FUNCTION public.protect_profile_authorization_fields()" in sql
    assert "RAISE EXCEPTION 'protected_profile_fields'" in sql
    assert "BEFORE UPDATE OF role, establishment_id, commission_rate" in sql
    assert "REVOKE UPDATE ON public.profiles FROM authenticated;" in sql
    assert "GRANT UPDATE (name, phone, avatar_url, push_token) ON public.profiles TO authenticated;" in sql


# module: membership source of truth + team RPC
def test_memberships_and_team_rpc_are_authoritative():
    sql = _read(MIGRATION_MAIN)
    assert "CREATE TABLE IF NOT EXISTS public.memberships" in sql
    assert "CREATE OR REPLACE FUNCTION public.get_establishment_team" in sql
    assert "FROM public.memberships m JOIN public.profiles p ON p.id = m.profile_id" in sql
    hook = _read(TEAM_HOOK)
    assert "supabase.rpc('get_establishment_team'" in hook


# module: superadmin bootstrap constraints
def test_superadmin_bootstrap_comes_from_private_config_only():
    sql = _read(MIGRATION_MAIN)
    assert "current_setting('app.settings.cutsync_superadmin_emails', true)" in sql
    assert "INSERT INTO public.superadmins(profile_id, granted_by)" in sql
    assert "SELECT public.bootstrap_superadmins_from_config();" in sql


# module: invitation security contract
def test_invitation_contract_has_token_uniqueness_and_ttl_24h():
    sql = _read(MIGRATION_MAIN)
    assert "generated_token text := encode(extensions.gen_random_bytes(32), 'hex');" in sql
    assert "generated_expiry timestamptz := now() + interval '24 hours';" in sql
    assert "token_hash text NOT NULL UNIQUE" in sql
    assert "encode(extensions.digest(generated_token, 'sha256'), 'hex')" in sql
    assert "target_role = 'admin' AND NOT public.is_superadmin()" in sql
    assert "target_role = 'professional' AND NOT public.has_active_membership" in sql


# module: invitation acceptance hardening
def test_accept_invitation_enforces_token_email_and_single_use():
    sql = _read(MIGRATION_MAIN)
    assert "IF invitation_token !~ '^[0-9a-f]{64}$'" in sql
    assert "email_confirmed_at IS NOT NULL" in sql
    assert "invalid_or_used_invitation" in sql
    assert "expired_invitation" in sql
    assert "invitation_email_mismatch" in sql
    assert "SET status = 'accepted'" in sql


# module: negative matrix coverage
def test_negative_rls_matrix_covers_roles_and_cross_tenant_cases():
    matrix_sql = _read(RLS_MATRIX)
    assert "Cliente:" in matrix_sql
    assert "Profissional:" in matrix_sql
    assert "Admin A:" in matrix_sql
    assert "Superadmin:" in matrix_sql
    assert "professional can see another tenant memberships" in matrix_sql
    assert "professional can see another tenant profile" in matrix_sql
    assert "admin can see another tenant memberships" in matrix_sql
    assert "admin can see another tenant profile" in matrix_sql
    assert "invalid_invitation_token" in matrix_sql
    assert "invalid_or_used_invitation" in matrix_sql
    assert "expired_invitation" in matrix_sql


# module: public register flow hardening
def test_active_register_experience_does_not_send_role_or_establishment():
    register_screen = _read(REGISTER_SCREEN)
    assert "options: { data: { name: name.trim(), phone: phone.trim() } }" in register_screen
    assert "establishment_id" not in register_screen
    assert "role" not in register_screen.split("options: { data:")[1][:200]


# module: route wiring and legacy risk visibility
def test_register_route_exports_secure_experience_component():
    route = _read(REGISTER_ROUTE)
    assert "export default RegisterExperience;" in route
    assert "function LegacyRegisterScreen()" in route
    legacy_body = route.split("function LegacyRegisterScreen()", 1)[1]
    assert "return <RegisterExperience />;" in legacy_body[:300]


# module: appointments query projection review
def test_appointments_hook_mapping_contract_present():
    hook = _read(APPOINTMENTS_HOOK)
    assert "client:profiles!client_id(id,name,phone,avatar_url)" in hook
    assert "professional:profiles!professional_id(id,name,phone,avatar_url)" in hook
    assert "service:services(id,name,price,duration_minutes)" in hook
    assert "setAppointments((data ?? []).map(mapAppointment))" in hook


def test_finalize_migration_is_present_and_reasserts_profile_protection():
    sql = _read(MIGRATION_FINAL)
    assert "CREATE OR REPLACE FUNCTION public.protect_profile_authorization_fields()" in sql
    assert "DROP TRIGGER IF EXISTS protect_profile_authorization_fields ON public.profiles;" in sql
    assert "REVOKE UPDATE ON public.profiles FROM authenticated;" in sql
    assert "GRANT UPDATE (name, phone, avatar_url, push_token) ON public.profiles TO authenticated;" in sql
    assert "CREATE OR REPLACE FUNCTION public.accept_invitation(invitation_token text)" in sql
    assert "IF invitation_token !~ '^[0-9a-f]{64}$'" in sql