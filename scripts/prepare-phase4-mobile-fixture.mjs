import { randomBytes, randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const PROJECT_REF_PATTERN = /^[a-z]{20}$/u;
const projectRef = process.argv.find((argument) => PROJECT_REF_PATTERN.test(argument))
  ?? process.env.SUPABASE_PROJECT_ID;
const command = process.argv.includes('--cleanup')
  ? 'cleanup'
  : process.argv.includes('--validate')
    ? 'validate'
    : 'create';

if (!projectRef || !PROJECT_REF_PATTERN.test(projectRef)) {
  throw new Error('usage: node scripts/prepare-phase4-mobile-fixture.mjs <project-ref> [--cleanup]');
}

const linkedRef = readFileSync(resolve('supabase/.temp/project-ref'), 'utf8').trim();
if (linkedRef !== projectRef) throw new Error('linked_supabase_project_does_not_match_target');

const statePath = resolve(
  process.env.LOCALAPPDATA ?? process.env.TEMP ?? '.',
  'CutSync',
  'phase4-mobile-fixture.json',
);
const cli = (...args) => execSync(`npx supabase ${args.join(' ')}`, {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
});
const sqlLiteral = (value) => `'${String(value).replaceAll("'", "''")}'`;
const runSql = (sql) => {
  const directory = mkdtempSync(join(tmpdir(), 'cutsync-g7-mobile-'));
  const file = join(directory, 'query.sql');
  try {
    writeFileSync(file, sql, { encoding: 'utf8', mode: 0o600 });
    return execSync(`npx supabase db query --linked --file "${file}"`, {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};
const keys = JSON.parse(cli('projects', 'api-keys', '--project-ref', projectRef, '--reveal', '--output', 'json'));
const secretKey = keys.find((key) => key.api_key?.startsWith('sb_secret_'))?.api_key;
const publicKey = keys.find((key) => key.api_key?.startsWith('sb_publishable_'))?.api_key
  ?? keys.find((key) => /anon|publishable/u.test(key.name ?? ''))?.api_key;
if (!secretKey || !publicKey) throw new Error('supabase_api_keys_unavailable');

const url = `https://${projectRef}.supabase.co`;
const options = { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } };
const admin = createClient(url, secretKey, options);
const actor = createClient(url, publicKey, options);
const requireData = (result, operation) => {
  if (result.error) throw new Error(`${operation}: ${result.error.message}`);
  return result.data;
};

const cleanup = async (state) => {
  if (!state) return;
  const appointmentId = state.appointmentId;
  const orderId = state.orderId;
  const establishmentId = state.establishmentId;
  const serviceId = state.serviceId;
  const clientId = state.clientId;
  const userIds = [state.adminUserId, state.professionalUserId].filter(Boolean);

  runSql(`
    BEGIN;
    ALTER TABLE public.order_payment_events DISABLE TRIGGER prevent_order_payment_event_change;
    ALTER TABLE public.order_payment_entries DISABLE TRIGGER prevent_order_payment_entry_delete;
    ALTER TABLE public.service_order_events DISABLE TRIGGER service_order_events_immutable;
    ALTER TABLE public.service_order_items DISABLE TRIGGER service_order_items_10_mutability_guard;
    ALTER TABLE public.service_orders DISABLE TRIGGER service_orders_reject_delete;
    ALTER TABLE public.appointment_events DISABLE TRIGGER appointment_events_immutable;
    ALTER TABLE public.appointments DISABLE TRIGGER capture_appointment_event_trigger;
    ALTER TABLE public.services DISABLE TRIGGER prevent_service_history_deletion;
    DELETE FROM public.order_payment_events WHERE service_order_id = ${sqlLiteral(orderId)}::uuid;
    DELETE FROM public.order_payment_entries WHERE service_order_id = ${sqlLiteral(orderId)}::uuid;
    DELETE FROM public.establishment_payment_methods WHERE establishment_id = ${sqlLiteral(establishmentId)}::uuid;
    DELETE FROM public.service_order_events WHERE service_order_id = ${sqlLiteral(orderId)}::uuid;
    DELETE FROM public.service_order_items WHERE service_order_id = ${sqlLiteral(orderId)}::uuid;
    DELETE FROM public.service_orders WHERE id = ${sqlLiteral(orderId)}::uuid;
    ALTER TABLE public.order_payment_events ENABLE TRIGGER prevent_order_payment_event_change;
    ALTER TABLE public.order_payment_entries ENABLE TRIGGER prevent_order_payment_entry_delete;
    ALTER TABLE public.service_order_events ENABLE TRIGGER service_order_events_immutable;
    ALTER TABLE public.service_order_items ENABLE TRIGGER service_order_items_10_mutability_guard;
    ALTER TABLE public.service_orders ENABLE TRIGGER service_orders_reject_delete;
    DELETE FROM public.customer_change_decisions WHERE appointment_id = ${sqlLiteral(appointmentId)};
    DELETE FROM public.decision_queue_items WHERE appointment_id = ${sqlLiteral(appointmentId)};
    DELETE FROM public.appointment_assignment_events WHERE appointment_id = ${sqlLiteral(appointmentId)};
    DELETE FROM public.appointment_reassignment_requests WHERE appointment_id = ${sqlLiteral(appointmentId)};
    DELETE FROM public.appointment_professional_assignments WHERE appointment_id = ${sqlLiteral(appointmentId)};
    DELETE FROM public.appointment_professional_preference_snapshots WHERE appointment_id = ${sqlLiteral(appointmentId)};
    DELETE FROM public.appointment_events WHERE appointment_id = ${sqlLiteral(appointmentId)};
    DELETE FROM public.appointments WHERE id = ${sqlLiteral(appointmentId)};
    ALTER TABLE public.appointments ENABLE TRIGGER capture_appointment_event_trigger;
    ALTER TABLE public.appointment_events ENABLE TRIGGER appointment_events_immutable;
    DELETE FROM public.services WHERE id = ${sqlLiteral(serviceId)};
    ALTER TABLE public.services ENABLE TRIGGER prevent_service_history_deletion;
    DELETE FROM public.establishment_clients WHERE id = ${sqlLiteral(clientId)}::uuid;
    DELETE FROM public.memberships WHERE establishment_id = ${sqlLiteral(establishmentId)}::uuid;
    DELETE FROM public.billing_coverage_assignments WHERE establishment_id = ${sqlLiteral(establishmentId)}::uuid;
    DELETE FROM public.billing_subscriptions
    WHERE billing_account_id IN (
      SELECT id FROM public.billing_accounts WHERE establishment_id = ${sqlLiteral(establishmentId)}::uuid
    );
    DELETE FROM public.billing_invoices
    WHERE billing_account_id IN (
      SELECT id FROM public.billing_accounts WHERE establishment_id = ${sqlLiteral(establishmentId)}::uuid
    );
    DELETE FROM public.billing_accounts WHERE establishment_id = ${sqlLiteral(establishmentId)}::uuid;
    DELETE FROM public.establishments WHERE id = ${sqlLiteral(establishmentId)}::uuid;
    COMMIT;
  `);
  for (const userId of userIds) {
    const deleted = await admin.auth.admin.deleteUser(userId);
    if (deleted.error && !deleted.error.message.includes('not found')) {
      throw new Error(`cleanup auth user: ${deleted.error.message}`);
    }
  }
  rmSync(statePath, { force: true });
};

if (command === 'cleanup') {
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  await cleanup(state);
  console.log(JSON.stringify({ fixture: 'phase4-mobile', cleanup: 'passed' }));
  process.exit(0);
}

if (command === 'validate') {
  const fixture = JSON.parse(readFileSync(statePath, 'utf8'));
  requireData(
    await actor.auth.signInWithPassword({ email: fixture.email, password: fixture.password }),
    'sign in mobile admin',
  );
  const bridge = requireData(await actor.rpc('get_service_order_for_appointment', {
    target_establishment_id: fixture.establishmentId,
    target_appointment_id: fixture.appointmentId,
  }), 'get mobile service order');
  const summary = requireData(await actor.rpc('get_service_order_payment_summary', {
    target_establishment_id: fixture.establishmentId,
    target_service_order_id: fixture.orderId,
  }), 'get mobile payment summary');
  const methods = requireData(await actor.rpc('list_establishment_payment_methods', {
    target_establishment_id: fixture.establishmentId,
  }), 'list mobile payment methods');
  console.log(JSON.stringify({
    fixture: 'phase4-mobile',
    validation: 'passed',
    bridgeShape: {
      appointmentId: typeof bridge?.appointmentId,
      orderStatus: bridge?.serviceOrder?.order?.status ?? null,
      orderKeys: Object.keys(bridge?.serviceOrder?.order ?? {}).sort(),
      itemCount: Array.isArray(bridge?.serviceOrder?.items) ? bridge.serviceOrder.items.length : null,
      itemKeys: Object.keys(bridge?.serviceOrder?.items?.[0] ?? {}).sort(),
      eventCount: Array.isArray(bridge?.serviceOrder?.events) ? bridge.serviceOrder.events.length : null,
    },
    paymentStatus: summary?.paymentStatus ?? null,
    paymentMethodCount: Array.isArray(methods?.methods) ? methods.methods.length : null,
  }, null, 2));
  process.exit(0);
}

let previousState = null;
try {
  previousState = JSON.parse(readFileSync(statePath, 'utf8'));
} catch {
  // No previous fixture.
}
if (previousState) await cleanup(previousState);

const runId = randomUUID().slice(0, 8);
const password = `g7m${randomBytes(12).toString('hex')}a1`;
const email = `g7-mobile-${runId}@example.invalid`;
const professionalEmail = `g7-mobile-${runId}-professional@example.invalid`;
const establishmentId = randomUUID();
const clientId = randomUUID();
const serviceId = randomUUID();
const appointmentId = randomUUID();
const orderId = randomUUID();
let state = null;

try {
  const adminUser = requireData(await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: 'G7 mobile admin' },
  }), 'create mobile admin').user;
  const professionalUser = requireData(await admin.auth.admin.createUser({
    email: professionalEmail,
    password,
    email_confirm: true,
    user_metadata: { name: 'G7 mobile professional' },
  }), 'create mobile professional').user;

  state = {
    projectRef,
    email,
    password,
    adminUserId: adminUser.id,
    professionalUserId: professionalUser.id,
    establishmentId,
    clientId,
    serviceId,
    appointmentId,
    orderId,
  };
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify(state), { encoding: 'utf8', mode: 0o600 });

  requireData(await admin.from('establishments').insert({
    id: establishmentId,
    name: `G7 Mobile ${runId}`,
    slug: `g7-mobile-${runId}`,
    account_status: 'active',
    lifecycle_status: 'active',
    timezone: 'America/Sao_Paulo',
    financial_ops_enabled: true,
  }), 'create mobile establishment');
  requireData(await admin.from('memberships').insert([
    {
      profile_id: adminUser.id,
      establishment_id: establishmentId,
      role: 'admin',
      role_template: 'admin',
      status: 'active',
      created_by: adminUser.id,
    },
    {
      profile_id: professionalUser.id,
      establishment_id: establishmentId,
      role: 'professional',
      role_template: 'professional',
      status: 'active',
      created_by: adminUser.id,
    },
  ]), 'create mobile memberships');
  requireData(await admin.from('establishment_clients').insert({
    id: clientId,
    establishment_id: establishmentId,
    display_name: 'Cliente técnico G7',
    created_by: adminUser.id,
    updated_by: adminUser.id,
  }), 'create mobile client');
  requireData(await admin.from('services').insert({
    id: serviceId,
    establishment_id: establishmentId,
    name: 'Serviço técnico G7',
    price: 100,
    duration_minutes: 30,
    is_active: true,
    sort_order: 1,
  }), 'create mobile service');
  const startAt = new Date(Date.now() - 60 * 60 * 1000);
  const endAt = new Date(startAt.getTime() + 30 * 60 * 1000);
  requireData(await admin.from('appointments').insert({
    id: appointmentId,
    establishment_id: establishmentId,
    client_name: 'Cliente técnico G7',
    establishment_client_id: clientId,
    professional_id: professionalUser.id,
    service_id: serviceId,
    date_time: startAt.toISOString(),
    duration_minutes: 30,
    ends_at: endAt.toISOString(),
    status: 'completed',
  }), 'create mobile appointment');
  requireData(await admin.from('service_orders').insert({
    id: orderId,
    establishment_id: establishmentId,
    appointment_id: appointmentId,
    professional_id: professionalUser.id,
    status: 'open',
    currency: 'BRL',
    created_by: adminUser.id,
    updated_by: adminUser.id,
  }), 'create mobile order');
  requireData(await admin.from('service_order_items').insert({
    service_order_id: orderId,
    establishment_id: establishmentId,
    professional_id: professionalUser.id,
    description_snapshot: 'Serviço técnico G7',
    quantity: 1,
    unit_price_cents: 10_000,
    created_by: adminUser.id,
    updated_by: adminUser.id,
  }), 'create mobile order item');
  runSql(`
    UPDATE public.service_orders
    SET status = 'awaiting_payment',
        started_at = opened_at,
        started_by = ${sqlLiteral(adminUser.id)}::uuid,
        finished_at = now(),
        finished_by = ${sqlLiteral(adminUser.id)}::uuid,
        version = version + 1
    WHERE id = ${sqlLiteral(orderId)}::uuid;
  `);

  requireData(await actor.auth.signInWithPassword({ email, password }), 'sign in mobile admin');
  requireData(await actor.rpc('configure_establishment_payment_method', {
    target_establishment_id: establishmentId,
    target_method_type: 'cash',
    target_display_name: 'Dinheiro',
    target_active: true,
    target_requires_reference: false,
    target_expected_version: null,
    target_request_id: randomUUID(),
  }), 'configure mobile cash method');

  console.log(JSON.stringify({
    fixture: 'phase4-mobile',
    environment: 'Homolog',
    appointmentId,
    statePath,
    cleanupCommand: `node scripts/prepare-phase4-mobile-fixture.mjs ${projectRef} --cleanup`,
  }, null, 2));
} catch (error) {
  await cleanup(state);
  throw error;
}
