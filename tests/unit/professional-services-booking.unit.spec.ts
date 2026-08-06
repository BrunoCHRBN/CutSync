/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const root = process.cwd();
const readSource = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('ProfessionalProfileSheet filtra professional_services por establishmentId, professionalId e is_active=true', () => {
  const sheetSource = readSource('apps/web/src/components/professional/ProfessionalProfileSheet.tsx');

  // Filtro de estabelecimento e profissional
  expect(sheetSource).toContain("from('professional_services')");
  expect(sheetSource).toContain(".eq('professional_id', professional.id)");
  expect(sheetSource).toContain(".eq('is_active', true)");
  expect(sheetSource).toContain(".eq('establishment_id', establishmentId)");

  // Não rende serviços sem filtragem (retorna [] se o profissional não tiver vínculos ativos)
  expect(sheetSource).toContain('if (professionalServiceIds.length === 0) return [];');
});

test('Ao clicar em agendar, o professionalId é capturado, a janela fecha e o fluxo de booking é preservado', () => {
  const profileSource = readSource('apps/web/src/components/establishment/EstablishmentProfileExperience.tsx');

  // Captura do professionalId e encerramento da janela
  expect(profileSource).toContain('onClose={handleCloseProfessional}');
  expect(profileSource).toContain('handleCloseProfessional');
  expect(profileSource).toContain('goBooking(profId);');

  // Parâmetro enviado à rota de agendamento existente
  expect(profileSource).toContain('pathname: `/${bookingSlug}/booking`');
  expect(profileSource).toContain('params: professionalId ? { professional_id: professionalId } : undefined');
});
