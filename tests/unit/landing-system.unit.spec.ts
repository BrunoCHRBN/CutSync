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
const claims = fs.readFileSync(path.join(root, 'apps/web/src/components/landing/landing-claims.ts'), 'utf8');
const mockData = fs.readFileSync(path.join(root, 'apps/web/src/components/landing/sandbox/mockData.ts'), 'utf8');
const landingDirectory = path.join(root, 'apps/web/src/components/landing');
const motion = fs.readFileSync(path.join(landingDirectory, 'motion/landing-effects.tsx'), 'utf8');
const motionProvider = fs.readFileSync(path.join(landingDirectory, 'motion/landing-motion.tsx'), 'utf8');
const stickyStory = fs.readFileSync(path.join(landingDirectory, 'motion/sticky-product-story.tsx'), 'utf8');

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
  expect(tokens).toContain("canvas: '#F8F7F2'");
  expect(tokens).toContain("canvasWarm: '#EFECE2'");
  expect(tokens).toContain("surface: '#FFFEFA'");
  expect(tokens).toContain("surfaceSoft: '#F3F1E9'");
  expect(tokens).toContain("brandSoft: '#E6EEE8'");
  expect(tokens).toContain("accent: '#C5A66D'");
  expect(tokens).toContain('rgba(255,254,252');
  expect(tokens).not.toContain('dark:');
  expect(contrast('#142119', '#FFFEFC')).toBeGreaterThanOrEqual(4.5);
  expect(contrast('#526057', '#FFFEFC')).toBeGreaterThanOrEqual(4.5);
  expect(contrast('#FFFFFF', '#294B3A')).toBeGreaterThanOrEqual(4.5);
});

test('aplica a hierarquia de superfícies sem transformar tudo em cards', () => {
  expect(clientLanding).toContain("searchSection: { paddingVertical: 48, paddingHorizontal: 40, gap: 32, borderRadius: landingRadii.xl, backgroundColor: 'rgba(239,236,226,0.72)'");
  expect(clientLanding).toContain('resultsSection: { marginTop: -36, paddingVertical: 16, gap: 40 }');
  expect(businessLanding).toContain('heroOuter: { backgroundColor: landingColors.brandStrong }');
  expect(businessLanding).toContain('sandboxSection: { paddingVertical: 24, gap: 40 }');
  expect(businessLanding).toContain("roleSection: { paddingVertical: 72, paddingHorizontal: 48, flexDirection: 'row', alignItems: 'center', gap: 72");
});

test('mantém rotas finas e dois caminhos públicos claros', () => {
  const rootRoute = fs.readFileSync(path.join(root, 'apps/web/src/app/index.tsx'), 'utf8');
  const businessRoute = fs.readFileSync(path.join(root, 'apps/web/src/app/para-estabelecimentos.tsx'), 'utf8');
  expect(rootRoute).toContain('ClientLanding');
  expect(rootRoute).toContain('<Head>');
  expect(businessRoute).toContain('BusinessLanding');
  expect(businessRoute).toContain('<Head>');
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
  expect(primitives).toContain('<Store');
  expect(primitives).not.toContain('getInitials');
  expect(clientLanding).toContain('Math.min(maximumResultColumns, Math.max(filtered.length, 1))');
});

test('humaniza demonstrações sem confundir exemplos com prova social', () => {
  expect(mockData).toContain('João Silva');
  expect(mockData).toContain('Marcos Lima');
  expect(mockData).not.toMatch(/Cliente \d|Profissional [A-Z]/);
  expect(businessLanding).toContain('Demonstração baseada em funcionalidades disponíveis, com dados fictícios.');
  expect(businessLanding.indexOf('Demonstração baseada')).toBeGreaterThan(businessLanding.indexOf('PRODUTO DISPONÍVEL'));
});

test('bloqueia claims comerciais não aprovados e documenta gates mensuráveis', () => {
  expect(clientLanding + businessLanding).not.toMatch(/30 segundos|agenda cheia|perto de você|sem filas|lista de espera|grátis/i);
  expect(businessLanding).not.toContain('Os preços já estão definidos?');
  expect(claims).toContain('baselineWindowDays: 30');
  expect(claims).toContain('publicationCriterion');
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
  trackLandingEvent({ name: 'cta_clicked', page: 'client', position: 'hero_primary', destination: 'search' });
  trackLandingEvent({ name: 'scroll_depth_reached', page: 'business', depth: 50 });
  expect(events).toEqual([
    { name: 'audience_selected', audience: 'observer' },
    { name: 'search_started', filterCount: 2 },
    { name: 'cta_clicked', page: 'client', position: 'hero_primary', destination: 'search' },
    { name: 'scroll_depth_reached', page: 'business', depth: 50 },
  ]);
  expect(JSON.stringify(events)).not.toMatch(/email|phone|address|query/i);
  expect(clientLanding + businessLanding).not.toContain("name: 'audience_selected'");
  configureLandingAnalytics();
});

test('centraliza a coreografia e revela blocos pela entrada real na viewport', () => {
  expect(tokens).toContain('reveal: 620');
  expect(tokens).toContain('stagger: 70');
  expect(motionProvider).toContain('threshold = 0.12');
  expect(motionProvider).toContain('new IntersectionObserver');
  expect(motionProvider).toContain('if (entry.isIntersecting && once)');
  expect(motionProvider).toContain('observer.current?.disconnect()');
  expect(motion).toContain("export type SectionRevealVariant = 'fade-up' | 'fade-side' | 'scale' | 'none'");
  expect(motion).toContain('Math.min(Math.max(index, 0), 5)');
  expect(motion).toContain('quality === \'off\'');
});

test('sincroniza narrativa sticky no desktop e preserva fallback acessível', () => {
  expect(stickyStory).toContain("position: 'sticky'");
  expect(stickyStory).toContain('scrollIntoView');
  expect(stickyStory).toContain("rootMargin: '-30% 0px -45% 0px'");
  expect(businessLanding).toContain('<StickyProductStory');
  expect(businessLanding).toContain('<AnimatedTabContent contentKey={activeTab}');
  expect(businessLanding).toContain('if (current === id)');
  expect(clientLanding).toContain('onHoverIn');
  expect(clientLanding).toContain("quality === 'high'");
});
