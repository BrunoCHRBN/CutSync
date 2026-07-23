/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { canEditKnowledge } from '../../apps/web/src/types/governance-knowledge';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const migration = read('supabase/migrations/20260723050000_governance_operational_p0.sql');

test('status sensível passa por RPC, motivo e guarda contra update direto', () => {
  expect(migration).toContain('update_governance_establishment_status');
  expect(migration).toContain("char_length(btrim(coalesce(target_reason, ''))) NOT BETWEEN 10 AND 500");
  expect(migration).toContain('governance_status_change_requires_reason');
  expect(migration).toContain("'old_status', OLD.account_status");
  expect(migration).toContain("'new_status', NEW.account_status");
  expect(migration).toContain("'reason', coalesce(status_reason, 'Não informado')");
});

test('operações de Governança têm consultas protegidas e navegação P0', () => {
  const service = read('apps/web/src/services/governance-operations.ts');
  const layout = read('apps/web/src/app/governance/_layout.tsx');
  const shell = read('apps/web/src/components/governance/governance-shell.tsx');
  expect(service).toContain('list_governance_establishments');
  expect(service).toContain('list_governance_audit_events');
  expect(service).toContain('get_governance_establishment_detail');
  expect(layout).toContain('establishments/[id]');
  expect(layout).toContain('name="audit"');
  expect(shell).toContain('Estabelecimentos');
  expect(shell).toContain('Auditoria');
});

test('Viewer permanece somente leitura também na camada de conhecimento', () => {
  expect(canEditKnowledge('SaaS_Viewer')).toBe(false);
});
