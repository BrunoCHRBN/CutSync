import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { CreditCard, FileText, RefreshCw } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useBillingAccess } from '../../contexts/BillingAccessContext';
import { useOperationalContext } from '../../contexts/operational-context';
import { supabase } from '../../services/supabase';
import { colors, typography } from '../../theme/tokens';
import { AdminShell } from '../layout/AdminShell';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';

interface BillingOverview {
  plan: { name: string; price_cents: number; currency: string };
  subscription: { status?: string };
  invoices: Array<{
    id: string; number: string | null; status: string; total_cents: number; currency: string;
    paid_at: string | null; fiscal_status: string | null; fiscal_number: string | null;
  }>;
}

const date = (value?: string | null) =>
  value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(value)) : '—';
const money = (cents: number, currency = 'BRL') =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(cents / 100);

export function BillingExperience() {
  const { checkout } = useLocalSearchParams<{ checkout?: string }>();
  const { profile, signOut } = useAuth();
  const { activeContext, activeEstablishmentId } = useOperationalContext();
  const { access, refresh } = useBillingAccess();
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<'checkout' | 'portal' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(checkout === 'success');
  const canSubscribe = ['none', 'trialing', 'expired'].includes(access?.billing_status ?? 'none');
  const canManage = ['active', 'past_due', 'cancelled'].includes(access?.billing_status ?? '');

  const load = useCallback(async () => {
    if (!activeEstablishmentId || !access?.billing_owner) {
      setLoading(false);
      return;
    }
    const { data, error: rpcError } = await (supabase.rpc as any)('get_my_billing_overview', {
      target_establishment_id: activeEstablishmentId,
    });
    if (rpcError) setError('Não foi possível carregar os dados de cobrança.');
    else {
      setOverview(data as BillingOverview);
      setError(null);
    }
    setLoading(false);
  }, [access?.billing_owner, activeEstablishmentId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (checkout !== 'success') return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      void refresh().then((next) => {
        void load();
        if (next?.billing_status === 'active' || Date.now() - startedAt >= 60_000) {
          setWaiting(false);
          clearInterval(timer);
        }
      });
    }, 2_000);
    return () => clearInterval(timer);
  }, [checkout, load, refresh]);

  const open = async (name: 'create-stripe-checkout' | 'create-stripe-portal') => {
    if (!activeEstablishmentId || Platform.OS !== 'web') return;
    setAction(name === 'create-stripe-checkout' ? 'checkout' : 'portal');
    const { data, error: invokeError } = await supabase.functions.invoke(name, {
      body: { establishment_id: activeEstablishmentId },
    });
    setAction(null);
    const target = data?.checkout_url ?? data?.portal_url;
    if (invokeError || !target) {
      setError('Não foi possível abrir o ambiente seguro de cobrança.');
      return;
    }
    window.location.assign(target);
  };

  return (
    <AdminShell activeRoute="billing" shopName={activeContext?.establishmentName ?? 'Estabelecimento'} userName={profile?.name} onSignOut={() => void signOut()}>
      <ScrollView contentContainerStyle={styles.content}>
        <View>
          <Text style={styles.eyebrow}>ASSINATURA CUTSYNC</Text>
          <Text style={styles.title}>Cobrança e documentos</Text>
          <Text style={styles.body}>O pagamento é administrado exclusivamente no ambiente web seguro.</Text>
        </View>
        {waiting ? (
          <AppCard>
            <View style={styles.row}>
              <ActivityIndicator color={colors.accent} />
              <View style={styles.copy}>
                <Text style={styles.cardTitle}>Aguardando confirmação</Text>
                <Text style={styles.body}>O retorno do Checkout não libera acesso; aguardamos Stripe e reconciliação.</Text>
              </View>
            </View>
          </AppCard>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!access?.billing_owner ? (
          <AppCard>
            <Text style={styles.cardTitle}>Ação do responsável financeiro</Text>
            <Text style={styles.body}>Somente ele pode consultar valores, faturas e administrar a assinatura.</Text>
          </AppCard>
        ) : loading ? <ActivityIndicator color={colors.accent} /> : (
          <>
            <AppCard>
              <View style={styles.row}><CreditCard color={colors.accent} /><Text style={styles.cardTitle}>{overview?.plan.name ?? 'CutSync para estabelecimentos'}</Text></View>
              <Text style={styles.price}>{money(overview?.plan.price_cents ?? 4990, overview?.plan.currency)}<Text style={styles.priceSuffix}> / mês</Text></Text>
              <View style={styles.copy}>
                <Text style={styles.body}>Situação: {access.billing_status}</Text>
                <Text style={styles.body}>Trial até: {date(access.trial_ends_at)}</Text>
                <Text style={styles.body}>Tolerância até: {date(access.grace_ends_at)}</Text>
                <Text style={styles.body}>Período pago até: {date(access.current_period_ends_at)}</Text>
              </View>
              <View style={styles.actions}>
                {canSubscribe ? <AppButton label="Assinar agora" loading={action === 'checkout'} onPress={() => void open('create-stripe-checkout')} /> : null}
                {canManage ? <AppButton label="Administrar assinatura" variant="secondary" loading={action === 'portal'} onPress={() => void open('create-stripe-portal')} /> : null}
                <AppButton label="Verificar novamente" variant="ghost" leadingIcon={<RefreshCw size={16} />} onPress={() => void refresh().then(() => load())} />
              </View>
            </AppCard>
            <View style={styles.copy}>
              <Text style={styles.section}>Faturas e NFS-e</Text>
              {(overview?.invoices ?? []).length === 0 ? <Text style={styles.body}>Nenhuma fatura emitida.</Text> : overview?.invoices.map((invoice) => (
                <AppCard key={invoice.id}>
                  <View style={styles.row}>
                    <FileText color={colors.accent} />
                    <View style={styles.copy}>
                      <Text style={styles.cardTitle}>{invoice.number ?? 'Fatura CutSync'}</Text>
                      <Text style={styles.body}>{money(invoice.total_cents, invoice.currency)} · {date(invoice.paid_at)}</Text>
                      <Text style={styles.body}>Pagamento: {invoice.status} · NFS-e: {invoice.fiscal_status ?? 'pendente'}</Text>
                    </View>
                  </View>
                </AppCard>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  content: { padding: 28, gap: 20, maxWidth: 920, width: '100%', alignSelf: 'center' },
  eyebrow: { color: colors.accent, fontFamily: typography.bodyStrong, fontSize: 11, letterSpacing: 1.4 },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 31, marginTop: 7 },
  body: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 14, lineHeight: 21, marginTop: 6 },
  cardTitle: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  copy: { gap: 4, flex: 1 },
  price: { color: colors.text, fontFamily: typography.display, fontSize: 30, marginTop: 18 },
  priceSuffix: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 14 },
  actions: { gap: 9, marginTop: 20, alignItems: 'flex-start' },
  section: { color: colors.text, fontFamily: typography.display, fontSize: 21 },
  error: { color: colors.danger, fontFamily: typography.bodyStrong },
});
