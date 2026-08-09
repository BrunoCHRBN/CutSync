import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { execFileSync, execSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { createClient } from "@supabase/supabase-js";

const getLocalSupabaseConfig = () => {
  const configured = {
    url: process.env.CUTSYNC_LOCAL_SUPABASE_URL,
    anonKey: process.env.CUTSYNC_LOCAL_SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.CUTSYNC_LOCAL_SUPABASE_SERVICE_ROLE_KEY,
  };
  if (configured.url && configured.anonKey && configured.serviceRoleKey)
    return configured;
  const options = {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  };
  const output =
    process.platform === "win32"
      ? execSync("npx supabase status -o json", options)
      : execFileSync("npx", ["supabase", "status", "-o", "json"], options);
  const status = JSON.parse(output);
  return {
    url: status.API_URL,
    anonKey: status.ANON_KEY,
    serviceRoleKey: status.SERVICE_ROLE_KEY,
  };
};

const config = getLocalSupabaseConfig();
const target = new URL(config.url);
if (!["127.0.0.1", "localhost"].includes(target.hostname)) {
  throw new Error("phase2_real_jwt_validation_requires_local_supabase");
}
if (!config.anonKey || !config.serviceRoleKey) {
  throw new Error("local_supabase_credentials_unavailable");
}

const admin = createClient(config.url, config.serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const actorClient = () =>
  createClient(config.url, config.anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
const runLocalSql = (sql) =>
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_CutSync",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
    ],
    { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
const sqlLiteral = (value) => `'${String(value).replaceAll("'", "''")}'`;
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
  const payload = token.split(".")[1];
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
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(Math.floor(timestamp / 30_000)));
  const digest = createHmac("sha1", decodeBase32(secret))
    .update(counterBuffer)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, "0");
};
const elevateAal2 = async (actor, label) => {
  const enrollment = requireData(
    await actor.client.auth.mfa.enroll({ factorType: "totp" }),
    `${label} enroll TOTP`,
  );
  const verification = requireData(
    await actor.client.auth.mfa.challengeAndVerify({
      factorId: enrollment.id,
      code: generateTotp(enrollment.totp.secret),
    }),
    `${label} verify TOTP`,
  );
  assert(
    decodeJwtPayload(verification.access_token).aal === "aal2",
    `${label}: aal2 JWT not issued`,
  );
};

const runId = randomUUID().slice(0, 8);
const password = `${randomBytes(24).toString("base64url")}aA1!`;
const unitAId = randomUUID();
const unitBId = randomUUID();
const organizationId = randomUUID();
const serviceId = randomUUID();
const appointmentAId = randomUUID();
const appointmentBId = randomUUID();
const completedAppointmentId = randomUUID();
const actors = new Map();
const createdUserIds = [];
const definitions = [
  "owner",
  "admin",
  "manager",
  "professional",
  "replacement",
  "customer",
  "outsider",
  "other_unit",
];
const allDays = Array.from({ length: 7 }, (_, day) => ({
  day,
  isOpen: true,
  open: "09:00",
  close: "18:00",
}));

const cleanup = async () => {
  runLocalSql(`
      BEGIN;
      ALTER TABLE public.appointment_assignment_shadow_issues
        DISABLE TRIGGER appointment_assignment_shadow_issues_immutable;
      ALTER TABLE public.appointment_assignment_shadow_runs
        DISABLE TRIGGER appointment_assignment_shadow_runs_immutable;
      ALTER TABLE public.appointment_assignment_events
        DISABLE TRIGGER appointment_assignment_events_immutable;
      ALTER TABLE public.appointment_events
        DISABLE TRIGGER appointment_events_immutable;
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
      DELETE FROM public.customer_change_decisions
      WHERE appointment_id IN (
        ${sqlLiteral(appointmentAId)}, ${sqlLiteral(appointmentBId)}, ${sqlLiteral(completedAppointmentId)}
      );
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
      DELETE FROM public.approval_requests
      WHERE establishment_id IN (${sqlLiteral(unitAId)}::uuid, ${sqlLiteral(unitBId)}::uuid);
      DELETE FROM public.authorization_audit_log
      WHERE establishment_id IN (${sqlLiteral(unitAId)}::uuid, ${sqlLiteral(unitBId)}::uuid);
      DELETE FROM public.appointments
      WHERE establishment_id IN (${sqlLiteral(unitAId)}::uuid, ${sqlLiteral(unitBId)}::uuid);
      DELETE FROM public.professional_services
      WHERE establishment_id IN (${sqlLiteral(unitAId)}::uuid, ${sqlLiteral(unitBId)}::uuid);
      DELETE FROM public.services
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
      DELETE FROM public.organizations WHERE id = ${sqlLiteral(organizationId)}::uuid;
      DELETE FROM public.memberships
      WHERE establishment_id IN (${sqlLiteral(unitAId)}::uuid, ${sqlLiteral(unitBId)}::uuid);
      DELETE FROM public.establishments
      WHERE id IN (${sqlLiteral(unitAId)}::uuid, ${sqlLiteral(unitBId)}::uuid);
      COMMIT;
    `);
  for (const userId of createdUserIds) {
    requireData(
      await admin.auth.admin.deleteUser(userId),
      `cleanup user ${userId}`,
    );
  }
};

try {
  for (const name of definitions) {
    const email = `phase2-g13-${runId}-${name}@example.test`;
    const created = requireData(
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name: `Phase 2 ${name}` },
      }),
      `create ${name}`,
    );
    createdUserIds.push(created.user.id);
    actors.set(name, { id: created.user.id, email, client: actorClient() });
  }

  requireData(
    await admin.from("establishments").insert([
      {
        id: unitAId,
        name: `Phase 2 Gate A ${runId}`,
        slug: `phase2-gate-a-${runId}`,
        account_status: "active",
        timezone: "America/Sao_Paulo",
        share_agendas: false,
        opening_hours: JSON.stringify(allDays),
      },
      {
        id: unitBId,
        name: `Phase 2 Gate B ${runId}`,
        slug: `phase2-gate-b-${runId}`,
        account_status: "active",
        timezone: "America/Sao_Paulo",
        share_agendas: false,
        opening_hours: JSON.stringify(allDays),
      },
    ]),
    "create phase2 establishments",
  );

  const owner = actors.get("owner");
  const memberships = [
    [owner.id, unitAId, "admin"],
    [actors.get("admin").id, unitAId, "admin"],
    [actors.get("manager").id, unitAId, "manager"],
    [actors.get("professional").id, unitAId, "professional"],
    [actors.get("replacement").id, unitAId, "professional"],
    [actors.get("other_unit").id, unitBId, "professional"],
  ].map(([profileId, establishmentId, template]) => ({
    id: randomUUID(),
    profileId,
    establishmentId,
    template,
  }));
  const managerMembership = memberships.find(
    ({ profileId }) => profileId === actors.get("manager").id,
  );
  runLocalSql(`
    BEGIN;
    ${memberships
      .map(
        (membership) => `
      INSERT INTO public.memberships(
        id, profile_id, establishment_id, role, role_template, status, created_by
      ) VALUES (
        ${sqlLiteral(membership.id)}::uuid,
        ${sqlLiteral(membership.profileId)}::uuid,
        ${sqlLiteral(membership.establishmentId)}::uuid,
        ${sqlLiteral(membership.template === "admin" ? "admin" : "professional")},
        ${sqlLiteral(membership.template)}, 'active', ${sqlLiteral(owner.id)}::uuid
      );
    `,
      )
      .join("\n")}
    INSERT INTO public.organizations(id, name, status, created_by)
    VALUES (
      ${sqlLiteral(organizationId)}::uuid,
      ${sqlLiteral(`Phase 2 Gate Organization ${runId}`)}, 'active',
      ${sqlLiteral(owner.id)}::uuid
    );
    INSERT INTO public.organization_members(
      organization_id, profile_id, role, status, created_by
    ) VALUES (
      ${sqlLiteral(organizationId)}::uuid, ${sqlLiteral(owner.id)}::uuid,
      'owner', 'active', ${sqlLiteral(owner.id)}::uuid
    );
    INSERT INTO public.organization_establishments(
      organization_id, establishment_id, status, linked_by
    ) VALUES (
      ${sqlLiteral(organizationId)}::uuid, ${sqlLiteral(unitAId)}::uuid,
      'active', ${sqlLiteral(owner.id)}::uuid
    );
    UPDATE public.establishments
    SET appointment_reassignment_enabled = true
    WHERE id = ${sqlLiteral(unitAId)}::uuid;
    UPDATE public.profiles
    SET work_hours = ${sqlLiteral(JSON.stringify(allDays))}
    WHERE id IN (
      ${sqlLiteral(actors.get("professional").id)}::uuid,
      ${sqlLiteral(actors.get("replacement").id)}::uuid
    );
    INSERT INTO public.services(
      id, establishment_id, name, price, duration_minutes, is_active
    ) VALUES (
      ${sqlLiteral(serviceId)}, ${sqlLiteral(unitAId)}::uuid,
      'Phase 2 JWT Service', 50, 30, true
    );
    INSERT INTO public.professional_services(
      establishment_id, professional_id, service_id, price,
      duration_minutes, is_active
    ) VALUES
      (${sqlLiteral(unitAId)}::uuid, ${sqlLiteral(actors.get("professional").id)}::uuid,
        ${sqlLiteral(serviceId)}, 50, 30, true),
      (${sqlLiteral(unitAId)}::uuid, ${sqlLiteral(actors.get("replacement").id)}::uuid,
        ${sqlLiteral(serviceId)}, 50, 30, true);
    COMMIT;
  `);

  const startA = new Date(Date.now() + 2 * 86_400_000);
  startA.setUTCHours(15, 0, 0, 0);
  const startB = new Date(startA.getTime() + 2 * 3_600_000);
  const completedStart = new Date(Date.now() - 2 * 3_600_000);
  const appointmentUpdatedAt = new Date().toISOString();
  runLocalSql(`
    INSERT INTO public.appointments(
      id, establishment_id, client_id, professional_id, service_id,
      date_time, ends_at, duration_minutes, status, price_charged, updated_at
    ) VALUES
      (
        ${sqlLiteral(appointmentAId)}, ${sqlLiteral(unitAId)}::uuid,
        ${sqlLiteral(actors.get("customer").id)}::uuid,
        ${sqlLiteral(actors.get("professional").id)}::uuid,
        ${sqlLiteral(serviceId)}, ${sqlLiteral(startA.toISOString())}::timestamptz,
        ${sqlLiteral(new Date(startA.getTime() + 1_800_000).toISOString())}::timestamptz,
        30, 'confirmed', 50, ${sqlLiteral(appointmentUpdatedAt)}::timestamptz
      ),
      (
        ${sqlLiteral(appointmentBId)}, ${sqlLiteral(unitAId)}::uuid,
        ${sqlLiteral(actors.get("customer").id)}::uuid,
        ${sqlLiteral(actors.get("professional").id)}::uuid,
        ${sqlLiteral(serviceId)}, ${sqlLiteral(startB.toISOString())}::timestamptz,
        ${sqlLiteral(new Date(startB.getTime() + 1_800_000).toISOString())}::timestamptz,
        30, 'confirmed', 50, ${sqlLiteral(appointmentUpdatedAt)}::timestamptz
      ),
      (
        ${sqlLiteral(completedAppointmentId)}, ${sqlLiteral(unitAId)}::uuid,
        ${sqlLiteral(actors.get("customer").id)}::uuid,
        ${sqlLiteral(actors.get("professional").id)}::uuid,
        ${sqlLiteral(serviceId)}, ${sqlLiteral(completedStart.toISOString())}::timestamptz,
        ${sqlLiteral(new Date(completedStart.getTime() + 1_800_000).toISOString())}::timestamptz,
        30, 'completed', 50, ${sqlLiteral(appointmentUpdatedAt)}::timestamptz
      );
  `);
  const appointments = new Map([
    [
      appointmentAId,
      {
        id: appointmentAId,
        updated_at: appointmentUpdatedAt,
        date_time: startA.toISOString(),
      },
    ],
    [
      appointmentBId,
      {
        id: appointmentBId,
        updated_at: appointmentUpdatedAt,
        date_time: startB.toISOString(),
      },
    ],
    [
      completedAppointmentId,
      {
        id: completedAppointmentId,
        updated_at: appointmentUpdatedAt,
        date_time: completedStart.toISOString(),
      },
    ],
  ]);

  for (const actor of actors.values()) {
    const signedIn = requireData(
      await actor.client.auth.signInWithPassword({
        email: actor.email,
        password,
      }),
      `sign in ${actor.email}`,
    );
    const claims = decodeJwtPayload(signedIn.session.access_token);
    assert(
      claims.sub === actor.id && claims.role === "authenticated",
      "real JWT identity mismatch",
    );
    assert(claims.aal === "aal1", "actor did not start at aal1");
  }

  const requestArgs = (appointmentId) => {
    const appointment = appointments.get(appointmentId);
    return {
      target_appointment_id: appointmentId,
      target_reason_code: "professional_absence",
      target_responsibility: "professional",
      target_due_at: new Date(
        new Date(appointment.date_time).getTime() - 3_600_000,
      ).toISOString(),
      target_expected_appointment_updated_at: appointment.updated_at,
      target_request_id: randomUUID(),
      target_correlation_id: randomUUID(),
    };
  };

  await expectRpcError(
    actors.get("outsider").client,
    "request_appointment_reassignment",
    requestArgs(appointmentAId),
    "forbidden",
  );
  await expectRpcError(
    actors.get("other_unit").client,
    "request_appointment_reassignment",
    requestArgs(appointmentAId),
    "forbidden",
  );

  const professional = actors.get("professional");
  const manager = actors.get("manager");
  const adminActor = actors.get("admin");
  const customer = actors.get("customer");
  const replacement = actors.get("replacement");
  const createWorkflow = async (appointmentId) => {
    const requested = requireData(
      await professional.client.rpc(
        "request_appointment_reassignment",
        requestArgs(appointmentId),
      ),
      `request reassignment ${appointmentId}`,
    );
    requireData(
      await professional.client.rpc("validate_appointment_reassignment", {
        target_reassignment_request_id: requested.reassignmentRequestId,
        target_expected_version: 1,
        target_request_id: randomUUID(),
      }),
      `validate reassignment ${appointmentId}`,
    );
    const proposed = requireData(
      await manager.client.rpc("propose_appointment_reassignment", {
        target_reassignment_request_id: requested.reassignmentRequestId,
        target_proposed_professional_id: replacement.id,
        target_expected_version: 2,
        target_request_id: randomUUID(),
      }),
      `propose reassignment ${appointmentId}`,
    );
    assert(
      proposed.status === "awaiting_customer",
      "specific preference bypassed customer",
    );
    requireData(
      await customer.client.rpc("decide_appointment_reassignment", {
        target_reassignment_request_id: requested.reassignmentRequestId,
        target_decision: "accept_replacement",
        target_chosen_professional_id: null,
        target_channel: "client_app",
        target_reason: null,
        target_expected_version: 3,
        target_request_id: randomUUID(),
      }),
      `accept reassignment ${appointmentId}`,
    );
    return requested.reassignmentRequestId;
  };

  const firstWorkflowId = await createWorkflow(appointmentAId);
  await expectRpcError(
    actors.get("other_unit").client,
    "apply_appointment_reassignment",
    {
      target_reassignment_request_id: firstWorkflowId,
      target_expected_version: 4,
      target_request_id: randomUUID(),
    },
    "forbidden",
  );
  const firstApplied = requireData(
    await manager.client.rpc("apply_appointment_reassignment", {
      target_reassignment_request_id: firstWorkflowId,
      target_expected_version: 4,
      target_request_id: randomUUID(),
    }),
    "apply first reassignment",
  );
  assert(
    firstApplied.professionalId === replacement.id,
    "first reassignment projection mismatch",
  );

  const secondWorkflowId = await createWorkflow(appointmentBId);
  runLocalSql(`
    UPDATE public.memberships
    SET status = 'revoked', revoked_at = now()
    WHERE id = ${sqlLiteral(managerMembership.id)}::uuid;
  `);
  await expectRpcError(
    manager.client,
    "apply_appointment_reassignment",
    {
      target_reassignment_request_id: secondWorkflowId,
      target_expected_version: 4,
      target_request_id: randomUUID(),
    },
    "forbidden",
  );
  const secondApplied = requireData(
    await adminActor.client.rpc("apply_appointment_reassignment", {
      target_reassignment_request_id: secondWorkflowId,
      target_expected_version: 4,
      target_request_id: randomUUID(),
    }),
    "apply after manager revocation",
  );
  assert(
    secondApplied.professionalId === replacement.id,
    "admin did not recover revoked workflow",
  );

  const correctionArgs = {
    target_appointment_id: completedAppointmentId,
    target_proposed_professional_id: replacement.id,
    target_reason: "Correção factual validada no fluxo JWT real da Fase 2.",
    target_request_id: randomUUID(),
  };
  await expectRpcError(
    adminActor.client,
    "request_appointment_assignment_correction_approval",
    correctionArgs,
    "aal2_required",
  );
  await elevateAal2(adminActor, "admin");
  await elevateAal2(owner, "owner");
  const approval = requireData(
    await adminActor.client.rpc(
      "request_appointment_assignment_correction_approval",
      correctionArgs,
    ),
    "request correction approval with aal2",
  );
  const approved = requireData(
    await owner.client.rpc(
      "decide_appointment_assignment_correction_approval",
      {
        target_approval_request_id: approval.approvalRequestId,
        target_expected_version: 1,
        target_decision: "approved",
        target_reason:
          "Owner confirmou evidências e separação de responsabilidade.",
        target_request_id: randomUUID(),
      },
    ),
    "approve correction independently",
  );
  assert(approved.status === "approved", "owner did not approve correction");
  const corrected = requireData(
    await adminActor.client.rpc("correct_appointment_assignment", {
      target_appointment_id: completedAppointmentId,
      target_proposed_professional_id: replacement.id,
      target_approval_request_id: approval.approvalRequestId,
      target_expected_appointment_updated_at: appointments.get(
        completedAppointmentId,
      ).updated_at,
      target_reason:
        "Executor real corrigido após aprovação independente auditada.",
      target_request_id: randomUUID(),
      target_correlation_id: randomUUID(),
    }),
    "apply audited correction",
  );
  assert(
    corrected.professionalId === replacement.id,
    "audited correction projection mismatch",
  );

  await expectRpcError(
    professional.client,
    "reconcile_appointment_assignment_shadow",
    {
      target_establishment_id: unitAId,
      target_request_id: randomUUID(),
    },
    "forbidden",
  );
  const shadow = requireData(
    await adminActor.client.rpc("reconcile_appointment_assignment_shadow", {
      target_establishment_id: unitAId,
      target_request_id: randomUUID(),
    }),
    "reconcile assignment shadow",
  );
  assert(shadow.totalAppointments === 3, "shadow total does not cover fixture");
  assert(
    shadow.cutoverEligible === true,
    "matching JWT fixture was not cutover eligible",
  );

  const directRead = await adminActor.client
    .from("appointment_reassignment_requests")
    .select("id")
    .limit(1);
  assert(
    directRead.error,
    "authenticated app read a protected decision table directly",
  );

  console.log(
    JSON.stringify(
      {
        gate: "G13",
        environment: "local-supabase",
        authentication: "real-jwt-password-session",
        aal2: "real-totp-challenge-and-verify",
        checks: {
          outsiderDenied: "passed",
          crossUnitDenied: "passed",
          customerDecisionRequired: "passed",
          applyAfterCustomerAcceptance: "passed",
          immediateMembershipRevocation: "passed",
          correctionAal1Denied: "passed",
          correctionAal2ApprovalSeparation: "passed",
          shadowReconciliation: "passed",
          directTableAccessDenied: "passed",
        },
      },
      null,
      2,
    ),
  );
} finally {
  await cleanup();
}
