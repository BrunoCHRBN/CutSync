/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');

test('P1 cria contratos de conformidade, RLS, bucket privado e RPCs', () => {
  const migration = read('supabase/migrations/20260724000000_governance_compliance_p1.sql');
  for (const contract of ['governance_verification_reviews', 'governance_privacy_requests', 'governance-kyc', 'submit_governance_verification', 'review_governance_verification', 'execute_governance_privacy_request', 'grant_governance_role', 'revoke_governance_membership']) expect(migration).toContain(contract);
  expect(migration).toContain('public = false');
  expect(migration).toContain('10485760');
  expect(migration).toContain('last_owner_protected');
  expect(migration).toContain('reason_provided');
  expect(migration).toContain('REVOKE EXECUTE ON FUNCTION public.approve_establishment_request');
  expect(migration).not.toContain("jsonb_build_object('reason',btrim(reason))");
});

test('serviço e navegação P1 estão consolidados', () => {
  const service = read('apps/web/src/services/governance-compliance.ts');
  const shell = read('apps/web/src/components/governance/governance-shell.tsx');
  const layout = read('apps/web/src/app/governance/_layout.tsx');
  const legacy = read('apps/web/src/app/superadmin/index.tsx');
  for (const rpc of ['list_governance_establishment_requests', 'submit_governance_privacy_request', 'execute_governance_privacy_request', 'grant_governance_role']) expect(service).toContain(rpc);
  for (const label of ['Solicitações', 'Verificação', 'Privacidade', 'Acesso']) expect(shell).toContain(label);
  for (const route of ['requests/index', 'verification/index', 'privacy/index', 'access/index']) expect(layout).toContain(route);
  expect(legacy).toContain('/governance/requests');
});
