/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

import {
  formatDisplayName,
  formatEstablishmentDisplayName,
} from '../../packages/domain/src/display-name';
import { normalizeInstagramHandle } from '../../packages/domain/src/instagram-handle';
import {
  CLIENT_DISCOVERY_QUERY_MAX_LENGTH,
  normalizeClientDiscoveryQuery,
  validateClientDiscoveryQuery,
} from '../../packages/validation/src/client-discovery';

const root = process.cwd();
const readSource = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('formata nomes de exibição em title case pt-BR sem alterar partículas', () => {
  expect(formatDisplayName('  barbeiro bruno  ')).toBe('Barbeiro Bruno');
  expect(formatDisplayName('BRUNO VINICIUS DA SILVA SANTOS')).toBe('Bruno Vinicius da Silva Santos');
  expect(formatDisplayName('barbearia do bruno')).toBe('Barbearia do Bruno');
  expect(formatDisplayName('ana-clara de sousa')).toBe('Ana-Clara de Sousa');
});

test('normaliza nome de estabelecimento igual ao slug e handles de Instagram', () => {
  expect(formatEstablishmentDisplayName('barbearia-do-bruno', 'barbearia-do-bruno')).toBe('Barbearia do Bruno');
  expect(formatEstablishmentDisplayName('Studio Corte', 'studio-corte')).toBe('Studio Corte');
  expect(normalizeInstagramHandle('@@barbeariadobruno')).toBe('barbeariadobruno');
  expect(normalizeInstagramHandle('https://instagram.com/@barbeariadobruno/')).toBe('barbeariadobruno');
  expect(normalizeInstagramHandle('')).toBeNull();
});

test('aplica tipografia e Instagram no Client web explore/detalhe', () => {
  const explore = readSource('apps/web/src/components/screens/ExploreExperience.tsx');
  const detail = readSource('apps/web/src/components/screens/BarbershopProfileExperience.tsx');
  const models = readSource('packages/database/src/models.ts');

  expect(explore).toContain('formatEstablishmentDisplayName');
  expect(detail).toContain('normalizeInstagramHandle');
  expect(detail).toContain('Ver perfil público →');
  expect(detail).toContain('/profile/${professional.profileSlug}');
  expect(models).toContain('professional_profile_slug');
  expect(models).toContain('profileSlug');
});

test('normaliza a busca e rejeita emoji, SVG e excesso de caracteres', () => {
  expect(normalizeClientDiscoveryQuery('  corte   masculino  ')).toBe('corte masculino');
  expect(validateClientDiscoveryQuery('Barbearia Central')).toEqual({ ok: true, query: 'Barbearia Central' });
  expect(validateClientDiscoveryQuery('profissional 💈')).toMatchObject({ ok: false });
  expect(validateClientDiscoveryQuery('<svg>bairro</svg>')).toMatchObject({ ok: false });
  expect(validateClientDiscoveryQuery('a'.repeat(CLIENT_DISCOVERY_QUERY_MAX_LENGTH + 1))).toMatchObject({ ok: false });
});

test('expõe descoberta e detalhe em rotas próprias do Client', () => {
  const layout = readSource('apps/client/src/app/(app)/_layout.tsx');
  const tabsLayout = readSource('apps/client/src/app/(app)/(tabs)/_layout.tsx');
  const discovery = readSource('apps/client/src/screens/client-discovery.tsx');
  const detail = readSource('apps/client/src/screens/client-establishment-detail.tsx');

  expect(fs.existsSync(path.join(root, 'apps/client/src/app/(app)/(tabs)/explore.tsx'))).toBe(true);
  expect(fs.existsSync(path.join(root, 'apps/client/src/app/(app)/establishments/[slug].tsx'))).toBe(true);
  expect(tabsLayout).toContain('name="explore"');
  expect(layout).toContain('name="establishments/[slug]"');
  expect(discovery).toContain('validateClientDiscoveryQuery(nextValue)');
  expect(discovery).toContain('RefreshControl');
  expect(detail).toContain('client-establishment-services');
  expect(detail).toContain('client-establishment-professionals');
});

test('prioriza busca e agendamento direto na descoberta do Client', () => {
  const discovery = readSource('apps/client/src/screens/client-discovery.tsx');
  const detail = readSource('apps/client/src/screens/client-establishment-detail.tsx');
  const ui = readSource('apps/client/src/components/ui/client-ui.tsx');

  expect(discovery).toContain('stickyHeaderIndices={[2]}');
  expect(discovery).toContain('client-discovery-results');
  expect(discovery).not.toContain('Lugares próximos a você');

  expect(detail).toContain('ClientStickyFooter');
  expect(detail).toContain("'client-establishment-service-' + service.id");
  expect(detail).toContain('startBooking({ serviceId: service.id })');
  expect(ui).toContain('export function ClientStickyFooter');
});

test('expõe galeria, coordenadas e ordenação por distância na descoberta', () => {
  const migration = readSource('supabase/migrations/20260806000000_client_discovery_media_and_geo.sql');
  const service = readSource('apps/client/src/features/discovery/client-discovery-service.ts');
  const location = readSource('apps/client/src/features/discovery/use-client-location.ts');
  const discovery = readSource('apps/client/src/screens/client-discovery.tsx');
  const detail = readSource('apps/client/src/screens/client-establishment-detail.tsx');
  const appJson = readSource('apps/client/app.json');
  const sqlTest = readSource('supabase/tests/client_discovery.sql');

  expect(migration).toContain('gallery_urls');
  expect(migration).toContain('target_latitude');
  expect(migration).toContain('client_discovery_distance_meters');
  expect(service).toContain('galleryUrls');
  expect(service).toContain('distanceMeters');
  expect(service).toContain('target_latitude: origin.latitude');
  expect(location).toContain('requestForegroundPermissionsAsync');
  expect(discovery).toContain('client-discovery-nearby-toggle');
  expect(discovery).toContain('distanceMeters');
  expect(detail).toContain('client-establishment-gallery');
  expect(appJson).toContain('expo-location');
  expect(sqlTest).toContain('nearest establishment was not ranked first');
});

test('enriquece o detalhe com horário, mapa e tipografia de display', () => {
  const detail = readSource('apps/client/src/screens/client-establishment-detail.tsx');
  const ui = readSource('apps/client/src/components/discovery/client-discovery-ui.tsx');
  const discovery = readSource('apps/client/src/screens/client-discovery.tsx');

  expect(detail).toContain('getOpeningStatus');
  expect(detail).toContain('client-establishment-hours');
  expect(detail).toContain('client-establishment-open-maps');
  expect(detail).toContain('formatDisplayName');
  expect(ui).toContain('FEATURED_CARD_HEIGHT');
  expect(ui).toContain('formatDisplayName(establishment.name)');
  expect(discovery).toContain("lugar' : 'lugares'");
});

test('abre perfil público nativo a partir da equipe do estabelecimento', () => {
  const layout = readSource('apps/client/src/app/(app)/_layout.tsx');
  const detail = readSource('apps/client/src/screens/client-establishment-detail.tsx');
  const ui = readSource('apps/client/src/components/discovery/client-discovery-ui.tsx');
  const screen = readSource('apps/client/src/screens/client-professional-profile.tsx');
  const service = readSource('apps/client/src/features/discovery/client-professional-profile-service.ts');

  expect(fs.existsSync(path.join(root, 'apps/client/src/app/(app)/professionals/[slug].tsx'))).toBe(true);
  expect(layout).toContain('name="professionals/[slug]"');
  expect(detail).toContain("pathname: '/professionals/[slug]'");
  expect(detail).toContain('establishmentSlug');
  expect(detail).toContain('client-establishment-professional-');
  expect(ui).toContain('Ver perfil público →');
  expect(screen).toContain('client-professional-profile-screen');
  expect(screen).toContain('client-professional-profile-start-booking');
  expect(service).toContain("rpc('get_public_professional_profile'");
  expect(service).not.toMatch(/service.?role/i);
  expect(service).not.toMatch(/console\.(log|info|warn|error)/);
});

test('limita o catálogo no servidor a dados ativos e contratos autenticados', () => {
  const migration = readSource('supabase/migrations/20260722223000_client_discovery.sql');
  const service = readSource('apps/client/src/features/discovery/client-discovery-service.ts');
  const sqlTest = readSource('supabase/tests/client_discovery.sql');

  expect(migration).toContain('list_client_discovery_establishments');
  expect(migration).toContain('get_client_discovery_establishment');
  expect(migration).toContain("establishment.account_status = 'active'");
  expect(migration).toContain('public.is_safe_client_profile_text(normalized_query)');
  expect(migration).toContain('REVOKE ALL ON FUNCTION public.list_client_discovery_establishments');
  expect(migration).toContain('TO authenticated');
  expect(migration).not.toContain('document_number');
  expect(migration).not.toContain('kyc_document_url');
  expect(service).not.toMatch(/service.?role/i);
  expect(service).not.toMatch(/console\.(log|info|warn|error)/);
  expect(sqlTest).toContain("SET LOCAL ROLE anon");
  expect(sqlTest).toContain("slug = 'estudio-bloqueado'");
});
