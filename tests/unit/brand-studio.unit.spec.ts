/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

test('versiona marca em recursos separados e preserva a projeção pública', () => {
  const sql = read('supabase/migrations/20260812155016_ui_ux_brand_studio.sql');
  expect(sql).toContain('CREATE TABLE public.organization_brand_versions');
  expect(sql).toContain('CREATE TABLE public.establishment_brand_versions');
  expect(sql).toContain('REFERENCES public.organizations(id)');
  expect(sql).toContain('REFERENCES public.establishments(id)');
  expect(sql).toContain('project_published_brand');
  expect(sql).toContain('primary_color =');
  expect(sql).toContain('publish_request_id uuid UNIQUE');
});

test('fecha acesso direto e revalida capacidades de edição e publicação no servidor', () => {
  const sql = read('supabase/migrations/20260812155016_ui_ux_brand_studio.sql');
  expect(sql).toContain('get_brand_authority');
  expect(sql).toContain("organization_role IN ('owner', 'manager')");
  expect(sql).toContain("organization_role = 'owner'");
  expect(sql).toContain("membership.role = 'admin'");
  expect(sql).toContain('REVOKE ALL ON TABLE');
  expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.publish_brand_version');
});

test('oferece o mesmo contrato ao Web e Business, com rascunho e prévias', () => {
  const web = read('apps/web/src/components/screens/SettingsExperience.tsx');
  const business = read('apps/business/src/screens/brand-studio.tsx');
  const preview = read('apps/web/src/components/settings/EstablishmentBrandPreview.tsx');
  expect(web).toContain('settings-brand-publish');
  expect(web).toContain('settings-brand-media-consent');
  expect(business).toContain('business-brand-studio-screen');
  expect(business).toContain('Salvar rascunho');
  expect(business).toContain('business-brand-history');
  expect(business).toContain('businessBrandApi.restore');
  expect(web).toContain('settings-brand-history');
  expect(web).toContain('brandStudioService.restore');
  expect(preview).toContain('settings-explore-card-preview');
  expect(preview).toContain('settings-public-profile-preview');
  expect(preview).toContain('settings-booking-preview');
});
