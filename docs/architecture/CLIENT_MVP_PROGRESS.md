# MVP do Client — Fase 3

Status: Fatia 7 concluída no Android com FCM v1; iOS/APNs adiado

Data da última verificação: 2026-07-23

## Objetivo

Construir o aplicativo mobile do cliente em fatias verticais independentes da Web, reutilizando apenas os contratos compartilhados de autenticação, banco, domínio e validação.

O Client possui navegação, telas e linguagem visual próprias. A Web continua sendo um produto separado; seus componentes de interface não são adaptados nem copiados automaticamente para o aplicativo.

## Fatia 1 — sessão e entrada

Status: implementada e validada em ambiente local

Entregas:

- cliente Supabase tipado com o mesmo contrato de banco da Web;
- configuração pública isolada em `apps/client/.env`;
- persistência nativa da sessão no SecureStore, dividida em fragmentos seguros;
- atualização automática do token enquanto o aplicativo está ativo;
- restauração de sessão no início do aplicativo;
- rotas públicas e autenticadas protegidas pelo Expo Router;
- tela de entrada própria do Client, com validação local e mensagens de erro seguras;
- tela inicial autenticada com identificação da conta e saída;
- validação de credenciais compartilhada sem compartilhar componentes visuais;
- testes unitários da fundação de autenticação.

### Árvore inicial de rotas

```text
apps/client/src/app/
  _layout.tsx
  (auth)/
    _layout.tsx
    sign-in.tsx
  (app)/
    _layout.tsx
    index.tsx
```

O grupo `(auth)` só é acessível sem sessão. O grupo `(app)` só é acessível depois que a sessão foi restaurada ou criada.

## Fatia 2 — cadastro, confirmação e recuperação

Status: implementada e validada localmente; validação remota e nativa pendente

Entregas:

- cadastro de conta cliente com nome, e-mail, senha forte e confirmação da senha;
- confirmação de e-mail e reenvio sem revelar se o endereço já possui conta;
- solicitação de recuperação com resposta neutra contra enumeração de usuários;
- consumo seguro de callbacks por token de sessão, código PKCE ou `token_hash`;
- redefinição de senha somente após validar o link de recuperação;
- grupo de rotas de callback acessível durante a sessão temporária de recuperação;
- bloqueio de emoji, HTML e SVG no componente de campo e novamente na validação compartilhada;
- política de senha ajustada para não considerar emoji como símbolo especial válido;
- mensagens remotas traduzidas sem expor detalhes internos do Supabase.

### Rotas adicionadas

```text
apps/client/src/app/
  (auth)/
    sign-up.tsx
    check-email.tsx
    forgot-password.tsx
  (callback)/
    _layout.tsx
    confirm-email.tsx
    reset-password.tsx
```

### Configuração de redirecionamento

Adicione a seguinte URL em **Supabase Dashboard → Authentication → URL Configuration → Redirect URLs**:

```text
cutsync://**
```

Os testes de callback devem usar um development build ou binário instalado. O endereço gerado pelo Expo Go não é estável para callbacks de autenticação.

## Configuração local

Crie o arquivo local a partir do exemplo:

```powershell
Copy-Item apps/client/.env.example apps/client/.env
```

Preencha apenas as variáveis públicas do mesmo projeto Supabase usado pela plataforma:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_substitua_aqui
```

Não use `service_role`, senha de usuário, token de acesso pessoal ou outra credencial privada no aplicativo. O arquivo `.env` local é ignorado pelo Git.

## Fatia 3 — perfil e preferências

Status: implementada, migration aplicada e fluxo autenticado validado no Android

Entregas:

- área de Conta própria do Client, sem reutilizar componentes visuais da Web;
- carregamento do perfil autenticado por RPC dedicada;
- edição segura de nome e telefone, com e-mail somente para leitura;
- bloqueio de emoji, HTML e SVG na interface, na validação compartilhada e novamente no banco;
- preferências de e-mail, WhatsApp e consentimento opcional de marketing;
- push visível, mas desabilitado até existir permissão e dispositivo Client registrado;
- avatar em JPEG, PNG ou WebP, limitado a 5 MB e armazenado em caminho exclusivo do proprietário;
- rejeição explícita de SVG por MIME type e nome do arquivo;
- tela de segurança para solicitar alteração de senha e encerrar a sessão;
- permissões de `profiles` corrigidas para uma lista explícita de colunas, sem atualização direta de e-mail ou campos de autorização;
- testes unitários, teste SQL de autorização e smoke test próprio do aplicativo Client.

### Rotas adicionadas

```text
apps/client/src/app/(app)/
  profile.tsx
  preferences.tsx
  security.tsx
```

### Migration necessária

Aplicar, em ordem, a migration:

```text
supabase/migrations/20260722160000_client_profile_preferences.sql
```

Ela adiciona as RPCs do Client, normaliza os canais de notificação, restringe as permissões de atualização e configura o bucket público `client-avatars` sem permitir listagem ou escrita fora do caminho do proprietário.

Depois da aplicação, recarregue o cache de schema do PostgREST antes do smoke autenticado.

### Smoke test do Client

Com as credenciais E2E configuradas no terminal:

```powershell
npm run test:e2e:client
```

O teste autenticado consulta as três telas, confirma o bloqueio de emoji e não salva alterações no usuário E2E.

## Fatia 4 — descoberta de estabelecimentos e profissionais

Status: implementada, migration aplicada e validada em smoke autenticado e Android

Entregas:

- entrada de descoberta integrada à área autenticada do Client;
- interface mobile própria, sem reaproveitar os componentes visuais da experiência Web;
- busca por estabelecimento, região, serviço, profissional e especialidade;
- rejeição de emoji, HTML e SVG na digitação, na validação compartilhada e novamente na RPC;
- catálogo limitado a estabelecimentos ativos, serviços ativos e membros ativos;
- contratos `SECURITY DEFINER` com retorno explícito, sem documentos, dados de KYC ou contatos privados;
- estados de carregamento, vazio, falha, nova tentativa e atualização por gesto;
- tela de detalhes com identidade, endereço, serviços, preços, duração e equipe;
- testes unitários, teste SQL de autorização e smoke autenticado sem mutações.

### Rotas adicionadas

```text
apps/client/src/app/(app)/
  explore.tsx
  establishments/
    [slug].tsx
```

### Migration necessária

Aplicar, depois das migrations anteriores:

```text
supabase/migrations/20260722223000_client_discovery.sql
```

Depois da aplicação, recarregue o cache de schema do PostgREST e execute `npm run test:e2e:client`. O terceiro cenário valida catálogo, bloqueio de emoji/SVG e detalhes sem criar ou alterar registros.

## Fatia 5 — agendamento com disponibilidade real

Status: concluída e validada em Android e desktop com os papéis Client e Business

Entregas:

- wizard próprio do Client com serviço, profissional, data, horário e revisão;
- seleção de profissionais compatíveis com o serviço, respeitando bloqueios e preço/duração personalizados;
- datas geradas no fuso do estabelecimento dentro da janela aceita pelo backend;
- horários consultados pela RPC central `get_available_slots`, considerando jornada, agenda ocupada e bloqueios;
- atualização automática da disponibilidade a cada 15 segundos;
- segunda consulta imediatamente antes da confirmação;
- criação exclusivamente pela RPC transacional, sem inserção direta em `appointments`;
- resposta final diferenciando confirmação imediata de solicitação pendente;
- estados de carregamento, data fechada, agenda lotada, erro, conflito e sucesso;
- testes unitários, teste SQL transacional e smoke autenticado sem confirmação de reserva.

### Rota adicionada

```text
apps/client/src/app/(app)/booking/
  [slug].tsx
```

### Migration necessária

Aplicar depois das migrations anteriores:

```text
supabase/migrations/20260723023000_client_booking.sql
```

A migration expõe apenas o catálogo necessário para o wizard e adiciona `create_client_appointment`, um wrapper autenticado sobre o contrato central de criação. O wrapper impede reservas em estabelecimentos inativos e devolve o status efetivamente gravado.

## Fatia 6 — gestão completa de agendamentos

Status: implementada e validada localmente; migration remota e fluxo real controlado pendentes

Entregas:

- navegação protegida em três abas nativas: Descobrir, Agenda e Conta;
- lista de próximos atendimentos e histórico, com ordenação, atualização manual, retorno ao aplicativo e Realtime;
- detalhe seguro por RPC, sem permitir leitura de agendamentos de outro cliente;
- data e horário formatados no fuso do estabelecimento;
- cancelamento por motivos fechados, sem campo de texto, com confirmação destrutiva em duas etapas;
- reagendamento pelo wizard existente, com serviço e profissional atuais pré-selecionados;
- disponibilidade consultada ignorando apenas o próprio horário original e repetida antes da confirmação;
- prazo de alteração configurável por estabelecimento, com padrão de 24 horas e permissão exatamente no limite;
- estados terminais imutáveis, limite de dois reagendamentos e bloqueio de estabelecimento inativo;
- resultado pendente ou confirmado conforme `instant_booking_enabled`;
- contato por telefone ou WhatsApp quando a janela de alteração pelo aplicativo estiver encerrada;
- compatibilidade da Web ajustada para usar a política configurada e a RPC transacional de reagendamento;
- nenhuma inserção livre ou atualização direta de agendamento nos fluxos novos do Client.

### Rotas e navegação

```text
apps/client/src/app/(app)/
  (tabs)/
    index.tsx
    explore.tsx
    appointments.tsx
  appointments/
    [id].tsx
    [id]/cancel.tsx
```

### Migration necessária

Aplicar depois da migration de criação de agendamentos:

```text
supabase/migrations/20260723040000_client_appointment_management.sql
```

Depois da aplicação, recarregue o cache do PostgREST. Somente então execute a suíte autenticada e a validação real de reagendamento e cancelamento.

## Fatia 7 — notificações do Client

Status: concluída no Android com entrega remota via FCM v1 validada; iOS/APNs adiado

Entregas:

- `expo-notifications` integrado ao Client com o plugin do Expo 57;
- canal Android `appointments` criado antes da solicitação de permissão;
- opt-in explícito na tela de preferências, sem solicitar permissão durante login ou abertura;
- Expo Push Token associado ao usuário, ao aplicativo Client e à plataforma pelas RPCs seguras existentes;
- token local preservado no SecureStore para sincronização, rotação e remoção no logout;
- fila transacional criada a partir dos eventos de confirmação, reagendamento e cancelamento;
- lembrete idempotente de 24 horas preparado para execução agendada;
- fila com bloqueio concorrente, cinco tentativas, backoff, tickets e recibos do Expo;
- dispositivos inválidos desativados após `DeviceNotRegistered`;
- Edge Function protegida por segredo interno, sem expor service role ou token Expo ao aplicativo;
- toque em notificação direcionado apenas ao detalhe protegido de um agendamento válido;
- suporte a toque com o aplicativo aberto, em segundo plano ou iniciado pela notificação;
- payloads com evento desconhecido, ID inválido ou rota arbitrária são ignorados.

### Configuração e operação

1. Aplicar `supabase/migrations/20260724010000_client_push_notifications.sql`.
2. Vincular a build do Client ao EAS Project ID.
3. Configurar as credenciais FCM v1 no projeto Expo/EAS.
4. Criar os secrets da Edge Function:
   - `NOTIFICATION_DISPATCH_SECRET`;
   - `EXPO_ACCESS_TOKEN`, quando a segurança reforçada do Expo Push Service estiver habilitada.
5. Publicar `dispatch-client-notifications`.
6. Agendar uma chamada autenticada à função a cada 15 minutos, enviando o header `x-cutsync-dispatch-secret`.

O `SUPABASE_URL` e o `SUPABASE_SERVICE_ROLE_KEY` são fornecidos ao ambiente da Edge Function e nunca pertencem ao bundle mobile. A função agendada enfileira lembretes, envia até 100 notificações por lote e consulta recibos depois da janela recomendada.

O EAS Project ID e o FCM v1 foram configurados para `com.cutsync.client`. APNs permanece explicitamente fora do encerramento desta fatia porque ainda não há conta Apple Developer nem dispositivo iOS para uma validação real.

## Limites da fatia atual

- o teste SQL local continua pendente enquanto o Docker Desktop não estiver disponível;
- autorização de dados continua dependendo das políticas RLS do backend compartilhado; proteção de rota no aplicativo não substitui RLS;
- nenhuma funcionalidade da Web foi removida ou redirecionada para o Client.
- a entrega Push foi validada no Android com FCM v1 e um token real, mas não há evidência equivalente para APNs;
- o agendamento periódico da Edge Function depende da configuração remota e não é criado com segredos dentro da migration.

## Evidências da fatia 1

Executadas em 2026-07-22:

- `npx expo-doctor` em Web, Client e Business: `20/20` verificações aprovadas em cada aplicativo;
- `npm run typecheck:new-apps`: pacotes compartilhados, Client e Business aprovados;
- `npm run lint`: zero erros; permanecem 14 avisos anteriores na Web;
- testes unitários focados em autenticação e fundação multi-app: 9 aprovados;
- suíte unitária agregada: 36 de 38 testes aprovados; os dois testes com falha são expectativas antigas da landing Web, sem relação com o Client;
- exportação do Client para Web, Android e iOS aprovada;
- exportação do Business para Web, Android e iOS aprovada após o alinhamento das dependências do Expo 57;
- exportação Web aprovada;
- login do Client inspecionado no navegador em viewport de 390 × 844, sem erro no console, incluindo a validação do formulário vazio.

Essas evidências não comprovam login remoto nem persistência em hardware nativo. Esses dois testes continuam necessários antes de encerrar a Fase 3.

## Evidências da fatia 2

Executadas em 2026-07-22:

- `npx expo-doctor` no Client: `20/20` verificações aprovadas;
- `npm run typecheck:new-apps`: pacotes compartilhados, Client e Business aprovados;
- `npm run lint`: zero erros; permanecem 14 avisos anteriores na Web;
- testes focados na autenticação e fundação multi-app: 12 aprovados;
- suíte unitária agregada: 39 de 41 testes aprovados; as duas falhas continuam sendo expectativas antigas da landing Web;
- exportação do Client para Web, Android e iOS aprovada;
- navegação de login, cadastro, recuperação e callback inválido inspecionada no navegador em 390 × 844;
- emoji e SVG tentados nos formulários de cadastro e recuperação: valor rejeitado, mensagem segura exibida e nenhuma chamada remota realizada;
- console do navegador sem erros ou avisos relevantes.

Não foi criada conta real durante a inspeção local. O ciclo de e-mail depende da configuração externa de redirecionamento e será validado separadamente em development build.

## Evidências da fatia 3

Executadas em 2026-07-22:

- `npm run typecheck:new-apps`: pacotes compartilhados, Client e Business aprovados;
- lint do Client aprovado sem erros ou avisos novos;
- 18 testes focados em autenticação, perfil, preferências e fundação multi-app aprovados;
- suíte unitária agregada: 45 de 47 testes aprovados; as duas falhas continuam sendo expectativas antigas da landing Web;
- exportação do Client para Web, Android e iOS aprovada;
- `:app:packageDebug` para `x86_64` aprovado, incluindo autolink de `expo-image` e `expo-image-picker`;
- smoke Web do Client sem sessão aprovado: a rota `/profile` permanece protegida e conduz ao login;
- teste autenticado do Client preparado e ignorado automaticamente quando `CUTSYNC_E2E_CLIENT_*` não está configurado;
- teste SQL `supabase/tests/client_profile_preferences.sql` preparado para validar propriedade, campos protegidos, canais e bucket.
- schema remoto sondado após a migration: leitura e bucket respondem, enquanto as quatro RPCs de escrita rejeitam corretamente a função `anon` com `authentication_required`.

O `expo-doctor` aprovou 19 de 20 verificações. A única advertência é estrutural: como `apps/client/android` existe no repositório, alterações futuras em plugins do `app.json` não são sincronizadas automaticamente pelo EAS nessa pasta nativa. O APK local confirmou o autolink dos módulos usados nesta fatia.

A migration foi aplicada ao ambiente remoto. O teste SQL local não foi executado porque o Docker Desktop não estava ativo. Depois disso, o usuário validou no emulador Android a tela de conta e suas funções autenticadas.

## Evidências da fatia 4

Executadas em 2026-07-22:

- `npm run typecheck:new-apps`: pacotes compartilhados, Client e Business aprovados;
- lint do Client aprovado sem erros ou avisos;
- 3 testes unitários específicos da descoberta aprovados;
- exportação Web do Client aprovada, incluindo as rotas estática e dinâmica da descoberta.
- `npm run test:e2e:client`: 3 cenários aprovados em 54,5 segundos, incluindo descoberta, serviços e profissionais sem gravação de dados.

A migration foi aplicada ao ambiente remoto e exercitada pelo smoke autenticado. O usuário também validou no emulador Android a conta, a descoberta, a lista, os detalhes, os serviços e a equipe sem erros recentes no processo nativo. A execução do teste SQL local continua pendente porque o Docker Desktop não está ativo.

## Evidências da fatia 5

Executadas em 2026-07-23:

- `npm run typecheck:new-apps`: pacotes compartilhados, Client e Business aprovados;
- lint do Client aprovado sem erros ou avisos;
- 4 testes unitários específicos de agendamento aprovados;
- regras de data/fuso e compatibilidade serviço-profissional cobertas por testes;
- `npm run test:e2e:client`: 4 cenários aprovados, incluindo disponibilidade e revisão do agendamento sem confirmar nem gravar uma reserva.
- agendamento real criado e confirmado no build Android do Client;
- o mesmo atendimento foi conferido no desktop pela conta do cliente e pela agenda do profissional, confirmando a consistência entre os dois papéis.

A migration foi aplicada ao ambiente remoto, o smoke autenticado foi aprovado e o fluxo real foi validado de ponta a ponta em Android e desktop. A execução SQL local continua pendente porque o Docker Desktop não está ativo.

## Evidências da fatia 6

Executadas em 2026-07-23:

- `npm run typecheck:shared`: aprovado;
- `npm run typecheck:client`: aprovado;
- lint do Client aprovado sem erros;
- lint da Web aprovado sem erros, mantendo 14 avisos anteriores;
- 11 testes unitários focados em agenda, fuso, políticas, cancelamento e reagendamento aprovados;
- exportação Web do Client aprovada com as abas nativas e a rota modal;
- smoke sem sessão aprovado para todas as rotas novas, incluindo detalhe e cancelamento;
- `app:assembleDebug` aprovado em 4 minutos e 56 segundos, com 491 tarefas e APK de desenvolvimento gerado;
- os arquivos Web modificados nesta fatia não apresentam erros no typecheck focado.

O typecheck completo da Web continua falhando por erros preexistentes em áreas fora da Fatia 6. Depois dessas evidências locais, a migration foi aplicada e o usuário validou com sucesso o cancelamento real no Client, incluindo a correção da assinatura Realtime duplicada entre detalhe e modal. O teste SQL transacional permanece pendente porque o Postgres local não está ativo.

Para encerrar a validação real desta fatia:

1. reagendar no Client e conferir o novo horário no Client desktop e no Business;
2. confirmar que o horário anterior foi liberado.

## Evidências da fatia 7

Executadas em 2026-07-23:

- `npm run typecheck:shared`: aprovado;
- `npm run typecheck:client`: aprovado;
- lint do Client aprovado sem erros;
- 7 testes unitários focados em opt-in, ciclo do dispositivo, fila, recibos e deep links aprovados;
- suíte agregada de notificações e agendamentos: 14 testes aprovados;
- exportação Web do Client aprovada;
- bundle Android do Client aprovado com `expo-notifications`;
- `app:assembleDebug`: aprovado com 491 tarefas e `expo-notifications` autolinkado;
- manifesto Android final contém `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED` e os serviços nativos do Expo;
- `npm run test:e2e:client`: proteção sem sessão aprovada; cinco cenários autenticados ignorados por ausência das credenciais no processo de teste;
- `expo-doctor`: 20 de 20 verificações aprovadas após separar o projeto Android local do pacote enviado ao EAS;
- `npx supabase db lint --local` não executou a análise porque o Postgres local não estava ativo.
- EAS Build Android de desenvolvimento `e8831d14-a037-44af-b910-a9b47cfba72e`: concluída com sucesso;
- arquivo enviado ao EAS reduzido de aproximadamente 1002 MB para 11,3 MB, sem artefatos nativos gerados no Windows nem credenciais administrativas;
- Prebuild validado com `google-services.json` e plugin `com.google.gms.google-services`;
- instalação da development build no emulador Android e recebimento de notificações FCM v1 validados pelo usuário;
- APNs não configurado nem validado por ausência de conta Apple Developer e dispositivo iOS.

A entrega remota no Android está comprovada. Essa evidência não cobre APNs nem, isoladamente, a execução periódica de lembretes pela Edge Function; esses pontos permanecem explícitos para a futura operação e observabilidade.

## Próximas fatias

1. preparar distribuição Android e observabilidade dos aplicativos;
2. monitorar a fila, os tickets e os recibos Push na operação remota;
3. iniciar avaliações após atendimento somente depois da estabilização da entrega mobile.

Cada fatia deve incluir sua regra compartilhável, interface própria do Client, testes automatizados e validação do fluxo renderizado antes de avançar.
