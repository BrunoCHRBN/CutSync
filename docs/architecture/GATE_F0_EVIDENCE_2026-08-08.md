# Gate F0 — evidências e decisão

Data: 2026-08-08

Decisão atual: **APROVADO**

## Critérios concluídos

| Critério | Classe | Resultado |
| --- | --- | --- |
| transferência silenciosa contida | Homologado | PASS |
| typechecks de Shared, Client, Business, Control e Web | Local confirmado | PASS |
| lint e build Web | Local confirmado | PASS |
| testes unitários focados | Local confirmado | 29/29 |
| suíte SQL/RLS em banco descartável | Local confirmado | 42/42 |
| migrations reproduzíveis desde zero | Local confirmado | PASS pelo reset reconciliado |
| migrations aditivas na Homolog | Homologado | `20260820000000`–`20260820006000` |
| JWT real owner/admin | Homologado | PASS |
| JWT real professional | Homologado | PASS |
| JWT real client | Homologado | PASS |
| flag de reatribuição desligada e protegida | Homologado | PASS |
| flags financeiras desligadas | Local/remote schema | PASS |
| fixtures técnicas removidas | Homologado | zero resíduos |
| produção preservada | Inventário remoto | nenhum push/repair/deploy |
| ADRs 0001–0008 | Local confirmado | PASS |
| CI Install and Build | CI reproduzido | run `218`: PASS |
| CI Supabase Schema Drift | CI reproduzido | run `103`: PASS contra Homolog |

## Limitações conhecidas

- A suíte unitária global teve 413/428 testes verdes; 15 expectativas antigas,
  fora do recorte F0, permanecem vermelhas e estão discriminadas no acompanhamento
  do plano. O gate exige os testes focados, que estão verdes.
- O lint remoto possui dois warnings não bloqueadores e zero erros.
- Os dumps de dados possuem ciclos de FK e não foram restaurados; nenhum repair
  foi realizado ou depende de restore.
- Produção está atrás da Homolog e não é alvo de promoção nesta aprovação.

## Registro da aprovação

- Branch: `codex/gate-f0-approval`.
- PR: `#30`.
- Commit funcional validado: `afa189e`.
- Install and Build: run `218`, conclusão `success`.
- Supabase Schema Drift: run `103`, conclusão `success`.
- O workflow de drift passou a fixar explicitamente a Homolog
  `sphbbqdgcreowxzjgibj`; produção não é alvo de geração de tipos ou comparação.
- Os tipos versionados foram regenerados a partir da Homolog e passaram na
  comparação remota.

Todos os critérios vinculantes do Gate F0 possuem evidência local, CI ou de
Homolog conforme aplicável. O Gate F0 está **APROVADO** e a Fase 1 está liberada,
mas não foi iniciada nesta atividade.

## Escopo previsto da Fase 1

Após a aprovação, a Fase 1 concluirá identidade, contexto, lifecycle e
capabilities: remoção de decisões privilegiadas por `profile.role`, contexto
persistido e revalidado no backend, templates/overrides de capabilities,
approvals sensíveis com AAL2, lifecycle operacional e readiness calculado. Ela
não inicia reatribuição completa, POS ou Stripe Connect.
