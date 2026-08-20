# Fase 5 — Operações de caixa

## Escopo entregue

- Um `Caixa principal` por estabelecimento, criado automaticamente.
- Uma única sessão aberta por caixa, com fundo inicial em centavos inteiros.
- Suprimentos e sangrias manuais append-only, sempre com motivo e idempotência.
- Pagamentos em dinheiro geram `sale_cash`; estornos geram `refund_cash` compensatório.
- Fechamento registra valor esperado, contado e diferença sem reescrever movimentos.
- Reabertura cria nova sessão ligada ao último fechamento e exige `reopen_cash` + AAL2.
- Leitura e comandos somente por RPCs `SECURITY DEFINER`, com RLS e tabelas sem acesso direto de `authenticated`.
- Superfície mínima no Business e na configuração Web.

## Fronteiras

- `billing_*` continua exclusivo à assinatura SaaS do estabelecimento.
- PIX externo e maquininha continuam no livro de pagamentos, mas não movimentam o caixa físico.
- Comissão, repasses, reembolso de provedor, conciliação assistida, fiscal e adquirentes não fazem parte desta fase.
- A diferença de fechamento é registrada agora; seu tratamento pertence à fase de conciliação.

## Evidência

- `supabase/tests/phase5_cash_operations.sql`: ciclo completo, idempotência, AAL2, compensação e privilégios.
- `tests/unit/phase5-cash-operations.unit.spec.ts`: mappers fail-closed, binding RPC e fronteiras de UI/migração.
- `.github/workflows/phase5-gate.yml`: reset descartável, SQL, lint/advisors, typecheck, testes e bundles.

Evidência local/CI não equivale à homologação com papéis reais, Android físico ou banco remoto.
