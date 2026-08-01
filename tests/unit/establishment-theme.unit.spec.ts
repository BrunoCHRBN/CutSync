/// <reference types="node" />

import { expect, test } from '@playwright/test';

import {
  buildEstablishmentTheme,
  DEFAULT_ESTABLISHMENT_COLOR,
  ESTABLISHMENT_COLOR_PRESETS,
  getContrastRatio,
  meetsWcagAA,
  normalizeHex,
  readableForeground,
} from '../../packages/brand/src/index';

test('normaliza hex com e sem hash', () => {
  expect(normalizeHex('f5a524')).toBe('#F5A524');
  expect(normalizeHex('#F5A524')).toBe('#F5A524');
  expect(normalizeHex('invalid')).toBeNull();
  expect(normalizeHex('')).toBeNull();
});

test('buildEstablishmentTheme usa fallback para hex inválido', () => {
  const theme = buildEstablishmentTheme('not-a-color');
  expect(theme.primary).toBe(DEFAULT_ESTABLISHMENT_COLOR);
  expect(theme.onPrimary).toBe('#FFFFFF');
  expect(theme.soft).toBe(`${DEFAULT_ESTABLISHMENT_COLOR}1F`);
});

test('buildEstablishmentTheme gera tokens derivados consistentes', () => {
  const theme = buildEstablishmentTheme('#F5A524');
  expect(theme.primary).toBe('#F5A524');
  expect(theme.onPrimary).toBe(readableForeground('#F5A524'));
  expect(theme.soft).toBe('#F5A5241F');
  expect(theme.muted).toBe('#F5A52459');
  expect(theme.ring).toBe('#F5A52433');
  expect(theme.pressed).toMatch(/^#[0-9A-F]{6}$/);
});

test('presets da paleta atendem contraste AA', () => {
  for (const preset of ESTABLISHMENT_COLOR_PRESETS) {
    const theme = buildEstablishmentTheme(preset.hex);
    expect(meetsWcagAA(theme), `preset ${preset.id} (${preset.hex})`).toBe(true);
    expect(getContrastRatio(theme.onPrimary, theme.primary)).toBeGreaterThanOrEqual(4.5);
  }
});

test('readableForeground escolhe texto escuro em fundos claros', () => {
  expect(readableForeground('#F5A524')).toBe('#171717');
  expect(readableForeground('#2C4334')).toBe('#FFFFFF');
});
