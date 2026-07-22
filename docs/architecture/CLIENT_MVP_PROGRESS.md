# MVP do Client — Fase 3

Status: em andamento

Data da última verificação: 2026-07-22

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

Status: implementada localmente; migration remota e validação autenticada no Android pendentes

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

## Limites da fatia atual

- o login autenticado contra o projeto remoto ainda deve ser validado com uma conta E2E localmente configurada;
- a persistência no SecureStore foi validada por testes e pela geração dos bundles, mas ainda deve ser exercitada em dispositivo ou simulador nativo;
- envio, abertura e consumo dos e-mails de confirmação e recuperação ainda devem ser exercitados no projeto Supabase remoto com `cutsync://**` permitido;
- autorização de dados continua dependendo das políticas RLS do backend compartilhado; proteção de rota no aplicativo não substitui RLS;
- nenhuma funcionalidade da Web foi removida ou redirecionada para o Client.

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

A migration foi aplicada ao ambiente remoto. O teste SQL local não foi executado porque o Docker Desktop não estava ativo. A persistência autenticada, o upload real do avatar e a inspeção interativa no emulador ainda não são considerados validados.

## Próximas fatias

1. aplicar e validar a migration de perfil e preferências no Supabase;
2. validar cadastro, confirmação, recuperação, perfil e preferências no development build;
3. descoberta de estabelecimentos e profissionais;
4. agendamento com disponibilidade real;
5. lista, detalhes, cancelamento e reagendamento;
6. notificações e preparação para distribuição.

Cada fatia deve incluir sua regra compartilhável, interface própria do Client, testes automatizados e validação do fluxo renderizado antes de avançar.
