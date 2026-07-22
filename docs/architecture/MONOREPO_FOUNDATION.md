# Fundação do monorepo — Fase 2

Status: concluída

Data da verificação: 2026-07-22

## Objetivo

Separar a base existente em três produtos Expo independentes, sem redesenhar nem remover funcionalidades da Web e sem duplicar contratos de negócio que pertencem ao backend ou aos pacotes compartilhados.

## Estrutura entregue

```text
apps/
  web/        CutSync Web e a aplicação existente preservada
  client/     shell próprio do aplicativo CutSync para clientes
  business/   shell próprio do CutSync Business
packages/
  brand/      identidade e metadados compartilhados
  database/   contrato gerado do Supabase e modelos comuns
  domain/     regras puras de datas, agenda e erros de domínio
  validation/ validações reutilizáveis
```

O npm gerencia `apps/*` e `packages/*` como workspaces. Cada aplicativo possui seu próprio `package.json`, `app.json`, `tsconfig.json`, navegação e diretório de telas.

## Identidades dos produtos

| Produto | Slug Expo | iOS bundle identifier | Android package | Scheme |
| --- | --- | --- | --- | --- |
| CutSync Web | `cutsync-web` | Não aplicável | Não aplicável | HTTPS |
| CutSync | `cutsync-client` | `com.cutsync.client` | `com.cutsync.client` | `cutsync` |
| CutSync Business | `cutsync-business` | `com.cutsync.business` | `com.cutsync.business` | `cutsync-business` |

Os IDs de projeto EAS não foram reutilizados entre produtos. O vínculo de cada aplicativo a um projeto EAS próprio, assim como ícones finais, credenciais e publicação, pertence à fase de distribuição.

## Limites de compartilhamento

Os pacotes comuns contêm tipos, regras puras, validações e identidade básica. Telas, layouts, árvores de navegação e componentes de experiência continuam dentro do produto que os possui.

Nesta fase:

- a Web foi movida para `apps/web` sem redesenho funcional;
- Client e Business receberam shells mínimos e visualmente independentes;
- rotas administrativas, Superadmin e governança não foram copiadas para os binários mobile;
- os três produtos continuam apontando para o mesmo contrato de backend;
- as funcionalidades completas de Client e Business ainda serão implementadas nas fases próprias.

## Configuração local

Cada aplicativo lê suas variáveis a partir do próprio diretório. O arquivo local usado pela Web fica em `apps/web/.env` e continua ignorado pelo Git. Client e Business deverão receber arquivos locais equivalentes quando começarem a consumir o Supabase.

Nenhum segredo, senha ou token foi adicionado ao repositório.

## Comandos principais

```powershell
npm install
npm run start:web
npm run start:client
npm run start:business
npm run lint
npm run typecheck:new-apps
npx playwright test --project=unit
npm run build:web
```

## Evidências de validação

Executadas em 2026-07-22:

- `npm ls --workspaces --depth=0`: sete workspaces reconhecidos;
- `npm ls react react-native expo --depth=0`: uma versão deduplicada de cada runtime;
- `npx expo-doctor` em Web, Client e Business: `20/20` verificações aprovadas em cada app;
- `npm run typecheck:new-apps`: pacotes compartilhados, Client e Business aprovados;
- `npm run lint`: zero erros; a Web mantém 14 avisos preexistentes, e os dois apps novos não têm avisos;
- `npx playwright test --project=unit`: 33 testes aprovados;
- `npm run build:web`: exportação Web aprovada;
- `npx expo export --platform all` em Client e Business: bundles Web, iOS e Android aprovados;
- perfil público e booking Web no navegador, em `desktop-1440`: teste aprovado;
- testes estáticos diretos da fundação multi-app e da segurança P0 do Supabase: aprovados.

## Pendências conscientes

- A máquina de validação estava com Node.js 24, enquanto o repositório exige Node.js 22. Os comandos passaram, mas desenvolvimento e CI devem usar a versão declarada.
- O typecheck completo da Web ainda possui incompatibilidades anteriores à separação e permanece isolado em `npm run typecheck:web`.
- O ambiente Python disponível não possui `pytest`; por isso a suíte Python agregada não foi executada nesta fase. Os testes estáticos críticos do Supabase foram executados diretamente.
- O relatório do npm indica 11 vulnerabilidades moderadas em dependências. Nenhuma atualização automática potencialmente incompatível foi aplicada.
- IDs EAS, credenciais de loja, canais, universal links, notificações push e assets finais serão configurados na fase de distribuição.

## Próxima fase

A Fase 3 implementará o MVP do Client por fatias verticais, começando por fundação de sessão e autenticação mobile. Cada fatia deverá reutilizar os contratos compartilhados, validar Android e iOS e preservar os fluxos Web existentes.
