import { formatMoneyCents } from '@cutsync/domain';
import type { BusinessPaymentMethod } from '@cutsync/database';
import * as Haptics from 'expo-haptics';
import { Banknote, CreditCard, QrCode } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BusinessButton, BusinessCard, BusinessNotice, BusinessSectionTitle } from '@/components/ui/business-ui';
import { useBusinessCheckout } from '@/features/checkout/use-business-checkout';
import { businessTheme } from '@/theme/business-theme';

const methods: { value: BusinessPaymentMethod; label: string; Icon: typeof Banknote }[] = [
  { value: 'pix', label: 'Pix', Icon: QrCode },
  { value: 'cash', label: 'Dinheiro', Icon: Banknote },
  { value: 'credit_card', label: 'Crédito', Icon: CreditCard },
  { value: 'debit_card', label: 'Débito', Icon: CreditCard },
  { value: 'other', label: 'Outro', Icon: Banknote },
];
const methodLabel = Object.fromEntries(methods.map((method) => [method.value, method.label]));

const parseBrl = (value: string) => {
  const normalized = value.replace(/\s|R\$/gi, '').replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
};

export function ServiceOrderCheckout({ serviceOrderId, appointmentId }: { serviceOrderId: string; appointmentId?: string }) {
  const checkout = useBusinessCheckout(serviceOrderId, appointmentId);
  const [method, setMethod] = useState<BusinessPaymentMethod>('pix');
  const [amount, setAmount] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (checkout.data) setAmount((checkout.data.balanceCents / 100).toFixed(2).replace('.', ','));
  }, [checkout.data]);
  if (!checkout.visible) return null;
  if (checkout.isLoading) return <ActivityIndicator testID="business-checkout-loading" color={businessTheme.colors.accentStrong} />;
  if (checkout.error || !checkout.data) return <BusinessNotice testID="business-checkout-error" tone="danger" message="Não foi possível carregar o checkout." />;

  const amountCents = parseBrl(amount);
  const amountValid = checkout.data.balanceCents === 0
    || Boolean(amountCents && amountCents <= checkout.data.balanceCents);
  const pay = async () => {
    setNotice(null);
    try {
      if (checkout.data.balanceCents === 0) await checkout.closeZeroBalance();
      else if (amountCents && amountCents > 0) await checkout.recordPayment({ method, amountCents });
      else throw new Error('invalid_payment_amount');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      setNotice(checkout.data.balanceCents === amountCents ? 'Pagamento registrado e comanda encerrada.' : 'Pagamento parcial registrado.');
    } catch {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      setNotice('Não foi possível registrar este pagamento. Atualize e tente novamente.');
    }
  };

  return (
    <View testID="business-checkout-section" style={styles.section}>
      <BusinessSectionTitle testID="business-checkout-title">Checkout</BusinessSectionTitle>
      <BusinessCard testID="business-checkout-summary">
        <View style={styles.moneyRow}><Text style={styles.moneyLabel}>Total</Text><Text style={styles.moneyValue}>{formatMoneyCents(checkout.data.totalCents, 'BRL')}</Text></View>
        <View style={styles.moneyRow}><Text style={styles.moneyLabel}>Recebido</Text><Text style={styles.moneyValue}>{formatMoneyCents(checkout.data.paidCents, 'BRL')}</Text></View>
        <View style={styles.balanceRow}><Text style={styles.balanceLabel}>Saldo</Text><Text testID="business-checkout-balance" style={styles.balanceValue}>{formatMoneyCents(checkout.data.balanceCents, 'BRL')}</Text></View>
      </BusinessCard>

      {checkout.data.payments.length > 0 ? (
        <View testID="business-checkout-payments" style={styles.payments}>
          {checkout.data.payments.map((payment) => (
            <View key={payment.id} style={styles.paymentRow}>
              <Text style={styles.paymentMethod}>{methodLabel[payment.method]}</Text>
              <Text style={styles.paymentValue}>{formatMoneyCents(payment.amountCents, 'BRL')}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {checkout.data.status === 'awaiting_payment' && checkout.canTakePayments ? (
        <>
          {checkout.data.balanceCents > 0 ? (
            <>
              <View testID="business-checkout-methods" accessibilityRole="radiogroup" style={styles.methods}>
                {methods.map(({ value, label, Icon }) => {
                  const selected = method === value;
                  return (
                    <Pressable key={value} testID={`business-checkout-method-${value}`} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => setMethod(value)} style={({ pressed }) => [styles.method, selected && styles.methodSelected, pressed && styles.pressed]}>
                      <Icon color={selected ? businessTheme.colors.accentStrong : businessTheme.colors.textMuted} size={18} />
                      <Text style={[styles.methodLabel, selected && styles.methodLabelSelected]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <TextInput testID="business-checkout-amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0,00" placeholderTextColor={businessTheme.colors.textMuted} style={styles.input} />
            </>
          ) : null}
          <BusinessButton testID="business-checkout-submit" label={checkout.data.balanceCents === 0 ? 'Encerrar comanda sem saldo' : `Receber ${amountCents ? formatMoneyCents(amountCents, 'BRL') : ''}`} loading={checkout.isPending} disabled={checkout.isPending || !amountValid} onPress={() => void pay()} />
        </>
      ) : null}
      {checkout.data.status === 'closed' ? <BusinessNotice testID="business-checkout-paid" tone="success" message="Comanda encerrada e pagamento conciliado." /> : null}
      {notice ? <BusinessNotice testID="business-checkout-notice" tone={notice.startsWith('Não foi') ? 'danger' : 'success'} message={notice} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: businessTheme.spacing.sm },
  moneyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  moneyLabel: { ...businessTheme.typography.body, color: businessTheme.colors.textSoft },
  moneyValue: { ...businessTheme.typography.bodyStrong, color: businessTheme.colors.text },
  balanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderColor: businessTheme.colors.border, paddingTop: businessTheme.spacing.sm },
  balanceLabel: { ...businessTheme.typography.bodyStrong, color: businessTheme.colors.text },
  balanceValue: { color: businessTheme.colors.accentStrong, fontSize: 20, fontWeight: '900' },
  payments: { gap: businessTheme.spacing.xs, borderTopWidth: 1, borderBottomWidth: 1, borderColor: businessTheme.colors.border, paddingVertical: businessTheme.spacing.sm },
  paymentRow: { flexDirection: 'row', justifyContent: 'space-between' },
  paymentMethod: { ...businessTheme.typography.caption, color: businessTheme.colors.textSoft },
  paymentValue: { ...businessTheme.typography.caption, color: businessTheme.colors.text },
  methods: { flexDirection: 'row', flexWrap: 'wrap', gap: businessTheme.spacing.xs },
  method: { minWidth: 90, minHeight: 48, flexGrow: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderColor: businessTheme.colors.border, borderRadius: businessTheme.radii.md, backgroundColor: businessTheme.colors.surface },
  methodSelected: { borderColor: businessTheme.colors.accentStrong, backgroundColor: businessTheme.colors.accentSoft },
  methodLabel: { ...businessTheme.typography.caption, color: businessTheme.colors.textMuted },
  methodLabelSelected: { color: businessTheme.colors.accentStrong },
  pressed: { opacity: businessTheme.opacity.pressed, transform: [{ scale: 0.97 }] },
  input: { minHeight: 52, borderWidth: 1, borderColor: businessTheme.colors.borderStrong, borderRadius: businessTheme.radii.md, paddingHorizontal: businessTheme.spacing.md, backgroundColor: businessTheme.colors.canvasRaised, color: businessTheme.colors.text, fontSize: 18, fontWeight: '800' },
});