# Billing homologation evidence

Captured on 2026-07-26 from commit `1842c2e` in the isolated
`codex/billing-homologation` worktree.

## Safety boundary

- `CutSync.io` (`hxoenfnszrrgaqxplzmd`) is the protected production project.
- Production inspection was read-only. No migration repair, push, function
  deployment, secret update, job scheduling or data mutation was performed.
- Production runs PostgreSQL 17 in `us-west-2`.
- Supabase reported no database branches and no deployed Edge Functions.
- The unrelated Control changes in the primary worktree were not copied,
  changed or staged.

## Captured artifacts

- `production-public-schema.sql`: schema-only dump of production. It contains no
  table rows.
- `production-migration-schema.sql`: schema-only definition of the production
  migration history table.
- `production-migration-history.sql`: schema and rows from
  `supabase_migrations` only. It contains migration SQL, not application data.
- The string scan found only schema field names related to Expo push tokens; no
  secret, password, API key or private key assignment was found.

These files are a point-in-time diagnostic snapshot. A fresh schema-only dump
and comparison is still mandatory immediately before any production window.

## Initial production lint

`supabase db lint --linked --level error` found four production errors:

| RPC | Error |
| --- | --- |
| `register_business_identity_atomic` | ambiguous `establishment_id` |
| `create_establishment_invite_v2` | ambiguous `target_contact` |
| `review_governance_verification` | ambiguous `reason` |
| `submit_client_account_deletion_request` | ambiguous `status` |

The complete local schema also exposed two errors not yet represented in the
production history:

| RPC | Error |
| --- | --- |
| `admin_update_professional` | nonexistent `jsonb_object_length` |
| `upsert_my_professional_profile` | ambiguous `profile_id` |

The recovered migration `20260717011000` fixes the first local-only error.
Migration `20260730002000` fixes the other five without changing RPC signatures
or dropping database objects.

## Migration reconciliation matrix

The matrix compares the protected production history with the clean worktree at
the start of reconciliation.

| Version | Origin | Objects/effect | Production state | Forward action |
| --- | --- | --- | --- | --- |
| `20260119010000` | local only | appointment status RPC | objects partly superseded | compare only; do not repair blindly |
| `20260716049000` | remote only | compatibility marker | recorded with empty statements | restore documented marker locally |
| `20260716053000` | remote only | gallery security marker | recorded with empty statements | restore documented marker locally |
| `20260716054000` | remote only | appointment/service security marker | recorded with empty statements | restore documented marker locally |
| `20260716055000` | remote only | appointment authorization marker | recorded with empty statements | restore documented marker locally |
| `20260716056000` | remote only | professional upsert marker | recorded with empty statements | restore documented marker locally |
| `20260717010000` | remote only | gallery bucket and owner policies | present in production | restore recovered SQL locally |
| `20260717011000` | remote only | professional admin RPC | present but lint-safe version missing locally | restore recovered, qualified SQL locally |
| `20260717012000` | remote only | public gallery object read policy | present in production | restore recovered SQL locally |
| `20260719000000` | local only | centralized availability | not recorded remotely | compare objects in staging |
| `20260719010000` | local only | schedule blocks | not recorded remotely | compare objects in staging |
| `20260720000000` | local only | GSP governance and circuit breaker | not recorded remotely | compare objects in staging |
| `20260720001000` | local only | secure invitation matching | function partly present through drift | apply only after staging comparison |
| `20260720002000` | local only | CNPJ auto-promotion RPC | not recorded remotely | compare objects in staging |
| `20260720003000` | local only | governance audit triggers | not recorded remotely | compare objects in staging |
| `20260720004000` | local only | admin reports | not recorded remotely | compare objects in staging |
| `20260720004050` | local only | governance establishment update policy | not recorded remotely | compare objects in staging |
| `20260720004100` | local only | service catalog management | not recorded remotely | compare objects in staging |
| `20260720004200` | local only | reports with optional schedule blocks | not recorded remotely | compare objects in staging |
| `20260720005000` | local only | governance knowledge forum | not recorded remotely | compare objects in staging |
| `20260720006000` | local only | ratings and reviews | not recorded remotely | compare objects in staging |
| `20260720007000` | local only | definer and bucket hardening | not recorded remotely | compare objects in staging |
| `20260720008000` | local only | instant booking configuration | not recorded remotely | compare objects in staging |
| `20260721001000` | local only | professional team access | not recorded remotely | compare objects in staging |
| `20260721002000` | local only | onboarding and settings | not recorded remotely | compare objects in staging |
| `20260721003000` | local only | professional Pix toggle | not recorded remotely | compare objects in staging |
| `20260721004000` | local only | safe profile updates | not recorded remotely | compare objects in staging |
| `20260722000000` | local only | multi-app identity and push devices | not recorded remotely | compare objects in staging |
| `20260722160000` | local only | client preferences | not recorded remotely | compare objects in staging |
| `20260722223000` | local only | client discovery | not recorded remotely | compare objects in staging |
| `20260723023000` | local only | client booking | not recorded remotely | compare objects in staging |
| `20260723040000` | local only | client appointment management | not recorded remotely | compare objects in staging |
| `20260723050000` | local only | governance operational P0 | not recorded remotely | compare objects in staging |
| `20260724000000` | local only | governance compliance RPCs | some functions present through drift | apply lint hardening only after staging |
| `20260724010000` | local only | client push notifications | not recorded remotely | compare objects in staging |
| `20260724020000` | local only | client deletion | function present through drift | apply lint hardening only after staging |
| `20260724020050` | local only | governance knowledge-base P1 | not recorded remotely | compare objects in staging |
| `20260725000000` | local only | interactive admin reports | not recorded remotely | compare objects in staging |
| `20260725001000` | local only | admin report service ID type fix | not recorded remotely | compare objects in staging |
| `20260725010000` | local only | Web-first platform billing | objects present through drift | reconstruct and test in staging |
| `20260726000000` | local only | organizations and consolidated billing | objects present through drift | reconstruct and test in staging |
| `20260726010000` | local only | governance operational articles | not recorded remotely | compare objects in staging |
| `20260727000000` | local only | private legal identity and AAL2 | RPC present through drift | apply lint hardening only after staging |
| `20260729000000` | local only | billing evolution | not recorded remotely | reconstruct and test in staging |

Versions `20260728000000`, `20260722153015` and `20260722153549` were recorded
on both sides. Control migrations newer than the clean base commit are
intentionally excluded from this worktree and rollout.

## Local verification

- The recovered professional RPC and the forward-only hardening migration were
  applied to the running local Supabase database with `ON_ERROR_STOP=1`.
- `supabase db lint --local --level error --fail-on error` returned
  `No schema errors found`.
- `supabase/tests/consolidated_billing_coverage.sql` completed as
  `BEGIN`, `DO`, `ROLLBACK`.
- `deno check` passed for the nine billing, cutover, Stripe and fiscal Edge
  Functions listed in the homologation runbook.
- Business TypeScript and Expo lint both passed.
- Shared package TypeScript passed against the types generated from staging.
- Web lint completed with zero errors and 15 pre-existing warnings.
- Web TypeScript remains on its pre-existing red baseline, including Expo Image
  `contentFit`, React Native style, nullable field and legacy profile field
  errors. No billing migration or generated financial type produced a new
  isolated failure.
- The targeted Playwright unit suites for platform billing, consolidated
  coverage and business registration passed; after adding catalog restore
  coverage, the consolidated suite passed 7 of 7 tests.
- Static inspection confirmed the individual 4,990-cent price, consolidated
  4,990/4,490/3,990-cent tiers, the Rede gate at five units, seven-day grace
  interval and `enforcement_enabled = false` default.

Local validation is not evidence of connected staging or production behavior.

## Connected staging status

`CutSync Homolog` (`sphbbqdgcreowxzjgibj`) was created with PostgreSQL 17 in
`us-west-2` after a project slot became available.

- The protected production schema and proven migration history were restored
  without application rows.
- `btree_gist` was enabled to match production before schema restoration.
- Local and staging migration versions are aligned with zero mismatches.
- The Web-first billing and consolidated coverage migrations were applied.
- `20260730003000_billing_catalog_seed_hardening.sql` restores the versioned
  product catalog after a schema-only bootstrap.
- Connected `db lint` has zero errors.
- Connected consolidated billing SQL completed inside its rollback transaction.
- PostgREST schema cache was reloaded.
- Generated TypeScript types now come from the staging project.
- All nine billing/fiscal Edge Functions are deployed as active version 1.
- No billing job, webhook or enforcement was enabled.

Connected staging confirms:

- individual monthly plan: BRL 4,990 cents;
- multiunit tiers: BRL 4,990, 4,490 and 3,990 cents;
- Rede plan present with no self-service base price;
- zero subscriptions with enforcement enabled.

Stripe Test Mode, Focus homologation and Web deployment still require their
server-side credentials and a real staging URL. No production credential should
be placed in this repository.
