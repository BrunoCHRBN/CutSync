# Plano mestre de implementação UI/UX — CutSync

Status: implementação local concluída; homologação e rollout pendentes
Superfícies: Web Client, Client mobile, Web Estabelecimento, Business mobile e Profissional
Entrega: incrementos verticais, reversíveis e medidos por gates
Última revisão: 2026-08-12

## 1. Objetivo e princípios

O programa melhora jornadas completas, não apenas a camada visual. O Cliente deve encontrar, confiar, agendar e se recuperar quando não houver horário. O estabelecimento deve reconhecer exceções e resolver o dia com menos navegação. O profissional deve acessar seus próximos atendimentos e executar somente ações autorizadas.

Princípios obrigatórios:

- Web, Client e Business compartilham contratos, tokens e regras, mas mantêm componentes e jornadas próprios.
- Verde CutSync identifica navegação e ações principais; a marca do estabelecimento é editorial; cores semânticas comunicam status.
- Autorização e `allowedActions` são server-authoritative.
- Loading, vazio, erro, offline, sessão expirada, acessibilidade e rollback fazem parte do aceite.
- Produção realizada, receita recebida, caixa, custos, lucro, pagamentos de atendimento e cobrança SaaS permanecem conceitos separados.
- A beta gratuita/cortesia continua sem enforcement obrigatório.
- Não haverá CSS livre, white-label, domínio próprio ou remoção da marca CutSync nesta fase.

## 2. Resultados e medição

Resultados primários:

1. aumentar a conclusão de agendamentos;
2. reduzir abandono após indisponibilidade;
3. reduzir o tempo de resolução de pendências do estabelecimento;
4. reduzir o tempo até a ação principal do profissional;
5. reduzir divergências visuais, semânticas e operacionais entre superfícies.

KPIs:

- Cliente: `booking_confirmed / booking_started`, segmentado por superfície e encontro de indisponibilidade.
- Estabelecimento: mediana entre disponibilização e resolução de um item de atenção.
- Profissional: taxa de sucesso das ações autorizadas dos próximos atendimentos.
- Drivers: recuperação após indisponibilidade, latência, retorno ao fluxo e falhas por etapa.
- Guardrails: cancelamento, no-show, erro, crash-free sessions, suporte, performance e acessibilidade.

Sem volume confiável, a primeira release coleta baseline. Metas numéricas serão fixadas após 200 inícios de funil ou 30 dias, o que ocorrer primeiro. Antes disso, o gate é não regressão funcional, técnica e de usabilidade.

Eventos mínimos, sem PII ou texto livre:

`discovery_viewed`, `establishment_opened`, `booking_started`, `availability_empty`, `availability_recovery_selected`, `booking_confirmed`, `booking_failed`, `attention_viewed`, `attention_action_started`, `attention_action_succeeded`, `attention_action_failed`, `brand_draft_saved`, `brand_published` e `notification_opened`.

## 3. Fundação compartilhada

`@cutsync/brand` é a fonte de fundamentos e contratos de marca. Cada app conserva sua camada de componentes.

- Consolidar cor, tipografia, espaçamento, raio, elevação, movimento, breakpoints, alvos de toque e opacidade.
- Padronizar botões, campos, cards, filtros, tabs, dialogs/sheets, notices, skeletons e estados assíncronos.
- Não usar texto funcional abaixo de 12 px.
- Centralizar glossário, motivos de cancelamento e demais códigos internos em `@cutsync/domain`.
- Formatar em `pt-BR`, respeitando timezone e moeda do estabelecimento.
- Aplicar WCAG 2.2 AA no Web e equivalentes mobile: contraste, teclado, foco, leitor de tela, zoom, tamanho dinâmico, alvos de toque e redução de movimento.
- Usar feature flag por fatia vertical; permissões continuam no backend.

Flags públicas de rollout (somente ativação de experiência, nunca autorização):

| Fatia | Variável | Padrão |
|---|---|---|
| Recuperação de disponibilidade | `EXPO_PUBLIC_UI_CLIENT_AVAILABILITY_RECOVERY_V2` | desligada |
| Command center Web | `EXPO_PUBLIC_UI_BUSINESS_COMMAND_CENTER_V2` | desligada |
| Foco diário profissional | `EXPO_PUBLIC_UI_PROFESSIONAL_DAILY_FOCUS_V2` | desligada |
| Estúdio de marca Web/Business | `EXPO_PUBLIC_UI_BRAND_STUDIO_V2` | desligada |

As flags só escolhem a apresentação/read model. RLS, capacidades e `allowedActions` continuam sendo recalculados pelo servidor. O desligamento retorna à jornada compatível anterior, sem reverter dados publicados.

Contratos compartilhados:

- `ResolvedBrandTheme`: tema final, origem, overrides, contraste e versão publicada.
- `BrandDraft`: preset, conteúdo editável, validações e estado.
- `ExperienceCapabilities`: papel, escopo, ações e capacidades de marca.
- `PublicationReadiness`: elegibilidade, completude, bloqueios e recomendações.
- `AvailabilityRecovery`: data solicitada, próxima disponibilidade e alternativas.
- `AttentionItem`: prioridade, contexto, destino e ações autorizadas.
- `ProductEvent`: evento seguro, superfície, papel, rota e versão da experiência.

## 4. Jornadas por superfície

### Cliente

- Home e Explorar orientados por serviço, local, data, preço e disponibilidade.
- Cards mostram fatos verificáveis; “Mais reservados” só pode existir com métrica real de reservas.
- Perfil público prioriza identidade, serviços, equipe, disponibilidade, políticas e localização, com fallback de mídia.
- Agendamento Web em duas colunas; mobile sequencial, com progresso, CTA fixo e preservação de seleção.
- Indisponibilidade oferece, nesta ordem: próximo horário, datas próximas, qualquer profissional, troca de serviço e retorno ao perfil.
- Confirmação e reagendamento permanecem idempotentes.
- Próximo agendamento domina a área de compromissos; histórico, suporte, preferências, segurança e notificações usam linguagem humana.
- Waitlist entra depois da recuperação básica e exige consentimento.

### Estabelecimento Web

- Navegação agrupada em Hoje, Agenda, Clientes, Operação, Gestão e Configurações.
- Início orientado a exceções: confirmações, atrasos, mudanças de profissional, lacunas, conflitos, pagamentos operacionais e prontidão.
- Agenda preserva filtros, data, posição e conteúdo durante refetch; criação rápida recebe o contexto do slot.
- Detalhes usam painel lateral no desktop e sheet em telas compactas.
- Clientes, equipe e serviços mostram contexto operacional e impacto de alterações futuras.
- Relatórios começam por resposta/ação e mantêm explícito que produção não é caixa.
- Configurações separam identidade, agenda, serviços, equipe, atendimento, notificações, segurança, organização, cobrança e suporte.

### Business mobile

- Manter Hoje, Agenda, Decisões, Gestão e Conta.
- Hoje combina próximos atendimentos, pendências e uma ação principal por item.
- Agenda permite troca rápida de dia/profissional e refetch sem tela vazia.
- Operações usam somente `allowedActions` do backend.
- Conteúdo cacheado pode ser lido offline com aviso de desatualização; mutações sensíveis nunca são confirmadas silenciosamente.
- Deep link e reconexão sempre revalidam o estado.

### Profissional

- Manter quatro destinos e ocultar administração sem capacidade.
- Priorizar os próximos dois atendimentos, cliente, serviço, observações permitidas e uma ação principal antes do calendário.
- Detalhes usam sheet compacto e ações server-authoritative.
- Performance mostra produção e atividade operacional sem representar recebimento.
- Perfil público usa editor guiado de bio, especialidades, galeria e visibilidade.

## 5. Personalização do estabelecimento

Web Estabelecimento e Business mobile terão editores próprios sobre o mesmo contrato.

- Presets controlados, cor principal, cor derivada, logo, banner, galeria, descrição e composições permitidas.
- Contraste e tokens derivados são calculados pelo sistema.
- Prévia obrigatória de descoberta, perfil e agendamento.
- Draft, publicação, histórico, restauração e auditoria.
- `manage_brand` permite editar e salvar; `publish_brand` permite publicar, restaurar e alterar herança.
- Owner da organização edita/publica; manager edita; admin da unidade edita/publica sua unidade; demais papéis não acessam por padrão.
- Marca da organização é o padrão; unidades herdam e mantêm overrides explícitos por campo.
- Publicação projeta atomicamente os valores nos campos públicos existentes para compatibilidade.

O banco usará recursos distintos, com FK real, para versões de organização e estabelecimento. A migração inicial cria a versão publicada a partir dos valores atuais sem alterar a aparência.

## 6. Trilhas transversais

- Onboarding retomável: conta → organização/unidade → serviços → equipe → agenda → marca → publicação.
- Publicação separa elegibilidade obrigatória de completude recomendada; mídia não bloqueia injustamente estabelecimentos pequenos.
- Uma rota canônica por experiência, com redirects documentados para aliases legados.
- Perfis públicos elegíveis recebem title, description, canonical, OpenGraph e dados estruturados com fatos publicados; agendamento e áreas privadas usam `noindex`.
- `robots.txt` bloqueia áreas privadas e o sitemap versionado contém apenas páginas institucionais públicas; perfis só entram quando a geração consultar entidades com `discovery_status = published` no ambiente de destino.
- Mídia exige autoria/consentimento, alt text, limite e validação; fotos identificáveis de clientes não entram no primeiro ciclo.
- A matriz de notificações registra evento, destinatário, canal, deep link e refetch.
- Imagens são dimensionadas/cacheadas, listas virtualizadas e prefetch é seletivo.
- Convites, recuperação e segurança de autenticação são preservados.
- Control recebe somente suspensão, auditoria e saúde da instrumentação, sem redesign completo.

### Matriz de notificações

| Evento | Destinatário | Canal inicial | Destino canônico | Revalidação ao abrir |
|---|---|---|---|---|
| agendamento recebido/confirmado/alterado/cancelado | Cliente | push | `/appointments/[id]` | detalhe e `allowedActions` |
| lembrete de agendamento | Cliente | push | `/appointments/[id]` | estado e políticas vigentes |
| resposta ou mudança no suporte | Cliente | push | `/support/[id]` | ticket e mensagens |
| agendamento criado/alterado/cancelado | Estabelecimento/profissional autorizado | push | `/(app)/appointments/[appointmentId]` | detalhe operacional e versão |
| decisão de reatribuição | Responsável calculado | push | `/(app)/decisions/[requestId]` | fila, detalhe e `allowedActions` |
| convite | Destinatário do convite | push/email transacional | `/establishments` ou `/invite/[token]` | validade e identidade da sessão |
| conflito operacional | Papel com capacidade | push | `/establishments` ou atendimento específico | contexto ativo e conflito |

O roteador rejeita identificadores malformados, nunca confia no papel indicado na mensagem e registra `notification_opened` sem conteúdo ou PII. As telas de atendimento e decisão refazem a leitura no foco; troca de unidade exige seleção explícita.

## 7. Read models e compatibilidade

APIs planejadas, sempre versionadas ou introduzidas sem quebrar consumidores atuais:

- `get_public_establishment_experience(slug)`
- `get_booking_availability_recovery(...)`
- `get_business_command_center(...)`
- `get_professional_daily_focus(...)`
- `get_publication_readiness(...)`
- `get_brand_editor_context(...)`
- `save_brand_draft(...)`
- `publish_brand_version(...)`
- `restore_brand_version(...)`

Requisitos comuns: autenticação e escopo revalidados, RLS em tabelas expostas, `allowedActions`, erros tipados, idempotência, auditoria e parsers runtime-safe em `packages/database`.

## 8. Ondas e gates

| Onda | Entrega | Esforço | Gate |
|---|---|---:|---|
| 0 | Documento, inventário, baseline, eventos e flags | M | Evidências e contratos aprovados |
| 1 | Tokens, primitivas, estados, copy e acessibilidade base | L | Contratos testados nas três superfícies |
| 2 | Descoberta, perfil e recuperação de disponibilidade | L | Agendamento sem beco sem saída |
| 3 | Command center, agenda e atendimento Web | L | Owner/admin homologados |
| 4 | Hoje, Agenda, Decisões e operação Business | L | Ciclo Android homologado |
| 5 | Experiência focada do Profissional | M | Ações e isolamento homologados |
| 6 | Marca versionada e herança multiunidade | L | Editar, publicar, herdar e restaurar testados |
| 7 | Relatórios, configurações, onboarding, SEO, rotas e notificações | L | Semântica, links e rotas validados |
| 8 | Hardening, performance, acessibilidade e rollout | L | Checklist e rollback comprovados |

S é uma mudança isolada; M envolve uma jornada ou contrato; L é uma entrega vertical com banco, contratos, superfícies, testes e rollout.

## 9. Matriz canônica de rotas

| Experiência | Rota canônica | Compatibilidade |
|---|---|---|
| Estabelecimento no Client Web | `/(client)/establishment` | `/(client)/barbershop` redireciona |
| Perfil público | `/[slug]` | `/salon/[slug]` redireciona |
| Agendamento público | `/[slug]/booking` | `/salon/[slug]/booking` redireciona |
| Área Cliente | `/(client)/*` | `/appointments` e `/explore` redirecionam |
| Área Estabelecimento | `/(admin)/*` | `/admin/*` redireciona |
| Área Profissional | `/(professional)/*` | `/professional` redireciona |

Aliases ficam até a conclusão da migração de analytics, links e notificações.

## 10. Testes e homologação

- Unitários: tokens, contraste, formatadores, glossário, parsers, flags e herança.
- Componentes: loading, skeleton, vazio, erro, offline, permissão e sucesso.
- SQL: RLS, capacidades, idempotência, auditoria, multiunidade e publicação.
- Integração: read models, clientes legados, concorrência e expiração de sessão.
- E2E: Cliente, owner/admin, profissional e usuário sem permissão.
- Responsividade: 390, 768, 1024, 1440 e 1920 px.
- Acessibilidade: teclado, foco, leitor de tela, contraste, zoom, tamanho dinâmico e redução de movimento.
- Mobile: Android em dispositivo real; iOS deve compilar sem bloquear a entrega Android.
- Observabilidade: completude, duplicidade, ordem e ausência de PII nos eventos.

Gates de ambiente:

1. local/estático: tipos, lint focado, testes, build e revisão visual;
2. Homolog: Supabase remoto, papéis reais, RLS, dados representativos, deep links e push;
3. Preview: APK Android apontando para Homolog, nunca Production;
4. produção gradual: feature flag por fatia, monitoramento e rollback;
5. conclusão: fluxo real e estados assíncronos validados — inspeção estática ou gravação isolada não bastam.

## 11. Registro de execução

Cada onda deve registrar:

- decisão e contrato alterado;
- arquivos/migrações relevantes;
- testes executados e resultado;
- evidência local, Homolog e dispositivo real separadamente;
- risco residual e procedimento de rollback;
- alteração das métricas e guardrails após baseline.

## 12. Evidência da implementação local — 2026-08-12

- TypeScript aprovado em `packages`, Web, Client e Business.
- 52 testes unitários focados aprovados para fundação, flags, parsers, marca, Client e Business.
- Build Web aprovado e contendo `robots.txt` e `sitemap.xml`.
- Bundles Android do Client e Business aprovados pelo Metro/Expo SDK 57.
- Quatro migrações novas aprovadas pelo parser PostgreSQL; testes SQL transacionais foram adicionados para recuperação, marca, read models e eventos.
- Lint Web e Business sem erros; warnings remanescentes ficam visíveis no gate e não foram ocultados.
- Flags verticais permanecem desligadas por padrão até a migração e a homologação do respectivo fluxo.

Ainda não constituem evidência concluída: execução das migrações/testes contra um Postgres local (Docker indisponível nesta estação), Supabase Homolog remoto, papéis reais/RLS, APK Preview em dispositivo, push/deep links reais, responsividade visual nas cinco larguras e rollout de Produção. Esses gates não podem ser inferidos a partir de typecheck, bundle ou inspeção estática.
