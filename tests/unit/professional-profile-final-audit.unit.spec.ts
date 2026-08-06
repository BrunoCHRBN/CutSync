/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const root = process.cwd();
const readSource = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Auditoria Item 1: Ausência de modal inline antigo em EstablishmentProfileExperience', () => {
  const profileSource = readSource('apps/web/src/components/establishment/EstablishmentProfileExperience.tsx');

  // Não contém a importação do Modal do react-native nem tags <Modal
  expect(profileSource).not.toContain("Modal } from 'react-native'");
  expect(profileSource).not.toContain('<Modal');
  expect(profileSource).toContain('ProfessionalProfileSheet');
});

test('Auditoria Item 2, 9 & 17: Reutilização do componente visual puro e integridade da rota standalone', () => {
  const sheetSource = readSource('apps/web/src/components/professional/ProfessionalProfileSheet.tsx');
  const standaloneSource = readSource('apps/web/src/components/screens/PublicProfessionalProfileExperience.tsx');
  const editorSource = readSource('apps/web/src/components/screens/ProfessionalProfileEditorExperience.tsx');

  // Ambos reutilizam ProfessionalProfileContent
  expect(sheetSource).toContain('ProfessionalProfileContent');
  expect(standaloneSource).toContain('ProfessionalProfileContent');

  // O editor reutiliza ProfessionalProfileSheet
  expect(editorSource).toContain('ProfessionalProfileSheet');
});

test('Auditoria Item 3, 4, 6, 7 & 20: Proteção LGPD, contrato estrito de 6 campos e ausência de dados fictícios/nota 5', () => {
  const hookSource = readSource('apps/web/src/hooks/usePublicTeam.ts');
  const databaseModelsSource = readSource('packages/database/src/models.ts');
  const contentSource = readSource('apps/web/src/components/professional/ProfessionalProfileContent.tsx');

  // LGPD: Mapeamento estrito dos 6 campos públicos da RPC get_public_team
  expect(hookSource).toContain('mapPublicTeamMember');
  expect(databaseModelsSource).toContain('id: row.id');
  expect(databaseModelsSource).toContain('name: row.name');
  expect(databaseModelsSource).toContain('avatarUrl: row.avatar_url');
  expect(databaseModelsSource).toContain('tituloProfissional: row.titulo_profissional');
  expect(databaseModelsSource).toContain('specialties: row.specialties');
  expect(databaseModelsSource).toContain('profileSlug: row.professional_profile_slug ?? null');

  // Não inventa nota 5 nem avaliações fictícias
  expect(contentSource).not.toContain('5.0');
  expect(contentSource).not.toContain('Estrelas');
});

test('Auditoria Item 8 & 12: Filtragem de serviços por profissional/estabelecimento e cancelamento de requisições obsoletas', () => {
  const sheetSource = readSource('apps/web/src/components/professional/ProfessionalProfileSheet.tsx');

  // Filtra por profissional e por estabelecimento com status ativo
  expect(sheetSource).toContain("from('professional_services')");
  expect(sheetSource).toContain(".eq('professional_id', professional.id)");
  expect(sheetSource).toContain(".eq('is_active', true)");
  expect(sheetSource).toContain(".eq('establishment_id', establishmentId)");

  // Padrão active flag para evitar race conditions
  expect(sheetSource).toContain('let active = true');
  expect(sheetSource).toContain('active = false;');
});

test('Auditoria Item 13, 14, 15 & 16: Acessibilidade, propasgação de clique no conteúdo, backdrop e layouts responsivos', () => {
  const sheetSource = readSource('apps/web/src/components/professional/ProfessionalProfileSheet.tsx');

  // Semântica de diálogo e acessibilidade
  expect(sheetSource).toContain('accessibilityRole=');
  expect(sheetSource).toContain('dialog');
  expect(sheetSource).toContain('aria-modal={true}');
  expect(sheetSource).toContain('accessibilityLabel="Fechar perfil do profissional"');
  expect(sheetSource).toContain("event.key === 'Escape'");

  // Evita fechar ao clicar dentro do conteúdo
  expect(sheetSource).toContain('event.stopPropagation()');

  // Layouts responsivos (Desktop side-panel e Mobile bottom-sheet)
  expect(sheetSource).toContain('desktopSheet');
  expect(sheetSource).toContain('mobileSheet');
});
