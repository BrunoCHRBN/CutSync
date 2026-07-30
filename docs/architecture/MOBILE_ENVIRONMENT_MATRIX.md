# Matriz de ambientes dos aplicativos móveis

Status: contrato público aplicado; consumidores de servidor existentes
publicados em Homolog, com novos bundles, homologação e desativação pendentes

Data: 2026-07-30

## Objetivo

CutSync Client e CutSync Business têm projetos EAS, binários, identificadores e
ciclos de distribuição independentes. Dentro de um mesmo ambiente lógico,
entretanto, ambos devem usar o mesmo projeto Supabase para compartilhar
identidade, estabelecimentos, associações, RLS e RPCs.

## Matriz canônica

| Ambiente EAS | Supabase | Project ref | Uso |
| --- | --- | --- | --- |
| `development` | CutSync Homolog | `sphbbqdgcreowxzjgibj` | desenvolvimento e development builds |
| `preview` | CutSync Homolog | `sphbbqdgcreowxzjgibj` | APK interno e homologação integrada |
| `production` | CutSync.io | `hxoenfnszrrgaqxplzmd` | AAB/TestFlight e usuários reais |

Projetos EAS:

| Aplicativo | Projeto EAS |
| --- | --- |
| Client | `ebed753a-2b13-4fa1-bb73-fc28270c2cec` |
| Business | `e7525fdb-a629-40b7-b1e3-b2d043a88fea` |

## Variáveis compartilhadas

Os dois projetos EAS usam os mesmos nomes:

- `EXPO_PUBLIC_APP_ENV`;
- `EXPO_PUBLIC_SUPABASE_URL`;
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

O runtime atual exige `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; não há fallback
para `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Builds antigas continuam contendo o valor
que foi incorporado quando o bundle foi gerado e precisam ser retiradas da
matriz suportada antes da desativação das chaves legadas.

Valores `EXPO_PUBLIC_*` são públicos no bundle. Chaves legadas `service_role`,
chaves `sb_secret_*`, tokens Sentry, credenciais FCM administrativas e outros
segredos de servidor não podem usar esse prefixo nem ser incluídos nos
aplicativos.

## Variáveis próprias

Continuam no projeto EAS de cada aplicativo:

- project ID, bundle identifier, Android package e scheme;
- Sentry DSN, organização e projeto;
- Firebase/FCM e arquivos nativos;
- canais, runtime e metadados de distribuição.

## Barreira pré-build

`scripts/validate-mobile-environment.cjs` falha antes do build quando:

- aplicativo ou ambiente não é reconhecido;
- URL ou chave pública está ausente/inválida;
- Development/Preview aponta para Production;
- Production aponta para Homolog;
- `EXPO_PUBLIC_APP_ENV` diverge do perfil solicitado;
- o projeto EAS do aplicativo não corresponde ao contrato.

O verificador imprime somente aplicativo, ambiente, project ref, EAS project ID
e tipo da chave. Nenhum valor de credencial é registrado.

Além da validação estrutural, o preflight consulta
`/auth/v1/settings` sem ler ou imprimir o corpo da resposta. Assim, uma chave
com formato válido, porém pertencente a outro projeto, também bloqueia o build.

## Operação

Cada script `eas:*` executa primeiro `eas env:exec` para carregar o ambiente
remoto e rodar a barreira. Um build não deve ser iniciado diretamente sem essa
validação.

Depois de alterar uma variável pública, é obrigatório gerar novo bundle/build;
o valor já incorporado em APK/AAB instalado não muda retroativamente.

## Evidência de aplicação em 2026-07-30

- as seis combinações Client/Business por Development/Preview/Production
  passaram no preflight remoto;
- os dois perfis Preview resolvem para APK e homologação;
- os dois perfis Production resolvem para AAB e produção;
- o Client deixou de publicar `EXPO_PUBLIC_SUPABASE_ANON_KEY` no EAS;
- nenhum APK/AAB foi iniciado nesta etapa.

O APK Preview mais recente do Business foi criado em 2026-07-30 com a
publishable key já presente no ambiente. O Preview disponível do Client é
anterior à migração; ele não é aceito como evidência para desligar as chaves
legadas em Homolog.

## Consumidores de servidor

O código das Edge Functions foi migrado para resolver publishable e secret
keys modernas. No runtime hospedado, `SUPABASE_PUBLISHABLE_KEYS` e
`SUPABASE_SECRET_KEYS` são mapas JSON de chaves nomeadas; a entrada `default` é
usada quando nenhuma outra é solicitada. Para execução local controlada,
`SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_SECRET_KEY` são os fallbacks singulares.
Nenhuma dessas variáveis secretas pertence ao EAS ou ao bundle.

O inventário local cobre billing, suporte/Jira, notificações, fiscal, cadastro
Business, resolução de identidade e exclusão de conta. As 15 Edge Functions que
já faziam parte de Homolog foram publicadas com o resolvedor novo e ficaram
`ACTIVE`. O inventário estrutural dos bancos Homolog e Production não encontrou
marcadores de chave em triggers, funções, cron ou Vault, nem Database Webhooks.
Isso ainda não substitui a retirada de bundles e binários antigos nem os fluxos
autenticados por papel.

As chaves JWT legadas `anon` e `service_role` são desativadas em conjunto pelo
Supabase; não existe uma etapa segura para desativar apenas uma delas. A
desativação permanece pendente até que Homolog e Production cumpram os gates do
runbook, incluindo novos bundles/deploys e repetição dos fluxos autenticados.
Os papéis SQL `anon` e `service_role`, usados em grants e RLS, não são removidos
por essa operação.

Consulte o runbook e o registro de evidência em
`docs/security/SUPABASE_API_KEY_MIGRATION.md` e o
[guia oficial de migração do Supabase](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys).
