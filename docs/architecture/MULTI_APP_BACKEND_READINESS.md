# Preparação do backend para múltiplos aplicativos

Status: migration publicada e schema remoto confirmado; validação autenticada pendente

Data da verificação: 2026-07-22

## Objetivo

Preparar o backend compartilhado para que CutSync Client e CutSync Business possam coexistir sem usar um papel global do perfil como autorização e sem sobrescrever o token de notificações um do outro.

## Contratos adicionados

Migration: `supabase/migrations/20260722000000_multi_app_identity_and_push_devices.sql`

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

A sondagem confirma que o contrato central de disponibilidade e os novos contratos multiapp estão no schema remoto. Ela não comprova os fluxos autenticados.

## Validações locais executadas

- teste estático multiapp: 4 testes aprovados;
- compilação do teste Python aprovada;
- `git diff --check` nos arquivos da fase aprovado.

O teste transacional completo está em `supabase/tests/multi_app_identity_and_push_devices.sql`. Ele cria fixtures temporárias, valida dois estabelecimentos para o mesmo usuário, impede leitura cruzada de tokens, impede apropriação de token e reverte todas as alterações ao final.

## Lacunas atuais

- Supabase CLI não está instalado localmente;
- Docker está instalado, mas o mecanismo está indisponível;
- `SUPABASE_ACCESS_TOKEN` e `SUPABASE_PROJECT_ID` não estão configurados no processo;
- não há credenciais E2E de cliente, profissional ou administrador configuradas;
- o teste SQL transacional ainda não foi executado;
- os tipos gerados ainda não incluem os novos contratos.

## Checklist de implantação controlada

1. Confirmar o projeto e o ambiente Supabase alvo. — informado como concluído pelo responsável pela aplicação
2. Verificar a lista de migrations remotas antes de qualquer aplicação. — executado fora deste agente
3. Fazer dry run ou revisar o SQL exato da migration multiapp. — executado fora deste agente
4. Aplicar a migration no ambiente alvo. — concluído em 2026-07-22
5. Confirmar publicação dos RPCs e proteção anônima. — concluído em 2026-07-22
6. Executar `supabase/tests/multi_app_identity_and_push_devices.sql` em homologação ou banco local descartável.
7. Gerar novamente `src/types/supabase.generated.ts` pelo Supabase CLI.
8. Testar registro e desregistro de tokens com usuários autenticados distintos.
9. Repetir agendamento e reagendamento como cliente e profissional.
10. Promover para produção somente se o ambiente verificado ainda for homologação.

## Condição para consumo pelo frontend

O frontend atual ainda não deve chamar os novos RPCs. A migração do `AuthContext` e do serviço de notificações ocorrerá depois que:

- a migration estiver aplicada; — concluído
- os tipos estiverem regenerados;
- o teste SQL tiver passado;
- os testes autenticados tiverem sido executados.

Até lá, o campo legado `profiles.push_token` continua existindo apenas para compatibilidade com a aplicação atual. Sua remoção será uma migration posterior, depois que Web, Client e Business tiverem adotado `push_devices`.
