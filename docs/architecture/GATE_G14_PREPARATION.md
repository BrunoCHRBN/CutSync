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

## Evidência local confirmada — 2026-08-09

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

Esta evidência comprova apenas a baseline local. O workflow ainda precisa ser
executado em PR para receber a classificação `CI reproduzido`; os fluxos com
papéis reais, push/deep link e retomada offline em Android continuam pendentes
de homologação.

## Condições para aprovação

G14 só pode ser aprovado após:

- workflow verde em PR identificado;
- homologação com cliente, profissional, manager/admin e usuário sem vínculo;
- Android real validando push e deep links nos três estados do aplicativo;
- replay após perda de rede e reinício sem duplicar a decisão;
- comparação da mesma `correlationId` em Web, Business e Client;
- aprovação explícita registrada com limitações e evidências.
