/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { canEditKnowledge, isKnowledgeOwner, isReviewExpired } from '../../src/types/governance-knowledge';

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const migration = read('supabase/migrations/20260720005000_governance_knowledge_forum.sql');

test('mantém a matriz de permissões do fórum no cliente e no banco', () => {
  expect(canEditKnowledge('SaaS_Viewer')).toBe(false);
  expect(canEditKnowledge('SaaS_Editor')).toBe(true);
  expect(canEditKnowledge('SaaS_Owner')).toBe(true);
  expect(isKnowledgeOwner('SaaS_Editor')).toBe(false);
  expect(isKnowledgeOwner('SaaS_Owner')).toBe(true);

  expect(migration).toContain('Editors create knowledge topics');
  expect(migration).toContain('Authors and owners update knowledge replies');
  expect(migration).toContain("ARRAY['SaaS_Owner']::public.governance_role_enum[]");
  expect(migration).not.toContain('ON public.governance_kb_topics FOR DELETE');
  expect(migration).not.toContain('ON public.governance_kb_replies FOR DELETE');
});

test('protege imagens em bucket privado e sem sobrescrita', () => {
  const service = read('src/services/governance-knowledge.ts');
  expect(migration).toContain("'governance-kb',\n  'governance-kb',\n  false");
  expect(migration).toContain("ARRAY['image/jpeg', 'image/png', 'image/webp']");
  expect(migration).toContain('requested_size_bytes > 5242880');
  expect(migration).toContain('Editors upload private knowledge images');
  expect(migration).not.toContain('ON storage.objects FOR DELETE');
  expect(service).toContain('upsert: false');
  expect(service).toContain('createSignedUrl');
  expect(service).toContain('SIGNED_URL_TTL_SECONDS = 15 * 60');
});

test('renderização Markdown bloqueia HTML, imagens externas e esquemas perigosos', () => {
  const renderer = read('src/components/governance/knowledge-markdown.tsx');
  expect(renderer).toContain('html: false');
  expect(renderer).toContain("parser.disable(['image'])");
  expect(renderer).toContain('/^https?:\\/\\//i');
  expect(renderer).toContain('kb-attachment:');
  expect(renderer).not.toContain('dangerouslySetInnerHTML');
});

test('mantém revisão vencida após 90 dias', () => {
  expect(isReviewExpired(new Date().toISOString())).toBe(false);
  expect(isReviewExpired(new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString())).toBe(true);
  expect(isReviewExpired(null)).toBe(false);
});

test('migra os sete artigos sem oficializá-los e corrige instruções conflitantes', () => {
  expect((migration.match(/'b0000000-0000-4000-8000-00000000000[1-7]'/g) ?? []).length).toBe(7);
  expect(migration).toContain('false, true, NULL, NULL');
  expect(migration).toContain('novos agendamentos de clientes');
  expect(migration).toContain('Não execute `DELETE` ou `UPDATE` nela');
  expect(migration).not.toContain('DELETE FROM public.security_audit_logs');
});

test('expõe as quatro rotas do fórum sob o layout compartilhado', () => {
  for (const route of [
    'src/app/governance/knowledge/index.tsx',
    'src/app/governance/knowledge/new.tsx',
    'src/app/governance/knowledge/[topicId]/index.tsx',
    'src/app/governance/knowledge/[topicId]/edit.tsx',
  ]) expect(fs.existsSync(path.join(root, route))).toBe(true);

  const layout = read('src/app/governance/_layout.tsx');
  expect(layout).toContain('GovernanceAuthProvider');
  expect(layout).toContain('GovernanceShell');
});
