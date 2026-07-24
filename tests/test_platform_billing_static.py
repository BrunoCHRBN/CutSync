from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/20260725010000_platform_billing_web_first.sql"
FUNCTIONS = ROOT / "supabase/functions"
BUSINESS = ROOT / "apps/business/src"


def test_platform_billing_schema_and_access_contract_are_present():
    sql = MIGRATION.read_text(encoding="utf-8")
    for table in (
        "billing_accounts", "billing_plans", "billing_provider_products",
        "billing_subscriptions", "billing_invoices", "billing_events",
        "fiscal_documents", "fiscal_events", "platform_fiscal_settings",
    ):
        assert f"CREATE TABLE public.{table}" in sql
    assert "get_my_business_access_context" in sql
    assert "billing_access_mode" in sql
    assert "can_use_establishment_feature" in sql
    assert "interval '7 days'" not in sql  # grace is provider-event driven, not a schema default
    assert "account_status = 'delinquent'" not in sql


def test_webhooks_are_idempotent_and_return_page_cannot_grant_access():
    webhook = (FUNCTIONS / "stripe-webhook/index.ts").read_text(encoding="utf-8")
    worker = (FUNCTIONS / "process-billing-jobs/index.ts").read_text(encoding="utf-8")
    web = (ROOT / "apps/web/src/components/screens/BillingExperience.tsx").read_text(encoding="utf-8")
    assert 'external_event_id: event.id' in webhook
    assert 'error.code !== "23505"' in webhook
    assert "provider_event_created_at" in worker
    assert "Aguardando confirmação" in web
    assert "setAccess" not in web


def test_business_app_has_no_payment_surface_or_server_secrets():
    source = "\n".join(path.read_text(encoding="utf-8") for path in BUSINESS.rglob("*.ts*"))
    lowered = source.lower()
    assert "create-stripe-checkout" not in source
    assert "checkout_url" not in source
    assert "webview" not in lowered
    assert "qr code" not in lowered
    assert "stripe_secret_key" not in lowered
    assert "focus_nfe_token" not in lowered
    assert "expo_public_stripe" not in lowered
