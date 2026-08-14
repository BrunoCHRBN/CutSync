# CutSync billing homologation runbook

This runbook promotes billing through a disposable Supabase staging project.
It never uses a Checkout return URL as authorization and never pushes the
unreconciled migration history directly to production.

## 1. Resume prerequisites

Completed:

- `CutSync Homolog` created with PostgreSQL 17 in `us-west-2`;
- protected production schema restored without application data;
- billing schema, catalog, functions and migration history reconciled;
- `enforcement_enabled = false`.

Still required:

1. Provide separate Stripe Test Mode and Focus homologation credentials.
2. Provide the Web staging deployment target and URL.

Secrets belong only in the staging project:

```text
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_OWNER_MONTHLY_PRICE_ID
STRIPE_ORGANIZATION_MONTHLY_PRICE_ID
STRIPE_ORGANIZATION_NETWORK_PRICE_ID
CUTSYNC_WEB_URL
FOCUS_NFE_TOKEN
FOCUS_NFE_ENVIRONMENT
BILLING_JOB_SECRET
```

## 2. Reconstruct staging

1. Link this clean worktree to `CutSync Homolog`.
2. Load the captured production schema into an empty staging database without
   application data.
3. Reproduce the proven production migration records.
4. Apply the recovered remote migrations and
   `20260730002000_billing_homologation_lint_hardening.sql`.
5. Compare every local-only migration against staging before applying it.
6. Reload PostgREST with `NOTIFY pgrst, 'reload schema';`.
7. Generate TypeScript types from staging, not from the protected production
   project.

Do not use `migration repair` until the corresponding SQL and resulting objects
have both been verified.

## 3. Database gates

Required gates:

```powershell
npx supabase db lint --linked --level error --fail-on error
npx supabase gen types typescript --linked --schema public
```

Validate authenticated calls for:

- `get_my_business_access_context`
- `get_organization_billing_context`
- `schedule_organization_billing_cutover`
- `finalize_organization_billing_cutover`
- audited Control RPCs

Run every transactional SQL suite with `ON_ERROR_STOP=1` and require the final
transaction to end in `ROLLBACK`.

## 4. Stripe and functions

Create separate BRL monthly test prices:

- individual: 4,990 cents;
- consolidated: graduated tiers at 4,990, 4,490 and 3,990 cents;
- five or more units: no self-service checkout; route to the Rede contract.

Deploy the exact reviewed versions of:

- `create-stripe-checkout`
- `create-stripe-portal`
- `stripe-webhook`
- `process-billing-jobs`
- `process-billing-cutovers`
- `reconcile-stripe-billing`
- `focus-nfe-webhook`
- `process-fiscal-jobs`
- `reconcile-fiscal-documents`

Schedule with authenticated server-side invocations:

| Job | Frequency |
| --- | --- |
| billing events | every minute |
| cutovers | every five minutes |
| fiscal events | every five minutes |
| Stripe reconciliation | daily |
| fiscal reconciliation | daily |

The webhook or reconciliation owns entitlement changes. Checkout success pages
only poll the Supabase access context.

## 5. Functional gates

Use synthetic owner, admin, professional, finance and client accounts. Cover:

- initial payment, renewal, failure, exact seven-day grace period and recovery;
- end-of-period cancellation;
- individual-to-consolidated cutover with different renewal dates;
- duplicate and out-of-order provider events;
- read-only operation without deleting existing appointments;
- blocking new bookings while allowing the client to view and cancel an
  existing booking;
- identical Web and Business rights from Supabase;
- no price, Checkout, WebView or payment link in Business;
- restriction of all and only the units covered by a delinquent consolidated
  subscription.

## 6. Fiscal and observability gates

Use `billing_invoice_id` as the idempotency reference. Test authorized,
municipally rejected, duplicate webhook, total-refund cancellation, partial
refund review and reconciliation paths. Fiscal failure must never revoke paid
access.

Alert on exhausted event attempts, reconciliation drift, pending fiscal
documents and cutovers stuck in `reconciling`.

## 7. Protected production promotion

1. Require Stripe, fiscal and accountant approvals.
2. Capture a fresh backup and schema-only production dump.
3. Stop if the new comparison differs from the homologated matrix.
4. Apply only the homologated forward migration.
5. Reconcile only migration markers backed by evidence.
6. Deploy identical function versions with jobs and enforcement disabled.
7. Run authenticated smoke tests and read-only reconciliation.
8. Pilot one individual account and one consented two-unit organization.
9. Enable jobs, then enforcement, progressively.

Any divergence stops rollout. The rollback response disables jobs/enforcement;
it never automatically cancels subscriptions or appointments.
