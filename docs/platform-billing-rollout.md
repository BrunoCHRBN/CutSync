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
5. Agendar `process-billing-jobs` em intervalo curto e as duas reconciliações diariamente.
   Todas as chamadas de worker devem enviar `x-cutsync-job-secret`.
6. Executar os cenários de Test Clock: primeira cobrança, renovação, falha, recuperação,
   cancelamento no fim do período e expiração.
7. Validar emissão, rejeição municipal, duplicidade, cancelamento e reconciliação da NFS-e.

## Liberação produtiva

Antes de habilitar produção, o contador precisa aprovar CNPJ, inscrição municipal,
certificado/credenciais, CNAE, código de serviço, alíquota, regime, natureza da operação e
retenções. Depois da aprovação, atualizar `platform_fiscal_settings` por uma operação
interna auditada. Tokens e certificados nunca entram nessa tabela.

O Checkout usa somente o Price indicado por `STRIPE_OWNER_MONTHLY_PRICE_ID`. A página de
sucesso não concede direitos: webhook e reconciliação são as únicas fontes de ativação.

## Verificações locais

```text
npm run typecheck:business
npm run lint:business
npx playwright test tests/unit/platform-billing.unit.spec.ts --project=unit
```

Os testes SQL em `supabase/tests/platform_billing_web_first.sql` devem rodar após `supabase
db reset` no ambiente local ou na pipeline de homologação.
