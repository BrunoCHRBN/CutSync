import { randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';

const container = process.env.SUPABASE_DB_CONTAINER ?? 'supabase_db_CutSync';
const ids = {
  owner: randomUUID(),
  target: randomUUID(),
  sameRequest: randomUUID(),
  winnerRequest: randomUUID(),
  loserRequest: randomUUID(),
  enableCreationRequest: randomUUID(),
  controlCreateRequest: randomUUID(),
  corporateCreateRequest: randomUUID(),
};

const psqlArgs = [
  'exec', '-i', container, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1',
  '-U', 'postgres', '-d', 'postgres',
];

const runPsql = (sql) => new Promise((resolve) => {
  const child = spawn('docker', psqlArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  child.on('close', (code) => resolve({ code, stdout, stderr }));
  child.stdin.end(sql);
});

const query = (sql) => execFileSync(
  'docker',
  [
    'exec', container, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1',
    '-U', 'postgres', '-d', 'postgres', '-c', sql,
  ],
  { encoding: 'utf8' },
).trim();

const jwtSetup = `
SELECT set_config('request.jwt.claim.sub', '${ids.owner}', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"${ids.owner}","role":"authenticated","aal":"aal2"}',
  false
);
`;

const setup = `
INSERT INTO auth.users(
  id, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at
)
VALUES
  (
    '${ids.owner}',
    'runtime-concurrency-${ids.owner}@example.test',
    '{"name":"Runtime Concurrency Owner"}'::jsonb,
    now(), now(), now()
  ),
  (
    '${ids.target}',
    'create-concurrency-${ids.target}@example.test',
    '{"name":"Concurrent Access Target"}'::jsonb,
    now(), now(), now()
  );

${jwtSetup}
SELECT set_config(
  'cutsync.governance_access_reason',
  'Fixture local de concorrência da administração de runtime',
  false
);

INSERT INTO public.governance_users(profile_id, role, granted_by)
VALUES
  ('${ids.owner}', 'SaaS_Owner', '${ids.owner}'),
  ('${ids.target}', 'SaaS_Viewer', '${ids.owner}');
`;

execFileSync('docker', psqlArgs, { input: setup, stdio: ['pipe', 'ignore', 'inherit'] });

const readState = () => {
  const [versionValue, enabledValue] = query(`
    SELECT version || '|' || enabled::text
    FROM public.corporate_case_runtime_settings
    WHERE singleton
  `).split('|');
  return { version: Number(versionValue), enabled: enabledValue === 'true' };
};

const mutationSql = ({ enabled, expectedVersion, reason, requestId }) => `
SELECT public.set_corporate_case_runtime_settings(
  ${enabled}, false, false, false, false, false,
  ${expectedVersion},
  '${reason}',
  '${requestId}'
);
`;

const waitForLockHolder = async (marker) => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const active = query(`
      SELECT count(*)
      FROM pg_stat_activity
      WHERE state = 'active'
        AND query LIKE '%${marker}%'
        AND pid <> pg_backend_pid()
    `);
    if (active === '1') return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Runtime concurrency test could not observe lock holder ${marker}.`);
};

const runHeldMutation = (mutation, marker) => runPsql(`
BEGIN;
${jwtSetup}
SET LOCAL ROLE authenticated;
${mutation}
SELECT pg_sleep(3) /* ${marker} */;
COMMIT;
`);

const runMutation = (mutation) => runPsql(`
${jwtSetup}
SET ROLE authenticated;
${mutation}
`);

const initial = readState();
const idempotentEnabled = !initial.enabled;
const idempotentReason = 'Alteração concorrente com a mesma chave idempotente para validação automatizada.';
const idempotentMutation = mutationSql({
  enabled: idempotentEnabled,
  expectedVersion: initial.version,
  reason: idempotentReason,
  requestId: ids.sameRequest,
});
const idempotentMarker = `runtime-idempotency-hold-${ids.sameRequest}`;

const firstIdempotent = runHeldMutation(idempotentMutation, idempotentMarker);
await waitForLockHolder(idempotentMarker);
const secondIdempotent = runMutation(idempotentMutation);
const [firstIdempotentResult, secondIdempotentResult] = await Promise.all([
  firstIdempotent,
  secondIdempotent,
]);

if (firstIdempotentResult.code !== 0) {
  throw new Error(
    `First idempotent runtime session failed: ${firstIdempotentResult.stderr || firstIdempotentResult.stdout}`,
  );
}
if (
  secondIdempotentResult.code !== 0
  || !secondIdempotentResult.stdout.includes('"idempotent": true')
) {
  throw new Error(
    `Second runtime session did not reuse the mutation: ${secondIdempotentResult.stderr || secondIdempotentResult.stdout}`,
  );
}

const afterIdempotency = query(`
  SELECT count(*) || '|' ||
    (SELECT version FROM public.corporate_case_runtime_settings WHERE singleton)
  FROM public.corporate_case_runtime_changes
  WHERE request_id = '${ids.sameRequest}'
`);
if (afterIdempotency !== `1|${initial.version + 1}`) {
  throw new Error(
    `Concurrent idempotency invariant failed: expected 1|${initial.version + 1}, got ${afterIdempotency}`,
  );
}

const beforeConflict = readState();
const conflictEnabled = !beforeConflict.enabled;
const conflictReason = 'Alteração concorrente com versões iguais e chaves distintas para validar bloqueio otimista.';
const winnerMutation = mutationSql({
  enabled: conflictEnabled,
  expectedVersion: beforeConflict.version,
  reason: conflictReason,
  requestId: ids.winnerRequest,
});
const loserMutation = mutationSql({
  enabled: conflictEnabled,
  expectedVersion: beforeConflict.version,
  reason: conflictReason,
  requestId: ids.loserRequest,
});
const conflictMarker = `runtime-version-hold-${ids.winnerRequest}`;

const winner = runHeldMutation(winnerMutation, conflictMarker);
await waitForLockHolder(conflictMarker);
const loser = runMutation(loserMutation);
const [winnerResult, loserResult] = await Promise.all([winner, loser]);

if (winnerResult.code !== 0) {
  throw new Error(`Winning runtime session failed: ${winnerResult.stderr || winnerResult.stdout}`);
}
if (loserResult.code === 0 || !loserResult.stderr.includes('corporate_case_runtime_version_conflict')) {
  throw new Error(
    `Losing runtime session did not fail on version conflict: ${loserResult.stderr || loserResult.stdout}`,
  );
}

const afterConflict = query(`
  SELECT
    count(*) FILTER (WHERE request_id = '${ids.winnerRequest}') || '|' ||
    count(*) FILTER (WHERE request_id = '${ids.loserRequest}') || '|' ||
    (SELECT version FROM public.corporate_case_runtime_settings WHERE singleton)
  FROM public.corporate_case_runtime_changes
`);
if (afterConflict !== `1|0|${beforeConflict.version + 1}`) {
  throw new Error(
    `Concurrent version invariant failed: expected 1|0|${beforeConflict.version + 1}, got ${afterConflict}`,
  );
}

const auditCount = query(`
  SELECT count(*)
  FROM public.security_audit_logs
  WHERE actor_id = '${ids.owner}'
    AND action = 'corporate_case.runtime_settings.changed'
`);
if (auditCount !== '2') {
  throw new Error(`Runtime concurrency audit invariant failed: expected 2, got ${auditCount}`);
}

const creationState = readState();
const enableCreationSql = `
SELECT public.set_corporate_case_runtime_settings(
  true, true, false, false, false, false,
  ${creationState.version},
  'Habilitação do runtime para validar criação concorrente idempotente.',
  '${ids.enableCreationRequest}'
);
`;
const enableCreationResult = await runMutation(enableCreationSql);
if (enableCreationResult.code !== 0) {
  throw new Error(
    `Could not enable corporate creation for concurrency tests: ${enableCreationResult.stderr || enableCreationResult.stdout}`,
  );
}

// Both creators use an absolute timestamp. Reusing now() + interval in each
// connection would create different fingerprints and invalidate the test.
// Leave enough headroom for cold/contended CI runners before the creator
// transactions begin; the test still waits for this timestamp before replay.
const validUntil = new Date(Date.now() + 15_000).toISOString();
const controlJustification = 'Solicitação concorrente para validar serialização idempotente do acesso Control.';
const corporateJustification = 'Solicitação corporativa concorrente para validar criação atômica e replay idempotente.';
const controlCreateSql = `
SELECT public.create_control_access_request(
  '${ids.target}',
  'finance_analyst',
  'grant',
  NULL,
  '${validUntil}'::timestamptz,
  '${controlJustification}',
  'CONC-CONTROL-001',
  '${ids.controlCreateRequest}'
);
`;
const corporateCreateSql = `
SELECT public.create_corporate_access_case(
  '${ids.target}',
  'finance_analyst',
  'grant',
  NULL,
  '${validUntil}'::timestamptz,
  '${corporateJustification}',
  ARRAY[]::uuid[],
  '${ids.corporateCreateRequest}'
);
`;
const controlMarker = `control-create-hold-${ids.controlCreateRequest}`;
const corporateMarker = `corporate-create-hold-${ids.corporateCreateRequest}`;

const firstControlCreate = runHeldMutation(controlCreateSql, controlMarker);
const firstCorporateCreate = runHeldMutation(corporateCreateSql, corporateMarker);
await Promise.all([
  waitForLockHolder(controlMarker),
  waitForLockHolder(corporateMarker),
]);
const secondControlCreate = runMutation(controlCreateSql);
const secondCorporateCreate = runMutation(corporateCreateSql);
const [
  firstControlResult,
  firstCorporateResult,
  secondControlResult,
  secondCorporateResult,
] = await Promise.all([
  firstControlCreate,
  firstCorporateCreate,
  secondControlCreate,
  secondCorporateCreate,
]);

for (const [label, result] of [
  ['first Control create', firstControlResult],
  ['first corporate create', firstCorporateResult],
  ['second Control create', secondControlResult],
  ['second corporate create', secondCorporateResult],
]) {
  if (result.code !== 0) {
    throw new Error(`${label} failed: ${result.stderr || result.stdout}`);
  }
}
if (!secondCorporateResult.stdout.includes('"idempotent": true')) {
  throw new Error(
    `Second corporate create did not report an idempotent replay: ${secondCorporateResult.stdout}`,
  );
}

const createCounts = query(`
  SELECT
    (SELECT count(*) FROM public.control_access_requests
      WHERE client_request_id = '${ids.controlCreateRequest}') || '|' ||
    (SELECT count(*) FROM public.corporate_cases
      WHERE client_request_id = '${ids.corporateCreateRequest}') || '|' ||
    (SELECT count(*) FROM public.corporate_case_events
      WHERE event_key = '${ids.corporateCreateRequest}')
`);
if (createCounts !== '1|1|1') {
  throw new Error(`Concurrent create invariant failed: expected 1|1|1, got ${createCounts}`);
}

// A separate transaction beginning after requested_valid_until must still
// replay the original payload; temporal admission only applies to new rows.
const expiryDelay = Math.max(0, Date.parse(validUntil) - Date.now() + 250);
await new Promise((resolve) => setTimeout(resolve, expiryDelay));
const [expiredControlReplay, expiredCorporateReplay] = await Promise.all([
  runMutation(controlCreateSql),
  runMutation(corporateCreateSql),
]);
if (expiredControlReplay.code !== 0) {
  throw new Error(
    `Expired Control payload did not replay idempotently: ${expiredControlReplay.stderr || expiredControlReplay.stdout}`,
  );
}
if (
  expiredCorporateReplay.code !== 0
  || !expiredCorporateReplay.stdout.includes('"idempotent": true')
) {
  throw new Error(
    `Expired corporate payload did not replay idempotently: ${expiredCorporateReplay.stderr || expiredCorporateReplay.stdout}`,
  );
}

process.stdout.write(
  `Corporate runtime/create concurrency validated: runtime=${afterIdempotency}, conflict=${afterConflict}, creates=${createCounts}\n`,
);
