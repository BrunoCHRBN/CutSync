"""Static regression coverage for the multi-app backend foundation."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase/migrations/20260722000000_multi_app_identity_and_push_devices.sql"
HARDENING_MIGRATION = ROOT / "supabase/migrations/20260722153015_harden_multi_app_rpc_grants.sql"
SQL_MATRIX = ROOT / "supabase/tests/multi_app_identity_and_push_devices.sql"


def _read(path: Path) -> str:
    assert path.exists(), f"Missing required file: {path}"
    return path.read_text(encoding="utf-8")


def test_push_devices_are_multi_app_and_private():
    sql = _read(MIGRATION)
    assert "CREATE TABLE IF NOT EXISTS public.push_devices" in sql
    assert "app_kind IN ('client', 'business')" in sql
    assert "platform IN ('android', 'ios')" in sql
    assert "expo_push_token text NOT NULL UNIQUE" in sql
    assert "ALTER TABLE public.push_devices ENABLE ROW LEVEL SECURITY" in sql
    assert "USING (profile_id = (SELECT auth.uid()))" in sql
    assert "REVOKE ALL ON public.push_devices FROM anon, authenticated" in sql
    assert "GRANT SELECT ON public.push_devices TO authenticated" in sql


def test_push_device_mutations_use_hardened_rpcs():
    sql = _read(MIGRATION)
    for function in ("register_push_device", "unregister_push_device"):
        definition = sql.split(f"CREATE OR REPLACE FUNCTION public.{function}", 1)[1]
        definition = definition.split("$$;", 1)[0]
        assert "SECURITY DEFINER" in definition
        assert "SET search_path = pg_catalog, public" in definition
        assert "auth.uid()" in definition

    assert "WHERE push_devices.profile_id = actor_id" in sql
    assert "RAISE EXCEPTION 'push_token_registered'" in sql
    assert "REVOKE ALL ON FUNCTION public.register_push_device" in sql
    assert "REVOKE ALL ON FUNCTION public.unregister_push_device" in sql


def test_multi_app_rpcs_explicitly_revoke_anon_execution():
    sql = _read(HARDENING_MIGRATION)
    for signature in (
        "public.register_push_device(text, text, text)",
        "public.unregister_push_device(text)",
        "public.get_my_operational_contexts()",
    ):
        assert f"REVOKE ALL ON FUNCTION {signature} FROM PUBLIC" in sql
        assert f"REVOKE ALL ON FUNCTION {signature} FROM anon" in sql
        assert f"GRANT EXECUTE ON FUNCTION {signature} TO authenticated, service_role" in sql


def test_business_contexts_come_from_active_memberships():
    sql = _read(MIGRATION)
    function = sql.split("CREATE OR REPLACE FUNCTION public.get_my_operational_contexts", 1)[1]
    function = function.split("$$;", 1)[0]
    assert "SECURITY DEFINER" in function
    assert "SET search_path = pg_catalog, public" in function
    assert "membership.profile_id = actor_id" in function
    assert "membership.status = 'active'" in function
    assert "membership.revoked_at IS NULL" in function
    assert "JOIN public.establishments" in function


def test_sql_matrix_covers_cross_user_and_multi_establishment_cases():
    matrix = _read(SQL_MATRIX)
    assert "expected two operational contexts" in matrix
    assert "user can read another profile push devices" in matrix
    assert "user can read another profile operational contexts" in matrix
    assert "push_token_registered" in matrix
    assert "direct-write-must-fail" in matrix
    assert "ROLLBACK;" in matrix


if __name__ == "__main__":
    tests = [value for name, value in globals().items() if name.startswith("test_") and callable(value)]
    for test in tests:
        test()
    print(f"multi-app static foundation: {len(tests)} tests passed")
