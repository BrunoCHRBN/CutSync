/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const root = process.cwd();
const readSource = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('ProfessionalProfileSheet possui acessibilidade, suporte a desktop/mobile e cancelamento de requisições obsoletas', () => {
  const sheetSource = readSource('apps/web/src/components/professional/ProfessionalProfileSheet.tsx');

  // Acessibilidade
  expect(sheetSource).toContain('accessibilityRole=');
  expect(sheetSource).toContain('dialog');
  expect(sheetSource).toContain('aria-modal={true}');
  expect(sheetSource).toContain('accessibilityLabel="Fechar perfil do profissional"');
  expect(sheetSource).toContain("event.key === 'Escape'");

  // Cancelamento de requisições obsoletas (active flag pattern)
  expect(sheetSource).toContain('let active = true');
  expect(sheetSource).toContain('return () => {');
  expect(sheetSource).toContain('active = false;');

  // Suporte a desktop side-panel e mobile sheet
  expect(sheetSource).toContain('desktopSheet');
  expect(sheetSource).toContain('mobileSheet');
  expect(sheetSource).toContain('Math.min(680, Math.max(560');

  // Reutilização do ProfessionalProfileContent
  expect(sheetSource).toContain('ProfessionalProfileContent');
});

test('EstablishmentProfileExperience substitui o modal inline pelo componente ProfessionalProfileSheet', () => {
  const profileSource = readSource('apps/web/src/components/establishment/EstablishmentProfileExperience.tsx');

  expect(profileSource).toContain('ProfessionalProfileSheet');
  expect(profileSource).toContain('visible={!!selectedTeamMember}');
  expect(profileSource).not.toContain('<Modal');
});
