/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { configureLandingAnalytics, trackLandingEvent } from '../../src/components/landing/landing-analytics';

const root = process.cwd();
const tokens = fs.readFileSync(path.join(root, 'src/theme/landing-tokens.ts'), 'utf8');
const clientLanding = fs.readFileSync(path.join(root, 'src/components/landing/client-landing.tsx'), 'utf8');
const businessLanding = fs.readFileSync(path.join(root, 'src/components/landing/business-landing.tsx'), 'utf8');

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

test('mantém os tokens claros e os pares principais em contraste AA', () => {
  expect(tokens).toContain("canvas: '#F4F3EE'");
  expect(tokens).toContain("surface: '#FFFFFF'");
  expect(tokens).not.toContain('dark:');
  expect(contrast('#132019', '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  expect(contrast('#4F5D55', '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  expect(contrast('#FFFFFF', '#294B3A')).toBeGreaterThanOrEqual(4.5);
});

test('mantém rotas finas e a segmentação pública contratada', () => {
  const rootRoute = fs.readFileSync(path.join(root, 'src/app/index.tsx'), 'utf8');
  const businessRoute = fs.readFileSync(path.join(root, 'src/app/para-estabelecimentos.tsx'), 'utf8');
  expect(rootRoute).toContain('ClientLanding');
  expect(rootRoute.split('\n').length).toBeLessThan(10);
  expect(businessRoute).toContain('BusinessLanding');
  expect(businessRoute.split('\n').length).toBeLessThan(10);
  for (const audience of ['client', 'business', 'observer']) expect(clientLanding).toContain(`'${audience}'`);
});

test('não publica disponibilidade, popularidade ou preço comercial inventado', () => {
  expect(clientLanding).not.toContain('Horário livre nas próximas 2 horas');
  expect(clientLanding).not.toContain('Populares perto de ti');
  expect(clientLanding).not.toContain('reviews_count: shop.average_rating ? 1 : 0');
  expect(businessLanding).not.toContain('R$ 49');
  expect(businessLanding).not.toContain('R$ 119');
  expect(businessLanding).toContain('PREÇO EM VALIDAÇÃO');
});

test('analytics usa adaptador neutro e payload sem dados pessoais', () => {
  const events: unknown[] = [];
  configureLandingAnalytics((event) => events.push(event));
  trackLandingEvent({ name: 'audience_selected', audience: 'observer' });
  trackLandingEvent({ name: 'search_started', filterCount: 2 });
  expect(events).toEqual([
    { name: 'audience_selected', audience: 'observer' },
    { name: 'search_started', filterCount: 2 },
  ]);
  expect(JSON.stringify(events)).not.toMatch(/email|phone|address|query/i);
  configureLandingAnalytics();
});

