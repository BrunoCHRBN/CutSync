import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Buffer } from "node:buffer";
import { createClient } from "@supabase/supabase-js";

const PROJECT_REF_PATTERN = /^[a-z]{20}$/u;
const projectRef = process.argv.find((argument) => PROJECT_REF_PATTERN.test(argument))
  ?? process.env.SUPABASE_PROJECT_ID;
const cleanupAuthOrphans = process.argv.includes("--cleanup-auth-orphans");

if (!projectRef || !PROJECT_REF_PATTERN.test(projectRef)) {
  throw new Error("usage: node scripts/validate-phase4-homolog-jwt.mjs <project-ref>");
}

const commandOptions = { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] };
const localLinkedRef = readFileSync(resolve("supabase/.temp/project-ref"), "utf8").trim();
if (localLinkedRef !== projectRef) {
  throw new Error("linked_supabase_project_does_not_match_target");
}

const projects = JSON.parse(execSync("npx supabase projects list --output json", commandOptions));
if (!projects.some((project) => project.id === projectRef)) {
  throw new Error("target_project_not_available_in_authenticated_supabase_cli");
}

const keys = JSON.parse(execSync(
  `npx supabase projects api-keys --project-ref ${projectRef} --reveal --output json`,
  commandOptions,
));
const secretKey = keys.find((key) => key.api_key?.startsWith("sb_secret_"))?.api_key;
const publicKey = keys.find((key) => key.api_key?.startsWith("sb_publishable_"))?.api_key
  ?? keys.find((key) => /anon|publishable/u.test(key.name ?? ""))?.api_key;
if (!secretKey || !publicKey) throw new Error("supabase_api_keys_unavailable");

const url = `https://${projectRef}.supabase.co`;
const clientOptions = {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  global: { headers: { "User-Agent": "cutsync-g7-homolog-validation/1.0" } },
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
const expectRpcError = async (client, name, args, expected) => {
  const result = await client.rpc(name, args);
  assert(
    result.error?.message.includes(expected),
    `${name}: expected ${expected}, got ${result.error?.message ?? "success"}`,
  );
};
const decodeJwtPayload = (token) => {
  const payload = token?.split(".")[1];
  assert(payload, "invalid_access_token");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
};
const decodeBase32 = (value) => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of value.toUpperCase().replace(/=+$/u, "")) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("invalid_totp_secret");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes);
};
const generateTotp = (secret, timestamp = Date.now()) => {
  const counter = Math.floor(timestamp / 30_000);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, "0");
};
const getRemoteAuthTimestamp = async () => {
  const response = await fetch(`${url}/auth/v1/health`, {
    headers: { apikey: publicKey, "User-Agent": "cutsync-g7-homolog-validation/1.0" },
  });
  if (!response.ok) throw new Error(`auth_health_unavailable:${response.status}`);
  const timestamp = Date.parse(response.headers.get("date") ?? "");
  if (!Number.isFinite(timestamp)) throw new Error("auth_server_time_unavailable");
  return timestamp;
};
const sqlLiteral = (value) => `'${String(value).replaceAll("'", "''")}'`;
const runLinkedSql = (sql) => {
  const directory = mkdtempSync(join(tmpdir(), "cutsync-g7-"));
  const file = join(directory, "query.sql");
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

const runId = randomUUID().slice(0, 8);
const password = `${randomBytes(24).toString("base64url")}aA1!`;
const unitAId = randomUUID();
const unitBId = randomUUID();
const organizationId = randomUUID();
const orderId = randomUUID();
const createdUserIds = [];
const actors = new Map();
const definitions = [
  "owner", "admin", "cashier", "finance", "professional", "outsider", "other_unit",
];

const cleanup = async () => {
  try {
    runLinkedSql(`
      BEGIN;
      ALTER TABLE public.order_payment_events DISABLE TRIGGER prevent_order_payment_event_change;
      ALTER TABLE public.order_payment_entries DISABLE TRIGGER prevent_order_payment_entry_delete;
      ALTER TABLE public.service_order_events DISABLE TRIGGER service_order_events_immutable;
      ALTER TABLE public.service_order_items DISABLE TRIGGER service_order_items_10_mutability_guard;
      ALTER TABLE public.service_orders DISABLE TRIGGER service_orders_reject_delete;
      DELETE FROM public.order_payment_events
      WHERE establishment_id IN (${sqlLiteral(unitAId)}::uuid, ${sqlLiteral(unitBId)}::uuid);
      DELETE FROM public.order_payment_entries
      WHERE establishment_id IN (${sqlLiteral(unitAId)}::uuid, ${sqlLiteral(unitBId)}::uuid);
      DELETE FROM public.establishment_payment_methods
      WHERE establishment_id IN (${sqlLiteral(unitAId)}::uuid, ${sqlLiteral(unitBId)}::uuid);
      DELETE FROM public.service_order_events
      WHERE establishment_id IN (${sqlLiteral(unitAId)}::uuid, ${sqlLiteral(unitBId)}::uuid);
      DELETE FROM public.service_order_items
      WHERE establishment_id IN (${sqlLiteral(unitAId)}::uuid, ${sqlLiteral(unitBId)}::uuid);
      DELETE FROM public.service_orders
      WHERE establishment_id IN (${sqlLiteral(unitAId)}::uuid, ${sqlLiteral(unitBId)}::uuid);
      DELETE FROM public.command_receipts
      WHERE establishment_id IN (${sqlLiteral(unitAId)}::uuid, ${sqlLiteral(unitBId)}::uuid);
      ALTER TABLE public.order_payment_events ENABLE TRIGGER prevent_order_payment_event_change;
      ALTER TABLE public.order_payment_entries ENABLE TRIGGER prevent_order_payment_entry_delete;
      ALTER TABLE public.service_order_events ENABLE TRIGGER service_order_events_immutable;
      ALTER TABLE public.service_order_items ENABLE TRIGGER service_order_items_10_mutability_guard;
      ALTER TABLE public.service_orders ENABLE TRIGGER service_orders_reject_delete;
      DELETE FROM public.organization_establishments
      WHERE organization_id = ${sqlLiteral(organizationId)}::uuid;
      DELETE FROM public.organization_members
      WHERE organization_id = ${sqlLiteral(organizationId)}::uuid;
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
      DELETE FROM public.billing_invoices
      WHERE billing_account_id IN (
        SELECT id FROM public.billing_accounts
        WHERE establishment_id IN (${sqlLiteral(unitAId)}::uuid, ${sqlLiteral(unitBId)}::uuid)
      );
      DELETE FROM public.billing_accounts
      WHERE establishment_id IN (${sqlLiteral(unitAId)}::uuid, ${sqlLiteral(unitBId)}::uuid);
      DELETE FROM public.establishments
      WHERE id IN (${sqlLiteral(unitAId)}::uuid, ${sqlLiteral(unitBId)}::uuid);
      COMMIT;
    `);
  } finally {
    for (const userId of createdUserIds) {
      const deleted = await admin.auth.admin.deleteUser(userId);
      if (deleted.error && !deleted.error.message.includes("not found")) {
        throw new Error(`cleanup_user_failed: ${deleted.error.message}`);
      }
    }
  }
};

if (cleanupAuthOrphans) {
  let deletedCount = 0;
  for (let page = 1; page <= 10; page += 1) {
    const listed = requireData(
      await admin.auth.admin.listUsers({ page, perPage: 1000 }),
      "list G7 technical auth orphans",
    );
    const technicalUsers = listed.users.filter((user) => (
      /^g7-[a-f0-9]{8}-(owner|admin|cashier|finance|professional|outsider|other_unit)@example\.invalid$/u
        .test(user.email ?? "")
    ));
    for (const user of technicalUsers) {
      requireData(await admin.auth.admin.deleteUser(user.id), "delete G7 technical auth orphan");
      deletedCount += 1;
    }
    if (listed.users.length < 1000) break;
  }
  console.log(JSON.stringify({ cleanup: "G7 technical auth orphans", deletedCount }, null, 2));
  process.exit(0);
}

let executionError = null;
try {
  for (const name of definitions) {
    const created = requireData(await admin.auth.admin.createUser({
      email: `g7-${runId}-${name}@example.invalid`,
      password,
      email_confirm: true,
      user_metadata: { name: `G7 technical ${name}` },
    }), `create ${name}`);
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
      name: `G7 technical A ${runId}`,
      slug: `g7-technical-${runId}`,
      account_status: "active",
      lifecycle_status: "active",
      timezone: "America/Sao_Paulo",
      financial_ops_enabled: true,
    },
    {
      id: unitBId,
      name: `G7 technical B ${runId}`,
      slug: `g7-technical-${runId}-cross-unit`,
      account_status: "active",
      lifecycle_status: "active",
      timezone: "America/Sao_Paulo",
      financial_ops_enabled: false,
    },
  ]), "create establishments");

  const roleDefinitions = [
    ["owner", unitAId, "admin"],
    ["admin", unitAId, "admin"],
    ["cashier", unitAId, "cashier"],
    ["finance", unitAId, "finance"],
    ["professional", unitAId, "professional"],
    ["other_unit", unitBId, "cashier"],
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
    name: `G7 technical organization ${runId}`,
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

  requireData(await admin.from("service_orders").insert({
    id: orderId,
    establishment_id: unitAId,
    professional_id: actors.get("professional").id,
    status: "open",
    currency: "BRL",
    created_by: actors.get("owner").id,
    updated_by: actors.get("owner").id,
  }), "create service order");
  requireData(await admin.from("service_order_items").insert({
    service_order_id: orderId,
    establishment_id: unitAId,
    professional_id: actors.get("professional").id,
    description_snapshot: "G7 technical service",
    quantity: 1,
    unit_price_cents: 10_000,
    created_by: actors.get("owner").id,
    updated_by: actors.get("owner").id,
  }), "create service order item");
  runLinkedSql(`
    UPDATE public.service_orders
    SET status = 'awaiting_payment',
        started_at = opened_at,
        started_by = ${sqlLiteral(actors.get("owner").id)}::uuid,
        finished_at = opened_at,
        finished_by = ${sqlLiteral(actors.get("owner").id)}::uuid,
        version = version + 1
    WHERE id = ${sqlLiteral(orderId)}::uuid;
  `);

  for (const actor of actors.values()) {
    const signedIn = requireData(await actor.client.auth.signInWithPassword({
      email: actor.email,
      password,
    }), "sign in technical actor");
    const claims = decodeJwtPayload(signedIn.session?.access_token);
    assert(claims.sub === actor.id && claims.aal === "aal1", "real JWT identity mismatch");
  }

  const expectedCapabilities = new Map([
    ["owner", [true, true, true, true]],
    ["admin", [true, true, true, true]],
    ["cashier", [false, true, true, true]],
    ["finance", [false, true, false, false]],
    ["professional", [false, true, false, false]],
  ]);
  for (const [name, expected] of expectedCapabilities) {
    const contexts = requireData(
      await actors.get(name).client.rpc("get_my_business_operational_contexts"),
      `contexts ${name}`,
    );
    assert(contexts.length === 1, `${name}: operational context missing`);
    const capabilities = contexts[0].capabilities;
    const actual = [
      capabilities.includes("manage_operational_settings"),
      capabilities.includes("view_payments"),
      capabilities.includes("take_payments"),
      capabilities.includes("void_payments"),
    ];
    assert(actual.every((value, index) => value === expected[index]), `${name}: capability mismatch`);
  }
  assert(
    requireData(
      await actors.get("outsider").client.rpc("get_my_business_operational_contexts"),
      "outsider contexts",
    ).length === 0,
    "outsider received operational context",
  );

  const configured = requireData(await actors.get("admin").client.rpc(
    "configure_establishment_payment_method",
    {
      target_establishment_id: unitAId,
      target_method_type: "cash",
      target_display_name: "Dinheiro",
      target_active: true,
      target_requires_reference: false,
      target_expected_version: null,
      target_request_id: randomUUID(),
    },
  ), "configure cash method");
  const paymentMethodId = configured.paymentMethodId;
  assert(paymentMethodId, "configured payment method missing");

  for (const name of ["owner", "admin", "cashier", "finance", "professional"]) {
    const methods = requireData(await actors.get(name).client.rpc(
      "list_establishment_payment_methods",
      { target_establishment_id: unitAId },
    ), `list payment methods ${name}`);
    assert(methods.methods.length === 1, `${name}: payment method read mismatch`);
  }
  await expectRpcError(
    actors.get("outsider").client,
    "list_establishment_payment_methods",
    { target_establishment_id: unitAId },
    "forbidden",
  );
  await expectRpcError(
    actors.get("other_unit").client,
    "list_establishment_payment_methods",
    { target_establishment_id: unitAId },
    "forbidden",
  );
  await expectRpcError(
    actors.get("other_unit").client,
    "list_establishment_payment_methods",
    { target_establishment_id: unitBId },
    "financial_ops_disabled",
  );

  const initialOrder = requireData(await admin.from("service_orders")
    .select("version").eq("id", orderId).single(), "read initial order version");
  const deniedPaymentArgs = {
    target_establishment_id: unitAId,
    target_service_order_id: orderId,
    target_payment_method_id: paymentMethodId,
    target_amount_cents: 4_000,
    target_external_reference: null,
    target_expected_version: initialOrder.version,
    target_request_id: randomUUID(),
  };
  await expectRpcError(
    actors.get("finance").client,
    "record_order_payment",
    deniedPaymentArgs,
    "forbidden",
  );
  await expectRpcError(
    actors.get("professional").client,
    "record_order_payment",
    { ...deniedPaymentArgs, target_request_id: randomUUID() },
    "forbidden",
  );

  const paymentRequestId = randomUUID();
  const paymentArgs = {
    ...deniedPaymentArgs,
    target_request_id: paymentRequestId,
  };
  const payment = requireData(
    await actors.get("cashier").client.rpc("record_order_payment", paymentArgs),
    "record partial payment",
  );
  const replay = requireData(
    await actors.get("cashier").client.rpc("record_order_payment", paymentArgs),
    "replay partial payment",
  );
  assert(
    payment.paymentStatus === "partially_paid"
      && payment.paidCents === 4_000
      && payment.balanceCents === 6_000,
    "partial payment summary mismatch",
  );
  assert(JSON.stringify(replay) === JSON.stringify(payment), "payment replay changed response");
  const countedEntries = await admin.from("order_payment_entries")
    .select("id", { count: "exact", head: true }).eq("service_order_id", orderId);
  if (countedEntries.error) throw new Error(`count payment entries: ${countedEntries.error.message}`);
  assert(countedEntries.count === 1, "payment replay duplicated ledger entry");

  const voidArgs = {
    target_establishment_id: unitAId,
    target_service_order_id: orderId,
    target_payment_entry_id: payment.paymentEntryId,
    target_reason: "Validação técnica G7",
    target_expected_version: payment.version,
    target_request_id: randomUUID(),
  };
  await expectRpcError(
    actors.get("cashier").client,
    "void_order_payment",
    voidArgs,
    "aal2_required",
  );
  const enrollment = requireData(
    await actors.get("cashier").client.auth.mfa.enroll({ factorType: "totp" }),
    "enroll cashier TOTP",
  );
  const verification = requireData(
    await actors.get("cashier").client.auth.mfa.challengeAndVerify({
      factorId: enrollment.id,
      code: generateTotp(enrollment.totp.secret, await getRemoteAuthTimestamp()),
    }),
    "verify cashier TOTP",
  );
  assert(decodeJwtPayload(verification.access_token).aal === "aal2", "cashier JWT did not reach aal2");
  const voided = requireData(
    await actors.get("cashier").client.rpc("void_order_payment", voidArgs),
    "void payment with aal2",
  );
  assert(
    voided.paymentStatus === "unpaid" && voided.balanceCents === 10_000,
    "void compensation mismatch",
  );

  const settled = requireData(await actors.get("cashier").client.rpc(
    "record_order_payment",
    {
      target_establishment_id: unitAId,
      target_service_order_id: orderId,
      target_payment_method_id: paymentMethodId,
      target_amount_cents: 10_000,
      target_external_reference: null,
      target_expected_version: voided.version,
      target_request_id: randomUUID(),
    },
  ), "settle service order");
  assert(settled.paymentStatus === "paid" && settled.balanceCents === 0, "settlement mismatch");
  const closed = requireData(await actors.get("professional").client.rpc(
    "close_service_order",
    {
      target_establishment_id: unitAId,
      target_service_order_id: orderId,
      target_expected_version: settled.version,
      target_request_id: randomUUID(),
    },
  ), "close paid service order");
  assert(closed.status === "closed", "paid service order did not close");

  const summary = requireData(await actors.get("finance").client.rpc(
    "get_service_order_payment_summary",
    { target_establishment_id: unitAId, target_service_order_id: orderId },
  ), "finance payment summary");
  assert(
    summary.paymentStatus === "paid" && summary.entries.length === 3,
    "ledger reconstruction mismatch",
  );

  const directLedgerRead = await actors.get("admin").client
    .from("order_payment_entries").select("id").limit(1);
  assert(directLedgerRead.error, "authenticated app read protected POS ledger directly");
  const unauthenticated = actorClient();
  const anonymousRpc = await unauthenticated.rpc("list_establishment_payment_methods", {
    target_establishment_id: unitAId,
  });
  assert(anonymousRpc.error, "anonymous role executed protected POS RPC");

  console.log(JSON.stringify({
    gate: "G7",
    environment: "Homolog",
    projectRef,
    authentication: "real-jwt-password-session",
    aal2: "real-totp-challenge-and-verify",
    rolesValidated: ["owner", "admin", "cashier", "finance", "professional", "outsider"],
    checks: {
      roleCapabilityMatrix: "passed",
      outsiderAndCrossUnitDenied: "passed",
      financialOpsFlagFailClosed: "passed",
      partialPaymentAndReplay: "passed",
      financeAndProfessionalPaymentDenied: "passed",
      aal1VoidDenied: "passed",
      aal2VoidAllowed: "passed",
      compensatingLedgerAndReconstruction: "passed",
      zeroBalanceClose: "passed",
      protectedTablesDenied: "passed",
      androidOfflineReplay: "pending-real-device",
    },
  }, null, 2));
} catch (error) {
  executionError = error;
} finally {
  try {
    await cleanup();
    console.log("FIXTURE_CLEANUP=PASS");
  } catch (cleanupError) {
    if (!executionError) executionError = cleanupError;
    else console.error(`FIXTURE_CLEANUP=FAIL:${cleanupError.message}`);
  }
}

if (executionError) throw executionError;
