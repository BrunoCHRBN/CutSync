# PRD — CutSync

## Estado atual — correção de deploy CI/CD (18/01/2026)

### Problema original desta etapa

> Erros no deploy Vercel ("Invalid vercel.json file provided"), no workflow "Install and Build" (`npm ci` — Missing from lock file) e no workflow "Supabase Schema Drift" ("Invalid project ref format").

### Diagnóstico

O commit `4f75f5a` (merge de `d8da387` + `7148324`) foi enviado ao GitHub com **34+ marcadores de conflito Git NÃO resolvidos** espalhados por `vercel.json` e 15 arquivos TS/TSX (booking, auth, dashboards, screens, database types).

### Correções aplicadas em /app

1. **`vercel.json`** — Removidos marcadores `<<<<<<< HEAD` / `=======` / `>>>>>>>` que quebravam o JSON. Preservado `installCommand`, `buildCommand`, `outputDirectory` e `rewrites`.
2. **Conflitos de merge em 15 arquivos** — Resolvidos preferindo o lado `7148324` (branch com CI/CD, autenticação de booking, RPCs transacionais), conforme escolha do usuário (opção C). Arquivos: `src/app/[slug]/booking.tsx`, `src/app/[slug]/index.tsx`, `src/contexts/AuthContext.tsx`, `src/types/database.ts`, `src/components/screens/*Experience.tsx`, migration transacional e alguns test_reports.
3. **`package-lock.json`** — Regenerado com Node 22 (versão do `.nvmrc` e `engines`) em sincronia com `package.json`. `npm ci --legacy-peer-deps` agora funciona.
4. **`scripts/generate-supabase-types.sh`** — Normaliza o `SUPABASE_PROJECT_ID` (aceita URL completa `https://xxxx.supabase.co` ou ref direto de 20 letras). Valida o formato antes de chamar o CLI, com mensagem de erro clara.

### Validação local

- `node -e "JSON.parse(require('fs').readFileSync('vercel.json'))"` — OK
- `npm ci --legacy-peer-deps` — sem erros
- `npm run build:web` — exportou `dist/` com sucesso
- `npm run lint` — 2 erros pré-existentes em `useAppointments.ts` e `useTeam.ts` (React Compiler dep list), NÃO relacionados aos fixes de deploy. Vercel roda `build:web`, não `lint`, então não bloqueia.

### Próximas ações do usuário

1. **Save to Github** — enviar os fixes para o `origin/master`.
2. **No Vercel** — redeployar (deve funcionar automaticamente após o push).
3. **No GitHub Secrets** — confirmar `SUPABASE_ACCESS_TOKEN` e `SUPABASE_PROJECT_ID`. O script agora tolera tanto URL completa quanto ref puro.
4. **P1:** Corrigir os 2 erros de lint em `useAppointments.ts:100` e `useTeam.ts:38` (dependency list — trocar por expressões simples).

### Backlog anterior preservado

Os PRDs históricos (migração Supabase, auditoria de segurança P0, tipagem, modularização, redesign visual) permanecem válidos e são retomados após este fix.
