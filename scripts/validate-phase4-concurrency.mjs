import { randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';

const container = process.env.SUPABASE_DB_CONTAINER ?? 'supabase_db_CutSync';
const ids = {
  owner: randomUUID(),
  establishment: randomUUID(),
  organization: randomUUID(),
  order: randomUUID(),
  method: randomUUID(),
  requestA: randomUUID(),
  requestB: randomUUID(),
  cashOpenRequest: randomUUID(),
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
  ['exec', container, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-c', sql],
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
INSERT INTO auth.users(id, email, email_confirmed_at)
VALUES ('${ids.owner}', 'p4-concurrency-${ids.owner}@example.test', now());

INSERT INTO public.establishments(id, name, slug, account_status, timezone, financial_ops_enabled)
VALUES (
  '${ids.establishment}', 'P4 concurrency', 'p4-concurrency-${ids.establishment.slice(0, 8)}',
  'active', 'America/Sao_Paulo', true
);

INSERT INTO public.profiles(id, establishment_id, name, email, role)
VALUES (
  '${ids.owner}', '${ids.establishment}', 'P4 concurrency owner',
  'p4-concurrency-${ids.owner}@example.test', 'admin'
)
ON CONFLICT (id) DO UPDATE SET establishment_id = EXCLUDED.establishment_id;

INSERT INTO public.organizations(id, name, status, created_by)
VALUES ('${ids.organization}', 'P4 concurrency org', 'active', '${ids.owner}');
INSERT INTO public.organization_members(organization_id, profile_id, role, status, created_by)
VALUES ('${ids.organization}', '${ids.owner}', 'owner', 'active', '${ids.owner}');
INSERT INTO public.organization_establishments(organization_id, establishment_id, status, linked_by)
VALUES ('${ids.organization}', '${ids.establishment}', 'active', '${ids.owner}');
INSERT INTO public.memberships(profile_id, establishment_id, role, status, created_by)
VALUES ('${ids.owner}', '${ids.establishment}', 'admin', 'active', '${ids.owner}');

UPDATE public.billing_accounts
SET billing_owner_profile_id = '${ids.owner}', owner_resolution_status = 'confirmed'
WHERE establishment_id = '${ids.establishment}';

INSERT INTO public.service_orders(
  id, establishment_id, professional_id, status, currency, created_by, updated_by
) VALUES (
  '${ids.order}', '${ids.establishment}', '${ids.owner}', 'open', 'BRL', '${ids.owner}', '${ids.owner}'
);
INSERT INTO public.service_order_items(
  service_order_id, establishment_id, professional_id, description_snapshot,
  quantity, unit_price_cents, created_by, updated_by
) VALUES (
  '${ids.order}', '${ids.establishment}', '${ids.owner}', 'Concurrency service',
  1, 10000, '${ids.owner}', '${ids.owner}'
);
UPDATE public.service_orders
SET status = 'awaiting_payment', started_at = now(), started_by = '${ids.owner}',
    finished_at = now(), finished_by = '${ids.owner}', version = version + 1
WHERE id = '${ids.order}';

INSERT INTO public.establishment_payment_methods(
  id, establishment_id, method_type, display_name, active, requires_reference,
  created_by, updated_by
) VALUES (
  '${ids.method}', '${ids.establishment}', 'cash', 'Dinheiro', true, false,
  '${ids.owner}', '${ids.owner}'
);

${jwtSetup}
SELECT public.open_cash_session(
  '${ids.establishment}', 0, '${ids.cashOpenRequest}'
);
`;

execFileSync('docker', psqlArgs, { input: setup, stdio: ['pipe', 'inherit', 'inherit'] });
const expectedVersion = Number(query(
  `SELECT version FROM public.service_orders WHERE id = '${ids.order}'`,
));

const first = runPsql(`
${jwtSetup}
BEGIN;
SELECT public.record_order_payment(
  '${ids.establishment}', '${ids.order}', '${ids.method}', 6000, NULL,
  ${expectedVersion}, '${ids.requestA}'
);
SELECT pg_sleep(3) /* phase4-concurrency-hold-${ids.order} */;
COMMIT;
`);

let lockObserved = false;
for (let attempt = 0; attempt < 30; attempt += 1) {
  const active = query(`
    SELECT count(*)
    FROM pg_stat_activity
    WHERE state = 'active'
      AND query LIKE '%phase4-concurrency-hold-${ids.order}%'
      AND pid <> pg_backend_pid()
  `);
  if (active === '1') {
    lockObserved = true;
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
}

if (!lockObserved) {
  await first;
  throw new Error('Phase 4 concurrency test could not observe the first session holding the row lock.');
}

const second = runPsql(`
${jwtSetup}
SELECT public.record_order_payment(
  '${ids.establishment}', '${ids.order}', '${ids.method}', 6000, NULL,
  ${expectedVersion}, '${ids.requestB}'
);
`);

const [firstResult, secondResult] = await Promise.all([first, second]);
if (firstResult.code !== 0) {
  throw new Error(`First payment session failed: ${firstResult.stderr || firstResult.stdout}`);
}
if (secondResult.code === 0 || !secondResult.stderr.includes('service_order_version_conflict')) {
  throw new Error(
    `Second payment session did not fail closed on version conflict: ${secondResult.stderr || secondResult.stdout}`,
  );
}

const ledger = query(`
  SELECT count(*) || '|' || COALESCE(sum(amount_cents), 0) || '|' ||
    (SELECT version FROM public.service_orders WHERE id = '${ids.order}')
  FROM public.order_payment_entries
  WHERE service_order_id = '${ids.order}' AND status = 'succeeded'
`);
if (ledger !== `1|6000|${expectedVersion + 1}`) {
  throw new Error(`Concurrent ledger invariant failed: expected 1|6000|${expectedVersion + 1}, got ${ledger}`);
}

process.stdout.write(`Phase 4 concurrency validated: ${ledger}\n`);
