import type { ServiceOrderDetail } from '@cutsync/database';
import { decimalAmountToCents, formatMoneyCents } from '@cutsync/domain';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useServiceOrderPayments } from '../../features/payments/use-service-order-payments';
import { colors, radii, spacing, typeScale } from '../../theme/tokens';
import { AppButton } from '../ui/AppButton';
import { AppInput } from '../ui/AppInput';
import { InlineNotice } from '../ui/InlineNotice';

export function ServiceOrderPaymentPanel({
  establishmentId,
  serviceOrder,
  canView,
  canTake,
  canVoid,
  onChanged,
  onCloseOrder,
  closing = false,
}: {
  establishmentId?: string | null;
  serviceOrder: ServiceOrderDetail;
  canView: boolean;
  canTake: boolean;
  canVoid: boolean;
  onChanged?: () => Promise<void> | void;
  onCloseOrder?: () => Promise<boolean> | boolean | void;
  closing?: boolean;
}) {
  const payments = useServiceOrderPayments({
    establishmentId,
    serviceOrderId: serviceOrder.id,
    enabled: canView && serviceOrder.status === 'awaiting_payment',
    onChanged,
  });
  const [methodId, setMethodId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [voidEntryId, setVoidEntryId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const selectedMethod = useMemo(
    () => payments.methods.find((method) => method.id === methodId) ?? null,
    [methodId, payments.methods],
  );
  const voidedOriginalIds = useMemo(() => new Set(
    payments.summary?.entries
      .filter((entry) => entry.entryType === 'void' && entry.originalPaymentEntryId)
      .map((entry) => entry.originalPaymentEntryId as string) ?? [],
  ), [payments.summary]);

  useEffect(() => {
    if (!payments.summary) return;
    setAmount((current) => current || (payments.summary!.balanceCents / 100).toFixed(2).replace('.', ','));
  }, [payments.summary]);

  if (serviceOrder.status !== 'awaiting_payment' || !canView) return null;
  if (payments.loading) return <Text style={styles.muted}>Carregando situação financeira…</Text>;
  if (!payments.summary) {
    return <InlineNotice tone="danger" message={payments.error ?? 'Não foi possível carregar o pagamento.'} />;
  }

  const submit = async () => {
    setValidationError(null);
    if (!selectedMethod) {
      setValidationError('Selecione um meio de pagamento.');
      return;
    }
    let amountCents: number;
    try {
      amountCents = decimalAmountToCents(amount);
    } catch {
      setValidationError('Informe um valor válido em reais.');
      return;
    }
    if (amountCents <= 0 || amountCents > payments.summary!.balanceCents) {
      setValidationError('O valor deve ser positivo e não pode ultrapassar o saldo.');
      return;
    }
    if (selectedMethod.requiresReference && !reference.trim()) {
      setValidationError('Informe a referência desta operação.');
      return;
    }
    const confirmed = await payments.record({
      paymentMethodId: selectedMethod.id,
      amountCents,
      externalReference: reference,
    });
    if (confirmed) {
      setMethodId(null);
      setReference('');
      setAmount('');
    }
  };

  return (
    <View testID="web-service-order-payment-panel" style={styles.panel}>
      <Text style={styles.title}>Pagamento</Text>
      <View style={styles.totals}>
        <Text style={styles.total}>Recebido {formatMoneyCents(payments.summary.paidCents, 'BRL')}</Text>
        <Text style={styles.balance}>Saldo {formatMoneyCents(payments.summary.balanceCents, 'BRL')}</Text>
      </View>
      {payments.summary.entries.length > 0 ? (
        <View style={styles.entries} testID="web-payment-entry-list">
          {payments.summary.entries.map((entry) => (
            <View key={entry.id} style={styles.entry} testID="web-payment-entry">
              <View style={styles.totals}>
                <Text style={styles.entryTitle}>
                  {entry.entryType === 'void' ? 'Estorno' : entry.methodName}
                </Text>
                <Text style={styles.entryTitle}>
                  {entry.entryType === 'void' ? '−' : '+'}{formatMoneyCents(entry.amountCents, 'BRL')}
                </Text>
              </View>
              <Text style={styles.muted}>
                {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
                  .format(new Date(entry.createdAt))}
                {entry.externalReference ? ` · ref. ${entry.externalReference}` : ''}
                {entry.reason ? ` · ${entry.reason}` : ''}
              </Text>
              {canVoid
                && entry.entryType === 'payment'
                && entry.status === 'succeeded'
                && !voidedOriginalIds.has(entry.id) ? (
                  <AppButton
                    label="Estornar lançamento"
                    variant="danger"
                    disabled={payments.mutating}
                    onPress={() => { setVoidEntryId(entry.id); setVoidReason(''); setValidationError(null); }}
                    testID={`web-void-payment-${entry.id}`}
                  />
                ) : null}
            </View>
          ))}
        </View>
      ) : null}
      {voidEntryId ? (
        <View style={styles.voidForm} testID="web-void-payment-form">
          <AppInput
            label="Motivo do estorno"
            value={voidReason}
            onChangeText={setVoidReason}
            multiline
            testID="web-void-payment-reason"
          />
          <InlineNotice
            tone="warning"
            message="O estorno cria um lançamento compensatório e exige sessão AAL2 confirmada pelo backend."
          />
          <AppButton
            label="Confirmar estorno"
            variant="danger"
            loading={payments.mutating}
            disabled={voidReason.trim().length < 3}
            onPress={async () => {
              const confirmed = await payments.voidPayment({ paymentEntryId: voidEntryId, reason: voidReason });
              if (confirmed) { setVoidEntryId(null); setVoidReason(''); }
            }}
            testID="web-confirm-void-payment"
          />
          <AppButton
            label="Cancelar"
            variant="ghost"
            disabled={payments.mutating}
            onPress={() => { setVoidEntryId(null); setVoidReason(''); }}
          />
        </View>
      ) : null}
      {payments.error ? <InlineNotice tone="danger" message={payments.error} /> : null}
      {payments.summary.balanceCents === 0 ? (
        <View style={styles.successBlock}>
          <InlineNotice tone="success" message="Pagamento integral confirmado. A comanda pode ser fechada." />
          {onCloseOrder ? (
            <AppButton
              label="Fechar comanda"
              loading={closing}
              onPress={() => { void onCloseOrder(); }}
              testID="web-close-paid-service-order"
            />
          ) : null}
        </View>
      ) : !canTake ? (
        <InlineNotice message="Consulta liberada. Seu papel não pode registrar recebimentos." />
      ) : payments.methods.length === 0 ? (
        <InlineNotice tone="warning" message="Nenhum meio ativo. Configure os meios em Configurações → Pagamentos." />
      ) : (
        <>
          <View style={styles.methods}>
            {payments.methods.map((method) => (
              <Pressable
                key={method.id}
                accessibilityRole="button"
                onPress={() => { setMethodId(method.id); setReference(''); setValidationError(null); }}
                style={[styles.method, methodId === method.id && styles.methodSelected]}
                testID={`web-payment-method-${method.methodType}`}
              >
                <Text style={styles.methodText}>{method.displayName}</Text>
              </Pressable>
            ))}
          </View>
          <AppInput
            label="Valor em reais"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            testID="web-payment-amount"
          />
          {selectedMethod?.requiresReference ? (
            <AppInput
              label="Referência"
              value={reference}
              onChangeText={setReference}
              testID="web-payment-reference"
            />
          ) : null}
          {validationError ? <InlineNotice tone="warning" message={validationError} /> : null}
          <AppButton
            label="Registrar pagamento"
            loading={payments.mutating}
            disabled={!methodId || !amount.trim()}
            onPress={() => void submit()}
            testID="web-record-payment"
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderTopColor: colors.borderSubtle, borderTopWidth: 1, gap: spacing.md, paddingTop: spacing.md },
  title: { ...typeScale.bodyStrong, color: colors.textPrimary },
  totals: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'space-between' },
  total: { ...typeScale.small, color: colors.textSecondary },
  balance: { ...typeScale.bodyStrong, color: colors.textPrimary },
  muted: { ...typeScale.small, color: colors.textMuted },
  methods: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  method: { borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  methodSelected: { backgroundColor: colors.brandSoft, borderColor: colors.brandPrimary },
  methodText: { ...typeScale.small, color: colors.textPrimary },
  successBlock: { gap: spacing.sm },
  entries: { gap: spacing.sm },
  entry: { backgroundColor: colors.surfaceMuted, borderRadius: radii.md, gap: 4, padding: spacing.sm },
  entryTitle: { ...typeScale.small, color: colors.textPrimary },
  voidForm: { gap: spacing.sm },
});
