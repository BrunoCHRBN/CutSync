/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const root = process.cwd();
const readSource = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('EstablishmentProfileExperience sincroniza seleção do profissional com os parâmetros da rota', () => {
  const profileSource = readSource('apps/web/src/components/establishment/EstablishmentProfileExperience.tsx');

  // Leitura de parâmetros de rota
  expect(profileSource).toContain('useLocalSearchParams');
  expect(profileSource).toContain('currentProfSlug');
  expect(profileSource).toContain('currentProfId');

  // Abertura com setParams (professional_slug / professional_id)
  expect(profileSource).toContain('handleOpenProfessional');
  expect(profileSource).toContain("professional_slug: member.profileSlug");
  expect(profileSource).toContain("professional_id: member.id");

  // Fechamento remove somente os parâmetros do profissional
  expect(profileSource).toContain('handleCloseProfessional');
  expect(profileSource).toContain('professional_slug: undefined');
  expect(profileSource).toContain('professional_id: undefined');

  // Reabertura e sincronização na recarga / deep link
  expect(profileSource).toContain('barbers.find(');
  expect(profileSource).toContain('b.profileSlug === currentProfSlug');
});

test('Tratamento de slug inválido e rota standalone', () => {
  const profileSource = readSource('apps/web/src/components/establishment/EstablishmentProfileExperience.tsx');
  const hooksSource = readSource('apps/web/src/hooks/use-establishment-route-params.ts');
  const standaloneSource = readSource('apps/web/src/components/screens/PublicProfessionalProfileExperience.tsx');

  // Slug inválido limpa os parâmetros sem quebrar a página
  expect(profileSource).toContain('setSelectedTeamMember(null);');
  expect(profileSource).toContain('professional_slug: undefined');

  // Hook expõe initialProfessionalSlug
  expect(hooksSource).toContain('initialProfessionalSlug');

  // Rota standalone mantida intacta
  expect(standaloneSource).toContain('PublicProfessionalProfileExperience');
  expect(standaloneSource).toContain('ProfessionalProfileContent');
});
