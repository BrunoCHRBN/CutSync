/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const migration = read('supabase/migrations/20260724020000_governance_kb_p1_articles.sql');

test('semeia os sete artigos P1 como rascunhos idempotentes', () => {
  const slugs = [
    'ciclo-solicitacoes-estabelecimento',
    'verificacao-kyc-documento-privado',
    'solicitacoes-lgpd-anonimizacao',
    'matriz-acesso-governanca',
    'revogacao-memberships-convites',
    'leitura-auditoria-governanca',
    'checklist-validacao-governanca-staging',
  ];

  for (const slug of slugs) expect(migration).toContain(`'${slug}'`);
  expect((migration.match(/'draft', NULL, NULL, false, false/g) ?? []).length).toBe(7);
  expect(migration).toContain('ON CONFLICT (slug) DO NOTHING');
  expect(migration).toContain("'Conteúdo P1 inicial para revisão'");
});

test('orienta operações sem incluir segredos ou dados pessoais nos artigos', () => {
  expect(migration).toContain('bucket privado `governance-kyc`');
  expect(migration).toContain('reason_provided: true');
  expect(migration).toContain('Não altere `profiles.role` ou `profiles.establishment_id` diretamente.');
  expect(migration).not.toMatch(/@(?:gmail|outlook|yahoo)\.com/i);
  expect(migration).not.toContain('token_hash');
});
