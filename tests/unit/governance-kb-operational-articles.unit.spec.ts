/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const migration = read('supabase/migrations/20260726010000_governance_kb_operational_articles.sql');

test('semeia a segunda leva operacional como rascunhos idempotentes', () => {
  const slugs = [
    'triagem-suporte-oficial',
    'resposta-a-incidentes',
    'diagnostico-disponibilidade-agendamentos',
    'runbook-migrations-e-rollback',
    'observabilidade-sentry-e-metricas',
    'retencao-e-governanca-de-dados',
    'continuidade-operacional-plataforma',
    'gestao-de-inadimplencia',
    'integracoes-jira-e-edge-functions',
    'padroes-conteudo-base-de-conhecimento',
    'seguranca-de-conta-e-mfa',
    'metricas-executivas-governanca',
  ];

  for (const slug of slugs) expect(migration).toContain(`'${slug}'`);
  expect((migration.match(/'draft', NULL, NULL, false, false/g) ?? []).length).toBe(12);
  expect(migration).toContain('ON CONFLICT (slug) DO NOTHING');
});

test('mantém as orientações operacionais sem segredos ou dados pessoais', () => {
  expect(migration).toContain('Jira Service Management é a fonte de verdade para suporte oficial.');
  expect(migration).toContain('Não altere auditoria, não desative RLS como atalho');
  expect(migration).toContain('Não envie senhas, tokens, documentos ou URLs assinadas ao ticket.');
  expect(migration).not.toMatch(/@(?:gmail|outlook|yahoo)\.com/i);
  expect(migration).not.toContain('service_role');
});
