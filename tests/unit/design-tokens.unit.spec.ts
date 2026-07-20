/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const root = process.cwd();
const tokens = fs.readFileSync(path.join(root, 'src/theme/tokens.ts'), 'utf8');

const luminance = (hex: string) => {
  const channels = [1, 3, 5]
    .map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};

const contrast = (foreground: string, background: string) => {
  const values = [luminance(foreground), luminance(background)].sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
};

test('mantém a paleta semântica acordada', () => {
  for (const [token, value] of Object.entries({
    brandPrimary: '#2C4334',
    brandPrimaryPressed: '#203327',
    brandSecondary: '#DAD2B6',
    brandSecondarySoft: '#F0ECE0',
    canvas: '#F5F5F2',
    surface: '#FFFFFF',
    textPrimary: '#18201B',
    textSecondary: '#59615B',
  })) {
    expect(tokens).toContain(`${token}: '${value}'`);
  }
});

test('garante contraste AA nos pares funcionais principais', () => {
  expect(contrast('#18201B', '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  expect(contrast('#59615B', '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  expect(contrast('#FFFFFF', '#2C4334')).toBeGreaterThanOrEqual(4.5);
  expect(contrast('#2C4334', '#DAD2B6')).toBeGreaterThanOrEqual(4.5);
});

test('não deixa fonte funcional literal abaixo de 11 px em src', () => {
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (/\.(ts|tsx)$/.test(entry.name)) files.push(absolute);
    }
  };
  visit(path.join(root, 'src'));
  const violations = files.flatMap((file) => {
    const content = fs.readFileSync(file, 'utf8');
    return [...content.matchAll(/fontSize:\s*(\d+(?:\.\d+)?)/g)]
      .filter((match) => Number(match[1]) < 11)
      .map((match) => `${path.relative(root, file)}:${match.index}`);
  });
  expect(violations).toEqual([]);
});
