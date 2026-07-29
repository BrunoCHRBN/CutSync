/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const root = process.cwd();
const read = (relativePath: string) => fs
  .readFileSync(path.join(root, relativePath), 'utf8')
  .replace(/\r\n/g, '\n');

const migration = read(
  'supabase/migrations/20260804001000_control_live_operations.sql',
);
const inviteFix = read(
  'supabase/migrations/20260804000000_fix_establishment_invite_v2_lint.sql',
);
const service = read('apps/control/src/services/control-live.ts');
const hook = read('apps/control/src/hooks/use-control-live.ts');
const route = read('apps/control/src/app/(control)/live.tsx');
const supportOperations = read(
  'apps/control/src/components/support-operations.tsx',
);

test('protege o snapshot e o Broadcast privado com acesso Control AAL2', () => {
  expect(migration).toContain(
    'CREATE OR REPLACE FUNCTION public.can_read_control_live()',
  );
  expect(migration).toContain("auth.jwt()->>'aal'");
  expect(migration).toContain("realtime.topic() = 'control:live'");
  expect(migration).toContain("extension = 'broadcast'");
  expect(migration).toContain('public.can_read_control_live()');
  expect(migration).toContain(
    'REVOKE ALL ON FUNCTION public.get_control_live_snapshot()',
  );
  expect(migration).toContain('FROM PUBLIC, anon');
});

test('publica somente invalidações mínimas e mantém o RPC como fonte autoritativa', () => {
  expect(migration).toContain('realtime.send(');
  expect(migration).toContain("'scope', TG_ARGV[0]");
  expect(migration).toContain("'reason', lower(TG_OP)");
  expect(migration).toContain("'occurred_at', clock_timestamp()");
  expect(migration).toContain("'invalidate'");
  expect(migration).not.toContain('realtime.broadcast_changes');
  expect(service).toContain("('get_control_live_snapshot')");
  expect(service).toContain(".channel('control:live', { config: { private: true } })");
  expect(service).toContain("event: 'invalidate'");
});

test('mantém o painel operacional sem métricas financeiras não auditadas', () => {
  for (const field of [
    "'today_total'",
    "'next_60_minutes'",
    "'active'",
    "'pending_requests'",
    "'critical_open'",
    "'sla_at_risk'",
    "'sync_failed'",
    "'pending_operations'",
  ]) {
    expect(migration).toContain(field);
  }
  expect(migration).not.toMatch(/'revenue'|'profit'|'cash'/);
  expect(migration).toContain('support_payload jsonb := NULL');
  expect(migration).toContain(" 'support', support_payload".trim());
});

test('reconcilia eventos, polling e estado stale sem apagar o último snapshot', () => {
  expect(hook).toContain('POLL_INTERVAL_MS = 60_000');
  expect(hook).toContain('STALE_AFTER_MS = 90_000');
  expect(hook).toContain('INVALIDATION_DEBOUNCE_MS = 350');
  expect(hook).toContain('setSnapshot(result)');
  expect(hook).not.toContain('setSnapshot(null)');
  expect(hook).toContain("setConnectionState('stale')");
  expect(hook).toContain('useFocusEffect');
});

test('substitui o placeholder e invalida também a fila do Control', () => {
  expect(route).toContain('<LiveOperations />');
  expect(route).not.toContain('PendingIntegration');
  expect(supportOperations).toContain('subscribeToControlLive');
  expect(supportOperations).toContain("scope !== 'support'");
  expect(supportOperations).toContain('}, 350)');
});

test('corrige a ambiguidade do convite sem mudar a assinatura pública', () => {
  expect(inviteFix).toContain(
    'public.create_establishment_invite_v2(uuid, text, text)',
  );
  expect(inviteFix).toContain(
    'UPDATE public.establishment_invites AS invitation',
  );
  expect(inviteFix).toContain(
    'lower(invitation.target_contact) = normalized_contact',
  );
  expect(inviteFix).toContain('invitation.role = target_role');
});
