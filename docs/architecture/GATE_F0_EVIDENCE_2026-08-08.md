# Gate F0 — evidências e decisão

Data: 2026-08-08

Decisão atual: **NÃO APROVADO — somente CI remoto pendente**

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

## Limitações conhecidas

- A suíte unitária global teve 413/428 testes verdes; 15 expectativas antigas,
  fora do recorte F0, permanecem vermelhas e estão discriminadas no acompanhamento
  do plano. O gate exige os testes focados, que estão verdes.
- O lint remoto possui dois warnings não bloqueadores e zero erros.
- Os dumps de dados possuem ciclos de FK e não foram restaurados; nenhum repair
  foi realizado ou depende de restore.
- Produção está atrás da Homolog e não é alvo de promoção nesta aprovação.

## Única pendência de aprovação

O plano estabelece que cada gate precisa de evidência de CI. A classe
`CI reproduzido` exige pipeline remoto executado sobre commit ou PR identificado.
As mudanças estão no working tree e as regras do repositório proíbem commit
automático sem pedido explícito. Portanto, uma aprovação agora seria uma evidência
falsa.

Para concluir:

1. autorizar a criação de um commit focado da entrega F0;
2. autorizar o push de uma branch `codex/*` e a abertura/uso de PR;
3. aguardar os workflows remotos verdes;
4. registrar aqui commit, branch, execução e a decisão **APROVADO**;
5. parar e liberar o início da Fase 1.

## Escopo previsto da Fase 1

Após a aprovação, a Fase 1 concluirá identidade, contexto, lifecycle e
capabilities: remoção de decisões privilegiadas por `profile.role`, contexto
persistido e revalidado no backend, templates/overrides de capabilities,
approvals sensíveis com AAL2, lifecycle operacional e readiness calculado. Ela
não inicia reatribuição completa, POS ou Stripe Connect.
