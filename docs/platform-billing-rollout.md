# Assinatura CutSync: operação e rollout

## Limite desta entrega

Esta estrutura cobra apenas a assinatura SaaS do estabelecimento. Ela não registra nem
movimenta pagamentos de serviços ou agendamentos de clientes.

O ambiente conectado não deve receber migrations antes da reconciliação do histórico
remoto. Cobrança produtiva permanece bloqueada enquanto a configuração fiscal não tiver
`production_enabled = true` e `accountant_approved_at` preenchido.

## Ordem de homologação

1. Aplicar a migration em um projeto Supabase isolado de homologação.
2. Configurar os secrets de `supabase/functions/.env.example`, usando Stripe Test Mode e
   Focus NFe homologação.
3. No Stripe, cadastrar o webhook sem verificação JWT para:
   `invoice.paid`, `invoice.payment_failed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted` e `charge.refunded`.
4. Configurar o webhook Focus NFe. A notificação apenas enfileira trabalho; o estado é
   confirmado por consulta autenticada à Focus antes de ser persistido.
5. Agendar `process-billing-jobs` e `process-billing-cutovers` em intervalo curto e as
   duas reconciliações diariamente. Todas as chamadas de worker devem enviar
   `x-cutsync-job-secret`.
6. Executar os cenários de Test Clock: primeira cobrança, renovação, falha, recuperação,
   cancelamento no fim do período e expiração.
7. Validar emissão, rejeição municipal, duplicidade, cancelamento e reconciliação da NFS-e.

## Liberação produtiva

Antes de habilitar produção, o contador precisa aprovar CNPJ, inscrição municipal,
certificado/credenciais, CNAE, código de serviço, alíquota, regime, natureza da operação e
retenções. Depois da aprovação, atualizar `platform_fiscal_settings` por uma operação
interna auditada. Tokens e certificados nunca entram nessa tabela.

O Checkout individual usa somente o Price indicado por
`STRIPE_OWNER_MONTHLY_PRICE_ID`. A cobrança consolidada padrão usa um Price recorrente
graduado indicado por `STRIPE_ORGANIZATION_MONTHLY_PRICE_ID`, configurado exatamente
com R$ 49,90 na primeira unidade, R$ 44,90 na segunda e R$ 39,90 na terceira e na
quarta. O backend recusa Prices incompatíveis. Cinco ou mais unidades exigem plano Rede e
`STRIPE_ORGANIZATION_NETWORK_PRICE_ID`.

A migração para cobrança consolidada é agendada para depois dos períodos individuais
já pagos. As assinaturas individuais são encerradas em seus próprios fins de ciclo e
uma cortesia interna cobre somente a diferença até a data comum. O Checkout
consolidado coleta o meio de pagamento antes do corte, mas usa `trial_end` nessa data
para não cobrar antecipadamente. O worker só aplica a nova cobertura depois de
reconciliar os cancelamentos e receber `invoice.paid` ou `invoice.payment_failed`.

A página de sucesso não concede direitos: webhook, workers e reconciliação são as
únicas fontes de ativação.

## Verificações locais

```text
npm run typecheck:business
npm run typecheck:control
npm run lint:business
npx --yes deno check --no-config --node-modules-dir=auto \
  supabase/functions/process-billing-jobs/index.ts \
  supabase/functions/process-billing-cutovers/index.ts
npx playwright test tests/unit/platform-billing.unit.spec.ts \
  tests/unit/consolidated-billing-coverage.unit.spec.ts --project=unit
```

Os testes SQL em `supabase/tests/platform_billing_web_first.sql` e
`supabase/tests/consolidated_billing_coverage.sql` devem rodar após `supabase db reset`
no ambiente local ou na pipeline de homologação.
