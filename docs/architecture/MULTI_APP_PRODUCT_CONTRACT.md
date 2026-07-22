# Contrato de produto — CutSync Web, Client e Business

Status: aprovado para implementação

Fase: 0 — decisões e contratos

Última atualização: 2026-07-22

## 1. Objetivo

Separar o CutSync em três produtos com experiências próprias, mantendo um único repositório, um único backend Supabase e contratos de negócio compartilhados:

- **CutSync Web**: aquisição, páginas públicas, agendamento sem instalação, administração detalhada e governança interna.
- **CutSync**: aplicativo mobile para clientes encontrarem estabelecimentos, agendarem e acompanharem seus atendimentos.
- **CutSync Business**: aplicativo mobile para proprietários, administradores e profissionais operarem a agenda.

A separação não deve duplicar regras críticas. Disponibilidade, criação, cancelamento e reagendamento continuam centralizados no backend e consumidos pelos três produtos.

## 2. Decisões adotadas

| Tema | Decisão |
| --- | --- |
| Repositório | Monorepo com `apps/web`, `apps/client`, `apps/business` e pacotes compartilhados |
| Backend | Um projeto Supabase por ambiente, compartilhado pelos três produtos |
| Aplicativo do cliente | Nome de produto `CutSync` |
| Aplicativo operacional | Nome de produto `CutSync Business` |
| Web | Nome de produto `CutSync Web`; domínio público continua sendo a entrada canônica |
| Experiência visual | Cada produto possui navegação, telas e design próprios |
| Compartilhamento | Regras, tipos, acesso a dados, validações e tokens de marca; telas completas somente quando houver equivalência real |
| Identidade | Uma pessoa pode ser cliente e também pertencer a estabelecimentos como profissional ou administrador |
| Autorização | Determinada no Supabase por associação ativa e RLS/RPC, nunca pelo aplicativo instalado |
| Migração | Incremental; mover primeiro sem redesenhar e redesenhar depois por produto |
| Publicação | Projetos EAS, versões, credenciais, canais e ciclos de release independentes |

## 3. Identidade técnica

Os identificadores abaixo são o padrão inicial. Mudanças futuras exigem uma decisão registrada antes da primeira publicação nas lojas.

| Produto | Slug sugerido | iOS bundle identifier | Android package | Scheme |
| --- | --- | --- | --- | --- |
| CutSync | `cutsync-client` | `com.cutsync.client` | `com.cutsync.client` | `cutsync` |
| CutSync Business | `cutsync-business` | `com.cutsync.business` | `com.cutsync.business` | `cutsync-business` |
| CutSync Web | `cutsync-web` | Não aplicável | Não aplicável | HTTPS |

Cada app deve possuir seu próprio `app.json` ou `app.config.ts`, `eas.json`, assets de ícone/splash e `extra.eas.projectId`.

## 4. Propriedade das superfícies

### 4.1 CutSync Web

Responsabilidade principal: aquisição, conversão sem instalação e tarefas administrativas densas.

- landing para clientes;
- landing para estabelecimentos;
- marketplace público;
- páginas públicas de estabelecimentos e profissionais;
- catálogo, equipe, galeria, avaliações e localização;
- agendamento público pelo navegador;
- login, cadastro e recuperação de senha na Web;
- abertura e aceite de convites;
- onboarding completo de estabelecimentos;
- portal administrativo desktop;
- agenda ampla da equipe;
- serviços, equipe, escalas, relatórios e configurações completas;
- exportação CSV;
- Superadmin, governança, auditoria e base interna de conhecimento.

### 4.2 CutSync Client

Responsabilidade principal: descoberta, agendamento e retenção do cliente.

- autenticação e sessão mobile;
- explorar e pesquisar estabelecimentos;
- localização e estabelecimentos próximos;
- perfil de estabelecimento e profissional;
- catálogo, equipe, galeria, avaliações e rota;
- fluxo completo de agendamento;
- próximos agendamentos e histórico;
- cancelamento, reagendamento e repetição;
- avaliação após atendimento;
- dados pessoais, segurança e preferências de notificação.

Não pertencem ao Client: gestão de equipe, cadastro de serviços, agenda operacional, relatórios empresariais, governança ou onboarding empresarial completo. O Client pode apenas direcionar o interessado para a Web ou para o Business.

### 4.3 CutSync Business

Responsabilidade principal: operação diária do estabelecimento.

- autenticação e seleção de estabelecimento ativo;
- navegação condicionada às associações do usuário;
- resumo do dia;
- agenda própria e, quando autorizado, agenda da equipe;
- confirmação, conclusão, cancelamento e reagendamento;
- encaixe rápido;
- bloqueios e folgas;
- contato operacional com clientes;
- serviços;
- equipe, convites, escalas e comissões;
- perfil público do profissional;
- resumo de produção, ocupação e comissão;
- configurações operacionais essenciais;
- notificações de novos agendamentos, alterações e cancelamentos.

Configurações extensas, análises densas, exportações e auditoria permanecem prioritariamente na Web.

## 5. Propriedade das rotas atuais

Esta tabela define o destino das rotas existentes durante a migração. Os caminhos mobile poderão ser redesenhados dentro de cada novo app; a coluna de destino define a responsabilidade de produto, não uma obrigação de preservar a URL interna.

| Rotas atuais | Destino | Observação |
| --- | --- | --- |
| `/`, `/para-estabelecimentos` | Web | Aquisição pública |
| `/[slug]`, `/salon/[slug]` | Web | Perfil público canônico do estabelecimento |
| `/[slug]/booking`, `/salon/[slug]/booking` | Web | Agendamento sem instalação |
| `/profile/[slug]` | Web | Perfil público canônico do profissional |
| `/(auth)/*`, `/security` | Todos | Implementação própria por app; URLs web continuam válidas |
| `/invite/[token]` | Web e Business | Web como fallback; Business via deep link quando instalado |
| `/(client)/*`, `/explore`, `/appointments` | Client | A Web mantém apenas o autosserviço necessário |
| `/(professional)/*`, `/professional`, `/professional-profile` | Business | Experiência mobile operacional |
| `/(admin)/*`, `/admin/*` | Web e Business | Web completa; Business adaptada à operação mobile |
| `/superadmin`, `/governance/*` | Web | Nunca incluir nos binários públicos |

Durante a migração, as rotas atuais continuam funcionando no app Web até que seu destino tenha sido implementado e validado.

## 6. Matriz de autorização

| Capacidade | Cliente | Profissional | Administrador |
| --- | --- | --- | --- |
| Criar agendamento próprio | Sim | Sim, no contexto de cliente | Sim |
| Consultar próprios agendamentos | Sim | Sim, no contexto de cliente | Sim, no contexto de cliente |
| Criar encaixe para cliente | Não | Sim, para si quando autorizado | Sim, para a equipe |
| Ver agenda própria | Não | Sim | Sim |
| Ver agenda da equipe | Não | Conforme política da unidade | Sim |
| Alterar atendimento próprio | Cancelar/reagendar conforme política | Sim, quando for o responsável | Sim |
| Bloquear horário próprio | Não | Sim | Sim |
| Bloquear horário de terceiros | Não | Não | Sim |
| Gerenciar serviços | Não | Não | Sim |
| Gerenciar convites e equipe | Não | Não | Sim |
| Editar jornada própria | Não | Conforme política da unidade | Sim |
| Consultar comissão própria | Não | Sim | Sim |
| Consultar relatórios da unidade | Não | Não, salvo permissão futura explícita | Sim |
| Editar perfil profissional próprio | Não | Sim | Sim, apenas campos administrativos permitidos |
| Editar estabelecimento | Não | Não | Sim |
| Governança da plataforma | Não | Não | Não; somente papéis internos de governança na Web |

O frontend pode ocultar ações não autorizadas, mas a proteção definitiva deve existir nas políticas RLS e funções RPC.

## 7. Contratos compartilhados

Devem possuir uma única fonte de verdade:

- disponibilidade de horários;
- timezone e conversão de datas;
- criação de agendamento;
- reagendamento;
- cancelamento e mudança de status;
- bloqueios de agenda;
- duração e preço vigentes do serviço;
- papéis e associações ao estabelecimento;
- códigos de erro e mensagens de domínio;
- tipos gerados do Supabase.

Não serão compartilhados por padrão:

- árvores de navegação;
- páginas e telas completas;
- dashboards;
- calendário visual;
- cards complexos;
- estruturas responsivas;
- fluxos de onboarding específicos;
- componentes cuja API exija condicionais frequentes por produto.

## 8. Deep links e redirecionamentos

| Caso | Destino preferencial | Fallback |
| --- | --- | --- |
| Abrir estabelecimento | Client | Página pública Web |
| Abrir agendamento do cliente | Client | Área autenticada Web |
| Novo agendamento operacional | Business | Portal Business Web |
| Convite de equipe | Business | `/invite/[token]` na Web |
| Recuperação de senha do cliente | Client | Web |
| Recuperação de senha operacional | Business | Web |
| Perfil público | Web | Client quando houver universal/app link configurado |

Tokens sensíveis não devem ser registrados em logs, analytics ou mensagens de erro.

## 9. Ambientes

Os três produtos usam os mesmos ambientes lógicos, com credenciais públicas próprias quando necessário:

| Ambiente | Finalidade | Distribuição |
| --- | --- | --- |
| Development | Desenvolvimento local e builds de desenvolvimento | Equipe técnica |
| Preview | Homologação integrada e testes de aceite | Equipe e grupo piloto |
| Production | Usuários reais | Lojas e domínio oficial |

Cada ambiente precisa de:

- URL e chave pública Supabase;
- URLs de autenticação autorizadas;
- schemes e universal/app links;
- projeto EAS e canal correto por app;
- configuração de notificações;
- política explícita de migrations.

Segredos de serviço nunca podem usar o prefixo `EXPO_PUBLIC_` nem ser incluídos nos aplicativos.

## 10. Escopo dos MVPs

### Web MVP após separação

- manter páginas públicas e agendamento atuais;
- manter portal administrativo e profissional enquanto o Business é construído;
- manter onboarding empresarial;
- manter Superadmin e governança;
- preservar login, recuperação e aceite de convite;
- não redesenhar durante a movimentação inicial para o monorepo.

### Client MVP

- login, cadastro e recuperação;
- explorar;
- perfil de estabelecimento e profissional;
- agendar;
- próximos e histórico;
- cancelar e reagendar;
- avaliar;
- perfil e notificações.

Fora do primeiro MVP: favoritos, lista de espera, pagamentos, fidelidade, cupons, chat e carteira.

### Business MVP

- login, associações e estabelecimento ativo;
- meu dia e agenda;
- encaixe, status, cancelamento e reagendamento;
- bloqueios;
- serviços;
- equipe, convites e escalas;
- perfil profissional;
- resumo de desempenho;
- configurações essenciais;
- notificações operacionais.

Fora do primeiro MVP: caixa completo, estoque, CRM, campanhas, folha de pagamento, conciliação financeira e chat.

## 11. Critério de conclusão por funcionalidade

Uma funcionalidade somente pode avançar para concluída quando:

- seus critérios de aceite estiverem registrados e atendidos;
- TypeScript e lint não apresentarem novos erros;
- regras de negócio possuírem teste automatizado proporcional ao risco;
- RLS/RPC tiverem testes para ações sensíveis;
- loading, vazio, erro e sucesso estiverem tratados;
- o design tiver sido validado no produto de destino;
- Android e iOS tiverem sido verificados quando a funcionalidade for mobile;
- os fluxos integrados tiverem sido executados contra o Supabase do ambiente-alvo;
- não houver regressão conhecida na Web;
- lacunas de verificação estiverem explicitamente documentadas.

## 12. Ordem de implementação

1. Validar backend, migrations, RLS, identidade multiapp e dispositivos de push.
2. Criar o monorepo e mover o produto existente para `apps/web` sem redesign.
3. Extrair contratos compartilhados comprovadamente reutilizáveis.
4. Construir o Client por fatias verticais completas.
5. Construir o Business por papel e fluxo operacional.
6. Refinar o design e as capacidades exclusivas da Web.
7. Configurar distribuição e lançamentos independentes.

Cada fase deve terminar com validação, revisão do diff e um commit exclusivo antes do início da fase seguinte.
