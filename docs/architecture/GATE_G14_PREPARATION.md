# Gate G14 — preparação de evidências

Status atual: **em preparação; não aprovado**.

Este documento acompanha a conclusão da Fase 3 sem confundir validação local,
CI, homologação com papéis reais e homologação em dispositivo.

## Matriz de critérios

| Critério G14 | Evidência automatizada preparada | Evidência ainda obrigatória |
|---|---|---|
| Matriz role × capability × contexto | RPCs fail-closed, testes SQL e baseline JWT real | Fluxo manual com cada papel e contexto autorizado |
| Timeline, responsabilidade e `correlationId` iguais | Read models Web/Business/Client e teste SQL compartilhado | Comparação visual das três superfícies na mesma solicitação |
| Deep links | Parser fail-closed e bundle das rotas dinâmicas | Android real em cold start, background e foreground |
| Offline e replay | Outboxes Client e Business persistentes, mesmo `requestId`, isolamento por usuário/unidade e conflito com releitura | Queda de rede e reinício do processo em Android real |
| UI manipulada negada no backend | RPCs revalidam identidade, capability, unidade e versão | Execução E2E com tentativa adulterada contra homologação |
| Push | Evento imutável → fila idempotente → dispatcher existente | Ticket e receipt reais em dispositivo de homologação |

## Workflow preparado

O workflow `.github/workflows/phase3-gate.yml` executa:

1. reset integral do banco descartável;
2. cenários SQL da Fase 3;
3. lint e advisors locais do Supabase;
4. typecheck de todos os aplicativos;
5. testes focados de G14, deep links e contratos;
6. lint e bundles Web de Client e Business;
7. baseline de autorização com JWT real e TOTP;
8. registro explícito da evidência como `CI reproduzido`.

## Evidência local e CI confirmada — 2026-08-09

| Verificação | Resultado |
|---|---|
| Reset integral do Supabase local | Aprovado; cadeia completa de migrations reproduzida em banco descartável |
| Cenários SQL da Fase 3 | Aprovado; transação de teste concluída e revertida sem falhas |
| Supabase DB lint | Aprovado; nenhum erro no schema `public` |
| Advisors de segurança e desempenho | Aprovados no nível `error` |
| Typecheck compartilhado, Client, Business e Control | Aprovado |
| Testes focados de contratos, notificações e G14 | Aprovado; 31 testes após incluir a outbox Business |
| Lint Client e Business | Aprovado |
| Exportação Web Client e Business | Aprovada |
| Parse do workflow e `git diff --check` | Aprovado |

## Evidência CI reproduzida

- PR: `#33`, branch `codex/phase3-decision-center`.
- Commit da entrega principal da Fase 3: `c985364ce003cc101b10ff3683ce7fffc4e700c7`.
- Workflow Phase 3 Gate: execução `31298583757`, concluída com sucesso.
- Workflows Phase 1 Gate, Phase 2 Gate, Install and Build e Schema Drift também
  concluídos com sucesso no mesmo commit.

## Evidência em Homolog

- Projeto alvo confirmado: `sphbbqdgcreowxzjgibj`.
- Backup pré-rollout salvo fora do repositório em
  `C:\Users\PICHAU\AppData\Local\CutSync\backups\phase3-20260809-174054`.
- Checksums SHA-256: dados
  `631A94F8A358A0B7550C31EA1BE1B01E7CD30D1CCDE152DB14796621997F7A6C`,
  roles `168A95A9C745AF5ED4679751F90419AC9DC434240A213B03E32A06D5664C2308`
  e schema
  `C39CE84538E7E42C6AC298F2A4E9A23CBAFDEC1D4C94831F50DEDD0BA54A93B1`.
- Onze migrations aditivas das Fases 1–3 foram aplicadas; o histórico remoto
  passou a incluir versões até `20260823000000`.
- `supabase db lint` remoto terminou sem erros. Permanecem três avisos de
  variáveis SQL não utilizadas, sem alteração de autorização ou resultado.
- Harness técnico PostgREST com usuário temporário, sessão autenticada e limpeza
  posterior validou `get_my_authorized_contexts`,
  `get_my_business_operational_contexts` e `set_my_active_context`, todos com
  HTTP 200 e read models aceitos.

## Evidência Android

- A incompatibilidade nativa `EventEmitter` foi eliminada alinhando Expo SDK 57
  e React Native `0.86.2` no monorepo; `npm ls` confirmou uma única versão.
- O Business foi recompilado e instalado com sucesso em emulador Android 16.
- A tela de login renderizou sem erro nativo após reiniciar o Metro.
- A captura com conta real ainda apresentou `BUS_CTX_CONTEXTS_UNAVAILABLE` antes
  desta instrumentação detalhada. É necessário autenticar novamente com o novo
  bundle e registrar o novo código caso o erro persista.
- `expo-doctor` aprovou 19 de 20 verificações; o único aviso corresponde ao
  diretório Android gerado localmente e não versionado.

As evidências local, CI e do contrato técnico remoto estão confirmadas. Os
fluxos completos com todos os papéis reais, push/deep link e retomada offline em
Android continuam pendentes de homologação; portanto o gate permanece não
aprovado.

## Condições para aprovação

G14 só pode ser aprovado após:

- workflow verde em PR identificado;
- homologação com cliente, profissional, manager/admin e usuário sem vínculo;
- Android real validando push e deep links nos três estados do aplicativo;
- replay após perda de rede e reinício sem duplicar a decisão;
- comparação da mesma `correlationId` em Web, Business e Client;
- aprovação explícita registrada com limitações e evidências.
