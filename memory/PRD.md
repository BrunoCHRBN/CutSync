# PRD — Plano técnico de correções do CutSync

## Solicitação original

Produzir, sem alterar o código funcional nesta etapa, um plano de correção para:

1. Remover a obrigatoriedade de descrição ao adicionar foto no perfil profissional.
2. Corrigir falha de upload de arquivo local no perfil profissional.
3. Corrigir atualização da tabela de desempenho/comissão do Admin ao alternar dia/semana/mês.
4. Otimizar a navegação do calendário de Admin e profissional no desktop, hoje avançando sete dias por clique.
5. Corrigir ausência de horários disponíveis no agendamento do cliente.
6. Corrigir falha ao criar encaixe rápido pelo profissional.
7. Corrigir o calendário “Ritmo do dia”: atualização ao trocar o dia e abertura do encaixe já no horário clicado.
8. Exibir confirmação em pop-up após agendamento, cancelamento, reagendamento e troca de senha, estendendo o padrão às demais roles.
9. Corrigir o card “Próximo atendimento” de profissional e Admin quando existem agendamentos.

## Arquitetura observada

- Aplicação universal Expo Router / React Native Web, com TypeScript.
- Supabase para autenticação, PostgreSQL, RPCs transacionais, Storage e Realtime.
- Telas principais concentradas em `src/components/screens`.
- Agenda compartilhada pelo hook `src/hooks/useAppointments.ts`.
- Regras transacionais de agendamento em `supabase/migrations/20260716057000_transactional_appointment_creation.sql`.

## Diagnóstico e ordem de prioridade

### P0 — Recuperar o fluxo principal de agendamento

#### 1. Agenda do profissional/Admin não respeita o período selecionado

**Evidência técnica**

- `AdminDashboardExperience.tsx` e `BarberDashboardExperience.tsx` chamam `useAppointments` com propriedades `start` e `end`.
- O contrato real de `useAppointments` aceita somente `dateFrom` e `dateTo`.
- As propriedades desconhecidas são ignoradas; a consulta retorna um conjunto diferente do esperado e a interface tenta filtrá-lo localmente.

**Impactos associados**

- Tabela de desempenho/comissão pode não mudar corretamente entre hoje, semana e mês.
- “Ritmo do dia” pode continuar mostrando dados de outra data.
- “Agenda livre” pode ser exibida de forma incorreta.
- O cálculo local de conflitos do encaixe pode trabalhar com dados incompletos ou excessivos.

**Plano de correção**

1. Padronizar o contrato temporal do hook para `dateFrom`/`dateTo` em ISO, ou aceitar explicitamente `Date` e converter internamente.
2. Atualizar Admin e profissional para usar o contrato correto.
3. Separar a consulta da agenda diária da consulta analítica de desempenho; hoje uma única consulta muda de escopo quando o filtro de desempenho é alterado.
4. Manter uma fonte diária para “Ritmo do dia” e outra fonte para métricas do período.
5. Garantir que o Realtime refaça as duas consultas relevantes sem recriar canais desnecessários.

**Critérios de aceite**

- Trocar a data atualiza somente a agenda diária.
- Trocar hoje/semana/mês atualiza faturamento, atendimentos e repasse, sem alterar indevidamente o dia selecionado.
- Um agendamento criado, cancelado ou concluído aparece no período correto sem recarregar a página.
- Limites de semana e mês são validados no fuso do estabelecimento.

#### 2. Disponibilidade de horários para o cliente

**Evidência técnica**

- Existem dois fluxos de reserva: `BookingExperience.tsx` e `src/app/[slug]/booking.tsx`, com regras diferentes.
- Um fluxo consulta diretamente `appointments`; o público usa `get_public_busy_slots`.
- Os horários disponíveis são listas fixas e não consideram de forma consistente `opening_hours`, `work_hours`, serviço por profissional ou fuso do estabelecimento.
- O fluxo público bloqueia apenas conflito; ele não exclui horário passado no dia atual.
- Falhas na consulta de disponibilidade são registradas no console, mas a UI pode permanecer em estado vazio/indefinido.

**Plano de correção**

1. Criar uma única fonte de verdade para disponibilidade, preferencialmente uma RPC `get_available_slots`.
2. A RPC deve receber estabelecimento, profissional, serviço e data local; retornar horários livres já considerando:
   - horário do estabelecimento;
   - jornada do profissional;
   - duração personalizada do serviço;
   - intervalos e status ativos;
   - bloqueio de horários passados;
   - fuso do estabelecimento;
   - sobreposição protegida pela constraint já existente.
3. Fazer os dois caminhos de agendamento consumirem a mesma função; idealmente consolidar as duas telas depois da estabilização.
4. Exibir estados distintos: carregando, sem expediente, agenda lotada e falha ao consultar.
5. Limpar o horário selecionado quando serviço, profissional ou data mudar.

**Critérios de aceite**

- Hoje exibe apenas horários futuros livres.
- Dias seguintes exibem a jornada configurada do profissional.
- Um horário ocupado desaparece imediatamente após reserva concorrente.
- Dias fechados mostram “Sem expediente nesta data”, não uma falha genérica.
- Web, Android e iOS produzem a mesma lista para o mesmo fuso.

#### 3. Encaixe rápido do profissional

**Evidência técnica**

- A criação usa corretamente a RPC `create_appointment`, mas converte todo erro não relacionado a conflito na mensagem genérica “Não foi possível criar o encaixe”.
- A RPC também pode rejeitar por data passada, vínculo inativo, serviço indisponível ou serviço desabilitado para o profissional.
- Ao abrir o modal clicando num horário da timeline, um `useEffect` redefine `quickDate` para hoje e `quickTime` para o horário mais próximo, sobrescrevendo a data/hora escolhida.

**Plano de correção**

1. Introduzir uma origem de abertura do modal: botão geral ou slot da timeline.
2. Se aberto por um slot, preservar `selectedDate` e o horário clicado; só aplicar padrão “hoje/próximo horário” quando aberto pelo botão geral.
3. Validar data futura, vínculo e compatibilidade profissional-serviço antes do envio.
4. Mapear os códigos da RPC para mensagens específicas e observáveis.
5. Usar a disponibilidade centralizada para evitar validação de conflito duplicada e divergente no cliente.

**Critérios de aceite**

- Clicar em 15:30 de uma data futura abre o encaixe em 15:30 daquela data.
- Todos os campos preenchidos e válidos criam um atendimento confirmado.
- Serviço incompatível, horário passado e conflito apresentam mensagens distintas.
- O novo atendimento aparece imediatamente no “Ritmo do dia” e no próximo atendimento.

### P1 — Consistência operacional e navegação

#### 4. “Próximo atendimento” do profissional e Admin

**Evidência técnica**

- O profissional faz uma consulta separada com relacionamento `appointments_barber_id_fkey`; qualquer erro é ignorado e interpretado como ausência de dados.
- O card não diferencia erro de consulta de agenda realmente livre.
- No Admin, “Próximos atendimentos” é, na prática, a lista da data selecionada, não um próximo atendimento global.

**Plano de correção**

1. Criar um seletor/hook único para o próximo agendamento ativo (`pending`/`confirmed`, `date_time >= agora`).
2. Usar o relacionamento tipado já resolvido por `useAppointments`, evitando uma consulta paralela com erro silencioso.
3. Para Admin, definir e implementar explicitamente:
   - card global: próximo atendimento de toda a unidade; e
   - painel diário: atendimentos da data selecionada.
4. Exibir estado de erro (“Não foi possível consultar”) separado de “Agenda livre”.

**Critérios de aceite**

- Havendo atendimento futuro ativo, o card nunca mostra agenda livre.
- Cancelar o próximo promove automaticamente o atendimento seguinte.
- Concluir um atendimento não mantém o card preso ao horário anterior.

#### 5. Calendários de Admin e profissional no desktop

**Evidência técnica**

- As setas alteram `selectedDate` em `-7/+7` dias, tanto no Admin quanto no profissional.
- A grade desktop mostra sete datas centralizadas ao redor da seleção, tornando o avanço semanal pouco preciso para operação diária.

**Plano de correção**

1. No desktop, alterar setas para avançar/retroceder um dia.
2. Manter navegação por semana como ação separada, se necessária, com rótulo explícito.
3. Adicionar seletor de data nativo/popover e botão “Hoje”.
4. No mobile, preservar rolagem horizontal e avaliar navegação em blocos menores sem quebrar o gesto atual.
5. Extrair um componente compartilhado de navegação de data para Admin e profissional.

**Critérios de aceite**

- Um clique na seta muda exatamente um dia no desktop.
- É possível saltar diretamente para qualquer data permitida.
- Trocar a data atualiza título, agenda, slots livres e estado selecionado em conjunto.

#### 6. “Ritmo do dia” do profissional

**Plano de correção complementar**

1. Corrigir o filtro temporal conforme item P0.1.
2. Gerar slots a partir da data selecionada, não de objetos `new Date()` com o dia atual.
3. Em dia fechado, não gerar fallback artificial de 09:00–18:00; mostrar estado sem expediente.
4. Preservar horário e data ao abrir encaixe por um slot, conforme P0.3.
5. Garantir que as abas “Minha agenda” e “Agenda da equipe” respeitem data e permissão `share_agendas`.

### P1 — Perfil profissional e upload

#### 7. Remover obrigatoriedade da descrição da foto

**Evidência técnica**

- O frontend exige no mínimo três caracteres em `galleryAlt`.
- A constraint `is_valid_professional_gallery` no banco também exige `alt` entre 3 e 160 caracteres.
- Remover apenas no frontend continuará causando `invalid_gallery` no banco.

**Plano de correção**

1. Tornar `alt` opcional no tipo de galeria.
2. Alterar validação no frontend para exigir somente imagem válida.
3. Criar migration que aceite `alt` ausente/vazio, mantendo limite de 160 quando informado.
4. Na exibição pública, usar fallback acessível contextual, por exemplo “Trabalho publicado por {profissional}”, quando não houver descrição.
5. Ajustar textos da UI para “Descrição opcional”.

**Critérios de aceite**

- Foto sem descrição pode ser adicionada e salva.
- Foto com descrição continua sendo publicada normalmente.
- Leitores de tela recebem fallback útil quando `alt` estiver vazio.

#### 8. Upload de arquivo local no perfil profissional

**Evidência técnica**

- A tela atual do perfil profissional oferece apenas campo de URL HTTPS; não implementa seletor/upload local.
- O único upload existente está em configurações do estabelecimento, usando bucket `banners`.
- Bucket e políticas de Storage não estão versionados nas migrations, portanto a operação pode falhar com “não foi possível inserir arquivo”.
- O upload atual usa `fetch(uri).blob()`, abordagem que deve ser validada separadamente em web e dispositivos nativos.

**Plano de correção**

1. Criar bucket dedicado, por exemplo `professional-gallery`, via migration/configuração versionada.
2. Adicionar políticas de Storage para:
   - profissional inserir apenas em pasta própria (`auth.uid()`);
   - atualizar/excluir apenas arquivos próprios;
   - leitura pública somente dos itens publicados, ou bucket público conforme decisão de privacidade.
3. Adicionar ImagePicker no editor profissional, com validação de MIME, tamanho máximo e extensões permitidas.
4. Implementar adaptador de upload multiplataforma; normalizar nome do arquivo e `contentType` sem depender da extensão da URI.
5. Após upload, inserir `{ url, alt? }` na galeria e salvar via RPC.
6. Se o salvamento do perfil falhar após o upload, remover o arquivo órfão ou registrá-lo para limpeza.
7. Traduzir erros de Storage/RLS em mensagens úteis.

**Critérios de aceite**

- JPG, PNG e WebP válidos podem ser enviados no web, Android e iOS.
- Arquivo acima do limite ou tipo inválido é bloqueado antes do envio.
- Um profissional não consegue escrever na pasta de outro.
- Falha de banco não deixa arquivos órfãos permanentemente.

### P2 — Feedback transversal de ações

#### 9. Pop-ups de sucesso para todas as roles

**Evidência técnica**

- O projeto mistura `window.alert`, `Alert.alert`, avisos inline e redirecionamento sem confirmação.
- Cancelamento e troca de senha já usam aviso inline; reagendamento varia por tela; agendamento redireciona sem confirmação persistente.

**Plano de correção**

1. Criar um componente/serviço compartilhado de feedback compatível com web e nativo.
2. Usar modal de confirmação antes de ações destrutivas e toast/pop-up de resultado após sucesso ou erro.
3. Definir catálogo padronizado de eventos:
   - agendamento criado;
   - agendamento cancelado;
   - agendamento reagendado;
   - encaixe criado;
   - status atualizado;
   - senha alterada;
   - perfil/configurações salvos;
   - serviço/equipe atualizados.
4. Preservar a confirmação após navegação por parâmetro de rota ou estado global de curta duração.
5. Incluir `testID` único, título, mensagem, ação opcional e fechamento acessível.

**Critérios de aceite**

- Toda mutação importante produz feedback visível e consistente.
- Sucesso só aparece após confirmação real do Supabase/RPC.
- O pop-up não bloqueia navegação nem se repete ao recarregar.

## Sequência recomendada de implementação

### Sprint 1 — Agenda confiável

1. Corrigir contrato temporal de `useAppointments`.
2. Separar consultas de agenda diária e desempenho.
3. Implementar disponibilidade centralizada.
4. Corrigir encaixe rápido e preservação do slot clicado.
5. Corrigir próximo atendimento.

## Plano de execução detalhado — Sprint 1

### Objetivo da Sprint

Restabelecer a confiabilidade ponta a ponta da agenda: os dados exibidos devem acompanhar a data e o período selecionados, clientes devem encontrar horários realmente disponíveis, encaixes devem preservar o slot escolhido e o próximo atendimento deve refletir o banco em tempo real.

### Prioridade definida por impacto

1. **S1-01 — Contrato temporal da agenda:** desbloqueia Admin, profissional, desempenho e “Ritmo do dia”.
2. **S1-02 — Separação entre agenda diária e analytics:** impede que filtros de comissão alterem a agenda operacional.
3. **S1-03 — Disponibilidade centralizada:** recupera o fluxo de conversão do cliente.
4. **S1-04 — Encaixe rápido e slot selecionado:** recupera a operação manual do profissional.
5. **S1-05 — Próximo atendimento:** corrige informação operacional de destaque.
6. **S1-06 — Feedback mínimo da Sprint:** mensagens específicas de erro/sucesso para os fluxos alterados; o sistema transversal completo continua na Sprint 3.

O calendário desktop permanece na Sprint 2, conforme decisão do usuário.

### S1-01 — Corrigir o contrato temporal de `useAppointments`

**Arquivos principais**

- `src/hooks/useAppointments.ts`
- `src/components/screens/AdminDashboardExperience.tsx`
- `src/components/screens/BarberDashboardExperience.tsx`

**Tarefas**

1. Definir `dateFrom` e `dateTo` como contrato oficial do hook, recebendo strings ISO.
2. Substituir as chamadas incorretas com `start`/`end` nas duas dashboards.
3. Criar utilitário compartilhado para início/fim do dia, semana e mês no fuso do estabelecimento.
4. Evitar dependências instáveis no `useCallback`; gerar chaves determinísticas para filtros de status.
5. Manter a inscrição Realtime filtrada por estabelecimento/profissional e refazer a consulta com o intervalo vigente.
6. Tratar intervalo inválido (`dateTo < dateFrom`) antes de consultar.

**Critérios de aceite**

- Selecionar outro dia dispara consulta com início e fim daquele dia.
- A resposta não contém registros fora do intervalo.
- Realtime mantém o intervalo atual após inserção/atualização.
- TypeScript impede novas chamadas com `start`/`end` desconhecidos.

**Testes previstos**

- Hook com dia atual, dia futuro e virada de mês.
- Hook desabilitado e sem estabelecimento.
- Atualização Realtime dentro e fora do intervalo.

### S1-02 — Separar agenda diária de desempenho/comissão

**Arquivo principal**

- `src/components/screens/AdminDashboardExperience.tsx`

**Tarefas**

1. Criar uma consulta diária fixa baseada em `selectedDate` para o painel “Próximos atendimentos”.
2. Criar uma segunda consulta baseada em `period` para faturamento, ocupação e desempenho da equipe.
3. Renomear estados para evitar ambiguidade, por exemplo `dailyAppointments` e `periodAppointments`.
4. Calcular comissão somente sobre atendimentos concluídos no período analítico.
5. Obter a taxa de comissão do vínculo ativo da unidade, sem fallback silencioso quando a informação estiver ausente.
6. Definir semana operacional de forma explícita e manter a mesma regra em UI e testes.
7. Evitar que a troca de hoje/semana/mês mude `selectedDate` ou a lista diária.

**Critérios de aceite**

- Alternar hoje/semana/mês altera valores e repasses corretamente.
- A lista da agenda continua mostrando somente a data selecionada.
- Profissionais sem atendimentos concluídos aparecem com zero, não com dados de outro período.
- Cancelados não entram em faturamento ou comissão.

**Testes previstos**

- Mesmo profissional com atendimentos concluídos em três períodos diferentes.
- Atendimento pendente, confirmado, concluído e cancelado.
- Taxas de comissão distintas entre profissionais.
- Troca de estabelecimento pelo Admin sem reutilizar dados anteriores.

### S1-03 — Centralizar disponibilidade do cliente

**Arquivos principais**

- Nova migration Supabase para `get_available_slots`.
- `src/components/screens/BookingExperience.tsx`
- `src/app/[slug]/booking.tsx`
- `src/utils/schedule.ts`
- `src/types/supabase.generated.ts` após regeneração do contrato.

**Contrato proposto da RPC**

Entrada:

- `target_establishment_id`
- `target_professional_id`
- `target_service_id`
- `target_local_date`

Saída por slot:

- `starts_at` em timestamptz
- `local_time` para exibição
- `duration_minutes`
- `available`
- `unavailable_reason` apenas quando necessário

**Regras da RPC**

1. Validar estabelecimento, vínculo ativo e serviço ativo.
2. Resolver duração e preço personalizados em `professional_services`, com fallback para o serviço global.
3. Intersectar `opening_hours` da unidade com `work_hours` do profissional.
4. Gerar slots em intervalos consistentes, inicialmente 30 minutos.
5. Remover slots passados no fuso da unidade.
6. Remover sobreposições com agendamentos `pending` e `confirmed`.
7. Retornar lista vazia válida para dia fechado, sem mascarar erro técnico.

**Mudanças de frontend planejadas**

1. Remover listas fixas de horários dos dois fluxos.
2. Consultar slots após selecionar serviço, profissional e data.
3. Invalidar seleção de horário quando qualquer uma dessas três escolhas mudar.
4. Exibir estados específicos: carregando, dia fechado, agenda lotada e erro.
5. Confirmar novamente pela RPC transacional `create_appointment`; disponibilidade é informativa, a constraint continua sendo a proteção final.

**Critérios de aceite**

- O mesmo profissional/serviço/data retorna horários iguais nos dois fluxos de agendamento.
- Horários passados não aparecem no dia atual.
- Duração de 60 minutos bloqueia toda sobreposição, mesmo entre slots de 30 minutos.
- Um slot reservado por outro cliente deixa de ser confirmável e produz conflito tratado.
- Dia sem expediente possui mensagem própria.

**Testes previstos**

- Dia atual antes e depois do expediente.
- Profissional com jornada menor que a unidade.
- Serviço de 30, 60 e 90 minutos.
- Serviço personalizado para profissional.
- Dois clientes tentando reservar o mesmo slot.
- Fuso do estabelecimento diferente do dispositivo.

### S1-04 — Corrigir encaixe rápido do profissional

**Arquivos principais**

- `src/components/screens/BarberDashboardExperience.tsx`
- `src/components/professional/ProfessionalQuickBook.tsx`
- Utilitário compartilhado de tradução de erros RPC.

**Tarefas**

1. Adicionar estado `quickBookSource: 'header' | 'timeline'`.
2. Ao abrir pelo cabeçalho, iniciar em hoje e no próximo slot válido.
3. Ao abrir pela timeline, preservar `selectedDate` e o slot clicado.
4. Remover o efeito que sempre redefine data/hora ao abrir o modal.
5. Consumir a mesma disponibilidade criada em S1-03.
6. Validar que o serviço está ativo para o profissional antes do envio.
7. Mapear erros conhecidos:
   - `appointment_must_be_in_future`;
   - `appointment_conflict`;
   - `professional_unavailable`;
   - `service_unavailable`;
   - `service_unavailable_for_professional`;
   - `client_name_required`;
   - `forbidden`.
8. Após sucesso, fechar modal, limpar formulário, atualizar agenda diária e próximo atendimento.

**Critérios de aceite**

- Slot clicado não é substituído ao abrir o modal.
- Encaixe válido é criado como confirmado.
- Erros de regra exibem mensagem específica.
- Duplo clique não cria dois registros.

**Testes previstos**

- Abertura pelo cabeçalho e pela timeline.
- Slot de hoje, futuro e passado.
- Serviço permitido e desabilitado.
- Concorrência durante a confirmação.

### S1-05 — Corrigir “Próximo atendimento”

**Arquivos principais**

- Novo hook/seletor compartilhado, sugerido: `src/hooks/useNextAppointment.ts`.
- `src/components/screens/BarberDashboardExperience.tsx`
- `src/components/screens/AdminDashboardExperience.tsx`

**Tarefas**

1. Consultar apenas `pending` e `confirmed` com `date_time >= agora`.
2. Para profissional, filtrar também por `professional_id`.
3. Para Admin, filtrar por estabelecimento e retornar o próximo da unidade.
4. Reutilizar os nomes de participantes obtidos pelas RPCs seguras existentes.
5. Remover a consulta direta que ignora erros no dashboard profissional.
6. Atualizar o card via Realtime e após mutações locais.
7. Separar os estados “carregando”, “erro” e “agenda livre”.

**Critérios de aceite**

- O atendimento futuro mais próximo aparece para cada role.
- Cancelar/concluir promove o próximo imediatamente.
- Atendimento de outro profissional não aparece no card pessoal.
- Falha de consulta não é apresentada como agenda livre.

**Testes previstos**

- Sem agendamentos futuros.
- Vários agendamentos no mesmo dia e em dias diferentes.
- Primeiro registro cancelado durante a sessão.
- Admin alternando estabelecimento.

### S1-06 — Feedback mínimo dos fluxos alterados

**Escopo nesta Sprint**

- Agendamento criado.
- Encaixe criado.
- Conflito de horário.
- Falha ao carregar disponibilidade.
- Falha ao carregar próximo atendimento.

**Regra**

Usar os componentes atuais de aviso de forma consistente nesta Sprint. A substituição completa de `window.alert`, `Alert.alert` e avisos inline por um sistema global permanece na Sprint 3.

### Dependências entre tarefas

- S1-01 deve ser concluída antes de S1-02 e S1-05.
- S1-03 deve ser concluída antes de finalizar S1-04.
- S1-06 acompanha cada entrega, sem bloquear a lógica principal.

### Ordem de implementação recomendada

1. S1-01 — contrato temporal.
2. S1-02 — consultas separadas do Admin.
3. S1-03 backend — RPC de disponibilidade e testes SQL.
4. S1-03 frontend — unificação dos dois fluxos.
5. S1-04 — encaixe rápido.
6. S1-05 — próximo atendimento.
7. Regressão conjunta e fechamento da Sprint.

### Definition of Done da Sprint 1

- TypeScript e lint sem novos erros nos arquivos alterados.
- Testes SQL de disponibilidade, conflito e autorização aprovados.
- Fluxos E2E de cliente, profissional e Admin aprovados no web.
- Smoke tests em Android e iOS para seleção de data/horário.
- Nenhuma mensagem de agenda livre causada por erro silencioso.
- Nenhuma lista fixa de horários remanescente nos fluxos de cliente alterados.
- Nenhuma divergência conhecida entre disponibilidade exibida e criação transacional.
- Documentação e tipos Supabase atualizados junto da migration.

## Implementação concluída — S1-01

**Estado:** concluída no código-fonte em 19/07/2026.

### Alterações aplicadas

- `AdminDashboardExperience.tsx` passou a enviar `dateFrom` e `dateTo` em ISO para o intervalo de hoje/semana/mês.
- `BarberDashboardExperience.tsx` passou a enviar `dateFrom` e `dateTo` em ISO para o dia selecionado.
- As duas dashboards desabilitam a consulta enquanto o estabelecimento ainda não está disponível.
- `useAppointments.ts` agora valida data inicial, data final e intervalo invertido antes de consultar.
- O filtro de status foi estabilizado para não usar expressão complexa na lista de dependências React.
- O efeito Realtime acompanha explicitamente os identificadores usados no canal e reutiliza a consulta com o intervalo vigente.
- Imports obsoletos nas duas dashboards foram removidos.

### Validação executada

- ESLint direcionado aos três arquivos alterados: aprovado sem erros ou avisos.
- Export web Expo: aprovado.
- Regressões existentes: 9 testes aprovados.
- Nova suíte S1-01: 5 testes aprovados.
- Total direcionado: 14 testes aprovados.
- Aplicação web exportada carrega corretamente; sem variáveis Supabase locais, exibe o estado seguro de configuração esperado.

### Limitações conhecidas fora da S1-01

- A checagem TypeScript completa ainda possui erros preexistentes de tipos Supabase e outros módulos fora do escopo; o build web foi aprovado.
- O ambiente de execução local usa Node 20, enquanto o projeto declara Node 22; validações foram executadas pelos binários instalados diretamente.
- A versão externa verificada pelo agente de testes ainda servia um bundle anterior sem os filtros temporais. O código-fonte atual e as regressões confirmam a correção; a validação externa deve ser repetida quando essa versão estiver publicada.
- Separação entre consulta diária e consulta analítica continua em S1-02.
- Centralização de fuso por estabelecimento continua em S1-03, conforme decisão registrada.

## Implementação concluída — S1-02

**Estado:** concluída no código-fonte em 19/07/2026.

### Decisões aplicadas

- O período “Semana” usa segunda-feira a domingo.
- Comissão ausente não recebe fallback financeiro: usa 0% e exibe “Comissão não configurada”.
- O filtro analítico é relativo ao período atual; trocar a data operacional não desloca hoje/semana/mês.

### Alterações aplicadas

- A agenda diária do Admin possui consulta própria, limitada por `selectedDate`.
- Métricas, faturamento e desempenho possuem segunda consulta independente, limitada por `period`.
- Trocar hoje/semana/mês não altera a data nem os registros do painel operacional.
- Mutações e atualização manual recarregam as consultas diária e analítica em paralelo.
- Faturamento e repasse consideram somente atendimentos concluídos do período.
- Cancelados ficam fora da ocupação; a capacidade usa a quantidade real de dias do intervalo.
- O mapeamento de registros para a dashboard foi centralizado em uma única função.
- Instâncias simultâneas de `useAppointments` agora possuem canais Realtime únicos por intervalo e instância.
- Valores de produção, bruto e comissão receberam identificadores próprios para regressão automatizada.

### Validação executada

- ESLint direcionado: aprovado.
- Export web Expo: aprovado.
- Regressões S1-01, S1-02 e fluxo de booking: 21 testes aprovados.
- Carregamento visual local: aprovado no estado seguro de configuração.
- Teste externo confirmou que os controles não alteram a data selecionada; a versão externa observada ainda utiliza bundle anterior sem filtros temporais.

### Próximos itens

- S1-03: disponibilidade centralizada do cliente e fuso do estabelecimento.
- Modularização mais ampla da dashboard Admin permanece como melhoria de manutenção, sem bloquear a correção funcional entregue.

## Implementação concluída — S1-03

**Estado:** concluída no código-fonte em 19/07/2026.

### Decisões aplicadas

- Grade de horários em intervalos de 30 minutos.
- Se estabelecimento e profissional possuem jornada, vale a interseção das duas.
- Se somente um possui jornada, vale a jornada configurada.
- Se nenhum possui jornada, nenhum slot é oferecido e a interface informa “Jornada não configurada”.
- Um serviço pode terminar exatamente no fechamento.
- Datas e horários são resolvidos pelo `timezone` do estabelecimento.

### Backend implementado

- Migration `20260719000000_centralized_availability.sql` cria a RPC pública `get_available_slots` e a função interna `compute_available_slots`.
- A disponibilidade valida unidade, vínculo ativo, serviço ativo e personalização do serviço por profissional.
- Duração personalizada prevalece sobre a duração global.
- Slots passados, dias fechados, intervalos fora da jornada e sobreposições com `pending`/`confirmed` são bloqueados.
- `create_appointment` e `reschedule_appointment` agora validam exatamente a mesma regra da disponibilidade antes de gravar.
- Conflitos continuam protegidos pela exclusion constraint transacional.
- Reagendamento ignora somente o próprio compromisso e somente após autorização do cliente, Admin ou profissional responsável.
- Foram adicionados testes SQL para interseção de jornada, duração personalizada e disponibilidade.

### Frontend implementado

- Novo hook compartilhado `useAvailableSlots` consome `get_available_slots` nos dois fluxos de agendamento.
- Listas fixas de horários e leituras diretas de agendamentos ocupados foram removidas.
- O horário confirmado usa `starts_at` retornado pelo banco, eliminando conversão pelo fuso do dispositivo.
- A seleção é invalidada quando serviço, profissional, data ou disponibilidade mudam.
- O slot é revalidado imediatamente antes de criar ou reagendar.
- Disponibilidade é atualizada automaticamente a cada 15 segundos enquanto a seleção está completa.
- A interface diferencia carregamento, erro, jornada inválida, dia fechado, expediente encerrado, agenda lotada e ausência de horários.
- Datas do calendário são formatadas localmente sem `toISOString().split('T')[0]`, evitando deslocamento de dia.
- Tipos Supabase foram atualizados com o contrato da nova RPC.

### Pipeline corrigido durante a validação

- `package-lock.json` foi sincronizado com `package.json` e `lucide-react-native` 1.25.0.
- Instalação de Vercel e CI passou a usar `npm ci` sem fallback inseguro.
- Instalação limpa foi validada com sucesso.

### Validação executada

- ESLint direcionado: aprovado.
- Export web Expo: aprovado.
- Instalação limpa por lock file: aprovada.
- Regressões S1-01, S1-02, S1-03, booking e pipeline: 37 testes aprovados.
- Verificações estruturais e de autorização do SQL: aprovadas.
- Aplicação web local: carregamento aprovado no estado seguro de configuração.

### Limitações conhecidas

- Os testes SQL foram criados, mas não puderam ser executados contra PostgreSQL neste container porque `psql` e Supabase CLI não estão disponíveis.
- A versão externa observada pelo agente ainda servia o fluxo anterior e não chamou `get_available_slots`; portanto, a integração real da nova RPC ainda não foi validada nesse ambiente externo.
- Modularização da tela pública de agendamento permanece como melhoria de manutenção e não bloqueia a funcionalidade implementada.

### Próximo item

- S1-04: corrigir encaixe rápido e preservar data/horário clicados no “Ritmo do dia”, consumindo a disponibilidade centralizada criada nesta etapa.

## Implementação concluída — S1-04

**Estado:** concluída no código-fonte em 19/07/2026.

### Alterações aplicadas

- O encaixe rápido agora registra explicitamente a origem de abertura: cabeçalho ou timeline.
- Abertura pelo cabeçalho inicia no dia atual do fuso do estabelecimento e seleciona o primeiro horário válido retornado pelo banco.
- Abertura pela timeline preserva a data selecionada e o horário clicado; o efeito que sobrescrevia esses valores foi removido.
- O modal profissional passou a consumir `useAvailableSlots`/`get_available_slots`, removendo a lista fixa e a leitura direta de horários ocupados desse fluxo.
- Horários são enviados para `create_appointment` usando o `starts_at` retornado pela RPC, sem conversão pelo fuso do dispositivo.
- A disponibilidade é revalidada imediatamente antes da confirmação para tratar concorrência.
- Resultados antigos de disponibilidade não aparecem durante troca de serviço ou data; o hook vincula cada resultado à consulta que o originou.
- O modal diferencia carregamento, erro, ausência de horários e slot clicado indisponível para o serviço selecionado.
- Serviço inativo é bloqueado antes do envio e erros conhecidos da RPC possuem mensagens específicas.
- Um bloqueio síncrono por referência, além do estado de carregamento, impede submissões duplicadas.
- Após sucesso, o modal fecha, o formulário é limpo, o feedback é exibido e a agenda diária é atualizada.

### Validação executada

- ESLint direcionado aos quatro arquivos TypeScript alterados: aprovado.
- Export web Expo: aprovado.
- Regressões S1-01, S1-02, S1-03, S1-04 e booking: 36 testes aprovados.
- Suíte completa do backend: 48 testes aprovados; 4 falhas preexistentes permanecem nos testes do validador de schema Supabase, fora do S1-04.
- O bundle gerado contém `get_available_slots`, proteção contra resultados antigos, estados do modal e tradução de erros.
- A RPC auxiliar `get_appointment_participant_names`, observada com 403 transitório pelo teste externo, foi chamada diretamente com a sessão profissional e respondeu 200.
- O agente de testes confirmou criação real de encaixe e feedback de sucesso na versão pública.

### Limitações conhecidas

- A versão pública inspecionada ainda contém a implementação anterior do modal profissional: possui `get_available_slots` nos fluxos de cliente, mas não as assinaturas `quickBookSource` e `barber-quick-selected-time-unavailable` do S1-04. Por isso, a chamada de disponibilidade do novo encaixe não pôde ser observada nessa versão.
- A checagem TypeScript global continua com erros preexistentes de tipos Supabase e módulos fora do S1-04; os arquivos alterados passaram no ESLint e no export web.
- O ambiente local usa Node 20, enquanto o projeto exige Node 22; instalação e comandos foram executados sem alterar as versões declaradas.

### Próximo item

- S1-05: corrigir o card “Próximo atendimento” com uma fonte compartilhada, estados de carregamento/erro e atualização em tempo real.

## Implementação concluída — S1-05

**Estado:** concluída no código-fonte em 19/07/2026.

### Alterações aplicadas

- Novo hook compartilhado `useNextAppointment` consulta somente atendimentos `pending` e `confirmed` com `date_time >= agora`, em ordem crescente e limitado ao primeiro registro.
- A consulta do profissional filtra simultaneamente por estabelecimento e `professional_id`; a consulta do Admin retorna o próximo atendimento global da unidade.
- Nomes de cliente e profissional são resolvidos pela RPC segura `get_appointment_participant_names`.
- O dashboard profissional não possui mais a consulta paralela que ignorava erros.
- Novo `NextAppointmentCard` substitui a métrica antiga do profissional e diferencia carregamento, erro, agenda livre e atendimento ativo.
- Novo `GlobalNextAppointmentCard` foi adicionado ao Admin acima das métricas e permanece independente da agenda da data selecionada.
- O card global do Admin mostra cliente, serviço, profissional, data, hora e status.
- O hook possui canal Realtime próprio para inserção, atualização e exclusão de agendamentos.
- Criar, cancelar, concluir e reagendar atualizam o próximo atendimento junto das consultas operacionais existentes.
- Atualização manual das dashboards também inclui o próximo atendimento e seus estados no indicador de sincronização.
- A troca de estabelecimento/profissional invalida imediatamente o resultado anterior e exibe carregamento até a nova consulta terminar.
- As dependências do `useTeam` foram estabilizadas, removendo o erro de lint legado encontrado durante a validação.

### Validação executada

- ESLint direcionado aos arquivos S1-05 e `useTeam`: aprovado sem erros ou avisos.
- Lint completo do projeto: aprovado sem erros; permanecem 16 avisos preexistentes fora do escopo.
- Export web Expo: aprovado.
- Regressões S1-01 a S1-05 e booking: 46 testes aprovados.
- Nenhum erro TypeScript novo nos três módulos criados para S1-05.
- Consultas equivalentes às do hook foram executadas com sessões reais de profissional e Admin: agendamentos e RPC de participantes responderam 200 para as duas roles.
- O bundle gerado contém `useNextAppointment`, `next-appointment-card` e `global-next-appointment-card`.

### Limitações conhecidas

- A versão pública inspecionada ainda serve uma dashboard anterior, sem os identificadores e componentes do S1-05; por isso, os estados visuais novos não puderam ser verificados nessa versão.
- O teste externo registrou respostas 403 durante a sincronização da dashboard, mas as consultas de agendamento futuro e `get_appointment_participant_names` foram repetidas diretamente com as duas sessões e responderam 200; nenhuma falha do fluxo S1-05 foi reproduzida no backend.
- A suíte completa do backend mantém 4 falhas preexistentes nos testes do validador de schema Supabase, que usam referências deliberadamente inválidas incompatíveis com a validação atual dos scripts.
- A checagem TypeScript global continua com erros preexistentes de contratos Supabase e módulos fora do S1-05.

### Próximo item

- S1-06: consolidar o feedback mínimo dos fluxos alterados, com mensagens consistentes para criação, conflito, disponibilidade e próximo atendimento.

## Implementação iniciada — S1-06

**Estado:** primeira fatia vertical implementada no código-fonte em 19/07/2026.

### Alterações aplicadas

- As mensagens mínimas de agendamento criado, reagendamento, encaixe criado, conflito, falha de disponibilidade e falha do próximo atendimento agora possuem uma fonte compartilhada.
- Os fluxos autenticado e público encaminham agendamento e reagendamento concluídos para “Meus agendamentos”, onde o `InlineNotice` existente apresenta a confirmação.
- Conflitos e horários fora da jornada removem apenas o horário inválido, preservando serviço, profissional e data para uma nova tentativa.
- Falhas e estados vazios de disponibilidade usam `InlineNotice` de forma consistente nos dois fluxos de cliente; os modais profissionais já utilizavam o mesmo componente.
- O encaixe rápido profissional reutiliza a mensagem compartilhada de sucesso no aviso existente da dashboard.
- A falha do próximo atendimento reutiliza a mensagem compartilhada e continua sendo diferenciada do estado de agenda livre.
- Foi adicionada uma regressão estática específica para os contratos de feedback do S1-06.

### Validação executada

- ESLint direcionado aos arquivos alterados: aprovado sem erros ou avisos.
- Lint completo do projeto: aprovado sem erros; permanecem 16 avisos preexistentes fora do escopo.
- Export web Expo: aprovado.
- Regressão S1-06 executada por harness Python: 6 contratos aprovados.

### Validação restante

- Exercitar visualmente criação, reagendamento e conflito nas roles de cliente e profissional após publicar o bundle atualizado.
- Cobrir os mesmos avisos em Android e iOS na regressão conjunta da Sprint 1.

### Sprint 2 — Operação e perfil

1. Extrair calendário compartilhado e navegação diária no desktop.
2. Corrigir estados do “Ritmo do dia”.
3. Versionar bucket/policies e implementar upload profissional.
4. Tornar descrição da imagem opcional no frontend e banco.

### Sprint 3 — Feedback e regressão

1. Implementar sistema compartilhado de pop-ups/toasts.
2. Migrar ações de cliente, profissional e Admin.
3. Executar testes de regressão web, Android e iOS.

## Estratégia de testes

### Automatizados

- Testes unitários de cálculo de intervalos, fuso, data selecionada e geração de slots.
- Testes de integração do hook de agenda com `dateFrom`/`dateTo`.
- Testes SQL da RPC de disponibilidade e das políticas de Storage.
- Testes de concorrência garantindo que dois clientes não ocupem o mesmo intervalo.
- Testes E2E por role cobrindo agendar, cancelar, reagendar, encaixar e trocar senha.

### Matriz mínima manual

- Web desktop e mobile responsivo.
- Android e iOS.
- Dia atual, dia futuro, virada de mês e horário de verão/fuso configurado.
- Profissional com jornada própria, sem jornada e dia fechado.
- Serviço global, serviço personalizado e serviço desabilitado para profissional.
- Atendimento pendente, confirmado, concluído e cancelado.

## Riscos e cuidados

- Alterar `alt` exige migration de banco; mudança isolada de UI não resolve.
- Disponibilidade e criação devem usar a mesma regra para evitar slots que aparecem livres mas falham ao reservar.
- Filtros temporais devem usar o fuso do estabelecimento; confiar no fuso do dispositivo pode deslocar datas.
- Storage precisa de políticas RLS testadas antes de habilitar upload público.
- As duas experiências de agendamento devem ser consolidadas gradualmente para evitar novas divergências.

## Estado desta etapa

- Diagnóstico estático e plano técnico concluídos.
- Nenhuma correção funcional foi implementada, conforme solicitado.
- Nenhuma API ou fluxo novo foi simulado.

## Correção de pipeline — sincronização do lockfile

**Problema:** a instalação da Vercel com `npm ci` falhava porque `package.json` declarava `lucide-react-native@1.25.0`, enquanto `package-lock.json` ainda registrava `0.468.0` e dependências antigas já removidas do manifesto.

**Correção aplicada:** o `package-lock.json` foi regenerado a partir do `package.json`, preservando as versões declaradas e removendo referências obsoletas do lock.

**Validação:**

- `npm ci`: aprovado;
- `lucide-react-native`: resolvido exatamente como `1.25.0`;
- `npm run build:web`: aprovado, com exportação para `dist`;
- regressão do pipeline: 8 testes aprovados;
- `vercel.json`: confirmado com `npm ci`, `npm run build:web` e saída `dist`.

**Observação:** o ambiente local utiliza Node 20 e apresenta avisos de engine; o projeto e a configuração externa exigem Node 22. Esses avisos não bloquearam a instalação ou o build local.

---

# Planejamento complementar — Landing Page Interativa

## Solicitação original

Planejar, sem alteração de código, uma landing page da CutSync que equilibre a conversão de clientes e donos de estabelecimentos. A página deve combinar estabelecimentos reais para clientes, demonstrações com dados mockados para donos e profissionais, segmentação estilo Typeform e um caminho livre para visitantes que desejam apenas observar.

## Decisões validadas

- Equilibrar aquisição de clientes e de donos de estabelecimentos.
- Exibir a segmentação após uma apresentação curta da CutSync.
- Misturar estabelecimentos reais no caminho do cliente e ambiente demonstrativo no caminho de negócios.
- Incluir “Estou apenas observando” como terceira opção.
- Definir a precificação com base em recomendação estratégica.

## Arquitetura recomendada

### 1. Hero curto

Apresentar a promessa central em poucos segundos: descoberta e agendamento para clientes; controle e crescimento para negócios. O CTA principal abre a segmentação.

### 2. Segmentação estilo Typeform

Pergunta: “O que você quer fazer hoje?”

1. **Quero agendar um serviço** — leva à experiência de cliente.
2. **Quero gerenciar meu negócio** — leva à experiência de dono/profissional.
3. **Estou apenas observando** — libera toda a página e uma navegação entre Cliente, Gestão e Planos.

A escolha muda a ordem do conteúdo e os CTAs, mas o visitante pode trocar de caminho a qualquer momento.

### 3. Experiência do cliente

- Grade editorial de estabelecimentos reais em destaque.
- Filtros leves por localização, serviço e disponibilidade.
- Detalhes do estabelecimento e experiência navegável do sistema.
- Fluxo demonstrável: serviço → profissional → data → horário.
- Login ou cadastro somente ao selecionar “Confirmar agendamento”.
- Preservar as escolhas do usuário depois da autenticação.

### 4. Experiência do dono e profissional

- Painel interativo identificado como **“Demonstração — dados mockados”**.
- Alternância entre “Visão do dono” e “Visão do profissional”.
- Dono: agenda geral, faturamento estimado, ocupação, equipe e recorrência.
- Profissional: agenda individual, próximos atendimentos, comissão e desempenho.
- Interações guiadas e notificações simuladas para transmitir a sensação de operação real.
- CTA contextual para criar ou cadastrar um estabelecimento.

### 5. Caminho do observador

- Exibe as experiências de cliente, gestão e planos em sequência.
- Navegação fixa permite alternar entre as três áreas.
- Mantém CTAs próprios em cada seção, sem forçar uma escolha antecipada.

## Estratégia de precificação

A precificação deve ficar em uma seção única e comparável, mas aparecer somente nos caminhos de **dono** e **observador**. Exibir preço B2B no caminho exclusivo do cliente criaria ruído.

Modelo recomendado:

1. **Profissional Solo** — preço fixo, agenda, clientes, serviços, lembretes e indicadores individuais.
2. **Estabelecimento** — valor-base escalonado por faixas de profissionais, com gestão de equipe, agenda consolidada, permissões e indicadores.
3. **Rede/Personalizado** — proposta para múltiplas unidades e necessidades avançadas.

Complementos:

- Alternância mensal/anual.
- Comparação objetiva de recursos.
- Simulador de retorno usando profissionais, agendamentos e faltas mensais.
- CTA diferente por plano, sem esconder regras ou cobrar por funções essenciais de forma confusa.

## Ordem sugerida da página

1. Hero e proposta central.
2. Segmentação do visitante.
3. Experiência personalizada conforme a escolha.
4. Estabelecimentos reais e simulação de agendamento.
5. Demonstração das visões de dono e profissional.
6. Diferenciais e prova social.
7. Precificação para donos e observadores.
8. Perguntas frequentes adaptadas ao perfil.
9. CTA final contextual.

## Métricas essenciais

- Distribuição das escolhas do formulário.
- Cliques em estabelecimentos e início do fluxo de agendamento.
- Conversão do bloqueio de login/cadastro.
- Interações com as telas demonstrativas.
- Uso do simulador de retorno.
- Cliques em plano e início do cadastro de estabelecimento.
- Troca entre perfis no modo observador.

## Backlog desta iniciativa

### P0

- Validar mensagens e opções da segmentação.
- Selecionar estabelecimentos reais autorizados.
- Definir ações demonstráveis e ponto exato de autenticação.
- Fechar hipóteses de preço e faixas por número de profissionais.

### P1

- Criar wireframes responsivos.
- Preparar conjunto coerente de dados mockados.
- Definir eventos de analytics.
- Preparar imagens, depoimentos e resultados reais.
- Realizar testes rápidos com clientes e donos.

### P2

- Personalização por localização e segmento.
- Testes A/B de mensagens e CTAs.
- Calculadora avançada de retorno.
- Tour guiado com progresso salvo.

## Próximas tarefas

1. Aprovar a arquitetura dos três caminhos.
2. Definir conteúdo dos estabelecimentos em destaque.
3. Validar o modelo comercial sugerido.
4. Produzir wireframes das telas e estados principais.
5. Implementar somente após aprovação do planejamento.
