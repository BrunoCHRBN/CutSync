# Central de Suporte CutSync — rollout operacional

## Responsabilidades

- Jira Service Management (JSM): chamado autoritativo, workflow, agente, filas e SLA.
- Supabase: autenticação, autorização, roteamento CutSync, projeção para os aplicativos, outbox, notificações e reconciliação.
- Client: abertura, lista e conversa do solicitante.
- Control: operação, classificação, escalonamento e reprocessamento. As respostas continuam no Jira.

O aplicativo nunca acessa a API do Atlassian diretamente. Use duas identidades
no servidor:

- uma conta gratuita de portal/customer para criar chamados e publicar as
  mensagens dos usuários CutSync;
- uma conta com papel de agente para ler SLA/status e atualizar o roteamento.

Elas precisam ser diferentes. Caso a conta de agente publique também a mensagem
do solicitante, o JSM pode contabilizá-la incorretamente como primeira resposta.
No início, a identidade de agente pode ser a conta pessoal do único atendente;
ao crescer, ela deve ser substituída por uma identidade técnica licenciada.

O fallback inicial envia tudo para `SUPORTE_GERAL`. As regras já podem separar
por produto, categoria, organização ou estabelecimento quando o chamado estiver
ligado a um agendamento. Região/UF/cidade permanecem preparadas, mas só devem ser
ativadas depois que o endereço deixar de ser texto livre e passar a ter campos
estruturados.

## Configuração do JSM

No projeto já existente:

1. Crie o request type `Falar com o suporte CutSync`.
2. Configure o workflow `Aberto → Em andamento → Aguardando usuário → Resolvido`.
3. Crie e mantenha no request type todos os campos obrigatórios da integração:
   - ID CutSync;
   - produto;
   - área;
   - papel do solicitante;
   - equipe CutSync;
   - localização;
   - nível de escalonamento;
   - versão do roteamento;
   - impacto;
   - prioridade CutSync.
4. Mantenha o campo `ID CutSync` pesquisável. Ele é usado para reduzir duplicação
   durante retentativas.
5. Configure as filas: novos, aguardando suporte, aguardando usuário, risco de
   SLA, críticos e incidentes.
6. Crie uma automação que mapeie a prioridade CutSync (`critical`, `high`,
   `normal`, `low`) para a prioridade Jira usada pelo calendário/SLA. A
   homologação deve provar as quatro metas; não presuma o valor padrão do Jira.
7. Atribua chamados com equipe `SUPORTE_GERAL` ao único agente ativo.
8. Faça comentários do agente como públicos quando a resposta precisar aparecer
   no CutSync. Comentários internos nunca são importados.

SLA de primeira resposta:

| Prioridade | Meta |
| --- | --- |
| Crítica | 1 hora útil |
| Alta | 4 horas úteis |
| Normal | 1 dia útil |
| Baixa | 2 dias úteis |

Use segunda a sexta, 09:00–18:00, fuso `America/Sao_Paulo`, com os feriados da
operação. Incidentes críticos devem alertar imediatamente, sem divulgar promessa
de suporte 24/7.

## Secrets e deploy

Use `supabase/functions/.env.example` como inventário. Substitua todos os valores
de exemplo em um arquivo local ignorado pelo Git e então configure os secrets:

```powershell
npm run support:verify-jsm
npx supabase secrets set --env-file .\supabase\functions\.env.support.local
```

Permissões mínimas:

- conta requester: criar customer requests e publicar comentários públicos nos
  chamados que ela criou; registre também o `accountId` dessa conta para que a
  reconciliação diferencie mensagens proxy de respostas do agente;
- conta agent: consultar status, comentários públicos, responsável e SLA, além
  de editar somente os campos CutSync do projeto.

Ordem de publicação:

```powershell
npx supabase db push
npx supabase functions deploy create-jsm-ticket --no-verify-jwt
npx supabase functions deploy reply-jsm-ticket --no-verify-jwt
npx supabase functions deploy sync-jsm-ticket --no-verify-jwt
npx supabase functions deploy reconcile-jsm-support --no-verify-jwt
npx supabase functions deploy dispatch-client-notifications --no-verify-jwt
```

Agende uma chamada `POST` a cada dois minutos para:

```text
https://<project-ref>.supabase.co/functions/v1/reconcile-jsm-support
```

Envie `x-cutsync-support-secret: <SUPPORT_JOB_SECRET>`. O segredo de suporte deve
ser diferente do segredo dos workers de billing e notificações.

## Sincronização imediata Jira → CutSync

O cron continua obrigatório como mecanismo de reconciliação. Para refletir
comentários públicos e mudanças de status normalmente em segundos, configure
duas regras de automação no projeto de suporte:

1. `CutSync | Sincronizar transição`
   - acionador: ticket transicionado;
   - condição: projeto `SUP` e tipo de solicitação
     `Falar com o Suporte CutSync`;
   - ação: enviar solicitação web.
2. `CutSync | Sincronizar comentário público`
   - acionador: comentário adicionado;
   - condições: projeto `SUP`, mesmo tipo de solicitação e
     `{{comment.internal}}` igual a `false`;
   - ação: enviar solicitação web.

Use a mesma chamada nas duas ações:

```text
POST https://<project-ref>.supabase.co/functions/v1/reconcile-jsm-support
Content-Type: application/json
x-cutsync-support-event-secret: <SUPPORT_JSM_WEBHOOK_SECRET>
```

Corpo:

```json
{
  "issueKey": "{{issue.key}}"
}
```

Não marque a ação para aguardar a resposta HTTP. A função valida a chave,
localiza somente o chamado CutSync correspondente e consulta o estado
autoritativo diretamente no JSM; status, comentários ou responsáveis enviados
no corpo da automação não são aceitos como fonte de verdade.

Use um `SUPPORT_JSM_WEBHOOK_SECRET` aleatório com pelo menos 32 caracteres,
diferente de `SUPPORT_JOB_SECRET`. Depois de adicioná-lo ao arquivo local,
execute novamente:

```powershell
npm run support:verify-jsm
npx supabase secrets set --env-file .\supabase\functions\.env.support.local
npx supabase functions deploy reconcile-jsm-support --no-verify-jwt
```

Uma resposta `reconciled: true` confirma a atualização. `ignored: true`
significa que a chave não pertence a um chamado CutSync ativo; revise as
condições da automação se isso ocorrer.

## Ativação segura

A migration cria o módulo desligado. No Control:

1. Entre com AAL2.
2. Associe o primeiro `SaaS_Owner` à equipe `SUPORTE_GERAL`, informando o
   `jira_account_id` da conta pessoal do agente.
3. Mantenha `enabled=false` e `allow_new_tickets=false`.
4. Ative o módulo e a sincronização, mas mantenha `allow_new_tickets=false`.
   Crie o chamado de homologação com uma conta de teste pelo RPC interno
   `create_support_ticket_internal` usando a service role no ambiente isolado.
5. Confirme o mesmo protocolo no banco, Jira, Client e Control.
6. Confirme que comentário interno não chega ao Client.
7. Publique a versão do Client somente no canal/grupo piloto e então ative
   `allow_new_tickets`; esse switch é global e não funciona como allowlist.
   Monitore por 48 horas.
8. Somente depois distribua a versão com suporte para todos os usuários do
   Client.

O runtime switch permite suspender abertura e sincronização sem publicar nova
versão do aplicativo. Registre sempre uma justificativa operacional.

## Critérios de homologação

- Usuários diferentes não acessam o mesmo chamado.
- A mesma idempotency key não cria novo chamado ou nova mensagem.
- Falha do Atlassian deixa a operação na outbox e não perde conteúdo.
- Timeout ambíguo depois do POST entra em modo de busca; o worker não repete a
  criação automaticamente e, após cinco tentativas, exige reprocessamento
  manual.
- `429` respeita `Retry-After`; após cinco falhas a operação exige reprocessamento.
- Uma resposta pública do Jira chega ao Client em até três minutos.
- Comentários com marcador `CS-MSG-*` são reconhecidos como originados pelo
  CutSync e não são reimportados como resposta do agente.
- Push abre somente `/support/[id]` com UUID validado.
- Conteúdo local resolvido há mais de 12 meses é expurgado; protocolo e
  metadados mínimos permanecem.
- Logs técnicos não contêm assunto, mensagem, e-mail, endereço ou token.
- Transição ou comentário público do Jira chega ao Client normalmente em até
  um minuto; se a automação falhar, o cron preserva o limite de três minutos.
