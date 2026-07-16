# Auditoria de Front-end — CutSync

## Resumo executivo

O CutSync possui três perfis de acesso, agenda em tempo real, agendamento, gestão de equipe, serviços, comissões e configurações. A camada de dados foi consolidada no Supabase; esta auditoria visual permanece como histórico das decisões de interface.

## Pontos fortes encontrados

- Fluxos separados para cliente, barbeiro e administrador.
- Agenda e dados centralizados no Supabase, com atualizações Realtime.
- Fluxo de agendamento completo: serviço, profissional, data e horário.
- Recursos operacionais relevantes: encaixe rápido, agenda coletiva, comissões e status de atendimento.
- Personalização inicial por barbearia via cor primária.
- Internacionalização em português e inglês já iniciada.

## Problemas de maior impacto

### P0 — Fundação do produto

1. **Não existe design system compartilhado.** Cores, espaços, cartões, botões, cabeçalhos e estados são repetidos diretamente em todas as telas.
2. **Navegação pouco escalável.** O administrador usa atalhos dentro do dashboard; o barbeiro usa abas locais; o cliente não possui navegação persistente. Isso dificulta orientação e crescimento do produto.
3. **Dashboard administrativo excessivamente longo.** Financeiro, comissões, sincronização, atalhos, seletor de data e agenda coletiva competem na mesma página.
4. **Baixa adaptação ao desktop.** A maioria das telas mantém composição de celular centralizada, sem aproveitar a largura para sidebar, grids ou painéis contextuais.
5. **Acessibilidade e testabilidade ausentes.** Elementos interativos não possuem `data-testid`, estados de foco claros ou uma estratégia consistente de ícones e rótulos.

### P1 — Experiência dos fluxos principais

1. **Agendamento exige uma página longa com quatro decisões simultâneas.** Recomenda-se um fluxo progressivo com resumo fixo e CTA persistente.
2. **Cadastro mistura três públicos em um único formulário.** Cliente, dono e profissional têm necessidades diferentes e devem receber onboarding próprio.
3. **Sincronização ocupa destaque demais.** O estado offline deve ser discreto e contextual; sincronização manual pode ficar no cabeçalho ou perfil.
4. **Feedback usa alertas nativos ou `window.alert`.** Falta um padrão de toast, modal de confirmação, erro inline e estado de sucesso.
5. **Texto e idioma são inconsistentes.** Há strings em português, inglês e traduções antigas na mesma experiência.
6. **Perfil da barbearia usa dados fictícios quando informações estão ausentes.** O ideal é exibir estado incompleto, nunca endereço e telefone inventados.

### P2 — Qualidade visual e manutenção

1. A identidade atual depende de preto + dourado sem elementos distintivos da marca.
2. Montserrat e Inter produzem hierarquia genérica; uma tipografia editorial pode fortalecer o posicionamento.
3. Há emojis usados como ícones em áreas críticas.
4. Arquivos de tela chegam a mais de mil linhas, misturando dados, regras e apresentação.
5. Não há componentes reutilizáveis para cartões, cabeçalhos, campos, badges, calendários ou estados vazios.

## Direção visual recomendada

**Conceito: “Precisão de oficina, ritmo de agenda”.** Uma estética premium e funcional, inspirada em ferramentas de barbearia e interfaces de operação, sem cair no clichê retrô.

- Fundo obsidiana e superfícies zinc, com bordas finas e textura de grão discreta.
- Âmbar quente como cor CutSync; a cor da barbearia deve personalizar detalhes, não substituir toda a identidade do produto.
- Tipografia de títulos geométrica/editorial e corpo altamente legível.
- Cartões com cantos moderados, sem excesso de sombras ou efeitos arredondados.
- Ícones vetoriais consistentes no lugar de emojis e símbolos de texto.
- Movimento curto e funcional: entrada de páginas, seleção, conclusão e alteração de status.

## Nova arquitetura de navegação

### Administrador

- Visão geral
- Agenda
- Equipe
- Serviços
- Financeiro
- Configurações

No desktop: sidebar recolhível. No mobile: navegação inferior com os quatro destinos mais usados e menu “Mais”.

### Barbeiro

- Meu dia
- Agenda da equipe
- Encaixe rápido
- Ganhos
- Perfil

### Cliente

- Explorar
- Agendamentos
- Favoritos
- Perfil

## Ordem recomendada de implementação

### Fase 1 — Base visual

- Tokens de cor, tipografia, espaçamento e elevação.
- Componentes compartilhados: `Screen`, `AppHeader`, `Button`, `Input`, `Card`, `Badge`, `EmptyState`, `SyncStatus` e `BottomNav`.
- Navegação responsiva por perfil.
- Estados de carregamento, erro, vazio e sucesso.

### Fase 2 — Fluxos de maior retorno

1. Redesenhar o agendamento do cliente.
2. Redesenhar o dashboard administrativo e separar Agenda e Financeiro.
3. Redesenhar o painel “Meu dia” do barbeiro e o encaixe rápido.
4. Simplificar login, cadastro e onboarding por perfil.

### Fase 3 — Telas de apoio

- Equipe, serviços, configurações e perfil público da barbearia.
- Padronização completa de textos e tradução.
- Acessibilidade, testes visuais e responsividade final.

## Achados técnicos que devem preceder ou acompanhar o redesign

- O projeto está sem dependências instaladas no ambiente atual; por isso a checagem TypeScript não consegue resolver React/Expo.
- A camada `useSync` foi removida; os painéis usam hooks Supabase Realtime.
- `use-theme.ts` referencia `@/constants/theme`, porém essa estrutura não existe no repositório.
- O `package.json` ainda identifica o projeto como `ctrlshot`, apesar do produto se chamar CutSync.
- A configuração do Supabase aceita variáveis ausentes e cria o cliente com strings vazias; a falha deveria ser explícita.
- O README ainda é o padrão do Expo e não documenta arquitetura, perfis ou setup real.
- A diretriz de redesign está registrada em `design_guidelines.json`; a recomendação de usar JavaScript contida nesse arquivo deve ser ignorada, pois o projeto existente é TypeScript.

## Primeira entrega sugerida

Construir a fundação visual compartilhada e aplicar o novo padrão em três telas-piloto: Login, Visão Geral do Admin e Agendamento. Essas telas cobrem aquisição, operação e conversão, validando o sistema antes da migração do restante do produto.