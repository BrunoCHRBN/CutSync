# Contrato de produto mobile — Android primeiro

Status: aprovado para o primeiro ciclo operacional

Data: 1 de agosto de 2026

## Objetivo e relação com os contratos existentes

Este documento complementa o
[`MULTI_APP_PRODUCT_CONTRACT.md`](./MULTI_APP_PRODUCT_CONTRACT.md) e define as
regras de entrega mobile do ciclo atual. O contrato multiapp continua sendo a
fonte de verdade para a separação dos produtos; este documento prevalece
apenas na plataforma homologada, conectividade, cache, comandos, links,
notificações e distribuição mobile.

Android é a única plataforma móvel de produção e homologação nesta etapa. O
código deve continuar preparado para uma futura entrega iOS, mas APNs, conta
Apple Developer, App Store, TestFlight, artefato iOS e testes em dispositivos
Apple não são entregáveis nem bloqueadores do ciclo atual.

Preparação para iOS significa preservar abstrações multiplataforma, não declarar
suporte ainda inexistente:

- regras de domínio, autorização e dados não podem depender de APIs Android;
- links são interpretados por um roteador comum, com o scheme como configuração
  de cada aplicativo;
- dispositivos de notificação são identificados por aplicativo e plataforma;
- integrações nativas ficam atrás de adaptadores por plataforma;
- componentes devem respeitar safe areas, acessibilidade e dimensões variáveis,
  sem medidas fixas de modelos Android específicos.

## Propriedade de produto e paridade

Paridade significa produzir o mesmo resultado de negócio autorizado, não copiar
telas entre os produtos. Tipos, regras, validações, contratos de dados e
primitivas comprovadamente comuns podem ser compartilhados; navegação, telas e
experiências completas permanecem próprias de cada produto.

| Jornada | Business | Client | Web |
| --- | --- | --- | --- |
| Atendimento | Operação diária por papel: criar encaixe, consultar, confirmar, concluir, cancelar, reagendar e marcar no-show | Criar e gerir os próprios atendimentos conforme a política da unidade | Fluxo público e operação administrativa completa enquanto houver jornada Web ativa |
| Agenda | Hoje, agenda autorizada, bloqueios e folgas | Próximos atendimentos e histórico próprios | Visão ampla, lote e configuração avançada |
| Clientes da unidade | Diretório, cadastro, edição, observações, etiquetas, histórico e merge explícito para owner/admin; acesso mínimo para profissional | Confirmar ou rejeitar o vínculo com uma unidade e consultar vínculos próprios | Gestão em lote e tarefas administrativas densas quando implementadas |
| Serviços | Gestão operacional de catálogo e associação de profissionais | Consulta para descoberta e agendamento | Configuração detalhada e administração em volume |
| Equipe | Convites, memberships, serviços, comissão e acesso conforme capability | Não pertence ao Client | Administração detalhada e jornadas extensas |
| Aquisição e descoberta | Não pertence ao Business | Descoberta e agendamento do consumidor | Landing, páginas públicas e agendamento sem instalação |
| Relatórios e governança | Somente resumos operacionais explicitamente entregues | Não pertence ao Client | Relatórios densos, exportações e governança ainda mantida na Web enquanto não houver migração homologada para o Control privado |
| Assinatura SaaS | Apenas consome o entitlement calculado no servidor; não compra nem exibe checkout | Não pertence ao Client | Contratação e gestão da assinatura do estabelecimento |
| Pagamento de atendimento | Fora deste ciclo | Fora deste ciclo | Fora deste ciclo e separado da assinatura SaaS |

A associação, o papel e as capabilities calculadas pelo backend são
autoritativos. Ocultar uma ação na interface melhora a experiência, mas nunca
substitui RLS ou uma RPC que recalcule a autorização. Os modos `full`,
`read_only` e `blocked` são tratados de forma fail-closed.

`no_show` é um estado operacional terminal de atendimento. Ele não conta como
produção realizada e nunca é convertido implicitamente em receita recebida,
caixa ou lucro.

## Conectividade, cache e sincronização

### Consultas

- O cache mobile é somente em memória neste ciclo.
- Toda chave de consulta inclui, no mínimo, usuário autenticado e
  estabelecimento ativo quando a informação pertence a uma unidade.
- Logout, troca de conta ou troca de unidade elimina o cache anterior antes de
  carregar o novo contexto.
- Consultas podem repetir após falhas transitórias com backoff limitado. Erros
  de autenticação, autorização, validação ou regra de negócio não são repetidos
  como se fossem falhas de rede.
- Reconexão e retorno ao foreground revalidam as consultas ativas.
- Uma leitura previamente carregada pode continuar visível como dado
  possivelmente desatualizado, mas não autoriza uma mutação offline.

### Comandos

Não existe fila offline de mutações neste ciclo. Criar, confirmar, concluir,
cancelar, reagendar ou marcar no-show; criar ou alterar bloqueios; alterar
clientes, vínculos, serviços, equipe ou permissões; e qualquer ação que reserve
horário exigem conexão e confirmação do backend.

Mutações não têm repetição automática no cliente. Quando a resposta puder ter
sido perdida, a interface oferece nova tentativa explícita usando o mesmo
`request_id`; nunca cria uma segunda intenção silenciosa.

### Realtime

Realtime é um sinal de invalidação:

```text
evento Realtime -> invalidar chave -> consultar RPC autorizada -> atualizar UI
```

O payload bruto de Realtime não é inserido diretamente no cache e não é fonte
definitiva para dados pessoais, observações, preços ou autorização.

## Idempotência e histórico operacional

Todo novo comando mobile crítico recebe um `request_id` UUID, criado antes da
primeira tentativa e preservado nas repetições da mesma intenção.

O backend deve, na mesma transação da mutação:

1. autenticar o ator e recalcular sua capability no estabelecimento;
2. bloquear as entidades relevantes para impedir corrida;
3. normalizar a requisição e calcular seu hash;
4. criar ou consultar o receipt pelo `request_id`;
5. executar a transição válida e registrar seu evento operacional;
6. gravar uma resposta mínima e segura para eventual repetição.

Mesma chave e mesmo hash devolvem o resultado já concluído sem repetir efeito,
evento ou notificação. Mesma chave com hash diferente retorna
`idempotency_conflict`. As tabelas de receipts não são consultáveis diretamente
pelos aplicativos, e a resposta persistida não contém nomes, contatos,
observações, tokens ou payloads financeiros.

`appointment_events` mantém histórico operacional imutável e separado dos logs
de autorização. Idempotência de suporte já homologada não é migrada
retroativamente para `command_receipts` neste ciclo.

## Deep links

Schemes canônicos:

- Business: `cutsync-business://`;
- Client: `cutsync://`.

Destinos habilitados neste ciclo:

- Business: convite e detalhe de atendimento por identificador;
- Client: atendimento, chamado de suporte, estabelecimento e solicitação de
  vínculo por identificador ou slug compatível com a rota.

Pagamentos, transferências, promoções, importações, lista de espera e demais
destinos futuros podem ser reservados no registro tipado, mas devem retornar
“recurso indisponível” até a jornada correspondente existir. Um link nunca pode
abrir uma tela-placeholder como se a operação estivesse disponível.

Na abertura fria, em background ou em foreground, o aplicativo deve:

1. restaurar a sessão;
2. validar scheme, rota e formato do identificador;
3. buscar o recurso no backend;
4. recalcular acesso e capability;
5. navegar somente para o recurso autorizado ou apresentar recusa segura.

Tokens de autenticação, convite e recuperação nunca são registrados em logs,
analytics ou breadcrumbs. URLs estáveis são validadas em Development, Preview
ou Production builds; o endereço produzido pelo Expo Go não faz parte do
contrato de homologação. Consulte a documentação do
[Expo Linking para SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/linking/).

O token bruto de um convite Business é segredo de uso único ou rotacionável:
ele é devolvido somente na resposta imediata de criação/reenvio e mantido apenas
em memória até o compartilhamento iniciado pelo usuário. Banco, receipts,
cache de queries, push e listagens persistem somente o hash ou o identificador
do convite. Repetir o mesmo comando idempotente devolve o mesmo token derivado;
reenviar com novo `request_id` invalida o token anterior antes de emitir outro.

## Notificações

O transporte atual é Expo Push Service sobre FCM. APNs fica fora do ciclo.
Cada token pertence a usuário, aplicativo, plataforma e instalação; rotação,
logout, revogação e receipts inválidos devem desativar o registro correspondente
sem afetar tokens de outro aplicativo.

No Business, o consentimento de push é por instalação. O opt-in registra ou
reativa um `push_devices` com `app_kind = 'business'`; o opt-out desativa esse
dispositivo, sem alterar outros aparelhos ou o Client. A fila Business consulta
`app_kind` e `enabled` e não usa `profiles.notification_channels`, pois esse
campo representa a preferência de canais do Client em nível de perfil. No
Client, a preferência global de push e o dispositivo Client ativo continuam
sendo requisitos separados para a entrega.

No Android, o canal de notificação é criado antes da solicitação do token. O
push contém somente tipo de evento e identificadores mínimos. Ao tocar nele, o
aplicativo segue a mesma restauração de sessão, consulta e autorização dos deep
links; texto do push e payload recebido nunca são fonte de verdade.

No Business, o `google-services.json` cliente é fornecido por file variable EAS
`GOOGLE_SERVICES_JSON` e não é versionado. Essa configuração pública do
aplicativo Firebase é distinta da service account administrativa FCM v1, que
fica somente nas credenciais EAS e nunca é incorporada ao aplicativo.

Eventos deste ciclo:

- Business: novo atendimento, cancelamento, alteração de horário, convite e
  conflito operacional;
- Client: confirmação, cancelamento, reagendamento, no-show e solicitação de
  vínculo.

Fila, worker e receipts impedem envios duplicados e permitem reconciliar falhas.
Nenhum push, breadcrumb ou evento de observabilidade inclui nome, telefone,
e-mail, observação, token ou conteúdo financeiro. Consulte a documentação do
[Expo Notifications para SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/).

## Observabilidade e privacidade

Client e Business identificam no Sentry release, ambiente, versão, plataforma,
operação e correlation/request ID. Erros de RPC, link, push, conectividade e
update são classificados sem anexar a requisição bruta.

Antes do envio, eventos e breadcrumbs removem nomes, contatos, observações,
tokens, dados de autenticação, documentos e payloads financeiros. O correlation
ID serve para unir aplicativo, RPC, receipt e worker; ele não pode conter um
identificador pessoal derivado.

Todo EAS Update publicado deve ter seus sourcemaps enviados ao Sentry antes da
homologação, preservando frames de arquivo/linha enquanto mensagens, payloads e
demais campos livres continuam sanitizados.

## Versionamento, atualização e compatibilidade

Client e Business mantêm projetos EAS, binários e ciclos independentes, usando
os ambientes `development`, `preview` e `production` definidos em
[`MOBILE_ENVIRONMENT_MATRIX.md`](./MOBILE_ENVIRONMENT_MATRIX.md).

- `runtimeVersion.policy` é `appVersion`.
- Alteração nativa exige incremento manual de `expo.version`; o incremento
  automático de `versionCode` da Play Store não altera esse runtime.
- Cada build aponta para o canal do seu ambiente.
- Uma correção JavaScript compatível com o runtime pode usar EAS Update.
- Alteração de código ou configuração nativa exige nova versão do aplicativo e
  novo binário; não pode ser entregue ao runtime anterior.
- O rollback operacional deve cobrir o update publicado anteriormente e o
  bundle embarcado no binário.
- O backend fornece a política mínima por aplicativo e plataforma. A atualização
  obrigatória começa desativada e só pode ser ativada depois que o AAB
  correspondente estiver acessível ao grupo de teste.
- A resposta de versão mínima não concede entitlement nem substitui autorização.

Contratos backend evoluem de forma aditiva enquanto existirem binários
suportados. Uma alteração incompatível exige RPC/versão paralela, tipos
compartilhados atualizados, telemetria de adoção e retirada explícita do binário
antigo antes de remover o contrato anterior. Os tipos do Supabase só são
regenerados depois que o schema do ambiente de homologação tiver sido aplicado
e validado.

A política `appVersion` limita updates a binários de runtime compatível. Consulte
[Expo Updates para SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/updates/)
e o [procedimento de rollback](https://docs.expo.dev/eas-update/rollbacks/).

## Exclusões do primeiro ciclo

Permanecem fora do ciclo: pagamentos de atendimentos, garantia, promoções,
transferências, migração/importação, inbox persistente, jornadas recorrentes e
configurações operacionais amplas. Image Picker e Document Picker não são
adicionados sem uma jornada entregue que os use.

Também estão fora:

- qualquer superfície de compra da assinatura SaaS no Business;
- tratar produção realizada ou comissão projetada como receita recebida, caixa
  ou lucro;
- ativar implicitamente a cobrança obrigatória — `enforcement_enabled`
  permanece `false` durante beta/cortesia;
- fila offline de comandos;
- APNs, build iOS, TestFlight, App Store e homologação Apple;
- publicação pública na Play Store.

## Definição de pronto

### Por funcionalidade

Uma funcionalidade mobile está pronta para compor o ciclo somente quando:

- a regra vive no backend, com ownership/capability, RLS/RPC e falha fechada;
- comandos críticos são transacionais, idempotentes e auditáveis;
- consultas e erros possuem contratos tipados;
- loading, vazio, erro, sucesso, rede lenta e reconexão estão tratados;
- Realtime invalida e refaz a leitura autorizada;
- push e deep link existem quando o evento abre uma jornada entregue;
- unitários e testes SQL cobrem regra, papel e isolamento entre unidades;
- o fluxo foi repetido no Supabase de homologação com sessões JWT reais dos
  papéis afetados;
- não há regressão conhecida em Client ou Web e qualquer lacuna está registrada.

### Para encerrar o ciclo Android-first

Além dos critérios por funcionalidade, o ciclo exige evidência de:

- typecheck e lint dos aplicativos e pacotes afetados, sem novos erros;
- Development build executado em Android real ou emulador;
- APK Preview instalável e AAB Production aceito pela Play Store, publicado
  apenas em track interno e depois fechado;
- sessão, retorno do background, abertura fria, push e deep links Android;
- Wi-Fi, rede móvel, rede lenta, interrupção, reconexão e resposta perdida após
  comando concluído, repetindo o mesmo `request_id` sem duplicação;
- Android 10, 12, 14 e 15 ou versão atual, incluindo ao menos Samsung, Motorola,
  Xiaomi e um aparelho físico por marco;
- EAS Update compatível em Preview, rollback para update anterior ou bundle
  embarcado e recusa de update quando a versão nativa divergir;
- receipts de push, erros sanitizados no Sentry e fluxos reais de owner, admin,
  profissional e usuário sem vínculo;
- relatório da rodada fechada na Play Store.

Build, análise estática e documentação não substituem homologação autenticada e
interativa. Ausência de evidência iOS não bloqueia nenhum item acima.
