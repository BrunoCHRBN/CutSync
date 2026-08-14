# Homologação Android e teste fechado do CutSync Business

Status deste documento: checklist operacional. Nenhum item externo deve ser marcado como concluído sem evidência do ambiente correspondente.

## Evidências da preparação em 2026-08-08

- Homolog está canônico até a migration `20260819001000`; os tipos Supabase
  foram regenerados depois dessa convergência.
- `dispatch-business-notifications` está ACTIVE em Homolog, versão 1, id
  `a6688b77-ebd6-4f1a-9aa2-02bcb32c5276`. A execução com token real e os
  receipts de push ainda dependem do secret operacional e de dispositivo real.
- APK Preview Android concluído no EAS Build
  `b1291e82-e084-450a-a1a3-1056fcee026a`, runtime `0.1.0`, fingerprint
  `b06aeed8091465e5e1537c6867bce62253a22b74`.
- Update Android inicial `03464af2-b4e8-4a11-bf58-1e320e1d3b25`; rollback
  validado para o bundle embarcado pelo grupo
  `a35be096-2b4a-482d-a5a8-00263e42d918`; Preview restaurado no grupo
  `45d2dd85-8668-4d6b-908c-e7eb676caa72`.
- O ambiente Production ainda não possui `EXPO_PUBLIC_SENTRY_DSN`,
  `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` nem
  `GOOGLE_SERVICES_JSON`. O AAB não foi iniciado para não contornar esses
  controles nem produzir um artefato sem a observabilidade/push exigidos.
- Esta seção registra preparação técnica. Ela não substitui a rodada em
  aparelhos, os fluxos com JWTs reais, o track interno/fechado nem o relatório
  final de testadores.

## Ordem segura de promoção

1. Aplicar `20260806000000_android_business_operational_cycle.sql` no Supabase de homologação.
2. Regenerar `@cutsync/database` a partir do schema homologado e repetir typecheck/testes.
3. Publicar `dispatch-business-notifications` e configurar o agendamento autenticado por `NOTIFICATION_DISPATCH_SECRET`.
4. Provisionar o aplicativo Firebase Android `com.cutsync.business`, baixar o
   `google-services.json` cliente e cadastrá-lo em cada ambiente EAS como file
   variable `GOOGLE_SERVICES_JSON`. O arquivo não é versionado.
5. Cadastrar separadamente a service account administrativa FCM v1 nas
   credenciais EAS. Essa chave privada nunca entra no repositório nem no bundle.
6. Configurar `EXPO_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT` e
   `SENTRY_AUTH_TOKEN` nos ambientes EAS aplicáveis. O token deve usar
   visibilidade Sensitive para que o upload local de sourcemaps de Update possa
   executá-lo sem registrar seu valor.
7. Gerar Development build, APK Preview e AAB Production nesta ordem.
8. Validar EAS Update no canal Preview, upload dos sourcemaps, rollback para o
   update anterior e rollback para o bundle embarcado.
9. Enviar o AAB ao track interno; somente depois da rodada interna, promover para teste fechado.
10. Manter `mobile_app_release_policies.enforcement_enabled = false` até o AAB correspondente estar visível para todos os testadores-alvo.

O perfil Preview define `SENTRY_DISABLE_AUTO_UPLOAD=true` para que a ausência
temporária das credenciais administrativas do Sentry não impeça a geração do
APK interno. A instrumentação e a sanitização permanecem ativas no aplicativo.
Production não define essa exceção: o AAB falha de forma explícita até
`SENTRY_ORG`, `SENTRY_PROJECT` e `SENTRY_AUTH_TOKEN` estarem provisionados, e o
aceite exige repetir o Preview sem a exceção para comprovar o sourcemap.

`GOOGLE_SERVICES_JSON` aponta para o arquivo cliente do Firebase, não para a
service account FCM v1. Em EAS Build, use uma file variable com visibilidade
Secret. Para prebuild ou build local com push, defina a mesma variável para um
caminho local fora do repositório; variáveis Secret do EAS não podem ser lidas
por `env:exec` na máquina do desenvolvedor. A configuração dinâmica omite
`android.googleServicesFile` quando a variável não existe, portanto comandos de
configuração e testes sem Firebase continuam funcionando.

## Comandos locais

A pasta `apps/business/android` é um artefato local de Continuous Native Generation e permanece ignorada pelo Git. Isso também permite que o Expo resolva `runtimeVersion.policy = appVersion` como projeto managed mesmo depois do prebuild local. Antes de regenerá-la, preserve fora do repositório qualquer ajuste nativo legítimo e confira o resultado do prebuild.

```powershell
Push-Location apps/business
npx expo prebuild --platform android --no-install
git check-ignore android/app/build.gradle
npm run env:validate:development
npx eas-cli@21.4.0 env:exec development "npx expo run:android"
Pop-Location
```

Para validar push no build local, defina antes de `prebuild` um caminho fora do
Git, por exemplo `$env:GOOGLE_SERVICES_JSON = 'C:\caminho-seguro\google-services.json'`.
Não use prefixo `EXPO_PUBLIC_` e não copie a service account administrativa para
esse caminho.

Validação local e artefatos EAS:

```powershell
npm run typecheck:shared
npm run typecheck:business
npm run lint:business
npm run eas:business:preview
npm run eas:business:production
```

## Barreira de runtime e Update

`runtimeVersion.policy = appVersion` só protege binários quando `expo.version`
é incrementada. `autoIncrement: true` no perfil Production incrementa o
`versionCode` da Play Store, não a versão semântica usada como runtime.

Antes de gerar um novo binário, qualquer alteração em dependência nativa,
plugin, `app.json`, `app.config.js` ou configuração Android exige:

1. incrementar explicitamente `expo.version` em `apps/business/app.json`;
2. executar `npx expo config --type prebuild` dentro de `apps/business` e
   registrar a versão/runtime;
3. gerar e disponibilizar o novo APK/AAB antes de publicar Update para esse
   runtime;
4. recusar publicação se o bundle depender de código nativo ausente no binário.

Publicação Preview e upload de sourcemaps, a partir da raiz do repositório:

```powershell
Push-Location apps/business
npx eas-cli@21.4.0 update --channel preview --environment preview --message "Homologação Android"
npx eas-cli@21.4.0 env:exec preview "npx sentry-expo-upload-sourcemaps dist" --non-interactive
Pop-Location
```

O segundo comando precisa terminar com sucesso antes de considerar o Update
observável. Registre o Update ID e confirme no Sentry que uma falha de teste
aponta para arquivo e linha originais sem PII.

Publicação da Edge Function, após configurar secrets no projeto correto:

```powershell
npx supabase functions deploy dispatch-business-notifications --no-verify-jwt
```

## Evidência local atual — 1 de agosto de 2026

- `expo prebuild` regenerou o Android com Expo Updates ativo, URL do projeto EAS,
  runtime nativo `0.1.0` e canal de notificações `operations`.
- `:app:assembleDebug -PreactNativeArchitectures=x86_64` passou com 548 tarefas;
  o APK local tem 95.373.347 bytes e SHA-256
  `680F241206DDA5E9A5F0B57070A3EF17CE81F56974FAB341DAD3213E063467F0`.
- O APK foi instalado no AVD `Medium_Phone`, Android 16/API 36, como
  `com.cutsync.business` versão `0.1.0`, `versionCode` 1 e `targetSdk` 36.
- Abertura a frio e reinício carregaram a tela de acesso sem crash. O Metro sem
  variáveis EAS exibiu o estado fail-closed de ambiente não configurado.
- O empacotamento debug com todas as ABIs excedeu o heap Gradle local de 2 GB;
  isso não substitui nem invalida o APK Preview/AAB gerados pelo EAS. Preview,
  Production, push real, Sentry remoto, papéis reais e aparelho físico seguem
  pendentes.

## Evidências obrigatórias

- ID e timestamp da migração aplicada em homologação.
- Resultado da regeneração de tipos após o schema remoto.
- JWT/papel usado em cada cenário, sem registrar o token.
- IDs de APK Preview e AAB Production, com versão/build/runtime/channel.
- URL/track do Play Console e lista de testadores elegíveis.
- Update ID do Preview, rollback executado e resultado após reinício.
- Ticket e receipt Expo por tipo de push, sem payload pessoal.
- Evento Sentry de teste com release, ambiente, plataforma, operação e correlation ID; o evento não pode conter PII.
- Modelo/aparelho, fabricante, Android, tipo de rede e resultado de cada fluxo.

## Matriz mínima de fluxo real

| Cenário | Owner | Admin | Profissional | Sem vínculo | read_only | blocked |
| --- | --- | --- | --- | --- | --- | --- |
| Detalhe de atendimento | Permitido | Permitido | Só atendimento autorizado | Negado | Consulta permitida | Negado |
| Confirmar/concluir/cancelar/reagendar/no-show | Conforme ações do servidor | Conforme ações do servidor | Só próprio | Negado | Negado | Negado |
| Encaixe | Equipe | Equipe | Só próprio | Negado | Negado | Negado |
| Bloqueios | Equipe | Conforme capability | Só próprio | Negado | Negado | Negado |
| CRM da unidade | Completo | Completo | Sem diretório | Negado | Sem nova exposição | Negado |
| Serviços/equipe | Completo | Sem `manage_admins` | Consulta de serviços | Negado | Sem mutação | Negado |

Para cada mutação crítica, execute também o cenário de resposta perdida: guarde o `request_id`, conclua a primeira chamada, descarte a resposta e repita exatamente a mesma requisição. Deve existir uma única alteração, um único evento operacional e uma única notificação. Repetir a chave com payload diferente deve retornar `idempotency_conflict`.

Para convites, confirme ainda que criação e reenvio compartilham o deep link com
token bruto somente pela ação explícita do usuário, que esse token não aparece
em cache, receipt, logs ou push, que o mesmo `request_id` reproduz o mesmo link
e que um reenvio com novo `request_id` invalida imediatamente o link anterior.

## Matriz Android e rede

- Android 10, 12, 14 e 15 ou atual.
- Samsung, Motorola e Xiaomi, com pelo menos um aparelho físico por marco.
- Wi-Fi, rede móvel, rede lenta, perda de resposta e reconexão.
- Abertura em foreground, background e processo encerrado.
- Teclado, botão voltar, troca de unidade, push e deep link.

## Saída da rodada fechada

O relatório final deve registrar período, participantes, builds, dispositivos, cenários executados, defeitos por severidade, tickets/receipts, eventos Sentry, resultado de Update/rollback e decisão explícita de manter ou não a política de versão obrigatória desativada. Publicação pública não faz parte deste ciclo.
