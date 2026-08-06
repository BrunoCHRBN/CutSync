/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const root = process.cwd();
const readSource = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('ProfessionalProfileContent é um componente puro desacoplado de Supabase e expo-router', () => {
  const contentSource = readSource('apps/web/src/components/professional/ProfessionalProfileContent.tsx');

  // Garante desacoplamento de Supabase e expo-router
  expect(contentSource).not.toContain("import { supabase }");
  expect(contentSource).not.toContain("from 'expo-router'");
  expect(contentSource).not.toContain("useRouter()");

  // Garante aceitação de callbacks e propriedades
  expect(contentSource).toContain('onBook?:');
  expect(contentSource).toContain('onOpenLink?:');
  expect(contentSource).toContain('theme?:');
  expect(contentSource).toContain('showPrivacyNote');
});

test('ProfessionalProfileContent omite seções sem conteúdo', () => {
  const contentSource = readSource('apps/web/src/components/professional/ProfessionalProfileContent.tsx');

  // Valida regras de omissão de seções vazias
  expect(contentSource).toContain('hasSpecialties');
  expect(contentSource).toContain('hasBio');
  expect(contentSource).toContain('hasLinks');
  expect(contentSource).toContain('hasServices');
  expect(contentSource).toContain('accessibilityLabel={item.alt}');
});

test('PublicProfessionalProfileExperience refatora reutilizando ProfessionalProfileContent', () => {
  const standaloneSource = readSource('apps/web/src/components/screens/PublicProfessionalProfileExperience.tsx');

  expect(standaloneSource).toContain("import { ProfessionalProfileContent }");
  expect(standaloneSource).toContain('<ProfessionalProfileContent');
  expect(standaloneSource).toContain('usePublicProfessionalProfile');
  expect(standaloneSource).toContain('public-professional-profile-screen');
});
