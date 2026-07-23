/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

import {
  CLIENT_DISCOVERY_QUERY_MAX_LENGTH,
  normalizeClientDiscoveryQuery,
  validateClientDiscoveryQuery,
} from '../../packages/validation/src/client-discovery';

const root = process.cwd();
const readSource = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('normaliza a busca e rejeita emoji, SVG e excesso de caracteres', () => {
  expect(normalizeClientDiscoveryQuery('  corte   masculino  ')).toBe('corte masculino');
  expect(validateClientDiscoveryQuery('Barbearia Central')).toEqual({ ok: true, query: 'Barbearia Central' });
  expect(validateClientDiscoveryQuery('profissional 💈')).toMatchObject({ ok: false });
  expect(validateClientDiscoveryQuery('<svg>bairro</svg>')).toMatchObject({ ok: false });
  expect(validateClientDiscoveryQuery('a'.repeat(CLIENT_DISCOVERY_QUERY_MAX_LENGTH + 1))).toMatchObject({ ok: false });
});

test('expõe descoberta e detalhe em rotas próprias do Client', () => {
  const layout = readSource('apps/client/src/app/(app)/_layout.tsx');
  const discovery = readSource('apps/client/src/screens/client-discovery.tsx');
  const detail = readSource('apps/client/src/screens/client-establishment-detail.tsx');

  expect(fs.existsSync(path.join(root, 'apps/client/src/app/(app)/explore.tsx'))).toBe(true);
  expect(fs.existsSync(path.join(root, 'apps/client/src/app/(app)/establishments/[slug].tsx'))).toBe(true);
  expect(layout).toContain('name="explore"');
  expect(layout).toContain('name="establishments/[slug]"');
  expect(discovery).toContain('validateClientDiscoveryQuery(nextValue)');
  expect(discovery).toContain('RefreshControl');
  expect(detail).toContain('client-establishment-services');
  expect(detail).toContain('client-establishment-professionals');
});

test('limita o catálogo no servidor a dados ativos e contratos autenticados', () => {
  const migration = readSource('supabase/migrations/20260722223000_client_discovery.sql');
  const service = readSource('apps/client/src/features/discovery/client-discovery-service.ts');
  const sqlTest = readSource('supabase/tests/client_discovery.sql');

  expect(migration).toContain('list_client_discovery_establishments');
  expect(migration).toContain('get_client_discovery_establishment');
  expect(migration).toContain("establishment.account_status = 'active'");
  expect(migration).toContain('public.is_safe_client_profile_text(normalized_query)');
  expect(migration).toContain('REVOKE ALL ON FUNCTION public.list_client_discovery_establishments');
  expect(migration).toContain('TO authenticated');
  expect(migration).not.toContain('document_number');
  expect(migration).not.toContain('kyc_document_url');
  expect(service).not.toMatch(/service.?role/i);
  expect(service).not.toMatch(/console\.(log|info|warn|error)/);
  expect(sqlTest).toContain("SET LOCAL ROLE anon");
  expect(sqlTest).toContain("slug = 'estudio-bloqueado'");
});
