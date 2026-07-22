from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def test_shared_password_policy_is_used_by_signup_reset_change_and_booking():
    policy = read("packages/validation/src/password-policy.ts")
    assert "password.length >= 8" in policy
    assert "/[A-Z]/" in policy
    assert "/[a-z]/" in policy
    assert "/\\d/" in policy
    assert "/[^A-Za-z0-9]/" in policy

    for path in (
        "apps/web/src/components/screens/RegisterExperience.tsx",
        "apps/web/src/components/screens/ResetPasswordExperience.tsx",
        "apps/web/src/components/screens/ChangePasswordExperience.tsx",
        "apps/web/src/app/[slug]/booking.tsx",
    ):
        assert "isStrongPassword" in read(path)
        assert "PasswordStrengthChecklist" in read(path)


def test_login_and_routes_expose_complete_recovery_flow():
    login = read("apps/web/src/components/screens/LoginExperience.tsx")
    assert "forgot-password-link" in login
    assert "/(auth)/forgot-password" in login
    assert (ROOT / "apps/web/src/app/(auth)/forgot-password.tsx").exists()
    assert (ROOT / "apps/web/src/app/(auth)/reset-password.tsx").exists()
    assert (ROOT / "apps/web/src/app/security.tsx").exists()


def test_recovery_service_supports_web_native_and_safe_session_exchange():
    service = read("apps/web/src/services/passwordRecovery.ts")
    assert "EXPO_PUBLIC_APP_URL" in service
    assert "cutsync" in service
    assert "setSession" in service
    assert "verifyOtp" in service
    assert "exchangeCodeForSession" in service
    assert "console.log" not in service


def test_reset_route_is_not_redirected_after_recovery_session_is_created():
    layout = read("apps/web/src/app/_layout.tsx")
    assert "isPasswordReset" in layout
    assert "if (isPasswordReset || isSecurity) return;" in layout
    reset = read("apps/web/src/components/screens/ResetPasswordExperience.tsx")
    assert "getSession" not in reset


def test_authenticated_password_change_requires_current_password_verification():
    change = read("apps/web/src/components/screens/ChangePasswordExperience.tsx")
    assert "signInWithPassword" in change
    assert "updateUser({ password: newPassword })" in change
    assert "signOut({ scope: 'others' })" in change


def test_vercel_routes_deep_links_to_expo_router():
    config = read("vercel.json")
    assert '"destination": "/index.html"' in config
