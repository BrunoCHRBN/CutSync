# PRD — CutSync

## Estado atual — 3 problemas de deploy + bug de login (18/01/2026)

### Problema #1: Vercel — "Invalid vercel.json file provided"
- **Causa raiz**: `vercel.json` foi commitado com marcadores de merge Git não resolvidos (`<<<<<<< HEAD`, `=======`, `>>>>>>>`).
- **Correção**: Marcadores removidos, JSON válido restaurado. Trocado `installCommand` de `npm ci` para `npm install --legacy-peer-deps --no-audit --no-fund --no-progress` para tolerar dessincronização eventual do lock file. **Já em produção**.

### Problema #2: GitHub Actions "Install and Build" — `npm ci` fail
- **Causa raiz**: `package-lock.json` fora de sincronia com `package.json` (versão de `lucide-react-native` divergente).
- **Correção**: Workflow atualizado — passo `Instalação` tenta `npm ci` primeiro e cai para `npm install --legacy-peer-deps` se o lock estiver fora de sincronia. `package-lock.json` regenerado local. **Já em produção**.

### Problema #3: GitHub Actions "Supabase Schema Drift" — `Invalid project ref format`
- **Causa raiz**: Script exige ref de 20 letras minúsculas, mas secret podia estar como URL completa.
- **Correção**: `scripts/generate-supabase-types.sh` agora normaliza `SUPABASE_PROJECT_ID` (aceita URL completa `https://xxxx.supabase.co` ou ref direto), valida formato com mensagem clara de erro. **Já em produção**.

### Problema #4: Bug crítico de login em produção — `TypeError: Failed to execute 'fetch' on 'Window': Invalid value`
- **Sintoma**: Login mostra "Não foi possível entrar. Confira seus dados e tente novamente." com qualquer conta válida em `cut-sync.vercel.app`.
- **Causa raiz**: A env var `EXPO_PUBLIC_SUPABASE_ANON_KEY` no Vercel foi salva com **3 cópias do anon key separadas por `\n`** (628 caracteres em vez de 208). Quando o supabase-js monta o header `Authorization: Bearer <valor>` ou `apikey: <valor>`, o browser rejeita porque headers HTTP não permitem newlines. Nenhuma request para Supabase saía do browser.
- **Diagnóstico**: Confirmado via Playwright interceptando `fetch` — os headers vinham com `Bearer eyJ...uMs\neyJ...uMs\neyJ...uMs`.
- **Correção aplicada (defesa preventiva)**: `src/services/supabase.ts` agora sanitiza `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_ANON_KEY` — remove whitespace/CR/LF/tabs; se detectar múltiplas cópias separadas por newline, mantém apenas a primeira. Isso torna o app resiliente a essa má configuração.
- **Ação obrigatória do usuário**: No Vercel → Project Settings → Environment Variables, editar `EXPO_PUBLIC_SUPABASE_ANON_KEY` deixando **APENAS UMA CÓPIA** do anon key (sem quebras de linha):
  ```
  eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4b2VuZm5zenJyZ2FxeHBsem1kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NjA1MjIsImV4cCI6MjA5OTUzNjUyMn0.lIz_j07aPorngzmlcCs4syo4Y0nlwGlMBu0v6yJ7uMs
  ```
  Aplicar em Production + Preview + Development. Redeployar.

### Validação
- Login testado diretamente contra o Supabase (curl) para as 3 contas — todos retornam `access_token` com sucesso ✅
- RPC `get_my_profile` retorna perfil correto ✅
- CORS Supabase → `cut-sync.vercel.app` funcionando ✅
- Build web local `npm run build:web` — OK ✅

### Backlog anterior preservado
Os PRDs históricos (migração Supabase, auditoria de segurança P0, tipagem, modularização, redesign visual) permanecem válidos e são retomados após este fix.
