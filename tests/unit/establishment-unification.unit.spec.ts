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
