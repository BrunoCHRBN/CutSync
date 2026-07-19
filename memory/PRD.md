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
