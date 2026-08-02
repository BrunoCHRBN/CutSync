# CutSync Cloud — estado atual do módulo Suporte

Use este documento como substituto do vídeo na execução pelo Cursor. As imagens desta pasta mostram o estado atual e a referência visual desejada.

## Fontes

- `support-current-state-contact-sheet.jpg`: visão consolidada do estado atual.
- `screenshots/`: capturas por superfície.
- `support-target-reference.png`: referência visual da fila e da rota dedicada de detalhes.

## Rotas já existentes

- `/cloud/suporte`
- `/cloud/suporte/atendimentos`
- `/cloud/suporte/atendimentos/[ticketId]`
- `/cloud/suporte/clientes`
- `/cloud/suporte/monitoramento`
- `/cloud/suporte/operacoes-assistidas`

## Funcionalidades observadas

- visão geral com triagem, indicadores, atenção imediata, distribuição da fila, saúde e atividade recente;
- fila com busca, filtros, ordenação, seleção, paginação, SLA, prioridade, responsável, status e sincronização;
- rota dedicada para o chamado;
- abas de Visão geral, Conversa, Envolvidos, Contexto técnico e Histórico;
- referência e sincronização com Jira Service Management;
- ações de responder, escalar, reprocessar sincronização e abrir no Jira, condicionadas ao estado atual da integração;
- monitoramento de runtime e sincronização;
- superfícies de Clientes e Operações assistidas ainda em preparação.

## Problemas prioritários

1. Enums e eventos internos aparecem diretamente na interface (`high`, `client`, `other`, `ticket_created`, `queued`).
2. IDs aparecem no lugar de nomes de usuários, equipes, organizações e unidades.
3. A conversa ainda parece texto bruto; deve virar timeline semântica.
4. O histórico parece log técnico; deve ser traduzido para linguagem operacional.
5. Ações aparecem expandidas e ocupam espaço; devem migrar para menu, modal ou drawer.
6. A lateral repete dados em abas onde o mesmo conteúdo já aparece na área principal.
7. A fila precisa de cabeçalho explícito, filtros mais claros e toolbar contextual ao selecionar itens.
8. Campos vazios e valores `—` ocupam espaço sem ajudar o diagnóstico.
9. Monitoramento, Clientes e Operações assistidas precisam de estados institucionais mais informativos.
10. O mobile precisa preservar legibilidade, ações e navegação sem sobreposição.

## Direção visual

- aparência corporativa e operacional;
- superfícies planas, divisores, tabelas e linhas de definição;
- poucos cards;
- cores usadas para estado e ação, não como decoração;
- raio de 4–8 px;
- dados densos, mas escaneáveis;
- tabelas para comparação;
- timelines para mensagens e histórico;
- drawer ou modal para ações contextuais;
- nomes humanos como informação principal e IDs como metadado técnico.

## Regra central para implementação

O repositório é a fonte de verdade para dados, permissões, contratos e funcionalidades. As imagens são referência de organização visual. Não copiar valores demonstrativos para o código e não remover funcionalidades já existentes.
