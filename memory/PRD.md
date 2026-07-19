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
