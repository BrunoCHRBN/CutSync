# Preparação do backend para múltiplos aplicativos

Status: Fase 1 concluída — contratos remotos, testes transacionais e disponibilidade autenticada aprovados

Data da verificação: 2026-07-22

## Objetivo

Preparar o backend compartilhado para que CutSync Client e CutSync Business possam coexistir sem usar um papel global do perfil como autorização e sem sobrescrever o token de notificações um do outro.

## Contratos adicionados

Migration: `supabase/migrations/20260722000000_multi_app_identity_and_push_devices.sql`

Hardening aplicado: `supabase/migrations/20260722153015_harden_multi_app_rpc_grants.sql`

Reconciliação operacional aplicada: `supabase/migrations/20260722153549_restore_schedule_blocks_contract.sql`

- `push_devices`: múltiplos dispositivos por usuário e por aplicativo;
- `register_push_device`: registro autenticado, sem permitir apropriação de token pertencente a outro usuário;
- `unregister_push_device`: desativação restrita ao proprietário do token;
- `get_my_operational_contexts`: lista associações operacionais ativas do usuário sem aceitar um `user_id` informado pelo cliente;
- RLS de leitura dos dispositivos limitada ao próprio usuário;
- escrita direta de dispositivos removida do papel `authenticated`;
- funções `SECURITY DEFINER` com `search_path` fixo e sem execução por `PUBLIC`.

## Evidência disponível

Sondagem remota somente leitura, usando a chave pública configurada no ambiente:

| Verificação | Resultado |
| --- | --- |
| Catálogo público REST | HTTP 200 |
| `get_available_slots` publicado | Sim; retornou `establishment_not_found` para o UUID sentinela |
| `get_my_operational_contexts` publicado | Sim; chamada anônima bloqueada com `authentication_required` |
| `register_push_device` publicado | Sim; chamada anônima bloqueada com `authentication_required` |
| Leitura anônima de `push_devices` | Bloqueada com `permission denied` |
| Execução anônima dos três RPCs multiapp | Revogada explicitamente e confirmada no catálogo remoto |
| Execução autenticada dos três RPCs multiapp | Permitida e validada em transação com dois usuários |
| `schedule_blocks` e RPCs operacionais | Publicados, protegidos por RLS e acessíveis somente aos papéis autorizados |
| Funções-base de disponibilidade, criação e reagendamento | Privadas; wrappers públicos preservam locks e bloqueios de agenda |

A sondagem e os testes transacionais confirmam o contrato central de disponibilidade, os novos contratos multiapp e os bloqueios de agenda no schema remoto. Os testes usam identidade autenticada simulada dentro da transação e revertem todas as fixtures. A consulta funcional de disponibilidade também foi aprovada em navegador com usuários Client e Business autenticados.

## Validações locais executadas

- teste estático multiapp: 5 testes aprovados;
- compilação do teste Python aprovada;
- suíte unitária Playwright: 29 testes aprovados;
- fluxo público de perfil e booking no navegador: aprovado em `desktop-1440`;
- smoke test autenticado de disponibilidade em `tests/e2e/phase-1-authenticated.smoke.spec.ts`: 2 testes aprovados em `desktop-1440` (`Client` e `Business`, 17,4 s);
- o primeiro ensaio Client identificou um seletor de data incompatível com `aria-disabled` do React Native Web; o seletor foi corrigido e o fluxo repetido com sucesso;
- lint dos arquivos alterados: sem erros e com um aviso preexistente de dependência de hook na tela de booking;
- `git diff --check` nos arquivos da fase aprovado.

## Validações remotas executadas

- teste transacional multiapp aprovado: dois aplicativos, dois usuários, dois estabelecimentos, isolamento de leitura, bloqueio de escrita direta, proteção contra apropriação de token e desregistro pelo proprietário;
- teste transacional de bloqueios aprovado: permissões de administrador/profissional/cliente, sobreposição e conflito com agendamento;
- teste transacional de disponibilidade aprovado após a reconciliação de bloqueios;
- rollback confirmado: nenhuma fixture de usuário, estabelecimento ou dispositivo permaneceu no banco;
- tipos TypeScript regenerados diretamente do projeto remoto;
- Security Advisor executado após as alterações. Os avisos dos RPCs desta fase são esperados porque são `SECURITY DEFINER` autenticados, com `auth.uid()`, `search_path` fixo, grants restritos e testes de isolamento.

O teste transacional completo está em `supabase/tests/multi_app_identity_and_push_devices.sql`. Ele cria fixtures temporárias, valida dois estabelecimentos para o mesmo usuário, impede leitura cruzada de tokens, impede apropriação de token e reverte todas as alterações ao final.

## Lacunas atuais

- o histórico remoto anterior permanece incompleto: os objetos das migrations `20260719000000`, `20260719010000` e `20260722000000` existem, mas essas versões não constam em `supabase_migrations.schema_migrations`; as migrations corretivas `20260722153015` e `20260722153549` estão registradas;
- criação e reagendamento reais não fazem parte deste smoke test, que deliberadamente não grava dados; essas mutações continuam como validação pré-release em um ambiente com fixtures E2E descartáveis;
- o typecheck global continua vermelho por incompatibilidades preexistentes entre telas atuais, tipos de domínio e schema remoto. A regeneração corrigiu a ausência dos contratos novos, mas não corrige automaticamente o código legado;
- o Security Advisor ainda lista avisos preexistentes fora do escopo desta fase. Eles devem entrar em uma fase própria de hardening, sem alterar contratos em massa durante a separação dos aplicativos.

## Checklist de implantação controlada

1. Confirmar o projeto e o ambiente Supabase alvo. — informado como concluído pelo responsável pela aplicação
2. Verificar a lista de migrations remotas antes de qualquer aplicação. — executado fora deste agente
3. Fazer dry run ou revisar o SQL exato da migration multiapp. — executado fora deste agente
4. Aplicar a migration no ambiente alvo. — concluído em 2026-07-22
5. Confirmar publicação dos RPCs e proteção anônima. — concluído em 2026-07-22
6. Executar `supabase/tests/multi_app_identity_and_push_devices.sql` em transação com rollback. — concluído no projeto remoto
7. Gerar novamente `packages/database/src/supabase.generated.ts` a partir do projeto remoto. — concluído
8. Testar registro e desregistro de tokens com usuários autenticados distintos. — concluído em transação; nenhuma fixture persistida
9. Consultar disponibilidade autenticada nos fluxos Client e Business no navegador. — concluído; 2 testes aprovados em 2026-07-22
10. Repetir criação e reagendamento reais com fixtures descartáveis antes do release. — pendente; não bloqueia a fundação da Fase 1
11. Promover para produção somente se o ambiente verificado ainda for homologação.

### Comando para a validação autenticada sem gravação

Com as variáveis `CUTSYNC_E2E_PROFESSIONAL_*`, `CUTSYNC_E2E_CLIENT_*` e `CUTSYNC_E2E_PUBLIC_SLUG` definidas no mesmo PowerShell:

```powershell
npx playwright test tests/e2e/phase-1-authenticated.smoke.spec.ts --project=desktop-1440
```

O teste abre o encaixe rápido do profissional e o booking do cliente, consulta horários e aceita tanto uma grade de horários quanto o estado vazio. Qualquer erro retornado pelo contrato de disponibilidade reprova o cenário. Nenhuma reserva é confirmada.

## Condição para consumo pelo frontend

O frontend pode iniciar a adoção controlada dos novos RPCs. A migração do `AuthContext` e do serviço de notificações tem as seguintes pré-condições atendidas:

- a migration estiver aplicada; — concluído
- os tipos estiverem regenerados; — concluído
- o teste SQL tiver passado; — concluído
- os testes funcionais autenticados em navegador tiverem sido executados. — concluído para consulta de disponibilidade Client e Business

Durante a adoção, o campo legado `profiles.push_token` continua existindo apenas para compatibilidade com a aplicação atual. Sua remoção será uma migration posterior, depois que Web, Client e Business tiverem adotado `push_devices`.
