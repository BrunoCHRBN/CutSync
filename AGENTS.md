# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Cursor Cloud specific instructions

CutSync is an npm-workspaces monorepo (Node 22, Expo SDK 57) with four apps sharing one Supabase backend. Standard install/dev/validate commands live in `README.md` and root `package.json` scripts — use those; notes below only cover non-obvious cloud caveats. The update script already runs `npm install` at the repo root before each session.

- Runnable in the cloud VM: `@cutsync/web` and `@cutsync/control` are web apps (`expo start --web`, default port 8081). `@cutsync/client` and `@cutsync/business` are React Native mobile apps that need an Android/iOS emulator or device, so they cannot be launched/tested from the cloud VM (lint/typecheck still work).
- Env files: every app expects a `.env` (git-ignored). Copy each `apps/<app>/.env.example` to `apps/<app>/.env`. `apps/web` has NO example — create `apps/web/.env` with `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (plus optional `EXPO_PUBLIC_APP_ENV=development`).
- Backend: full data flows (discovery, auth, booking) need Supabase — a local stack or a hosted project's URL + publishable key. Without a reachable backend the web app still renders all static/interactive UI, but data sections fail gracefully into visible error states ("Não foi possível carregar..."). Never put a `service_role`/secret key in an app bundle.

### Bootstrapping the local Supabase stack

This needs Docker and the Supabase CLI, which are installed in the VM image (if `docker`/`supabase` are missing, install Docker via the official apt repo and the CLI from its GitHub release `.deb`). Docker is not started by init: run `sudo dockerd` in a background/tmux session first, and `sudo chmod 666 /var/run/docker.sock` if the socket is not writable. On this kernel Docker must use `fuse-overlayfs` with `containerd-snapshotter` disabled in `/etc/docker/daemon.json`, plus `iptables-legacy`.

Plain `supabase start` does NOT produce a working database — the schema bootstrap has two non-obvious ordering requirements:

1. **`supabase/setup.sql` must run before the migrations.** It creates the base tables (`establishments`, `appointments`, ...). With `[db.migrations] enabled = true` the CLI applies migrations against an empty schema and aborts with `relation "public.appointments" does not exist`. Temporarily set `enabled = false` in `supabase/config.toml`, run `supabase start`, then apply `setup.sql` followed by `migrations/*.sql` in filename order, then restore the flag.
2. **Apply the schema as `supabase_admin`, not `postgres`.** Supabase's stock default privileges in the `public` schema are registered for `supabase_admin`, so objects created by `postgres` receive no `anon`/`authenticated` grants. The migrations assume the grants exist (they only ever `REVOKE`, e.g. `REVOKE INSERT ON public.establishments FROM anon`). Getting this wrong makes public reads fail with `42501 permission denied for table establishments` even though RLS allows them, which surfaces in the UI as `[useEstablishment] Erro` and an empty booking page. Use `psql -U supabase_admin`.

If you ever `DROP SCHEMA public`, the default-privilege entries are dropped with it — re-declare `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES/SEQUENCES/FUNCTIONS TO postgres, anon, authenticated, service_role` *before* recreating objects, or every table will again be missing its grants.

Known pre-existing issues (not environment problems): the two `control_analytics` migrations are not idempotent — they recreate tables an earlier migration already created and, being wrapped in transactions, abort entirely. They only affect Control analytics, not the web/booking flow.

### Booking flow data requirements

An establishment only appears in public discovery when `discovery_status='published'`, `account_status='active'`, it has a valid slug/address and at least one active service. Bookable slots additionally require a professional with an `active` membership (role `professional`/`admin`) plus `opening_hours` on the establishment (a JSON array of `{day,isOpen,open,close}`; `day` 0=Sunday).

`get_available_slots` is granted to `authenticated` only — anonymous visitors deliberately cannot list time slots, so a client must log in or register before reaching the date/time step. Availability is also gated behind `billing_access_mode(establishment) = 'full'`.

There is no `supabase/seed.sql`, so a fresh local database has no demo data; seed your own establishments/services/professional to exercise discovery and booking.

### Timezone

The VM and its browser run in UTC while the product assumes `America/Sao_Paulo`, so appointment times can render shifted from what was booked (the stored `timestamptz` is still correct). The Playwright configs already pin `timezoneId: 'America/Sao_Paulo'`; do the same for manual browser checks before reporting a time bug.

### Running and testing

- Only one Expo dev server can bind port 8081 at a time; pass `--port` to run more than one concurrently (the Playwright configs use 8081/8082/8083).
- Expo reads each app's `.env` only at dev-server startup, so restart the dev server after changing env values.
- Unit tests: `CUTSYNC_E2E_BASE_URL=http://127.0.0.1:8081 npm run test:e2e -- --project=unit` runs the pure-logic unit suite WITHOUT triggering Playwright's `webServer` (which otherwise builds and serves the web app). Browser-based E2E projects additionally require `npx playwright install` to download browsers.
- Known state: a handful of `*.unit.spec.ts` tests currently fail because they assert on source-file contents (not an environment problem); they are unrelated to setup.
