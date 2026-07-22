"""Regression checks for booking merge-fix scope (static/build validations)."""

from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]

BOOKING_FILE = ROOT / "apps/web/src/app/[slug]/booking.tsx"
AUTH_MODAL_FILE = ROOT / "apps/web/src/components/booking/PublicBookingAuthModal.tsx"
APP_INPUT_FILE = ROOT / "apps/web/src/components/ui/AppInput.tsx"
PASSWORD_INPUT_FILE = ROOT / "apps/web/src/components/ui/PasswordInput.tsx"
PASSWORD_CHECKLIST_FILE = ROOT / "apps/web/src/components/ui/PasswordStrengthChecklist.tsx"
PASSWORD_POLICY_FILE = ROOT / "packages/validation/src/password-policy.ts"
SUPABASE_TYPES_FILE = ROOT / "packages/database/src/supabase.generated.ts"
MIGRATION_FILE = ROOT / "supabase/migrations/20260716057000_transactional_appointment_creation.sql"
VERCEL_FILE = ROOT / "vercel.json"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


# Module: conflict-marker regression
def test_no_git_conflict_markers_in_repo_files() -> None:
    marker_pattern = re.compile(r"^(<<<<<<<|=======|>>>>>>>)", re.MULTILINE)
    checked = 0

    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        if any(part in {"node_modules", ".git", "dist", ".expo"} for part in path.parts):
            continue
        if path.suffix.lower() in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".ttf", ".pyc", ".svg"}:
            continue

        content = _read(path)
        checked += 1
        assert not marker_pattern.search(content), f"Conflict marker found in: {path}"

    assert checked > 0


# Module: booking auth modal integration
def test_booking_uses_public_auth_modal_with_password_confirmation_and_strong_password() -> None:
    content = _read(BOOKING_FILE)

    assert "<PublicBookingAuthModal" in content
    assert "passwordConfirmation={authPasswordConfirmation}" in content
    assert "onPasswordConfirmationChange={setAuthPasswordConfirmation}" in content
    assert "isStrongPassword(authPassword)" in content


def test_public_booking_modal_preserves_magic_link_register_password_and_testids() -> None:
    content = _read(AUTH_MODAL_FILE)

    required_tokens = [
        "public-booking-magic-link-tab",
        "public-booking-register-tab",
        "public-booking-magic-link-email-input",
        "public-booking-magic-link-submit-button",
        "public-booking-register-name-input",
        "public-booking-register-email-input",
        "public-booking-register-password-input",
        "public-booking-register-password-confirm-input",
        "public-booking-register-submit-button",
        "password !== passwordConfirmation",
        "PasswordStrengthChecklist",
        "PasswordInput",
    ]

    for token in required_tokens:
        assert token in content


def test_password_components_preserve_visibility_toggle_and_checklist_rules() -> None:
    password_input = _read(PASSWORD_INPUT_FILE)
    checklist = _read(PASSWORD_CHECKLIST_FILE)
    policy = _read(PASSWORD_POLICY_FILE)
    app_input = _read(APP_INPUT_FILE)

    assert "visibility-button" in password_input
    assert "Mostrar senha" in password_input and "Ocultar senha" in password_input
    assert "PASSWORD_RULES" in checklist
    assert "PASSWORD_RULES" in policy and "isStrongPassword" in policy
    assert "testID" in app_input


# Module: Supabase RPC typing and booking flow
def test_booking_uses_expected_rpcs() -> None:
    content = _read(BOOKING_FILE)

    for rpc_name in ["create_appointment", "reschedule_appointment"]:
        assert f"rpc('{rpc_name}'" in content

    availability_hook = _read(ROOT / "apps/web/src/hooks/useAvailableSlots.ts")
    assert "rpc('get_available_slots'" in availability_hook


def test_generated_types_include_expected_rpc_signatures() -> None:
    content = _read(SUPABASE_TYPES_FILE)

    assert "create_appointment" in content
    assert "get_available_slots" in content
    assert "reschedule_appointment" in content


# Module: migration transactional protections and grants
def test_migration_contains_overlap_protection_and_expected_grants() -> None:
    content = _read(MIGRATION_FILE)

    assert "appointments_no_professional_overlap" in content
    assert "EXCLUDE USING gist" in content
    assert "EXCEPTION WHEN exclusion_violation THEN RAISE EXCEPTION 'appointment_conflict'" in content
    assert "GRANT EXECUTE ON FUNCTION public.create_appointment" in content
    assert "GRANT EXECUTE ON FUNCTION public.reschedule_appointment" in content
    assert "GRANT EXECUTE ON FUNCTION public.get_public_busy_slots" in content


# Module: deploy config and secret hygiene
def test_vercel_rewrite_spa_is_preserved() -> None:
    raw = _read(VERCEL_FILE)
    data = json.loads(raw)

    assert "rewrites" in data
    assert isinstance(data["rewrites"], list) and len(data["rewrites"]) >= 1
    first = data["rewrites"][0]
    assert first.get("source") == "/(.*)"
    assert first.get("destination") == "/index.html"


def test_no_hardcoded_secrets_in_scope_files() -> None:
    patterns = [
        r"SUPABASE_SERVICE_ROLE_KEY",
        r"service_role",
        r"AKIA[0-9A-Z]{16}",
        r"AIza[0-9A-Za-z_-]{35}",
        r"sk_live_[0-9A-Za-z]+",
        r"-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----",
        r"postgres://[^\s]+:[^\s]+@",
    ]
    combined = re.compile("|".join(patterns))

    scope_files = [
        BOOKING_FILE,
        AUTH_MODAL_FILE,
        APP_INPUT_FILE,
        PASSWORD_INPUT_FILE,
        PASSWORD_CHECKLIST_FILE,
        PASSWORD_POLICY_FILE,
        SUPABASE_TYPES_FILE,
        MIGRATION_FILE,
        VERCEL_FILE,
    ]

    for path in scope_files:
        content = _read(path)
        assert not combined.search(content), f"Potential secret found in {path}"
