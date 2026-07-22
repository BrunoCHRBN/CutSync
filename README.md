# CutSync

Monorepo dos três produtos CutSync, construídos com Expo SDK 57 e um backend Supabase compartilhado.

## Estrutura

```text
apps/
  web/        CutSync Web: aquisição, booking público e operação web completa
  client/     CutSync: aplicativo mobile do cliente
  business/   CutSync Business: aplicativo mobile operacional
packages/
  brand/      identidade básica e metadados dos produtos
  database/   tipos gerados do Supabase e modelos compartilhados
  domain/     datas, agenda e mensagens de domínio puras
  validation/ validações reutilizáveis
supabase/     migrations e testes SQL do backend compartilhado
tests/        testes unitários e E2E do repositório
```

As telas, árvores de navegação e componentes complexos pertencem a cada aplicativo. Somente contratos comprovadamente comuns devem entrar em `packages/*`.

## Instalação

Use Node.js 22 e instale todas as workspaces a partir da raiz:

```powershell
npm install
```

## Desenvolvimento

```powershell
npm run start:web
npm run start:client
npm run start:business
```

Atalhos mobile:

```powershell
npm run android:client
npm run android:business
npm run ios:client
npm run ios:business
```

Para conectar o Client ao Supabase compartilhado, copie o exemplo local e preencha somente a URL e a chave pública do projeto:

```powershell
Copy-Item apps/client/.env.example apps/client/.env
```

O arquivo local é ignorado pelo Git. Nunca adicione uma chave `service_role` ou credenciais de usuários ao aplicativo.

## Validação

```powershell
npm run lint
npm run typecheck:new-apps
npm run test:e2e -- --project=unit
npm run build:web
```

O typecheck do Web legado permanece separado em `npm run typecheck:web` enquanto as incompatibilidades preexistentes são corrigidas incrementalmente.

## Supabase

O contrato gerado do banco fica em `packages/database/src/supabase.generated.ts`.

Gerar os tipos do projeto remoto:

```powershell
$env:SUPABASE_ACCESS_TOKEN = 'seu-token-local'
$env:SUPABASE_PROJECT_ID = 'referência-do-projeto'
npm run types:supabase
```

Verificar divergência entre o schema remoto e o contrato versionado:

```powershell
npm run check:supabase-schema
```

Tokens e credenciais permanecem apenas em variáveis de ambiente e nunca devem ser versionados.

## Documentação da separação

- `docs/architecture/MULTI_APP_PRODUCT_CONTRACT.md`: responsabilidades de Web, Client e Business.
- `docs/architecture/MULTI_APP_BACKEND_READINESS.md`: contratos e validações do backend compartilhado.
- `docs/architecture/MONOREPO_FOUNDATION.md`: estrutura, validações e pendências da Fase 2.
- `docs/architecture/CLIENT_MVP_PROGRESS.md`: andamento, limites e próximas fatias da Fase 3.
