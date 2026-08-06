/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const root = process.cwd();
const readSource = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('ProfessionalProfileEditorExperience integra pré-visualização pública via ProfessionalProfileSheet', () => {
  const editorSource = readSource('apps/web/src/components/screens/ProfessionalProfileEditorExperience.tsx');

  // Reutilização de ProfessionalProfileSheet no editor
  expect(editorSource).toContain('ProfessionalProfileSheet');
  expect(editorSource).toContain('visible={previewVisible}');
  expect(editorSource).toContain('professional={previewMember}');

  // Rótulo discreto de pré-visualização pública
  expect(editorSource).toContain('Pré-visualização pública');
  expect(editorSource).toContain('professional-profile-preview-badge');

  // Botões de ação primária (modal) e secundária (rota pública)
  expect(editorSource).toContain('testID="professional-profile-preview-button"');
  expect(editorSource).toContain('testID="professional-profile-open-public-button"');
  expect(editorSource).toContain('setPreviewVisible(true)');
  expect(editorSource).toContain('router.push(`/profile/${slug}` as never)');

  // Fechamento e manutenção do editor sem recarregar estado
  expect(editorSource).toContain('onClose={() => setPreviewVisible(false)}');
});

test('Impedir pré-visualização quando não houver slug ou perfil não for público', () => {
  const editorSource = readSource('apps/web/src/components/screens/ProfessionalProfileEditorExperience.tsx');

  // Desabilita botões quando !isPublic ou !slug
  expect(editorSource).toContain('disabled={!isPublic || !slug}');

  // Notificação explicativa do motivo da indisponibilidade
  expect(editorSource).toContain('testID="professional-profile-preview-unavailable-notice"');
  expect(editorSource).toContain('Perfil oculto. Ative a chave');
  expect(editorSource).toContain('Slug ausente. Defina um Endereço público');
});
