# Reconciliação de migrations — Plano v2.2

Data da coleta: 2026-08-08

Ambientes remotos inspecionados: `sphbbqdgcreowxzjgibj` (`CutSync Homolog`) e
`hxoenfnszrrgaqxplzmd` (`CutSync.io`). A inspeção de produção ocorreu em
workspace CLI isolado e sem escrita remota.

## Duplicatas locais

| Versão | Arquivo | SHA-256 | Histórico vinculado | Fingerprint no schema vinculado |
| --- | --- | --- | --- | --- |
| `20260806000000` | `android_business_operational_cycle.sql` | `6B7AB1E37F0A69B318AFA3F17F8A0AD4C46D21D5A4DB5F515AB67EBA8A97F5DF` | uma entrada para duas migrations | `command_receipts` presente |
| `20260806000000` | `client_discovery_media_and_geo.sql` | `7D63F8EF2EA031F3DA830E40C41F67FDBE139AF33796A20FDBCDB681B7BF8CD9` | sem segunda entrada | `client_discovery_distance_meters` presente |
| `20260807000000` | `client_favorites.sql` | `B17242DCD162C1DAE58F6BDB98705F0EF6D4775290F3E8FA603E64BA3538DC70` | uma entrada para duas migrations | `client_favorite_establishments` presente |
| `20260807000000` | `establishment_client_enrichment.sql` | `5365D76E25AE4A0145276716C8B237EEBCC9850D9A30D0FBF00BAABC543754A6` | sem segunda entrada | `normalized_phone` presente |
| `20260811000000` | `access_control_audit_hardening.sql` | `8DB3BEB1D7CDF4CA7C7B1BF5CFF875DE0A18F44BB97D33C61B252BAE2FD5598A` | versão ausente | policies de reviews presentes |
| `20260811000000` | `appointment_price_charged_snapshot.sql` | `41CC7C1471C94338885954ED7310DBDCBCBF22827AB26EE0D4CEDD5AB1858631` | versão ausente | `appointments.price_charged` presente |

O schema foi obtido por `supabase db dump --linked --schema public`. A presença de
fingerprint comprova o objeto atual, não qual arquivo o criou nem equivalência byte a
byte da migration.

## Outras divergências de histórico

- O comando `supabase migration fetch --linked --yes`, executado em projeto local
  isolado e sem escrita remota, recuperou o SQL das sete versões antes remote-only:
  `20260101000000`, `20260808041238`, `20260808041243`, `20260808041248`,
  `20260808041253`, `20260819000000` e `20260819001000`.
- Os sete artefatos recuperados foram adicionados sob as versões e nomes retornados
  pelo histórico remoto. A comparação normalizada confirmou o mesmo conteúdo; a
  diferença física limita-se a quebras de linha/trailing newline do checkout.
- A contenção v2.2 foi criada pelo CLI e movida, antes de receber conteúdo, para a
  versão inédita `20260820000000`, posterior ao maior histórico remoto conhecido.
- As correções encontradas durante a reprodução descartável ocupam versões
  inéditas `20260820001000` a `20260820006000`: trigger de descoberta, grant do
  worker de push, autorização da equipe Business, hardening de DELETE da KB,
  ACL de profiles e contrato explícito do catálogo/CRM.
- A produção possui apenas o subconjunto histórico anterior, até
  `20260728000000`; ela não recebeu as migrations da Fase 0. Essa divergência
  impede qualquer push produtivo automático e exige plano de promoção próprio.

## Backups antes da escrita em Homolog

Diretório restrito:
`C:\Users\PICHAU\AppData\Local\CutSync\backups\f0-20260808-152033`.

| Ambiente | Artefato | Tamanho | SHA-256 |
| --- | --- | ---: | --- |
| Homolog | `homolog-roles.sql` | 370 | `168A95A9C745AF5ED4679751F90419AC9DC434240A213B03E32A06D5664C2308` |
| Homolog | `homolog-schema.sql` | 3.285.556 | `474C0EAFADE52D733A1E1FB29DA4D0EC8A31B02F35F7B0E210194216A105A49A` |
| Homolog | `homolog-data.sql` | 147.455 | `82C83ED73CB4A0734B2350F87548F7B62C558E714A4CA9698B4D38962ADB004A` |
| Produção | `production-roles.sql` | 297 | `25873CEC56A2CC6514E204F420231777F85C03DA818CAA7090CDCDFA89776ECD` |
| Produção | `production-schema.sql` | 954.775 | `3D883794CFACBD3B1587A87E7AC8087742A97C60A10F8DE59C16E6AFFF16AC27` |
| Produção | `production-data.sql` | 170.604 | `ED1D7F947CDEE1E49B7B23DCEC15E93329510A310537D774F929BA1F8EF3A04D` |

Os dumps de data emitiram avisos de ciclos de FK. Eles preservam a captura, mas
não são apresentados como restore homologado; nenhum repair depende deles.

## Dependências observadas

- `client_discovery_media_and_geo` depende da base pública de establishments e
  profissionais; o ciclo Android cria os contratos Business e CRM local.
- `client_favorites` depende de profiles/establishments; enrichment depende de
  `establishment_clients` criado no ciclo Android.
- `appointment_price_charged_snapshot` depende de appointments/services e é usado
  pelas etapas de service order.
- A contenção `20260820000000` depende de memberships, contexts Business,
  service_orders e dos metadados de transferência criados até `20260818`.

## Runbook antes de qualquer repair

1. Exportar schema, histórico e backup restaurável separadamente em descartável,
   homologação e produção.
2. Comparar os sete artefatos recuperados por `migration fetch` com qualquer
   branch/artefato original de publicação disponível.
3. Comparar objetos, grants, policies, triggers e function definitions; não usar
   apenas nome de tabela como prova de equivalência.
4. Reproduzir um banco descartável desde zero e executar toda a suíte SQL/RLS.
5. Criar bridge aditiva para qualquer diferença. Não renomear as seis migrations
   duplicadas enquanto puderem ter sido aplicadas por filename distinto.
6. Usar `migration repair` somente se o schema for equivalente, o backup tiver
   restore testado e houver aprovação explícita do responsável pelo ambiente.
7. Registrar resultado como local, CI, homologado ou produção homologada.

## Reprodução descartável executada

O reset direto do CLI agora encontra a base recuperada e percorre o histórico até
falhar, como esperado, ao tentar registrar pela segunda vez `20260806000000`. Os
originais não foram renomeados ou removidos.

O script `scripts/reset-supabase-reconciled.ps1` torna o procedimento reproduzível:

1. valida filename e SHA-256 das seis migrations históricas duplicadas;
2. monta um projeto Supabase temporário fora do checkout;
3. mantém `20260806000000_android_business_operational_cycle.sql` e
   `20260807000000_establishment_client_enrichment.sql`;
4. deixa os outros quatro conteúdos históricos como evidência e consome suas
   convergências remotas `20260808041238`–`20260808041253`;
5. rejeita qualquer versão que ainda esteja duplicada no workspace temporário;
6. executa `supabase db reset --local --no-seed` e remove o temporário após uso.

Comando validado:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\reset-supabase-reconciled.ps1
```

Resultado: reset completo até `20260820006000`, seguido por 42/42 arquivos SQL/RLS
verdes. Nenhum `migration repair` é necessário para a reprodução local.

## Rollout em Homolog

O dry-run listou somente as migrations `20260820000000`–`20260820006000`, sem
seed ou roles. O `db push --linked` aplicou exatamente essas sete migrations e o
`migration list --linked` confirmou o histórico remoto completo até
`20260820006000`. Não foi utilizado `migration repair`.

A contenção foi validada com JWTs reais por
`scripts/validate-gate-f0-homolog.ps1`; todas as fixtures técnicas foram removidas
e a verificação final retornou zero unidades e zero usuários residuais.

## Estado do gate

A baseline está reconciliada, reproduzível localmente e homologada para a
contenção. Produção foi apenas inventariada e permaneceu intacta. O gate ainda não
pode receber aprovação formal porque a evidência de CI remoto sobre commit/PR não
existe; o checkout não foi commitado ou enviado automaticamente.
