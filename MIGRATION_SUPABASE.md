# Migração WatermelonDB → Supabase — Concluída

## Status final

- [x] Hooks Supabase com Realtime: `useAppointments`, `useEstablishment`, `useTeam`, `useServices`.
- [x] Catálogo público seguro via `usePublicTeam` e RPC `get_public_team`.
- [x] Dashboards administrativo e profissional migrados.
- [x] Agendamentos do cliente, criação, reagendamento e cancelamento migrados.
- [x] Equipe, serviços, configurações, exploração e perfil público migrados.
- [x] Rotas administrativas, profissionais e cliente consolidadas como wrappers.
- [x] AuthContext e alternância de estabelecimento sem banco local.
- [x] Publicação Realtime aplicada às tabelas necessárias.
- [x] `src/database`, `useSync`, LokiJS, NetInfo e dependências WatermelonDB removidos.
- [x] Nenhum import ativo de WatermelonDB em `src`.
- [x] `npx tsc --noEmit` sem erros.
- [x] Exportação web Expo validada.
- [x] Login de cliente, profissional e admin validado.
- [x] Listagem, criação, edição, cancelamento e Realtime validados ponta a ponta.

## Arquitetura adotada

- Supabase Auth mantém sessão e perfil do usuário.
- PostgREST realiza leituras e escritas diretamente nas telas e hooks.
- Supabase Realtime usa `postgres_changes`, filtros por entidade e cleanup de canais.
- Dados remotos em `snake_case` são convertidos para modelos TypeScript em camelCase.
- Perfil público acessa profissionais por RPC `SECURITY DEFINER`, sem expor e-mail ou telefone.
- A aplicação passa a exigir conexão; não existe fila offline ou sincronização local.

## Migrações aplicadas

1. `20260329000000_enable_realtime.sql`
   - Inclui as seis tabelas na publicação `supabase_realtime`.
   - Configura `REPLICA IDENTITY FULL`.
2. `20260329001000_public_catalog.sql`
   - Cria `get_public_team(uuid)` com retorno público seguro.
   - Libera leitura pública das configurações de serviços profissionais.

## Validações executadas

- REST autenticado com os três perfis.
- RPC pública retornando a equipe da barbearia.
- Consulta relacional de agendamentos usando os nomes reais das FKs remotas.
- Registro temporário: criação → confirmação pelo admin → evento Realtime no cliente → cancelamento → remoção.
- Build web e navegação visual dos painéis cliente e admin.

## Observações operacionais

- Consumidores públicos usam somente `EXPO_PUBLIC_SUPABASE_URL` e
  `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Edge Functions e outros consumidores confiáveis usam `sb_secret_*` somente
  no servidor. Chaves secretas nunca pertencem a variáveis `EXPO_PUBLIC_*`, ao
  bundle ou ao repositório.
- Os nomes SQL `anon` e `service_role` continuam válidos como papéis do banco;
  eles não significam que as chaves JWT legadas precisam continuar em uso.
- O script `supabase/realtime_publication.sql` é idempotente e pode ser auditado no SQL Editor.
- A senha do banco não deve ser armazenada no repositório.
- O estado, os gates e a evidência da migração de chaves estão registrados em
  `docs/security/SUPABASE_API_KEY_MIGRATION.md`.
