/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const root = process.cwd();
const readSource = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('useEstablishmentRouteParams resolve slug e barbershopId', () => {
  const source = readSource('apps/web/src/hooks/use-establishment-route-params.ts');
  expect(source).toContain("by: 'slug'");
  expect(source).toContain("by: 'id'");
  expect(source).toContain('reschedule_id');
});

test('rotas públicas reexportam experiências unificadas', () => {
  const slugProfile = readSource('apps/web/src/app/[slug]/index.tsx');
  const slugBooking = readSource('apps/web/src/app/[slug]/booking.tsx');
  const clientProfile = readSource('apps/web/src/components/screens/BarbershopProfileExperience.tsx');
  const clientBooking = readSource('apps/web/src/components/screens/BookingExperience.tsx');
  const unifiedBooking = readSource('apps/web/src/components/establishment/EstablishmentBookingExperience.tsx');

  expect(slugProfile).toContain('EstablishmentProfileExperience');
  expect(slugBooking).toContain('EstablishmentBookingExperience');
  expect(clientProfile).toContain('EstablishmentProfileExperience');
  expect(clientBooking).toContain('EstablishmentBookingExperience');
  expect(unifiedBooking).toContain("rpc('reschedule_appointment'");
  expect(unifiedBooking).toContain('useEstablishmentRouteParams');
  expect(unifiedBooking).toContain('EstablishmentThemeProvider');
});

test('perfil público aplica tema da marca nos pontos visuais', () => {
  const profile = readSource('apps/web/src/components/establishment/EstablishmentProfileExperience.tsx');
  const sheet = readSource('apps/web/src/components/professional/ProfessionalProfileSheet.tsx');
  const fullSource = profile + sheet;

  expect(fullSource).toContain('useEstablishmentTheme');
  expect(fullSource).toContain('accentBorderLeft(theme)');
  expect(fullSource).toContain('barbershop-profile-slogan');
  expect(fullSource).toContain('barbershop-service-');
  expect(fullSource).toContain('barbershop-profile-route-button');
  expect(fullSource).toContain('barbershop-professional-book-button');
  expect(fullSource).toContain('primaryButton(theme)');
});

test('booking aplica tema da marca nos pontos visuais', () => {
  const booking = readSource('apps/web/src/components/establishment/EstablishmentBookingExperience.tsx');

  expect(booking).toContain('EstablishmentThemeProvider');
  expect(booking).toContain('selectedSurface(theme)');
  expect(booking).toContain('selectedChip(theme)');
  expect(booking).toContain('accentText(theme)');
  expect(booking).toContain('primaryButton(theme)');
  expect(booking).not.toContain('#113939');
  expect(booking).not.toContain('colors.brandPrimary');
});

test('explore cards aplicam tema da marca no CTA', () => {
  const explore = readSource('apps/web/src/components/screens/ExploreExperience.tsx');

  expect(explore).toContain('buildEstablishmentTheme(shop.primaryColor)');
  expect(explore).toContain('client-shop-card-${shop.id}-cta');
  expect(explore).toContain('accentText(theme)');
  expect(explore).toContain('primaryButton(theme)');
  expect(explore).toContain('logoRing(theme)');
});

test('settings usa BrandColorPicker e prévia expandida da marca', () => {
  const settings = readSource('apps/web/src/components/screens/SettingsExperience.tsx');
  const picker = readSource('apps/web/src/components/ui/BrandColorPicker.tsx');
  const preview = readSource('apps/web/src/components/settings/EstablishmentBrandPreview.tsx');

  expect(settings).toContain('BrandColorPicker');
  expect(settings).toContain('EstablishmentBrandPreview');
  expect(picker).toContain('ESTABLISHMENT_COLOR_PRESETS');
  expect(picker).toContain('settings-color-input');
  expect(picker).toContain('meetsWcagAA');
  expect(preview).toContain('Agendar agora');
  expect(preview).toContain('settings-explore-card-preview');
  expect(preview).toContain('primaryButton(theme)');
});
