# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Cursor Cloud specific instructions

CutSync is an npm-workspaces monorepo (Node 22, Expo SDK 57) with four apps sharing one Supabase backend. Standard install/dev/validate commands live in `README.md` and root `package.json` scripts — use those; notes below only cover non-obvious cloud caveats. The update script already runs `npm install` at the repo root before each session.

- Runnable in the cloud VM: `@cutsync/web` and `@cutsync/control` are web apps (`expo start --web`, default port 8081). `@cutsync/client` and `@cutsync/business` are React Native mobile apps that need an Android/iOS emulator or device, so they cannot be launched/tested from the cloud VM (lint/typecheck still work).
- Env files: every app expects a `.env` (git-ignored). Copy each `apps/<app>/.env.example` to `apps/<app>/.env`. `apps/web` has NO example — create `apps/web/.env` with `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (plus optional `EXPO_PUBLIC_APP_ENV=development`).
- Backend: full data flows (establishment discovery, auth, booking) require a Supabase backend — either a local stack (`supabase start`, needs Docker + Supabase CLI, config in `supabase/config.toml` with 149 migrations) or a hosted project's URL + publishable key. Without a reachable backend the web app still renders all static/interactive UI, but data-fetching sections fail gracefully into visible error states ("Não foi possível carregar..."). Never put a `service_role`/secret key in an app bundle.
- Only one Expo dev server can bind port 8081 at a time; pass `--port` to run more than one concurrently (the Playwright configs use 8081/8082/8083).
- Unit tests: `CUTSYNC_E2E_BASE_URL=http://127.0.0.1:8081 npm run test:e2e -- --project=unit` runs the pure-logic unit suite WITHOUT triggering Playwright's `webServer` (which otherwise builds and serves the web app). Browser-based E2E projects additionally require `npx playwright install` to download browsers.
- Known state: a handful of `*.unit.spec.ts` tests currently fail on this branch because they assert on source-file contents (not an environment problem); they are unrelated to setup.
