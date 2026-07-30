# Migração para as chaves modernas do Supabase

Status: código e consumidores públicos migrados; chaves legadas desativadas e
verificadas em Homolog e Production; homologação autenticada por papel
permanece separada; incidente da secret moderna de Production aguarda
inventário e rotação

Data de referência: 2026-07-30

## Objetivo

Substituir os consumidores das chaves JWT legadas do Supabase pelas chaves
modernas, mantendo uma separação verificável entre código público e código
confiável:

| Consumidor | Chave permitida | Onde configurar |
| --- | --- | --- |
| Client, Business, Web e Control | `sb_publishable_*` | EAS, Vercel ou `.env` local ignorado |
| Edge Functions e workers confiáveis | `sb_secret_*` | ambiente secreto do servidor |
| Browser, APK, AAB ou JavaScript público | nunca `sb_secret_*` | não aplicável |

As chaves `sb_publishable_*` são públicas por definição. Isso não dispensa RLS,
autorização nas RPCs nem validação do usuário. As chaves `sb_secret_*` assumem o
papel privilegiado `service_role`, ignoram RLS e devem existir somente no
servidor.

Os identificadores SQL `anon` e `service_role` continuam sendo papéis do banco
e permanecem válidos em grants, policies e testes. A migração troca a forma de
autenticar as chamadas; ela não renomeia esses papéis.

## Contrato de configuração

### Aplicativos e Web

Todo runtime público exige:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_substitua_aqui
```

Não existe fallback de runtime para `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Depois de
alterar uma variável `EXPO_PUBLIC_*`, é obrigatório gerar e distribuir um novo
bundle, APK ou AAB; uma instalação antiga não recebe a mudança
retroativamente.

### Edge Functions hospedadas

O runtime hospedado fornece mapas JSON de chaves nomeadas:

- `SUPABASE_PUBLISHABLE_KEYS`;
- `SUPABASE_SECRET_KEYS`.

O resolvedor compartilhado usa a entrada `default`, salvo quando o consumidor
solicita explicitamente outro nome. Em desenvolvimento local controlado, são
aceitos os fallbacks singulares:

- `SUPABASE_PUBLISHABLE_KEY`;
- `SUPABASE_SECRET_KEY`.

O resolvedor rejeita ausência, JSON inválido e prefixo incompatível por códigos
fixos. Nenhuma mensagem de erro, log, analytics ou teste deve imprimir o valor
da chave.

## Estado verificado

| Área | Estado nesta data | Evidência ou pendência |
| --- | --- | --- |
| Runtime público no repositório | implementado | Client, Business, Web e Control exigem a publishable key |
| Edge Functions no repositório | implementado | billing, fiscal, suporte/Jira, notificações, cadastro Business, identidade e exclusão usam o resolvedor compartilhado |
| Testes unitários focados | aprovados localmente | 45 testes afetados passaram sem expor valores |
| EAS Client e Business | publishable key configurada | seis combinações Development/Preview/Production passaram no preflight; Client e Business repetiram o Preview depois do corte |
| Vercel Web e Control | commit `05ba97c` em Production | Web separa `Production` de `Preview`; Control permanece em Homolog por decisão operacional; os bundles não contêm nome ou JWT legado |
| Edge Functions em Homolog | 15 funções existentes publicadas | versões ficaram `ACTIVE`; smokes pós-corte retornaram `authentication_required`, não erro de configuração |
| Edge Functions em Production | footprint vazio | nenhuma função foi criada apenas para completar a migração |
| Banco remoto | inventário estrutural concluído | Homolog e Production não apresentaram marcadores de chave em triggers/funções; não há Database Webhooks; cron/Vault também não apresentaram candidatos |
| Consumidores distribuídos | inventariados | Business Preview já era moderno; um APK Client Preview interno foi gerado localmente; não há builds EAS `production` Android ou iOS |
| Desenvolvimento local | ajustado | `.env` ignorados de Client, Web e Control usam somente `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| Chaves JWT legadas | desativadas | `sphbbqdgcreowxzjgibj=false`; `hxoenfnszrrgaqxplzmd=false` em 2026-07-30 |
| Secret moderna de Production | incidente aberto | valor apareceu sem redação em trace local da CLI; inventariar consumidores, substituir e revogar |

Esse quadro registra a conclusão do cutover técnico remoto, sustentada por
inspeção dos bundles, preflights e smokes pós-corte. Ele não declara homologação
funcional por papel nem substitui os fluxos autenticados do produto.

O APK Preview mais recente do Business foi gerado depois da configuração da
publishable key. O APK Client Preview disponível no EAS é anterior à migração,
foi retirado da matriz suportada e não deve ser redistribuído. Um substituto
interno foi gerado localmente a partir de `05ba97c`, validado por assinatura e
inspeção do bundle. A cota gratuita impediu publicar esse novo APK no EAS; ele
não é evidência de distribuição em Production.

## Gate 1 — validação local

Antes de qualquer deploy:

1. Confirmar que código executável não lê
   `EXPO_PUBLIC_SUPABASE_ANON_KEY` nem `SUPABASE_SERVICE_ROLE_KEY`.
2. Manter referências a `anon` e `service_role` em SQL quando elas representarem
   papéis, grants ou expectativas de autorização.
3. Executar typecheck e lint dos aplicativos e pacotes afetados.
4. Executar os testes do resolvedor, do contrato mobile e das Edge Functions.
5. Executar `git diff --check`.
6. Inspecionar o diff para garantir que nenhum valor real de chave entrou no
   Git.

Uma busca útil, que não imprime valores de arquivos ignorados, é:

```powershell
git grep -n -E "EXPO_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY"
```

Cada ocorrência restante precisa ser classificada como documentação histórica,
teste deliberado ou consumidor ainda não migrado.

## Gate 2 — Homolog

1. Confirmar que URL, publishable key e secret key pertencem ao projeto
   `sphbbqdgcreowxzjgibj`, sem registrar seus valores.
2. Publicar somente as Edge Functions previstas para Homolog.
3. Gerar novos bundles Web/Control e um APK Preview quando o fluxo mobile fizer
   parte da validação.
4. Confirmar que chamadas públicas usam publishable key e sessão do usuário.
5. Confirmar que operações administrativas continuam exclusivamente no
   servidor e funcionam com a secret key.
6. Repetir os fluxos autenticados de cliente, profissional, administrador,
   proprietário e usuário sem vínculo.
7. Repetir billing, fiscal, Jira/suporte, notificações, cadastro Business,
   resolução de identidade e exclusão apenas onde esses módulos estiverem
   habilitados em Homolog.
8. Verificar logs por código sanitizado: ausência de erro de configuração e
   ausência de chaves, tokens ou PII.
9. Manter as chaves legadas ativas durante todo este gate.

Uma resposta HTTP esperada de autenticação ou autorização é evidência melhor
que um erro de inicialização, mas não substitui o fluxo completo com o papel
correto.

## Gate 3 — Production

1. Fazer inventário do footprint realmente publicado em Production.
2. Configurar as chaves modernas no ambiente produtivo sem copiar valores de
   Homolog.
3. Publicar apenas consumidores que já pertençam ao escopo produtivo aprovado.
4. Gerar e promover os novos bundles/binários pelos canais correspondentes.
5. Executar smoke autenticado por papel e verificar RLS/RPCs.
6. Verificar webhooks, Vault, cron, workers, CI/CD, scripts operacionais e
   integrações manuais.
7. Confirmar que versões instaladas ainda suportadas não dependem da chave
   legada.
8. Observar erros de autenticação, taxa de falha e logs sanitizados durante uma
   janela acordada antes de avançar.

Não se deve criar um novo footprint de Edge Functions em Production apenas para
“completar” esta migração.

## Gate 4 — desativação conjunta das chaves legadas

No Supabase, a desativação das chaves JWT legadas afeta `anon` e
`service_role` em conjunto. Não é possível tratar a chave legada pública e a
administrativa como duas desativações independentes.

Para um rollout integral, execute a desativação quando os gates anteriores
estiverem concluídos e registrados para o projeto correspondente:

1. Capturar a lista de consumidores, versões e responsáveis sem capturar os
   valores das chaves.
2. Confirmar ausência de tráfego conhecido pelas chaves legadas.
3. Definir responsável e janela de observação.
4. Desativar as chaves JWT legadas no painel do projeto.
5. Repetir imediatamente os smokes públicos, autenticados e administrativos.
6. Confirmar webhooks, jobs, notificações e integrações externas.
7. Registrar horário, projeto, evidências e resultado.

Primeiro conclua e observe Homolog. A desativação em Production exige uma
decisão e uma evidência separadas; o sucesso em Homolog não autoriza
automaticamente a mesma ação em Production.

A execução de 2026-07-30 adotou uma exceção documentada: o cutover técnico foi
autorizado depois dos inventários, bundles, preflights e smokes públicos, sem
credenciais E2E ou dispositivo para concluir os fluxos autenticados por papel.
Por isso, as chaves estão desativadas, mas o produto não é declarado homologado
e o Gate 4 funcional permanece incompleto.

O utilitário operacional versionado usa a credencial já autenticada da
Supabase CLI no Windows Credential Manager sem imprimir o PAT ou valores de
chaves:

```powershell
.\scripts\manage-supabase-legacy-api-keys.ps1 `
  -ProjectRef sphbbqdgcreowxzjgibj `
  -Mode Status

.\scripts\manage-supabase-legacy-api-keys.ps1 `
  -ProjectRef sphbbqdgcreowxzjgibj `
  -Mode Disable `
  -Confirm:$false
```

O modo `Enable` é reservado ao rollback emergencial. Não use
`supabase projects api-keys` para esta auditoria: na versão observada da CLI,
esse comando imprime os JWTs legados completos mesmo sem `--reveal`.

## Execução em Homolog — 2026-07-30

Às 12:07 BRT, a Management API confirmou
`legacyEnabled=false` para `sphbbqdgcreowxzjgibj`. Production permaneceu em
`legacyEnabled=true`.

Depois do corte:

- os preflights Preview de Client e Business passaram com
  `keyType=publishable` e o ref de Homolog;
- os dois projetos EAS executaram o smoke público com `auth=200`, `REST=200` e
  Edge Function `401 authentication_required`;
- `cutsync-control.vercel.app` respondeu `200` e seu bundle apontou para
  Homolog com `sb_publishable_*`, sem nome de variável ou JWT legado;
- `cut-sync.vercel.app` foi reconstruído separadamente para Production e passou
  a apontar exclusivamente para `hxoenfnszrrgaqxplzmd`;
- as variáveis `EXPO_PUBLIC_SUPABASE_ANON_KEY` foram removidas dos projetos
  Vercel Web e Control;
- uma nova consulta da Management API manteve Homolog desativada e Production
  ativa.

O smoke reproduzível usa somente a chave pública carregada pelo EAS e não
registra seu valor:

```powershell
Set-Location apps/business
npx eas-cli@21.4.0 env:exec preview `
  "node ../../scripts/smoke-supabase-public-access.cjs sphbbqdgcreowxzjgibj" `
  --non-interactive
```

Não havia credenciais E2E carregadas nem dispositivo ADB conectado para repetir
os fluxos autenticados por papel. Por isso, este registro comprova o cutover
técnico de Homolog, mas não declara a Fatia 1 homologada de ponta a ponta.

## Execução em Production — 2026-07-30

Antes do corte, o inventário EAS retornou uma lista vazia de builds Android e
iOS com perfil `production` para Client e Business. A Web já estava no commit
`05ba97c`, com variáveis separadas por ambiente e bundle contendo apenas o ref
`hxoenfnszrrgaqxplzmd` e a publishable key. Production não possui Edge
Functions, Database Webhooks ou candidatos em cron/Vault.

Às 12:18 BRT, a Management API confirmou
`legacyEnabled=false` para `hxoenfnszrrgaqxplzmd`. Depois do corte:

- Client e Business repetiram o preflight Production com
  `keyType=publishable`;
- os dois ambientes EAS repetiram `auth=200` e `REST=200`;
- o smoke da Web Production retornou `200` e a tela de login abriu sem erro de
  configuração;
- a consulta final confirmou `legacyEnabled=false` em Homolog e Production.

O smoke de Production usa `--skip-edge` porque não existe Edge Function nesse
projeto:

```powershell
Set-Location apps/business
npx eas-cli@21.4.0 env:exec production `
  "node ../../scripts/smoke-supabase-public-access.cjs hxoenfnszrrgaqxplzmd --skip-edge" `
  --non-interactive
```

## Contingência

A desativação das chaves legadas é reversível no painel. Se um consumidor
desconhecido falhar:

1. reative temporariamente as chaves legadas;
2. registre somente o identificador do consumidor e o código sanitizado da
   falha;
3. migre o consumidor para publishable ou secret key conforme sua fronteira;
4. repita todos os gates afetados;
5. agende nova desativação.

Não restaure fallbacks legados no código público e não copie uma secret key para
o cliente como solução de contingência.

O rollback operacional é:

```powershell
.\scripts\manage-supabase-legacy-api-keys.ps1 `
  -ProjectRef sphbbqdgcreowxzjgibj `
  -Mode Enable `
  -Confirm:$false
```

## Incidente pendente — secret moderna de Production

Uma `sb_secret_*` de Production foi registrada sem redação em um trace local da
Supabase CLI. O arquivo não pertence ao repositório, mas a chave deve ser
tratada como exposta. Como uma secret possui acesso elevado e não depende de
RLS, a mitigação obrigatória é:

1. inventariar consumidores externos de servidor em Production;
2. criar uma secret substituta sem registrá-la em terminal ou trace;
3. migrar e validar cada consumidor identificado;
4. revogar a secret exposta;
5. remover o trace local com segurança somente depois da revogação.

Production não possui Edge Functions e nenhum consumidor dessa secret foi
encontrado no repositório. Ainda assim, exclusão ou rotação antes do inventário
externo pode interromper um consumidor desconhecido. Apagar apenas o trace não
encerra o risco.

## Registro da execução

Preencher uma linha por ambiente quando houver evidência real:

| Ambiente | Deploy novo | Fluxos por papel | Externos inventariados | Legadas desativadas | Evidência |
| --- | --- | --- | --- | --- | --- |
| Homolog | 15 Edge Functions, Control e ambientes Preview modernos | pendente | banco auditado; APKs internos inspecionados | sim | `legacyEnabled=false`, preflights e smokes públicos pós-corte em 2026-07-30 |
| Production | Web `05ba97c`; nenhuma Edge Function ou build móvel Production | pendente | parcial: banco/EAS auditados; externos de servidor pendentes | sim | Web aponta somente para Production; `legacyEnabled=false`; smokes pós-corte aprovados |

Referências:

- [Migrating to publishable and secret API keys](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys)
- [Rotating legacy `anon` and `service_role` keys](https://supabase.com/docs/guides/troubleshooting/rotating-anon-service-and-jwt-secrets-1Jq6yd)
