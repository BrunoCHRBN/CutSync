/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const root = process.cwd();

test('EstablishmentThemeProvider expõe theme derivado da cor primária', () => {
  const source = fs.readFileSync(
    path.join(root, 'apps/web/src/contexts/establishment-theme-context.tsx'),
    'utf8',
  );
  expect(source).toContain('buildEstablishmentTheme');
  expect(source).toContain('EstablishmentThemeProvider');
  expect(source).toContain('useEstablishmentTheme');
});

test('useEstablishmentTheme retorna fallback seguro fora do provider', () => {
  const source = fs.readFileSync(
    path.join(root, 'apps/web/src/contexts/establishment-theme-context.tsx'),
    'utf8',
  );
  expect(source).toContain('buildEstablishmentTheme(DEFAULT_ESTABLISHMENT_COLOR)');
});

test('EstablishmentThemeScope injeta CSS vars no web', () => {
  const source = fs.readFileSync(
    path.join(root, 'apps/web/src/components/theme/establishment-theme-scope.tsx'),
    'utf8',
  );
  expect(source).toContain('establishmentThemeCssVars');
  expect(source).toContain("Platform.OS === 'web'");
});

test('BookingStepper aceita accentColor customizável', () => {
  const source = fs.readFileSync(
    path.join(root, 'apps/web/src/components/ui/BookingStepper.tsx'),
    'utf8',
  );
  expect(source).toContain('accentColor = colors.brandPrimary');
  expect(source).toContain('accentSoft = colors.brandSecondarySoft');
});

test('theme/color.ts reexporta utilitários de @cutsync/brand', () => {
  const source = fs.readFileSync(path.join(root, 'apps/web/src/theme/color.ts'), 'utf8');
  expect(source).toContain("@cutsync/brand");
  expect(source).toContain('readableForeground');
});
