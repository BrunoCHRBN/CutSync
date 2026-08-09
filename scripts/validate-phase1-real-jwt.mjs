import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { execFileSync, execSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { createClient } from '@supabase/supabase-js';

const getLocalSupabaseConfig = () => {
  const configured = {
    url: process.env.CUTSYNC_LOCAL_SUPABASE_URL,
    anonKey: process.env.CUTSYNC_LOCAL_SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.CUTSYNC_LOCAL_SUPABASE_SERVICE_ROLE_KEY,
  };
  if (configured.url && configured.anonKey && configured.serviceRoleKey) return configured;

  const options = {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  };
  const output = process.platform === 'win32'
    ? execSync('npx supabase status -o json', options)
    : execFileSync('npx', ['supabase', 'status', '-o', 'json'], options);
  const status = JSON.parse(output);
  return {
    url: status.API_URL,
    anonKey: status.ANON_KEY,
    serviceRoleKey: status.SERVICE_ROLE_KEY,
  };
};

const config = getLocalSupabaseConfig();
const target = new URL(config.url);
if (!['127.0.0.1', 'localhost'].includes(target.hostname)) {
  throw new Error('phase1_real_jwt_validation_requires_local_supabase');
}
if (!config.anonKey || !config.serviceRoleKey) {
  throw new Error('local_supabase_credentials_unavailable');
}

const admin = createClient(config.url, config.serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const runLocalSql = (sql) => execFileSync(
  'docker',
  ['exec', '-i', 'supabase_db_CutSync', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'],
  { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
);
const sqlLiteral = (value) => `'${String(value).replaceAll("'", "''")}'`;
const createActorClient = () => createClient(config.url, config.anonKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const requireData = (result, operation) => {
  if (result.error) throw new Error(`${operation}: ${result.error.message}`);
  return result.data;
};
const expectRpcError = async (client, name, args, expected) => {
  const result = await client.rpc(name, args);
  assert(result.error?.message.includes(expected), `${name}: expected ${expected}, got ${result.error?.message ?? 'success'}`);
};
const decodeJwtPayload = (token) => {
  const payload = token.split('.')[1];
  assert(payload, 'invalid_access_token');
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
};

const decodeBase32 = (value) => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const character of value.toUpperCase().replace(/=+$/u, '')) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error('invalid_totp_secret');
    bits += index.toString(2).padStart(5, '0');
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
  const digest = createHmac('sha1', decodeBase32(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, '0');
};

const runId = randomUUID().slice(0, 8);
const password = `${randomBytes(24).toString('base64url')}aA1!`;
const actorDefinitions = [
  ['owner', 'admin'],
  ['admin', 'admin'],
  ['professional', 'professional'],
  ['reception', 'reception'],
  ['cashier', 'cashier'],
  ['finance', 'finance'],
  ['manager', 'manager'],
  ['outsider', null],
  ['other_unit', 'professional'],
];
const actors = new Map();
const createdUserIds = [];
let unitAId;
let unitBId;
let organizationId;

const cleanup = async () => {
  if (organizationId || unitAId || unitBId) {
    const organizationFilter = organizationId ? `id = ${sqlLiteral(organizationId)}::uuid` : 'false';
    const unitIds = [unitAId, unitBId].filter(Boolean).map((id) => `${sqlLiteral(id)}::uuid`).join(', ');
    runLocalSql(`
      BEGIN;
      DELETE FROM public.organizations WHERE ${organizationFilter};
      DELETE FROM public.billing_coverage_assignments
      WHERE establishment_id IN (${unitIds || 'NULL'});
      DELETE FROM public.billing_subscriptions
      WHERE billing_account_id IN (
        SELECT id FROM public.billing_accounts
        WHERE establishment_id IN (${unitIds || 'NULL'})
      );
      DELETE FROM public.billing_invoices
      WHERE billing_account_id IN (
        SELECT id FROM public.billing_accounts
        WHERE establishment_id IN (${unitIds || 'NULL'})
      );
      DELETE FROM public.billing_accounts
      WHERE establishment_id IN (${unitIds || 'NULL'});
      DELETE FROM public.approval_requests
      WHERE establishment_id IN (${unitIds || 'NULL'});
      DELETE FROM public.authorization_audit_log
      WHERE establishment_id IN (${unitIds || 'NULL'});
      DELETE FROM public.user_app_context_events
      WHERE establishment_id IN (${unitIds || 'NULL'});
      DELETE FROM public.establishments WHERE id IN (${unitIds || 'NULL'});
      COMMIT;
    `);
  }
  for (const userId of createdUserIds) {
    await admin.auth.admin.deleteUser(userId);
  }
};

try {
  for (const [roleTemplate] of actorDefinitions) {
    const email = `phase1-gate-${runId}-${roleTemplate}@example.test`;
    const created = requireData(await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: `Phase 1 ${roleTemplate}` },
    }), `create ${roleTemplate}`);
    createdUserIds.push(created.user.id);
    actors.set(roleTemplate, { id: created.user.id, email });
  }

  const units = requireData(await admin.from('establishments').insert([
    {
      name: `Phase 1 Gate A ${runId}`,
      slug: `phase1-gate-a-${runId}`,
      account_status: 'active',
      timezone: 'America/Sao_Paulo',
      share_agendas: false,
    },
    {
      name: `Phase 1 Gate B ${runId}`,
      slug: `phase1-gate-b-${runId}`,
      account_status: 'active',
      timezone: 'America/Sao_Paulo',
      share_agendas: false,
    },
  ]).select('id, slug'), 'create establishments');
  unitAId = units.find((unit) => unit.slug.includes('-a-')).id;
  unitBId = units.find((unit) => unit.slug.includes('-b-')).id;

  const memberships = [];
  for (const [roleTemplate, template] of actorDefinitions) {
    if (!template || roleTemplate === 'other_unit') continue;
    memberships.push({
      id: randomUUID(),
      profile_id: actors.get(roleTemplate).id,
      establishment_id: unitAId,
      role: template === 'admin' ? 'admin' : 'professional',
      role_template: template,
      status: 'active',
      created_by: actors.get('owner').id,
    });
  }
  memberships.push({
    id: randomUUID(),
    profile_id: actors.get('other_unit').id,
    establishment_id: unitBId,
    role: 'professional',
    role_template: 'professional',
    status: 'active',
    created_by: actors.get('owner').id,
  });
  organizationId = randomUUID();
  runLocalSql(`
    BEGIN;
    ${memberships.map((membership) => `
      INSERT INTO public.memberships(
        id, profile_id, establishment_id, role, role_template, status, created_by
      ) VALUES (
        ${sqlLiteral(membership.id)}::uuid,
        ${sqlLiteral(membership.profile_id)}::uuid,
        ${sqlLiteral(membership.establishment_id)}::uuid,
        ${sqlLiteral(membership.role)},
        ${sqlLiteral(membership.role_template)},
        'active',
        ${sqlLiteral(membership.created_by)}::uuid
      );
    `).join('\n')}
    INSERT INTO public.organizations(id, name, status, created_by)
    VALUES (
      ${sqlLiteral(organizationId)}::uuid,
      ${sqlLiteral(`Phase 1 Gate Organization ${runId}`)},
      'active',
      ${sqlLiteral(actors.get('owner').id)}::uuid
    );
    INSERT INTO public.organization_members(
      organization_id, profile_id, role, status, created_by
    ) VALUES (
      ${sqlLiteral(organizationId)}::uuid,
      ${sqlLiteral(actors.get('owner').id)}::uuid,
      'owner',
      'active',
      ${sqlLiteral(actors.get('owner').id)}::uuid
    );
    INSERT INTO public.organization_establishments(
      organization_id, establishment_id, status, linked_by
    ) VALUES (
      ${sqlLiteral(organizationId)}::uuid,
      ${sqlLiteral(unitAId)}::uuid,
      'active',
      ${sqlLiteral(actors.get('owner').id)}::uuid
    );
    COMMIT;
  `);

  for (const [roleTemplate] of actorDefinitions) {
    const actor = actors.get(roleTemplate);
    actor.client = createActorClient();
    const signedIn = requireData(await actor.client.auth.signInWithPassword({
      email: actor.email,
      password,
    }), `sign in ${roleTemplate}`);
    const claims = decodeJwtPayload(signedIn.session.access_token);
    assert(claims.sub === actor.id && claims.role === 'authenticated', `${roleTemplate}: JWT identity mismatch`);
    assert(claims.aal === 'aal1', `${roleTemplate}: expected initial aal1 JWT`);
  }

  const expectedRoles = new Map([
    ['owner', 'owner'],
    ['admin', 'admin'],
    ['professional', 'professional'],
    ['reception', 'reception'],
    ['cashier', 'cashier'],
    ['finance', 'finance'],
    ['manager', 'manager'],
  ]);
  for (const [actorName, expectedRole] of expectedRoles) {
    const actor = actors.get(actorName);
    const contexts = requireData(await actor.client.rpc('get_my_authorized_contexts', {
      target_app_id: 'web',
    }), `${actorName} authorized contexts`);
    const unitContext = contexts.find((context) => context.contextKind === 'establishment');
    assert(unitContext?.establishmentId === unitAId, `${actorName}: establishment context mismatch`);
    assert(unitContext.roleTemplate === (actorName === 'owner' ? 'admin' : actorName), `${actorName}: role template mismatch`);

    const operational = requireData(
      await actor.client.rpc('get_my_business_operational_contexts'),
      `${actorName} operational context`,
    );
    assert(operational.length === 1, `${actorName}: expected one operational context`);
    assert(operational[0].operational_role === expectedRole, `${actorName}: operational role mismatch`);
  }

  const outsiderContexts = requireData(await actors.get('outsider').client.rpc('get_my_authorized_contexts', {
    target_app_id: 'web',
  }), 'outsider contexts');
  assert(outsiderContexts.length === 1 && outsiderContexts[0].contextKind === 'personal', 'outsider received operational authority');
  assert(requireData(await actors.get('outsider').client.rpc('get_my_business_operational_contexts'), 'outsider operational context').length === 0, 'outsider received Business context');

  const otherUnitContexts = requireData(await actors.get('other_unit').client.rpc('get_my_authorized_contexts', {
    target_app_id: 'business',
  }), 'other unit contexts');
  assert(otherUnitContexts.length === 1 && otherUnitContexts[0].establishmentId === unitBId, 'cross-unit context leaked');
  await expectRpcError(actors.get('other_unit').client, 'set_my_active_context', {
    target_app_id: 'business',
    target_context_kind: 'establishment',
    target_establishment_id: unitAId,
    target_organization_id: null,
    target_request_id: randomUUID(),
  }, 'context_not_authorized');

  const manager = actors.get('manager');
  requireData(await manager.client.rpc('set_my_active_context', {
    target_app_id: 'business',
    target_context_kind: 'establishment',
    target_establishment_id: unitAId,
    target_organization_id: null,
    target_request_id: randomUUID(),
  }), 'set manager active context');
  const managerMembership = memberships.find((membership) => membership.profile_id === manager.id);
  runLocalSql(`
    UPDATE public.memberships
    SET status = 'revoked', revoked_at = now()
    WHERE id = ${sqlLiteral(managerMembership.id)}::uuid;
  `);
  await expectRpcError(manager.client, 'set_my_active_context', {
    target_app_id: 'business',
    target_context_kind: 'establishment',
    target_establishment_id: unitAId,
    target_organization_id: null,
    target_request_id: randomUUID(),
  }, 'context_not_authorized');
  assert(requireData(await manager.client.rpc('get_my_business_operational_contexts'), 'revoked manager context').length === 0, 'revoked manager retained authority');

  const adminActor = actors.get('admin');
  const targetMembership = memberships.find((membership) => membership.profile_id === actors.get('professional').id);
  const sensitiveArgs = {
    target_establishment_id: unitAId,
    target_membership_id: targetMembership.id,
    target_capability: 'manage_services',
    target_effect: 'grant',
    target_justification: 'Validação local reproduzível do Gate F1.',
    target_request_id: randomUUID(),
  };
  await expectRpcError(adminActor.client, 'request_capability_override_approval', sensitiveArgs, 'aal2_required');

  const enrollment = requireData(await adminActor.client.auth.mfa.enroll({ factorType: 'totp' }), 'enroll TOTP');
  const verification = requireData(await adminActor.client.auth.mfa.challengeAndVerify({
    factorId: enrollment.id,
    code: generateTotp(enrollment.totp.secret),
  }), 'verify TOTP');
  const elevatedClaims = decodeJwtPayload(verification.access_token);
  assert(elevatedClaims.aal === 'aal2', 'TOTP did not issue an aal2 JWT');
  const assurance = requireData(await adminActor.client.auth.mfa.getAuthenticatorAssuranceLevel(), 'read assurance level');
  assert(assurance.currentLevel === 'aal2', 'Supabase session did not reach aal2');

  const approval = requireData(
    await adminActor.client.rpc('request_capability_override_approval', sensitiveArgs),
    'request sensitive override with aal2',
  );
  assert(approval.status === 'pending' && approval.replayed === false, 'sensitive action did not create approval request');

  console.log(JSON.stringify({
    gate: 'F1',
    environment: 'local-supabase',
    authentication: 'real-jwt-password-session',
    aal2: 'real-totp-challenge-and-verify',
    rolesValidated: [...expectedRoles.keys(), 'outsider'],
    checks: {
      authorizedContexts: 'passed',
      operationalRoleProjection: 'passed',
      crossUnitIsolation: 'passed',
      immediateRevocation: 'passed',
      sensitiveActionAal1Denied: 'passed',
      sensitiveActionAal2Allowed: 'passed',
    },
  }, null, 2));
} finally {
  await cleanup();
}
