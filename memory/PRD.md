# CutSync — PRD e registro de entregas

## Problema original (entrega atual)
Redesign ampliado das landings públicas CutSync (`/` para Cliente e `/para-estabelecimentos` para Estabelecimento),
mantendo as duas experiências independentes sob uma arquitetura editorial comum, apresentando o ecossistema
Cliente → Estabelecimento → Profissional, com identidade verde-floresta, marfim e dourado, sem copiar layouts
de Fresha/Mercury/Superhuman. Conversões: busca/agendamento (Cliente) e contato comercial (Estabelecimento).
"Valores" = princípios (clareza, autonomia, confiança, cuidado), sem preços públicos do SaaS.

## Arquitetura
- Monorepo npm workspaces: `apps/web` (Expo Router + React Native Web), `apps/client`, `apps/business`, `apps/control`, `packages/*`.
- Backend/dados: Supabase (Postgres + RLS + RPCs) — projeto Homolog `hxoenfnszrrgaqxplzmd`.
- Testes: Playwright (`--project=unit` para specs de contrato e viewports 390/768/1024/1440/1920 para E2E).

## Personas
- **Cliente**: descobre estabelecimentos, consulta serviços/preços/horários e agenda.
- **Estabelecimento (dono/admin)**: publica vitrine, organiza agenda, serviços e equipe.
- **Profissional**: acompanha a própria agenda e conclui atendimentos (explicado na landing de Estabelecimento).

## Requisitos estáticos
- Sem preço público do SaaS, certificações não obtidas, métricas inventadas ou funcionalidades futuras como disponíveis.
- Depoimentos ocultos até aprovação editorial real (`LandingTestimonial`).
- "Recursos" é central interna de links, não blog/CMS.
- Status operacional ao vivo fora de escopo até existir telemetria.
- Analytics sem PII.

## Implementado — 30/07/2026 (redesign das landings)
- Componentes compartilhados por `audience="client" | "business"` em `apps/web/src/components/landing/sections/`:
  nav de seções, proposta e valores, ecossistema conectado, serviços e capacidades, produto em dispositivos,
  transparência (Disponível hoje / Em validação), segurança e privacidade, como começar, recursos úteis,
  depoimentos (oculto), FAQ acordeão, contato, visão de futuro e footer expandido.
- Conteúdo centralizado em `landing-content.ts`; disponibilidade em `landing-claims.ts` (`LANDING_AVAILABILITY`).
- Contrato `LandingTestimonial` + `getApprovedTestimonials` (lista vazia por decisão editorial).
- Duas cenas ilustrativas 16:9 geradas por IA, otimizadas em WebP 1920×1080, renderizadas com `expo-image`.
- Navegação por seções com refs/scroll acessível, respeitando movimento reduzido; sticky storytelling só no desktop.
- SEO atualizado nas duas rotas (canonical, robots, OG, Twitter, descrições).
- Supabase: migration `20260805000000_marketing_contact_requests.sql` com tabela, RLS forçada, sem policies,
  RPC `submit_marketing_contact_request` (validação server-side, honeypot, limite de 3 por e-mail em 24h, resposta genérica),
  grants apenas para `anon`/`authenticated`.
- Validação compartilhada `packages/validation/src/marketing-contact.ts`.
- Política de privacidade atualizada com a seção de solicitações comerciais.
- Analytics: `section_navigated`, `contact_opened`, `contact_submitted`, `contact_result` (sem PII).
- Testes: `tests/unit/landing-experience.unit.spec.ts` (13 casos), `tests/e2e/landing-experience.spec.ts`
  (16 casos por viewport), `tests/sql/marketing_contact_requests.test.sql`.

## Validações executadas
- `npm run typecheck:shared`: OK.
- `npm run typecheck:web`: sem novos erros (baseline pré-existente mantido).
- `npm run build:web`: OK.
- Unit (`--project=unit`): landing specs 100% verdes; 6 falhas pré-existentes fora do escopo
  (client-auth-foundation, client-discovery, design-tokens, governance-compliance-p1).
- E2E landing: 390, 768, 1024, 1440 e 1920 verdes, sem overflow horizontal.

## Backlog priorizado
- **P0**: aplicar a migration em Homolog e CutSync.io; executar `tests/sql/...` e os advisors de segurança/desempenho;
  configurar variáveis públicas na Vercel; validar a RPC como visitante anônimo.
- **P1**: regerar snapshots visuais 390/1440 (os arquivos atuais são `-win32`); painel Supabase para triagem das solicitações.
- **P2**: depoimentos reais com autorização; status operacional após telemetria; métricas de claims após amostra aprovada.
