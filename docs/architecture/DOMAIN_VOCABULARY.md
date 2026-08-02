# Vocabulário de domínio — estabelecimento e profissional

Status: normativo para novas entregas  
Base: `CUTSYNC_AUDIT.md` (schema canônico `establishments` / `professional`)  
Última atualização: 2026-08-02

## 1. Objetivo

O CutSync não é um produto exclusivo de barbearia. O domínio canônico é **estabelecimento de beleza e estética** (barbearia, salão, studio, clínica de estética, etc.) operado por **profissionais**.

Este documento:

1. define o glossário oficial PT/EN/código;
2. separa o que é **entidade do sistema** do que é **categoria de negócio** ou copy de marketing;
3. fornece o checklist de renomeação do legado `barbershop` / `barbearia` / `barbeiro`.

Toda feature, migration, rota, RPC, teste e copy novos devem seguir este vocabulário. Código legado permanece compatível até ser migrado pelo checklist.

## 2. Glossário canônico

### 2.1 Entidades do sistema

| Conceito | PT (produto/UI) | EN (docs/código) | Identificadores preferidos |
| --- | --- | --- | --- |
| Unidade operacional | estabelecimento | establishment | `establishment`, `establishmentId`, `establishments` |
| Pessoa que atende | profissional | professional | `professional`, `professionalId`, role `professional` |
| Pessoa que agenda | cliente | client | `client`, `clientId`, role `client` |
| Gestor da unidade | administrador / dono | admin / owner | roles `admin`, `owner` |
| Serviço oferecido | serviço | service | `service`, `serviceId` |
| Horário marcado | agendamento | appointment | `appointment`, `appointmentId` |
| Vínculo pessoa↔unidade | associação / membership | membership | `membership`, `memberships` |
| Perfil público do profissional | perfil profissional | professional profile | `professional_profiles`, `/profile/[slug]` |
| Página pública da unidade | perfil do estabelecimento | establishment profile | `/[slug]`, `/salon/[slug]` |
| Carteira local da unidade | cliente do estabelecimento | establishment client | `establishment_clients` |

### 2.2 Mapeamento legado → canônico

| Legado (evitar em código novo) | Canônico |
| --- | --- |
| `barbershop`, `barbershops` | `establishment`, `establishments` |
| `barbershopId`, `barbershop_id` | `establishmentId`, `establishment_id` |
| `barbearia` (como entidade do sistema) | `estabelecimento` |
| `barber`, `barbers` | `professional`, `professionals` |
| `barberId`, `barber_id` | `professionalId`, `professional_id` |
| `barbeiro` (como papel do sistema) | `profissional` |
| `BarbershopProfileExperience` | `EstablishmentProfileExperience` (ou equivalente Client) |
| `BarberDashboardExperience` | `ProfessionalDashboardExperience` (ou equivalente Business) |
| rota `/(client)/barbershop` | `/(client)/establishment` (alias temporário permitido) |
| query `?barbershopId=` | `?establishmentId=` (alias temporário permitido) |
| testIDs `barbershop-*`, `barber-*` | `establishment-*`, `professional-*` |

Referência histórica do schema: `CUTSYNC_AUDIT.md` — SQL legado `barbershops` / `barber_id` / `barber` vs atual `establishments` / `professional_id` / `professional`.

### 2.3 O que NÃO é renomeação obrigatória

Estes usos podem permanecer quando forem **categoria, vertical ou copy contextual**, não entidade do sistema:

| Uso permitido | Exemplo |
| --- | --- |
| Categoria de negócio | “Barbearia”, “Salão”, “Studio” como tipo/segmento do estabelecimento |
| Nome fantasia | estabelecimento chamado “Barbearia do Bruno” |
| Marketing vertical | landing com cena de barbearia ou salão |
| Busca/termos do usuário | filtro “barba”, “barbearia” na descoberta |
| Título profissional livre | `titulo_profissional = "Barbeiro"` informado pelo usuário |

Regra prática: se o termo aparece como **tipo de dado, rota, RPC, tabela, papel ou variável de domínio**, use estabelecimento/profissional. Se aparece como **rótulo de categoria ou conteúdo do usuário**, pode citar barbearia/barbeiro.

## 3. Regras de uso por camada

| Camada | Regra |
| --- | --- |
| Banco / RLS / RPC | Somente canônico (`establishments`, `establishment_id`, `professional_id`, role `professional`) |
| Pacotes `packages/*` | Tipos, mappers e erros em inglês canônico; mensagens de produto em PT com estabelecimento/profissional |
| Apps novos / arquivos novos | Nomes de arquivo, componentes, hooks e params canônicos |
| Rotas públicas | Preferir slug do estabelecimento; não introduzir `/barbershop` novo |
| Rotas Client autenticadas | Preferir `/establishment`; manter alias `/barbershop` só durante migração |
| Copy de UI genérica | “estabelecimento”, “profissional”, “seu lugar”, “equipe” — evitar “sua barbearia” como fallback global |
| Testes | Novos testIDs canônicos; atualizar asserts legados na mesma PR que renomear a UI |

## 4. Checklist de renomeação

Usar por PR pequena e vertical. Não misturar redesign visual com rename amplo.

### Fase A — Contrato e docs (esta entrega)

- [x] Publicar este glossário normativo
- [ ] Referenciar o glossário no contrato multi-app
- [ ] Marcar `supabase/migration_i18n.sql` como legado não aplicável / arquivar fora do fluxo ativo
- [ ] Atualizar copy genérica em docs antigos (`FRONTEND_AUDIT.md`, `MIGRATION_SUPABASE.md`) quando tocados

### Fase B — Banco e API (já majoritariamente canônico)

- [ ] Garantir que nenhuma migration nova recria `barbershops` / `barber_*`
- [ ] Documentar FKs com nome legado (`appointments_barber_id_fkey` etc.) como histórico; não renomear constraint em produção sem necessidade
- [ ] Revisar RPCs públicas: parâmetros e colunas retornadas só com `establishment_*` / `professional_*`
- [ ] Smoke SQL: roles `professional` e tabelas `establishments` como única fonte

### Fase C — Pacotes compartilhados

- [ ] `packages/database`: mappers e tipos sem alias `barbershop`/`barber` em APIs públicas novas
- [ ] `packages/domain`: erros, labels e helpers com estabelecimento/profissional
- [ ] `packages/validation`: schemas e mensagens alinhados
- [ ] Regenerar/atualizar `supabase.generated.ts` só quando o schema mudar de fato

### Fase D — Web Client (descoberta → detalhe → booking)

Ordem sugerida:

1. **Params e rotas**
   - [ ] Aceitar `establishmentId` em `useEstablishmentRouteParams`
   - [ ] Manter leitura de `barbershopId` como alias depreciado
   - [ ] Nova rota `/(client)/establishment` (reexport ou move)
   - [ ] Redirect/compat de `/(client)/barbershop` → establishment
2. **Navegação**
   - [ ] Explore, favoritos, rebooking e voltar-do-booking usam `establishmentId` + rota nova
   - [ ] Garantir que voltar do booking nunca prefira `/:slug` na jornada Client
3. **Componentes**
   - [ ] Renomear `BarbershopProfileExperience` → experiência de establishment no Client
   - [ ] Trocar variáveis locais `barbershop`/`barbers`/`selectedBarber` nos arquivos tocados
   - [ ] Unificar com `EstablishmentProfileExperience` / `EstablishmentBookingExperience` quando fizer sentido
4. **Copy e testIDs**
   - [ ] Remover fallbacks “Sua barbearia” / “Barbearia” genéricos
   - [ ] Trocar testIDs `barbershop-*` / `client-shop-*` gradualmente, atualizando E2E/unit na mesma PR
5. **Página pública `/:slug`**
   - [ ] Copy e código sem “Moeda oficial”/cards legados; vocabulário establishment
   - [ ] Manter slug como identificador público; não reintroduzir “barbershop” na URL

### Fase E — Web Admin / Business / Professional

- [ ] `BarberDashboardExperience` → dashboard do profissional
- [ ] Shells, menus e empty states: “estabelecimento” / “equipe” / “profissional”
- [ ] Settings e onboarding: “seu estabelecimento”, não “sua barbearia”, salvo seleção de categoria
- [ ] Business mobile: revisar strings e identifiers legados na mesma política

### Fase F — Expo Client

- [ ] Rotas/screens `establishments/[slug]` já canônicas: manter
- [ ] Remover copy/identifiers `barbershop` remanescentes em services/ui
- [ ] Alinhar testIDs com o glossário

### Fase G — Observabilidade e limpeza final

- [ ] Busca global sem matches novos de `barbershopId` / `BarbershopProfile` / `selectedBarber` em código ativo
- [ ] Remover aliases depreciados após uma janela de compatibilidade (mín. 1 release estável)
- [ ] Atualizar snapshots/E2E e fechar o checklist

## 5. Estratégia de compatibilidade

Durante a migração:

1. **Leitura dupla, escrita canônica** — aceitar `barbershopId` antigo; gravar/navegação nova com `establishmentId`.
2. **Aliases de rota** — manter a rota antiga respondendo até analytics/deep links zerarem uso.
3. **Sem big-bang** — preferir PRs por superfície (Explore, detalhe, booking, admin).
4. **Não quebrar dados** — nomes de tabelas/colunas canônicas já estão no banco; o foco é código, rotas e copy.
5. **Categoria ≠ entidade** — vertical “barbearia” continua válida como segmento comercial.

## 6. Definição de pronto

A renomeação de uma superfície está pronta quando:

- novos identifiers e rotas seguem a tabela canônica;
- copy genérica fala em estabelecimento/profissional;
- testes/unit/E2E da superfície passam com os novos nomes (ou aliases explícitos documentados);
- jornada Client por id não escapa para `/:slug` por causa de naming legado;
- não há regressão de booking, favoritos, agendamentos ou auth.

## 7. Referências

- `CUTSYNC_AUDIT.md` — diagnóstico do schema legado vs atual
- `docs/architecture/MULTI_APP_PRODUCT_CONTRACT.md` — produtos e rotas canônicas
- `docs/architecture/ESTABLISHMENT_CLIENTS_PLAN.md` — carteira por estabelecimento
- `supabase/setup.sql` / migrations ativas — fonte do schema canônico
- `supabase/migration_i18n.sql` — artefato legado; não aplicar em ambientes atuais
