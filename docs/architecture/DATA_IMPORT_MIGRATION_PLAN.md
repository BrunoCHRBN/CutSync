# Migração entre plataformas — plano do motor de importação

Status: planejado

Data da verificação: 2026-08-01

Pré-requisito: [`ESTABLISHMENT_CLIENTS_PLAN.md`](./ESTABLISHMENT_CLIENTS_PLAN.md)

## 1. Objetivo

Permitir que um estabelecimento saia de outra plataforma e comece a operar no
CutSync sem perder carteira de clientes, catálogo de serviços e agenda futura.

Fluxo completo pretendido:

```text
Web ou Business
      ↓
Storage privado
      ↓
Motor de importação
      ↓
Normalização
      ↓
Validação
      ↓
Prévia
      ↓
Confirmação
      ↓
Clientes, serviços, agenda e histórico
```

O mesmo motor atende Web e Business. Toda regra vive no banco e nos pacotes
compartilhados; as aplicações apenas enviam arquivo e apresentam resultado.

## 2. Restrições herdadas do backend atual

Estas restrições não são negociáveis e moldam o desenho do importador.

| Restrição | Origem | Consequência |
| --- | --- | --- |
| `appointments` não aceita escrita direta de `authenticated` | `REVOKE INSERT, UPDATE, DELETE` | Importação precisa de RPC `SECURITY DEFINER` própria |
| Exclusão GiST impede sobreposição por profissional | `appointments_no_professional_overlap` | Conflito de agenda é erro de banco; precisa ser detectado na prévia, não na confirmação |
| `create_appointment` exige horário futuro e slot disponível | `create_appointment_before_schedule_blocks` | Histórico e importação não podem reutilizar essa função |
| Profissional precisa ser membro ativo | validação de `memberships` | Importar horário de profissional inexistente é impossível por desenho |
| `service_id` é `TEXT` e `price` é `NUMERIC(10,2)` | `services` | O contrato canônico usa centavos e converte na fronteira |
| Push é disparado por trigger na criação de agendamento | `enqueue_client_appointment_push_trigger` | Importação precisa suprimir notificação explicitamente |
| Comandos móveis já têm idempotência | `claim_mobile_command` | O importador reaproveita o padrão em vez de inventar outro |

## 3. Escopo do MVP

### 3.1 Incluído

Importação de CSV e XLSX cobrindo clientes, serviços, relacionamento de
profissionais existentes, agendamentos futuros e bloqueios de agenda; prévia
antes de aplicar; detecção de duplicidade e conflito; idempotência; relatório de
resultado; acompanhamento no Web e no Business; modelos para as plataformas
prioritárias.

### 3.2 Fora do primeiro lançamento

Sincronização permanente; importação por login e senha da plataforma
concorrente; captura de tela; criação de contas para profissionais importados;
campanhas automáticas; dados financeiros e fiscais; histórico completo sem
homologação; conectores de API.

O MVP é uma **migração operacional**: clientes, serviços, profissionais
relacionados e agenda futura.

## 4. Fase 0 — Viabilidade e contrato canônico

Duração estimada: 1 a 2 semanas.

Antes de escrever o importador é preciso definir como o CutSync decide se um
arquivo pode ser migrado.

### 4.1 Contrato canônico

Nenhum código específico de plataforma toca as tabelas do CutSync. Tudo passa
por um formato único, definido em `packages/domain/src/data-import.ts`.

```ts
interface CanonicalClient {
  externalId?: string;
  name: string;
  phone?: string;
  email?: string;
  birthDate?: string;
  notes?: string;
  sourceProvider: string;
}

interface CanonicalService {
  externalId?: string;
  name: string;
  durationMinutes?: number;
  priceInCents?: number;
}

interface CanonicalAppointment {
  externalId?: string;
  clientExternalId?: string;
  clientName?: string;
  professionalExternalName: string;
  serviceExternalName?: string;
  startsAt: string;
  endsAt?: string;
  status: string;
  notes?: string;
}
```

```text
Arquivo Trinks ─┐
Arquivo Booksy ─┼─→ formato canônico → validação → banco CutSync
Planilha livre ─┘
```

### 4.2 Matriz de compatibilidade

```text
provider_import_profiles
- id
- provider_key
- provider_name
- template_version
- supported_formats
- supported_entities
- instructions
- status
- last_validated_at
```

Exemplo de registro:

```json
{
  "providerKey": "trinks",
  "supportedFormats": ["csv", "xlsx"],
  "supportedEntities": {
    "clients": "full",
    "services": "partial",
    "professionals": "mapping_required",
    "futureAppointments": "full",
    "history": "assisted"
  }
}
```

### 4.3 Classificação do resultado

| Resultado | Significado |
| --- | --- |
| Migração completa | Dados operacionais e histórico disponíveis |
| Migração operacional | Clientes e agenda futura disponíveis |
| Migração parcial | Apenas clientes ou bloqueios de calendário |
| Migração assistida | Arquivo exige configuração pela equipe |
| Não compatível | Dados insuficientes ou arquivo inválido |

A avaliação apresentada ao estabelecimento após o envio:

```text
Compatibilidade: 87%

Clientes: completa
Serviços: completa
Profissionais: precisam ser relacionados
Agenda futura: completa
Histórico: parcial

3 bloqueios encontrados
12 registros precisam de revisão
```

### 4.4 Critérios para anunciar uma plataforma como compatível

Existem arquivos reais de exemplo; os campos necessários foram identificados;
datas e horários são interpretáveis sem ambiguidade; o estabelecimento pode
exportar legitimamente; reimportar não gera duplicidade; a taxa de mapeamento
automático supera o limite definido; existem testes com arquivos de referência;
plataforma e versão do modelo estão registradas.

Entregáveis da fase: contrato canônico publicado, matriz de compatibilidade,
três a cinco arquivos reais anonimizados, política de suporte por plataforma e
decisão sobre as plataformas prioritárias.

## 5. Fase 1 — Fundação do motor

Duração estimada: 2 a 3 semanas.

### 5.1 Tabelas

```text
data_import_jobs
- id, establishment_id, provider_key, import_mode, status, created_by
- total_rows, valid_rows, warning_rows, invalid_rows, imported_rows
- started_at, completed_at

data_import_files
- id, job_id, storage_path, original_name, mime_type, file_size, sha256, entity_type

data_import_rows
- id, job_id, file_id, row_number, raw_payload, normalized_payload
- entity_type, validation_status, errors, warnings

data_import_mappings
- job_id, source_column, destination_field, transformation, confidence, confirmed_by

data_import_conflicts
- id, job_id, import_row_id, conflict_type, candidate_entity_ids, resolution, resolved_by

external_entity_mappings
- establishment_id, provider_key, entity_type, external_id, cutsync_entity_id
- source_hash, imported_at

data_import_changes
- job_id, entity_type, entity_id, operation, previous_value, imported_value, rollback_status
```

Todas com RLS por `establishment_id` e leitura condicionada a
`manage_data_imports`. `data_import_rows` guarda o payload bruto e é purgada
junto com o arquivo ao fim da retenção.

### 5.2 Máquina de estados

```text
draft → uploaded → analyzing → review_required → ready → importing → completed
                                                                  ├→ completed_with_warnings
                                                                  ├→ failed
                                                                  └→ cancelled
```

Transições inválidas são recusadas no banco. Um job não pode ir de `uploaded`
direto para `completed`. A máquina vive em `packages/domain/src/data-import.ts`
e é espelhada por CHECK constraint e função de transição em SQL.

### 5.3 Storage

Bucket privado novo, no padrão dos buckets `governance-*` já existentes:

```text
data-imports/{establishment_id}/{job_id}/{file_id}.xlsx
```

Requisitos: não público; URL assinada temporária; acesso restrito à unidade;
verificação de MIME; limite de tamanho; hash do arquivo registrado; remoção
automática após a retenção; bloqueio de executáveis; autoria registrada.

### 5.4 Processamento assíncrono

O upload não processa. A análise roda fora da requisição, em lotes de 250 a
1.000 linhas calibrados sob carga.

```text
Upload → criação do job → fila de análise → processamento em lotes → progresso
```

Como o repositório já usa Edge Functions em `supabase/functions/`, a análise
deve ser implementada ali, com retomada por lote e escrita incremental de
progresso em `data_import_jobs`.

Definição de pronto: upload não bloqueia a interface; a análise ocorre no
servidor; o job pode ser retomado; falha parcial não deixa dado definitivo
incompleto; o progresso é consultável por Web e Business; reenviar o mesmo
arquivo não cria segunda importação silenciosa.

## 6. Fase 2 — Parser, normalização e qualidade

Duração estimada: 1 a 2 semanas.

Ordem dos formatos: CSV, XLSX, ICS. XLS legado só sob demanda comprovada.

| Domínio | Regra |
| --- | --- |
| Telefone | `(11) 99999-9999`, `11999999999`, `+55 11 99999-9999` → `+5511999999999`, preservando o original |
| E-mail | `CARLOS@EXEMPLO.COM` → `carlos@exemplo.com` |
| Datas | `31/07/2026`, `2026-07-31`, serial do Excel, data e hora em colunas separadas, sempre no fuso do estabelecimento |
| Valores | `R$ 85,90` → `8590` centavos |
| Status | Agendado → `confirmed`; Aguardando → `pending`; Finalizado → `completed`; Cancelado → `cancelled`; Não compareceu → `no_show` |
| Nomes | Espaços excedentes removidos, original preservado, busca sem acento e sem distinção de caixa, nenhuma união por nome |

A normalização reutiliza os helpers criados em
`packages/validation/src/establishment-client.ts` — não pode existir uma segunda
implementação de telefone no importador.

Mapeamento sugerido automaticamente, sempre confirmável:

```text
Nome completo → client.name
Celular       → client.phone
Colaborador   → professional.externalName
Procedimento  → service.name
Data/Hora     → appointment.startsAt
Valor cobrado → appointment.price
```

Definição de pronto: cada erro aponta a linha original; o usuário entende por
que a linha falhou; o arquivo original não é alterado; datas não deslocam de
fuso silenciosamente; valores em reais não sofrem erro de vírgula; arquivos
conhecidos têm teste de referência.

## 7. Fase 3 — Regras por entidade

Duração estimada: 2 semanas.

Ordem obrigatória de importação:

```text
1. Clientes
2. Serviços
3. Relacionamento dos profissionais
4. Agendamentos futuros
5. Bloqueios de agenda
6. Histórico (fase posterior)
```

### 7.1 Clientes

Precedência de correspondência: `external_id` já importado; perfil já vinculado;
telefone verificado ou normalizado; e-mail normalizado; nome com telefone como
candidato a revisão; **nome isolado nunca gera união automática**.

Ações disponíveis por linha: criar novo, atualizar existente, manter separado,
unificar, ignorar.

A importação não sobrescreve informação mais confiável. Exemplo:

```text
CutSync: Maria, telefone confirmado
Arquivo: Maria, telefone vazio

Resultado: preserva o telefone confirmado
```

Consentimento promocional entra sempre como `unknown`. Uma coluna genérica de
autorização no arquivo só é migrada quando a informação é clara, tem origem e
data, o estabelecimento assume a evidência e os termos do CutSync cobrem o caso.

### 7.2 Serviços

Comparação por nome, duração, preço e código externo. Ações: relacionar a
serviço existente, criar novo, ignorar.

### 7.3 Profissionais

Nenhuma conta de autenticação fictícia é criada. A função de agendamento exige
membro ativo, e essa proteção não será relaxada.

```text
"João C." da plataforma antiga → João Carlos no CutSync
```

Quando o profissional não existe, a importação de horários futuros daquele
profissional é bloqueada com a mensagem: “Convide ou cadastre o profissional
antes de importar os horários futuros.”

Para funcionários antigos presentes apenas no histórico, uma fase posterior
adotará `legacy_professional_name` ou um modelo de profissional arquivado sem
acesso à conta.

### 7.4 Agendamentos futuros

RPC administrativa nova, `import_future_appointment`, que exige
`manage_data_imports`, valida estabelecimento, profissional e serviço, usa
`establishment_client_id`, mantém o status original permitido, aplica duração,
impede sobreposição, registra o job, suprime notificação até a confirmação final
e garante idempotência por `external_entity_mappings`.

A supressão de push exige um sinal explícito lido pelo trigger de notificação —
não basta “não chamar” o disparo, porque ele é acionado pelo próprio `INSERT`.

Web e Business nunca inserem diretamente em `appointments`.

### 7.5 Conflitos de agenda

```text
Horário original: 31/07/2026 às 14:00
Profissional: João
Conflito CutSync: 14:00–14:45
```

Resoluções: ignorar o registro, escolher outro profissional, escolher outro
horário, converter em bloqueio, manter apenas no relatório, cancelar a
importação. **Não existe botão de “forçar todos” para agendamentos futuros.**

### 7.6 Histórico

`import_historical_appointment`, em fase posterior: aceita datas passadas e os
status `completed`, `cancelled` e `no_show`; não afeta disponibilidade; não
dispara notificação nem cobrança; não recalcula comissão; preserva valores e
nomes como snapshot; registra que a origem foi migração.

Definição de pronto da fase: repetir o job não duplica cliente nem horário;
conflito é detectado antes da confirmação; nenhuma notificação sai durante a
simulação; agendamento futuro respeita as mesmas proteções do CutSync;
histórico não interfere na agenda presente; nenhum profissional falso é criado.

## 8. Fase 4 — Assistente Web

Duração estimada: 2 semanas.

```text
apps/web/src/features/data-imports/
  components/
  hooks/
  screens/
  services/
  types/
```

| Tela | Conteúdo |
| --- | --- |
| 1 — Origem | Plataforma conhecida, planilha própria, calendário, outra plataforma |
| 2 — Instruções | Como exportar na plataforma escolhida |
| 3 — Upload | Arrastar e soltar, múltiplos arquivos, tipo por arquivo |
| 4 — Mapeamento | Associação de colunas em tabela ampla |
| 5 — Relacionamentos | Profissionais, serviços, unidades, status |
| 6 — Duplicados | Candidatos com nível de confiança |
| 7 — Conflitos | Horários incompatíveis e registros inválidos |
| 8 — Prévia | Contagem por operação |
| 9 — Confirmação | Confirmação explícita |
| 10 — Resultado | Resumo, erros, avisos, relatório, correção e reenvio, reversão |

Exemplo de prévia:

```text
524 clientes serão criados
31 clientes serão atualizados
18 serviços serão criados
142 agendamentos serão importados
9 agendamentos serão ignorados
12 registros precisam de revisão
```

## 9. Fase 5 — Business mobile

Duração estimada: 1 a 2 semanas.

O Business usa o mesmo backend, sem reproduzir o editor de planilhas: selecionar
plataforma, escolher arquivo no aparelho, enviar, acompanhar a análise, ver
resumo, resolver associações simples, confirmar importações prontas, receber
notificação de conclusão e abrir o Web para mapeamentos complexos.

O aplicativo ainda não possui seletor de documentos. Será necessário adicionar a
dependência apropriada do Expo SDK 57 para escolher CSV, XLSX e ICS em Android e
iOS, consultando a documentação versionada antes de implementar.

Operações da camada de API, seguindo `callBusinessRpc` e a tradução de erro já
usada em `apps/business/src/features/`:

```text
createImportJob()
uploadImportFile()
getImportJob()
listImportJobs()
getImportSummary()
resolveSimpleConflict()
confirmImport()
cancelImport()
```

Mensagem para arquivo desconhecido: “O arquivo foi enviado, mas requer
associação avançada de colunas. Continue no Web.”

## 10. Fase 6 — Segurança, LGPD e governança

Executada junto das demais fases, não ao final.

Cliente importado pertence ao estabelecimento; nenhuma conta CutSync é criada;
não há vínculo por coincidência de e-mail ou telefone não verificado; clientes
não são compartilhados entre estabelecimentos; consentimento de marketing nunca
é marcado automaticamente; a origem dos dados é preservada; correção e exclusão
são possíveis; quem importou e qual arquivo foi usado ficam registrados; o
arquivo bruto tem retenção limitada; exportações são controladas; profissional
sem permissão não baixa a base.

Eventos auditados: job criado, arquivo enviado, mapeamento alterado, conflito
resolvido, importação confirmada, registro criado, registro atualizado, rollback
solicitado. A auditoria usa a infraestrutura existente de
`authorization_audit_log` e `appointment_events`.

## 11. Fase 7 — Reversão

Projetada desde o início, não acrescentada depois.

Reversão automática é permitida quando o registro foi criado exclusivamente pelo
job, não foi modificado depois, não recebeu novo agendamento, não foi vinculado
manualmente e não participou de operação posterior.

Quando o cliente importado já agendou de novo, foi editado, foi vinculado a uma
conta, recebeu observações ou foi usado em outra operação, o sistema **gera um
plano de correção** em vez de apagar.

Estratégia padrão: não sobrescrever dado existente; registrar `previous_value`;
identificar cada entidade pelo job; permitir cancelamento antes da aplicação;
liberar rollback por tempo limitado; produzir relatório mesmo em rollback parcial.

## 12. Fase 8 — Testes

| Camada | Cobertura |
| --- | --- |
| Unitário | Telefone, e-mail, datas brasileiras, serial do Excel, valores monetários, status, correspondência aproximada, idempotência, máquina de estados |
| SQL | RLS de clientes e de jobs, capacidades, conflito de agenda, isolamento entre estabelecimentos, importação em unidade alheia, repetição do mesmo `external_id` |
| Integração | Upload → análise → prévia → confirmação, falha no meio do lote, reprocessamento, cancelamento, rollback, arquivo de dez mil linhas, arquivo malformado, datas em fusos distintos |
| Ponta a ponta (Web) | Plataforma conhecida, arquivo desconhecido, correção de mapeamento, resolução de conflito, confirmação |
| Ponta a ponta (Business) | Seleção de arquivo, acompanhamento, aprovação simples, redirecionamento ao Web, notificação |

Fixtures versionadas e anonimizadas:

```text
tests/fixtures/imports/
  generic/
  trinks/
  agendapro/
  booksy/
  calendars/
```

Cada alteração em um modelo de plataforma reexecuta esses testes.

## 13. Fase 9 — Piloto controlado

Duração estimada: 2 semanas.

Primeiro uma importação interna com dados fictícios, formatos variados, grande
volume e conflitos intencionais. Depois três estabelecimentos piloto: um
pequeno, um médio e um com volume elevado ou muitos profissionais.

Procedimento: receber arquivos, anonimizar amostras, simular, comparar contagens,
corrigir mapeamentos, importar em homologação, aprovar com o estabelecimento,
cortar em produção e acompanhar por sete dias.

Indicadores: tempo de migração, percentual mapeado automaticamente, clientes
duplicados, agendamentos rejeitados, conflitos, correções manuais, chamados de
suporte, atividade após a migração e conversão de teste para plano ativo.

## 14. Fase 10 — Conectores nativos

Somente após o MVP e os pilotos. Antes disso, registrar demanda:

```text
migration_provider_requested
migration_started
migration_completed
migration_abandoned
```

Priorização por volume de interessados × taxa de conversão × qualidade da API ÷
custo de manutenção. Ordem provável: Google Calendar, Outlook/Microsoft 365, a
plataforma com mais arquivos importados, a segunda mais frequente, APIs de
parceiros.

Os conectores usam o mesmo contrato canônico, de modo que a origem mude sem
alterar a lógica final:

```text
CSV ─────────────┐
XLSX ────────────┤
Google API ──────┼→ formato canônico → motor CutSync
API plataforma ──┘
```

## 15. Sequência de PRs

| # | PR |
| --- | --- |
| 1 | `domain: add canonical import contracts and state machine` |
| 2 | `database: add data import foundation tables and rls` |
| 3 | `storage: add private data-imports bucket policies` |
| 4 | `functions: add csv analysis worker` |
| 5 | `functions: add xlsx analysis worker` |
| 6 | `functions: add normalization and validation pipeline` |
| 7 | `database: add external entity mappings and idempotency` |
| 8 | `database: add future appointment import rpc` |
| 9 | `web: add migration wizard` |
| 10 | `business: add migration upload and status` |
| 11 | `testing: add import fixtures and sql coverage` |
| 12 | `migration: add first provider templates` |
| 13 | `migration: add rollback controls` |
| 14 | `observability: add import metrics and alerts` |
| 15 | `release: enable controlled pilot feature flag` |

## 16. Marcos de liberação

| Marco | Conteúdo |
| --- | --- |
| 1 — Base pronta | Carteira por estabelecimento consolidada (documento irmão) |
| 2 — Migração genérica interna | CSV, análise, mapeamento, prévia, clientes e serviços |
| 3 — Migração operacional | Profissionais relacionados, agenda futura, conflitos, idempotência, relatório |
| 4 — Produto disponível | Assistente Web, fluxo Business, modelos de plataforma, auditoria, rollback, piloto aprovado |
| 5 — Expansão | ICS, histórico, Google e Outlook, APIs específicas, multiunidade, migração assistida como serviço |

## 17. Estimativa

| Etapa | Estimativa |
| --- | --- |
| Viabilidade e contrato canônico | 1–2 semanas |
| Clientes por estabelecimento (documento irmão) | 3–4 semanas |
| Fundação do importador | 2–3 semanas |
| Parsers e normalização | 1–2 semanas |
| Regras de migração | 2 semanas |
| Web | 2 semanas |
| Business mobile | 1–2 semanas |
| Testes, piloto e correções | 2–3 semanas |

Total sequencial estimado: 14 a 20 semanas. Com duas frentes em paralelo —
banco e domínio de um lado, interfaces do outro — o MVP fica entre 10 e 14
semanas, desde que os arquivos reais das plataformas estejam disponíveis desde
o início.

## 18. Decisão arquitetural

```text
Clientes por estabelecimento
        ↓
Novo contrato de agendamentos
        ↓
Motor canônico de importação
        ↓
CSV/XLSX
        ↓
Prévia e conflitos
        ↓
Migração operacional
        ↓
Web e Business
        ↓
Pilotos
        ↓
Histórico e APIs nativas
```

A primeira entrega de valor não tenta migrar tudo. Ela garante que o
estabelecimento comece no CutSync com a carteira de clientes, os serviços e os
próximos agendamentos preservados. Essa combinação remove a principal barreira
de troca de plataforma sem pagar, logo no início, o custo de sincronização
permanente e conectores específicos.
