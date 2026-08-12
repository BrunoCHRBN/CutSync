/// <reference types="node" />

import { expect, test } from '@playwright/test';

import {
  designSystem,
  resolveBrandTheme,
  validateBrandConfiguration,
} from '../../packages/brand/src/index';
import {
  cancellationReasonLabel,
  formatCurrency,
  formatLocalDate,
  resolveExperienceFlags,
  validateProductEvent,
} from '../../packages/domain/src/index';

test('expõe mínimos compartilhados de legibilidade e interação', () => {
  expect(designSystem.typography.minimumFunctionalSize).toBe(12);
  expect(designSystem.sizing.minimumTouchTarget).toBeGreaterThanOrEqual(48);
  expect(designSystem.icons.standard).toBe(20);
  expect(designSystem.elevation.modal.level).toBeGreaterThan(designSystem.elevation.card.level);
  expect(designSystem.breakpoints).toMatchObject({
    phone: 390,
    tablet: 768,
    tabletLandscape: 1024,
    desktop: 1440,
    desktopWide: 1920,
  });
});

test('resolve herança de marca e explicita overrides da unidade', () => {
  const resolved = resolveBrandTheme({
    organization: { presetId: 'editorial', primaryColor: '#2C4334', description: 'Marca do grupo' },
    establishment: { primaryColor: '#1B3A5C' },
    publishedVersionId: 'version-1',
  });

  expect(resolved.primary).toBe('#1B3A5C');
  expect(resolved.presetId).toBe('editorial');
  expect(resolved.sources.primaryColor).toBe('establishment');
  expect(resolved.sources.presetId).toBe('organization');
  expect(resolved.overriddenFields).toContain('primaryColor');
  expect(resolved.meetsWcagAA).toBe(true);
});

test('bloqueia publicação de mídia sem acessibilidade e consentimento', () => {
  const validation = validateBrandConfiguration({
    presetId: 'classic',
    primaryColor: '#2C4334',
    logoUrl: 'https://example.test/logo.png',
    logoAltText: null,
    bannerUrl: null,
    bannerAltText: null,
    gallery: [{ url: 'https://example.test/client.png', altText: '', consentConfirmed: false }],
    description: 'Descrição pública',
  });

  expect(validation.valid).toBe(false);
  expect(validation.errors).toContain('brand_logo_alt_required');
  expect(validation.errors).toContain('brand_gallery_alt_required');
  expect(validation.errors).toContain('brand_gallery_consent_required');
});

test('limita mídia e conteúdo editorial do tema publicado', () => {
  const validation = validateBrandConfiguration({
    presetId: 'classic',
    primaryColor: '#2C4334',
    logoUrl: 'http://example.test/logo.png',
    logoAltText: 'Logo',
    logoConsentConfirmed: true,
    bannerUrl: null,
    bannerAltText: null,
    gallery: Array.from({ length: 13 }, (_, index) => ({
      url: `https://example.test/${index}.webp`,
      altText: `Ambiente ${index}`,
      consentConfirmed: true,
    })),
    description: 'x'.repeat(601),
  });

  expect(validation.errors).toContain('brand_gallery_limit');
  expect(validation.errors).toContain('brand_media_https_required');
  expect(validation.errors).toContain('brand_description_limit');
});

test('traduz código operacional e formata moeda/data com contexto explícito', () => {
  expect(cancellationReasonLabel('client_transport')).toBe('Problema com transporte');
  expect(cancellationReasonLabel('unknown_internal_code')).toBe('Outro motivo');
  expect(formatCurrency(49.9, 'BRL')).toContain('49,90');
  expect(formatLocalDate('2026-08-17')).toContain('17 de agosto');
});

test('rejeita propriedades de analytics que podem conter PII', () => {
  const base = {
    name: 'booking_started' as const,
    surface: 'client_mobile' as const,
    role: 'client' as const,
    route: '/booking/unit',
    experienceVersion: 'v2',
    occurredAt: '2026-08-12T12:00:00.000Z',
  };

  expect(validateProductEvent({ ...base, properties: { recoveryStrategy: 'next_date' } })).toEqual([]);
  expect(validateProductEvent({ ...base, properties: { client_email: 'private@example.test' } }))
    .toContain('event_property_forbidden:client_email');
});

test('mantém redesigns de jornada desligados até rollout explícito', () => {
  const flags = resolveExperienceFlags({ client_availability_recovery_v2: true });
  expect(flags.ui_foundation_v2).toBe(true);
  expect(flags.client_availability_recovery_v2).toBe(true);
  expect(flags.brand_studio_v2).toBe(false);
});
