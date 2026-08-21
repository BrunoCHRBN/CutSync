import { execFileSync, execSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const PROJECT_REF_PATTERN = /^[a-z]{20}$/u;
const androidMode = process.argv.includes("--android");
const resetAndroidApp = process.argv.includes("--reset-android-app");
const androidCurrentSession = process.argv.includes("--android-current-session");
const androidStandalone = process.argv.includes("--android-standalone");
const diagnoseVisibleAccount = process.argv.includes("--diagnose-visible-account");
const androidAuthorizedFixture = process.argv.includes("--android-authorized-fixture");
const cleanupAndroidOrphans = process.argv.includes("--cleanup-android-orphans");
const androidApp = process.argv.find((argument) => argument.startsWith("--android-app="))
  ?.slice("--android-app=".length) ?? "business";
const androidPackage = process.argv.find((argument) => argument.startsWith("--android-package="))
  ?.slice("--android-package=".length)
  ?? (androidApp === "client" ? "com.cutsync.client" : "com.cutsync.business");
const projectRef = process.argv.find((argument) => PROJECT_REF_PATTERN.test(argument))
  ?? process.env.SUPABASE_PROJECT_ID;

if (!projectRef || !PROJECT_REF_PATTERN.test(projectRef)) {
  throw new Error("usage: node scripts/validate-gate-g14-homolog.mjs <project-ref>");
}
if (!['business', 'client'].includes(androidApp)) {
  throw new Error("invalid_android_app");
}
const androidPackagePattern = androidApp === "client"
  ? /^com\.cutsync\.client(?:\.[a-z0-9]+)*$/u
  : /^com\.cutsync\.business(?:\.[a-z0-9]+)*$/u;
if (!androidPackagePattern.test(androidPackage)) {
  throw new Error("invalid_android_package");
}
if (androidCurrentSession && androidStandalone) {
  throw new Error("android_current_session_standalone_conflict");
}
if (androidAuthorizedFixture && (!androidMode || !androidStandalone)) {
  throw new Error("android_authorized_fixture_requires_android_standalone");
}
if (androidAuthorizedFixture && androidApp !== "business") {
  throw new Error("android_authorized_fixture_requires_business_app");
}
if (cleanupAndroidOrphans && (androidMode || diagnoseVisibleAccount || androidAuthorizedFixture)) {
  throw new Error("cleanup_android_orphans_mode_conflict");
}

const commandOptions = { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] };
const localLinkedRef = readFileSync(resolve("supabase/.temp/project-ref"), "utf8").trim();
if (localLinkedRef !== projectRef) {
  throw new Error("linked_supabase_project_does_not_match_target");
}
const linkedRef = execSync("npx supabase projects list --output json", commandOptions);
const projects = JSON.parse(linkedRef);
if (!projects.some((project) => project.id === projectRef)) {
  throw new Error("target_project_not_available_in_authenticated_supabase_cli");
}

const keyOutput = execSync(
  `npx supabase projects api-keys --project-ref ${projectRef} --reveal --output json`,
  commandOptions,
);
const keys = JSON.parse(keyOutput);
const secretKey = keys.find((key) => key.api_key?.startsWith("sb_secret_"))?.api_key;
const publicKey = keys.find((key) => key.api_key?.startsWith("sb_publishable_"))?.api_key
  ?? keys.find((key) => /anon|publishable/u.test(key.name ?? ""))?.api_key;

if (!secretKey || !publicKey) throw new Error("supabase_api_keys_unavailable");

const url = `https://${projectRef}.supabase.co`;
const clientOptions = {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  global: { headers: { "User-Agent": "cutsync-g14-homolog-validation/1.0" } },
};
const admin = createClient(url, secretKey, clientOptions);
const actorClient = () => createClient(url, publicKey, clientOptions);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const requireData = (result, operation) => {
  if (result.error) throw new Error(`${operation}: ${result.error.message}`);
  return result.data;
};
const runCleanupSteps = async (steps) => {
  const failures = [];
  for (const step of steps) {
    try {
      await step.run();
    } catch (error) {
      failures.push(error);
      const message = error instanceof Error ? error.message : String(error);
      console.error(`CLEANUP_STEP_FAILED=${step.name}:${message}`);
    }
  }
  return failures;
};
const expectRpcError = async (client, name, args, expected) => {
  const result = await client.rpc(name, args);
  assert(
    result.error?.message.includes(expected),
    `${name}: expected ${expected}, got ${result.error?.message ?? "success"}`,
  );
};
const sqlLiteral = (value) => `'${String(value).replaceAll("'", "''")}'`;
const runLinkedSql = (sql) => {
  const directory = mkdtempSync(join(tmpdir(), "cutsync-g14-"));
  const file = join(directory, "cleanup.sql");
  try {
    writeFileSync(file, sql, { encoding: "utf8", mode: 0o600 });
    return execSync(
      `npx supabase db query --linked --file "${file}"`,
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

const wait = (milliseconds) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
const androidEvidenceDirectory = join(
  process.env.LOCALAPPDATA ?? tmpdir(),
  "CutSync",
  "g14",
);
const adbPath = join(
  process.env.LOCALAPPDATA ?? "",
  "Android",
  "Sdk",
  "platform-tools",
  "adb.exe",
);
const adb = (...args) => execFileSync(adbPath, args, {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
const adbRetry = (...args) => {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return adb(...args);
    } catch (error) {
      lastError = error;
      wait(500);
    }
  }
  throw lastError;
};
let androidAutofillServiceToRestore = null;
let androidEphemeralSessionCreated = false;
const disableAndroidAutofillForHarness = () => {
  const current = adb("shell", "settings", "get", "secure", "autofill_service").trim();
  androidAutofillServiceToRestore = current && current !== "null" ? current : null;
  adb("shell", "settings", "put", "secure", "autofill_service", "null");
  adb("shell", "cmd", "autofill", "reset");
};
const restoreAndroidAutofillAfterHarness = () => {
  if (androidAutofillServiceToRestore) {
    adb(
      "shell", "settings", "put", "secure", "autofill_service",
      androidAutofillServiceToRestore,
    );
  } else {
    adb("shell", "settings", "delete", "secure", "autofill_service");
  }
  androidAutofillServiceToRestore = null;
};
const dumpAndroidUi = () => {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      adb("shell", "rm", "-f", "/sdcard/g14-ui.xml");
      adb("shell", "uiautomator", "dump", "/sdcard/g14-ui.xml");
      return adb("exec-out", "cat", "/sdcard/g14-ui.xml");
    } catch (error) {
      lastError = error;
      wait(750);
    }
  }
  throw lastError;
};
const waitForAndroidUi = (expected, timeoutMs = 30_000) => {
  const startedAt = Date.now();
  let ui = "";
  while (Date.now() - startedAt < timeoutMs) {
    ui = dumpAndroidUi();
    if (ui.includes(expected)) return ui;
    wait(1_000);
  }
  throw new Error(`android_ui_timeout:${expected}`);
};
const waitForAndroidUiAny = (expectedValues, timeoutMs = 60_000) => {
  const startedAt = Date.now();
  let ui = "";
  while (Date.now() - startedAt < timeoutMs) {
    ui = dumpAndroidUi();
    if (expectedValues.some((expected) => ui.includes(expected))) return ui;
    wait(1_000);
  }
  throw new Error(`android_ui_timeout:${expectedValues.join("|")}`);
};
const captureAndroidEvidence = (name) => {
  mkdirSync(androidEvidenceDirectory, { recursive: true });
  const remote = `/sdcard/${name}.png`;
  const local = join(androidEvidenceDirectory, `${name}.png`);
  adb("shell", "screencap", "-p", remote);
  adb("pull", remote, local);
  adb("shell", "rm", remote);
  return local;
};
const androidResourceCenter = (ui, resourceId) => {
  const escapedId = resourceId.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const node = new RegExp(`<node[^>]*resource-id="${escapedId}"[^>]*>`, "u").exec(ui)?.[0];
  const bounds = node
    ? /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/u.exec(node)
    : null;
  if (!bounds) throw new Error(`android_resource_unavailable:${resourceId}`);
  return {
    x: Math.round((Number(bounds[1]) + Number(bounds[3])) / 2),
    y: Math.round((Number(bounds[2]) + Number(bounds[4])) / 2),
  };
};
const tapAndroidResource = (ui, resourceId) => {
  const center = androidResourceCenter(ui, resourceId);
  adbRetry("shell", "input", "tap", String(center.x), String(center.y));
};
const androidResourceText = (ui, resourceId) => {
  const escapedId = resourceId.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const node = new RegExp(`<node[^>]*resource-id="${escapedId}"[^>]*>`, "u").exec(ui)?.[0];
  return node ? /text="([^"]*)"/u.exec(node)?.[1] ?? "" : "";
};
const scrollAndroidUntilText = (initialUi, expected, maxScrolls = 6) => {
  let ui = initialUi;
  for (let attempt = 0; attempt <= maxScrolls; attempt += 1) {
    if (ui.includes(expected)) return ui;
    adbRetry("shell", "input", "swipe", "540", "1800", "540", "600", "450");
    wait(500);
    ui = dumpAndroidUi();
  }
  return ui;
};
const replaceAndroidText = (ui, resourceId, value) => {
  tapAndroidResource(ui, resourceId);
  adbRetry("shell", "input", "keyevent", "123");
  adbRetry("shell", "input", "keyevent", ...Array.from({ length: 96 }, () => "67"));
  adbRetry("shell", "input", "text", value);
};
const validateAndroidDeepLinks = ({
  email,
  reassignmentRequestId,
  targetAppointmentId = appointmentId,
  expectedCorrelationId = correlationId,
}) => {
  const packageName = androidPackage;
  const isClient = androidApp === "client";
  const resources = isClient
    ? {
        signIn: "client-sign-in-screen",
        signInEmail: "client-sign-in-email",
        signInPassword: "client-sign-in-password",
        signInSubmit: "client-sign-in-submit",
        authenticated: "client-discovery-screen",
        detail: "client-appointment-detail-screen",
        onboarding: "client-onboarding-screen",
        onboardingSkip: "client-onboarding-skip",
      }
    : {
        signIn: "business-sign-in-screen",
        signInEmail: "business-sign-in-email",
        signInPassword: "business-sign-in-password",
        signInSubmit: "business-sign-in-submit",
        authenticated: "business-today-screen",
        detail: "business-decision-detail-screen",
        noAccess: "business-no-access-screen",
      };
  const deepLink = isClient
    ? `cutsync:///appointments/${targetAppointmentId}`
    : `cutsync-business:///decisions/${reassignmentRequestId}`;
  const launchStates = [
    resources.signIn,
    resources.authenticated,
    ...(resources.noAccess ? [resources.noAccess] : []),
    ...(resources.onboarding ? [resources.onboarding] : []),
    "DEVELOPMENT SERVERS",
    'text="Continue"',
  ];

  assert(adb("devices").includes("\tdevice"), "android_device_unavailable");
  disableAndroidAutofillForHarness();
  adb("shell", "am", "force-stop", packageName);
  if (resetAndroidApp) adb("shell", "pm", "clear", packageName);
  adb(
    "shell", "monkey", "-p", packageName,
    "-c", "android.intent.category.LAUNCHER", "1",
  );
  let initialUi = waitForAndroidUiAny(launchStates, 240_000);
  if (initialUi.includes("DEVELOPMENT SERVERS")) {
    if (androidStandalone) throw new Error("android_standalone_opened_development_launcher");
    if (initialUi.includes("Start a local development server with:")) {
      adb("shell", "input", "tap", "500", "935");
      adb("shell", "input", "text", "10.0.2.2:8081");
      adb("shell", "input", "tap", "540", "1080");
    } else {
      adb("shell", "input", "tap", "540", "590");
    }
    initialUi = waitForAndroidUiAny(
      launchStates.filter((state) => state !== "DEVELOPMENT SERVERS"),
      120_000,
    );
  }
  if (initialUi.includes('text="Continue"')) {
    adb("shell", "input", "tap", "540", "2165");
    initialUi = waitForAndroidUiAny([...launchStates, "Runtime version:"], 30_000);
    if (initialUi.includes("Runtime version:")) {
      adb("shell", "input", "keyevent", "4");
      initialUi = waitForAndroidUiAny(launchStates, 60_000);
    }
  }
  if (resources.onboarding && initialUi.includes(resources.onboarding)) {
    tapAndroidResource(initialUi, resources.onboardingSkip);
    initialUi = waitForAndroidUiAny([resources.signIn, resources.authenticated], 30_000);
  }
  if (resources.noAccess && initialUi.includes(resources.noAccess)) {
    const diagnostic = /BUS_CTX_[A-Z0-9_]+/u.exec(initialUi)?.[0]
      ?? "BUS_CTX_UNKNOWN";
    captureAndroidEvidence(`g14-${runId}-current-session-context-failure`);
    if (androidCurrentSession) {
      throw new Error(`android_current_session_context_unavailable:${diagnostic}`);
    }
    throw new Error(`android_existing_session_requires_sign_out:${diagnostic}`);
  }
  if (initialUi.includes(resources.authenticated) && androidCurrentSession) {
    captureAndroidEvidence(`g14-${runId}-current-session-authorized`);
    return {
      authentication: "current-session-passed",
      deepLinks: "not-executed-current-session",
    };
  }
  if (initialUi.includes(resources.authenticated)) {
    captureAndroidEvidence(`g14-${runId}-existing-session-authorized`);
    throw new Error("android_existing_session_requires_sign_out");
  }
  const signInUi = waitForAndroidUi(resources.signIn);
  replaceAndroidText(signInUi, resources.signInEmail, email);
  replaceAndroidText(dumpAndroidUi(), resources.signInPassword, password);
  let filledUi = dumpAndroidUi();
  if (androidResourceText(filledUi, resources.signInPassword).length !== password.length) {
    replaceAndroidText(filledUi, resources.signInPassword, password);
    filledUi = dumpAndroidUi();
  }
  assert(
    androidResourceText(filledUi, resources.signInPassword).length === password.length,
    "android_password_input_length_mismatch",
  );
  adbRetry("shell", "input", "keyevent", "4");
  wait(500);
  tapAndroidResource(dumpAndroidUi(), resources.signInSubmit);
  const authenticatedUi = waitForAndroidUiAny(
    [resources.authenticated, ...(resources.noAccess ? [resources.noAccess] : [])],
    60_000,
  );
  if (resources.noAccess && authenticatedUi.includes(resources.noAccess)) {
    const diagnostic = /BUS_CTX_[A-Z0-9_]+/u.exec(authenticatedUi)?.[0]
      ?? "BUS_CTX_UNKNOWN";
    captureAndroidEvidence(`g14-${runId}-context-failure`);
    throw new Error(`android_context_unavailable:${diagnostic}`);
  }
  androidEphemeralSessionCreated = true;
  captureAndroidEvidence(`g14-${runId}-${androidApp}-authenticated`);

  const openDeepLink = (lifecycle) => {
    adb(
      "shell", "am", "start", "-W",
      "-a", "android.intent.action.VIEW",
      "-d", deepLink,
      packageName,
    );
    const detailUi = scrollAndroidUntilText(
      waitForAndroidUi(resources.detail, 45_000),
      expectedCorrelationId,
    );
    assert(
      detailUi.includes(expectedCorrelationId),
      `android_${androidApp}_${lifecycle}_correlation_mismatch`,
    );
    captureAndroidEvidence(`g14-${runId}-${androidApp}-deep-link-${lifecycle}`);
  };

  adb("shell", "am", "force-stop", packageName);
  openDeepLink("cold");
  adb("shell", "input", "keyevent", "3");
  openDeepLink("background");
  openDeepLink("foreground");
  return {
    authentication: isClient
      ? "ephemeral-client-login-passed"
      : "ephemeral-role-login-passed",
    deepLinks: "cold-background-foreground-passed",
  };
};

const runId = randomUUID().slice(0, 8);
const password = `g14${randomBytes(24).toString("hex")}a9`;
const unitAId = randomUUID();
const unitBId = randomUUID();
const organizationId = randomUUID();
const serviceId = randomUUID();
const appointmentId = randomUUID();
const correlationId = randomUUID();
let androidResult = {
  authentication: "not-requested",
  deepLinks: "not-requested",
};
const technicalSlug = `g14-technical-${runId}`;
const technicalSlugB = `${technicalSlug}-cross-unit`;
const createdUserIds = [];
const actors = new Map();
const definitions = [
  "owner", "admin", "manager", "reception", "cashier", "finance",
  "professional", "replacement", "customer", "outsider", "other_unit",
];
const allDays = Array.from({ length: 7 }, (_, day) => ({
  day,
  isOpen: true,
  open: "09:00",
  close: "18:00",
}));

const cleanup = async () => {
  const createdUserSqlList = createdUserIds.length > 0
    ? createdUserIds.map((id) => `${sqlLiteral(id)}::uuid`).join(",")
    : "NULL::uuid";
  return runCleanupSteps([
    {
      name: "remote_fixture_sql",
      run: () => runLinkedSql(`
      BEGIN;
      ALTER TABLE public.appointment_assignment_shadow_issues
        DISABLE TRIGGER appointment_assignment_shadow_issues_immutable;
      ALTER TABLE public.appointment_assignment_shadow_runs
        DISABLE TRIGGER appointment_assignment_shadow_runs_immutable;
      ALTER TABLE public.appointment_assignment_events
        DISABLE TRIGGER appointment_assignment_events_immutable;
      ALTER TABLE public.appointment_events
        DISABLE TRIGGER appointment_events_immutable;
      DELETE FROM public.client_push_deliveries
      WHERE appointment_id = ${sqlLiteral(appointmentId)};
      DELETE FROM public.push_devices
      WHERE profile_id IN (${createdUserSqlList});
      DELETE FROM public.appointment_assignment_shadow_issues
      WHERE run_id IN (
        SELECT id FROM public.appointment_assignment_shadow_runs
        WHERE establishment_id IN (${sqlLiteral(unitAId)}::uuid, ${sqlLiteral(unitBId)}::uuid)
      );
      DELETE FROM public.appointment_assignment_shadow_runs
      WHERE establishment_id IN (${sqlLiteral(unitAId)}::uuid, ${sqlLiteral(unitBId)}::uuid);
      DELETE FROM public.appointment_assignment_events
      WHERE establishment_id IN (${sqlLiteral(unitAId)}::uuid, ${sqlLiteral(unitBId)}::uuid);
      DELETE FROM public.appointment_events
      WHERE establishment_id IN (${sqlLiteral(unitAId)}::uuid, ${sqlLiteral(unitBId)}::uuid);
      ALTER TABLE public.appointment_assignment_shadow_issues
        ENABLE TRIGGER appointment_assignment_shadow_issues_immutable;
      ALTER TABLE public.appointment_assignment_shadow_runs
        ENABLE TRIGGER appointment_assignment_shadow_runs_immutable;
      ALTER TABLE public.appointment_assignment_events
        ENABLE TRIGGER appointment_assignment_events_immutable;
      ALTER TABLE public.appointment_events
        ENABLE TRIGGER appointment_events_immutable;
      DELETE FROM public.customer_change_decisions WHERE appointment_id = ${sqlLiteral(appointmentId)};
      UPDATE public.appointment_professional_assignments
      SET reassignment_request_id = NULL, supersedes_assignment_id = NULL
      WHERE establishment_id IN (${sqlLiteral(unitAId)}::uuid, ${sqlLiteral(unitBId)}::uuid);
      UPDATE public.appointment_reassignment_requests
      SET previous_assignment_id = NULL, proposed_professional_id = NULL
      WHERE establishment_id IN (${sqlLiteral(unitAId)}::uuid, ${sqlLiteral(unitBId)}::uuid);
      DELETE FROM public.appointment_reassignment_requests
      WHERE establishment_id IN (${sqlLiteral(unitAId)}::uuid, ${sqlLiteral(unitBId)}::uuid);
      DELETE FROM public.appointment_professional_assignments
      WHERE establishment_id IN (${sqlLiteral(unitAId)}::uuid, ${sqlLiteral(unitBId)}::uuid);
      DELETE FROM public.appointments
      WHERE establishment_id IN (${sqlLiteral(unitAId)}::uuid, ${sqlLiteral(unitBId)}::uuid);
      DELETE FROM public.professional_services
      WHERE establishment_id IN (${sqlLiteral(unitAId)}::uuid, ${sqlLiteral(unitBId)}::uuid);
      DELETE FROM public.services
      WHERE establishment_id IN (${sqlLiteral(unitAId)}::uuid, ${sqlLiteral(unitBId)}::uuid);
      DELETE FROM public.organization_establishments WHERE organization_id = ${sqlLiteral(organizationId)}::uuid;
      DELETE FROM public.organization_members WHERE organization_id = ${sqlLiteral(organizationId)}::uuid;
      DELETE FROM public.organizations WHERE id = ${sqlLiteral(organizationId)}::uuid;
      DELETE FROM public.memberships
      WHERE establishment_id IN (${sqlLiteral(unitAId)}::uuid, ${sqlLiteral(unitBId)}::uuid);
      DELETE FROM public.billing_coverage_assignments
      WHERE establishment_id IN (${sqlLiteral(unitAId)}::uuid, ${sqlLiteral(unitBId)}::uuid);
      DELETE FROM public.billing_subscriptions
      WHERE billing_account_id IN (
        SELECT id FROM public.billing_accounts
        WHERE establishment_id IN (${sqlLiteral(unitAId)}::uuid, ${sqlLiteral(unitBId)}::uuid)
      );
      DELETE FROM public.billing_accounts
      WHERE establishment_id IN (${sqlLiteral(unitAId)}::uuid, ${sqlLiteral(unitBId)}::uuid);
      DELETE FROM public.establishments
      WHERE id IN (${sqlLiteral(unitAId)}::uuid, ${sqlLiteral(unitBId)}::uuid);
      COMMIT;
    `),
    },
    ...createdUserIds.map((userId, index) => ({
      name: `fixture_user_${index + 1}`,
      run: async () => {
        const deleted = await admin.auth.admin.deleteUser(userId);
        if (deleted.error && !deleted.error.message.includes("not found")) {
          throw new Error(`cleanup_user_failed: ${deleted.error.message}`);
        }
      },
    })),
  ]);
};

const findVisibleAuthorizedAccount = async () => {
  let ui = dumpAndroidUi();
  if (!ui.includes("business-account-screen")) {
    adb(
      "shell", "am", "start", "-W",
      "-a", "android.intent.action.VIEW",
      "-d", "cutsync-business:///account",
      androidPackage,
    );
    ui = waitForAndroidUi("business-account-screen", 30_000);
  }
  const visibleEmail = /text="([^"@\s]+@[^"\s]+)"/u.exec(ui)?.[1];
  assert(visibleEmail, "visible_account_email_unavailable");

  let targetUser = null;
  for (let page = 1; page <= 10 && !targetUser; page += 1) {
    const listed = requireData(
      await admin.auth.admin.listUsers({ page, perPage: 1000 }),
      "list auth users for authorized Android fixture",
    );
    targetUser = listed.users.find((user) => user.email === visibleEmail) ?? null;
    if (listed.users.length < 1000) break;
  }
  assert(targetUser, "visible_account_not_found_in_target_project");

  const memberships = requireData(
    await admin.from("memberships")
      .select("establishment_id,status,role,role_template")
      .eq("profile_id", targetUser.id)
      .eq("status", "active"),
    "read authorized Android memberships",
  );
  assert(memberships.length > 0, "visible_account_has_no_active_membership");
  const establishmentIds = [...new Set(memberships.map((membership) => membership.establishment_id))];
  const establishments = requireData(
    await admin.from("establishments")
      .select("id,name,account_status,lifecycle_status,appointment_reassignment_enabled")
      .in("id", establishmentIds),
    "read authorized Android establishments",
  );
  const activeEstablishments = establishments.filter((establishment) => (
    establishment.account_status === "active"
      && ["ready", "active"].includes(establishment.lifecycle_status)
  ));
  const visibleEstablishments = activeEstablishments.filter((establishment) => (
    ui.includes(`text="${String(establishment.name).replaceAll("&", "&amp;").replaceAll('"', "&quot;")}"`)
  ));
  const selectedEstablishment = visibleEstablishments.length === 1
    ? visibleEstablishments[0]
    : activeEstablishments.length === 1
      ? activeEstablishments[0]
      : null;
  assert(selectedEstablishment, "active_android_establishment_is_ambiguous");
  assert(
    ui.includes("PROPRIETÁRIO") || memberships.some((membership) => (
      ["admin", "manager"].includes(membership.role_template ?? membership.role)
    )),
    "visible_account_lacks_management_authority",
  );
  return { targetUser, selectedEstablishment };
};

const validateAuthorizedAndroidFixture = async () => {
  assert(adb("devices").includes("\tdevice"), "android_device_unavailable");
  adb(
    "shell", "monkey", "-p", androidPackage,
    "-c", "android.intent.category.LAUNCHER", "1",
  );
  waitForAndroidUi('resource-id="business-', 60_000);
  const { targetUser, selectedEstablishment } = await findVisibleAuthorizedAccount();
  const fixtureUserIds = [];
  const fixtureProfileIds = [];
  const fixtureServiceId = randomUUID();
  const fixtureAppointmentId = randomUUID();
  const fixtureCorrelationId = randomUUID();
  let fixtureRequestId = null;
  let validationFailure = null;
  const originalReassignmentFlag = selectedEstablishment.appointment_reassignment_enabled;

  try {
    const fixtureActors = new Map();
    for (const name of ["requester", "replacement", "customer"]) {
      const created = requireData(
        await admin.auth.admin.createUser({
          email: `g14-android-${runId}-${name}@example.invalid`,
          password,
          email_confirm: true,
          user_metadata: { name: `G14 Android technical ${name}` },
        }),
        `create Android fixture ${name}`,
      );
      fixtureUserIds.push(created.user.id);
      fixtureProfileIds.push(created.user.id);
      fixtureActors.set(name, {
        id: created.user.id,
        email: created.user.email,
        client: actorClient(),
      });
    }

    if (!originalReassignmentFlag) {
      requireData(
        await admin.from("establishments")
          .update({ appointment_reassignment_enabled: true })
          .eq("id", selectedEstablishment.id),
        "enable reassignment for authorized Android fixture",
      );
    }
    requireData(await admin.from("memberships").insert([
      {
        profile_id: fixtureActors.get("requester").id,
        establishment_id: selectedEstablishment.id,
        role: "professional",
        role_template: "professional",
        status: "active",
        created_by: targetUser.id,
      },
      {
        profile_id: fixtureActors.get("replacement").id,
        establishment_id: selectedEstablishment.id,
        role: "professional",
        role_template: "professional",
        status: "active",
        created_by: targetUser.id,
      },
    ]), "create Android fixture memberships");
    requireData(
      await admin.from("profiles")
        .update({ work_hours: allDays })
        .in("id", [fixtureActors.get("requester").id, fixtureActors.get("replacement").id]),
      "configure Android fixture schedules",
    );
    requireData(await admin.from("services").insert({
      id: fixtureServiceId,
      establishment_id: selectedEstablishment.id,
      name: `G14 Android technical service ${runId}`,
      price: 50,
      duration_minutes: 30,
      is_active: true,
    }), "create Android fixture service");
    requireData(await admin.from("professional_services").insert([
      {
        establishment_id: selectedEstablishment.id,
        professional_id: fixtureActors.get("requester").id,
        service_id: fixtureServiceId,
        price: 50,
        duration_minutes: 30,
        is_active: true,
      },
      {
        establishment_id: selectedEstablishment.id,
        professional_id: fixtureActors.get("replacement").id,
        service_id: fixtureServiceId,
        price: 50,
        duration_minutes: 30,
        is_active: true,
      },
    ]), "qualify Android fixture professionals");

    const startsAt = new Date(Date.now() + 3 * 86_400_000);
    startsAt.setUTCHours(15, 0, 0, 0);
    const updatedAt = new Date().toISOString();
    requireData(await admin.from("appointments").insert({
      id: fixtureAppointmentId,
      establishment_id: selectedEstablishment.id,
      client_id: fixtureActors.get("customer").id,
      client_name: "G14 Android technical customer",
      professional_id: fixtureActors.get("requester").id,
      service_id: fixtureServiceId,
      date_time: startsAt.toISOString(),
      ends_at: new Date(startsAt.getTime() + 30 * 60_000).toISOString(),
      duration_minutes: 30,
      status: "confirmed",
      price_charged: 50,
      updated_at: updatedAt,
    }), "create Android fixture appointment");

    const requesterSession = requireData(
      await fixtureActors.get("requester").client.auth.signInWithPassword({
        email: fixtureActors.get("requester").email,
        password,
      }),
      "sign in Android fixture requester",
    );
    assert(requesterSession.session?.access_token, "Android fixture requester JWT unavailable");
    const requested = requireData(
      await fixtureActors.get("requester").client.rpc("request_appointment_reassignment", {
        target_appointment_id: fixtureAppointmentId,
        target_reason_code: "professional_absence",
        target_responsibility: "professional",
        target_due_at: new Date(startsAt.getTime() - 60 * 60_000).toISOString(),
        target_expected_appointment_updated_at: updatedAt,
        target_request_id: randomUUID(),
        target_correlation_id: fixtureCorrelationId,
      }),
      "request authorized Android reassignment",
    );
    fixtureRequestId = requested.reassignmentRequestId;
    const validated = requireData(
      await fixtureActors.get("requester").client.rpc("validate_appointment_reassignment", {
        target_reassignment_request_id: fixtureRequestId,
        target_expected_version: 1,
        target_request_id: randomUUID(),
      }),
      "validate authorized Android reassignment",
    );
    assert(validated.status === "awaiting_manager", "authorized Android request is not actionable");

    const deepLink = `cutsync-business:///decisions/${fixtureRequestId}`;
    const openDeepLink = (lifecycle) => {
      adb(
        "shell", "am", "start", "-W",
        "-a", "android.intent.action.VIEW",
        "-d", deepLink,
        androidPackage,
      );
      const detailUi = scrollAndroidUntilText(
        waitForAndroidUi("business-decision-detail-screen", 45_000),
        fixtureCorrelationId,
      );
      assert(detailUi.includes(fixtureCorrelationId), `android_${lifecycle}_correlation_mismatch`);
      captureAndroidEvidence(`g14-${runId}-authorized-deep-link-${lifecycle}`);
    };

    adb("shell", "am", "force-stop", androidPackage);
    openDeepLink("cold");
    adb("shell", "input", "keyevent", "3");
    openDeepLink("background");
    openDeepLink("foreground");

    console.log(JSON.stringify({
      gate: "G14",
      environment: "Homolog",
      projectRef,
      runId,
      correlationId: fixtureCorrelationId,
      checks: {
        androidAuthentication: "existing-owner-session-passed",
        androidAuthorizedContext: "owner-management-context-passed",
        androidDeepLinks: "cold-background-foreground-passed",
        androidCorrelationParity: "passed",
        fixtureScope: "existing-authorized-establishment",
      },
    }, null, 2));
  } catch (error) {
    validationFailure = error;
  } finally {
    const requestPredicate = fixtureRequestId
      ? `OR reassignment_request_id = ${sqlLiteral(fixtureRequestId)}::uuid`
      : "";
    const cleanupFailures = await runCleanupSteps([
      {
        name: "authorized_android_fixture_sql",
        run: () => runLinkedSql(`
      BEGIN;
      ALTER TABLE public.appointment_assignment_events
        DISABLE TRIGGER appointment_assignment_events_immutable;
      ALTER TABLE public.appointment_events
        DISABLE TRIGGER appointment_events_immutable;
      DELETE FROM public.client_push_deliveries
      WHERE appointment_id = ${sqlLiteral(fixtureAppointmentId)};
      DELETE FROM public.customer_change_decisions
      WHERE appointment_id = ${sqlLiteral(fixtureAppointmentId)};
      DELETE FROM public.decision_queue_items
      WHERE appointment_id = ${sqlLiteral(fixtureAppointmentId)};
      DELETE FROM public.appointment_assignment_events
      WHERE appointment_id = ${sqlLiteral(fixtureAppointmentId)} ${requestPredicate};
      DELETE FROM public.appointment_events
      WHERE appointment_id = ${sqlLiteral(fixtureAppointmentId)};
      UPDATE public.appointment_professional_assignments
      SET reassignment_request_id = NULL, supersedes_assignment_id = NULL
      WHERE appointment_id = ${sqlLiteral(fixtureAppointmentId)};
      UPDATE public.appointment_reassignment_requests
      SET previous_assignment_id = NULL, proposed_professional_id = NULL
      WHERE appointment_id = ${sqlLiteral(fixtureAppointmentId)};
      DELETE FROM public.appointment_reassignment_requests
      WHERE appointment_id = ${sqlLiteral(fixtureAppointmentId)};
      DELETE FROM public.appointment_professional_assignments
      WHERE appointment_id = ${sqlLiteral(fixtureAppointmentId)};
      DELETE FROM public.appointment_professional_preference_snapshots
      WHERE appointment_id = ${sqlLiteral(fixtureAppointmentId)};
      DELETE FROM public.appointments WHERE id = ${sqlLiteral(fixtureAppointmentId)};
      DELETE FROM public.professional_services
      WHERE service_id = ${sqlLiteral(fixtureServiceId)}
        AND professional_id IN (${fixtureProfileIds.map((id) => `${sqlLiteral(id)}::uuid`).join(",") || "NULL::uuid"});
      DELETE FROM public.services WHERE id = ${sqlLiteral(fixtureServiceId)};
      DELETE FROM public.memberships
      WHERE establishment_id = ${sqlLiteral(selectedEstablishment.id)}::uuid
        AND profile_id IN (${fixtureProfileIds.map((id) => `${sqlLiteral(id)}::uuid`).join(",") || "NULL::uuid"});
      UPDATE public.establishments
      SET appointment_reassignment_enabled = ${originalReassignmentFlag ? "true" : "false"}
      WHERE id = ${sqlLiteral(selectedEstablishment.id)}::uuid;
      ALTER TABLE public.appointment_assignment_events
        ENABLE TRIGGER appointment_assignment_events_immutable;
      ALTER TABLE public.appointment_events
        ENABLE TRIGGER appointment_events_immutable;
      COMMIT;
    `),
      },
      ...fixtureUserIds.map((userId, index) => ({
        name: `authorized_android_fixture_user_${index + 1}`,
        run: async () => {
          const deleted = await admin.auth.admin.deleteUser(userId);
          if (deleted.error && !deleted.error.message.includes("not found")) {
            throw new Error(`cleanup_android_fixture_user_failed: ${deleted.error.message}`);
          }
        },
      })),
    ]);
    if (cleanupFailures.length === 0) {
      console.log("ANDROID_AUTHORIZED_FIXTURE_CLEANUP=PASS");
    }
    if (validationFailure) throw validationFailure;
    if (cleanupFailures.length > 0) {
      throw new AggregateError(cleanupFailures, "authorized_android_fixture_cleanup_failed");
    }
  }
};

const cleanupAuthorizedAndroidOrphans = async () => {
  const services = requireData(
    await admin.from("services")
      .select("id,establishment_id")
      .like("name", "G14 Android technical service %"),
    "find orphan Android fixture services",
  );
  const serviceIds = services.map((service) => service.id);
  const appointments = serviceIds.length > 0
    ? requireData(
        await admin.from("appointments")
          .select("id,establishment_id")
          .in("service_id", serviceIds)
          .eq("client_name", "G14 Android technical customer"),
        "find orphan Android fixture appointments",
      )
    : [];
  const appointmentIds = appointments.map((appointment) => appointment.id);
  const establishmentIds = [...new Set([
    ...services.map((service) => service.establishment_id),
    ...appointments.map((appointment) => appointment.establishment_id),
  ])];
  const fixtureUsers = [];
  const technicalEmailPattern = /^g14-android-[a-f0-9]{8}-(?:requester|replacement|customer)@example\.invalid$/u;
  for (let page = 1; page <= 10; page += 1) {
    const listed = requireData(
      await admin.auth.admin.listUsers({ page, perPage: 1000 }),
      "find orphan Android fixture users",
    );
    fixtureUsers.push(...listed.users.filter((user) => technicalEmailPattern.test(user.email ?? "")));
    if (listed.users.length < 1000) break;
  }
  const userIds = fixtureUsers.map((user) => user.id);
  if (appointmentIds.length > 0 || serviceIds.length > 0 || userIds.length > 0) {
    const appointmentList = appointmentIds.length > 0
      ? appointmentIds.map(sqlLiteral).join(",")
      : "NULL";
    const serviceList = serviceIds.length > 0
      ? serviceIds.map(sqlLiteral).join(",")
      : "NULL";
    const userList = userIds.length > 0
      ? userIds.map((id) => `${sqlLiteral(id)}::uuid`).join(",")
      : "NULL::uuid";
    runLinkedSql(`
      BEGIN;
      ALTER TABLE public.appointment_assignment_events
        DISABLE TRIGGER appointment_assignment_events_immutable;
      ALTER TABLE public.appointment_events
        DISABLE TRIGGER appointment_events_immutable;
      DELETE FROM public.client_push_deliveries WHERE appointment_id IN (${appointmentList});
      DELETE FROM public.customer_change_decisions WHERE appointment_id IN (${appointmentList});
      DELETE FROM public.decision_queue_items WHERE appointment_id IN (${appointmentList});
      DELETE FROM public.appointment_assignment_events WHERE appointment_id IN (${appointmentList});
      DELETE FROM public.appointment_events WHERE appointment_id IN (${appointmentList});
      UPDATE public.appointment_professional_assignments
      SET reassignment_request_id = NULL, supersedes_assignment_id = NULL
      WHERE appointment_id IN (${appointmentList});
      UPDATE public.appointment_reassignment_requests
      SET previous_assignment_id = NULL, proposed_professional_id = NULL
      WHERE appointment_id IN (${appointmentList});
      DELETE FROM public.appointment_reassignment_requests WHERE appointment_id IN (${appointmentList});
      DELETE FROM public.appointment_professional_assignments WHERE appointment_id IN (${appointmentList});
      DELETE FROM public.appointment_professional_preference_snapshots
      WHERE appointment_id IN (${appointmentList});
      DELETE FROM public.appointments WHERE id IN (${appointmentList});
      DELETE FROM public.professional_services
      WHERE service_id IN (${serviceList}) AND professional_id IN (${userList});
      DELETE FROM public.services WHERE id IN (${serviceList});
      DELETE FROM public.memberships WHERE profile_id IN (${userList});
      ALTER TABLE public.appointment_assignment_events
        ENABLE TRIGGER appointment_assignment_events_immutable;
      ALTER TABLE public.appointment_events
        ENABLE TRIGGER appointment_events_immutable;
      COMMIT;
    `);
    for (const user of fixtureUsers) {
      const deleted = await admin.auth.admin.deleteUser(user.id);
      if (deleted.error && !deleted.error.message.includes("not found")) {
        throw new Error(`cleanup_orphan_android_user_failed: ${deleted.error.message}`);
      }
    }
  }
  console.log(JSON.stringify({
    cleanup: "G14 Android authorized fixtures",
    appointmentsRemoved: appointmentIds.length,
    servicesRemoved: serviceIds.length,
    usersRemoved: userIds.length,
    reassignmentFlagsUnchanged: establishmentIds.length,
  }, null, 2));
};

if (cleanupAndroidOrphans) {
  await cleanupAuthorizedAndroidOrphans();
  process.exit(0);
}

if (androidAuthorizedFixture) {
  await validateAuthorizedAndroidFixture();
  process.exit(0);
}

if (diagnoseVisibleAccount) {
  const ui = dumpAndroidUi();
  const visibleEmail = /text="([^"@\s]+@[^"\s]+)"/u.exec(ui)?.[1];
  assert(visibleEmail, "visible_account_email_unavailable");
  let targetUser = null;
  for (let page = 1; page <= 10 && !targetUser; page += 1) {
    const listed = requireData(
      await admin.auth.admin.listUsers({ page, perPage: 1000 }),
      "list auth users for account readiness",
    );
    targetUser = listed.users.find((user) => user.email === visibleEmail) ?? null;
    if (listed.users.length < 1000) break;
  }
  assert(targetUser, "visible_account_not_found_in_target_project");
  const memberships = requireData(
    await admin.from("memberships")
      .select("establishment_id,status,role,role_template")
      .eq("profile_id", targetUser.id),
    "read account memberships",
  );
  const establishmentIds = [...new Set(memberships.map((membership) => membership.establishment_id))];
  const establishments = establishmentIds.length > 0
    ? requireData(
        await admin.from("establishments")
          .select("id,account_status,lifecycle_status")
          .in("id", establishmentIds),
        "read account establishments",
      )
    : [];
  const organizationMemberships = requireData(
    await admin.from("organization_members")
      .select("status,role")
      .eq("profile_id", targetUser.id),
    "read account organization memberships",
  );
  console.log(JSON.stringify({
    accountFoundInTargetProject: true,
    emailConfirmed: Boolean(targetUser.email_confirmed_at),
    membershipCount: memberships.length,
    activeMembershipCount: memberships.filter((membership) => membership.status === "active").length,
    membershipRoles: [...new Set(memberships.map((membership) => (
      membership.role_template ?? membership.role
    )))],
    establishmentStates: establishments.map((establishment) => ({
      accountStatus: establishment.account_status,
      lifecycleStatus: establishment.lifecycle_status,
    })),
    activeOrganizationMembershipCount: organizationMemberships.filter(
      (membership) => membership.status === "active",
    ).length,
  }, null, 2));
  process.exit(0);
}

let primaryFailure = null;
try {
  for (const name of definitions) {
    const created = requireData(
      await admin.auth.admin.createUser({
        email: `g14-${runId}-${name}@example.invalid`,
        password,
        email_confirm: true,
        user_metadata: { name: `G14 technical ${name}` },
      }),
      `create ${name}`,
    );
    createdUserIds.push(created.user.id);
    actors.set(name, {
      id: created.user.id,
      email: created.user.email,
      client: actorClient(),
    });
  }

  requireData(await admin.from("establishments").insert([
    {
      id: unitAId,
      name: `G14 technical A ${runId}`,
      slug: technicalSlug,
      account_status: "active",
      lifecycle_status: "active",
      timezone: "America/Sao_Paulo",
      opening_hours: allDays,
      appointment_reassignment_enabled: true,
    },
    {
      id: unitBId,
      name: `G14 technical B ${runId}`,
      slug: technicalSlugB,
      account_status: "active",
      lifecycle_status: "active",
      timezone: "America/Sao_Paulo",
      opening_hours: allDays,
      appointment_reassignment_enabled: true,
    },
  ]), "create establishments");

  const roleDefinitions = [
    ["owner", unitAId, "admin"],
    ["admin", unitAId, "admin"],
    ["manager", unitAId, "manager"],
    ["reception", unitAId, "reception"],
    ["cashier", unitAId, "cashier"],
    ["finance", unitAId, "finance"],
    ["professional", unitAId, "professional"],
    ["replacement", unitAId, "professional"],
    ["other_unit", unitBId, "manager"],
  ];
  requireData(await admin.from("memberships").insert(roleDefinitions.map(
    ([name, establishmentId, roleTemplate]) => ({
      profile_id: actors.get(name).id,
      establishment_id: establishmentId,
      role: roleTemplate === "professional" ? "professional" : "admin",
      role_template: roleTemplate,
      status: "active",
      created_by: actors.get("owner").id,
    }),
  )), "create memberships");

  requireData(await admin.from("organizations").insert({
    id: organizationId,
    name: `G14 technical organization ${runId}`,
    status: "active",
    created_by: actors.get("owner").id,
  }), "create organization");
  requireData(await admin.from("organization_members").insert({
    organization_id: organizationId,
    profile_id: actors.get("owner").id,
    role: "owner",
    status: "active",
    created_by: actors.get("owner").id,
  }), "create organization owner");
  requireData(await admin.from("organization_establishments").insert({
    organization_id: organizationId,
    establishment_id: unitAId,
    status: "active",
    linked_by: actors.get("owner").id,
  }), "link organization establishment");

  requireData(await admin.from("profiles").update({ work_hours: allDays }).in("id", [
    actors.get("professional").id,
    actors.get("replacement").id,
  ]), "configure professional schedules");
  requireData(await admin.from("profiles").update({ notification_channels: ["push"] })
    .eq("id", actors.get("customer").id), "enable customer push");
  requireData(await admin.from("services").insert({
    id: serviceId,
    establishment_id: unitAId,
    name: "G14 technical service",
    price: 50,
    duration_minutes: 30,
    is_active: true,
  }), "create service");
  requireData(await admin.from("professional_services").insert([
    {
      establishment_id: unitAId,
      professional_id: actors.get("professional").id,
      service_id: serviceId,
      price: 50,
      duration_minutes: 30,
      is_active: true,
    },
    {
      establishment_id: unitAId,
      professional_id: actors.get("replacement").id,
      service_id: serviceId,
      price: 50,
      duration_minutes: 30,
      is_active: true,
    },
  ]), "qualify professionals");

  const startsAt = new Date(Date.now() + 3 * 86_400_000);
  startsAt.setUTCHours(15, 0, 0, 0);
  const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
  const appointmentUpdatedAt = new Date().toISOString();
  requireData(await admin.from("appointments").insert({
    id: appointmentId,
    establishment_id: unitAId,
    client_id: actors.get("customer").id,
    client_name: "G14 technical customer",
    professional_id: actors.get("professional").id,
    service_id: serviceId,
    date_time: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    duration_minutes: 30,
    status: "confirmed",
    price_charged: 50,
    updated_at: appointmentUpdatedAt,
  }), "create appointment");

  for (const actor of actors.values()) {
    const signedIn = requireData(await actor.client.auth.signInWithPassword({
      email: actor.email,
      password,
    }), "sign in technical actor");
    assert(signedIn.session?.access_token, "real JWT session missing");
  }

  const expectedRoles = new Map([
    ["owner", { role: "owner", request: true, apply: true }],
    ["admin", { role: "admin", request: true, apply: true }],
    ["manager", { role: "manager", request: true, apply: true }],
    ["reception", { role: "reception", request: true, apply: false }],
    ["cashier", { role: "cashier", request: false, apply: false }],
    ["finance", { role: "finance", request: false, apply: false }],
    ["professional", { role: "professional", request: true, apply: false }],
  ]);
  for (const [name, expected] of expectedRoles) {
    const authorizedContexts = requireData(
      await actors.get(name).client.rpc("get_my_authorized_contexts", {
        target_app_id: "business",
      }),
      `authorized contexts ${name}`,
    );
    assert(
      authorizedContexts.some((context) => context.establishmentId === unitAId),
      `${name}: authorized establishment context missing`,
    );
    const contexts = requireData(
      await actors.get(name).client.rpc("get_my_business_operational_contexts"),
      `contexts ${name}`,
    );
    assert(contexts.length === 1, `${name}: expected one operational context`);
    const context = contexts[0];
    assert(
      context.operational_role === expected.role,
      `${name}: role projection mismatch; operational_role=${context.operational_role}; membership_role=${context.membership_role}`,
    );
    assert(context.access_mode === "full", `${name}: expected full beta access`);
    assert(
      context.capabilities.includes("request_appointment_reassignment") === expected.request,
      `${name}: request capability mismatch; capabilities=${JSON.stringify(context.capabilities)}`,
    );
    assert(
      context.capabilities.includes("apply_appointment_reassignment") === expected.apply,
      `${name}: apply capability mismatch`,
    );
  }
  const outsiderContexts = requireData(
    await actors.get("outsider").client.rpc("get_my_business_operational_contexts"),
    "outsider contexts",
  );
  assert(outsiderContexts.length === 0, "outsider received operational context");
  const outsiderAuthorizedContexts = requireData(
    await actors.get("outsider").client.rpc("get_my_authorized_contexts", {
      target_app_id: "business",
    }),
    "outsider authorized contexts",
  );
  assert(
    outsiderAuthorizedContexts.length === 0,
    "outsider received authorized business context",
  );

  const pushToken = `ExponentPushToken[g14-${runId}-${randomBytes(12).toString("hex")}]`;
  requireData(await actors.get("customer").client.rpc("register_push_device", {
    target_app_kind: "client",
    target_platform: "android",
    target_expo_push_token: pushToken,
  }), "register technical push device");

  const requestId = randomUUID();
  const requestArgs = {
    target_appointment_id: appointmentId,
    target_reason_code: "professional_absence",
    target_responsibility: "professional",
    target_due_at: new Date(startsAt.getTime() - 60 * 60_000).toISOString(),
    target_expected_appointment_updated_at: appointmentUpdatedAt,
    target_request_id: requestId,
    target_correlation_id: correlationId,
  };
  const requested = requireData(
    await actors.get("professional").client.rpc("request_appointment_reassignment", requestArgs),
    "request reassignment",
  );
  const requestReplay = requireData(
    await actors.get("professional").client.rpc("request_appointment_reassignment", requestArgs),
    "replay reassignment request",
  );
  assert(requested.replayed === false && requestReplay.replayed === true, "request replay mismatch");
  assert(requested.correlationId === correlationId, "request correlation mismatch");

  if (androidMode && androidApp === "business") {
    androidResult = validateAndroidDeepLinks({
      email: actors.get("manager").email,
      reassignmentRequestId: requested.reassignmentRequestId,
    });
  }

  const validated = requireData(
    await actors.get("professional").client.rpc("validate_appointment_reassignment", {
      target_reassignment_request_id: requested.reassignmentRequestId,
      target_expected_version: 1,
      target_request_id: randomUUID(),
    }),
    "validate reassignment",
  );
  assert(validated.status === "awaiting_manager", "validation status mismatch");

  for (const name of ["owner", "admin", "manager", "professional"]) {
    const queue = requireData(
      await actors.get(name).client.rpc("list_business_decision_queue", {
        target_establishment_id: unitAId,
      }),
      `decision queue ${name}`,
    );
    assert(queue.length === 1, `${name}: decision queue mismatch`);
    assert(queue[0].correlationId === correlationId, `${name}: queue correlation mismatch`);
  }
  const receptionQueue = requireData(
    await actors.get("reception").client.rpc("list_business_decision_queue", {
      target_establishment_id: unitAId,
    }),
    "decision queue reception",
  );
  assert(
    receptionQueue.length === 0,
    "reception saw another actor's request without apply capability",
  );
  for (const name of ["cashier", "finance", "outsider"]) {
    await expectRpcError(
      actors.get(name).client,
      "list_business_decision_queue",
      { target_establishment_id: unitAId },
      "forbidden",
    );
  }
  await expectRpcError(
    actors.get("other_unit").client,
    "list_business_decision_queue",
    { target_establishment_id: unitAId },
    "forbidden",
  );

  // The technical Expo token is intentionally non-deliverable. Immediate
  // dispatch may disable it after the informational validation push, so
  // re-register the same fixture device before validating the actionable push.
  requireData(await actors.get("customer").client.rpc("register_push_device", {
    target_app_kind: "client",
    target_platform: "android",
    target_expo_push_token: pushToken,
  }), "re-enable technical push device");

  const proposalArgs = {
    target_reassignment_request_id: requested.reassignmentRequestId,
    target_proposed_professional_id: actors.get("replacement").id,
    target_expected_version: 2,
    target_request_id: randomUUID(),
  };
  await expectRpcError(
    actors.get("professional").client,
    "propose_appointment_reassignment",
    proposalArgs,
    "forbidden",
  );
  await expectRpcError(
    actors.get("finance").client,
    "propose_appointment_reassignment",
    proposalArgs,
    "forbidden",
  );
  const proposed = requireData(
    await actors.get("manager").client.rpc("propose_appointment_reassignment", proposalArgs),
    "propose reassignment",
  );
  const proposalReplay = requireData(
    await actors.get("manager").client.rpc("propose_appointment_reassignment", proposalArgs),
    "replay proposal",
  );
  assert(proposed.status === "awaiting_customer", "proposal bypassed customer");
  assert(proposalReplay.replayed === true, "proposal replay mismatch");

  if (androidMode && androidApp === "client") {
    androidResult = validateAndroidDeepLinks({
      email: actors.get("customer").email,
      reassignmentRequestId: requested.reassignmentRequestId,
      targetAppointmentId: appointmentId,
      expectedCorrelationId: correlationId,
    });
  }

  const businessDetail = requireData(
    await actors.get("manager").client.rpc("get_business_reassignment_detail", {
      target_establishment_id: unitAId,
      target_reassignment_request_id: requested.reassignmentRequestId,
    }),
    "business detail",
  );
  const clientDetail = requireData(
    await actors.get("customer").client.rpc("get_client_reassignment_detail", {
      target_appointment_id: appointmentId,
    }),
    "client detail",
  );
  assert(businessDetail.correlationId === correlationId, "business correlation mismatch");
  assert(clientDetail.correlationId === correlationId, "client correlation mismatch");
  assert(
    businessDetail.timeline.every((event) => event.correlationId === correlationId)
      && clientDetail.timeline.every((event) => event.correlationId === correlationId),
    "timeline correlation mismatch",
  );
  assert(
    businessDetail.timeline.length === clientDetail.timeline.length,
    "timeline surface length mismatch",
  );

  const deliveries = requireData(await admin.from("client_push_deliveries")
    .select("event_type,status,payload")
    .eq("appointment_id", appointmentId), "read technical push queue");
  const decisionDeliveries = deliveries.filter(
    (delivery) => delivery.event_type === "appointment_reassignment_decision_required",
  );
  assert(
    decisionDeliveries.length === 1,
    `reassignment decision push was not enqueued exactly once; deliveries=${JSON.stringify(deliveries)}`,
  );
  assert(
    decisionDeliveries[0].payload.correlationId === correlationId,
    `push payload correlation mismatch; payload=${JSON.stringify(decisionDeliveries[0].payload)}`,
  );

  const decided = requireData(
    await actors.get("customer").client.rpc("decide_appointment_reassignment", {
      target_reassignment_request_id: requested.reassignmentRequestId,
      target_decision: "accept_replacement",
      target_chosen_professional_id: null,
      target_channel: "client_app",
      target_reason: null,
      target_expected_version: 3,
      target_request_id: randomUUID(),
    }),
    "customer decision",
  );
  assert(decided.status === "ready_to_apply", "customer decision status mismatch");
  const applied = requireData(
    await actors.get("manager").client.rpc("apply_appointment_reassignment", {
      target_reassignment_request_id: requested.reassignmentRequestId,
      target_expected_version: 4,
      target_request_id: randomUUID(),
    }),
    "apply reassignment",
  );
  assert(applied.professionalId === actors.get("replacement").id, "assignment projection mismatch");

  const protectedRead = await actors.get("admin").client
    .from("appointment_reassignment_requests").select("id").limit(1);
  assert(protectedRead.error, "authenticated app read protected workflow table directly");

  console.log(JSON.stringify({
    gate: "G14",
    environment: "Homolog",
    projectRef,
    authentication: "real-jwt-password-session",
    runId,
    correlationId,
    checks: {
      roleCapabilityContextMatrix: "passed",
      authorizedOperationalContextParity: "passed",
      outsiderAndCrossUnitDenied: "passed",
      manipulatedUiCommandsDenied: "passed",
      requestAndProposalReplay: "passed",
      businessClientTimelineParity: "passed",
      sharedCorrelationId: "passed",
      protectedTablesDenied: "passed",
      pushQueueIdempotency: "passed",
      pushTransportReceipt: "pending-real-device",
      androidAuthentication: androidResult.authentication,
      androidDeepLinks: androidResult.deepLinks,
    },
  }, null, 2));
} catch (error) {
  primaryFailure = error;
} finally {
  const cleanupFailures = await runCleanupSteps([
    ...(androidMode ? [{
      name: "android_autofill_restore",
      run: () => restoreAndroidAutofillAfterHarness(),
    }] : []),
    {
      name: "remote_fixture_cleanup",
      run: async () => {
        const remoteFailures = await cleanup();
        if (remoteFailures.length > 0) {
          throw new AggregateError(remoteFailures, "remote_fixture_cleanup_failed");
        }
      },
    },
    ...(androidEphemeralSessionCreated ? [{
      name: "android_ephemeral_session_cleanup",
      run: () => {
        adb("shell", "pm", "clear", androidPackage);
        console.log("ANDROID_EPHEMERAL_SESSION_CLEANUP=PASS");
      },
    }] : []),
  ]);
  if (cleanupFailures.length === 0) {
    console.log("FIXTURE_CLEANUP=PASS");
  }
  if (!primaryFailure && cleanupFailures.length > 0) {
    primaryFailure = new AggregateError(cleanupFailures, "g14_cleanup_failed");
  }
}

if (primaryFailure) throw primaryFailure;
