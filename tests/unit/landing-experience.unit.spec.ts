/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { MARKETING_CONTACT_LIMITS, validateMarketingContactRequest } from '../../packages/validation/src/marketing-contact';
import {
  LANDING_BUSINESS_EVALUATION,
  LANDING_CLIENT_DISCOVERY,
  LANDING_CONTENT,
  LANDING_JOURNEY,
  LANDING_NAV_ITEMS,
  LANDING_SECTION_ORDER,
} from '../../apps/web/src/components/landing/landing-content';
import { LANDING_AVAILABILITY } from '../../apps/web/src/components/landing/landing-claims';
import { LANDING_TESTIMONIALS, getApprovedTestimonials } from '../../apps/web/src/components/landing/landing-testimonials';
import { configureLandingAnalytics, trackLandingEvent } from '../../apps/web/src/components/landing/landing-analytics';

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

const clientLanding = read('apps/web/src/components/landing/client-landing.tsx');
const businessLanding = read('apps/web/src/components/landing/business-landing.tsx');
const migration = read('supabase/migrations/20260805000000_marketing_contact_requests.sql');
const privacyPage = read('apps/web/src/app/privacy.tsx');
const clientRoute = read('apps/web/src/app/index.tsx');
const businessRoute = read('apps/web/src/app/para-estabelecimentos.tsx');
const contactSection = read('apps/web/src/components/landing/sections/contact-section.tsx');
const testimonialsSection = read('apps/web/src/components/landing/sections/testimonials-section.tsx');
const editorialScene = read('apps/web/src/components/landing/sections/editorial-scene.tsx');

const AUDIENCES = ['client', 'business'] as const;

const SECTION_MARKERS: Record<string, string> = {
  search: "registerSection('search')",
  proposal_values: '<ProposalValues',
  comparison: 'testID="business-comparison"',
  ecosystem: '<ConnectedEcosystem',
  roles: "registerSection('roles')",
  services: '<ServicesCapabilities',
  devices: '<DeviceShowcase',
  transparency: '<ProductTransparency',
  security: '<SecurityPrivacy',
  how_to_start: '<HowToStart',
  resources: '<ResourcesHub',
  testimonials: '<TestimonialsSection',
  faq: '<FaqSection',
  contact: '<ContactSection',
  future: '<FutureVision',
};

const SOURCES: Record<(typeof AUDIENCES)[number], string> = { client: clientLanding, business: businessLanding };

test('renderiza cada landing na ordem declarada para a própria jornada', () => {
  for (const audience of AUDIENCES) {
    const ordered = LANDING_JOURNEY[audience].filter((section) => section !== 'hero');
    const positions = ordered.map((section) => SOURCES[audience].indexOf(SECTION_MARKERS[section]));
    expect(positions.every((position) => position > 0)).toBe(true);
    expect([...positions].sort((left, right) => left - right)).toEqual(positions);
    expect(SOURCES[audience].indexOf('<LandingFooter')).toBeGreaterThan(positions[positions.length - 1]);
    expect(SOURCES[audience].indexOf('<LandingNav')).toBeLessThan(positions[0]);
    for (const section of LANDING_JOURNEY[audience]) expect(LANDING_SECTION_ORDER).toContain(section);
  }
});

test('separa a jornada de descoberta do cliente da jornada de avaliação do estabelecimento', () => {
  expect(LANDING_JOURNEY.client).not.toEqual(LANDING_JOURNEY.business);

  // O cliente chega para encontrar um horário: a busca vem primeiro e o "como funciona" logo depois.
  expect(LANDING_JOURNEY.client[1]).toBe('search');
  expect(LANDING_JOURNEY.client.indexOf('how_to_start')).toBeLessThan(LANDING_JOURNEY.client.indexOf('proposal_values'));
  expect(LANDING_JOURNEY.client).not.toContain('comparison');
  expect(LANDING_JOURNEY.client).not.toContain('roles');

  // O estabelecimento chega para avaliar: proposta e problema primeiro, decisão só depois da demonstração.
  expect(LANDING_JOURNEY.business[1]).toBe('proposal_values');
  expect(LANDING_JOURNEY.business.indexOf('comparison')).toBeLessThan(LANDING_JOURNEY.business.indexOf('services'));
  expect(LANDING_JOURNEY.business.indexOf('roles')).toBeLessThan(LANDING_JOURNEY.business.indexOf('services'));
  expect(LANDING_JOURNEY.business.indexOf('services')).toBeLessThan(LANDING_JOURNEY.business.indexOf('how_to_start'));
  expect(LANDING_JOURNEY.business).not.toContain('search');

  // A navegação do header acompanha a jornada, mantendo os três destinos institucionais nas duas páginas.
  expect(LANDING_NAV_ITEMS.client.map((item) => item.id)).not.toEqual(LANDING_NAV_ITEMS.business.map((item) => item.id));
  for (const audience of AUDIENCES) {
    const ids = LANDING_NAV_ITEMS[audience].map((item) => item.id);
    for (const institutional of ['security', 'resources', 'contact']) expect(ids).toContain(institutional);
    for (const item of LANDING_NAV_ITEMS[audience]) expect(LANDING_JOURNEY[audience]).toContain(item.id);
  }

  // Cada página tem a própria superfície de topo, sem componente compartilhado por condicional.
  expect(clientLanding).toContain('LANDING_CLIENT_DISCOVERY');
  expect(clientLanding).not.toContain('LANDING_BUSINESS_EVALUATION');
  expect(businessLanding).toContain('LANDING_BUSINESS_EVALUATION');
  expect(businessLanding).not.toContain('LANDING_CLIENT_DISCOVERY');
});

test('adapta o conteúdo por audiência sem duplicar a narrativa', () => {
  expect(LANDING_CONTENT.client.proposal.title).not.toEqual(LANDING_CONTENT.business.proposal.title);
  expect(LANDING_CONTENT.client.ecosystem.steps[0].role).toBe('Cliente');
  expect(LANDING_CONTENT.business.ecosystem.steps[0].role).toBe('Estabelecimento');
  expect(LANDING_CONTENT.business.ecosystem.steps.map((step) => step.role)).toContain('Profissional');
  expect(LANDING_CONTENT.client.ecosystem.steps.map((step) => step.role)).toContain('Profissional');
  for (const audience of AUDIENCES) {
    expect(LANDING_CONTENT[audience].proposal.values.map((value) => value.title))
      .toEqual(['Clareza', 'Autonomia', 'Confiança', 'Cuidado']);
    expect(LANDING_CONTENT[audience].howToStart.steps).toHaveLength(3);
    expect(LANDING_CONTENT[audience].faq.entries.length).toBeGreaterThanOrEqual(4);
  }
  // Os princípios da marca são os mesmos, mas cada audiência lê o que eles significam para ela.
  expect(LANDING_CONTENT.client.proposal.values.map((value) => value.description))
    .not.toEqual(LANDING_CONTENT.business.proposal.values.map((value) => value.description));
  expect(LANDING_CONTENT.business.contact.title).not.toEqual(LANDING_CONTENT.client.contact.title);
  expect(contactSection).toContain("audience === 'business' && (");
});

test('separa disponível hoje de em validação usando o registro de claims', () => {
  const available = LANDING_AVAILABILITY.filter((item) => item.state === 'available');
  const validating = LANDING_AVAILABILITY.filter((item) => item.state === 'validating');
  expect(available.length).toBeGreaterThanOrEqual(4);
  expect(validating.map((item) => item.id)).toContain('live_status_page');
  expect(validating.map((item) => item.id)).toContain('public_testimonials');
  expect(validating.filter((item) => item.claimId).length).toBeGreaterThanOrEqual(3);
  expect(available.some((item) => item.claimId)).toBe(false);
});

test('não publica preço do SaaS, certificações ou métricas inventadas', () => {
  const source = [
    clientLanding,
    businessLanding,
    JSON.stringify(LANDING_CONTENT),
    JSON.stringify(LANDING_CLIENT_DISCOVERY),
    JSON.stringify(LANDING_BUSINESS_EVALUATION),
    JSON.stringify(LANDING_AVAILABILITY),
  ].join('\n');
  for (const forbidden of [
    /R\$\s*\d+\s*\/\s*m[êe]s/i,
    /plano (b[áa]sico|pro|premium)/i,
    /ISO\s?\d{4}/i,
    /certificad[oa]/i,
    /\d+\s*(mil|milh[õo]es)\s+(clientes|estabelecimentos|agendamentos)/i,
    /\d{2,}%\s*(de\s*)?(aumento|crescimento|satisfa)/i,
    /avalia(ç|c)ão m[ée]dia de \d/i,
    /em breve|lan(ç|c)amento em|dispon[íi]vel na (app store|google play)/i,
  ]) expect(source).not.toMatch(forbidden);
});

test('mantém recursos como central interna, sem blog nem CMS', () => {
  for (const audience of AUDIENCES) {
    const cards = LANDING_CONTENT[audience].resources.cards;
    expect(cards.length).toBeGreaterThanOrEqual(5);
    for (const card of cards) {
      if (card.target === 'route') expect(['/privacy', '/account-deletion']).toContain(card.reference);
      else expect(LANDING_SECTION_ORDER).toContain(card.reference as never);
    }
    expect(JSON.stringify(cards)).not.toMatch(/blog|newsletter|cms|artigo/i);
  }
});

test('mantém depoimentos ocultos até existir aprovação editorial', () => {
  expect(LANDING_TESTIMONIALS).toHaveLength(0);
  expect(getApprovedTestimonials('client')).toHaveLength(0);
  expect(getApprovedTestimonials('business')).toHaveLength(0);
  expect(testimonialsSection).toContain('if (testimonials.length === 0) return null;');
  expect(read('apps/web/src/components/landing/landing-testimonials.ts')).toContain('editorialApproval.approved === true');
});

test('expõe links institucionais e a jornada de acesso em ambas as páginas', () => {
  const footer = read('apps/web/src/components/landing/sections/landing-footer.tsx');
  for (const label of ['Cliente', 'Estabelecimento', 'Entrar', 'Segurança', 'Privacidade', 'Exclusão de conta', 'Contato']) {
    expect(footer).toContain(`label: '${label}'`);
  }
  expect(footer).toContain("href: '/privacy'");
  expect(footer).toContain("href: '/account-deletion'");
  const security = read('apps/web/src/components/landing/sections/security-privacy.tsx');
  expect(security).toContain("['Política de privacidade', '/privacy'");
  expect(security).toContain("['Exclusão de conta', '/account-deletion'");
});

test('usa cenas ilustrativas em WebP com texto alternativo e expo-image', () => {
  expect(editorialScene).toContain("from 'expo-image'");
  expect(editorialScene).toContain('landing-client-scene.webp');
  expect(editorialScene).toContain('landing-business-scene.webp');
  expect(editorialScene).toContain('cachePolicy="memory-disk"');
  expect(editorialScene).toContain('alt={alternativeText}');
  for (const asset of ['landing-client-scene.webp', 'landing-business-scene.webp']) {
    expect(fs.existsSync(path.join(root, 'apps/web/assets/images/landing', asset))).toBe(true);
  }
  expect(clientLanding).toContain('Cena ilustrativa');
  expect(businessLanding).toContain('Cena ilustrativa');
});

test('atualiza SEO e headings das duas rotas', () => {
  for (const route of [clientRoute, businessRoute]) {
    expect(route).toContain('rel="canonical"');
    expect(route).toContain('og:locale');
    expect(route).toContain('name="robots"');
    expect(route).toContain('twitter:card');
  }
  expect(clientRoute).toContain('CutSync — Encontre serviços e agende seu horário');
  expect(businessRoute).toContain('CutSync para estabelecimentos');
  expect(read('apps/web/src/components/landing/sections/section-shell.tsx')).toContain('accessibilityRole="header"');
});

test('valida o formulário de contato antes de chamar o Supabase', () => {
  expect(MARKETING_CONTACT_LIMITS.requestsPer24h).toBe(3);
  const base = { origin: 'client' as const, name: 'Ana Souza', email: ' ANA@Exemplo.com ', message: 'Gostaria de ajuda para agendar.', consent: true };
  const valid = validateMarketingContactRequest(base);
  expect(valid.ok).toBe(true);
  if (valid.ok) {
    expect(valid.value.email).toBe('ana@exemplo.com');
    expect(valid.value.establishmentName).toBeNull();
  }
  expect(validateMarketingContactRequest({ ...base, name: 'A' })).toMatchObject({ ok: false, field: 'name' });
  expect(validateMarketingContactRequest({ ...base, email: 'invalido' })).toMatchObject({ ok: false, field: 'email' });
  expect(validateMarketingContactRequest({ ...base, message: 'curta' })).toMatchObject({ ok: false, field: 'message' });
  expect(validateMarketingContactRequest({ ...base, consent: false })).toMatchObject({ ok: false, field: 'consent' });
  expect(validateMarketingContactRequest({ ...base, name: '<script>' })).toMatchObject({ ok: false, field: 'name' });
  const business = validateMarketingContactRequest({ ...base, origin: 'business', establishmentName: '  Studio  Central ' });
  expect(business.ok).toBe(true);
  if (business.ok) expect(business.value.establishmentName).toBe('Studio Central');
  const clientWithEstablishment = validateMarketingContactRequest({ ...base, establishmentName: 'Studio Central' });
  if (clientWithEstablishment.ok) expect(clientWithEstablishment.value.establishmentName).toBeNull();
});

test('migration protege a tabela de solicitações comerciais', () => {
  expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.marketing_contact_requests');
  expect(migration).toContain('ALTER TABLE public.marketing_contact_requests ENABLE ROW LEVEL SECURITY');
  expect(migration).toContain('FORCE ROW LEVEL SECURITY');
  expect(migration).toContain('REVOKE ALL ON TABLE public.marketing_contact_requests FROM PUBLIC, anon, authenticated');
  expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.submit_marketing_contact_request(text, text, text, text, text, boolean, text) TO anon, authenticated');
  expect(migration).toContain("SET search_path = pg_catalog, public");
  expect(migration).toContain('recent_requests >= 3');
  expect(migration).toContain("interval '24 hours'");
  expect(migration).toContain("char_length(btrim(COALESCE(contact_trap, ''))) > 0");
  expect(migration).toMatch(/status', 'received'/);
  expect(migration).not.toMatch(/ip_address|user_agent|CREATE POLICY/i);
  expect(privacyPage).toContain('Solicitações comerciais e contato pelas páginas públicas');
});

test('analytics de navegação e contato não carrega dados pessoais', () => {
  const events: unknown[] = [];
  configureLandingAnalytics((event) => events.push(event));
  trackLandingEvent({ name: 'section_navigated', page: 'client', section: 'contact' });
  trackLandingEvent({ name: 'contact_opened', page: 'business' });
  trackLandingEvent({ name: 'contact_submitted', page: 'business' });
  trackLandingEvent({ name: 'contact_result', page: 'business', result: 'received' });
  expect(events).toEqual([
    { name: 'section_navigated', page: 'client', section: 'contact' },
    { name: 'contact_opened', page: 'business' },
    { name: 'contact_submitted', page: 'business' },
    { name: 'contact_result', page: 'business', result: 'received' },
  ]);
  const payloadValues = events.flatMap((event) => Object.entries(event as Record<string, unknown>)
    .filter(([key]) => key !== 'name')
    .map(([, value]) => String(value)));
  expect(payloadValues.join('|')).not.toMatch(/@|nome|e-mail|mensagem|telefone/i);
  configureLandingAnalytics();
});

test('mantém sticky storytelling apenas no desktop e movimento reduzido respeitado', () => {
  expect(businessLanding).toContain('isDesktop ? (');
  expect(businessLanding).toContain('<StickyProductStory');
  expect(read('apps/web/src/components/landing/sections/use-section-anchors.ts')).toContain('animated: !reducedMotion');
});
