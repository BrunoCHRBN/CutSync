/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { configureLandingAnalytics, trackLandingEvent } from '../../apps/web/src/components/landing/landing-analytics';

const root = process.cwd();
const tokens = fs.readFileSync(path.join(root, 'apps/web/src/theme/landing-tokens.ts'), 'utf8');
const clientLanding = fs.readFileSync(path.join(root, 'apps/web/src/components/landing/client-landing.tsx'), 'utf8');
const businessLanding = fs.readFileSync(path.join(root, 'apps/web/src/components/landing/business-landing.tsx'), 'utf8');
const capabilities = fs.readFileSync(path.join(root, 'apps/web/src/components/landing/landing-capabilities.ts'), 'utf8');
const primitives = fs.readFileSync(path.join(root, 'apps/web/src/components/landing/landing-primitives.tsx'), 'utf8');
const landingDirectory = path.join(root, 'apps/web/src/components/landing');

const readSourceTree = (directory: string): string => fs.readdirSync(directory, { withFileTypes: true }).map((entry) => {
  const target = path.join(directory, entry.name);
  if (entry.isDirectory()) return readSourceTree(target);
  return /\.(ts|tsx)$/.test(entry.name) ? fs.readFileSync(target, 'utf8') : '';
}).join('\n');

const landingSource = readSourceTree(landingDirectory);

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
  expect(tokens).toContain("canvas: '#F7F6F2'");
  expect(tokens).toContain("canvasWarm: '#EEEAE1'");
  expect(tokens).toContain("surface: '#FFFEFC'");
  expect(tokens).toContain("surfaceSoft: '#F4F2EC'");
  expect(tokens).toContain("brandSoft: '#E3ECE6'");
  expect(tokens).toContain("accent: '#C5A66D'");
  expect(tokens).toContain('rgba(255,254,252');
  expect(tokens).not.toContain('dark:');
  expect(contrast('#142119', '#FFFEFC')).toBeGreaterThanOrEqual(4.5);
  expect(contrast('#526057', '#FFFEFC')).toBeGreaterThanOrEqual(4.5);
  expect(contrast('#FFFFFF', '#294B3A')).toBeGreaterThanOrEqual(4.5);
});

test('aplica a hierarquia de superfícies sem transformar tudo em cards', () => {
  expect(clientLanding).toContain('searchSection: { padding: 22, gap: 20, borderRadius: landingRadii.xl, backgroundColor: landingColors.canvasWarm');
  expect(clientLanding).toContain('resultsSection: { padding: 28, gap: 24, borderRadius: landingRadii.xl, backgroundColor: landingColors.surface }');
  expect(businessLanding).toContain('heroOuter: { backgroundColor: landingColors.brandStrong }');
  expect(businessLanding).toContain('sandboxSection: { padding: 30, gap: 22, borderRadius: landingRadii.xl, backgroundColor: landingColors.surface');
  expect(businessLanding).toContain('roleSection: { padding: 38, flexDirection: \'row\', alignItems: \'center\', gap: 40, borderRadius: landingRadii.xl, backgroundColor: landingColors.brandSoft }');
});

test('mantém rotas finas e dois caminhos públicos claros', () => {
  const rootRoute = fs.readFileSync(path.join(root, 'apps/web/src/app/index.tsx'), 'utf8');
  const businessRoute = fs.readFileSync(path.join(root, 'apps/web/src/app/para-estabelecimentos.tsx'), 'utf8');
  expect(rootRoute).toContain('ClientLanding');
  expect(rootRoute.split('\n').length).toBeLessThan(10);
  expect(businessRoute).toContain('BusinessLanding');
  expect(businessRoute.split('\n').length).toBeLessThan(10);
  expect(clientLanding).not.toContain('AudienceSelector');
  expect(clientLanding).not.toContain("name: 'audience_selected'");
  expect(clientLanding).toContain("legacyAudience === 'business'");
  expect(clientLanding).toContain("router.replace('/para-estabelecimentos'");
  for (const audience of ['client', 'observer']) expect(clientLanding).toContain(`legacyAudience === '${audience}'`);
});

test('não publica disponibilidade, popularidade ou preço comercial inventado', () => {
  expect(clientLanding).not.toContain('Horário livre nas próximas 2 horas');
  expect(clientLanding).not.toContain('Populares perto de ti');
  expect(clientLanding).not.toMatch(/recomendad[oa]s?/i);
  expect(clientLanding).not.toMatch(/popular(?:es)?/i);
  expect(clientLanding).not.toContain('reviews_count: shop.average_rating ? 1 : 0');
  expect(businessLanding).not.toContain('R$ 49');
  expect(businessLanding).not.toContain('R$ 119');
  expect(businessLanding).not.toContain('PREÇO EM VALIDAÇÃO');
  expect(businessLanding).not.toContain('MODELO COMERCIAL EM VALIDAÇÃO');
});

test('usa mídia real somente nos resultados e fornece fallback visual', () => {
  expect(clientLanding).toContain('<EstablishmentMedia');
  expect(clientLanding).toContain('uri={establishment.bannerUrl || establishment.logoUrl}');
  expect(clientLanding).not.toContain('<EstablishmentMedia name="hero"');
  expect(primitives).toContain('cachePolicy="memory-disk"');
  expect(primitives).toContain('onError={() => setFailed(true)}');
  expect(primitives).toContain('mediaFallback');
  expect(clientLanding).toContain('Math.min(maximumResultColumns, Math.max(filtered.length, 1))');
});

test('limita as demonstrações públicas às capacidades disponíveis', () => {
  for (const capability of ['agenda', 'services', 'team']) expect(capabilities).toContain(`id: '${capability}'`);
  for (const unsupported of ['coverage', 'validation', 'commissions']) expect(capabilities).not.toContain(`id: '${unsupported}'`);
  expect(businessLanding).toContain('Demonstração baseada em funcionalidades disponíveis, com dados fictícios.');
});

test('bloqueia promessas públicas sem suporte no produto', () => {
  for (const claim of [
    /troca de emergência/i,
    /ausência detectada/i,
    /auto-?ativação imediata/i,
    /repasse automatizado/i,
    /pix liberado/i,
    /simulador real/i,
  ]) expect(landingSource).not.toMatch(claim);
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
  expect(clientLanding + businessLanding).not.toContain("name: 'audience_selected'");
  configureLandingAnalytics();
});
